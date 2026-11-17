import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';
import type { Box } from './room-data.ts';
import { createRoomOrbit } from './room-orbit.ts';
import { WALK_PER_NOTCH, WALK_PER_PINCH_PIXEL } from './room-walk.ts';

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
        ...at,
        pageX: at.clientX,
        pageY: at.clientY,
        button: 0,
        preventDefault: () => {
          prevented = true;
        },
      };
      for (const handler of listeners.get(type) ?? []) handler(full);
      return { prevented };
    },
  };
}

function room(camera: [number, number, number], target: [number, number, number]) {
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
  orbit.enter(box);
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
    const radius = start.distanceTo(r.controls.target);
    const { prevented } = r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.frames(80);
    expect(prevented).toBe(true);
    expect(r.view.position.distanceTo(start)).toBeCloseTo(WALK_PER_NOTCH, 6);
    // a walk, not a dolly: the target went with the camera
    expect(r.view.position.distanceTo(r.controls.target)).toBeCloseTo(radius, 6);
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
    expect(r.view.position.distanceTo(r.controls.target)).toBeCloseTo(3, 5);
  });

  it('walks back out the way it came', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const start = r.view.position.clone();
    r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.send('wheel', { deltaY: 100, deltaMode: 0 });
    r.frames(80);
    expect(r.view.position.distanceTo(start)).toBeCloseTo(0, 6);
  });

  it('stops at the face of the box, and goes no farther however long the wheel turns', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    for (let i = 0; i < 80; i += 1) {
      r.send('wheel', { deltaY: -300, deltaMode: 0 });
      r.frames(10);
    }
    r.frames(80);
    expect(r.view.position.z).toBeGreaterThanOrEqual(-0.2 - 1e-6);
    expect(r.view.position.z).toBeLessThan(0.1);
  });

  it('walks to a pinch, forward as the fingers spread', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(2);
    const start = r.controls.target.clone();
    const touch = { pointerType: 'touch' };
    r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
    r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
    r.send('pointermove', { ...touch, pointerId: 2, clientX: 600, clientY: 400 });
    r.frames(80);
    // the target is the walk's own, and the drag's turn about it does not move it; the fingers' own
    // midpoint turns the view a little as they spread, so the line it walks along bends a little
    expect(start.distanceTo(r.controls.target)).toBeCloseTo(100 * WALK_PER_PINCH_PIXEL, 1);
    expect(r.controls.target.z).toBeLessThan(start.z);
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
    r.orbit.leave();
    expect(r.controls.enableZoom).toBe(true);
    const start = r.view.position.clone();
    r.send('wheel', { deltaY: -100, deltaMode: 0 });
    r.frames(10);
    // OrbitControls' own dolly took it: the camera came toward the target by its share
    expect(r.view.position.distanceTo(start)).toBeGreaterThan(0.1);
  });
});
