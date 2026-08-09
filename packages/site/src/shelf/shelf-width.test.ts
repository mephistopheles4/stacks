import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import {
  MAX_HEIGHT,
  MIN_HEIGHT,
  toRows,
  YEAR_GAP,
  yearOf,
  type ShelfBook,
  type ShelfRow,
} from './books.ts';
import { SHELF, USABLE_WIDTH } from './case.ts';
import {
  leansInPlace,
  MAX_LEAN,
  MAX_PROP_LEAN,
  parallelPushOf,
  placeShelf,
  propsAcrossGap,
  propShiftOf,
  rowExtent,
  runsParallel,
  swayOf,
  TOUCHING,
  type Placement,
} from './placement.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

/**
 * Packed at the shipped binding mixture, which is the shelf a visitor gets.
 *
 * The mixture reaches this file rather than only `books.test.ts` because it moves
 * each book's height band, and a face-out book's footprint is its cover width —
 * so binding is upstream of every width this file is about.
 */
function rowsOf(books: readonly LibraryBook[]): ShelfRow[] {
  return toRows(books, DEFAULT_SETTINGS.books);
}

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
 * What held them together was one inequality:
 *
 * ```
 * right edge = -W/2 + spent  ≤  -W/2 + charged  ≤  -W/2 + USABLE_WIDTH
 * ```
 *
 * **The middle term is gone from the shelf and lives here now.** ADR-0042:
 * `toRows` runs the cursor instead of estimating it, so there is no charge left
 * to agree with a spend — the packer's capacity and the placer's consumption are
 * the same number by construction rather than by assertion. What that costs is
 * this file's job: the model that used to be `shelfCost` stays, as a bound the
 * cursor is held to, because a capacity restated in terms of the cursor would be
 * the cursor marking its own work.
 *
 * So the chain is now
 *
 * ```
 * right edge = -W/2 + spent  ≤  -W/2 + USABLE_WIDTH,   spent ≤ modelled
 * ```
 *
 * — containment asserted directly against the band, and the model kept as the
 * independent ceiling on what the cursor may spend to get there. A third group
 * asks the question the first two cannot: not "is the row within the shelf" but
 * "did the row leave room a book could have used", which is the defect ADR-0042
 * is about and the sharpest mutation detector here.
 *
 * **G16 is still the backstop.** Everything here asserts what
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

/**
 * What a row may cost, from the geometry — the model the cursor is held to.
 *
 * ⚠️ **This used to be `shelfCost` in `placement.ts`, and it used to be the
 * packer's decision.** It is neither now: `toRows` runs the cursor itself
 * (ADR-0042), so nothing in `packages/site/src` charges anything.
 *
 * It moved here rather than being deleted with the estimate, and the reason is
 * the direction of the inequality. Deleting it would have left nothing bounding
 * what the *cursor* spends against numbers the cursor cannot move — and the
 * obvious replacement, restating capacity in terms of `rowExtent`, is a gate
 * comparing the code under test against itself. That is `docs/gates.md`'s oldest
 * lesson and the reason `THICKEST_SPINE` below is a restated literal; this
 * function now sits beside it, as the same kind of thing.
 *
 * `previous` is `undefined` for the first book of a row, where the case's own
 * side stands in — vertical, and swinging not at all.
 *
 * **It is an upper bound, not the exact spend.** The swing is charged at
 * `MAX_LEAN` and the parallel push at `MAX_PROP_LEAN`, and a year gap is charged
 * in full even though a propped book gives `propShiftOf` of it straight back. So
 * it is over by at most one maximal swing per angle change, one maximal prop per
 * gap, and one maximal parallel push a book — which is `clearanceBound`, and
 * which is also this model's detection floor. See the note there.
 *
 * **Being an upper bound is now the only thing it is**, and that is why it could
 * move. As the packer's estimate it decided where rows wrapped, and every unit
 * of slack in it was a unit of shelf left empty — 0.09 to 0.13 a row, measured.
 * As a bound it costs nothing to be loose, so the same conservatism that was a
 * defect upstairs is a virtue down here.
 */
