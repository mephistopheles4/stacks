import { describe, expect, it } from 'vitest';
import {
  atRestFailures,
  CLOSED_HINT,
  controlsFailures,
  drawerFailures,
  arrowFailures,
  lostFailures,
  meets,
  OVERLAP_READS,
  overlapFailures,
  phoneFailures,
  pickupFailures,
  spreadFailures,
  turnFailures,
  type AtRestRead,
  type Box,
  type CloseRead,
  type ClosedFraming,
  type ClosedRead,
  type ArrowPlace,
  type ControlsRead,
  type Inset,
  type LostCase,
  type OpenFraming,
  type OverlapRead,
  type PhoneRead,
  type PickupRead,
  type SpreadRead,
  type TurnRead,
  type ViewportControls,
} from './pickup-gate.ts';

const closed: ClosedRead = {
  boardAngle: 0.1,
  opened: false,
  pagesHidden: true,
  xOnScreen: true,
  hint: CLOSED_HINT,
  openName: 'Open Harbour Garden',
  title: 'Harbour Garden',
};

const good: PickupRead = {
  closed,
  held: 'Harbour Garden',
  pageTitle: 'Harbour Garden',
  reading: 'read · finished 2024-03-02',
  hasObjectLine: true,
  linkCount: 3,
  links: [
    '_blank|noopener noreferrer|Open Library',
    '_blank|noopener noreferrer|Google Books',
    '_blank|noopener noreferrer|Apple Books',
  ],
  markCount: 3,
  announced: 'Harbour Garden by Ingrid Whitlock',
  putBack: { tag: 'BUTTON', name: 'Put the book back' },
  hiddenBeforeFade: true,
  visibleAtRest: true,
  hrefUnchanged: true,
  historyHeld: true,
  focusUnmoved: true,
  focusCaught: true,
  focusCaughtOpen: true,
  afterEscapeOpen: {
    held: false,
    announced: '',
    historyHeld: false,
    hrefUnchanged: true,
    pages: 0,
  },
  pagesInView: true,
  thoughtsShown: true,
  second: {
    held: 'Paper Ledger',
    announced: 'Paper Ledger by Greta Whitlock',
    putBack: true,
    pages: 2,
  },
  afterPutBack: { held: false, announced: '', historyHeld: false, hrefUnchanged: true, pages: 0 },
  afterEscape: { held: false, announced: '', historyHeld: false, hrefUnchanged: true, pages: 0 },
  afterBack: { held: false, announced: '', historyHeld: false, hrefUnchanged: true, pages: 0 },
  afterBackOpen: { held: false, announced: '', historyHeld: false, hrefUnchanged: true, pages: 0 },
};

