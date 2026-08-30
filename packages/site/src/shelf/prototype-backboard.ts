/**
 * PROTOTYPE ONLY — wayfinder ticket #297, "Which wood is the backboard's own
 * sheet, and does its grain read behind books?", under map #280. Never merged
 * to `main`, and deliberately not wired to `ShelfSettings`, `applySettings` or
 * the debug panel — the same standing rule `prototype-wood.ts` states for the
 * woodwork's arms, for the same reason: those belong to the treatment that
 * eventually *ships*, and this is a branch that never does.
 *
 * Drive it with `?back=<arm>`, on top of whatever `?wood=` the woodwork is
 * wearing. The two are independent on purpose: every backboard arm below is
 * rendered with #284's standing candidate on the planks, because the question
 * is what the backboard looks like **behind that**, not next to today's flat.
 *
 *     ?back=pigment          the sheet's figure in `map`
 *     ?back=relief           the drawn fibre in `normalMap`
 *     ?back=both             both
 *     ?back=flat             no map, at the sheet's own mean colour
 *     ?back=wire             the wiring check — every channel past plausible
 *     ?back=off  (default)   today's flat `woodDark`
 *
 * `&backSpecies=`, `&backRes=`, `&backNormal=`, `&backDetail=`, `&backVary=`
 * and `&backRough=` open the numbers to a live hand, because #282 settled that
 * the owner judges on a live build and a still argues where a mouse decides.
 *
 * ## The three things this file knows that the woodwork's file does not
 *
 * 1. **The sheet has to be dark, and almost nothing is.**
 *    `scripts/prototype-backboard-survey.ts` measured all 41 veneers Poly Haven
 *    publishes, in linear light: exactly **two** land within 5 luma of
 *    `woodDark` — `dark_wood`, and `rosewood_veneer1`, which is the woodwork's
 *    own sheet. The next nearest is **+24.8 luma away**, about half the
 *    distance from the backboard to the planks. So the pool #297 asks about is
 *    not a menu of four; it is one candidate and one control.
 * 2. **Which way a sheet's grain runs is measured, not assumed.** The same
 *    survey reports the ratio of a sheet's column-mean spread to its row-mean
 *    spread: above 1 the stripe runs down `v`, below 1 it runs across `u`.
 *    Sapele reads **2.67** — which is the fact `prototype-wood.ts` states in
 *    prose, now measured — and `dark_wood` reads **0.08**, the other way round.
 *    So the swap that puts the grain *vertical* on the backboard, which
 *    [#285](https://github.com/mephistopheles4/stacks/issues/285) states rather
 *    than derives, is the **opposite** swap from the one an upright needs on
 *    the woodwork's sheet. Hard-coding the woodwork's answer here would have
 *    laid this sheet sideways and looked like a verdict about the sheet.
 * 3. **`backingRoughness` is 0.95**, flatter than the wood's 0.82, and
 *    [#68](https://github.com/mephistopheles4/stacks/issues/68)'s diagnosis
 *    gets *stronger* as roughness climbs: a dielectric under soft light has
 *    almost no specular lobe for a normal map to modulate. `&backRough=` exists
 *    so a relief zero can be attributed — to the surface, or to the roughness —
 *    instead of being reported as one number that means either.
 */
import * as THREE from 'three';
import { fibreNormalMap } from './prototype-wood-detail.ts';

export type BackArm = 'off' | 'pigment' | 'relief' | 'both' | 'flat' | 'wire';

const ARMS: readonly BackArm[] = ['off', 'pigment', 'relief', 'both', 'flat', 'wire'];

/**
 * This scene's unit against a sheet's published millimetres.
 *
 * `prototype-wood.ts` lays each veneer at its true size and derives the number
 * by hand; the two it holds imply **312.5** and **316.4** mm per unit. The
 * midpoint is used here so a third sheet does not need a fourth hand
 * calculation, and the difference between the two is 1%, well under anything a
 * render can see.
 */
const MM_PER_UNIT = 314;

interface Sheet {
  readonly prefix: string;
  readonly mm: number;
  /**
   * Which texture axis the grain runs **along**, measured by
   * `scripts/prototype-backboard-survey.ts` rather than eyeballed.
   *
   * ⚠️ `rosewood` is recorded as `v` and its measurement is the weak one: 0.69,
   * where sapele is 2.67 and `dark_wood` is 0.08. It is a **book-matched
   * figured** sheet rather than a striped one, so it has no strong direction to
   * measure and the number should not be read as one. It is here as the
   * separation control, where direction decides nothing.
   */
  readonly grain: 'u' | 'v';
  /** The mean-matched flat twin, per resolution, in linear light. */
  readonly mean: Record<number, number>;
}

