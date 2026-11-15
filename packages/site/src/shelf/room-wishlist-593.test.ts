import { describe, expect, it } from 'vitest';
import type { ShelfBook } from './books.ts';
import { onStacks, stackSlots } from './room-wishlist-593.ts';

const book = (id: string, thickness: number): ShelfBook =>
  ({ book: { id }, thickness, height: 0.9, coverWidth: 0.6 }) as unknown as ShelfBook;

const slots = {
  slot_bookcase: { position: [0, 0, 0], rotationY: 0 },
  slot_wishlist_1: { position: [-1.9, 0.83, 1.7], rotationY: 2.9 },
  slot_wishlist_0: { position: [-2.9, 0.84, 2.8], rotationY: 1.7 },
};

describe('stackSlots (#593 prototype)', () => {
  it('reads the wishlist slots alone, in their numbered order', () => {
    expect(stackSlots(slots).map((s) => s.position[0])).toEqual([-2.9, -1.9]);
  });

  it('skips a slot without a position rather than placing a book at nowhere', () => {
    expect(stackSlots({ slot_wishlist_0: { rotationY: 1 } })).toEqual([]);
  });
});

describe('onStacks (#593 prototype)', () => {
  const two = stackSlots(slots);

  it('gives two books one stack each, each on its own stack top', () => {
    const laid = onStacks([book('a', 0.1), book('b', 0.12)], two);
    expect(laid.map((p) => p.slot)).toEqual([0, 1]);
    expect(laid.map((p) => p.base)).toEqual([0.84, 0.83]);
  });

  it('takes turns: a third book goes on the first stack, on top of the first book', () => {
    const laid = onStacks([book('a', 0.1), book('b', 0.12), book('c', 0.08)], two);
    expect(laid[2]?.slot).toBe(0);
    expect(laid[2]?.base).toBeCloseTo(0.84 + 0.1);
  });

  it('turns each book a little off the stack, never more than a few degrees', () => {
    const laid = onStacks([book('a', 0.1), book('b', 0.12), book('c', 0.08)], two);
    for (const p of laid) expect(Math.abs(p.turn)).toBeLessThan(0.09);
    expect(new Set(laid.map((p) => p.turn)).size).toBe(3);
  });

  it('lays nothing when the room has no stacks', () => {
    expect(onStacks([book('a', 0.1)], [])).toEqual([]);
  });
});
