import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { headCapGeometry, isHeadCapGeometry } from './head-cap.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

/**
 * The head cap, as geometry.
 *
 * Three's `BufferGeometry` needs no GPU, so unlike the normal maps beside it this
 * one is fully testable under `node`. What is worth pinning is the shape's
 * *contract with the caller* — where its top and its face sit, and what it costs
 * — because every one of those is a number `scene.ts` positions the mesh by.
 */

const ROLL = DEFAULT_SETTINGS.books.headCap;

/** Positions are Float32, so six places is the most the buffer can carry. */
const PLACES = 6;

const geometry = must(headCapGeometry(ROLL));

/** `headCapGeometry` answers `undefined` only where a canvas is refused. */
function must(geometry: THREE.BufferGeometry | undefined): THREE.BufferGeometry {
  if (geometry === undefined) throw new Error('no head cap geometry');
  return geometry;
}

function attribute(name: string): Float32Array {
  const value = geometry.getAttribute(name).array;
  return value as Float32Array;
}

/** Every position, as `[x, y, z]` triples. */
function positions(): [number, number, number][] {
  const flat = attribute('position');
  const out: [number, number, number][] = [];
  for (let i = 0; i < flat.length; i += 3) {
    out.push([flat[i] ?? 0, flat[i + 1] ?? 0, flat[i + 2] ?? 0]);
  }
  return out;
}

describe('the head cap', () => {
  it('is 20 triangles of arc and 6 of closure', () => {
    // #56 built the arc at 32 x 10 = 640 and never varied either number. #66
    // found the width subdivision provably free — nothing varies along `x`, so it
    // subdivides a straight line — and the cost identical at 4 triangles and at
    // 640, so a coarser cap cannot recover the 11% it costs.
    //
    // The 6 are the back and the two ends. They are not decoration: without them
    // this is an awning over a wedge of nothing, and you can see through it.
    expect(geometry.getIndex()?.count).toBe((20 + 6) * 3);
  });

  it('puts its top at y = 0 and its face at z = 0', () => {
    // The caller's contract: a mesh parked at the top of the spine face lands
    // where the covering's flat part stopped. Get either wrong and the cap floats
    // above the book or sinks into it.
    const ys = positions().map(([, y]) => y);
    const zs = positions().map(([, , z]) => z);

    expect(Math.max(...ys)).toBeCloseTo(0, 12);
    expect(Math.max(...zs)).toBeCloseTo(0, 12);
    expect(Math.min(...zs)).toBeCloseTo(-ROLL, PLACES);
  });

  it('⚠️ is a closed fillet, not an open arc', () => {
    // The hole. An arc alone leaves a wedge between itself and the flat top of
    // the piece below, open along its back edge over the page block's width — and
    // looking down at the head from in front you see straight into the case.
    //
    // Closed means: a face at the back where the boards are, a face at each end
    // where nothing else reaches, and every one of them running *past* the
    // surfaces it meets rather than landing exactly on them. Exactly is where a
    // hairline lives.
    const ys = positions().map(([, y]) => y);
    expect(Math.min(...ys)).toBeLessThan(-ROLL);

    const normals = attribute('normal');
    const faces = new Set<string>();
    for (let i = 0; i < normals.length; i += 3) {
      faces.add([normals[i], normals[i + 1], normals[i + 2]].map((n) => (n ?? 0).toFixed(3)).join());
    }

    // Backward, and both ways along the width.
    expect(faces).toContain('0.000,0.000,-1.000');
    expect(faces).toContain('1.000,0.000,0.000');
    expect(faces).toContain('-1.000,0.000,0.000');
  });

  it('⚠️ carries the roll itself, so the caller scales by thickness and not by it', () => {
    // The bug this test exists for, and the one the counters could not see: the
    // arc spans one *width* unit along `x` while rolling by `roll` in `y` and
    // `z`. A caller who scaled uniformly by the roll got a narrow tab centred on
    // the head — ~6x too narrow — with the same draw, the same twenty triangles
    // and the same texture. Only a picture could catch it, and only a near one.
    //
    // Stated as the two spans being *different*: they were equal when both were
    // 1, which is precisely what made scaling by either look plausible.
    const xs = positions().map(([x]) => x);
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...positions().map(([, , z]) => z)) - Math.min(...positions().map(([, , z]) => z));

    expect(width).toBeCloseTo(1, 12);
    expect(depth).toBeCloseTo(ROLL, PLACES);
    expect(width).not.toBeCloseTo(depth, 3);
  });

  it('spans exactly the spine it rolls over', () => {
    // Width units, so the mesh's uniform thickness scale puts its edges on the
    // spine's edges. A cap wider than its book would clip through the neighbour.
    const xs = positions().map(([x]) => x);

    expect(Math.min(...xs)).toBeCloseTo(-0.5, 12);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 12);
  });

  it('rolls by more or less when the knob says so', () => {
    // A control must not lie, and this one is `rebuild`-class — so the geometry
    // has to actually be re-baked rather than a cached one handed back.
    const deeper = must(headCapGeometry(ROLL * 2));

    const depthOf = (g: THREE.BufferGeometry): number => {
      const flat = g.getAttribute('position').array as Float32Array;
      const zs: number[] = [];
      for (let i = 2; i < flat.length; i += 3) zs.push(flat[i] ?? 0);
      return Math.max(...zs) - Math.min(...zs);
    };

    expect(depthOf(deeper)).toBeCloseTo(ROLL * 2, PLACES);
    expect(deeper).not.toBe(geometry);
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
    // Asserted over the whole normal set rather than the first and last vertex,
    // which stopped being the arc's ends when the closing faces were appended.
    const normals = attribute('normal');
    let facingOut = false;
    let facingUp = false;
    for (let i = 0; i < normals.length; i += 3) {
      const [y, z] = [normals[i + 1] ?? 0, normals[i + 2] ?? 0];
      if (Math.abs(y) < 1e-9 && Math.abs(z - 1) < 1e-9) facingOut = true;
      if (Math.abs(y - 1) < 1e-9 && Math.abs(z) < 1e-9) facingUp = true;
    }

    // Flush with the spine face at one end, over the page block at the other.
    expect(facingOut).toBe(true);
    expect(facingUp).toBe(true);
  });

  it('is one geometry for the whole shelf, and says so to the disposer', () => {
    // Shared like `UNIT_BOX`: a mount that freed it would leave the next shelf
    // drawing caps out of a disposed buffer.
    expect(headCapGeometry(ROLL)).toBe(geometry);
    expect(isHeadCapGeometry(geometry)).toBe(true);
  });
});
