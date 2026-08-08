import { looksDerivative, normaliseIsbn } from '../identity.ts';
import { keyIfPresent } from '../key-if-present.ts';
import type { HttpGet } from './http.ts';
import { asPositiveInt, asRecord, firstString, type BookMetadata } from './types.ts';

/**
 * O'Reilly, consulted last, for the books the other three have never heard of.
 *
 * It earns its place on one class of book: O'Reilly's own titles, especially
 * early releases. *Learning AI-Native Software Engineering* is dated 2027-02-25
 * and Open Library, Google and Apple hold nothing for it under either its ISBN
 * or its title — so `stacks add` answered with *AI-Powered Software
 * Engineering*, a different book by four different authors. This provider is the
 * only source that has it.
 *
 * **One endpoint, unauthenticated.** `/api/v2/search/` answers without a
 * session; `/api/v2/book/<id>/` returns 404 without one. Both lookups therefore
 * go through search — an ISBN is asked for as `query=<isbn>&field=isbn`, which
 * is exact. That matters more than it looks: `enrich` searches by a note's ISBN
 * when it has one, so without the ISBN path a book this provider had just
 * supplied could never be enriched again by it. (`isbn=` as its own parameter is
 * *not* the same thing — it is ignored, and the search returns the whole
 * catalogue ranked by relevance to nothing.)
 *
 * **Two identifiers, and the URL carries the wrong one.** A library URL ends in
 * O'Reilly's internal `archive_id` — `0642572352530` — which passes an ISBN-13
 * check digit while beginning `064`, a prefix no Bookland range assigns. The
 * real ISBN is a separate field, `9798341674738`. Reading the identifier out of
 * the URL would write a plausible non-ISBN into the vault, so `isbn` is taken
 * from the response and the archive id is used for nothing here.
 *
 * **The cover is the best of the four.** `/covers/<ourn>/<n>w/` scales on
 * demand, and it is the only source for these books at all: Open Library
 * answers their ISBNs with a 43-byte placeholder and Apple has never heard of
 * them, so without this they are blank spines.
 *
 * Built from the `ourn` field verbatim rather than re-derived from
 * `archive_id`, which is the same string wrapped in `urn:orm:book:` — one place
 * to be wrong instead of two. The bare id works identically; the URN is simply
 * what the response already hands over.
 */

const SEARCH = 'https://learning.oreilly.com/api/v2/search/';

/**
 * `formats=book` — the catalogue is videos, courses and live events too.
 *
 * Without it a search for "software engineering" returns all of them mixed
 * together, and a video is not something this shelf can hold.
 */
const BOOKS_ONLY = 'formats=book';

export async function lookupByIsbn(isbn: string, get: HttpGet): Promise<BookMetadata | undefined> {
  const normalised = normaliseIsbn(isbn);
  if (normalised.length === 0) return undefined;

  const url = `${SEARCH}?query=${normalised}&field=isbn&${BOOKS_ONLY}&limit=1`;
  const body = asRecord(await get(url));
  const results = Array.isArray(body?.['results']) ? body['results'] : [];
  return toMetadata(asRecord(results[0]));
}

export async function searchByTitle(
  query: string,
  get: HttpGet,
  limit = 5,
): Promise<BookMetadata[]> {
  const url =
    `${SEARCH}?query=${encodeURIComponent(query)}` +
    `&field=title&${BOOKS_ONLY}&limit=${String(limit)}`;

  const body = asRecord(await get(url));
  const results = Array.isArray(body?.['results']) ? body['results'] : [];

  const wantsDerivative = looksDerivative(query);

  return results
    .map((entry) => toMetadata(asRecord(entry)))
    .filter((item): item is BookMetadata => item !== undefined)
    // Same trap as the other two: study guides carry every word of the title.
    .filter((item) => wantsDerivative || !looksDerivative(item.title));
}

function toMetadata(result: Record<string, unknown> | undefined): BookMetadata | undefined {
  if (result === undefined) return undefined;

  const title = firstString(result['title']);
  if (title === undefined) return undefined;

  return {
    title,
    // `authors` is an array; the first, matching how `open-library.ts` narrows
    // `author_name` — the frontmatter contract's `author` is a scalar.
    ...keyIfPresent('author', firstString(result['authors'])),
    ...keyIfPresent('isbn', firstString(result['isbn'])),
    /**
     * `virtual_pages`, and it is not a print page count.
     *
     * O'Reilly's estimate for reflowable content, which is the only page number
     * that exists for a title that has never been printed. Recorded because the
     * shelf needs a height and this is the publisher's own figure for the
     * edition being read — but it is a different kind of fact from the numbers
     * G26 pins exactly, and it should not be compared against them.
     */
    ...keyIfPresent('pages', asPositiveInt(result['virtual_pages'])),
    ...keyIfPresent('coverUrl', coverFor(result)),
    source: 'oreilly',
  };
}

/**
 * The cover, asked for at `COVER_WIDTH`.
 *
 * **Not the largest on offer, deliberately.** The endpoint serves up to 2000px
 * — 2000x2625, about a megabyte — and `MAX_COVER_EDGE` resizes every published
 * cover to 512 on its long edge, because oversized textures are what crashed
 * mobile. So pixels above the cap reach no shelf and cost only vault bytes: a
 * megabyte a book against 8.9 MB for the whole library today. This matches what
 * Apple is already asked for, which leaves headroom over 512 without paying
 * ten times over for it.
 *
 * `cover_url` on the response is the 140x184 thumbnail, so it is not used; the
 * sized path is built instead. Widths above ~2000 answer 400.
 */
const COVER_WIDTH = 1200;

function coverFor(result: Record<string, unknown>): string | undefined {
  const ourn = firstString(result['ourn']);
  if (ourn === undefined) return undefined;
  return `https://learning.oreilly.com/covers/${ourn}/${String(COVER_WIDTH)}w/`;
}
