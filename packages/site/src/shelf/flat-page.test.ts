import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flatPlacement, projectSlot, SKEW_LIMIT_PX, type Corners } from './flat-page.ts';

const BOX = { width: 460, height: 640 };

/** The page's own corners moved by an affine map, so a test can say where they should land. */
function moved(map: (x: number, y: number) => { x: number; y: number }): Corners {
  return [map(0, 0), map(460, 0), map(460, 640), map(0, 640)];
}

const parse = (matrix: string): number[] =>
  /^matrix\((.*)\)$/.exec(matrix)?.[1]?.split(', ').map(Number) ?? [];

describe('flatPlacement', () => {
  it('is the identity for a page that has not moved', () => {
    const placement = flatPlacement(
      moved((x, y) => ({ x, y })),
      BOX,
    );
    expect(placement.matrix).toBe('matrix(1, 0, 0, 1, 0, 0)');
    expect(placement.skew).toBe(0);
  });

  it('is the matching matrix for a page translated, scaled and rotated', () => {
    const angle = Math.PI / 6;
    const scale = 0.75;
    const map = (x: number, y: number): { x: number; y: number } => ({
      x: 120 + scale * (Math.cos(angle) * x - Math.sin(angle) * y),
      y: 40 + scale * (Math.sin(angle) * x + Math.cos(angle) * y),
    });
    const placement = flatPlacement(moved(map), BOX);
    const [a, b, c, d, e, f] = parse(placement.matrix);
    expect(a).toBeCloseTo(scale * Math.cos(angle), 3);
    expect(b).toBeCloseTo(scale * Math.sin(angle), 3);
    expect(c).toBeCloseTo(-scale * Math.sin(angle), 3);
    expect(d).toBeCloseTo(scale * Math.cos(angle), 3);
    expect(e).toBe(120);
    expect(f).toBe(40);
    expect(placement.skew).toBeLessThan(SKEW_LIMIT_PX);
  });

  it('puts every corner of the box where it was projected', () => {
    const corners = moved((x, y) => ({ x: 30 + 0.5 * x, y: 10 + 0.5 * y }));
    const [a, b, c, d, e, f] = parse(flatPlacement(corners, BOX).matrix) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (const [index, [x, y]] of [
      [0, 0],
      [BOX.width, 0],
      [BOX.width, BOX.height],
      [0, BOX.height],
    ].entries() as IterableIterator<[number, [number, number]]>) {
      expect(a * x + c * y + e).toBeCloseTo(corners[index]?.x ?? NaN, 2);
      expect(b * x + d * y + f).toBeCloseTo(corners[index]?.y ?? NaN, 2);
    }
  });

  it('reports a skew over the limit for a trapezoid, and the skew is the fourth corner’s miss', () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = moved((x, y) => ({ x, y }));
    const trapezoid: Corners = [
      topLeft,
      topRight,
      { x: (bottomRight?.x ?? 0) - 12, y: bottomRight?.y ?? 0 },
      bottomLeft,
    ] as unknown as Corners;
    expect(flatPlacement(trapezoid, BOX).skew).toBeCloseTo(12, 6);
    expect(flatPlacement(trapezoid, BOX).skew).toBeGreaterThan(SKEW_LIMIT_PX);
  });
});

describe('projectSlot', () => {
  const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld(true);
  const layer = { width: 800, height: 600 };

  it('puts a page square to the camera on a rectangle, so the placement shows no skew', () => {
    const slot = new THREE.Object3D();
    slot.scale.setScalar(0.004);
    slot.position.set(1, 0.5, 0);
    slot.updateMatrixWorld(true);
    const corners = projectSlot(slot, camera, layer, BOX);
    const placement = flatPlacement(corners, BOX);
    expect(placement.skew).toBeLessThan(0.01);
    const [a, b, c, d] = parse(placement.matrix);
    expect(b).toBeCloseTo(0, 3);
    expect(c).toBeCloseTo(0, 3);
    expect(a).toBeCloseTo(d ?? NaN, 3);
    expect(a).toBeGreaterThan(0);
  });

  it('puts the slot’s top at the screen’s top: world y runs up, screen y runs down', () => {
    const slot = new THREE.Object3D();
    slot.scale.setScalar(0.004);
    slot.updateMatrixWorld(true);
    const [topLeft, , , bottomLeft] = projectSlot(slot, camera, layer, BOX);
    expect(topLeft.y).toBeLessThan(bottomLeft.y);
  });

  it('shows a skew for a page turned away from the camera', () => {
    const slot = new THREE.Object3D();
    slot.scale.setScalar(0.004);
    slot.rotation.y = 0.5;
    slot.updateMatrixWorld(true);
    const placement = flatPlacement(projectSlot(slot, camera, layer, BOX), BOX);
    expect(placement.skew).toBeGreaterThan(SKEW_LIMIT_PX);
  });
});
