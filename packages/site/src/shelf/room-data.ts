import type { Framing } from './framing.ts';
import type { SettingsPatch } from './shelf-settings.ts';

/**
 * What the page reads off a room's GLB, and what it does with it (#602, spec S7.2, S7.3, S8).
 *
 * **Code never hard-codes a room position.** The room's GLB carries named empties: `slot_*` place
 * live things, `view_open` is where the camera opens, `bounds_min` and `bounds_max` are the box it
 * stays in, and `live_ambient`, `live_key`, `live_fill` and `live_lamp` are the live lights, placed
 * from the lights that baked it (`packages/site/rooms/<room>/room-data.json` is where a person
 * writes them; `shared/add_room_data.mjs` puts them in the GLB). A GLB missing one the page needs
 * is a room that failed, and the page draws the plain shelf (S2.5): `RoomDataError` says which.
 *
 * No `three` and no DOM, so vitest's node environment runs every rule here.
 */

export type Vec3 = readonly [number, number, number];

/** A node of the GLB as the page's walk sees it: its place in the room, and its extras. */
export interface Empty {
  readonly name: string;
  readonly position: Vec3;
  /** x, y, z, w; absent for no turn. */
  readonly quaternion?: readonly [number, number, number, number];
  readonly userData: Readonly<Record<string, unknown>>;
}

export class RoomDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomDataError';
  }
}

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface RoomView {
  readonly position: Vec3;
  readonly target: Vec3;
  /** The width, in world units, the room is framed across, at `aspect`. */
  readonly span: number;
  /** The height, in world units, the room is framed up. */
  readonly height: number;
  /** The window shape the owner framed the view in: an upright window opens as this one does. */
  readonly aspect: number;
}

/** One live light, as its empty says it. Its y is `ofHeight` times the bookcase's height, plus `position[1]`. */
export interface RoomLight {
  readonly position: Vec3;
  readonly ofHeight: number;
  readonly colour: number;
  readonly intensity: number;
  readonly distance: number | undefined;
  readonly decay: number | undefined;
}

export interface RoomLights {
  readonly ambient: RoomLight;
  readonly key: RoomLight;
  readonly fill: RoomLight;
  /** A room may have no lamp, and then the shelf's own is put out. */
  readonly lamp: RoomLight | undefined;
}

/** A place for a live thing: where, the turn about y, and the slot's own extras (its width, its depth). */
export interface Slot {
  readonly position: Vec3;
  readonly rotationY: number;
  readonly extras: Readonly<Record<string, unknown>>;
}

export interface RoomData {
  readonly view: RoomView;
  readonly bounds: Box;
  readonly lights: RoomLights;
  readonly slots: Readonly<Record<string, Slot>>;
}

function find(empties: readonly Empty[], name: string): Empty {
  const found = empties.find((empty) => empty.name === name);
  if (found === undefined) throw new RoomDataError(`the room has no "${name}" empty`);
  return found;
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RoomDataError(`${what} is not a number`);
  }
  return value;
}

function vec3(value: unknown, what: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3)
    throw new RoomDataError(`${what} is not a point`);
  const [x, y, z] = value as unknown[];
  return [finite(x, what), finite(y, what), finite(z, what)];
}

function positive(value: unknown, what: string): number {
  const n = finite(value, what);
  if (n <= 0) throw new RoomDataError(`${what} is not above zero`);
  return n;
}

function light(empty: Empty, isPoint: boolean): RoomLight {
  const extras = empty.userData;
  const colour = extras.colour;
  if (typeof colour !== 'string' || !/^[0-9a-f]{6}$/i.test(colour)) {
    throw new RoomDataError(`"${empty.name}" has no colour as six hex digits`);
  }
  const intensity = finite(extras.intensity, `"${empty.name}"'s intensity`);
  if (intensity < 0) throw new RoomDataError(`"${empty.name}"'s intensity is below zero`);
  const ofHeight =
    extras.of_height === undefined ? 0 : finite(extras.of_height, `"${empty.name}"'s of_height`);
  return {
    position: empty.position,
    ofHeight,
    colour: Number.parseInt(colour, 16),
    intensity,
    distance:
      isPoint && extras.distance !== undefined
        ? positive(extras.distance, `"${empty.name}"'s distance`)
        : undefined,
    decay:
      isPoint && extras.decay !== undefined
        ? positive(extras.decay, `"${empty.name}"'s decay`)
        : undefined,
  };
}

/** The turn about y, read off where +x went: an Euler's y alone folds a turn past a quarter into a half-turn about x and z. */
function turnAboutY(q: readonly [number, number, number, number] | undefined): number {
  if (q === undefined) return 0;
  const [x, y, z, w] = q;
  return Math.atan2(-2 * (x * z - w * y), 1 - 2 * (y * y + z * z));
}

export function readRoomData(empties: readonly Empty[]): RoomData {
  const open = find(empties, 'view_open');
  const target = open.userData.target;
  const view: RoomView = {
    position: open.position,
    target: vec3(target, '"view_open"\'s target'),
    span: positive(open.userData.span, '"view_open"\'s span'),
    height: positive(open.userData.height, '"view_open"\'s height'),
    aspect: positive(open.userData.aspect, '"view_open"\'s aspect'),
  };
  if (between(view.position, view.target) === 0) {
    throw new RoomDataError('"view_open" stands on its target, so it has no line of sight');
  }

  const bounds: Box = {
    min: find(empties, 'bounds_min').position,
    max: find(empties, 'bounds_max').position,
  };
  for (let axis = 0; axis < 3; axis += 1) {
    if (!((bounds.min[axis] ?? 0) < (bounds.max[axis] ?? 0))) {
      throw new RoomDataError('the camera box has no room: "bounds_min" is not below "bounds_max"');
    }
  }
  if (!contains(bounds, view.position)) {
    throw new RoomDataError('"view_open" is outside the camera box');
  }

  const lamp = empties.find((empty) => empty.name === 'live_lamp');
  const lights: RoomLights = {
    ambient: light(find(empties, 'live_ambient'), false),
    key: light(find(empties, 'live_key'), false),
    fill: light(find(empties, 'live_fill'), false),
    lamp: lamp === undefined ? undefined : light(lamp, true),
  };

  const slots: Record<string, Slot> = {};
  for (const empty of empties) {
    if (!empty.name.startsWith('slot_')) continue;
    slots[empty.name] = {
      position: empty.position,
      rotationY: turnAboutY(empty.quaternion),
      extras: empty.userData,
    };
  }
  return { view, bounds, lights, slots };
}

