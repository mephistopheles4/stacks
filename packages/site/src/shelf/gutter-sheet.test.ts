import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GUTTER_DARKEN } from './gutter-shade.ts';
import { paperMaterial, sheetGeometry } from './gutter-sheet.ts';
import { isShielded } from './shadow-receivers.ts';

/** Each vertex's x and its shade, read back off the built geometry. */
function vertices(geometry: THREE.BufferGeometry): { x: number; z: number; shade: number }[] {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  return Array.from({ length: position.count }, (_, i) => ({
    x: position.getX(i),
    z: position.getZ(i),
    shade: colour.getX(i),
  }));
}

describe.each([
  // The right page is turned +90° about Y, so its local −x points to the spine;
  // the left one rides the board turned −90°, so its local +x does.
  ['right', -0.5],
  ['left', 0.5],
] as const)('the %s page', (page, fold) => {
  it('carries a colour per vertex', () => {
    const colour = sheetGeometry(page).getAttribute('color');
    expect(colour.itemSize).toBe(3);
    expect(colour.count).toBe(sheetGeometry(page).getAttribute('position').count);
  });

  it('is darkest on its fold edge and untouched on its outer edge', () => {
    const all = vertices(sheetGeometry(page));
    for (const v of all.filter((v) => v.x === fold)) {
      // A Float32 attribute: six places is all it holds.
      expect(v.shade).toBeCloseTo(1 - GUTTER_DARKEN, 6);
    }
    for (const v of all.filter((v) => v.x === -fold)) expect(v.shade).toBe(1);
  });

  it('is the unit plane PlaneGeometry(1, 1) was: flat, ±0.5 each way, facing +z', () => {
    const geometry = sheetGeometry(page);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    expect(box.min.toArray()).toEqual([-0.5, -0.5, 0]);
    expect(box.max.toArray()).toEqual([0.5, 0.5, 0]);
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      expect([normal.getX(i), normal.getY(i), normal.getZ(i)]).toEqual([0, 0, 1]);
    }
    // Wound to face +z, as PlaneGeometry is: a back-facing sheet draws nothing.
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    const corner = (n: number): THREE.Vector3 =>
      new THREE.Vector3().fromBufferAttribute(position, index?.getX(n) ?? n);
    let area = 0;
    for (let t = 0; t < (index?.count ?? 0); t += 3) {
      const [a, b, c] = [corner(t), corner(t + 1), corner(t + 2)];
      const facing = b.clone().sub(a).cross(c.clone().sub(a));
      expect(facing.z).toBeGreaterThan(0);
      area += facing.z / 2;
    }
    // And the triangles tile the whole sheet, so none of it is left undrawn.
    expect(area).toBeCloseTo(1, 6);
  });
});

describe('the paper', () => {
  it('multiplies the vertex colours in', () => {
    expect(paperMaterial().vertexColors).toBe(true);
  });

  it('reads no shadow map, as G61 requires of every book part', () => {
    expect(isShielded(paperMaterial())).toBe(true);
  });
});
