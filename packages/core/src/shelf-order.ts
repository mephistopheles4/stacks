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
   * An explicit `shelf_order` wins over everything, including the rule that
   * floats a book you are reading to the front — someone who numbered a shelf
   * meant it.
   *
   * Ordered books come first, so pinning three favourites does not require
   * numbering the other twenty-eight.
   */
  const left = a.shelfOrder;
  const right = b.shelfOrder;
  if (left !== undefined || right !== undefined) {
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    if (left !== right) return left - right;
  }

  if (a.status === 'reading' && b.status !== 'reading') return -1;
  if (b.status === 'reading' && a.status !== 'reading') return 1;

  const leftDate = a.finished ?? a.started ?? '';
  const rightDate = b.finished ?? b.started ?? '';
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);

  return a.title.localeCompare(b.title);
}

/** Statuses that appear on the shelf at all. Wishlist books are not owned yet. */
export const SHELVED_STATUSES: ReadonlySet<string> = new Set(['read', 'reading', 'abandoned']);
