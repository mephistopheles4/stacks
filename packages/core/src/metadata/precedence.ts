import type { BookMetadata, MetadataSource } from './types.ts';

/**
 * Who wins which field — the table, as data.
 *
 * **One default order with a short list of named per-field exceptions, each a
 * fixed provider order and never a rule about the value.** Rules like *"prefer
 * the most precise date"* read better and were rejected deliberately: they only
 * approximate an ordering anyway ("prefer a full date" *is* "put Open Library
 * last for dates"), while a fixed table is testable with one fixture per field,
 * states itself in a line, and can be asserted by a gate. A quality judgement
 * embedded in the merge would have to be re-encoded in the gate to check it.
 *
 * ⚠️ **The accepted cost is real: when a provider's data quality changes, this
 * table is wrong until a human notices and edits it.** Nothing detects that.
 *
 * This file is one half of a contract seam. `docs/spec/metadata-merge.md` §1 is
 * the other, and the precedence gate holds them to each other in both
 * directions — red when the code prefers a provider the document never names,
 * and red when the document names an order the code does not implement.
 *
 * See docs/adr/0044-precedence-is-a-table-not-a-judgement.md.
 */

/**
 * Governs `title`, `author`, `isbn` and `publisher`.
 *
 * It describes what the code already did rather than changing it: Open Library
 * is the primary, Google completes its gaps, O'Reilly answers for the books
 * neither has, and Apple is asked last. The *ask*-order is unchanged — O'Reilly
 * is still only consulted when neither of the first two found the book, which is
 * a quota decision with a far larger blast radius than this table.
 */
export const DEFAULT_ORDER: readonly MetadataSource[] = [
  'open-library',
  'google-books',
  'oreilly',
  'apple-books',
];

/** The fields this module merges across contributors. */
export const MERGED_FIELDS = ['publisher', 'published', 'subjects', 'description'] as const;

export type MergedField = (typeof MERGED_FIELDS)[number];

/**
 * The named exceptions, each a fixed provider order.
 *
 * A field absent from this map takes `DEFAULT_ORDER`.
 *
 * `pages` and `cover` are exceptions too, and they are **not** here: both are
 * implemented as mechanisms rather than as an ordering over gathered records —
 * `completePages` re-asks Google for the volume it already chose, and the cover
 * queue is assembled by the downloader from `coverUrlLarge` before `coverUrl`.
 * The gate names them and asserts they are absent from this map, so "missing"
 * and "forgotten" cannot look the same.
 */
export const FIELD_ORDER: Readonly<Partial<Record<MergedField, readonly MetadataSource[]>>> = {
  /** Open Library gives a bare `"2008"`; the other three give full dates. */
  published: ['google-books', 'oreilly', 'apple-books', 'open-library'],
  /**
   * Google's `categories` and Apple's `genres` are short and curated; Open
   * Library's 34 raw subjects for one book are noise in a scalar capped at five.
   */
  subjects: ['google-books', 'apple-books', 'oreilly', 'open-library'],
  /**
   * Open Library has none at all. O'Reilly only *has* a record when it is an
   * O'Reilly book, where its own copy is authoritative.
   */
  description: ['oreilly', 'google-books', 'apple-books'],
};

/**
 * The contributors to one book: a provider's record, under that provider.
 *
 * Only records **confirmed to be this book** ever land here — by ISBN lookup, or
 * by `isProbablySameBook`. That is the same bar `docs/spec/provider-provenance.md`
 * §1 defines a contributor by, and it is deliberately the identity question
 * rather than the data-flow one.
 */
export type Contributors = Map<MetadataSource, BookMetadata>;

/**
 * Fills the merged fields from whichever contributor wins each.
 *
 * **Absent-only, like every other write in this project.** A value the primary
 * already carries is never replaced — the precedence order decides who fills a
 * *gap*, not who overrules a fact already established.
 */
export function mergeFields(primary: BookMetadata, contributors: Contributors): BookMetadata {
  const filled: Record<string, unknown> = { ...primary };

  for (const field of MERGED_FIELDS) {
    if (filled[field] !== undefined) continue;
    for (const source of FIELD_ORDER[field] ?? DEFAULT_ORDER) {
      const value = contributors.get(source)?.[field];
      if (value !== undefined) {
        filled[field] = value;
        break;
      }
    }
  }

  // The ids are not a precedence question: each comes from its own provider or
  // from nowhere. A book Apple never matched has no `appleTrackId`, and no other
  // provider can supply one — which is why an unfillable gap stays a gap and is
  // re-asked forever rather than being closed with a sentinel.
  for (const [field, source] of ID_FIELDS) {
    if (filled[field] === undefined) {
      const value = contributors.get(source)?.[field];
      if (value !== undefined) filled[field] = value;
    }
  }

  return filled as unknown as BookMetadata;
}

/**
 * Each contributor id and the one provider that can supply it.
 *
 * `volumeId` predates this work and is spelled for Google's own field, the same
 * convention the other three follow — the key names the provider's field, which
 * for O'Reilly is the guard that stops `archive_id` being pasted where `ourn`
 * belongs.
 */
const ID_FIELDS: readonly (readonly [keyof BookMetadata, MetadataSource])[] = [
  ['volumeId', 'google-books'],
  ['appleTrackId', 'apple-books'],
  ['openLibraryOlid', 'open-library'],
  ['oreillyOurn', 'oreilly'],
];
