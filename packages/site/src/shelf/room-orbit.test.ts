import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOV } from './framing.ts';
import { type Box, frameRoom } from './room-data.ts';
import { createRoomOrbit } from './room-orbit.ts';

const box: Box = { min: [-7.4, 0.5, -0.2], max: [9.4, 10.5, 12.452] };
/** How far past the box the camera may go (spec S5.8). */
const OUT = 50;

type Handler = (event: unknown) => void;

/** The part of a canvas `OrbitControls` and the walk listen on: events go to every listener, as a browser sends them. */
function fakeTarget(): {
  target: Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;
  send: (type: string, event: Record<string, unknown>) => { prevented: boolean };
} {
  const listeners = new Map<string, Handler[]>();
  return {
    target: {
      addEventListener(type: string, handler: Handler): void {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      removeEventListener(type: string, handler: Handler): void {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((h) => h !== handler),
        );
      },
    },
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

function fakeCanvas(): { element: HTMLElement; send: ReturnType<typeof fakeTarget>['send'] } {
  const { target, send } = fakeTarget();
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
  return { element, send };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Options {
  keepOut?: readonly Box[];
  /** What the centre pick finds ahead. */
  hit?: number | undefined;
  /** Set up `controls` as the page leaves it before the room is entered. */
  before?: (controls: OrbitControls) => void;
}

function room(
  camera: [number, number, number],
  target: [number, number, number],
  { keepOut = [], hit = 6, before }: Options = {},
) {
  const canvas = fakeCanvas();
  const keyboard = fakeTarget();
  vi.stubGlobal('window', keyboard.target);
  const view = new THREE.PerspectiveCamera(FOV, 1.6, 0.1, 100);
  view.position.set(...camera);
  const controls = new OrbitControls(view, canvas.element);
  controls.enableDamping = true;
  controls.minDistance = 1.5;
  controls.maxDistance = 30;
  controls.target.set(...target);
  before?.(controls);
  controls.update();
  const clock = { t: 0 };
  /** Picks by the phase the test says it is in. */
  const picks = { phase: 'enter', by: new Map<string, number>() };
  const pick = (): number | undefined => {
    picks.by.set(picks.phase, (picks.by.get(picks.phase) ?? 0) + 1);
    return hit;
  };
  const orbit = createRoomOrbit(view, controls, pick, { now: () => clock.t });
  orbit.enter(box, keepOut);
  orbit.attach(canvas.element);
  const frames = (n: number, ms = 16): void => {
    for (let i = 0; i < n; i += 1) {
      clock.t += ms;
      orbit.step();
    }
  };
  const phase = (name: string): void => {
    picks.phase = name;
  };
  const counted = (name: string): number => picks.by.get(name) ?? 0;
  const key = (
    type: 'keydown' | 'keyup',
    code: string,
    event: Record<string, unknown> = {},
  ): { prevented: boolean } => keyboard.send(type, { code, target: { tagName: 'BODY' }, ...event });
  const blur = (): void => {
    keyboard.send('blur', {});
  };
  return { ...canvas, view, controls, orbit, frames, clock, phase, counted, key, blur };
}

type Room = ReturnType<typeof room>;

const mouse = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1 };
const touch = { pointerType: 'touch' };
const at = (r: Room): number[] => [r.view.position.x, r.view.position.y, r.view.position.z];
const turn = (r: Room, dx = 150): void => {
  r.send('pointerdown', { ...mouse, clientX: 640, clientY: 400 });
  r.send('pointermove', { ...mouse, clientX: 640 + dx, clientY: 400 });
  r.send('pointerup', { ...mouse, clientX: 640 + dx, clientY: 400, buttons: 0 });
  r.frames(60);
};
/** A shift-drag: a pan, `dx` and `dy` pixels. */
const pan = (r: Room, dx: number, dy: number): void => {
  const shifted = { ...mouse, shiftKey: true };
  r.send('pointerdown', { ...shifted, clientX: 640, clientY: 400 });
  r.send('pointermove', { ...shifted, clientX: 640 + dx, clientY: 400 + dy });
  r.send('pointerup', { ...shifted, clientX: 640 + dx, clientY: 400 + dy, buttons: 0 });
  r.frames(30);
};
const wheel = (r: Room, notches: number): void => {
  r.send('wheel', { deltaY: -100 * notches, deltaMode: 0 });
  r.frames(30);
};
/** Two fingers down, then the second moves `by` pixels in `steps` moves, `ms` apart. */
const pinch = (r: Room, by: number, steps = 1, ms = 16): void => {
  r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
  r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
  r.phase('pinch');
  for (let i = 1; i <= steps; i += 1) {
    r.send('pointermove', {
      ...touch,
      pointerId: 2,
      clientX: 500 + (by * i) / steps,
      clientY: 400,
    });
    r.frames(1, ms);
  }
};
const lift = (r: Room): void => {
  r.send('pointerup', { ...touch, pointerId: 1, buttons: 0 });
  r.send('pointerup', { ...touch, pointerId: 2, buttons: 0 });
};

describe('the camera in a room (#637)', () => {
  it('C1: the opening view does not move when the anchor is placed', () => {
    const { position, target } = frameRoom(
      1.6,
      {
        position: [-3.9, 3.8, 11],
        target: [2.334, 1.504, 1.335],
        aspect: 1.6,
        height: 6,
        span: 12,
      },
      box,
      FOV,
    );
    const r = room([position.x, position.y, position.z], [target.x, target.y, target.z], {
      hit: 5,
    });
    r.frames(1);
    const opened = new THREE.Vector3(position.x, position.y, position.z);
    expect(r.view.position.distanceTo(opened)).toBeLessThan(1e-9);
    const sight = new THREE.Vector3(
      target.x - position.x,
      target.y - position.y,
      target.z - position.z,
    ).normalize();
    expect(r.view.getWorldDirection(new THREE.Vector3()).distanceTo(sight)).toBeLessThan(1e-9);
    // and the anchor is where the pick said, along that line
    expect(r.view.position.distanceTo(r.controls.target)).toBeCloseTo(5, 9);
  });

  it('C3: the anchor is placed when S5.4 says and at no other time', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(1);
    expect(r.counted('enter')).toBe(1);

    r.phase('turn alone');
    turn(r);
    turn(r, -80);
    expect(r.counted('turn alone')).toBe(0);

    // a wheel walk, then the first turn places it, and the second does not
    r.phase('walk');
    wheel(r, 2);
    r.phase('after the wheel');
    turn(r);
    turn(r);
    expect(r.counted('after the wheel')).toBe(1);

    // a pinch: the second finger landing is a pan's start and places it; the first turn after places it again
    pinch(r, 60, 3);
    lift(r);
    r.phase('after the pinch');
    turn(r);
    turn(r);
    expect(r.counted('after the pinch')).toBe(1);

    // the second finger landing is a pan's start and places the anchor, the first finger does not
    r.phase('fingers');
    r.send('pointerdown', { ...touch, pointerId: 1, clientX: 400, clientY: 400 });
    expect(r.counted('fingers')).toBe(0);
    r.send('pointerdown', { ...touch, pointerId: 2, clientX: 500, clientY: 400 });
    expect(r.counted('fingers')).toBe(1);
    lift(r);

    // a pan places it once at its start, however long it runs, and once again at the first turn
    r.phase('pan');
    pan(r, 100, 0);
    expect(r.counted('pan')).toBe(1);
    r.phase('after the pan');
    turn(r);
    turn(r);
    expect(r.counted('after the pan')).toBe(1);

    // a Q turn after a W walk places it once, and keeps it while it lasts
    r.phase('walk keys');
    r.key('keydown', 'KeyW');
    r.frames(5);
    r.key('keyup', 'KeyW');
    r.phase('q turn');
    r.key('keydown', 'KeyQ');
    r.frames(10);
    r.key('keyup', 'KeyQ');
    r.key('keydown', 'KeyQ');
    r.frames(10);
    r.key('keyup', 'KeyQ');
    expect(r.counted('q turn')).toBe(1);

    // the camera framed anew, and a held book giving it back, each place it once
    r.phase('forget');
    r.orbit.forget();
    r.frames(3);
    expect(r.counted('forget')).toBe(1);
    r.phase('hold');
    r.orbit.hold();
    r.frames(3);
    expect(r.counted('hold')).toBe(1);
  });

  it('C5b: a pinch raycasts at most once per 100 ms', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(1);
    r.clock.t = 1000;
    pinch(r, 30, 3, 0);
    // the three steps stand at the same instant: one pick; then 50 ms on is still the same
    expect(r.counted('pinch')).toBe(1);
    r.clock.t = 1050;
    r.send('pointermove', { ...touch, pointerId: 2, clientX: 540, clientY: 400 });
    expect(r.counted('pinch')).toBe(1);
    r.clock.t = 1150;
    r.send('pointermove', { ...touch, pointerId: 2, clientX: 550, clientY: 400 });
    expect(r.counted('pinch')).toBe(2);
  });

  it('C6: a framing that sets maxDistance after enter does not snap a panned camera in', () => {
    // the pan places the anchor 8 ahead, and the page's framing then says no farther than 3
    const r = room([1, 5, 12], [1, 5, 4], { hit: 8 });
    r.frames(2);
    // `frameCamera` sets this after `enter`, and OrbitControls clamps to it every frame
    r.controls.maxDistance = 3;
    r.frames(1);
    pan(r, 100, 0);
    r.frames(10);
    expect(r.view.position.distanceTo(r.controls.target)).toBeGreaterThan(7.9);
  });
});

