/**
 * G59 (`large-library-lit`) — a large library's bookcase must still be visible.
 *
 * A 273-book library rendered as a black page and every gate was green (#383).
 * The shelf drew every book, then the fog — whose range was a constant while the
 * camera backed off with the bookcase — painted all of them the background
 * colour. `pnpm smoke:render` counted books and distinct colours on a 50-book
 * shelf, where the fog never reached, and no check looked at a tall bookcase at
 * all. Nothing *failed*; the picture was simply not of books.
 *
 * So this reads the picture. `smoke-render.ts` renders three pages over one build
 * and hands their pixels here:
 *
 * - **the control** — the 50-book shelf the owner signs off on;
 * - **the large library** — the page being judged;
 * - **the plant** — the large library with the fog pulled over the bookcase
 *   through `?tune=`, which is the defect itself, on every run.
 *
 * ⚠️ **The plant is the half that makes the other half mean anything.** A zero
 * needs a control through the same pipe: a measurement that cannot tell a black
 * bookcase from a lit one would call both "lit", and this would be the green
 * check that let #383 through, one level up. If the plant reads as lit, the gate
 * fails on the instrument, before it says a word about the library.
 *
 * Pure, and the pixels come in as a buffer, so every verdict here is planted in
 * `large-library-lit.test.ts` without a browser.
 */

/** A frame as `gl.readPixels` returns it: RGBA, **bottom row first**. */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  /**
   * The rectangle the books project into, in buffer pixels from the **top**
   * left, inclusive: `[x0, y0, x1, y1]`. Where the bookcase is on screen, as the
   * page's own projection says — not a region guessed from the layout.
   */
  readonly box: readonly [number, number, number, number];
}

/** How the bookcase stands against the room behind it, in luminance 0–255. */
export interface Lighting {
  /** Mean luminance over the books' rectangle. */
  readonly bookcase: number;
  /** Median luminance of the canvas's four corners: the room, never the bookcase. */
  readonly room: number;
}

/**
 * The large library must stand at least this fraction as far above the room as
 * the 50-book shelf does.
 *
 * **A judgement, and a loose one on purpose.** It is not derived from what the
 * large page measures today — a floor set against its own population only says
 * the page has not changed. Half is "still plainly a bookcase": it lets a tall
 * bookcase be dimmer than a short one, which it legitimately is — the lamp is a
 * point light, and seventeen shelves reach past it — and it goes red long
 * before black. The fogged page this exists for stood at **0.00** of the
 * control, and 240 books, which the owner called very dark, at 0.16.
 */
export const LIT_FLOOR = 0.5;

/**
 * The least the control itself must stand above the room.
 *
 * Below this the control is dark too, and a ratio against it would pass a black
 * large library whenever the whole shelf went dark together. Set well under the
 * 50-book shelf's contrast and well over zero.
 */
export const MIN_CONTROL_CONTRAST = 20;

/** Side of the square sampled at each corner for the room. */
const CORNER = 8;

/** Rec. 709 luma, on the encoded bytes — what the eye reads off the screen. */
function luma(pixels: Uint8Array, index: number): number {
  return (
    0.2126 * (pixels[index] ?? 0) +
    0.7152 * (pixels[index + 1] ?? 0) +
    0.0722 * (pixels[index + 2] ?? 0)
  );
}

/** Luminance at `(x, y)` counted from the top left, on a bottom-row-first buffer. */
function at(frame: Frame, x: number, y: number): number {
  return luma(frame.pixels, ((frame.height - 1 - y) * frame.width + x) * 4);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** The frame's bookcase and room luminance. */
export function lightingOf(frame: Frame): Lighting {
  const clampX = (x: number): number => Math.min(frame.width - 1, Math.max(0, Math.round(x)));
  const clampY = (y: number): number => Math.min(frame.height - 1, Math.max(0, Math.round(y)));
  const [x0, y0, x1, y1] = [
    clampX(frame.box[0]),
    clampY(frame.box[1]),
    clampX(frame.box[2]),
    clampY(frame.box[3]),
  ];

  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      sum += at(frame, x, y);
      count += 1;
    }
  }

  const corners: number[] = [];
  const side = Math.min(CORNER, frame.width, frame.height);
  for (const left of [0, frame.width - side]) {
    for (const top of [0, frame.height - side]) {
      for (let y = top; y < top + side; y += 1) {
        for (let x = left; x < left + side; x += 1) corners.push(at(frame, x, y));
      }
    }
  }

  return { bookcase: count === 0 ? 0 : sum / count, room: median(corners) };
}

/** How far the bookcase stands above the room. Negative when it is darker. */
export function contrast(lighting: Lighting): number {
  return lighting.bookcase - lighting.room;
}

/** The three pages, measured. */
export interface LitPages {
  readonly control: Lighting;
  readonly large: Lighting;
  readonly planted: Lighting;
}

/** What is wrong, in sentences; empty when the large library is lit. */
export function litFailures(pages: LitPages): string[] {
  const control = contrast(pages.control);
  const large = contrast(pages.large);
  const planted = contrast(pages.planted);
  const floor = control * LIT_FLOOR;
  const fixed = (value: number): string => value.toFixed(1);

  // The control first: every other verdict is a ratio against it.
  if (control < MIN_CONTROL_CONTRAST) {
    return [
      `the 50-book control page is itself dark — its bookcase stands ${fixed(control)} above ` +
        `the room, under ${String(MIN_CONTROL_CONTRAST)} — so there is nothing to measure the ` +
        'large library against',
    ];
  }

  const failures: string[] = [];
  // Then the instrument: if it cannot see the planted black page, it cannot see
  // the real one, and a green verdict on the large library would mean nothing.
  if (planted >= floor) {
    failures.push(
      `the planted fog did not darken the bookcase — it stands ${fixed(planted)} above the room ` +
        `against a floor of ${fixed(floor)} — so this check cannot see a black bookcase, and ` +
        'its verdict on the large library means nothing',
    );
  }
  if (large < floor) {
    failures.push(
      `the large library renders dark: its bookcase stands ${fixed(large)} above the room, ` +
        `against ${fixed(control)} for the 50-book shelf — under ${String(LIT_FLOOR)} of it. ` +
        'The fog range, the lights and the camera framing are the places to look (#383)',
    );
  }
  return failures;
}
