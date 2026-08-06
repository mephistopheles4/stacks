import * as THREE from 'three';
import type { Binding } from '@stacks/core';
import type { SpineProfile } from './shelf-settings.ts';

/**
 * A spine's cross-section, shaded rather than built.
 *
 * The spine of a real book is not a flat rectangle. A hardback is *backed* — the
 * text block hammered into a curve — so its covering rises through an arc and
 * creases hard into the French joint at each board. A paperback is perfect-bound,
 * which is a flat face whose card turns through 90° over a small radius at each
 * edge. Neither is what this shelf drew, which was a plane.
 *
 * **Nothing geometric changes.** #55 rendered the fake and real curved geometry
 * side by side at three times the closest orbit the camera allows and got the
 * same picture, at 6.7× the triangles for the real one. So this is one shared
 * normal map per binding on the plane that was already there: **+0 draw calls,
 * +0 triangles, +0 per-book textures**, and ~2 KB decoded per distinct profile on
 * the shelf — two, however many books there are.
 *
 * ## Why the slope and not the height
 *
 * A height field nothing displaces is a height field nobody needs. Only the
 * normals are ever read, so the profile is written as its *slope* and the map
 * holds the normal that slope implies.
 *
 * ## Why an ellipse and not a circle
 *
 * #55 used a circular arc, and a circle cannot both rise and finish its turn: at
 * a rise of an eighth of the width its tangent has only reached about 28° by the
 * joint, which leaves the hinge reading as a hard step — #56's whole complaint.
 * An ellipse's two semi-axes are independent, so a 3mm rise can turn through a
 * full 90° over a 2mm joint. That is what `roll` parameterises, and it is why
 * #56's `softHinge` toggle is *subsumed* here rather than surviving beside it:
 * the toggle was picking two points on a continuum.
 */

/**
 * Slope of the profile at `x` — flat across the middle, then an elliptical
 * quarter down to the joint.
 *
 * `x` is in width units, running -0.5..0.5 across the spine. That is what lets
 * one shape serve a thin book and a fat one: the profile is proportional to the
 * chord, so a texture scaled to any spine is still the right cross-section.
 *
 * Unbounded at the joint, where the slope is infinite and the normal undefined,
 * so `t` is clamped short of it. Clamping is what makes the edge *steep* rather
 * than broken.
 */
export function slopeAt(x: number, profile: SpineProfile): number {
  const flat = 0.5 * (1 - profile.roll);
  const span = 0.5 - flat;
  const from = Math.abs(x) - flat;
  if (from <= 0 || span <= 0) return 0;
  const t = Math.min(from / span, 0.995);
  const d = (-profile.rise * t) / (span * Math.sqrt(1 - t * t));
  return x < 0 ? -d : d;
}

/** Texels across the width. The profile does not vary along the spine's length. */
const MAP_WIDTH = 256;
const MAP_HEIGHT = 2;

/**
 * Whether a profile describes any cross-section at all.
 *
 * `{ 0, 0 }` is *off*, and it has to short-circuit to no map rather than to a map
 * scaled by zero: a flat map is 2 KB, a texture unit and a `#define` on every
 * spine material on the shelf, all to say nothing. Off should cost nothing.
 */
export function isFlat(profile: SpineProfile): boolean {
  return profile.rise === 0 || profile.roll === 0;
}

/**
 * The shared normal map for one profile: the surface's normals, across `u`.
 *
 * Two pixels tall, because nothing varies along the spine's length — a few
 * hundred bytes, shared by every book of that binding.
 *
 * **Not sRGB.** A normal map holds directions, not colour, and decoding it as
 * though it held colour bends every normal toward the surface.
 *
 * ## `rise` is baked here, and is still the free half of the pair
 *
 * #65's table says `roll` bakes into the map while `rise` rides in
 * `normalScale`, because three multiplies the decoded `xy` before renormalising
 * and that is exactly a slope multiply — `slopeAt` being linear in `rise`. Both
 * numbers are baked here for one reason: the map is 8-bit, and a profile with a
 * small rise baked at a large one quantises its `z` channel down to a couple of
 * levels near the joint, where the slope is steepest. Baking each profile at its
 * own rise costs nothing today, since `roll` already forces one map per binding.
 *
 * That does not close the door #65 wanted left open. **Per-book `rise` jitter is
 * still free**: give the book's material `normalScale = bookRise / profile.rise`
 * against its binding's map, and no second texture is uploaded. What must never
 * happen is a map baked per book — that is 49 uploads against 2, and it converts
 * this whole effect's headline finding into a per-book texture cost.
 */
function bakeNormalMap(profile: SpineProfile): THREE.CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const image = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
  for (let column = 0; column < MAP_WIDTH; column += 1) {
    // Sampled at the texel centre, so the two ends are symmetric.
    const x = (column + 0.5) / MAP_WIDTH - 0.5;
    // A height field's surface normal is (-dh/dx, 0, 1), normalised. +X runs
    // across the spine's width, +Z out of the printed face.
    const slope = slopeAt(x, profile);
    const length = Math.hypot(slope, 1);
    const nx = -slope / length;
    const nz = 1 / length;
    for (let row = 0; row < MAP_HEIGHT; row += 1) {
      const at = (row * MAP_WIDTH + column) * 4;
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
 * The maps in play, one per distinct profile, for the life of the page.
 *
 * Module-level and keyed by the profile itself, following `COVERS` in `scene.ts`
 * — bounded by the number of bindings rather than by the size of the library, and
 * so never worth emptying. A per-mount cache would re-bake on every rebuild, and
 * the point of the cache is that a shelf of any size uploads two textures.
 *
 * Deliberately **not** disposed by `mountShelf`'s traverse, which frees a
 * material's `map` and never its `normalMap`. These outlive any one mount the way
 * `UNIT_BOX` does; freeing them there would leave a second shelf shading flat.
 */
const MAPS = new Map<string, THREE.CanvasTexture | undefined>();

/**
 * The normal map for a binding, made once and shared.
 *
 * `undefined` for a flat profile, and for a canvas the browser would not give a
 * 2D context — the caller leaves `normalMap` unset in both cases, which is the
 * shelf as it was before this existed rather than a spine shaded by nothing.
 */
export function spineNormalMap(
  profiles: Record<Binding, SpineProfile>,
  binding: Binding,
): THREE.CanvasTexture | undefined {
  const profile = profiles[binding];
  if (isFlat(profile)) return undefined;

  const key = `${String(profile.rise)}:${String(profile.roll)}`;
  const existing = MAPS.get(key);
  if (existing !== undefined || MAPS.has(key)) return existing;

  const map = bakeNormalMap(profile);
  MAPS.set(key, map);
  return map;
}
