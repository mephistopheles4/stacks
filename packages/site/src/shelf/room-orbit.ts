import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Box, type Vec3, pullIn } from './room-data.ts';
import { WALK_PER_NOTCH, WALK_PER_PINCH_PIXEL, notchesOf, walk } from './room-walk.ts';

/** The share of a walk still to go that one frame takes, so a step eases in instead of jumping. */
const EASE = 0.25;
/** A walk this short is finished in the frame that finds it. */
const REST = 0.005;

type Listening = Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;

/**
 * How the camera moves in a room (#620, #626): a drag orbits the target, the scroll and the pinch
 * walk the camera and the target forward and back (`walk`), and the camera never leaves the room's
 * box.
 *
 * **Orbit.** It always turns where it is dragged: a place the box cannot hold is brought in along
 * the line to the target (`pullIn`) and no nearer than `minDistance`, instead of being clamped onto
 * a face, where the turn undid itself and the camera looked stuck. The distance the visitor asked for
 * (`wished`) is kept apart, so turning away from the wall lets the camera back out.
 *
 * **Walk.** `OrbitControls`' own dolly is off in a room (why: ADR-0178 item 8). The walk is the only
 * thing the wheel and the pinch do, and it is queued here and taken a little each frame. **From the
 * first step on, the drag turns the view about the camera**, as turning a head would: the target
 * stands `minDistance` ahead and swings, and the camera stays where it walked, so no face can hold
 * the turn. Before the first step the drag orbits the far target the opening view was framed round.
 *
 * Outside a room (`leave`, and before `enter`) it is `OrbitControls` as it was.
 */
export interface RoomOrbit {
  /**
   * The room is dressed: walk inside `bounds` and not into `keepOut` (the main bookcase), and
   * `OrbitControls` zooms and pans no more.
   */
  enter(bounds: Box, keepOut?: readonly Box[]): void;
  /** The room failed or was taken down: `OrbitControls` as it was. */
  leave(): void;
  /** The camera was framed anew, so what was wished and what is queued are forgotten. */
  forget(): void;
  /** A held book owns the camera this frame: nothing queued is walked, and the wished stand is read again after. */
  hold(): void;
  /** Queues a walk of `distance` world units, forward positive. */
  walkBy(distance: number): void;
  /** One frame: the queued walk, then the orbit. */
  step(): void;
  /** Listens for the wheel and the pinch on `element`; returns what takes them off again. */
  attach(element: Listening): () => void;
}

