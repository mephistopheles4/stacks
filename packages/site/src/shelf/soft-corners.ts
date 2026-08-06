import * as THREE from 'three';

/**
 * PROTOTYPE — throwaway, for wayfinder ticket #56.
 *
 * Two edges, two answers, built so a screenshot can judge them:
 *
 * - **The spine-to-board hinge** is not a new asset. It is a different *profile*
 *   written into the normal map #55 already ships — one that turns the surface
 *   fully at the joint instead of stopping partway, which is what a covering
 *   does where it creases into the French joint. Same texture slot, same shared
 *   texture, same zero bytes per book.
 * - **The head cap** cannot be faked, because looking down at a shelf makes it a
 *   silhouette. So it is real geometry — but a *uniformly* scaled one, which is
 *   what makes it survive the objection that killed a bevel on `UNIT_BOX`.
 *
 * The fore-edge board corner gets nothing, and that is a finding rather than an
 * omission: a shelved book's fore-edge faces the backboard, and a face-out one
 * points its fore-edge into the neighbour on its right.
 *
 * Nothing here ships. The decision is recorded on the ticket; the build is
 * ordinary phase work afterwards.
 */

/**
 * A spine's cross-section, in *width units* — so one shape serves a thin book
 * and a fat one, exactly as #55's rise did.
 *
 * `rise` is how far the centre stands proud of the chord. `roll` is the fraction
 * of each half-width spent turning: `1` spends all of it and gives the full arc
 * of a backed hardback, a small value gives the flat face and hard-creased edges
 * of a perfect-bound paperback.
 *
 * This is deliberately **one value where #55 and #57 had two.** #57 hands #55 a
 * `roundedBack` flag; #55 decided a rise where zero is flat. A profile is both:
 * binding picks the pair, and nothing downstream needs a boolean as well.
 */
export interface SpineProfile {
  readonly rise: number;
  readonly roll: number;
}

/** Backed and rounded — the full arc, creasing hard into the joint. */
export const HARDBACK: SpineProfile = { rise: 0.125, roll: 1 };

/** Perfect-bound — a flat face whose card turns through 90° at each edge. */
export const PAPERBACK: SpineProfile = { rise: 0.03, roll: 0.22 };

/**
 * Slope of the profile at `x` — flat across the middle, then an elliptical
 * quarter down to the joint.
 *
 * The ellipse rather than a circle is the point: its horizontal and vertical
 * semi-axes are independent, so a 3mm rise can turn through a full 90° over a
 * 2mm joint. A circular arc cannot — #55's stops at about 28° and leaves the
 * hinge reading as a hard step, which is this ticket's whole complaint.
 *
 * The slope and not the height, because #55 settled that the spine is *shaded*
 * round and never built round. A height field nothing displaces is a height
 * field nobody needs; only its normals are ever read.
 *
 * Unbounded at the joint, so `t` is clamped short of it.
 */
function slopeAt(x: number, profile: SpineProfile): number {
  const flat = 0.5 * (1 - profile.roll);
  const span = 0.5 - flat;
  const from = Math.abs(x) - flat;
  if (from <= 0 || span <= 0) return 0;
  // Short of 1: at exactly the joint the slope is infinite and the normal is
  // undefined. Clamping is what makes the edge *steep* rather than *broken*.
  const t = Math.min(from / span, 0.995);
  const d = (-profile.rise * t) / (span * Math.sqrt(1 - t * t));
  return x < 0 ? -d : d;
}

/** Points across the profile. Enough that the joint reads as a turn, not a step. */
const SEGMENTS = 32;

/**
 * PROTOTYPE (#66) — the cap's tessellation, as the two numbers #56 fixed and
 * never varied.
 *
 * `segments` runs **across** the spine's width, `steps` **around** the quarter
 * turn; the cap is `2 × segments × steps` triangles, so #56's `32 × 10` is the
 * 640 it reported. They are separated because they are not the same kind of
 * number — see `headCapGeometry`, where one of them turns out to buy nothing at
 * all.
 */
