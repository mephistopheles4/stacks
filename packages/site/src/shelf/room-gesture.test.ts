import { describe, expect, it } from 'vitest';
import { GESTURE_SLOP, createTwoFingerSplit } from './room-gesture.ts';

describe('the split of two fingers into a pinch and a pan (#632)', () => {
  it('moves nothing until the fingers have gone the slop, then gives back all of it', () => {
    const split = createTwoFingerSplit();
    // a midpoint drift short of the slop is a finger resting, not a gesture
    expect(split.move(0, GESTURE_SLOP - 1, 0)).toEqual({ pinch: 0, panX: 0, panY: 0 });
    // the sample that crosses it lets the whole drift out, so no distance is lost to the wait
    const crossed = split.move(0, 4, 3);
    expect(crossed.panX).toBeCloseTo(GESTURE_SLOP + 3, 9);
    expect(crossed.panY).toBeCloseTo(3, 9);
    expect(crossed.pinch).toBe(0);
  });

  it('reads fingers that move together as a pan, and then ignores the distance between them', () => {
    const split = createTwoFingerSplit();
    expect(split.move(1, 30, 0)).toEqual({ pinch: 0, panX: 30, panY: 0 });
    // a pan that drifts apart is still a pan: nothing walks
    expect(split.move(40, 10, 5)).toEqual({ pinch: 0, panX: 10, panY: 5 });
  });

  it('reads fingers that spread or close as a pinch, and then ignores where their midpoint goes', () => {
    const split = createTwoFingerSplit();
    expect(split.move(30, 2, 0)).toEqual({ pinch: 30, panX: 0, panY: 0 });
    expect(split.move(-12, 40, 40)).toEqual({ pinch: -12, panX: 0, panY: 0 });
  });

  it('reads one finger moving with the other held as a pinch', () => {
    // one finger 20 px: the spread changes by 20 and the midpoint by 10
    const split = createTwoFingerSplit();
    expect(split.move(20, 10, 0).pinch).toBe(20);
  });

  it('judges by how far the fingers have gone, not by how far they have wandered', () => {
    const split = createTwoFingerSplit();
    // each sample is under the slop and so is where they have got to: back and forth never decides
    for (let i = 0; i < 20; i += 1) {
      const sign = i % 2 === 0 ? 1 : -1;
      expect(split.move(sign * 8, sign * 8, 0)).toEqual({ pinch: 0, panX: 0, panY: 0 });
    }
  });

  it('starts afresh for each touch', () => {
    const first = createTwoFingerSplit();
    first.move(0, 30, 0);
    const second = createTwoFingerSplit();
    expect(second.move(30, 0, 0).pinch).toBe(30);
  });
});