describe('the camera stays within bounds (#637, C7)', () => {
  const faces: [string, 0 | 1 | 2, 1 | -1][] = [
    ['east', 0, 1],
    ['west', 0, -1],
    ['up', 1, 1],
    ['down', 1, -1],
    ['north', 2, 1],
    ['south', 2, -1],
  ];
  const limit = (axis: 0 | 1 | 2, sign: 1 | -1): number =>
    sign > 0 ? box.max[axis] + OUT : box.min[axis] - OUT;

  for (const [name, axis, sign] of faces) {
    it(`C7: a walk toward the ${name} face stops ${String(OUT)} units past it`, () => {
      const ahead: [number, number, number] = [1, 5, 6];
      ahead[axis] += sign * 6;
      const r = room([1, 5, 6], ahead);
      r.frames(2);
      for (let i = 0; i < 70; i += 1) wheel(r, 3);
      expect(at(r)[axis]).toBeCloseTo(limit(axis, sign), 6);
      expect(sign * (at(r)[axis]! - limit(axis, sign))).toBeLessThanOrEqual(1e-9);
    });
  }

  it('C7: a pan toward the east and west faces stops 50 past them', () => {
    // looking along -z, screen right is +x; the content follows the pointer, so a left drag moves the camera right
    for (const sign of [1, -1] as const) {
      const r = room([1, 5, 6], [1, 5, 0]);
      r.frames(2);
      for (let i = 0; i < 60; i += 1) pan(r, -600 * sign, 0);
      expect(r.view.position.x).toBeCloseTo(limit(0, sign), 6);
    }
  });

  it('C7: a pan up and down stops 50 past the ceiling and the floor', () => {
    for (const sign of [1, -1] as const) {
      const r = room([1, 5, 6], [1, 5, 0]);
      r.frames(2);
      // a drag down is the camera up
      for (let i = 0; i < 60; i += 1) pan(r, 0, 600 * sign);
      expect(r.view.position.y).toBeCloseTo(limit(1, sign), 6);
    }
  });

  it('C7: Space held past the ceiling and C held past the floor stop 50 past them', () => {
    const up = room([1, 5, 6], [1, 5, 0]);
    up.key('keydown', 'Space');
    up.frames(140, 100);
    expect(up.view.position.y).toBeCloseTo(limit(1, 1), 6);
    const down = room([1, 5, 6], [1, 5, 0]);
    down.key('keydown', 'KeyC');
    down.frames(140, 100);
    expect(down.view.position.y).toBeCloseTo(limit(1, -1), 6);
  });

  describe('and the main bookcase', () => {
    const shelves: Box = { min: [-2, 0.5, 2], max: [4, 10, 3.2] };
    const inside = (r: Room): boolean =>
      [0, 1, 2].every((a) => at(r)[a]! > shelves.min[a]! && at(r)[a]! < shelves.max[a]!);

    it('C7: a walk at it stops at its face, however many notches', () => {
      const r = room([1, 5, 8], [1, 5, 4], { keepOut: [shelves] });
      r.frames(2);
      for (let i = 0; i < 30; i += 1) {
        wheel(r, 3);
        expect(inside(r)).toBe(false);
      }
      expect(r.view.position.z).toBeCloseTo(shelves.max[2], 6);
    });

    it('C7: a pan at it stops at its face', () => {
      // beside the case's west end, looking along -z, so screen right is +x: a drag to the left moves the
      // camera right, into the end face
      const r = room([-6, 5, 2.6], [-6, 5, -3], { keepOut: [shelves] });
      r.frames(2);
      for (let i = 0; i < 20; i += 1) {
        pan(r, -100, 0);
        expect(inside(r)).toBe(false);
      }
      expect(r.view.position.x).toBeCloseTo(shelves.min[0], 6);
    });
  });

  it('C7: a turn that would leave the outer limit slides along it and is not pulled in toward the anchor', () => {
    // standing on the limit, the anchor 20 ahead and outside it: a turn swings the camera over the
    // face, where it is held on the face and not taken along the line to the anchor
    const edge = box.max[0] + OUT;
    const r = room([edge, 5, 6], [edge + 20, 5, 6], { hit: 20 });
    r.frames(2);
    for (let i = 0; i < 6; i += 1) turn(r, 200);
    const [x, y] = at(r);
    expect(x).toBeLessThanOrEqual(edge + 1e-9);
    expect(y).toBeCloseTo(5, 6);
    // it ended on the face, and never nearer the anchor than the face itself is
    expect(x).toBeCloseTo(edge, 6);
    expect(r.view.position.distanceTo(r.controls.target)).toBeGreaterThanOrEqual(20 - 1e-6);
  });
});

