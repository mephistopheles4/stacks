/**
 * Everything about the shelf you can dial, in one place.
 *
 * The shelf's look was spread across five vocabularies: `COLOURS` and three
 * light intensities written inline in `scene.ts`, the case's dimensions in
 * `case.ts`, nine probe switches in `RendererOverrides`, and a dozen alphas in
 * `contact-shadow.ts`. Nothing could ask "what is the shelf running", and so
 * nothing could answer it — which is fine for a constant and useless for a
 * panel whose whole purpose is to hand you a configuration you can keep.
 *
 * Two types, deliberately, because they mean different things:
 *
 * - **`ShelfSettings` is total.** It is what the shelf *is* running. Every key
 *   is present, because a blob with a missing key cannot be pasted back and
 *   reproduce what you saw.
 * - **`RendererOverrides` is partial**, and lives in `scene.ts` next to the
 *   renderer it describes. It is what a *URL* said. Absent means "no opinion",
 *   which is not the same as "asked for the default" — `flag()` in `boot.ts`
 *   returns `undefined` for a missing parameter precisely so a typo shows the
 *   whole shelf rather than a silently defaulted one.
 *
 * `resolveSettings` is the one place they meet.
 *
 * Two things are deliberately NOT here:
 *
 * - **The case's geometry.** `SHELF` stays in `case.ts`. It is not an aesthetic
 *   knob — `placement.ts` packs against `USABLE_WIDTH`, and G25 exists because
 *   that number had five live answers which disagreed by 0.162 across a row.
 *   Putting it in a hand-editable blob re-creates that defect with a slider on
 *   it.
 * - **Anything derived.** `caseLight()` computes the two ratios the painted
 *   shadows are drawn from, out of the key light's position. Derived values are
 *   functions of what is here and are never stored, or a hand-edited blob could
 *   describe a light that does not exist.
 *
 * No `three` import. This module is data and arithmetic, so it stays cheap,
 * testable without a GPU, and safe for the panel to load before the scene.
 */

/**
 * A light's height, which depends on how tall the case grew.
 *
 * `y = unitHeight * ofHeight + plus`. Both terms are needed because the three
 * lights genuinely differ: the key stands a fixed distance *above* the top of
 * the case (`ofHeight: 1, plus: 3.4`), while the fill and the lamp sit at a
 * *fraction* of its height (`ofHeight: 0.6, plus: 0`). Writing one form that
 * covers both beats two shapes that have to be told apart at every call.
 */
export interface Height {
  readonly ofHeight: number;
  readonly plus: number;
}

/** Where a light stands. `x` and `z` are world units; `y` scales with the case. */
export interface LightPosition {
  readonly x: number;
  readonly y: Height;
  readonly z: number;
}

export interface DirectionalLightSettings {
  /** Hex, as `0xrrggbb`. Serialises to a number, which JSON can hold. */
  readonly colour: number;
  readonly intensity: number;
  readonly position: LightPosition;
}

export interface KeyLightSettings extends DirectionalLightSettings {
  /**
   * What the key light aims at, as a fraction of the case's height.
   *
   * A `DirectionalLight` aims at the origin unless told otherwise, and the case
   * stands *on* the origin and grows upward — so aiming at the default put half
   * a five-row unit outside its own shadow frustum. `0.5` is the middle of the
   * case, which is what fixed it.
   */
  readonly aimHeight: number;
}

export interface PointLightSettings {
  readonly colour: number;
  readonly intensity: number;
  readonly position: LightPosition;
  readonly distance: number;
  readonly decay: number;
}

export interface LightingSettings {
  readonly ambient: { readonly colour: number; readonly intensity: number };
  readonly key: KeyLightSettings;
  readonly fill: DirectionalLightSettings;
  /** A warm lamp near the shelf, so the spines closest to the viewer read clearly. */
  readonly lamp: PointLightSettings;
}

/**
 * three's tone mapping modes, by name.
 *
 * Named rather than numbered because a JSON blob carrying `toneMapping: 4` says
 * nothing to anyone reading the file, and three's constants are not stable
 * across major versions. `scene.ts` maps these to the real constants, the same
 * way `SHADOW_TYPES` already maps the shadow filters.
 */
export type ToneMappingName = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral';

export const TONE_MAPPING_NAMES: readonly ToneMappingName[] = [
  'none',
  'linear',
  'reinhard',
  'cineon',
  'aces',
  'agx',
  'neutral',
];

export type ShadowTypeName = 'basic' | 'pcf' | 'soft' | 'vsm';

export const SHADOW_TYPE_NAMES: readonly ShadowTypeName[] = ['basic', 'pcf', 'soft', 'vsm'];

