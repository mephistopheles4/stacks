/**
 * PROTOTYPE ONLY — wayfinder ticket #68, "Does one shared grain read as cloth
 * across a 2.26× spread of spines?".
 *
 * #58 decided the spine's pixels are three generated layers and costed all
 * three, but never rendered the one it invented: a binding-keyed grain in
 * `roughnessMap`. This module is that layer, built four ways so a picture can
 * separate them. Nothing here is meant to ship as written — the arms exist to
 * be compared and three of them to be thrown away.
 *
 * Cut from `main`, so the spine here has **no `normalMap` at all**. #55's curve
 * rise and #56's hinge profile are both headed for that slot and neither is
 * merged. A normal map moves where the specular highlight sits and roughness
 * grain modulates that highlight, so what this renders is grain on a *flat*
 * spine. That is the honest comparison available today and it is not the final
 * one.
 *
 * `bindingFor` stands in for #57's hashed binding rather than being a second
 * implementation of it — #57's prototype is unmerged on `prototype/binding-mix`
 * and cutting from it would confound grain with a changed silhouette.
 */
import * as THREE from 'three';

export type GrainArm = 'canvas' | 'flat' | 'shared' | 'strength' | 'perbook' | 'extreme';
export type Binding = 'hardback' | 'paperback';

/** Reads the arm this page was opened with; `undefined` is today's shelf. */
export function grainArm(): GrainArm | undefined {
  const flag = (globalThis as { __grain?: unknown }).__grain;
  return flag === 'canvas' ||
    flag === 'flat' ||
    flag === 'shared' ||
    flag === 'strength' ||
    flag === 'perbook' ||
    flag === 'extreme'
    ? flag
    : undefined;
}

/**
 * #57's decision, reimplemented at its smallest: a stable per-book hash, 60%
 * paperback. No frontmatter override here — this ticket is about the grain, and
 * an override changes nothing a render can show.
 */
const PAPERBACK_RATIO = 0.6;

export function bindingFor(hashUnitValue: number): Binding {
  return hashUnitValue < PAPERBACK_RATIO ? 'paperback' : 'hardback';
}

/**
 * The side of one grain tile in world units — the physical size of the patch of
 * cloth the texture depicts, *not* a UV number.
 *
 * A book stands 0.78–0.95 world units tall and a real one is about 230mm, so a
 * world unit is roughly 275mm. At 16 threads to a tile this is a weave of about
 * 12 threads per centimetre, which is ordinary book cloth. Every `repeat` below
 * is derived from this rather than dialled, so the two arms differ only in
 * *what they are allowed to vary*, never in how coarse the cloth is.
 */
const TILE_WORLD = 0.047;

const GRAIN_PX = 256;
const THREADS_PER_TILE = 16;

/**
 * The roughness a grain map is multiplied *into*.
 *
 * `roughnessMap` multiplies `roughness`, so the material carries the top of each
 * band and the map carries the fraction below it. Today's spine is a flat 0.62
 * for everything; buckram is coarser cloth than that and coated card is
 * smoother, which is the whole reason #58 wanted two.
 */
const BANDS: Record<Binding, { readonly low: number; readonly high: number }> = {
  hardback: { low: 0.52, high: 0.82 },
  paperback: { low: 0.34, high: 0.52 },
};

/**
 * A deliberately absurd band, and the only reason it exists.
 *
 * The first render came back with the grain invisible at both framings, which
 * is one of the three outcomes the ticket names — but "invisible" and "never
 * bound" are the same picture, and only one of them is a finding. This arm
 * drives roughness across its entire legal range, far past anything cloth does.
 * If *that* is still invisible the map is not reaching the shader; if it shows,
 * the wiring is sound and the plausible band genuinely reads as nothing.
 */
const EXTREME = { low: 0, high: 1 };

/** Tileable value noise: coordinates are taken modulo the tile, so seams cannot show. */
function noise(x: number, y: number, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  h = Math.imul(h ^ (x & 0xff), 0x01000193) >>> 0;
  h = Math.imul(h ^ (y & 0xff), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x01000193) >>> 0;
  return (h >>> 8) / 0x1000000;
}

/** A smoothed noise, so card reads as fibre rather than television static. */
function softNoise(x: number, y: number, seed: number): number {
  let total = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) total += noise(x + dx, y + dy, seed);
  }
  return total / 9;
}

/**
 * A plain weave, drawn as an over-under checker of warp and weft.
 *
 * Each cell is one thread crossing: the thread on top gets a rounded ridge
 * across it, the one beneath stays flat. That is what a plain weave is, and it
 * is why buckram catches light in two directions at once.
 */
