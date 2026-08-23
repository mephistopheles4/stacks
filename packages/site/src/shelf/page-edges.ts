import * as THREE from "three";

/**
 * The striation of a cut text block, as **one normal map shared by every book on
 * the shelf**.
 *
 * No colour map: leaves read as relief under the key light rather than as
 * pigment, and a normal map costs no per-book bytes.
 *
 * ## Why one map is correct on every face that can show
 *
 * Page striation is physically a **one-dimensional** pattern. Leaves stack along
 * the book's thickness, so it varies along local `x` and is constant along the
 * direction the cut edges run — which is exactly what a texture varying only in
 * `u` gives. `BoxGeometry` maps `u` to local `x` on four of its six faces: `py`
 * and `ny` (head and tail) through `buildPlane('x','z','y')`, `pz` and `nz`
 * (spine side and fore-edge) through `buildPlane('x','y','z')`.
 *
 * The two faces where `u` maps to `z` instead are `px` and `nx` — the ones the
 * cover boards sit against and permanently occlude.
 *
 * **So "six faces want three treatments" is not a problem this has.** It is real
 * for a general 2D texture and absent for a 1D one, which is what strikes both
 * candidate fixes: a material array (+5 draw calls per book) and custom baked UVs
 * on a geometry every book shares.
 *
 * ## Where it is judged
 *
 * At the *near* distance, and that had to be settled before the effect could be
 * argued for at all. The page block is 0.06% of a book's pixels at the full-shelf
 * framing, which recommends rejecting every approach — and the owner overruled
 * it, because people zoom in and several said so unprompted. Share of screen is
 * scale-invariant and so cannot answer a question about detail: the same surface
 * that is 76 pixels at the full framing is **9,678** at `minDistance`, a 127×
 * change in the number that matters while the share barely moves (#54).
 *
 * ## What it costs
 *
 * One 2048×8 texture for the entire shelf — ~64 KB decoded, once, whether there
 * are 33 books or 3,000 — **+0 draw calls and +0 per-book textures**. No geometry
 * changes, so the page block stays the single shadow caster per book.
 */

/**
 * Wide enough to resolve individual leaves up close.
 *
 * Generous on purpose: this is one texture for the entire shelf, so its size does
 * not scale with the library.
 */
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 8;

/**
 * Two scales, because the shelf is looked at from two distances.
 *
 * `GATHERINGS` is the coarse grouping of signatures — what still reads when a
 * book is an inch tall on screen. `LEAVES_PER_GATHERING` is the per-leaf line
 * detail that exists only for someone who has zoomed in.
 *
 * **Mipmapping is the level-of-detail scheme, and it is free.** As a book recedes
 * the GPU samples smaller mip levels, which average the fine lines away and leave
 * the coarse profile; up close it samples level 0 and every leaf is there. That
 * is what a hand-written LOD switch would implement, minus the switch, the second
 * asset and the popping.
 *
 * These three are #54's prototype numbers, accepted on its close-ups and never
 * re-derived. They are taste, and they are the first thing to move if the block
 * ever reads wrong.
 */
const GATHERINGS = 14;
const LEAVES_PER_GATHERING = 11;

/** How much of the relief belongs to the fine leaves rather than the grouping. */
const LEAF_DEPTH = 0.32;

/**
 * A deterministic value noise, so the shelf looks the same on every reload.
 *
 * `Math.random()` here would give each mount a different block, and the whole
 * point of `heightFor`'s hash elsewhere is that a book keeps its shape.
 */
