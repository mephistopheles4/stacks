import { MAX_THOUGHT_BOOKS } from './limits.ts';
import type { CatalogueBook } from './library.ts';
import { search } from './search.ts';

/**
 * Which books' Thoughts go into the prompt (S4). In order: books named in the
 * question; then books the search matches, those with Thoughts first; and if
 * that leaves none with Thoughts, up to 3 that have them, highest rated first,
 * then by shelf order. It depends only on the question and the catalogue, never
 * on what an isolate has cached. This is the one function embeddings replace.
 */
export function pickLikelyBooks(
  catalogue: readonly CatalogueBook[],
  question: string,
): CatalogueBook[] {
  const named = catalogue.filter((book) => isNamed(book.title, question));
  const matched = search(catalogue, question);
  const ordered = dedupe([
    ...named,
    ...matched.filter((b) => b.thoughts),
    ...matched.filter((b) => !b.thoughts),
  ]).filter((b) => b.thoughts);
  if (ordered.length > 0) return ordered.slice(0, MAX_THOUGHT_BOOKS);

  return catalogue
    .map((book, position) => ({ book, position }))
    .filter((s) => s.book.thoughts)
    .sort((a, b) => (b.book.rating ?? 0) - (a.book.rating ?? 0) || a.position - b.position)
    .slice(0, MAX_THOUGHT_BOOKS)
    .map((s) => s.book);
}

const normal = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** A title, or the part before its colon when that is long enough to be a name. */
function isNamed(title: string, question: string): boolean {
  const q = ` ${normal(question)} `;
  const full = normal(title);
  const head = normal(title.split(':')[0] ?? title);
  return q.includes(` ${full} `) || (head.length >= 5 && q.includes(` ${head} `));
}

function dedupe(books: readonly CatalogueBook[]): CatalogueBook[] {
  return [...new Map(books.map((b) => [b.id, b])).values()];
}
