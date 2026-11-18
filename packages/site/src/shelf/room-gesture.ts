/**
 * Two fingers on the glass are a pinch (walk) or a drag (pan), never both (#632).
 *
 * Every two-finger touch starts undecided. The spread (the distance between the fingers) and the
 * midpoint are summed from the start of the touch, and the touch is decided the first time either has
 * gone `GESTURE_SLOP` pixels **net** — how far it has got, not how far it has wandered, so two fingers
 * resting on the glass never decide. It is a pinch when the spread has gone at least as far as the
 * midpoint, a pan when the midpoint has gone further:
 *
 * - fingers moving apart or together move the spread by their whole travel and the midpoint by none;
 * - fingers moving the same way move the midpoint by their whole travel and the spread by none;
 * - one finger moving with the other held moves the spread by the travel and the midpoint by half of
 *   it, a pinch (a thumb held and a finger drawn away).
 *
 * **The decision holds until the fingers lift.** A hand never keeps its fingers exactly the same
 * distance apart, so a pan that could also walk would drift forward and back as it went. What went
 * before the decision is given back in the sample that makes it, so the wait loses no distance.
 *
 * No `three` and no DOM, so vitest's node environment runs every rule here.
 */

/** Pixels the fingers must go, net, before a touch is a pinch or a pan: about a thumb's width of jitter on a phone. */
export const GESTURE_SLOP = 10;

/** What one sample of the fingers asks for: the pinch's change of spread, and the pan's midpoint movement, in pixels. */
export interface Move {
  readonly pinch: number;
  readonly panX: number;
  readonly panY: number;
}

export interface TwoFingerSplit {
  /** One sample: how much the spread changed, and how far the midpoint moved, since the last. */
  move(spread: number, midX: number, midY: number): Move;
}

const NOTHING: Move = { pinch: 0, panX: 0, panY: 0 };

export function createTwoFingerSplit(slop = GESTURE_SLOP): TwoFingerSplit {
  let mode: 'undecided' | 'pinch' | 'pan' = 'undecided';
  let spread = 0;
  let midX = 0;
  let midY = 0;
  return {
    move(dSpread, dX, dY) {
      if (mode === 'undecided') {
        spread += dSpread;
        midX += dX;
        midY += dY;
        const travelled = Math.hypot(midX, midY);
        if (Math.max(Math.abs(spread), travelled) < slop) return NOTHING;
        mode = Math.abs(spread) >= travelled ? 'pinch' : 'pan';
        return mode === 'pinch'
          ? { pinch: spread, panX: 0, panY: 0 }
          : { pinch: 0, panX: midX, panY: midY };
      }
      return mode === 'pinch'
        ? { pinch: dSpread, panX: 0, panY: 0 }
        : { pinch: 0, panX: dX, panY: dY };
    },
  };
}