function shelfCost(entry: ShelfBook, previous: ShelfBook | undefined): number {
  // `footprint` is already "how wide is this book, placed"; only the gap after it
  // differs, and it differs because a face-out book is a broad flat thing that
  // needs air either side while a run of spines is meant to touch.
  const occupies = entry.footprint + (entry.faceOut ? SHELF.bookGap * 2 : TOUCHING);

  // Clearance wherever the angle changes, and only there — the cursor's rule,
  // with the actual lean replaced by the steepest one allowed.
  const leans = leansInPlace(entry);
  const leftLeans = previous !== undefined && leansInPlace(previous);
  const clearance =
    leans === leftLeans
      ? 0
      : Math.max(
          leans ? swayOf(entry.height, MAX_LEAN) : 0,
          previous !== undefined && leftLeans ? swayOf(previous.height, MAX_LEAN) : 0,
        );

  // And where it does *not* change, the parallel push — which the cursor also
  // spends and which nothing charged for as long as "a run packs flush" was
  // believed. Priced at `MAX_PROP_LEAN` and with each term taken at its worst
  // sign, because the real angle is not known here and this only has to be no
  // smaller than the real one.
  //
  // Not across a gap: the cursor pays a *prop shift* there and no push at all, so
  // charging both would be charging the same transition twice. `runsParallel` is
  // the cursor's own branch condition rather than a restatement of it.
  const parallel =
    runsParallel(entry, previous) && previous !== undefined
      ? parallelPushOf(entry, {
          height: previous.height,
          thickness: previous.thickness,
          lean: MAX_PROP_LEAN,
          sway: 0,
          right: 0,
          faceOut: false,
        }) + (entry.thickness / 2) * (1 - Math.cos(MAX_PROP_LEAN))
      : 0;

  return (entry.gapBefore ?? 0) + occupies + clearance + Math.max(parallel, 0);
}

/** What the model allows a whole row. The placer is not consulted. */
function charged(row: ShelfRow): number {
  return row.books.reduce((total, entry, index) => total + shelfCost(entry, row.books[index - 1]), 0);
}

/**
 * The band books may occupy, as an absolute X — the left inner face plus the
 * usable width.
 *
 * Restated from `SHELF` and `USABLE_WIDTH` rather than read off `fitsRow`, which
 * is the predicate under test. `toRows` spells the same thing; a gate that
 * imported the packer's spelling of it could not fail on a packer that changed
 * it.
 */
const ROW_END = -SHELF.width / 2 + USABLE_WIDTH;

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
 * Two terms, and both exist because the packer prices a book before it knows the
 * angle that book will end up at:
 *
 * - It charges `swayOf(height, MAX_LEAN)` at an angle change where the cursor
 *   spends `swayOf(height, lean)`, because the actual lean depends on the row
 *   index and the row index is not known until the wrap it feeds has happened.
 * - It charges a year gap in full where the cursor hands `propShiftOf` of it back,
 *   because a propped book's angle depends on the neighbour it lands beside — and
 *   which neighbour that is, is the very thing the wrap decides.
 * - It charges the parallel push at `MAX_PROP_LEAN` where the cursor spends it at
 *   the real angle, for the same reason. This one is charged per *book* rather
 *   than per angle change, because two neighbours at the same angle need it too —
 *   which is what "a run packs flush" got wrong.
 *
 * All three are charged at the steepest permitted angle, so the model is
 * conservative by construction and this is by how much.
 *
 * ⚠️ **It is also this group's detection floor, and that cuts the other way.**
 * The slack it allows is slack a *cursor* over-spend hides in: `charged >=
 * spent` cannot fail until the over-spend exceeds it. Measured, by bisection on
 * `cursor += entry.thickness + TOUCHING + δ`, this group first goes red at
 * **δ = 0.01** — on the shelved branch. The face-out branch is the exception and
 * catches **any** over-spend, because the exactness case below is exact to the
 * bit: δ = 0.0001 there is red.
 *
 * That is a real hole in *this* group, and it is not the shelf's floor, because
 * `leaves a row no slack a book could have used` is thirty times sharper —
 * green at δ = 0.0002, red at **δ = 0.0003**. The two guard different things and
 * the sharper one is not a replacement: it reads `rowExtent` both sides, so it
 * cannot see an over-spend that moves no book between rows. Numbers and method
 * in G25's entry in `docs/gates.md`; do not restate them as "a hair" in either
 * direction without re-running the bisection.
 */
