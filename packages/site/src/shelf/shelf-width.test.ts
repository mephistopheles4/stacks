import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { MAX_HEIGHT, toRows, type ShelfRow } from './books.ts';
import { SHELF, USABLE_WIDTH } from './case.ts';
import {
  leansInPlace,
  MAX_LEAN,
  placeShelf,
  shelfCost,
  swayOf,
  TOUCHING,
  type Placement,
} from './placement.ts';

/**
 * G25 — the packer's capacity and the placer's consumption are the same number.
 *
 * There were three live answers to "how wide is a shelf" and nothing compared
 * them: `toRows` packed into `width - padding * 2 - LEAN_ALLOWANCE`, the cursor
 * ran flush from `-width / 2`, and `leanThatFits` measured slack against the full
 * width. Two more were found while settling it — the packer charged 0.008 a book
 * where the cursor spends 0.002 or 0.016, which came to 0.162 across a
 * twenty-seven book row, and `leanThatFits` counted angle changes by `faceOut`
 * alone, blind to the upright book after a year gap that the cursor pays
 * clearance for.
 *
 * What holds them together now is one inequality:
 *
 * ```
 * right edge = -W/2 + spent  ≤  -W/2 + charged  ≤  -W/2 + USABLE_WIDTH
 * ```
 *
 * The left is this file's first group, the right is its second, and containment
 * is what falls out. **G16 is still the backstop.** Everything here asserts what
 * the placements claim; only `pnpm smoke:render` confirms the scene agrees, and
 * it exists because the arithmetic was once wrong in a way that re-checking the
 * arithmetic could not catch.
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

/**
 * Libraries chosen for the shapes that cost clearance, not for size.
 *
 * A row's charge and its consumption only diverge where the angle changes, so a
 * fixture of plain shelved books in one year exercises exactly one change — the
 * first book against the case's own side — and would pass against almost any
 * arithmetic.
 */
const LIBRARIES: Record<string, LibraryBook[]> = {
  /** Long enough to wrap several times; a fifth of them face-out. */
  mixed: Array.from({ length: 120 }, (_, index) =>
    book(`book-${String(index)}`, {
      pages: 120 + ((index * 37) % 680),
      finished: `202${String(index % 5)}-0${String((index % 9) + 1)}-01`,
      ...(index % 5 === 0 ? { faceOut: true } : {}),
    }),
  ),
  /** Every book its own year, so every book but the row's first carries a gap. */
  everyYearChanges: Array.from({ length: 60 }, (_, index) =>
    book(`year-${String(index)}`, { finished: `${String(2025 - index)}-06-01` }),
  ),
  /** Alternating, which is the worst case for angle changes. */
  alternating: Array.from({ length: 80 }, (_, index) =>
    book(`alt-${String(index)}`, {
      pages: index % 2 === 0 ? 800 : 120,
      ...(index % 2 === 0 ? { faceOut: true } : {}),
    }),
  ),
  /** Thick books only, so rows wrap on few books and land close to capacity. */
  thick: Array.from({ length: 40 }, (_, index) =>
    book(`thick-${String(index)}`, { pages: 800 }),
  ),
  /** A single book, and a single row. */
  one: [book('only')],
};

/** What the packer charged for a row. The placer is not consulted. */
function charged(row: ShelfRow): number {
  return row.books.reduce((total, entry, index) => total + shelfCost(entry, row.books[index - 1]), 0);
}

/**
 * What the cursor actually spent, read back off the placements.
 *
 * The cursor ends one trailing gap past the last book's right face — `TOUCHING`
 * for a shelved book, `bookGap * 2` for a face-out one — and started at
 * `-SHELF.width / 2`.
 */
function spent(placements: readonly Placement[]): number {
  const last = placements[placements.length - 1];
  if (last === undefined) return 0;
  const half = (last.entry.faceOut ? last.entry.coverWidth : last.entry.thickness) / 2;
  const trailing = last.entry.faceOut ? SHELF.bookGap * 2 : TOUCHING;
  return last.position.x + half + trailing + SHELF.width / 2;
}

/**
 * The most the packer can be over, by its own model.
 *
 * It charges `swayOf(height, MAX_LEAN)` where the cursor spends `swayOf(height,
 * lean)`, because the actual lean depends on the row index and the row index is
 * not known until the wrap it feeds has happened. So the packer is conservative
 * by construction, and this is by how much.
 */
function clearanceBound(row: ShelfRow): number {
  let changes = 0;
  // The case's own side is vertical, so a leaning first book is already a change.
  let leftLeans = false;
  for (const entry of row.books) {
    const leans = leansInPlace(entry);
    if (leans !== leftLeans) changes += 1;
    leftLeans = leans;
  }
  return changes * swayOf(MAX_HEIGHT, MAX_LEAN);
}

