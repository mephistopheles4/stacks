/**
 * G12 — `shelf_order` semantics.
 *
 * CLAUDE.md documents two rules that hold individually and collide in practice:
 *
 *   "Books carrying one come before every book without one, so a few favourites
 *    can be pinned without numbering the whole shelf."
 *   "Unset means the default order: reading first, then newest finished."
 *
 * `stacks order --renumber` writes a number onto *every* shelved book. After one
 * run there are no unnumbered books left, so the second rule describes a state
 * the vault can no longer be in — and the next book you start reading, which has
 * no number, sorts behind all of them rather than to the front.
 *
 * These are characterization tests: they pin what the code does today so that
 * changing it is a visible decision rather than an accident. The last one is
 * named for the collision rather than for a behaviour, because it is the part
 * that still needs a call from the owner. It asserts the current answer; if the
 * design changes, this file is the thing that should go red first.
 *
 * See docs/gates.md, row G12.
 */

import { describe, expect, it } from 'vitest';
import {
  compareShelfPosition,
  type Positionable,
} from '../packages/core/src/shelf-order.ts';

function book(over: Partial<Positionable> & { title: string }): Positionable {
  return { status: 'read', ...over };
}

function ordered(books: readonly Positionable[]): string[] {
  return [...books].sort(compareShelfPosition).map((entry) => entry.title);
}

describe('G12 — shelf_order, documented rules', () => {
  it('puts a book you are reading first when nothing is numbered', () => {
    expect(
      ordered([
        book({ title: 'finished recently', finished: '2026-07-01' }),
        book({ title: 'currently reading', status: 'reading' }),
        book({ title: 'finished long ago', finished: '2020-01-01' }),
      ]),
    ).toEqual(['currently reading', 'finished recently', 'finished long ago']);
  });

  it('lets a few pinned favourites lead an otherwise unnumbered shelf', () => {
    // The documented purpose of the key: pin three, leave twenty-eight alone.
    expect(
      ordered([
        book({ title: 'ordinary', finished: '2026-07-01' }),
        book({ title: 'favourite', shelfOrder: 10 }),
        book({ title: 'also ordinary', status: 'reading' }),
      ]),
    ).toEqual(['favourite', 'also ordinary', 'ordinary']);
  });

  it('orders numbered books by their number, lowest first', () => {
    expect(
      ordered([
        book({ title: 'third', shelfOrder: 30 }),
        book({ title: 'first', shelfOrder: 10 }),
        book({ title: 'second', shelfOrder: 20 }),
      ]),
    ).toEqual(['first', 'second', 'third']);
  });
});

describe('G12 — the --renumber collision (characterization)', () => {
  /**
   * What `stacks order --renumber` leaves behind: every shelved book numbered,
   * at `(index + 1) * step`. Reproduced here rather than driving the CLI,
   * because the ordering rule is what is under test, not the command.
   */
  function afterRenumber(titles: readonly string[], step = 10): Positionable[] {
    return titles.map((title, index) => book({ title, shelfOrder: (index + 1) * step }));
  }

  it('a newly added book sorts behind every renumbered one, even while reading', () => {
    // The surprising consequence, pinned. Someone who runs --renumber once and
    // then starts a new book finds it at the back of the shelf, and the
    // documented "reading first" rule cannot reach it — a numbered book beats
    // an unnumbered one before status is ever considered.
    const shelf = [
      ...afterRenumber(['old one', 'old two', 'old three']),
      book({ title: 'just started', status: 'reading' }),
    ];

    expect(ordered(shelf)).toEqual(['old one', 'old two', 'old three', 'just started']);
    expect(ordered(shelf).at(-1)).toBe('just started');
  });

  it('leaves no unnumbered book, so the documented default order is unreachable', () => {
    const shelf = afterRenumber(['a', 'b', 'c']);
    expect(shelf.every((entry) => entry.shelfOrder !== undefined)).toBe(true);
  });
});