function weave(): Float32Array {
  const values = new Float32Array(GRAIN_PX * GRAIN_PX);
  const cell = GRAIN_PX / THREADS_PER_TILE;
  for (let y = 0; y < GRAIN_PX; y += 1) {
    for (let x = 0; x < GRAIN_PX; x += 1) {
      const warpOnTop = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0;
      const across = ((x % cell) + cell) % cell / cell;
      const up = ((y % cell) + cell) % cell / cell;
      const ridge = Math.sin(Math.PI * (warpOnTop ? across : up));
      // Irregular thread thickness, or the weave reads as a printed grid.
      const slub = softNoise(x, y, 0x9e37) * 0.18;
      values[y * GRAIN_PX + x] = Math.min(1, ridge * 0.82 + slub);
    }
  }
  return values;
}

/**
 * Coated card: no weave at all, just the faint fibre and speckle a matt
 * laminate leaves. Deliberately far less structured than the cloth — if these
 * two are indistinguishable on a spine, that is the finding, not a bug.
 */
function card(): Float32Array {
  const values = new Float32Array(GRAIN_PX * GRAIN_PX);
  for (let y = 0; y < GRAIN_PX; y += 1) {
    for (let x = 0; x < GRAIN_PX; x += 1) {
      const fibre = softNoise(x * 2, y, 0x51ed) * 0.7 + softNoise(x, y, 0x77a1) * 0.3;
      values[y * GRAIN_PX + x] = 0.35 + fibre * 0.5;
    }
  }
  return values;
}

