/**
 * The wishlist on the room's floor stacks (#603, spec S9, S11).
 *
 * The baked room marks each stack's top with a `slot_wishlist_<n>` empty (`desk_dress.dress_floor_books`),
 * and the wishlist books are laid on them flat and cover up, taking turns: the first book on the first
 * stack, the second on the second, the third back on the first, on the book already there. They are live
 * books made as the shelf makes one, so a visitor can pick one up; the stack bases under them are baked
 * and never are. A wishlist book is never on the main bookcase, and `?shelf` draws none (display only:
 * every one is still in `library.json`).
 *
 * Ported from the #593 prototype's `room-wishlist-593.ts`, and its look is kept: the deal, the small
 * turn off each stack's own, the cover-up pose. What it adds is the cap, and a book that is a group of
 * its own in the scene, because a pickup reads a book's home from its group and a holder between the
 * two would hide where the book lies.
 */
import * as THREE from 'three';
import type { ShelfBook } from './books.ts';
import { hashUnit } from './hash.ts';
import type { Slot } from './room-data.ts';

/** At most this many wishlist books lie on one stack; the rest are not drawn (S9.3). */
export const STACK_CAP = 4;

/** The baked piles the stack books lie on, a node of the committed room: decoration, never pickable. */
export const STACK_BASE_NODE = 'room_floor_books';

/** At most about 4.6 degrees either way. */
const MAX_TURN = 0.08;

const SLOT = /^slot_wishlist_(\d+)$/;

/** Where a stack's top is, and how it faces: the top book's top face at its middle. */
export interface StackSlot {
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

/** The room's wishlist slots, in their numbered order. */
export function stackSlots(slots: Readonly<Record<string, Slot>>): StackSlot[] {
  return Object.entries(slots)
    .map(([name, slot]) => ({ index: Number(SLOT.exec(name)?.[1] ?? Number.NaN), slot }))
    .filter(({ index }) => Number.isInteger(index))
    .sort((a, b) => a.index - b.index)
    .map(({ slot }) => ({ position: slot.position, rotationY: slot.rotationY }));
}

/**
 * Where each wishlist book lies: dealt round the stacks in turn, each on the last one laid there, and
 * no more than `STACK_CAP` on a stack. `entries` are in the order they are dealt (`wishlistBooks`
 * sorts them), so the same library gives the same stacks, and the books past the cap are the last.
 */
export function dealWishlist(
  entries: readonly ShelfBook[],
  slots: readonly StackSlot[],
): StackPlacement[] {
  if (slots.length === 0) return [];
  const tops = slots.map((slot) => slot.position[1]);
  return entries.slice(0, slots.length * STACK_CAP).map((entry, i) => {
    const slot = i % slots.length;
    const base = tops[slot] ?? 0;
    tops[slot] = base + entry.thickness;
    const turn = (hashUnit(`${entry.book.id}-stack-turn`) * 2 - 1) * MAX_TURN;
    return { entry, slot, base, turn };
  });
}

/**
 * Of the grid cells (column, row) where the nearest thing drawn is the baked base, the first one whose
 * eight neighbours are the base too, else the first of all: so a click aimed at it lands on the base
 * and not on its edge, where a book behind it could take the click. `hits` is in scan order.
 */
export function interiorCell(
  hits: readonly (readonly [number, number])[],
): readonly [number, number] | undefined {
  const key = (column: number, row: number): string => `${String(column)},${String(row)}`;
  const set = new Set(hits.map(([column, row]) => key(column, row)));
  const inside = hits.find(([column, row]) => {
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (!set.has(key(column + dc, row + dr))) return false;
      }
    }
    return true;
  });
  return inside ?? hits[0];
}

export interface LaidBook {
  readonly entry: ShelfBook;
  /** The book, a group of its own and not yet in any scene: the caller adds it. */
  readonly group: THREE.Group;
}

/**
 * Lays the wishlist on the stacks and hands the books back. `build` makes a book as the shelf makes one
 * (`scene.ts`'s `buildBook`): standing, its cover at +x and its height along y. Turned a quarter about z
 * it lies cover up with its height along -x, which the slot's own +x runs along.
 *
 * The turn, the place and the stack's own facing are put on the book's own group, so its position and
 * quaternion are the book's home, which is what a pickup lifts it from and puts it back to.
 */
export function layWishlist(
  slots: Readonly<Record<string, Slot>>,
  entries: readonly ShelfBook[],
  build: (entry: ShelfBook) => THREE.Group,
): LaidBook[] {
  const stacks = stackSlots(slots);
  const laid: LaidBook[] = [];
  for (const { entry, slot, base, turn } of dealWishlist(entries, stacks)) {
    const at = stacks[slot];
    if (at === undefined) continue;

    const group = build(entry);
    // The book's own lie first: centred over the origin with its underside on the floor of its own
    // frame, whatever the builder took as the book's origin.
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const offset = new THREE.Vector3(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    // Then the stack's facing and this book's small turn about the vertical, through the slot.
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      at.rotationY + turn,
    );
    group.position
      .copy(offset.applyQuaternion(yaw))
      .add(new THREE.Vector3(at.position[0], base, at.position[2]));
    group.quaternion.premultiply(yaw);
    group.name = `wishlist_${entry.book.id}`;
    laid.push({ entry, group });
  }
  return laid;
}
