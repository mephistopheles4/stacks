import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { coverSourceFor, type CoverSource } from './cover-source.ts';
import { spineColour } from './dominant-colour.ts';
import type { VaultAdapter } from '../adapters/vault-adapter.ts';

export interface CachedCover {
  /** Vault-relative, as it goes into the note's `cover:` key. */
  readonly relativePath: string;
  readonly spineColor?: string;
  /**
   * Which provider these bytes came from, taken from the URL that actually won.
   *
   * Not from whichever provider answered the metadata lookup: the metadata layer
   * completes one provider's record from another's and consults Apple purely for
   * artwork, so the two routinely differ — and it is the bytes whose terms apply.
   */
  readonly source: CoverSource;
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
 * **Gaps in the list are the caller's normal case, not an error.** Candidates
 * come from optional metadata fields, so every caller held the same filter and
 * the same "is there anything left" guard before calling — three copies of one
 * decision that belongs here, next to the empty-string check that was already
 * here. An exhausted list and a list that was never populated both mean the
 * same thing to a caller: no cover.
 *
 * Every failure returns `undefined` rather than throwing: a missing cover
 * downgrades how a book looks, it does not stop the book being logged.
 */
export async function cacheCover(
  urls: string | readonly (string | undefined)[],
  title: string,
  vault: VaultAdapter,
): Promise<CachedCover | undefined> {
  const candidates = (typeof urls === 'string' ? [urls] : urls).filter(
    (u): u is string => u !== undefined && u.length > 0,
  );

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
    source: coverSourceFor(winner.url),
  };
}

/**
 * Hard limits on a cover download.
 *
 * The bytes here are the least trusted input this tool handles. The URL comes
 * from a third-party API response rather than from this code, and the bytes go
 * straight into `sharp`, a native decoder — so a provider having a bad day, or
 * a DNS answer that is not the provider at all, reaches a C library through
 * this function. A decoder is the wrong place to discover that a response was
 * 400 MB of something else.
 *
 * 20 MB is far above any real cover — Apple's largest artwork in the owner's
 * vault is ~2400px and about 1 MB — and far below anything that threatens the
 * heap. The timeout is long enough for a slow CDN and short enough that a
 * socket which opens and then says nothing does not hang `stacks add` forever;
 * without it there is no upper bound at all, because `fetch` has no default.
 */
const MAX_COVER_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * What the bytes actually are, whatever the URL and the response header claimed.
 *
 * This is the authoritative check and the reason the others can stay lenient: a
 * `Content-Type` is a claim by the server, and the extension in a URL is not
 * even that. These twelve bytes are the thing `sharp` is about to parse.
 *
 * The allowlist is exactly the three formats a cover arrives as, and it is an
 * allowlist for the same reason `private:` is — a format nobody considered must
 * not be admitted by default. `sharp` will also decode SVG, TIFF and AVIF;
 * SVG especially is not an image but a document, with its own parser and its
 * own rules about external references, and nothing here has any reason to hand
 * a provider's response to that.
 */
export function looksLikeImage(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return true;
  // WebP is a RIFF container: "RIFF" <4-byte length> "WEBP".
  return (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

/**
 * The body, or `undefined` if it runs past the cap.
 *
 * `Content-Length` is a claim like any other: it is absent under chunked
 * encoding and it can simply be wrong. Counting what actually arrives is what
 * makes the cap a limit rather than a request, and stopping mid-stream is what
 * makes an endless response cost 20 MB instead of the heap — `arrayBuffer()`
 * would have to buffer all of it before anything could measure it.
 */
async function readCapped(body: ReadableStream<Uint8Array>): Promise<Buffer | undefined> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.length;
      if (total > MAX_COVER_BYTES) return undefined;
      chunks.push(value);
    }
  } finally {
    // Releases the socket whether we finished or bailed out over the cap.
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks);
}

export async function download(url: string): Promise<Buffer | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || response.body === null) return undefined;

    // An error page served with HTTP 200 is a documented provider behaviour
    // here — Open Library answers an ISBN miss that way — so a response that
    // announces itself as anything but an image is refused before its body is
    // read. Absent is tolerated: some CDNs omit it, and the magic-byte check
    // below is the one that actually decides.
    const declaredType = response.headers.get('content-type');
    if (declaredType !== null && !declaredType.toLowerCase().trimStart().startsWith('image/')) {
      return undefined;
    }

    // Refusing on the declared length is the only check that costs nothing to
    // fail — no body is transferred at all.
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) return undefined;

    const bytes = await readCapped(response.body);
    if (bytes === undefined) return undefined;

    // Open Library serves a tiny placeholder for "no cover on file".
    if (bytes.length < 1024) return undefined;

    return looksLikeImage(bytes) ? bytes : undefined;
  } catch {
    // Includes the abort: a timeout is a failed download, not an exception for
    // a caller that already treats every failure as "no cover".
    return undefined;
  } finally {
    clearTimeout(timer);
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
