import { looksDerivative, normaliseIsbn } from '../identity.ts';
import type { HttpGet } from './http.ts';
import type { ReadingLanguage } from './language.ts';
import { asPositiveInt, asRecord, firstString, toPlainText, type BookMetadata } from './types.ts';
import { keyIfPresent } from '../key-if-present.ts';

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
  return firstVolume(
    await get(withKey(`${VOLUMES}?q=isbn:${normalised}&maxResults=1`, apiKey)),
    normalised,
  );
}

/**
 * Title search, in Google's own order.
 *
 * **A volume in another language keeps everything except its ISBN.** A
 * same-titled translation passes every matcher here, and a Google title result
 * can become the book a note records — so its ISBN would be written into the
 * note as this book's. Dropping only the ISBN leaves ranking, matching and G26
 * exactly as they were. `langRestrict` would have done this in the URL and moved
 * every cached response and every G26 key with it. See ADR-0094.
 *
 * `language` is required for the reason Open Library's is: a call site that
 * forgot it is a type error, not a silent English.
 */
export async function searchByTitle(
  query: string,
  get: HttpGet,
  language: ReadingLanguage,
  apiKey?: string,
): Promise<BookMetadata[]> {
  const url = withKey(`${VOLUMES}?q=${encodeURIComponent(query)}&maxResults=5`, apiKey);
  const body = asRecord(await get(url));
  if (body === undefined || isQuotaError(body)) return [];

  const wantsDerivative = looksDerivative(query);
  const items = Array.isArray(body['items']) ? body['items'] : [];
  return (
    items
      .map((item) => {
        const info = asRecord(asRecord(item)?.['volumeInfo']);
        const metadata = toMetadata(info, firstString(asRecord(item)?.['id']));
        return metadata === undefined || isIn(info, language) ? metadata : withoutIsbn(metadata);
      })
      .filter((item): item is BookMetadata => item !== undefined)
      // Same trap as Open Library: summaries rank alongside the real book.
      .filter((item) => wantsDerivative || !looksDerivative(item.title))
  );
}

/**
 * Whether a volume is in the reading language, by the primary subtag of its
 * `language` — so `zh-CN` compares as `zh`. Subtags are unmeasured: every
 * `language` in `fixtures/api/` is a bare `en`.
 *
 * **A volume that reports no language counts as in it.** Unknown is not a
 * mismatch, and dropping the ISBN of every such volume would cost dedup on all
 * of them.
 */
function isIn(info: Record<string, unknown> | undefined, language: ReadingLanguage): boolean {
  const reported = firstString(info?.['language']);
  return reported === undefined || reported.split('-')[0]?.toLowerCase() === language;
}

function withoutIsbn(metadata: BookMetadata): BookMetadata {
  const { isbn: _foreign, ...rest } = metadata;
  return rest;
}

/**
 * One volume, asked for by id.
 *
 * Exists because Google's two endpoints disagree: a volume that reports
 * `pageCount: 0` in a search response reports its real page count here. The
 * caller re-asks only for the volume it has already decided on, so this costs
 * one request per lookup that needs it rather than one per candidate.
 *
 * `printedPageCount` also appears in detail responses and is deliberately not
 * read. It disagrees with `pageCount` in *both* directions — 272 against 254 for
 * one book on this shelf, 197 against 304 for another — so it is not reliably
 * the more truthful number, and picking per book would be guessing. `pageCount`
 * is the documented field.
 */
export async function fetchVolume(
  id: string,
  get: HttpGet,
  apiKey?: string,
): Promise<BookMetadata | undefined> {
  if (id.length === 0) return undefined;
  const base = `${VOLUMES}/${encodeURIComponent(id)}`;
  const url =
    apiKey === undefined || apiKey.length === 0
      ? base
      : `${base}?key=${encodeURIComponent(apiKey)}`;

  const body = asRecord(await get(url));
  if (body === undefined || isQuotaError(body)) return undefined;
  return toMetadata(asRecord(body['volumeInfo']), id);
}

