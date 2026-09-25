/**
 * Where the camera stands for a bookcase of a given size, and the fog that
 * follows it there.
 *
 * Its own module, with no Three.js in it, for `bookcase.ts`'s reason: the scene
 * and the tests read the *same* arithmetic. This used to be a closure inside
 * `mountShelf`, where the one oracle was a headless browser and no spec could
 * ask how far back the camera stood for 17 shelves.
 *
 * **The fog is why it moved.** The camera backs off as the bookcase grows, and
 * the fog's range was two constants in world units — `near: 14, far: 30`, set
 * against the fixed four-row bookcase the scaffold had. Framing a 17-shelf
 * bookcase puts the camera 36 units back, past the fog's far edge, so every
 * fragment of the bookcase rendered as the fog colour — which is the background
 * colour, by design — and a 273-book library was a black page (#383). Nothing
 * failed; the shelf drew every book and then painted them all out.
 *
 * So the range is now a multiple of the framing distance, and the fog stands
 * the same way behind the bookcase at every size. See ADR-0092.
 */
import { SHELF } from './bookcase.ts';

/** The camera's vertical field of view, in degrees. */
export const FOV = 40;

/** The bookcase's outside width: the shelf and both uprights. */
export const BOOKCASE_WIDTH = SHELF.width + SHELF.sideThickness * 2;

/**
 * Breathing room around the framed bookcase, as a multiple of the tight fit.
 *
 * With it the bookcase fills about three quarters of the constraining axis,
 * which leaves room for the lean of the books and the orbit's first nudge.
 */
const MARGIN = 1.35;

/** How far out the orbit may dolly, as a multiple of the framing distance. */
const DOLLY_OUT = 2.4;

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where the camera stands, what it looks at, and how far out it may go. */
export interface Framing {
  /** The camera's distance in front of the bookcase, along `z`. */
  readonly distance: number;
  readonly position: Point;
  readonly target: Point;
  readonly maxDistance: number;
}

/**
 * Backs the camera off far enough for the whole bookcase to fit — checked
 * against *both* axes and the real viewport aspect.
 *
 * A short wide bookcase is width-constrained and a tall narrow one is
 * height-constrained, so fitting only the height clips the sides of a small
 * library. On a phone held upright a four-row bookcase is width-constrained,
 * which is why it frames at 15.5 there and at 9.0 on a desktop.
 */
export function frameBookcase(rowCount: number, aspect: number): Framing {
  const unitHeight = rowCount * SHELF.rowHeight;
  const half = Math.tan((FOV / 2) * (Math.PI / 180));
  const forHeight = unitHeight / (2 * half);
  const forWidth = BOOKCASE_WIDTH / (2 * half * aspect);
  const distance = Math.max(forHeight, forWidth) * MARGIN + SHELF.depth;

  return {
    distance,
    position: { x: BOOKCASE_WIDTH * 0.16, y: unitHeight * 0.52, z: distance },
    target: { x: 0, y: unitHeight * 0.48, z: 0 },
    maxDistance: distance * DOLLY_OUT,
  };
}

/** The fog as authored: where it begins and ends, in framing distances. */
export interface FogReach {
  readonly near: number;
  readonly far: number;
}

/**
 * The fog's range in world units, for a camera framed at `distance`.
 *
 * **Proportional, so the picture is the same at every size.** The camera's
 * distance and the fog's both scale with the framing, so the bookcase stands
 * clear of the fog at its framed distance whatever its height, and dollying out
 * to the orbit's limit fades it by the same amount on four shelves as on
 * seventeen.
 *
 * ⚠️ **Not the same picture at every aspect, and that is the fix, not a side
 * effect.** An upright phone frames today's four rows at 15.5, where the old
 * absolute `near: 14` reached the front of the bookcase — the same defect, one
 * row-count earlier. Measured through the bookcase region at 412×915 before
 * this change, fog on read 85.6 against 86.6 with it off.
 */
export function fogRange(fog: FogReach, distance: number): FogReach {
  return { near: fog.near * distance, far: fog.far * distance };
}
