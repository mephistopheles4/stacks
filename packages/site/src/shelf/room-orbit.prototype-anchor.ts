/**
 * PROTOTYPE (#637) — throwaway, on `prototype/637-anchor-camera`, never merged.
 *
 * Question: does the room feel better on a phone with `OrbitControls` as it ships than with the
 * custom gesture layer in `room-orbit.ts`? Chosen with `?cam=anchor`; `?pivot=<metres>` sets the
 * pivot's distance (default 1).
 *
 * - Rotate, pan (two fingers, right-drag, shift/ctrl-drag) and damping are `OrbitControls`' own, in
 *   its own direction: the content follows the finger.
 * - The target is held `pivot` ahead (`minDistance = maxDistance`), so pan runs at one speed at any
 *   depth and nothing slows when you are close to something.
 * - Scroll and pinch move the camera and the target forward together: the pinch 1:1, the wheel eased.
 * - A camera past a wall or inside the bookcase is put back, and the pivot goes with it.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Box, type Vec3, clampInto } from './room-data.ts';
import { WALK_PER_NOTCH, WALK_PER_PINCH_PIXEL, notchesOf } from './room-walk.ts';
import type { RoomOrbit } from './room-orbit.ts';

type Listening = Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;

const EASE = 0.25;
const REST = 0.005;

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

export function readPivot(search: string): number {
  const raw = Number(new URLSearchParams(search).get('pivot'));
  return Number.isFinite(raw) && raw > 0.1 && raw < 10 ? raw : 1;
}

export function createAnchorOrbit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  pivot: number,
): RoomOrbit {
  const saved = {
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    maxPolarAngle: controls.maxPolarAngle,
  };
  let bounds: Box | undefined;
  let keepOut: readonly Box[] = [];
  /** Set when the target must be put `pivot` ahead along the view again (enter, reframe, after a hold). */
  let anchorDue = true;
  let pending = 0;
  const fingers = new Map<number, { x: number; y: number }>();
  let spread: number | undefined;
  const dir = new THREE.Vector3();

  const reanchor = (): void => {
    // the line to the target framing set, not the camera's orientation, which `update` has not aimed yet
    dir.subVectors(controls.target, camera.position);
    if (dir.lengthSq() < 1e-12) camera.getWorldDirection(dir);
    dir.normalize();
    controls.target.copy(camera.position).addScaledVector(dir, pivot);
    anchorDue = false;
  };

  /** Camera and target forward together along the view. */
  const walkBy = (distance: number): void => {
    dir.subVectors(controls.target, camera.position).normalize();
    camera.position.addScaledVector(dir, distance);
    controls.target.addScaledVector(dir, distance);
  };

  /** The camera back inside the room and out of the bookcase, the pivot moved by the same amount. */
  const confine = (box: Box): void => {
    const at: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    let fixed = clampInto(box, at);
    for (const space of keepOut) fixed = pushOut(space, fixed);
    const dx = fixed[0] - at[0];
    const dy = fixed[1] - at[1];
    const dz = fixed[2] - at[2];
    if (dx === 0 && dy === 0 && dz === 0) return;
    camera.position.set(...fixed);
    controls.target.x += dx;
    controls.target.y += dy;
    controls.target.z += dz;
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
      const { pointerId, pointerType, clientX, clientY } = event as PointerEvent;
      if (pointerType !== 'touch') return;
      fingers.set(pointerId, { x: clientX, y: clientY });
      spread = readSpread();
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
        confine(bounds);
      }
      spread = now;
    };
    const onUp = (event: Event): void => {
      fingers.delete((event as PointerEvent).pointerId);
      spread = readSpread();
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

  return {
    enter(box, spaces = []) {
      bounds = box;
      keepOut = spaces;
      controls.enableZoom = false;
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.minDistance = pivot;
      controls.maxDistance = pivot;
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
      if (anchorDue) reanchor();
      if (pending !== 0) {
        const part = Math.abs(pending) < REST ? pending : pending * EASE;
        walkBy(part);
        pending -= part;
        if (Math.abs(pending) < 1e-6) pending = 0;
      }
      controls.update();
      confine(bounds);
    },
    attach,
  };
}

/** PROTOTYPE switcher: a pill at the bottom to flip `?cam=` and step `?pivot=`. */
export function mountCamSwitcher(doc: Document, cam: string, pivot: number): void {
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
  label.textContent = `PROTOTYPE cam=${cam}${cam === 'anchor' ? ` pivot=${pivot}m` : ''}`;
  bar.append(
    label,
    button(cam === 'anchor' ? 'current' : 'anchor', () =>
      go({ cam: cam === 'anchor' ? 'current' : 'anchor' }),
    ),
  );
  if (cam === 'anchor') {
    bar.append(
      button('−', () => go({ pivot: String(Math.max(0.25, pivot - 0.25)) })),
      button('+', () => go({ pivot: String(pivot + 0.25) })),
    );
  }
  doc.body.append(bar);
}
