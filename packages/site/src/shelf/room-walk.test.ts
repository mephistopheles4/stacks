import { describe, expect, it } from 'vitest';
import { type Box, type Vec3, bookcaseBox, contains } from './room-data.ts';
import { BOOKCASE_STANDOFF, MOST_NOTCHES, type Stand, notchesOf, pan, walk } from './room-walk.ts';

const box: Box = { min: [-7.4, 0.5, -0.2], max: [9.4, 10.5, 12.452] };
const NEAREST = 1.5;

const length = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('walk (#626)', () => {
  const camera: Vec3 = [-3.9, 3.8, 11];
  const target: Vec3 = [2.334, 1.504, 1.335];
  const radius = length(camera, target);

  it('moves the camera by the step it was asked for, whatever its distance from the target', () => {
    const near: Vec3 = [camera[0], camera[1], camera[2]];
    // the same line of sight, the target at 3 and at 12 from the camera
    const ahead = (d: number): Vec3 => {
      const k = d / radius;
      return [
        near[0] + (target[0] - near[0]) * k,
        near[1] + (target[1] - near[1]) * k,
        near[2] + (target[2] - near[2]) * k,
      ];
    };
    for (const d of [3, 6, 12]) {
      const stood = walk(box, near, ahead(d), 0.5, d, NEAREST);
      expect(length(stood.camera, near)).toBeCloseTo(0.5, 9);
    }
  });

  it('takes the target along, so the distance to it stays where it was', () => {
    const stood = walk(box, camera, target, 1, radius, NEAREST);
    expect(length(stood.camera, stood.target)).toBeCloseTo(radius, 9);
    expect(length(stood.camera, camera)).toBeCloseTo(1, 9);
    expect(length(stood.target, target)).toBeCloseTo(1, 9);
  });

  it('walks forward along the view, and back along it', () => {
    const forward = walk(box, camera, target, 1, radius, NEAREST);
    const back = walk(box, camera, target, -1, radius, NEAREST);
    expect(length(forward.camera, target)).toBeLessThan(length(camera, target));
    expect(length(back.camera, target)).toBeGreaterThan(length(camera, target));
    expect(back.camera[2]).toBeGreaterThan(camera[2]);
  });

  it('stops at the face on its own line of sight, and the camera stays in the box', () => {
    const [sx, sy, sz] = [target[0] - camera[0], target[1] - camera[1], target[2] - camera[2]];
    const online = (stood: Vec3): number => {
      const [ox, oy, oz] = [stood[0] - camera[0], stood[1] - camera[1], stood[2] - camera[2]];
      return Math.hypot(oy * sz - oz * sy, oz * sx - ox * sz, ox * sy - oy * sx) / radius;
    };
    const stood = walk(box, camera, target, 100, radius, NEAREST);
    expect(contains(box, stood.camera)).toBe(true);
    expect(online(stood.camera)).toBeCloseTo(0, 6);
    const back = walk(box, camera, target, -100, radius, NEAREST);
    expect(contains(box, back.camera)).toBe(true);
    expect(online(back.camera)).toBeCloseTo(0, 6);
    expect(back.camera[2]).toBeCloseTo(12.452, 6);
    expect(length(stood.camera, camera)).toBeLessThan(100);
  });

  it('keeps the target in the box where the box holds it, and never nearer than `nearest`', () => {
    const near: Vec3 = [1, 5, 5];
    const ahead: Vec3 = [1, 5, 2];
    // 2 forward: the camera at z 3, the target 3 ahead of it at z 0, inside the box
    expect(contains(box, walk(box, near, ahead, 2, 3, NEAREST).target)).toBe(true);
    // to the face: the camera on it, and the target `nearest` ahead, past it and outside the box
    const face = walk(box, near, ahead, 100, 3, NEAREST);
    expect(face.camera[2]).toBeCloseTo(-0.2, 9);
    expect(length(face.camera, face.target)).toBeCloseTo(NEAREST, 9);
    expect(contains(box, face.target)).toBe(false);
  });

  it('gives the target its radius again when the walk comes back out', () => {
    const at = walk(box, camera, target, 100, radius, NEAREST);
    const out = walk(box, at.camera, at.target, -100, radius, NEAREST);
    expect(length(out.camera, out.target)).toBeCloseTo(radius, 9);
    expect(length(out.camera, out.target)).toBeGreaterThan(length(at.camera, at.target));
  });

  it('stands still on a camera with no line of sight', () => {
    expect(walk(box, camera, camera, 1, radius, NEAREST)).toEqual({ camera, target: camera });
  });
});