export function contains(box: Box, point: Vec3): boolean {
  return point.every((v, axis) => v >= (box.min[axis] ?? 0) && v <= (box.max[axis] ?? 0));
}

/** The point nearest `point` that is inside `box`. A camera pushed against a wall stands against it. */
export function clampInto(box: Box, point: Vec3): Vec3 {
  const at = (axis: 0 | 1 | 2): number =>
    Math.min(Math.max(point[axis], box.min[axis]), box.max[axis]);
  return [at(0), at(1), at(2)];
}

/**
 * Where the camera stands when it wants `point` and the box may not hold it (#620): on the line from
 * `target` to `point`, as far out as the box allows. **The view keeps its direction**, so a drag
 * toward a wall turns the camera as far as the pointer goes and the camera comes in to the target
 * instead of freezing against the face; turn away and the same line holds it farther out again.
 * Clamping, which `clampInto` does, moves the camera along the face and leaves the line, so the view
 * stops turning with the pointer. A target outside the box has no line to come in along, and the
 * camera stands against the nearest face.
 *
 * `nearest` is the closest the camera may come to the target, the page's `minDistance`: coming in
 * stops there, so a face close behind the target cannot take the camera to a few tenths of it. The
 * box has to hold that stand, which is the room's to arrange (`bounds_min` of the reading corner
 * stands 1.5 behind its target); where it does not, the final clamp holds it in the box instead.
 */
export function pullIn(box: Box, target: Vec3, point: Vec3, nearest = 0): Vec3 {
  if (contains(box, point)) return point;
  if (!contains(box, target)) return clampInto(box, point);
  const away = between(target, point);
  let reach = 1;
  for (const axis of [0, 1, 2] as const) {
    const run = point[axis] - target[axis];
    if (run === 0) continue;
    const wall = run > 0 ? box.max[axis] : box.min[axis];
    reach = Math.min(reach, (wall - target[axis]) / run);
  }
  // a floor never takes the camera past the place that was asked for
  if (away > 0) reach = Math.max(reach, Math.min(1, nearest / away));
  // the multiply can land a rounding error past the face it stops at
  return clampInto(box, [
    target[0] + (point[0] - target[0]) * reach,
    target[1] + (point[1] - target[1]) * reach,
    target[2] + (point[2] - target[2]) * reach,
  ]);
}

function between(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Where the camera opens: along the owner's line of sight from `view_open`, as close as both the
 * span and the height allow, so a wide window comes in until the room fills its height and the
 * corner is not left small in dark floor. **No special portrait framing** (spec S8.4): a window
 * narrower than the one the view was framed in opens as that one does, and a stand that falls
 * outside the box is pulled in along the line of sight until it is inside (`pullIn`), a closer
 * view accepted.
 */
export function frameRoom(
  aspect: number,
  view: RoomView,
  bounds: Box,
  fovDegrees: number,
): Framing {
  const [px, py, pz] = view.position;
  const [tx, ty, tz] = view.target;
  const half = Math.tan((fovDegrees / 2) * (Math.PI / 180));
  const base = between(view.position, view.target);
  const framedAspect = Math.max(aspect, view.aspect);
  const distance = Math.max(view.height / 2 / half, view.span / 2 / (half * framedAspect));
  const k = distance / base;
  const [x, y, z] = pullIn(bounds, view.target, [
    tx + (px - tx) * k,
    ty + (py - ty) * k,
    tz + (pz - tz) * k,
  ]);

  let farthest = 0;
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        farthest = Math.max(farthest, between([x, y, z], view.target));
      }
    }
  }
  return {
    distance,
    position: { x, y, z },
    target: { x: tx, y: ty, z: tz },
    maxDistance: farthest,
  };
}

/**
 * The shelf's lights, as the room says they are. A patch over the settings the page runs, so the
 * panel's controls show what is drawn; and **the shelf brings no lights of its own into a room**: a
 * room with no lamp puts the shelf's out.
 */
export function lightsPatch(lights: RoomLights, background: number): SettingsPatch {
  const at = (l: RoomLight): { x: number; y: { ofHeight: number; plus: number }; z: number } => ({
    x: l.position[0],
    y: { ofHeight: l.ofHeight, plus: l.position[1] },
    z: l.position[2],
  });
  const lamp = lights.lamp;
  return {
    scene: { background },
    lighting: {
      ambient: { colour: lights.ambient.colour, intensity: lights.ambient.intensity },
      key: { colour: lights.key.colour, intensity: lights.key.intensity, position: at(lights.key) },
      fill: {
        colour: lights.fill.colour,
        intensity: lights.fill.intensity,
        position: at(lights.fill),
      },
      lamp:
        lamp === undefined
          ? { intensity: 0 }
          : {
              colour: lamp.colour,
              intensity: lamp.intensity,
              position: at(lamp),
              ...(lamp.distance === undefined ? {} : { distance: lamp.distance }),
              ...(lamp.decay === undefined ? {} : { decay: lamp.decay }),
            },
    },
  };
}
