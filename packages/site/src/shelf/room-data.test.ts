import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bookcaseBox,
  clampInto,
  contains,
  type Empty,
  frameRoom,
  lightsPatch,
  pullIn,
  readRoomData,
  RoomDataError,
  type RoomView,
  type Vec3,
} from './room-data.ts';
import { mainRowCount, ROOM_MIN_ROWS, SHELF } from './bookcase.ts';
import { FOV } from './framing.ts';
import { resolveSettings } from './shelf-settings.ts';

const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z];

interface GltfNode {
  name?: string;
  mesh?: number;
  translation?: Vec3;
  rotation?: [number, number, number, number];
  extras?: Record<string, unknown>;
}

/** The empties of the committed GLB, read off its JSON chunk: what the page's walk would find. */
function committedEmpties(): Empty[] {
  const file = readFileSync(
    new URL('../../public/rooms/reading-corner/room-audition.glb', import.meta.url),
  );
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as { nodes: GltfNode[] };
  return json.nodes
    .filter((node) => node.mesh === undefined && node.name !== undefined)
    .map((node) => ({
      name: node.name ?? '',
      position: node.translation ?? [0, 0, 0],
      ...(node.rotation === undefined ? {} : { quaternion: node.rotation }),
      userData: node.extras ?? {},
    }));
}

/** The opening view as the room had it before #620, kept for the framing tests (the box below is the old one). */
const view: RoomView = {
  position: [-5.267, 4.306, 14.331],
  target: [2.334, 1.504, 1.335],
  span: 11,
  height: 8,
  aspect: 0.99,
};
/** The camera box before #620: open at the front (z 18) and 0.8 short of the back wall. */
const box = { min: [-7.4, 0.5, 0.8] as Vec3, max: [9.4, 10.5, 18] as Vec3 };
/**
 * The room as it is closed (#620): the box's front comes in, to the front wall's side of it, and its
 * back face to z -0.2 so the 1.5 stand behind the target is inside it.
 */
const closed = { min: [-7.4, 0.5, -0.2] as Vec3, max: [9.4, 10.5, 12.452] as Vec3 };

describe('the committed room (spec S7.2, S7.3, S8)', () => {
  const data = readRoomData(committedEmpties());

  it('carries its camera, its box and its live lights in the GLB', () => {
    expect(data.view.position).toEqual([-3.904, 3.803, 12]);
    expect(data.bounds.max[2]).toBe(12.452);
    // the back face is far enough behind the target for the 1.5 stand the pull-in keeps (#620)
    expect(data.bounds.min[2]).toBe(-0.2);
    expect(data.view.target[2] - data.bounds.min[2]).toBeGreaterThanOrEqual(1.5);
    expect(data.bounds.min[0]).toBeLessThan(data.bounds.max[0]);
    expect(Object.keys(data.lights)).toEqual(['ambient', 'key', 'fill', 'lamp']);
  });

  it('opens the camera inside the box that holds it', () => {
    const framing = frameRoom(16 / 9, data.view, data.bounds, FOV);
    expect(clampInto(data.bounds, vec(framing.position))).toEqual(vec(framing.position));
  });

  it('places the bookcase at its slot, and keeps the slots it already had', () => {
    expect(data.slots.slot_bookcase?.position).toEqual([0, 0, 0]);
    expect(Object.keys(data.slots)).toEqual(
      expect.arrayContaining(['slot_bookcase', 'slot_abandoned', 'slot_wishlist_0']),
    );
  });

  it('reads the turn of a slot about y', () => {
    // slot_abandoned is turned a quarter about y, the way that sends +x along +z
    expect(data.slots.slot_abandoned?.rotationY).toBeCloseTo(-Math.PI / 2, 5);
  });
});

describe('readRoomData refuses a room that is missing what the page needs', () => {
  const empties = committedEmpties();
  const without = (name: string): Empty[] => empties.filter((empty) => empty.name !== name);

  it.each(['view_open', 'bounds_min', 'bounds_max', 'live_ambient', 'live_key', 'live_fill'])(
    'without %s',
    (name) => {
      expect(() => readRoomData(without(name))).toThrow(RoomDataError);
      expect(() => readRoomData(without(name))).toThrow(name);
    },
  );

  it('with no lamp, a room still reads: the lamp is optional', () => {
    expect(readRoomData(without('live_lamp')).lights.lamp).toBeUndefined();
  });

  it('with a light whose colour is not six hex digits', () => {
    const bad = empties.map((e) =>
      e.name === 'live_key' ? { ...e, userData: { ...e.userData, colour: 'ffc89' } } : e,
    );
    expect(() => readRoomData(bad)).toThrow('live_key');
  });

  it('with a box that has no room, or a camera outside it', () => {
    const flat = empties.map((e) =>
      e.name === 'bounds_max' ? { ...e, position: [9.4, 0.5, 18] as Vec3 } : e,
    );
    expect(() => readRoomData(flat)).toThrow('no room');
    const out = empties.map((e) =>
      e.name === 'view_open' ? { ...e, position: [30, 4, 14] as Vec3 } : e,
    );
    expect(() => readRoomData(out)).toThrow("outside the room's box");
  });

  it('with a camera that stands on its own target, which no framing can use', () => {
    const open = empties.find((e) => e.name === 'view_open');
    const onTarget = empties.map((e) =>
      e.name === 'view_open' && open !== undefined
        ? { ...e, position: open.userData.target as Vec3 }
        : e,
    );
    expect(() => readRoomData(onTarget)).toThrow('stands on its target');
  });
});