describe('the keyboard (#637, C10)', () => {
  /** Holds `code` for `n` frames of 100 ms, as a visitor on the page does. */
  const hold = (r: Room, code: string, n = 5): void => {
    r.key('keydown', code);
    r.frames(n, 100);
    r.key('keyup', code);
  };
  const angleAbout = (r: Room, from: THREE.Vector3): number => {
    const before = from.clone().sub(r.controls.target).setY(0).normalize();
    const after = r.view.position.clone().sub(r.controls.target).setY(0).normalize();
    return Math.atan2(before.x * after.z - before.z * after.x, before.dot(after));
  };

  it('C10: each key, by its code, moves or turns the camera as S8.1 says', () => {
    // looking along -z: forward is -z and right is +x
    const moved = (code: string, shift = false): THREE.Vector3 => {
      const r = room([1, 5, 8], [1, 5, 2]);
      if (shift) r.key('keydown', 'ShiftLeft');
      hold(r, code);
      return r.view.position.clone().sub(new THREE.Vector3(1, 5, 8));
    };
    // 5 frames of 100 ms at 6 units a second
    expect(moved('KeyW').z).toBeCloseTo(-3, 6);
    expect(moved('KeyS').z).toBeCloseTo(3, 6);
    expect(moved('KeyD').x).toBeCloseTo(3, 6);
    expect(moved('KeyA').x).toBeCloseTo(-3, 6);
    expect(moved('Space').y).toBeCloseTo(3, 6);
    expect(moved('KeyC').y).toBeCloseTo(-3, 6);
    expect(moved('KeyW', true).z).toBeCloseTo(-9, 6);
    // Q and E turn about the anchor, a quarter turn a second, in opposite ways
    const turned = (code: string): number => {
      const r = room([1, 5, 8], [1, 5, 2]);
      const start = r.view.position.clone();
      hold(r, code, 10);
      return angleAbout(r, start);
    };
    expect(Math.abs(turned('KeyQ'))).toBeCloseTo(Math.PI / 2, 6);
    expect(turned('KeyE')).toBeCloseTo(-turned('KeyQ'), 6);
  });

  it('C10: nothing moves while typing in an input, with Ctrl, Meta or Alt held, or after a blur', () => {
    const r = room([1, 5, 8], [1, 5, 2]);
    const start = r.view.position.clone();
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      r.key('keydown', 'KeyW', { target: { tagName } });
    }
    r.key('keydown', 'KeyW', { target: { tagName: 'DIV', isContentEditable: true } });
    for (const held of ['ctrlKey', 'metaKey', 'altKey']) {
      r.key('keydown', 'KeyW', { [held]: true });
      r.key('keydown', 'Space', { [held]: true });
    }
    r.frames(5, 100);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
    // a key held when the window loses focus is dropped
    r.key('keydown', 'KeyW');
    r.blur();
    r.frames(5, 100);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
  });

  it('C10: off a room, a Space keydown is not taken and no key is held', () => {
    // the plain shelf and ?solo never enter a room; a room taken down leaves
    const r = room([1, 5, 8], [1, 5, 2]);
    r.orbit.leave();
    expect(r.key('keydown', 'Space').prevented).toBe(false);
    r.key('keydown', 'KeyW');
    r.orbit.enter(box);
    r.frames(5, 100);
    expect(r.view.position.z).toBeCloseTo(8, 9);
    expect(r.view.position.y).toBeCloseTo(5, 9);
  });

  it('C10: Space on a focused button, and any key with a dialog open or a book held, are not taken', () => {
    const r = room([1, 5, 8], [1, 5, 2]);
    const start = r.view.position.clone();
    expect(r.key('keydown', 'Space', { target: { tagName: 'BUTTON' } }).prevented).toBe(false);
    vi.stubGlobal('document', { querySelector: () => ({}) });
    expect(r.key('keydown', 'Space').prevented).toBe(false);
    r.key('keydown', 'KeyW');
    vi.stubGlobal('document', { querySelector: () => null });
    r.orbit.hold();
    expect(r.key('keydown', 'Space').prevented).toBe(false);
    r.key('keydown', 'KeyW');
    r.orbit.step();
    r.frames(5, 100);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
    // and the page body or the canvas does take it
    expect(r.key('keydown', 'Space', { target: r.element }).prevented).toBe(true);
  });

  it('C10: a key held when a book is picked up is no longer held when it is put back', () => {
    const r = room([1, 5, 8], [1, 5, 2]);
    r.key('keydown', 'KeyW');
    r.frames(2, 100);
    r.orbit.hold();
    // put back
    r.frames(5, 100);
    const back = r.view.position.clone();
    r.frames(5, 100);
    expect(r.view.position.distanceTo(back)).toBeLessThan(1e-9);
  });

  it('C10: a pinch while a book is held does not walk the camera', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(1);
    const start = r.view.position.clone();
    // the page calls hold() every frame a book is held, and the pickup disables OrbitControls
    r.controls.enabled = false;
    r.orbit.hold();
    pinch(r, 200, 5);
    r.orbit.hold();
    r.frames(1);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
  });

  it('S9.3: a wheel walk queued when a book is picked up is dropped, not played out over the held book', () => {
    const r = room([1, 5, 8], [1, 5, 5]);
    r.frames(1);
    const start = r.view.position.clone();
    r.send('wheel', { deltaY: -300, deltaMode: 0 });
    r.orbit.hold();
    r.frames(10);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
  });

  it('S9.3: the wheel is taken in a room, so the page does not scroll under it', () => {
    // OrbitControls' own zoom is off in a room, so only the walk's listener can have prevented it
    const r = room([1, 5, 8], [1, 5, 5]);
    expect(r.send('wheel', { deltaY: -100, deltaMode: 0 }).prevented).toBe(true);
  });

  it('C10: a key pressed on the body and let go with a button focused, or a dialog open, is no longer held', () => {
    const r = room([1, 5, 8], [1, 5, 2]);
    r.key('keydown', 'KeyW');
    r.key('keyup', 'KeyW', { target: { tagName: 'BUTTON' } });
    const start = r.view.position.clone();
    r.frames(5, 100);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
    r.key('keydown', 'KeyS');
    vi.stubGlobal('document', { querySelector: () => ({}) });
    r.key('keyup', 'KeyS');
    vi.stubGlobal('document', { querySelector: () => null });
    r.frames(5, 100);
    expect(r.view.position.distanceTo(start)).toBeLessThan(1e-9);
  });
});

