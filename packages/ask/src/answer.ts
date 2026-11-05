import { AiFailure, runModel, type ChatMessage, type WireCall } from './ai.ts';
import type { Env } from './env.ts';
import { onTheShelf, splitFollowUps } from './followups.ts';
import { DataError, type CatalogueBook, type LibrarySource } from './library.ts';
import { AI_DEADLINE_MS, MAX_INPUT_TOKENS, MAX_TOOL_CALLS } from './limits.ts';
import { mentioned } from './mentioned.ts';
import type { Outcome, OutcomeDetail } from './outcome.ts';
import { estimateTokens, systemMessage, userMessage, type Exchange } from './prompt.ts';
import { searchLibrary } from './search.ts';
import { TOOLS, runTool, type ToolSession } from './tools.ts';

export interface BookSummary {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly hasThoughts: boolean;
}

/** The reply's only fields (S6). Nothing else of a book or a note reaches the page. */
export interface Reply {
  readonly mode: 'ai' | 'search' | 'limited' | 'error';
  readonly answer: string;
  readonly books: readonly BookSummary[];
  /** At most 2 questions the model wrote for the visitor to ask next; empty unless mode is ai. */
  readonly followUps: readonly string[];
}

/** T12: the owner's wording, and a matching one for no match. */
export const SEARCH_FOUND =
  'The bot has worked too hard today and went to take a nap. These books match your words.';
export const SEARCH_NONE =
  'The bot has worked too hard today and went to take a nap, and no book matches your words. Try a title, author or subject.';

export type AiState = 'ok' | 'off' | 'spent' | 'failed';

export interface Answered {
  readonly reply: Reply;
  readonly outcome: Outcome;
  readonly detail: OutcomeDetail;
  readonly ai: AiState;
}

const summary = (book: CatalogueBook): BookSummary => ({
  id: book.id,
  title: book.title,
  author: book.author ?? null,
  hasThoughts: book.thoughts,
});

/** The plain results: the same search the model's tool uses (T3), with no model. */
async function searchReply(
  catalogue: readonly CatalogueBook[],
  source: LibrarySource,
  question: string,
): Promise<Reply> {
  const found = await searchLibrary(catalogue, source, question).catch(() => []);
  return {
    mode: 'search',
    answer: found.length > 0 ? SEARCH_FOUND : SEARCH_NONE,
    books: found.map((hit) => summary(hit.book)),
    followUps: [],
  };
}

/** What a question cost, kept as it goes so a failed question still reports it (T13). */
interface Stats {
  searches: number;
  tokensIn: number | undefined;
  tokensOut: number | undefined;
}

const add = (sum: number | undefined, next: number | undefined): number | undefined =>
  next === undefined ? sum : (sum ?? 0) + next;

const statsDetail = (stats: Stats): Pick<OutcomeDetail, 'searches' | 'tokensIn' | 'tokensOut'> => ({
  searches: stats.searches,
  ...(stats.tokensIn !== undefined && { tokensIn: stats.tokensIn }),
  ...(stats.tokensOut !== undefined && { tokensOut: stats.tokensOut }),
});

/** A margin on the budget for the message framing the estimate does not see. */
const FRAMING_TOKENS = 60;

function messageTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce(
    (sum, m) =>
      sum +
      estimateTokens(m.content) +
      (m.role === 'assistant' ? estimateTokens(JSON.stringify(m.tool_calls)) : 0),
    0,
  );
}

/**
 * The model's turn, with its two tools (T1, T2): it may ask for up to 2 tool calls in all,
 * and the call after them is made with no `tools` key, which forces an answer, so a question
 * makes at most 3 model calls. Each call gets what is left of one 30-second deadline (T11).
 * The input is checked before every call (T8): a result is sized to what the budget has
 * left, and rules, counts and memory are never cut. Anything wrong with a tool call throws
 * an `AiFailure`, which the caller turns into plain results (T10).
 */
