import { describe, expect, it } from 'vitest';
import { bezier, exportMotion, openAngle, schedule, textOpacity } from './pickup-motion.ts';
import { PICKUP_MOTION } from './shelf-settings.ts';

describe('schedule', () => {
  it('overlaps the stages as #371 accepted: about 1.3 s from click to text', () => {
    const at = schedule(PICKUP_MOTION);

    expect(at.slide).toBe(0);
    expect(at.turn).toBeCloseTo(0.35 - 0.12);
    expect(at.open).toBeCloseTo(0.23 + 0.7 - 0.2);
    expect(at.end).toBeCloseTo(1.33);
  });

  it('runs the stages back to back when nothing overlaps', () => {
    const at = schedule({ ...PICKUP_MOTION, overlapSlideTurn: 0, overlapTurnOpen: 0 });

    expect(at.turn).toBeCloseTo(0.35);
    expect(at.open).toBeCloseTo(1.05);
    expect(at.end).toBeCloseTo(1.65);
  });

  it('never starts a stage before the one it overlaps began', () => {
    const at = schedule({ ...PICKUP_MOTION, overlapSlideTurn: 5, overlapTurnOpen: 5 });

    expect(at.turn).toBe(0);
    expect(at.open).toBe(0);
    expect(at.end).toBeCloseTo(0.7);
  });
});

describe('bezier', () => {
  it('is pinned at both ends', () => {
    const ease = bezier(PICKUP_MOTION.easeTurn);

    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it('is the identity for the linear curve', () => {
    const linear = bezier([0, 0, 1, 1]);

    for (const x of [0.1, 0.25, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 4);
  });

  it("matches CSS's ease-in-out at its midpoint, and rises monotonically", () => {
    const easeInOut = bezier([0.42, 0, 0.58, 1]);

    expect(easeInOut(0.5)).toBeCloseTo(0.5, 4);
    let last = 0;
    for (let x = 0.05; x < 1; x += 0.05) {
      const y = easeInOut(x);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
    }
  });

  it('eases out where the curve says: a fast start reads past the line', () => {
    expect(bezier([0, 0, 0.2, 1])(0.3)).toBeGreaterThan(0.5);
  });
});

describe('openAngle and textOpacity', () => {
  it('opens the cover to 180° and no further', () => {
    expect(openAngle(0)).toBe(0);
    expect(openAngle(0.5)).toBe(90);
    expect(openAngle(1)).toBe(180);
  });

  it('keeps the text hidden until the cover passes the fade angle (#369)', () => {
    expect(textOpacity(0, PICKUP_MOTION)).toBe(0);
    expect(textOpacity(95 / 180, PICKUP_MOTION)).toBe(0);
    expect(textOpacity(1, PICKUP_MOTION)).toBe(1);
    const between = textOpacity(130 / 180, PICKUP_MOTION);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
  });
});

describe('exportMotion', () => {
  it('prints the constant to paste back, every key in the shipped order', () => {
    const printed = exportMotion({ ...PICKUP_MOTION, slide: 0.4567, easeOpen: [0.1, 0, 0.3, 1] });

    expect(
      printed.startsWith('export const PICKUP_MOTION: PickupMotion = {\n  slide: 0.457,'),
    ).toBe(true);
    expect(printed).toContain('  easeOpen: [0.1, 0, 0.3, 1],');
    expect(printed.trimEnd().endsWith('};')).toBe(true);
    expect(printed.split('\n')).toHaveLength(Object.keys(PICKUP_MOTION).length + 2);
  });
});
