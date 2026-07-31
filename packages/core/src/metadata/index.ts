import { isValidIsbn } from '../identity.ts';
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
    if (hit !== undefined) return [hit];
  }
  return searchByTitle(term, get, options);
}
