import { isProbablySameBook } from '../identity.ts';
import type { HttpGet } from './http.ts';
import { asRecord, firstString } from './types.ts';

/**
 * Apple Books, used for one thing: cover art.
 *
 * Not a metadata provider here. It earns its place because its artwork is the
 * best of the three by a distance — roughly 800x1200, correctly cropped to the
 * front cover, free and keyless. Open Library's community scans are patchy, and
 * Google's `thumbnail` is ~128px with no larger *cropped* version for many
 * titles.
 *
 * The catalogue is a store, so it is full of near-misses: searching "Staff
 * Engineer Will Larson" returns "Summary of Will Larson's Staff Engineer" as
 * the top hit. Every result is therefore checked against the book we already
 * have, and a cover is only taken when the titles and authors agree. Wrong art
 * is worse than none.
 */

const SEARCH = 'https://itunes.apple.com/search';

/**
 * Artwork comes back as a 100px URL with the size embedded in the path;
 * swapping it asks for a larger render of the same image.
 */
const ARTWORK_SIZE = /\/\d+x\d+bb?\.(jpg|png)$/;

export async function findCover(
  title: string,
  author: string | undefined,
  get: HttpGet,
): Promise<string | undefined> {
  const term = `${title} ${author ?? ''}`.trim();
  if (term.length === 0) return undefined;

  const body = asRecord(
    await get(`${SEARCH}?term=${encodeURIComponent(term)}&entity=ebook&limit=5`),
  );
  const results = Array.isArray(body?.['results']) ? body['results'] : [];

  for (const entry of results) {
    const item = asRecord(entry);
    if (item === undefined) continue;

    const found = firstString(item['trackName']);
    if (found === undefined) continue;

    const foundAuthor = firstString(item['artistName']) ?? '';
    if (!isProbablySameBook(`${title} ${author ?? ''}`, `${found} ${foundAuthor}`)) continue;

    const artwork = firstString(item['artworkUrl100']);
    if (artwork === undefined) continue;

    return artwork.replace(ARTWORK_SIZE, '/1200x1200bb.$1');
  }

  return undefined;
}
