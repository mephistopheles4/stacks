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
import { type Box, type Vec3, clampInto } from './room-data.ts';
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
/** How far past the room's box a picked surface still counts as the room's. */
const ROOM_MARGIN = 1;
const AUTO_FARTHEST = 60;
const NEAREST = 0.05;
/**
 * How far past the walls a cutaway camera may go, in world units (about 20 m). Inside that it passes
 * through walls freely: they are drawn from the inside only (see `stripOuterFaces`).
 */
const CUTAWAY = 50;
/** A spin comes in toward the anchor no nearer than this (about 60 cm); past it, it turns in place. */
const TURN_IN_PLACE = 1.5;
/** Steps along the line out from the anchor when looking for where the camera can stand. */
const SAMPLES = 48;

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
  /** `?walls=cutaway`: the camera may leave the room, and the one-sided walls it is behind are not drawn. */
  cutaway = false,
): RoomOrbit {
  const saved = {
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    maxPolarAngle: controls.maxPolarAngle,
  };
  let bounds: Box | undefined;
  /** The room's own box, kept apart from `bounds` once a cutaway grows those. */
  let room: Box | undefined;
  let keepOut: readonly Box[] = [];
  /** How far from the anchor the visitor asked to stand: the spin goes back out to it. */
  let wished = 0;
  let anchorDue = true;
  /**
   * A walk, a pinch or a pan has moved the camera since the anchor was set: the next spin places it again
   * on what is at the centre of the screen. A spin alone never moves it.
   */
  let moved = false;
  let pending = 0;
  /** A pan is under way: the camera and the anchor go together and stop at a wall. */
  let panning = false;
  let mouseDown = false;
  const fingers = new Map<number, { x: number; y: number }>();
  let spread: number | undefined;
  const dir = new THREE.Vector3();
  const offset = new THREE.Vector3();
  /** Where the camera stood before this frame's spin. */
  const before = new THREE.Vector3();
  const side = new THREE.Vector3();
  const keys = new Set<string>();
  let lastStep = performance.now();
  let keyTurning = false;
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
    note('anchor');
    if (pivot !== 'auto') return anchorAt(pivot);
    camera.updateMatrixWorld();
    const hit = pickAhead();
    if (room !== undefined) {
      const inside = room;
      // an anchor outside the room swings the camera through a huge arc: anchor on the point of the
      // line of sight nearest the room's centre instead
      dir.subVectors(controls.target, camera.position).normalize();
      const point = (t: number): Vec3 => [
        camera.position.x + dir.x * t,
        camera.position.y + dir.y * t,
        camera.position.z + dir.z * t,
      ];
      // a hit on the floor, a wall or a bookcase backed onto one lands on the box's face or just
      // past it: give the test a margin so a surface of the room still counts as in it
      const inRoom = (p: Vec3): boolean =>
        p.every((v, a) => v >= inside.min[a]! - ROOM_MARGIN && v <= inside.max[a]! + ROOM_MARGIN);
      if (hit === undefined || !inRoom(point(hit))) {
        const centre = new THREE.Vector3(
          (inside.min[0] + inside.max[0]) / 2,
          (inside.min[1] + inside.max[1]) / 2,
          (inside.min[2] + inside.max[2]) / 2,
        );
        const nearest = centre.sub(camera.position).dot(dir);
        note(`anchor off-room ${hit?.toFixed(1) ?? '-'} -> ${nearest.toFixed(1)}`);
        // the room's centre behind the camera says nothing about what is ahead: keep the hit, or
        // fall back, rather than pinning the anchor at the nearest limit (which makes the pan crawl)
        const ahead =
          nearest < AUTO_NEAREST ? (hit ?? AUTO_FALLBACK) : Math.min(nearest, hit ?? Infinity);
        return anchorAt(Math.max(AUTO_NEAREST, Math.min(ahead, AUTO_FARTHEST)));
      }
    }
    anchorAt(hit === undefined || hit < AUTO_NEAREST || hit > AUTO_FARTHEST ? AUTO_FALLBACK : hit);
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

  /** A pan or a walk: the camera back in the room, and the anchor moved by the same amount. */
  const confineBoth = (box: Box): void => {
    const was = at(camera.position);
    const fixed = placeable(box, was);
    camera.position.set(...fixed);
    controls.target.x += fixed[0] - was[0];
    controls.target.y += fixed[1] - was[1];
    controls.target.z += fixed[2] - was[2];
  };

  const free = (box: Box, p: Vec3): boolean =>
    p.every((v, a) => v >= box.min[a]! && v <= box.max[a]!) &&
    !keepOut.some((s) => p.every((v, a) => v > s.min[a]! && v < s.max[a]!));

  /**
   * A spin. The anchor stays and the camera stands `wished` from it, or as near as the room and the
   * bookcase allow along the line to the anchor. Nearer than `TURN_IN_PLACE`, it stops coming in: the
   * camera stays where it stood and the rest of the drag turns the view about it, so a wall never holds
   * a drag still.
   */
  const confineSpin = (box: Box): void => {
    const target = at(controls.target);
    offset.subVectors(camera.position, controls.target).normalize();
    const along = (t: number): Vec3 => [
      target[0] + offset.x * wished * t,
      target[1] + offset.y * wished * t,
      target[2] + offset.z * wished * t,
    ];
    // the farthest place on the line out from the anchor that is free; a cutaway is held at its outer
    // limit by sliding along it, never by being pulled in toward the anchor
    const open = cutaway
      ? {
          min: [-Infinity, -Infinity, -Infinity] as const,
          max: [Infinity, Infinity, Infinity] as const,
        }
      : box;
    let reach = 0;
    for (let i = SAMPLES; i >= 1; i -= 1) {
      if (free(open, along(i / SAMPLES))) {
        reach = i / SAMPLES;
        break;
      }
    }
    if (reach * wished >= TURN_IN_PLACE) {
      camera.position.set(...(cutaway ? clampInto(box, along(reach)) : along(reach)));
      return;
    }
    // turn in place: the camera back where it stood, looking the way the drag turned it
    camera.position.copy(before);
    controls.target.copy(before).addScaledVector(offset, -wished);
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
        note(`down ${pointerId} (${fingers.size + 1})`);
        fingers.set(pointerId, { x: clientX, y: clientY });
        spread = readSpread();
        panning = fingers.size >= 2;
        if (panning) moved = true;
        if (fingers.size === 1 && bounds !== undefined && moved) {
          reanchor();
          moved = false;
        }
        return;
      }
      mouseDown = true;
      panning = button === 2 || shiftKey || ctrlKey || metaKey;
      if (panning) moved = true;
      else if (bounds !== undefined && moved) {
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
      const now = readSpread();
      if (bounds !== undefined && now !== undefined && spread !== undefined) {
        if (Math.abs(now - spread) > 20) note(`pinch ${(now - spread).toFixed(0)}px`);
        walkBy((now - spread) * WALK_PER_PINCH_PIXEL);
        confineBoth(bounds);
      }
      spread = now;
    };
    const onUp = (event: Event): void => {
      const { pointerId, pointerType } = event as PointerEvent;
      if (pointerType === 'touch') {
        note(`${event.type === 'pointercancel' ? 'cancel' : 'up'} ${pointerId}`);
        fingers.delete(pointerId);
        spread = readSpread();
        // a pan's momentum plays out as a pan; the next touch decides again
        if (fingers.size === 0) return;
      } else {
        mouseDown = false;
      }
    };
    // WASD walks and strafes, Q and E orbit the anchor; on the window, since the canvas rarely has focus
    const typing = (event: Event): boolean => {
      const el = event.target as HTMLElement | null;
      return el !== null && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const onKeyDown = (event: Event): void => {
      const { code, ctrlKey, metaKey, altKey } = event as KeyboardEvent;
      if (typing(event) || ctrlKey || metaKey || altKey || !KEYS.has(code)) return;
      // Space would otherwise scroll the page
      if (code === 'Space') event.preventDefault();
      keys.add(code);
    };
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

  const trail: string[] = [];
  const note = (line: string): void => {
    trail.push(line);
    if (trail.length > 14) trail.shift();
  };
  let lastCamera = new THREE.Vector3();
  const debug = (): void => {
    const jump = camera.position.distanceTo(lastCamera);
    if (jump > 2) note(`jump ${jump.toFixed(2)} f=${fingers.size} pan=${panning}`);
    lastCamera = camera.position.clone();
    const el = typeof document === 'undefined' ? null : document.getElementById('anchor-debug');
    if (el !== null)
      el.textContent = [
        `d=${camera.position.distanceTo(controls.target).toFixed(2)} w=${wished.toFixed(2)} f=${fingers.size} pan=${panning}`,
        ...trail,
      ].join('\n');
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
      // past the walls, the ceiling and the floor by CUTAWAY units
      room = box;
      bounds = cutaway
        ? {
            min: [box.min[0] - CUTAWAY, box.min[1] - CUTAWAY, box.min[2] - CUTAWAY],
            max: [box.max[0] + CUTAWAY, box.max[1] + CUTAWAY, box.max[2] + CUTAWAY],
          }
        : box;
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
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastStep) / 1000);
      lastStep = now;
      const axis = (plus: string, minus: string): number =>
        (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);
      const forward = axis('KeyW', 'KeyS');
      const right = axis('KeyD', 'KeyA');
      const turn = axis('KeyQ', 'KeyE');
      const rise = axis('Space', 'KeyC');
      const speed =
        KEY_WALK * dt * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? KEY_SPRINT : 1);
      // a key turn is a spin: it picks a new anchor when it starts after a move, as a drag does, and
      // keeps that anchor while it lasts, so walking and turning together orbit as they go
      if (turn !== 0 && !keyTurning && moved) {
        reanchor();
        moved = false;
      }
      keyTurning = turn !== 0;
      if (forward !== 0) {
        walkBy(forward * speed);
        confineBoth(bounds);
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
        confineBoth(bounds);
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
      controls.update();
      if (panning) confineBoth(bounds);
      else confineSpin(bounds);
      debug();
    },
    attach,
  };
}

