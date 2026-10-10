import { describe, expect, it } from 'vitest';
import {
  KEY_STEP,
  PITCH_LIMIT,
  SQUARE,
  TAP_SLOP_PX,
  dragTurn,
  isTurnKey,
  keyTurn,
  press,
  type Turn,
} from './book-turn.ts';

const deg = (radians: number): number => (radians * 180) / Math.PI;
const rad = (degrees: number): number => (degrees * Math.PI) / 180;

describe('the limits', () => {
  it('clamps pitch to 75° and a key step to 15° (spec S3)', () => {
    expect(deg(PITCH_LIMIT)).toBeCloseTo(75);
    expect(deg(KEY_STEP)).toBeCloseTo(15);
  });
});

describe('a drag', () => {
  it('turns in proportion to the distance, against the short side', () => {
    const half = dragTurn(SQUARE, 100, 0, 800);
    const full = dragTurn(SQUARE, 200, 0, 800);
    expect(full.yaw).toBeCloseTo(2 * half.yaw);
  });

  it('turns a phone and a desktop alike for the same fraction of the screen', () => {
    const phone = dragTurn(SQUARE, 37.5, 0, 375);
    const desktop = dragTurn(SQUARE, 80, 0, 800);
    expect(phone.yaw).toBeCloseTo(desktop.yaw);
  });

  it('turns the book the way the finger goes: right is positive yaw, down is positive pitch', () => {
    expect(dragTurn(SQUARE, 50, 0, 500).yaw).toBeGreaterThan(0);
    expect(dragTurn(SQUARE, -50, 0, 500).yaw).toBeLessThan(0);
    expect(dragTurn(SQUARE, 0, 50, 500).pitch).toBeGreaterThan(0);
    expect(dragTurn(SQUARE, 0, -50, 500).pitch).toBeLessThan(0);
  });

  it('keeps yaw free all the way round, wrapped so square is never far', () => {
    let turn: Turn = SQUARE;
    for (let step = 0; step < 40; step += 1) turn = dragTurn(turn, 100, 0, 500);
    expect(turn.yaw).toBeGreaterThan(-Math.PI);
    expect(turn.yaw).toBeLessThanOrEqual(Math.PI);
  });

  it('clamps pitch at ±75° so the book never flips over', () => {
    expect(dragTurn(SQUARE, 0, 100_000, 500).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(dragTurn(SQUARE, 0, -100_000, 500).pitch).toBeCloseTo(-PITCH_LIMIT);
  });

  it('does nothing on a viewport with no short side', () => {
    expect(dragTurn(SQUARE, 50, 50, 0)).toEqual(SQUARE);
  });
});

describe('the keys', () => {
  it('turn 15° a press: left and right for yaw, up and down for pitch', () => {
    expect(deg(keyTurn(SQUARE, 'ArrowRight')?.yaw ?? NaN)).toBeCloseTo(15);
    expect(deg(keyTurn(SQUARE, 'ArrowLeft')?.yaw ?? NaN)).toBeCloseTo(-15);
    expect(deg(keyTurn(SQUARE, 'ArrowDown')?.pitch ?? NaN)).toBeCloseTo(15);
    expect(deg(keyTurn(SQUARE, 'ArrowUp')?.pitch ?? NaN)).toBeCloseTo(-15);
  });

  it('accumulate, and stop at the pitch limit', () => {
    let turn: Turn = SQUARE;
    for (let press = 0; press < 10; press += 1) turn = keyTurn(turn, 'ArrowDown') ?? turn;
    expect(turn.pitch).toBeCloseTo(PITCH_LIMIT);
  });

  it('wrap yaw rather than grow without bound', () => {
    let turn: Turn = SQUARE;
    for (let press = 0; press < 30; press += 1) turn = keyTurn(turn, 'ArrowRight') ?? turn;
    // 30 × 15° = 450° = 90° once wrapped.
    expect(deg(turn.yaw)).toBeCloseTo(90);
  });

  it('square the book again on Home', () => {
    const turned: Turn = { yaw: rad(120), pitch: rad(-40) };
    expect(keyTurn(turned, 'Home')).toEqual(SQUARE);
  });

  it('leave every other key alone', () => {
    expect(keyTurn(SQUARE, 'a')).toBeUndefined();
    expect(isTurnKey('a')).toBe(false);
    expect(isTurnKey('Escape')).toBe(false);
    expect(isTurnKey('Home')).toBe(true);
    expect(isTurnKey('ArrowUp')).toBe(true);
  });
});

describe('a press', () => {
  it('is a tap when it moves less than 6 CSS px', () => {
    const p = press(100, 100);
    p.move(102, 103);
    expect(p.isTap()).toBe(true);
    expect(TAP_SLOP_PX).toBe(6);
  });

  it('is a drag at 6 px, whichever direction it went', () => {
    const p = press(100, 100);
    p.move(106, 100);
    expect(p.isTap()).toBe(false);
  });

  it('stays a drag once it has gone far, even if it comes back to where it began', () => {
    const p = press(100, 100);
    p.move(200, 100);
    p.move(100, 100);
    expect(p.isTap()).toBe(false);
  });

  it('measures the straight-line distance, not each axis alone', () => {
    const p = press(0, 0);
    p.move(4.5, 4.5);
    expect(p.isTap()).toBe(false);
  });
});
