import { pageBlock, type CaseEntry } from './binding-case.ts';

/**
 * Where a held book's two pages sit when it lies open — computed from the same
 * case `buildBook` builds, never measured off the meshes.
 *
 * The spec's §3.6 is the owner's done-criterion, set after #371's prototype:
 * at rest both pages lie in one plane square to the camera, the pages are the
 * same height, and the hinge meets the spine. The prototype failed all three,
 * and each failure came from guessing a shape. It sized the left page at 97% of
 * the cover, it hinged the board at the spine's outside corner so the spine and
 * head cap showed between the pages, and it rested the cover at 165°. So the
 * spread is derived here from `pageBlock`, in the book's own frame (spine +Z,
 * cover +X, head +Y):
 *
 * - **The right-hand page** is a paper sheet laid on the block's cover-side
 *   face, the block's own height and depth. A sheet, because the block wears
 *   the fore-edge striation on every face (#369).
 * - **The hinge** runs up the gutter: the line where that face meets the bound
 *   edge, on the face's own plane. The board's inside is coplanar with the face
 *   when the book is shut, so turning it 180° about that line lays it in the
 *   same plane, facing out.
 * - **The left-hand page** is a second sheet of the same size riding the board,
 *   face down on the block while the book is shut. Turned 180° about the hinge,
 *   its inner edge lands on the gutter, exactly against the right page's.
 *
 * Pure and free of `three`, so each criterion is an exact unit test here, and
 * `smoke-render.ts` measures the built scene against the same three.
 */

/** What the spread is cut from. */
export type SpreadEntry = CaseEntry;

/**
 * How far a sheet stands in front of the face it lies on, in world units.
 *
 * Enough to win the depth test against the block's face and the board's
 * inside at a held book's distance, and about a tenth of a millimetre on a real
 * book, which no projection can show.
 */
export const SHEET_LIFT = 0.0004;

/** A flat sheet in the book's frame: its centre, its size and which way it faces along X. */
export interface Sheet {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Along Z: the page's width as a reader sees it. */
  readonly width: number;
  /** Along Y. */
  readonly height: number;
  /** +1 faces the cover side (+X), the reader at rest; -1 faces the block. */
  readonly facing: 1 | -1;
}

export interface OpenSpread {
  /** The hinge: a vertical line through this point of the book's frame. */
  readonly pivot: { readonly x: number; readonly z: number };
  /** The right-hand page, on the block. It does not move. */
  readonly right: Sheet;
  /** The left-hand page as it rides the board while the book is shut. */
  readonly leftOnBoard: Sheet;
}

export function openSpread(entry: SpreadEntry, depth: number, headCap: number): OpenSpread {
  const block = pageBlock(entry, depth, headCap);
  const [, height, width] = block.scale;
  const face = block.position[0] + block.scale[0] / 2;
  const y = block.position[1];
  const centreZ = block.position[2];
  const gutter = centreZ + width / 2;

  return {
    pivot: { x: face, z: gutter },
    right: { x: face + SHEET_LIFT, y, z: centreZ, width, height, facing: 1 },
    leftOnBoard: { x: face - SHEET_LIFT, y, z: gutter - width / 2, width, height, facing: -1 },
  };
}

/** The left-hand page after the board has turned its 180° about the hinge. */
export function restingLeftPage(spread: OpenSpread): Sheet {
  const { pivot, leftOnBoard: sheet } = spread;
  return {
    ...sheet,
    x: 2 * pivot.x - sheet.x,
    z: 2 * pivot.z - sheet.z,
    facing: sheet.facing === 1 ? -1 : 1,
  };
}
