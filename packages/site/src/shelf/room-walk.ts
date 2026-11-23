/**
 * Walking through the room (#626, #637): the scroll and the pinch move the camera forward and back
 * along the view instead of dollying toward the orbit target. The room orbit (`room-orbit.ts`) moves the
 * camera **and its anchor together**, `WALK_PER_NOTCH` and `WALK_PER_PINCH_PIXEL` a step, scaled by what
 * is ahead (`zoomScaleFor`).
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