describe('pickupFailures', () => {
  it('passes a pickup that does everything the spec asks', () => {
    expect(pickupFailures(good)).toEqual([]);
  });

  it.each<[string, Partial<PickupRead>, RegExp]>([
    ['the address naming the book', { hrefUnchanged: false }, /location\.href/],
    ['no history entry', { historyHeld: false }, /history entry/],
    ['text showing through the cover', { hiddenBeforeFade: false }, /visibility/],
    ['pages never shown', { visibleAtRest: false }, /not visible/],
    ['the wrong book on the page', { pageTitle: 'Paper Ledger' }, /not the held book/],
    ['no reading line', { reading: '' }, /reading line/],
    ['no links', { linkCount: 0, links: [], markCount: 0 }, /row always renders/],
    ['an unsafe link', { links: ['_self||Open Library'] }, /unsafely/],
    ['a new tab with no rel', { links: ['_blank||Open Library'] }, /unsafely/],
    [
      'a rel on a link that stays in the tab',
      { links: ['_self|noopener noreferrer|Open Library'] },
      /unsafely/,
    ],
    ['focus moved by the pickup', { focusUnmoved: false }, /focus moved/],
    ['focus dropped by Escape', { focusCaught: false }, /dropped focus/],
    ['focus dropped by Escape from an open book', { focusCaughtOpen: false }, /open book/],
    ['pages off the desktop viewport', { pagesInView: false }, /run off the desktop viewport/],
    ['Thoughts missing from a flagged book', { thoughtsShown: false }, /opened without them/],
    ['no flagged book picked up', { thoughtsShown: undefined }, /no book flagged with Thoughts/],
    ['an unnamed link', { links: ['_blank|noopener noreferrer|'] }, /accessible name/],
    ['marks that never drew', { markCount: 0 }, /not one drew a mark/],
    ['a silent announcer', { announced: '' }, /announced nothing on pickup/],
    ['no put-back control', { putBack: undefined }, /no put-back control/],
    ['a put-back that is not a button', { putBack: { tag: 'DIV', name: 'x' } }, /not a button/],
    ['an unnamed put-back', { putBack: { tag: 'BUTTON', name: '' } }, /no accessible name/],
  ])('fails on %s', (_name, patch, message) => {
    expect(pickupFailures({ ...good, ...patch }).join('\n')).toMatch(message);
  });

  it.each<[string, Partial<PickupRead['second']>, RegExp]>([
    ['a second pickup that announced nothing', { announced: '' }, /announced nothing/],
    ['an unchanged announcement', { announced: good.announced }, /did not change/],
    ['the first book still held', { held: good.held }, /left the first book held/],
    ['no X for the second book', { putBack: false }, /X was not there for the second book/],
    ["the first book's pages left behind", { pages: 4 }, /outlived it/],
  ])('fails on %s', (_name, patch, message) => {
    expect(pickupFailures({ ...good, second: { ...good.second, ...patch } }).join('\n')).toMatch(
      message,
    );
  });

  it.each<[string, Partial<PickupRead['afterPutBack']>, RegExp]>([
    ['a put-back that left it held', { held: true }, /left the book held/],
    ['a stale announcement', { announced: 'Paper Ledger' }, /still says/],
    ['a stale history entry', { historyHeld: true }, /history entry in place/],
    ['an address changed on put-back', { hrefUnchanged: false }, /changed on the put-back control/],
    ['pages left behind', { pages: 2 }, /left in the layer/],
  ])('fails on %s', (_name, patch, message) => {
    expect(
      pickupFailures({ ...good, afterPutBack: { ...good.afterPutBack, ...patch } }).join('\n'),
    ).toMatch(message);
  });
});

describe('pickupFailures, the closed book (#531)', () => {
  it.each<[string, Partial<ClosedRead>, RegExp]>([
    ['a board off closed', { boardAngle: 4 }, /4\.0° off closed/],
    ['a board hinged the other way', { boardAngle: 180 }, /off closed/],
    ['a book that arrived open', { opened: true }, /arrived open/],
    ['pages showing on a closed book', { pagesHidden: false }, /pages are not hidden/],
    ['an X off screen', { xOnScreen: false }, /X is not on screen/],
    ['a hint that does not say the book turns and opens', { hint: 'Drag to look around' }, /hint/],
    ['the old hint, that says only a click', { hint: 'Click the book to open it' }, /hint/],
    ['no Open button', { openName: '' }, /Open button/],
    ['an Open button named for another book', { openName: 'Open Paper Ledger' }, /Open button/],
  ])('fails on %s', (_name, patch, message) => {
    expect(pickupFailures({ ...good, closed: { ...closed, ...patch } }).join('\n')).toMatch(
      message,
    );
  });

  it('judges the board within the same half degree as a closed book at rest', () => {
    expect(pickupFailures({ ...good, closed: { ...closed, boardAngle: 0.5 } })).toEqual([]);
    expect(pickupFailures({ ...good, closed: { ...closed, boardAngle: 0.51 } }).length).toBe(1);
    expect(pickupFailures({ ...good, closed: { ...closed, boardAngle: -0.51 } }).length).toBe(1);
  });

  it('holds Escape to account from an open book too, history included', () => {
    const left = { ...good.afterEscapeOpen, historyHeld: true };
    expect(pickupFailures({ ...good, afterEscapeOpen: left }).join('\n')).toMatch(
      /Escape from an open book left the pickup's history entry/,
    );
  });

  it('holds the back button to account from an open book too', () => {
    const open = { ...good.afterBackOpen, held: true };
    expect(pickupFailures({ ...good, afterBackOpen: open }).join('\n')).toMatch(
      /back button from an open book left the book held/,
    );
  });
});