export interface CapShape {
  readonly segments: number;
  readonly steps: number;
  /** Radius of the roll in thickness units — #56's `CAP`, now variable. */
  readonly roll: number;
}

/**
 * The shared normal map for one profile: the surface's normals, across `u`.
 *
 * Two pixels tall, because the profile does not vary along the spine's length.
 * A few hundred bytes, shared by every book of that binding — so the whole
 * shelf pays for **two** of these, not one per book.
 *
 * Not sRGB. A normal map holds directions, not colour, and decoding it as though
 * it held colour bends every normal toward the surface.
 */
export function hingeNormalMap(profile: SpineProfile): THREE.CanvasTexture | undefined {
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
    // Surface normal of a height field is (-dh/dx, 0, 1), normalised. +X runs
    // across the spine's width, +Z out of the printed face.
    const slope = slopeAt(x, profile);
    const length = Math.hypot(slope, 1);
    const nx = -slope / length;
    const nz = 1 / length;
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
 * Radius of the head cap's roll, in *thickness units*.
 *
 * Thickness units and not world units, and that is the whole reason this
 * candidate works. A bevel of fixed world size on a shared box scaled
 * `(board, height, depth)` smears, because those axes differ by two orders of
 * magnitude. A cap scaled `(thickness, thickness, thickness)` is uniform, so one
 * shared geometry is the right shape on every book — and the roll stays the
 * right fraction of the spine it rolls over, which is what a real cap does.
 */
export const CAP = 0.1;

/** Steps around the quarter turn. The silhouette is the point, so not few. */
const CAP_STEPS = 10;

/** PROTOTYPE (#66). #56's cap, as a shape rather than three module constants. */
export const CAP_AS_BUILT: CapShape = { segments: SEGMENTS, steps: CAP_STEPS, roll: CAP };

/**
 * The covering rolling over the head of the spine, as a quarter-round.
 *
 * Built in thickness units with its **top at y = 0** and its face at **z = 0**,
 * so a mesh scaled by `thickness` and parked at the top of the spine face lands
 * where the covering's flat part stopped.
 *
 * `u` runs across the width, matching the spine plane — so the hinge normal map
 * shades this too, and the cap costs no texture of its own.
 *
 * There is no tail cap. A book stands on a plank and its tail is against the
 * wood: verified by render, not assumed.
 *
 * PROTOTYPE (#66) — the shape is now an argument, and writing it out that way
 * exposes something #56 could not see with the numbers baked in: **nothing on
 * the `x` axis varies.** `y` and `z` are functions of `angle` alone, the normal
 * is the same vector at every `x`, and `u` is linear in `x`. So `segments` is
 * subdividing a *ruled, developable* strip along which every interpolated
 * quantity is already exact — and a linear interpolation of a linear function is
 * the same function. Raising it cannot move a pixel; only `steps`, which
 * subdivides the turn the silhouette is made of, can. The render is what settles
 * that, not this comment.
 */
export function headCapGeometry(shape: CapShape = CAP_AS_BUILT): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const { segments, steps, roll } = shape;

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const x = u - 0.5;
    for (let j = 0; j <= steps; j += 1) {
      const v = j / steps;
      const angle = v * (Math.PI / 2);
      // Centre of the roll at (y = -roll, z = -roll): angle 0 is the bottom of
      // the cap, flush with the spine face; angle 90° is its top, rolled back
      // over the page block.
      positions.push(x, -roll + roll * Math.sin(angle), -roll + roll * Math.cos(angle));
      normals.push(0, Math.sin(angle), Math.cos(angle));
      uvs.push(u, v);
    }
  }

  const stride = steps + 1;
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < steps; j += 1) {
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

/**
 * STUB — #57 decided this and nothing implements it yet.
 *
 * A stable per-book hash, 60% paperback, absent routing to the hash and never to
 * a value. Here only so the prototype can show a mixed shelf; the real one grows
 * a `binding:` frontmatter override and moves the contract, the parser and
 * `gates/frontmatter-contract.test.ts` in one commit.
 */
export function bindingOf(hash: number): 'hardback' | 'paperback' {
  return hash < 0.6 ? 'paperback' : 'hardback';
}
