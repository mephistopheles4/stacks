/**
 * PROTOTYPE ONLY — wayfinder ticket #284, under map #280. Never merged to
 * `main`.
 *
 * A **detail layer**: fine wood fibre, drawn in code, tiled far tighter than
 * the photograph and bound into the slot the photograph was wasting.
 *
 * ## Why this rather than a bigger file
 *
 * The owner's report is that rosewood goes soft close up, and the ladder in
 * `scripts/prototype-wood-resolution.ts` says why: its sheet is 2430 mm, so at
 * 512 it carries **67 texels per world unit**. The obvious answers both lose:
 *
 * - **Ship more texels.** 1024 costs 8.0 MB decoded and 2048 costs 32.0 MB, per
 *   pair of maps, on a page whose mobile risk is gated by nothing.
 * - **Upscale the 512, by any means including a model.** It cannot beat simply
 *   shipping the 1024 that already exists — Poly Haven publishes this sheet at
 *   1k, 2k, 4k and 8k, so there is no missing detail to hallucinate back, and
 *   the output would be a *larger* file, which is the wrong direction on the
 *   constraint that actually binds.
 *
 * **The two problems are at different frequencies, and one file has to serve
 * both.** The photograph carries the low-frequency figure — the thing that made
 * rosewood win — and it has to be laid huge for that figure not to repeat.
 * Close-up crispness is high-frequency fibre, which is the same everywhere on a
 * board and therefore the one thing that *may* repeat every few centimetres
 * without anybody seeing it. Splitting them lets each be laid at the scale it
 * wants.
 *
 * ## What it costs, and the slot it uses
 *
 * A 256-square `CanvasTexture` baked once at module level — `page-edges.ts`'s
 * pattern exactly, and for its reason: one upload for a shelf of any size.
 * **Zero bytes on the wire**, because there is no file. It takes `normalMap`,
 * which the arms already measured as **0.000% above the just-noticeable
 * threshold at every rung** at the sheet's own strength — a flat-sliced veneer
 * has no relief to encode, so that slot was carrying a texture and doing
 * nothing. This is not an extra texture; it is a better use of one.
 *
 * ⚠️ **It is procedural, which is the arm [#281](https://github.com/mephistopheles4/stacks/issues/281)
 * set aside and named the route back to.** Its own words: the procedural option
 * is *"the route back if 'reads as wood' turns out not to be enough"*. It is
 * back for the fibre only — the figure stays a photograph, because nothing here
 * shows code can draw koa's banding, which is the finding that set it aside.
 */
import * as THREE from 'three';

/** Square, and small: the fibre is high-frequency, so it needs period rather than extent. */
const EDGE = 256;

/**
 * How hard the fibre pushes the normal, before `normalScale`.
 *
 * ⚠️ **The first draft multiplied the slope by `EDGE` and this is what that
 * looked like: hard vertical bars, in blocks, with visible steps across.** Two
 * mistakes, and both are worth naming because either alone produces something
 * that still reads as "a texture" from far away.
 *
 * 1. **The noise was never interpolated.** `noise(x, y >> 5)` is a fresh random
 *    value per texel, held constant in 32-row bands — white noise with a step
 *    function on top. A normal map is the *derivative* of its height field, and
 *    the derivative of white noise is white noise at full amplitude, so every
 *    texel pointed somewhere unrelated to its neighbour. The bands were the
 *    integer shift showing through as horizontal breaks.
 * 2. **The gain was 256 times too large.** Slope was `(right - left) × EDGE ×
 *    0.35`, which on a height field in `0..1` reaches about 90 — so
 *    `normalize` drove nearly every texel to the edge of the hemisphere and the
 *    map became two colours. That is what turned noise into bars.
 *
 * Now the height field is proper value noise, smoothly interpolated and summed
 * over three octaves, and the slope is a plain central difference times this
 * gain. Gentle on purpose: the point is a board that stops reading as a
 * photograph pinned to a plank, not a carved one, and `normalScale` is where
 * strength gets dialled live.
 */
const RELIEF = 1.6;

