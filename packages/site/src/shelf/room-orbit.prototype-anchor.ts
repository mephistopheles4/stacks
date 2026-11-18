/**
 * PROTOTYPE (#637) — throwaway, on `prototype/637-anchor-camera`, never merged.
 *
 * Question: does the room feel better on a phone with `OrbitControls` as it ships than with the
 * custom gesture layer in `room-orbit.ts`? Chosen with `?cam=anchor`. `?pivot=<metres>` holds the
 * anchor that far ahead; `?pivot=auto` puts it on whatever is at the centre of the screen.
 *
 * - Rotate, pan (two fingers, right-drag, shift/ctrl-drag) and damping are `OrbitControls`' own, in
 *   its own direction: the content follows the finger.
 * - The anchor is set when a one-finger or left-button drag starts, along the line the camera already
 *   looks down, so the view does not jump.
 * - A spin keeps the anchor where it is: a camera the walls or the bookcase would not hold is brought
 *   in toward the anchor, and goes back out when there is room. A pan moves both, and stops at a wall.
 * - Scroll and pinch move the camera and the anchor forward together: the pinch 1:1, the wheel eased.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Box, type Vec3, clampInto, pullIn } from './room-data.ts';
import { WALK_PER_NOTCH, WALK_PER_PINCH_PIXEL, notchesOf } from './room-walk.ts';
import type { RoomOrbit } from './room-orbit.ts';

type Listening = Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;
export type Pivot = number | 'auto';

const EASE = 0.25;
const REST = 0.005;
/** `auto` with nothing at the centre of the screen, or something nearer or farther than makes sense. */
// world units, not metres: the room's eye height is 3.9
const AUTO_FALLBACK = 6;
const AUTO_NEAREST = 0.5;
const AUTO_FARTHEST = 60;
const NEAREST = 0.05;

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

export function readPivot(search: string): Pivot {
  const raw = new URLSearchParams(search).get('pivot');
  if (raw === 'auto') return 'auto';
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0.1 && n < 60 ? n : 3;
}

