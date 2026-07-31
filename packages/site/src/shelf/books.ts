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
  /** Extra space to the left of this book, opened where a year changes. */
  readonly gapBefore?: number;
  /**
   * How much shelf this book actually eats.
   *
   * Not the same as `thickness`: a face-out book is turned side-on, so it takes
   * roughly its depth. Row packing has to count the footprint or face-out books
   * overrun the end of the shelf.
   */
  readonly footprint: number;
}

/** Matches SHELF.bookDepth in scene.ts — a turned book takes its depth. */
const FACE_OUT_FOOTPRINT = 0.55;

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

/**
 * Books flow left-to-right and top-to-bottom, filling each shelf before
 * starting the next — the way a real bookcase fills up.
 *
 * The brief's original sketch was one shelf row per year. That reads well on
 * paper and badly in three dimensions: with a dozen books a year, every shelf
 * trails off into two-thirds empty wood. Chronological order is preserved
 * (newest first) and a year change opens a small gap where a bookend would sit,
 * so the grouping is still legible without leaving the case looking abandoned.
 */
export function toRows(books: readonly LibraryBook[], capacity: number): ShelfRow[] {
  const shelved = books.filter((book) => SHELVED.has(book.status));

  // Books in progress come first — they are the ones you would reach for.
  const ordered = [...shelved].sort(byReadingThenNewest);

  const rows: ShelfRow[] = [];
  let current: ShelfBook[] = [];
  let used = 0;
  let previousYear: string | undefined;

  for (const book of ordered) {
    const entry = toShelfBook(book);
    const year = yearOf(book);
    const isYearChange = previousYear !== undefined && year !== previousYear;
    const width = entry.footprint + (isYearChange ? YEAR_GAP : 0);

    if (used + width > capacity && current.length > 0) {
      rows.push({ label: previousYear ?? '', books: current });
      current = [];
      used = 0;
    }

    current.push(isYearChange && used > 0 ? { ...entry, gapBefore: YEAR_GAP } : entry);
    used += width;
    previousYear = year;
  }

  if (current.length > 0) rows.push({ label: previousYear ?? '', books: current });
  return rows;
}

/** A visible break where a bookend would sit. */
const YEAR_GAP = 0.09;

function yearOf(book: LibraryBook): string {
  if (book.status === 'reading') return 'reading';
  return book.finished?.slice(0, 4) ?? 'undated';
}

function byReadingThenNewest(a: LibraryBook, b: LibraryBook): number {
  if (a.status === 'reading' && b.status !== 'reading') return -1;
  if (b.status === 'reading' && a.status !== 'reading') return 1;
  const left = a.finished ?? a.started ?? '';
  const right = b.finished ?? b.started ?? '';
  if (left !== right) return right.localeCompare(left);
  return a.title.localeCompare(b.title);
}

function toShelfBook(book: LibraryBook): ShelfBook {
  const thickness = thicknessFor(book.pages);
  // Books in progress sit face-out, the way a book you are mid-way through ends
  // up propped on the shelf rather than filed away.
  const faceOut = book.status === 'reading';

  return {
    book,
    thickness,
    height: heightFor(book.id),
    colour: book.spineColor ?? fallbackColour(book.id),
    faceOut,
    footprint: faceOut ? FACE_OUT_FOOTPRINT : thickness,
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
  return books.reduce((total, entry) => total + entry.footprint + (entry.gapBefore ?? 0) + gap, 0);
}
