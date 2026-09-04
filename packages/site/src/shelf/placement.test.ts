import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { toRows, YEAR_GAP, type ShelfRow } from './books.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';
import { SHELF } from './bookcase.ts';
import {
  MAX_LEAN,
  MAX_PROP_LEAN,
  placeShelf,
  runsParallel,
  swayOf,
  TOUCHING,
} from './placement.ts';

/**
 * What `placeShelf` claims, asserted without a GPU.
 *
 * Deliberately **not** a replacement for G16. That gate measures
 * `Box3.setFromObject` against the case's real inner faces on a rendered scene,
 * because the arithmetic was wrong in a way re-checking the arithmetic could not
 * catch. Everything here can only check that the placements say what they mean
 * to say; only `pnpm smoke:render` confirms the scene agrees with them.
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
 * Rows the way the site makes them.
 *
 * This used to rebuild `scene.ts`'s capacity by hand, above a comment claiming
 * that made rows "wrap where they really wrap" — a promise it could not keep,
 * being a fourth copy of a formula that already had three disagreeing versions,
 * sitting in the one place that is supposed to be watching. `toRows` imports the
 * case now, for ADR-0029's reason and by ADR-0031.
 */
function rowsOf(books: readonly LibraryBook[]): ShelfRow[] {
  return toRows(books, DEFAULT_SETTINGS.books);
}

interface Placed {
  readonly position: { readonly x: number };
  readonly rotationZ: number;
  readonly entry: {
    readonly faceOut: boolean;
    readonly thickness: number;
    readonly coverWidth: number;
    readonly height: number;
  };
}

/** The shelf a book eats, ignoring any lean — its **footprint**, placed. */
function footprintOf(placement: Placed): { left: number; right: number } {
  const half =
    (placement.entry.faceOut ? placement.entry.coverWidth : placement.entry.thickness) / 2;
  return { left: placement.position.x - half, right: placement.position.x + half };
}

/**
 * How far a placed book actually reaches along the row, lean included.
 *
 * Derived from the geometry here rather than read off the placement, so a
 * placement cannot pass by agreeing with itself.
 *
 * **A face-out book's tilt does not widen it along the row.** It is turned -90°
 * about Y first, which maps its local Z — the cover's width — onto world X; the
 * 0.06 tilt is about Z, which leaves local Z alone, so the swing lands in world
 * Y and Z instead. Charging it `swayOf` here reports two books of a fifty-book
 * shelf breaking out through the left upright by 0.026, and the scene disagrees:
 * G16 measures the real bounds at 0.0012. A shelved book is the case that does
 * widen, because it is not turned at all.
 */
function extentOf(placement: Placed): { left: number; right: number } {
  const { left, right } = footprintOf(placement);
  if (placement.entry.faceOut) return { left, right };

  // Rotating about the centre: half the thickness foreshortens, half the height
  // swings out. `swayOf` is the second term, which is the one the cursor budgets.
  const half = placement.entry.thickness / 2;
  const swept =
    half * Math.cos(placement.rotationZ) + swayOf(placement.entry.height, placement.rotationZ);
  return { left: placement.position.x - swept, right: placement.position.x + swept };
}

/**
 * A book's four corners in the plane of the row, as `{ x, y }` with `y` measured
 * up from the plank.
 *
 * Rebuilt from `position` and `rotationZ` rather than read off anything the
 * placer exports, so a placement cannot pass by agreeing with itself. A face-out
 * book is a vertical slab `coverWidth` across: its 0.06 tilt is about Z *after*
 * the quarter turn about Y, so it swings in Y and Z and never along the row.
 */
