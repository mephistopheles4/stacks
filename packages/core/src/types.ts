/**
 * The frontmatter contract, in types.
 *
 * Mirrors "Frontmatter contract" in CLAUDE.md. Changing anything here means
 * changing that file in the same commit.
 *
 * Only `type: book` and `title` are required. Everything else is optional,
 * because hand-edited notes are first-class (invariant 5).
 */

export const BOOK_STATUSES = ['reading', 'read', 'abandoned', 'wishlist'] as const;

export type BookStatus = (typeof BOOK_STATUSES)[number];

/** A note with no `status:` key is treated as read. */
export const DEFAULT_BOOK_STATUS: BookStatus = 'read';

export function isBookStatus(value: unknown): value is BookStatus {
  return typeof value === 'string' && (BOOK_STATUSES as readonly string[]).includes(value);
}

/**
 * One book, as parsed from a vault note.
 *
 * Frontmatter only. Nothing below the frontmatter block ever reaches this type
 * (invariant 2) — there is deliberately no `body` field, and there never will be.
 */
export interface BookRecord {
  /**
   * Vault-relative path of the note this came from.
   *
   * Internal only. The public build must not leak vault paths, so the `--public`
   * serialiser strips this field.
   */
  readonly sourcePath: string;

  readonly title: string;
  readonly author?: string;
  readonly isbn?: string;
  readonly status: BookStatus;

  /** ISO dates, kept as strings — they come from YAML and go straight to JSON. */
  readonly started?: string;
  readonly finished?: string;

  /** 1–5 when present. */
  readonly rating?: number;

  /** Vault-relative path to the cover image. Absent means: draw a fallback spine. */
  readonly cover?: string;

  /** Hex colour, auto-extracted from the cover at add time, overridable by hand. */
  readonly spineColor?: string;

  /** Drives spine width on the shelf. Absent means: use the default width. */
  readonly pages?: number;

  readonly tags: readonly string[];
}

/** What `stacks add` hands to the adapter in order to create a note. */
export interface BookInput {
  readonly title: string;
  readonly author?: string;
  readonly isbn?: string;
  readonly status?: BookStatus;
  readonly started?: string;
  readonly finished?: string;
  readonly rating?: number;
  readonly cover?: string;
  readonly spineColor?: string;
  readonly pages?: number;
  readonly tags?: readonly string[];
}