const SHEETS = {
  darkwood: {
    prefix: 'darkwood',
    mm: 2000,
    grain: 'u',
    mean: { 512: 0x5f2c19, 1024: 0x5f2c19, 2048: 0x5f2c19 },
  },
  rosewood: {
    prefix: 'rosewood',
    mm: 2430,
    grain: 'v',
    mean: { 512: 0x6e3311, 1024: 0x6e3412, 2048: 0x6f3412 },
  },
} as const satisfies Record<string, Sheet>;

export type BackSpecies = keyof typeof SHEETS;

const SPECIES_NAMES = Object.keys(SHEETS) as readonly BackSpecies[];

const RESOLUTIONS = [512, 1024, 2048] as const;

/** `page-edges.ts`'s number, for its reason. */
const ANISOTROPY = 16;

export interface BackArmConfig {
  readonly arm: BackArm;
  readonly species: BackSpecies;
  readonly resolution: number;
  readonly unitsPerTile: number;
  readonly normalScale: number;
  /** World units one tile of the procedural fibre covers; 0 uses the sheet's own normal. */
  readonly detail: number;
  /** 0 turns the per-member difference off; 1 is `varyMember`'s full spread. */
  readonly vary: number;
  /** `undefined` leaves `backingRoughness` alone — see the header's point 3. */
  readonly roughness: number | undefined;
  /**
   * Whether the drawn fibre is turned a quarter turn to run with the figure
   * rather than across it. Defaults to whatever this sheet needs; `0` forces
   * the crossed version back, so the two can be differenced rather than argued.
   */
  readonly fibreTurn: boolean;
}

/**
 * ⚠️ **Last occurrence wins, not first**, and the reason is on the record:
 * `URLSearchParams.get` returns the first, which is how #284's resolution
 * control silently rendered the wrong resolution and reported a perfect zero at
 * every rung. The arm matrix builds each URL as a fixed base plus a per-arm
 * tail, so a repeated key is the normal case rather than a mistake.
 */
export function readBackArm(search: string): BackArmConfig {
  const params = new URLSearchParams(search);
  const last = (key: string): string | null => params.getAll(key).at(-1) ?? null;

  const arm = ARMS.find((candidate) => candidate === last('back')) ?? 'off';
  const species = SPECIES_NAMES.find((name) => name === last('backSpecies')) ?? 'darkwood';
  const positive = (key: string, fallback: number): number => {
    const value = Number(last(key));
    return last(key) !== null && Number.isFinite(value) && value > 0 ? value : fallback;
  };
  /**
   * ⚠️ `Number(null)` is `0`, not `NaN` — see `readWoodArm`, where the same
   * three lines made the documented default of 1 resolve to 0 on every URL that
   * did not say otherwise.
   *
   * ⚠️ **`|| null` folds an *empty* value into an absent one**, and that half is
   * [#298](https://github.com/mephistopheles4/stacks/issues/298)'s. `Number('')`
   * is also 0, so `?backVary=` — a typo, a dropped value, a template that
   * rendered nothing — turned the variation off exactly as a missing key did.
   * The rule that session wrote it under: **a knob that falls out of a URL must
   * not answer as though somebody chose its most dangerous value.** #298's
   * `?woodSeed=` already worked this way, deliberately, so that two shots whose
   * seed dropped out could not silently agree.
   */
  const varyText = last('backVary') || null;
  const varyRaw = varyText === null ? 1 : Number(varyText);
  const roughRaw = Number(last('backRough'));

  return {
    arm,
    species,
    resolution: RESOLUTIONS.find((edge) => edge === Number(last('backRes'))) ?? 512,
    unitsPerTile: positive('backTile', SHEETS[species].mm / MM_PER_UNIT),
    normalScale: positive('backNormal', arm === 'wire' ? 4 : 1),
    detail: positive('backDetail', 0),
    vary: Number.isFinite(varyRaw) && varyRaw >= 0 ? Math.min(varyRaw, 1) : 1,
    roughness:
      last('backRough') !== null && Number.isFinite(roughRaw) && roughRaw >= 0
        ? Math.min(roughRaw, 1)
        : undefined,
    fibreTurn:
      last('backFibreTurn') === null
        ? SHEETS[species].grain === 'u'
        : last('backFibreTurn') !== '0',
  };
}

/**
 * Whether the backboard's geometry needs its UV axes swapped for this sheet.
 *
 * The backboard's front face spans world `x` on `u` and world `y` on `v`. #285
 * states the grain runs **vertically**, so the axis the grain runs along has to
 * land on world `y` — which means a sheet whose grain runs along `u` needs the
 * swap and a sheet whose grain runs along `v` does not.
 *
 * ⚠️ **#285 states the direction rather than deriving it, and this function is
 * why that mattered.** A "long axis" rule would turn the backboard's grain 90
 * degrees the day the library fills its third row, because the board is wider
 * than tall at 2 and 3 rows and taller than wide from 4 on.
 */
export function backboardSwapsAxes(species: BackSpecies): boolean {
  return SHEETS[species].grain === 'u';
}

