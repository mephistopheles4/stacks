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

  /**
   * Force the book to stand cover-forward, or force it not to.
   *
   * Absent means "decide from status" — a book you are currently reading sits
   * face-out on its own. Setting it explicitly overrides that in both
   * directions, so `face_out: false` files a in-progress book away and
   * `face_out: true` displays anything you want to show off.
   */
  readonly faceOut?: boolean;

  /**
   * Where this book sits on the shelf, lowest first.
   *
   * Absent means "wherever the default order puts it" — newest read first. A
   * book with an order is placed ahead of every book without one, so a handful
   * of favourites can be pinned to the front without numbering the whole shelf.
   */
  readonly shelfOrder?: number;

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
  readonly faceOut?: boolean;
  readonly shelfOrder?: number;
  readonly tags?: readonly string[];

  /**
   * Keys outside the frontmatter contract, written through verbatim.
   *
   * Imports know things the contract does not — an audiobook has a narrator, a
   * runtime and an ASIN. The parser has always tolerated extra keys
   * (invariant 5); without this the *writer* silently dropped them, so data an
   * import found could not be kept. Contract keys always win, so this cannot be
   * used to smuggle a different `title` in.
   */
  readonly extra?: Readonly<Record<string, string | number | boolean>>;
}
