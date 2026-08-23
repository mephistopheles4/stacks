import * as THREE from "three";
import { sharedCache } from "./shared-cache.ts";

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
 * How far past the quarter the covering keeps turning, so it **tucks in**.
 *
 * A turn that stops dead at 90° leaves its back edge standing exactly where the
 * boards' front face is — and the cap is parked `SKIN` proud of the spine, so
 * *exactly* is a `SKIN`-wide slot running the width of the head. Looked at along
 * the head from the fore-edge it reads as a square step with the curve hidden
 * behind it, which is how it was reported.
 *
 * Past 90° the arc descends again, so every degree of this is at or below the
 * board tops: it buries itself in the case rather than adding silhouette. That is
 * also what a real turn-in does — the cloth carries on over the head and is
 * tucked down inside the boards.
 */
const TUCK = Math.PI / 6;
const TUCK_STEPS = 3;

/**
 * The shared caps, one per roll on the shelf — which is one.
 *
 * Module-level, like `UNIT_BOX`: one geometry for the whole shelf however many
 * books stand on it. It must therefore survive `mountShelf`'s disposing traverse,
 * which is why that traverse asks `isHeadCapGeometry` rather than freeing
 * everything it walks.
 */
const CAPS = sharedCache<THREE.BufferGeometry>((geometry) =>
  geometry.dispose(),
);
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
export function headCapGeometry(
  roll: number,
): THREE.BufferGeometry | undefined {
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

  const steps = CAP_STEPS + TUCK_STEPS;

  /**
   * Piecewise, so a step lands **exactly** on the quarter.
   *
   * Spreading `CAP_STEPS + TUCK_STEPS` evenly over `90° + TUCK` puts no vertex at
   * 90° unless the two divide, and 13 steps over 120° wants step 9.75. The crest
   * then falls a hair *below* the board tops it is supposed to meet — a gap of
   * exactly the kind this whole sequence of fixes has been closing. The visible
   * quarter also keeps #66's tessellation exactly, which is the other reason.
   */
  const angleAt = (j: number): number =>
    j <= CAP_STEPS
      ? (j / CAP_STEPS) * (Math.PI / 2)
      : Math.PI / 2 + ((j - CAP_STEPS) / TUCK_STEPS) * TUCK;

  for (let i = 0; i <= SEGMENTS; i += 1) {
    const u = i / SEGMENTS;
    const x = u - 0.5;
    for (let j = 0; j <= steps; j += 1) {
      const angle = angleAt(j);
      // Centre of the roll at (y = -roll, z = -roll): angle 0 is the bottom of
      // the cap, flush with the spine face; 90° is its top, over the page block;
      // past that it descends into the boards. See `TUCK`.
      positions.push(
        x,
        -roll + roll * Math.sin(angle),
        -roll + roll * Math.cos(angle),
      );
      normals.push(0, Math.sin(angle), Math.cos(angle));
      uvs.push(u, j / steps);
    }
  }

  const stride = steps + 1;
  for (let i = 0; i < SEGMENTS; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  closeTheEnds(roll, steps, angleAt, positions, normals, uvs, indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The two ends, which are what make the arc a **solid fillet** rather than an
 * awning — and they are quarter *discs*, not squares.
 *
 * Without them the cap is a one-sided strip with a wedge of nothing under it,
 * open at both ends and along its back; looking down at the head you see
 * straight into the case. Squaring them off instead is worse than leaving them
 * open, and it is what shipped first: the square's outer corner sits at
 * `(y = 0, z = 0)`, which is `roll × √2` from the arc's centre against the arc's
 * `roll` — so **each end of the covering grew a square block sticking out past
 * the roll it was supposed to close.** Circled in a screenshot from three angles
 * before it was recognised for what it was.
 *
 * A fan from the arc's centre fills exactly the disc and cannot overhang it,
 * whatever the sweep.
 *
 * There is no bottom face and no back face: the tuck carries the surface below
 * the board tops and behind their front, so both are inside the case, and a face
 * there would be coplanar with the very pieces it is hiding between.
 *
 * Each end carries its own vertices rather than sharing the arc's. Cost is 26
 * triangles against the arc's 26 — still nothing, and #66's finding stands that
 * the cap's ~11% is not its triangles.
 */
/**
 * A normal halfway between facing sideways and facing the way the roll faces —
 * **the whole of the fix for the thing the owner kept circling.**
 *
 * The end of a roll has to be a flat disc: the only thing beside a book is air,
 * so there is nothing for the covering to turn down onto, and no tessellation
 * changes that. What made it read as a *thumbprint stuck on the corner* was
 * never the silhouette — the disc sits `SKIN` inside the board's own face, so
 * there is barely a silhouette to see. It was the shading: a true `(±1, 0, 0)`
 * catches the light as a surface of its own, discontinuous with the roll it
 * closes, and the eye reads a discontinuity in shading as a separate object.
 *
 * Leaning the normal 45° into the roll makes the disc shade as the covering
 * coming round the corner. The geometry does not move by a micron; the picture
 * changes completely. It is the oldest trick in low-poly asset work, and it is
 * the reason this is a four-line fix rather than the quarter-torus corner patch
 * that was the alternative.
 *
 * ⚠️ **A lie the renderer tells for us, and the one direction it can go wrong:**
 * a bevelled normal that leans *too* far reads as a bulge that is not there.
 * 45° is the average of the rim it interpolates towards, so the disc meets the
 * arc with no step at all — which is what makes it read as one surface rather
 * than two.
 */
function bevel(normals: number[], x: number, y: number, z: number): void {
  const length = Math.hypot(x, y, z);
  normals.push(x / length, y / length, z / length);
}

function closeTheEnds(
  roll: number,
  steps: number,
  angleAt: (step: number) => number,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): void {
  for (const side of [1, -1] as const) {
    const x = side * 0.5;
    const base = positions.length / 3;

    // The centre of the roll, then every point on the arc.
    positions.push(x, -roll, -roll);
    // 45° into the roll, which is the average of the rim normals below — so the
    // fan interpolates evenly out of its hub instead of pinching there.
    bevel(normals, side, Math.SQRT1_2, Math.SQRT1_2);
    uvs.push(x + 0.5, 0);

    /**
     * The visible quarter only — the tuck is left open, deliberately.
     *
     * Past 90° the arc descends behind the boards' front face, so a fan out to
     * the full sweep puts a disc in the boards' **own plane**, overlapping them.
     * Two surfaces at one depth is the z-fighting every `SKIN` on this book
     * exists to avoid, and dodging it by insetting the whole cap is what left a
     * lit sliver of board standing past the roll. Stopping at the quarter is what
     * lets the cap span the case exactly.
     *
     * Nothing shows through the opening: it lies in the boards' plane, behind
     * their front face, so the board is what a ray from outside meets.
     */
    for (let j = 0; j <= CAP_STEPS; j += 1) {
      const angle = angleAt(j);
      positions.push(
        x,
        -roll + roll * Math.sin(angle),
        -roll + roll * Math.cos(angle),
      );
      bevel(normals, side, Math.sin(angle), Math.cos(angle));
      // Across the width, matching the arc — so the spine's normal map, which
      // varies only in `u`, shades these consistently with it.
      uvs.push(x + 0.5, j / steps);
    }

    /**
     * Wound opposite ways, and **this way round** — which is not the way it
     * reads.
     *
     * The material is `FrontSide`, so a fan wound the wrong way is *culled*, and
     * a culled end is not a missing sliver: you see straight through it into the
     * unlit inside of the arc, which renders as a dark rounded lobe sitting in
     * the corner. That is a hole wearing the shape of the thing that was supposed
     * to close it, and it looked exactly like the fault before it.
     *
     * Derived rather than guessed: looking down `-X` at the `+X` end, screen-up
     * is `+Y` and screen-right is `-Z`, and `(centre, arc[j], arc[j+1])` comes out
     * clockwise — back-facing. So `+X` takes the reversed order.
     */
    for (let j = 0; j < CAP_STEPS; j += 1) {
      if (side === 1) indices.push(base, base + 2 + j, base + 1 + j);
      else indices.push(base, base + 1 + j, base + 2 + j);
    }
  }
}
