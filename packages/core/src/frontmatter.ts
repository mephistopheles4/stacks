import { parse as parseYaml } from 'yaml';
import { isCoverSource, type CoverSource } from './covers/cover-source.ts';
import { keyIfPresent } from './key-if-present.ts';
import { CONTRIBUTOR_ID_KEYS, CONTRIBUTOR_IDS, isWellFormedId } from './provider-ids.ts';
import {
  DEFAULT_BOOK_STATUS,
  isBinding,
  isBookStatus,
  type Binding,
  type BookRecord,
  type BookStatus,
} from './types.ts';

/**
 * Turning one vault note into (at most) one book.
 *
 * Three outcomes, and the difference between the last two matters:
 *
 * - `book`        — parsed fine, shelve it.
 * - `not-a-book`  — a perfectly good note that simply isn't `type: book`.
 *                   Ignored **silently**. Warning here would cry wolf, and a
 *                   vault full of ordinary notes would drown the real warnings.
 * - `invalid`     — it claims to be a book and isn't usable. Warn naming the
 *                   file, skip it, keep going (invariant 3).
 */
export type ParsedNote =
  | { readonly kind: 'book'; readonly record: BookRecord }
  | { readonly kind: 'not-a-book' }
  | { readonly kind: 'invalid'; readonly reason: string };

/**
 * The frontmatter contract, as data.
 *
 * `parseNote` below reads each key by hand, which is the clearest way to write
 * it but leaves the contract implicit — there was no list anywhere to check
 * CLAUDE.md against, and `shelf_order` was duly added to the parser and to the
 * prose without ever reaching the documented key enumeration.
 *
 * This is that list. It is deliberately *not* what the parser iterates: a
 * constant the parser ignores would just be a third place to drift. Instead
 * gates/frontmatter-contract.test.ts asserts three things at once — that this
 * matches CLAUDE.md, that every key here is genuinely read into the field named
 * here, and that nothing else is.
 *
 * `field: null` means the key is consumed during parsing without becoming a
 * field of its own: `type` is the discriminator that decides whether a note is
 * a book at all.
 */
export const FRONTMATTER_CONTRACT = {
  type: { field: null, required: true, sample: 'book' },
  title: { field: 'title', required: true, sample: 'A Sample Title' },
  author: { field: 'author', required: false, sample: 'A Sample Author' },
  isbn: { field: 'isbn', required: false, sample: '9781000000016' },
  status: { field: 'status', required: false, sample: 'reading' },
  started: { field: 'started', required: false, sample: '2026-01-02' },
  finished: { field: 'finished', required: false, sample: '2026-03-04' },
  rating: { field: 'rating', required: false, sample: '4' },
  cover: { field: 'cover', required: false, sample: 'covers/sample.png' },
  cover_source: { field: 'coverSource', required: false, sample: 'open-library' },
  spine_color: { field: 'spineColor', required: false, sample: '"#2f6d7a"' },
  pages: { field: 'pages', required: false, sample: '321' },
  binding: { field: 'binding', required: false, sample: 'paperback' },
  face_out: { field: 'faceOut', required: false, sample: 'true' },
  tags: { field: 'tags', required: false, sample: '[sample]' },
  shelf_order: { field: 'shelfOrder', required: false, sample: '20' },
  private: { field: 'private', required: false, sample: 'true' },
  publisher: { field: 'publisher', required: false, sample: 'A Sample Press' },
  published: { field: 'published', required: false, sample: '2019' },
  subjects: { field: 'subjects', required: false, sample: 'systems thinking; science' },
  google_volume_id: { field: 'googleVolumeId', required: false, sample: 'CpbLAgAAQBAJ' },
  apple_track_id: { field: 'appleTrackId', required: false, sample: '1384286945' },
  openlibrary_olid: { field: 'openLibraryOlid', required: false, sample: 'OL26445570M' },
  oreilly_ourn: {
    field: 'oreillyOurn',
    required: false,
    sample: 'urn:orm:book:0642572352530',
  },
} as const satisfies Record<
  string,
  { readonly field: keyof BookRecord | null; readonly required: boolean; readonly sample: string }
>;

/**
 * Matches the leading `---` block and **nothing else**.
 *
 * The capture group is the only part of the file that goes any further. The
 * body is never captured, never returned, and has no representation in
 * `BookRecord` — that is invariant 2 enforced by construction rather than by
 * remembering to strip it later.
 */