describe('turnFailures — the closed book that turns, and closes again (#553)', () => {
  const closes: CloseRead = {
    boardAngle: 0.1,
    atClosedRest: true,
    pagesHidden: true,
    focusOnX: true,
    turnable: true,
  };
  const turn: TurnRead = {
    noDialog: true,
    xDescription:
      'Drag the closed book, or use the arrow keys, to turn it. Click it, or use Open, to open it.',
    closeArrow: closes,
    closeFoot: closes,
    held: '/held-covers/a.jpg',
    showedHeld: true,
    withoutHeld: { showedOwn: true },
    fellBack: true,
    pathInPage: false,
    turned: true,
    keyTurned: true,
    tapOpensSquare: true,
    wobbleKeepsHold: true,
    escapeFromClosed: true,
    escapeFromOpen: true,
    escapeMidClose: true,
    reducedCuts: true,
    fetchedNothing: true,
    coverlessArrivesClosed: true,
    coverlessCloses: true,
    backMidClose: true,
    returned: { rest: 0.4, frames: [0.4, 0.31, 0.2, 0.08, 0] },
  };

  it('passes a book that turns, opens square, closes by both controls and goes home', () => {
    expect(turnFailures(turn)).toEqual([]);
  });

  it('fails when no book was reached at all', () => {
    expect(turnFailures(undefined)).toHaveLength(1);
  });

  it.each<[string, Partial<TurnRead>, RegExp]>([
    ['a dialog left on the page', { noDialog: false }, /<dialog>/],
    [
      'an X that does not say the drag',
      { xDescription: 'Click it, or use the arrow keys.' },
      /the drag/,
    ],
    [
      'an X that does not say the arrow keys',
      { xDescription: 'Drag it. Click it to open it.' },
      /the arrow keys/,
    ],
    [
      'an X that does not say the click',
      { xDescription: 'Drag it, or use the arrow keys.' },
      /the click/,
    ],
    ['an X with no description at all', { xDescription: '' }, /does not name/],
    [
      'the shelf copy worn when a held copy exists',
      { showedHeld: false },
      /did not wear the held copy/,
    ],
    ['no held copy anywhere', { held: undefined }, /never checked/],
    ['no book without a held copy reached', { withoutHeld: undefined }, /other path went unseen/],
    [
      'the shelf copy not worn for a book without a held copy',
      { withoutHeld: { showedOwn: false } },
      /did not wear the shelf copy/,
    ],
    ['no fallback when the held copy fails', { fellBack: false }, /failed to load/],
    ['a cover path written into the page', { pathInPage: true }, /written into the held page/],
    ['a drag that turned nothing', { turned: false }, /drag on the canvas did not turn/],
    [
      'an arrow key that did not turn 15°',
      { keyTurned: false },
      /arrow key did not turn the book by 15°/,
    ],
    ['a tap that did not open it square', { tapOpensSquare: false }, /tap on the turned book/],
    ['a wobble that opened the book', { wobbleKeepsHold: false }, /wobbled 8 px/],
    ['an Escape that left the closed book', { escapeFromClosed: false }, /closed book back/],
    ['an Escape that left the open book', { escapeFromOpen: false }, /open book back/],
    ['an Escape that did nothing mid-close', { escapeMidClose: false }, /close in flight/],
    ['a close that tweens under reduced motion', { reducedCuts: false }, /reduced motion/],
    ['a fetch while turning', { fetchedNothing: false }, /fetched a cover/],
    [
      'no book without a cover reached on arrival',
      { coverlessArrivesClosed: undefined },
      /no book without a cover was reached, so its arrival/,
    ],
    [
      'a coverless book that arrived off closed',
      { coverlessArrivesClosed: false },
      /with no cover arrived off closed/,
    ],
    [
      'no book without a cover reached to close',
      { coverlessCloses: undefined },
      /so closing one was never checked/,
    ],
    ['a coverless book that did not close', { coverlessCloses: false }, /with no cover did not/],
    [
      'a back button mid-close that left the hand full',
      { backMidClose: false },
      /back button with a close in flight/,
    ],
    ['no return sampled', { returned: undefined }, /return was never seen/],
  ])('fails on %s', (_name, patch, message) => {
    expect(turnFailures({ ...turn, ...patch }).join('\n')).toMatch(message);
  });

  it.each<[string, Partial<CloseRead>, RegExp]>([
    ['a board left open at 12°', { boardAngle: 12 }, /12\.0° off closed/],
    ['a board hinged the other way', { boardAngle: -3 }, /3\.0° off closed/],
    ['a board angle never read', { boardAngle: undefined }, /never read/],
    ['a board 0.51° off closed', { boardAngle: 0.51 }, /0\.5° off closed/],
    ['a book not at the closed rest', { atClosedRest: false }, /held, closed, at rest/],
    ['pages still showing', { pagesHidden: false }, /pages were not hidden/],
    ['focus dropped off the pages', { focusOnX: false }, /focus was not on the X/],
    ['a closed book no key turns', { turnable: false }, /arrow key did not turn the book/],
  ])('fails each control on %s', (_name, patch, message) => {
    for (const [key, control] of [
      ['closeArrow', 'the back arrow'],
      ['closeFoot', "the foot's Close the book"],
    ] as const) {
      const failures = turnFailures({ ...turn, [key]: { ...closes, ...patch } }).join('\n');
      expect(failures).toMatch(message);
      expect(failures).toContain(control);
    }
  });

  it('passes a book exactly at the closed tolerance, either way', () => {
    expect(turnFailures({ ...turn, closeArrow: { ...closes, boardAngle: 0.5 } })).toEqual([]);
    expect(turnFailures({ ...turn, closeFoot: { ...closes, boardAngle: -0.5 } })).toEqual([]);
  });

  it.each<[string, { rest: number; frames: number[] }]>([
    ['a return that cut straight home', { rest: 0.4, frames: [0.4, 0] }],
    ['a return that never moved', { rest: 0.4, frames: [0.4, 0.4, 0.4] }],
    ['a return that rose on the way', { rest: 0.4, frames: [0.4, 0.2, 0.3, 0] }],
    ['a return that only read the end', { rest: 0.4, frames: [0] }],
    ['a return with no frames', { rest: 0.4, frames: [] }],
  ])('fails %s', (_name, returned) => {
    expect(turnFailures({ ...turn, returned }).join('\n')).toMatch(/did not play the return/);
  });

  it('passes a return that took a single step between the rest and 0', () => {
    expect(turnFailures({ ...turn, returned: { rest: 0.4, frames: [0.4, 0.15, 0] } })).toEqual([]);
  });
});
describe('phoneFailures', () => {
  const phone: PhoneRead = {
    pageInView: true,
    titleLeads: true,
    putBackInView: true,
    closedXOnScreen: true,
  };

  it('fails when the X is off screen while the book is closed', () => {
    expect(phoneFailures({ ...phone, closedXOnScreen: false }).join('\n')).toMatch(/closed/);
  });

  it('passes a page that fits, leads with the title and keeps put-back on screen', () => {
    expect(phoneFailures({ ...phone })).toEqual([]);
  });

  it('fails each clause alone, and an unreached phone', () => {
    expect(phoneFailures({ ...phone, pageInView: false })).toHaveLength(1);
    expect(phoneFailures({ ...phone, titleLeads: false })).toHaveLength(1);
    expect(phoneFailures({ ...phone, putBackInView: false })).toHaveLength(1);
    expect(phoneFailures(undefined)).toHaveLength(1);
  });
});

