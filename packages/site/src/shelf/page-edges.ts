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

/** Wide enough to resolve the stripes, one pixel tall in spirit. */
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 8;

/**
 * Gatherings across the block, not individual leaves.
 *
 * A real text block has hundreds of leaves; drawing them would put several
 * stripes inside one screen pixel on a book whose head strip is a dozen pixels
 * tall, and mipmapping would average the lot back to flat — or worse, moiré on
 * the way. What actually reads at this distance is the coarser grouping of
 * signatures, so that is what this draws.
 */
const GATHERINGS = 14;

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
 * A height profile across the thickness, as gatherings of varying width and
 * depth with a soft valley between each.
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
  const shaped = 0.5 - 0.5 * Math.cos((within + skew) * Math.PI * 2);
  return shaped * depth;
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

  for (let x = 0; x < TEXTURE_WIDTH; x++) {
    const u = x / TEXTURE_WIDTH;
    // Central difference, wrapping, so the map tiles without a seam.
    const before = heightAt((u - step + 1) % 1);
    const after = heightAt((u + step) % 1);
    const slope = (after - before) / (2 * step);

    // The normal of a height field h(u) is normalize(-dh/du, 0, 1); the scale
    // keeps the encoded slope inside the byte range for the slopes this
    // profile actually produces.
    const nx = Math.max(-1, Math.min(1, -slope * 0.04));
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
  return texture;
}