export const FRONTMATTER_BLOCK = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseNote(source: string, sourcePath: string): ParsedNote {
  const match = FRONTMATTER_BLOCK.exec(source);
  if (match?.[1] === undefined) {
    // No frontmatter at all: an ordinary note, not a broken book.
    return { kind: 'not-a-book' };
  }

  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { kind: 'invalid', reason: `unparseable frontmatter — ${detail ?? 'YAML error'}` };
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'not-a-book' };
  }

  const fields = data as Record<string, unknown>;

  if (asString(fields['type']) !== 'book') {
    return { kind: 'not-a-book' };
  }

  const title = asString(fields['title']);
  if (title === undefined || title.length === 0) {
    return { kind: 'invalid', reason: 'missing required key: title' };
  }

  return {
    kind: 'book',
    record: {
      sourcePath,
      title,
      status: readStatus(fields['status']),
      tags: readTags(fields['tags']),
      ...keyIfPresent('author', asString(fields['author'])),
      ...keyIfPresent('isbn', asString(fields['isbn'])),
      ...keyIfPresent('started', asDate(fields['started'])),
      ...keyIfPresent('finished', asDate(fields['finished'])),
      ...keyIfPresent('rating', asRating(fields['rating'])),
      ...keyIfPresent('cover', asString(fields['cover'])),
      // An unrecognised value is dropped rather than kept: a public build makes
      // provider-dependent decisions off this key, and a typo must not read as
      // a permission. Absent then means "nobody recorded it", which is the same
      // thing every cover cached before this key existed says.
      ...keyIfPresent('coverSource', asCoverSource(fields['cover_source'])),
      ...keyIfPresent('spineColor', asHexColour(fields['spine_color'])),
      ...keyIfPresent('pages', asPositiveInt(fields['pages'])),
      // Dropped rather than kept when unrecognised, for `cover_source`'s reason.
      // Absent is not an error state here: it is the normal state of every book
      // nobody has annotated, and the shelf hashes one rather than defaulting.
      ...keyIfPresent('binding', asBinding(fields['binding'])),
      ...keyIfPresent('faceOut', asBoolean(fields['face_out'])),
      ...keyIfPresent('shelfOrder', asOrder(fields['shelf_order'])),
      ...keyIfPresent('private', asPrivate(fields['private'])),
      ...keyIfPresent('publisher', asString(fields['publisher'])),
      // Stored as given — `2008` and `2027-02-25T00:00:00Z` are both valid, and
      // `asDate` is deliberately *not* used: it would drop the bare year Open
      // Library returns and truncate the timestamp O'Reilly returns, which is
      // normalisation at the parse edge by another name.
      ...keyIfPresent('published', asString(fields['published'])),
      ...keyIfPresent('subjects', asString(fields['subjects'])),
      ...readContributorIds(fields),
    },
  };
}

/**
 * The four contributor ids, each dropped rather than kept when malformed.
 *
 * `cover_source`'s rule at the same edge, for a value that is opaque rather than
 * enumerable: shape is checkable where meaning is not, and the failure mode this
 * buys is a **missing** link instead of a dead one. See `provider-ids.ts` for
 * why that is worth the little it buys, and for why it guarantees nothing about
 * whether the id is *right*.
 */
function readContributorIds(fields: Record<string, unknown>): Record<string, string> {
  const ids: Record<string, string> = {};

  for (const key of CONTRIBUTOR_ID_KEYS) {
    // `asString` rather than a string check: `apple_track_id: 1384286945` is a
    // number in YAML, and hand-edited notes do that constantly.
    const value = asString(fields[key]);
    if (value !== undefined && isWellFormedId(key, value)) {
      ids[CONTRIBUTOR_IDS[key].field] = value;
    }
  }

  return ids;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  // A bare `isbn: 9781000000016` is a number in YAML, and hand-edited notes do
  // that constantly.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Whether a book is held back from public builds — and it fails *closed*.
 *
 * Every other optional key here fails open: an unreadable `rating` is dropped,
 * an unrecognised `status` falls back to a default, because getting those wrong
 * costs nothing anyone notices. This one is different, and the asymmetry is the
 * whole point:
 *
 *   - wrongly private  — a book missing from the shelf. Visible, trivial, fixed
 *                        by editing one line.
 *   - wrongly public   — someone's reading of a book they did not want shared,
 *                        on a URL that may already have been sent to a friend
 *                        or crawled. Not undoable.
 *
 * So anything present that is not clearly a "no" means private. `private: yes`
 * is a string under YAML 1.2, not a boolean; a strict boolean check would drop
 * it and publish the book, which is exactly the mistake someone typing `yes`
 * would never expect to make.
 */
function asPrivate(value: unknown): true | undefined {
  // The complete set of ways to say no. Everything else — including a typo, a
  // word nobody anticipated, and a value YAML parsed as a type nobody expected
  // — means private. `0` is here as a number as well as a string because
  // `private: 0` parses as a number, and it is plainly a no in every config
  // format anyone has used.
  if (value === undefined || value === null || value === false || value === 0) return undefined;

  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === '' || text === 'false' || text === 'no' || text === 'off' || text === '0') {
      return undefined;
    }
  }

  return true;
}

function asCoverSource(value: unknown): CoverSource | undefined {
  const raw = asString(value)?.toLowerCase();
  return isCoverSource(raw) ? raw : undefined;
}

function asBinding(value: unknown): Binding | undefined {
  const raw = asString(value)?.toLowerCase();
  return isBinding(raw) ? raw : undefined;
}

/** An unrecognised status is not worth discarding a book over — fall back. */
function readStatus(value: unknown): BookStatus {
  const raw = asString(value)?.toLowerCase();
  return isBookStatus(raw) ? raw : DEFAULT_BOOK_STATUS;
}

/** `tags: [a, b]`, `tags: a`, or absent. Anything else yields no tags. */
function readTags(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter((tag): tag is string => tag !== undefined);
  }
  const single = asString(value);
  return single === undefined ? [] : [single];
}

/**
 * YAML may hand back a Date or a string depending on quoting. Both become an
 * ISO date string, because that is what goes into JSON and onto the shelf.
 */
function asDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = asString(value);
  if (text === undefined) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : undefined;
}

function asRating(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(asString(value));
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(asString(value));
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : undefined;
}

/**
 * A tri-state: true, false, or "not set, decide from status".
 *
 * Accepts the strings too, because YAML quoting is easy to get wrong by hand
 * and `face_out: "true"` clearly means the same thing.
 */
function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const text = asString(value)?.toLowerCase();
  if (text === 'true' || text === 'yes') return true;
  if (text === 'false' || text === 'no') return false;
  return undefined;
}

/** Any finite number, negative included, so you can push a book to the front. */
function asOrder(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(asString(value));
  return Number.isFinite(n) ? n : undefined;
}

function asHexColour(value: unknown): string | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  const normalised = text.startsWith('#') ? text : `#${text}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalised) ? normalised.toLowerCase() : undefined;
}
