/**
 * G35 (`enhanced-card`), reworded for picking a book up, and the open spread
 * of the spec's §3.6 — the judges, kept apart from the browser that reads.
 *
 * `scripts/smoke-render.ts` drives a built page under its CSP and hands what it
 * read to these functions; each is pure, so every clause is planted red in
 * `pickup-gate.test.ts` rather than trusted.
 *
 * **A picked-up book arrives closed** (#531, `picking-up-closed.md`): the board
 * lies flat to the block in the scene, the pages are hidden from sight and from
 * the accessibility tree, and the visitor opens it. Everything about the pages
 * is read from an **open** book; `ClosedRead` is the book before it.
 *
 * **What moved from the card** (spec §3.5): every block renders on the page;
 * `read` is not suppressed; the fallback link; link shape and accessible
 * names; the announcer, with put-back as the dismissal; the put-back control
 * where the close control was, now an X outside the pages; `published`
 * rendering and the collapse rules,
 * which stay unit tests in `card.test.ts`; and examining the held book (#418),
 * the enlarged cover reworked, whose Escape leaves only the view. **What is
 * new**: `location.href` unchanged after a pickup, the page hidden from sight
 * and from the accessibility tree until it fades in, the spread's three
 * numbers, and examining's closed board, turn, exits, focus and emptied hand.
 * `checkSheet` retired with the sheet.
 */

/**
 * The hint the header shows while a book is closed at rest. `pickup.ts` owns
 * the string; this is the gate's own copy, so a change to either is a red build.
 */
export const CLOSED_HINT = 'Click the book to open it';

/** The closed book at rest, read before anything opened it. */
export interface ClosedRead {
  /** The front board's angle to the page block, read from the scene. */
  readonly boardAngle: number;
  /** The shelf's own reading: it must not be open. */
  readonly opened: boolean;
  /** Both pages hidden by `visibility`: from sight and from the accessibility tree. */
  readonly pagesHidden: boolean;
  /** The X is in the viewport and not hidden. */
  readonly xOnScreen: boolean;
  /** The header's hint line. */
  readonly hint: string;
  /** The Open button's words, or empty when it is hidden. */
  readonly openName: string;
  /** The held book's title, which the Open button is named for. */
  readonly title: string;
}

