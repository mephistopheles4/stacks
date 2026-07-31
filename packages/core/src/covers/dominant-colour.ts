import sharp from 'sharp';

/**
 * The colour a book's spine should be, taken from its cover.
 *
 * Deliberately **not** sharp's built-in `stats().dominant`: that bins colours
 * and returns the bin's representative, so a cover that is exactly `#2f6d7a`
 * comes back as `#286878`. Close enough to look right, useless to assert on.
 *
 * Instead: bin coarsely to find the winning *region* of colour space, then
 * average the actual pixels inside that bin. On a flat fixture the average of
 * identical pixels is the exact colour, so tests can assert a real value; on a
 * real photographic cover it still yields a representative colour rather than
 * one arbitrary pixel.
 */

/** 4 bits per channel — 4096 bins. Coarse enough to survive JPEG noise. */
const BITS = 4;
const SHIFT = 8 - BITS;

/** Nearest-neighbour, so downsampling never invents colours that weren't there. */
const SAMPLE_WIDTH = 200;

/**
 * Real covers are usually printed on white and photographed against it, so the
 * single most common colour is very often the *margin*, not the book. Taken
 * literally that gives almost every spine the colour `#fefffe`.
 *
 * So near-white and near-black are set aside on the first pass and only used if
 * the cover genuinely has nothing else in it — a truly white cover still gets a
 * white spine, but a white border no longer wins.
 */
const LIGHT_LIMIT = 0.94;
const DARK_LIMIT = 0.06;

export async function dominantColour(imagePath: string): Promise<string | undefined> {
  let raw: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    raw = await sharp(imagePath)
      .resize({ width: SAMPLE_WIDTH, withoutEnlargement: true, kernel: 'nearest' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    // An unreadable or corrupt cover means no spine colour, not a failed build.
    return undefined;
  }

  const { data, info } = raw;
  const stride = info.channels;

  const winner = tally(data, stride, true) ?? tally(data, stride, false);
  if (winner === undefined) return undefined;

  return toHex(
    Math.round(winner.r / winner.n),
    Math.round(winner.g / winner.n),
    Math.round(winner.b / winner.n),
  );
}

interface Bucket {
  n: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The most populous colour bin, averaged over the real pixels inside it.
 *
 * With `skipExtremes`, near-white and near-black pixels are not counted at all;
 * returns `undefined` if that leaves nothing, which is the caller's signal to
 * try again counting everything.
 */
function tally(data: Buffer, stride: number, skipExtremes: boolean): Bucket | undefined {
  const bins = new Map<number, Bucket>();

  for (let i = 0; i + 2 < data.length; i += stride) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    if (skipExtremes) {
      // Rec. 601 luma — cheap and good enough to spot paper and ink.
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luma > LIGHT_LIMIT || luma < DARK_LIMIT) continue;
    }

    const bin = ((r >> SHIFT) << (BITS * 2)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);
    const bucket = bins.get(bin);
    if (bucket === undefined) {
      bins.set(bin, { n: 1, r, g, b });
    } else {
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    }
  }

  let winner: Bucket | undefined;
  for (const bucket of bins.values()) {
    if (winner === undefined || bucket.n > winner.n) winner = bucket;
  }
  return winner;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
