import * as THREE from 'three';
import { sharedCache } from './shared-cache.ts';

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
 * The shared caps, one per roll on the shelf — which is one.
 *
 * Module-level, like `UNIT_BOX`: one geometry for the whole shelf however many
 * books stand on it. It must therefore survive `mountShelf`'s disposing traverse,
 * which is why that traverse asks `isHeadCapGeometry` rather than freeing
 * everything it walks.
 */
const CAPS = sharedCache<THREE.BufferGeometry>((geometry) => geometry.dispose());
const built = new Set<THREE.BufferGeometry>();

/**
 * The cap for a given roll, made once and shared.
 *
 * **The roll is baked in rather than left to the caller's scale, and getting that
 * wrong is exactly the bug this shape invites.** The arc spans one *width* unit
 * along `x` and rolls by `roll` width units in `y` and `z` — two different
 * numbers in one geometry. A caller who scales uniformly by the *roll* gets a
 * narrow tab centred on the head rather than a covering, and every counter stays
 * green because the draw calls and the triangles are identical either way. The
 * uniform scale is by **thickness**, and it is uniform precisely because the roll
 * is already in here.
 */
export function headCapGeometry(roll: number): THREE.BufferGeometry | undefined {
  const geometry = CAPS.get(roll.toFixed(4), () => {
    const made = buildHeadCap(roll);
    built.add(made);
    return made;
  });
  return geometry;
}

export function isHeadCapGeometry(geometry: THREE.BufferGeometry): boolean {
  return built.has(geometry);
}

/**
 * Built in **thickness units**, with its top at `y = 0` and its face at `z = 0`.
 *
 * So a mesh scaled by the book's thickness and parked at the top of the spine
 * face lands exactly where the covering's flat part stopped.
 *
 * `u` runs across the width, matching the spine plane — so the spine's own normal
 * map shades this too, and the cap costs no texture of its own.
 */
function buildHeadCap(roll: number): THREE.BufferGeometry {
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
      // Centre of the roll at (y = -roll, z = -roll): angle 0 is the bottom of
      // the cap, flush with the spine face; 90° is its top, rolled back over the
      // page block.
      positions.push(x, -roll + roll * Math.sin(angle), -roll + roll * Math.cos(angle));
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

  closeTheFillet(roll, positions, normals, uvs, indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * How far the closing faces bury themselves in the case behind and below.
 *
 * The arc's foot and back edge land exactly on the front piece's top and the
 * boards' front face, and *exactly* is the one place a hairline shows: the cap
 * mesh is parked `SKIN` proud of the spine so its back edge sits `SKIN` in front
 * of the case, and a slot that thin is still a slot. Overlapping into the case is
 * invisible and cannot be got wrong by a rounding error.
 */
const BURY = 0.06;

/**
 * The three faces that make the arc a **solid fillet** rather than an awning.
 *
 * Without them the cap is a one-sided strip with a wedge of nothing under it —
 * the arc above, the front piece's flat top below, the page block behind — and
 * that wedge is open along its back edge, over the block's width. Looking down
 * at the head from in front you see straight through it into the case: reported
 * as *"seems we created a hole here"*, and it was there from the moment the cap
 * shipped.
 *
 * The three are the back, at `z = -roll` where the boards' front face is; and the
 * two ends at `x = ±0.5`, which nothing else covers — the printed cover stops
 * where its board does, so the cap's own ends are the silhouette there.
 *
 * There is no *bottom* face: it would be coplanar with the front piece's top and
 * would z-fight with it, and it is buried anyway.
 *
 * Flat-shaded, so each face carries its own normals and its own vertices rather
 * than sharing the arc's. Cost is 6 triangles against the arc's 20, and #66's
 * finding stands — the cap's ~11% is not its triangles.
 */
function closeTheFillet(
  roll: number,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): void {
  const quad = (
    corners: readonly [number, number, number][],
    normal: readonly [number, number, number],
  ): void => {
    const base = positions.length / 3;
    for (const [x, y, z] of corners) {
      positions.push(x, y, z);
      normals.push(...normal);
      // Across the width, matching the arc — so the spine's normal map, which
      // varies only in `u`, shades these consistently with it.
      uvs.push(x + 0.5, 0);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const low = -roll - BURY;

  // The back, buried into the boards it meets.
  quad(
    [
      [-0.5, 0, -roll],
      [-0.5, low, -roll],
      [0.5, low, -roll],
      [0.5, 0, -roll],
    ],
    [0, 0, -1],
  );

  // The two ends. Squared off rather than followed round the arc: the missing
  // sliver is outside the arc and behind the cover's own edge, and a fan here
  // would be four times the triangles to fill what the silhouette already hides.
  for (const side of [1, -1] as const) {
    const x = side * 0.5;
    quad(
      [
        [x, 0, -roll],
        [x, low, -roll],
        [x, low, 0],
        [x, 0, 0],
      ],
      // Wound the same way for both ends, so one of the two faces inward; the
      // material is `FrontSide`, and the inward one is inside the case where
      // nothing looks at it.
      [side, 0, 0],
    );
  }
}
