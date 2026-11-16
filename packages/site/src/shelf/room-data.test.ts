import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clampInto,
  type Empty,
  frameRoom,
  lightsPatch,
  readRoomData,
  RoomDataError,
  type RoomView,
  type Vec3,
} from './room-data.ts';
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

const view: RoomView = {
  position: [-5.267, 4.306, 14.331],
  target: [2.334, 1.504, 1.335],
  span: 11,
  height: 8,
  aspect: 0.99,
};
const box = { min: [-7.4, 0.5, 0.8] as Vec3, max: [9.4, 10.5, 18] as Vec3 };

describe('the committed room (spec S7.2, S7.3, S8)', () => {
  const data = readRoomData(committedEmpties());

  it('carries its camera, its box and its live lights in the GLB', () => {
    expect(data.view.position).toEqual([-5.267, 4.306, 14.331]);
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
    expect(() => readRoomData(out)).toThrow('outside the camera box');
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
      const position = vec(frameRoom(aspect, view, box, FOV).position);
      expect(clampInto(box, position)).toEqual(position);
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
