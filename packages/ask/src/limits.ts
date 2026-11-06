/**
 * The numbers of S5 and S6 of docs/spec/ask-the-library.md, in one place, except three that live
 * beside their code: the follow-up limits in `followups.ts`, the input budget's framing margin in
 * `answer.ts`, and the 5-a-minute rate limit, which is in `wrangler.jsonc`.
 */
export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_QUESTION_CHARS = 1_500;
export const MAX_TOKEN_CHARS = 2_048;
export const DAILY_LIMIT = 30;
export const MODEL = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';
export const MAX_OUTPUT_TOKENS = 1_500;
/** One deadline for the whole question, every model call in it included (T11). */
export const AI_DEADLINE_MS = 30_000;
/** Tool calls of either kind per question; the call after them has no tools (T2). */
export const MAX_TOOL_CALLS = 2;
export const MAX_QUERY_CHARS = 200;
export const CACHE_MS = 5 * 60 * 1_000;
/**
 * How long one read of public build output may take (behaviour E1). The question's 30-second
 * deadline covers the model; a read that never answered would sit outside it, so each fetch has its
 * own signal, short enough that a stalled read ends well inside the deadline. A catalogue that
 * times out is a data failure, and a note that does is searched by its catalogue fields only.
 */
export const DATA_TIMEOUT_MS = 5_000;
export const MAX_THOUGHT_BOOKS = 3;
export const MAX_THOUGHT_TOKENS = 1_500;
export const MAX_INPUT_TOKENS = 6_000;
/** Earlier exchanges the page sends with a question, and the cut on each side (memory spec D1, D4). */
export const MAX_HISTORY = 2;
export const MAX_HISTORY_QUESTION_CHARS = 300;
export const MAX_HISTORY_ANSWER_CHARS = 600;
export const MAX_SEARCH_BOOKS = 6;
/** The top-rated books a search offers when nothing matched, or nothing was asked (S6). */
export const MAX_RATED_BOOKS = 5;
export const TURNSTILE_ACTION = 'ask';
/** A result older than this makes the health address return 503 (S11). */
export const HEALTH_MAX_AGE_MS = 36 * 60 * 60 * 1_000;