function clearanceBound(row: ShelfRow): number {
  let changes = 0;
  let gaps = 0;
  let pairs = 0;
  // The case's own side is vertical, so a leaning first book is already a change.
  let leftLeans = false;
  let previous: ShelfBook | undefined;
  for (const entry of row.books) {
    const leans = leansInPlace(entry);
    if (leans !== leftLeans) changes += 1;
    if (propsAcrossGap(entry)) gaps += 1;
    if (runsParallel(entry, previous)) pairs += 1;
    leftLeans = leans;
    previous = entry;
  }
  return (
    changes * swayOf(MAX_HEIGHT, MAX_LEAN) +
    gaps * propShiftOf(THICKEST_SPINE, MAX_HEIGHT, MAX_PROP_LEAN) +
    pairs * WORST_PARALLEL_PUSH
  );
}

/**
 * The thickest spine `books.ts` will build, from its 800-page ceiling.
 *
 * Not exported from there, and restated here rather than plumbed out: this is a
 * *bound*, so it only has to be no smaller than the real one, and a test that
 * imports the number it is bounding proves less than one that does not.
 */
const THICKEST_SPINE = 0.16;

/**
 * The most one parallel pair can be over-charged, re-derived here rather than
 * read off `parallelPushOf`.
 *
 * That distinction is the whole point and it was got wrong once: the first
 * version of this line *called* the function it was bounding, with the same
 * arguments and the same trailing term, so that part of the assertion could not
 * fail for any value of the charge — the defendant sitting as judge, which is
 * `docs/gates.md`'s own oldest lesson about gates and the reason `THICKEST_SPINE`
 * above is a restated literal.
 *
 * Derived instead from what the geometry can *possibly* cost, at the steepest
 * angle any book is allowed and against the thickest and tallest the shelf
 * builds. The current book's thickness does not appear because it cancels — the
 * push takes half of it off and the charge's trailing term puts the same half
 * back — and a bound that does not know that is still a bound.
 *
 * - `t · (sec θ − 1)` — a board `t` thick square to itself is wider along the row.
 * - `(t / 2) · (1 − cos θ)` — half of it foreshortening.
 * - `(MAX_HEIGHT − MIN_HEIGHT) / 2 · sin θ` — the height term, and the big one:
 *   two bases swung apart by the difference in how tall their books are.
 */
const WORST_PARALLEL_PUSH =
  THICKEST_SPINE * (1 / Math.cos(MAX_PROP_LEAN) - 1) +
  (THICKEST_SPINE / 2) * (1 - Math.cos(MAX_PROP_LEAN)) +
  ((MAX_HEIGHT - MIN_HEIGHT) / 2) * Math.sin(MAX_PROP_LEAN);

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

describe('the cursor spends no more than the geometry allows', () => {
  it.each(CASES)('never spends more than the model allows — %s', (_name, library) => {
    const rows = rowsOf(library);
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
    const rows = rowsOf(library);
    const placed = placeShelf(rows);

    rows.forEach((row, index) => {
      const excess = charged(row) - spent(placed[index] ?? []);
      expect(excess).toBeLessThanOrEqual(clearanceBound(row) + 1e-12);
    });
  });

  it('is exact on a row that changes angle nowhere', () => {
    // One face-out book alone: it stands square, the case side is vertical, so
    // no angle changes anywhere and the two numbers must agree to the bit.
    const rows = rowsOf([book('solo', { faceOut: true })]);
    const [row] = rows;
    const [placements] = placeShelf(rows);
    if (row === undefined || placements === undefined) throw new Error('no row');

    expect(clearanceBound(row)).toBe(0);
    expect(charged(row)).toBeCloseTo(spent(placements), 12);
  });
});