async function converse(
  env: Env,
  source: LibrarySource,
  catalogue: readonly CatalogueBook[],
  question: string,
  history: readonly Exchange[],
  stats: Stats,
  elapsed: () => number,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemMessage(catalogue) },
    { role: 'user', content: userMessage(question, history) },
  ];
  const session: ToolSession = { catalogue, source, returned: new Set() };
  for (;;) {
    const left = AI_DEADLINE_MS - elapsed();
    if (left <= 0) throw new AiFailure('timeout');
    const offered = stats.searches < MAX_TOOL_CALLS;
    const out = await runModel(env, messages, {
      timeoutMs: left,
      ...(offered && { tools: TOOLS }),
    });
    stats.tokensIn = add(stats.tokensIn, out.tokensIn);
    stats.tokensOut = add(stats.tokensOut, out.tokensOut);
    if (out.toolCalls.length === 0) return out.text;
    // Asking for a tool after the tools were taken away is not an answer.
    if (!offered) throw new AiFailure('blank');

    const calls = out.toolCalls.slice(0, MAX_TOOL_CALLS - stats.searches);
    const results: { id: string; name: string; content: string }[] = [];
    const wires: WireCall[] = [];
    let spent = messageTokens(messages) + FRAMING_TOKENS * calls.length;
    for (const call of calls) {
      const room = MAX_INPUT_TOKENS - spent;
      const run = await runTool(call, session, room);
      wires.push(run.wire);
      results.push({ id: call.id, name: call.name, content: run.content });
      spent += estimateTokens(run.content);
      stats.searches += 1;
    }
    messages.push({ role: 'assistant', content: out.text, tool_calls: wires });
    for (const r of results) {
      messages.push({ role: 'tool', tool_call_id: r.id, name: r.name, content: r.content });
    }
  }
}

/**
 * The answer path, shared by the HTTP handler and the daily test: the AI answer
 * when AI is on and works, plain search results otherwise. Throws `DataError` when
 * the library cannot be read, which the caller turns into its own reply.
 */
export async function answerQuestion(
  env: Env,
  source: LibrarySource,
  question: string,
  clock: () => number = Date.now,
  history: readonly Exchange[] = [],
): Promise<Answered> {
  const catalogue = await source.catalogue();
  if (env.ASK_AI_ENABLED !== 'true') {
    return {
      reply: await searchReply(catalogue, source, question),
      outcome: 'search-off',
      detail: {},
      ai: 'off',
    };
  }
  const started = clock();
  const stats: Stats = { searches: 0, tokensIn: undefined, tokensOut: undefined };
  try {
    const text = await converse(
      env,
      source,
      catalogue,
      question,
      history,
      stats,
      () => clock() - started,
    );
    // The follow-ups are cut off the answer; an answer that was only a block is blank.
    const split = splitFollowUps(text);
    if (split.answer === '') throw new AiFailure('blank');
    return {
      reply: {
        mode: 'ai',
        answer: split.answer,
        books: mentioned(catalogue, split.answer, question, history).map(summary),
        followUps: split.followUps.filter((line) => onTheShelf(line, catalogue)),
      },
      outcome: 'ai',
      detail: { ms: clock() - started, ...statsDetail(stats) },
      ai: 'ok',
    };
  } catch (error) {
    if (error instanceof DataError) throw error;
    return {
      reply: await searchReply(catalogue, source, question),
      outcome: 'search-ai-failed',
      detail: { ms: clock() - started, ...failureDetail(error), ...statsDetail(stats) },
      ai: error instanceof AiFailure && error.spent ? 'spent' : 'failed',
    };
  }
}

/** Why AI did not answer, as fixed words and a code: never text from the error. */
function failureDetail(error: unknown): Pick<OutcomeDetail, 'reason' | 'code'> {
  if (!(error instanceof AiFailure)) return { reason: 'error' };
  const code = error.code === undefined ? {} : { code: error.code };
  if (error.spent) return { reason: 'budget', ...code };
  if (error.message === 'timeout') return { reason: 'timeout' };
  if (error.message === 'blank') return { reason: 'blank' };
  if (error.message === 'tool') return { reason: 'tool' };
  return { reason: 'error', ...code };
}
