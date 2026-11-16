import { describe, expect, it } from 'vitest';
import {
  flatMotionFailures,
  flatOpenedFailures,
  flatPutBackFailures,
  flatRestFailures,
  type FlatMotionRead,
  type FlatOpenedRead,
  type FlatRestRead,
} from './flat-layer-gate.ts';

const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

const REST: FlatRestRead = {
  label: 'desktop',
  flatCount: 2,
  layerCount: 0,
  ancestors: [
    { name: 'div.held-flat', transformStyle: 'flat', transform: 'none' },
    { name: 'body', transformStyle: 'flat', transform: 'none' },
  ],
  pages: [box(100, 80, 560, 720), box(580, 80, 1040, 720)],
  slots: [box(100.4, 80, 560, 719.5), box(580, 80.8, 1040.2, 720)],
  pageSides: ['left', 'right'],
  slotSides: ['left', 'right'],
  expectedSides: ['left', 'right'],
  slotEvents: ['none', 'none'],
  sheetsVisible: true,
};

describe('flatRestFailures — the open book at rest (#599, C2, C3, C7, C11)', () => {
  it('passes pages in the flat layer, over flat ancestors, on their slots, with no slot taking events', () => {
    expect(flatRestFailures(REST)).toEqual([]);
  });

  it('fails a page still in the 3D layer, or one in neither', () => {
    expect(flatRestFailures({ ...REST, flatCount: 1, layerCount: 1 })).toHaveLength(1);
    expect(flatRestFailures({ ...REST, flatCount: 0, layerCount: 0 })).toHaveLength(1);
  });

  it('fails any ancestor that is 3D: a preserve-3d one, or one carrying a matrix3d', () => {
    const preserved = [{ name: 'div.cam', transformStyle: 'preserve-3d', transform: 'none' }];
    expect(flatRestFailures({ ...REST, ancestors: preserved })).toHaveLength(1);
    const matrix = [{ name: 'div.cam', transformStyle: 'flat', transform: 'matrix3d(1,0,0,0)' }];
    expect(flatRestFailures({ ...REST, ancestors: matrix })).toHaveLength(1);
  });

  it('fails a side the viewport draws and the read lacks, such as a hidden left page on desktop', () => {
    const rightOnly = { ...REST, pages: [REST.pages[1]!], pageSides: ['right'] };
    expect(flatRestFailures(rightOnly)).toHaveLength(1);
    expect(flatRestFailures({ ...rightOnly, expectedSides: ['right'] })).toEqual([]);
  });

  it('fails a run that read no ancestor at all, which would pass the 3D rule vacuously', () => {
    expect(flatRestFailures({ ...REST, ancestors: [] })).toHaveLength(1);
  });

  it('holds a page to within 1 px of its slot on every edge, and no more', () => {
    expect(flatRestFailures({ ...REST, pages: [box(101, 80, 560, 720), REST.pages[1]!] })).toEqual(
      [],
    );
    expect(
      flatRestFailures({ ...REST, pages: [box(101.5, 80, 560, 720), REST.pages[1]!] }),
    ).toHaveLength(1);
    expect(
      flatRestFailures({ ...REST, pages: [box(100, 80, 560, 723), REST.pages[1]!] }),
    ).toHaveLength(1);
  });

  it("holds each page to its own slot: pages standing on each other's slots fail", () => {
    expect(flatRestFailures({ ...REST, pages: [REST.pages[1]!, REST.pages[0]!] })).toHaveLength(2);
  });

  it('holds the right page alone to the right slot, as the phone draws it', () => {
    const phone = { ...REST, expectedSides: ['right'] };
    expect(flatRestFailures({ ...phone, pages: [REST.pages[1]!], pageSides: ['right'] })).toEqual(
      [],
    );
    expect(
      flatRestFailures({ ...phone, pages: [REST.pages[0]!], pageSides: ['right'] }),
    ).toHaveLength(1);
  });

  it('fails when the slots were not found, rather than comparing a page with nothing', () => {
    expect(flatRestFailures({ ...REST, slots: [] }).length).toBeGreaterThan(0);
  });

  it('fails a slot that takes pointer events', () => {
    expect(flatRestFailures({ ...REST, slotEvents: ['none', 'auto'] })).toHaveLength(1);
  });

  it('fails a paper sheet that is not drawn while the book is open', () => {
    expect(flatRestFailures({ ...REST, sheetsVisible: false })).toHaveLength(1);
  });
});

