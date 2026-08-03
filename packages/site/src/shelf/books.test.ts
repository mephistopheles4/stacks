import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { toRows } from './books.ts';

/**
 * Packing a library into rows. Pure since it was written, untested until the
 * placement arithmetic beside it got an interface worth testing through.
 */

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

/** Wide enough for a handful of books, narrow enough to wrap on purpose. */
const CAPACITY = 0.5;
const GAP = 0.008;

describe('toRows', () => {
  it('fills a row before starting the next, the way a bookcase fills up', () => {
    const rows = toRows(
      Array.from({ length: 12 }, (_, index) => book(`book-${String(index)}`)),
      CAPACITY,
      GAP,
    );

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flatMap((row) => row.books).length).toBe(12);
  });

  it('never packs a row past the capacity it was given', () => {
    const rows = toRows(
      Array.from({ length: 30 }, (_, index) => book(`book-${String(index)}`, { pages: 800 })),
      CAPACITY,
      GAP,
    );

    for (const row of rows) {
      const used = row.books.reduce(
        (total, entry) => total + entry.footprint + GAP + (entry.gapBefore ?? 0),
        0,
      );
      // One book always fits, however wide: a row is only wrapped when it
      // already holds something.
      if (row.books.length > 1) expect(used).toBeLessThanOrEqual(CAPACITY);
    }
  });

  it('opens a gap where the year changes, and counts it against the capacity', () => {
    // Leaving the gap out of the packing let twenty books smuggle in 0.16 of
    // unaccounted width and pushed the last one through the side of the case.
    const rows = toRows(
      [
        book('a', { finished: '2025-06-01' }),
        book('b', { finished: '2024-06-01' }),
        book('c', { finished: '2024-07-01' }),
      ],
      10,
      GAP,
    );

    const [row] = rows;
    expect(row?.books.map((entry) => entry.gapBefore)).toEqual([undefined, 0.09, undefined]);
  });

  it('opens no gap for the first book of a row, which has the case beside it', () => {
    // Every book a different year, newest first, so the sort leaves them in this
    // order and *every* book is a year change — which is the only way a row
    // actually starts on one. A fixture where years repeat quietly never
    // produces that case, and the test passes without covering anything.
    const rows = toRows(
      Array.from({ length: 12 }, (_, index) =>
        book(`book-${String(index)}`, { finished: `${String(2025 - index)}-06-01` }),
      ),
      CAPACITY,
      GAP,
    );

    expect(rows.length).toBeGreaterThan(1);
    // The fixture is only meaningful if a later row really does begin on a year
    // change: its first book must differ in year from the last of the row above.
    expect(rows[1]?.books[0]?.book.id).not.toBe(rows[0]?.books[0]?.book.id);
    for (const row of rows) expect(row.books[0]?.gapBefore).toBeUndefined();
  });

  it('leaves wishlist books off the shelf — you do not own them', () => {
    const rows = toRows(
      [book('owned'), book('wanted', { status: 'wishlist', finished: undefined })],
      10,
      GAP,
    );

    expect(rows.flatMap((row) => row.books).map((entry) => entry.book.id)).toEqual(['owned']);
  });

  it('puts a book you are reading first, ahead of everything finished', () => {
    const rows = toRows(
      [
        book('finished-recently', { finished: '2026-01-01' }),
        book('in-progress', { status: 'reading', finished: undefined }),
      ],
      10,
      GAP,
    );

    expect(rows[0]?.books[0]?.book.id).toBe('in-progress');
  });

  it('stands a book you are reading cover-forward', () => {
    const rows = toRows([book('in-progress', { status: 'reading', finished: undefined })], 10, GAP);
    const entry = rows[0]?.books[0];

    expect(entry?.faceOut).toBe(true);
    // A face-out book is turned side-on, so it eats its cover's width rather
    // than its own thickness. Row packing has to count that or the row overruns.
    expect(entry?.footprint).toBe(entry?.coverWidth);
  });

  it('gives every book the same height and colour on every rebuild', () => {
    const books = [book('a'), book('b')];
    expect(toRows(books, 10, GAP)).toEqual(toRows(books, 10, GAP));
  });
});
