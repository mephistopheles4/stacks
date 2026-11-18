import { describe, expect, it } from 'vitest';
import { chooseAnchor, panSpeedFor, zoomStep } from './room-anchor.ts';
import type { Box, Vec3 } from './room-data.ts';

const room: Box = { min: [-10, 0, -10], max: [10, 10, 10] };
/** A room wide enough that a hit 70 ahead is still in it. */
const wide: Box = { min: [-200, 0, -200], max: [200, 10, 200] };
/** At the room's middle, at its mid height, looking along x (east) or against it (west). */
const from: Vec3 = [0, 5, 0];
const east: Vec3 = [1, 0, 0];
const west: Vec3 = [-1, 0, 0];

describe('chooseAnchor (#637, C2: S5.3)', () => {
  // Each expected distance is derived from S5.3. The rows with a room box were checked against the
  // prototype's `reanchor` (6f66bd5) over the same line of sight; the two with no room box were derived
  // from the spec and not run against the prototype.
  const rows: [string, number | undefined, Box | undefined, Vec3, Vec3, number][] = [
    ['a hit in the room', 7, room, from, east, 7],
    // standing off-centre: the hit at 18.5 lands at x=10.5, inside the margin; the centre is 8 ahead, so
    // a margin of 0 would give 8
    ['a hit just past the wall, inside the margin', 18.5, room, [-8, 5, 0], east, 18.5],
    // the centre is 8 ahead; the hit at 25 lands at x=17, past the margin
    ['a hit beyond the margin with the centre nearer', 25, room, [-8, 5, 0], east, 8],
    // standing outside the room: the hit at 4 lands at x=-26, outside it, and the centre is 30 ahead
    ['a hit beyond the margin with the centre farther', 4, room, [-30, 5, 0], east, 4],
    ['no hit, the centre ahead', undefined, room, [-8, 5, 0], east, 8],
    [
      'the room’s centre behind the camera, with a hit outside the room',
      30,
      room,
      [-3, 5, 0],
      west,
      30,
    ],
    ['the room’s centre behind the camera, with no hit', undefined, room, [-3, 5, 0], west, 6],
    // the centre is behind, the hit at 80 lands at x=-83, outside the room: the hit stands, clamped to 60
    [
      'the room’s centre behind, with a hit outside the room beyond 60',
      80,
      room,
      [-3, 5, 0],
      west,
      60,
    ],
    ['an in-room hit of 0.3 is too near', 0.3, room, from, east, 6],
    ['an in-room hit of 70 is too far', 70, wide, [-90, 5, 0], east, 6],
    ['no room box, a hit of 10', 10, undefined, from, east, 10],
    ['no room box, a hit of 70', 70, undefined, from, east, 6],
  ];
  for (const [name, hit, box, at, direction, expected] of rows) {
    it(`${name}: ${String(expected)} ahead`, () => {
      expect(chooseAnchor(hit, box, at, direction)).toBeCloseTo(expected, 9);
    });
  }
});

describe('panSpeedFor (#637, C4: S5.7)', () => {
  it('is 1, 4, 1 and 1 at reach 0, 0.5, 2 and 10', () => {
    expect([0, 0.5, 2, 10].map(panSpeedFor)).toEqual([1, 4, 1, 1]);
  });
});

describe('zoomStep (#637, C5: S5.6)', () => {
  it('is 1, 1/6, 1, 2 and 40/6 with nothing ahead, and 0.5, 6, 12 and 100 ahead', () => {
    const scales = [undefined, 0.5, 6, 12, 100].map(zoomStep);
    expect(scales[0]).toBe(1);
    expect(scales[1]).toBeCloseTo(1 / 6, 12);
    expect(scales[2]).toBe(1);
    expect(scales[3]).toBe(2);
    expect(scales[4]).toBeCloseTo(40 / 6, 12);
  });
});
