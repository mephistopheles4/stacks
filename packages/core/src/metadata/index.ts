import { isProbablySameBook, isValidIsbn, rankingScore } from '../identity.ts';
import * as appleBooks from './apple-books.ts';
import * as googleBooks from './google-books.ts';
import * as openLibrary from './open-library.ts';
import * as oreilly from './oreilly.ts';
import { mergeFields, type Contributors } from './precedence.ts';
import type { HttpGet } from './http.ts';
import type { BookMetadata } from './types.ts';

export { createCachedHttpGet, type HttpGet } from './http.ts';
export { coverUrls } from './types.ts';
export type { BookMetadata, MetadataSource } from './types.ts';
export { DEFAULT_ORDER, FIELD_ORDER, MERGED_FIELDS, type MergedField } from './precedence.ts';

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
    (await googleBooks.lookupByIsbn(isbn, get, options.googleBooksKey)) ??
    // Last here for the same reason it is last in the search: only asked when
    // the first two have nothing. `enrich` reaches this path for every note that
    // carries an ISBN, so without it a book O'Reilly had just supplied could
    // never be enriched again.
    (await oreilly.lookupByIsbn(isbn, get))
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
  const both = [...primary, ...fallback];
  if (both.some((book) => matchesQuery(query, book))) return both;

  /**
   * O'Reilly last, on the same terms Google is second.
   *
   * Only asked when neither of the first two has actually found the book, so it
   * costs a request on the path that is currently failing and nothing on the
   * path that works. That is the whole reason it can be added without relaxing
   * the short-circuit above — a change measured to be orthogonal to this and
   * still unshipped.
   *
   * It answers for a narrow class: O'Reilly's own titles, and early releases in
   * particular, which the other three have never heard of.
   */
  return [...both, ...(await oreilly.searchByTitle(query, get))];
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
    if (hit !== undefined) return [await complete(hit, get, options)];
  }

  const results = rankAgainst(term, await searchByTitle(term, get, options));
  const best = results[0];
  if (best === undefined) return results;

  // Only the result that will actually be used is enriched. Filling every
  // candidate would cost one request per search hit to answer a question nobody
  // asked.
  const filled = await complete(await completePages(best, get, options), get, options);
  return [filled, ...results.slice(1)];
}

/**
 * One record, completed from every provider that can be confirmed to hold this
 * book.
 *
 * Two things happen and they are deliberately separate. `fillGaps` and the two
 * cover rescues decide `title`, `author`, `isbn`, `pages` and `cover` exactly as
 * they always have — that behaviour is pinned by G26 and is not what this work
 * changes. Then `mergeFields` fills the four new fields and the four contributor
 * ids from whichever provider wins each, by the table in `precedence.ts`.
 *
 * Every provider consulted along the way records itself in `contributors`, and
 * only after its record has been confirmed to be this book.
 */
