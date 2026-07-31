import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { spineColour } from './dominant-colour.ts';
import type { VaultAdapter } from '../adapters/vault-adapter.ts';

export interface CachedCover {
  /** Vault-relative, as it goes into the note's `cover:` key. */
  readonly relativePath: string;
  readonly spineColor?: string;
}

/**
 * Downloads a cover into the vault and reads its spine colour.
 *
 * Every failure returns `undefined` rather than throwing: a missing cover
 * downgrades how a book looks, it does not stop the book being logged. Shared
 * by `stacks add` and by imports so the two cannot drift.
 */
/**
 * Widest a downloaded image can be, relative to its height, and still be one
 * cover rather than a jacket spread.
 *
 * Print covers run about 0.65 and audiobook art is square, so 1.05 admits both.
 * A front-and-back spread lands near 1.4 and above.
 */
const MAX_COVER_ASPECT = 1.05;

/**
 * Downloads the best available cover and reads its spine colour.
 *
 * Takes candidates in preference order because Google's larger images are
 * *sometimes* a high-resolution cover and sometimes the publisher's jacket
 * artwork — front, spine, back flap and crop marks together. Which one you get
 * varies by title, so the only reliable test is to fetch it and look at the
 * shape. A spread is passed over in favour of the next candidate, and if
 * nothing is cover-shaped the first that downloaded is used rather than
 * leaving the book bare.
 *
 * Every failure returns `undefined` rather than throwing: a missing cover
 * downgrades how a book looks, it does not stop the book being logged.
 */
export async function cacheCover(
  urls: string | readonly string[],
  title: string,
  vault: VaultAdapter,
): Promise<CachedCover | undefined> {
  const candidates = (typeof urls === 'string' ? [urls] : urls).filter((u) => u.length > 0);

  let fallback: { bytes: Buffer; url: string } | undefined;
  let chosen: { bytes: Buffer; url: string } | undefined;

  for (const url of candidates) {
    const bytes = await download(url);
    if (bytes === undefined) continue;

    if (await isBlank(bytes)) continue;

    const aspect = await aspectOf(bytes);
    if (aspect !== undefined && aspect <= MAX_COVER_ASPECT) {
      chosen = { bytes, url };
      break;
    }
    fallback ??= { bytes, url };
  }

  const winner = chosen ?? fallback;
  if (winner === undefined) return undefined;

  const extension = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(winner.url)?.[1]?.toLowerCase() ?? 'jpg';
  const filename = `${slug(title)}.${extension}`;
  const dir = vault.coverDir();
  const absolute = join(dir, filename);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(absolute, winner.bytes);
  } catch {
    return undefined;
  }

  const colour = await spineColour(absolute);
  return {
    relativePath: `covers/${filename}`,
    ...(colour === undefined ? {} : { spineColor: colour }),
  };
}

async function download(url: string): Promise<Buffer | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;

    const bytes = Buffer.from(await response.arrayBuffer());
    // Open Library serves a tiny placeholder for "no cover on file".
    return bytes.length < 1024 ? undefined : bytes;
  } catch {
    return undefined;
  }
}

/**
 * Google's "image not available" card, and anything else that is effectively
 * a blank page.
 *
 * It arrives with HTTP 200 and a plausible size, so nothing upstream can tell
 * it apart from real art — it replaced three correct audiobook covers before
 * this existed. A real cover carries a title and usually a picture, so it has
 * contrast; the placeholder is white with faint grey lettering, and every copy
 * measures the same.
 *
 * The threshold is deliberately tight. A pale cover — Staff Engineer's grey map
 * is one — must survive, so only near-white *and* near-flat is refused.
 */
const BLANK_BRIGHTNESS = 245;
const BLANK_VARIANCE = 25;

export async function isBlank(bytes: Buffer): Promise<boolean> {
  try {
    const stats = await sharp(bytes).stats();
    const channels = stats.channels.slice(0, 3);
    if (channels.length === 0) return false;

    const mean = channels.reduce((sum, c) => sum + c.mean, 0) / channels.length;
    const deviation = channels.reduce((sum, c) => sum + c.stdev, 0) / channels.length;
    return mean > BLANK_BRIGHTNESS && deviation < BLANK_VARIANCE;
  } catch {
    return false;
  }
}

async function aspectOf(bytes: Buffer): Promise<number | undefined> {
  try {
    const { width, height } = await sharp(bytes).metadata();
    if (width === undefined || height === undefined || height === 0) return undefined;
    return width / height;
  } catch {
    return undefined;
  }
}

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cover'
  );
}
