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

// `import type`, never a value import: the package root re-exports the adapter,
// sharp and the metadata layer, and a value import of it drags `node:fs` into
// the browser bundle. Types are erased at compile time and so are safe.
import type { Binding } from '@stacks/core';

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

/**
 * A spine's cross-section, in *width units*, as one value rather than two.
 *
 * `rise` is how far the centre stands proud of the chord. `roll` is the fraction
 * of each half-width spent turning: `1` spends all of it and gives the full arc
 * of a backed hardback; a small value gives the flat face and hard-creased edges
 * of a perfect-bound paperback.
 *
 * **Width units are what make one shape serve every book.** The profile is
 * proportional to the chord, so the same texture on a thin spine and a fat one is
 * the right cross-section for both.
 *
 * Three names retired into this: `materials.spineCurve` (#55) is *superseded* and
 * its rise carries over unchanged, `roundedBack` (#57) is *struck* because both
 * bindings carry a profile and there is no boolean for binding to hand anyone,
 * and `materials.softHinge` (#56) is *subsumed* into `roll`, having been a toggle
 * between two points on the continuum `roll` parameterises. See #65.
 *
 * **A paperback is not flat**, against what #55, #57 and the map all said in
 * writing. Perfect binding is a flat *face* whose card turns through 90° at each
 * edge over a small radius, which is not the same as having no cross-section:
 * `{ 0, 0 }` would leave the hard, unmodulated colour step #56 diagnosed on the
 * 60% of the shelf that is not hardback.
 */
export interface SpineProfile {
  readonly rise: number;
  readonly roll: number;
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
  /**
   * How each binding's spine takes light, keyed by binding.
   *
   * **Binding picks, it does not bias.** A total function to a profile, so there
   * are exactly two on the shelf and exactly two maps uploaded, and the per-book
   * hash gains no third responsibility on top of binding and height.
   *
   * It lives in `materials` rather than in `books` because it only *shades* —
   * nothing moves and no silhouette changes. The head cap beside it is
   * dimensioned geometry and belongs in `books`; see ADR-0035 for the line.
   */
  readonly spineProfile: Record<Binding, SpineProfile>;

  /**
   * How strongly the page block reads as paper, as a normal-map scale. `0` is a
   * flat cream slab, which is what it was.
   *
   * `materials` and not `books`, because this is a *surface*: one shared 1D
   * striation map on the existing `UNIT_BOX`, plus per-book colour and roughness
   * jitter. No geometry changes, so the block stays the one shadow caster per
   * book. See ADR-0035 for the line, and `page-edges.ts` for why one map is
   * correct on all four faces that can show.
   *
   * The knob governs the whole treatment — the relief *and* the jitter — because
   * they are one effect, and a control that turned off half of what its label
   * says would be the panel lying quietly.
   */
  readonly pageStriation: number;

  /**
   * How rough each binding's covering is — cloth against card, as one number
   * each.
   *
   * This replaced a flat `0.62` on every spine, and it replaced something else
   * too: #58 designed a shared binding-keyed *grain* in `roughnessMap` for this
   * job, and #68 rendered it and measured **0 pixels above JND** at
   * `minDistance` against exactly these constants. The spine sets no
   * `metalness`, so it is a dielectric at ~4% specular reflectance under soft
   * light, and roughness modulates a lobe that is barely there — a *pattern* in
   * it cannot read, while its *average* plainly does.
   *
   * ⚠️ **The lesson is not "reach for relief instead."** #68 never rendered
   * relief on a spine, and swapping one unmeasured recommendation for another is
   * how the advice it corrected went wrong the first time. What is measured is a
   * band: driven across roughness's whole 0..1 range the same weave moves 16.9%
   * of frame, so the channel reaches the shader and it is the *plausible* band
   * that is too narrow to survive.
   */
  readonly spineRoughness: Record<Binding, number>;
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

/**
 * The books themselves — their **shape**, as against their surface.
 *
 * The first category here about a book rather than about the room, and it exists
 * because there was nowhere for it to go. Every other dimension of a book is a
 * module constant outside this object (`BOARD` and `SQUARE` in `scene.ts`, the
 * height and thickness bounds in `books.ts`), and `materials.coverRoughness`
 * calls itself "the one material knob that shows on the books rather than on the
 * furniture" — which is true and is about a *surface*.
 *
 * The line is shading against silhouette: anything that only changes how a book
 * is lit belongs in `materials`, and anything that changes what shape it is
 * belongs here.
 *
 * The constants stay constants deliberately. 2.6mm of board and 3mm of square are
 * measurements of real bookbinding — facts, not taste. What is here is the
 * opposite: pure look, unknowable without seeing it, which is what the panel is
 * for.
 */
export interface BooksSettings {
  /**
   * How much of the shelf is bound in paper, 0..1.
   *
   * Taste, and the one number in this whole area settled by the picture rather
   * than the argument. Leaned toward paperback because this is a library of
   * modern technical and business non-fiction, where paperback dominates, and
   * because the shelf it replaces was 100% hardback.
   *
   * It moves the *hash threshold*, so a book whose note declares a `binding:` is
   * unaffected by it in either direction — the declaration is not a vote.
   */
  readonly paperbackRatio: number;