function cornersOf(placement: Placed & { readonly position: { readonly y: number } }): {
  left: readonly [{ x: number; y: number }, { x: number; y: number }];
  right: readonly [{ x: number; y: number }, { x: number; y: number }];
} {
  const { faceOut, thickness, coverWidth, height } = placement.entry;
  const cx = placement.position.x;

  if (faceOut) {
    const half = coverWidth / 2;
    return {
      left: [
        { x: cx - half, y: 0 },
        { x: cx - half, y: height },
      ],
      right: [
        { x: cx + half, y: 0 },
        { x: cx + half, y: height },
      ],
    };
  }

  const lean = placement.rotationZ;
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  /**
   * Heights are measured from the plank, and the centre is **not** `height / 2`
   * above it once the book tilts — it is `(h/2)cos θ + (t/2)sin θ`, which is what
   * puts the low corner on the wood.
   *
   * Writing `height / 2` here is wrong by a per-book amount, and the error is
   * invisible in exactly the way that matters: for two parallel books the gap is
   * the same at every height, so a wrong height still reads a plausible-looking
   * gap — off by `(δ_left - δ_right) · tan θ`, which is 0.26mm and which this file
   * spent a while attributing to the placer. The placer was exact to 1e-17.
   */
  const centre = (height / 2) * cos + (thickness / 2) * sin;
  const corner = (dx: number, dy: number) => ({
    x: cx + dx * cos - dy * sin,
    y: dx * sin + dy * cos + centre,
  });
  const half = thickness / 2;
  return {
    left: [corner(-half, -height / 2), corner(-half, height / 2)],
    right: [corner(half, -height / 2), corner(half, height / 2)],
  };
}

/**
 * The narrowest horizontal air between two neighbours, over the heights they
 * share. Negative means one board is inside the other.
 *
 * Both edges are straight lines, so the minimum sits at an end of the shared
 * range — no sampling, and no step size to be wrong about.
 */
function boardGap(
  left: Parameters<typeof cornersOf>[0],
  right: Parameters<typeof cornersOf>[0],
): number {
  const a = cornersOf(left).right;
  const b = cornersOf(right).left;

  const at = (edge: readonly [{ x: number; y: number }, { x: number; y: number }], y: number) => {
    const [low, high] = edge;
    const span = high.y - low.y;
    return span === 0 ? low.x : low.x + ((y - low.y) / span) * (high.x - low.x);
  };

  const from = Math.max(a[0].y, b[0].y);
  const to = Math.min(a[1].y, b[1].y);
  // No shared height at all — one book ends below where the other begins, which
  // no shelf produces, and there is nothing to collide.
  if (to < from) return Number.POSITIVE_INFINITY;

  return Math.min(at(b, from) - at(a, from), at(b, to) - at(a, to));
}

