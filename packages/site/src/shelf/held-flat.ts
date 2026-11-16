import type * as THREE from 'three';
import { flatPlacement, projectSlot, SKEW_LIMIT_PX, type PageBox } from './flat-page.ts';

/**
 * The open book's pages, moved out of the 3D layer once the book is at rest
 * (#599, ADR-0151).
 *
 * **Why they move.** iOS WebKit will not start a native overflow scroll on a
 * node inside the `CSS3DRenderer` layer, so a long Thoughts page does not
 * scroll under a finger there. Outside it, in a flat layer with no transform of
 * its own, the same node scrolls with momentum like any other. The book at rest
 * is square to the camera, so a page is a flat rectangle on screen and a 2D
 * matrix puts it exactly where the 3D layer drew it.
 *
 * **Why a slot.** `CSS3DRenderer` re-appends each object's own element to its
 * camera element on every render, so a page cannot be taken out of a
 * `CSS3DObject` directly. The object wraps an empty slot instead, the page
 * lives in the slot while the book moves, and moves between the slot and the
 * flat layer. The same nodes both ways: the links, the sticky back arrow and
 * every `textContent` rule carry over, and nothing is duplicated.
 */

/** One page, its slot, and the matrix last written to it. */
export interface FlatPage {
  readonly page: HTMLElement;
  readonly slot: HTMLElement;
  /** The slot's `CSS3DObject`, whose world matrix says where the page is. */
  readonly object: THREE.Object3D;
  /** The `transform` last written while the page is in the flat layer. */
  matrix: string | undefined;
}

export interface FlatBook {
  /** In reading order: the left page, then the right. */
  readonly pages: readonly [FlatPage, FlatPage];
  /** The page's laid-out size, the same for both. */
  readonly box: PageBox;
  /** Whether the pages are in the flat layer now. */
  flat: boolean;
  /**
   * Whether the book is open at rest, so the pages belong in the flat layer. A
   * book reaches rest a frame or more before it is square to the camera (a turned
   * book squares as it opens, and a cut under reduced motion lands its pose on the
   * next frame), so a refused move is retried each frame while this holds.
   */
  wanted: boolean;
  /** Whether the skew warning has been said for this book. */
  warned: boolean;
}

export interface Screen {
  readonly camera: THREE.Camera;
  /** The flat layer's size in CSS pixels: the 3D layer's, since they share a box. */
  readonly size: { readonly width: number; readonly height: number };
}

/**
 * The matrices for both pages, or `undefined` when either is not flat to the
 * camera: a page is never moved on a skewed matrix.
 */
function placements(book: FlatBook, screen: Screen): string[] | undefined {
  const out: string[] = [];
  for (const { object } of book.pages) {
    const placed = flatPlacement(
      projectSlot(object, screen.camera, screen.size, book.box),
      book.box,
    );
    if (placed.skew > SKEW_LIMIT_PX) {
      if (!book.warned) {
        book.warned = true;
        console.warn(
          `held page is ${placed.skew.toFixed(1)} px off a flat rectangle; it stays in the 3D layer`,
        );
      }
      return undefined;
    }
    out.push(placed.matrix);
  }
  return out;
}

/**
 * Moves both pages into `layer` and places them, in the same call. The caller
 * has run `updateMatrixWorld` on the book and the camera, so a book that
 * reaches rest outside the frame (reduced motion) shows no frame at the wrong
 * place. `false`, with the pages left in their slots, when the page is skewed.
 */
export function moveIn(layer: HTMLElement, book: FlatBook, screen: Screen): boolean {
  const matrices = placements(book, screen);
  if (matrices === undefined) return false;
  layer.append(...book.pages.map(({ page }) => page));
  book.pages.forEach((entry, index) => {
    entry.matrix = matrices[index];
    entry.page.style.transform = entry.matrix ?? '';
  });
  book.flat = true;
  return true;
}

/**
 * Each frame while flat: the matrix is written only when it differs from the
 * last one written, and a skewed page stays where it is.
 */
export function update(book: FlatBook, screen: Screen): void {
  if (!book.flat) return;
  const matrices = placements(book, screen);
  if (matrices === undefined) return;
  book.pages.forEach((entry, index) => {
    const next = matrices[index];
    if (next === undefined || next === entry.matrix) return;
    entry.matrix = next;
    entry.page.style.transform = next;
  });
}

/**
 * Takes both pages back into their slots, in the 3D layer, and clears each
 * page's own transform. Re-inserting a node resets its scroll position and
 * blurs it if it held focus, so the caller moves focus first and this sets the
 * scroll to the top. Safe on a book that is not flat.
 */
export function moveOut(book: FlatBook): void {
  book.wanted = false;
  if (!book.flat) return;
  for (const entry of book.pages) {
    entry.slot.append(entry.page);
    entry.page.style.transform = '';
    entry.page.scrollTop = 0;
    entry.matrix = undefined;
  }
  book.flat = false;
}
