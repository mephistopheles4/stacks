import sharp, { type Sharp } from 'sharp';

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

/** How much of the cover's left edge stands in for the spine. */
const SPINE_STRIP = 0.12;

export type Region = 'all' | 'edge';

/**
 * The colour to paint a book's spine.
 *
 * On a real book the printed sheet wraps continuously around the spine, so the
 * strip of artwork nearest the binding *is* the spine. Sampling that strip gets
 * far closer to the object on your shelf than averaging the whole jacket: a
 * cover that is mostly white field with a coloured band down one side has a
 * coloured spine, not a white one.
 *
 * Falls back to the whole cover when the edge has nothing in it but paper —
 * which happens when a cover image is padded with margins rather than cropped
 * to the artwork.
 */
export async function spineColour(imagePath: string): Promise<string | undefined> {
  return (await dominantColour(imagePath, 'edge')) ?? (await dominantColour(imagePath, 'all'));
}

export async function dominantColour(
  imagePath: string,
  region: Region = 'all',
): Promise<string | undefined> {
  let raw: { data: Buffer; info: { channels: number } };
  try {
    const pipeline = await pipelineFor(imagePath, region);
    if (pipeline === undefined) return undefined;
    raw = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    // An unreadable or corrupt cover means no spine colour, not a failed build.
    return undefined;
  }

  const { data, info } = raw;

  const withoutExtremes = tally(data, info.channels, true);
  // For the edge strip specifically, "nothing but paper" is the caller's cue to
  // fall back to the whole cover rather than to report the paper as the spine.
  const winner =
    region === 'edge' ? withoutExtremes : (withoutExtremes ?? tally(data, info.channels, false));
  if (winner === undefined) return undefined;

  return toHex(
    Math.round(winner.r / winner.n),
    Math.round(winner.g / winner.n),
    Math.round(winner.b / winner.n),
  );
}

/** Crop first, then downsample — cropping a resized image loses the edge. */
async function pipelineFor(imagePath: string, region: Region): Promise<Sharp | undefined> {
  if (region === 'all') {
    return sharp(imagePath).resize({
      width: SAMPLE_WIDTH,
      withoutEnlargement: true,
      kernel: 'nearest',
    });
  }

  // Trim the uniform border before looking at the edge. Cover images from Open
  // Library are scans sitting on white, so the leftmost pixels are the paper the
  // book was photographed against, not the book. Sampling those gave every real
  // book a near-white spine (#e7e7e7, #ecedeb) even after edge sampling — the
  // artwork's edge is only the artwork's edge once the padding is gone.
  const source = await trimmed(imagePath);

  const { width, height } = await sharp(source).metadata();
  if (width === undefined || height === undefined || width < 2 || height < 2) return undefined;

  return sharp(source).extract({
    left: 0,
    top: 0,
    width: Math.max(1, Math.round(width * SPINE_STRIP)),
    height,
  });
}

/**
 * How much of a cover must survive trimming for the trim to be believed.
 *
 * sharp trims whatever matches the top-left pixel, which on a scan is the paper
 * and on an edge-to-edge design is the artwork itself. Trimming a flat cover
 * therefore eats the design and leaves whatever stripe sits in the middle. If
 * most of the image disappears, the border was not a border.
 */
const MIN_TRIM_SURVIVAL = 0.35;

/** The cover with a genuine uniform margin removed, or the original. */
async function trimmed(imagePath: string): Promise<Buffer | string> {
  try {
    const original = await sharp(imagePath).metadata();
    if (original.width === undefined || original.height === undefined) return imagePath;

    const buffer = await sharp(imagePath).trim({ threshold: 12 }).toBuffer();
    const { width, height } = await sharp(buffer).metadata();
    if (width === undefined || height === undefined || width < 8 || height < 8) return imagePath;

    const survived = (width * height) / (original.width * original.height);
    return survived >= MIN_TRIM_SURVIVAL ? buffer : imagePath;
  } catch {
    return imagePath;
  }
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
 * returns `undefined` if that leaves nothing.
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

export { SPINE_STRIP };
