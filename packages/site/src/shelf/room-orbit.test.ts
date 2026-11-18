import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';
import { type Box, bookcaseBox, contains } from './room-data.ts';
import { createRoomOrbit } from './room-orbit.ts';
import { GESTURE_SLOP } from './room-gesture.ts';
import {
  BOOKCASE_STANDOFF,
  PAN_PER_PIXEL,
  WALK_PER_NOTCH,
  WALK_PER_PINCH_PIXEL,
} from './room-walk.ts';

const box: Box = { min: [-7.4, 0.5, -0.2], max: [9.4, 10.5, 12.452] };

type Handler = (event: unknown) => void;

/** The part of a canvas `OrbitControls` and the walk listen on: events go to every listener, as a browser sends them. */
function fakeCanvas(): {
  element: HTMLElement;
  send: (type: string, event: Record<string, unknown>) => { prevented: boolean };
} {
  const listeners = new Map<string, Handler[]>();
  const target = {
    addEventListener(type: string, handler: Handler): void {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type: string, handler: Handler): void {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((h) => h !== handler),
      );
    },
  };
  const element = {
    ...target,
    style: {},
    clientWidth: 1280,
    clientHeight: 800,
    ownerDocument: target,
    getRootNode: () => target,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLElement;
  return {
    element,
    send(type, event) {
      let prevented = false;
      const at = { clientX: 640, clientY: 400, ...event };
      const full = {
        button: 0,
        ...at,
        pageX: at.clientX,
        pageY: at.clientY,
        preventDefault: () => {
          prevented = true;
        },
      };
      for (const handler of listeners.get(type) ?? []) handler(full);
      return { prevented };
    },
  };
}

function room(
  camera: [number, number, number],
  target: [number, number, number],
  keepOut: readonly Box[] = [],
) {
  const canvas = fakeCanvas();
  const view = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
  view.position.set(...camera);
  const controls = new OrbitControls(view, canvas.element);
  controls.enableDamping = true;
  controls.minDistance = 1.5;
  controls.maxDistance = 30;
  controls.target.set(...target);
  controls.update();
  const orbit = createRoomOrbit(view, controls);
  orbit.enter(box, keepOut);
  orbit.attach(canvas.element);
  const frames = (n: number): void => {
    for (let i = 0; i < n; i += 1) orbit.step();
  };
  return { ...canvas, view, controls, orbit, frames };
}