describe('spreadFailures — the open spread of §3.6', () => {
  const flat: SpreadRead = {
    boardAngle: 180,
    left: { width: 425.3, height: 640.2 },
    block: { width: 425.2, height: 640 },
    gutterGap: 0,
    leftTilt: 0,
    rightTilt: 0,
  };

  it('passes a spread lying flat, matched and closed at the gutter', () => {
    expect(spreadFailures(flat, 'a book')).toEqual([]);
  });

  it("fails #371's prototype on each of its three causes", () => {
    // The cover resting near 165°, leaning towards the camera.
    expect(spreadFailures({ ...flat, boardAngle: 165, leftTilt: 15 }, 'x').join('\n')).toMatch(
      /165\.00°.*\n.*left page is 15\.00° off square/,
    );
    // The left page drawn at 97% of the cover's height.
    expect(spreadFailures({ ...flat, left: { width: 425.3, height: 621 } }, 'x').join()).toMatch(
      /621\.0px tall against the page block's 640\.0px/,
    );
    // The hinge at the spine's outside corner: a strip between the pages.
    expect(spreadFailures({ ...flat, gutterGap: 12.4 }, 'x').join()).toMatch(/12\.4px apart/);
  });

  it('holds the tolerances at their edges: half a degree and one pixel pass, more fails', () => {
    expect(spreadFailures({ ...flat, boardAngle: 179.5, gutterGap: 1 }, 'x')).toEqual([]);
    expect(spreadFailures({ ...flat, boardAngle: 179.4 }, 'x')).toHaveLength(1);
    expect(spreadFailures({ ...flat, gutterGap: 1.1 }, 'x')).toHaveLength(1);
    expect(spreadFailures({ ...flat, left: { width: 426.3, height: 640 } }, 'x')).toHaveLength(1);
    // The other three at their edges: a tilt of half a degree, a left page a
    // pixel off the block either way.
    const block = { width: 425, height: 640 };
    const edge = { width: 426, height: 641 };
    expect(
      spreadFailures({ ...flat, leftTilt: 0.5, rightTilt: 0.5, block, left: edge }, 'x'),
    ).toEqual([]);
    expect(spreadFailures({ ...flat, leftTilt: 0.51 }, 'x')).toHaveLength(1);
    expect(spreadFailures({ ...flat, rightTilt: 0.51 }, 'x')).toHaveLength(1);
    expect(spreadFailures({ ...flat, left: { width: 425.2, height: 641.1 } }, 'x')).toHaveLength(1);
  });

  it('fails when there is no spread at rest to measure', () => {
    expect(spreadFailures(undefined, 'a book')).toEqual([
      'a book: no open spread at rest to measure',
    ]);
  });
});

