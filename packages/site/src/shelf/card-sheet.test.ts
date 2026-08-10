import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dismissThreshold, ENTER_MS, EXIT_MS, SHEET_QUERY } from './card-sheet.ts';

/**
 * The breakpoint is a fact two languages hold, so something has to hold them
 * together.
 *
 * The presentation switch is CSS-only and the drag is not — dragging the desktop
 * `×` must do nothing, so the drag reads `SHEET_QUERY` while the stylesheet
 * writes the same query out. That is a drift risk with a silent failure mode: a
 * sheet you can drag above the breakpoint, or one you cannot drag below it, with
 * nothing going red. This repo prefers a named check to care.
 */

const SHELF_ASTRO = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'Shelf.astro'),
  'utf8',
);

describe('the breakpoint is expressed once and read by both', () => {
  it('matches the media query in Shelf.astro', () => {
    expect(
      SHELF_ASTRO,
      `the stylesheet and SHEET_QUERY disagree. The drag reads "${SHEET_QUERY}"; if the CSS ` +
        'switches at a different size, the sheet is draggable where there is no sheet',
    ).toContain(`@media ${SHEET_QUERY}`);
  });

  it('points the stylesheet at the one place the query lives', () => {
    // Without the comment the next person to touch either side has no way to
    // know the other exists.
    expect(SHELF_ASTRO).toContain('SHEET_QUERY');
  });

  it('is not held anywhere else', () => {
    // A third holder is exactly what the attribution surface was placed to
    // avoid becoming, and what content-by-breakpoint was rejected for.
    const occurrences = SHELF_ASTRO.match(/@media \(max-width: 700px\)/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});

describe('the dismiss threshold', () => {
  it('is proportional, so a short sheet needs a short drag', () => {
    // A 150px landscape sheet: 45px, against the 64px flat threshold that was
    // rejected for being 43% of the whole thing.
    expect(dismissThreshold(150)).toBe(45);
  });

  it('is capped, so a tall sheet never demands a drag across half the screen', () => {
    expect(dismissThreshold(325)).toBe(80);
    expect(dismissThreshold(2000)).toBe(80);
  });
});

describe('motion', () => {
  it('leaves faster than it arrives', () => {
    // Arriving wants to be seen; leaving wants to be out of the way.
    expect(EXIT_MS).toBeLessThan(ENTER_MS);
  });

  it('states both durations in the stylesheet that performs them', () => {
    expect(SHELF_ASTRO).toContain(`transform ${String(ENTER_MS)}ms`);
    expect(SHELF_ASTRO).toContain(`transform ${String(EXIT_MS)}ms`);
  });
});
