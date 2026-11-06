import { stripAsterisks } from './asterisks.ts';
import type { Env } from './env.ts';
import { AI_DEADLINE_MS, MAX_OUTPUT_TOKENS, MODEL } from './limits.ts';

export class AiFailure extends Error {
  constructor(
    message: string,
    /** The gateway refused: the day's spend limit is used up (error 2045). */
    readonly spent = false,
    /** The four-digit code the AI platform gave, when its message starts with one. */
    readonly code?: number,
    /** What the call cost, when it returned before failing (a blank answer). */
    readonly usage?: Usage,
  ) {
    super(message);
  }
}

/** What one call cost, as numbers only; a field is absent when the reply gave no finite one. */
export interface Usage {
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly neurons?: number;
  readonly tokensCached?: number;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The reply's `usage` block, read as numbers and nothing else (C15). */
function readUsage(out: unknown): Usage {
  const usage = (out as { usage?: Record<string, unknown> } | null)?.usage;
  if (usage === undefined || usage === null || typeof usage !== 'object') return {};
  const details = usage['prompt_tokens_details'] as Record<string, unknown> | null | undefined;
  const cached =
    details !== null && typeof details === 'object' ? details['cached_tokens'] : undefined;
  return {
    ...(finite(usage['prompt_tokens']) && { tokensIn: usage['prompt_tokens'] }),
    ...(finite(usage['completion_tokens']) && { tokensOut: usage['completion_tokens'] }),
    ...(finite(usage['neurons']) && { neurons: usage['neurons'] }),
    ...(finite(cached) && { tokensCached: cached }),
  };
}

/**
 * The code at the start of a Workers AI error message, such as `2045: Spend limit
 * exceeded` or `3043: Internal server error`, and only that: digits, never any
 * other text, so nothing a visitor typed can reach a log through it (C15).
 */
export function errorCode(message: string): number | undefined {
  const found = /^\s*(?:\w*Error:\s*)?(\d{4}):/.exec(message)?.[1];
  return found === undefined ? undefined : Number(found);
}

/** A tool the model may call, in the OpenAI function format Workers AI reads. */
export interface ToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: unknown;
  };
}

/** A tool call as the model made it. `arguments` is untrusted: a string or an object. */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
}

export interface AiAnswer extends Usage {
  /** The model's text; empty when it only asked for tools. */
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
}

/** A tool call as sent back to the model in the assistant message. */
export interface WireCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly tool_calls: readonly WireCall[];
    }
  | {
      readonly role: 'tool';
      readonly tool_call_id: string;
      readonly name: string;
      readonly content: string;
    };

export interface RunOptions {
  /** Offered to the model. Leave it out, and the key is left out of the request. */
  readonly tools?: readonly ToolDefinition[];
  /** How long this call may take: what is left of the question's deadline (T11). */
  readonly timeoutMs?: number;
}

/**
 * The one place this Worker calls the model (C8). It always passes the gateway
 * option and `skipCache`, runs under the time it is given (the question's 30-second
 * deadline, T11), treats an answer with neither text nor a tool call as a failure
 * and cleans the text the model emits despite the rules. A gate fails the build if
 * `AI.run` appears anywhere else.
 */
export async function runModel(
  env: Env,
  messages: readonly ChatMessage[],
  options: RunOptions = {},
): Promise<AiAnswer> {
  const { tools, timeoutMs = AI_DEADLINE_MS } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AiFailure('timeout'));
    }, timeoutMs);
  });
  try {
    const call = env.AI.run(
      MODEL,
      { max_tokens: MAX_OUTPUT_TOKENS, messages, ...(tools !== undefined && { tools }) },
      { gateway: { id: env.ASK_GATEWAY_ID, skipCache: true } },
    );
    // Whichever loses the race must not become an unhandled rejection.
    call.catch(() => undefined);
    const out = await Promise.race([call, limit]);
    const text = cleanAnswer(extractText(out));
    const toolCalls = extractToolCalls(out);
    // Read before the blank check: a blank answer returned, and spent.
    const usage = readUsage(out);
    if (text === '' && toolCalls.length === 0) {
      throw new AiFailure('blank', false, undefined, usage);
    }
    return { text, toolCalls, ...usage };
  } catch (error) {
    if (error instanceof AiFailure) throw error;
    const message = error instanceof Error ? error.message : '';
    const code = errorCode(message);
    throw new AiFailure('error', code === 2045 || /\b2045\b/.test(message), code);
  } finally {
    clearTimeout(timer);
  }
}

function extractText(out: unknown): string {
  const o = (out ?? {}) as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
    output?: { type?: string; content?: { type?: string; text?: unknown }[] }[];
  };
  if (typeof o.response === 'string') return o.response;
  const content = o.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  const message = o.output?.find((item) => item.type === 'message');
  const part = message?.content?.find((c) => c.type === 'output_text');
  return typeof part?.text === 'string' ? part.text : '';
}

interface RawCall {
  id?: unknown;
  name?: unknown;
  arguments?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

/**
 * The tool calls in a reply: `choices[0].message.tool_calls` in the OpenAI shape, or a
 * `tool_calls` list at the top. A call with no usable name is skipped here, and an unknown
 * name is answered with guidance by `runTool` (T10, narrowed); nothing in a call is trusted.
 */
function extractToolCalls(out: unknown): ToolCall[] {
  const o = (out ?? {}) as {
    choices?: { message?: { tool_calls?: unknown } }[];
    tool_calls?: unknown;
  };
  const raw = o.choices?.[0]?.message?.tool_calls ?? o.tool_calls;
  if (!Array.isArray(raw)) return [];
  const calls: ToolCall[] = [];
  for (const [index, item] of (raw as RawCall[]).entries()) {
    const name = item.function?.name ?? item.name;
    if (typeof name !== 'string' || name === '') continue;
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : `call_${String(index)}`;
    calls.push({ id, name, arguments: item.function?.arguments ?? item.arguments });
  }
  return calls;
}

/** Non-breaking hyphens become hyphens and `*` marks go (S6). */
export function cleanAnswer(text: string): string {
  return stripAsterisks(text)
    .replace(/[‐‑‒–]/g, '-')
    .trim();
}
