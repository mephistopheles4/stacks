import { looksDerivative } from '../identity.ts';
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
 * **Search only, and unauthenticated.** `/api/v2/search/` answers without a
 * session; the `/api/v2/book/<id>/` detail endpoints return 404 without one. So
 * this cannot serve as an ISBN resolver the way Open Library does, and it is
 * wired in as a title-search provider alone.
 *
 * **Two identifiers, and the URL carries the wrong one.** A library URL ends in
 * O'Reilly's internal `archive_id` — `0642572352530` — which passes an ISBN-13
 * check digit while beginning `064`, a prefix no Bookland range assigns. The
 * real ISBN is a separate field, `9798341674738`. Reading the identifier out of
 * the URL would write a plausible non-ISBN into the vault, so `isbn` is taken
 * from the response and the archive id is used for nothing here.
 *
 * **No cover, deliberately.** The art is good — `/covers/<archive-id>/1600w/`
 * serves 1600x2100, better than Apple's ~800x1200 — but `cover_source` is a
 * closed enum whose whole purpose is recording which terms apply to the bytes,
 * and `covers/cover-source.ts` summarises each provider's licence in prose.
 * Adding a fourth host there means reading O'Reilly's terms and writing that
 * paragraph, which is a separate decision and not one to infer. Until then this
 * returns metadata only, and a cover for an O'Reilly-sourced book still arrives
 * from Apple or Google if either holds one.
 */

const SEARCH = 'https://learning.oreilly.com/api/v2/search/';

/**
 * `formats=book` — the catalogue is videos, courses and live events too.
 *
 * Without it a search for "software engineering" returns all of them mixed
 * together, and a video is not something this shelf can hold.
 */
const BOOKS_ONLY = 'formats=book';

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
    source: 'oreilly',
  };
}
