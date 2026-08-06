import type { LibraryBook } from '@stacks/core';
// Deliberately the subpath, not the package root. The root re-exports the
// adapter, sharp and the metadata layer; a *value* import of it drags node:fs
// and sharp into the browser bundle and the shelf never boots. Types are erased
// at compile time and so are safe from the root; values are not.
import { compareShelfPosition, SHELVED_STATUSES } from '@stacks/core/shelf-order';
import { USABLE_WIDTH } from './case.ts';
import { hashUnit } from './hash.ts';
// The packer depends on the placer, which reads oddly until you see why: a row's
// capacity is only meaningful if what it charges a book is what the cursor will
// spend on it. So it reads the cursor's own arithmetic rather than a copy that
// can drift — which is exactly what happened, twice. See ADR-0031.
import { shelfCost } from './placement.ts';

/**
 * Turning a library into shelf rows.
 *
 * One row per year finished, newest at the top, because the whole point of the
 * grouping is to read your reading over time at a glance. Books still in
 * progress get their own row above the years — they are the ones you would
 * actually reach for.
 */

/**
 * How a book is bound, which is the one thing about its shape no provider knows.
 *
 * Two values and not three. The tell that separates bindings at shelf distance
 * is the binder's *square* — whether the cover stands proud of the pages — and
 * that is a yes or a no. Trade against mass-market is a difference of *size*,
 * and size already varies per book through `heightFor`'s hash, so a third value
 * would be one more thing to choose between for variance the shelf already has.
 */
export type Binding = 'hardback' | 'paperback';

export interface ShelfBook {
  readonly book: LibraryBook;
  /** Spine thickness in world units, from page count. */
  readonly thickness: number;
  readonly height: number;
  readonly binding: Binding;
  readonly colour: string;
  /** Face-out books show their cover instead of their spine. */
  readonly faceOut: boolean;
  /** Extra space to the left of this book, opened where a year changes. */
  readonly gapBefore?: number;
  /**
   * How much shelf this book actually eats.
   *
   * Not the same as `thickness`: a face-out book is turned side-on, so it takes
   * the width of its cover. Row packing has to count the footprint or face-out
   * books overrun the end of the shelf.
   */
  readonly footprint: number;
  /** Width of the cover face, in world units. Only meaningful when faceOut. */
  readonly coverWidth: number;
}

/**
 * Cover shape, when the build could not measure the real one.
 *
 * A typical print cover. Deliberately not square: guessing "book-shaped" is
 * wrong less often than guessing anything else.
 */
const DEFAULT_COVER_ASPECT = 0.65;

export interface ShelfRow {
  readonly label: string;
  readonly books: readonly ShelfBook[];
}

const THINNEST = 0.055;
const THICKEST = 0.16;
const PAGES_AT_THINNEST = 120;
const PAGES_AT_THICKEST = 800;

/**
 * How much of the shelf is bound in paper.
 *
 * Taste, not fact — the one number here the screenshot settles rather than the
 * argument. Leaned toward paperback because this is a library of modern
 * technical and business non-fiction, where paperback dominates, and because the
 * shelf it replaces was 100% hardback. In the built version this is the single
 * binding value the debug panel dials (`books.paperbackRatio`, `needsRebuild`);
 * the rest are measurements of real bookbinding and stay constants.
 */
const PAPERBACK_RATIO = 0.6;

/** A shelf of identical-height books looks printed, not lived in. */
const MIN_HEIGHT = 0.78;
/**
 * Exported because it bounds the worst swing a lean can produce, which is what
 * `SHELF.endReserve` has to cover — see G25.
 */
export const MAX_HEIGHT = 0.95;

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
export function toRows(books: readonly LibraryBook[]): ShelfRow[] {
  const shelved = books.filter((book) => SHELVED_STATUSES.has(book.status));

  // Books in progress come first — they are the ones you would reach for.
  const ordered = [...shelved].sort(compareShelfPosition);

  const rows: ShelfRow[] = [];
  let current: ShelfBook[] = [];
  let used = 0;
  let previousYear: string | undefined;

  for (const book of ordered) {
    const entry = toShelfBook(book);
    const year = yearOf(book);
    const isYearChange = previousYear !== undefined && year !== previousYear;

    // Costed against the row it is being offered to, because what a book costs
    // depends on where it lands. A year change mid-row opens a gap and stands the
    // book upright; the same book at the head of a row opens nothing and leans
    // against the case. So the two cases are priced separately rather than one
    // being assumed — the earlier version charged the gap either way, and charged
    // it to a book that never got one.
    let candidate =
      isYearChange && current.length > 0 ? { ...entry, gapBefore: YEAR_GAP } : entry;
    let width = shelfCost(candidate, current[current.length - 1]);

    if (used + width > USABLE_WIDTH && current.length > 0) {
      rows.push({ label: previousYear ?? '', books: current });
      current = [];
      used = 0;
      candidate = entry;
      width = shelfCost(entry, undefined);
    }

    current.push(candidate);
    used += width;
    previousYear = year;
  }

  if (current.length > 0) rows.push({ label: previousYear ?? '', books: current });
  return rows;
}

