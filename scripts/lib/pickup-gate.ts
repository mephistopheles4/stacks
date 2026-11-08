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
 * which stay unit tests in `card.test.ts`; and turning the held book (#418, and
 * since #553 at the closed rest it landed on, with no dialog), closed again by
 * the open book's two controls. **What is new**: `location.href` unchanged
 * after a pickup, the page hidden from sight and from the accessibility tree
 * until it fades in, the spread's three numbers, and the closed board, the
 * turn, every way out, focus and the emptied hand. `checkSheet` retired with the
 * sheet.
 */

/**
 * The hint the header shows while a book is closed at rest. `pickup.ts` owns
 * the string; this is the gate's own copy, so a change to either is a red build.
 */
export const CLOSED_HINT = 'Drag to turn it · click to open';

/** What the hint reads with an empty hand, which the page's template ships. */
export const TEMPLATE_HINT = 'Drag to look around · click a book';

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
 * What closing the open book by one of its two controls left (#553, S3 and S5):
 * the book is back at the closed rest it landed on, with its pages hidden, focus
 * on the X, and a key still turns it.
 */
export interface CloseRead {
  /** The front board's angle to the page block once the close is at rest, or nothing if it never read. */
  readonly boardAngle: number | undefined;
  /** `held()` reports phase `held` and not opened: the state a pickup lands on. */
  readonly atClosedRest: boolean;
  /** Both pages hidden by `visibility`, from sight and from the accessibility tree. */
  readonly pagesHidden: boolean;
  /** Focus is on the X (`#held-put-back`), not dropped to `<body>`. */
  readonly focusOnX: boolean;
  /** An arrow key, pressed then, changed the turn: the book is turnable again. */
  readonly turnable: boolean;
}

/**
 * Turning the closed book, and closing the open one (#553): read from the page
 * and the scene by `checkTurn`, judged here so each clause is a unit test that
 * was planted red first.
 */
export interface TurnRead {
  /** No `<dialog>` on the page and no button named "Back to the page": the modal view went in #553. */
  readonly noDialog: boolean;
  /** The X's description, the text its `aria-describedby` names. */
  readonly xDescription: string;
  /** The close control by the title (`.held-close`), pressed by the keyboard from the open book. */
  readonly closeButton: CloseRead;
  /** The close control at the foot of the right page (`.held-turn-over`), pressed by the keyboard. */
  readonly turnOverButton: CloseRead;
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
   * With every request for the held copy refused, whether the book still opened
   * and closed and wore the shelf copy rather than nothing — a browser holding a
   * `library.json` from before a copy was taken down (#416).
   */
  readonly fellBack: boolean;
  /**
   * Whether any element of the held pages carried a cover path in an attribute.
   * Nothing offers a path to the DOM any more; this keeps it that way (#416,
   * CodeQL's `js/xss-through-dom`).
   */
  readonly pathInPage: boolean;
  /** A drag on the canvas turned the book in yaw and pitch, and pitch stayed within ±75°. */
  readonly turned: boolean;
  /** Home squared the book, then one ArrowRight changed its yaw by 15°. */
  readonly keyTurned: boolean;
  /** A tap on the turned book opened it, and it came to rest square. */
  readonly tapOpensSquare: boolean;
  /** Escape put the book back from the closed rest. */
  readonly escapeFromClosed: boolean;
  /** …from the open book. */
  readonly escapeFromOpen: boolean;
  /** …and with a close in flight. */
  readonly escapeMidClose: boolean;
  /** Under reduced motion the close was a cut: at the closed rest in the same call. */
  readonly reducedCuts: boolean;
  /** No cover was requested while the book turned, opened and closed. */
  readonly fetchedNothing: boolean;
  /** A book with no cover arrived closed, its board at 0° ±0.5° read from the scene. Nothing when none was reached. */
  readonly coverlessArrivesClosed: boolean | undefined;
  /** …and that book opened and closed by its control. Nothing when none was reached. */
  readonly coverlessCloses: boolean | undefined;
  /** `history.back()` with a close in flight emptied the hand and the book settled. */
  readonly backMidClose: boolean;
  /**
   * A put-back right after a close, sampled once a frame from the pickup's own
   * timeline (C5): its progress at the closed rest, and every value it then read
   * until the book was home. Nothing when no close was reached.
   */
  readonly returned: { readonly rest: number; readonly frames: readonly number[] } | undefined;
}

/** How far from 0° the front board may lie and the book still read as closed. */
export const CLOSED_TOLERANCE_DEG = 0.5;

/** What the X's description must name, so a visitor who cannot see the hint is told. */
const DESCRIBES: readonly (readonly [string, RegExp])[] = [
  ['the drag', /\bdrag/i],
  ['the arrow keys', /arrow key/i],
  ['the click', /\bclick/i],
];

/** A progress this close to the closed rest, or to 0, is that rest and not a step on the way. */
const PROGRESS_EPSILON = 1e-6;

function closeFailures(read: CloseRead, control: string): string[] {
  const failures: string[] = [];
  if (read.boardAngle === undefined) {
    failures.push(
      `after ${control} the front board's angle never read, so the book was not seen to close`,
    );
  } else if (Math.abs(read.boardAngle) > CLOSED_TOLERANCE_DEG) {
    failures.push(
      `after ${control} the book is ${Math.abs(read.boardAngle).toFixed(1)}° off closed at rest ` +
        '— it must come back to the closed rest a pickup lands on',
    );
  }
  if (!read.atClosedRest) {
    failures.push(`${control} did not leave the book held, closed, at rest`);
  }
  if (!read.pagesHidden) {
    failures.push(`after ${control} the pages were not hidden: a closed book shows none`);
  }
  if (!read.focusOnX) {
    failures.push(`after ${control} focus was not on the X: it dropped off the pages that hid`);
  }
  if (!read.turnable) failures.push(`after ${control} an arrow key did not turn the book`);
  return failures;
}

/** Whether a put-back's progress, frame by frame, came down through the steps between the rest and 0. */
function returnPlays(rest: number, frames: readonly number[]): boolean {
  const between = frames.filter((v) => v > PROGRESS_EPSILON && v < rest - PROGRESS_EPSILON);
  if (between.length === 0) return false;
  // Decreasing across frames: no frame reads above the one before it.
  return frames.every((v, i) => i === 0 || v <= (frames[i - 1] ?? v) + PROGRESS_EPSILON);
}

export function turnFailures(read: TurnRead | undefined): string[] {
  if (read === undefined) {
    return ['no held book was turned, so the closed book was never checked'];
  }
  const failures: string[] = [];
  if (!read.noDialog) {
    failures.push(
      'the page has a <dialog> or a "Back to the page" button: the modal view of the closed book went in #553',
    );
  }
  for (const [what, pattern] of DESCRIBES) {
    if (!pattern.test(read.xDescription)) {
      failures.push(`the X's description does not name ${what}: "${read.xDescription}"`);
    }
  }
  failures.push(
    ...closeFailures(read.closeButton, 'the top close control'),
    ...closeFailures(read.turnOverButton, 'the bottom close control'),
  );
  if (read.held === undefined) {
    failures.push('no held book offered a held copy, so turning one was never checked');
  } else if (!read.showedHeld) {
    failures.push(`the book did not wear the held copy ${read.held}`);
  }
  if (read.withoutHeld === undefined) {
    failures.push('no book without a held copy was turned, so the other path went unseen');
  } else if (!read.withoutHeld.showedOwn) {
    failures.push('for a book with no held copy, the book did not wear the shelf copy');
  }
  if (!read.fellBack) {
    failures.push('a held copy that failed to load left the book without the shelf copy');
  }
  if (read.pathInPage) {
    failures.push('a cover path was written into the held page — nothing offers a path to the DOM');
  }
  if (!read.turned) {
    failures.push(
      'a drag on the canvas did not turn the closed book in yaw and pitch, within ±75°',
    );
  }
  if (!read.keyTurned) {
    failures.push('Home did not square the book, or an arrow key did not turn the book by 15°');
  }
  if (!read.tapOpensSquare) {
    failures.push('a tap on the turned book did not open it, or it did not come to rest square');
  }
  if (!read.escapeFromClosed) failures.push('Escape did not put the closed book back');
  if (!read.escapeFromOpen) failures.push('Escape did not put the open book back');
  if (!read.escapeMidClose) {
    failures.push('Escape did not put the book back with a close in flight');
  }
  if (!read.reducedCuts) {
    failures.push('under reduced motion the close tweened instead of cutting to the closed rest');
  }
  if (!read.fetchedNothing) {
    failures.push('turning, opening and closing fetched a cover it should already have');
  }
  if (read.coverlessArrivesClosed === undefined) {
    failures.push('no book without a cover was reached, so its arrival closed was never read');
  } else if (!read.coverlessArrivesClosed) {
    failures.push('a book with no cover arrived off closed: the board must lie at 0° on arrival');
  }
  if (read.coverlessCloses === undefined) {
    failures.push('no book without a cover was reached, so closing one was never checked');
  } else if (!read.coverlessCloses) {
    failures.push('a book with no cover did not open and close back to the closed rest');
  }
  if (!read.backMidClose) {
    failures.push(
      'the back button with a close in flight did not empty the hand and settle the book',
    );
  }
  if (read.returned === undefined) {
    failures.push('no put-back after a close was sampled, so the return was never seen to play');
  } else if (!returnPlays(read.returned.rest, read.returned.frames)) {
    failures.push(
      "a put-back right after a close did not play the return: the pickup's progress took no " +
        'step between the closed rest and 0, or rose between frames',
    );
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
  /** The X's offsets from the viewport's top and right, closed and open (#553, C3). */
  readonly xInsetClosed: Inset;
  readonly xInsetOpen: Inset;
}

/** The X's offsets, and what `clamp(0.75rem, 3vw, 1.5rem)` comes to at that size. */
export interface Inset {
  readonly top: number;
  readonly right: number;
  readonly expected: number;
}

/** How near the clamp the X's offsets must lie, in CSS pixels. */
const INSET_TOLERANCE_PX = 1;

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
  /** What is wrong with the X's markup, one sentence each. */
  readonly markup: readonly string[];
  /** `securitypolicyviolation` events across the whole drive. */
  readonly cspViolations: number;
  /** The hint says a drag turns the closed book and a click opens it. */
  readonly hintClosed: boolean;
  /** …is hidden once the book is open. */
  readonly hintOpen: boolean;
  /** …and is the template's again once the hand is empty. */
  readonly hintReturns: boolean;
  /** The cursor is a pointer over the closed book, and the canvas's own after. */
  readonly cursorPointer: boolean;
  readonly cursorReset: boolean;
}

/** The smallest the X may be: 2.75rem at the 16px root. */
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
    for (const [state, inset] of [
      ['closed', v.xInsetClosed],
      ['open', v.xInsetOpen],
    ] as const) {
      for (const side of ['top', 'right'] as const) {
        if (Math.abs(inset[side] - inset.expected) > INSET_TOLERANCE_PX) {
          failures.push(
            `at ${at} the X's ${side} offset is ${inset[side].toFixed(1)}px with the book ${state}, ` +
              `not clamp(0.75rem, 3vw, 1.5rem) = ${inset.expected.toFixed(1)}px`,
          );
        }
      }
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
  if (!read.hintClosed) {
    failures.push('the hint does not say a drag turns the closed book and a click opens it');
  }
  if (!read.hintOpen) failures.push('the hint is not hidden once the book is open');
  if (!read.hintReturns)
    failures.push("the hint is not the template's again once the hand is empty");
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

/** A rectangle on screen, in CSS pixels from the viewport's top left. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A box as «left,top to right,bottom», for a failure line. */
function show(box: Box): string {
  return `${box.left.toFixed(0)},${box.top.toFixed(0)} to ${box.right.toFixed(0)},${box.bottom.toFixed(0)}`;
}

/** Whether two boxes share any area: touching edges do not meet. */
export function meets(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The open framing of one book at one size (#553, C6). */
export interface OpenFraming {
  /** The hint is hidden: it would lie over the pages. */
  readonly hintHidden: boolean;
  readonly x: Box;
  readonly brand: Box;
  readonly launcher: Box;
  /** The pages' rects. The left is nothing where the framing builds none, as on a phone. */
  readonly left: Box | undefined;
  readonly right: Box;
}

/** The closed framing of one book at one size, square or at the pitch limit (#553, C6). */
export interface ClosedFraming {
  readonly hint: Box;
  readonly x: Box;
  readonly launcher: Box;
  /** `held().screen`: where the book stands. */
  readonly book: Box;
}

/** One book at one size: the open framing, and the closed one square and at the pitch limit. */
export interface OverlapRead {
  /** For the failure line: «1280×800, the tallest book». */
  readonly label: string;
  readonly open: OpenFraming;
  readonly square: ClosedFraming;
  readonly tilted: ClosedFraming;
}

/**
 * How many readings `checkOverlap` takes: four sizes, the tallest book and then
 * the thickest. One short is a red line, so a size that dropped out cannot pass
 * as a smaller table.
 */
export const OVERLAP_READS = 8;

export function overlapFailures(reads: readonly OverlapRead[]): string[] {
  const failures: string[] = [];
  if (reads.length !== OVERLAP_READS) {
    failures.push(
      `${String(reads.length)} of the ${String(OVERLAP_READS)} overlap readings were taken`,
    );
  }
  for (const read of reads) {
    const at = read.label;
    const { open } = read;
    if (!open.hintHidden) failures.push(`${at}: the hint is showing over the open book`);
    for (const [name, page] of [
      ['left', open.left],
      ['right', open.right],
    ] as const) {
      if (page === undefined) continue;
      if (meets(open.x, page))
        failures.push(
          `${at}: the X (${show(open.x)}) meets the open book's ${name} page (${show(page)})`,
        );
      if (meets(open.brand, page)) {
        failures.push(
          `${at}: the brand (${show(open.brand)}) meets the open book's ${name} page (${show(page)})`,
        );
      }
    }
    if (meets(open.x, open.launcher)) {
      failures.push(`${at}: the X meets the Ask launcher with the book open`);
    }
    for (const [how, closed] of [
      ['square', read.square],
      ['at the pitch limit', read.tilted],
    ] as const) {
      if (meets(closed.hint, closed.book)) {
        failures.push(
          `${at}: the hint (${show(closed.hint)}) meets the closed book (${show(closed.book)}), ${how}`,
        );
      }
      if (meets(closed.x, closed.book)) {
        failures.push(
          `${at}: the X (${show(closed.x)}) meets the closed book (${show(closed.book)}), ${how}`,
        );
      }
      if (meets(closed.x, closed.launcher)) {
        failures.push(`${at}: the X meets the Ask launcher with the book closed, ${how}`);
      }
    }
  }
  return failures;
}
