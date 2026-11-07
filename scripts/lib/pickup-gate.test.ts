import { describe, expect, it } from 'vitest';
import {
  atRestFailures,
  CLOSED_HINT,
  controlsFailures,
  drawerFailures,
  lostFailures,
  phoneFailures,
  pickupFailures,
  spreadFailures,
  viewerFailures,
  type AtRestRead,
  type ClosedRead,
  type ControlsRead,
  type LostCase,
  type PhoneRead,
  type PickupRead,
  type SpreadRead,
  type ViewerRead,
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
    ['a hint that does not say a click opens it', { hint: 'Drag to look around' }, /hint/],
    ['no Open button', { openName: '' }, /Open button/],
    ['an Open button named for another book', { openName: 'Open Paper Ledger' }, /Open button/],
  ])('fails on %s', (_name, patch, message) => {
    expect(pickupFailures({ ...good, closed: { ...closed, ...patch } }).join('\n')).toMatch(
      message,
    );
  });

  it('judges the board within the same half degree as the examined book', () => {
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

describe('viewerFailures, the coverless book on arrival (#531, C1)', () => {
  it('fails when a book with no cover arrives off closed, and when none was reached', () => {
    const base = {
      opened: true,
      namedForBook: true,
      closedAngle: 0,
      escapeClosedViewer: true,
      heldAfterEscape: true,
      pageVisibleAfterEscape: true,
      held: '/h.jpg',
      showedHeld: true,
      withoutHeld: { showedOwn: true },
      fellBack: true,
      pathInPage: false,
      turned: true,
      keyTurned: true,
      leftByTap: true,
      leftByButton: true,
      reducedCuts: true,
      fetchedNothing: true,
      coverlessOpens: true,
      coverlessArrivesClosed: true,
      focusInside: true,
      focusReturned: true,
      emptiedCloses: true,
    } satisfies ViewerRead;
    expect(viewerFailures(base)).toEqual([]);
    expect(viewerFailures({ ...base, coverlessArrivesClosed: false }).join('\n')).toMatch(
      /with no cover arrived off closed/,
    );
    expect(viewerFailures({ ...base, coverlessArrivesClosed: undefined }).join('\n')).toMatch(
      /no book without a cover was reached/,
    );
  });
});

describe('viewerFailures', () => {
  const viewer: ViewerRead = {
    opened: true,
    namedForBook: true,
    closedAngle: 0.1,
    escapeClosedViewer: true,
    heldAfterEscape: true,
    pageVisibleAfterEscape: true,
    held: '/held-covers/a.jpg',
    showedHeld: true,
    withoutHeld: { showedOwn: true },
    fellBack: true,
    pathInPage: false,
    turned: true,
    keyTurned: true,
    focusInside: true,
    focusReturned: true,
    leftByTap: true,
    leftByButton: true,
    reducedCuts: true,
    fetchedNothing: true,
    coverlessOpens: true,
    coverlessArrivesClosed: true,
    emptiedCloses: true,
  };

  it('passes a view that closes the book, turns it and leaves with it still held', () => {
    expect(viewerFailures(viewer)).toEqual([]);
  });

  it.each<[string, Partial<ViewerRead>, RegExp]>([
    ['a view that never opened', { opened: false }, /did not open/],
    ['a dialog not named for the book', { namedForBook: false }, /not named for the book/],
    ['a book left open at 12°', { closedAngle: 12 }, /12\.0° off closed/],
    ['a book left open the other way', { closedAngle: -3 }, /3\.0° off closed/],
    ['a board angle never read', { closedAngle: undefined }, /never read/],
    ['an Escape that did nothing', { escapeClosedViewer: false }, /did not close/],
    ['an Escape that took the book too', { heldAfterEscape: false }, /also put the book back/],
    ['a page still hidden after Escape', { pageVisibleAfterEscape: false }, /page was not visible/],
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
    ['a drag that turned nothing', { turned: false }, /drag across the view did not turn/],
    [
      'an arrow key that did not turn 15°',
      { keyTurned: false },
      /arrow key did not turn the book by 15°/,
    ],
    ['focus left outside the dialog', { focusInside: false }, /focus was not inside/],
    ['focus lost after Escape', { focusReturned: false }, /focus did not return/],
    ['a tap that did not leave', { leftByTap: false }, /tap on the view did not leave/],
    ['a button that did not leave', { leftByButton: false }, /Back to the page did not leave/],
    ['motion that tweens under reduced motion', { reducedCuts: false }, /reduced motion/],
    ['a fetch while examining', { fetchedNothing: false }, /fetched a cover/],
    ['no book without a cover reached', { coverlessOpens: undefined }, /no book without a cover/],
    ['a coverless book that did not examine', { coverlessOpens: false }, /with no cover did not/],
    ['a book 0.51° off closed', { closedAngle: 0.51 }, /0\.5° off closed/],
    [
      'a hand emptied with the view left open',
      { emptiedCloses: false },
      /left the view open over an empty hand/,
    ],
  ])('fails on %s', (_name, patch, message) => {
    expect(viewerFailures({ ...viewer, ...patch }).join('\n')).toMatch(message);
  });

  it('passes a book exactly at the closed tolerance, either way', () => {
    expect(viewerFailures({ ...viewer, closedAngle: 0.5 })).toEqual([]);
    expect(viewerFailures({ ...viewer, closedAngle: -0.5 })).toEqual([]);
  });

  it('fails when no viewer was reached at all', () => {
    expect(viewerFailures(undefined)).toHaveLength(1);
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
    cursorPointer: true,
    cursorReset: true,
  };

  it('passes a closed book whose controls all work', () => {
    expect(controlsFailures(goodControls)).toEqual([]);
  });

  it('says nothing was read when nothing was', () => {
    expect(controlsFailures(undefined)).toHaveLength(1);
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
    ['a hint that never changed', { hintClosed: false }, /hint/],
    ['a hint stuck after opening', { hintOpen: false }, /hint/],
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
