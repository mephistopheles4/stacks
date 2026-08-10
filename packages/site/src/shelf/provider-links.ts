import type { LibraryBook } from '@stacks/core';

/**
 * Where a book's card can send you, and under what name.
 *
 * **Marks are identifier-built links only; a book with no identifier gets one
 * text search link instead.** That split is the whole design, and it carries the
 * distinction in the *form* rather than in a tooltip — which matters because the
 * mobile sheet made touch the primary case and a tooltip never fires there. A
 * mark pointing at a search results page is visually identical to a mark
 * pointing at the book's own page.
 *
 * Pure functions of `LibraryBook` fields, in a site module, because the site may
 * only `import type` from `@stacks/core`.
 *
 * See docs/spec/enhanced-card.md §8.
 */

export interface ProviderLink {
  /** Which mark to draw, or `search` for the text fallback. */
  readonly kind: 'open-library' | 'google' | 'apple' | 'search';
  readonly href: string;
  /**
   * The accessible name **and** the tooltip — one string, one attribute.
   *
   * `title` carries both. Dropping `aria-label` is what makes that legal: the
   * pair is what double-announces (a defect this repo already records at
   * `index.astro:64-68`), and with nothing else naming the element the
   * accessible-name computation falls back to `title`.
   *
   * ⚠️ It is the **weakest** naming mechanism in that computation — the last
   * fallback, and a WCAG technique of last resort. It works in the major screen
   * readers. Stated here rather than left silent, deliberately.
   *
   * ⚠️ And `title` never fires on touch, so on the primary device Apple's icon
   * is unlabelled for anyone who can see it. Accepted as a cost, not answered.
   */
  readonly name: string;
  /** The search fallback is a text link, and its visible text *is* its name. */
  readonly text?: string;
}

/**
 * The row, in the merge's own default provider order with O'Reilly skipped.
 *
 * **One provider order, not two.** The card ranks its marks by the same list the
 * merge ranks its fields by, so the project holds one order rather than two that
 * drift.
 *
 * **O'Reilly is recorded and never rendered.** Its `archive_id` 307s to a 403
 * whether the book exists or not, so there is no link to give it — the note
 * keeps `oreilly_ourn` as provenance and the card shows nothing, exactly as it
 * shows nothing for a provider that never matched.
 *
 * **The row always renders**: every book has a title, so every book has at least
 * the search link.
 */
export function providerLinks(book: LibraryBook): readonly ProviderLink[] {
  const marks: ProviderLink[] = [];

  /**
   * The ISBN form is preferred over the OLID, and that is not arbitrary.
   *
   * All three id URLs **hard-404 on a stale id**, while `openlibrary.org/isbn/`
   * returns 200 with a graceful page even for an ISBN it has never seen. That
   * puts the soft landing on the path 35 of 41 books take — and it means
   * backfilling ids **adds** marks rather than rewriting one, so those books
   * keep the exact link they have today.
   */
  if (book.isbn !== undefined) {
    marks.push({
      kind: 'open-library',
      href: `https://openlibrary.org/isbn/${encodeURIComponent(book.isbn)}`,
      name: 'Open Library',
    });
  } else if (book.openLibraryOlid !== undefined) {
    marks.push({
      kind: 'open-library',
      href: `https://openlibrary.org/books/${encodeURIComponent(book.openLibraryOlid)}`,
      name: 'Open Library',
    });
  }

  if (book.googleVolumeId !== undefined) {
    marks.push({
      kind: 'google',
      href: `https://books.google.com/books?id=${encodeURIComponent(book.googleVolumeId)}`,
      // **Not "Google Books".** Google's grant is a button whose artwork is an
      // image of the words "Google Preview", and an accessible name that does
      // not contain the visible text is a WCAG 2.5.3 (Label in Name) mismatch.
      name: 'Google Preview',
    });
  }

  if (book.appleTrackId !== undefined) {
    marks.push({
      kind: 'apple',
      // **Region-free.** The site does not know a visitor's storefront and
      // `/us/` asserts one on their behalf; Apple resolves it at request time,
      // which is the party that actually knows. Both forms were verified.
      href: `https://books.apple.com/book/id${encodeURIComponent(book.appleTrackId)}`,
      name: 'Apple Books',
    });
  }

  if (marks.length > 0) return marks;

  /**
   * No identifier at all — one text link, card-level rather than per-provider.
   *
   * Card-level is what keeps a row from ever being a mix of marks and text: a
   * book either has identifier links or it has this one. A per-provider fallback
   * would produce permanently mixed rows the moment a book had an ISBN but no
   * Google or Apple match.
   *
   * **Open Library and not Google**, which reverses an earlier decision on
   * measurement: `books.google.com/books?q=` 302s to general Google Search, so a
   * link named for Google Books lands somewhere else — and a real book Google
   * does not hold comes back as ten confident wrong books with no notice, where
   * Open Library says it matched nothing.
   */
  const query = `${book.title} ${book.author ?? ''}`.trim();
  return [
    {
      kind: 'search',
      href: `https://openlibrary.org/search?q=${encodeURIComponent(query)}`,
      name: 'Search Open Library',
      text: 'Search Open Library',
    },
  ];
}
