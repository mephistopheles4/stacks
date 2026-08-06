import * as THREE from 'three';

/**
 * PROTOTYPE — throwaway, for wayfinder ticket #55.
 *
 * Two candidate answers to "does the spine curve, or only appear to?", built
 * side by side so a screenshot can decide between them:
 *
 * - `spineNormalMap()` — one shared normal map, a few pixels tall, that makes a
 *   flat plane take light as though it were rounded. Nothing geometric changes.
 * - `curvedSpinePlane()` / `curvedSpineShell()` — real geometry: the printed
 *   face bows forward, and the covering underneath bows with it so the two do
 *   not delaminate at head and tail.
 *
 * Nothing here ships. The decision is recorded on the ticket; the build is
 * ordinary phase work afterwards.
 */

/**
 * The round of a hardback spine, as a fraction of its width.
 *
 * A text block is backed into a curve rising roughly an eighth of the spine's
 * width. Everything below is in *width units*, so one shape serves a thin book
 * and a fat one: the rise is proportional to the chord, which is what makes a
 * single shared geometry survive `scale.set(thickness, height, thickness)`.
 */
export const RISE = 0.125;

/** Radius of the arc through (-0.5, 0), (0, RISE) and (0.5, 0). */
const RADIUS = (0.25 + RISE * RISE) / (2 * RISE);

/** How far the surface stands proud of the chord at `x`, in width units. */
function riseAt(x: number): number {
  return Math.sqrt(RADIUS * RADIUS - x * x) - (RADIUS - RISE);
}

/** Points across the arc. Enough that the silhouette reads as a curve, not a fan. */
const SEGMENTS = 32;

/**
 * The shared normal map: a cylinder's normals, written across `u`.
 *
 * Two pixels tall, because the profile does not vary along the spine's length —
 * so this is a few hundred bytes decoded, shared by every book on the shelf, and
 * it is the reason this candidate does not multiply by library size the way a
 * per-book texture would.
 *
 * Not sRGB. A normal map holds directions, not colour, and decoding it as though
 * it held colour bends every normal toward the surface.
 */
export function spineNormalMap(): THREE.CanvasTexture | undefined {
  const width = 256;
  const height = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const image = ctx.createImageData(width, height);
  for (let column = 0; column < width; column += 1) {
    // Sample at the texel centre, so the two ends are symmetric.
    const x = (column + 0.5) / width - 0.5;
    // Outward radial normal of the arc, in the plane's tangent space: +X runs
    // across the spine's width, +Z out of the printed face.
    const nx = x / RADIUS;
    const nz = Math.sqrt(RADIUS * RADIUS - x * x) / RADIUS;
    for (let row = 0; row < height; row += 1) {
      const at = (row * width + column) * 4;
      image.data[at] = Math.round((nx * 0.5 + 0.5) * 255);
      image.data[at + 1] = 128;
      image.data[at + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/**
 * The printed face, bowed forward.
 *
 * A `PlaneGeometry` displaced along Z and re-normalled. Its edges stay at z=0,
 * so a mesh built from it sits exactly where the flat plane used to and bulges
 * toward the room.
 */
export function curvedSpinePlane(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, SEGMENTS, 1);
  const position = geometry.attributes['position'];
  if (position !== undefined) {
    for (let index = 0; index < position.count; index += 1) {
      position.setZ(index, riseAt(position.getX(index)));
    }
    position.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Thickness of the covering, in width units. Card, not paper. */
const COVERING = 0.08;

/**
 * The covering under the printed face, bowed to match.
 *
 * Without this the printed plane delaminates from its own spine strip: the strip
 * is a box whose front face is flat at `depth/2`, so a bowed plane opens a
 * crescent gap up to `RISE × thickness` at head and tail — about 3mm on a
 * typical book, and visible at any angle that shows the top of the shelf.
 *
 * Extruded rather than swept by hand so the head and tail get real caps, which
 * is the whole reason this candidate might beat a normal map.
 */
export function curvedSpineShell(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, riseAt(-0.5));
  for (let step = 1; step <= SEGMENTS; step += 1) {
    const x = -0.5 + step / SEGMENTS;
    shape.lineTo(x, riseAt(x));
  }
  for (let step = SEGMENTS; step >= 0; step -= 1) {
    const x = -0.5 + step / SEGMENTS;
    shape.lineTo(x, riseAt(x) - COVERING);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  // Centre the extrusion, then stand it up: the shape's rise becomes +Z (out of
  // the shelf) and the extrusion becomes +Y (the book's height).
  geometry.translate(0, 0, -0.5);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
