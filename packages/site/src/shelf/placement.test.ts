import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { toRows, type ShelfRow } from './books.ts';
import { LEAN_ALLOWANCE, SHELF } from './case.ts';
import { placeShelf, swayOf, TOUCHING } from './placement.ts';

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

/** The capacity `scene.ts` passes, so rows wrap where they really wrap. */
const CAPACITY = SHELF.width - SHELF.padding * 2 - LEAN_ALLOWANCE;

function rowsOf(books: readonly LibraryBook[]): ShelfRow[] {
  return toRows(books, CAPACITY, SHELF.bookGap);
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

  it('packs a run flush — no clearance between neighbours at the same angle', () => {
    const [row] = placeShelf(rowsOf([book('a'), book('b'), book('c')]));
    const [first, second] = row ?? [];
    if (first === undefined || second === undefined) throw new Error('row too short');

    // Footprints, not swept extents: neighbours at the same angle stay parallel,
    // so their boards meet along the whole height even though their bounding
    // boxes overlap. That is what "resting on each other" has to look like.
    const gap = footprintOf(second).left - footprintOf(first).right;
    expect(gap).toBeCloseTo(TOUCHING, 10);
  });

  it('stands the book after a year gap up straight, and leans the ones behind it', () => {
    // The book after a gap has open shelf on its left and nothing to rest
    // against, so it becomes the support for the run that follows.
    const [row] = placeShelf(
      rowsOf([
        book('a', { finished: '2025-06-01' }),
        book('b', { finished: '2025-06-02' }),
        book('c', { finished: '2024-06-01' }),
        book('d', { finished: '2024-06-02' }),
      ]),
    );

    const leans = (row ?? []).map((placement) => placement.rotationZ);
    expect(leans.length).toBe(4);
    // The row's first book is *not* a break — the case's own side holds it.
    expect(leans[0]).toBeGreaterThan(0);
    expect(leans[1]).toBe(leans[0]);
    expect(leans[2]).toBe(0);
    expect(leans[3]).toBeGreaterThan(0);
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

    const inner = SHELF.width / 2;
    for (const row of rows) {
      for (const placement of row) {
        const { left, right } = extentOf(placement);
        expect(left).toBeGreaterThanOrEqual(-inner);
        expect(right).toBeLessThanOrEqual(inner);
      }
    }
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
