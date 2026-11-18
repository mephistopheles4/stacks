import * as THREE from 'three';
import type { Box, Vec3 } from './room-data.ts';

/**
 * Where the room's camera turns about, and the two rates that follow from what is ahead of it (#637).
 * `OrbitControls`' target is the anchor: the point at the centre of the screen. Everything here but
 * `createCentrePick` is arithmetic on numbers, so vitest's node environment runs every rule.
 */

/** The anchor when nothing usable is at the centre of the screen: this far ahead, in world units (the room's eye height is 3.9). */
const ANCHOR_FALLBACK = 6;
/** The nearest and the farthest the anchor stands from the camera. */
const ANCHOR_NEAREST = 0.5;
const ANCHOR_FARTHEST = 60;
/** How far past the room's box a picked surface still counts as the room's: a floor or a wall lands on the face or just past it. */
const ROOM_MARGIN = 1;
/** The zoom's step is its base length at this distance ahead, and follows it between the limits. */
const ZOOM_REFERENCE = 6;
const ZOOM_NEAREST = 1;
const ZOOM_FARTHEST = 40;
/** `OrbitControls` pans as if the anchor stood no nearer than this: a surface right in front never crawls. */
const PAN_FLOOR = 2;

/**
 * How far ahead of the camera the anchor goes (S5.3): `hit` is how far ahead the first drawn mesh at the
 * centre of the screen is, if there is one; `from` and `direction` (a unit vector) are the camera's place
 * and the line it looks down; `room` is the room's own box.
 *
 * - A hit in the room (its box grown by a margin) is the anchor if it is between 0.5 and 60 ahead, else 6 ahead.
 * - A hit outside the room, or none, would swing the camera through a huge arc, so the anchor goes on the
 *   point of the line of sight nearest the room's centre instead, no farther than the hit. The centre
 *   behind the camera says nothing about what is ahead, so there the hit stands, or 6 with none.
 * - With no room box, a hit between 0.5 and 60 is the anchor, else 6.
 */
export function chooseAnchor(
  hit: number | undefined,
  room: Box | undefined,
  from: Vec3,
  direction: Vec3,
): number {
  const usable = (distance: number | undefined): number =>
    distance === undefined || distance < ANCHOR_NEAREST || distance > ANCHOR_FARTHEST
      ? ANCHOR_FALLBACK
      : distance;
  if (room === undefined) return usable(hit);
  const inRoom =
    hit !== undefined &&
    [0, 1, 2].every((axis) => {
      const v = from[axis]! + direction[axis]! * hit;
      return v >= room.min[axis]! - ROOM_MARGIN && v <= room.max[axis]! + ROOM_MARGIN;
    });
  if (inRoom) return usable(hit);
  const nearest = [0, 1, 2].reduce(
    (sum, axis) => sum + ((room.min[axis]! + room.max[axis]!) / 2 - from[axis]!) * direction[axis]!,
    0,
  );
  const ahead =
    nearest < ANCHOR_NEAREST ? (hit ?? ANCHOR_FALLBACK) : Math.min(nearest, hit ?? Infinity);
  return Math.max(ANCHOR_NEAREST, Math.min(ahead, ANCHOR_FARTHEST));
}

/**
 * The scale a zoom step is multiplied by (S5.6): the distance to what is ahead, clamped to 1..40, over 6.
 * So a notch is a share of the distance ahead, and closes in on a book as steadily as it crosses the room.
 * With nothing ahead it is 1.
 */
export function zoomStep(ahead: number | undefined): number {
  return Math.min(ZOOM_FARTHEST, Math.max(ZOOM_NEAREST, ahead ?? ZOOM_REFERENCE)) / ZOOM_REFERENCE;
}

/**
 * `OrbitControls`' `panSpeed` for a camera `reach` from its anchor (S5.7). It pans in proportion to that
 * distance, so under `PAN_FLOOR` the speed rises to make up what the distance lacks.
 */
export function panSpeedFor(reach: number): number {
  return reach > 0 ? Math.max(1, PAN_FLOOR / reach) : 1;
}

/**
 * How far ahead the first drawn mesh at the centre of the screen is, if there is one. No global: the
 * orbit is handed this and nothing else of the scene.
 */
export function createCentrePick(
  scene: THREE.Object3D,
  camera: THREE.Camera,
): () => number | undefined {
  const caster = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);
  return () => {
    caster.setFromCamera(centre, camera);
    return caster
      .intersectObjects(scene.children, true)
      .find((h) => (h.object as THREE.Mesh).isMesh === true && h.object.visible)?.distance;
  };
}
