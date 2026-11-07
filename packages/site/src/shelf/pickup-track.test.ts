import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { schedule } from './pickup-motion.ts';
import { buildTrack, engine, type Stages } from './pickup-track.ts';
import { createPickupState, type PickupState, type Track } from './pickup-state.ts';
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
  readonly calls: { landed: number; opened: number; closed: number; returned: number };
}

const rigs: Rig[] = [];
function rig(): Rig {
  const stages: Stages = { s: 0, u: 0, o: 0 };
  const calls = { landed: 0, opened: 0, closed: 0, returned: 0 };
  const track = buildTrack(stages, PICKUP_MOTION, {
    landed: () => {
      calls.landed += 1;
    },
    opened: () => {
      calls.opened += 1;
    },
    closed: () => {
      calls.closed += 1;
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
    expect(calls).toEqual({ landed: 1, opened: 0, closed: 0, returned: 0 });
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
    expect(calls).toEqual({ landed: 1, opened: 1, closed: 0, returned: 0 });
    expect(track.progress()).toBe(1);
  });

  it('passes the stop going backward, never reporting a landing', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.reverse(1.6);
    run(() => calls.returned > 0);

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 0, returned: 1 });
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

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 0, returned: 1 });
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
  });

  it('stops at the rest on one large forward step, as a stalled tab would deliver', () => {
    const { stages, track, calls } = rig();
    track.play();
    step(0);
    step(100);

    expect(calls).toEqual({ landed: 1, opened: 0, closed: 0, returned: 0 });
    expect(stages).toMatchObject({ s: 1, u: 1, o: 0 });
    expect(track.progress()).toBeCloseTo(track.closedProgress(), 10);

    track.play();
    step(0);
    step(100);
    expect(calls).toEqual({ landed: 1, opened: 1, closed: 0, returned: 0 });
    expect(stages.o).toBe(1);
  });

  it('crosses the stop on one large backward step, and arrives home', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.reverse(1.6);
    step(0);
    step(100);

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 0, returned: 1 });
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

    expect(calls).toEqual({ landed: 0, opened: 1, closed: 0, returned: 0 });
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

    expect(calls).toEqual({ landed: 1, opened: 0, closed: 0, returned: 0 });
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

    expect(calls).toEqual({ landed: 2, opened: 0, closed: 0, returned: 0 });
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
    expect(calls).toEqual({ landed: 0, opened: 0, closed: 0, returned: 0 });
  });

  it('plays on from a jump to the rest without stopping there again', () => {
    const { stages, track, calls } = rig();
    track.finish();
    track.play();
    run(() => calls.opened > 0);

    expect(calls).toEqual({ landed: 0, opened: 1, closed: 0, returned: 0 });
    expect(stages.o).toBe(1);
  });
});

describe('closing an open book: back to the closed rest (#553)', () => {
  it('runs back from open and holds at the closed rest, reporting it once', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.close();
    run(() => calls.closed > 0);

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 1, returned: 0 });
    expect(stages).toMatchObject({ s: 1, u: 1, o: 0 });
    expect(track.atClosedRest()).toBe(true);
    // A rest: more frames change nothing and report nothing more.
    for (let frame = 0; frame < 60; frame += 1) step(1 / 60);
    expect(calls).toEqual({ landed: 0, opened: 0, closed: 1, returned: 0 });
    expect(track.atClosedRest()).toBe(true);
  });

  it("takes the opening stage's own time, not the return's", () => {
    const { stages, track } = rig();
    track.finishOpen();
    track.close();
    step(0);
    step(PICKUP_MOTION.open / 2);

    expect(stages.o).toBeGreaterThan(0);
    expect(stages.o).toBeLessThan(1);
  });

  it('holds at the rest on one large step, as a stalled tab would deliver', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.close();
    step(0);
    step(100);

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 1, returned: 0 });
    expect(stages).toMatchObject({ s: 1, u: 1, o: 0 });
  });

  it('opens again when played on from the rest a close parked it on', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.close();
    run(() => calls.closed > 0);
    track.play();
    run(() => calls.opened > 0);

    expect(calls).toEqual({ landed: 0, opened: 1, closed: 1, returned: 0 });
    expect(stages.o).toBe(1);
  });

  it('goes home past the stop when put back from the rest a close parked it on', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.close();
    run(() => calls.closed > 0);
    track.reverse(1.6);
    run(() => calls.returned > 0);

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 1, returned: 1 });
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
  });

  it('goes home when put back partway through a close: the hold is disarmed', () => {
    const { stages, track, calls } = rig();
    track.finishOpen();
    track.close();
    step(0);
    step(PICKUP_MOTION.open / 2);
    track.reverse(1.6);
    run(() => calls.returned > 0);

    expect(calls).toEqual({ landed: 0, opened: 0, closed: 0, returned: 1 });
    expect(stages).toMatchObject({ s: 0, u: 0, o: 0 });
  });

  it('a put-back after a close never holds at the stop, however large the step', () => {
    const { track, calls } = rig();
    track.finishOpen();
    track.close();
    run(() => calls.closed > 0);
    track.finishOpen();
    track.reverse(1.6);
    step(0);
    step(100);

    expect(calls.returned).toBe(1);
    expect(calls.closed).toBe(1);
  });
});