describe('the packer honours its own capacity', () => {
  it.each(CASES)('packs no row past the band — %s', (_name, library) => {
    const rows = rowsOf(library);

    // Every row, single-book ones included. The old version exempted them, on
    // the reasoning that a row is only wrapped when it already holds something
    // and so one book must be allowed however wide it is. That is still why a
    // single book is never *turned away* — but it is not a reason to stop
    // looking at where it ends, and the widest thing the shelf builds is a
    // face-out cover at 0.65 of MAX_HEIGHT, comfortably inside the band. An
    // exemption is a place a defect can sit.
    rows.forEach((row, index) => {
      expect(rowExtent(row.books, index)).toBeLessThanOrEqual(ROW_END + 1e-12);
    });
  });

  it.each(CASES)('packs every row tight — one more book would not have fitted — %s', (_name, library) => {
    const rows = rowsOf(library);

    if (rows.length === 1) {
      // Said rather than skipped. A single-row library has no wrap to check, and
      // a loop that silently never runs reports the same green as one that did.
      expect(library.length).toBe(1);
      return;
    }

    let checked = 0;
    for (let index = 0; index < rows.length - 1; index += 1) {
      const row = rows[index];
      const next = rows[index + 1]?.books[0];
      if (row === undefined || next === undefined) continue;

      const last = row.books[row.books.length - 1];
      if (last === undefined) continue;

      // The book the packer turned away, placed as it *would* have been placed
      // had it stayed — on the end of the previous row, carrying the year gap
      // that row would have opened for it.
      //
      // Both halves of that were got wrong once. Taking the candidate *without*
      // its year gap asserts something stronger than the packer promises: the
      // book `toRows` turned away was carrying YEAR_GAP and the clearance an
      // upright book pays, and the same book at the head of the next row carries
      // neither. It passed by 0.02 where the guarantee allows 0.09, so a slightly
      // thinner book turned a correct packer red.
      //
      // And re-running `toRows` on the row plus one more book makes the assertion
      // vacuous: the same function that made the decision cannot be the judge of
      // it. That version passed with the packer mutated to wrap at nine tenths of
      // the shelf. So this places the trial row itself, against a band restated
      // from `SHELF` — which is what `ROW_END` is for.
      const isYearChange = yearOf(next.book) !== yearOf(last.book);
      const rejected = isYearChange ? { ...next, gapBefore: YEAR_GAP } : next;
      expect(rowExtent([...row.books, rejected], index)).toBeGreaterThan(ROW_END);
      checked += 1;
    }
    expect(checked).toBe(rows.length - 1);
  });

  it.each(CASES)('leaves a row no slack a book could have used — %s', (_name, library) => {
    // The defect ADR-0042 is about, stated as the shelf sees it rather than as
    // the packer does.
    //
    // The two assertions above are about the *decision*: given what the packer
    // chose, is each row full. This one is about the *outcome* — the wood left at
    // the end of a row, against the real footprint of the book that would have
    // gone there. It is the assertion that would have been red before ADR-0042,
    // where the shelf left 0.170 of room and turned away a book needing 0.163.
    const rows = rowsOf(library);

    let checked = 0;
    for (let index = 0; index < rows.length - 1; index += 1) {
      const row = rows[index];
      const next = rows[index + 1]?.books[0];
      const last = row?.books[row.books.length - 1];
      if (row === undefined || next === undefined || last === undefined) continue;

      const room = ROW_END - rowExtent(row.books, index);
      const gap = yearOf(next.book) !== yearOf(last.book) ? YEAR_GAP : 0;
      // What the next book needs at an absolute minimum: its own footprint, the
      // gap the row would have opened for it, and the hair a run's boards leave
      // between them. Every clearance it might additionally pay is left out, so
      // this is a floor — a book needing less than the room left is unambiguously
      // one the row could have taken.
      const floor = gap + next.footprint + (next.faceOut ? SHELF.bookGap * 2 : TOUCHING);
      expect(room).toBeLessThan(floor);
      checked += 1;
    }
    expect(checked).toBe(rows.length - 1);
  });
});

describe('where a row starts and where it stops', () => {
  it.each(CASES)('starts flush against the left upright — %s', (_name, library) => {
    const placed = placeShelf(rowsOf(library));

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
    const placed = placeShelf(rowsOf(library));

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
    //
    // ⚠️ **`MAX_PROP_LEAN`, not `MAX_LEAN`.** This line named the wrong constant
    // for as long as there have been propped books, and stayed green the whole
    // time: `MAX_LEAN` is the steepest a book slumps *of its own accord*, and a
    // book propped across a year gap leans four times further than that. A run
    // inherits the prop angle, so the last book of a row can carry it. The gate
    // was checking a reserve against a limit that no longer bounded anything.
    expect(SHELF.endReserve).toBeGreaterThanOrEqual(swayOf(MAX_HEIGHT, MAX_PROP_LEAN));
    // And named, so the reserve cannot quietly grow to cover a defect instead.
    expect(SHELF.endReserve).toBeLessThan(swayOf(MAX_HEIGHT, MAX_PROP_LEAN) * 1.5);
  });
});
