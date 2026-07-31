import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dominantColour } from './dominant-colour.ts';
import { FIXTURE_VAULT } from '../test-support.ts';

const cover = (file: string): string => join(FIXTURE_VAULT, 'Library', 'covers', file);

/**
 * The expected values are the base colours in `scripts/make-fixture-covers.ts`,
 * documented in `fixtures/README.md`. They are exact on purpose: the covers are
 * two-tone rather than flat, so "picked the dominant colour" and "picked any
 * pixel" give different answers, and this asserts the former.
 */
describe('dominantColour', () => {
  it.each([
    ['the-tidal-engine.png', '#2f6d7a'],
    ['compilers-for-the-impatient.png', '#8a3b2e'],
    ['signal-and-sediment.png', '#4a6b5a'],
    ['nine-ways-of-seeing-a-warehouse.png', '#6a5a8c'],
    ['the-salt-road-ledger.png', '#b08442'],
    ['the-salt-road-ledger-audio.png', '#3a4a6b'],
  ])('reads %s as %s', async (file, expected) => {
    expect(await dominantColour(cover(file))).toBe(expected);
  });

  it('picks the base field, not the accent band', async () => {
    // The accent on this cover is a pale cream over ~16% of the image. Any
    // implementation that sampled a corner, an edge, or the mean of all pixels
    // would drift towards it.
    expect(await dominantColour(cover('the-tidal-engine.png'))).not.toBe('#e0c8a0');
  });

  it('ignores a white margin instead of calling the paper the spine colour', async () => {
    // Regression. The first real `stacks add` produced spine_color "#fefffe":
    // real covers are printed on and photographed against white, so white is
    // genuinely the commonest colour. Here the border is 44% of the image and
    // the true cover colour only 56%, and the answer must still be the cover.
    expect(await dominantColour(cover('white-bordered.png'))).toBe('#7a3f5d');
  });

  it('still returns white for a cover that really is white', async () => {
    // The extremes are only set aside when something else survives. A cover
    // with nothing but paper in it should not come back undefined.
    const white = await dominantColour(cover('all-white.png'));
    expect(white).toBe('#ffffff');
  });

  it('returns undefined for a missing or unreadable file, rather than throwing', async () => {
    await expect(dominantColour(cover('does-not-exist.png'))).resolves.toBeUndefined();
    await expect(
      dominantColour(join(FIXTURE_VAULT, 'Library', 'The Tidal Engine.md')),
    ).resolves.toBeUndefined();
  });
});
