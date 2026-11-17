/**
 * The abandoned books' bookcase (#604, spec S12): which books stand on it, and which stay off the
 * main bookcase.
 *
 * In a room the abandoned books leave the main shelf for a second, live copy of the bookcase at the
 * room's `slot_abandoned`: two rows, spine out only, the most recently abandoned first. `?shelf`, and
 * the plain shelf a failed room or a lost context ends on, keep them on the main bookcase as ever,
 * because `abandoned` is still a shelved status in core (S12.5) and only the room's layout moves them.
 *
 * No `three` and no DOM, so vitest's node environment runs every rule here. Ported from the #593
 * prototype's `room-abandoned-593.ts`; what it adds is the recency order and the cut that keeps the
 * most recent, where the prototype kept the first two rows of the shelf's own order.
 */
import type { LibraryBook } from '@stacks/core';
import { toRows, type ShelfRow } from './books.ts';
import type { BooksSettings } from './shelf-settings.ts';

/** Always two rows: the clock and the encyclopedias are baked on its top, and a third would pass through them (S12.6). */
export const ABANDONED_ROWS = 2;

/** The node a room places this bookcase at: a named empty of the committed room, never a position in code. */
export const ABANDONED_SLOT = 'slot_abandoned';

/**
 * The books the main bookcase carries: every book, or in a room every book but the abandoned. The
 * wishlist is never among them either way (`toRows` takes the shelved statuses alone).
 */
export function mainShelfBooks(
  books: readonly LibraryBook[],
  inRoom: boolean,
): readonly LibraryBook[] {
  return inRoom ? books.filter((book) => book.status !== 'abandoned') : books;
}

/** A date that is there, or `undefined`: an empty string is no date. */
function dated(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** Newest first, and a missing date after every date. `<` on ISO dates is chronological. */
function newestFirst(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? 1 : -1;
}

/**
 * Most recently abandoned first (S12.3): by `finished`, then `started`, newest first, a book with a
 * missing date after every book with one, so a book with neither date is last; then by title, compared
 * lower-cased with `<` and never a locale's collation (which differs between a visitor's browser and
 * the next, as `wishlistBooks` says), then by id, so the same library gives the same shelf on every load.
 */
export function compareRecency(a: LibraryBook, b: LibraryBook): number {
  const byFinished = newestFirst(dated(a.finished), dated(b.finished));
  if (byFinished !== 0) return byFinished;
  const byStarted = newestFirst(dated(a.started), dated(b.started));
  if (byStarted !== 0) return byStarted;
  const [x, y] = [a.title.toLowerCase(), b.title.toLowerCase()];
  if (x !== y) return x < y ? -1 : 1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface AbandonedShelf {
  /** The shelf's rows, as `toRows` packs them, every book spine out. Never more than `ABANDONED_ROWS`. */
  readonly rows: readonly ShelfRow[];
  /** How many abandoned books are not drawn. They stay in `library.json`: the cap is display only. */
  readonly left: number;
}

/**
 * The abandoned books in two rows, spine out, the most recent kept.
 *
 * They are offered newest first and kept while the shelf's own packer still fits them in two rows, and
 * the first one that does not fit ends it: a thinner, older book is never put on in place of a more
 * recent one that did not fit. The packer itself decides what a row holds, so a row here is a row the
 * main bookcase would have packed the same way.
 *
 * **`face_out: true` on an abandoned book is ignored here** (S12.2) and still honoured by `?shelf`'s
 * main bookcase: a book turned cover-forward takes a cover's width of a row, and two rows are few. The
 * book handed back is the note's own, so a pickup reads the real one; only its pose is spine out.
 */
export function abandonedShelf(
  books: readonly LibraryBook[],
  settings: BooksSettings,
): AbandonedShelf {
  const abandoned = books.filter((book) => book.status === 'abandoned').sort(compareRecency);
  const originals = new Map(abandoned.map((book) => [book.id, book]));
  const spineOut = (shown: readonly LibraryBook[]): ShelfRow[] =>
    toRows(
      shown.map((book) => ({ ...book, faceOut: false })),
      settings,
    );

  let rows: ShelfRow[] = [];
  let kept = 0;
  while (kept < abandoned.length) {
    const next = spineOut(abandoned.slice(0, kept + 1));
    if (next.length > ABANDONED_ROWS) break;
    rows = next;
    kept += 1;
  }

  return {
    rows: rows.map((row) => ({
      label: row.label,
      books: row.books.map((entry) => ({
        ...entry,
        book: originals.get(entry.book.id) ?? entry.book,
      })),
    })),
    left: abandoned.length - kept,
  };
}
