import { describe, expect, it } from 'vitest';

import { BOARD, bookCase, pageBlock, PAPER_COVER, SQUARE, type CaseEntry } from './binding-case.ts';

/**
 * A book's case, and the page block inside it. `buildBook` builds from these
 * and the cover shade throws its painted wedge from the block, so a change here
 * moves both — which is the point of there being one of them.
 */

const HEAD_CAP = 0.16;

const hardback: CaseEntry = { binding: 'hardback', thickness: 0.08, height: 0.9 };
const paperback: CaseEntry = { binding: 'paperback', thickness: 0.05, height: 0.8 };

describe('bookCase', () => {
  it('binds a hardback in board, with a square and a head cap', () => {
    const shape = bookCase(hardback, 0.52, HEAD_CAP);
    expect(shape.board).toBe(BOARD);
    expect(shape.square).toBe(SQUARE);
    expect(shape.cap).toBeCloseTo(HEAD_CAP * hardback.thickness, 12);
    expect(shape.frontDepth).toBe(shape.cap);
  });

  it('binds a paperback in card, flush, with nothing to roll', () => {
    const shape = bookCase(paperback, 0.52, HEAD_CAP);
    expect(shape.board).toBe(PAPER_COVER);
    expect(shape.square).toBe(0);
    expect(shape.cap).toBe(0);
    // No cap, so the covering at the joint is as deep as the card.
    expect(shape.frontDepth).toBe(PAPER_COVER);
  });

  it('caps each number against the dimension it eats, so a small book keeps its paper', () => {
    const thin = bookCase({ binding: 'hardback', thickness: 0.02, height: 0.2 }, 0.03, HEAD_CAP);
    expect(thin.board).toBeCloseTo(0.02 * 0.3, 12);
    expect(thin.square).toBeCloseTo(Math.min(0.2 * 0.05, (0.03 - thin.board) * 0.2), 12);
  });

  it('leaves a hardback with no cap its board at the joint', () => {
    expect(bookCase(hardback, 0.52, 0).frontDepth).toBe(BOARD);
  });
});

describe('pageBlock', () => {
  it.each([
    ['a hardback', hardback],
    ['a paperback', paperback],
  ])(
    'sits inside the case of %s, recessed at the side, head, foot, joint and fore-edge',
    (_, entry) => {
      const depth = 0.52;
      const { board, square, frontDepth } = bookCase(entry, depth, HEAD_CAP);
      const {
        scale: [sx, sy, sz],
        position: [px, py, pz],
      } = pageBlock(entry, depth, HEAD_CAP);

      // Centred across the thickness and the height, a board in from each side
      // and the square in from head and foot.
      expect(px).toBe(0);
      expect(py).toBe(0);
      expect(sx).toBeCloseTo(entry.thickness - 2 * board, 12);
      expect(sy).toBeCloseTo(entry.height - 2 * square, 12);

      // Front (the spine, +Z) a covering's depth in; back (the fore-edge) the
      // square in.
      expect(pz + sz / 2).toBeCloseTo(depth / 2 - frontDepth, 12);
      expect(pz - sz / 2).toBeCloseTo(-depth / 2 + square, 12);
    },
  );
});
