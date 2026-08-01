/**
 * The cases here are the real measurements from the vault this was written for
 * — 31 covers, 25 from Apple and 6 from Open Library — rather than invented
 * numbers. A heuristic tested against made-up inputs only proves it is
 * self-consistent.
 */

import { describe, expect, it } from 'vitest';
import { inferCoverSource } from './infer-source.ts';

describe('inferCoverSource', () => {
  it('recognises Open Library by its 500px cap', () => {
    // Every OL cover measured came back exactly 500 tall.
    for (const shape of [
      { width: 381, height: 500 },
      { width: 338, height: 500 },
      { width: 333, height: 500 },
      { width: 332, height: 500 },
      { width: 331, height: 500 },
    ]) {
      expect(inferCoverSource(shape), `${shape.width}x${shape.height}`).toBe('open-library');
    }
  });

  it('recognises Apple by its rewritten art size', () => {
    for (const shape of [
      { width: 2400, height: 2400 },
      { width: 1280, height: 1920 },
      { width: 1000, height: 1499 },
      { width: 914, height: 1200 },
      { width: 778, height: 1200 },
    ]) {
      expect(inferCoverSource(shape), `${shape.width}x${shape.height}`).toBe('apple-books');
    }
  });

  it('recognises a Google thumbnail', () => {
    expect(inferCoverSource({ width: 128, height: 193 })).toBe('google-books');
    expect(inferCoverSource({ width: 96, height: 145 })).toBe('google-books');
  });

  it('refuses a square at the Open Library cap', () => {
    // Apple serves square audiobook art. 500x500 could be either, so the cap
    // rule must not claim it.
    expect(inferCoverSource({ width: 500, height: 500 })).toBeUndefined();
  });

  it('refuses anything between a thumbnail and full art', () => {
    // A resized cover of unknown origin. `undefined` here becomes `unknown` at
    // the call site — "looked, could not tell" — rather than a wrong guess.
    expect(inferCoverSource({ width: 400, height: 600 })).toBeUndefined();
    expect(inferCoverSource({ width: 300, height: 450 })).toBeUndefined();
  });

  it('refuses a shape it cannot read', () => {
    expect(inferCoverSource({ width: 0, height: 0 })).toBeUndefined();
    expect(inferCoverSource({ width: -1, height: 100 })).toBeUndefined();
  });
});
