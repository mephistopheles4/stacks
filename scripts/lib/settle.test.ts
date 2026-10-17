/**
 * The settle helper's one piece of pure logic: how many frames the renderer's
 * reading has held still. An ordinary unit test, not a gate.
 *
 * Nothing here touches a page: the page records one reading per animation frame
 * and the gate hands the list over, so the count can be specced in Node.
 */

import { describe, expect, it } from 'vitest';
import { framesUnchanged, hasSettled, SETTLE_FRAMES } from './settle.ts';

describe('framesUnchanged — the length of the run a list of readings ends in', () => {
  it('counts the readings equal to the last one, back to the first that differs', () => {
    expect(framesUnchanged(['60|7', '66|8', '67|8', '67|8', '67|8'])).toBe(3);
  });

  it('is zero for no readings, because no frame has been seen', () => {
    expect(framesUnchanged([])).toBe(0);
  });

  it('is one for a single reading', () => {
    expect(framesUnchanged(['67|8'])).toBe(1);
  });

  it('restarts when the reading moves, even back to a value seen before', () => {
    expect(framesUnchanged(['67|8', '67|8', '68|8', '67|8'])).toBe(1);
  });
});

describe('hasSettled — held still for the required number of frames', () => {
  it('is false one frame short and true at the count', () => {
    const still = Array.from({ length: SETTLE_FRAMES }, () => '67|8');
    expect(hasSettled(still.slice(1))).toBe(false);
    expect(hasSettled(still)).toBe(true);
  });

  it('is false when the last reading moved, however long the run before it', () => {
    const still = Array.from({ length: SETTLE_FRAMES * 3 }, () => '67|8');
    expect(hasSettled([...still, '68|8'])).toBe(false);
  });

  it('settles on 10 frames, the spec figure', () => {
    expect(SETTLE_FRAMES).toBe(10);
  });
});
