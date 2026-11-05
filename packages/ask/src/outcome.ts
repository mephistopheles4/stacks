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
  readonly reason?: 'budget' | 'failed';
  readonly ms?: number;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

export function logOutcome(outcome: Outcome, detail: OutcomeDetail = {}): void {
  console.log(JSON.stringify({ outcome, ...detail }));
}
