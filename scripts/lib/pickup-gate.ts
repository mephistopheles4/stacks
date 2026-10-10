/**
 * G35 (`enhanced-card`), reworded for picking a book up, and the open spread
 * of the spec's §3.6 — the judges, kept apart from the browser that reads.
 *
 * `scripts/smoke-render.ts` drives a built page under its CSP and hands what it
 * read to these functions; each is pure, so every clause is planted red in
 * `pickup-gate.test.ts` rather than trusted.
 *
 * **What moved from the card** (spec §3.5): every block renders on the page;
 * `read` is not suppressed; the fallback link; link shape and accessible
 * names; the announcer, with put-back as the dismissal; the put-back control
 * where the close control was; `published` rendering and the collapse rules,
 * which stay unit tests in `card.test.ts`; and the enlarged cover, whose Escape
 * now leaves the book held. **What is new**: `location.href` unchanged after a
 * pickup, the page hidden from sight and from the accessibility tree until it
 * fades in, and the spread's three numbers. `checkSheet` retired with the sheet.
 */

/** What a click on a book left on the page, read at rest and across a second pickup. */
export interface PickupRead {
  /** The held book's title, from the shelf's own read-back. */
  readonly held: string;
  /** The left-hand page's title. */
  readonly pageTitle: string;
  /** The page's reading line: renders on every book, and leads with the status word. */
  readonly reading: string;
  readonly hasObjectLine: boolean;
  readonly linkCount: number;
  /** Every `<a>` in the links row, as `target|rel|name`. */
  readonly links: readonly string[];
  /** How many of those links drew a mark. */
  readonly markCount: number;
  readonly announced: string;
  /** The put-back control: a real `<button>`, with an accessible name. */
  readonly putBack: { readonly tag: string; readonly name: string } | undefined;
  /** Both pages added hidden by `visibility`, and never visible while their opacity is 0. */
  readonly hiddenBeforeFade: boolean;
  /** Both pages visible once at rest. */
  readonly visibleAtRest: boolean;
  /** `location.href` the same after the pickup as before it (spec §3.9). */
  readonly hrefUnchanged: boolean;
  /** The pickup pushed its own history entry. */
  readonly historyHeld: boolean;
  /** Focus stayed where it was: there is still no keyboard path to the shelf (spec §3.4, ADR-0049). */
  readonly focusUnmoved: boolean;
  /**
   * Both pages inside the desktop viewport at rest, within a pixel — the
   * desktop half of the card's old overflow check, which the phone check keeps
   * for the right-hand page at 375×812.
   */
  readonly pagesInView: boolean;
  /**
   * A book `library.json` flags with Thoughts, picked up: whether its page showed
   * them, or `undefined` when no such book was found to pick up. Opening to the
   * Thoughts is the point of the pickup (spec §3.4).
   */
  readonly thoughtsShown: boolean | undefined;
  /** After a second book was picked up in its place. */
  readonly second: {
    readonly held: string;
    readonly announced: string;
    /** The second book's page carries a put-back control of its own. */
    readonly putBack: boolean;
    /** Pages in the layer: exactly the held book's two, none left from the first. */
    readonly pages: number;
  };
  /** After the put-back control was pressed. */
  readonly afterPutBack: PutDown;
  /** After Escape, and after the back button, each on a fresh pickup (spec §3.9). */
  readonly afterEscape: PutDown;
  readonly afterBack: PutDown;
}

/** The page after a book was put down, by whichever of the three ways. */
export interface PutDown {
  readonly held: boolean;
  readonly announced: string;
  readonly historyHeld: boolean;
  readonly hrefUnchanged: boolean;
  readonly pages: number;
}

