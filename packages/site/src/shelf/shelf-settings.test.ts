import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  heightOf,
  resolveSettings,
  SHADOW_TYPE_NAMES,
  TONE_MAPPING_NAMES,
  type ShelfSettings,
} from './shelf-settings.ts';

describe('heightOf', () => {
  it('places the key light a fixed distance above the top of the case', () => {
    // `ofHeight: 1, plus: 3.4` — the whole case, then 3.4 more.
    expect(heightOf(DEFAULT_SETTINGS.lighting.key.position.y, 5.6)).toBeCloseTo(9);
  });

  it('places the fill light at a fraction of the case height', () => {
    // `ofHeight: 0.6, plus: 0` — scales with the case rather than clearing it.
    expect(heightOf(DEFAULT_SETTINGS.lighting.fill.position.y, 5.6)).toBeCloseTo(3.36);
  });

  it('grows the key light with the case but keeps the fill proportional', () => {
    const key = DEFAULT_SETTINGS.lighting.key.position.y;
    const fill = DEFAULT_SETTINGS.lighting.fill.position.y;

    // Doubling the case moves the key by exactly the case's height, and the fill
    // by a proportion of it. If both forms collapsed into one, this would fail.
    expect(heightOf(key, 10) - heightOf(key, 5)).toBeCloseTo(5);
    expect(heightOf(fill, 10) / heightOf(fill, 5)).toBeCloseTo(2);
  });
});

describe('resolveSettings', () => {
  it('returns the defaults untouched when nothing is patched', () => {
    expect(resolveSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('overrides only what the patch names', () => {
    const settings = resolveSettings({ renderer: { antialias: false } });

    expect(settings.renderer.antialias).toBe(false);
    expect(settings.renderer.maxPixelRatio).toBe(DEFAULT_SETTINGS.renderer.maxPixelRatio);
    expect(settings.shadows).toEqual(DEFAULT_SETTINGS.shadows);
  });

  it('merges nested light positions rather than replacing them', () => {
    // The hazard a shallow spread would hit: patching `x` alone must not drop
    // `y` and `z`, which would drive the light to the origin and silently
    // relight the whole shelf.
    const settings = resolveSettings({ lighting: { key: { position: { x: -5 } } } });

    expect(settings.lighting.key.position.x).toBe(-5);
    expect(settings.lighting.key.position.z).toBe(DEFAULT_SETTINGS.lighting.key.position.z);
    expect(settings.lighting.key.position.y).toEqual(DEFAULT_SETTINGS.lighting.key.position.y);
  });

  it('merges the two halves of a light height independently', () => {
    const settings = resolveSettings({ lighting: { key: { position: { y: { plus: 1 } } } } });

    expect(settings.lighting.key.position.y.plus).toBe(1);
    expect(settings.lighting.key.position.y.ofHeight).toBe(
      DEFAULT_SETTINGS.lighting.key.position.y.ofHeight,
    );
  });

  it('patches one binding profile without restating the other, or its sibling number', () => {
    // `Partial<MaterialSettings>` would demand a whole `Record<Binding,
    // SpineProfile>` to touch one number — `PositionPatch`'s defect in a second
    // place, and here getting it wrong silently reshapes half the shelf.
    const settings = resolveSettings({ materials: { spineProfile: { paperback: { roll: 0.5 } } } });

    expect(settings.materials.spineProfile.paperback).toEqual({
      ...DEFAULT_SETTINGS.materials.spineProfile.paperback,
      roll: 0.5,
    });
    expect(settings.materials.spineProfile.hardback).toEqual(
      DEFAULT_SETTINGS.materials.spineProfile.hardback,
    );
    expect(settings.materials.coverRoughness).toBe(DEFAULT_SETTINGS.materials.coverRoughness);
  });

  it('merges fog without dropping the sibling keys', () => {
    const settings = resolveSettings({ scene: { fog: { far: 40 } } });

    expect(settings.scene.fog).toEqual({ ...DEFAULT_SETTINGS.scene.fog, far: 40 });
    expect(settings.scene.background).toBe(DEFAULT_SETTINGS.scene.background);
  });

  it('keeps a patched light colour while leaving its intensity alone', () => {
    const settings = resolveSettings({ lighting: { key: { colour: 0xff0000 } } });

    expect(settings.lighting.key.colour).toBe(0xff0000);
    expect(settings.lighting.key.intensity).toBe(DEFAULT_SETTINGS.lighting.key.intensity);
    expect(settings.lighting.key.position).toEqual(DEFAULT_SETTINGS.lighting.key.position);
  });

  it('folds onto a supplied base, not only onto the shipped defaults', () => {
    // How the panel rebases: the running settings become the base for the next
    // edit, so a second change does not silently revert the first.
    const dialled = resolveSettings({ renderer: { exposure: 1.4 } });
    const again = resolveSettings({ renderer: { maxPixelRatio: 1 } }, dialled);

    expect(again.renderer.exposure).toBe(1.4);
    expect(again.renderer.maxPixelRatio).toBe(1);
  });

  it('does not mutate the base it folds onto', () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    resolveSettings({ lighting: { key: { position: { x: 99 } } } });

    expect(DEFAULT_SETTINGS).toEqual(before);
  });
});

describe('the defaults', () => {
  it('names a tone mapping and a shadow type that exist', () => {
    // The blob is hand-editable, so these are the two values a person can most
    // easily invent. `scene.ts` looks both up in a table and would resolve
    // `undefined` into three's constructor without complaint.
    expect(TONE_MAPPING_NAMES).toContain(DEFAULT_SETTINGS.renderer.toneMapping);
    expect(SHADOW_TYPE_NAMES).toContain(DEFAULT_SETTINGS.shadows.type);
  });

  it('survives a round trip through JSON', () => {
    // The export button copies JSON and the paste target is a TypeScript object
    // literal. Anything here that JSON cannot carry — undefined, a function, a
    // Map — would export as a blob that silently loses a key.
    const roundTripped: unknown = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    expect(roundTripped).toEqual(DEFAULT_SETTINGS);
  });

  it('is still what the shelf shipped with', () => {
    // A guard against a stray edit to the defaults being mistaken for a panel
    // change. These are the literals that used to sit at the call sites in
    // `scene.ts`; changing one changes what every visitor sees.
    const shipped: Pick<ShelfSettings, 'renderer' | 'shadows'> = {
      renderer: {
        antialias: true,
        maxPixelRatio: 2,
        guardResize: false,
        toneMapping: 'none',
        exposure: 1,
      },
      shadows: { enabled: false, mapSize: 2048, type: 'pcf', casters: true, fetch: true, painted: true },
    };

    expect(DEFAULT_SETTINGS.renderer).toEqual(shipped.renderer);
    expect(DEFAULT_SETTINGS.shadows).toEqual(shipped.shadows);
  });
});
