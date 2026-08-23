import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { headCapGeometry, isHeadCapGeometry } from "./head-cap.ts";
import { DEFAULT_SETTINGS } from "./shelf-settings.ts";

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
function must(
  geometry: THREE.BufferGeometry | undefined,
): THREE.BufferGeometry {
  if (geometry === undefined) throw new Error("no head cap geometry");
  return geometry;
}

function attribute(name: string): Float32Array {
  const value = geometry.getAttribute(name).array;
  return value as Float32Array;
}

/** Every position, as `[x, y, z]` triples. */
function positions(): [number, number, number][] {
  const flat = attribute("position");
  const out: [number, number, number][] = [];
  for (let i = 0; i < flat.length; i += 3) {
    out.push([flat[i] ?? 0, flat[i + 1] ?? 0, flat[i + 2] ?? 0]);
  }
  return out;
}

describe("the head cap", () => {
  it("⚠️ never reaches outside the roll it is closing", () => {
    // The defect this replaces, and the sharpest way to state it: **every vertex
    // is on or inside the arc**. The ends were squared off at first, and a
    // square's outer corner sits `roll × √2` from the arc's centre against the
    // arc's `roll` — so each end of the covering grew a block sticking out past
    // the roll it was there to close. Circled from three angles before anyone
    // recognised what it was.
    //
    // A fan from the centre cannot do that, whatever the sweep, and this is the
    // assertion that says so rather than trusting it.
    for (const [, y, z] of positions()) {
      const fromCentre = Math.hypot(y - -ROLL, z - -ROLL);
      expect(fromCentre).toBeLessThanOrEqual(ROLL + 1e-6);
    }
  });

  it("tucks in past the quarter rather than stopping dead on the boards", () => {
    // A turn that ends at 90° leaves its back edge exactly where the boards'
    // front face is — and the cap is parked `SKIN` proud of the spine, so
    // *exactly* is a slot running the width of the head, which reads as a square
    // step with the curve hidden behind it.
    //
    // Past 90° the arc descends, so every degree of the tuck is at or below the
    // crest and behind the boards: buried, not silhouette.
    const zs = positions().map(([, , z]) => z);
    expect(Math.min(...zs)).toBeLessThan(-ROLL);

    const deepest = positions().reduce((a, b) => (b[2] < a[2] ? b : a));
    expect(deepest[1]).toBeLessThan(0);
  });

  it("is 26 triangles of arc and 20 of ends — the tuck is not fanned", () => {
    // #56 built the arc at 32 x 10 = 640 and never varied either number. #66
    // found the width subdivision provably free — nothing varies along `x`, so it
    // subdivides a straight line — and the cost identical at 4 triangles and at
    // 640, so a coarser cap cannot recover the 11% it costs.
    //
    // The ends are not decoration: without them this is an awning over a wedge of
    // nothing, and you can see through it into the case. But they close the
    // *quarter* only. Fanning the tuck as well — 26 and 26, which shipped — puts
    // a disc in the boards' own plane, and the cap then has to be inset out of
    // that overlap, which leaves a lit sliver of board standing past the roll.
    // 20 rather than 26 is what lets `capScale` be `thickness` exactly.
    expect(geometry.getIndex()?.count).toBe((26 + 20) * 3);
  });

  it("puts its crest at y = 0 and its foot at z = 0", () => {
    // The caller's contract: a mesh parked at the top of the spine face lands
    // where the covering's flat part stopped. Get either wrong and the cap floats
    // above the book or sinks into it.
    const ys = positions().map(([, y]) => y);
    const zs = positions().map(([, , z]) => z);

    expect(Math.max(...ys)).toBeCloseTo(0, 12);
    expect(Math.max(...zs)).toBeCloseTo(0, 12);
    // The foot, on the printed spine.
    expect(Math.min(...ys)).toBeCloseTo(-ROLL, PLACES);
  });

  it("⚠️ is closed at both ends, and no end normal faces straight out", () => {
    // Both halves matter and they pull against each other.
    //
    // **Closed**: without ends this is an awning over a wedge of nothing and you
    // see through it into the case.
    //
    // **Never `(±1, 0, 0)`**: a true sideways normal is what made the closed end
    // read as a *thumbprint stuck on the corner* — it catches the light as a
    // surface of its own, discontinuous with the roll it closes, and the eye
    // reads that discontinuity as a separate object. The end is a flat disc and
    // has to be; nothing beside a book is there for the covering to turn down
    // onto. What was wrong was its shading, and 45° into the roll is the whole
    // fix. Restoring the honest normal is a one-token change that looks like
    // tidying and undoes it.
    let ends = 0;
    const normals = attribute("normal");
    for (let i = 0; i < normals.length; i += 3) {
      const x = normals[i] ?? 0;
      expect(Math.abs(x)).toBeLessThan(0.9);
      if (Math.abs(x) > 0.1) ends += 1;
    }

    // The hub and its rim, at each of the two ends.
    expect(ends).toBe((1 + (10 + 1)) * 2);
  });

  it("⚠️ carries the roll itself, so the caller scales by thickness and not by it", () => {
    // The bug this test exists for, and the one the counters could not see: the
    // arc spans one *width* unit along `x` while rolling by `roll` in `y` and
    // `z`. A caller who scaled uniformly by the roll got a narrow tab centred on
    // the head — ~6x too narrow — with the same draw, the same twenty triangles
    // and the same texture. Only a picture could catch it, and only a near one.
    //
    // Stated as the two spans being *different*: they were equal when both were
    // 1, which is precisely what made scaling by either look plausible.
    const xs = positions().map(([x]) => x);
    const ys = positions().map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    // Foot to crest, which is the roll itself — the depth now runs past it,
    // because the tuck carries the surface behind the boards.
    const rise = Math.max(...ys) - Math.min(...ys);

    expect(width).toBeCloseTo(1, 12);
    expect(rise).toBeCloseTo(ROLL, PLACES);
    expect(width).not.toBeCloseTo(rise, 3);
  });

  it("spans exactly the spine it rolls over", () => {
    // Width units, so the mesh's uniform thickness scale puts its edges on the
    // spine's edges. A cap wider than its book would clip through the neighbour.
    const xs = positions().map(([x]) => x);

    expect(Math.min(...xs)).toBeCloseTo(-0.5, 12);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 12);
  });

  it("rolls by more or less when the knob says so", () => {
    // A control must not lie, and this one is `rebuild`-class — so the geometry
    // has to actually be re-baked rather than a cached one handed back.
    const deeper = must(headCapGeometry(ROLL * 2));

    const riseOf = (g: THREE.BufferGeometry): number => {
      const flat = g.getAttribute("position").array as Float32Array;
      const ys: number[] = [];
      for (let i = 1; i < flat.length; i += 3) ys.push(flat[i] ?? 0);
      return Math.max(...ys) - Math.min(...ys);
    };

    expect(riseOf(deeper)).toBeCloseTo(ROLL * 2, PLACES);
    expect(deeper).not.toBe(geometry);
  });

  it("runs u across the width, so the spine profile shades it too", () => {
    // This is what makes the cap cost no texture of its own — it borrows the
    // normal map the spine plane is already carrying.
    const uvs = attribute("uv");
    const positions = attribute("position");

    for (let vertex = 0; vertex * 2 < uvs.length; vertex += 1) {
      const x = positions[vertex * 3] ?? 0;
      expect(uvs[vertex * 2]).toBeCloseTo(x + 0.5, 12);
    }
  });

  it("turns through a full quarter, from facing you to facing up", () => {
    // Asserted over the whole normal set rather than the first and last vertex,
    // which stopped being the arc's ends when the closing faces were appended.
    const normals = attribute("normal");
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

  it("is one geometry for the whole shelf, and says so to the disposer", () => {
    // Shared like `UNIT_BOX`: a mount that freed it would leave the next shelf
    // drawing caps out of a disposed buffer.
    expect(headCapGeometry(ROLL)).toBe(geometry);
    expect(isHeadCapGeometry(geometry)).toBe(true);
  });
});