export function pickupFailures(read: PickupRead): string[] {
  const failures: string[] = [];
  if (read.pageTitle !== read.held) {
    failures.push(`the held page carries "${read.pageTitle}", not the held book "${read.held}"`);
  }
  if (!read.hrefUnchanged) {
    failures.push('location.href changed on pickup: the address must name no book (spec §3.9)');
  }
  if (!read.historyHeld) failures.push('the pickup pushed no history entry of its own');
  if (!read.hiddenBeforeFade) {
    failures.push(
      'the pages were not hidden by visibility before the cover opened: text shows ' +
        'through the closing cover, and a screen reader reads what is not on screen',
    );
  }
  if (!read.visibleAtRest) failures.push('the pages are not visible with the book at rest');
  if (!read.focusUnmoved) {
    failures.push('focus moved on pickup — it must stay put, with no keyboard path to the shelf');
  }
  if (!read.pagesInView) {
    failures.push('the held pages run off the desktop viewport at rest');
  }
  if (read.thoughtsShown === undefined) {
    failures.push(
      'no book flagged with Thoughts was picked up — the fixture shelf has them, so the ' +
        'notes stage or the flag dropped them',
    );
  } else if (!read.thoughtsShown) {
    failures.push('a book flagged with Thoughts opened without them on its page');
  }

  // Moved from the card: §3.5's checks 1 to 5 (every block, `read`, the
  // collapse rules, the fallback link, link shape and names).
  if (read.reading.length === 0) {
    failures.push('the page renders no reading line — it must render on every book');
  }
  if (read.linkCount === 0) {
    failures.push('the page renders no provider links at all — the row always renders');
  }
  for (const link of read.links) {
    const [target, rel, name] = link.split('|');
    if (target !== '_blank' || rel !== 'noopener noreferrer') {
      failures.push(`a page link opens unsafely: target="${target ?? ''}" rel="${rel ?? ''}"`);
    }
    if ((name ?? '').length === 0) {
      failures.push('a page link has no accessible name — an icon-only link with none is unusable');
    }
  }
  if (read.linkCount > 1 && read.markCount === 0) {
    failures.push(
      `${String(read.linkCount)} provider links and not one drew a mark — an icon-only link ` +
        'with no icon',
    );
  }

  // §3.5's check 6, the announcer, with put-back as the dismissal.
  if (read.announced.length === 0) failures.push('the live region announced nothing on pickup');
  if (read.second.announced.length === 0) {
    failures.push('picking up a second book announced nothing');
  } else if (read.second.announced === read.announced) {
    failures.push(`the announcement did not change for a second book (still "${read.announced}")`);
  }
  if (read.second.held === read.held) failures.push('the second pickup left the first book held');

  // §3.5's check 7: the close control, become the put-back control.
  if (read.putBack === undefined) {
    failures.push('the held page has no put-back control');
  } else {
    if (read.putBack.tag !== 'BUTTON') {
      failures.push(`the put-back control is a <${read.putBack.tag.toLowerCase()}>, not a button`);
    }
    if (read.putBack.name.length === 0)
      failures.push('the put-back control has no accessible name');
  }
  if (!read.second.putBack) failures.push("the second book's page has no put-back control");
  if (read.second.pages !== 2) {
    failures.push(
      `${String(read.second.pages)} pages in the layer with one book held — the first book's ` +
        'pages outlived it',
    );
  }

  failures.push(
    ...putDownFailures(read.afterPutBack, 'the put-back control'),
    ...putDownFailures(read.afterEscape, 'Escape'),
    ...putDownFailures(read.afterBack, 'the back button'),
  );
  return failures;
}

/** All three ways down leave the page as it was before the pickup (spec §3.9). */
function putDownFailures(after: PutDown, how: string): string[] {
  const failures: string[] = [];
  if (after.held) failures.push(`${how} left the book held`);
  if (after.announced.length > 0) {
    failures.push(`the announcer still says "${after.announced}" after ${how}`);
  }
  if (after.historyHeld) failures.push(`${how} left the pickup's history entry in place`);
  if (!after.hrefUnchanged) failures.push(`location.href changed on ${how}`);
  if (after.pages !== 0) {
    failures.push(`${String(after.pages)} pages left in the layer after ${how}`);
  }
  return failures;
}

/** The enlarged cover, opened from the held page. */
export interface ViewerRead {
  readonly opened: boolean;
  /** The image's rendered width, in CSS pixels. */
  readonly width: number;
  readonly escapeClosedViewer: boolean;
  /** One Escape closes the viewer and leaves the book held (§3.5, check 9). */
  readonly heldAfterEscape: boolean;
  /**
   * The held copy `library.json` names for this book's cover, or nothing for a
   * book with none, and whether the enlarged view showed it (spec §3.4, #377).
   * Read from `library.json` rather than from the page, so a control that
   * offered the wrong file cannot vouch for itself (#412's round 1, integrity F6).
   */
  readonly held: string | undefined;
  readonly showedHeld: boolean;
  /**
   * A book with a cover and no held copy, walked to as well, and whether its
   * enlarged view showed the shelf copy: the viewer's other path, which a walk
   * that stopped at the first held copy would never reach (#412's round 1,
   * integrity F8).
   */
  readonly withoutHeld: { readonly showedOwn: boolean } | undefined;
  /**
   * With every request for the held copy refused, whether the enlarged view
   * fell back to the shelf copy rather than a broken image — a browser holding a
   * `library.json` from before a copy was taken down (#416).
   */
  readonly fellBack: boolean;
  /**
   * Whether any element of the held pages carried a cover path in an attribute.
   * The paths are handed to the viewer in memory and never written into the
   * page (#416, CodeQL's `js/xss-through-dom`).
   */
  readonly pathInPage: boolean;
}