export interface RendererSettings {
  /**
   * A **context-creation attribute**. `getContext` took it once and will not
   * take it again, so this can only change on a reload — there is no amount of
   * bookkeeping that makes it live. The panel has to say so.
   */
  readonly antialias: boolean;
  readonly maxPixelRatio: number;
  /** Skip `setSize` when the canvas has not actually changed size. */
  readonly guardResize: boolean;
  readonly toneMapping: ToneMappingName;
  readonly exposure: number;
}

export interface ShadowSettings {
  /** The real-time path. Off by default — see `contact-shadow.ts` for why. */
  readonly enabled: boolean;
  readonly mapSize: number;
  readonly type: ShadowTypeName;
  /** Whether anything is drawn *into* the shadow map. */
  readonly casters: boolean;
  /** Whether materials *read* the shadow map. See `RendererOverrides.shadowFetch`. */
  readonly fetch: boolean;
  /** The painted shading that stands in for a shadow pass. On by default. */
  readonly painted: boolean;
}

export interface SceneSettings {
  readonly background: number;
  readonly fog: { readonly enabled: boolean; readonly near: number; readonly far: number };
}

export interface MaterialSettings {
  readonly wood: number;
  readonly woodDark: number;
  readonly woodRoughness: number;
  readonly backingRoughness: number;
  /**
   * The cover face only — not the spine, which is `0.62` and left alone.
   *
   * The two are separate materials with different numbers, and collapsing them
   * into one knob would have been a silent look change dressed up as a refactor.
   * This is the one material knob that shows on the books rather than on the
   * furniture: a dust jacket is glossier than a plank.
   */
  readonly coverRoughness: number;
  readonly coverMetalness: number;
}

/**
 * Bloom — the one effect that needs a postprocessing chain.
 *
 * Off by default, and it is a **rebuild** setting rather than a live one:
 * turning it on builds an `EffectComposer`, which means the context has to be
 * remade without MSAA and antialiasing has to move to an SMAA pass. See
 * `post.ts` for why that trade is stated out loud rather than hidden.
 *
 * Ambient occlusion is deliberately absent — see the map's Out of scope.
 */
export interface BloomSettings {
  readonly enabled: boolean;
  /** How much light spills. Above ~1.5 the shelf reads as fogged rather than lit. */
  readonly strength: number;
  /** How far it spills. */
  readonly radius: number;
  /** Luminance a pixel must reach before it glows at all. */
  readonly threshold: number;
}

export interface EffectSettings {
  readonly bloom: BloomSettings;
}

export interface ShelfSettings {
  readonly renderer: RendererSettings;
  readonly effects: EffectSettings;
  readonly shadows: ShadowSettings;
  readonly lighting: LightingSettings;
  readonly scene: SceneSettings;
  readonly materials: MaterialSettings;
}

/**
 * What the shelf ships as.
 *
 * Every number here was the literal that used to sit at the call site, so this
 * commit changes no pixels. `pnpm smoke:render` is the check: same book count,
 * same case overflow, and a distinct-colour count inside the ~40-pixel noise
 * floor `docs/progress.md` measured for `artifacts/shelf.png`.
 *
 * **This is the paste target.** The debug panel's export button copies JSON, and
 * JSON is a subset of TypeScript object-literal syntax — so dialling a shelf you
 * like and keeping it is: copy, paste between the braces, `pnpm build`. A key
 * you invented or a value of the wrong type is a red build rather than a silent
 * default, which is the entire reason this is a `.ts` file and not a `.json`
 * one fetched at runtime.
 */
export const DEFAULT_SETTINGS: ShelfSettings = {
  effects: {
    // Thresholded well above the wood so only genuinely bright things bloom —
    // a cover's highlight and the lamp's pool, not the whole case.
    bloom: { enabled: false, strength: 0.45, radius: 0.5, threshold: 0.85 },
  },
  renderer: {
    antialias: true,
    maxPixelRatio: 2,
    guardResize: false,
    toneMapping: 'none',
    exposure: 1,
  },
  shadows: {
    enabled: false,
    mapSize: 2048,
    type: 'pcf',
    casters: true,
    fetch: true,
    painted: true,
  },
  lighting: {
    ambient: { colour: 0xffffff, intensity: 0.75 },
    key: {
      colour: 0xffe9cc,
      intensity: 2.7,
      // High and to the right. A directional light does not fall off with
      // distance, only with angle, so swinging it further out takes light
      // straight off the spines and covers, which all face the room.
      position: { x: 5, y: { ofHeight: 1, plus: 3.4 }, z: 5.6 },
      aimHeight: 0.5,
    },
    fill: {
      colour: 0x5577aa,
      intensity: 0.75,
      position: { x: -5, y: { ofHeight: 0.6, plus: 0 }, z: 4.5 },
    },
    lamp: {
      colour: 0xffd7a8,
      intensity: 14,
      position: { x: 1.6, y: { ofHeight: 0.72, plus: 0 }, z: 2.4 },
      distance: 14,
      decay: 2,
    },
  },
  scene: {
    background: 0x1a1613,
    fog: { enabled: true, near: 14, far: 30 },
  },
  materials: {
    wood: 0x6b4f3a,
    woodDark: 0x4a3527,
    woodRoughness: 0.82,
    backingRoughness: 0.95,
    coverRoughness: 0.55,
    coverMetalness: 0,
  },
};

