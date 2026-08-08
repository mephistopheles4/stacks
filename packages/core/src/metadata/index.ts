import { isProbablySameBook, isValidIsbn, rankingScore } from '../identity.ts';
import * as appleBooks from './apple-books.ts';
import * as googleBooks from './google-books.ts';
import * as openLibrary from './open-library.ts';
import type { HttpGet } from './http.ts';
import type { BookMetadata } from './types.ts';

export { createCachedHttpGet, type HttpGet } from './http.ts';
export { coverUrls } from './types.ts';
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

/**
 * Fuzzy title search across both providers, best match first.
 *
 * **"Fallback" means *when the primary has no good answer*, not *when it is
 * silent*.** It used to mean the second: any Open Library result at all, however
 * wrong, ended the search and Google was never asked. Those two readings differ
 * exactly when the primary is merely mistaken, which is the common case for
 * recent and self-published titles — and it is a silent difference, because a
 * confident wrong answer looks the same as a right one from the outside.
 *
 * Google is still not asked when Open Library has actually found the book, so
 * this costs no extra requests on the path that was already working. That
 * matters: the Google quota is shared and exhaustible.
 */
export async function searchByTitle(
  query: string,
  get: HttpGet,
  options: MetadataOptions = {},
): Promise<BookMetadata[]> {
  const primary = await openLibrary.searchByTitle(query, get);
  if (primary.some((book) => matchesQuery(query, book))) return primary;

  const fallback = await googleBooks.searchByTitle(query, get, options.googleBooksKey);
  // Primary results are kept rather than replaced. They did not match the query
  // well, but neither may Google's, and dropping them would leave a caller that
  // wants *any* candidate with fewer than it had before.
  return [...primary, ...fallback];
}

function matchesQuery(query: string, book: BookMetadata): boolean {
  return isProbablySameBook(query, `${book.title} ${book.author ?? ''}`);
}

/**
 * Candidates reordered so the one a caller should use is first.
 *
 * Providers rank for a search box, not for identity: Google answers *"The New
 * Emotional Intelligence Travis Bradberry"* with *Emotional Intelligence 2.0*
 * first and the actual book second, and *The Subtle Art of Not Giving a F\*ck*
 * with a box set first and the plain edition fifth. Callers took `[0]` and
 * either wrote the wrong book or refused the right one without ever seeing it.
 *
 * Matching the query at all dominates, so no near-miss outranks a real match.
 * Within the matches `titleMatchScore` separates editions of one book, which is
 * the case that decides a page count: four candidates pass the matcher for *The
 * Subtle Art* — a censored-title edition at 206 pages, a revised edition, a 16pt
 * large-print at 320, and the true one at 262. Taking the first *matching*
 * candidate rather than the best one silently picks 206.
 */
function rankAgainst(term: string, results: readonly BookMetadata[]): BookMetadata[] {
  const score = (book: BookMetadata): number =>
    (matchesQuery(term, book) ? 1 : 0) + rankingScore(term, book.title, book.author);

  return [...results].sort((a, b) => {
    const difference = score(b) - score(a);
    if (Math.abs(difference) > SCORE_EPSILON) return difference;
    // Two records of one book, scoring identically: take the one that actually
    // says something. Open Library returns the authored and the empty "12 Rules
    // for Life" as an exact tie, and a stable sort would settle it on the
    // provider's response order — right today, and silently wrong the day that
    // order changes.
    return completeness(b) - completeness(a);
  });
}

/** Floating-point slack: these scores are products of divisions, not integers. */
const SCORE_EPSILON = 1e-9;

/**
 * How much a candidate actually tells us — the tiebreak, never the ranking.
 *
 * Deliberately not part of `score`: a fuller record is not a better *match*, and
 * letting completeness outweigh relevance is how a well-documented box set beats
 * the book someone asked for.
 */
function completeness(book: BookMetadata): number {
  return (
    (book.author === undefined ? 0 : 1) +
    (book.pages === undefined ? 0 : 1) +
    (book.isbn === undefined ? 0 : 1) +
    (book.coverUrl === undefined ? 0 : 1)
  );
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
    if (hit !== undefined) return [await preferAppleArtwork(await fillGaps(hit, get, options), get)];
  }

  const results = rankAgainst(term, await searchByTitle(term, get, options));
  const best = results[0];
  if (best === undefined) return results;

  // Only the result that will actually be used is enriched. Filling every
  // candidate would cost one request per search hit to answer a question nobody
  // asked.
  const filled = await preferAppleArtwork(
    await fillGaps(await completePages(best, get, options), get, options),
    get,
  );
  return [filled, ...results.slice(1)];
}

/**
 * Re-asks Google about the volume it has already been chosen, for a page count.
 *
 * A search response reports `pageCount: 0` for volumes whose detail endpoint
 * reports the real number, and `asPositiveInt` correctly drops the zero — so a
 * correctly matched candidate can still arrive with no pages, and did, for every
 * book this fixed. Runs after the match is settled, so it costs one request for
 * the chosen volume rather than one per candidate.
 */
async function completePages(
  book: BookMetadata,
  get: HttpGet,
  options: MetadataOptions,
): Promise<BookMetadata> {
  if (book.pages !== undefined || book.volumeId === undefined) return book;

  const detail = await googleBooks.fetchVolume(book.volumeId, get, options.googleBooksKey);
  return detail?.pages === undefined ? book : { ...book, pages: detail.pages };
}

/**
 * Adds Apple's artwork as the preferred cover candidate.
 *
 * Run after the providers have agreed on *which book this is*, because Apple is
 * consulted for pictures only. Its art is ~800x1200 and correctly cropped,
 * against Google's ~128px and Open Library's patchy scans, so it goes to the
 * front of the queue — but only ahead of a cover we have reason to doubt.
 * A large scan already in hand is left alone.
 */
async function preferAppleArtwork(
  book: BookMetadata,
  get: HttpGet,
): Promise<BookMetadata> {
  const weakCover =
    book.coverUrl === undefined ||
    book.coverIsSpeculative === true ||
    book.source === 'google-books' ||
    book.coverUrlLarge !== undefined;
  if (!weakCover) return book;

  const artwork = await appleBooks.findCover(book.title, book.author, get);
  return artwork === undefined ? book : { ...book, coverUrlLarge: artwork };
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
      ? {
          coverUrl: candidate.coverUrl,
          coverIsSpeculative: false,
          ...(candidate.coverUrlLarge === undefined
            ? {}
            : { coverUrlLarge: candidate.coverUrlLarge }),
        }
      : {}),
    ...(primary.pages === undefined && candidate.pages !== undefined
      ? { pages: candidate.pages }
      : {}),
    ...(primary.author === undefined && candidate.author !== undefined
      ? { author: candidate.author }
      : {}),
  };
}
