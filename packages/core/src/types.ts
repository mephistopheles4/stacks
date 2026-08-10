/**
 * The frontmatter contract, in types.
 *
 * Mirrors "Frontmatter contract" in CLAUDE.md. Changing anything here means
 * changing that file in the same commit.
 *
 * Only `type: book` and `title` are required. Everything else is optional,
 * because hand-edited notes are first-class (invariant 5).
 */

import type { CoverSource } from './covers/cover-source.ts';

export const BOOK_STATUSES = ['reading', 'read', 'abandoned', 'wishlist'] as const;

export type BookStatus = (typeof BOOK_STATUSES)[number];

/** A note with no `status:` key is treated as read. */
export const DEFAULT_BOOK_STATUS: BookStatus = 'read';

export function isBookStatus(value: unknown): value is BookStatus {
  return typeof value === 'string' && (BOOK_STATUSES as readonly string[]).includes(value);
}

/**
 * How a book is bound — the one thing about its shape no provider knows.
 *
 * `physical_format` appears zero times across every cached response this project
 * holds, and Google and Apple have no binding field in their schemas at all. So
 * this is declared or it is invented; it is never looked up. Inference from cover
 * aspect or page count is struck permanently rather than deferred: hardcover and
 * paperback aspects interleave at 0.666, so inferring would be the one option
 * that *claims* accuracy while having none.
 *
 * Two values and not three. Trade against mass-market is a difference of *size*,
 * and size already varies per book through the shelf's own height hash, so a
 * third value would be one more thing to choose between for variance the shelf
 * already has.
 */
export const BINDINGS = ['hardback', 'paperback'] as const;

export type Binding = (typeof BINDINGS)[number];

export function isBinding(value: unknown): value is Binding {
  return typeof value === 'string' && (BINDINGS as readonly string[]).includes(value);
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

  /**
   * Which provider the cover's bytes came from.
   *
   * Recorded because the three providers permit different things — see
   * `covers/cover-source.ts`. Absent on any cover cached before this key
   * existed, which is why `unknown` and absent have to stay distinguishable:
   * absent means nobody looked, `unknown` means somebody looked and did not
   * recognise the host.
   */
  readonly coverSource?: CoverSource;

  /** Hex colour, auto-extracted from the cover at add time, overridable by hand. */
  readonly spineColor?: string;

  /** Drives spine width on the shelf. Absent means: use the default width. */
  readonly pages?: number;

  /**
   * Hardback or paperback, when you have looked at the book and know.
   *
   * **Absent does not mean "hardback".** It means nobody has said, and the shelf
   * answers with a stable per-book hash — so no missing key can flatten a shelf
   * into a single format. That is the fail-closed property, and it is met by
   * structure rather than by care: there is no default value for a missing key to
   * fall into. An unrecognised value is dropped at parse time, following
   * `coverSource`, where a typo must not read as a permission.
   *
   * **Deliberately absent from `BookInput`.** No provider knows a book's
   * binding, so `stacks add` has nothing to write and never will; the only way
   * this key arrives is somebody looking at the book and saying so, which is
   * invariant 5 working as intended. The asymmetry with the field list below is
   * the point, not an omission.
   */
  readonly binding?: Binding;

  /**
   * Keep this book off any public build.
   *
   * The shelf is published by a pipeline that never asks again: a book is
   * public the moment `stacks add` finishes. That is fine for almost
   * everything and wrong for the occasional book that is nobody else's
   * business — a diagnosis, a bereavement, a job hunt, a faith. This is the
   * per-book escape hatch, so "yes, publish my shelf" stays a decision you can
   * revisit one book at a time rather than wholesale.
   *
   * It still appears in a local build and on your own machine. It simply never
   * leaves it.
   */
  readonly private?: boolean;

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

  /** Who published it. ⚠️ Hand-added on 17 of the 41 real notes before this key
   * was ever part of the contract, and absent-only leaves every one of those
   * alone — so the field is **mixed-provenance from day one** and nothing
   * downstream may assume a provider supplied it. */
  readonly publisher?: string;

  /**
   * The publication date, **exactly as the provider gave it**.
   *
   * `2008` and `2027-02-25T00:00:00Z` are both valid values. Normalising at
   * write time was the one irreversible option on the table — undoing it means
   * re-asking every provider — so the note stores what it was told and the card
   * renders the first four-digit run. Same precedent as `started`/`finished`,
   * which are opaque strings, unvalidated, stored as given.
   */
  readonly published?: string;

  /** Provider categories, `; `-separated and capped at five. See `subjects.ts`. */
  readonly subjects?: string;

  /**
   * The four contributor ids — see `provider-ids.ts`.
   *
   * **The set of these that is present *is* the contributor set.** A contributor
   * is a provider whose record was confirmed to be this book, which is an
   * identity claim rather than a data-flow one: it means the same thing before
   * and after Apple started supplying fields as well as pictures.
   *
   * Ids, never URLs. A provider URL lands in an `href`, and the card's
   * `textContent` rule protects text and does nothing for an `href`; with an
   * opaque id the worst a corrupted value can do is 404.
   */
  readonly googleVolumeId?: string;
  readonly appleTrackId?: string;
  readonly openLibraryOlid?: string;
  /** Recorded although it can never be linked: its URL 403s either way. */
  readonly oreillyOurn?: string;
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
  readonly coverSource?: CoverSource;
  readonly spineColor?: string;
  readonly pages?: number;
  readonly faceOut?: boolean;
  readonly shelfOrder?: number;
  readonly private?: boolean;
  readonly tags?: readonly string[];

  /**
   * Everything the merge revision added, written at creation as well as filled
   * later.
   *
   * `BookInput` and `FILLABLE` have to move **together**: both are closed lists,
   * so a merge that starts carrying `publisher` while these stay put would put
   * it in no note at all. Taking a field in the merge and not here is an inert
   * decision.
   */
  readonly publisher?: string;
  readonly published?: string;
  readonly subjects?: string;
  readonly googleVolumeId?: string;
  readonly appleTrackId?: string;
  readonly openLibraryOlid?: string;
  readonly oreillyOurn?: string;

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
