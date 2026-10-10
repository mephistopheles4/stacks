/**
 * How a closed book in your hand is turned: the rules, with no `three` and no
 * DOM, so each one is a unit test (#418, spec S3).
 *
 * A turn is a yaw and a pitch, in radians, about the camera's own axes — the
 * screen's vertical and horizontal — never a roll. **Yaw is free** all the way
 * round and wrapped, so squaring the book again is never more than half a turn.
 * **Pitch is clamped to ±75°**: the head and the tail can be seen, and the book
 * never goes upside down.
 *
 * `pickup.ts` composes the turn after the pose that squares the book to the
 * camera; `book-viewer.ts` reads the pointer and the keys and calls these.
 */

export interface Turn {
  readonly yaw: number;
  readonly pitch: number;
}

/** Square to the camera: the cover towards the viewer, the head up. */
export const SQUARE: Turn = { yaw: 0, pitch: 0 };

const DEGREE = Math.PI / 180;

/** The pitch the book may reach either way: head and tail show, it never flips. */
export const PITCH_LIMIT = 75 * DEGREE;

/** One arrow-key press. */
export const KEY_STEP = 15 * DEGREE;

/** A press that moves less than this, in CSS pixels, is a tap, not a drag. */
export const TAP_SLOP_PX = 6;

/** Dragging the viewport's short side turns the book half way round. */
const TURN_PER_SHORT_SIDE = Math.PI;

const wrap = (yaw: number): number => {
  const wrapped = yaw - 2 * Math.PI * Math.round(yaw / (2 * Math.PI));
  // `round` puts exactly half a turn on either side; keep it on the positive one.
  return wrapped <= -Math.PI ? wrapped + 2 * Math.PI : wrapped;
};
const clamp = (pitch: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

const made = (yaw: number, pitch: number): Turn => ({ yaw: wrap(yaw), pitch: clamp(pitch) });

/**
 * A drag of `dx`, `dy` CSS pixels. Measured against the viewport's short side,
 * so a phone and a desktop turn alike for the same fraction of the screen.
 * Right is positive yaw and down is positive pitch: the near face follows the
 * finger.
 */
export function dragTurn(turn: Turn, dx: number, dy: number, shortSide: number): Turn {
  if (!(shortSide > 0)) return turn;
  const scale = TURN_PER_SHORT_SIDE / shortSide;
  return made(turn.yaw + dx * scale, turn.pitch + dy * scale);
}

const TURN_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home']);

/** Whether this key turns the book, so a handler can claim it and no other. */
export function isTurnKey(key: string): boolean {
  return TURN_KEYS.has(key);
}

/** The turn after one press of `key`, or nothing for a key that does not turn the book. */
export function keyTurn(turn: Turn, key: string): Turn | undefined {
  switch (key) {
    case 'ArrowRight':
      return made(turn.yaw + KEY_STEP, turn.pitch);
    case 'ArrowLeft':
      return made(turn.yaw - KEY_STEP, turn.pitch);
    case 'ArrowDown':
      return made(turn.yaw, turn.pitch + KEY_STEP);
    case 'ArrowUp':
      return made(turn.yaw, turn.pitch - KEY_STEP);
    case 'Home':
      return SQUARE;
    default:
      return undefined;
  }
}

/** One pointer press, from down to up. */
export interface Press {
  move(x: number, y: number): void;
  /** Whether it never travelled `TAP_SLOP_PX` from where it began, even and back. */
  isTap(): boolean;
}

export function press(x: number, y: number): Press {
  let farthest = 0;
  return {
    move(nx, ny) {
      farthest = Math.max(farthest, Math.hypot(nx - x, ny - y));
    },
    isTap: () => farthest < TAP_SLOP_PX,
  };
}