/** The left face of a book, ignoring its lean. */
function footprintLeft(placement: Placement): number {
  const half = (placement.entry.faceOut ? placement.entry.coverWidth : placement.entry.thickness) / 2;
  return placement.position.x - half;
}

/** The right face of a book, ignoring its lean. */
function footprintRight(placement: Placement): number {
  const half = (placement.entry.faceOut ? placement.entry.coverWidth : placement.entry.thickness) / 2;
  return placement.position.x + half;
}

const CASES = Object.entries(LIBRARIES);

describe('the packer charges what the placer spends', () => {
  it.each(CASES)('never spends more than it charged — %s', (_name, library) => {
    const rows = toRows(library);
    const placed = placeShelf(rows);
    expect(rows.length).toBeGreaterThan(0);

    rows.forEach((row, index) => {
      const placements = placed[index] ?? [];
      expect(placements.length).toBe(row.books.length);
      expect(charged(row)).toBeGreaterThanOrEqual(spent(placements) - 1e-12);
    });
  });

  it.each(CASES)('is over by no more than one maximal swing per angle change — %s', (_name, library) => {
    // Without a ceiling the first assertion passes on a packer that charges the
    // whole shelf for every book. The excess has to be *named*, not merely
    // non-negative.
    const rows = toRows(library);
    const placed = placeShelf(rows);

    rows.forEach((row, index) => {
      const excess = charged(row) - spent(placed[index] ?? []);
      expect(excess).toBeLessThanOrEqual(clearanceBound(row) + 1e-12);
    });
  });

  it('is exact on a row that changes angle nowhere', () => {
    // One face-out book alone: it stands square, the case side is vertical, so
    // no angle changes anywhere and the two numbers must agree to the bit.
    const rows = toRows([book('solo', { faceOut: true })]);
    const [row] = rows;
    const [placements] = placeShelf(rows);
    if (row === undefined || placements === undefined) throw new Error('no row');

    expect(clearanceBound(row)).toBe(0);
    expect(charged(row)).toBeCloseTo(spent(placements), 12);
  });
});

describe('the packer honours its own capacity', () => {
  it.each(CASES)('packs no row past USABLE_WIDTH — %s', (_name, library) => {
    const rows = toRows(library);

    for (const row of rows) {
      // One book always fits, however wide: a row is only wrapped when it
      // already holds something.
      if (row.books.length > 1) expect(charged(row)).toBeLessThanOrEqual(USABLE_WIDTH);
    }
  });

  it.each(CASES)('packs every row tight — one more book would not have fitted — %s', (_name, library) => {
    const rows = toRows(library);

    for (let index = 0; index < rows.length - 1; index += 1) {
      const row = rows[index];
      const next = rows[index + 1]?.books[0];
      if (row === undefined || next === undefined) continue;
      // The next row's first book carries no gap; appended here it might gain
      // one, which only makes it wider. So if the ungapped version already does
      // not fit, neither does the real one.
      const wouldBe = charged(row) + shelfCost(next, row.books[row.books.length - 1]);
      expect(wouldBe).toBeGreaterThan(USABLE_WIDTH);
    }
  });
});

describe('where a row starts and where it stops', () => {
  it.each(CASES)('starts flush against the left upright — %s', (_name, library) => {
    const placed = placeShelf(toRows(library));

    for (const placements of placed) {
      const first = placements[0];
      if (first === undefined) continue;

      // The cursor starts at -width/2 and the first book immediately pays its own
      // swing, because the case's side is vertical and its lean is not. Flush is
      // therefore the *footprint* landing one sway in, which is what puts the
      // leaning corner on the wood — a book that starts a finger's width clear of
      // the side is leaning on nothing.
      //
      // A face-out book's 0.06 tilt is about Z after a quarter turn about Y, so
      // it swings in Y and Z and not along the row. It sits flat against the side.
      const swing = first.entry.faceOut ? 0 : swayOf(first.entry.height, first.rotationZ);
      expect(footprintLeft(first)).toBeCloseTo(-SHELF.width / 2 + swing, 12);
    }
  });

  it.each(CASES)('never reaches past the reserve at the open end — %s', (_name, library) => {
    const placed = placeShelf(toRows(library));

    for (const placements of placed) {
      const last = placements[placements.length - 1];
      if (last === undefined) continue;
      expect(footprintRight(last)).toBeLessThanOrEqual(SHELF.width / 2 - SHELF.endReserve);
    }
  });

  it('reserves enough at the open end for the last book to lean into', () => {
    // The clearance for a lean is charged to the *left* of the book that leans,
    // where the angle changes. The last book of a row has nothing to its right to
    // charge, so its own swing is paid for by the reserve and by nothing else.
    // Drop `endReserve` below this and the last spine on a full row leans through
    // the upright — the defect LEAN_ALLOWANCE existed to prevent, now folded in.
    expect(SHELF.endReserve).toBeGreaterThanOrEqual(swayOf(MAX_HEIGHT, MAX_LEAN));
  });
});
