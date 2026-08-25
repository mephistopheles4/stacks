import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { MAX_HEIGHT, MIN_HEIGHT, toRows, type ShelfRow } from './books.ts';
import { SHELF, USABLE_WIDTH } from './case.ts';
import { rowExtent } from './placement.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

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

/**
 * Packed at the shipped binding mixture, which is the shelf a visitor gets.
 *
 * Named rather than defaulted inside `toRows`: the mixture decides each book's
 * height band, a face-out book's footprint is its cover width, and so the packer
 * is downstream of it. A parameter with a default would let a caller silently
 * pack against a mixture the shelf is not running.
 */
function rowsOf(books: readonly LibraryBook[]): ShelfRow[] {
  return toRows(books, DEFAULT_SETTINGS.books);
}

describe('toRows', () => {
  it('fills a row before starting the next, the way a bookcase fills up', () => {
    const rows = rowsOf(Array.from({ length: WRAPS }, (_, index) => book(`book-${String(index)}`)));

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flatMap((row) => row.books).length).toBe(WRAPS);
  });

  it('never packs a row past the shelf it is packing into', () => {
    const rows = rowsOf(
      Array.from({ length: WRAPS }, (_, index) => book(`book-${String(index)}`, { pages: 800 })),
    );

    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((row, index) => {
      // Where the row's last book actually ends, not what a model of it costs.
      //
      // ⚠️ **This is the packer's own smoke check, and it is weaker than the line
      // it replaced.** That line read `rowCost(row.books) <= USABLE_WIDTH` — an
      // independent model, bounding the row from outside the placer. `rowExtent`
      // is what `fitsRow` wraps, so a cursor that over-spends moves the wrap and
      // this measurement together and nothing here notices. G25 states that
      // rationale in full and carries the assertions that do notice; this one
      // exists so a packer that stops wrapping *at all* fails in the packer's own
      // file, next to the tests for what it is packing.
      expect(rowExtent(row.books, index)).toBeLessThanOrEqual(
        -SHELF.width / 2 + USABLE_WIDTH + 1e-12,
      );
    });
  });

  it('opens a gap where the year changes, and counts it against the capacity', () => {
    // Leaving the gap out of the packing let twenty books smuggle in 0.16 of
    // unaccounted width and pushed the last one through the side of the case.
    const rows = rowsOf([
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
    const rows = rowsOf(
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
    const rows = rowsOf([
      book('owned'),
      book('wanted', { status: 'wishlist', finished: undefined }),
    ]);

    expect(rows.flatMap((row) => row.books).map((entry) => entry.book.id)).toEqual(['owned']);
  });

  it('puts a book you are reading first, ahead of everything finished', () => {
    const rows = rowsOf([
      book('finished-recently', { finished: '2026-01-01' }),
      book('in-progress', { status: 'reading', finished: undefined }),
    ]);

    expect(rows[0]?.books[0]?.book.id).toBe('in-progress');
  });

  it('stands a book you are reading cover-forward', () => {
    const rows = rowsOf([book('in-progress', { status: 'reading', finished: undefined })]);
    const entry = rows[0]?.books[0];

    expect(entry?.faceOut).toBe(true);
    // A face-out book is turned side-on, so it eats its cover's width rather
    // than its own thickness. Row packing has to count that or the row overruns.
    expect(entry?.footprint).toBe(entry?.coverWidth);
  });

  it('gives every book the same height and colour on every rebuild', () => {
    const books = [book('a'), book('b')];
    expect(rowsOf(books)).toEqual(rowsOf(books));
  });
});

describe('a book with no page count', () => {
  const unpaged = Array.from({ length: 20 }, (_, index) =>
    book(`no-pages-${String(index)}`, { pages: undefined }),
  );

  const thicknesses = (): number[] =>
    rowsOf(unpaged)
      .flatMap((row) => row.books)
      .map((entry) => entry.thickness);

  it('gets its own width rather than everyone getting the same one', () => {
    // It used to get a constant 0.1075 — the midpoint, and the one answer
    // guaranteed to look wrong, because a row of unmatched books came out
    // identically thick and read as a printing error rather than as a shelf.
    expect(new Set(thicknesses()).size).toBe(unpaged.length);
  });

  it('stays unremarkable, never claiming to be a doorstop or a pamphlet', () => {
    // An invented thickness must not assert something about the book. The band is
    // deliberately narrower than the range a real page count can reach.
    const middle = (0.055 + 0.16) / 2;
    for (const thickness of thicknesses()) {
      expect(Math.abs(thickness - middle)).toBeLessThanOrEqual((0.16 - 0.055) * 0.15 + 1e-12);
    }
  });

  it('keeps the same width on every rebuild', () => {
    expect(thicknesses()).toEqual(thicknesses());
  });

  it('leaves a book that has a page count alone', () => {
    // The hash is the *absent* branch only. A book with pages must still be
    // measured by them, or the shelf stops meaning anything.
    const measured = rowsOf([book('thin', { pages: 120 }), book('fat', { pages: 800 })]).flatMap(
      (row) => row.books,
    );

    expect(measured.find((entry) => entry.book.id === 'thin')?.thickness).toBeCloseTo(0.055, 12);
    expect(measured.find((entry) => entry.book.id === 'fat')?.thickness).toBeCloseTo(0.16, 12);
  });
});

describe('binding', () => {
  const LIBRARY = Array.from({ length: 200 }, (_, index) => book(`book-${String(index)}`));

  const bindingsAt = (paperbackRatio: number): string[] =>
    toRows(LIBRARY, { ...DEFAULT_SETTINGS.books, paperbackRatio })
      .flatMap((row) => row.books)
      .map((entry) => entry.binding);

  it('takes what the note declares, whatever the mixture says', () => {
    // A declaration is not a vote: dialling the ratio to either extreme must not
    // move a book whose binding somebody has actually looked at and recorded.
    const declared = [book('a', { binding: 'hardback' }), book('b', { binding: 'paperback' })];

    for (const ratio of [0, 0.6, 1]) {
      const entries = toRows(declared, {
        ...DEFAULT_SETTINGS.books,
        paperbackRatio: ratio,
      }).flatMap((row) => row.books);
      expect(entries.map((entry) => entry.binding)).toEqual(['hardback', 'paperback']);
    }
  });

  it('hashes a binding for every book that declares none', () => {
    // Absent routes to the hash and never to a value. If it defaulted instead,
    // this shelf would be one format and the count below would be 0 or 200.
    const paperbacks = bindingsAt(0.6).filter((binding) => binding === 'paperback').length;

    expect(paperbacks).toBeGreaterThan(0);
    expect(paperbacks).toBeLessThan(LIBRARY.length);
  });

  it('moves the mixture with the ratio, in the right direction', () => {
    // The knob has to be doing the thing its label claims — the panel reports it
    // as a rebuild, and a rebuild that changed nothing is the lie `ApplyReport`
    // exists to prevent.
    expect(bindingsAt(0).every((binding) => binding === 'hardback')).toBe(true);
    expect(bindingsAt(1).every((binding) => binding === 'paperback')).toBe(true);

    const at = (ratio: number): number =>
      bindingsAt(ratio).filter((binding) => binding === 'paperback').length;
    expect(at(0.3)).toBeLessThan(at(0.6));
    expect(at(0.6)).toBeLessThan(at(0.9));
  });

  it('draws binding and height off independent hashes', () => {
    // The trap this salt exists to avoid. Sharing `hashUnit(id)` would make every
    // paperback exactly the shorter 60% of the shelf — and since binding *also*
    // biases the height band, the two would compound into a monotonic shelf that
    // passes every other test here and looks wrong.
    //
    // So the tallest book on a 60%-paperback shelf must be able to be a
    // paperback: with a shared hash it never could, because a paperback would
    // always draw from the bottom of the range.
    const entries = toRows(LIBRARY, { ...DEFAULT_SETTINGS.books, paperbackRatio: 0.6 }).flatMap(
      (row) => row.books,
    );
    const paperbacks = entries.filter((entry) => entry.binding === 'paperback');
    const hardbacks = entries.filter((entry) => entry.binding === 'hardback');

    const tallestPaperback = Math.max(...paperbacks.map((entry) => entry.height));
    const shortestHardback = Math.min(...hardbacks.map((entry) => entry.height));

    expect(tallestPaperback).toBeGreaterThan(shortestHardback);
  });

  it('biases the height band without widening it', () => {
    // `MAX_HEIGHT` bounds the worst swing a lean can produce, which is what
    // `SHELF.endReserve` covers (G25). A band that reached outside it would make
    // the packer's reserve wrong and walk books out through the side of the case.
    const entries = toRows(LIBRARY, { ...DEFAULT_SETTINGS.books, paperbackRatio: 0.6 }).flatMap(
      (row) => row.books,
    );
    for (const entry of entries) {
      expect(entry.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(entry.height).toBeLessThanOrEqual(MAX_HEIGHT);
    }

    // And the bias is real: paperbacks average shorter than hardbacks.
    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
    const paperbacks = mean(
      entries.filter((entry) => entry.binding === 'paperback').map((entry) => entry.height),
    );
    const hardbacks = mean(
      entries.filter((entry) => entry.binding === 'hardback').map((entry) => entry.height),
    );

    expect(paperbacks).toBeLessThan(hardbacks);
  });
});
