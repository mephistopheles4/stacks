/**
 * Which provider answered. Not the same question as `CoverSource`, which
 * records where a cover's *bytes* came from — the metadata layer completes one
 * provider's record from another's, and Apple is consulted for artwork alone.
 *
 * `oreilly` supplies metadata only, so it never appears as a `CoverSource`.
 */
export type MetadataSource = 'open-library' | 'google-books' | 'oreilly';

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
  /**
   * Google's volume id, when this record came from Google.
   *
   * Provider-specific on purpose, and it earns its place: **a Google search
   * response and the detail endpoint disagree about the same volume.**
   * `An8Q0QEACAAJ` reports `pageCount: 0` inside `/volumes?q=` and `368` from
   * `/volumes/An8Q0QEACAAJ` — same volume, same key, same minute. So a page
   * count taken from a search result is not trustworthy, and re-asking needs
   * the id. The ISBN will not do instead: the volumes this happens to are
   * exactly the thin records that carry no ISBN either.
   */
  readonly volumeId?: string;
  readonly source: MetadataSource;
}

/**
 * A record's cover URLs, best first, for handing to the downloader.
 *
 * The preference — large before small — is a rule about these two fields, so it
 * is stated here rather than at each call site. It was written out three times,
 * and getting it backwards is silent: you keep Google's ~128px thumbnail
 * instead of the large image, every test still passes, and the shelf is quietly
 * worse. Gaps are left in rather than filtered out; `cacheCover` skips them.
 *
 * Takes an optional record because the caller with a real reason to differ —
 * the importer, which prepends a print edition's cover to the export's own
 * artwork — may not have found one.
 */
export function coverUrls(metadata: BookMetadata | undefined): readonly (string | undefined)[] {
  return [metadata?.coverUrlLarge, metadata?.coverUrl];
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