function noise(index: number): number {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A height profile across the thickness: gatherings of varying width and depth,
 * with individual leaves cut into each one.
 */
export function heightAt(u: number): number {
  const scaled = u * GATHERINGS;
  const index = Math.floor(scaled);
  const within = scaled - index;

  /**
   * Each gathering gets its own depth and a slightly offset centre, so the block
   * never reads as a comb — and the index **wraps**, which the profile this was
   * lifted from did not do.
   *
   * Without the wrap the height field is discontinuous at `u = 1`: gathering 14
   * draws different noise from gathering 0, so `heightAt(0)` and `heightAt(1)`
   * disagree by 0.025 and the wrapping central difference in `slopeProfile`
   * reports a ~25 slope across a step where the surface is actually smooth.
   *
   * That reaches further than one texel, because `encodingScale` normalises the
   * whole map against its steepest slope: a spurious spike at the seam would
   * quietly compress every real leaf beside it. It happens not to have — the
   * leaves reach ~155 — so this was a latent trap rather than a visible fault,
   * and it would have sprung the moment somebody lowered
   * `LEAVES_PER_GATHERING`, which is exactly the number the comment above invites
   * them to change.
   */
  const wrapped = ((index % GATHERINGS) + GATHERINGS) % GATHERINGS;
  const depth = 0.55 + noise(wrapped) * 0.45;
  const skew = (noise(wrapped + 0.5) - 0.5) * 0.35;

  // A raised cosine per gathering: smooth, seamless at the joins, and cheap.
  const coarse = (0.5 - 0.5 * Math.cos((within + skew) * Math.PI * 2)) * depth;

  /**
   * The leaves themselves.
   *
   * Uneven on purpose — a real fore-edge is not a ruled grating, and a perfectly
   * periodic one would beat against the pixel grid and shimmer. Each leaf is
   * nudged by the same deterministic noise, which breaks the period up.
   */
  const leaves = GATHERINGS * LEAVES_PER_GATHERING;
  const leafScaled = u * leaves;
  const leafIndex = Math.floor(leafScaled);
  // Wrapped for the same reason as the gathering above.
  const wrappedLeaf = ((leafIndex % leaves) + leaves) % leaves;
  const jitter = (noise(wrappedLeaf * 1.7) - 0.5) * 0.55;
  const leaf =
    0.5 - 0.5 * Math.cos((leafScaled - leafIndex + jitter) * Math.PI * 2);

  return coarse * (1 - LEAF_DEPTH) + leaf * LEAF_DEPTH;
}

/**
 * The one map, for the life of the page.
 *
 * Module-level, like the spine profile's and `UNIT_BOX` — the whole claim of this
 * effect is that a shelf of any size uploads one of these, so a per-mount cache
 * would give that away on the first rebuild. Never freed by `mountShelf`'s
 * traverse, which touches `map` and not `normalMap`.
 */
let shared: THREE.CanvasTexture | undefined;
let built = false;

export function pageStriationMap(): THREE.CanvasTexture | undefined {
  if (!built) {
    built = true;
    shared = bake();
  }
  return shared;
}

function bake(): THREE.CanvasTexture | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (ctx === null) return undefined;

  const image = ctx.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const slopes = slopeProfile();
  const scale = encodingScale(slopes);

  for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
    // The normal of a height field h(u) is normalize(-dh/du, 0, 1). Only the red
    // channel moves, because only the u derivative is non-zero.
    const nx = -(slopes[x] ?? 0) * scale;
    const r = Math.round((nx * 0.5 + 0.5) * 255);

    for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
      const offset = (y * TEXTURE_WIDTH + x) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = 128;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // A normal map carries geometry, not colour: it must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  /**
   * Both matter for a page block specifically.
   *
   * Mipmaps are the level-of-detail scheme (see `GATHERINGS`), and a head seen
   * from a shelf is about as grazing as a surface gets — precisely the case
   * trilinear filtering blurs to mush and anisotropic filtering keeps sharp.
   * Three clamps the request to what the GPU actually offers.
   */
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 16;
  return texture;
}

/** The profile's slope at every texel, by central difference, wrapping. */
export function slopeProfile(width: number = TEXTURE_WIDTH): Float32Array {
  const step = 1 / width;
  const slopes = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    const u = x / width;
    // Wrapping, so the map tiles without a seam.
    const before = heightAt((u - step + 1) % 1);
    const after = heightAt((u + step) % 1);
    slopes[x] = (after - before) / (2 * step);
  }

  return slopes;
}

/**
 * How steeply the profile is written into the map — **derived, not tuned**.
 *
 * The profile's steepness depends on how many leaves are in it, so a constant
 * chosen for one `LEAVES_PER_GATHERING` saturates at another and the relief turns
 * into hard black-and-white edges. Normalising against the actual maximum keeps
 * the map well-formed whatever the two constants above are set to, which is the
 * difference between a number somebody can safely change and a trap.
 *
 * Short of 1.0 so the steepest leaf still has somewhere to go rather than
 * clipping flat at the extremes.
 */
export function encodingScale(slopes: Float32Array): number {
  let steepest = 0;
  for (const slope of slopes) steepest = Math.max(steepest, Math.abs(slope));
  return steepest === 0 ? 0 : 0.92 / steepest;
}
