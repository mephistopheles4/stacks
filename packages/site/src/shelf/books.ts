import type { Binding, LibraryBook } from '@stacks/core';
// Deliberately the subpath, not the package root. The root re-exports the
// adapter, sharp and the metadata layer; a *value* import of it drags node:fs
// and sharp into the browser bundle and the shelf never boots. Types are erased
// at compile time and so are safe from the root; values are not.
import { compareShelfPosition, SHELVED_STATUSES } from '@stacks/core/shelf-order';
import { SHELF, USABLE_WIDTH } from './bookcase.ts';
import { hashUnit } from './hash.ts';
import type { BooksSettings } from './shelf-settings.ts';
// The packer depends on the placer, which reads oddly until you see why: a row's
// capacity is only meaningful if what it charges a book is what the cursor will
// spend on it. It used to read the cursor's own *arithmetic* through `shelfCost`
// so the two could not drift — which is exactly what had happened, twice, and is
// ADR-0031. It now runs the cursor itself, which is ADR-0042: there is no charge
// left to drift from the spend.
import { rowExtent } from './placement.ts';

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
  /**
   * Declared in the note, or hashed. Never absent — see `bindingFor`.
   *
   * Resolved here rather than in `scene.ts` so that everything downstream of the
   * placement arithmetic reads one answer. Height already depends on it, and
   * height decides a face-out book's footprint, so binding has to be settled
   * before a row can be packed at all.
   */
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
 * A shelf of identical-height books looks printed, not lived in.
 *
 * Both bounds are exported because binding now draws from *bands* inside them
 * (see `HEIGHT_BAND`), and the one thing that must stay true of every band is
 * that it does not reach outside this range — `MAX_HEIGHT` bounds the worst swing
 * a lean can produce, which is what `SHELF.endReserve` has to cover (G25).
 */
export const MIN_HEIGHT = 0.78;
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
export function toRows(books: readonly LibraryBook[], settings: BooksSettings): ShelfRow[] {
  const shelved = books.filter((book) => SHELVED_STATUSES.has(book.status));

  // Books in progress come first — they are the ones you would reach for.
  const ordered = [...shelved].sort(compareShelfPosition);

  const rows: ShelfRow[] = [];
  let current: ShelfBook[] = [];
  let previousYear: string | undefined;

  for (const book of ordered) {
    const entry = toShelfBook(book, settings);
    const year = yearOf(book);
    const isYearChange = previousYear !== undefined && year !== previousYear;

    // Offered to the row it would join, because what a book costs depends on
    // where it lands. A year change mid-row opens a gap and props the book
    // against its neighbour across it; the same book at the head of a row opens
    // nothing and leans against the case. So the two cases are placed separately
    // rather than one being assumed — an earlier version charged the gap either
    // way, and charged it to a book that never got one.
    let candidate = isYearChange && current.length > 0 ? { ...entry, gapBefore: YEAR_GAP } : entry;

    if (current.length > 0 && !fitsRow([...current, candidate], rows.length)) {
      rows.push({ label: previousYear ?? '', books: current });
      current = [];
      candidate = entry;
    }

    current.push(candidate);
    previousYear = year;
  }

  if (current.length > 0) rows.push({ label: previousYear ?? '', books: current });
  return rows;
}

/**
 * Whether these books, placed as this row, stay inside the shelf.
 *
 * **The packer stopped estimating.** It used to price each book with
 * `shelfCost` and keep a running total, and that price was an upper bound by
 * construction: the real lean comes from `leanFor`, so the swing was charged at
 * the steepest angle any book may reach. On the live shelf that over-charged a
 * row by 0.09–0.13 — and turned a book away from a row with 0.007 of room to
 * spare, which is the whole of ADR-0042.
 *
 * The bound was not necessary. `leanFor(rowIndex, position, id)` is determined
 * by its arguments, and both indices are known *here*: rows are finalised in
 * order and never revisited, so the row being filled is `rows.length`, and the
 * candidate's position in it is `current.length`. The circularity the old
 * comment described — "the row index is not known until the wrap this figure
 * decides has happened" — is real only for the book's *other* possible home, the
 * head of the next row. That is not the question this asks.
 *
 * So it places the row and reads where it ends. `-SHELF.width / 2` is the left
 * inner face, where the cursor starts, and `USABLE_WIDTH` is how much of the
 * shelf books may occupy — one answer, ADR-0031's, rather than a second spelling
 * of it.
 *
 * Appending is monotonic, which is what makes greedy packing sound here: a
 * book's position in the row and its run's lean seed are fixed by what comes
 * *before* it, so nothing already placed moves when one more is offered.
 */
