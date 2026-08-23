/**
 * How much cover art a phone can hold.
 *
 * The shelf is a WebGL scene, so every cover that ships is not a JPEG on the
 * wire — it is an *uncompressed* texture in GPU memory. A 2400×2400 audiobook
 * cover is 640 KB on disk and 30 MB once decoded, and the browser uploads all of
 * them before the first frame.
 *
 * That is what killed it. Thirty-one covers straight from the vault measured
 * 8.4 MB on disk and **314 MB decoded** — comfortably past the point where a
 * mobile renderer is killed. The desktop never complained, because a desktop GPU
 * has room to not complain.
 *
 * Two numbers, because two different things go wrong:
 *
 * - `MAX_COVER_EDGE` bounds any *single* cover. One 2400px image is 30 MB on its
 *   own, and no shelf ever shows a cover at more than a few hundred pixels.
 * - `TEXTURE_BUDGET_BYTES` bounds the *total*, which is the thing that actually
 *   crashes. It scales with the size of the library, so capping each file alone
 *   would only move the crash further down the shelf — a big enough library
 *   blows the budget with perfectly reasonable covers in it.
 */

import sharp from "sharp";

/**
 * Longest edge of a staged cover, in pixels.
 *
 * A face-out cover occupies roughly a third of the viewport's height, so even on
 * a 2× phone or a large desktop display it is a few hundred pixels of screen.
 * 512 is comfortably above what is ever sampled and 22× cheaper than a 2400px
 * original. Orbiting right up to one book is the case where this could read
 * soft; that is a visible cost, judged against a screenshot. A crash is not
 * judged against anything.
 */
export const MAX_COVER_EDGE = 512;

/**
 * Bytes a decoded texture occupies on the GPU.
 *
 * Four bytes per pixel (RGBA — the JPEG's compression is long gone by this
 * point), plus a third again for the mip chain three.js generates. This is an
 * estimate rather than a measurement, and it is the right kind of estimate: it
 * ignores driver padding and NPOT rounding, both of which only make the real
 * figure larger.
 */
export function decodedTextureBytes(width: number, height: number): number {
  return width * height * 4 * (4 / 3);
}

/**
 * Total decoded cover art a build may ship.
 *
 * Not the whole story of what a phone has to hold — there is also the shadow
 * map, an antialiased framebuffer at device pixel ratio, and the page itself —
 * so this is deliberately well under the couple of hundred megabytes at which
 * renderers start dying, not right up against it.
 *
 * **This is a ceiling the library grows into.** At `MAX_COVER_EDGE` a cover
 * costs about 1.1 MB, so this holds somewhere north of eighty books; the brief's
 * 200-book target does not fit and is not meant to. When it goes red, the answer
 * is to stop uploading every cover at once — not to raise the number. A gate
 * that gets raised whenever it fails is a comment.
 */
export const TEXTURE_BUDGET_BYTES = 96 * 1024 * 1024;

/** What a cover measures, or nothing if it is not an image that can be read. */
export interface CoverSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Reads a cover's pixel dimensions.
 *
 * Here rather than inline at each call site because three places need it — the
 * staging step, the aspect-ratio stamp, and the gate that holds both to the
 * budget above — and because a cover that cannot be read is not an error. A
 * vault may hold anything under `covers/`; the shelf falls back to a generated
 * spine, so an unreadable file is a missing cover rather than a failed build.
 */
export async function measureCover(
  path: string,
): Promise<CoverSize | undefined> {
  try {
    const { width, height } = await sharp(path).metadata();
    if (width === undefined || height === undefined) return undefined;
    return { width, height };
  } catch {
    return undefined;
  }
}
