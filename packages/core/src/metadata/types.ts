export type MetadataSource = 'open-library' | 'google-books';

/** What a lookup yields, normalised across providers. */
export interface BookMetadata {
  readonly title: string;
  readonly author?: string;
  readonly isbn?: string;
  readonly pages?: number;
  readonly coverUrl?: string;
  /**
   * True when `coverUrl` was *guessed* rather than reported.
   *
   * Open Library's by-ISBN cover endpoint answers for any ISBN, with a tiny
   * placeholder when it holds nothing — so a URL built from an ISBN is a
   * hypothesis, not a fact. Without this distinction such a URL makes a record
   * look complete, gap-filling never runs, and the book ends up with no cover
   * at all when the other provider had one.
   */
  readonly coverIsSpeculative?: boolean;
  /**
   * A higher-resolution cover to try before `coverUrl`.
   *
   * Only a candidate: Google's larger sizes are sometimes a proper cover and
   * sometimes the publisher's jacket artwork, and which you get varies by
   * title. The downloader keeps whichever is cover-shaped.
   */
  readonly coverUrlLarge?: string;
  readonly source: MetadataSource;
}

/** Narrows an unknown JSON body to an indexable object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}
