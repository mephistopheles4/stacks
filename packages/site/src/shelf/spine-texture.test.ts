import { describe, expect, it } from 'vitest';
import { bandFor, spineCanvasWidth, splitTitle } from './spine-texture.ts';

/**
 * The spine canvas's shape.
 *
 * Drawing it needs a canvas and is judged on #68's render. The *sizing* is
 * arithmetic, and it is the part that was a live defect rather than an effect:
 * one fixed 128x1024 canvas stretched onto a plane scaled `(thickness, height)`
 * distorted every letterform on the shelf.
 */

/** The plane a spine canvas is stretched onto, as a width-over-height ratio. */
function planeAspect(thickness: number, height: number): number {
  return thickness / height;
}

/** How much a letterform is stretched horizontally on that plane. */
function distortion(thickness: number, height: number): number {
  const canvas = spineCanvasWidth(thickness, height) / 1024;
  return planeAspect(thickness, height) / canvas;
}

describe('the spine canvas', () => {
  /** What the same book got before: one canvas width for every book alive. */
  function fixedDistortion(thickness: number, height: number): number {
    return planeAspect(thickness, height) / (128 / 1024);
  }

  it('carries the book’s own aspect exactly, anywhere inside the clamp', () => {
    for (const [thickness, height] of [
      [0.055, 0.78],
      [0.09, 0.86],
      [0.1, 0.9],
      [0.11, 0.95],
    ] as const) {
      expect(distortion(thickness, height)).toBeCloseTo(1, 1);
    }
  });

  it('ends the squeeze completely: nothing is set narrower than it should be', () => {
    // The half of the defect this does fix. A fixed canvas squeezed the thinnest
    // book's letterforms to 0.46x on this shelf and 0.87x on the owner's.
    for (let thickness = 0.055; thickness <= 0.16; thickness += 0.005) {
      for (const height of [0.78, 0.86, 0.95]) {
        expect(distortion(thickness, height)).toBeGreaterThanOrEqual(0.99);
      }
    }
    expect(fixedDistortion(0.055, 0.95)).toBeLessThan(0.5);
  });

  it('⚠️ leaves the worst-stretched book exactly as stretched as it was', () => {
    // The half it does not fix, asserted rather than left to be discovered.
    // #58's ceiling is a claim about how many pixels type needs; aspect is what
    // this function is for, and a thick book wants more than 128 texels. Every
    // book past the ceiling saturates and keeps its distortion.
    //
    // Raising `SPINE_CANVAS_MAX` to 256 turns this red, which is the point of
    // asserting it: it is one constant and an owner's call about bytes against
    // letterforms.
    const thickest = [0.16, 0.78] as const;

    expect(spineCanvasWidth(...thickest)).toBe(128);
    expect(distortion(...thickest)).toBeCloseTo(fixedDistortion(...thickest), 6);
    expect(distortion(...thickest)).toBeGreaterThan(1.6);
  });

  it('keeps a floor of pixels to set type in', () => {
    // Below it there is not enough canvas to put a letterform on at all.
    expect(spineCanvasWidth(0.0001, 0.95)).toBe(32);
  });

  it('gives every book a canvas, including the ones the cutoff used to skip', () => {
    // `MIN_LEGIBLE_THICKNESS` was 0.075, which is a page count of about 250. The
    // six books under it got no type at all; they get some now.
    expect(spineCanvasWidth(0.055, 0.95)).toBeGreaterThanOrEqual(32);
    expect(spineCanvasWidth(0.074, 0.9)).toBeGreaterThanOrEqual(32);
  });

  it('is narrower than the old canvas for the thinner half of the shelf', () => {
    // Where #68's per-book saving comes from — and why its shelf-wide cost still
    // went *up*: eight books gaining type outweighs the rest narrowing.
    expect(spineCanvasWidth(0.055, 0.95)).toBeLessThan(128);
    expect(spineCanvasWidth(0.09, 0.86)).toBeLessThan(128);
  });
});

describe('the title, which is what makes spines differ', () => {
  it('takes the main title as the text before the first colon', () => {
    expect(splitTitle('Staff Engineer: Leadership Beyond the Management Track')).toEqual({
      main: 'Staff Engineer',
      hasSubtitle: true,
    });
    expect(splitTitle('Nexus')).toEqual({ main: 'Nexus', hasSubtitle: false });
  });

  it('does not read a colon with nothing after it as a subtitle', () => {
    // A layout lever that fired on punctuation would put a hairline rule on a
    // spine with nothing to separate.
    expect(splitTitle('Why:').hasSubtitle).toBe(false);
    expect(splitTitle(': Something').hasSubtitle).toBe(false);
  });

  it('sets a short title large, heavy and in caps', () => {
    // The one title that can afford the room, and caps is what a real spine does
    // with it. #60's examples: NieR, Nexus, Effective, Vibe Coding, AI Snake Oil.
    for (const title of ['NieR', 'Nexus', 'Effective', 'Vibe Coding', 'AI Snake Oil']) {
      const band = bandFor(title);
      expect(band.caps, title).toBe(true);
      expect(band.weight, title).toBe(700);
      expect(band.tracking, title).toBeGreaterThan(0);
      expect(band.lines, title).toBe(1);
    }
  });

  it('wraps a long title to two lines rather than cutting it', () => {
    // What this replaces: the old canvas ended a 56-character title in an
    // ellipsis. A real spine sets it in two lines and smaller type.
    const band = bandFor('The Creative Brain in the Age of Artificial Intelligence');

    expect(band.lines).toBe(2);
    expect(band.caps).toBe(false);
    expect(band.weight).toBeLessThan(bandFor('Nexus').weight);
    expect(band.size).toBeLessThan(bandFor('Nexus').size);
  });

  it('moves monotonically from large and heavy to small and light', () => {
    // The bands are a range, not three unrelated treatments — which is the
    // difference between one publisher's imprint and noise.
    const [short, medium, long] = [
      bandFor('Nexus'),
      bandFor('The Tidal Engine'),
      bandFor('a'.repeat(40)),
    ];

    expect(short.size).toBeGreaterThan(medium.size);
    expect(medium.size).toBeGreaterThan(long.size);
    expect(short.weight).toBeGreaterThan(medium.weight);
    expect(medium.weight).toBeGreaterThan(long.weight);
  });

  it('splits at 12 and 28 characters, on the main title and not the whole string', () => {
    // Measured off the owner's shelf: main titles run 4-56 characters, and these
    // two cuts divide it roughly 5/15/13. A band chosen from the whole string
    // would put almost everything in `long`, since 23 of 33 carry a subtitle.
    expect(bandFor('a'.repeat(12)).lines).toBe(1);
    expect(bandFor('a'.repeat(12)).caps).toBe(true);
    expect(bandFor('a'.repeat(13)).caps).toBe(false);
    expect(bandFor('a'.repeat(28)).lines).toBe(1);
    expect(bandFor('a'.repeat(29)).lines).toBe(2);

    const long = 'Effective: Leadership Beyond the Management Track and Then Some';
    expect(long.length).toBeGreaterThan(28);
    expect(bandFor(splitTitle(long).main).caps).toBe(true);
  });
});
