import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { chooseAnchor, panSpeedFor, zoomScaleFor } from './room-anchor.ts';
import { type Box, type Vec3, clampInto } from './room-data.ts';
import { WALK_PER_NOTCH, WALK_PER_PINCH_PIXEL, notchesOf } from './room-walk.ts';

type Listening = Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;

/** The share of a walk still to go that one frame takes, so a step eases in instead of jumping. */
const EASE = 0.25;
/** A walk this short is finished in the frame that finds it. */
const REST = 0.005;
/** WASD speed in units a second (1 unit ≈ 0.4 m), and Q/E turn in radians a second. */
const KEY_WALK = 6;
const KEY_TURN = Math.PI / 2;
const KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'Space',
  'KeyC',
  'ShiftLeft',
  'ShiftRight',
]);
/** Shift held: this many times faster. */
const KEY_SPRINT = 3;
const NEAREST = 0.05;
/**
 * How far past the room's box the camera may go, in world units (about 20 m). Inside that it passes
 * through walls freely: they are drawn from the inside only (`stripOuterFaces`, `room-cutaway.ts`).
 */
const OUTSIDE = 50;
/** The polar limit in a room: a camera below the passable floor can look up into the room. */
const POLAR = Math.PI * 0.9;
/** A turn comes in toward the anchor no nearer than this (about 60 cm); past it, it turns in place. */
const TURN_IN_PLACE = 1.5;
/** Steps along the line out from the anchor when looking for where the camera can stand. */
const SAMPLES = 48;
/** The centre pick runs at most this often while a pinch or a wheel walks, in milliseconds. */
const PICK_EVERY_MS = 100;

/** A point inside `space` is moved out through its nearest face. */
function pushOut(space: Box, p: Vec3): Vec3 {
  const inside = [0, 1, 2].every((a) => p[a]! > space.min[a]! && p[a]! < space.max[a]!);
  if (!inside) return p;
  let best = { axis: 0, to: p[0] };
  let least = Infinity;
  for (const axis of [0, 1, 2]) {
    for (const face of [space.min[axis]!, space.max[axis]!]) {
      const d = Math.abs(p[axis]! - face);
      if (d < least) {
        least = d;
        best = { axis, to: face };
      }
    }
  }
  const out: [number, number, number] = [p[0], p[1], p[2]];
  out[best.axis] = best.to;
  return out;
}

/**
 * How the camera moves in a room (#637, which replaced #620, #626 and #632): `OrbitControls` as it ships
 * turns and pans about an **anchor**, its target, picked at the centre of the screen; the wheel and the
 * pinch walk the camera and the anchor forward together; the camera may stand up to 50 units outside the
 * room's box, which is drawn from the inside only; and the keyboard walks, rises and turns.
 *
 * - **The anchor** always lies on the line the camera already looks down, so placing it never moves the
 *   view. It is placed at room open, after the camera is framed anew, after a held book gives it back,
 *   at the first turn after a walk, a pinch or a pan, and at the start of every pan (`chooseAnchor`).
 * - **A turn** holds the camera at the distance the visitor wished from the anchor, and where the main
 *   bookcase's keep-out lies on that line it comes in along it; nearer than `TURN_IN_PLACE` it turns in
 *   place. Past the outer limit it slides along it.
 * - **A pan, a walk or a key move** keeps the camera inside the box grown by `OUTSIDE` and out of the
 *   keep-out, moving the anchor by whatever the camera was moved back.
 *
 * Outside a room (`leave`, and before `enter`) it is `OrbitControls` as it was.
 */
export interface RoomOrbit {
  /** The room is dressed: the camera turns about an anchor inside the room's box grown by `OUTSIDE`, and stays out of `keepOut` (the main bookcase). */
  enter(bounds: Box, keepOut?: readonly Box[]): void;
  /** The room failed or was taken down: every `OrbitControls` field the room changed is put back. */
  leave(): void;
  /** The camera was framed anew, so the anchor is placed again and what is queued is forgotten. */
  forget(): void;
  /** A held book owns the camera this frame: nothing queued is walked, and the anchor is placed again after. */
  hold(): void;
  /** Queues a walk of `distance` world units, forward positive. */
  walkBy(distance: number): void;
  /** One frame: the queued walk, the keys, then the orbit. */
  step(): void;
  /** Listens for the wheel, the pointer and the keys; returns what takes them off again. */
  attach(element: Listening): () => void;
}

