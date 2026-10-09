/**
 * The pickup's arithmetic: when each stage starts, how each one eases, how far
 * the cover has opened and how much of the page shows.
 *
 * No `three`, no GSAP and no DOM, so every rule here is a unit test and the
 * modules that do draw (`pickup.ts`) and tune (`pickup-tuner.ts`) only call it.
 */
import { PICKUP_MOTION, type Bezier, type PickupMotion } from './shelf-settings.ts';

/** Where each stage starts on the timeline, and where the last one ends, in seconds. */
export interface Schedule {
  readonly slide: number;
  readonly turn: number;
  readonly open: number;
  readonly end: number;
}

/**
 * The three stages, overlapping as #371 accepted.
 *
 * An overlap is how long before one stage ends the next begins, so it is
 * clamped to the stage it overlaps: no stage starts before its predecessor did.
 */
export function schedule(motion: PickupMotion): Schedule {
  const turn = Math.max(0, motion.slide - Math.min(motion.overlapSlideTurn, motion.slide));
  const open = Math.max(0, turn + motion.turn - Math.min(motion.overlapTurnOpen, motion.turn));
  return {
    slide: 0,
    turn,
    open,
    end: Math.max(motion.slide, turn + motion.turn, open + motion.open),
  };
}

/** The open spread's resting angle, fixed rather than tuned (spec §3.6). */
export const OPEN_DEGREES = 180;

/** The front board's angle for an opening `o` of 0..1, in degrees. */
export function openAngle(o: number): number {
  return OPEN_DEGREES * o;
}

/** Degrees past the fade angle over which the page goes from hidden to shown. */
const FADE_SPAN_DEGREES = 40;

/**
 * How much of the page shows for an opening `o`.
 *
 * WebGL cannot hide a DOM element, so text on the right-hand page would show
 * through a cover still closing over it. It stays hidden until the cover has
 * passed `textFadeFrom` (#369: about 95°), then fades in.
 */
export function textOpacity(o: number, motion: PickupMotion): number {
  const past = (openAngle(o) - motion.textFadeFrom) / FADE_SPAN_DEGREES;
  return Math.min(1, Math.max(0, past));
}

/**
 * CSS's `cubic-bezier()` as an ease function, so GSAP's core needs no
 * `CustomEase` (#370 kept it to `gsap-core`).
 *
 * Solves the curve's x for `t` by Newton's method, falling back to bisection
 * where the slope flattens or Newton leaves the unit interval, then returns
 * the curve's y at that `t`.
 */
export function bezier([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const a = (p1: number, p2: number): number => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number): number => 3 * p2 - 6 * p1;
  const c = (p1: number): number => 3 * p1;
  const at = (t: number, p1: number, p2: number): number =>
    ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number): number =>
    3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = at(t, x1, x2) - x;
      const s = slope(t, x1, x2);
      if (Math.abs(error) < 1e-7 || Math.abs(s) < 1e-6) break;
      t -= error / s;
    }
    if (t < 0 || t > 1 || Math.abs(at(t, x1, x2) - x) > 1e-5) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i += 1) {
        if (at(t, x1, x2) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return at(t, y1, y2);
  };
}

/** The live motion as the constant to paste back into `shelf-settings.ts`. */
export function exportMotion(motion: PickupMotion): string {
  const number = (value: number): string => String(Math.round(value * 1000) / 1000);
  const curve = (value: Bezier): string => `[${value.map(number).join(', ')}]`;
  const lines = (Object.keys(PICKUP_MOTION) as (keyof PickupMotion)[]).map((key) => {
    const value = motion[key];
    return `  ${key}: ${typeof value === 'number' ? number(value) : curve(value)},`;
  });
  return `export const PICKUP_MOTION: PickupMotion = {\n${lines.join('\n')}\n};`;
}