const CLOSING: FlatMotionRead = {
  label: 'closing, desktop',
  flatCount: 0,
  layerCount: 2,
  transforms: ['', ''],
  pagesExpected: true,
};

describe('flatMotionFailures — a closing or put-back book (#599, C4)', () => {
  it('passes pages back in 3D with no inline transform, and none once the book has settled', () => {
    expect(flatMotionFailures(CLOSING)).toEqual([]);
    expect(flatMotionFailures({ ...CLOSING, layerCount: 0, pagesExpected: false })).toEqual([]);
  });

  it('fails a page left in the flat layer while the book moves', () => {
    // One page stranded in the flat layer is also one page missing from the 3D one.
    expect(flatMotionFailures({ ...CLOSING, flatCount: 1, layerCount: 1 })).toHaveLength(2);
    expect(flatMotionFailures({ ...CLOSING, flatCount: 1 })).toHaveLength(1);
  });

  it('fails a page that left the layer, and a page that outlived the book', () => {
    expect(flatMotionFailures({ ...CLOSING, layerCount: 1 })).toHaveLength(1);
    expect(flatMotionFailures({ ...CLOSING, layerCount: 2, pagesExpected: false })).toHaveLength(1);
  });

  it('fails an inline transform kept from the flat layer', () => {
    expect(
      flatMotionFailures({ ...CLOSING, transforms: ['', 'matrix(1, 0, 0, 1, 5, 5)'] }),
    ).toHaveLength(1);
  });
});

const OPENED: FlatOpenedRead = {
  label: 'reduced motion, desktop',
  flatCount: 2,
  transforms: ['matrix(1, 0, 0, 1, 100, 80)', 'matrix(0.9, 0, 0, 0.9, 580, 80)'],
};

describe('flatOpenedFailures — the call that opened the book (#599, C3)', () => {
  it('passes both pages in the flat layer, placed by a 2D matrix away from the corner', () => {
    expect(flatOpenedFailures(OPENED)).toEqual([]);
  });

  it('fails a page not yet moved, or not yet placed', () => {
    expect(flatOpenedFailures({ ...OPENED, flatCount: 0 })).toHaveLength(1);
    expect(flatOpenedFailures({ ...OPENED, transforms: ['', OPENED.transforms[1]!] })).toHaveLength(
      1,
    );
  });

  it('fails a collapsed page: a zero-area matrix with a translation, and passes a quarter turn', () => {
    expect(
      flatOpenedFailures({
        ...OPENED,
        transforms: ['matrix(0, 0, 0, 0, 100, 80)', OPENED.transforms[1]!],
      }),
    ).toHaveLength(1);
    expect(
      flatOpenedFailures({
        ...OPENED,
        transforms: ['matrix(0, 1, -1, 0, 100, 80)', OPENED.transforms[1]!],
      }),
    ).toEqual([]);
  });

  it('fails a page at the layer’s corner, and a matrix that is not a 2D one', () => {
    expect(
      flatOpenedFailures({
        ...OPENED,
        transforms: ['matrix(1, 0, 0, 1, 0, 0)', OPENED.transforms[1]!],
      }),
    ).toHaveLength(1);
    expect(
      flatOpenedFailures({ ...OPENED, transforms: ['matrix3d(1,0,0,0)', OPENED.transforms[1]!] }),
    ).toHaveLength(1);
  });
});

describe('flatPutBackFailures — the frames of a put-back (#599, C4)', () => {
  const read = { label: 'desktop', frames: 40, violations: 0, ended: true };

  it('passes a put-back in which no frame had a page flat while the book moved', () => {
    expect(flatPutBackFailures(read)).toEqual([]);
  });

  it('fails a frame with a page still flat while the book moved', () => {
    expect(flatPutBackFailures({ ...read, violations: 3 })).toHaveLength(1);
  });

  it('fails a window that never saw the book come home, which would pass without a frame to read', () => {
    expect(flatPutBackFailures({ ...read, ended: false })).toHaveLength(1);
  });
});
