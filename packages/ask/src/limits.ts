/** Every number in S5 and S6 of docs/spec/ask-the-library.md, in one place. */
export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_QUESTION_CHARS = 1_500;
export const MAX_TOKEN_CHARS = 2_048;
export const DAILY_LIMIT = 30;
export const MODEL = '@cf/openai/gpt-oss-20b';
export const MAX_OUTPUT_TOKENS = 1_500;
export const AI_TIMEOUT_MS = 20_000;
export const CACHE_MS = 5 * 60 * 1_000;
export const MAX_THOUGHT_BOOKS = 3;
export const MAX_THOUGHT_TOKENS = 1_500;
export const MAX_INPUT_TOKENS = 4_000;
export const MAX_SEARCH_BOOKS = 6;
export const TURNSTILE_ACTION = 'ask';
/** A result older than this makes the health address return 503 (S11). */
export const HEALTH_MAX_AGE_MS = 36 * 60 * 60 * 1_000;
