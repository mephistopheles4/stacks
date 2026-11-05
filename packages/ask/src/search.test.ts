import { describe, expect, it } from 'vitest';
import type { CatalogueBook, LibrarySource } from './library.ts';
import { namesTitle, searchLibrary } from './search.ts';

const b = (id: string, title: string, extra: Partial<CatalogueBook> = {}): CatalogueBook => ({
  id,
  title,
  status: 'read',
  thoughts: false,
  ...extra,
});

const CAT = [
  b('money', 'Money Unlocked', { subjects: 'Business & Economics', author: 'Jo Smith' }),
  b('spend', 'The Art Of Spending Money', { subjects: 'Self-Help' }),
  b('ai', 'Co-Intelligence: Living and Working with AI', {
    author: 'Ethan Mollick',
    subjects: 'Computers',
    thoughts: true,
  }),
  b('wave', 'The Coming Wave', { subjects: 'Computers; Technology' }),
  b('gods', 'We Are as Gods', { thoughts: true }),
];

const NOTES: Record<string, string[]> = {
  ai: ['A teacher and a machine, working side by side.'],
  gods: ['I thought about saving up for the future and what abundance means.'],
};

function source(notes: Record<string, string[] | 'fail'> = NOTES): LibrarySource {
  return {
    catalogue: async () => CAT,
    thoughts: async (book) => {
      const n = notes[book.id];
      if (n === 'fail') throw new Error('down');
      return n;
    },
  };
}
const ids = async (query: string, exclude?: ReadonlySet<string>, s = source()): Promise<string[]> =>
  (await searchLibrary(CAT, s, query, exclude)).map((h) => h.book.id);

describe('searchLibrary (T3, T4, C27)', () => {
  it('matches whole words, case-insensitively, in title, author and subjects', async () => {
    expect(await ids('MONEY')).toEqual(['money', 'spend']);
    expect(await ids('mollick')).toEqual(['ai']);
    expect(await ids('technology')).toEqual(['wave']);
  });

  it('does not match inside a word', async () => {
    expect(await ids('wav')).toEqual([]);
    expect(await ids('financ')).toEqual([]);
  });

  it('ignores common words and returns nothing for only common words', async () => {
    expect(await ids('what did you read about the books')).toEqual([]);
    expect(await ids('recommend')).toEqual([]);
  });

  it("reads the owner's Thoughts too, and returns them with the hit", async () => {
    const hits = await searchLibrary(CAT, source(), 'machine');
    expect(hits.map((h) => h.book.id)).toEqual(['ai']);
    expect(hits[0]!.thoughts).toEqual(NOTES.ai);
  });

  it('ranks a title, author or subject match above a Thoughts-only match', async () => {
    // "abundance" and "saving" are only in a note; "money" is in two titles.
    const mixed = await ids('money saving');
    expect(mixed.slice(0, 2)).toEqual(['money', 'spend']);
    expect(mixed).toContain('gods');
    expect(mixed.indexOf('gods')).toBeGreaterThan(1);
  });

  it('ranks a query that names a whole title first, whatever else matches', async () => {
    expect(await ids('money computers co-intelligence')).toEqual(['ai', 'money', 'spend', 'wave']);
    expect((await ids('Co-Intelligence'))[0]).toBe('ai');
  });

  it('then ranks by words found, then by shelf order', async () => {
    expect(await ids('money self-help')).toEqual(['spend', 'money']);
    expect(await ids('computers')).toEqual(['ai', 'wave']);
  });

  it('leaves out the books it is told have been returned (T6)', async () => {
    expect(await ids('money', new Set(['money']))).toEqual(['spend']);
  });

  it('returns at most 6 books', async () => {
    const many = Array.from({ length: 9 }, (_, i) => b(`m${String(i)}`, `Money ${String(i)}`));
    const hits = await searchLibrary(
      many,
      { catalogue: async () => many, thoughts: async () => undefined },
      'money',
    );
    expect(hits).toHaveLength(6);
  });

  it('searches a book by its catalogue fields only when its note cannot be read', async () => {
    const s = source({ ai: 'fail', gods: 'fail' });
    expect(await ids('machine', undefined, s)).toEqual([]);
    expect(await ids('mollick', undefined, s)).toEqual(['ai']);
    const hits = await searchLibrary(CAT, s, 'mollick');
    expect(hits[0]!.thoughts).toBeUndefined();
  });

  it('finds the same books in the same order each time (C27)', async () => {
    const first = await ids('money computers');
    expect(await ids('money computers')).toEqual(first);
  });
});

describe('namesTitle', () => {
  it('matches a whole title or the part before its colon, ignoring punctuation and case', () => {
    expect(
      namesTitle('Co-Intelligence: Living and Working with AI', 'about co intelligence?'),
    ).toBe(true);
    expect(namesTitle("Staff Engineer's Path", "STAFF ENGINEER'S PATH")).toBe(true);
    expect(namesTitle('Nexus', 'nexuses')).toBe(false);
  });

  it('does not take a short head as a name', () => {
    expect(namesTitle('Why: A Book', 'why')).toBe(false);
  });
});
