import { describe, expect, it } from 'vitest';
import { flicker } from './room-flames-593.ts';

// a minute of frames at 60 fps
const frames = Array.from({ length: 3600 }, (_, i) => i / 60);

describe('flicker (#593 prototype)', () => {
  it('moves: the lean, the height and the glow all change over a minute', () => {
    const seen = frames.map((t) => flicker(t, 0));
    const spread = (pick: (f: (typeof seen)[number]) => number): number =>
      Math.max(...seen.map(pick)) - Math.min(...seen.map(pick));
    expect(spread((f) => f.sway)).toBeGreaterThan(0.1);
    expect(spread((f) => f.stretch)).toBeGreaterThan(0.1);
    expect(spread((f) => f.glow)).toBeGreaterThan(0.1);
  });

  it('stays a candle flame: never leans past a fifth of its height or doubles', () => {
    for (const seed of [0, 1, 2]) {
      for (const t of frames) {
        const f = flicker(t, seed);
        expect(Math.abs(f.sway)).toBeLessThan(0.2);
        expect(f.stretch).toBeGreaterThan(0.85);
        expect(f.stretch).toBeLessThan(1.25);
        expect(f.glow).toBeGreaterThan(0.75);
        expect(f.glow).toBeLessThan(1.2);
      }
    }
  });

  it('burns out of step: two candles do not lean together', () => {
    const a = frames.map((t) => flicker(t, 0).sway);
    const b = frames.map((t) => flicker(t, 1).sway);
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    const [ma, mb] = [mean(a), mean(b)];
    const cov = mean(a.map((x, i) => (x - ma) * ((b[i] ?? 0) - mb)));
    const sd = (xs: number[], m: number): number => Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    expect(Math.abs(cov / (sd(a, ma) * sd(b, mb)))).toBeLessThan(0.8);
  });
});