/** Greyscale, so it reads the same whichever channel the renderer samples. */
function toCanvas(values: Float32Array, low: number, high: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_PX;
  canvas.height = GRAIN_PX;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context for the grain tile');

  const image = ctx.createImageData(GRAIN_PX, GRAIN_PX);
  for (let i = 0; i < values.length; i += 1) {
    // The map is a fraction of `high`, because `roughness` carries the top.
    const roughness = low + (values[i] ?? 0) * (high - low);
    const byte = Math.round((roughness / high) * 255);
    image.data[i * 4] = byte;
    image.data[i * 4 + 1] = byte;
    image.data[i * 4 + 2] = byte;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

interface Sources {
  readonly buckram: HTMLCanvasElement;
  readonly card: HTMLCanvasElement;
  /**
   * The "one grain, two strengths" arm — and it is deliberately the *same*
   * canvas as `buckram`.
   *
   * A map encodes a fraction of `roughness`, so the buckram tile scaled by the
   * paperback band is exactly "one grain, binding scales strength": same
   * relative contrast, lower absolute roughness. Giving this arm its own
   * wider-contrast tile would make it lose on a difference nobody proposed.
   */
  readonly neutral: HTMLCanvasElement;
  /** See `EXTREME` — a wiring check, never a candidate. */
  readonly extreme: HTMLCanvasElement;
}

let sources: Sources | undefined;

function grainSources(): Sources {
  if (sources !== undefined) return sources;
  const woven = weave();
  const buckram = toCanvas(woven, BANDS.hardback.low, BANDS.hardback.high);
  sources = {
    buckram,
    card: toCanvas(card(), BANDS.paperback.low, BANDS.paperback.high),
    neutral: buckram,
    extreme: toCanvas(woven, EXTREME.low, EXTREME.high),
  };
  return sources;
}

/**
 * What the shelf paid, tallied as it is spent rather than asserted afterwards.
 *
 * #53 measured one book at ~1.51 MiB and 6 draw calls and set a ceiling of
 * ≤0.5 MiB and +1 draw call for a new effect. #58 claimed this layer costs +0
 * per book. Only one of the arms below keeps that claim, so the number is
 * counted per arm and printed.
 */
export interface GrainCost {
  arm: GrainArm | undefined;
  /** Textures uploaded once for the whole shelf. */
  sharedTextures: number;
  /** Texture instances uploaded per book. */
  perBookTextures: number;
  books: number;
  sharedBytes: number;
  perBookBytes: number;
  /**
   * The type canvas, tallied because #58's aspect-correct sizing moves it in
   * both directions at once: a narrower canvas on a thin book subtracts bytes,
   * and retiring `MIN_LEGIBLE_THICKNESS` gives type to books that had none. The
   * net is not obvious, so it is counted rather than claimed.
   */
  spineCanvasBytes: number;
  typedBooks: number;
  /**
   * How many spine materials actually came out of `applyGrain` carrying a
   * `roughnessMap`. Reported because "the effect is invisible" and "the effect
   * was never bound" produce the same screenshot, and only one is a finding.
   */
  mapsBound: number;
  sampleRoughness: number;
}

/** Records what one book's type canvas costs, whatever decided its width. */
export function noteSpineCanvas(width: number, height: number): void {
  cost.spineCanvasBytes += Math.round(width * height * RGBA * MIP_FACTOR);
  cost.typedBooks += 1;
}

const RGBA = 4;
/** A full mip chain adds a third again on top of the base level. */
const MIP_FACTOR = 4 / 3;
const TILE_BYTES = Math.round(GRAIN_PX * GRAIN_PX * RGBA * MIP_FACTOR);

export const cost: GrainCost = {
  arm: undefined,
  sharedTextures: 0,
  perBookTextures: 0,
  books: 0,
  sharedBytes: 0,
  perBookBytes: 0,
  spineCanvasBytes: 0,
  typedBooks: 0,
  mapsBound: 0,
  sampleRoughness: 0,
};

// The tally is a live object, so the render script reads the real counters
// after the shelf has built rather than being told what they should be.
(globalThis as { __grainCost?: GrainCost }).__grainCost = cost;

/** Shared instances, made once and handed to every book that wants them. */
const sharedTextures = new Map<string, THREE.Texture>();

function sharedTexture(key: keyof Sources, repeatX: number, repeatY: number): THREE.Texture {
  const id = `${key}:${repeatX.toFixed(4)}:${repeatY.toFixed(4)}`;
  const existing = sharedTextures.get(id);
  if (existing !== undefined) return existing;

  const texture = new THREE.CanvasTexture(grainSources()[key]);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  sharedTextures.set(id, texture);
  cost.sharedTextures += 1;
  cost.sharedBytes += TILE_BYTES;
  return texture;
}

/**
 * The median book, measured off the shelf that is actually being drawn.
 *
 * The shared-`repeat` arm has to be set up charitably or it answers a question
 * nobody asked: `repeat = (1,1)` on a plane scaled `(thickness, height)` smears
 * the weave ~14× on the thinnest spine, which renders as an obvious bug and
 * proves only that (1,1) is the wrong number. So the weave is made square at
 * the **median** thickness and the spread is allowed to push it coarse and fine
 * either side of that — which is the best a single shared texture can do.
 */
let median = { thickness: 0.1075, height: 0.865 };

export function setShelfMedian(books: readonly { thickness: number; height: number }[]): void {
  if (books.length === 0) return;
  const at = (values: number[]): number =>
    values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  median = {
    thickness: at(books.map((book) => book.thickness)),
    height: at(books.map((book) => book.height)),
  };
}

export function medianBook(): { thickness: number; height: number } {
  return median;
}

export interface GrainRequest {
  readonly arm: GrainArm;
  readonly binding: Binding;
  readonly thickness: number;
  readonly height: number;
}

/**
 * Puts the arm's grain on a spine material.
 *
 * `canvas` deliberately does nothing: it is the control that isolates #58's
 * aspect-correct canvas from the grain, so the grain is judged against
 * un-stretched type rather than credited with fixing the stretch.
 */
export function applyGrain(material: THREE.MeshStandardMaterial, request: GrainRequest): void {
  cost.arm = request.arm;
  cost.books += 1;
  if (request.arm === 'canvas') return;

  const band = BANDS[request.binding];

  if (request.arm === 'flat') {
    // No map at all — binding picks one roughness *number*, the midpoint of the
    // band the grain would have covered.
    //
    // This separates the two things every other arm changes at once. A grain
    // map alters the average roughness of a spine as well as putting a pattern
    // on it, and against today's flat 0.62 those move together. Differencing a
    // grain arm against *this* leaves only the weave. If that difference is
    // nothing, #58's two textures are buying a tone shift that two constants
    // buy for +0 bytes.
    material.roughness = (band.low + band.high) / 2;
    cost.sampleRoughness = material.roughness;
    return;
  }

  if (request.arm === 'extreme') {
    material.roughnessMap = sharedTexture(
      'extreme',
      median.thickness / TILE_WORLD,
      median.height / TILE_WORLD,
    );
    material.roughness = EXTREME.high;
    cost.mapsBound += 1;
    cost.sampleRoughness = material.roughness;
    return;
  }

  if (request.arm === 'strength') {
    // One grain, binding scales strength — the option #58 rejected without
    // rendering it. Same texture, same repeat, different `roughness`.
    material.roughnessMap = sharedTexture(
      'neutral',
      median.thickness / TILE_WORLD,
      median.height / TILE_WORLD,
    );
    material.roughness = band.high;
    cost.mapsBound += 1;
    cost.sampleRoughness = material.roughness;
    return;
  }

  const key = request.binding === 'hardback' ? 'buckram' : 'card';

  if (request.arm === 'shared') {
    material.roughnessMap = sharedTexture(
      key,
      median.thickness / TILE_WORLD,
      median.height / TILE_WORLD,
    );
    material.roughness = band.high;
    cost.mapsBound += 1;
    cost.sampleRoughness = material.roughness;
    return;
  }

  // Per-book `repeat`: the weave is square on every book, at the price of a
  // texture instance per book. One `repeat` lives on the texture, not the
  // material, so there is no way to share this.
  const texture = new THREE.CanvasTexture(grainSources()[key]);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(request.thickness / TILE_WORLD, request.height / TILE_WORLD);
  texture.anisotropy = 8;
  material.roughnessMap = texture;
  material.roughness = band.high;
  cost.mapsBound += 1;
  cost.sampleRoughness = material.roughness;
  cost.perBookTextures += 1;
  cost.perBookBytes += TILE_BYTES;
}
