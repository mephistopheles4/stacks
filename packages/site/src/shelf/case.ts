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
   * which holds it at or above `swayOf(MAX_HEIGHT, MAX_PROP_LEAN)`.
   *
   * **0.12 and not 0.06, because the steepest lean stopped being `MAX_LEAN`.** A
   * book propped across a year gap leans four times further than one slumping of
   * its own accord, and a run inherits that angle — so the last spine on a row
   * can now swing 0.117 where this used to be sized for 0.03. G25 went on
   * comparing against `MAX_LEAN` for a while after that stopped being true, which
   * is the failure mode a scoreboard exists to prevent and did not: the gate was
   * green and the constant it named was the wrong one.
   */
  endReserve: 0.12,
} as const;

/**
 * How far every member except the uprights is shrunk off the planes they share.
 *
 * **Every member of the bookcase is a box, and 46 pairs of their faces shared a
 * plane while overlapping in the other two axes** — a plank is
 * `SHELF.width + SHELF.sideThickness * 2` wide and an upright stands at
 * `±(SHELF.width + SHELF.sideThickness) / 2` with a half-thickness of
 * `SHELF.sideThickness / 2`, so both land on `±1.79` exactly. That is the
 * condition for two fragments to arrive at the same depth and let floating-point
 * precision decide which wins, and the camera's near and far of 0.1 and 100
 * leave the depth buffer nothing to separate them with.
 *
 * **The uprights keep every plane they own; each other member is shrunk off
 * them.** Planks shrink in `x` and in `z` — ends inside the uprights, front and
 * back faces just behind the uprights'. ⚠️ **The depth matters as much as the
 * width**: once a plank's end sits inside an upright the two still share an
 * overlapping band at `z = ±0.36`, which is 20 of the 46 pairs and is what a
 * first pass on [#284](https://github.com/mephistopheles4/stacks/issues/284)
 * left behind after clearing 10.
 *
 * **0.004 world units** is about 1.2 mm at this scene's scale against an upright
 * 0.09 thick, so every shortened face sits well inside a neighbour's volume
 * where nothing can see it. The silhouette does not move.
 *
 * ⚠️ **Unconditional, and that is the point.** The prototype armed it off a
 * `?wood=` query parameter, which was right for an arm switch and wrong for a
 * bookcase whose backboard flickers with no texture at all — the backboard is a
 * second material in a second colour, so its ties resolve to two different
 * pixels — so the **16** pairs it takes part in were visible on `main`. The
 * other **30** were invisible only because every woodwork face carries the
 * identical flat one, and anything that gives the woodwork a texture makes all
 * 46 visible at once. A texture did not cause this; it revealed it.
 *
 * ⚠️ **16 and 30, not 36.** The 36 is `46 - 10`: what #284's x-only first pass
 * left behind, which is a different quantity from what was ever *visible*. Both
 * numbers are in #296 and #301 and it is easy to carry the wrong one across —
 * this comment was written with 36 in it and CodeRabbit caught it on #308.
 *
 * Held by G51 (`coplanar-faces`), which enumerates the class from these
 * constants rather than from a copy of them. See #296 and #301.
 */
export const PLANK_INSET = 0.004;

/**
 * The backboard's share, which is **twice** the plank's and not tidiness.
 *
 * Shrunk by the same amount as the planks, the backboard's sides and the plank
 * ends land on one *new* shared plane — a tie the uprights happen to hide,
 * which is a worse thing to rely on than not creating. Doubling separates them.
 *
 * It is applied in `x` and in `y`: sides inside the uprights, top and bottom
 * clear of theirs.
 */
export const BACKBOARD_INSET = PLANK_INSET * 2;

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
