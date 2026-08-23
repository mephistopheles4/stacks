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
 * `contact` and `frontZ` look redundant, and `frontZ` still follows from
 * `entry.faceOut`. Keep them. They are what the placement *claims*, which is the
 * thing the tests assert, and "equal today" is exactly the sort of assumption
 * G16 exists because somebody made.
 *
 * `contact.x` is the standing example. It equalled `position.x` for every book
 * for as long as this comment said so — and then books started leaning far
 * enough that a foot is visibly not under a middle, and it stopped, silently and
 * correctly, in the one place a separate field made that possible.
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

  return rows.map((row, rowIndex) =>
    // Drawn top-down: the newest books sit on the top shelf.
    placeRow(
      row.books,
      rowIndex,
      (rowCount - 1 - rowIndex) * SHELF.rowHeight + SHELF.plankThickness / 2,
    ),
  );
}

/**
 * One row's books, placed — the cursor, and nothing that depends on the rows
 * around it.
 *
 * Split out of `placeShelf` because **`toRows` calls it too**. The packer used
 * to price a book with `shelfCost` and wrap on the estimate; it runs this and
 * wraps on the answer, which is the whole of ADR-0042.
 *
 * Everything here is determined by `(books, rowIndex)` alone. No later row is
 * consulted, and `shelfY` feeds `position.y` and nothing else — so a caller that
 * only wants the X arithmetic, which is what the packer wants, may pass 0.
 */
