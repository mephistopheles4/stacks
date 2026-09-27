import { looksDerivative, normaliseIsbn, titleMatchScore } from '../identity.ts';
import type { HttpGet } from './http.ts';
import { openLibraryLanguage, type ReadingLanguage } from './language.ts';
import { asPositiveInt, asRecord, firstString, type BookMetadata } from './types.ts';
import { keyIfPresent } from '../key-if-present.ts';

/**
 * Open Library — the primary provider.
 *
 * Two response shapes, both captured for real in `fixtures/api/`:
 *
 * - `/api/books.json` returns `{ "ISBN:<isbn>": { … } }`, and — importantly —
 *   an **empty object `{}` for a miss, not a 404**. Anything keying off HTTP
 *   status would treat a miss as a success and hand back nothing.
 * - `/search.json` returns `{ numFound, docs: [ … ] }`.
 */

/**
 * ⚠️ **`.json` is load-bearing.** Open Library's own docs still show
 * `/api/books?…&format=json`, and on 2026-09-26 that path answered **404 for
 * every ISBN** while this one answered 200 with the identical body. The 404 was
 * silent: `HttpGet` returns `undefined` for it exactly as for a miss, so every
 * ISBN lookup fell through to Google's fuzzy `q=isbn:`. See ADR-0093.
 */
const API_BOOKS = 'https://openlibrary.org/api/books.json';
const SEARCH = 'https://openlibrary.org/search.json';

/**
 * The URL `lookupByIsbn` asks. **Exported because the URL is the cache key**,
 * for `SEARCH_FIELDS`' reason: `scripts/capture-api-fixtures.ts` builds its
 * ISBN captures from this rather than retyping it, and a test pins it — the
 * fixture readers match on a substring the broken path also contained.
 */
export function isbnLookupUrl(normalisedIsbn: string): string {
  return `${API_BOOKS}?bibkeys=ISBN:${normalisedIsbn}&jscmd=data`;
}

/**
 * What the search asks for. **Exported because it is part of a URL, and the URL
 * is the cache key.**
 *
 * Widening this list invalidates every cached Open Library search response and
 * every captured search fixture — the HTTP cache is keyed by URL, and G21
 * forbids a test making a live call to re-fill it. So the string lives in one
 * place and `scripts/capture-api-fixtures.ts` builds its URLs from *this*
 * constant rather than repeating it, which is what stops a re-capture from
 * silently recording a different question than the one the code asks.
 *
 * **`key` and `editions` are why it moved the second time, and they only work
 * together.** With both in the list, each work doc carries `editions.docs[0]`:
 * *one* edition, chosen by Open Library as the best match for `q`, projected
 * onto this same field list — so its `isbn`, `publisher`, `publish_date`,
 * `cover_i`, `key` and `language` all describe the same book. Without `key`,
 * `editions` comes back empty; the `editions.<sub>` syntax comes back empty too.
 * Both measured live on 2026-09-26. `language` is read off that edition, never
 * off the work. See ADR-0094.
 *
 * `edition_key` is still asked for and **deliberately not read**: its first
 * entry is an arbitrary edition, which is how a Turkish OLID reached an English
 * book. The edition's own `key` is the OLID now.
 */
export const SEARCH_FIELDS =
  'key,title,author_name,isbn,number_of_pages_median,cover_i,edition_key,publisher,publish_date,subject,language,editions';

