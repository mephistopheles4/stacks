import { describe, expect, it } from 'vitest';
import { loadFraction } from './room-loading-593.ts';

const start = { glbLoaded: 0, glbTotal: 0, glbDone: false, texLoaded: 0, texTotal: 0 };

describe('loadFraction (#593 prototype)', () => {
  it('starts at nothing', () => {
    expect(loadFraction(start)).toBe(0);
  });

  it('reaches the whole only once the GLB and every texture are in', () => {
    const glbIn = { ...start, glbLoaded: 100, glbTotal: 100, glbDone: true };
    expect(loadFraction({ ...glbIn, texLoaded: 29, texTotal: 30 })).toBeLessThan(1);
    expect(loadFraction({ ...glbIn, texLoaded: 30, texTotal: 30 })).toBe(1);
  });

  it('counts the GLB by its bytes while it downloads', () => {
    const quarter = loadFraction({ ...start, glbLoaded: 25, glbTotal: 100 });
    const half = loadFraction({ ...start, glbLoaded: 50, glbTotal: 100 });
    expect(quarter).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(quarter);
  });

  it('holds still on a GLB of unknown size until it is in', () => {
    expect(loadFraction({ ...start, glbLoaded: 5_000_000 })).toBe(0);
    expect(loadFraction({ ...start, glbLoaded: 5_000_000, glbDone: true })).toBeGreaterThan(0);
  });

  it('is whole for a room with no textures once its GLB is in', () => {
    expect(loadFraction({ ...start, glbLoaded: 10, glbTotal: 10, glbDone: true })).toBe(1);
  });

  it('never runs past the whole, whatever a server reports', () => {
    expect(
      loadFraction({ glbLoaded: 300, glbTotal: 100, glbDone: true, texLoaded: 40, texTotal: 30 }),
    ).toBe(1);
  });
});
