/**
 * Reading an image's dimensions, and nothing else.
 *
 * Split out from `backfill-covers.ts` so that module takes a `MeasureCover`
 * function rather than importing sharp: its tests then describe cover shapes
 * directly, in the numbers measured off a real vault, instead of having to
 * generate real images to assert against.
 */

import sharp from "sharp";

export async function measureCover(
  path: string,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const { width, height } = await sharp(path).metadata();
    if (width === undefined || height === undefined) return undefined;
    return { width, height };
  } catch {
    // A cover the vault lost is reported by the caller, not fatal here.
    return undefined;
  }
}