export function placeRow(
  books: readonly ShelfBook[],
  rowIndex: number,
  shelfY: number,
): Placement[] {
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
  let runLean = leanFor(rowIndex, index, books[0]?.book.id ?? '');

  /**
   * Whatever is immediately to the left, as one record.
   *
   * Six separate `left*` locals reassigned in a block is six chances to update
   * five of them, and every one of them is read by the same two decisions.
   *
   * The case's own side starts it off: vertical, swinging not at all, taller
   * than any book, and standing exactly where the cursor does.
   */
  let left: Neighbour = {
    lean: 0,
    sway: 0,
    height: Number.POSITIVE_INFINITY,
    thickness: 0,
    right: cursor,
    faceOut: false,
  };

  const placements: Placement[] = [];

  for (const entry of books) {
    // Depth carries the cover's real aspect on a face-out book, which is
    // turned side-on, and the shelf depth on a shelved one.
    const depth = entry.faceOut ? entry.coverWidth : SHELF.bookDepth;

    const gap = entry.gapBefore ?? 0;
    cursor += gap;

    // A year gap opens a run, and the book that opens it **falls into the gap**
    // rather than standing to attention beside it.
    //
    // It used to stand bolt upright, on the reasoning that it has open shelf on
    // its left and nothing to rest against. The second half of that is what was
    // wrong: there is something to rest against, it is just a gap away, and a
    // book with 9cm of air on one side does not stand square on a real shelf —
    // it topples until it meets its neighbour. So the angle is whatever it
    // takes to reach, and the run behind it inherits that angle the way a run
    // always inherits the lean of whatever holds its left end up.
    //
    // A face-out book is broad and flat and stands square whatever is beside
    // it, so it opens a run at the ordinary slump instead.
    //
    // **A face-out book ends the run behind it, too**, which it did not used to:
    // the slump carried straight through one, so every shelved book between two
    // year gaps shared an angle however many broad flat supports stood between
    // them. That was harmless while every angle came from the same 3.5° wave and
    // is not now — one propped book would hand its 9° to the whole rest of the
    // row, and a shelf where everything past the first gap has fallen over is
    // not what propping one book was meant to buy.
    const props = propsAcrossGap(entry);
    if (props || (left.faceOut && !entry.faceOut)) {
      runLean = props
        ? propLeanFor(cursor - left.right, entry.height, left)
        : leanFor(rowIndex, index, entry.book.id);
    }

    // A face-out book stands square; a shelved one leans with its run.
    const lean = entry.faceOut ? 0 : runLean;
    const sway = swayOf(entry.height, lean);

    if (props) {
      // Propped books pivot on their bottom-left corner, not their centre.
      //
      // Everything else here is placed by its footprint and tilted about its
      // middle, which swings the top-left corner out by `sway` and the
      // bottom-right corner in by the same — symmetric, so closing a gap `g` at
      // the top would need `sin θ = 2g/h` and would open `2g` at the bottom.
      // The gap would not close; it would double and move down.
      //
      // Pinning the base instead is what "leaning on it" means: the top swings
      // the whole gap, the bottom stays where it was, and what is left is a
      // wedge of air at the plank rather than a slab of it at eye level. The
      // render still rotates about the centre, so this is the centre that puts
      // that corner where it belongs.
      cursor -= propShiftOf(entry.thickness, entry.height, lean);
    } else if (lean !== left.lean) {
      // Clearance wherever the angle changes, and only there.
      //
      // Rotating a book about its centre swings its top-left and bottom-right
      // corners out past its own footprint by `sway`. Two neighbours at the
      // same angle stay parallel and never notice, which is why a run packs
      // flush — but where the angle changes, that swing lands inside whatever
      // is beside it. Both reported collisions are this: a leaning book's
      // bottom corner driven into the face-out book on its right, and the first
      // book of a row driven into the case's own side.
      //
      // A propped book pays no clearance because it has already been *given*
      // one, a whole `YEAR_GAP` wide, and the shift above spends exactly the
      // part of it the swing needs.
      cursor += Math.max(sway, left.sway);
    } else {
      // **Parallel is not the same as flush**, which is what "a run packs
      // flush, and neighbours at the same angle never notice" quietly assumed
      // for as long as there were runs.
      //
      // A book tilted about its middle has its base swung right by its own
      // `sway`, and `sway` is half its *height* times the angle — so a tall
      // book's base sits further right than a short one's, at the same angle,
      // from the same footprint. A tall book followed by a short one therefore
      // has its low corner inside its neighbour: 2.3mm on the live shelf, at an
      // ordinary 3.2° slump, and four times that at a propped angle.
      //
      // **Signed, and applied in both directions.** The mirror case is a short
      // book followed by a taller one, which opens 7mm of daylight instead of
      // closing 7mm too much — the same error, and the one that clamping at
      // zero left in place while calling the collision fixed. There is a right
      // answer here and it is not "no worse than before" in one direction.
      cursor += parallelPushOf(entry, left);
    }
    left = {
      lean,
      sway,
      height: entry.height,
      // A face-out book does not tilt along the row, so its thickness never
      // foreshortens and the term it feeds is zero either way.
      thickness: entry.faceOut ? 0 : entry.thickness,
      faceOut: entry.faceOut,
      // Filled in by whichever branch places it — the two disagree about what
      // a book's own width is.
      right: cursor,
    };

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

      left = { ...left, right: cursor + entry.coverWidth };
      cursor += entry.coverWidth + SHELF.bookGap * 2;
    } else {
      const x = cursor + entry.thickness / 2;
      const z = (SHELF.depth - SHELF.bookDepth) / 2 - 0.02;

      placements.push({
        entry,
        rotationY: 0,
        rotationZ: lean,
        position: {
          x,
          // Rotating about the centre would sink the low corner into the plank,
          // so the book is lifted until that corner lands on the wood.
          //
          // The cosine used to be dropped, on the grounds that it is 0.998 at
          // the steepest ordinary slump — 0.0008 of a unit, which no render
          // shows. A propped book leans twice that far, where the same omission
          // is 0.004 and reads as a hairline of daylight under the book. The
          // exact form costs one cosine.
          y:
            shelfY +
            (entry.height / 2) * Math.cos(lean) +
            (entry.thickness / 2) * Math.sin(Math.abs(lean)),
          z,
        },
        // Under the book's foot, which is not under its middle once it leans:
        // the bottom edge swings out by `sway`, and the painted shadow follows
        // it. Worth 2cm on an ordinary slump and 5cm on a propped book, which
        // is half a spine of daylight between a book and its own shadow.
        contact: { x: x + sway, width: entry.thickness, z, depth: SHELF.bookDepth },
        frontZ: depth / 2,
      });

      // Touching, not spaced. Books in a run share an angle, so they stay
      // parallel and their boards meet along the whole height — which is what
      // "resting on each other" has to look like. The hair of clearance is
      // only so two coincident faces do not fight over the same depth.
      left = { ...left, right: cursor + entry.thickness };
      cursor += entry.thickness + TOUCHING;
    }
    index += 1;
  }

  return placements;
}