async function complete(
  primary: BookMetadata,
  get: HttpGet,
  options: MetadataOptions,
): Promise<BookMetadata> {
  const contributors: Contributors = new Map([[primary.source, primary]]);
  const withGaps = await fillGaps(primary, get, options, contributors);
  const withArtwork = await askApple(withGaps, get, contributors);
  return mergeFields(withArtwork, contributors);
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
 * Asks Apple about every book, and takes its artwork only when the cover is weak.
 *
 * **Asked for every book, not opportunistically, and that is the change.** It
 * used to run only when the cover was undefined, speculative, Google-sourced or
 * already large. Harvesting Apple's *fields* under that gate would make a book's
 * recorded facts depend on whether its cover happened to be weak — invisible in
 * the note, unreproducible, and two books with identical inputs would differ.
 *
 * The **cover** rule is untouched: Apple's art is ~800x1200 and correctly
 * cropped against Google's ~128px, so it goes to the front of the queue, but
 * only ahead of a cover we have reason to doubt. A large scan already in hand is
 * left alone.
 *
 * ⚠️ One request per book against iTunes' ~20 a minute. No throttle: a `429` is
 * transient, is never cached, and a second run therefore asks only for what the
 * first missed. "Run it twice" is the operating instruction.
 */
async function askApple(
  book: BookMetadata,
  get: HttpGet,
  contributors: Contributors,
): Promise<BookMetadata> {
  const record = await appleBooks.findRecord(book.title, book.author, get);
  if (record === undefined) return book;

  // `findRecord` returns nothing unless `isProbablySameBook` agreed, so reaching
  // here *is* the confirmation that makes Apple a contributor.
  contributors.set('apple-books', record);

  const weakCover =
    book.coverUrl === undefined ||
    book.coverIsSpeculative === true ||
    book.source === 'google-books' ||
    book.coverUrlLarge !== undefined;

  return !weakCover || record.coverUrlLarge === undefined
    ? book
    : { ...book, coverUrlLarge: record.coverUrlLarge };
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
  contributors: Contributors,
): Promise<BookMetadata> {
  // A speculative cover counts as missing: it is a URL we invented from an
  // ISBN, and the endpoint answers with a placeholder as readily as with art.
  const needsCover = primary.coverUrl === undefined || primary.coverIsSpeculative === true;
  if (primary.source === 'google-books') {
    return needsCover ? await borrowOReillyCover(primary, get, contributors) : primary;
  }

  /**
   * Google is asked whether or not there is a gap to fill, and that is new.
   *
   * It used to be skipped entirely when the primary already had a cover and a
   * page count — which meant `google_volume_id` existed only for books whose
   * Open Library record happened to be thin. Same argument as Apple above: a
   * book's recorded provenance must not depend on the completeness of another
   * provider's answer. The cache makes the repeat free after the first run.
   */
  const candidate =
    primary.isbn === undefined
      ? (await googleBooks.searchByTitle(
          `${primary.title} ${primary.author ?? ''}`.trim(),
          get,
          options.googleBooksKey,
        ))[0]
      : await googleBooks.lookupByIsbn(primary.isbn, get, options.googleBooksKey);

  if (candidate === undefined)
    return needsCover ? await borrowOReillyCover(primary, get, contributors) : primary;

  // An ISBN lookup is already proof of identity; a title search is not.
  const sameBook =
    primary.isbn !== undefined ||
    isProbablySameBook(
      `${primary.title} ${primary.author ?? ''}`,
      `${candidate.title} ${candidate.author ?? ''}`,
    );
  if (!sameBook)
    return needsCover ? await borrowOReillyCover(primary, get, contributors) : primary;

  // Confirmed to be this book, which is the bar a contributor has to clear.
  contributors.set('google-books', candidate);

  const filled: BookMetadata = {
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

  return filled.coverUrl === undefined || filled.coverIsSpeculative === true
    ? await borrowOReillyCover(filled, get, contributors)
    : filled;
}

/**
 * A cover from O'Reilly for a book the first two providers know and cannot
 * picture.
 *
 * The gap the fallback above cannot close. *Evals for AI Engineers* is in Open
 * Library, so the ISBN lookup stops there and never reaches a fourth provider —
 * but Open Library's cover for it is a **43-byte placeholder**, Google has no
 * art either, and Apple has never heard of the book. O'Reilly has it at 1200px.
 * Without this the book sits on the shelf as a blank spine while the picture is
 * one request away.
 *
 * Runs only when a cover is still missing or still a guess after everything
 * else, so it costs a request on exactly the books that would otherwise have
 * nothing. Needs an ISBN: this is a by-identifier lookup and a title search here
 * would be borrowing art on a resemblance.
 */
async function borrowOReillyCover(
  book: BookMetadata,
  get: HttpGet,
  contributors: Contributors,
): Promise<BookMetadata> {
  if (book.isbn === undefined || book.source === 'oreilly') return book;

  const candidate = await oreilly.lookupByIsbn(book.isbn, get);
  if (candidate === undefined) return book;

  // An ISBN lookup is proof of identity, so this record is a contributor even
  // when it has no cover to lend — O'Reilly's `ourn` is worth recording for a
  // book it holds whatever the art situation is.
  contributors.set('oreilly', candidate);

  if (candidate.coverUrl === undefined) return book;
  return { ...book, coverUrl: candidate.coverUrl, coverIsSpeculative: false };
}
