import type { BookInput } from '../types.ts';
import { keyIfPresent } from '../key-if-present.ts';

/**
 * Maps a Libation Audible-library export into book notes.
 *
 * Pure: takes parsed JSON, returns `BookInput`s. No network, no disk — which is
 * what makes the mapping testable against a captured export without importing
 * anything.
 *
 * Two fields are deliberately never carried across:
 *
 * - `Account` is the owner's email address. It has no business in a note, still
 *   less in a build that might be published.
 * - `Description` is the publisher's marketing copy — someone else's
 *   copyrighted text, and note bodies are private anyway.
 */

/** Amazon's image CDN; `PictureLarge` is the full-resolution art. */
const IMAGE_CDN = 'https://m.media-amazon.com/images/I';

export interface AudibleImportOptions {
  /**
   * Use `DateAdded` as the finished date.
   *
   * The export carries no "date finished" at all — `DateAdded` is when Libation
   * last scanned the library, so this makes every book look finished on the
   * same day. Off by default because that is fiction; on when the owner would
   * rather have the shelf group by *something* than not group at all.
   */
  readonly dateAddedAsFinished?: boolean;
}

export interface AudibleBook {
  readonly input: BookInput;
  /** Where to fetch the cover, if the record names one. */
  readonly coverUrl?: string;
}

export function parseAudibleExport(
  data: unknown,
  options: AudibleImportOptions = {},
): AudibleBook[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((record) => toAudibleBook(record, options))
    .filter((book): book is AudibleBook => book !== undefined);
}

function toAudibleBook(record: unknown, options: AudibleImportOptions): AudibleBook | undefined {
  if (typeof record !== 'object' || record === null) return undefined;
  const fields = record as Record<string, unknown>;

  const base = text(fields['Title']);
  if (base === undefined) return undefined;

  const subtitle = text(fields['Subtitle']);
  const title = subtitle === undefined ? base : `${base}: ${subtitle}`;

  // Audible has no notion of "abandoned" or "wishlist" — it is finished or not.
  const finished = fields['IsFinished'] === true;
  const added = isoDate(fields['DateAdded']);

  const extra: Record<string, string | number | boolean> = {};
  const narrator = text(fields['NarratorNames']);
  const asin = text(fields['AudibleProductId']);
  const minutes = positiveInt(fields['LengthInMinutes']);
  const publisher = text(fields['Publisher']);

  if (narrator !== undefined) extra['narrator'] = narrator;
  if (asin !== undefined) extra['asin'] = asin;
  if (minutes !== undefined) extra['duration'] = formatDuration(minutes);
  if (publisher !== undefined) extra['publisher'] = publisher;
  extra['source'] = 'audible';

  const input: BookInput = {
    title,
    status: finished ? 'read' : 'reading',
    tags: tagsFrom(fields['CategoriesNames']),
    extra,
    ...keyIfPresent('author', text(fields['AuthorNames'])),
    ...keyIfPresent('rating', rating(fields['MyRatingOverall'])),
    ...keyIfPresent(
      'finished',
      finished && options.dateAddedAsFinished === true ? added : undefined,
    ),
    ...keyIfPresent('started', finished ? undefined : added),
  };

  return {
    input,
    ...keyIfPresent('coverUrl', imageUrl(fields['PictureLarge']) ?? imageUrl(fields['PictureId'])),
  };
}

/** Always tagged `audiobook`, so the shelf can tell them apart later. */
function tagsFrom(value: unknown): string[] {
  const raw = text(value);
  const categories =
    raw === undefined
      ? []
      : raw
          .split(';')
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0);
  return ['audiobook', ...categories];
}

function imageUrl(value: unknown): string | undefined {
  const id = text(value);
  return id === undefined ? undefined : `${IMAGE_CDN}/${id}.jpg`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${rest}m`;
}

/** Audible rates out of 5, same as the frontmatter contract. */
function rating(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : undefined;
}

function isoDate(value: unknown): string | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}
