import { MAX_SEARCH_BOOKS } from './limits.ts';
import type { CatalogueBook, LibrarySource } from './library.ts';

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

const normal = (text: string): string => words(text).join(' ');

/** A title, or the part before its colon when that is long enough to be a name. */
export function namesTitle(title: string, text: string): boolean {
  const q = ` ${normal(text)} `;
  const full = normal(title);
  const head = normal(title.split(':')[0] ?? title);
  return (full !== '' && q.includes(` ${full} `)) || (head.length >= 5 && q.includes(` ${head} `));
}

/** One book the search found, with its Thoughts when it has them and they could be read. */
export interface Hit {
  readonly book: CatalogueBook;
  readonly thoughts: readonly string[] | undefined;
}

/** A note that cannot be read leaves that book searchable by its catalogue fields only (S4). */
async function readThoughts(
  source: LibrarySource,
  book: CatalogueBook,
): Promise<readonly string[] | undefined> {
  if (!book.thoughts) return undefined;
  try {
    return await source.thoughts(book);
  } catch {
    return undefined;
  }
}

/**
 * The one search (T3, memory-free): serves the model's tool and the plain results
 * alike. Whole-word and case-insensitive over title, author, subjects and the
 * owner's Thoughts (T4), ranked: a query naming a whole title first; then the
 * number of the query's words found in title, author and subjects; then the number
 * found in Thoughts; then shelf order, which is the catalogue's own order. Fields
 * outrank Thoughts so a stray word in a note cannot beat a book that is about it.
 * At most 6 books, none whose id is in `exclude` (T6). It finds what the words say.
 */
export async function searchLibrary(
  catalogue: readonly CatalogueBook[],
  source: LibrarySource,
  query: string,
  exclude: ReadonlySet<string> = new Set(),
): Promise<Hit[]> {
  const terms = [...new Set(words(query).filter((w) => !STOP_WORDS.has(w)))];
  if (terms.length === 0) return [];
  const loaded = await Promise.all(
    catalogue.map(async (book) => ({ book, thoughts: await readThoughts(source, book) })),
  );
  const scored = loaded.map(({ book, thoughts }, position) => {
    const fields = new Set(words(`${book.title} ${book.author ?? ''} ${book.subjects ?? ''}`));
    const notes = new Set(words((thoughts ?? []).join(' ')));
    return {
      hit: { book, thoughts },
      position,
      named: namesTitle(book.title, query),
      field: terms.filter((t) => fields.has(t)).length,
      note: terms.filter((t) => notes.has(t)).length,
    };
  });
  return scored
    .filter((s) => !exclude.has(s.hit.book.id) && (s.named || s.field > 0 || s.note > 0))
    .sort(
      (a, b) =>
        Number(b.named) - Number(a.named) ||
        b.field - a.field ||
        b.note - a.note ||
        a.position - b.position,
    )
    .slice(0, MAX_SEARCH_BOOKS)
    .map((s) => s.hit);
}