/**
 * The fibre's shape, in texels: how far apart the lattice points are.
 *
 * Wildly anisotropic, because that is what a fibre *is* — a few texels across
 * the grain against most of the tile along it. Three octaves, each half the
 * spacing of the last.
 */
const LATTICE = { across: 24, along: 192 } as const;
const OCTAVES = 3;

let shared: THREE.CanvasTexture | undefined;
let built = false;

/** The one map, for the life of the page. `page-edges.ts`'s cache, for its reason. */
export function fibreNormalMap(): THREE.CanvasTexture | undefined {
  if (!built) {
    built = true;
    shared = bake();
  }
  return shared;
}

/** FNV-1a on two integers, squashed to 0..1 — deterministic, so a rebuild redraws the same board. */
function noise(x: number, y: number): number {
  let hash = 0x811c9dc5;
  for (const value of [x, y]) {
    for (let byte = 0; byte < 4; byte += 1) {
      hash ^= (value >>> (byte * 8)) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return (hash >>> 8) / 0x1000000;
}

/** Hermite ease, so the lattice's corners do not show as creases. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Value noise on a lattice, wrapping, with the two axes on different spacings.
 *
 * ⚠️ **The wrap is on the *lattice*, not on the texel grid**, which is the only
 * way the map tiles seamlessly — and it has to, because this one is laid to
 * repeat many times across a single plank rather than once across a case.
 */
function valueNoise(x: number, y: number, across: number, along: number): number {
  const gx = x / across;
  const gy = y / along;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);

  // How many lattice cells fit the tile, so `% cells` closes the loop.
  const cellsX = Math.max(1, Math.round(EDGE / across));
  const cellsY = Math.max(1, Math.round(EDGE / along));
  const at = (ix: number, iy: number): number =>
    noise(((ix % cellsX) + cellsX) % cellsX, ((iy % cellsY) + cellsY) % cellsY);

  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Three octaves of it, each half the spacing and half the weight. */
function fibreHeight(x: number, y: number): number {
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < OCTAVES; octave += 1) {
    const scale = 2 ** octave;
    const amplitude = 1 / scale;
    total +=
      valueNoise(
        x,
        y,
        Math.max(2, LATTICE.across / scale),
        Math.max(2, LATTICE.along / scale),
      ) * amplitude;
    weight += amplitude;
  }
  return total / weight;
}

function bake(): THREE.CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = EDGE;
  canvas.height = EDGE;
  const context = canvas.getContext('2d');
  if (context === null) return undefined;

  const height = new Float32Array(EDGE * EDGE);
  for (let y = 0; y < EDGE; y += 1) {
    for (let x = 0; x < EDGE; x += 1) {
      height[y * EDGE + x] = fibreHeight(x, y);
    }
  }

  const image = context.createImageData(EDGE, EDGE);
  for (let y = 0; y < EDGE; y += 1) {
    for (let x = 0; x < EDGE; x += 1) {
      // Central difference, wrapping. ⚠️ **No `EDGE` factor** — the slope is
      // per texel, and scaling it by the texture's own size is what turned the
      // first draft into two colours.
      const left = height[y * EDGE + ((x - 1 + EDGE) % EDGE)] ?? 0;
      const right = height[y * EDGE + ((x + 1) % EDGE)] ?? 0;
      const up = height[((y - 1 + EDGE) % EDGE) * EDGE + x] ?? 0;
      const down = height[((y + 1) % EDGE) * EDGE + x] ?? 0;

      const nx = -((right - left) / 2) * RELIEF * EDGE * 0.05;
      // A fifth across the grain: a fibre is long, so its slope along `v` is
      // genuinely small, and encoding it level would read as noise not grain.
      const ny = -((down - up) / 2) * RELIEF * EDGE * 0.01;
      const length = Math.hypot(nx, ny, 1);

      const offset = (y * EDGE + x) * 4;
      image.data[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // Geometry, not colour: it must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  // `page-edges.ts`'s number, and for its reason: a plank's top face seen from
  // standing height is about as grazing as a surface gets, which is exactly
  // where trilinear filtering turns fine stripe to mush.
  texture.anisotropy = 16;
  return texture;
}
