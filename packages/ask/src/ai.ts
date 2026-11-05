import { stripAsterisks } from './asterisks.ts';
import type { Env } from './env.ts';
import { AI_TIMEOUT_MS, MAX_OUTPUT_TOKENS, MODEL } from './limits.ts';

export class AiFailure extends Error {
  constructor(
    message: string,
    /** The gateway refused: the day's spend limit is used up (error 2045). */
    readonly spent = false,
    /** The four-digit code the AI platform gave, when its message starts with one. */
    readonly code?: number,
  ) {
    super(message);
  }
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

export interface AiAnswer {
  readonly text: string;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

type ChatMessage = { readonly role: 'system' | 'user'; readonly content: string };

/**
 * The one place this Worker calls the model (C8). It always passes the gateway
 * option and `skipCache`, runs under the 20-second limit, treats a blank answer
 * as a failure and cleans the text the model emits despite the rules. A gate
 * fails the build if `AI.run` appears anywhere else.
 */
export async function runModel(
  env: Env,
  messages: readonly ChatMessage[],
  timeoutMs: number = AI_TIMEOUT_MS,
): Promise<AiAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AiFailure('timeout'));
    }, timeoutMs);
  });
  try {
    const call = env.AI.run(
      MODEL,
      { max_tokens: MAX_OUTPUT_TOKENS, messages },
      { gateway: { id: env.ASK_GATEWAY_ID, skipCache: true } },
    );
    // Whichever loses the race must not become an unhandled rejection.
    call.catch(() => undefined);
    const out = await Promise.race([call, limit]);
    const text = cleanAnswer(extractText(out));
    if (text === '') throw new AiFailure('blank');
    const usage = (
      out as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null
    )?.usage;
    return {
      text,
      ...(typeof usage?.prompt_tokens === 'number' && { tokensIn: usage.prompt_tokens }),
      ...(typeof usage?.completion_tokens === 'number' && { tokensOut: usage.completion_tokens }),
    };
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

/** Non-breaking hyphens become hyphens and `*` marks go (S6). */
export function cleanAnswer(text: string): string {
  return stripAsterisks(text)
    .replace(/[‐‑‒–]/g, '-')
    .trim();
}
