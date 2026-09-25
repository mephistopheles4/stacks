/**
 * G59 (`large-library-lit`)'s pure half, against planted frames.
 *
 * The browser half runs in `pnpm smoke:render`, and it plants the defect there
 * too — the fog pulled over a real bookcase — on every run. These plant it
 * without a GPU, so the arithmetic that turns pixels into a verdict is held
 * in-process and reaches the mutation score.
 */
import { describe, expect, it } from 'vitest';
import {
  contrast,
  LIT_FLOOR,
  lightingOf,
  litFailures,
  MIN_CONTROL_CONTRAST,
  type Frame,
  type Lighting,
} from './large-library-lit.ts';

/** The shelf's room colour, `0x1a1613`, whose luma is 22.6. */
const ROOM: readonly [number, number, number] = [0x1a, 0x16, 0x13];

/**
 * A frame of room colour with one rectangle painted, laid out bottom row first
 * the way `gl.readPixels` returns it.
 */
function frame(
  width: number,
  height: number,
  box: readonly [number, number, number, number],
  paint: readonly [number, number, number],
): Frame {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
      const [r, g, b] = inside ? paint : ROOM;
      // Row `y` from the top is row `height - 1 - y` of the buffer.
      const index = ((height - 1 - y) * width + x) * 4;
      pixels.set([r, g, b, 255], index);
    }
  }
  return { width, height, pixels, box };
}

const lit = (bookcase: number, room = 22.6): Lighting => ({ bookcase, room });

describe('lightingOf', () => {
  it('reads the room off the corners and the bookcase off its rectangle', () => {
    const lighting = lightingOf(frame(64, 48, [20, 10, 40, 30], [200, 200, 200]));

    expect(lighting.room).toBeCloseTo(22.6, 1);
    expect(lighting.bookcase).toBeCloseTo(200, 5);
  });

  it('reads a bookcase painted the room colour as no contrast at all — the fogged page', () => {
    const lighting = lightingOf(frame(64, 48, [20, 10, 40, 30], ROOM));

    expect(contrast(lighting)).toBeCloseTo(0, 5);
  });

  it('counts rows from the top, though the buffer is stored bottom row first', () => {
    // Painted near the top of the picture. Reading the buffer top-first would
    // land the box on room-coloured rows at the bottom and read 22.6.
    const lighting = lightingOf(frame(64, 48, [10, 2, 50, 8], [255, 255, 255]));

    expect(lighting.bookcase).toBeCloseTo(255, 5);
  });

  it('clamps a box that runs off the canvas rather than reading outside it', () => {
    const lighting = lightingOf(frame(32, 32, [-10, -10, 100, 100], [90, 90, 90]));

    expect(lighting.bookcase).toBeGreaterThan(22.6);
    expect(Number.isFinite(lighting.bookcase)).toBe(true);
  });

  it('takes the median of the corners, so one bright corner does not move the room', () => {
    const planted = frame(64, 48, [20, 10, 40, 30], [200, 200, 200]);
    // Light up the top-left corner square only.
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1)
        planted.pixels.set([255, 255, 255, 255], ((47 - y) * 64 + x) * 4);
    }

    expect(lightingOf(planted).room).toBeCloseTo(22.6, 1);
  });
});

describe('litFailures', () => {
  const control = lit(86);

  it('passes a large library that is lit, with a plant that reads black', () => {
    expect(litFailures({ control, large: lit(70), planted: lit(22.6) })).toEqual([]);
  });

  it('fails the large library that rendered black in #383', () => {
    // The measured page: every bookcase pixel the fog colour.
    const failures = litFailures({ control, large: lit(22.6), planted: lit(22.6) });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('the large library renders dark');
  });

  it('fails a large library just under the floor, and passes one just over it', () => {
    // A black room, so the boundary is exact arithmetic rather than 22.6 + x - 22.6.
    const dark = lit(64, 0);
    const floor = contrast(dark) * LIT_FLOOR;
    const planted = lit(0, 0);

    expect(litFailures({ control: dark, large: lit(floor - 0.1, 0), planted })).toHaveLength(1);
    expect(litFailures({ control: dark, large: lit(floor, 0), planted })).toEqual([]);
  });

  it('fails on the instrument when the plant does not read black', () => {
    // A plant that did nothing — the tune ignored, say — measures like the real
    // page. The large library's own verdict must not stand on that.
    const failures = litFailures({ control, large: lit(70), planted: lit(70) });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('cannot see a black bookcase');
  });

  it('refuses to judge against a control that is itself dark', () => {
    const failures = litFailures({
      control: lit(22.6 + MIN_CONTROL_CONTRAST - 1),
      large: lit(22.6),
      planted: lit(22.6),
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('control page is itself dark');
  });
});
