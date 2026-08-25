import { describe, expect, it } from 'vitest';
import { encodingScale, heightAt, slopeProfile } from './page-edges.ts';

/**
 * The striation profile, as arithmetic.
 *
 * The map itself needs a canvas and is judged on #54's close-ups. What is
 * testable — and worth testing, because two of them are properties the design
 * argument rests on — is the height field and the way it is encoded.
 */

describe('the striation profile', () => {
  it('is genuinely periodic, which is what the wrapping slope assumes', () => {
    // The profile lifted from #54's prototype was **not**: gathering 14 drew
    // different noise from gathering 0, so the height field stepped by 0.025 at
    // `u = 1` and `slopeProfile`'s wrapping central difference reported a ~25
    // slope across a smooth surface. That matters past one texel, because
    // `encodingScale` normalises the map against its steepest slope — a spike at
    // the seam quietly compresses every real leaf beside it.
    expect(heightAt(0)).toBeCloseTo(heightAt(1), 12);
    for (const u of [0.1, 0.25, 0.5, 0.73, 0.99]) {
      expect(heightAt(u)).toBeCloseTo(heightAt(u + 1), 12);
      expect(heightAt(u)).toBeCloseTo(heightAt(u - 1), 12);
    }
  });

  it('has no slope at the seam that the surface does not really have', () => {
    // The consequence, stated as the number that would have gone wrong: the
    // steepest slope in the map must belong to a leaf, not to the wrap.
    const slopes = slopeProfile();
    const atSeam = Math.abs(slopes[0] ?? 0);

    let steepest = 0;
    for (const slope of slopes) steepest = Math.max(steepest, Math.abs(slope));

    expect(atSeam).toBeLessThan(steepest);
  });

  it('is the same block on every reload', () => {
    // `Math.random()` here would give each mount a different shelf, against the
    // rule `heightFor`'s hash exists to keep: a book keeps its shape.
    const once = slopeProfile(64);
    const again = slopeProfile(64);
    expect([...once]).toEqual([...again]);
  });

  it('carries both scales — the coarse grouping and the leaves inside it', () => {
    // The level-of-detail argument depends on there being two: mipmaps average
    // the fine lines away as a book recedes and leave the coarse profile. One
    // scale would mean the map either shimmers at distance or has nothing up
    // close, and no filtering could fix either.
    const samples = 4096;
    let fineTurns = 0;
    let previous = heightAt(0);
    let rising = true;

    for (let i = 1; i <= samples; i += 1) {
      const value = heightAt(i / samples);
      const nowRising = value > previous;
      if (nowRising !== rising) {
        fineTurns += 1;
        rising = nowRising;
      }
      previous = value;
    }

    // Roughly one peak per leaf: 14 gatherings x 11 leaves, turning twice each.
    expect(fineTurns).toBeGreaterThan(200);

    // And the gathering envelope is there underneath: sampled at gathering
    // centres, the block is not one flat level.
    const centres = Array.from({ length: 14 }, (_, index) => heightAt((index + 0.5) / 14));
    const coarseTurns = new Set(centres.map((value) => value.toFixed(2))).size;
    expect(coarseTurns).toBeGreaterThan(5);
  });

  it('derives the encoding scale from the steepest slope it actually has', () => {
    // The trap this replaces: a constant chosen for one `LEAVES_PER_GATHERING`
    // saturates at another, and the relief becomes hard black-and-white edges
    // rather than paper. Whatever the profile's steepness, the steepest texel
    // must land just short of the encoding's limit — never past it.
    const slopes = slopeProfile();
    const scale = encodingScale(slopes);

    let steepest = 0;
    for (const slope of slopes) steepest = Math.max(steepest, Math.abs(slope));

    expect(steepest * scale).toBeCloseTo(0.92, 6);
    expect(steepest * scale).toBeLessThan(1);
  });

  it('scales a flatter profile up rather than leaving it inert', () => {
    // The same property from the other side: the derivation has to react to the
    // profile, not merely clamp it. A profile half as steep gets twice the scale.
    const slopes = slopeProfile();
    const halved = new Float32Array(slopes.map((slope) => slope / 2));

    expect(encodingScale(halved)).toBeCloseTo(encodingScale(slopes) * 2, 6);
  });

  it('says nothing at all about a flat profile, rather than dividing by zero', () => {
    expect(encodingScale(new Float32Array(16))).toBe(0);
  });
});
