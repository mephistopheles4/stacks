/**
 * The fixture marker (room spec S13.2): a build is the fixture's only if every title is one the
 * generator could write and the generator's fixed book is in it.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURE_MARKER_ID, LONG_BOOK_TITLE } from './fixture-books.ts';
import { judgeFixtureLibrary } from './fixture-dist.ts';

const generated = { id: 'tidal-engine-abc123', title: 'Tidal Engine' };
const marker = { id: FIXTURE_MARKER_ID, title: LONG_BOOK_TITLE };

describe('FIXTURE_MARKER_ID', () => {
  it('is the long book’s id, in the build’s own shape', () => {
    expect(FIXTURE_MARKER_ID).toMatch(/^marginalia-for-a-long-winter-[a-z0-9]{1,6}$/);
  });
});

describe('judgeFixtureLibrary', () => {
  it('accepts a library of generated titles that carries the marker', () => {
    const judged = judgeFixtureLibrary({ books: [generated, marker] });
    expect(judged.ok).toBe(true);
  });

  it('refuses a library without the marker, even when every title is a fixture title', () => {
    const judged = judgeFixtureLibrary({ books: [generated, { ...marker, id: 'other-id' }] });
    expect(judged.ok).toBe(false);
    expect(judged.lines.join(' ')).toContain('marker');
  });

  it('refuses a library holding a title the generator could not have written, and never quotes it', () => {
    const judged = judgeFixtureLibrary({
      books: [marker, { id: 'x', title: 'A Real Private Reading List' }],
    });
    expect(judged.ok).toBe(false);
    expect(judged.lines.join(' ')).not.toContain('Private');
  });

  it('refuses an empty or malformed library', () => {
    for (const library of [undefined, null, {}, { books: [] }, { books: 'x' }]) {
      expect(judgeFixtureLibrary(library).ok, JSON.stringify(library)).toBe(false);
    }
  });

  it('refuses a marker id on a book with a foreign title', () => {
    const judged = judgeFixtureLibrary({
      books: [{ id: FIXTURE_MARKER_ID, title: 'Someone Else' }],
    });
    expect(judged.ok).toBe(false);
  });
});