/**
 * Where a row's last book's footprint ends, placed at `rowIndex`.
 *
 * **The one question the packer asks**, and it asks it of the placer rather than
 * of a model of the placer. `toRows` offers a book to a row by placing the row
 * with the book on the end and reading this: past the band and the row wraps.
 *
 * The *footprint*, not the corners. A leaning book's low corner bulges `sway`
 * right of its footprint, and what that swing swings into is `SHELF.endReserve`
 * — charged once at the open end rather than to each book, because clearance is
 * charged to the left of the book that leans and the last book of a row has
 * nothing on its right to charge. So the band this is compared against already
 * has the reserve taken out of it, and comparing footprints is the whole of it.
 *
 * An empty row ends where the cursor starts.
 */
export function rowExtent(books: readonly ShelfBook[], rowIndex: number): number {
  const placements = placeRow(books, rowIndex, 0);
  const last = placements[placements.length - 1];
  if (last === undefined) return -SHELF.width / 2;
  // `footprint` is that same `faceOut ? coverWidth : thickness`, decided once in
  // `toShelfBook`. Spelling it out again here is how a fourth answer to "how wide
  // is a book" would start.
  return last.position.x + last.entry.footprint / 2;
}

/**
 * Most a book leans **of its own accord**, in radians — about 3.5°. Beyond that
 * it looks knocked over.
 *
 * A book that has *been* knocked over is a different case and gets `MAX_PROP_LEAN`.
 */
export const MAX_LEAN = 0.062;

/**
 * Ceiling on a propped lean — about 14°.
 *
 * **Nothing reaches it, and that is deliberate.** A gap is `YEAR_GAP` wide and a
 * book is around 0.85 tall, so crossing one takes about 6°; the live shelf's
 * steepest is 9.8°, and a fixture with a year change at *every* one of sixty
 * books tops out at 12.7°. This is a backstop against a pathological library, not
 * a number the shelf is dialled to.
 *
 * It was 9.2° and it *bound* — the second book of a chain stopped 4.7° short of
 * its neighbour, which is a book resting on air in the one case the owner can
 * see, and the owner had said "even if there is a gap with a bigger angle". The
 * compounding it was guarding against turned out not to compound: a propped book
 * inherits its neighbour's angle only when it lands on the neighbour's *board*,
 * and the chain case lands on its *corner*, where the angle is already accounted
 * for. So the chain converges instead of running away, and the ceiling can sit
 * above everything rather than inside it.
 *
 * ⚠️ **`SHELF.endReserve` pays for this**, because the last book of a row has
 * nothing on its right to charge its swing to. Raise this and `endReserve` has to
 * follow it or the last spine on a full row leans through the upright — pinned by
 * G25, which used to pin it to `MAX_LEAN` and went on doing so for a while after
 * books started leaning further than that.
 */
export const MAX_PROP_LEAN = 0.25;

/**
 * Whatever stands immediately to the left, as the cursor sees it.
 *
 * A face-out book is a vertical slab: it carries `lean: 0` and `thickness: 0`,
 * because its 0.06 tilt is about Z *after* a quarter turn about Y and so swings
 * it in Y and Z rather than along the row. The case's own side is the same shape
 * with an infinite height.
 */
