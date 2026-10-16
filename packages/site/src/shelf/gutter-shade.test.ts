import { describe, expect, it } from 'vitest';
import { GUTTER_DARKEN, GUTTER_REACH, gutterStops, type GutterStop } from './gutter-shade.ts';

describe.each([
  ['the left page, its gutter at +x', 1 as const],
  ['the right page, its gutter at -x', -1 as const],
])('the gutter shade on %s', (_name, side) => {
  const gutter = side * 0.5;
  const distance = (x: number): number => Math.abs(gutter - x);
  // Called inside each test, never at collection: a throw there is a file
  // error, which a mutation run does not count as a kill.
  const read = (): { stops: GutterStop[]; byDistance: GutterStop[] } => {
    const stops = gutterStops(side);
    return { stops, byDistance: [...stops].sort((a, b) => distance(a.x) - distance(b.x)) };
  };

  it('spans the whole sheet, edge to edge, in ascending x', () => {
    const { stops } = read();
    expect(stops[0]?.x).toBe(-0.5);
    expect(stops.at(-1)?.x).toBe(0.5);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]?.x).toBeGreaterThan(stops[i - 1]?.x ?? Infinity);
    }
  });

  it('is darkest on the fold itself', () => {
    const { byDistance } = read();
    expect(byDistance[0]?.x).toBe(gutter);
    expect(byDistance[0]?.shade).toBeCloseTo(1 - GUTTER_DARKEN, 9);
  });

  it('brightens all the way out, and leaves the page past its reach untouched', () => {
    const { stops, byDistance } = read();
    for (let i = 1; i < byDistance.length; i++) {
      expect(byDistance[i]?.shade).toBeGreaterThan(byDistance[i - 1]?.shade ?? Infinity);
      if (distance(byDistance[i]?.x ?? 0) >= GUTTER_REACH) break;
    }
    for (const stop of stops) {
      if (distance(stop.x) >= GUTTER_REACH) expect(stop.shade).toBe(1);
    }
  });

  it('falls off steepest at the fold, as a page curving into it would', () => {
    const { byDistance } = read();
    const slope = (a: number, b: number): number => {
      const [p, q] = [byDistance[a], byDistance[b]];
      if (p === undefined || q === undefined) throw new Error('missing stop');
      return (q.shade - p.shade) / (distance(q.x) - distance(p.x));
    };
    expect(slope(0, 1)).toBeGreaterThan(slope(byDistance.length - 3, byDistance.length - 2));
  });
});

it('mirrors one page onto the other', () => {
  const left = gutterStops(1);
  const right = gutterStops(-1);
  expect(right.map((s) => s.shade)).toEqual([...left].reverse().map((s) => s.shade));
  expect(right.map((s) => s.x)).toEqual([...left].reverse().map((s) => -s.x));
});
