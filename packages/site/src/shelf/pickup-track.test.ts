import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { schedule } from './pickup-motion.ts';
import { buildTrack, engine, type Stages } from './pickup-track.ts';
import type { Track } from './pickup-state.ts';
import { PICKUP_MOTION } from './shelf-settings.ts';

/**
 * The real GSAP, stepped by hand as the shelf steps it from its frame.
 *
 * Written first in #531's build (spec S4): the track stops at closed going
 * forward and passes that stop going backward, which `addPause` was assumed to
 * do and nobody had run. A fake timeline could not say.
 */
let now = 1000;
const step = (seconds: number): void => {
  now += seconds;
  engine.updateRoot(now);
};

beforeAll(() => {
  // As `createPickup` does: the shelf's frame drives GSAP, never its own ticker.
  engine.ticker.remove(engine.updateRoot);
});

interface Rig {
  readonly stages: Stages;
  readonly track: Track;
  readonly calls: { landed: number; opened: number; returned: number };
}

const rigs: Rig[] = [];
function rig(): Rig {
  const stages: Stages = { s: 0, u: 0, o: 0 };
  const calls = { landed: 0, opened: 0, returned: 0 };
  const track = buildTrack(stages, PICKUP_MOTION, {
    landed: () => {
      calls.landed += 1;
    },
    opened: () => {
      calls.opened += 1;
    },
    returned: () => {
      calls.returned += 1;
    },
  });
  const made = { stages, track, calls };
  rigs.push(made);
  return made;
}

afterEach(() => {
  for (const made of rigs.splice(0)) made.track.dispose();
});

const at = schedule(PICKUP_MOTION);
/** Frames at 60 Hz until `done`, or fail: a track that never arrives must not hang the suite. */
function run(done: () => boolean, seconds = 10): void {
  for (let elapsed = 0; elapsed < seconds && !done(); elapsed += 1 / 60) step(1 / 60);
}