export interface Neighbour {
  readonly height: number;
  readonly thickness: number;
  readonly lean: number;
  readonly sway: number;
  /** Where its footprint ends — not where its corners are. */
  readonly right: number;
  readonly faceOut: boolean;
}

/**
 * Whether a book falls into the gap in front of it instead of standing beside it.
 *
 * **One rule, read by everything that needs it.** The cursor branches on it, and
 * G25's cost model prices it; those two disagreeing is the entire subject of
 * ADR-0031 — a charge for a clearance the placer does not spend, or the reverse.
 * The packer no longer reads it at all, because it no longer prices anything.
 * A face-out book is broad and flat and stands square whatever is beside it.
 */
export function propsAcrossGap(entry: ShelfBook): boolean {
  return (entry.gapBefore ?? 0) > 0 && !entry.faceOut;
}

/**
 * Whether a book and the one before it are two spines of the same run — same
 * angle, boards meeting, and owing each other `parallelPushOf`.
 *
 * Two shelved books with nothing between them are always at the same angle: only
 * a gap or a face-out book opens a new run. So this is the cursor's `else`,
 * stated once rather than reproduced in G25's cost model.
 */
export function runsParallel(entry: ShelfBook, previous: ShelfBook | undefined): boolean {
  return (
    previous !== undefined &&
    leansInPlace(entry) &&
    leansInPlace(previous) &&
    !propsAcrossGap(entry)
  );
}

/**
 * How far a book has to lean to reach across `gap` and rest on its neighbour.
 *
 * Measured from the book's bottom-left corner, which is where a book tipping to
 * the left actually pivots — the corner that stays on the plank. So `gap` is the
 * distance between the two *footprints* and the angle is what carries the top of
 * the book across it.
 *
 * ⚠️ **The neighbour's footprint is not the neighbour**, and the first version of
 * this function assumed it was. A leaning book's low corner bulges `sway` right
 * of its footprint and its top corner recedes `sway` left of it, so measuring to
 * the footprint over-leans by an angle worth 8–18mm — which the render showed as
 * one board driven visibly through another, at the two places the shelf has a
 * propped book beside a leaning one. Both corners are taken exactly here.
 *
 * Two contacts, and which one binds depends on how tall the neighbour is:
 *
 * - **Board**, when the neighbour is tall enough to be met: this book's top corner
 *   lands on its face. That face is itself sloped, so the neighbour's own lean is
 *   part of the answer — `θ = leftLean + asin(reach · cos leftLean / height)`,
 *   where `reach` is the gap less the neighbour's bulge.
 * - **Corner**, when it is not: this book keeps going until its own left board
 *   catches the neighbour's top corner — `tan θ = (gap + recede) / cornerHeight`.
 *   The neighbour's lean is *not* added here. It is already in where that corner
 *   is, and adding it again is the over-lean above.
 *
 * They meet **exactly** at the boundary — this book's contact height equal to the
 * neighbour's corner height puts both formulas on the same point — so a neighbour
 * a millimetre shorter does not change the answer by a degree. That is only true
 * with the `liftedFoot` term below; without it the two disagree by 4mm at the
 * steepest angle, which is a seam a `TOUCHING` standoff hides rather than closes.
 */