/** What a click on a book left on the page, read at rest and across a second pickup. */
export interface PickupRead {
  /** The book at its closed rest, before the click that opened it. */
  readonly closed: ClosedRead;
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
  /** Focus stayed where it was after a shelf pickup (spec §3.4, ADR-0049; a chat link moves it, ADR-0137). */
  readonly focusUnmoved: boolean;
  /**
   * With focus on the X and the book closed, Escape put the book down and focus
   * landed on the canvas rather than dropping to `<body>`, where the next Tab
   * starts the page over. (A link on a closed book's page cannot take focus.)
   */
  readonly focusCaught: boolean;
  /** The same from an open book, with focus on a link of its page. */
  readonly focusCaughtOpen: boolean;
  /** The put-down by that Escape from an open book: history and address as before the pickup. */
  readonly afterEscapeOpen: PutDown;
  /**
   * Both pages inside the desktop viewport at rest, within a pixel — the
   * desktop half of the card's old overflow check, which the phone check keeps
   * for the right-hand page at 375×812.
   */
  readonly pagesInView: boolean;
  /**
   * A book `library.json` flags with Thoughts, picked up: whether its page showed
   * them, or `undefined` when no such book was found to pick up. The Thoughts are
   * the point of opening the book (spec §3.4); a closed book's pages are hidden,
   * so the book was opened first and the page had to be visible.
   */
  readonly thoughtsShown: boolean | undefined;
  /** After a second book was picked up in its place. */
  readonly second: {
    readonly held: string;
    readonly announced: string;
    /** The X is still there for the second book (it is one control, outside the pages). */
    readonly putBack: boolean;
    /** Pages in the layer: exactly the held book's two, none left from the first. */
    readonly pages: number;
  };
  /** After the put-back control was pressed. */
  readonly afterPutBack: PutDown;
  /** After Escape, and after the back button, each on a fresh pickup (spec §3.9). */
  readonly afterEscape: PutDown;
  readonly afterBack: PutDown;
  /** The back button pressed on an open book, which put it back the same way. */
  readonly afterBackOpen: PutDown;
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
  const failures: string[] = [...closedFailures(read.closed)];
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
  if (!read.visibleAtRest) failures.push('the pages are not visible with the book open at rest');
  if (!read.focusUnmoved) {
    failures.push(
      'focus moved on a shelf pickup — it must stay put (ADR-0049; only a chat link moves it)',
    );
  }
  if (!read.focusCaught) {
    failures.push(
      'Escape from the focused X on a closed book dropped focus instead of catching it on the canvas',
    );
  }
  if (!read.focusCaughtOpen) {
    failures.push(
      'Escape from a focused page link on an open book dropped focus instead of catching it on the canvas',
    );
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
    failures.push('a book flagged with Thoughts opened without them on a visible page');
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

  // §3.5's check 7: the close control, become the put-back control: an X outside
  // the pages, because a closed book's pages are hidden (#531).
  if (read.putBack === undefined) {
    failures.push('there is no put-back control outside the pages');
  } else {
    if (read.putBack.tag !== 'BUTTON') {
      failures.push(`the put-back control is a <${read.putBack.tag.toLowerCase()}>, not a button`);
    }
    if (read.putBack.name.length === 0)
      failures.push('the put-back control has no accessible name');
  }
  if (!read.second.putBack) failures.push('the X was not there for the second book');
  if (read.second.pages !== 2) {
    failures.push(
      `${String(read.second.pages)} pages in the layer with one book held — the first book's ` +
        'pages outlived it',
    );
  }

  failures.push(
    ...putDownFailures(read.afterPutBack, 'the put-back control'),
    ...putDownFailures(read.afterEscape, 'Escape'),
    ...putDownFailures(read.afterEscapeOpen, 'Escape from an open book'),
    ...putDownFailures(read.afterBack, 'the back button'),
    ...putDownFailures(read.afterBackOpen, 'the back button from an open book'),
  );
  return failures;
}

/** The book before it is opened (#531, claims C1, C2 and C8). */
function closedFailures(read: ClosedRead): string[] {
  const failures: string[] = [];
  if (Math.abs(read.boardAngle) > CLOSED_TOLERANCE_DEG) {
    failures.push(
      `the book arrived ${Math.abs(read.boardAngle).toFixed(1)}° off closed — a picked-up book ` +
        'arrives closed and cover-on',
    );
  }
  if (read.opened) failures.push('the book arrived open: nothing but the visitor opens it');
  if (!read.pagesHidden) {
    failures.push(
      'the pages are not hidden by visibility while the book is closed: a screen reader ' +
        'reads what is not on screen',
    );
  }
  if (!read.xOnScreen) failures.push('the X is not on screen while the book is closed');
  if (read.hint !== CLOSED_HINT) {
    failures.push(`the hint reads "${read.hint}" while the book is closed, not "${CLOSED_HINT}"`);
  }
  if (read.openName !== `Open ${read.title}`) {
    failures.push(
      `no Open button named "Open ${read.title}" while the book is closed (it reads "${read.openName}")`,
    );
  }
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

/**
 * Examining the held book: the page's control closes it in the hand, it turns,
 * and leaving it leaves *only* it (#418, spec S9). Read from the page and the
 * scene by `checkViewer`, judged here so each clause is a unit test that was
 * planted red first.
 */
export interface ViewerRead {
  /** The page's control opened the dialog. */
  readonly opened: boolean;
  /** The open dialog's accessible name carries the held book's title. */
  readonly namedForBook: boolean;
  /**
   * The front board's angle to the page block once examining is at rest, in
   * degrees, or nothing when it never read. Closed is 0°, within
   * `CLOSED_TOLERANCE_DEG` — read from the scene, so a dialog that opened over
   * a book still open cannot vouch for itself.
   */
  readonly closedAngle: number | undefined;
  readonly escapeClosedViewer: boolean;
  /** One Escape leaves the view and keeps the book held (§3.5, check 9). */
  readonly heldAfterEscape: boolean;
  /** …and the page shows again once the book has opened at rest. */
  readonly pageVisibleAfterEscape: boolean;
  /**
   * The held copy `library.json` names for this book's cover, or nothing for a
   * book with none. Read from `library.json` rather than from the page, so a
   * control that offered the wrong file cannot vouch for itself (#412's round
   * 1, integrity F6).
   */
  readonly held: string | undefined;
  /** For a book with a held copy, the held book wore it — polled, the swap is asynchronous. */
  readonly showedHeld: boolean;
  /**
   * A book with a cover and no held copy, walked to as well, and whether it
   * wore the shelf copy: the other path, which a walk that stopped at the first
   * held copy would never reach (#412's round 1, integrity F8).
   */
  readonly withoutHeld: { readonly showedOwn: boolean } | undefined;
  /**
   * With every request for the held copy refused, whether examining still opened
   * and the book wore the shelf copy rather than nothing — a browser holding a
   * `library.json` from before a copy was taken down (#416).
   */
  readonly fellBack: boolean;
  /**
   * Whether any element of the held pages carried a cover path in an attribute.
   * Nothing offers a path to the DOM any more; this keeps it that way (#416,
   * CodeQL's `js/xss-through-dom`).
   */
  readonly pathInPage: boolean;
  /** A drag across and down changed yaw and pitch, and pitch stayed within ±75°. */
  readonly turned: boolean;
  /** Home squared the book, then one ArrowRight changed its yaw by 15°. */
  readonly keyTurned: boolean;
  /** A tap anywhere on the view left it, the book still held and the page showing. */
  readonly leftByTap: boolean;
  /** "Back to the page", pressed by the keyboard, did the same. */
  readonly leftByButton: boolean;
  /** Under reduced motion the book was closed, and open again, within a few frames. */
  readonly reducedCuts: boolean;
  /** No cover was requested between the view opening and leaving it. */
  readonly fetchedNothing: boolean;
  /**
   * A book with no cover, examined: its control was there, the book closed and
   * the view left. Nothing when no such book was reached (S7).
   */
  readonly coverlessOpens: boolean | undefined;
  /** …and that book arrived closed, its board at 0° ±0.5° read from the scene (C1). */
  readonly coverlessArrivesClosed: boolean | undefined;
  /** Focus was inside the dialog while it was open (`showModal` moves it in). */
  readonly focusInside: boolean;
  /** After Escape, once at rest, focus was on the page's control. */
  readonly focusReturned: boolean;
  /** `history.back()` while examining closed the dialog and emptied the hand. */
  readonly emptiedCloses: boolean;
}

/** How far from 0° the front board may lie and the book still read as closed. */
export const CLOSED_TOLERANCE_DEG = 0.5;

export function viewerFailures(read: ViewerRead | undefined): string[] {
  if (read === undefined) {
    return ['no held book was examined, so the examining view was never checked'];
  }
  const failures: string[] = [];
  if (!read.opened) failures.push("the page's control did not open the examining view");
  if (!read.namedForBook) {
    failures.push(
      'the examining dialog was not named for the book: every book would announce alike',
    );
  }
  if (read.closedAngle === undefined) {
    failures.push("the front board's angle never read, so the book was not seen to close");
  } else if (Math.abs(read.closedAngle) > CLOSED_TOLERANCE_DEG) {
    failures.push(
      `the book is ${Math.abs(read.closedAngle).toFixed(1)}° off closed at rest ` +
        `— examining turns a closed book, not an open one`,
    );
  }
  if (!read.escapeClosedViewer) failures.push('Escape did not close the examining view');
  if (!read.heldAfterEscape) {
    failures.push(
      'the Escape that closed the examining view also put the book back — one keystroke ' +
        'left two surfaces',
    );
  }
  if (!read.pageVisibleAfterEscape) {
    failures.push('after Escape the page was not visible again once the book had opened');
  }
  if (read.held === undefined) {
    failures.push('no held book offered a held copy, so examining one was never checked');
  } else if (!read.showedHeld) {
    failures.push(`the book did not wear the held copy ${read.held}`);
  }
  if (read.withoutHeld === undefined) {
    failures.push('no book without a held copy was examined, so the other path went unseen');
  } else if (!read.withoutHeld.showedOwn) {
    failures.push('for a book with no held copy, the book did not wear the shelf copy');
  }
  if (!read.fellBack) {
    failures.push('a held copy that failed to load left examining without the shelf copy');
  }
  if (read.pathInPage) {
    failures.push('a cover path was written into the held page — nothing offers a path to the DOM');
  }
  if (!read.turned) {
    failures.push('a drag across the view did not turn the book in yaw and pitch, within ±75°');
  }
  if (!read.keyTurned) {
    failures.push('Home did not square the book, or an arrow key did not turn the book by 15°');
  }
  if (!read.leftByTap) {
    failures.push('a tap on the view did not leave it with the book held and the page showing');
  }
  if (!read.leftByButton) {
    failures.push('Back to the page did not leave the view with the book held');
  }
  if (!read.reducedCuts) {
    failures.push('under reduced motion the book tweened shut or open instead of cutting');
  }
  if (!read.fetchedNothing) failures.push('examining fetched a cover it should already have');
  if (read.coverlessOpens === undefined) {
    failures.push('no book without a cover was reached, so examining one was never checked');
  } else if (!read.coverlessOpens) {
    failures.push('a book with no cover did not close and leave the view when examined');
  }
  if (read.coverlessArrivesClosed === undefined) {
    failures.push('no book without a cover was reached, so its arrival closed was never read');
  } else if (!read.coverlessArrivesClosed) {
    failures.push('a book with no cover arrived off closed: the board must lie at 0° on arrival');
  }
  if (!read.focusInside) failures.push('focus was not inside the dialog while it was open');
  if (!read.focusReturned) {
    failures.push("focus did not return to the page's control after Escape, once the page showed");
  }
  if (!read.emptiedCloses) {
    failures.push('emptying the hand while examining left the view open over an empty hand');
  }
  return failures;
}
/** Which of the three inputs did a thing: a mouse click, a touch tap, and the keyboard. */
export interface ByInput {
  readonly mouse: boolean;
  readonly touch: boolean;
  readonly keyboard: boolean;
}

/** One size of window's reading of the closed book's controls. */
export interface ViewportControls {
  /** Each input opened a closed book. */
  readonly opens: ByInput;
  /** …and each put it back, from closed and from open. */
  readonly putsBackClosed: ByInput;
  readonly putsBackOpen: ByInput;
  /** The X's box, in CSS pixels. */
  readonly xWidth: number;
  readonly xHeight: number;
  /** What the X overlaps: the brand, the hint, the closed book. Empty when it overlaps none. */
  readonly xOverlaps: readonly string[];
  /** The X is the top element at its own centre, with the book closed and with it open. */
  readonly xOnTopClosed: boolean;
  readonly xOnTopOpen: boolean;
}

/** The closed book's controls (#531, claims C4, C5, C7 to C9 and C12), read in a browser. */
export interface ControlsRead {
  readonly desktop: ViewportControls;
  readonly phone: ViewportControls;
  /** The X's accessible name. */
  readonly xName: string;
  /** Left alone for a while after landing, the book is still closed: nothing opens it by itself (C2). */
  readonly staysClosed: boolean;
  /** The tree holds a button named "Open «Title»" while the book is closed at rest. */
  readonly buttonInTree: boolean;
  /** …and holds none the moment the opening starts. */
  readonly buttonGoneWhileOpening: boolean;
  /** Focused, with the longest fixture title at 375×812, it is fully on screen. */
  readonly longTitleOnScreen: boolean;
  /** …and the X did not move when it took focus. */
  readonly xStayedPut: boolean;
  /** After Open is pressed, focus lands on the right-hand page. */
  readonly focusToPage: boolean;
  readonly focusToPageReduced: boolean;
  /** Under reduced motion each of the three is a cut: no tween in flight at the moment. */
  readonly reducedPickupCuts: boolean;
  readonly reducedOpenCuts: boolean;
  readonly reducedPutBackCuts: boolean;
  /** What is wrong with the X's and the arrow's markup, one sentence each. */
  readonly markup: readonly string[];
  /** `securitypolicyviolation` events across the whole drive. */
  readonly cspViolations: number;
  /** The hint says a click opens it while closed, and is the template's once open. */
  readonly hintClosed: boolean;
  readonly hintOpen: boolean;
  /** The cursor is a pointer over the closed book, and the canvas's own after. */
  readonly cursorPointer: boolean;
  readonly cursorReset: boolean;
}

/** The smallest the X may be: 2.75rem at the 16px root, as the viewer's close button is. */
const TARGET_PX = 44;

const VIEWPORT_LABEL = { desktop: '1280×800', phone: '375×812' } as const;

export function controlsFailures(read: ControlsRead | undefined): string[] {
  if (read === undefined)
    return ['the closed book was never driven, so its controls went unchecked'];
  const failures: string[] = [];
  for (const where of ['desktop', 'phone'] as const) {
    const at = VIEWPORT_LABEL[where];
    const v = read[where];
    for (const input of ['mouse', 'touch', 'keyboard'] as const) {
      if (!v.opens[input]) failures.push(`at ${at} the ${input} could not open the closed book`);
      if (!v.putsBackClosed[input]) {
        failures.push(`at ${at} the ${input} could not put the closed book back`);
      }
      if (!v.putsBackOpen[input]) {
        failures.push(`at ${at} the ${input} could not put the open book back`);
      }
    }
    if (v.xWidth < TARGET_PX || v.xHeight < TARGET_PX) {
      failures.push(
        `at ${at} the X is ${v.xWidth.toFixed(0)}×${v.xHeight.toFixed(0)}px, under the 2.75rem target`,
      );
    }
    for (const name of v.xOverlaps) failures.push(`at ${at} the X overlaps ${name}`);
    if (!v.xOnTopClosed) {
      failures.push(`at ${at} the X is not the top element at its centre with the book closed`);
    }
    if (!v.xOnTopOpen) {
      failures.push(`at ${at} the X is not the top element at its centre with the book open`);
    }
  }
  if (read.xName.length === 0) failures.push('the X has no accessible name');
  if (!read.buttonInTree) {
    failures.push('no Open button named for the book in the accessibility tree while it is closed');
  }
  if (!read.buttonGoneWhileOpening) {
    failures.push('the Open button was still in the tree while it opens');
  }
  if (!read.longTitleOnScreen) {
    failures.push(
      'the focused Open button is not fully on screen at 375×812 with the longest title',
    );
  }
  if (!read.xStayedPut) failures.push('the X moved when the Open button took focus');
  if (!read.staysClosed)
    failures.push('the closed book opened by itself: only the visitor opens it');
  if (!read.focusToPage) {
    failures.push('after Open was pressed, focus did not land on the right-hand page');
  }
  if (!read.focusToPageReduced) {
    failures.push('under reduced motion, focus did not land on the right-hand page after Open');
  }
  if (!read.reducedPickupCuts)
    failures.push('under reduced motion the pickup did not cut to closed');
  if (!read.reducedOpenCuts) failures.push('under reduced motion the opening did not cut to open');
  if (!read.reducedPutBackCuts) failures.push('under reduced motion the put-back did not cut');
  failures.push(...read.markup);
  if (read.cspViolations > 0) {
    failures.push(
      `${String(read.cspViolations)} CSP violations while driving the closed book's controls`,
    );
  }
  if (!read.hintClosed) failures.push('the hint does not say a click opens the closed book');
  if (!read.hintOpen) failures.push("the hint is not the template's once the book is open");
  if (!read.cursorPointer) failures.push('the cursor is not a pointer over the closed book');
  if (!read.cursorReset) failures.push("the cursor is not the canvas's own once the book is open");
  return failures;
}

/** One cell of the Ask drawer's tables: what the spec says, and what the page did. */
export interface DrawerCell {
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
}

/**
 * `expected` is how many cells the browser table has: a cell that drops out, on
 * a failed set-up or a point that was not found, is a red line, and not a smaller
 * table that passes.
 */
export function drawerFailures(cells: readonly DrawerCell[], expected: number): string[] {
  if (cells.length === 0) return ['no cell of the drawer tables was read'];
  const failures = cells
    .filter((cell) => cell.expected !== cell.actual)
    .map((cell) => `${cell.name}: the spec says "${cell.expected}", the page did "${cell.actual}"`);
  if (cells.length !== expected) {
    failures.push(
      `${String(cells.length)} of the ${String(expected)} cells of the drawer tables were read`,
    );
  }
  return failures;
}

/** A context lost with a book in hand, read at the moment the hand was empty. */
export interface LostCase {
  /** The book was put away, with no motion. */
  readonly away: boolean;
  /** Both controls hidden. */
  readonly controlsHidden: boolean;
  /** The hint is the template's again. */
  readonly hintRestored: boolean;
  /** The cursor is the canvas's own. */
  readonly cursorReset: boolean;
  /** Focus is on the canvas, not dropped to `<body>`. */
  readonly focusOnCanvas: boolean;
}

export function lostFailures(
  read: { readonly closed: LostCase; readonly open: LostCase } | undefined,
): string[] {
  if (read === undefined) return ['no context was lost with a book held'];
  const failures: string[] = [];
  for (const state of ['closed', 'open'] as const) {
    const lost = read[state];
    if (!lost.away) failures.push(`a lost context left the ${state} book still held`);
    if (!lost.controlsHidden) {
      failures.push(`the controls were left showing after losing the ${state} book`);
    }
    if (!lost.hintRestored)
      failures.push(`the hint was not restored after losing the ${state} book`);
    if (!lost.cursorReset) failures.push(`the cursor was not reset after losing the ${state} book`);
    if (!lost.focusOnCanvas) {
      failures.push(`focus was not caught on the canvas after losing the ${state} book`);
    }
  }
  return failures;
}

/** The held page at phone size, which frames the right-hand page alone. */
export interface PhoneRead {
  /** The right-hand page lies inside the viewport, within a pixel. */
  readonly pageInView: boolean;
  /** Title and author lead the right-hand page on a phone (§3.4). */
  readonly titleLeads: boolean;
  /** The put-back X is inside the viewport with the book open. */
  readonly putBackInView: boolean;
  /** …and with the book closed, which leaves empty space round it to tap. */
  readonly closedXOnScreen: boolean;
}

export function phoneFailures(read: PhoneRead | undefined): string[] {
  if (read === undefined) return ['no book could be picked up at phone size'];
  const failures: string[] = [];
  if (!read.pageInView) failures.push('at phone size the right-hand page does not fit the screen');
  if (!read.titleLeads) failures.push('at phone size the title does not lead the right-hand page');
  if (!read.putBackInView) {
    failures.push('at phone size the put-back X is off screen with the book open');
  }
  if (!read.closedXOnScreen) {
    failures.push('at phone size the put-back X is off screen with the book closed');
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

/**
 * The held page at rest (#426), read by `checkHeldAtRest` with long Thoughts
 * planted through interception. Two reads of the links row, so a plant too
 * short to scroll cannot pass as a row the wheel brought into reach.
 */
export interface AtRestRead {
  /** Frames sampled from the moment of the pickup, of `AT_REST_FRAMES`. */
  readonly frames: number;
  /** The most `requestAnimationFrame` callbacks any one of them ran. */
  readonly mostLoops: number;
  /** The right-hand page's computed `overflow-y` once the book has landed. */
  readonly overflow: string;
  /** Its content is taller than the page. */
  readonly tall: boolean;
  /** The links row sat inside the page and the viewport before any scroll. */
  readonly inReachUnscrolled: boolean;
  /** And after the wheel over the page. */
  readonly inReachScrolled: boolean;
}

/** The window GSAP's ticker is read over: frames, never time. */
export const AT_REST_FRAMES = 30;

export function atRestFailures(read: AtRestRead): string[] {
  const failures: string[] = [];
  if (read.frames < AT_REST_FRAMES) {
    failures.push(
      `only ${String(read.frames)} of ${String(AT_REST_FRAMES)} frames arrived during the pickup`,
    );
  } else if (read.mostLoops !== 1) {
    failures.push(
      `GSAP's own ticker ran beside the shelf's loop (${String(read.mostLoops)} callbacks in one frame)`,
    );
  }
  if (read.overflow !== 'auto' || !read.tall) {
    failures.push('long Thoughts do not scroll once the book has landed');
  }
  if (read.inReachUnscrolled) {
    failures.push('the links row was in reach unscrolled, so the planted Thoughts are too short');
  } else if (!read.inReachScrolled) {
    failures.push('the links row never came into reach by scrolling');
  }
  return failures;
}
