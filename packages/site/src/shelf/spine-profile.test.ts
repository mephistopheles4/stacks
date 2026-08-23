import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type SpineProfile } from "./shelf-settings.ts";
import { isFlat, slopeAt } from "./spine-profile.ts";

/**
 * The spine's cross-section, as arithmetic.
 *
 * Only the pure half is testable here — vitest runs under `node`, so there is no
 * canvas to bake a normal map onto, and the map is judged on a render anyway
 * (#55's sheet, #56's). What *can* be pinned is the profile itself, and it is the
 * part two tickets argued about.
 */

const { hardback, paperback } = DEFAULT_SETTINGS.materials.spineProfile;

/** The tangent's angle from the flat, in degrees, at the joint. */
function turnAt(x: number, profile: SpineProfile): number {
  return (Math.atan(Math.abs(slopeAt(x, profile))) * 180) / Math.PI;
}

/**
 * #55's circular arc, kept as the thing the ellipse was chosen against.
 *
 * A circle through (-0.5, 0), (0, rise) and (0.5, 0). Its slope at the joint is
 * the number #56 objected to, and reproducing it here is what makes the
 * comparison below a measurement rather than a claim.
 */
function circularSlopeAt(x: number, rise: number): number {
  const radius = (0.25 + rise * rise) / (2 * rise);
  return -x / Math.sqrt(radius * radius - x * x);
}

describe("the profile", () => {
  it("is symmetric about the middle of the spine", () => {
    for (const x of [0.1, 0.25, 0.4, 0.49]) {
      expect(slopeAt(-x, hardback)).toBeCloseTo(-slopeAt(x, hardback), 12);
      expect(slopeAt(-x, paperback)).toBeCloseTo(-slopeAt(x, paperback), 12);
    }
  });

  it("gives a paperback a genuinely flat face and a hardback none", () => {
    // Perfect binding is a flat *face* whose card turns at each edge; a backed
    // hardback is curved all the way across. `roll` is what says which, and if it
    // were ignored the two bindings would shade identically.
    expect(slopeAt(0.2, paperback)).toBe(0);
    expect(slopeAt(0.35, paperback)).toBe(0);
    expect(Math.abs(slopeAt(0.45, paperback))).toBeGreaterThan(0);

    expect(Math.abs(slopeAt(0.2, hardback))).toBeGreaterThan(0);
  });

  it("finishes the turn at the joint, where a circle stops less than a third of the way", () => {
    // #56's whole complaint: a circle cannot both rise and turn 90°, so #55's arc
    // leaves the hinge a hard step. This is the number that decided the ellipse.
    const circular =
      (Math.atan(Math.abs(circularSlopeAt(0.5, hardback.rise))) * 180) /
      Math.PI;

    expect(circular).toBeLessThan(30);
    expect(turnAt(0.5, hardback)).toBeGreaterThan(60);
    expect(turnAt(0.5, paperback)).toBeGreaterThan(60);
  });

  it("is finite at the joint, where the true slope is not", () => {
    // The clamp is what makes the edge steep rather than broken: an infinite
    // slope is an undefined normal, and an undefined normal is a black pixel.
    expect(Number.isFinite(slopeAt(0.5, hardback))).toBe(true);
    expect(Number.isFinite(slopeAt(-0.5, paperback))).toBe(true);
  });

  it("is linear in the rise, which is what lets the rise ride in normalScale", () => {
    // #65's cost table rests on this: `normalScale` multiplies the decoded `xy`
    // before renormalising, which is exactly a slope multiply — so a per-book rise
    // is free against a shared map, and only `roll` can ever need a second one.
    // If the rise entered non-linearly, that whole finding would be wrong.
    for (const x of [0.3, 0.45, 0.5]) {
      const single = slopeAt(x, { rise: 0.05, roll: 1 });
      const double = slopeAt(x, { rise: 0.1, roll: 1 });
      expect(double).toBeCloseTo(single * 2, 12);
    }
  });

  it("calls a profile flat only when it describes no cross-section", () => {
    // Off has to short-circuit to *no map*, not to a map scaled by zero: a flat
    // map is 2 KB, a texture unit and a `#define` on every spine on the shelf, all
    // to say nothing.
    expect(isFlat({ rise: 0, roll: 0 })).toBe(true);
    expect(isFlat({ rise: 0, roll: 1 })).toBe(true);
    expect(isFlat({ rise: 0.1, roll: 0 })).toBe(true);
    expect(isFlat(hardback)).toBe(false);
    expect(isFlat(paperback)).toBe(false);
  });

  it("ships a paperback that is not flat", () => {
    // Against what #55, #57 and the map all said in writing. A flat `{ 0, 0 }`
    // would leave the hard colour step #56 diagnosed on the 60% of the shelf that
    // is not hardback — so this is the shipped value, asserted as one.
    expect(paperback).toEqual({ rise: 0.03, roll: 0.22 });
    expect(hardback).toEqual({ rise: 0.125, roll: 1 });
  });
});