/**
 * The URL a title search asks. **Exported because the URL is the cache key**,
 * for `isbnLookupUrl`'s reason: `scripts/capture-api-fixtures.ts` builds its
 * search captures from this, so a re-capture cannot ask a different question.
 *
 * The language clause rides inside `q` because that is the only form Open
 * Library honours — `&lang=en` changes nothing, measured — and a `language:`
 * clause is what filters *editions*: a work with no edition in that language
 * drops out. The value interpolated is the table's constant 639-2/B code, never
 * the string handed in; `openLibraryLanguage` throws on anything else.
 *
 * ⚠️ **The title shares `q` with the clause**, so its Solr syntax can reach it.
 * A bare `OR` answered **HTTP 500, twice**, and `http.ts` retries a 500 three
 * times and never caches it — every `enrich` run would re-hit a volunteer-run
 * service for that title. So bare `OR`, `AND` and `NOT` are lowercased first,
 * which Open Library reads as ordinary words (`NOT` untested, treated alike). An
 * unbalanced quote or parenthesis still turns the clause into literal text and
 * answers `numFound: 0`; that fails closed into Google and is not worked round,
 * and the edition-language check in `toMetadata` backs up anything else.
 */
export function searchUrl(query: string, language: ReadingLanguage, limit = 5): string {
  const q = `${withoutOperators(query)} language:${openLibraryLanguage(language)}`;
  return `${SEARCH}?q=${encodeURIComponent(q)}&limit=${String(limit)}&fields=${SEARCH_FIELDS}`;
}

/** Bare `OR`, `AND` and `NOT` tokens, lowercased into plain search words. */
function withoutOperators(query: string): string {
  return query.replace(/(?<=^|\s)(?:OR|AND|NOT)(?=\s|$)/g, (token) => token.toLowerCase());
}

export async function lookupByIsbn(isbn: string, get: HttpGet): Promise<BookMetadata | undefined> {
  const normalised = normaliseIsbn(isbn);
  if (normalised.length === 0) return undefined;

  const key = `ISBN:${normalised}`;
  const body = asRecord(await get(isbnLookupUrl(normalised)));
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
    ...keyIfPresent('publisher', namesOf(entry['publishers'])[0]),
    // Stored exactly as given: this endpoint answers `"2008"` where the other
    // three give a full date, which is precisely why Open Library is last in the
    // `published` order and why nothing normalises on the way in.
    ...keyIfPresent('published', firstString(entry['publish_date'])),
    ...keyIfPresent('subjects', listIfAny(namesOf(entry['subjects']))),
    ...keyIfPresent('openLibraryOlid', olidFrom(entry['key'])),
  };
}

/**
 * The OLID out of `"key": "/books/OL26445570M"`.
 *
 * Already in the response the ISBN path fetches, and unread until now — the
 * cheapest of the four contributor ids by a distance.
 */
function olidFrom(value: unknown): string | undefined {
  const key = firstString(value);
  return key === undefined ? undefined : (/(OL\d+M)$/.exec(key)?.[1] ?? undefined);
}

/** `[{name}]` — the shape Open Library uses for publishers, subjects and authors. */
function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = firstString(value);
    return single === undefined ? [] : [single];
  }
  return value
    .map((item) => firstString(asRecord(item)?.['name']) ?? firstString(item))
    .filter((name): name is string => name !== undefined);
}

function listIfAny(values: readonly string[]): readonly string[] | undefined {
  return values.length === 0 ? undefined : values;
}

/**
 * Fuzzy title search, best match first.
 *
 * Open Library happily returns 500+ loosely related results, so candidates are
 * re-scored locally against the query rather than trusting its ordering.
 *
 * `language` is required, and deliberately has no default here: the default is
 * applied once, at the metadata layer's entry points, so a caller that forgot
 * to pass the reading language is a type error rather than a silent English.
 */
