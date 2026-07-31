/**
 * Identity and matching.
 *
 * Two books are "the same" if their ISBNs match, or failing that if their
 * normalised title+author match. Both paths need a normal form that survives
 * the things hand-edited notes and three different metadata APIs do to the same
 * book: diacritics, subtitles punctuated differently, leading articles,
 * "Surname, Firstname" vs "Firstname Surname".
 */

/** Digits only, uppercase X, so `978-1-00-000001-6` matches `9781000000016`. */
export function normaliseIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

/** A 10- or 13-digit ISBN with a correct check digit. */
export function isValidIsbn(value: string): boolean {
  const isbn = normaliseIsbn(value);
  if (isbn.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }
  if (isbn.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += Number(isbn[i]) * (10 - i);
    }
    const check = isbn[9] === 'X' ? 10 : Number(isbn[9]);
    return (sum + check) % 11 === 0;
  }
  return false;
}

const LEADING_ARTICLE = /\b(?:a|an|the)\b/g;

/**
 * Lowercase, unaccented, punctuation-free, article-free, single-spaced.
 *
 * Deliberately lossy — it exists to make near-misses collide, so
 * "Iglesias, Tomás" and "Tomas Iglesias" reduce to the same string.
 */
export function normaliseTitleAuthor(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(LEADING_ARTICLE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Are these two "title author" strings the same book?
 *
 * Exact equality of the normal form is too strict for the commonest real case:
 * one source carries the subtitle and the other doesn't. "Thinking in Systems"
 * and "Thinking in Systems: A Primer" by the same author are one book, and
 * treating them as two produces a duplicate note on the very first `stacks add`.
 *
 * So: equal normal forms, or one string's tokens almost entirely contained in
 * the other's while still overlapping substantially the other way. The
 * second condition is what stops two different books by the same author —
 * where the author tokens match but the title tokens don't — from colliding.
 */
export function isProbablySameBook(a: string, b: string): boolean {
  const left = normaliseTitleAuthor(a);
  const right = normaliseTitleAuthor(b);
  if (left.length === 0 || right.length === 0) return false;
  if (left === right) return true;

  const forward = titleMatchScore(left, right);
  const backward = titleMatchScore(right, left);
  return Math.max(forward, backward) >= 0.9 && Math.min(forward, backward) >= 0.6;
}

/**
 * How well a candidate title matches what was searched for, from 0 to 1.
 *
 * Token overlap rather than edit distance: search terms are usually a partial
 * title ("salt road" for "The Salt Road Ledger"), where token containment is
 * the signal and character-level distance is mostly noise.
 */
export function titleMatchScore(query: string, candidate: string): number {
  const wanted = normaliseTitleAuthor(query).split(' ').filter(Boolean);
  const found = new Set(normaliseTitleAuthor(candidate).split(' ').filter(Boolean));
  if (wanted.length === 0 || found.size === 0) return 0;

  const hits = wanted.filter((token) => found.has(token)).length;
  const coverage = hits / wanted.length;

  // Penalise candidates padded with unrelated words, so an exact short title
  // beats a long one that merely contains the query.
  const brevity = wanted.length / Math.max(found.size, wanted.length);
  return coverage * (0.8 + 0.2 * brevity);
}