describe('clampInto (spec S8.2, S8.3)', () => {
  it('leaves a point inside the box where it is', () => {
    expect(clampInto(box, [0, 5, 10])).toEqual([0, 5, 10]);
  });

  it('stands a point past a wall, the floor or the ceiling against it', () => {
    expect(clampInto(box, [-20, 5, 10])).toEqual([-7.4, 5, 10]);
    expect(clampInto(box, [0, -3, 10])).toEqual([0, 0.5, 10]);
    expect(clampInto(box, [0, 99, 10])).toEqual([0, 10.5, 10]);
    expect(clampInto(box, [0, 5, 40])).toEqual([0, 5, 18]);
  });

  it('moves a point at one rate to the bound: a straight line in is the same line clamped', () => {
    const along = (t: number): Vec3 => [-5 * t, 4, 10 * t];
    const clamped = [1, 2, 3, 4, 5].map((t) => clampInto(box, along(t))[2]);
    expect(clamped).toEqual([10, 18, 18, 18, 18]);
  });
});

describe('the room’s bookcase is never smaller than the one its shadow was baked from (#620)', () => {
  const caster = readRoomData(committedEmpties()).slots.slot_bookcase?.extras ?? {};

  it('stands at the baked caster’s height, however small the library', () => {
    expect(caster.caster_rows).toBe(ROOM_MIN_ROWS);
    expect(ROOM_MIN_ROWS * SHELF.rowHeight).toBeCloseTo(Number(caster.caster_height), 9);
    expect(mainRowCount(0, true) * SHELF.rowHeight).toBeGreaterThanOrEqual(
      Number(caster.caster_height),
    );
  });

  it('is as wide and as deep as the baked caster', () => {
    expect(SHELF.width + SHELF.sideThickness * 2).toBeCloseTo(Number(caster.caster_width), 9);
    expect(SHELF.depth).toBeCloseTo(Number(caster.caster_depth), 9);
  });

  it('gives the walk the case’s own space to stop at, centred on its slot (#620)', () => {
    const slot = readRoomData(committedEmpties()).slots.slot_bookcase;
    const space = bookcaseBox(slot, ROOM_MIN_ROWS * SHELF.rowHeight, 0);
    expect(space?.max[2]).toBeCloseTo(SHELF.depth / 2, 9);
    expect(space?.min[2]).toBeCloseTo(-SHELF.depth / 2, 9);
    expect(space?.max[0]).toBeCloseTo((SHELF.width + SHELF.sideThickness * 2) / 2, 9);
    expect(bookcaseBox(undefined, 4, 0.3)).toBeUndefined();
  });

  it('still grows past the minimum with the library, one empty shelf ahead', () => {
    expect(mainRowCount(3, true)).toBe(4);
    expect(mainRowCount(6, true)).toBe(7);
  });

  it('keeps the plain shelf’s two-row minimum outside a room', () => {
    expect(mainRowCount(0, false)).toBe(2);
    expect(mainRowCount(6, false)).toBe(7);
  });
});

