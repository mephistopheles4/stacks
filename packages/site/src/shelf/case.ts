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
  /** Breathing room at each end of a shelf. */
  padding: 0.06,
} as const;

/**
 * The case grows with the library, always keeping one empty shelf ahead.
 *
 * A fixed four-shelf unit means a small library sits in a mostly empty case and
 * the camera has to back off far enough to frame all that empty wood, which
 * leaves the spines too small to read. Sizing to content keeps the books large
 * and the shelf honest — there is always somewhere for the next book to go.
 */
const MIN_ROWS = 2;

/**
 * Slack kept at the end of every row.
 *
 * A leaning book is wider than an upright one: tilting a 0.95-tall board by
 * 0.062rad pushes its lower corner about 0.03 further out. Without this the last
 * book on a full shelf leans straight through the side of the case.
 */
export const LEAN_ALLOWANCE = 0.05;

export function rowsForCase(usedRows: number): number {
  return Math.max(usedRows + 1, MIN_ROWS);
}
