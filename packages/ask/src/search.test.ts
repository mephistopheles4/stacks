import { describe, expect, it } from 'vitest';
import type { CatalogueBook, LibrarySource } from './library.ts';
import { namesTitle, searchLibrary, topRated, usableTerms } from './search.ts';

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

  it('ignores common words, and a query of only common words gets the fallback, not a match', async () => {
    // Only the books with Thoughts, the highest rated first (see the fallback tests below).
    expect(await ids('what did you read about the books')).toEqual(['ai', 'gods']);
    expect(await ids('recommend')).toEqual(['ai', 'gods']);
  });

  it('a query with a usable word and no match still finds nothing', async () => {
    expect(await ids('zymurgy')).toEqual([]);
    expect(await ids('what have you read about zymurgy?')).toEqual([]);
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

describe('"like" and "most" are ignored words (S6)', () => {
  const cat = [
    b('state', 'Seeing Like a State', { subjects: 'Political Science' }),
    b('most', 'The Most Human Human', { subjects: 'Computers' }),
    b('plain', 'Nexus', { subjects: 'History' }),
  ];
  const find = async (q: string): Promise<string[]> =>
    (
      await searchLibrary(cat, { catalogue: async () => cat, thoughts: async () => undefined }, q)
    ).map((h) => h.book.id);

  it('finds nothing for a question made only of loose words', async () => {
    expect(await find('what did you like most about the book?')).toEqual([]);
  });

  it('still finds a title that holds them, by the whole title or by its other words', async () => {
    expect(await find('Seeing Like a State')).toEqual(['state']);
    expect(await find('seeing state')).toEqual(['state']);
    expect(await find('The Most Human Human')).toEqual(['most']);
    expect(await find('human')).toEqual(['most']);
  });
});

describe('the search fallback: nothing usable in the query (S6)', () => {
  const rated = [
    b('low', 'Low One', { thoughts: true, rating: 2 }),
    b('none', 'No Thoughts', { thoughts: false, rating: 5 }),
    b('top', 'Top One', { thoughts: true, rating: 5 }),
    b('mid-a', 'Mid A', { thoughts: true, rating: 4 }),
    b('mid-b', 'Mid B', { thoughts: true, rating: 4 }),
    b('unrated', 'Unrated One', { thoughts: true }),
    b('x1', 'X One', { thoughts: true, rating: 3 }),
    b('x2', 'X Two', { thoughts: true, rating: 3 }),
  ];
  const notes = { catalogue: async () => rated, thoughts: async () => ['A note.'] };
  const run = (q: string, exclude?: ReadonlySet<string>) => searchLibrary(rated, notes, q, exclude);

  it('returns the highest-rated books with Thoughts, then shelf order, at most 5, each with its Thoughts', async () => {
    const hits = await run('what would you recommend?');
    expect(hits.map((h) => h.book.id)).toEqual(['top', 'mid-a', 'mid-b', 'x1', 'x2']);
    expect(hits.every((h) => h.thoughts?.[0] === 'A note.')).toBe(true);
  });

  it('never returns a book with no Thoughts, however high it is rated', async () => {
    expect((await run('recommend')).map((h) => h.book.id)).not.toContain('none');
  });

  it('leaves out books already returned, so a second fallback gets the next ones (T6)', async () => {
    const hits = await run('recommend', new Set(['top', 'mid-a', 'mid-b']));
    expect(hits.map((h) => h.book.id)).toEqual(['x1', 'x2', 'low', 'unrated']);
  });

  it('is only for a query with nothing usable: one usable word searches as before', async () => {
    expect((await run('recommend one')).map((h) => h.book.id)).toEqual([
      'low',
      'top',
      'unrated',
      'x1',
    ]);
  });

  it('finds nothing when no book has Thoughts', async () => {
    const bare = [b('a', 'A', { rating: 5 })];
    expect(
      await searchLibrary(
        bare,
        { catalogue: async () => bare, thoughts: async () => undefined },
        'recommend',
      ),
    ).toEqual([]);
  });
});

describe('usableTerms', () => {
  it('drops ignored words and repeats', () => {
    expect(usableTerms('What would you recommend?')).toEqual([]);
    expect(usableTerms('finance finance Money')).toEqual(['finance', 'money']);
  });
});

describe('topRated: what a miss offers (S6)', () => {
  const rated = [
    b('a', 'A', { thoughts: true, rating: 3 }),
    b('b', 'B', { thoughts: true, rating: 5 }),
    b('c', 'C', { thoughts: false, rating: 5 }),
    b('d', 'D', { thoughts: true, rating: 5 }),
    b('e', 'E', { thoughts: true, rating: 4 }),
    b('f', 'F', { thoughts: true, rating: 4 }),
    b('g', 'G', { thoughts: true, rating: 4 }),
  ];
  const src = { catalogue: async () => rated, thoughts: async () => ['Note.'] };

  it('is the 5 highest rated with Thoughts, shelf order breaking ties, and never one without Thoughts', async () => {
    expect((await topRated(rated, src)).map((h) => h.book.id)).toEqual(['b', 'd', 'e', 'f', 'g']);
  });

  it('leaves out what was already returned, and takes a smaller limit', async () => {
    expect((await topRated(rated, src, new Set(['b', 'd']))).map((h) => h.book.id)).toEqual([
      'e',
      'f',
      'g',
      'a',
    ]);
    expect((await topRated(rated, src, new Set(), 2)).map((h) => h.book.id)).toEqual(['b', 'd']);
  });

  it('gives each book its Thoughts', async () => {
    expect((await topRated(rated, src))[0]!.thoughts).toEqual(['Note.']);
  });
});

describe('"favourite" and "favorite" are one word to the search, and nothing else is (owner, 2026-11-05)', () => {
  const cat = [
    b('fav', 'The Orchestrator', { thoughts: true, rating: 5 }),
    b('other', 'Another Book', { thoughts: true, rating: 4 }),
    b('title', 'My Favourite Things', { rating: 3 }),
  ];
  const notes: Record<string, string[]> = {
    fav: ['This is probably my favorite book about AI so far.'],
    other: ['I read it on a train.'],
  };
  const src: LibrarySource = {
    catalogue: async () => cat,
    thoughts: async (book) => notes[book.id],
  };
  const find = async (q: string): Promise<string[]> =>
    (await searchLibrary(cat, src, q)).map((h) => h.book.id);

  it('a search for "favourite" finds a Thoughts that say "favorite", and the other way round', async () => {
    expect(await find('favourite')).toEqual(['title', 'fav']);
    expect(await find('favorite')).toEqual(['title', 'fav']);
  });

  it('finds a title spelled "Favourite" by either spelling', async () => {
    expect(await find("What's your favorite book?")).toContain('title');
    expect(await find("What's your favourite book?")).toContain('fav');
  });

  it('does nothing wider: no stemming, no other spellings', async () => {
    expect(await find('favourites')).toEqual([]);
    expect(await find('favorites')).toEqual([]);
    expect(await find('colour')).toEqual([]);
  });
});

describe('what the words say, and nothing more (S6)', () => {
  it('a finance search finds no book filed only under Business & Economics', async () => {
    const cat = [b('econ', 'Money Unlocked', { subjects: 'Business & Economics' })];
    const hits = await searchLibrary(
      cat,
      { catalogue: async () => cat, thoughts: async () => undefined },
      'finance',
    );
    expect(hits).toEqual([]);
  });
});
