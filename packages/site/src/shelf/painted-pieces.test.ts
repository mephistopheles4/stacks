import { describe, expect, it } from 'vitest';

import {
  changedPieces,
  livePieces,
  mapCastsWhatIsPainted,
  paintedPieces,
  type PaintedPieces,
} from './painted-pieces.ts';
import { PAINTED_BASE } from './shadow-fallback.ts';
import { DEFAULT_SETTINGS, resolveSettings, type ShadowSettings } from './shelf-settings.ts';

const SHIPPED = DEFAULT_SETTINGS.shadows;

/** Every piece, as the painted shelf has always drawn it. */
const FULL: PaintedPieces = {
  backboardShade: true,
  uprightWedge: true,
  contactBody: true,
  contactRoot: true,
  plankCorner: true,
  recess: true,
  coverShade: true,
  neighbourShadow: true,
};

/** The owner's option B: what the map casts steps aside, the rest stays. */
const BESIDE_THE_MAP: PaintedPieces = {
  ...FULL,
  backboardShade: false,
  uprightWedge: false,
  contactBody: false,
};

/** What `?shadows=1&receivers=all` drew before B, and still draws. */
const OLD_REAL_TIME: PaintedPieces = { ...FULL, coverShade: false };

const NONE: PaintedPieces = {
  backboardShade: false,
  uprightWedge: false,
  contactBody: false,
  contactRoot: false,
  plankCorner: false,
  recess: false,
  coverShade: false,
  neighbourShadow: false,
};

const shadows = (overrides: Partial<ShadowSettings>): ShadowSettings => ({
  ...SHIPPED,
  ...overrides,
});

describe('the shipped real-time shelf', () => {
  it('drops the pieces the map now casts and keeps the root, the corners and the covers', () => {
    expect(paintedPieces(SHIPPED)).toEqual(BESIDE_THE_MAP);
  });

  it('is the default a bare URL gets', () => {
    // Pinned so a change to the defaults cannot move this file's premise quietly.
    expect(SHIPPED).toMatchObject({
      enabled: true,
      casters: true,
      fetch: true,
      receivers: 'bookcase',
      painted: true,
    });
    expect(mapCastsWhatIsPainted(SHIPPED)).toBe(true);
  });

  it('steps aside at any map size or filter, which still draw the shadow', () => {
    for (const probe of [{ mapSize: 512 }, { mapSize: 4096 }, { type: 'basic' as const }]) {
      expect(paintedPieces(shadows(probe))).toEqual(BESIDE_THE_MAP);
    }
  });
});

describe('everywhere else, the full painted set draws exactly as before', () => {
  it('with shadows off: `?shadows=0`', () => {
    expect(paintedPieces(shadows({ enabled: false }))).toEqual(FULL);
  });

  it('on the painted fallback a lost context redraws, from either base', () => {
    expect(paintedPieces(PAINTED_BASE.shadows)).toEqual(FULL);
    // `paintedOf` in `boot.ts`: one key flipped, every dial of the running shelf kept.
    const probe = resolveSettings({ shadows: { enabled: true, receivers: 'all' } });
    const fallback = resolveSettings({ shadows: { enabled: false } }, probe);
    expect(paintedPieces(fallback.shadows)).toEqual(FULL);
  });

  it('under `?receivers=all`, the upstream reproduction, as the old `?shadows=1` drew it', () => {
    expect(paintedPieces(shadows({ receivers: 'all' }))).toEqual(OLD_REAL_TIME);
  });

  it('when the map casts nothing onto the bookcase: `?casters=0`', () => {
    expect(paintedPieces(shadows({ casters: false }))).toEqual(FULL);
  });

  it('when the map is drawn and not read: `?shadowfetch=0`', () => {
    expect(paintedPieces(shadows({ fetch: false }))).toEqual(FULL);
  });

  it('draws nothing at all under `?painted=0`, real-time or not', () => {
    expect(paintedPieces(shadows({ painted: false }))).toEqual(NONE);
    expect(paintedPieces(shadows({ painted: false, enabled: false }))).toEqual(NONE);
    expect(paintedPieces(shadows({ painted: false, receivers: 'all' }))).toEqual(NONE);
  });
});

describe('a live shadow toggle', () => {
  it('draws the full set back when shadows go off, and steps aside when they come on', () => {
    expect(livePieces(SHIPPED, shadows({ enabled: false }))).toEqual(FULL);
    expect(livePieces(PAINTED_BASE.shadows, shadows({ enabled: true }))).toEqual(BESIDE_THE_MAP);
  });

  it('names exactly the pieces that move', () => {
    expect(
      changedPieces(livePieces(SHIPPED, SHIPPED), livePieces(SHIPPED, PAINTED_BASE.shadows)),
    ).toEqual(['backboardShade', 'uprightWedge', 'contactBody']);
    expect(changedPieces(FULL, FULL)).toEqual([]);
  });

  it('keeps the cover shade live on a `?receivers=all` shelf, which was stale before', () => {
    const all = shadows({ receivers: 'all' });
    expect(livePieces(all, shadows({ receivers: 'all', enabled: false })).coverShade).toBe(true);
    expect(livePieces(all, all).coverShade).toBe(false);
  });

  it('reads every rebuild-class key from the shelf as it was built, not as it is asked for', () => {
    // A pending `receivers: 'all'` has not given the books their sampler, so the
    // cover band stays; a pending `casters: false` has not emptied the map.
    expect(livePieces(SHIPPED, shadows({ receivers: 'all' }))).toEqual(BESIDE_THE_MAP);
    expect(livePieces(SHIPPED, shadows({ casters: false, fetch: false }))).toEqual(BESIDE_THE_MAP);
    expect(livePieces(SHIPPED, shadows({ painted: false }))).toEqual(BESIDE_THE_MAP);
    expect(livePieces(shadows({ casters: false }), SHIPPED)).toEqual(FULL);
  });
});
