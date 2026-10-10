import { describe, expect, it } from 'vitest';
import {
  phoneFailures,
  pickupFailures,
  spreadFailures,
  viewerFailures,
  type PickupRead,
  type SpreadRead,
  type ViewerRead,
} from './pickup-gate.ts';

const good: PickupRead = {
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
    ['no put-back on the second page', { putBack: false }, /second book's page/],
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
    [
      'a hand emptied with the view left open',
      { emptiedCloses: false },
      /left the view open over an empty hand/,
    ],
  ])('fails on %s', (_name, patch, message) => {
    expect(viewerFailures({ ...viewer, ...patch }).join('\n')).toMatch(message);
  });

  it('fails when no viewer was reached at all', () => {
    expect(viewerFailures(undefined)).toHaveLength(1);
  });
});
describe('phoneFailures', () => {
  it('passes a page that fits, leads with the title and keeps put-back on screen', () => {
    expect(phoneFailures({ pageInView: true, titleLeads: true, putBackInView: true })).toEqual([]);
  });

  it('fails each clause alone, and an unreached phone', () => {
    expect(
      phoneFailures({ pageInView: false, titleLeads: true, putBackInView: true }),
    ).toHaveLength(1);
    expect(
      phoneFailures({ pageInView: true, titleLeads: false, putBackInView: true }),
    ).toHaveLength(1);
    expect(
      phoneFailures({ pageInView: true, titleLeads: true, putBackInView: false }),
    ).toHaveLength(1);
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