export function createRoomOrbit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): RoomOrbit {
  let bounds: Box | undefined;
  let keepOut: readonly Box[] = [];
  /** How far from the target the visitor stands: the distance the orbit goes back to. */
  let wished = 0;
  /** How far from what they look at the walk keeps the target when the box allows it. */
  let radius = 0;
  /** The walk still to take. */
  let pending = 0;
  /** Set by the first step of a walk: the pivot has come in to the camera (see `walkFrame`). */
  let walked = false;
  /** Where the visitor stands once they have walked: the camera, whatever a pointer handler did to it. */
  const stand = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const at = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

  const walkFrame = (box: Box): void => {
    const { target } = controls;
    // **Once the visitor has walked, a drag turns the view and does not swing the camera** (see
    // `headTurn`). The opening view orbits a target across the room, as the owner framed it; after
    // the first step the target is only `minDistance` ahead of the camera, the nearest
    // `OrbitControls` allows. The line of sight does not change when it comes in, so nothing jumps.
    if (walked) {
      settle();
    } else {
      // A pointer handler may have swung the camera out of the box since the last frame's pull-in
      // (`OrbitControls` updates inside each handler), and a walk leaves a camera outside the box where
      // it is: bring it in the way `orbit` would have, before the first step.
      offset.subVectors(camera.position, target).setLength(wished).add(target);
      camera.position.set(...pullIn(box, at(target), at(offset), controls.minDistance));
      walked = true;
      radius = Math.min(radius, controls.minDistance);
    }
    const part = Math.abs(pending) < REST ? pending : pending * EASE;
    const from = camera.position.clone();
    const stood = walk(
      box,
      at(camera.position),
      at(target),
      part,
      radius,
      controls.minDistance,
      keepOut,
    );
    camera.position.set(...stood.camera);
    target.set(...stood.target);
    // a step that met a face took less than it was asked for, and what is left would only press on it
    const done = camera.position.distanceTo(from);
    pending = done < Math.abs(part) - 1e-9 ? 0 : pending - part;
    if (Math.abs(pending) < 1e-6) pending = 0;
    stand.copy(camera.position);
    wished = camera.position.distanceTo(target);
  };

  /**
   * A drag after a walk: the camera stays where it stands and the view turns about it. `OrbitControls`
   * turns the camera about the target, so the turn is taken and then the camera is put back and the
   * target carried to where the turned view looks. The camera never leaves the box, so no face can
   * hold the turn.
   */
  const headTurn = (): void => {
    const { target } = controls;
    settle();
    offset.subVectors(stand, target).setLength(radius);
    camera.position.copy(target).add(offset);
    controls.update();
    settle();
    camera.lookAt(target);
    wished = radius;
  };

  /**
   * `OrbitControls` runs `update()` inside its own pointer handlers, which swings the camera about the
   * target between two frames. What that swing meant is the turn (the direction from the target to
   * the camera); the camera goes back to where the visitor stands and the target to `radius` ahead of
   * it along the turned view.
   */
  const settle = (): void => {
    offset.subVectors(camera.position, controls.target).setLength(radius);
    camera.position.copy(stand);
    controls.target.copy(stand).sub(offset);
  };

  const orbit = (box: Box): void => {
    const { target } = controls;
    // The orbit starts from where the visitor asked the camera to stand, not from where the box left it.
    offset.subVectors(camera.position, target).setLength(wished);
    camera.position.copy(target).add(offset);
    controls.update();
    offset.subVectors(camera.position, target);
    wished = offset.length();
    // `offset` now holds the place the visitor asked for, as a point, for the pull-in
    offset.add(target);
    const [x, y, z] = pullIn(box, at(target), at(offset), controls.minDistance);
    camera.position.set(x, y, z);
  };

  const attach = (element: Listening): (() => void) => {
    const onWheel = (event: Event): void => {
      if (bounds === undefined) return;
      const { deltaY, deltaMode } = event as WheelEvent;
      event.preventDefault();
      orbitApi.walkBy(notchesOf(deltaY, deltaMode) * WALK_PER_NOTCH);
    };
    const fingers = new Map<number, { x: number; y: number }>();
    const spread = (): number => {
      const [a, b] = [...fingers.values()];
      return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (event: Event): void => {
      const { pointerId, pointerType, clientX, clientY } = event as PointerEvent;
      if (pointerType === 'touch') fingers.set(pointerId, { x: clientX, y: clientY });
    };
    const onMove = (event: Event): void => {
      const { pointerId, clientX, clientY } = event as PointerEvent;
      const finger = fingers.get(pointerId);
      if (finger === undefined) return;
      const before = fingers.size === 2 ? spread() : 0;
      finger.x = clientX;
      finger.y = clientY;
      if (before > 0) orbitApi.walkBy((spread() - before) * WALK_PER_PINCH_PIXEL);
    };
    const onUp = (event: Event): void => {
      fingers.delete((event as PointerEvent).pointerId);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  };

  const forget = (): void => {
    wished = 0;
    radius = 0;
    pending = 0;
    walked = false;
  };

  const orbitApi: RoomOrbit = {
    enter(box, spaces = []) {
      bounds = box;
      keepOut = spaces;
      controls.enableZoom = false;
      controls.enablePan = false;
      forget();
    },
    leave() {
      bounds = undefined;
      keepOut = [];
      controls.enableZoom = true;
      controls.enablePan = true;
      forget();
    },
    forget,
    hold() {
      wished = 0;
      pending = 0;
    },
    walkBy(distance) {
      if (bounds !== undefined) pending += distance;
    },
    step() {
      if (bounds === undefined) {
        controls.update();
        return;
      }
      if (wished === 0) {
        stand.copy(camera.position);
        wished = camera.position.distanceTo(controls.target);
        // after a hold the camera may stand elsewhere: once walked, the pivot is wherever it now is
        if (radius === 0 || walked) radius = wished;
      }
      if (pending !== 0) walkFrame(bounds);
      if (walked) headTurn();
      else orbit(bounds);
    },
    attach,
  };
  return orbitApi;
}