function firstVolume(body: unknown, fallbackIsbn: string): BookMetadata | undefined {
  const root = asRecord(body);
  if (root === undefined || isQuotaError(root)) return undefined;

  const items = Array.isArray(root['items']) ? root['items'] : [];
  const info = asRecord(asRecord(items[0])?.['volumeInfo']);
  const metadata = toMetadata(info, firstString(asRecord(items[0])?.['id']));
  if (metadata === undefined) return undefined;

  return metadata.isbn === undefined ? { ...metadata, isbn: fallbackIsbn } : metadata;
}

/** `{ error: { code: 429, … } }` — a miss, deliberately not an exception. */
function isQuotaError(body: Record<string, unknown>): boolean {
  return asRecord(body['error']) !== undefined;
}

function toMetadata(
  info: Record<string, unknown> | undefined,
  volumeId: string | undefined,
): BookMetadata | undefined {
  if (info === undefined) return undefined;
  const title = firstString(info['title']);
  if (title === undefined) return undefined;

  const subtitle = firstString(info['subtitle']);
  const imageLinks = asRecord(info['imageLinks']);

  return {
    title: subtitle === undefined ? title : `${title}: ${subtitle}`,
    source: 'google-books',
    ...keyIfPresent('author', joinAuthors(info['authors'])),
    ...keyIfPresent('isbn', isbnFrom(info['industryIdentifiers'])),
    ...keyIfPresent('pages', asPositiveInt(info['pageCount'])),
    ...keyIfPresent('volumeId', volumeId),
    ...keyIfPresent(
      'coverUrl',
      coverFrom(
        firstString(imageLinks?.['thumbnail']) ?? firstString(imageLinks?.['smallThumbnail']),
      ),
    ),
    ...keyIfPresent(
      'coverUrlLarge',
      largerCover(
        firstString(imageLinks?.['thumbnail']) ?? firstString(imageLinks?.['smallThumbnail']),
      ),
    ),
    ...keyIfPresent('publisher', firstString(info['publisher'])),
    ...keyIfPresent('published', firstString(info['publishedDate'])),
    // `categories` is short and curated — "Computers", "Business & Economics" —
    // which is why Google leads the subjects order against Open Library's 34 raw
    // headings for the same book.
    ...keyIfPresent('subjects', categoriesOf(info['categories'])),
    ...keyIfPresent('description', toPlainText(info['description'])),
  };
}

function categoriesOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    const single = firstString(value);
    return single === undefined ? undefined : [single];
  }
  const names = value.filter((name): name is string => typeof name === 'string');
  return names.length === 0 ? undefined : names;
}

/**
 * Google's cover thumbnail, cleaned up.
 *
 * Two fixes, one temptation resisted.
 *
 * `edge=curl` paints a fake page-curl onto the corner of the image. On a flat
 * listing it is decoration; on a 3D book it is a curl drawn onto a cover that
 * is already a solid object, so it goes.
 *
 * The URLs also come back as `http://`, which would make a deployed build
 * mixed-content.
 */
function coverFrom(url: string | undefined): string | undefined {
  return url?.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

/**
 * The same image at a higher zoom — a candidate, not a replacement.
 *
 * `thumbnail` is only ~128px wide, and a bigger zoom is often a genuine
 * high-resolution cover: *We Are as Gods* comes back 800x1196. But for other
 * titles the same request returns the publisher's jacket artwork — front,
 * spine, back flap and printer's crop marks in one image, near-square. *
 * Effective* does exactly that at 800x754.
 *
 * There is no field distinguishing the two, so the caller downloads this first
 * and keeps it only if the shape says cover rather than spread.
 */
function largerCover(url: string | undefined): string | undefined {
  const cleaned = coverFrom(url);
  return cleaned === undefined ? undefined : cleaned.replace(/zoom=\d/, 'zoom=4');
}

function isbnFrom(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
  const byType = (type: string): string | undefined =>
    firstString(entries.find((entry) => entry['type'] === type)?.['identifier']);
  return byType('ISBN_13') ?? byType('ISBN_10');
}

function joinAuthors(value: unknown): string | undefined {
  if (!Array.isArray(value)) return firstString(value);
  const names = value.filter((name): name is string => typeof name === 'string');
  return names.length > 0 ? names.join(', ') : undefined;
}
