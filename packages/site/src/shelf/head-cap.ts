import * as THREE from 'three';

/**
 * The covering rolling over the head of a spine.
 *
 * The one edge on a book that **cannot be faked**. A shelf is looked at from
 * slightly above, so the head is a *silhouette* — and no normal map moves a
 * silhouette. It also cannot fold into the spine strip, whose Y scale is the
 * book's height: a bevel of fixed world size on a shared box scaled
 * `(thickness, height, board)` smears, because those axes differ by two orders
 * of magnitude.
 *
 * So it is real geometry, and what makes that affordable is that it is scaled
 * **uniformly by thickness**. One shared arc is then the right shape on every
 * book, and the roll stays the same fraction of the spine it rolls over, which
 * is what a real cap does.
 *
 * **No tail cap, ever.** `maxPolarAngle` is `PI * 0.52` and `OrbitControls`
 * re-clamps a directly-set camera, so the lowest angle this shelf permits is
 * 3.6° above the horizon and no tail is in it (#56, verified by render).
 */

/**
 * Steps around the quarter turn — the only number here that can move a pixel.
 *
 * `SEGMENTS` runs across the width and `CAP_STEPS` around the turn, so the cap is
 * `2 × SEGMENTS × CAP_STEPS` triangles. #56 built it at `32 × 10` and never
 * varied either; #66 found that **`segments` is provably free rather than merely
 * cheap** — nothing in this geometry varies along `x`, so subdividing it
 * subdivides a straight line, and a linear interpolation of a linear function is
 * the same function. The render agreed: `64 × 20`, four times finer than the
 * reference, differs from it by the same 1–2 px of rasterisation seam as `1 × 4`.
 *
 * The reading floor is between `1 × 4` and `1 × 3`. Ten is chosen over it because
 * coarsening past the free win buys nothing measurable — and #66's whole finding
 * is that the cap's ~11% cost is **not the triangles**: 128× the triangles is
 * indistinguishable from the rig's noise floor, and the cost is identical at 4
 * triangles and at 640.
 */
const SEGMENTS = 1;
const CAP_STEPS = 10;

/**
 * The shared cap, made once for the page.
 *
 * Module-level, like `UNIT_BOX` — one geometry for the whole shelf, however many
 * books stand on it. It must therefore survive `mountShelf`'s disposing traverse,
 * which is why that traverse asks `isSharedGeometry` rather than freeing
 * everything it walks.
 */
let shared: THREE.BufferGeometry | undefined;

export function headCapGeometry(): THREE.BufferGeometry {
  shared ??= buildHeadCap();
  return shared;
}

export function isHeadCapGeometry(geometry: THREE.BufferGeometry): boolean {
  return geometry === shared;
}

/**
 * Built in **thickness units**, with its top at `y = 0` and its face at `z = 0`.
 *
 * So a mesh scaled by the book's thickness and parked at the top of the spine
 * face lands exactly where the covering's flat part stopped. The roll is a unit
 * radius here; the caller scales it.
 *
 * `u` runs across the width, matching the spine plane — so the spine's own normal
 * map shades this too, and the cap costs no texture of its own.
 */
function buildHeadCap(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEGMENTS; i += 1) {
    const u = i / SEGMENTS;
    const x = u - 0.5;
    for (let j = 0; j <= CAP_STEPS; j += 1) {
      const v = j / CAP_STEPS;
      const angle = v * (Math.PI / 2);
      // Centre of the roll at (y = -1, z = -1) in roll units: angle 0 is the
      // bottom of the cap, flush with the spine face; 90° is its top, rolled back
      // over the page block.
      positions.push(x, -1 + Math.sin(angle), -1 + Math.cos(angle));
      normals.push(0, Math.sin(angle), Math.cos(angle));
      uvs.push(u, v);
    }
  }

  const stride = CAP_STEPS + 1;
  for (let i = 0; i < SEGMENTS; i += 1) {
    for (let j = 0; j < CAP_STEPS; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
