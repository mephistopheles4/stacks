import type { ShelfBook, ShelfRow } from './books.ts';
import { SHELF, rowsForCase } from './case.ts';
import type { Contact } from './contact-shadow.ts';
import { hashUnit } from './hash.ts';

/**
 * Where every book on the shelf ends up — all of the arithmetic, none of the
 * scene graph.
 *
 * This used to be interleaved with `buildBook`, `scene.add` and the click
 * lookup inside one loop, which meant the only way to ask where a book had been
 * put was to render the whole shelf on a GPU. Nothing here imports Three.js, so
 * the cursor advance, the run leans, the clearances, the year gaps and the
 * contact rects can each be asserted in milliseconds instead of inferred from a
 * screenshot and one float.
 *
 * **This does not replace G16.** `smoke:render` measures `Box3.setFromObject`
 * against the case's real inner faces, and it exists precisely because the
 * arithmetic was wrong in a way that re-checking the arithmetic could not catch:
 * the cursor advances by a book's *thickness*, and a book rotated about its
 * centre is wider than that. Everything below can only assert what the
 * placements *claim*; only the render confirms the scene agrees.
 */

/**
 * One book, and where it goes.
 *
 * `contact` and `frontZ` look redundant — `contact.x` equals `position.x` for
 * every book today, and `frontZ` follows from `entry.faceOut`. Keep them. They
 * are what the placement *claims*, which is the thing the tests assert, and
 * "equal today" is exactly the sort of assumption G16 exists because somebody
 * made.
 */
export interface Placement {
  /** The book itself, carried rather than matched up by index afterwards. */
  readonly entry: ShelfBook;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** A face-out book is turned a quarter turn to show its cover. */
  readonly rotationY: number;
  /** The lean. Positive tips the top of the book to the left. */
  readonly rotationZ: number;
  /** Where it meets the plank, for the painted shadow. */
  readonly contact: Contact;
  /** Where its front face sits in its own local space — half its depth. */
  readonly frontZ: number;
}

/**
 * Rows of books in, rows of placements out — one array per row, indexed as
 * `rows` is, top shelf first.
 *
 * Grouped rather than flat because the painted shadow is drawn per plank and
 * reads these bottom-up while placement counts top-down. That flip lives in
 * `scene.ts`, where it always has. Flattening for anything that wants every book
 * costs one `.flat()`.
 *
 * Takes no case geometry: it imports `SHELF` directly, so a test can never
 * assert about a shelf that does not ship. See ADR-0029.
 */
export function placeShelf(rows: readonly ShelfRow[]): Placement[][] {
  const rowCount = rowsForCase(rows.length);

  return rows.map((row, rowIndex) => {
    // Drawn top-down: the newest books sit on the top shelf.
    const shelfY = (rowCount - 1 - rowIndex) * SHELF.rowHeight + SHELF.plankThickness / 2;

    // Books stand *against* the left upright and run right, as a shelf fills.
    //
    // Flush, with no padding: a book that leans left and starts a finger's width
    // clear of the side is leaning on nothing, which is the tell that made the
    // whole row look wrong. The case itself is what the first book rests on.
    let cursor = -SHELF.width / 2;
    let index = 0;

    /**
     * One slump angle per run of touching books.
     *
     * Books in a leaning row are not each at their own angle — they are a stack
     * resting on each other, so they are parallel, and the run as a whole leans
     * on whatever is at its left end. Giving every book its own angle is what
     * produced the wedge-shaped gaps: neighbours a fraction of a degree apart,
     * touching nowhere.
     */
    let runLean = leanFor(rowIndex, index, row.books[0]?.book.id ?? '');
    let startsRun = true;

    /**
     * The lean of whatever is immediately to the left, and how far it swings.
     *
     * The case's own side starts it off: vertical, and swinging not at all.
     */
    let leftLean = 0;
    let leftSway = 0;

    const placements: Placement[] = [];

    for (const entry of row.books) {
      // Depth carries the cover's real aspect on a face-out book, which is
      // turned side-on, and the shelf depth on a shelved one.
      const depth = entry.faceOut ? entry.coverWidth : SHELF.bookDepth;

      const gap = entry.gapBefore ?? 0;
      cursor += gap;

      // A run is broken by a year gap: the book after one has open shelf on its
      // left and nothing to rest against, so it stands up straight and becomes
      // the support for the books after it. A row's first book is not a break —
      // the case's own side holds it.
      if (gap > 0) {
        startsRun = true;
        runLean = leanFor(rowIndex, index, entry.book.id);
      }

      // A face-out book stands square; a shelved one leans unless it opens a run
      // with nothing on its left.
      const lean = entry.faceOut ? 0 : startsRun && index > 0 ? 0 : runLean;
      const sway = swayOf(entry.height, lean);

      // Clearance wherever the angle changes, and only there.
      //
      // Rotating a book about its centre swings its top-left and bottom-right
      // corners out past its own footprint by `sway`. Two neighbours at the same
      // angle stay parallel and never notice, which is why a run packs flush —
      // but where the angle changes, that swing lands inside whatever is beside
      // it. Both reported collisions are this: a leaning book's bottom corner
      // driven into the face-out book on its right, and the first book of a row
      // driven into the case's own side.
      if (lean !== leftLean) cursor += Math.max(sway, leftSway);
      leftLean = lean;
      leftSway = sway;

      if (entry.faceOut) {
        const x = cursor + entry.coverWidth * 0.5;
        const z = (SHELF.depth - entry.coverWidth) / 2 - 0.02;

        placements.push({
          entry,
          // Turned to show its cover, leaning back against the books beside it.
          //
          // -90°, not +90°: the cover is the +X face, and rotating +90° about Y
          // maps +X to -Z — pointing away from the room. Face-out books were
          // showing the viewer their back boards.
          rotationY: -Math.PI / 2,
          rotationZ: 0.06,
          position: { x, y: shelfY + entry.height / 2, z },
          // A face-out book has been turned a quarter turn, so what it puts on
          // the plank is `coverWidth` across and only its own `thickness` deep —
          // the same slab as any other book, seen end-on. Taking the cover's
          // width for *both* painted a shadow the size of the cover flat on the
          // wood, which reached most of the way to the front edge of the shelf:
          // a dark smudge standing in front of a book, thrown by a light that is
          // in front of it.
          contact: { x, width: entry.coverWidth, z, depth: entry.thickness },
          frontZ: depth / 2,
        });

        cursor += entry.coverWidth + SHELF.bookGap * 2;
        // A face-out book is broad and flat on the shelf, so it is a support in
        // its own right — whatever follows it may lean on it.
        startsRun = false;
      } else {
        startsRun = false;

        const x = cursor + entry.thickness / 2;
        const z = (SHELF.depth - SHELF.bookDepth) / 2 - 0.02;

        placements.push({
          entry,
          rotationY: 0,
          rotationZ: lean,
          position: {
            x,
            // Rotating about the centre would sink the low corner into the plank.
            y: shelfY + entry.height / 2 + (entry.thickness / 2) * Math.sin(Math.abs(lean)),
            z,
          },
          contact: { x, width: entry.thickness, z, depth: SHELF.bookDepth },
          frontZ: depth / 2,
        });

        // Touching, not spaced. Books in a run share an angle, so they stay
        // parallel and their boards meet along the whole height — which is what
        // "resting on each other" has to look like. The hair of clearance is
        // only so two coincident faces do not fight over the same depth.
        cursor += entry.thickness + TOUCHING;
      }
      index += 1;
    }

    return placements;
  });
}

