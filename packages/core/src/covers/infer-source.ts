/**
 * Guessing where a cover came from, from the shape of the file.
 *
 * `cover_source` is recorded at fetch time now, but every cover cached before
 * that key existed has none — and in the vault this was built against, that was
 * all of them. Re-fetching to find out would replace art that is already
 * correct, and asking the providers cannot prove anything about bytes already
 * on disk.
 *
 * What can be read off the files is their size, and the three providers serve
 * visibly different things:
 *
 *   Open Library  `-L.jpg` is capped at 500px on its long side, so its covers
 *                 arrive as 331x500, 338x500, 381x500 — always *exactly* 500
 *                 tall for a portrait cover. An unmistakable signature.
 *   Apple         `apple-books.ts` rewrites `artworkUrl100` upward, and the
 *                 results measured 778–2400px wide.
 *   Google        thumbnails, historically ~128px wide. None survived in the
 *                 vault this was measured against, because Apple was added
 *                 specifically to replace them.
 *
 * This is a heuristic and is named like one. It runs once, over covers whose
 * provenance is otherwise simply unknown, and it refuses rather than guesses
 * when the shape is ambiguous — `unknown` is a true statement ("looked, could
 * not tell"), and a confident wrong answer is worse than an honest absence.
 */

import type { CoverSource } from './cover-source.ts';

/** Open Library's `-L` cap. A portrait cover comes back exactly this tall. */
const OPEN_LIBRARY_MAX_EDGE = 500;

/** Below this, nothing but a thumbnail service is plausible. */
const THUMBNAIL_WIDTH = 250;

/** Above this, only the Apple rewrite produced anything in practice. */
const LARGE_ART_WIDTH = 700;

export interface CoverShape {
  readonly width: number;
  readonly height: number;
}

/**
 * The provider a cached cover most likely came from, or `undefined` when the
 * shape does not say.
 *
 * `undefined` and `'unknown'` are different answers and the caller decides
 * which to write: this returns "the shape is not diagnostic", and the caller
 * turns that into `unknown`, meaning "somebody looked".
 */
export function inferCoverSource(shape: CoverShape): CoverSource | undefined {
  const { width, height } = shape;
  if (width <= 0 || height <= 0) return undefined;

  const longEdge = Math.max(width, height);

  // Checked first: a 500-tall cover is Open Library's cap, and that is the
  // strongest signal available. Squares are excluded — Apple serves square
  // audiobook art, and a 500x500 could be either.
  if (longEdge === OPEN_LIBRARY_MAX_EDGE && width !== height) return 'open-library';

  if (width >= LARGE_ART_WIDTH) return 'apple-books';
  if (width <= THUMBNAIL_WIDTH) return 'google-books';

  // Between a thumbnail and full art, with no Open Library cap: could be a
  // resized anything. Say so rather than pick.
  return undefined;
}
