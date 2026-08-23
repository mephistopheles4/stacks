/**
 * Which provider answered. Not the same question as `CoverSource`, which
 * records where a cover's *bytes* came from — the metadata layer completes one
 * provider's record from another's, and Apple is consulted for artwork alone.
 *
 * `oreilly` is both, and the two still do not have to agree: a book Open
 * Library answered for can carry an O'Reilly cover, which is what `fillGaps`
 * produces when nothing else has art for it.
 */
export type MetadataSource =
  "open-library" | "google-books" | "oreilly" | "apple-books";

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
  /**
   * Apple's numeric `trackId`, when this record came from Apple.
   *
   * The match was always computed — `findRecord` runs `isProbablySameBook`
   * before it returns anything — and until now everything but the artwork URL
   * was thrown away. See docs/spec/provider-provenance.md.
   */
  readonly appleTrackId?: string;
  /** Open Library's edition id, e.g. `OL26445570M`. */
  readonly openLibraryOlid?: string;
  /** O'Reilly's `ourn`, e.g. `urn:orm:book:0642572352530`. */
  readonly oreillyOurn?: string;
  readonly publisher?: string;
  /**
   * The publication date **exactly as the provider gave it**.
   *
   * `"2008"` from Open Library and `"2027-02-25T00:00:00Z"` from O'Reilly are
   * both correct values for this field. Normalising here was considered and
   * rejected as the one irreversible option — undoing it means re-asking every
   * provider — so the note stores what it was told and the card renders the
   * first four-digit run. See docs/spec/metadata-merge.md §4.
   */
  readonly published?: string;
  /**
   * Categories, in the winning provider's own order, unjoined.
   *
   * A list here and a `; `-joined scalar in the note: the separator, the cap and
   * the fail-closed drop all belong to the write path, not to parsing. See
   * `subjects.ts`.
   */
  readonly subjects?: readonly string[];
  /** Plain text — markup is stripped at the provider, never stored. */
  readonly description?: string;
  readonly source: MetadataSource;
}

/**
 * Third-party prose arrives as markup and is stored as text.
 *
 * Apple's descriptions carry `<b>` and O'Reilly's arrive wrapped in
 * `<span><div><p>`. A note is a file the owner reads and hand-edits, so the tags
 * come off at the edge rather than in whatever renders it later — and `## About`
 * is written into a Markdown body, where a stray `<div>` would be passed
 * straight through by every renderer that reads it.
 *
 * Deliberately not an HTML parser: it drops tags, decodes the five entities that
 * actually appear, and collapses whitespace. Anything cleverer would be a
 * dependency for a field nobody renders as HTML.
 */
export function toPlainText(value: unknown): string | undefined {
  const raw = firstString(value);
  if (raw === undefined) return undefined;

  const text = stripTags(raw.replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n"))
    .replace(
      /&(amp|lt|gt|quot|#39|apos);/g,
      (_, name: string) => ENTITIES[name] ?? "",
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  return text.length === 0 ? undefined : text;
}

/**
 * Removes tags until there are none left, then removes the angle brackets.
 *
 * ⚠️ **A single pass is not enough, and CodeQL was right to say so**
 * (`js/incomplete-multi-character-sanitization`). One `replace(/<[^>]*>/g, '')`
 * over `<scr<x>ipt>` leaves `<script>` behind — the removal *creates* the tag it
 * was meant to remove. The loop closes that, and dropping any surviving `<` or
 * `>` closes the rest: after it, no angle bracket can reach the note at all.
 *
 * This is not a hypothetical XSS in this project — the text goes into a Markdown
 * body, and `BookRecord` has no field for a body, so no build can carry it. It
 * is fixed because the function's name is a claim, and a claim that holds only
 * for well-formed input is the kind of thing this repo has a gate about.
 */
function stripTags(value: string): string {
  let text = value;
  for (let previous = ""; previous !== text;) {
    previous = text;
    // A tag opens with a letter or a slash. `a < b and c > d` is prose, and a
    // looser `<[^<>]*>` eats the four words between the operators — which is a
    // sanitiser quietly deleting content, the other way to get this wrong.
    text = text.replace(/<\/?[a-zA-Z][^<>]*>/g, "");
  }
  return text.replace(/[<>]/g, "");
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
};

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
export function coverUrls(
  metadata: BookMetadata | undefined,
): readonly (string | undefined)[] {
  return [metadata?.coverUrlLarge, metadata?.coverUrl];
}

/** Narrows an unknown JSON body to an indexable object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}
