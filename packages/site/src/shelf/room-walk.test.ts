import { describe, expect, it } from 'vitest';
import { MOST_NOTCHES, notchesOf } from './room-walk.ts';

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
