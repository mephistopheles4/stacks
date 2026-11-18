import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Box, type Vec3, pullIn } from './room-data.ts';
import { type TwoFingerSplit, createTwoFingerSplit } from './room-gesture.ts';
import {
  PAN_PER_PIXEL,
  WALK_PER_NOTCH,
  WALK_PER_PINCH_PIXEL,
  notchesOf,
  pan,
  walk,
} from './room-walk.ts';

/** The share of a walk still to go that one frame takes, so a step eases in instead of jumping. */
const EASE = 0.25;
/** A walk this short is finished in the frame that finds it. */
const REST = 0.005;

type Listening = Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;

/**
 * How the camera moves in a room (#620, #626, #632): a drag orbits the target, the scroll and the
 * pinch walk the camera and the target forward and back (`walk`), two fingers moving together, a
 * right-button drag and a shift-drag pan them sideways and up and down (`pan`), and the camera
 * never leaves the room's box.
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
 * **Pan.** A touch of two fingers is a pinch or a pan, decided once (`room-gesture.ts`) from samples
 * taken a frame apart, when both fingers have reported. While two fingers are down the drag does not
 * turn the view, so a pan does not turn it by the midpoint's movement. A pan queues and eases as a
 * walk does, and starts the same pivot (it moves the camera too).
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
  /** Queues a pan of `right` world units along the screen's right and `up` along its up. */
  panBy(right: number, up: number): void;
  /** One frame: the queued walk, then the orbit. */
  step(): void;
  /** Listens for the wheel and the pinch on `element`; returns what takes them off again. */
  attach(element: Listening): () => void;
}

