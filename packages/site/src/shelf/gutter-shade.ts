/**
 * The shadow a held book's spread wears where its two pages meet.
 *
 * The spread is flat on purpose: spec §3.6 lays both pages in one plane square
 * to the camera, and `smoke-render.ts` measures it. Two coplanar sheets under
 * one material light identically, so the fold between them vanished and the
 * open book read as one tan board. A real page curves down into the gutter and
 * falls into its own shadow there; this bakes that shadow in, as a colour the
 * sheet's vertices carry, without bending the plane the spec measures.
 *
 * Pure and free of `three`, like `open-spread.ts`, so the ramp is unit-tested
 * here and `pickup.ts` only turns the stops into vertices.
 */

/** How much darker the paper is on the fold itself: 0 is none, 1 is black. */
export const GUTTER_DARKEN = 0.42;

/** How far into the page the shadow reaches, as a fraction of its width. */
export const GUTTER_REACH = 0.14;

/**
 * Where the ramp is sampled, as distances from the fold over `GUTTER_REACH`.
 * Crowded at the fold, where the falloff is steepest, because the colour is
 * interpolated linearly between vertices.
 */
const SAMPLES = [0, 0.03, 0.08, 0.15, 0.25, 0.4, 0.6, 0.8, 1] as const;

export interface GutterStop {
  /** Across the unit sheet, -0.5 to 0.5, in the sheet's own x. */
  readonly x: number;
  /** What the paper's colour is multiplied by here. */
  readonly shade: number;
}

/**
 * The shade across a unit sheet whose fold lies on its `side` edge, in
 * ascending x. A quadratic falloff: a page bends hardest just before it
 * disappears into the binding.
 */
export function gutterStops(side: 1 | -1): GutterStop[] {
  const fromFold = SAMPLES.map((t) => ({
    x: side * (0.5 - t * GUTTER_REACH),
    shade: 1 - GUTTER_DARKEN * (1 - t) ** 2,
  }));
  const far = { x: -side * 0.5, shade: 1 };
  const stops = [...fromFold, far];
  return stops.sort((a, b) => a.x - b.x);
}
