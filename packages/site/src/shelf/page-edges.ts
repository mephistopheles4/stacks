import * as THREE from 'three';

/**
 * PROTOTYPE — wayfinder ticket #54.
 *
 * The striation of a cut text block, as **one normal map shared by every book
 * on the shelf**. No colour map: at shelf distance leaves read as relief under
 * the key light, not as pigment, and a normal map costs no per-book bytes.
 *
 * ## Why one map is correct on every face that can show
 *
 * Page striation is physically a *one-dimensional* pattern: leaves stack along
 * the book's thickness, so the pattern varies along local x and is constant
 * along the direction the cut edges run. That is exactly what a texture varying
 * only in u gives, and `BoxGeometry` maps u to local x on four of six faces —
 * `py` and `ny` (head and tail) via `buildPlane('x','z','y')`, `pz` and `nz`
 * (spine side and fore-edge) via `buildPlane('x','y','z')`.
 *
 * The two faces where u maps to z instead are `px` and `nx` — the ones the
 * cover boards sit against and permanently occlude. So the "six faces want
 * three treatments" problem dissolves: it is real for a general 2D texture and
 * absent for a 1D one, which is why this needs neither a material array (+5
 * draw calls per book) nor custom UVs baked into a geometry that every book
 * shares.
 *
 * ## What it costs
 *
 * One 512×8 RGB texture for the entire shelf — ~16 KB decoded, once, however
 * many books there are. No geometry change, so the page block stays the single
 * shadow caster per book, which is the resource the one recorded crash actually
 * exhausted.
 */

/**
 * Wide enough to resolve individual leaves up close.
 *
 * Generous on purpose: this is **one texture for the entire shelf**, so its
 * size does not scale with the library. 2048×8 RGB is ~64 KB decoded, once,
 * whether there are 33 books or 3,000.
 */
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 8;

/**
 * Two scales, because the shelf is looked at from two distances.
 *
 * `GATHERINGS` is the coarse grouping of signatures — the thing that still
 * reads when a book is an inch tall on screen. `LEAVES_PER_GATHERING` is the
 * per-leaf line detail that only exists for someone who has zoomed in.
 *
 * **Mipmapping is the level-of-detail scheme, and it is free.** As a book
 * recedes the GPU samples smaller mip levels, which average the fine lines away
 * and leave the coarse profile; up close it samples level 0 and every leaf is
 * there. That is exactly the behaviour a hand-written LOD switch would
 * implement, minus the switch, the second asset and the popping.
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
function heightAt(u: number): number {
  const scaled = u * GATHERINGS;
  const index = Math.floor(scaled);
  const within = scaled - index;

  // Each gathering gets its own depth and a slightly offset centre, so the
  // block never reads as a comb.
  const depth = 0.55 + noise(index) * 0.45;
  const skew = (noise(index + 0.5) - 0.5) * 0.35;

  // A raised cosine per gathering: smooth, seamless at the joins, and cheap.
  const coarse = (0.5 - 0.5 * Math.cos((within + skew) * Math.PI * 2)) * depth;

  /**
   * The leaves themselves.
   *
   * Uneven on purpose — a real fore-edge is not a ruled grating, and a perfectly
   * periodic one would beat against the pixel grid and shimmer. Each leaf is
   * nudged by the same deterministic noise, which breaks the period up.
   */
  const leafScaled = u * GATHERINGS * LEAVES_PER_GATHERING;
  const leafIndex = Math.floor(leafScaled);
  const jitter = (noise(leafIndex * 1.7) - 0.5) * 0.55;
  const leaf = 0.5 - 0.5 * Math.cos((leafScaled - leafIndex + jitter) * Math.PI * 2);

  return coarse * (1 - LEAF_DEPTH) + leaf * LEAF_DEPTH;
}

/**
 * The shared striation map.
 *
 * Encoded the usual way — a tangent-space normal, flat being (128, 128, 255).
 * Only the red channel moves, because only the u derivative is non-zero.
 */
export function makePageStriationMap(): THREE.CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const image = ctx.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const step = 1 / TEXTURE_WIDTH;

  /**
   * Slopes first, then encode — the scale is derived, not a magic number.
   *
   * The profile's steepness depends on how many leaves are in it, so a constant
   * tuned for one `LEAVES_PER_GATHERING` saturates at another and the relief
   * turns into hard black-and-white edges. Normalising against the actual
   * maximum keeps the map well-formed whatever the two constants are set to.
   */
  const slopes = new Float32Array(TEXTURE_WIDTH);
  let steepest = 0;
  for (let x = 0; x < TEXTURE_WIDTH; x++) {
    const u = x / TEXTURE_WIDTH;
    // Central difference, wrapping, so the map tiles without a seam.
    const before = heightAt((u - step + 1) % 1);
    const after = heightAt((u + step) % 1);
    const slope = (after - before) / (2 * step);
    slopes[x] = slope;
    if (Math.abs(slope) > steepest) steepest = Math.abs(slope);
  }

  // Short of 1.0 so the steepest leaf still has somewhere to go, rather than
  // clipping flat at the extremes.
  const scale = steepest === 0 ? 0 : 0.92 / steepest;

  for (let x = 0; x < TEXTURE_WIDTH; x++) {
    // The normal of a height field h(u) is normalize(-dh/du, 0, 1).
    const nx = -(slopes[x] ?? 0) * scale;
    const r = Math.round((nx * 0.5 + 0.5) * 255);

    for (let y = 0; y < TEXTURE_HEIGHT; y++) {
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
   * from a shelf is about as grazing as a surface gets — which is precisely the
   * case trilinear filtering blurs to mush and anisotropic filtering keeps
   * sharp. Three clamps the request to what the GPU actually offers.
   */
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 16;
  return texture;
}