describe('the other two ways down', () => {
  it.each<['afterEscape' | 'afterBack', RegExp]>([
    ['afterEscape', /^Escape left the book held$/m],
    ['afterBack', /^the back button left the book held$/m],
  ])('fails %s that left the book in hand', (key, message) => {
    const read = { ...good, [key]: { ...good[key], held: true } };
    expect(pickupFailures(read).join('\n')).toMatch(message);
  });

  it('fails a back button that left the pickup entry in place', () => {
    const read = { ...good, afterBack: { ...good.afterBack, historyHeld: true } };
    expect(pickupFailures(read).join('\n')).toMatch(/back button left the pickup's history entry/);
  });
});

describe('atRestFailures — the held page at rest (#426)', () => {
  const rest: AtRestRead = {
    frames: 30,
    mostLoops: 1,
    overflow: 'auto',
    tall: true,
    inReachUnscrolled: false,
    inReachScrolled: true,
  };

  it('passes a sleeping ticker and long Thoughts that scroll the links into reach', () => {
    expect(atRestFailures(rest)).toEqual([]);
  });

  it("fails GSAP's own ticker awake, and a window that came up short", () => {
    expect(atRestFailures({ ...rest, mostLoops: 2 })).toHaveLength(1);
    expect(atRestFailures({ ...rest, frames: 29 })).toHaveLength(1);
    expect(atRestFailures({ ...rest, frames: 0, mostLoops: 0 })).toHaveLength(1);
  });

  it('fails Thoughts that do not scroll at rest', () => {
    expect(atRestFailures({ ...rest, overflow: 'hidden' })).toHaveLength(1);
    expect(atRestFailures({ ...rest, tall: false })).toHaveLength(1);
  });

  it('fails a links row never scrolled into reach, or one in reach unscrolled', () => {
    expect(atRestFailures({ ...rest, inReachScrolled: false })).toHaveLength(1);
    expect(atRestFailures({ ...rest, inReachUnscrolled: true })).toHaveLength(1);
  });
});

describe('controlsFailures — the closed book and its controls (#531)', () => {
  const inputs = { mouse: true, touch: true, keyboard: true };
  const viewport: ViewportControls = {
    opens: inputs,
    putsBackClosed: inputs,
    putsBackOpen: inputs,
    xWidth: 44,
    xHeight: 44,
    xOverlaps: [],
    xOnTopClosed: true,
    xOnTopOpen: true,
    xInsetClosed: { top: 24, right: 24, expected: 24 },
    xInsetOpen: { top: 24, right: 24, expected: 24 },
  };
  const goodControls: ControlsRead = {
    desktop: viewport,
    phone: viewport,
    xName: 'Put the book back',
    buttonInTree: true,
    buttonGoneWhileOpening: true,
    longTitleOnScreen: true,
    xStayedPut: true,
    staysClosed: true,
    focusToPage: true,
    focusToPageReduced: true,
    reducedPickupCuts: true,
    reducedOpenCuts: true,
    reducedPutBackCuts: true,
    markup: [],
    cspViolations: 0,
    hintClosed: true,
    hintOpen: true,
    hintReturns: true,
    cursorPointer: true,
    cursorReset: true,
  };

  it('passes a closed book whose controls all work', () => {
    expect(controlsFailures(goodControls)).toEqual([]);
  });

  it('says nothing was read when nothing was', () => {
    expect(controlsFailures(undefined)).toHaveLength(1);
  });

  it('holds the X to the clamp within a pixel, and no further', () => {
    const edge = (inset: Inset): ControlsRead => ({
      ...goodControls,
      desktop: { ...viewport, xInsetClosed: inset, xInsetOpen: inset },
    });
    expect(controlsFailures(edge({ top: 25, right: 23, expected: 24 }))).toEqual([]);
    expect(controlsFailures(edge({ top: 25.1, right: 24, expected: 24 }))).toHaveLength(2);
    expect(controlsFailures(edge({ top: 24, right: 22.9, expected: 24 }))).toHaveLength(2);
  });

  it.each<[string, Partial<ControlsRead>, RegExp]>([
    ['an X with no name', { xName: '' }, /no accessible name/],
    ['no Open button in the tree', { buttonInTree: false }, /Open button/],
    [
      'an Open button left in the tree while opening',
      { buttonGoneWhileOpening: false },
      /while it opens/,
    ],
    ['an Open button off screen on a long title', { longTitleOnScreen: false }, /fully on screen/],
    ['an X that moved when Open took focus', { xStayedPut: false }, /X moved/],
    ['a book that opened by itself', { staysClosed: false }, /opened by itself/],
    ['focus lost after Open', { focusToPage: false }, /focus did not land on the right-hand page/],
    [
      'focus lost after Open under reduced motion',
      { focusToPageReduced: false },
      /reduced motion.*focus/,
    ],
    [
      'a pickup that tweened under reduced motion',
      { reducedPickupCuts: false },
      /pickup did not cut/,
    ],
    [
      'an opening that tweened under reduced motion',
      { reducedOpenCuts: false },
      /opening did not cut/,
    ],
    [
      'a put-back that tweened under reduced motion',
      { reducedPutBackCuts: false },
      /put-back did not cut/,
    ],
    ['markup built wrongly', { markup: ['the X has a style attribute'] }, /style attribute/],
    ['a CSP violation', { cspViolations: 2 }, /2 CSP violations/],
    ['a hint that never changed', { hintClosed: false }, /drag turns the closed book/],
    [
      'a hint still showing over the open book',
      { hintOpen: false },
      /not hidden once the book is open/,
    ],
    ['a hint stuck after the hand emptied', { hintReturns: false }, /template's again/],
    ['no pointer cursor over the book', { cursorPointer: false }, /cursor/],
    ['a cursor left behind', { cursorReset: false }, /cursor/],
  ])('fails on %s', (_name, patch, message) => {
    expect(controlsFailures({ ...goodControls, ...patch }).join('\n')).toMatch(message);
  });

  it.each<[string, Partial<ViewportControls>, RegExp]>([
    ['a mouse that cannot open', { opens: { ...inputs, mouse: false } }, /mouse could not open/],
    ['a touch that cannot open', { opens: { ...inputs, touch: false } }, /touch could not open/],
    [
      'a keyboard that cannot open',
      { opens: { ...inputs, keyboard: false } },
      /keyboard could not open/,
    ],
    [
      'a mouse that cannot put a closed book back',
      { putsBackClosed: { ...inputs, mouse: false } },
      /mouse could not put the closed book back/,
    ],
    [
      'a keyboard that cannot put an open book back',
      { putsBackOpen: { ...inputs, keyboard: false } },
      /keyboard could not put the open book back/,
    ],
    ['an X under 2.75rem wide', { xWidth: 43 }, /2\.75rem/],
    ['an X under 2.75rem tall', { xHeight: 40 }, /2\.75rem/],
    ['an X on the brand', { xOverlaps: ['the brand'] }, /overlaps the brand/],
    ['an X on the closed book', { xOverlaps: ['the closed book'] }, /overlaps the closed book/],
    [
      'an X under something over a closed book',
      { xOnTopClosed: false },
      /not the top element.*closed/,
    ],
    ['an X under an open page', { xOnTopOpen: false }, /not the top element.*open/],
    [
      'an X 3px too low with the book closed',
      { xInsetClosed: { top: 27, right: 24, expected: 24 } },
      /top offset is 27\.0px with the book closed/,
    ],
    [
      'an X 2px off the right with the book open',
      { xInsetOpen: { top: 24, right: 22, expected: 24 } },
      /right offset is 22\.0px with the book open/,
    ],
  ])('fails at either size on %s', (_name, patch, message) => {
    for (const where of ['desktop', 'phone'] as const) {
      const failures = controlsFailures({
        ...goodControls,
        [where]: { ...viewport, ...patch },
      }).join('\n');
      expect(failures).toMatch(message);
      expect(failures).toContain(where === 'desktop' ? '1280×800' : '375×812');
    }
  });
});

describe('drawerFailures — every cell of the drawer tables (#531, C6)', () => {
  const cell = {
    name: 'click on the book',
    expected: 'drawer closed; book closed',
    actual: 'drawer closed; book closed',
  };

  it('passes cells whose outcome is the spec’s', () => {
    expect(drawerFailures([cell], 1)).toEqual([]);
  });

  it('fails when a cell dropped out, so a gap cannot pass as a smaller table', () => {
    expect(drawerFailures([cell], 2).join('\n')).toMatch(/1 of the 2 cells/);
  });

  it('fails when there are more cells than the table has', () => {
    expect(drawerFailures([cell, cell], 1).join('\n')).toMatch(/2 of the 1 cells/);
  });

  it('names the cell, what the spec says and what happened', () => {
    const failures = drawerFailures(
      [
        {
          name: 'the X by key',
          expected: 'drawer open; book away',
          actual: 'drawer closed; book away',
        },
      ],
      1,
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('the X by key');
    expect(failures[0]).toContain('drawer open; book away');
    expect(failures[0]).toContain('drawer closed; book away');
  });

  it('fails when no cell was read at all', () => {
    expect(drawerFailures([], 0).join('\n')).toMatch(/no cell/);
  });
});

describe('lostFailures — a lost context with a book held (#531, C15)', () => {
  const clean = {
    away: true,
    controlsHidden: true,
    hintRestored: true,
    cursorReset: true,
    focusOnCanvas: true,
  };

  it('passes a book put away at once, from closed and from open', () => {
    expect(lostFailures({ closed: clean, open: clean })).toEqual([]);
  });

  it.each<[string, Partial<LostCase>, RegExp]>([
    ['a book left in the hand', { away: false }, /still held/],
    ['controls left showing', { controlsHidden: false }, /controls were left showing/],
    ['a hint left saying a click opens it', { hintRestored: false }, /hint/],
    ['a cursor left a pointer', { cursorReset: false }, /cursor/],
    ['focus dropped to the body', { focusOnCanvas: false }, /focus/],
  ])('fails on %s, in either state', (_name, patch, message) => {
    for (const state of ['closed', 'open'] as const) {
      const read = { closed: clean, open: clean, [state]: { ...clean, ...patch } };
      expect(lostFailures(read).join('\n')).toMatch(message);
      expect(lostFailures(read).join('\n')).toContain(state);
    }
  });

  it('fails when the loss was never driven', () => {
    expect(lostFailures(undefined)).toHaveLength(1);
  });
});

describe('overlapFailures — the hint, the X and the brand off the book (#553, C6)', () => {
  const open: OpenFraming = {
    hintHidden: true,
    x: { left: 1200, top: 24, right: 1244, bottom: 68 },
    xInset: { top: 24, right: 24, expected: 24 },
    brand: { left: 24, top: 24, right: 120, bottom: 60 },
    launcher: { left: 1200, top: 700, right: 1256, bottom: 756 },
    left: { left: 180, top: 120, right: 620, bottom: 700 },
    right: { left: 640, top: 120, right: 1080, bottom: 700 },
  };
  const closed: ClosedFraming = {
    hint: { left: 24, top: 70, right: 300, bottom: 90 },
    x: open.x,
    launcher: open.launcher,
    book: { left: 400, top: 150, right: 880, bottom: 700 },
  };
  const read = (label = '1280×800, the tallest book'): OverlapRead => ({
    label,
    open,
    square: closed,
    tilted: closed,
  });
  const reads = Array.from({ length: OVERLAP_READS }, () => read());

  it('passes a book whose pages, hint and X keep apart', () => {
    expect(overlapFailures(reads)).toEqual([]);
  });

  it('fails when a size dropped out, so a gap cannot pass as a smaller table', () => {
    expect(overlapFailures(reads.slice(1)).join('\n')).toMatch(/7 of the 8 overlap readings/);
    expect(overlapFailures([]).join('\n')).toMatch(/0 of the 8/);
  });

  it('judges two boxes that share an edge as apart, and any overlap as meeting', () => {
    const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(meets(a, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
    expect(meets(a, { left: 9.9, top: 0, right: 20, bottom: 10 })).toBe(true);
    expect(meets(a, { left: 0, top: 10, right: 10, bottom: 20 })).toBe(false);
    expect(meets(a, { left: 0, top: 9.9, right: 10, bottom: 20 })).toBe(true);
  });

  const one = (patch: Partial<OverlapRead>): string[] =>
    overlapFailures([{ ...read('375×812, the thickest book'), ...patch }, ...reads.slice(1)]);

  it.each<[string, Partial<OpenFraming>, RegExp]>([
    [
      'a hint showing over the open book',
      { hintHidden: false },
      /hint is showing over the open book/,
    ],
    [
      'the X inset off the clamp (2.5vw at 800 wide)',
      { xInset: { top: 20, right: 20, expected: 24 } },
      /X's top offset is 20\.0px with the book open/,
    ],
    [
      'the X on the left page',
      { x: { left: 600, top: 130, right: 650, bottom: 174 } },
      /X \(.*\) meets the open book's left page/,
    ],
    [
      'the X on the right page',
      { x: { left: 1060, top: 130, right: 1110, bottom: 174 } },
      /X \(.*\) meets the open book's right page/,
    ],
    [
      'the brand on the left page',
      { brand: { left: 150, top: 130, right: 200, bottom: 160 } },
      /brand \(.*\) meets the open book's left page/,
    ],
    [
      'the brand on the right page',
      { brand: { left: 700, top: 130, right: 760, bottom: 160 } },
      /brand \(.*\) meets the open book's right page/,
    ],
    [
      'the X on the launcher',
      { launcher: { ...open.launcher, top: 40 } },
      /X meets the Ask launcher with the book open/,
    ],
  ])('fails the open framing on %s', (_name, patch, message) => {
    const failures = one({ open: { ...open, ...patch } }).join('\n');
    expect(failures).toMatch(message);
    expect(failures).toContain('375×812, the thickest book');
  });

  it.each<[string, Partial<ClosedFraming>, RegExp]>([
    [
      'the hint on the book',
      { hint: { left: 390, top: 140, right: 500, bottom: 160 } },
      /hint \(.*\) meets the closed book/,
    ],
    [
      'the X on the book',
      { x: { left: 860, top: 160, right: 900, bottom: 204 } },
      /X \(.*\) meets the closed book/,
    ],
    [
      'the X on the launcher',
      { launcher: { ...closed.launcher, top: 40 } },
      /X meets the Ask launcher with the book closed/,
    ],
  ])(
    'fails the closed framing on %s, square and at the pitch limit alike',
    (_n, patch, message) => {
      for (const [key, how] of [
        ['square', 'square'],
        ['tilted', 'at the pitch limit'],
      ] as const) {
        const failures = one({ [key]: { ...closed, ...patch } }).join('\n');
        expect(failures).toMatch(message);
        expect(failures).toContain(how);
      }
    },
  );
});

describe('arrowFailures — the back arrow keeps its place (#553, C4)', () => {
  const place: ArrowPlace = {
    desktop: {
      arrow: { left: 200, top: 130, right: 244, bottom: 174 },
      leftPage: { left: 180, top: 110, right: 640, bottom: 700 },
    },
    phone: {
      innerHeight: 812,
      before: { left: 16, top: 90, right: 60, bottom: 134 },
      after: { left: 16, top: 90, right: 60, bottom: 134 },
      scrolled: true,
    },
  };

  it('passes an arrow in the left page corner, and held in view on the phone', () => {
    expect(arrowFailures(place)).toEqual([]);
  });

  it.each<[string, ArrowPlace, RegExp]>([
    [
      'an arrow at the foot of the left page',
      {
        ...place,
        desktop: {
          arrow: { left: 200, top: 640, right: 244, bottom: 684 },
          leftPage: { left: 180, top: 110, right: 640, bottom: 700 },
        },
      },
      /outside the left page's top-left quarter/,
    ],
    [
      'an arrow that scrolled away with the Thoughts',
      {
        ...place,
        phone: { ...place.phone!, after: { left: 16, top: -300, right: 60, bottom: -256 } },
      },
      /top half after the page is scrolled/,
    ],
    [
      'an arrow in the lower half of the phone',
      {
        ...place,
        phone: { ...place.phone!, before: { left: 16, top: 600, right: 60, bottom: 644 } },
      },
      /top half before the page is scrolled/,
    ],
    [
      'Thoughts too short to scroll',
      { ...place, phone: { ...place.phone!, scrolled: false } },
      /too short to scroll/,
    ],
    ['no phone read', { ...place, phone: undefined }, /no back arrow to read at phone size/],
    ['no desktop read', { ...place, desktop: undefined }, /at desktop size/],
    [
      'an arrow too narrow to hit',
      {
        ...place,
        phone: { ...place.phone!, before: { left: 16, top: 90, right: 46, bottom: 134 } },
      },
      /30 px wide, under 40 px/,
    ],
  ])('fails on %s', (_name, patch, message) => {
    expect(arrowFailures(patch).join(' / ')).toMatch(message);
  });
});
