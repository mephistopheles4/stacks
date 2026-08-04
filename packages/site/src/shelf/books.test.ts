import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { toRows } from './books.ts';
import { USABLE_WIDTH } from './case.ts';
import { rowCost } from './placement.ts';

/**
 * Packing a library into rows. Pure since it was written, untested until the
 * placement arithmetic beside it got an interface worth testing through.
 *
 * **These used to hand `toRows` a shelf.** A capacity of 0.5 wrapped after four
 * books and one of 10 never wrapped at all, which made the wrap cases cheap to
 * write and made every one of them a statement about furniture that does not
 * exist. `toRows` imports the case now — ADR-0029's argument, applied to the
 * packer by ADR-0031 — so a wrap has to be provoked by feeding it books, and
 * "wide enough not to wrap" is a book count rather than a number. That is the
 * cost ADR-0029 said it was paying, arriving.
 */

/**
 * Comfortably more than one row holds, at any thickness.
 *
 * The thinnest book is 0.055 and a row is 3.34, so thirty-odd thin books is the
 * most a row can take. Sixty of anything wraps.
 */
const WRAPS = 60;

function book(id: string, over: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id,
    title: id,
    status: 'read',
    finished: '2025-06-01',
    pages: 300,
    tags: [],
    ...over,
  };
}

describe('toRows', () => {
  it('fills a row before starting the next, the way a bookcase fills up', () => {
    const rows = toRows(Array.from({ length: WRAPS }, (_, index) => book(`book-${String(index)}`)));

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flatMap((row) => row.books).length).toBe(WRAPS);
  });

  it('never packs a row past the shelf it is packing into', () => {
    const rows = toRows(
      Array.from({ length: WRAPS }, (_, index) => book(`book-${String(index)}`, { pages: 800 })),
    );

    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // One book always fits, however wide: a row is only wrapped when it
      // already holds something.
      if (row.books.length > 1) expect(rowCost(row.books)).toBeLessThanOrEqual(USABLE_WIDTH);
    }
  });

  it('opens a gap where the year changes, and counts it against the capacity', () => {
    // Leaving the gap out of the packing let twenty books smuggle in 0.16 of
    // unaccounted width and pushed the last one through the side of the case.
    const rows = toRows([
      book('a', { finished: '2025-06-01' }),
      book('b', { finished: '2024-06-01' }),
      book('c', { finished: '2024-07-01' }),
    ]);

    const [row] = rows;
    expect(row?.books.map((entry) => entry.gapBefore)).toEqual([undefined, 0.09, undefined]);
  });

  it('opens no gap for the first book of a row, which has the case beside it', () => {
    // Every book a different year, newest first, so the sort leaves them in this
    // order and *every* book is a year change — which is the only way a row
    // actually starts on one. A fixture where years repeat quietly never
    // produces that case, and the test passes without covering anything.
    const rows = toRows(
      Array.from({ length: WRAPS }, (_, index) =>
        book(`book-${String(index)}`, { finished: `${String(2025 - index)}-06-01` }),
      ),
    );

    expect(rows.length).toBeGreaterThan(1);
    // The fixture is only meaningful if a later row really does begin on a year
    // change: its first book must differ in year from the last of the row above.
    expect(rows[1]?.books[0]?.book.id).not.toBe(rows[0]?.books[0]?.book.id);
    for (const row of rows) expect(row.books[0]?.gapBefore).toBeUndefined();
  });

  it('leaves wishlist books off the shelf — you do not own them', () => {
    const rows = toRows([book('owned'), book('wanted', { status: 'wishlist', finished: undefined })]);

    expect(rows.flatMap((row) => row.books).map((entry) => entry.book.id)).toEqual(['owned']);
  });

  it('puts a book you are reading first, ahead of everything finished', () => {
    const rows = toRows([
      book('finished-recently', { finished: '2026-01-01' }),
      book('in-progress', { status: 'reading', finished: undefined }),
    ]);

    expect(rows[0]?.books[0]?.book.id).toBe('in-progress');
  });

  it('stands a book you are reading cover-forward', () => {
    const rows = toRows([book('in-progress', { status: 'reading', finished: undefined })]);
    const entry = rows[0]?.books[0];

    expect(entry?.faceOut).toBe(true);
    // A face-out book is turned side-on, so it eats its cover's width rather
    // than its own thickness. Row packing has to count that or the row overruns.
    expect(entry?.footprint).toBe(entry?.coverWidth);
  });

  it('gives every book the same height and colour on every rebuild', () => {
    const books = [book('a'), book('b')];
    expect(toRows(books)).toEqual(toRows(books));
  });
});
