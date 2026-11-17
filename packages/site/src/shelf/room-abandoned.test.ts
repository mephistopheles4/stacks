import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { toRows } from './books.ts';
import {
  ABANDONED_ROWS,
  abandonedShelf,
  compareRecency,
  mainShelfBooks,
} from './room-abandoned.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

const book = (id: string, over: Partial<LibraryBook> = {}): LibraryBook => ({
  id,
  title: id,
  status: 'abandoned',
  pages: 300,
  tags: [],
  ...over,
});

const shelf = (books: readonly LibraryBook[]) => abandonedShelf(books, DEFAULT_SETTINGS.books);
const ids = (books: readonly LibraryBook[]): string[] =>
  [...books].sort(compareRecency).map((b) => b.id);

/** More than two rows hold at any thickness: the thinnest book is 0.055 and a row is about 3.2. */
const OVERFLOW = 150;

/** A library of abandoned books whose dates run oldest to newest with the index. */
const dated = (
  count: number,
  over: (i: number) => Partial<LibraryBook> = () => ({}),
): LibraryBook[] =>
  Array.from({ length: count }, (_, i) =>
    book(`a${String(i).padStart(3, '0')}`, {
      started: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
      finished: `${String(2000 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      ...over(i),
    }),
  );

describe('mainShelfBooks (S12.1, S12.5)', () => {
  const library = [
    book('a'),
    book('r', { status: 'read' }),
    book('w', { status: 'wishlist' }),
    book('p', { status: 'reading' }),
  ];

  it('in a room the abandoned books leave the main bookcase and every other one stays', () => {
    expect(mainShelfBooks(library, true).map((b) => b.id)).toEqual(['r', 'w', 'p']);
  });

  it('outside a room the main bookcase keeps them: `?shelf`, and the plain shelf a failure ends on', () => {
    expect(mainShelfBooks(library, false)).toBe(library);
    const rows = toRows(mainShelfBooks(library, false), DEFAULT_SETTINGS.books);
    expect(rows.flatMap((row) => row.books.map((e) => e.book.id))).toContain('a');
  });
});

describe('compareRecency (S12.3)', () => {
  it('puts the latest finished first', () => {
    const books = [
      book('old', { finished: '2019-03-01' }),
      book('new', { finished: '2024-03-01' }),
      book('mid', { finished: '2021-03-01' }),
    ];
    expect(ids(books)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks a tie in finished by started, newest first', () => {
    const books = [
      book('early', { finished: '2024-01-01', started: '2023-01-01' }),
      book('late', { finished: '2024-01-01', started: '2023-11-01' }),
    ];
    expect(ids(books)).toEqual(['late', 'early']);
  });

  it('breaks a tie in both by title, then by id', () => {
    const same = { finished: '2024-01-01', started: '2023-01-01' };
    const books = [
      book('z-id', { ...same, title: 'beta' }),
      book('b-id', { ...same, title: 'Alpha' }),
      book('a-id', { ...same, title: 'alpha' }),
    ];
    // lower-cased first, then the raw title: 'Alpha' < 'alpha', and the id is the last word
    expect(ids(books)).toEqual(['b-id', 'a-id', 'z-id']);
  });

  it('puts a book with neither date last, and one with a date but no finish after every finished one', () => {
    const books = [
      book('none'),
      book('only-started', { started: '2025-05-01' }),
      book('finished', { finished: '2001-01-01' }),
    ];
    expect(ids(books)).toEqual(['finished', 'only-started', 'none']);
  });

  it('reads an empty date as no date', () => {
    expect(
      ids([book('blank', { finished: '' }), book('dated', { finished: '2001-01-01' })]),
    ).toEqual(['dated', 'blank']);
  });
});

describe('abandonedShelf (S12.2, S12.3)', () => {
  it('lays a few abandoned books in one row and leaves none off', () => {
    const out = shelf(dated(5));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.books).toHaveLength(5);
    expect(out.left).toBe(0);
  });

  it('is empty, with no rows, when nothing is abandoned', () => {
    expect(shelf([book('r', { status: 'read' })])).toEqual({ rows: [], left: 0 });
    expect(shelf([])).toEqual({ rows: [], left: 0 });
  });

  it('C10: of books that overflow two rows it keeps the most recent, and the rest are not drawn', () => {
    const library = dated(OVERFLOW);
    const out = shelf(library);
    const drawn = out.rows.flatMap((row) => row.books.map((e) => e.book.id));

    expect(out.rows.length).toBeLessThanOrEqual(ABANDONED_ROWS);
    expect(out.rows).toHaveLength(ABANDONED_ROWS);
    expect(out.left).toBeGreaterThan(0);
    expect(drawn.length + out.left).toBe(OVERFLOW);

    // The drawn are exactly the newest by recency: nothing older stands where a newer one does not.
    const newest = ids(library).slice(0, drawn.length);
    expect([...drawn].sort()).toEqual([...newest].sort());
  });

  it('C10: stops at the first book that does not fit, so no older book takes a newer one’s place', () => {
    const library = dated(OVERFLOW);
    const out = shelf(library);
    const drawn = new Set(out.rows.flatMap((row) => row.books.map((e) => e.book.id)));
    const order = ids(library);
    const firstOff = order.findIndex((id) => !drawn.has(id));
    expect(firstOff).toBeGreaterThan(0);
    for (const id of order.slice(firstOff)) expect(drawn.has(id)).toBe(false);
  });

  it('C10: every book is spine out, and a face_out book is no exception', () => {
    const library = dated(OVERFLOW, (i) => (i === OVERFLOW - 1 ? { faceOut: true } : {}));
    // The newest book carries the face_out.
    expect(ids(library)[0]).toBe(`a${String(OVERFLOW - 1).padStart(3, '0')}`);
    const out = shelf(library);
    const entries = out.rows.flatMap((row) => row.books);

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.faceOut).toBe(false);
    for (const entry of entries) expect(entry.footprint).toBe(entry.thickness);

    const marked = entries.find((entry) => entry.book.id === ids(library)[0]);
    expect(marked).toBeDefined();
    // The book handed back is the note's own, face_out and all: a pickup reads the real one.
    expect(marked?.book.faceOut).toBe(true);
  });

  it('C10: `?shelf` still shows every abandoned book, and honours face_out, on the main bookcase', () => {
    const library = dated(40, (i) => (i === 39 ? { faceOut: true } : {}));
    const rows = toRows(mainShelfBooks(library, false), DEFAULT_SETTINGS.books);
    const entries = rows.flatMap((row) => row.books);

    expect(entries).toHaveLength(40);
    expect(entries.find((entry) => entry.book.id === 'a039')?.faceOut).toBe(true);
  });

  it('keeps the same books on every load, whatever order the library comes in', () => {
    const library = dated(OVERFLOW);
    const drawn = (books: readonly LibraryBook[]): string[][] =>
      shelf(books).rows.map((row) => row.books.map((e) => e.book.id));
    expect(drawn([...library].reverse())).toEqual(drawn(library));
  });

  it('draws nothing but abandoned books: the rest of the library is not its business', () => {
    const library = [
      ...dated(10),
      book('r', { status: 'read' }),
      book('w', { status: 'wishlist' }),
    ];
    const drawn = shelf(library).rows.flatMap((row) => row.books.map((e) => e.book.id));
    expect(drawn).not.toContain('r');
    expect(drawn).not.toContain('w');
    expect(drawn).toHaveLength(10);
  });
});
