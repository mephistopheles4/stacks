import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Box } from './room-data.ts';
import { stripOuterFaces } from './room-cutaway.ts';

/** The room: 20 wide, 10 high, 20 deep, its centre at (0, 5, 0). */
const box: Box = { min: [-10, 0, -10], max: [10, 10, 10] };

/** A triangle in the plane x = `x`, its normal toward +x when `towardPlusX`, else toward -x. */
function wall(x: number, towardPlusX: boolean): number[] {
  const a = [x, 2, 2];
  const b = [x, 2, 4];
  const c = [x, 4, 2];
  // (b - a) x (c - a) = (0,0,2) x (0,2,0) = (-4, 0, 0): toward -x
  return towardPlusX ? [...a, ...c, ...b] : [...a, ...b, ...c];
}

/** A triangle in the plane y = `y`, its normal up when `up`. */
function slab(y: number, up: boolean): number[] {
  const a = [1, y, 1];
  const b = [1, y, 3];
  const c = [3, y, 1];
  // (b - a) x (c - a) = (0,0,2) x (2,0,0) = (0, 4, 0): up
  return up ? [...a, ...b, ...c] : [...a, ...c, ...b];
}

function geometryOf(...triangles: number[][]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(), 3));
  return geometry;
}

const keptCount = (mesh: THREE.Mesh): number => {
  const { index } = mesh.geometry;
  return (index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
};

/** The normal of every triangle a mesh still draws, rounded so that it reads as an axis. */
function normalsOf(mesh: THREE.Mesh): number[][] {
  const { index } = mesh.geometry;
  const position = mesh.geometry.getAttribute('position');
  const vertex = (i: number): number => (index === null ? i : index.getX(i));
  const count = index?.count ?? position.count;
  const out: number[][] = [];
  for (let i = 0; i < count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(position, vertex(i + k)),
    );
    const n = b!.clone().sub(a!).cross(c!.clone().sub(a!)).normalize();
    out.push([n.x, n.y, n.z].map((v) => Math.round(v) + 0));
  }
  return out;
}

/** A mesh under a wrapper node, as a GLB hands it over. */
function under(name: string, mesh: THREE.Mesh): THREE.Group {
  const holder = new THREE.Group();
  holder.name = name;
  holder.add(mesh);
  return holder;
}

describe('stripOuterFaces (#637, C8)', () => {
  const material = new THREE.MeshBasicMaterial();

  it('C8: keeps the faces that look into the room and drops the ones that look out, on every wall, the ceiling and the floor', () => {
    // each surface carries one inward face and one outward: which is which depends on the side of the
    // room's centre the surface stands on, so a rule blind to position, or inverted, keeps the wrong one
    const surface = (name: string, ...triangles: number[][]): [string, THREE.Mesh] => [
      name,
      new THREE.Mesh(geometryOf(...triangles), material),
    ];
    const cases: [[string, THREE.Mesh], number[]][] = [
      // the east wall at x = +10 looks into the room along -x, and the west one at x = -10 along +x
      [surface('room_walls_east', wall(10, false), wall(10, true)), [-1, 0, 0]],
      [surface('room_walls_west', wall(-10, false), wall(-10, true)), [1, 0, 0]],
      // the floor at y = 0 looks up and the ceiling at y = 10 looks down
      [surface('room_floor', slab(0, true), slab(0, false)), [0, 1, 0]],
      [surface('room_ceiling_slab', slab(10, true), slab(10, false)), [0, -1, 0]],
    ];
    const root = new THREE.Group();
    for (const [[name, mesh]] of cases) root.add(under(name, mesh));

    const dropped = stripOuterFaces(root, box);

    expect(dropped).toBe(cases.length);
    for (const [[name, mesh], inward] of cases) {
      expect(normalsOf(mesh), name).toEqual([inward]);
    }
  });

  it('C8: a mesh under any other name, and one named room_floor_rug, is not cut', () => {
    // `room_floor` matches exactly: a rug laid on the floor keeps both of its faces
    const rug = new THREE.Mesh(geometryOf(slab(0, true), slab(0, false)), material);
    const prop = new THREE.Mesh(geometryOf(wall(10, true), wall(10, false)), material);
    const root = new THREE.Group();
    root.add(under('room_floor_rug', rug), under('stool', prop));
    const originals = [rug.geometry, prop.geometry];

    expect(stripOuterFaces(root, box)).toBe(0);

    expect(keptCount(rug)).toBe(2);
    expect(keptCount(prop)).toBe(2);
    expect([rug.geometry, prop.geometry]).toEqual(originals);
    expect(prop.geometry.index).toBeNull();
  });

  it('C8: no mesh is added or removed and no material changes', () => {
    const east = new THREE.Mesh(geometryOf(wall(10, false), wall(10, true)), material);
    const prop = new THREE.Mesh(geometryOf(wall(10, true)), material);
    const root = new THREE.Group();
    root.add(under('room_walls_east', east), under('stool', prop));
    const meshes = (): THREE.Object3D[] => {
      const found: THREE.Object3D[] = [];
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) found.push(o);
      });
      return found;
    };
    const before = meshes();

    stripOuterFaces(root, box);

    expect(meshes()).toEqual(before);
    for (const mesh of [east, prop]) expect(mesh.material).toBe(material);
  });

  it('C8: disposes the geometry it replaced, unless another mesh still draws it', () => {
    const own = geometryOf(wall(10, false), wall(10, true));
    const shared = geometryOf(wall(-10, true), wall(-10, false));
    const cut = new THREE.Mesh(own, material);
    const sharedCut = new THREE.Mesh(shared, material);
    const sharedProp = new THREE.Mesh(shared, material);
    const root = new THREE.Group();
    root.add(
      under('room_shell', cut),
      under('room_wallpaper', sharedCut),
      under('lamp', sharedProp),
    );
    const disposedOwn = vi.spyOn(own, 'dispose');
    const disposedShared = vi.spyOn(shared, 'dispose');

    stripOuterFaces(root, box);

    expect(disposedOwn).toHaveBeenCalledOnce();
    expect(cut.geometry).not.toBe(own);
    // the prop still draws the shared one
    expect(disposedShared).not.toHaveBeenCalled();
    expect(sharedProp.geometry).toBe(shared);
  });
});