describe('the track, with GSAP running it', () => {
  it('stops once at closed going forward, exactly, and reports it once', () => {
    const { stages, track, calls } = rig();
    track.play();
    run(() => calls.landed > 0);

    expect(calls.landed).toBe(1);
    expect(stages).toMatchObject({ s: 1, u: 1, o: 0 });
    expect(track.progress()).toBeCloseTo(track.closedProgress(), 10);
    // A rest: more frames change nothing and report nothing more.
    for (let frame = 0; frame < 60; frame += 1) step(1 / 60);
    expect(calls).toEqual({ landed: 1, opened: 0, returned: 0 });
    expect(stages.o).toBe(0);
  });

  it('places the rest at the end of the slide and the turn', () => {
    const { track } = rig();

    expect(track.closedProgress()).toBeCloseTo(at.closed / at.end, 10);
    expect(track.closedProgress()).toBeGreaterThan(0);
    expect(track.closedProgress()).toBeLessThan(1);
  });

  it('plays on from the rest to open, and reports the landing only once', () => {
    const { stages, track, calls } = rig();
    track.play();
    run(() => calls.landed > 0);
    track.play();
    run(() => calls.opened > 0);

    expect(stages).toMatchObject({ s: 1, u: 1, o: 1 });
    expect(calls).toEqual({ landed: 1, opened: 1, returned: 0 });
    expect(track.progress()).toBe(1);
  });

  it('passes the stop going backward, never reporting a landing', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.reverse(1.6);
    run(() => calls.returned > 0);

    expect(calls).toEqual({ landed: 0, opened: 0, returned: 1 });
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
    expect(track.progress()).toBe(0);
  });

  it('does not pause going backward: the reverse takes the time it should', () => {
    const { stages, track } = rig();
    track.finishOpen();
    track.reverse(1);
    // Half of the opening stage back, then past the stop by a known amount.
    step(0);
    step(PICKUP_MOTION.open / 2);
    const mid = stages.o;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    step(PICKUP_MOTION.open / 2 + 0.1);

    // Past the stop by 0.1 s, not stuck on it: the slide and the turn are moving.
    expect(stages.o).toBe(0);
    expect(track.progress()).toBeLessThan(track.closedProgress());
    expect(track.progress()).toBeGreaterThan(0);
  });

  it('reverses from the closed rest itself to the shelf', () => {
    const { stages, track, calls } = rig();
    track.finish();
    track.reverse(1.6);
    run(() => calls.returned > 0);

    expect(calls).toEqual({ landed: 0, opened: 0, returned: 1 });
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
  });

  it('stops at the rest on one large forward step, as a stalled tab would deliver', () => {
    const { stages, track, calls } = rig();
    track.play();
    step(0);
    step(100);

    expect(calls).toEqual({ landed: 1, opened: 0, returned: 0 });
    expect(stages).toMatchObject({ s: 1, u: 1, o: 0 });
    expect(track.progress()).toBeCloseTo(track.closedProgress(), 10);

    track.play();
    step(0);
    step(100);
    expect(calls).toEqual({ landed: 1, opened: 1, returned: 0 });
    expect(stages.o).toBe(1);
  });

  it('crosses the stop on one large backward step, and arrives home', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.reverse(1.6);
    step(0);
    step(100);

    expect(calls).toEqual({ landed: 0, opened: 0, returned: 1 });
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
  });

  it('plays a book caught past the stop on to open, without a landing', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.reverse(1);
    step(0);
    step(PICKUP_MOTION.open / 2);
    expect(stages.o).toBeGreaterThan(0);
    expect(stages.o).toBeLessThan(1);
    track.play();
    run(() => calls.opened > 0);

    expect(calls).toEqual({ landed: 0, opened: 1, returned: 0 });
    expect(stages.o).toBe(1);
  });

  it('lands again when caught before the stop on its way back', () => {
    const { stages, track, calls } = rig();
    track.finish();
    track.reverse(1);
    step(0);
    step(0.1);
    expect(stages.o).toBe(0);
    expect(track.progress()).toBeLessThan(track.closedProgress());
    track.play();
    run(() => calls.landed > 0);

    expect(calls).toEqual({ landed: 1, opened: 0, returned: 0 });
    expect(track.progress()).toBeCloseTo(track.closedProgress(), 10);
    expect(stages.o).toBe(0);
  });

  it('lands again when caught on the way back from a stop it reached by playing', () => {
    // The pickup's own path: play to the rest (paused by the stop itself), put
    // back, then catch before it is home. A jump to the rest is another path.
    const { stages, track, calls } = rig();
    track.play();
    run(() => calls.landed > 0);
    track.reverse(1.6);
    step(0);
    step(0.1);
    expect(track.progress()).toBeLessThan(track.closedProgress());
    track.play();
    run(() => calls.landed > 1 || calls.opened > 0, 3);

    expect(calls).toEqual({ landed: 2, opened: 0, returned: 0 });
    expect(stages.o).toBeCloseTo(0, 3);
  });

  it('jumps without reporting anything', () => {
    const { stages, track, calls } = rig();
    track.finish();
    expect(stages).toMatchObject({ s: 1, u: 1 });
    expect(stages.o).toBeCloseTo(0, 3);
    expect(track.progress()).toBeCloseTo(track.closedProgress(), 3);
    track.finishOpen();
    expect(stages).toMatchObject({ s: 1, u: 1, o: 1 });
    track.rewind();
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
    track.seek(0.25);
    expect(track.progress()).toBeCloseTo(0.25, 10);
    expect(calls).toEqual({ landed: 0, opened: 0, returned: 0 });
  });

  it('plays on from a jump to the rest without stopping there again', () => {
    const { stages, track, calls } = rig();
    track.finish();
    track.play();
    run(() => calls.opened > 0);

    expect(calls).toEqual({ landed: 0, opened: 1, returned: 0 });
    expect(stages.o).toBe(1);
  });
});
