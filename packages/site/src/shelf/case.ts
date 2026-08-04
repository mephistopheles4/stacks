/**
 * The bookcase itself — its dimensions, and how many shelves it has.
 *
 * Its own module, with no Three.js in it, so that the placement arithmetic and
 * the scene graph read the *same* case. `placeShelf` deliberately does not take
 * the geometry as an argument: a test that supplies its own shelf is asserting
 * about a shelf that does not ship, and the numbers here are load-bearing — the
 * residual G16 measures is 0.0012, which is exactly `SKIN`. See
 * `docs/adr/0029-placement-imports-the-case.md`.
 */

/**
 * Proportions taken from a real bookcase rather than picked to look tidy.
 *
 * A hardback is roughly 3cm thick and 23cm tall, and a shelf about 90cm wide —
 * so width is ~4× book height and a shelf holds ~30 books. Matching that ratio
 * is what makes the thing read as furniture instead of as a chart.
 */
export const SHELF = {
  width: 3.4,
  rowHeight: 1.12,
  depth: 0.72,
  plankThickness: 0.07,
  sideThickness: 0.09,
  backThickness: 0.05,
  /** Gap between neighbouring books. */
  bookGap: 0.008,
  /** Books sit slightly forward of the backboard, as they do in life. */
  bookDepth: 0.52,
  /**
   * How far short of the right-hand upright a row stops.
   *
   * At one end, not both, and that asymmetry is the point: books stand *against*
   * the left upright and run right, as a shelf fills, so the left end has no
   * breathing room by design — a book that leans left and starts a finger's
   * width clear of the side is leaning on nothing.
   *
   * It was `padding: 0.06`, doubled and subtracted along with a separate
   * `LEAN_ALLOWANCE` to make a capacity that only `scene.ts` knew. The comment
   * said "at each end" and the placement cursor had been contradicting it for as
   * long as both existed. See ADR-0031.
   *
   * **It also pays for the last book's own lean.** Clearance is charged to the
   * left of the book that leans, where the angle changes; the last book of a row
   * has nothing on its right to charge, so this is what its swing swings into.
   * That was `LEAN_ALLOWANCE`'s job and it is now this one's — pinned by G25,
   * which holds it at or above `swayOf(MAX_HEIGHT, MAX_LEAN)`.
   */
  endReserve: 0.06,
} as const;

/**
 * How much of a shelf books may actually occupy.
 *
 * **The one answer to "how wide is a shelf".** `toRows` packs into this; the
 * placement cursor runs from `-SHELF.width / 2`, which is the left inner face
 * and where this band begins. Three different answers to that question were live
 * at once until ADR-0031, and nothing compared them.
 */
export const USABLE_WIDTH = SHELF.width - SHELF.endReserve;

/**
 * The case grows with the library, always keeping one empty shelf ahead.
 *
 * A fixed four-shelf unit means a small library sits in a mostly empty case and
 * the camera has to back off far enough to frame all that empty wood, which
 * leaves the spines too small to read. Sizing to content keeps the books large
 * and the shelf honest — there is always somewhere for the next book to go.
 */
const MIN_ROWS = 2;

export function rowsForCase(usedRows: number): number {
  return Math.max(usedRows + 1, MIN_ROWS);
}