describe('leaving a room puts every field back (#637, C16)', () => {
  it('C16: after enter then leave each OrbitControls field the room changed is what it was', () => {
    const r = room([1, 5, 8], [1, 5, 5], {
      before: (c) => {
        c.enableZoom = true;
        c.enablePan = false;
        c.enableRotate = false;
        c.panSpeed = 1.5;
        c.minDistance = 1.5;
        c.maxDistance = 30;
        c.maxPolarAngle = Math.PI * 0.52;
      },
    });
    r.frames(3);
    expect(r.controls.enableZoom).toBe(false);
    expect(r.controls.enablePan).toBe(true);
    expect(r.controls.enableRotate).toBe(true);
    expect(r.controls.maxPolarAngle).toBeCloseTo(Math.PI * 0.9, 9);
    r.orbit.leave();
    expect({
      enableZoom: r.controls.enableZoom,
      enablePan: r.controls.enablePan,
      enableRotate: r.controls.enableRotate,
      panSpeed: r.controls.panSpeed,
      minDistance: r.controls.minDistance,
      maxDistance: r.controls.maxDistance,
      maxPolarAngle: r.controls.maxPolarAngle,
    }).toEqual({
      enableZoom: true,
      enablePan: false,
      enableRotate: false,
      panSpeed: 1.5,
      minDistance: 1.5,
      maxDistance: 30,
      maxPolarAngle: Math.PI * 0.52,
    });
  });
});