export function createAnchorOrbit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  pivot: Pivot,
  /** How far ahead the first surface at the centre of the screen is, if there is one. */
  pickAhead: () => number | undefined,
): RoomOrbit {
  const saved = {
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    maxPolarAngle: controls.maxPolarAngle,
  };
  let bounds: Box | undefined;
  let keepOut: readonly Box[] = [];
  /** How far from the anchor the visitor asked to stand: the spin goes back out to it. */
  let wished = 0;
  let anchorDue = true;
  let pending = 0;
  /** A pan is under way: the camera and the anchor go together and stop at a wall. */
  let panning = false;
  let mouseDown = false;
  const fingers = new Map<number, { x: number; y: number }>();
  let spread: number | undefined;
  const dir = new THREE.Vector3();
  const offset = new THREE.Vector3();
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
    if (pivot !== 'auto') return anchorAt(pivot);
    camera.updateMatrixWorld();
    const hit = pickAhead();
    anchorAt(hit === undefined || hit < AUTO_NEAREST || hit > AUTO_FARTHEST ? AUTO_FALLBACK : hit);
  };

  /** Camera and anchor forward together along the view. */
  const walkBy = (distance: number): void => {
    dir.subVectors(controls.target, camera.position).normalize();
    camera.position.addScaledVector(dir, distance);
    controls.target.addScaledVector(dir, distance);
  };

  const placeable = (box: Box, p: Vec3): Vec3 => {
    let fixed = clampInto(box, p);
    for (const space of keepOut) fixed = pushOut(space, fixed);
    return fixed;
  };

  /** A pan or a walk: the camera back in the room, and the anchor moved by the same amount. */
  const confineBoth = (box: Box): void => {
    const was = at(camera.position);
    const fixed = placeable(box, was);
    camera.position.set(...fixed);
    controls.target.x += fixed[0] - was[0];
    controls.target.y += fixed[1] - was[1];
    controls.target.z += fixed[2] - was[2];
  };

  /** A spin: the anchor stays, the camera stands `wished` from it or as near as the room allows. */
  const confineSpin = (box: Box): void => {
    offset.subVectors(camera.position, controls.target).setLength(wished).add(controls.target);
    let p = pullIn(box, at(controls.target), at(offset), NEAREST);
    for (const space of keepOut) p = pushOut(space, p);
    camera.position.set(...p);
  };

  const readSpread = (): number | undefined => {
    const [a, b] = [...fingers.values()];
    return a === undefined || b === undefined ? undefined : Math.hypot(a.x - b.x, a.y - b.y);
  };

  const attach = (element: Listening): (() => void) => {
    const onWheel = (event: Event): void => {
      if (bounds === undefined) return;
      const { deltaY, deltaMode } = event as WheelEvent;
      event.preventDefault();
      pending += notchesOf(deltaY, deltaMode) * WALK_PER_NOTCH;
    };
    const onDown = (event: Event): void => {
      const { pointerId, pointerType, clientX, clientY, button, shiftKey, ctrlKey, metaKey } =
        event as PointerEvent;
      if (pointerType === 'touch') {
        fingers.set(pointerId, { x: clientX, y: clientY });
        spread = readSpread();
        panning = fingers.size >= 2;
        if (fingers.size === 1 && bounds !== undefined) reanchor();
        return;
      }
      mouseDown = true;
      panning = button === 2 || shiftKey || ctrlKey || metaKey;
      if (!panning && bounds !== undefined) reanchor();
    };
    const onMove = (event: Event): void => {
      const { pointerId, clientX, clientY } = event as PointerEvent;
      const finger = fingers.get(pointerId);
      if (finger === undefined) return;
      finger.x = clientX;
      finger.y = clientY;
      const now = readSpread();
      if (bounds !== undefined && now !== undefined && spread !== undefined) {
        walkBy((now - spread) * WALK_PER_PINCH_PIXEL);
        confineBoth(bounds);
      }
      spread = now;
    };
    const onUp = (event: Event): void => {
      const { pointerId, pointerType } = event as PointerEvent;
      if (pointerType === 'touch') {
        fingers.delete(pointerId);
        spread = readSpread();
        // a pan's momentum plays out as a pan; the next touch decides again
        if (fingers.size === 0) return;
      } else {
        mouseDown = false;
      }
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

  const debug = (): void => {
    (globalThis as { __anchorCam?: unknown }).__anchorCam = {
      pivot,
      wished: +wished.toFixed(3),
      distance: +camera.position.distanceTo(controls.target).toFixed(3),
      camera: at(camera.position).map((v) => +v.toFixed(3)),
      target: at(controls.target).map((v) => +v.toFixed(3)),
      panning,
      mouseDown,
    };
  };

  return {
    enter(box, spaces = []) {
      bounds = box;
      keepOut = spaces;
      controls.enableZoom = false;
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.minDistance = NEAREST;
      controls.maxDistance = 100;
      controls.maxPolarAngle = Math.PI * 0.9;
      anchorDue = true;
      pending = 0;
    },
    leave() {
      bounds = undefined;
      keepOut = [];
      controls.enableZoom = true;
      controls.minDistance = saved.minDistance;
      controls.maxDistance = saved.maxDistance;
      controls.maxPolarAngle = saved.maxPolarAngle;
      pending = 0;
    },
    forget() {
      anchorDue = true;
      pending = 0;
    },
    hold() {
      anchorDue = true;
      pending = 0;
    },
    walkBy(distance) {
      if (bounds !== undefined) pending += distance;
    },
    panBy() {
      // OrbitControls pans by itself here
    },
    step() {
      if (bounds === undefined) {
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
        confineBoth(bounds);
      }
      controls.update();
      if (panning) confineBoth(bounds);
      else confineSpin(bounds);
      debug();
    },
    attach,
  };
}

/** PROTOTYPE switcher: a pill at the bottom to flip `?cam=` and the anchor. */
export function mountCamSwitcher(doc: Document, cam: string, pivot: Pivot): void {
  const bar = doc.createElement('div');
  bar.setAttribute(
    'style',
    'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:9999;display:flex;gap:6px;' +
      'align-items:center;padding:6px 10px;border-radius:999px;background:#111;color:#ff0;' +
      'font:13px/1 system-ui,sans-serif;box-shadow:0 2px 8px #0008',
  );
  const go = (next: Record<string, string>): void => {
    const params = new URLSearchParams(doc.location.search);
    for (const [k, v] of Object.entries(next)) params.set(k, v);
    doc.location.search = params.toString();
  };
  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.textContent = label;
    b.setAttribute(
      'style',
      'background:#333;color:#ff0;border:0;border-radius:999px;padding:6px 10px;font:inherit',
    );
    b.addEventListener('click', onClick);
    return b;
  };
  const label = doc.createElement('span');
  const shown = pivot === 'auto' ? 'auto' : `${pivot} units`;
  label.textContent = `PROTOTYPE cam=${cam}${cam === 'anchor' ? ` pivot=${shown}` : ''}`;
  bar.append(
    label,
    button(cam === 'anchor' ? 'current' : 'anchor', () =>
      go({ cam: cam === 'anchor' ? 'current' : 'anchor' }),
    ),
  );
  if (cam === 'anchor') {
    const fixed = pivot === 'auto' ? 3 : pivot;
    bar.append(
      button(pivot === 'auto' ? 'fixed' : 'auto', () =>
        go({ pivot: pivot === 'auto' ? '3' : 'auto' }),
      ),
    );
    if (pivot !== 'auto') {
      bar.append(
        button('−', () => go({ pivot: String(Math.max(1, fixed - 1)) })),
        button('+', () => go({ pivot: String(fixed + 1) })),
      );
    }
  }
  doc.body.append(bar);
}