describe('walk and the main bookcase (#620)', () => {
  // the committed case: 3.58 wide, 0.72 deep, centred on the origin, 4.48 tall (four rows)
  const slot = {
    position: [0, 0, 0] as Vec3,
    rotationY: 0,
    extras: { caster_width: 3.58, caster_depth: 0.72 },
  };
  const keepOut = bookcaseBox(slot, 4.48, BOOKCASE_STANDOFF);
  const front = 0.36 + BOOKCASE_STANDOFF;

  it('stops short of its front, however long the walk', () => {
    expect(keepOut).toBeDefined();
    const spaces = keepOut === undefined ? [] : [keepOut];
    let stand = { camera: [0, 3, 4] as Vec3, target: [0, 3, 1] as Vec3 };
    for (let i = 0; i < 40; i += 1) {
      stand = walk(box, stand.camera, stand.target, 0.5, 1.5, NEAREST, spaces);
      expect(stand.camera[2]).toBeGreaterThanOrEqual(front - 1e-9);
    }
    expect(stand.camera[2]).toBeCloseTo(front, 9);
  });

  it('stops on its own line of sight at the case’s top as well, and lets a camera inside walk out', () => {
    const spaces = keepOut === undefined ? [] : [keepOut];
    // from above, heading nearly straight down at the case
    const down = walk(box, [0, 9, 0.5], [0, 8, 0.4], 100, 1.5, NEAREST, spaces);
    expect(down.camera[1]).toBeGreaterThanOrEqual(4.48 + BOOKCASE_STANDOFF - 1e-9);
    // a camera the orbit left inside the case is not trapped by it
    const out = walk(box, [0, 3, 0.2], [0, 3, 1.7], 1, 1.5, NEAREST, spaces);
    expect(out.camera[2]).toBeCloseTo(1.2, 9);
  });
});

