import type { Box } from './pickup-gate.ts';

/**
 * G35, the open book's pages at rest in a flat layer (#599, ADR-0151, claims
 * C2, C3, C4, C7 and C11): the judges, kept apart from the browser that reads.
 *
 * `scripts/smoke-render.ts` drives a built page and hands what it read to these
 * functions; each is pure, so every clause is planted red in
 * `flat-layer-gate.test.ts` rather than trusted.
 *
 * iOS WebKit will not start a native scroll inside `CSS3DRenderer`'s layer, and
 * no desktop engine shows it, so what this holds is the structure that lets a
 * finger scroll: at rest no ancestor of a page is 3D, the page stands where its
 * slot was, and it goes back into 3D before a book moves. That a finger really
 * scrolls is `scripts/ios-swipe-check.ts`'s, on a real iPhone.
 */

/** One ancestor of a page: what makes a subtree 3D is read off its computed style. */
export interface FlatAncestor {
  readonly name: string;
  readonly transformStyle: string;
  readonly transform: string;
}

/** The pages as they stand once the book is open at rest. */
export interface FlatRestRead {
  /** The case, for a failure line: `desktop`, `phone, turned`, … */
  readonly label: string;
  /** Pages inside `.held-flat`, and inside `.held-layer`. */
  readonly flatCount: number;
  readonly layerCount: number;
  /** Every ancestor of both pages, from the page's parent to the document. */
  readonly ancestors: readonly FlatAncestor[];
  /** The two pages' boxes, and the two empty slots' boxes, on screen. */
  readonly pages: readonly Box[];
  readonly slots: readonly Box[];
  /** Which page each box above is (`left` or `right`), so a page is held to its own slot. */
  readonly pageSides: readonly string[];
  readonly slotSides: readonly string[];
  /** The sides this viewport draws: both on desktop, the right page alone on a phone. */
  readonly expectedSides: readonly string[];
  /** Each slot's computed `pointer-events`. */
  readonly slotEvents: readonly string[];
  /** Both paper sheets drawn. */
  readonly sheetsVisible: boolean;
}

/** How far a page may stand from its slot's box on any edge, in CSS pixels (C3). */
export const FLAT_EDGE_PX = 1;

/** The largest difference on any edge between two boxes. */
function edgeGap(a: Box, b: Box): number {
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.right - b.right),
    Math.abs(a.bottom - b.bottom),
  );
}

export function flatRestFailures(read: FlatRestRead): string[] {
  const failures: string[] = [];
  const at = `flat layer, ${read.label}`;
  if (read.flatCount !== 2 || read.layerCount !== 0) {
    failures.push(
      `${at}: ${String(read.flatCount)} pages in .held-flat and ${String(read.layerCount)} in .held-layer, not 2 and 0`,
    );
  }
  for (const side of read.expectedSides) {
    if (!read.pageSides.includes(side)) failures.push(`${at}: the ${side} page was not drawn`);
  }
  if (read.ancestors.length === 0) failures.push(`${at}: no ancestor of a page was read`);
  for (const ancestor of read.ancestors) {
    if (ancestor.transformStyle !== 'flat') {
      failures.push(
        `${at}: ${ancestor.name} is transform-style ${ancestor.transformStyle}, not flat`,
      );
    }
    if (ancestor.transform.startsWith('matrix3d')) {
      failures.push(`${at}: ${ancestor.name} carries a 3D transform`);
    }
  }
  if (read.slots.length !== 2) {
    failures.push(`${at}: ${String(read.slots.length)} slots were found, not 2`);
  }
  read.pages.forEach((page, index) => {
    const side = read.pageSides[index];
    const own = read.slots[read.slotSides.indexOf(side ?? '')];
    if (side === undefined || own === undefined) {
      failures.push(`${at}: page ${String(index)} has no slot of its own to be held to`);
      return;
    }
    const gap = edgeGap(page, own);
    if (!(gap <= FLAT_EDGE_PX)) {
      failures.push(
        `${at}: the ${side} page stands ${gap.toFixed(2)}px from its own slot's box, over ${String(FLAT_EDGE_PX)}px`,
      );
    }
  });
  if (read.slotEvents.some((events) => events !== 'none')) {
    failures.push(`${at}: a slot takes pointer events (${read.slotEvents.join(', ')})`);
  }
  if (!read.sheetsVisible)
    failures.push(`${at}: a paper sheet is not drawn while the book is open`);
  return failures;
}