describe('pullIn (#620)', () => {
  const target: Vec3 = [2.334, 1.504, 1.335];
  /** `distance` from the target, `angle` about the vertical (0 faces the front wall), 3 up. */
  const away = (angle: number, distance: number): Vec3 => [
    target[0] + Math.sin(angle) * distance,
    target[1] + 3,
    target[2] + Math.cos(angle) * distance,
  ];
  const turnOf = (p: Vec3): number => Math.atan2(p[0] - target[0], p[2] - target[2]);
  const reach = (p: Vec3): number =>
    Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);

  it('leaves a point inside the box where it is', () => {
    expect(pullIn(closed, target, [0, 5, 10])).toEqual([0, 5, 10]);
  });

  it('brings a point past a face in along the line to the target, onto the face', () => {
    const [x, y, z] = pullIn(closed, target, [2.334, 1.504 + 4, 1.335 + 30]);
    expect(z).toBeCloseTo(12.452, 9);
    expect(x).toBeCloseTo(2.334, 9);
    expect((y - target[1]) / (z - target[2])).toBeCloseTo(4 / 30, 9);
  });

  it('keeps the camera turning where it is turned: every step of a drag moves the view', () => {
    // a wish of 20 from the target, swung right round: the front wall, a side wall, the back wall
    const steps = Array.from({ length: 72 }, (_, i) => (((i + 0.5) / 72) * 2 - 1) * Math.PI);
    const stood = steps.map((angle) => pullIn(closed, target, away(angle, 20)));
    stood.forEach((p, i) => {
      expect(contains(closed, p)).toBe(true);
      expect(turnOf(p)).toBeCloseTo(steps[i] ?? NaN, 9);
    });
    for (let i = 1; i < stood.length; i += 1) expect(stood[i]).not.toEqual(stood[i - 1]);
  });

  it('comes in toward a close wall and goes back out as the view turns away from it', () => {
    expect(reach(pullIn(closed, target, away(Math.PI, 20)))).toBeLessThan(
      reach(pullIn(closed, target, away(0, 20))),
    );
  });

  it('holds the near limit where a face is close to the target, and stays in the box', () => {
    // the target 0.5 in front of the back face, the wish mostly along x and a little behind it:
    // without a near limit the line meets the back face 1.1 from the target
    const close: Vec3 = [2, 5, 0.3];
    const wish: Vec3 = [-18, 5, -9.7];
    const dist = (p: Vec3): number => Math.hypot(p[0] - close[0], p[1] - close[1], p[2] - close[2]);
    const without = pullIn(closed, close, wish);
    const held = pullIn(closed, close, wish, 1.5);
    expect(dist(without)).toBeCloseTo(1.118, 3);
    expect(dist(held)).toBeGreaterThan(dist(without) + 0.2);
    expect(contains(closed, held)).toBe(true);
  });

  it('stands against the nearest face when the target itself is outside the box', () => {
    expect(pullIn(closed, [50, 1, 1], [60, 1, 1])).toEqual(clampInto(closed, [60, 1, 1]));
  });
});

describe('frameRoom (spec S8.1, S8.4)', () => {
  it('stands on the owner’s line of sight, at the distance the window needs', () => {
    const wide = frameRoom(16 / 9, view, box, FOV);
    const [tx, ty, tz] = view.target;
    const [px, py, pz] = view.position;
    const base = Math.hypot(px - tx, py - ty, pz - tz);
    // along the line from the target through view_open, however far
    const k = wide.distance / base;
    expect(wide.position.y).toBeCloseTo(ty + (py - ty) * k, 6);
    expect(vec(wide.target)).toEqual(view.target);
  });

  it('comes in on a wide window, until the room fills its height', () => {
    const square = frameRoom(0.99, view, box, FOV);
    const wide = frameRoom(16 / 9, view, box, FOV);
    expect(wide.distance).toBeLessThan(square.distance);
  });

  it('opens an upright window as the one the view was framed in: no backing off', () => {
    const framed = frameRoom(view.aspect, view, box, FOV);
    const phone = frameRoom(0.46, view, box, FOV);
    expect(phone.distance).toBe(framed.distance);
    expect(phone.position).toEqual(framed.position);
  });

  it('keeps the camera inside the box at every window', () => {
    for (const aspect of [0.3, 0.46, 0.99, 1.5, 16 / 9, 3]) {
      const position = vec(frameRoom(aspect, view, closed, FOV).position);
      expect(clampInto(closed, position)).toEqual(position);
    }
  });

  it('comes in along the owner’s line of sight when the box cannot hold it farther out (#620)', () => {
    const [tx, ty, tz] = view.target;
    const [dx, dy, dz] = [view.position[0] - tx, view.position[1] - ty, view.position[2] - tz];
    for (const aspect of [0.3, 0.46, 0.99]) {
      const [x, y, z] = vec(frameRoom(aspect, view, closed, FOV).position);
      const k = (z - tz) / dz;
      expect(z).toBeLessThanOrEqual(12.452);
      expect(x - tx).toBeCloseTo(dx * k, 9);
      expect(y - ty).toBeCloseTo(dy * k, 9);
    }
  });

  it('lets zoom out as far as the farthest corner of the box', () => {
    const { maxDistance } = frameRoom(16 / 9, view, box, FOV);
    expect(maxDistance).toBeCloseTo(Math.hypot(-7.4 - 2.334, 10.5 - 1.504, 18 - 1.335), 5);
  });
});

describe('lightsPatch (spec S7.3)', () => {
  const lights = readRoomData(committedEmpties()).lights;

  it('puts the room’s lights into the settings the panel shows', () => {
    const settings = resolveSettings(lightsPatch(lights, 0x0d0b09));
    expect(settings.scene.background).toBe(0x0d0b09);
    expect(settings.lighting.key.colour).toBe(0xffc890);
    expect(settings.lighting.key.intensity).toBe(2.3);
    expect(settings.lighting.key.position.y).toEqual({ ofHeight: 0.5, plus: 4.6 });
    expect(settings.lighting.ambient.intensity).toBe(0.28);
    expect(settings.lighting.lamp.distance).toBe(18);
  });

  it('puts the shelf’s own lamp out in a room that has none', () => {
    const settings = resolveSettings(lightsPatch({ ...lights, lamp: undefined }, 0));
    expect(settings.lighting.lamp.intensity).toBe(0);
  });
});