export interface RoomOrbitOptions {
  /** The clock, in milliseconds: the centre pick's throttle and the keyboard's step read it. */
  readonly now?: () => number;
}

export function createRoomOrbit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  /** How far ahead the first surface at the centre of the screen is, if there is one. */
  pickAhead: () => number | undefined,
  { now = () => performance.now() }: RoomOrbitOptions = {},
): RoomOrbit {
  /** What `enter` found in `controls`, which `leave` puts back. */
  let saved:
    | {
        enableZoom: boolean;
        enablePan: boolean;
        enableRotate: boolean;
        panSpeed: number;
        minDistance: number;
        maxDistance: number;
        maxPolarAngle: number;
      }
    | undefined;
  /** The box the camera may stand in: the room's, grown by `OUTSIDE`. */
  let reachable: Box | undefined;
  /** The room's own box, kept apart from `reachable`. */
  let room: Box | undefined;
  let keepOut: readonly Box[] = [];
  /** How far from the anchor the visitor asked to stand: the turn goes back out to it. */
  let wished = 0;
  let anchorDue = true;
  /**
   * A walk, a pinch or a pan has moved the camera since the anchor was set: the next turn places it again
   * on what is at the centre of the screen. A turn alone never moves it.
   */
  let moved = false;
  let pending = 0;
  /** A pan is under way: the camera and the anchor go together and stop at the edge of `reachable` or at the keep-out. */
  let panning = false;
  const fingers = new Map<number, { x: number; y: number }>();
  let spread: number | undefined;
  const dir = new THREE.Vector3();
  const offset = new THREE.Vector3();
  /** Where the camera stood before this frame's turn. */
  const before = new THREE.Vector3();
  const side = new THREE.Vector3();
  const keys = new Set<string>();
  let lastStep = now();
  let keyTurning = false;
  /** A held book owns the camera: no key is taken, and every key held is dropped. */
  let holding = false;
  const at = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

  /** Puts the anchor `distance` ahead along the line the camera looks down. */
  const anchorAt = (distance: number): void => {
    dir.subVectors(controls.target, camera.position);
    if (dir.lengthSq() < 1e-12) camera.getWorldDirection(dir);
    dir.normalize();
    controls.target.copy(camera.position).addScaledVector(dir, distance);
    wished = distance;
  };

  const reanchor = (): void => {
    camera.updateMatrixWorld();
    const hit = pickAhead();
    dir.subVectors(controls.target, camera.position);
    if (dir.lengthSq() < 1e-12) camera.getWorldDirection(dir);
    dir.normalize();
    anchorAt(chooseAnchor(hit, room, at(camera.position), at(dir)));
  };

  /** Camera and anchor forward together along the view. */
  const walkBy = (distance: number): void => {
    moved = true;
    dir.subVectors(controls.target, camera.position).normalize();
    camera.position.addScaledVector(dir, distance);
    controls.target.addScaledVector(dir, distance);
  };

  const placeable = (box: Box, p: Vec3): Vec3 => {
    let fixed = clampInto(box, p);
    for (const space of keepOut) fixed = pushOut(space, fixed);
    return fixed;
  };

  /** A pan or a walk: the camera back inside `box` and out of the keep-out, and the anchor moved by the same amount. */
  const confineBoth = (box: Box): void => {
    const was = at(camera.position);
    const fixed = placeable(box, was);
    camera.position.set(...fixed);
    controls.target.x += fixed[0] - was[0];
    controls.target.y += fixed[1] - was[1];
    controls.target.z += fixed[2] - was[2];
  };

  const free = (p: Vec3): boolean =>
    !keepOut.some((s) => p.every((v, a) => v > s.min[a]! && v < s.max[a]!));

  /**
   * A turn. The anchor stays and the camera stands `wished` from it, or as near as the main bookcase's
   * keep-out allows along the line to the anchor; past the outer limit it slides along it. Nearer than
   * `TURN_IN_PLACE` it stops coming in: the camera stays where it stood and the rest of the drag turns
   * the view about it, so the bookcase never holds a drag still.
   */
  const confineTurn = (box: Box): void => {
    const target = at(controls.target);
    offset.subVectors(camera.position, controls.target).normalize();
    const along = (t: number): Vec3 => [
      target[0] + offset.x * wished * t,
      target[1] + offset.y * wished * t,
      target[2] + offset.z * wished * t,
    ];
    // the farthest place on the line out from the anchor that is free of the keep-out; the outer limit
    // holds the camera by sliding along it, never by pulling it in toward the anchor
    let reach = 0;
    for (let i = SAMPLES; i >= 1; i -= 1) {
      if (free(along(i / SAMPLES))) {
        reach = i / SAMPLES;
        break;
      }
    }
    if (reach * wished >= TURN_IN_PLACE) {
      camera.position.set(...clampInto(box, along(reach)));
      return;
    }
    // turn in place: the camera back where it stood, looking the way the drag turned it
    camera.position.copy(before);
    controls.target.copy(before).addScaledVector(offset, -wished);
  };

  /**
   * A scroll notch or a pinch moves a share of the distance to what is ahead rather than a fixed
   * length (`zoomScaleFor`). A raycast through the whole room on every pointermove is costly on a phone:
   * it runs once per `PICK_EVERY_MS`.
   */
  let zoomAt = -Infinity;
  let zoomLast = 1;
  const zoomScale = (): number => {
    const t = now();
    if (t - zoomAt < PICK_EVERY_MS) return zoomLast;
    zoomAt = t;
    camera.updateMatrixWorld();
    zoomLast = zoomScaleFor(pickAhead());
    return zoomLast;
  };

  const readSpread = (): number | undefined => {
    const [a, b] = [...fingers.values()];
    return a === undefined || b === undefined ? undefined : Math.hypot(a.x - b.x, a.y - b.y);
  };

  const attach = (element: Listening): (() => void) => {
    const onWheel = (event: Event): void => {
      if (reachable === undefined) return;
      const { deltaY, deltaMode } = event as WheelEvent;
      event.preventDefault();
      pending += notchesOf(deltaY, deltaMode) * WALK_PER_NOTCH * zoomScale();
    };
    const onDown = (event: Event): void => {
      const { pointerId, pointerType, clientX, clientY, button, shiftKey, ctrlKey, metaKey } =
        event as PointerEvent;
      if (pointerType === 'touch') {
        fingers.set(pointerId, { x: clientX, y: clientY });
        spread = readSpread();
        panning = fingers.size >= 2;
        // a pan drags what is under the centre of the screen: pick it as the anchor when the pan
        // starts, or the pan runs at the rate of an anchor a walk has carried far ahead
        if (fingers.size === 2 && reachable !== undefined) reanchor();
        if (panning) moved = true;
        if (fingers.size === 1 && reachable !== undefined && moved) {
          reanchor();
          moved = false;
        }
        return;
      }
      panning = button === 2 || shiftKey || ctrlKey || metaKey;
      if (panning && reachable !== undefined) reanchor();
      if (panning) moved = true;
      else if (reachable !== undefined && moved) {
        reanchor();
        moved = false;
      }
    };
    const onMove = (event: Event): void => {
      const { pointerId, clientX, clientY } = event as PointerEvent;
      const finger = fingers.get(pointerId);
      if (finger === undefined) return;
      finger.x = clientX;
      finger.y = clientY;
      const apart = readSpread();
      // a held book owns the camera, and the page disables the controls while it does
      if (
        reachable !== undefined &&
        !holding &&
        controls.enabled &&
        apart !== undefined &&
        spread !== undefined
      ) {
        walkBy((apart - spread) * WALK_PER_PINCH_PIXEL * zoomScale());
        confineBoth(reachable);
      }
      spread = apart;
    };
    const onUp = (event: Event): void => {
      const { pointerId, pointerType } = event as PointerEvent;
      if (pointerType !== 'touch') return;
      fingers.delete(pointerId);
      spread = readSpread();
      // a pan's momentum plays out as a pan, so `panning` stays; the next touch decides again
    };
    // WASD walks and strafes, Q and E turn about the anchor; on the window, since the canvas rarely has focus
    /** Where a key may be taken from: the page itself or the canvas, never a control the page's own keys belong to. */
    const takesKeys = (event: Event): boolean => {
      const el = event.target as { tagName?: string } | null;
      if (el !== element && el?.tagName !== 'BODY') return false;
      return typeof document === 'undefined' || document.querySelector('dialog[open]') === null;
    };
    const onKeyDown = (event: Event): void => {
      const { code, ctrlKey, metaKey, altKey } = event as KeyboardEvent;
      if (reachable === undefined || holding || !KEYS.has(code)) return;
      if (ctrlKey || metaKey || altKey || !takesKeys(event)) return;
      // Space would otherwise scroll the page
      if (code === 'Space') event.preventDefault();
      keys.add(code);
    };
    // a key let go always lets go, whatever has focus by then: it was taken when it went down
    const onKeyUp = (event: Event): void => {
      keys.delete((event as KeyboardEvent).code);
    };
    const onBlur = (): void => {
      keys.clear();
    };
    const view = typeof window === 'undefined' ? undefined : window;
    view?.addEventListener('keydown', onKeyDown);
    view?.addEventListener('keyup', onKeyUp);
    view?.addEventListener('blur', onBlur);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      view?.removeEventListener('keydown', onKeyDown);
      view?.removeEventListener('keyup', onKeyUp);
      view?.removeEventListener('blur', onBlur);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  };

  return {
    enter(box, spaces = []) {
      // what `leave` puts back is what the page left in `controls`, taken once per room
      saved ??= {
        enableZoom: controls.enableZoom,
        enablePan: controls.enablePan,
        enableRotate: controls.enableRotate,
        panSpeed: controls.panSpeed,
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        maxPolarAngle: controls.maxPolarAngle,
      };
      room = box;
      reachable = {
        min: [box.min[0] - OUTSIDE, box.min[1] - OUTSIDE, box.min[2] - OUTSIDE],
        max: [box.max[0] + OUTSIDE, box.max[1] + OUTSIDE, box.max[2] + OUTSIDE],
      };
      keepOut = spaces;
      controls.enableZoom = false;
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.minDistance = NEAREST;
      controls.maxDistance = Infinity;
      controls.maxPolarAngle = POLAR;
      anchorDue = true;
      pending = 0;
    },
    leave() {
      reachable = undefined;
      room = undefined;
      keepOut = [];
      if (saved !== undefined) Object.assign(controls, saved);
      saved = undefined;
      pending = 0;
      keys.clear();
      keyTurning = false;
    },
    forget() {
      anchorDue = true;
      pending = 0;
    },
    hold() {
      anchorDue = true;
      pending = 0;
      holding = true;
      keys.clear();
      keyTurning = false;
    },
    walkBy(distance) {
      if (reachable !== undefined) pending += distance;
    },
    step() {
      holding = false;
      if (reachable === undefined) {
        controls.update();
        return;
      }
      if (anchorDue) {
        reanchor();
        anchorDue = false;
      }
      if (pending !== 0) {
        const part = Math.abs(pending) < REST ? pending : pending * EASE;
        walkBy(part);
        pending -= part;
        if (Math.abs(pending) < 1e-6) pending = 0;
        confineBoth(reachable);
      }
      const t = now();
      const dt = Math.min(0.1, (t - lastStep) / 1000);
      lastStep = t;
      const axis = (plus: string, minus: string): number =>
        (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);
      const forward = axis('KeyW', 'KeyS');
      const right = axis('KeyD', 'KeyA');
      const turn = axis('KeyQ', 'KeyE');
      const rise = axis('Space', 'KeyC');
      const speed =
        KEY_WALK * dt * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? KEY_SPRINT : 1);
      // a key turn picks a new anchor when it starts after a move, as a drag does, and keeps that
      // anchor while it lasts, so walking and turning together orbit as they go
      if (turn !== 0 && !keyTurning && moved) {
        reanchor();
        moved = false;
      }
      keyTurning = turn !== 0;
      if (forward !== 0) {
        walkBy(forward * speed);
        confineBoth(reachable);
      }
      if (right !== 0 || rise !== 0) {
        moved = true;
        dir.subVectors(controls.target, camera.position);
        side
          .crossVectors(dir, camera.up)
          .setY(0)
          .normalize()
          .multiplyScalar(right * speed);
        side.y = rise * speed;
        camera.position.add(side);
        controls.target.add(side);
        confineBoth(reachable);
      }
      before.copy(camera.position);
      if (turn !== 0) {
        offset.subVectors(camera.position, controls.target);
        offset.applyAxisAngle(camera.up, (turn * KEY_TURN * speed) / KEY_WALK);
        camera.position.copy(controls.target).add(offset);
      }
      // the page's framing sets OrbitControls' maxDistance after `enter`, and OrbitControls clamps to
      // it every frame: a pan, which nothing puts back, snapped the camera in to it
      controls.minDistance = NEAREST;
      controls.maxDistance = Infinity;
      // OrbitControls pans in proportion to the anchor's distance: a surface right in front never crawls
      controls.panSpeed = panSpeedFor(camera.position.distanceTo(controls.target));
      controls.update();
      if (panning) confineBoth(reachable);
      else confineTurn(reachable);
    },
    attach,
  };
}
