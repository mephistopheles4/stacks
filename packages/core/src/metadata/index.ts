import { isProbablySameBook, isValidIsbn } from '../identity.ts';
import * as googleBooks from './google-books.ts';
import * as openLibrary from './open-library.ts';
import type { HttpGet } from './http.ts';
import type { BookMetadata } from './types.ts';

export { createCachedHttpGet, type HttpGet } from './http.ts';
export type { BookMetadata, MetadataSource } from './types.ts';

/**
 * Open Library first, Google Books second (CLAUDE.md).
 *
 * Every path degrades to `undefined` rather than throwing. A metadata lookup
 * failing is an ordinary outcome — the book still gets a note, just a thinner
 * one — and `stacks add` must not die because an API had a bad afternoon.
 */
export interface MetadataOptions {
  /**
   * Google Books API key, from `GOOGLE_BOOKS_API_KEY`.
   *
   * Optional, and the whole difference between Google Books being a real
   * fallback and being decorative — unauthenticated requests share one
   * exhausted quota and 429 every time.
   */
  readonly googleBooksKey?: string;
}

export async function lookupByIsbn(
  isbn: string,
  get: HttpGet,
  options: MetadataOptions = {},
): Promise<BookMetadata | undefined> {
  return (
    (await openLibrary.lookupByIsbn(isbn, get)) ??
    (await googleBooks.lookupByIsbn(isbn, get, options.googleBooksKey))
  );
}

/** Fuzzy title search across both providers, best match first. */
export async function searchByTitle(
  query: string,
  get: HttpGet,
  options: MetadataOptions = {},
): Promise<BookMetadata[]> {
  const primary = await openLibrary.searchByTitle(query, get);
  if (primary.length > 0) return primary;
  return googleBooks.searchByTitle(query, get, options.googleBooksKey);
}

/**
 * What `stacks add <isbn-or-title>` does with its argument.
 *
 * A valid ISBN goes straight to the ISBN lookup. Anything else is a title
 * search — including a *malformed* ISBN, because "9781603580556" (one digit
 * wrong) is far more likely to be a typo worth searching for than a real
 * identifier worth failing on.
 */
export async function lookup(
  term: string,
  get: HttpGet,
  options: MetadataOptions = {},
): Promise<BookMetadata[]> {
  if (isValidIsbn(term)) {
    const hit = await lookupByIsbn(term, get, options);
    if (hit !== undefined) return [await fillGaps(hit, get, options)];
  }

  const results = await searchByTitle(term, get, options);
  const best = results[0];
  if (best === undefined) return results;

  // Only the result that will actually be used is enriched. Filling every
  // candidate would cost one request per search hit to answer a question nobody
  // asked.
  return [await fillGaps(best, get, options), ...results.slice(1)];
}

/**
 * Completes a result from the other provider.
 *
 * "Open Library first, Google Books second" used to mean the fallback ran only
 * when the primary found *nothing*. But Open Library often knows a book and has
 * no cover for it — the search stops at the first provider, and the book lands
 * on the shelf with a blank spine even though Google had the art all along.
 *
 * So: fill what is missing, keep what is there, and only from a record that is
 * demonstrably the same book. A cover borrowed from a different edition is
 * worse than no cover.
 */
async function fillGaps(
  primary: BookMetadata,
  get: HttpGet,
  options: MetadataOptions,
): Promise<BookMetadata> {
  // A speculative cover counts as missing: it is a URL we invented from an
  // ISBN, and the endpoint answers with a placeholder as readily as with art.
  const needsCover = primary.coverUrl === undefined || primary.coverIsSpeculative === true;
  if ((!needsCover && primary.pages !== undefined) || primary.source === 'google-books') {
    return primary;
  }

  const candidate =
    primary.isbn === undefined
      ? (await googleBooks.searchByTitle(
          `${primary.title} ${primary.author ?? ''}`.trim(),
          get,
          options.googleBooksKey,
        ))[0]
      : await googleBooks.lookupByIsbn(primary.isbn, get, options.googleBooksKey);

  if (candidate === undefined) return primary;

  // An ISBN lookup is already proof of identity; a title search is not.
  const sameBook =
    primary.isbn !== undefined ||
    isProbablySameBook(
      `${primary.title} ${primary.author ?? ''}`,
      `${candidate.title} ${candidate.author ?? ''}`,
    );
  if (!sameBook) return primary;

  return {
    ...primary,
    // A confirmed cover from the fallback beats a guessed one from the primary.
    ...(needsCover && candidate.coverUrl !== undefined
      ? { coverUrl: candidate.coverUrl, coverIsSpeculative: false }
      : {}),
    ...(primary.pages === undefined && candidate.pages !== undefined
      ? { pages: candidate.pages }
      : {}),
    ...(primary.author === undefined && candidate.author !== undefined
      ? { author: candidate.author }
      : {}),
  };
}
