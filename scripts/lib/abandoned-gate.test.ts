import { describe, expect, it } from 'vitest';
import {
  abandonedLayoutFailures,
  abandonedPickupFailures,
  withOverflowingAbandoned,
  type AbandonedLayoutRead,
  type AbandonedPickupRead,
  type LibraryRecord,
} from './abandoned-gate.ts';

describe('abandonedPickupFailures — a book picked up from the abandoned bookcase (#604, C11)', () => {
  const clean: AbandonedPickupRead = {
    viewport: '1440x900',
    drawn: 40,
    picked: true,
    arrivedClosed: true,
    turned: true,
    opened: true,
    pagesShown: true,
    closedAgain: true,
    wentBack: true,
    hrefUnchanged: true,
  };

  it('is clean for a book that picks up, turns, opens, closes and goes back', () => {
    expect(abandonedPickupFailures(clean)).toEqual([]);
  });

  it('is red with no read at all', () => {
    expect(abandonedPickupFailures(undefined)).toHaveLength(1);
  });

  it.each<[string, Partial<AbandonedPickupRead>, RegExp]>([
    ['no book on the bookcase', { drawn: 0 }, /no book stood on the abandoned bookcase/],
    ['a click that picked nothing up', { picked: false }, /did not pick it up/],
    ['a book that arrived open', { arrivedClosed: false }, /arrive closed/],
    ['a book that would not turn', { turned: false }, /turn the book/],
    ['a book that would not open', { opened: false }, /open control/],
    ['pages that never showed', { pagesShown: false }, /pages are not visible/],
    ['a book that would not close', { closedAgain: false }, /would not close/],
    ['a book that stayed in the hand', { wentBack: false }, /go back/],
    ['an address that moved', { hrefUnchanged: false }, /location\.href/],
  ])('fails on %s', (_name, patch, message) => {
    expect(abandonedPickupFailures({ ...clean, ...patch }).join(' / ')).toMatch(message);
  });

  it('stops at an empty bookcase rather than reading a shelf book as an abandoned one', () => {
    expect(abandonedPickupFailures({ ...clean, drawn: 0, picked: false })).toHaveLength(1);
  });

  it('names the viewport it failed at', () => {
    expect(
      abandonedPickupFailures({ ...clean, viewport: '375x812', picked: false }).join(),
    ).toContain('375x812');
  });
});

describe('abandonedLayoutFailures — the most recent, spine out, off the main bookcase (#604, C10)', () => {
  const byRecency = Array.from(
    { length: 100 },
    (_, i) => `parked-${String(99 - i).padStart(3, '0')}`,
  );
  const clean: AbandonedLayoutRead = {
    total: 100,
    drawn: byRecency.slice(0, 64),
    left: 36,
    rows: 2,
    drawnFaceOut: 0,
    newest: 'parked-099',
    byRecency,
    roomShelf: 40,
    expectedRoomShelf: 40,
    plainShelf: 140,
    expectedPlainShelf: 140,
  };

  it('is clean for the newest books, spine out, with the rest off and `?shelf` holding them all', () => {
    expect(abandonedLayoutFailures(clean)).toEqual([]);
  });

  it('is red with no read at all', () => {
    expect(abandonedLayoutFailures(undefined)).toHaveLength(1);
  });

  it.each<[string, Partial<AbandonedLayoutRead>, RegExp]>([
    ['a fixture that does not overflow', { left: 0, drawn: byRecency }, /does not overflow/],
    ['a library with no abandoned books', { total: 0, left: 0, drawn: [] }, /does not overflow/],
    ['a third row', { rows: 3 }, /not two/],
    ['books that vanish', { left: 30 }, /do not add up/],
    [
      'an older book in a newer one’s place',
      { drawn: [...byRecency.slice(0, 63), 'parked-000'] },
      /most recently abandoned/,
    ],
    [
      'the face_out book missing',
      { drawn: byRecency.slice(1, 65), newest: 'parked-099' },
      /marked face_out/,
    ],
    ['a book standing cover-forward', { drawnFaceOut: 1 }, /cover-forward/],
    [
      'abandoned books left on the room’s main bookcase',
      { roomShelf: 140 },
      /room's main bookcase/,
    ],
    ['`?shelf` missing the abandoned books', { plainShelf: 40 }, /`\?shelf` shows/],
  ])('fails on %s', (_name, patch, message) => {
    expect(abandonedLayoutFailures({ ...clean, ...patch }).join(' / ')).toMatch(message);
  });
});

describe('withOverflowingAbandoned', () => {
  const template = {
    id: 'real',
    title: 'Real',
    status: 'read',
    cover: 'covers/a.jpg',
    coverAspect: 0.7,
    thoughts: true,
    heldCover: 'held-covers/a.jpg',
    shelfOrder: 3,
  };
  const library: { version: number; books: LibraryRecord[] } = { version: 1, books: [template] };

  it('adds the books abandoned, newest last in id and first by recency, the newest marked face_out', () => {
    const { library: out, newest, byRecency } = withOverflowingAbandoned(library, template, 30);
    const added = out.books.slice(1);

    expect(out.books).toHaveLength(31);
    expect(added.every((book) => book.status === 'abandoned')).toBe(true);
    expect(newest).toBe('parked-029');
    expect(byRecency[0]).toBe(newest);
    expect(byRecency).toHaveLength(30);
    expect(added.filter((book) => book.faceOut === true).map((book) => book.id)).toEqual([newest]);
  });

  it('gives dates that rise with the number, so the order the gate expects is the dates’', () => {
    const { library: out, byRecency } = withOverflowingAbandoned(library, template, 30);
    const finished = new Map(out.books.map((book) => [book.id, String(book.finished)]));
    for (let i = 1; i < byRecency.length; i += 1) {
      expect(finished.get(byRecency[i - 1]!)! > finished.get(byRecency[i]!)!).toBe(true);
    }
  });

  it('keeps the cover and carries no Thoughts, held copy or pin, so a pickup asks for nothing missing', () => {
    const { library: out } = withOverflowingAbandoned(library, template, 3);
    const copy = out.books[1]!;
    expect(copy.cover).toBe('covers/a.jpg');
    expect(copy).not.toHaveProperty('thoughts');
    expect(copy).not.toHaveProperty('heldCover');
    expect(copy).not.toHaveProperty('shelfOrder');
  });

  it('leaves the library it was given as it was', () => {
    withOverflowingAbandoned(library, template, 3);
    expect(library.books).toHaveLength(1);
  });
});
