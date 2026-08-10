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
  /**
   * Built as a `BookMetadata` throughout, rather than as a bag of unknowns cast
   * back at the end.
   *
   * The first version accumulated into `Record<string, unknown>` and returned
   * `filled as unknown as BookMetadata` — a double cast at the exact point this
   * work adds seven fields, which is where strict typing was most worth having.
   * The two helpers below keep it honest: each closes over one field name and
   * the compiler checks that the value it writes belongs there.
   */
  let filled: BookMetadata = { ...primary };

  /**
   * ⚠️ **The primary's own value competes by its provider, not by being the
   * primary** — and getting that backwards made the whole table decorative.
   *
   * The first version skipped a field the primary already carried. Open Library
   * is the primary for almost every book *and* always has `publish_date` and
   * `subjects`, so the named exceptions for those fields never ran: the vault
   * filled up with Open Library's bare `"2004"` where the table says Google
   * wins, and with raw headings like `nyt:paperback_advice=2012-01-14` where it
   * says Apple's curated genres win. Both are in the real vault right now,
   * which is how this was found — a fixture with one provider per field cannot
   * see it, because there is nothing to lose to.
   *
   * Absent-only is not what was being expressed here. That rule is about **the
   * note** and lives in `enrich`, which never writes a key a note already has.
   * This function is choosing among providers, where "already set" means
   * nothing.
   */
  for (const field of MERGED_FIELDS) {
    filled = { ...filled, ...blank(field) };
    for (const source of FIELD_ORDER[field] ?? DEFAULT_ORDER) {
      const next = takeMerged(filled, field, contributors.get(source));
      if (next !== filled) {
        filled = next;
        break;
      }
    }
    // Nobody in the order held it — including the primary, whose own value is
    // reinstated here rather than lost.
    if (filled[field] === undefined && primary[field] !== undefined) {
      filled = { ...filled, [field]: primary[field] } as BookMetadata;
    }
  }

  // The ids are not a precedence question: each comes from its own provider or
  // from nowhere. A book Apple never matched has no `appleTrackId`, and no other
  // provider can supply one — which is why an unfillable gap stays a gap and is
  // re-asked forever rather than being closed with a sentinel.
  for (const [field, source] of ID_FIELDS) {
    filled = takeId(filled, field, contributors.get(source));
  }

  return filled;
}

/**
 * Clears one merged field so the ordering below decides it from scratch.
 *
 * Spelled as a lookup rather than a computed key so the compiler still checks
 * that only the four merged fields can be cleared.
 */
function blank(field: MergedField): Partial<BookMetadata> {
  switch (field) {
    case 'publisher':
      return { publisher: undefined };
    case 'published':
      return { published: undefined };
    case 'subjects':
      return { subjects: undefined };
    default:
      return { description: undefined };
  }
}

/** One merged field from one contributor. */
function takeMerged(
  into: BookMetadata,
  field: MergedField,
  from: BookMetadata | undefined,
): BookMetadata {
  const value = from?.[field];
  if (value === undefined) return into;

  switch (field) {
    case 'subjects':
      return Array.isArray(value) ? { ...into, subjects: value } : into;
    default:
      return typeof value === 'string' ? { ...into, [field]: value } : into;
  }
}

/** One contributor id from the one provider that can supply it. */
function takeId(into: BookMetadata, field: IdField, from: BookMetadata | undefined): BookMetadata {
  const value = from?.[field];
  return into[field] === undefined && typeof value === 'string'
    ? { ...into, [field]: value }
    : into;
}

type IdField = 'volumeId' | 'appleTrackId' | 'openLibraryOlid' | 'oreillyOurn';

/**
 * Each contributor id and the one provider that can supply it.
 *
 * `volumeId` predates this work and is spelled for Google's own field, the same
 * convention the other three follow — the key names the provider's field, which
 * for O'Reilly is the guard that stops `archive_id` being pasted where `ourn`
 * belongs.
 */
const ID_FIELDS: readonly (readonly [IdField, MetadataSource])[] = [
  ['volumeId', 'google-books'],
  ['appleTrackId', 'apple-books'],
  ['openLibraryOlid', 'open-library'],
  ['oreillyOurn', 'oreilly'],
];