export async function searchByTitle(
  query: string,
  get: HttpGet,
  language: ReadingLanguage,
  limit = 5,
): Promise<BookMetadata[]> {
  const body = asRecord(await get(searchUrl(query, language, limit)));
  const docs = Array.isArray(body?.['docs']) ? body['docs'] : [];
  const editionLanguage = openLibraryLanguage(language);

  // Unless a summary is what was asked for, drop them: they contain every word
  // of the real title and so rank alongside it.
  const wantsDerivative = looksDerivative(query);

  return docs
    .map((doc) => toMetadata(asRecord(doc), editionLanguage))
    .filter((item): item is BookMetadata => item !== undefined)
    .filter((item) => wantsDerivative || !looksDerivative(item.title))
    .map((item) => ({ item, score: titleMatchScore(query, item.title) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/**
 * One work doc, with every edition-scoped field taken from one edition.
 *
 * **From the work**: `title` — ranking and `isProbablySameBook` compare against
 * it, and the work's is the canonical one — plus `author_name`,
 * `number_of_pages_median` and `subject`, none of which the edition projection
 * carries. **From the edition, or not at all**: `isbn`, `publisher`,
 * `publish_date`, `cover_i` and the OLID. The work's own values for those are
 * each some edition's, in some language, and no two of them need be the same
 * edition — which is how one English book was written with a Turkish ISBN, a
 * CreateSpace publisher and a Turkish OLID. See ADR-0094.
 */
function toMetadata(
  doc: Record<string, unknown> | undefined,
  editionLanguage: string,
): BookMetadata | undefined {
  if (doc === undefined) return undefined;
  const title = firstString(doc['title']);
  if (title === undefined) return undefined;

  const edition = editionIn(doc, editionLanguage);
  const coverId = asPositiveInt(edition?.['cover_i']);
  const isbn = isbnOf(edition?.['isbn']);

  /**
   * Search results often omit `cover_i` for a book that does have cover art, so
   * fall back to the by-ISBN endpoint. That endpoint answers 200 with a ~43-byte
   * placeholder when it has nothing, which the download's minimum-size check
   * already rejects — so a book with no cover still ends up with none.
   *
   * Both halves are the edition's, so the guess is built from the right ISBN;
   * with no edition there is neither, and no guess.
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
    ...keyIfPresent('publisher', namesOf(edition?.['publisher'])[0]),
    ...keyIfPresent('published', namesOf(edition?.['publish_date'])[0]),
    ...keyIfPresent('subjects', listIfAny(namesOf(doc['subject']))),
    // The search path's only route to an OLID, and the edition's own — never
    // the work's `edition_key[0]`, which is as arbitrary as its `isbn[0]`.
    ...keyIfPresent('openLibraryOlid', olidFrom(edition?.['key'])),
    // A URL built from an ISBN is a guess; one built from a real cover id is not.
    ...(coverId === undefined && coverUrl !== undefined ? { coverIsSpeculative: true } : {}),
  };
}

/**
 * The one edition the search projected under this work — **only when its own
 * `language` holds the reading language**.
 *
 * The query's `language:` clause is the filter and this is the check. Anything
 * that gets past the clause — title syntax that turns it into literal text, a
 * change on Open Library's side — fails closed into "no edition, no ISBN"
 * instead of being trusted. The edition's `language` is read here and nowhere
 * else: it is never mapped into `BookMetadata`, so it cannot reach a note.
 *
 * ⚠️ The cost is stated in ADR-0094: a work whose editions in this language
 * carry no language tag drops out of Open Library and falls to Google.
 */
function editionIn(
  work: Record<string, unknown>,
  editionLanguage: string,
): Record<string, unknown> | undefined {
  const docs = asRecord(work['editions'])?.['docs'];
  const edition = Array.isArray(docs) ? asRecord(docs[0]) : undefined;
  const languages = edition?.['language'];
  return Array.isArray(languages) && languages.includes(editionLanguage) ? edition : undefined;
}

/**
 * One edition's ISBN, the 13-digit form when it has one.
 *
 * **Within one edition only.** An edition's `isbn` list is its ISBN-10 and its
 * ISBN-13 — the same book twice — so preferring the 13 picks a form, not a
 * book. The same rule over a *work's* list was the bug: that list jumbles every
 * edition in every language, and its first 13-digit entry was a Turkish one.
 */
function isbnOf(value: unknown): string | undefined {
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
