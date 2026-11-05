/**
 * When the drawer closes (docs/spec/ask-the-library.md S7), as decisions with no
 * DOM in them so they can be tested and the glue stays thin.
 */

/** Closed by: the X, Escape, a click outside the panel, or a book being picked up. */
export type CloseReason = 'button' | 'escape' | 'outside' | 'pickup';

/**
 * A click outside the panel closes it; a drag on the shelf to look around does
 * not. The shelf is dragged by pressing on the canvas and moving, so a press
 * that travels further than `threshold` pixels before it is released is a drag.
 */
export function createOutsideClick(threshold = 6): {
  down(x: number, y: number, insidePanel: boolean): void;
  up(x: number, y: number, insidePanel: boolean): boolean;
} {
  let start: { x: number; y: number } | undefined;
  return {
    down(x, y, insidePanel) {
      start = insidePanel ? undefined : { x, y };
    },
    up(x, y, insidePanel) {
      const from = start;
      start = undefined;
      if (from === undefined || insidePanel) return false;
      return Math.hypot(x - from.x, y - from.y) <= threshold;
    },
  };
}

/**
 * Escape, with the drawer open: the drawer takes it and the shelf does not see
 * it, so a held book stays held (S7, "with a held book"). With the drawer shut it
 * is none of the drawer's business.
 */
export function escapeTakenBy(open: boolean, key: string): boolean {
  return open && key === 'Escape';
}
