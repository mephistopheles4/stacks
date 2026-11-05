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
  readonly reason?: 'budget' | 'timeout' | 'blank' | 'tool' | 'error';
  /** The AI platform's four-digit error code, when it gave one. */
  readonly code?: number;
  readonly ms?: number;
  /** Tool calls the model made: a count, never a query (T13, C32). */
  readonly searches?: number;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

export function logOutcome(outcome: Outcome, detail: OutcomeDetail = {}): void {
  console.log(JSON.stringify({ outcome, ...detail }));
}
