/**
 * One book's pickup as a GSAP timeline that rests closed in the hand (#531).
 *
 * No `three` and no DOM, so the stop is a unit test against the real library:
 * the timeline `pickup.ts` plays and the one `pickup-track.test.ts` plays are
 * built by the same function.
 *
 * **The track runs from the shelf (0) to open in the hand (1) and stops once on
 * the way: closed and cover-on, the end of the slide and the turn.** Playing
 * forward it pauses there exactly, however large the step that crossed it, and
 * reports `landed`. Playing on from the stop opens the book and reports
 * `opened` at the end. Playing backward it passes the stop without a frame's
 * pause and reports `returned` at the shelf, and never `landed`: a book on its
 * way back must not read as closed at rest.
 *
 * The mechanism is `addPause`, measured rather than assumed: it snaps the
 * playhead to the stop in either direction, and it pauses a reverse as well,
 * which is why the callback resumes one. A plain callback was tried and
 * overshoots on a large step, and a pause called from it re-fires from the stop.
 *
 * **GSAP's slice is declared here** (spec §3.8). The repo's type-aware lint
 * cannot resolve the timeline type `gsap/gsap-core` returns, and every call on
 * it then reads as unsafe (#371). The cost of a local slice is that an upgrade
 * can drift from it silently; this module's test runs the real library.
 */
import { gsap } from 'gsap/gsap-core';
import { bezier, schedule } from './pickup-motion.ts';
import type { Track, TrackEvents } from './pickup-state.ts';
import type { PickupMotion } from './shelf-settings.ts';

export interface Timeline {
  fromTo(
    target: object,
    from: Readonly<Record<string, number>>,
    to: Readonly<Record<string, unknown>>,
    position: number,
  ): Timeline;
  addPause(position: number, callback: () => void): Timeline;
  eventCallback(type: 'onComplete' | 'onReverseComplete', callback: () => void): Timeline;
  progress(): number;
  progress(value: number, suppressEvents: boolean): Timeline;
  play(): Timeline;
  pause(): Timeline;
  pause(atTime: number, suppressEvents: boolean): Timeline;
  resume(): Timeline;
  reverse(): Timeline;
  reversed(): boolean;
  timeScale(value: number): Timeline;
  duration(): number;
  kill(): void;
}
interface Engine {
  timeline(vars: { readonly paused: boolean }): Timeline;
  readonly ticker: { remove(callback: unknown): void; sleep(): void };
  /** A property, not a method: it is handed to the ticker unbound. */
  readonly updateRoot: (seconds: number) => void;
}
export const engine = gsap as unknown as Engine;

/** The three stages' progress, 0..1 each, tweened by the track. */
export interface Stages {
  s: number;
  u: number;
  o: number;
}

/** A fresh, paused track tweening `stages`, reporting its stop and its ends through `events`. */
export function buildTrack(stages: Stages, motion: PickupMotion, events: TrackEvents): Track {
  const at = schedule(motion);
  const tl = engine.timeline({ paused: true });
  tl.fromTo(
    stages,
    { s: 0 },
    { s: 1, duration: motion.slide, ease: bezier(motion.easeSlide) },
    at.slide,
  );
  tl.fromTo(
    stages,
    { u: 0 },
    { u: 1, duration: motion.turn, ease: bezier(motion.easeTurn) },
    at.turn,
  );
  tl.fromTo(
    stages,
    { o: 0 },
    { o: 1, duration: motion.open, ease: bezier(motion.easeOpen) },
    at.open,
  );
  tl.addPause(at.closed, () => {
    if (tl.reversed()) tl.resume();
    else events.landed();
  });
  tl.eventCallback('onComplete', events.opened);
  tl.eventCallback('onReverseComplete', events.returned);
  return trackOf(tl, at.closed);
}

/** How far past the stop a jump to the closed rest lands, in seconds: far below a frame. */
const REST_PAST_STOP = 1e-4;

/** `closed` is the stop's time on the timeline, in seconds. */
function trackOf(tl: Timeline, closed: number): Track {
  const stop = (): number => {
    const length = tl.duration();
    return length === 0 ? 0 : closed / length;
  };
  return {
    play: () => {
      tl.timeScale(1).play();
    },
    reverse: (speed) => {
      tl.timeScale(speed).reverse();
    },
    finish: () => {
      // A hair past the stop, never on it: a pause placed exactly on an addPause
      // fires it again when played on, and the book would stop where it stands.
      tl.pause(closed + REST_PAST_STOP, true);
    },
    finishOpen: () => {
      tl.pause().progress(1, true);
    },
    rewind: () => {
      tl.pause().progress(0, true);
    },
    seek: (progress) => {
      tl.pause().progress(progress, true);
    },
    progress: () => tl.progress(),
    closedProgress: stop,
    dispose: () => {
      tl.kill();
    },
  };
}