/** PROTOTYPE switcher: a pill at the bottom to flip `?cam=` and the anchor. */
export function readCutaway(search: string): boolean {
  return new URLSearchParams(search).get('walls') === 'cutaway';
}

export function mountCamSwitcher(doc: Document, cam: string, pivot: Pivot, cutaway = false): void {
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
    bar.append(
      button(cutaway ? 'walls: cut' : 'walls: solid', () =>
        go({ walls: cutaway ? 'solid' : 'cutaway' }),
      ),
    );
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
  const box = doc.createElement('pre');
  box.id = 'anchor-debug';
  box.setAttribute(
    'style',
    'position:fixed;left:8px;top:90px;z-index:9999;margin:0;padding:4px 6px;background:#000a;color:#0f0;' +
      'font:11px/1.25 monospace;pointer-events:none;white-space:pre',
  );
  doc.body.append(box);
}

/**
 * PROTOTYPE cutaway: drops the faces of the room's walls, panelling, trim and ceiling that point out of
 * the room, so every wall is drawn from the inside only and a camera outside sees through the ones
 * between it and the room. The wallpaper and the ceiling's underside are already one-sided; the
 * panelling and the trim are built with thickness. Returns how many triangles were dropped.
 */
export function stripOuterFaces(root: THREE.Object3D, box: Box): number {
  root.updateMatrixWorld(true);
  const centre = new THREE.Vector3(
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  );
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const mid = new THREE.Vector3();
  let dropped = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (!/^room_(shell|walls|ceiling|wallpaper|floor$)/.test(mesh.parent?.name ?? mesh.name))
      return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const count = geometry.index === null ? position.count : geometry.index.count;
    const vertex = (i: number): number => (geometry.index === null ? i : geometry.index.getX(i));
    const kept: number[] = [];
    for (let i = 0; i < count; i += 3) {
      const [i0, i1, i2] = [vertex(i), vertex(i + 1), vertex(i + 2)];
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      mid.copy(a).add(b).add(c).divideScalar(3).sub(centre);
      // a wall's face points out when it points away from the room's centre, on its own axis
      const outward = Math.abs(n.y) > 0.5 ? n.y * mid.y > 0 : n.x * mid.x + n.z * mid.z > 0;
      if (outward) dropped += 1;
      else kept.push(i0, i1, i2);
    }
    const stripped = geometry.clone();
    stripped.setIndex(kept);
    mesh.geometry = stripped;
  });
  return dropped;
}