function configure(texture: THREE.Texture, colour: boolean): THREE.Texture {
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  return texture;
}

/**
 * Bind an arm's maps onto the **backing** material.
 *
 * `window.__backReady` goes true once every map this arm asked for has decoded,
 * and `window.__backArm` publishes what was actually resolved. Both exist for
 * the reason #284 learned twice: *"the arm is invisible"* and *"the arm had not
 * loaded yet"* are the same screenshot, and a query string is an assumption
 * until something states what came out of it.
 */
export function applyBackArm(
  material: THREE.MeshStandardMaterial,
  config: BackArmConfig,
): void {
  (window as unknown as { __backArm?: BackArmConfig }).__backArm = config;

  if (config.roughness !== undefined) material.roughness = config.roughness;
  // ⚠️ Only when the backboard's geometry actually carries the attribute, which
  // `scene.ts` gives it under exactly this condition. `vertexColors` on a
  // material whose geometry has no `color` attribute reads undefined data.
  if (config.arm !== 'off' && config.vary > 0) material.vertexColors = true;

  const done = (): void => {
    material.needsUpdate = true;
    (window as unknown as { __backReady?: boolean }).__backReady = true;
  };

  if (config.arm === 'off') {
    done();
    return;
  }

  const sheet = SHEETS[config.species];

  if (config.arm === 'flat') {
    const means: Record<number, number> = sheet.mean;
    material.color.setHex(means[config.resolution] ?? means[512] ?? 0x4a3527);
    done();
    return;
  }

  const loader = new THREE.TextureLoader();
  const size = String(config.resolution);
  const pending: Promise<unknown>[] = [];

  const load = (file: string, colour: boolean): THREE.Texture => {
    let settle: () => void = () => undefined;
    pending.push(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const texture = loader.load(
      `/wood/${file}`,
      () => {
        settle();
      },
      undefined,
      () => {
        console.warn(`[prototype-backboard] ${file} failed to load`);
        settle();
      },
    );
    return configure(texture, colour);
  };

  const wantsPigment = config.arm === 'pigment' || config.arm === 'both' || config.arm === 'wire';
  const wantsRelief = config.arm === 'relief' || config.arm === 'both' || config.arm === 'wire';

  if (wantsPigment) {
    material.map = load(`${sheet.prefix}-diff-${size}.jpg`, true);
    // ⚠️ `map` **multiplies** `color`, and `color` here is `woodDark`. Left
    // alone the sheet would render at a third of its own brightness and the
    // mean-matched twin would then match nothing. White is the only value that
    // lets the sheet speak for itself — and it is also why the darkness has to
    // come from the sheet rather than from the material.
    material.color.setHex(0xffffff);
  }
  if (wantsRelief) {
    if (config.detail > 0) {
      const fibre = fibreNormalMap();
      if (fibre !== undefined) {
        /**
         * ⚠️ **A clone, because `repeat` lives on the texture and the woodwork
         * is already wearing this one.** `fibreNormalMap` caches one instance
         * for the life of the page — `page-edges.ts`'s pattern — so setting
         * `repeat` here would silently re-lay the *planks'* fibre at the
         * backboard's period, and the woodwork arm underneath every one of
         * these renders would stop being #284's standing candidate.
         *
         * A clone shares the canvas through three.js's `Source`, so the two
         * are one upload rather than two — **and the arm matrix prints
         * `renderer.info.memory.textures` rather than trusting that sentence.**
         */
        const own = fibre.clone();
        own.needsUpdate = true;
        const period = config.unitsPerTile / config.detail;
        own.repeat.set(period, period);
        /**
         * ⚠️ **The fibre and the figure are perpendicular in the map, and on
         * this sheet that showed.**
         *
         * `prototype-wood-detail.ts` draws its fibre long on the texture's `v`
         * axis — `LATTICE.along` — which is the axis *rosewood's* grain runs
         * down, so on the woodwork the two happen to agree and nothing had to
         * think about it. `dark_wood`'s grain runs along `u`. A UV swap turns
         * both maps together, so it cannot separate them: wherever both are
         * bound on this sheet the fibre crosses the figure at 90 degrees, and a
         * 3x crop of the bare backboard shows it as ruled horizontal lines over
         * a vertical figure.
         *
         * Rotating the fibre's **own** matrix is the separation, and it costs
         * nothing — a texture matrix, not a second canvas.
         */
        if (config.fibreTurn) {
          own.center.set(0.5, 0.5);
          own.rotation = Math.PI / 2;
        }
        material.normalMap = own;
      }
    } else {
      material.normalMap = load(`${sheet.prefix}-nor-${size}.jpg`, false);
    }
    material.normalScale = new THREE.Vector2(config.normalScale, config.normalScale);
  }

  if (config.arm === 'wire') {
    material.color.setHex(0x44ff88);
    material.roughness = 0.2;
  }

  void Promise.all(pending).then(done, done);
}
