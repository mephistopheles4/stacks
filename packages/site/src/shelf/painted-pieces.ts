import type { ShadowSettings } from './shelf-settings.ts';

/**
 * Which pieces of the painted shading draw, for the shadow settings a shelf runs.
 *
 * The painted shading (`contact-shadow.ts`, `cover-shade.ts`) began as the
 * whole of the shelf's shading, and it stayed on when real-time shadows became
 * the default (ADR-0090). Beside the shadow map, the pieces that imitate a cast
 * shadow darkened the same wood twice: on the empty bottom shelf, 55.3 with no
 * shading, 49.2 painted only, 47.9 real only and 43.6 with both. So under the
 * **shipped** real-time configuration those pieces step aside, and the rest
 * stay, because the map does not draw them:
 *
 * | piece | shipped real-time | why |
 * | --- | --- | --- |
 * | backboard shade | dropped | the map casts the plank and the upright on the back wall |
 * | upright wedge | dropped | the map casts the upright across the plank |
 * | contact body | dropped | the books cast into the map, and the planks read it |
 * | contact root | kept | the tight dark line where a book meets the wood, which the map does not draw |
 * | plank corner | kept | ambient occlusion, which a directional shadow does not model |
 * | recess | kept | the same, in front of the books |
 * | cover shade | kept | books read no map, so it is the only band on a cover |
 * | neighbour shadow | kept | the same, down a cover's edge |
 *
 * **Everywhere else the full set draws, exactly as before**: with shadows off —
 * `?shadows=0`, and the painted fallback a lost context redraws (`PAINTED_BASE`,
 * `paintedOf`), both of which flip `enabled` and keep every other key — and
 * under `?receivers=all`, the upstream reproduction, which is kept pixel for
 * pixel as the old `?shadows=1` drew it.
 *
 * ⚠️ **`casters` is in the test, and the owner's list — enabled, fetch,
 * `receivers: 'bookcase'` — did not name it.** Under `?casters=0` the map is
 * read and empty, as under `?shadowfetch=0` it is drawn and not read after the
 * first frame. Either way no real shadow reaches the bookcase, and stepping
 * aside there would leave the shelf with no cast shadow at all. `mapSize` and
 * `type` are left out: a 512 map, or a `basic` one, still draws the shadow.
 *
 * No `three` import, so vitest's node environment runs every rule here.
 * See [ADR-0090](../../../../docs/adr/0090-real-time-shadows-are-the-default.md).
 */
export interface PaintedPieces {
  /** The plank above and the right-hand upright, cast on the backboard. `makeBackboardShade`. */
  readonly backboardShade: boolean;
  /** The right-hand upright's shadow across each plank, widest at the back. */
  readonly uprightWedge: boolean;
  /** The soft, blurred shape each book throws on its plank. */
  readonly contactBody: boolean;
  /** The tight line where a book meets the plank. */
  readonly contactRoot: boolean;
  /** The darkening in the corner a plank makes with the backboard. */
  readonly plankCorner: boolean;
  /** The recess in front of each shelf's books, under the plank and at both uprights. */
  readonly recess: boolean;
  /** The band across every face-out cover, one mesh for the shelf. `cover-shade.ts`. */
  readonly coverShade: boolean;
  /** A shelved neighbour's band down a face-out cover. `makeNeighbourShadow`. */
  readonly neighbourShadow: boolean;
}

/**
 * Whether the map draws, onto a bookcase that reads it and books that do not,
 * the cast shadows the painted pieces imitate — the shipped configuration's
 * shape, whatever its map's size or filter.
 */
export function mapCastsWhatIsPainted(shadows: ShadowSettings): boolean {
  return shadows.enabled && shadows.casters && shadows.fetch && shadows.receivers === 'bookcase';
}

/** Which painted pieces a shelf built and running with these settings draws. */
export function paintedPieces(shadows: ShadowSettings): PaintedPieces {
  const painted = shadows.painted;
  const cast = painted && !mapCastsWhatIsPainted(shadows);
  return {
    backboardShade: cast,
    uprightWedge: cast,
    contactBody: cast,
    contactRoot: painted,
    plankCorner: painted,
    recess: painted,
    // Under real-time shadows with `receivers: 'all'` the books read the map and
    // take the real band, so painting it too would darken every cover twice;
    // that is also what keeps `?receivers=all` the unchanged reference the band
    // is tuned against. ⚠️ `receivers` is inert while shadows are off, and so it
    // is here: the painted fallback keeps every dial of the shelf it replaces
    // (`paintedOf` in `boot.ts`), `receivers` included, and a test of
    // `receivers` alone would leave that page with neither band.
    coverShade: painted && !(shadows.enabled && shadows.receivers === 'all'),
    neighbourShadow: painted,
  };
}

/**
 * The pieces a mounted shelf draws **now**: every shadow key as the shelf was
 * built, and `enabled` as it is.
 *
 * `enabled` is the one shadow key the panel moves live. `casters`, `receivers`,
 * `fetch` and `painted` are rebuild-class (`applyLive` reports them as standing
 * rebuilds), so a pending change to one of them has not reached the scene yet —
 * a pending `receivers: 'all'` has not given the books their sampler, and
 * reading it would take the band off covers that do not receive the real one.
 */
export function livePieces(mounted: ShadowSettings, running: ShadowSettings): PaintedPieces {
  return paintedPieces({ ...mounted, enabled: running.enabled });
}

/** The pieces that differ between two sets, by name — empty when nothing changes. */
export function changedPieces(was: PaintedPieces, now: PaintedPieces): (keyof PaintedPieces)[] {
  return (Object.keys(was) as (keyof PaintedPieces)[]).filter((key) => was[key] !== now[key]);
}
