import { describe, expect, it } from 'vitest';
import { pageBlock } from './binding-case.ts';
import { openSpread, restingLeftPage, type SpreadEntry } from './open-spread.ts';

const HEAD_CAP = 0.15;
const DEPTH = 0.16;

const hardback: SpreadEntry = { binding: 'hardback', thickness: 0.035, height: 0.23 };
const paperback: SpreadEntry = { binding: 'paperback', thickness: 0.02, height: 0.19 };

describe.each([
  ['a hardback', hardback],
  ['a paperback', paperback],
])('the open spread of %s, at rest', (_name, entry) => {
  const spread = openSpread(entry, DEPTH, HEAD_CAP);
  const block = pageBlock(entry, DEPTH, HEAD_CAP);
  const left = restingLeftPage(spread);
  const right = spread.right;

  it('lays both pages in one plane, facing the reader', () => {
    expect(left.x).toBeCloseTo(right.x, 9);
    expect(left.facing).toBe(1);
    expect(right.facing).toBe(1);
    // In front of the block's face, so the sheet covers its striated side.
    expect(right.x).toBeGreaterThan(block.position[0] + block.scale[0] / 2);
  });

  it("makes the left page the page block's height and width", () => {
    expect(left.height).toBeCloseTo(block.scale[1], 9);
    expect(left.width).toBeCloseTo(block.scale[2], 9);
    expect(right.height).toBeCloseTo(block.scale[1], 9);
    expect(right.width).toBeCloseTo(block.scale[2], 9);
    expect(left.y).toBeCloseTo(right.y, 9);
  });

  it('meets the two inner edges at the gutter, with no gap', () => {
    const rightInner = right.z + right.width / 2;
    const leftInner = left.z - left.width / 2;

    expect(leftInner).toBeCloseTo(rightInner, 9);
    expect(spread.pivot.z).toBeCloseTo(rightInner, 9);
    // The right page is the block's face: its outer edge is the fore-edge.
    expect(right.z - right.width / 2).toBeCloseTo(block.position[2] - block.scale[2] / 2, 9);
  });

  it("hinges on the page block's face, so the board's inside lands in the page plane", () => {
    expect(spread.pivot.x).toBeCloseTo(block.position[0] + block.scale[0] / 2, 9);
  });
});

describe('the left page before it turns', () => {
  it('rides the board, face down on the block, and turns into place at 180°', () => {
    const spread = openSpread(hardback, DEPTH, HEAD_CAP);
    const local = spread.leftOnBoard;

    // Facing the block while the book is closed.
    expect(local.facing).toBe(-1);
    // Turning 180° about the pivot's vertical axis is (dx, dz) → (−dx, −dz).
    expect(spread.pivot.x - local.x).toBeCloseTo(restingLeftPage(spread).x - spread.pivot.x, 9);
  });
});