/**
 * Resolves the height of a light against a case of a given height.
 *
 * One function so the arithmetic is stated once. `scene.ts` and the panel both
 * need it, and a second copy is the shape of defect G10 and G23 both caught.
 */
export function heightOf(height: Height, unitHeight: number): number {
  return unitHeight * height.ofHeight + height.plus;
}

/**
 * Everything a *partial* override can say, in the settings vocabulary.
 *
 * This is what the URL parses to and what the panel edits — a deep-partial of
 * `ShelfSettings`, so "no opinion" stays expressible all the way through. It is
 * spelled out rather than written with a generic `DeepPartial<T>`, because the
 * generic version admits `{ renderer: { antilias: true } }` (note the typo) on
 * any key it has never heard of, and this repo has a documented case of a key
 * being silently accepted and doing nothing.
 */
/**
 * A position patch, one level deeper than `Partial` reaches.
 *
 * `Partial<LightPosition>` makes `y` optional but still demands a whole
 * `Height` when it is present — so nudging a light's fixed clearance would mean
 * restating the fraction it scales by, and getting that wrong silently moves the
 * light. Both halves are independently optional here.
 */
export interface PositionPatch {
  readonly x?: number;
  readonly y?: Partial<Height>;
  readonly z?: number;
}

export interface SettingsPatch {
  readonly renderer?: Partial<RendererSettings>;
  readonly effects?: { readonly bloom?: Partial<BloomSettings> };
  readonly shadows?: Partial<ShadowSettings>;
  readonly scene?: {
    readonly background?: number;
    readonly fog?: Partial<SceneSettings['fog']>;
  };
  readonly materials?: Partial<MaterialSettings>;
  readonly lighting?: {
    readonly ambient?: Partial<LightingSettings['ambient']>;
    readonly key?: Partial<Omit<KeyLightSettings, 'position'>> & { readonly position?: PositionPatch };
    readonly fill?: Partial<Omit<DirectionalLightSettings, 'position'>> & {
      readonly position?: Partial<LightPosition>;
    };
    readonly lamp?: Partial<Omit<PointLightSettings, 'position'>> & {
      readonly position?: Partial<LightPosition>;
    };
  };
}

/**
 * Folds a patch onto the defaults, producing the total object the shelf runs.
 *
 * `mountShelf` already did exactly this, nine times over, in a block of `??`
 * expressions. That block *was* this function written longhand; lifting it is
 * most of what the settings refactor is.
 */
export function resolveSettings(patch: SettingsPatch = {}, base: ShelfSettings = DEFAULT_SETTINGS): ShelfSettings {
  return {
    renderer: { ...base.renderer, ...patch.renderer },
    effects: { bloom: { ...base.effects.bloom, ...patch.effects?.bloom } },
    shadows: { ...base.shadows, ...patch.shadows },
    scene: {
      ...base.scene,
      ...patch.scene,
      fog: { ...base.scene.fog, ...patch.scene?.fog },
    },
    materials: { ...base.materials, ...patch.materials },
    lighting: {
      ambient: { ...base.lighting.ambient, ...patch.lighting?.ambient },
      key: {
        ...base.lighting.key,
        ...patch.lighting?.key,
        position: mergePosition(base.lighting.key.position, patch.lighting?.key?.position),
      },
      fill: {
        ...base.lighting.fill,
        ...patch.lighting?.fill,
        position: mergePosition(base.lighting.fill.position, patch.lighting?.fill?.position),
      },
      lamp: {
        ...base.lighting.lamp,
        ...patch.lighting?.lamp,
        position: mergePosition(base.lighting.lamp.position, patch.lighting?.lamp?.position),
      },
    },
  };
}

function mergePosition(base: LightPosition, patch: PositionPatch | undefined): LightPosition {
  return { ...base, ...patch, y: { ...base.y, ...patch?.y } };
}
