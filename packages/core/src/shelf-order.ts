/**
 * Where a book sits on the shelf.
 *
 * Lives in core rather than in the renderer because it is a domain rule, not a
 * drawing detail: the CLI has to agree with the shelf about what "first" means,
 * or `stacks order --renumber` would write numbers that reshuffle the display
 * it was numbering.
 */

/** The parts of a book that decide its position. */
export interface Positionable {
  readonly shelfOrder?: number;
  readonly status: string;
  readonly started?: string;
  readonly finished?: string;
  readonly title: string;
}

export function compareShelfPosition(a: Positionable, b: Positionable): number {
  /**
   * A book you are reading comes first, ahead of everything including a
   * numbered one.
   *
   * `shelf_order` used to win over this, on the reasoning that someone who
   * numbered a shelf meant it. The trouble is `stacks order --renumber`, which
   * numbers *every* shelved book: after one run there were no unnumbered books
   * left, so "unset means reading first, then newest finished" described a
   * state the vault could no longer be in, and the next book you picked up
   * sorted behind all thirty-one. Pinning a favourite should not cost you the
   * ability to see what you are reading.
   *
   * The shelf is generated, not curated (brief, goal 3); `shelf_order` arranges
   * the generated part rather than overriding the one rule that reflects what
   * you are doing right now.
   */
  if (a.status === "reading" && b.status !== "reading") return -1;
  if (b.status === "reading" && a.status !== "reading") return 1;

  /**
   * Then an explicit `shelf_order`, lowest first. Numbered books come before
   * unnumbered ones, so pinning three favourites does not require numbering the
   * other twenty-eight.
   */
  const left = a.shelfOrder;
  const right = b.shelfOrder;
  if (left !== undefined || right !== undefined) {
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    if (left !== right) return left - right;
  }

  const leftDate = a.finished ?? a.started ?? "";
  const rightDate = b.finished ?? b.started ?? "";
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);

  return a.title.localeCompare(b.title);
}

/** Statuses that appear on the shelf at all. Wishlist books are not owned yet. */
export const SHELVED_STATUSES: ReadonlySet<string> = new Set([
  "read",
  "reading",
  "abandoned",
]);
