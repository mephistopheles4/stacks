import { describe, expect, it } from 'vitest';
import { type Box, type Vec3, contains } from './room-data.ts';
import { MOST_NOTCHES, notchesOf, walk } from './room-walk.ts';

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

  it('does not stop at the page’s nearest distance: ten steps walk ten steps', () => {
    let stand = { camera, target };
    for (let i = 0; i < 10; i += 1) {
      stand = walk(box, stand.camera, stand.target, 0.5, radius, NEAREST);
    }
    expect(length(stand.camera, camera)).toBeCloseTo(5, 6);
  });

  it('stops at the face, and the camera stays in the box', () => {
    const stood = walk(box, camera, target, 100, radius, NEAREST);
    expect(contains(box, stood.camera)).toBe(true);
    const back = walk(box, camera, target, -100, radius, NEAREST);
    expect(contains(box, back.camera)).toBe(true);
    expect(back.camera[2]).toBeCloseTo(12.452, 6);
    expect(length(stood.camera, camera)).toBeLessThan(100);
  });

  it('keeps the target in the box while the camera walks to the far face, never nearer than `nearest`', () => {
    const stood = walk(box, camera, target, 100, radius, NEAREST);
    expect(length(stood.camera, stood.target)).toBeGreaterThanOrEqual(NEAREST - 1e-9);
    const mid = walk(box, camera, target, 8, radius, NEAREST);
    expect(contains(box, mid.target)).toBe(true);
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

describe('notchesOf (#626)', () => {
  it('reads a wheel notch as one, forward when the wheel goes up', () => {
    expect(notchesOf(-100, 0)).toBe(1);
    expect(notchesOf(100, 0)).toBe(-1);
  });

  it('reads lines and pages as their pixels, and a trackpad’s small deltas as a part of one', () => {
    expect(notchesOf(-3, 1)).toBeCloseTo(0.48, 9);
    expect(notchesOf(-10, 0)).toBeCloseTo(0.1, 9);
  });

  it('never lets one event leap', () => {
    expect(notchesOf(-5000, 0)).toBe(MOST_NOTCHES);
    expect(notchesOf(5000, 0)).toBe(-MOST_NOTCHES);
  });
});