/**
 * A visible break where a bookend would sit.
 *
 * Exported for G24, which has to price the book the packer turned away exactly
 * as the packer priced it. A test that charges the gap differently asserts
 * something the packer never promised.
 */
export const YEAR_GAP = 0.09;

/**
 * Which row-group a book belongs to.
 *
 * A book you are reading gets its own year rather than the year it will be
 * finished, so the in-progress shelf is always its own group.
 */
export function yearOf(book: LibraryBook): string {
  if (book.status === 'reading') return 'reading';
  return book.finished?.slice(0, 4) ?? 'undated';
}

function toShelfBook(book: LibraryBook): ShelfBook {
  const thickness = thicknessFor(book.pages);
  const binding = bindingFor(book.id);
  // `face_out` in the note wins in both directions when it is set; otherwise a
  // book in progress stands cover-forward on its own, the way one you are
  // mid-way through ends up propped on the shelf rather than filed away.
  const faceOut = book.faceOut ?? book.status === 'reading';
  const height = heightFor(book.id, binding);

  // The cover's own proportions, not one shape imposed on every book. Audiobook
  // art is square and print covers are about 0.65; forcing both onto the same
  // face squashes the square ones by a third.
  const coverWidth = height * (book.coverAspect ?? DEFAULT_COVER_ASPECT);

  return {
    book,
    thickness,
    height,
    binding,
    colour: book.spineColor ?? fallbackColour(book.id),
    faceOut,
    coverWidth,
    footprint: faceOut ? coverWidth : thickness,
  };
}

function thicknessFor(pages: number | undefined): number {
  if (pages === undefined) return (THINNEST + THICKEST) / 2;
  const t = (pages - PAGES_AT_THINNEST) / (PAGES_AT_THICKEST - PAGES_AT_THINNEST);
  return THINNEST + clamp(t, 0, 1) * (THICKEST - THINNEST);
}

/**
 * Which binding a book gets when nothing has said.
 *
 * **Absent routes to the hash, never to a value**, and that is the whole safety
 * property. A default binding would mean one missing key flattens the shelf into
 * a single format — the failure `private:` and `cover_source` are both shaped to
 * avoid. There is no default to fall into here: unknown is not an error state
 * the shelf renders around, it is the normal state of every book nobody has
 * annotated, which on day one is all of them.
 *
 * Salted rather than bare `id`, so binding and height are independent draws off
 * the same book. Sharing one would tie every paperback to the same end of the
 * height range and undo the point of biasing it.
 */
function bindingFor(id: string): Binding {
  return hashUnit(`${id}-binding`) < PAPERBACK_RATIO ? 'paperback' : 'hardback';
}

/**
 * Stable per book, so a rebuild doesn't reshuffle the shelf's silhouette.
 *
 * Binding *biases* the band rather than replacing it: paperbacks draw from the
 * lower part of the range and hardbacks the upper, and the two bands overlap so
 * the result reads as a tendency rather than two discrete clusters of height.
 *
 * Both bands stay inside `MIN_HEIGHT`..`MAX_HEIGHT`. That is not tidiness —
 * `MAX_HEIGHT` is exported because it bounds the worst swing a lean can produce,
 * which is what `SHELF.endReserve` has to cover (G25). Widening the range here
 * would make the packer's reserve wrong and walk books out through the case.
 */
function heightFor(id: string, binding: Binding): number {
  const [low, high] = binding === 'paperback' ? [0, 0.6] : [0.4, 1];
  const within = low + hashUnit(id) * (high - low);
  return MIN_HEIGHT + within * (MAX_HEIGHT - MIN_HEIGHT);
}

function fallbackColour(id: string): string {
  const index = Math.floor(hashUnit(`${id}-colour`) * FALLBACK_COLOURS.length);
  return FALLBACK_COLOURS[index] ?? '#6b4f6b';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
