/**
 * PROTOTYPE for #593 — throwaway, never for `main`.
 *
 * The abandoned books' bookcase: the shelf's own, built a second time by `scene.ts` and stood where
 * the baked room's `slot_abandoned` says, against the right wall, and locked at two rows so it can
 * never grow into the room's layout. In the room the abandoned books stand on it rather than on the
 * shelf; outside it, on the shelf as ever (`SHELVED_STATUSES`).
 */
import type { LibraryBook } from '@stacks/core';
import * as THREE from 'three';
import { toRows, type ShelfRow } from './books.ts';
import type { BooksSettings } from './shelf-settings.ts';

/** Always two rows, whatever it holds: the clock and the encyclopedias are baked on its top. */
export const ABANDONED_ROWS = 2;

/**
 * The abandoned books in rows, as the shelf packs them, every one spine out (a `face_out` in the
 * note is not followed here: a book turned cover-forward eats a row's width), and never more than
 * `ABANDONED_ROWS` rows. `left` counts the books that did not fit and stay off it.
 */
export function abandonedShelf(
  books: readonly LibraryBook[],
  settings: BooksSettings,
): { rows: ShelfRow[]; left: number } {
  const abandoned = books
    .filter((book) => book.status === 'abandoned')
    .map((book) => ({ ...book, faceOut: false }));
  const rows = toRows(abandoned, settings).slice(0, ABANDONED_ROWS);
  const shelved = rows.reduce((n, row) => n + row.books.length, 0);
  return { rows, left: abandoned.length - shelved };
}

interface Slot {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

function slotOf(slots: Record<string, unknown>, name: string): Slot | undefined {
  const { position, rotationY } = (slots[name] ?? {}) as Partial<Slot>;
  if (!Array.isArray(position) || position.length !== 3 || typeof rotationY !== 'number')
    return undefined;
  return { position: position as Slot['position'], rotationY };
}

/** Stands `object` at the named slot, turned as the slot is; false, and untouched, when there is none. */
export function standAt(
  object: THREE.Object3D,
  slots: Record<string, unknown>,
  name: string,
): boolean {
  const slot = slotOf(slots, name);
  if (!slot) return false;
  object.position.set(...slot.position);
  object.rotation.set(0, slot.rotationY, 0);
  return true;
}