/** Most a book leans, in radians — about 3.5°. Beyond that it looks knocked over. */
export const MAX_LEAN = 0.062;

/**
 * Clearance between books that are meant to be touching.
 *
 * Not zero: two adjacent boards at exactly zero would be coplanar and z-fight
 * along their top edge, where the shelf actually shows them. Small enough that
 * no gap is visible at the scale a spine is drawn.
 */
export const TOUCHING = 0.002;

/**
 * How far a leaning book's corners swing out past its own footprint.
 *
 * Rotating about the centre pushes the top-left corner left and the bottom-right
 * corner right, each by half the height times the sine of the angle — about
 * 0.03, which is a thin book's whole thickness. Neighbours at the same angle
 * stay parallel and never collide; wherever the angle *changes*, this is what
 * has to be reserved.
 */
export function swayOf(height: number, lean: number): number {
  return (height / 2) * Math.sin(Math.abs(lean));
}

/**
 * Whether a book leans where it sits.
 *
 * The cursor's own rule, exported so the packer can read it rather than keep a
 * copy: a face-out book stands square, and so does the book carrying a year gap,
 * which has open shelf on its left and nothing to rest against. Everything else
 * leans with its run.
 *
 * A row's first book is not a gap case — `toRows` only sets `gapBefore` on a
 * book that something precedes, so the first book of a row never carries one and
 * leans against the case's own side.
 */
export function leansInPlace(entry: ShelfBook): boolean {
  return !entry.faceOut && (entry.gapBefore ?? 0) === 0;
}

/**
 * How much shelf a book costs, placed after `previous`.
 *
 * **The packer charges this and the cursor spends it**, which is the whole of
 * G25. They were different sums for as long as both existed: `toRows` charged
 * one `bookGap` a book against the cursor's `TOUCHING` or `bookGap * 2`, which
 * came to 0.162 across a twenty-seven book row, and budgeted nothing at all for
 * the clearance a change of angle costs.
 *
 * `previous` is `undefined` for the first book of a row, where the case's own
 * side stands in — vertical, and swinging not at all.
 *
 * **It is an upper bound, not the exact spend.** The swing is charged at
 * `MAX_LEAN` because the real lean comes from `leanFor`, which needs the row
 * index, which is not known until the wrap this figure decides has happened. So
 * the packer is conservative by at most one maximal swing per angle change —
 * named and pinned by G25 rather than left to be discovered.
 */
export function shelfCost(entry: ShelfBook, previous: ShelfBook | undefined): number {
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

  return (entry.gapBefore ?? 0) + occupies + clearance;
}

/**
 * How far a shelved book leans to the left.
 *
 * The obvious version — an independent random angle per book — looks wrong and
 * renders worse: neighbours touch, so two books tilted opposite ways intersect.
 * Real shelves do not do that either. Books lean in *groups*, sharing a slump
 * until something upright interrupts it.
 *
 * So the angle is a slow wave along the row, which keeps adjacent books within
 * a fraction of a degree of each other, plus a little per-book jitter to stop
 * the wave reading as machinery. Both are derived from the row and the book id,
 * so a shelf looks the same on every rebuild.
 */
export function leanFor(rowIndex: number, position: number, id: string): number {
  const wave = Math.sin(position * 0.62 + rowIndex * 2.3);
  const jitter = hashUnit(id) - 0.5;
  // Biased positive: +Z rotation tips the top of the book to the left.
  const lean = 0.55 + wave * 0.38 + jitter * 0.14;
  return Math.max(0, Math.min(1, lean)) * MAX_LEAN;
}
