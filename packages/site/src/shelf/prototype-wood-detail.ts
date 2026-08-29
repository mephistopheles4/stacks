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
 * Deliberately gentle. The point is a surface that stops looking like a
 * photograph pinned to a board when the camera is close, not a carved one — and
 * the arms already showed that `normalScale` is where strength gets dialled,
 * for free, live.
 */
const RELIEF = 0.35;

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

function bake(): THREE.CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = EDGE;
  canvas.height = EDGE;
  const context = canvas.getContext('2d');
  if (context === null) return undefined;

  /**
   * A height field, then its slope — the same two steps `page-edges.ts` takes.
   *
   * Wood fibre runs *along* the grain, so the height varies fast across `u` and
   * slowly along `v`. Two octaves across, one slow wander along, so the fibre
   * drifts rather than ruling straight lines: a ruled line reads as corduroy,
   * which is the failure this shape avoids.
   */
  const height = new Float32Array(EDGE * EDGE);
  for (let y = 0; y < EDGE; y += 1) {
    for (let x = 0; x < EDGE; x += 1) {
      const fine = noise(x, y >> 5);
      const coarse = noise(x >> 2, y >> 6);
      const wander = Math.sin((y / EDGE) * Math.PI * 2 + coarse * 6) * 1.5;
      const shifted = noise(Math.round(x + wander) & (EDGE - 1), y >> 5);
      height[y * EDGE + x] = fine * 0.35 + coarse * 0.35 + shifted * 0.3;
    }
  }

  const image = context.createImageData(EDGE, EDGE);
  for (let y = 0; y < EDGE; y += 1) {
    for (let x = 0; x < EDGE; x += 1) {
      // Central difference, wrapping, so the map tiles without a seam — which
      // matters far more here than it does for a sheet, because this one is
      // laid to repeat many times across a single plank.
      const left = height[y * EDGE + ((x - 1 + EDGE) % EDGE)] ?? 0;
      const right = height[y * EDGE + ((x + 1) % EDGE)] ?? 0;
      const up = height[((y - 1 + EDGE) % EDGE) * EDGE + x] ?? 0;
      const down = height[((y + 1) % EDGE) * EDGE + x] ?? 0;

      const nx = -(right - left) * EDGE * RELIEF;
      // A tenth across the grain: fibre is long, so its slope along `v` is
      // nearly nothing, and encoding it at full strength would read as noise.
      const ny = -(down - up) * EDGE * RELIEF * 0.1;
      const length = Math.hypot(nx, ny, 1);

      const offset = (y * EDGE + x) * 4;
      image.data[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((1 / length) * 255);
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