  /**
   * The radius of the covering's roll over the head of a spine, in **thickness
   * units**. `0` is no cap at all.
   *
   * Thickness units and not world units, and that is the whole reason this
   * candidate works: a cap scaled `(thickness, thickness, thickness)` is uniform,
   * so one shared geometry is the right shape on every book — which is exactly
   * what a bevel on `UNIT_BOX` could not be.
   *
   * Hardbacks only. A perfect-bound paperback has no covering to roll; its card
   * is cut flush with the block at head and tail.
   *
   * **Its own knob, separate from `materials.spineProfile`, and that separation
   * is a finding rather than tidiness.** #56 shipped the two as one control,
   * which changed the shading of all 49 books *and* the silhouette of 20 — so the
   * cap's +20 draw calls could not be seen against a shading change moving at the
   * same time. Splitting them is what made the cost legible, and it stays split so
   * that it stays legible. See ADR-0035.
   *
   * `0.16` rather than #56's untuned `0.1`, accepted on #66's render.
   */
  readonly headCap: number;
}

export interface ShelfSettings {
  readonly renderer: RendererSettings;
  readonly effects: EffectSettings;
  readonly shadows: ShadowSettings;
  readonly lighting: LightingSettings;
  readonly scene: SceneSettings;
  readonly materials: MaterialSettings;
  readonly books: BooksSettings;
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
    spineProfile: {
      // Backed and rounded — the full arc, creasing hard into the joint.
      hardback: { rise: 0.125, roll: 1 },
      // Perfect-bound — a flat face whose card turns through 90° at each edge.
      paperback: { rise: 0.03, roll: 0.22 },
    },
    pageStriation: 1.4,
    // The midpoints of the bands #58's two grain maps would have covered.
    spineRoughness: { hardback: 0.67, paperback: 0.43 },
  },
  books: {
    paperbackRatio: 0.6,
    headCap: 0.16,
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
  /**
   * `spineProfile` is spelled out one level deeper than `Partial` reaches.
   *
   * `Partial<MaterialSettings>` makes the key optional and still demands a whole
   * `Record<Binding, SpineProfile>` when it is present — so nudging a paperback's
   * roll would mean restating both profiles, and getting one wrong silently
   * reshapes half the shelf. This is `PositionPatch`'s defect, in a second place.
   */
  readonly materials?: Partial<Omit<MaterialSettings, 'spineProfile' | 'spineRoughness'>> & {
    readonly spineProfile?: Partial<Record<Binding, Partial<SpineProfile>>>;
    // Scalars, so `Partial<Record<…>>` reaches all the way down on its own.
    readonly spineRoughness?: Partial<Record<Binding, number>>;
  };
  readonly books?: Partial<BooksSettings>;
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
    materials: {
      ...base.materials,
      ...patch.materials,
      spineProfile: mergeProfiles(base.materials.spineProfile, patch.materials?.spineProfile),
      spineRoughness: { ...base.materials.spineRoughness, ...patch.materials?.spineRoughness },
    },
    books: { ...base.books, ...patch.books },
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

/** Each binding's profile folded separately, so one number can be patched alone. */
function mergeProfiles(
  base: Record<Binding, SpineProfile>,
  patch: Partial<Record<Binding, Partial<SpineProfile>>> | undefined,
): Record<Binding, SpineProfile> {
  return {
    hardback: { ...base.hardback, ...patch?.hardback },
    paperback: { ...base.paperback, ...patch?.paperback },
  };
}