/** The page shows no thumbnail, so "bigger" is against the card's old 4.5rem one, doubled. */
export const MIN_ENLARGED_PX = 144;

export function viewerFailures(read: ViewerRead | undefined): string[] {
  if (read === undefined) {
    return ['no held book offered its cover larger, so the enlarged view was never checked'];
  }
  const failures: string[] = [];
  if (!read.opened) failures.push("the page's cover control did not open the enlarged view");
  if (read.width < MIN_ENLARGED_PX) {
    failures.push(
      `the enlarged cover is ${read.width.toFixed(0)}px wide — not the closer look it exists for`,
    );
  }
  if (!read.escapeClosedViewer) failures.push('Escape did not close the enlarged cover');
  if (!read.heldAfterEscape) {
    failures.push(
      'the Escape that closed the enlarged cover also put the book back — one keystroke ' +
        'left two surfaces',
    );
  }
  if (read.held === undefined) {
    failures.push(
      'no held book offered a held copy, so the enlarged view of one was never checked',
    );
  } else if (!read.showedHeld) {
    failures.push(`the enlarged view did not show the held copy ${read.held}`);
  }
  if (read.withoutHeld === undefined) {
    failures.push('no book without a held copy was opened, so the viewer’s other path went unseen');
  } else if (!read.withoutHeld.showedOwn) {
    failures.push('for a book with no held copy, the enlarged view did not show the shelf copy');
  }
  if (!read.fellBack) {
    failures.push('a held copy that failed to load left the enlarged view without the shelf copy');
  }
  if (read.pathInPage) {
    failures.push(
      'a cover path was written into the held page — the viewer must be handed it in memory',
    );
  }
  return failures;
}

/** The held page at phone size, which frames the right-hand page alone. */
export interface PhoneRead {
  /** The right-hand page lies inside the viewport, within a pixel. */
  readonly pageInView: boolean;
  /** Title and author lead the right-hand page on a phone (§3.4). */
  readonly titleLeads: boolean;
  /** The put-back control is inside the viewport: no empty space to tap otherwise. */
  readonly putBackInView: boolean;
}

export function phoneFailures(read: PhoneRead | undefined): string[] {
  if (read === undefined) return ['no book could be picked up at phone size'];
  const failures: string[] = [];
  if (!read.pageInView) failures.push('at phone size the right-hand page does not fit the screen');
  if (!read.titleLeads) failures.push('at phone size the title does not lead the right-hand page');
  if (!read.putBackInView) {
    failures.push(
      'at phone size the put-back control is off screen, and there is no empty space to tap',
    );
  }
  return failures;
}

/** §3.6, as `window.__shelf.spread()` reads it off the scene. */
export interface SpreadRead {
  readonly boardAngle: number;
  readonly left: { readonly width: number; readonly height: number };
  readonly block: { readonly width: number; readonly height: number };
  readonly gutterGap: number;
  readonly leftTilt: number;
  readonly rightTilt: number;
}

/** The owner's tolerances: ±0.5° on angles and ±1 projected pixel on lengths. */
export const SPREAD_DEGREES = 0.5;
export const SPREAD_PIXELS = 1;

export function spreadFailures(read: SpreadRead | undefined, book: string): string[] {
  if (read === undefined) return [`${book}: no open spread at rest to measure`];
  const failures: string[] = [];
  if (Math.abs(read.boardAngle - 180) > SPREAD_DEGREES) {
    failures.push(
      `${book}: the front board rests at ${read.boardAngle.toFixed(2)}° to the page block, not 180°`,
    );
  }
  for (const [name, tilt] of [
    ['left', read.leftTilt],
    ['right', read.rightTilt],
  ] as const) {
    if (tilt > SPREAD_DEGREES) {
      failures.push(`${book}: the ${name} page is ${tilt.toFixed(2)}° off square to the camera`);
    }
  }
  if (Math.abs(read.left.height - read.block.height) > SPREAD_PIXELS) {
    failures.push(
      `${book}: the left page is ${read.left.height.toFixed(1)}px tall against the page ` +
        `block's ${read.block.height.toFixed(1)}px`,
    );
  }
  if (Math.abs(read.left.width - read.block.width) > SPREAD_PIXELS) {
    failures.push(
      `${book}: the left page is ${read.left.width.toFixed(1)}px wide against the page ` +
        `block's ${read.block.width.toFixed(1)}px`,
    );
  }
  if (read.gutterGap > SPREAD_PIXELS) {
    failures.push(`${book}: the pages stand ${read.gutterGap.toFixed(1)}px apart at the gutter`);
  }
  return failures;
}