describe('the camera in a room (#620, #626)', () => {
  it('walks when the wheel turns: the scroll moves the camera, which the dolly did not', () => {
    const r = room([-3.9, 3.8, 11], [2.334, 1.504, 1.335]);
    r.frames(2);
    const start = r.view.position.clone();
    const sight = r.controls.target.clone().sub(start).normalize();
    const { prevented } = r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.frames(80);
    expect(prevented).toBe(true);
    expect(r.view.position.distanceTo(start)).toBeCloseTo(WALK_PER_NOTCH, 6);
    // a walk, not a dolly: the camera still looks the way it did, and the target is just ahead of it
    const now = r.controls.target.clone().sub(r.view.position);
    expect(now.length()).toBeCloseTo(r.controls.minDistance, 6);
    expect(now.normalize().dot(sight)).toBeCloseTo(1, 9);
  });

  it('turns the view about a pivot just ahead once it has walked, and swings the camera before', () => {
    const drag = (r: ReturnType<typeof room>): void => {
      const mouse = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1 };
      r.send('pointerdown', { ...mouse, clientX: 640, clientY: 400 });
      r.send('pointermove', { ...mouse, clientX: 790, clientY: 400 });
      r.send('pointerup', { ...mouse, clientX: 790, clientY: 400, buttons: 0 });
      r.frames(120);
    };
    const before = room([1, 5, 12], [1, 5, 1]);
    before.frames(2);
    const stood = before.view.position.clone();
    drag(before);
    // the opening view's far target: a 150 px drag sweeps the camera across the room
    expect(before.view.position.distanceTo(stood)).toBeGreaterThan(8);

    const after = room([1, 5, 12], [1, 5, 1]);
    after.frames(2);
    for (let i = 0; i < 10; i += 1) {
      after.send('wheel', { deltaY: -100, deltaMode: 0 });
      after.frames(40);
    }
    const walked = after.view.position.clone();
    const sight = after.controls.target.clone().sub(walked).normalize();
    drag(after);
    // after a walk it turns the view where the visitor stands, and the camera stays there
    expect(after.view.position.distanceTo(walked)).toBeLessThan(1e-6);
    const turned = after.controls.target.clone().sub(walked).normalize();
    expect(Math.acos(Math.min(1, sight.dot(turned)))).toBeGreaterThan(1);
  });

  it('keeps turning the view after the walk has stopped at a face (#620’s done-when)', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    for (let i = 0; i < 80; i += 1) {
      r.send('wheel', { deltaY: -300, deltaMode: 0 });
      r.frames(10);
    }
    r.frames(80);
    const atFace = r.view.position.clone();
    const sight = r.controls.target.clone().sub(atFace).normalize();
    const mouse = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1 };
    r.send('pointerdown', { ...mouse, clientX: 640, clientY: 400 });
    r.send('pointermove', { ...mouse, clientX: 790, clientY: 400 });
    r.send('pointerup', { ...mouse, clientX: 790, clientY: 400, buttons: 0 });
    r.frames(120);
    const turned = r.controls.target.clone().sub(r.view.position).normalize();
    // the same 150 px turns it as far as it does anywhere in the room: 2π · 150 / 800 ≈ 67°
    expect(Math.acos(sight.dot(turned))).toBeGreaterThan(1);
    expect(r.view.position.distanceTo(atFace)).toBeLessThan(1e-6);
  });

  it('walks the same step with the target near or far', () => {
    for (const reach of [2, 5, 9]) {
      const r = room([1, 5, 10], [1, 5, 10 - reach]);
      r.frames(2);
      const start = r.view.position.clone();
      r.send('wheel', { deltaY: -100, deltaMode: 0 });
      r.frames(80);
      expect(r.view.position.distanceTo(start)).toBeCloseTo(WALK_PER_NOTCH, 6);
    }
  });

  it('walks on past the page’s nearest distance, ten notches ten steps', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const start = r.view.position.clone();
    for (let i = 0; i < 10; i += 1) {
      r.send('wheel', { deltaY: -100, deltaMode: 0 });
      r.frames(40);
    }
    expect(r.view.position.distanceTo(start)).toBeCloseTo(10 * WALK_PER_NOTCH, 5);
    expect(r.view.position.distanceTo(r.controls.target)).toBeCloseTo(r.controls.minDistance, 5);
  });

  it('walks back out the way it came', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const start = r.view.position.clone();
    r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.frames(80);
    expect(r.view.position.distanceTo(start)).toBeCloseTo(WALK_PER_NOTCH, 6);
    r.send('wheel', { deltaY: 100, deltaMode: 0 });
    r.frames(80);
    expect(r.view.position.distanceTo(start)).toBeCloseTo(0, 6);
  });

  it('stops at the face of the box, and walks back from it at once', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    for (let i = 0; i < 80; i += 1) {
      r.send('wheel', { deltaY: -300, deltaMode: 0 });
      r.frames(10);
    }
    r.frames(80);
    expect(r.view.position.z).toBeGreaterThanOrEqual(-0.2 - 1e-6);
    expect(r.view.position.z).toBeLessThan(0.1);
    // what was queued against the face was dropped, so one notch back is one step back
    const atFace = r.view.position.clone();
    r.send('wheel', { deltaY: 100, deltaMode: 0 });
    r.frames(80);
    expect(r.view.position.distanceTo(atFace)).toBeCloseTo(WALK_PER_NOTCH, 6);
  });

  it('never walks into the main bookcase, however many notches, and leaves it by walking back', () => {
    const slot = {
      position: [0, 0, 0] as [number, number, number],
      rotationY: 0,
      extras: { caster_width: 3.58, caster_depth: 0.72 },
    };
    const space = bookcaseBox(slot, 4.48, BOOKCASE_STANDOFF);
    const r = room([0.3, 3, 6], [0.3, 3, 3], space === undefined ? [] : [space]);
    r.frames(2);
    for (let i = 0; i < 80; i += 1) {
      r.send('wheel', { deltaY: -300, deltaMode: 0 });
      r.frames(10);
    }
    r.frames(80);
    // the front plane of the case is z 0.36; the walk stops its standoff short of it
    expect(r.view.position.z).toBeGreaterThanOrEqual(0.36 + BOOKCASE_STANDOFF - 1e-6);
    expect(r.view.position.z).toBeLessThan(0.36 + BOOKCASE_STANDOFF + 0.01);
    const atFront = r.view.position.clone();
    r.send('wheel', { deltaY: 100, deltaMode: 0 });
    r.frames(80);
    expect(r.view.position.distanceTo(atFront)).toBeCloseTo(WALK_PER_NOTCH, 6);
  });

  it('brings a camera a pointer handler swung out of the box back in before its first walk step', () => {
    const r = room([1, 5, 12], [1, 5, 1]);
    r.frames(2);
    const mouse = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1 };
    r.send('pointerdown', { ...mouse, clientX: 100, clientY: 400 });
    // OrbitControls runs update() inside each handler, so these turn the camera with no frame between
    for (let i = 1; i <= 10; i += 1) {
      r.send('pointermove', { ...mouse, clientX: 100 + i * 100, clientY: 400 });
    }
    const swung = r.view.position;
    expect(contains(box, [swung.x, swung.y, swung.z])).toBe(false);
    r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.frames(1);
    const stood = r.view.position;
    expect(contains(box, [stood.x, stood.y, stood.z])).toBe(true);
  });

  it('comes in toward a close wall along the line, and goes back out as the view turns away', () => {
    const r = room([1, 5, 12], [1, 5, 1]);
    r.frames(2);
    const start = r.view.position.clone();
    const drag = (dx: number): void => {
      const mouse = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1 };
      r.send('pointerdown', { ...mouse, clientX: 640, clientY: 400 });
      r.send('pointermove', { ...mouse, clientX: 640 + dx, clientY: 400 });
      r.send('pointerup', { ...mouse, clientX: 640 + dx, clientY: 400, buttons: 0 });
      r.frames(120);
    };
    drag(150);
    // the view turned as far as the pointer went (2π · 150 / 800), the camera 11 from the target would
    // be outside the box, so it is on that line and nearer
    const out = r.view.position.clone().sub(r.controls.target);
    expect(Math.atan2(out.x, out.z)).toBeCloseTo((-2 * Math.PI * 150) / 800, 2);
    expect(out.length()).toBeLessThan(10);
    drag(-150);
    expect(r.view.position.distanceTo(start)).toBeLessThan(0.05);
  });

  it('walks to a pinch, forward as the fingers spread', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const touch = { pointerType: 'touch' };
    r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
    r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
    r.send('pointermove', { ...touch, pointerId: 2, clientX: 600, clientY: 400 });
    r.frames(80);
    // The pivot is the walk's own: it stands `minDistance` ahead of where the walk took the camera,
    // from z 8 forward by the spread.
    expect(r.view.position.z).toBeCloseTo(8 - 100 * WALK_PER_PINCH_PIXEL, 6);
    expect(r.controls.target.z).toBeCloseTo(
      8 - 100 * WALK_PER_PINCH_PIXEL - r.controls.minDistance,
      6,
    );
    // a pinch walks and does not pan, and does not turn the view either
    expect(r.view.position.x).toBeCloseTo(1, 9);
    expect(r.view.position.y).toBeCloseTo(5, 9);
    expect(r.controls.target.x).toBeCloseTo(1, 9);
  });

  describe('two fingers moving together pan (#632)', () => {
    /** Both fingers go `dx`, `dy` in `steps` frames, as two fingers on a glass do; they stay down. */
    const drag = (r: ReturnType<typeof room>, dx: number, dy: number, steps = 10): void => {
      const touch = { pointerType: 'touch' };
      r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
      for (let i = 1; i <= steps; i += 1) {
        const [x, y] = [(dx * i) / steps, (dy * i) / steps];
        r.send('pointermove', { ...touch, pointerId: 1, clientX: 400 + x, clientY: 400 + y });
        r.send('pointermove', { ...touch, pointerId: 2, clientX: 500 + x, clientY: 400 + y });
        r.frames(1);
      }
      r.frames(80);
    };

    it('pans the camera and its target together, the way the fingers drag the room', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      drag(r, 100, 50);
      // the room follows the fingers: right and down on the glass is the camera left and up
      expect(r.view.position.x).toBeCloseTo(1 - 100 * PAN_PER_PIXEL, 6);
      expect(r.view.position.y).toBeCloseTo(5 + 50 * PAN_PER_PIXEL, 6);
      // it did not walk, and the view did not turn: the target is straight ahead of the camera
      expect(r.view.position.z).toBeCloseTo(8, 9);
      expect(r.controls.target.x).toBeCloseTo(r.view.position.x, 6);
      expect(r.controls.target.y).toBeCloseTo(r.view.position.y, 6);
      expect(r.controls.target.z).toBeLessThan(r.view.position.z);
    });

    it('leaves a finger at rest alone: a drift under the slop moves nothing', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const start = r.view.position.clone();
      const target = r.controls.target.clone();
      drag(r, GESTURE_SLOP - 2, 0, 4);
      expect(r.view.position.distanceTo(start)).toBeCloseTo(0, 9);
      expect(r.controls.target.distanceTo(target)).toBeCloseTo(0, 9);
    });

    it('does not walk when the fingers drift apart a little as they pan', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const touch = { pointerType: 'touch' };
      r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
      for (let i = 1; i <= 10; i += 1) {
        // the second finger goes a little faster: the spread grows 3 px a step, the midpoint goes 11.5
        r.send('pointermove', { ...touch, pointerId: 1, clientX: 400 + i * 10, clientY: 400 });
        r.send('pointermove', { ...touch, pointerId: 2, clientX: 500 + i * 13, clientY: 400 });
        r.frames(1);
      }
      r.frames(80);
      expect(r.view.position.z).toBeCloseTo(8, 9);
      expect(r.view.position.x).toBeCloseTo(1 - 115 * PAN_PER_PIXEL, 6);
    });

    it('never takes the camera out of the room', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      drag(r, -3000, -3000, 60);
      const { x, y, z } = r.view.position;
      expect(contains(box, [x, y, z])).toBe(true);
      expect(x).toBeCloseTo(box.max[0], 6);
      expect(y).toBeCloseTo(box.min[1], 6);
    });

    it('never takes the camera into the main bookcase', () => {
      const slot = {
        position: [0, 0, 0] as [number, number, number],
        rotationY: 0,
        extras: { caster_width: 3.58, caster_depth: 0.72 },
      };
      const space = bookcaseBox(slot, 4.48, BOOKCASE_STANDOFF);
      const r = room([-6, 3, 0.4], [-6, 3, -2.6], space === undefined ? [] : [space]);
      r.frames(2);
      drag(r, -1000, 0, 40);
      // it went as far as the case's side and no further, with the standoff to spare
      expect(r.view.position.x).toBeCloseTo(-1.79 - BOOKCASE_STANDOFF, 3);
    });

    /** The direction the camera looks, as a unit vector. */
    const sightOf = (r: ReturnType<typeof room>): THREE.Vector3 =>
      r.controls.target.clone().sub(r.view.position).normalize();
    const turnedBy = (a: THREE.Vector3, b: THREE.Vector3): number =>
      Math.acos(Math.min(1, a.dot(b)));

    it('turns the view with the finger left after one of two lifts', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const touch = { pointerType: 'touch' };
      r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
      r.frames(1);
      r.send('pointerup', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
      const sight = sightOf(r);
      for (let i = 1; i <= 15; i += 1) {
        r.send('pointermove', { ...touch, pointerId: 2, clientX: 500 + i * 10, clientY: 400 });
      }
      r.frames(80);
      // one finger turns the view as it always did: the same 150 px turns it as far as a mouse's
      expect(turnedBy(sight, sightOf(r))).toBeGreaterThan(1);
    });

    it('turns the view again with one finger once two have lifted', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      drag(r, 60, 0);
      const touch = { pointerType: 'touch' };
      r.send('pointerup', { ...touch, pointerId: 1, clientX: 460, clientY: 400 });
      r.send('pointerup', { ...touch, pointerId: 2, clientX: 560, clientY: 400 });
      const sight = sightOf(r);
      r.send('pointerdown', { ...touch, pointerId: 3, clientX: 400, clientY: 400 });
      for (let i = 1; i <= 15; i += 1) {
        r.send('pointermove', { ...touch, pointerId: 3, clientX: 400 + i * 10, clientY: 400 });
      }
      r.frames(80);
      expect(turnedBy(sight, sightOf(r))).toBeGreaterThan(1);
    });

    it('keeps what the fingers moved since the last frame when one lifts before the next', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const touch = { pointerType: 'touch' };
      r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
      r.send('pointermove', { ...touch, pointerId: 1, clientX: 420, clientY: 400 });
      r.send('pointermove', { ...touch, pointerId: 2, clientX: 520, clientY: 400 });
      // a short pan, released with no frame between: it is still a pan of 20 px
      r.send('pointerup', { ...touch, pointerId: 1, clientX: 420, clientY: 400 });
      r.frames(80);
      expect(r.view.position.x).toBeCloseTo(1 - 20 * PAN_PER_PIXEL, 6);
    });

    it('drops what the fingers moved when the touch is cancelled', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const touch = { pointerType: 'touch' };
      r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
      r.send('pointermove', { ...touch, pointerId: 1, clientX: 420, clientY: 400 });
      r.send('pointermove', { ...touch, pointerId: 2, clientX: 520, clientY: 400 });
      r.send('pointercancel', { ...touch, pointerId: 1, clientX: 420, clientY: 400 });
      r.frames(80);
      expect(r.view.position.x).toBeCloseTo(1, 9);
    });

    it('lets a pinch walk after the pan ends', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      drag(r, 60, 0);
      const panned = r.view.position.clone();
      const touch = { pointerType: 'touch' };
      r.send('pointerup', { ...touch, pointerId: 1, clientX: 460, clientY: 400 });
      r.send('pointerup', { ...touch, pointerId: 2, clientX: 560, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 3, clientX: 400, clientY: 400 });
      r.send('pointerdown', { ...touch, pointerId: 4, clientX: 500, clientY: 400 });
      r.send('pointermove', { ...touch, pointerId: 4, clientX: 600, clientY: 400 });
      r.frames(80);
      expect(r.view.position.z).toBeCloseTo(panned.z - 100 * WALK_PER_PINCH_PIXEL, 6);
      expect(r.view.position.x).toBeCloseTo(panned.x, 6);
    });
  });

  describe('a mouse pans too (#632)', () => {
    it('pans on a right-button drag', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const mouse = { pointerType: 'mouse', pointerId: 1, button: 2, buttons: 2 };
      r.send('pointerdown', { ...mouse, clientX: 640, clientY: 400 });
      r.send('pointermove', { ...mouse, clientX: 740, clientY: 400 });
      r.send('pointerup', { ...mouse, clientX: 740, clientY: 400, buttons: 0 });
      r.frames(80);
      expect(r.view.position.x).toBeCloseTo(1 - 100 * PAN_PER_PIXEL, 6);
      expect(r.view.position.z).toBeCloseTo(8, 9);
    });

    it('pans on a shift-drag', () => {
      const r = room([1, 5, 8], [1, 5, 5]);
      r.frames(2);
      const mouse = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1 };
      r.send('pointerdown', { ...mouse, shiftKey: true, clientX: 640, clientY: 400 });
      r.send('pointermove', { ...mouse, shiftKey: true, clientX: 640, clientY: 300 });
      r.send('pointerup', { ...mouse, shiftKey: true, clientX: 640, clientY: 300, buttons: 0 });
      r.frames(80);
      // the room follows the pointer: up on the glass is the camera down
      expect(r.view.position.y).toBeCloseTo(5 - 100 * PAN_PER_PIXEL, 6);
      expect(r.view.position.x).toBeCloseTo(1, 9);
    });
  });

  it('leaves a single finger to the drag: it turns the view and walks nowhere', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const start = r.view.position.clone();
    const target = r.controls.target.clone();
    r.send('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 400, clientY: 400 });
    r.send('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 600, clientY: 400 });
    r.frames(40);
    expect(r.view.position.distanceTo(start)).toBeGreaterThan(0.1);
    expect(r.controls.target.distanceTo(target)).toBeCloseTo(0, 9);
    expect(r.view.position.distanceTo(target)).toBeCloseTo(3, 6);
  });

  it('forgets a queued walk when a held book takes the camera', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const start = r.view.position.clone();
    r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.orbit.hold();
    r.frames(80);
    expect(r.view.position.distanceTo(start)).toBeCloseTo(0, 6);
  });

  it('lets the dolly back in when the room is taken down', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    expect(r.controls.enableZoom).toBe(false);
    expect(r.controls.enablePan).toBe(false);
    r.orbit.leave();
    expect(r.controls.enableZoom).toBe(true);
    expect(r.controls.enablePan).toBe(true);
    const start = r.view.position.clone();
    r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.frames(10);
    // OrbitControls' own dolly took it: the camera came toward the target by its share
    expect(r.view.position.distanceTo(start)).toBeGreaterThan(0.1);
  });
});
