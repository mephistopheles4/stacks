import type { LibraryBook } from '@stacks/core';

/**
 * Turning a library into shelf rows.
 *
 * One row per year finished, newest at the top, because the whole point of the
 * grouping is to read your reading over time at a glance. Books still in
 * progress get their own row above the years — they are the ones you would
 * actually reach for.
 */

export interface ShelfBook {
  readonly book: LibraryBook;
  /** Spine thickness in world units, from page count. */
  readonly thickness: number;
  readonly height: number;
  readonly colour: string;
  /** Face-out books show their cover instead of their spine. */
  readonly faceOut: boolean;
}

export interface ShelfRow {
  readonly label: string;
  readonly books: readonly ShelfBook[];
}

/** Wishlist books are not on the shelf — you do not own them yet. */
const SHELVED = new Set(['read', 'reading', 'abandoned']);

const THINNEST = 0.055;
const THICKEST = 0.16;
const PAGES_AT_THINNEST = 120;
const PAGES_AT_THICKEST = 800;

/** A shelf of identical-height books looks printed, not lived in. */
const MIN_HEIGHT = 0.78;
const MAX_HEIGHT = 0.95;

/** For books with no cover to extract a colour from. */
const FALLBACK_COLOURS = [
  '#6b4f6b',
  '#4a6b5a',
  '#2f6d7a',
  '#8a5a3b',
  '#5a5f8c',
  '#7a4550',
  '#3f6b5a',
];

export function toRows(books: readonly LibraryBook[]): ShelfRow[] {
  const shelved = books.filter((book) => SHELVED.has(book.status));

  const reading: ShelfBook[] = [];
  const byYear = new Map<string, ShelfBook[]>();

  for (const book of shelved) {
    const entry = toShelfBook(book);
    if (book.status === 'reading') {
      reading.push(entry);
      continue;
    }
    const year = book.finished?.slice(0, 4) ?? 'Undated';
    const row = byYear.get(year);
    if (row === undefined) byYear.set(year, [entry]);
    else row.push(entry);
  }

  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  const rows: ShelfRow[] = years.map((year) => ({
    label: year,
    books: byYear.get(year) ?? [],
  }));

  if (reading.length > 0) {
    rows.unshift({ label: 'Reading now', books: reading });
  }

  return rows;
}

function toShelfBook(book: LibraryBook): ShelfBook {
  return {
    book,
    thickness: thicknessFor(book.pages),
    height: heightFor(book.id),
    colour: book.spineColor ?? fallbackColour(book.id),
    // Books in progress sit face-out, the way a book you are mid-way through
    // ends up propped on the shelf rather than filed away.
    faceOut: book.status === 'reading',
  };
}

function thicknessFor(pages: number | undefined): number {
  if (pages === undefined) return (THINNEST + THICKEST) / 2;
  const t = (pages - PAGES_AT_THINNEST) / (PAGES_AT_THICKEST - PAGES_AT_THINNEST);
  return THINNEST + clamp(t, 0, 1) * (THICKEST - THINNEST);
}

/** Stable per book, so a rebuild doesn't reshuffle the shelf's silhouette. */
function heightFor(id: string): number {
  return MIN_HEIGHT + hashUnit(id) * (MAX_HEIGHT - MIN_HEIGHT);
}

function fallbackColour(id: string): string {
  const index = Math.floor(hashUnit(`${id}-colour`) * FALLBACK_COLOURS.length);
  return FALLBACK_COLOURS[index] ?? '#6b4f6b';
}

/** FNV-1a squashed to 0..1 — deterministic, no dependency, good enough. */
function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 8) / 0x1000000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function estimateRowWidth(books: readonly ShelfBook[], gap: number): number {
  return books.reduce((total, entry) => total + entry.thickness + gap, 0);
}
