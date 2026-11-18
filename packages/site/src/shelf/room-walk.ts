import { type Box, type Vec3, clampInto, contains } from './room-data.ts';

/**
 * Walking through the room (#626): the scroll and the pinch move the camera forward and back along
 * the view, a fixed distance a step, instead of dollying toward the orbit target.
 *
 * A dolly takes a share of the distance that is left, so it slows as the camera nears the target and
 * stops at `minDistance`; the target is a point beside the side table, so it never heads for a book.
 * A walk moves the camera **and its target together**, so the camera never nears anything it is not
 * walking at, and a book on the shelves can be brought up close to read its spine.
 *
 * No `three` and no DOM, so vitest's node environment runs every rule here.
 */

/** World units one wheel notch (a `deltaY` of 100) walks. A trackpad's smaller deltas walk in proportion. */
export const WALK_PER_NOTCH = 0.5;
/** The most notches one wheel event may walk: a flung wheel is not a leap across the room. */
export const MOST_NOTCHES = 3;
/** How far short of the main bookcase's front a walk stops, so the camera's near plane clears the spines. */
export const BOOKCASE_STANDOFF = 0.3;
/** World units a pinch walks for each pixel the fingers spread or close. */
export const WALK_PER_PINCH_PIXEL = 0.02;

/** The notches one wheel event is worth: `deltaY` in pixels, lines or pages, forward positive. */
export function notchesOf(deltaY: number, deltaMode: number): number {
  // a line is a third of a notch: browsers that report lines send 3 for one click of the wheel
  const pixels = deltaMode === 1 ? (deltaY * 100) / 3 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const notches = -pixels / 100;
  return Math.max(-MOST_NOTCHES, Math.min(MOST_NOTCHES, notches));
}

function unit(from: Vec3, to: Vec3): Vec3 | undefined {
  const x = to[0] - from[0];
  const y = to[1] - from[1];
  const z = to[2] - from[2];
  const length = Math.hypot(x, y, z);
  return length === 0 ? undefined : [x / length, y / length, z / length];
}

/** How far a point inside `box` can go along `direction` before it meets a face. */
function reachOfBox(box: Box, point: Vec3, direction: Vec3): number {
  let reach = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const run = direction[axis];
    if (run === 0) continue;
    const wall = run > 0 ? box.max[axis] : box.min[axis];
    reach = Math.min(reach, Math.max(0, (wall - point[axis]) / run));
  }
  return reach;
}

/**
 * How far a point outside `box` can go along `direction` before it enters it: `Infinity` for a line
 * that misses it, and for a point already inside, which a walk must not trap.
 */
function enterReach(box: Box, point: Vec3, direction: Vec3): number {
  let near = -Infinity;
  let far = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const run = direction[axis];
    if (run === 0) {
      if (point[axis] < box.min[axis] || point[axis] > box.max[axis]) return Infinity;
      continue;
    }
    const a = (box.min[axis] - point[axis]) / run;
    const b = (box.max[axis] - point[axis]) / run;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return near >= 0 && near <= far ? near : Infinity;
}

export interface Stand {
  readonly camera: Vec3;
  readonly target: Vec3;
}

/**
 * One walk of `distance` (forward positive) along the line from `camera` to `target`.
 *
 * - **The step is the same size at any distance from the target**, and the camera is never taken
 *   past the box: a step that would leave it stops at the face.
 * - **The target goes with the camera**, `radius` ahead of it (how far ahead the target is kept)
 *   unless the box ends first, and then it stands on that face. It is never nearer the camera than
 *   `nearest`, so with the camera closer than that to the face it looks at, the target stands
 *   `nearest` ahead, past the face and outside the box, and the orbit falls back to clamping the
 *   camera onto the nearest face (`pullIn` takes a target outside the box that way). Where the target
 *   is inside the box, it is one the pull-in can use. Walking back out gives the target its `radius`
 *   again.
 *
 * - **`keepOut`** are spaces the camera does not walk into (the main bookcase): a step that would enter
 *   one stops at its face. A camera already inside one is not held there.
 *
 * `camera` is inside the box, which the orbit's pull-in keeps true.
 */
export function walk(
  box: Box,
  camera: Vec3,
  target: Vec3,
  distance: number,
  radius: number,
  nearest: number,
  keepOut: readonly Box[] = [],
): Stand {
  const ahead = unit(camera, target);
  if (ahead === undefined || !contains(box, camera)) return { camera, target };
  const heading: Vec3 = distance >= 0 ? ahead : [-ahead[0], -ahead[1], -ahead[2]];
  const moved = Math.min(
    Math.abs(distance),
    reachOfBox(box, camera, heading),
    ...keepOut.map((space) => enterReach(space, camera, heading)),
  );
  const sign = distance >= 0 ? 1 : -1;
  const stood = clampInto(box, [
    camera[0] + ahead[0] * moved * sign,
    camera[1] + ahead[1] * moved * sign,
    camera[2] + ahead[2] * moved * sign,
  ]);
  const reach = reachOfBox(box, stood, ahead);
  const away = Math.max(nearest, Math.min(radius, reach));
  const lookAt: Vec3 = [
    stood[0] + ahead[0] * away,
    stood[1] + ahead[1] * away,
    stood[2] + ahead[2] * away,
  ];
  // where the box holds the target, the multiply can land a rounding error past the face it stops at
  return { camera: stood, target: away <= reach ? clampInto(box, lookAt) : lookAt };
}
