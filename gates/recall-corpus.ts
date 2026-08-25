/**
 * The books the recall gate asks about, and what the right answer is.
 *
 * Shared with `scripts/capture-lookup-recall.ts` so the corpus and the captured
 * responses cannot drift: adding a case here and re-running the capture is one
 * step, and a case with no captured responses fails loudly in the gate rather
 * than passing over nothing.
 *
 * Every entry is a **real book from the owner's vault** with a real answer,
 * taken from issue #63. The terms are exactly what `enrich` builds — title,
 * subtitle and author run together — which matters: probing this bug with a
 * shorter query returns different rankings from Google and led the issue to
 * blame a filter that turned out to be innocent.
 */

export interface RecallCase {
  /** Exactly what `enrich` passes to `lookup`. */
  readonly term: string;
  /** What the vault knows, as `isProbablySameBook` receives it. */
  readonly label: string;
  readonly expect: RecallExpectation;
  /** Why this case is in the corpus — printed when it fails. */
  readonly because: string;
}

export type RecallExpectation =
  | { readonly kind: 'found'; readonly pages: number; readonly title: string }
  /**
   * Nothing the providers offer is this book.
   *
   * These are load-bearing. A recall gate that only checks positives is passed
   * by a matcher that says yes to everything — and issue #62 had already
   * recorded the opposite failure, a matcher loosened until it accepted
   * *Emotional Intelligence 2.0* for *The New Emotional Intelligence*. Both
   * directions have to be pinned or the fix for one becomes the other.
   */
  | { readonly kind: 'no-match' };

export const RECALL_CORPUS: readonly RecallCase[] = [
  {
    term: 'Beyond Vibe Coding: From Coder to AI-Era Developer Addy Osmani',
    label: 'Beyond Vibe Coding: From Coder to AI-Era Developer Addy Osmani',
    expect: { kind: 'found', pages: 255, title: 'Beyond Vibe Coding' },
    because:
      'Google ranks a different Vibe Coding book first and the right one second. ' +
      'Taking candidate [0] refuses a book the provider is holding.',
  },
  {
    term: 'The New Emotional Intelligence Travis Bradberry',
    label: 'The New Emotional Intelligence Travis Bradberry',
    expect: { kind: 'found', pages: 368, title: 'The New Emotional Intelligence' },
    because:
      'The search response reports pageCount 0 for this volume and the detail ' +
      'endpoint reports 368. Ranking alone finds the book but not its pages.',
  },
  {
    term: 'The Subtle Art of Not Giving a F*ck: A Counterintuitive Approach to Living a Good Life Mark Manson',
    label:
      'The Subtle Art of Not Giving a F*ck: A Counterintuitive Approach to Living a Good Life Mark Manson',
    expect: { kind: 'found', pages: 262, title: 'The Subtle Art of Not Giving a F*ck' },
    because:
      'Four candidates pass the matcher — a box set, a censored-title edition at ' +
      '206 pages, a 16pt large-print at 320, and this one. The *best* match is ' +
      'needed, not the first passing one.',
  },
  {
    term: 'From Zero to Profit with AI: The Contemporary Guide to Online Income Generation and Accelerated Growth Helen B. Keating',
    label:
      'From Zero to Profit with AI: The Contemporary Guide to Online Income Generation and Accelerated Growth Helen B. Keating',
    expect: { kind: 'found', pages: 172, title: 'From Zero to Profit with AI' },
    because:
      'Was recorded as absent from both providers, and that was never true — ' +
      'the corpus had been captured without a Google API key, so Google 429ed ' +
      'and a refusal to answer was written down as an answer. Google holds it: ' +
      'Helen B Keating, 9798198476684, 172 pages.',
  },
  {
    term: 'The Creative Brain in the Age of Artificial Intelligence: How to Use AI Without Losing Yourself Maria Ian',
    label:
      'The Creative Brain in the Age of Artificial Intelligence: How to Use AI Without Losing Yourself Maria Ian',
    expect: { kind: 'no-match' },
    because:
      'Google offers four superficially similar AI books and none is this one. ' +
      'A looser matcher would write the wrong page count into the vault.',
  },
];

/**
 * Removes the Google API key from a URL.
 *
 * Used on both sides: the capture strips it before writing, and the gate strips
 * it before matching, so the corpus works with any key or none and no secret
 * ever reaches the repo.
 */
export function stripKey(url: string): string {
  return url.replace(/[?&]key=[^&]*/, '');
}
