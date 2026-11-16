import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LibraryBook } from '@stacks/core';
import { wishlistBooks, type ShelfBook } from './books.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';
import type { Slot } from './room-data.ts';
import { dealWishlist, layWishlist, stackSlots, STACK_CAP } from './room-wishlist.ts';

const book = (id: string, thickness: number): ShelfBook =>
  ({ book: { id }, thickness, height: 0.9, coverWidth: 0.6 }) as unknown as ShelfBook;

const slot = (position: [number, number, number], rotationY: number): Slot => ({
  position,
  rotationY,
  extras: {},
});

const slots = {
  slot_bookcase: slot([0, 0, 0], 0),
  slot_wishlist_1: slot([-1.9, 0.83, 1.7], 2.9),
  slot_wishlist_0: slot([-2.9, 0.84, 2.8], 1.7),
};

describe('stackSlots', () => {
  it('reads the wishlist slots alone, in their numbered order', () => {
    expect(stackSlots(slots).map((s) => s.position[0])).toEqual([-2.9, -1.9]);
  });

  it('reads nothing from a room with no stacks', () => {
    expect(stackSlots({ slot_bookcase: slot([0, 0, 0], 0) })).toEqual([]);
  });
});

describe('dealWishlist (S9)', () => {
  const two = stackSlots(slots);

  it('gives two books one stack each, each on its own stack top', () => {
    const laid = dealWishlist([book('a', 0.1), book('b', 0.12)], two);
    expect(laid.map((p) => p.slot)).toEqual([0, 1]);
    expect(laid.map((p) => p.base)).toEqual([0.84, 0.83]);
  });

  it('takes turns: a third book goes on the first stack, on top of the first book', () => {
    const laid = dealWishlist([book('a', 0.1), book('b', 0.12), book('c', 0.08)], two);
    expect(laid[2]?.slot).toBe(0);
    expect(laid[2]?.base).toBeCloseTo(0.84 + 0.1);
  });

  it('turns each book a little off the stack, never more than a few degrees', () => {
    const laid = dealWishlist([book('a', 0.1), book('b', 0.12), book('c', 0.08)], two);
    for (const p of laid) expect(Math.abs(p.turn)).toBeLessThan(0.09);
    expect(new Set(laid.map((p) => p.turn)).size).toBe(3);
  });

  it('lays nothing when the room has no stacks', () => {
    expect(dealWishlist([book('a', 0.1)], [])).toEqual([]);
  });

  it('C9: of eleven wishlist books four lie on each stack and three are not drawn', () => {
    const library = Array.from({ length: 11 }, (_, i): LibraryBook => {
      const id = `w${String(i).padStart(2, '0')}`;
      return { id, title: `Title ${String((i * 7) % 11)}`, status: 'wishlist', tags: [] };
    });
    const entries = wishlistBooks(library, DEFAULT_SETTINGS.books);
    const laid = dealWishlist(entries, two);

    expect(STACK_CAP).toBe(4);
    expect(laid).toHaveLength(8);
    expect(laid.filter((p) => p.slot === 0)).toHaveLength(4);
    expect(laid.filter((p) => p.slot === 1)).toHaveLength(4);

    // The three not drawn are the last three in title order, and none is drawn twice.
    const drawn = laid.map((p) => p.entry.book.id);
    expect(new Set(drawn).size).toBe(8);
    expect(drawn).toEqual(entries.slice(0, 8).map((e) => e.book.id));
  });

  it('C9: the stacks are the same on every load, whatever order the library comes in', () => {
    const library = Array.from({ length: 11 }, (_, i): LibraryBook => {
      const id = `w${String(i).padStart(2, '0')}`;
      return { id, title: `Title ${String((i * 7) % 11)}`, status: 'wishlist', tags: [] };
    });
    const deal = (books: readonly LibraryBook[]) =>
      dealWishlist(wishlistBooks(books, DEFAULT_SETTINGS.books), two).map((p) => [
        p.entry.book.id,
        p.slot,
        p.base,
        p.turn,
      ]);

    expect(deal([...library].reverse())).toEqual(deal(library));
    expect(deal(library)).toEqual(deal(library));
  });

  it('draws no more than the cap on a stack, however many slots the room has', () => {
    const many = stackSlots({
      slot_wishlist_0: slot([0, 1, 0], 0),
      slot_wishlist_1: slot([1, 1, 0], 0),
      slot_wishlist_2: slot([2, 1, 0], 0),
    });
    const laid = dealWishlist(
      Array.from({ length: 30 }, (_, i) => book(`b${String(i)}`, 0.1)),
      many,
    );
    expect(laid).toHaveLength(3 * STACK_CAP);
  });
});

describe('layWishlist', () => {
  const stand = (entry: ShelfBook): THREE.Group => {
    // As `buildBook` makes one: standing, its cover at +x and its height along y.
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(entry.thickness, entry.height, entry.coverWidth)),
    );
    return group;
  };

  it('returns each book as a group of its own, lying flat on its stack with its underside on it', () => {
    const entries = [book('a', 0.1), book('b', 0.12), book('c', 0.08)];
    const laid = layWishlist(slots, entries, stand);

    expect(laid.map((l) => l.entry.book.id)).toEqual(['a', 'b', 'c']);
    for (const { group, entry } of laid) {
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      // Lying, so its thin side is up: the box is as tall as the book is thick.
      expect(box.max.y - box.min.y).toBeCloseTo(entry.thickness, 5);
      expect(group.parent).toBeNull();
    }
    // The first book's underside is on its stack top, and the third's on the first.
    const under = (i: number): number => {
      const box = new THREE.Box3().setFromObject(laid[i]!.group);
      return box.min.y;
    };
    expect(under(0)).toBeCloseTo(0.84, 5);
    expect(under(1)).toBeCloseTo(0.83, 5);
    expect(under(2)).toBeCloseTo(0.84 + 0.1, 5);
  });

  it('lays each book over its own slot, turned the way the slot faces, cover up', () => {
    const laid = layWishlist(slots, [book('a', 0.1), book('b', 0.12)], stand);
    const sizeOf = (i: number): { box: THREE.Box3; size: THREE.Vector3 } => {
      const box = new THREE.Box3().setFromObject(laid[i]!.group);
      return { box, size: box.getSize(new THREE.Vector3()) };
    };

    // Dealt in turn, so the first book is on the first slot and the second on the other.
    for (const [i, slotName] of [
      [0, 'slot_wishlist_0'],
      [1, 'slot_wishlist_1'],
    ] as const) {
      const { box } = sizeOf(i);
      const centre = box.getCenter(new THREE.Vector3());
      expect(centre.x).toBeCloseTo(slots[slotName].position[0], 5);
      expect(centre.z).toBeCloseTo(slots[slotName].position[2], 5);
      // The cover is the book's +x, and it lies facing up.
      const cover = new THREE.Vector3(1, 0, 0).applyQuaternion(laid[i]!.group.quaternion);
      expect(cover.y).toBeCloseTo(1, 5);
    }
    // The long side follows each slot's facing: slot 0 is turned most of a quarter, slot 1 most of a half.
    expect(sizeOf(0).size.z).toBeGreaterThan(sizeOf(0).size.x);
    expect(sizeOf(1).size.x).toBeGreaterThan(sizeOf(1).size.z);
  });

  it('lays nothing in a room with no stacks', () => {
    expect(layWishlist({}, [book('a', 0.1)], stand)).toEqual([]);
  });
});
