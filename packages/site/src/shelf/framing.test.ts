import { describe, expect, it } from 'vitest';
import { SHELF } from './bookcase.ts';
import { BOOKCASE_WIDTH, fogRange, frameBookcase, type FogReach, type Framing } from './framing.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

/** Today's fixture: `pnpm smoke:render`'s library stands on four shelves. */
const TODAY_ROWS = 4;
/** `rowsForBookcase` for the 273-book library that rendered black in #383. */
const LARGE_ROWS = 17;

/** Every aspect a visitor is likely to hold, from an upright phone to an ultrawide. */
const ASPECTS = [412 / 915, 375 / 812, 480 / 640, 1, 1440 / 900, 16 / 9, 2560 / 1080];

/**
 * How deep the farthest corner of the bookcase sits, measured the way the fog
 * measures it.
 *
 * `THREE.Fog` fades on view-space depth — the distance along the camera's line
 * of sight — not on the straight-line distance, so this projects each corner of
 * the bookcase's box onto the direction from the camera to its target.
 */
function farthestDepth(rows: number, framing: Framing): number {
  const { position: from, target } = framing;
  const look = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const length = Math.hypot(look.x, look.y, look.z);
  const height = rows * SHELF.rowHeight;

  let farthest = -Infinity;
  for (const x of [-BOOKCASE_WIDTH / 2, BOOKCASE_WIDTH / 2]) {
    for (const y of [0, height]) {
      for (const z of [-SHELF.depth / 2, SHELF.depth / 2]) {
        const depth =
          ((x - from.x) * look.x + (y - from.y) * look.y + (z - from.z) * look.z) / length;
        farthest = Math.max(farthest, depth);
      }
    }
  }
  return farthest;
}

/** Whether the framed bookcase stands wholly in front of where the fog begins. */
function clearOfFog(rows: number, aspect: number, reach: (framing: Framing) => FogReach): boolean {
  const framing = frameBookcase(rows, aspect);
  return farthestDepth(rows, framing) < reach(framing).near;
}

const shipped = (framing: Framing): FogReach =>
  fogRange(DEFAULT_SETTINGS.scene.fog, framing.distance);

describe('frameBookcase', () => {
  it('frames four shelves at 9.03 on a desktop — the distance the fog was tuned at', () => {
    // The reference ADR-0092 converts the old constants against. Height-bound at
    // both desktop aspects, so a 16:10 screen frames exactly as 16:9 does.
    expect(frameBookcase(TODAY_ROWS, 16 / 9).distance).toBeCloseTo(9.0284, 4);
    expect(frameBookcase(TODAY_ROWS, 1440 / 900).distance).toBeCloseTo(9.0284, 4);
  });

  it('backs off further on an upright phone, because the width binds there', () => {
    expect(frameBookcase(TODAY_ROWS, 412 / 915).distance).toBeCloseTo(15.465, 3);
  });

  it('backs off with the bookcase: 17 shelves frame at 36', () => {
    expect(frameBookcase(LARGE_ROWS, 480 / 640).distance).toBeCloseTo(36.031, 3);
  });

  it('looks at the bookcase from slightly above and to the right of its middle', () => {
    const framing = frameBookcase(TODAY_ROWS, 16 / 9);
    const height = TODAY_ROWS * SHELF.rowHeight;

    expect(framing.position).toEqual({
      x: BOOKCASE_WIDTH * 0.16,
      y: height * 0.52,
      z: framing.distance,
    });
    expect(framing.target).toEqual({ x: 0, y: height * 0.48, z: 0 });
    expect(framing.maxDistance).toBeCloseTo(framing.distance * 2.4);
  });
});

describe('fogRange', () => {
  it('reproduces the old constants at the framing they were tuned for', () => {
    // `near: 14, far: 30` in world units, before #383. The shipped multiples are
    // rounded to two places, which moves either edge by under 0.03 of a 16-unit
    // band — below a pixel at any distance the orbit reaches.
    const { near, far } = shipped(frameBookcase(TODAY_ROWS, 16 / 9));

    expect(Math.abs(near - 14)).toBeLessThan(0.03);
    expect(Math.abs(far - 30)).toBeLessThan(0.03);
  });

  it('scales both edges with the framing distance', () => {
    expect(fogRange({ near: 1.5, far: 3 }, 10)).toEqual({ near: 15, far: 30 });
    expect(fogRange({ near: 1.5, far: 3 }, 20)).toEqual({ near: 30, far: 60 });
  });

  it('leaves every bookcase clear of the fog where it is framed, at every size and aspect', () => {
    const fogged: string[] = [];
    for (let rows = 2; rows <= 40; rows += 1) {
      for (const aspect of ASPECTS) {
        if (!clearOfFog(rows, aspect, shipped))
          fogged.push(`${String(rows)} rows at ${aspect.toFixed(2)}`);
      }
    }

    expect(fogged, 'the fog reaches the framed bookcase').toEqual([]);
  });

  it('would catch the defect it replaced: absolute world units black out a tall bookcase', () => {
    // The planted control. The old range was a constant, and this is it — if the
    // check above could not fail against it, it would be asserting nothing.
    const absolute = (): FogReach => ({ near: 14, far: 30 });

    expect(clearOfFog(TODAY_ROWS, 16 / 9, absolute)).toBe(true);
    expect(clearOfFog(LARGE_ROWS, 16 / 9, absolute)).toBe(false);
    // And the whole of it past the far edge, which is what made the page black
    // rather than dim.
    const framing = frameBookcase(LARGE_ROWS, 16 / 9);
    expect(framing.distance - SHELF.depth / 2).toBeGreaterThan(absolute().far);
  });
});
