import { describe, expect, it } from 'vitest';
import { headCapGeometry, isHeadCapGeometry } from './head-cap.ts';

/**
 * The head cap, as geometry.
 *
 * Three's `BufferGeometry` needs no GPU, so unlike the normal maps beside it this
 * one is fully testable under `node`. What is worth pinning is the shape's
 * *contract with the caller* — where its top and its face sit, and what it costs
 * — because every one of those is a number `scene.ts` positions the mesh by.
 */

const geometry = headCapGeometry();

function attribute(name: string): Float32Array {
  const value = geometry.getAttribute(name).array;
  return value as Float32Array;
}

describe('the head cap', () => {
  it('is 20 triangles, which is #66 and not #56', () => {
    // #56 built it at 32 x 10 = 640 and never varied either number. #66 found the
    // width subdivision provably free — nothing varies along `x`, so it
    // subdivides a straight line — and the cost identical at 4 triangles and at
    // 640, so a coarser cap cannot recover the 11% it costs.
    expect(geometry.getIndex()?.count).toBe(20 * 3);
  });

  it('puts its top at y = 0 and its face at z = 0', () => {
    // The caller's contract: a mesh scaled by the roll and parked at the top of
    // the spine face lands where the covering's flat part stopped. Get either
    // wrong and the cap floats above the book or sinks into it.
    const positions = attribute('position');

    let maxY = -Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      maxY = Math.max(maxY, positions[i + 1] ?? 0);
      minY = Math.min(minY, positions[i + 1] ?? 0);
      maxZ = Math.max(maxZ, positions[i + 2] ?? 0);
      minZ = Math.min(minZ, positions[i + 2] ?? 0);
    }

    expect(maxY).toBeCloseTo(0, 12);
    expect(maxZ).toBeCloseTo(0, 12);
    // A quarter turn of unit radius: it descends one radius and recedes one.
    expect(minY).toBeCloseTo(-1, 12);
    expect(minZ).toBeCloseTo(-1, 12);
  });

  it('spans exactly the spine it rolls over', () => {
    // Width units, so the mesh's uniform thickness scale puts its edges on the
    // spine's edges. A cap wider than its book would clip through the neighbour.
    const positions = attribute('position');
    const xs: number[] = [];
    for (let i = 0; i < positions.length; i += 3) xs.push(positions[i] ?? 0);

    expect(Math.min(...xs)).toBeCloseTo(-0.5, 12);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 12);
  });

  it('runs u across the width, so the spine profile shades it too', () => {
    // This is what makes the cap cost no texture of its own — it borrows the
    // normal map the spine plane is already carrying.
    const uvs = attribute('uv');
    const positions = attribute('position');

    for (let vertex = 0; vertex * 2 < uvs.length; vertex += 1) {
      const x = positions[vertex * 3] ?? 0;
      expect(uvs[vertex * 2]).toBeCloseTo(x + 0.5, 12);
    }
  });

  it('turns through a full quarter, from facing you to facing up', () => {
    const normals = attribute('normal');
    const first = [normals[0], normals[1], normals[2]];
    const last = normals.slice(-3);

    // v = 0: flush with the spine face, normal straight out of it.
    expect(first[1]).toBeCloseTo(0, 12);
    expect(first[2]).toBeCloseTo(1, 12);
    // v = 1: the top of the cap, normal straight up.
    expect(last[1]).toBeCloseTo(1, 12);
    expect(last[2]).toBeCloseTo(0, 12);
  });

  it('is one geometry for the whole shelf, and says so to the disposer', () => {
    // Shared like `UNIT_BOX`: a mount that freed it would leave the next shelf
    // drawing caps out of a disposed buffer.
    expect(headCapGeometry()).toBe(geometry);
    expect(isHeadCapGeometry(geometry)).toBe(true);
  });
});