/** Where the pages are at one moment of a close or a put-back. */
export interface FlatMotionRead {
  /** `closing`, `put-back` or `settled`, and the case. */
  readonly label: string;
  readonly flatCount: number;
  readonly layerCount: number;
  /** Each page's inline `transform`. */
  readonly transforms: readonly string[];
  /** Whether the pages are expected: false once the book has settled back on its shelf. */
  readonly pagesExpected: boolean;
}

/** C4: before a book moves its pages are back in 3D, and none is left in the flat layer. */
export function flatMotionFailures(read: FlatMotionRead): string[] {
  const failures: string[] = [];
  const at = `flat layer, ${read.label}`;
  if (read.flatCount !== 0) {
    failures.push(`${at}: ${String(read.flatCount)} pages still in .held-flat`);
  }
  const expected = read.pagesExpected ? 2 : 0;
  if (read.layerCount !== expected) {
    failures.push(
      `${at}: ${String(read.layerCount)} pages in .held-layer, where ${String(expected)} belong`,
    );
  }
  if (read.transforms.some((transform) => transform !== '')) {
    failures.push(`${at}: a page keeps an inline transform (${read.transforms.join(' | ')})`);
  }
  return failures;
}

/** The pages in the same call that opened the book, which no frame has yet touched. */
export interface FlatOpenedRead {
  readonly label: string;
  readonly flatCount: number;
  readonly transforms: readonly string[];
}

/**
 * A book that reaches rest outside a frame (reduced motion) must show no frame
 * with a page at the closed pose or at the layer's corner: both pages are in
 * the flat layer and placed, in that same call.
 */
export function flatOpenedFailures(read: FlatOpenedRead): string[] {
  const failures: string[] = [];
  const at = `flat layer, ${read.label}`;
  if (read.flatCount !== 2) {
    failures.push(
      `${at}: ${String(read.flatCount)} pages in .held-flat in the call that opened it`,
    );
  }
  for (const transform of read.transforms) {
    const numbers = /^matrix\((.*)\)$/.exec(transform)?.[1]?.split(', ').map(Number) ?? [];
    if (numbers.length !== 6 || numbers.some((n) => !Number.isFinite(n))) {
      failures.push(`${at}: a page is not placed by a 2D matrix (${transform})`);
    } else if (numbers[0]! * numbers[3]! - numbers[1]! * numbers[2]! === 0) {
      failures.push(`${at}: a page is collapsed by its 2D matrix (${transform})`);
    } else if (numbers[4] === 0 && numbers[5] === 0) {
      failures.push(`${at}: a page sits at the layer's corner (${transform})`);
    }
  }
  return failures;
}

/** What the frames of a put-back showed, sampled once a frame until the book was home. */
export interface FlatPutBackRead {
  readonly label: string;
  /** Frames sampled, and those in which the book was off its open rest with a page in the flat layer. */
  readonly frames: number;
  readonly violations: number;
  /** Whether the book came home, hand empty and nothing in motion, within the sampling window. */
  readonly ended: boolean;
}

/**
 * C4, for a put-back from the open book: its pages return to 3D before the book
 * moves, so no frame shows the book off its open rest with a page still flat. A
 * run that never saw the book leave its rest would pass this vacuously, so a
 * window that did not end is a failure.
 */
export function flatPutBackFailures(read: FlatPutBackRead): string[] {
  const at = `flat layer, put-back, ${read.label}`;
  const failures: string[] = [];
  if (!read.ended) failures.push(`${at}: the book never came home while sampled`);
  if (read.violations > 0) {
    failures.push(
      `${at}: ${String(read.violations)} of ${String(read.frames)} frames had a page in .held-flat while the book moved`,
    );
  }
  return failures;
}
