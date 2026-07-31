import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_BOOK_STATUS,
  isBookStatus,
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
 * Matches the leading `---` block and **nothing else**.
 *
 * The capture group is the only part of the file that goes any further. The
 * body is never captured, never returned, and has no representation in
 * `BookRecord` — that is invariant 2 enforced by construction rather than by
 * remembering to strip it later.
 */
const FRONTMATTER_BLOCK = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

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
      ...optional('author', asString(fields['author'])),
      ...optional('isbn', asString(fields['isbn'])),
      ...optional('started', asDate(fields['started'])),
      ...optional('finished', asDate(fields['finished'])),
      ...optional('rating', asRating(fields['rating'])),
      ...optional('cover', asString(fields['cover'])),
      ...optional('spineColor', asHexColour(fields['spine_color'])),
      ...optional('pages', asPositiveInt(fields['pages'])),
      ...optional('faceOut', asBoolean(fields['face_out'])),
    },
  };
}

/**
 * Omits the key entirely when the value is absent, rather than setting it to
 * `undefined`. Keeps `library.json` free of `"author": null` noise.
 */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<never, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
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

function asHexColour(value: unknown): string | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  const normalised = text.startsWith('#') ? text : `#${text}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalised) ? normalised.toLowerCase() : undefined;
}
