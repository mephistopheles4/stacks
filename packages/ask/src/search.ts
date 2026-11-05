import { MAX_RATED_BOOKS, MAX_SEARCH_BOOKS } from './limits.ts';
import type { CatalogueBook, LibrarySource } from './library.ts';

/** Common words ignored by the search (S6). */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a an and any are about did do does for from had has have how i in is it me my of on or ' +
    'read reading recommend should some that the their them they this to was what which who ' +
    'why with would you your book books like most'
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

/** The query's words that are worth searching for: what is left after the ignored list. */
export const usableTerms = (query: string): string[] => [
  ...new Set(words(query).filter((w) => !STOP_WORDS.has(w))),
];

/**
 * The one search (T3, memory-free): serves the model's tool and the plain results
 * alike. Whole-word and case-insensitive over title, author, subjects and the
 * owner's Thoughts (T4), ranked: a query naming a whole title first; then the
 * number of the query's words found in title, author and subjects; then the number
 * found in Thoughts; then shelf order, which is the catalogue's own order. Fields
 * outrank Thoughts so a stray word in a note cannot beat a book that is about it.
 * At most 6 books, none whose id is in `exclude` (T6). It finds what the words say.
 *
 * **A query with no usable word** ("recommend", "what did you like most about the book?")
 * returns the owner's top-rated books that have Thoughts (at most 5), as a normal result. A
 * query with a usable word and no match returns nothing here ("zymurgy"): the tool and the plain
 * results each add `topRated` themselves, because each says so in its own words.
 */
export async function searchLibrary(
  catalogue: readonly CatalogueBook[],
  source: LibrarySource,
  query: string,
  exclude: ReadonlySet<string> = new Set(),
): Promise<Hit[]> {
  return (await rankLibrary(catalogue, source, query, exclude)).slice(0, MAX_SEARCH_BOOKS);
}

/** Every match, ranked as `searchLibrary` ranks them: the tool says how many it cut off. */
export async function rankLibrary(
  catalogue: readonly CatalogueBook[],
  source: LibrarySource,
  query: string,
  exclude: ReadonlySet<string> = new Set(),
): Promise<Hit[]> {
  const terms = usableTerms(query);
  if (terms.length === 0) return topRated(catalogue, source, exclude);
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
    .map((s) => s.hit);
}

/**
 * The highest-rated books with Thoughts, then shelf order, at most 5: what a search offers when it
 * has nothing to search for, and (the tool and the plain results alike) when a usable word matched
 * nothing. A book with no Thoughts is never offered, however high it is rated.
 */
export async function topRated(
  catalogue: readonly CatalogueBook[],
  source: LibrarySource,
  exclude: ReadonlySet<string> = new Set(),
  limit: number = MAX_RATED_BOOKS,
): Promise<Hit[]> {
  const ranked = catalogue
    .map((book, position) => ({ book, position }))
    .filter((s) => s.book.thoughts && !exclude.has(s.book.id))
    .sort((a, b) => (b.book.rating ?? 0) - (a.book.rating ?? 0) || a.position - b.position)
    .slice(0, limit);
  return Promise.all(
    ranked.map(async ({ book }) => ({ book, thoughts: await readThoughts(source, book) })),
  );
}
