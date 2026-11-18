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

/** A mesh under a wrapper node, as a GLB hands it over. */
function under(name: string, mesh: THREE.Mesh): THREE.Group {
  const holder = new THREE.Group();
  holder.name = name;
  holder.add(mesh);
  return holder;
}

describe('stripOuterFaces (#637, C8)', () => {
  const material = new THREE.MeshBasicMaterial();

  it('C8: drops every outward face of a named mesh, keeps every inward one, and leaves an unnamed mesh alone', () => {
    // the east wall at x = +10: inward faces -x, outward faces +x; the floor at y = 0: inward faces up
    const east = new THREE.Mesh(
      geometryOf(wall(10, false), wall(10, true), wall(10, false)),
      material,
    );
    const floor = new THREE.Mesh(geometryOf(slab(0, true), slab(0, false)), material);
    const prop = new THREE.Mesh(geometryOf(wall(10, true), wall(10, false)), material);
    const root = new THREE.Group();
    root.add(under('room_walls_east', east), under('room_floor', floor), under('stool', prop));
    const meshesBefore: THREE.Object3D[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshesBefore.push(o);
    });

    const dropped = stripOuterFaces(root, box);

    expect(dropped).toBe(2);
    // the two inward wall faces and the one upward floor face are what is left
    expect(keptCount(east)).toBe(2);
    expect(keptCount(floor)).toBe(1);
    // the unnamed mesh was not touched
    expect(keptCount(prop)).toBe(2);
    expect(prop.geometry.index).toBeNull();
    const meshesAfter: THREE.Object3D[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshesAfter.push(o);
    });
    expect(meshesAfter).toEqual(meshesBefore);
    for (const mesh of [east, floor, prop]) expect(mesh.material).toBe(material);
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