function fitsRow(books: readonly ShelfBook[], rowIndex: number): boolean {
  return rowExtent(books, rowIndex) <= -SHELF.width / 2 + USABLE_WIDTH;
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

function toShelfBook(book: LibraryBook, settings: BooksSettings): ShelfBook {
  const thickness = thicknessFor(book.pages, book.id);
  const binding = bindingFor(book, settings.paperbackRatio);
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

/**
 * Spine thickness, from the page count — or from the hash when there is none.
 *
 * **A book with no page count used to get a *constant* 0.1075**, the midpoint of
 * the range, which is the one answer guaranteed to look wrong: every unmatched
 * book came out identically thick, and a row of them read as a printing error
 * rather than as a shelf. The hash gives each its own width, the way `heightFor`
 * already gives each its own height, and neither claims to know anything.
 *
 * Kept narrower than the full range on purpose. An invented thickness should not
 * be able to claim a book is an 800-page doorstop or a 120-page pamphlet — it
 * should be unremarkable, which is what an absent page count actually tells you.
 *
 * ⚠️ **This covers five books today and two once the owner runs #62's fill**, and
 * it was argued for as covering six. It is kept because it is free and because
 * every future unmatched import lands here, not for the count.
 */
function thicknessFor(pages: number | undefined, id: string): number {
  if (pages === undefined) {
    const middle = (THINNEST + THICKEST) / 2;
    const spread = (THICKEST - THINNEST) * 0.3;
    return middle + (hashUnit(`${id}-thickness`) - 0.5) * spread;
  }
  const t = (pages - PAGES_AT_THINNEST) / (PAGES_AT_THICKEST - PAGES_AT_THINNEST);
  return THINNEST + clamp(t, 0, 1) * (THICKEST - THINNEST);
}

/**
 * How a book is bound: what the note says, or what the hash says.
 *
 * **Absent routes to the hash and never to a value**, and that is the whole
 * safety property. A default binding would mean one missing key flattens the
 * shelf into a single format — the failure `private:` and `cover_source` are both
 * shaped to avoid. There is no default to fall into here: unknown is not an error
 * state the shelf renders around, it is the normal state of every book nobody has
 * annotated, which on day one is all of them.
 *
 * **Salted rather than bare `id`**, so binding and height are independent draws
 * off the same book. Sharing one hash would make every paperback the shorter 60%
 * of the shelf exactly — and since binding then *biases* the height band on top
 * of that, the two would compound into a monotonic shelf that no test would
 * notice and that would look wrong.
 */
function bindingFor(book: LibraryBook, paperbackRatio: number): Binding {
  return (
    book.binding ?? (hashUnit(`${book.id}-binding`) < paperbackRatio ? 'paperback' : 'hardback')
  );
}

/**
 * Stable per book, so a rebuild doesn't reshuffle the shelf's silhouette.
 *
 * Binding *biases* the band rather than replacing it: paperbacks draw from the
 * lower part of the range and hardbacks the upper, and the two bands overlap so
 * the result reads as a tendency rather than as two discrete clusters of height.
 * This, rather than the binder's square, is what carries the mixture at shelf
 * distance — the square was argued in as the tell and the render disagreed
 * (#57), so it is this and the ratio that are worth tuning.
 *
 * Both bands stay inside `MIN_HEIGHT`..`MAX_HEIGHT`. That is not tidiness —
 * `MAX_HEIGHT` is exported because it bounds the worst swing a lean can produce,
 * which is what `SHELF.endReserve` has to cover (G25). Widening the range here
 * would make the packer's reserve wrong and walk books out through the case.
 */
function heightFor(id: string, binding: Binding): number {
  const [low, high] = HEIGHT_BAND[binding];
  const within = low + hashUnit(id) * (high - low);
  return MIN_HEIGHT + within * (MAX_HEIGHT - MIN_HEIGHT);
}

/** Where each binding draws from, as a fraction of `MIN_HEIGHT`..`MAX_HEIGHT`. */
const HEIGHT_BAND: Record<Binding, readonly [low: number, high: number]> = {
  paperback: [0, 0.6],
  hardback: [0.4, 1],
};

function fallbackColour(id: string): string {
  const index = Math.floor(hashUnit(`${id}-colour`) * FALLBACK_COLOURS.length);
  return FALLBACK_COLOURS[index] ?? '#6b4f6b';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
