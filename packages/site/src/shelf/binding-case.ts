import type { ShelfBook } from './books.ts';

/**
 * A book's case, as numbers — how thick its boards are, how far they overhang
 * the page block, and how much the head cap takes off the top.
 *
 * Pure and free of Three.js, so the two things that need a book's shape read
 * one answer: `buildBook`, which builds the case from it, and the cover shade,
 * which paints the shadow a neighbour throws across a face-out cover and has to
 * throw it from the part of the book that actually casts. That part is the page
 * block, not the case (see `buildBook`), and the difference is visible: a
 * wedge painted from the whole case lands a few pixels left of and above the
 * one the shadow map drew, and on a cover where the wedge is most of the shade
 * that offset was most of what was left wrong
 * (`docs/log/2026-09-24-the-cover-shade.md`).
 */

/**
 * A hardback case, in the same world units as the shelf (1 unit ≈ 24cm).
 *
 * `BOARD` is the thickness of a cover board — about 2.5mm on a real book — and
 * `SQUARE` is the *square*: the few millimetres by which the boards overhang the
 * page block at head, tail and fore-edge. They are why the top of a real book is
 * mostly paper with only a thin rim of cover showing, and why the cover stands
 * proud of the pages instead of being flush with them.
 */
export const BOARD = 0.011;
export const SQUARE = 0.013;

/**
 * A paperback's cover, in the same units — one sheet of card at about 0.3mm,
 * against the hardback's 2.6mm board.
 *
 * It is not zero. A paperback still has a cover with a visible edge where it
 * meets the page block, and collapsing it to nothing makes the book one solid
 * slab of paper with a printed face. Thin enough to read as card, thick enough to
 * still be there.
 */
export const PAPER_COVER = 0.0013;

/** The four numbers the case is built from. */
export interface BookCase {
  /** How thick a board is — or the card, on a paperback. */
  readonly board: number;
  /** How far the boards overhang the page block at head, tail and fore-edge. */
  readonly square: number;
  /** How much height the head cap takes off the covering below it; 0 on a paperback. */
  readonly cap: number;
  /** How deep the covering at the bound edge is: the cap where there is one, else a board. */
  readonly frontDepth: number;
}

/** What a case is cut from: a book's own measurements. */
export type CaseEntry = Pick<ShelfBook, 'binding' | 'thickness' | 'height'>;

/**
 * The case for one book, built `depth` deep, under a head cap of `headCap`
 * thicknesses.
 *
 * Board and square are fixed in the world rather than fractions of the book — a
 * thin book and a fat one are bound in the same card. Each is capped against the
 * dimension it eats so that a small enough book still has paper in it: `depth`
 * is the measured cover aspect on a face-out book, which is vault data, and a
 * page block scaled negative turns inside out rather than failing.
 *
 * Binding chooses between the two cases, and it chooses *both* numbers at once.
 * A paperback is not a hardback with the overhang taken off: the square going
 * without the board leaves a case still 2.6mm thick that has mysteriously lost
 * its rim, which reads as a modelling error rather than as a second format. A
 * paperback's cover is glued flush to the block, so there is no square at all,
 * and the card it is cut from is a fifth of a board.
 *
 * The cap is proportional to **thickness**, never to height — which is the whole
 * reason one shared cap is the right shape on every book — and hardbacks only: a
 * perfect-bound paperback has no covering to roll.
 */
export function bookCase(entry: CaseEntry, depth: number, headCap: number): BookCase {
  const paperback = entry.binding === 'paperback';
  const board = Math.min(paperback ? PAPER_COVER : BOARD, entry.thickness * 0.3);
  const square = paperback ? 0 : Math.min(SQUARE, entry.height * 0.05, (depth - board) * 0.2);
  const cap = entry.binding === 'hardback' ? headCap * entry.thickness : 0;
  return { board, square, cap, frontDepth: cap > 0 ? cap : board };
}

/** A box in a book's own frame: its size and where its centre sits. */
export interface LocalBox {
  readonly scale: readonly [x: number, y: number, z: number];
  readonly position: readonly [x: number, y: number, z: number];
}

/**
 * The page block — recessed inside the case at head, tail and fore-edge, and
 * the one part of a book that casts a real-time shadow, standing in for all of
 * it.
 *
 * In the book's own frame: spine at +Z, cover at +X. Returned as the scale and
 * position `buildBook` sets on the block's unit box, computed exactly as it
 * always was, so building from this moves no vertex.
 */
export function pageBlock(entry: CaseEntry, depth: number, headCap: number): LocalBox {
  const { board, square, frontDepth } = bookCase(entry, depth, headCap);
  return {
    scale: [entry.thickness - board * 2, entry.height - square * 2, depth - frontDepth - square],
    position: [0, 0, (square - frontDepth) / 2],
  };
}
