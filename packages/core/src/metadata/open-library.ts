import { looksDerivative, normaliseIsbn, titleMatchScore } from '../identity.ts';
import type { HttpGet } from './http.ts';
import { asPositiveInt, asRecord, firstString, type BookMetadata } from './types.ts';
import { keyIfPresent } from '../key-if-present.ts';

/**
 * Open Library — the primary provider.
 *
 * Two response shapes, both captured for real in `fixtures/api/`:
 *
 * - `/api/books` returns `{ "ISBN:<isbn>": { … } }`, and — importantly — an
 *   **empty object `{}` for a miss, not a 404**. Anything keying off HTTP
 *   status would treat a miss as a success and hand back nothing.
 * - `/search.json` returns `{ numFound, docs: [ … ] }`.
 */

const API_BOOKS = 'https://openlibrary.org/api/books';
const SEARCH = 'https://openlibrary.org/search.json';

export async function lookupByIsbn(
  isbn: string,
  get: HttpGet,
): Promise<BookMetadata | undefined> {
  const normalised = normaliseIsbn(isbn);
  if (normalised.length === 0) return undefined;

  const key = `ISBN:${normalised}`;
  const body = asRecord(await get(`${API_BOOKS}?bibkeys=${key}&format=json&jscmd=data`));
  const entry = asRecord(body?.[key]);
  if (entry === undefined) return undefined; // includes the `{}` miss

  const title = firstString(entry['title']);
  if (title === undefined) return undefined;

  const identifiers = asRecord(entry['identifiers']);

  return {
    title,
    source: 'open-library',
    ...keyIfPresent('author', authorsOf(entry['authors'])),
    ...keyIfPresent(
      'isbn',
      firstString(identifiers?.['isbn_13']) ?? firstString(identifiers?.['isbn_10']) ?? normalised,
    ),
    ...keyIfPresent('pages', asPositiveInt(entry['number_of_pages'])),
    ...keyIfPresent('coverUrl', coverOf(entry['cover'])),
  };
}

/**
 * Fuzzy title search, best match first.
 *
 * Open Library happily returns 500+ loosely related results, so candidates are
 * re-scored locally against the query rather than trusting its ordering.
 */
export async function searchByTitle(
  query: string,
  get: HttpGet,
  limit = 5,
): Promise<BookMetadata[]> {
  const url =
    `${SEARCH}?q=${encodeURIComponent(query)}&limit=${limit}` +
    '&fields=title,author_name,isbn,number_of_pages_median,cover_i';

  const body = asRecord(await get(url));
  const docs = Array.isArray(body?.['docs']) ? body['docs'] : [];

  // Unless a summary is what was asked for, drop them: they contain every word
  // of the real title and so rank alongside it.
  const wantsDerivative = looksDerivative(query);

  return docs
    .map((doc) => toMetadata(asRecord(doc)))
    .filter((item): item is BookMetadata => item !== undefined)
    .filter((item) => wantsDerivative || !looksDerivative(item.title))
    .map((item) => ({ item, score: titleMatchScore(query, item.title) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function toMetadata(doc: Record<string, unknown> | undefined): BookMetadata | undefined {
  if (doc === undefined) return undefined;
  const title = firstString(doc['title']);
  if (title === undefined) return undefined;

  const coverId = asPositiveInt(doc['cover_i']);
  const isbn = preferIsbn13(doc['isbn']);

  /**
   * Search results often omit `cover_i` for a book that does have cover art, so
   * fall back to the by-ISBN endpoint. That endpoint answers 200 with a ~43-byte
   * placeholder when it has nothing, which the download's minimum-size check
   * already rejects — so a book with no cover still ends up with none.
   */
  const coverUrl =
    coverId !== undefined
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : isbn !== undefined
        ? `https://covers.openlibrary.org/b/isbn/${normaliseIsbn(isbn)}-L.jpg`
        : undefined;

  return {
    title,
    source: 'open-library',
    ...keyIfPresent('author', firstString(doc['author_name'])),
    ...keyIfPresent('isbn', isbn),
    ...keyIfPresent('pages', asPositiveInt(doc['number_of_pages_median'])),
    ...keyIfPresent('coverUrl', coverUrl),
    // A URL built from an ISBN is a guess; one built from a real cover id is not.
    ...(coverId === undefined && coverUrl !== undefined ? { coverIsSpeculative: true } : {}),
  };
}

/** Search returns every edition's ISBN jumbled together; 13-digit ones first. */
function preferIsbn13(value: unknown): string | undefined {
  if (!Array.isArray(value)) return firstString(value);
  const all = value.filter((item): item is string => typeof item === 'string');
  return all.find((isbn) => normaliseIsbn(isbn).length === 13) ?? all[0];
}

function authorsOf(value: unknown): string | undefined {
  if (!Array.isArray(value)) return firstString(value);
  const names = value
    .map((author) => firstString(asRecord(author)?.['name']))
    .filter((name): name is string => name !== undefined);
  return names.length > 0 ? names.join(', ') : undefined;
}

function coverOf(value: unknown): string | undefined {
  const cover = asRecord(value);
  if (cover === undefined) return undefined;
  return firstString(cover['large']) ?? firstString(cover['medium']) ?? firstString(cover['small']);
}

