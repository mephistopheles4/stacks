import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettler, loadFraction, showLoadingScreen } from './room-loading.ts';

const start = { glbLoaded: 0, glbTotal: 0, glbDone: false, texLoaded: 0, texTotal: 0 };

describe('loadFraction', () => {
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

  it('holds at the GLB’s share until the textures are counted, never at whole', () => {
    expect(loadFraction({ ...start, glbLoaded: 10, glbTotal: 10, glbDone: true })).toBe(0.5);
  });

  it('never runs past the whole, whatever a server reports', () => {
    expect(
      loadFraction({ glbLoaded: 300, glbTotal: 100, glbDone: true, texLoaded: 40, texTotal: 30 }),
    ).toBe(1);
  });
});

describe('createSettler (spec S3.2, S3.3)', () => {
  it('lifts only once the last texture is applied, never on a fetch', () => {
    const lifted = vi.fn();
    const settler = createSettler(lifted);
    settler.ask();
    settler.ask();
    settler.ask();
    settler.walked();
    settler.settle();
    settler.settle();
    expect(lifted).not.toHaveBeenCalled();
    settler.settle();
    expect(lifted).toHaveBeenCalledTimes(1);
  });

  it('waits for the walk to finish, however many textures have settled', () => {
    const lifted = vi.fn();
    const settler = createSettler(lifted);
    settler.ask();
    settler.settle();
    expect(lifted).not.toHaveBeenCalled();
    settler.walked();
    expect(lifted).toHaveBeenCalledTimes(1);
  });

  it('lifts for a room that asks for nothing', () => {
    const lifted = vi.fn();
    createSettler(lifted).walked();
    expect(lifted).toHaveBeenCalledTimes(1);
  });

  it('lifts once, though a late file settles again', () => {
    const lifted = vi.fn();
    const settler = createSettler(lifted);
    settler.ask();
    settler.walked();
    settler.settle();
    settler.settle();
    expect(lifted).toHaveBeenCalledTimes(1);
  });
});

describe('the screen under reduced motion (spec S3.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A DOM that holds only what the screen touches, counting the covers taken away. */
  function stub(reduced: boolean): { removed: () => number; styles: Record<string, unknown>[] } {
    let removed = 0;
    const styles: Record<string, unknown>[] = [];
    const make = (): Record<string, unknown> => {
      const style: Record<string, unknown> = {};
      styles.push(style);
      return {
        style,
        textContent: '',
        setAttribute: () => undefined,
        append: () => undefined,
        addEventListener: () => undefined,
        remove: () => {
          removed += 1;
        },
      };
    };
    vi.stubGlobal('document', {
      createElement: make,
      createElementNS: make,
      body: { append: () => undefined },
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
    return { removed: () => removed, styles };
  }

  const fades = (styles: Record<string, unknown>[]): boolean =>
    styles.some(
      (style) => typeof style.transition === 'string' && style.transition.includes('opacity'),
    );

  it('lifts at once, with no fade, and takes the cover away', () => {
    const { removed, styles } = stub(true);
    showLoadingScreen().done();
    expect(removed()).toBe(1);
    expect(fades(styles)).toBe(false);
  });

  it('fades otherwise, and takes the cover away only after the fade', () => {
    vi.useFakeTimers();
    const { removed, styles } = stub(false);
    showLoadingScreen().done();
    expect(removed()).toBe(0);
    expect(fades(styles)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(removed()).toBe(1);
  });
});
