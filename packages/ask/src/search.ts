import { MAX_SEARCH_BOOKS } from './limits.ts';
import type { CatalogueBook } from './library.ts';

/** Common words ignored by the search (S6). */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a an and any are about did do does for from had has have how i in is it me my of on or ' +
    'read reading recommend should some that the their them they this to was what which who ' +
    'why with would you your book books'
  ).split(' '),
);

export function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Whole-word, case-insensitive match over title, author and subjects, ranked by
 * the number of the question's words matched, then shelf order (the catalogue's
 * own order), at most 6 books (S6). It finds what the words say.
 */
export function search(catalogue: readonly CatalogueBook[], question: string): CatalogueBook[] {
  const terms = [...new Set(words(question).filter((w) => !STOP_WORDS.has(w)))];
  if (terms.length === 0) return [];
  const scored = catalogue.map((book, position) => {
    const have = new Set(words(`${book.title} ${book.author ?? ''} ${book.subjects ?? ''}`));
    return { book, position, score: terms.filter((t) => have.has(t)).length };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .slice(0, MAX_SEARCH_BOOKS)
    .map((s) => s.book);
}