export function propLeanFor(gap: number, height: number, left: Neighbour): number {
  if (gap <= 0 || height <= 0 || left.height <= 0) return 0;

  const sway = swayOf(left.height, left.lean);
  // Half its thickness foreshortens as it tilts, which pulls both corners back
  // toward its middle — the second-order term, and the one that decides which
  // side of its footprint each corner lands on.
  const foreshorten = (left.thickness / 2) * (1 - Math.cos(left.lean));
  const bulge = sway - foreshorten;
  const recede = sway + foreshorten;
  // Its top corner, above the plank — which its own low corner is standing on.
  const cornerHeight = left.height * Math.cos(left.lean) + left.thickness * Math.sin(left.lean);
  // Its board does not start at the plank: a leaning book stands on its *bottom
  // left* corner, so its bottom right one is `thickness · sin θ` in the air, and
  // the sloped face has already carried that much of its run before it reaches
  // the height this book's corner arrives at.
  const liftedFoot = left.thickness * Math.sin(left.lean) * Math.tan(left.lean);

  // It stops `TOUCHING` short, for the reason two books in a run do: the
  // alternative is two surfaces at exactly zero, fighting over the same depth.
  const crossing = Math.max(gap - bulge - liftedFoot - TOUCHING, 0) * Math.cos(left.lean);
  const board = left.lean + Math.asin(Math.min(crossing / height, 1));

  const lean =
    height * Math.cos(board) <= cornerHeight
      ? board
      : Math.atan(Math.max(gap + recede - TOUCHING, 0) / cornerHeight);

  return Math.min(lean, MAX_PROP_LEAN);
}

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
 * How far left a propped book is moved so it pivots on its base and not its
 * middle.
 *
 * The difference between the two centres, exactly: half the thickness
 * foreshortens by `1 - cos θ`, and the whole swing of the top corner is `sway`.
 * It is shelf the book gives *back*, which is why G25's cost model can charge a
 * year gap in full and still be an upper bound.
 */
export function propShiftOf(thickness: number, height: number, lean: number): number {
  return (thickness / 2) * (1 - Math.cos(lean)) + swayOf(height, lean);
}

/**
 * How much further right a book must sit than `thickness + TOUCHING` past its
 * neighbour, when the two of them are parallel.
 *
 * Zero for two books of the same height and thickness standing straight, which is
 * every case anybody pictures when they say a run packs flush. It is not zero the
 * moment the two differ, and the reason is the pivot: a book tilted about its
 * middle stands on a base swung `sway` to the right of its footprint, and `sway`
 * scales with *height*. Two books at the same angle from footprints `t` apart
 * therefore have bases that are **not** `t` apart, and a tall book followed by a
 * short one has its low corner inside its neighbour's board.
 *
 * The three terms, each the difference between a corner and where the footprint
 * says it is:
 *
 * - `left.thickness · (sec θ − 1)` — the neighbour's own board is `t` thick
 *   measured square to itself, which is `t · sec θ` measured along the row.
 * - the halves of both thicknesses that foreshorten, which pull the two bases
 *   toward each other by different amounts when the books differ in thickness.
 * - `sway(left) − sway(this)` — the height term, and the one that dominates:
 *   4mm at an ordinary slump, 13mm at a propped angle.
 *
 * The `TOUCHING` the cursor has already spent is left alone rather than counted
 * against this, so it survives as real clearance between the boards. Spending it
 * here would put two parallel faces at exactly zero, which is the one thing it
 * exists to prevent.
 */
export function parallelPushOf(entry: ShelfBook, left: Neighbour): number {
  if (swingsNothing(entry, left)) return 0;

  const cos = Math.cos(left.lean);
  const required =
    left.thickness / cos -
    ((entry.thickness - left.thickness) / 2) * (1 - cos) +
    (swayOf(left.height, left.lean) - swayOf(entry.height, left.lean));

  return required - left.thickness;
}

/**
 * Nothing tilts, so no base is swung off its footprint, so there is nothing to
 * correct — either the pair is upright or this book is face-out, which stands
 * square along the row whatever it is beside.
 */
function swingsNothing(entry: ShelfBook, left: Neighbour): boolean {
  return left.lean === 0 || entry.faceOut;
}

/**
 * Whether a book leans where it sits.
 *
 * The cursor's own rule, exported so G25's cost model can read it rather than
 * keep a copy: a face-out book stands square and everything else leans with its
 * run.
 *
 * **The book carrying a year gap used to be the second exception**, on the
 * reasoning that it had nothing to rest against. It props against its neighbour
 * across the gap now, so it leans like anything else — and it has to be counted
 * that way here, or G25's cost model charges clearance for an angle change that
 * no longer happens at a gap and the excess stops being one the bound can name.
 */
export function leansInPlace(entry: ShelfBook): boolean {
  return !entry.faceOut;
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
