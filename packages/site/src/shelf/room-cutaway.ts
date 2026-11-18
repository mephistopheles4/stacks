import * as THREE from 'three';
import { type Box, CUTAWAY_NAMES } from './room-data.ts';

/**
 * Drops the faces of the room's walls, panelling, trim, ceiling and floor that point out of the room, so
 * every wall is drawn from the inside only and a camera outside sees through the ones between it and the
 * room (#637, spec S6). A face points out when it points away from the room's centre on its own axis:
 * a vertical face by its horizontal normal, a horizontal one by its vertical normal.
 *
 * **It changes geometry only**: no mesh is added or removed and no material changes, so the draw count and
 * the shadow-map readers are what they were. Which meshes are cut is `CUTAWAY_NAMES`' rule. It runs once,
 * on the loaded group before it enters the scene. Each cut mesh gets a geometry of its own with the same
 * attributes and a shorter index, and the geometry it replaces is disposed once no mesh in the group
 * still uses it (`GLTFLoader` may share one geometry across meshes).
 *
 * Returns how many triangles were dropped.
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
  const replaced = new Set<THREE.BufferGeometry>();
  let dropped = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (!CUTAWAY_NAMES.test(mesh.parent?.name ?? mesh.name)) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const { index } = geometry;
    const count = index === null ? position.count : index.count;
    const vertex = (i: number): number => (index === null ? i : index.getX(i));
    const kept: number[] = [];
    // a mesh with several materials draws them as groups of the index: they are rebuilt over what is kept
    const original = geometry.groups;
    const counts = original.map(() => 0);
    for (let i = 0; i < count; i += 3) {
      const [i0, i1, i2] = [vertex(i), vertex(i + 1), vertex(i + 2)];
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      mid.copy(a).add(b).add(c).divideScalar(3).sub(centre);
      const outward = Math.abs(n.y) > 0.5 ? n.y * mid.y > 0 : n.x * mid.x + n.z * mid.z > 0;
      if (outward) {
        dropped += 1;
        continue;
      }
      const g = original.findIndex(({ start, count: size }) => i >= start && i < start + size);
      if (g >= 0) counts[g]! += 3;
      kept.push(i0, i1, i2);
    }
    const stripped = geometry.clone();
    stripped.setIndex(kept);
    stripped.clearGroups();
    let start = 0;
    original.forEach(({ materialIndex }, g) => {
      stripped.addGroup(start, counts[g]!, materialIndex);
      start += counts[g]!;
    });
    mesh.geometry = stripped;
    replaced.add(geometry);
  });
  // a geometry another mesh still draws stays; the rest are let go of
  const inUse = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh === true) inUse.add((object as THREE.Mesh).geometry);
  });
  for (const geometry of replaced) if (!inUse.has(geometry)) geometry.dispose();
  return dropped;
}
