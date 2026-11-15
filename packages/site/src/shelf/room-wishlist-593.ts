/**
 * PROTOTYPE for #593 — throwaway, never for `main`.
 *
 * The wishlist on the floor's book stacks. The baked room marks each stack's top with a
 * `slot_wishlist_<n>` node (`desk_dress.dress_floor_books`), and the wishlist books are laid on them
 * flat and cover up, taking turns: the first book on the first stack, the second on the second, the
 * third back on the first, on top of the book already there. A wishlist book is never on the shelf
 * (`books.ts`: you do not own it), and never in a public build, so a public room shows bare stacks.
 */
import * as THREE from 'three';
import type { ShelfBook } from './books.ts';
import { hashUnit } from './hash.ts';

export interface StackSlot {
  /** The top book's top face, at its middle. */
  readonly position: readonly [number, number, number];
  /** Turned so that +x runs along the top book's long side. */
  readonly rotationY: number;
}

export interface StackPlacement {
  readonly entry: ShelfBook;
  /** Which stack, an index into the slots. */
  readonly slot: number;
  /** The height this book's underside rests at. */
  readonly base: number;
  /** A small turn off the stack's own, radians, so the books do not line up like machined parts. */
  readonly turn: number;
}

const SLOT = /^slot_wishlist_(\d+)$/;
/** At most about 4.6 degrees either way. */
const MAX_TURN = 0.08;

/** The room's wishlist slots, in their numbered order; anything without a position is skipped. */
export function stackSlots(slots: Record<string, unknown>): StackSlot[] {
  return Object.entries(slots)
    .map(([name, value]) => ({ index: Number(SLOT.exec(name)?.[1] ?? NaN), value }))
    .filter(({ index }) => Number.isInteger(index))
    .sort((a, b) => a.index - b.index)
    .flatMap(({ value }) => {
      const { position, rotationY } = (value ?? {}) as Partial<StackSlot>;
      return Array.isArray(position) && position.length === 3 && typeof rotationY === 'number'
        ? [{ position: position as StackSlot['position'], rotationY }]
        : [];
    });
}

/** Where each wishlist book lies: dealt round the stacks in turn, each on the last one laid there. */
export function onStacks(
  entries: readonly ShelfBook[],
  slots: readonly StackSlot[],
): StackPlacement[] {
  if (slots.length === 0) return [];
  const tops = slots.map((slot) => slot.position[1]);
  return entries.map((entry, i) => {
    const slot = i % slots.length;
    const base = tops[slot] ?? 0;
    tops[slot] = base + entry.thickness;
    const turn = (hashUnit(`${entry.book.id}-stack-turn`) * 2 - 1) * MAX_TURN;
    return { entry, slot, base, turn };
  });
}

/**
 * Lays the wishlist on the stacks. `build` makes a book as the shelf makes one (`scene.ts`'s
 * `buildBook`): standing, its cover at +x and its height along y. Turned a quarter about z, it lies
 * cover up with its height along -x, which the slot's own +x runs along.
 */
export function layWishlist(
  scene: THREE.Scene,
  slots: Record<string, unknown>,
  entries: readonly ShelfBook[],
  build: (entry: ShelfBook) => THREE.Object3D,
): number {
  const stacks = stackSlots(slots);
  const laid = onStacks(entries, stacks);
  for (const { entry, slot, base, turn } of laid) {
    const at = stacks[slot];
    if (!at) continue;
    const book = build(entry);
    book.rotation.set(0, 0, Math.PI / 2);
    book.updateMatrixWorld(true);
    // centred over the slot, its underside on it, whatever the builder took as the book's origin
    const box = new THREE.Box3().setFromObject(book);
    book.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const holder = new THREE.Group();
    holder.name = `wishlist_${entry.book.id}`;
    holder.add(book);
    holder.position.set(at.position[0], base, at.position[2]);
    holder.rotation.y = at.rotationY + turn;
    scene.add(holder);
  }
  return laid.length;
}
