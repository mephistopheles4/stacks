/**
 * The only thing this Worker logs: one fixed code per request (S11). The type
 * admits no free text, so a question, an answer or an address cannot be passed
 * in by accident (C15).
 */
export type Outcome =
  | 'ai'
  | 'search-off'
  | 'search-ai-failed'
  | 'refused-shape'
  | 'refused-turnstile'
  | 'refused-address'
  | 'refused-secret'
  | 'refused-limit'
  | 'refused-data'
  | 'health-up'
  | 'health-down'
  | 'daily-pass'
  | 'daily-fail';

export interface OutcomeDetail {
  /** Why AI did not answer: the day's budget is spent, or it failed. */
  readonly reason?: 'budget' | 'timeout' | 'blank' | 'error';
  /** The AI platform's four-digit error code, when it gave one. */
  readonly code?: number;
  readonly ms?: number;
  /** Tool calls the model made: a count, never a query (T13, C32). */
  readonly toolCalls?: number;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  /**
   * Cloudflare's own count for the question's calls that returned, from `usage.neurons`;
   * left out when one of them gave none. A lower bound when `reason` is `timeout`.
   */
  readonly neurons?: number;
  /** Input tokens served from the prompt cache, from `usage.prompt_tokens_details`. */
  readonly tokensCached?: number;
  /**
   * How many questions this visitor has asked today, this one included: the daily
   * counter's count, a number only (observability spec S2).
   */
  readonly question?: number;
  /** Which limit refused: a fault in either counter is `error`, still a refusal (C3). */
  readonly limit?: 'minute' | 'day' | 'error';
}

export function logOutcome(outcome: Outcome, detail: OutcomeDetail = {}): void {
  console.log(JSON.stringify({ outcome, ...detail }));
}