describe('pan (#632)', () => {
  // looking down -z from the middle of the room: screen right is +x, screen up is +y
  const camera: Vec3 = [1, 5, 8];
  const target: Vec3 = [1, 5, 5];

  it('moves the camera and its target together, sideways and up', () => {
    const stood = pan(box, camera, target, 2, 0.5);
    expect(stood.camera[0]).toBeCloseTo(3, 9);
    expect(stood.camera[1]).toBeCloseTo(5.5, 9);
    expect(stood.camera[2]).toBeCloseTo(8, 9);
    expect(length(stood.camera, stood.target)).toBeCloseTo(3, 9);
    expect(stood.target[0] - stood.camera[0]).toBeCloseTo(0, 9);
    expect(stood.target[2] - stood.camera[2]).toBeCloseTo(-3, 9);
  });

  it('pans up square to a pitched view, not along the world’s up', () => {
    // looking down: toward -z and 2 down in 3 ahead
    const stood = pan(box, [1, 5, 8], [1, 3, 5], 0, 1);
    const norm = Math.hypot(2, 3);
    expect(stood.camera[0]).toBeCloseTo(1, 9);
    expect(stood.camera[1]).toBeCloseTo(5 + 3 / norm, 9);
    expect(stood.camera[2]).toBeCloseTo(8 - 2 / norm, 9);
    // the step is one unit and square to the view
    const step: Vec3 = [0, stood.camera[1] - 5, stood.camera[2] - 8];
    const ahead: Vec3 = [0, -2, -3];
    expect(Math.hypot(...step)).toBeCloseTo(1, 9);
    expect(step[1] * ahead[1] + step[2] * ahead[2]).toBeCloseTo(0, 9);
    // the target went with it, so the view keeps its direction
    expect(stood.target[1] - stood.camera[1]).toBeCloseTo(-2, 9);
    expect(stood.target[2] - stood.camera[2]).toBeCloseTo(-3, 9);
  });

  it('pans along the screen, not the room: a camera looking along +x has right at +z', () => {
    const stood = pan(box, [0, 5, 5], [3, 5, 5], 1, 0);
    // right of a view down +x is +z in a y-up, right-handed world
    expect(stood.camera[0]).toBeCloseTo(0, 9);
    expect(stood.camera[2]).toBeCloseTo(6, 9);
  });

  it('slides along a face of the box and never takes the camera out of it', () => {
    const stood = pan(box, [9, 5, 8], [9, 5, 5], 3, 1);
    expect(contains(box, stood.camera)).toBe(true);
    // x is held at the face, y goes on
    expect(stood.camera[0]).toBeCloseTo(9.4, 9);
    expect(stood.camera[1]).toBeCloseTo(6, 9);
    // the target went exactly as far as the camera did, and so is no longer on the face
    expect(stood.target[0]).toBeCloseTo(9.4, 9);
    expect(stood.target[1]).toBeCloseTo(6, 9);
    expect(stood.target[2]).toBeCloseTo(5, 9);
  });

  it('stops short of the main bookcase and slides along its front', () => {
    const slot = {
      position: [0, 0, 0] as Vec3,
      rotationY: 0,
      extras: { caster_width: 3.58, caster_depth: 0.72 },
    };
    const keepOut = bookcaseBox(slot, 4.48, BOOKCASE_STANDOFF);
    const spaces = keepOut === undefined ? [] : [keepOut];
    // standing at the standoff plane and looking at the case, a pan to the side stays on the plane
    const front = 0.36 + BOOKCASE_STANDOFF;
    const along = pan(box, [-3, 3, front], [-3, 3, front - 3], 4, 0, spaces);
    expect(along.camera[2]).toBeCloseTo(front, 9);
    expect(along.camera[0]).toBeCloseTo(1, 9);
    // a pan from beside the case, across the front of it and into it, is stopped at its edge
    const into = pan(box, [-4, 3, 0.4], [-4, 3, -2.6], 3, 0, spaces);
    expect(into.camera[0]).toBeCloseTo(-1.79 - BOOKCASE_STANDOFF, 4);
    expect(into.target[0] - into.camera[0]).toBeCloseTo(0, 9);
  });

  it('stops on or outside the real face, so a walk toward the case afterwards does not go in', () => {
    const slot = {
      position: [0, 0, 0] as Vec3,
      rotationY: 0,
      extras: { caster_width: 3.58, caster_depth: 0.72 },
    };
    const keepOut = bookcaseBox(slot, 4.48, BOOKCASE_STANDOFF);
    const spaces = keepOut === undefined ? [] : [keepOut];
    const side = -1.79 - BOOKCASE_STANDOFF;
    // pan into the case's side, then turn to face it and walk at it
    const panned = pan(box, [-4, 3, 0.4], [-4, 3, -2.6], 3, 0, spaces);
    let stand: Stand = {
      camera: panned.camera,
      target: [panned.camera[0] + 3, panned.camera[1], panned.camera[2]],
    };
    for (let i = 0; i < 20; i += 1) {
      stand = walk(box, stand.camera, stand.target, 0.5, 3, NEAREST, spaces);
    }
    // the same face stops both, and nothing walks through it
    expect(stand.camera[0]).toBeLessThanOrEqual(side + 1e-9);
    expect(panned.camera[0]).toBeLessThanOrEqual(side + 1e-9);
  });

  it('does not trap a camera that is already inside the case', () => {
    const slot = {
      position: [0, 0, 0] as Vec3,
      rotationY: 0,
      extras: { caster_width: 3.58, caster_depth: 0.72 },
    };
    const keepOut = bookcaseBox(slot, 4.48, BOOKCASE_STANDOFF);
    const spaces = keepOut === undefined ? [] : [keepOut];
    const out = pan(box, [0, 3, 0.2], [0, 3, 1.7], 0, 1, spaces);
    expect(out.camera[1]).toBeCloseTo(4, 9);
  });

  it('stands still when the view is straight up or down, which has no screen right', () => {
    expect(pan(box, [1, 5, 5], [1, 4, 5], 1, 1)).toEqual({ camera: [1, 5, 5], target: [1, 4, 5] });
  });

  it('stands still on a camera with no line of sight', () => {
    expect(pan(box, camera, camera, 1, 1)).toEqual({ camera, target: camera });
  });
});

describe('notchesOf (#626)', () => {
  it('reads a wheel notch as one, forward when the wheel goes up', () => {
    expect(notchesOf(-100, 0)).toBe(1);
    expect(notchesOf(100, 0)).toBe(-1);
  });

  it('reads lines and pages as their pixels, and a trackpad’s small deltas as a part of one', () => {
    expect(notchesOf(-3, 1)).toBeCloseTo(1, 9);
    expect(notchesOf(-10, 0)).toBeCloseTo(0.1, 9);
    expect(notchesOf(-0.25, 2)).toBeCloseTo(1, 9);
  });

  it('never lets one event leap', () => {
    expect(notchesOf(-5000, 0)).toBe(MOST_NOTCHES);
    expect(notchesOf(5000, 0)).toBe(-MOST_NOTCHES);
  });
});