describe('where the track reads itself to be', () => {
  it('is on the closed rest on the stop, and on the hair past it that a jump parks on', () => {
    const { track } = rig();
    track.finish();
    expect(track.atClosedRest()).toBe(true);
    track.reverse(1.6);
    // Put back and caught before a frame ran: it has not moved.
    expect(track.atClosedRest()).toBe(true);
    step(0);
    step(0.1);
    expect(track.atClosedRest()).toBe(false);
  });

  it('is on the closed rest where it stopped by playing, and off it elsewhere', () => {
    const { track, calls } = rig();
    expect(track.atClosedRest()).toBe(false);
    track.play();
    run(() => calls.landed > 0);
    expect(track.atClosedRest()).toBe(true);
    track.finishOpen();
    expect(track.atClosedRest()).toBe(false);
  });

  it('is at the end only at the far end', () => {
    const { track } = rig();
    expect(track.atEnd()).toBe(false);
    track.finish();
    expect(track.atEnd()).toBe(false);
    track.finishOpen();
    expect(track.atEnd()).toBe(true);
    track.reverse(1.6);
    expect(track.atEnd()).toBe(true);
    step(0);
    step(0.1);
    expect(track.atEnd()).toBe(false);
  });
});

describe('the pickup state on the real track: put back and caught within a frame', () => {
  /** The state machine with the real timeline under it, and nothing else real. */
  function pickup() {
    const stages: Stages = { s: 0, u: 0, o: 0 };
    let pushed = false;
    const log: string[] = [];
    const state: PickupState<string> = createPickupState<string>({
      track: (_book, events) => buildTrack(stages, PICKUP_MOTION, events),
      left: () => undefined,
      landed: () => log.push('landed'),
      opening: () => log.push('opening'),
      opened: () => log.push('opened'),
      settled: () => log.push('settled'),
      announce: () => undefined,
      closing: () => log.push('closing'),
      reduced: () => false,
      returnSpeed: () => PICKUP_MOTION.returnSpeed,
      history: {
        held: () => pushed,
        push: () => {
          pushed = true;
        },
        replace: () => undefined,
        back: () => {
          pushed = false;
          state.popped();
        },
      },
    });
    const frames = (seconds: number): void => {
      step(0);
      for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) step(1 / 60);
    };
    return { state, stages, log, frames };
  }

  it('lands closed each time, however often it is caught, and never opens by itself', () => {
    const { state, stages, log, frames } = pickup();
    state.select('a');
    frames(3);
    expect(state.closed()).toBe(true);

    // Put back and caught with no frame between, three times in a row: the second and
    // third start from the rest the first catch parked the book on.
    for (let catches = 0; catches < 3; catches += 1) {
      state.putBack();
      state.select('a');
      expect(state.closed()).toBe(true);
    }
    // Then left alone: still closed, the opening stage untouched.
    frames(3);
    expect(state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(stages.o).toBeCloseTo(0, 3);
    expect(log).not.toContain('opening');
    expect(log).not.toContain('opened');
  });

  it('is open again when an open book is caught within a frame, and settles', () => {
    const { state, stages, log, frames } = pickup();
    state.select('a');
    frames(3);
    state.open();
    frames(3);
    expect(state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });

    state.putBack();
    state.select('a');
    expect(state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    frames(1);
    expect(stages.o).toBeCloseTo(1, 3);
    expect(log.at(-1)).toBe('opened');

    // And it goes back from there as from any open book.
    state.putBack();
    frames(3);
    expect(state.holding()).toBeUndefined();
    expect(log.at(-1)).toBe('settled');
  });
});