export function createRoomOrbit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): RoomOrbit {
  /** `OrbitControls`' rotate speed as the page set it: a mouse turns by it, a finger by its negative. */
  const rotateSpeed = controls.rotateSpeed;
  let bounds: Box | undefined;
  let keepOut: readonly Box[] = [];
  /** How far from the target the visitor stands: the distance the orbit goes back to. */
  let wished = 0;
  /** How far from what they look at the walk keeps the target when the box allows it. */
  let radius = 0;
  /** The walk still to take. */
  let pending = 0;
  /** The pan still to take, along the screen's right and up. */
  let panRight = 0;
  let panUp = 0;
  /** Touches down, by pointer. */
  const fingers = new Map<number, { x: number; y: number }>();
  /** What the last frame saw of two fingers, and how they split into a pinch or a pan. */
  let split: TwoFingerSplit | undefined;
  let seen = { spread: 0, x: 0, y: 0 };
  /** The mouse button or shift-drag that is panning, if one is. */
  let dragging: { id: number; x: number; y: number } | undefined;
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
    panFrame(box);
    stand.copy(camera.position);
    wished = camera.position.distanceTo(target);
  };

  /** The queued pan, a share of it a frame as the walk is, with the camera and the target going together. */
  const panFrame = (box: Box): void => {
    const share = (left: number): number => (Math.abs(left) < REST ? left : left * EASE);
    const right = share(panRight);
    const up = share(panUp);
    const from = camera.position.clone();
    const stood = pan(box, at(camera.position), at(controls.target), right, up, keepOut);
    camera.position.set(...stood.camera);
    controls.target.set(...stood.target);
    const asked = Math.hypot(right, up);
    // a pan the case or the wall stopped dead would only press on it; one that slid goes on
    if (asked > 1e-9 && camera.position.distanceTo(from) < 1e-9) {
      panRight = 0;
      panUp = 0;
    } else {
      panRight -= right;
      panUp -= up;
    }
    if (Math.abs(panRight) < 1e-6) panRight = 0;
    if (Math.abs(panUp) < 1e-6) panUp = 0;
  };

  const readFingers = (): { spread: number; x: number; y: number } => {
    const [a, b] = [...fingers.values()];
    return a === undefined || b === undefined
      ? { spread: 0, x: 0, y: 0 }
      : { spread: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  /** Starts a gesture afresh from where the fingers are now, or ends it when they are not two. */
  const rebase = (): void => {
    split = fingers.size === 2 ? createTwoFingerSplit() : undefined;
    seen = readFingers();
  };

  /**
   * Once a frame, what two fingers did since the last: read here and not in the pointer handlers
   * because a handler hears one finger at a time, and a fast pan looks like half a pinch until the
   * other finger reports. A frame is when both have.
   */
  const sample = (): void => {
    if (split === undefined || fingers.size !== 2) return;
    const now = readFingers();
    const moved = split.move(now.spread - seen.spread, now.x - seen.x, now.y - seen.y);
    seen = now;
    orbitApi.walkBy(moved.pinch * WALK_PER_PINCH_PIXEL);
    // the room follows the fingers, so the camera goes the other way
    orbitApi.panBy(-moved.panX * PAN_PER_PIXEL, moved.panY * PAN_PER_PIXEL);
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
    const onDown = (event: Event): void => {
      const { pointerId, pointerType, clientX, clientY, button, shiftKey } = event as PointerEvent;
      // A finger turns the view the other way from a mouse (#635, ADR-0186): the sign of
      // `rotateSpeed` flips both axes, and is read on each move, so it is set by what went down.
      if (bounds !== undefined) {
        controls.rotateSpeed = pointerType === 'touch' ? -rotateSpeed : rotateSpeed;
      }
      if (pointerType === 'touch') {
        fingers.set(pointerId, { x: clientX, y: clientY });
        // two fingers are a pinch or a pan, and neither turns the view
        if (bounds !== undefined && fingers.size >= 2) controls.enableRotate = false;
        rebase();
      } else if (
        pointerType === 'mouse' &&
        bounds !== undefined &&
        (button === 2 || (button === 0 && shiftKey))
      ) {
        dragging = { id: pointerId, x: clientX, y: clientY };
      }
    };
    const onMove = (event: Event): void => {
      const { pointerId, clientX, clientY, buttons } = event as PointerEvent;
      if (dragging?.id === pointerId) {
        if (buttons === 0) dragging = undefined;
        else {
          orbitApi.panBy(
            -(clientX - dragging.x) * PAN_PER_PIXEL,
            (clientY - dragging.y) * PAN_PER_PIXEL,
          );
          dragging.x = clientX;
          dragging.y = clientY;
        }
        return;
      }
      const finger = fingers.get(pointerId);
      if (finger === undefined) return;
      finger.x = clientX;
      finger.y = clientY;
    };
    const release = (event: Event): void => {
      const { pointerId } = event as PointerEvent;
      if (dragging?.id === pointerId) dragging = undefined;
      if (!fingers.delete(pointerId)) return;
      rebase();
      if (bounds !== undefined && fingers.size < 2) controls.enableRotate = true;
    };
    /** A lift is the end of what the fingers did, so what they moved since the last frame is taken first. */
    const onUp = (event: Event): void => {
      sample();
      release(event);
    };
    /** A cancel is the browser taking the touch away: what it moved since the last frame is not taken. */
    const onCancel = release;
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onCancel);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
    };
  };

  const forget = (): void => {
    wished = 0;
    radius = 0;
    pending = 0;
    panRight = 0;
    panUp = 0;
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
      controls.enableRotate = true;
      controls.rotateSpeed = rotateSpeed;
      forget();
    },
    forget,
    hold() {
      wished = 0;
      pending = 0;
      panRight = 0;
      panUp = 0;
      rebase();
    },
    walkBy(distance) {
      if (bounds !== undefined) pending += distance;
    },
    panBy(right, up) {
      if (bounds === undefined) return;
      panRight += right;
      panUp += up;
    },
    step() {
      if (bounds === undefined) {
        rebase();
        controls.update();
        return;
      }
      sample();
      if (wished === 0) {
        stand.copy(camera.position);
        wished = camera.position.distanceTo(controls.target);
        // after a hold the camera may stand elsewhere: once walked, the pivot is wherever it now is
        if (radius === 0 || walked) radius = wished;
      }
      if (pending !== 0 || panRight !== 0 || panUp !== 0) walkFrame(bounds);
      if (walked) headTurn();
      else orbit(bounds);
    },
    attach,
  };
  return orbitApi;
}