describe('placeShelf', () => {
  it('gives every book in a run the same angle, so they stay parallel', () => {
    // Independent angles per book is what produced the wedge-shaped gaps:
    // neighbours a fraction of a degree apart, touching nowhere.
    const [row] = placeShelf(rowsOf([book('a'), book('b'), book('c'), book('d')]));

    const leans = (row ?? []).map((placement) => placement.rotationZ);
    expect(leans.length).toBe(4);
    expect(new Set(leans).size).toBe(1);
    expect(leans[0]).toBeGreaterThan(0);
  });

  it('packs a run flush — one hair of air between neighbours at the same angle', () => {
    const [row] = placeShelf(rowsOf([book('a'), book('b'), book('c')]));
    const [first, second] = row ?? [];
    if (first === undefined || second === undefined) throw new Error('row too short');

    /**
     * **Boards, not footprints**, and this test asserted the footprint gap for as
     * long as the placer got it wrong the same way.
     *
     * Two parallel books do not have the gap their footprints say they have: each
     * one's base is swung `sway` off its own footprint, and `sway` is half its
     * *height* times the angle, so two neighbours of different heights are not
     * where the cursor's arithmetic puts them. Asserting the footprint gap passed
     * against a placer that had a book 2.3mm inside its neighbour, and it passed
     * because the fixture here is three books of the *same* height, where the
     * error is identically zero.
     */
    expect(first.entry.height).not.toBe(second.entry.height);
    expect(boardGap(first, second)).toBeCloseTo(TOUCHING, 10);
  });

  it('props the book after a year gap against its neighbour, and the run behind it follows', () => {
    // The book after a gap has open shelf on its left — and something to rest
    // against a gap away, which is what it does. It used to stand bolt upright
    // here, which is the one thing a book with 9cm of air beside it does not do.
    const [row] = placeShelf(
      rowsOf([
        book('a', { finished: '2025-06-01' }),
        book('b', { finished: '2025-06-02' }),
        book('c', { finished: '2024-06-01' }),
        book('d', { finished: '2024-06-02' }),
      ]),
    );

    const placed = row ?? [];
    const leans = placed.map((placement) => placement.rotationZ);
    expect(leans.length).toBe(4);
    // The row's first book is *not* a break — the case's own side holds it.
    expect(leans[0]).toBeGreaterThan(0);
    expect(leans[1]).toBe(leans[0]);
    // Steeper than the ordinary slump, because it has a gap to cross, and never
    // past the ceiling that stops two gaps in a row compounding into a collapse.
    expect(leans[2]).toBeGreaterThan(MAX_LEAN);
    expect(leans[2]).toBeLessThanOrEqual(MAX_PROP_LEAN);
    // The run behind it inherits that angle rather than springing back to the
    // slump — parallel, or the gap it closed reopens one book to the right.
    expect(leans[3]).toBe(leans[2]);
  });

  it('leans the propped book onto its neighbour, top corner touching, wedge at the plank', () => {
    // The whole point, stated as geometry: the gap does not shrink, it *tilts*.
    // Closing it at the top by moving the book left would only have moved it, and
    // rotating about the centre would have doubled it at the bottom.
    const gapped = [book('a', { finished: '2025-06-01' }), book('b', { finished: '2024-06-01' })];
    const [row] = placeShelf(rowsOf(gapped));
    const [left, propped] = row ?? [];
    if (left === undefined || propped === undefined) throw new Error('row too short');

    expect(propped.entry.gapBefore).toBe(YEAR_GAP);

    const lean = propped.rotationZ;
    const half = propped.entry.thickness / 2;
    // The two corners of the propped book's left board, in world x.
    const base = propped.position.x - half * Math.cos(lean) + swayOf(propped.entry.height, lean);
    const top = propped.position.x - half * Math.cos(lean) - swayOf(propped.entry.height, lean);

    const opening = YEAR_GAP + TOUCHING;

    // Its foot has not moved: the gap it was given is still there, on the wood.
    // This is the assertion that separates a prop from a shove — closing the gap
    // by sliding the book left would satisfy every other line here.
    expect(base - footprintOf(left).right).toBeCloseTo(opening, 10);

    // Its head has crossed the whole of it, and then some: the neighbour leans
    // too, so its board has sloped away and the reach has to include that.
    expect(base - top).toBeGreaterThanOrEqual(opening);
    expect(top).toBeLessThanOrEqual(footprintOf(left).right);
    // Not a runaway, though — the extra is the neighbour's own slope over the
    // height of the contact, not a second gap's worth.
    expect(base - top).toBeLessThan(opening * 2);
  });

  it('reserves clearance where the angle changes, and only there', () => {
    // A face-out book stands square between two leaning ones, so the angle
    // changes twice and each change has to pay for the swing.
    //
    // `face_out` rather than `reading`, and all three in one year: a book you are
    // reading gets its own year, so it always arrives behind a year gap — which
    // stands its neighbour straight and leaves no angle change here to measure.
    const [row] = placeShelf(
      rowsOf([
        book('a', { finished: '2025-06-03' }),
        book('b', { finished: '2025-06-02', faceOut: true }),
        book('c', { finished: '2025-06-01' }),
      ]),
    );
    const [leaning, square, after] = row ?? [];
    if (leaning === undefined || square === undefined || after === undefined) {
      throw new Error('row too short');
    }

    // The face-out book carries a fixed 0.06 lean-*back* against its neighbours,
    // which is not a lean along the row: it is turned a quarter turn first, so
    // that tilt swings it in Y and Z. As far as clearance goes it stands square.
    expect(square.entry.faceOut).toBe(true);
    expect(square.rotationZ).toBe(0.06);
    expect(leaning.entry.faceOut).toBe(false);
    expect(leaning.rotationZ).toBeGreaterThan(0);

    // The face-out book is pushed right by the *leaning* book's swing, on top of
    // the hair of clearance every neighbour gets. Asserting merely that the two
    // do not overlap is not enough — deleting the clearance entirely leaves them
    // not overlapping, so the assertion has to name the amount.
    const swing = swayOf(leaning.entry.height, leaning.rotationZ);
    const opened = footprintOf(square).left - footprintOf(leaning).right;
    expect(opened).toBeCloseTo(TOUCHING + swing, 10);
    expect(swing).toBeGreaterThan(0);

    // ...and the book after it, back at an angle, pays for its own swing.
    expect(after.rotationZ).toBeGreaterThan(0);
    const behind = footprintOf(after).left - footprintOf(square).right;
    expect(behind).toBeGreaterThan(SHELF.bookGap * 2);
  });

  it('gives a face-out book a contact as wide as its cover and as deep as itself', () => {
    // Taking the cover's width for *both* painted a shadow the size of the cover
    // flat on the wood — a smudge in front of a book, thrown by a light that is
    // in front of it.
    const [row] = placeShelf(rowsOf([book('a', { status: 'reading', finished: undefined })]));
    const [placement] = row ?? [];
    if (placement === undefined) throw new Error('no placement');

    expect(placement.entry.faceOut).toBe(true);
    expect(placement.contact.width).toBe(placement.entry.coverWidth);
    expect(placement.contact.depth).toBe(placement.entry.thickness);
    expect(placement.contact.depth).not.toBe(placement.entry.coverWidth);
  });

  it('gives a shelved book a contact as wide as its spine, on the shelf depth', () => {
    const [row] = placeShelf(rowsOf([book('a')]));
    const [placement] = row ?? [];
    if (placement === undefined) throw new Error('no placement');

    expect(placement.contact.width).toBe(placement.entry.thickness);
    expect(placement.contact.depth).toBe(SHELF.bookDepth);
  });

  it('keeps every book of a fifty-book shelf inside the case, leans included', () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      book(`book-${String(index)}`, {
        pages: 120 + ((index * 37) % 680),
        finished: `202${String(index % 5)}-0${String((index % 9) + 1)}-01`,
        ...(index % 7 === 0 ? { status: 'reading', finished: undefined } : {}),
      }),
    );

    const rows = placeShelf(rowsOf(many));
    expect(rows.flat().length).toBe(50);
    expect(rows.length).toBeGreaterThan(1);

    /**
     * A double's worth of slack, matching `shelf-width.test.ts`.
     *
     * The first book of a row is placed at `-width / 2 + swing` and its extent is
     * that same swing taken off again, so the left edge is a number that has been
     * through two floating-point operations to land back on an exact bound. It
     * lands on `-1.7000000000000002` for some heights and on `-1.7` for others,
     * which is a fact about doubles rather than about the case — 2e-16 of a unit
     * is 5e-14 mm on a shelf 41cm wide. G16 measures the real containment off the
     * rendered scene; this asserts the arithmetic, and has to admit that the
     * arithmetic is inexact.
     */
    const EPSILON = 1e-12;

    const inner = SHELF.width / 2;
    for (const row of rows) {
      for (const placement of row) {
        const { left, right } = extentOf(placement);
        expect(left).toBeGreaterThanOrEqual(-inner - EPSILON);
        expect(right).toBeLessThanOrEqual(inner + EPSILON);
      }
    }
  });

  it('never drives one board through another, anywhere up the height', () => {
    /**
     * The one thing `extentOf` cannot see.
     *
     * Every other width assertion here works in *footprints* — the untilted slab
     * a book would occupy — because that is what the cursor budgets in. Two
     * neighbours can have disjoint footprints and still intersect, and two
     * neighbours can have overlapping footprints and not, which is the whole
     * reason a run packs flush. So the only honest test of "do these two books
     * collide" is the one that walks the actual boards.
     *
     * It caught what the arithmetic and the render gate both missed: the propped
     * lean measured its reach to the neighbour's *footprint* rather than to the
     * neighbour's corners, and over-leaned by 8–18mm. G16 says nothing about it —
     * it measures the case's inner faces, and two books can intersect each other
     * happily inside those.
     */
    const many = Array.from({ length: 90 }, (_, index) =>
      book(`book-${String(index)}`, {
        pages: 120 + ((index * 53) % 680),
        // Dense year changes, so propped books land beside every kind of
        // neighbour: leaning, face-out, taller, shorter, and propped themselves.
        finished: `20${String(10 + (index % 17))}-0${String((index % 9) + 1)}-01`,
        ...(index % 6 === 0 ? { faceOut: true } : {}),
      }),
    );

    const rows = placeShelf(rowsOf(many));
    expect(rows.flat().length).toBe(90);

    let checked = 0;
    let parallelPairs = 0;
    for (const row of rows) {
      for (let i = 1; i < row.length; i += 1) {
        const left = row[i - 1];
        const right = row[i];
        if (left === undefined || right === undefined) continue;

        const gap = boardGap(left, right);
        const where = `${String(i - 1)} → ${String(i)} of a row`;
        // Zero, near enough — the same double's-worth of slack the case-bounds
        // check above admits, and for the same reason. Not a tolerance for being
        // approximately right: a propped book is *meant* to land on its
        // neighbour and stops `TOUCHING` short of doing so, and every other pair
        // clears by at least that.
        expect(gap, where).toBeGreaterThanOrEqual(-1e-12);

        /**
         * And **an upper bound**, which the first version of this check did not
         * have — so it pinned the direction that reads as one book inside another
         * and left the mirror direction, which reads as a slot of missing book,
         * entirely free.
         *
         * They are one error with two signs: a tall book followed by a short one
         * closes too much, a short one followed by a tall one opens too much, and
         * `parallelPushOf` is the same correction either way. Clamping it at zero
         * fixed half of an error and called the collision closed. Two spines of
         * one run owe each other `TOUCHING` and nothing else.
         */
        if (runsParallel(right.entry, left.entry)) {
          expect(gap, where).toBeCloseTo(TOUCHING, 10);
          parallelPairs += 1;
        }
        checked += 1;
      }
    }
    // A loop that silently never ran reports the same green as one that did.
    expect(checked).toBeGreaterThan(60);
    expect(parallelPairs).toBeGreaterThan(10);
  });

  it('paints a leaning book its shadow under its foot, which is not under its middle', () => {
    // `contact` was asserted for width and depth and never for *where*, so the
    // shadow tracked `position.x` — the book's middle — while the foot it is
    // supposed to be under swings `sway` off it. Worth 2cm at an ordinary slump
    // and 5cm on a propped book, which is half a spine of daylight between a book
    // and its own shadow.
    const [row] = placeShelf(rowsOf([book('a'), book('b'), book('c')]));
    const [placement] = row ?? [];
    if (placement === undefined) throw new Error('no placement');

    expect(placement.rotationZ).toBeGreaterThan(0);
    const foot = swayOf(placement.entry.height, placement.rotationZ);
    expect(foot).toBeGreaterThan(0.01);
    expect(placement.contact.x).toBeCloseTo(placement.position.x + foot, 12);
  });

  it('places the same library the same way every time', () => {
    // A shelf that reshuffled its silhouette on rebuild would be a different
    // piece of furniture every deploy.
    const books = [book('a'), book('b'), book('c', { status: 'reading', finished: undefined })];
    expect(placeShelf(rowsOf(books))).toEqual(placeShelf(rowsOf(books)));
  });

  it('draws top-down: the newest books sit on the top shelf', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      book(`book-${String(index)}`, { finished: `2025-01-0${String((index % 9) + 1)}` }),
    );

    const rows = placeShelf(rowsOf(many));
    expect(rows.length).toBeGreaterThan(1);

    const heights = rows.map((row) => row[0]?.position.y ?? 0);
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeLessThan(heights[i - 1] ?? 0);
    }
  });
});
