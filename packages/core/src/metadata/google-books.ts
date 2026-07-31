import { normaliseIsbn } from '../identity.ts';
import type { HttpGet } from './http.ts';
import { asPositiveInt, asRecord, firstString, type BookMetadata } from './types.ts';

/**
 * Google Books — the fallback, and a shaky one.
 *
 * Captured for real: an unauthenticated request returns **429 "Quota exceeded
 * … Queries per day"** against a *shared anonymous consumer project*. So the
 * quota is not ours to run out of, and it may already be exhausted before we
 * make a single call. See `fixtures/api/google-books-quota-exceeded.json`.
 *
 * Consequence for the design: a quota error is treated as an ordinary miss, not
 * an exception. A personal tool must not fall over because someone else's
 * traffic used up a shared allowance. To make this provider dependable you need
 * your own API key — until then, treat it as a bonus, never a guarantee.
 */

const VOLUMES = 'https://www.googleapis.com/books/v1/volumes';

/**
 * A personal API key moves you off the shared anonymous quota.
 *
 * Without one every request 429s against a pool other people have already
 * spent, which meant this provider had never actually answered a question —
 * every "nothing found" came from Open Library alone. Keys are free.
 */
function withKey(url: string, apiKey: string | undefined): string {
  return apiKey === undefined || apiKey.length === 0
    ? url
    : `${url}&key=${encodeURIComponent(apiKey)}`;
}

export async function lookupByIsbn(
  isbn: string,
  get: HttpGet,
  apiKey?: string,
): Promise<BookMetadata | undefined> {
  const normalised = normaliseIsbn(isbn);
  if (normalised.length === 0) return undefined;
  return firstVolume(await get(withKey(`${VOLUMES}?q=isbn:${normalised}&maxResults=1`, apiKey)), normalised);
}

export async function searchByTitle(
  query: string,
  get: HttpGet,
  apiKey?: string,
): Promise<BookMetadata[]> {
  const url = withKey(`${VOLUMES}?q=${encodeURIComponent(query)}&maxResults=5`, apiKey);
  const body = asRecord(await get(url));
  if (body === undefined || isQuotaError(body)) return [];

  const items = Array.isArray(body['items']) ? body['items'] : [];
  return items
    .map((item) => toMetadata(asRecord(asRecord(item)?.['volumeInfo'])))
    .filter((item): item is BookMetadata => item !== undefined);
}

function firstVolume(body: unknown, fallbackIsbn: string): BookMetadata | undefined {
  const root = asRecord(body);
  if (root === undefined || isQuotaError(root)) return undefined;

  const items = Array.isArray(root['items']) ? root['items'] : [];
  const info = asRecord(asRecord(items[0])?.['volumeInfo']);
  const metadata = toMetadata(info);
  if (metadata === undefined) return undefined;

  return metadata.isbn === undefined ? { ...metadata, isbn: fallbackIsbn } : metadata;
}

/** `{ error: { code: 429, … } }` — a miss, deliberately not an exception. */
function isQuotaError(body: Record<string, unknown>): boolean {
  return asRecord(body['error']) !== undefined;
}

function toMetadata(info: Record<string, unknown> | undefined): BookMetadata | undefined {
  if (info === undefined) return undefined;
  const title = firstString(info['title']);
  if (title === undefined) return undefined;

  const subtitle = firstString(info['subtitle']);
  const imageLinks = asRecord(info['imageLinks']);

  return {
    title: subtitle === undefined ? title : `${title}: ${subtitle}`,
    source: 'google-books',
    ...maybe('author', joinAuthors(info['authors'])),
    ...maybe('isbn', isbnFrom(info['industryIdentifiers'])),
    ...maybe('pages', asPositiveInt(info['pageCount'])),
    ...maybe(
      'coverUrl',
      // Google serves http:// links; upgrade them so a static build stays
      // mixed-content clean.
      (firstString(imageLinks?.['thumbnail']) ?? firstString(imageLinks?.['smallThumbnail']))
        ?.replace(/^http:/, 'https:'),
    ),
  };
}

function isbnFrom(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== undefined);
  const byType = (type: string): string | undefined =>
    firstString(entries.find((entry) => entry['type'] === type)?.['identifier']);
  return byType('ISBN_13') ?? byType('ISBN_10');
}

function joinAuthors(value: unknown): string | undefined {
  if (!Array.isArray(value)) return firstString(value);
  const names = value.filter((name): name is string => typeof name === 'string');
  return names.length > 0 ? names.join(', ') : undefined;
}

function maybe<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<never, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
