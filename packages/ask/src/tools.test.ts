import { describe, expect, it } from 'vitest';
import { createLibrarySource, type CatalogueBook, type LibrarySource } from './library.ts';
import { estimateTokens } from './prompt.ts';
import {
  BAD_ARGUMENTS,
  LIST_INSTRUCTION,
  MISS,
  MISS_OTHER,
  NO_MATCH,
  NO_OTHER_MATCH,
  NO_ROOM,
  UNKNOWN_TOOL,
  runTool,
  showing,
  type ToolSession,
} from './tools.ts';

const b = (id: string, title: string, extra: Partial<CatalogueBook> = {}): CatalogueBook => ({
  id,
  title,
  status: 'read',
  thoughts: false,
  ...extra,
});
const NL = String.fromCharCode(10);

const CAT = [
  b('plain', 'Money Unlocked', { rating: 3, subjects: 'Business' }),
  b('top', 'Wealth Of Notes', { rating: 5, thoughts: true, subjects: 'Business' }),
  b('mid', 'Savings Logic', { rating: 4, thoughts: true, subjects: 'Business' }),
  b('none', 'Unrated Thing', { subjects: 'Business' }),
];
const NOTES: Record<string, string[]> = {
  top: ['I thought it was about patience.'],
  mid: ['A plain book about habits.'],
};
const source = (notes: Record<string, string[]> = NOTES): LibrarySource => ({
  catalogue: async () => CAT,
  thoughts: async (book) => notes[book.id],
});
const session = (s = source(), catalogue = CAT): ToolSession => ({
  catalogue,
  source: s,
  returned: new Set(),
  matched: new Set(),
});
const search = (query: unknown, id = 'c1') => ({ id, name: 'search_library', arguments: query });
const ROOM = 100_000;

describe('list_books (T14, C33)', () => {
  it('lists every book, highest rated first, each marked either way', async () => {
    const out = await runTool({ id: 'l', name: 'list_books', arguments: {} }, session(), ROOM);
    expect(out.content.split(NL)).toEqual([
      '"Wealth Of Notes": rated 5 out of 5; has written Thoughts.',
      '"Savings Logic": rated 4 out of 5; has written Thoughts.',
      '"Money Unlocked": rated 3 out of 5; no Thoughts written.',
      '"Unrated Thing": not rated; no Thoughts written.',
      LIST_INSTRUCTION,
    ]);
  });

  it('carries no field the public build does not, shown with a canary (C33)', async () => {
    const raw = {
      books: [
        {
          id: 'a',
          title: 'Quiet',
          status: 'read',
          rating: 4,
          body: 'CANARY-BODY',
          secretField: 'CANARY-SECRET',
          author: 'CANARY-AUTHOR-STAYS',
        },
      ],
    };
    const fetchImpl = (async () =>
      Response.json(raw, { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const real = createLibrarySource('https://x.invalid', fetchImpl);
    const out = await runTool(
      { id: 'l', name: 'list_books', arguments: {} },
      { catalogue: await real.catalogue(), source: real, returned: new Set(), matched: new Set() },
      ROOM,
    );
    expect(out.content).toBe(
      ['"Quiet": rated 4 out of 5; no Thoughts written.', LIST_INSTRUCTION].join(NL),
    );
    expect(out.content).not.toContain('CANARY');
  });

  it('does not count as a search for T6: a listed title can still be searched with its Thoughts', async () => {
    const s = session();
    await runTool({ id: 'l', name: 'list_books', arguments: {} }, s, ROOM);
    expect(s.returned.size).toBe(0);
    const found = await runTool(search({ query: 'Wealth Of Notes' }), s, ROOM);
    expect(found.content).toContain(
      'Your Thoughts on "Wealth Of Notes": I thought it was about patience.',
    );
  });

  it('ends with an instruction to search a title before recommending, as tool output', async () => {
    const out = await runTool({ id: 'l', name: 'list_books', arguments: {} }, session(), ROOM);
    expect(LIST_INSTRUCTION).toBe('Search a title to read your Thoughts before recommending.');
    expect(out.content.split(NL).at(-1)).toBe(LIST_INSTRUCTION);
  });

  it('counts the instruction against the room, so a list that fits only without it is left out', async () => {
    const lines = (await runTool({ id: 'l', name: 'list_books', arguments: {} }, session(), ROOM))
      .content;
    const without = lines.slice(0, lines.lastIndexOf(NL));
    const fits = estimateTokens(without);
    expect(
      (await runTool({ id: 'l', name: 'list_books', arguments: {} }, session(), fits)).content,
    ).toBe(NO_ROOM);
  });

  it('is left out whole when there is no room for it (T8)', async () => {
    const out = await runTool({ id: 'l', name: 'list_books', arguments: {} }, session(), 5);
    expect(out.content).toBe(NO_ROOM);
  });
});

describe('search_library (T5, T6)', () => {
  it('returns marked catalogue lines, then the Thoughts of the books that have them', async () => {
    const out = await runTool(search({ query: 'business' }), session(), ROOM);
    const [lines, ...blocks] = out.content.split(NL + NL);
    const thoughts = blocks.join(NL + NL);
    expect(lines!.split(NL)).toEqual([
      '"Money Unlocked": read; subjects: Business; rated 3 out of 5; no Thoughts written.',
      '"Wealth Of Notes": read; subjects: Business; rated 5 out of 5; has written Thoughts.',
      '"Savings Logic": read; subjects: Business; rated 4 out of 5; has written Thoughts.',
      '"Unrated Thing": read; subjects: Business; no Thoughts written.',
    ]);
    expect(thoughts).toContain(
      'Your Thoughts on "Wealth Of Notes": I thought it was about patience.',
    );
    expect(thoughts).toContain('Your Thoughts on "Savings Logic": A plain book about habits.');
  });

  it('answers a search with no match by saying so and offering the top-rated books', async () => {
    const out = await runTool(search({ query: 'zymurgy' }), session(), ROOM);
    expect(out.content.startsWith(MISS)).toBe(true);
  });

  it('gives Thoughts for at most 3 books and at most 1,500 estimated tokens', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      b(`t${String(i)}`, `Topic ${String(i)}`, { thoughts: true, subjects: 'topic' }),
    );
    const long = { paragraphs: 'w '.repeat(1000) };
    const notes = Object.fromEntries(many.map((x) => [x.id, [long.paragraphs]]));
    const manySource: LibrarySource = {
      catalogue: async () => many,
      thoughts: async (book: CatalogueBook) => notes[book.id],
    };
    const s = session(manySource, many);
    const out = await runTool(search({ query: 'topic' }), s, ROOM);
    const blocks = out.content.split('Your Thoughts on').length - 1;
    expect(blocks).toBeLessThanOrEqual(3);
    const thoughts = out.content.slice(out.content.indexOf('Your Thoughts on'));
    expect(estimateTokens(thoughts)).toBeLessThanOrEqual(1_500 + 40);
  });

  it('returns no book a first search already returned, and says so when none are left (T6)', async () => {
    const s = session();
    const first = await runTool(search({ query: 'business' }), s, ROOM);
    expect(first.content).toContain('Money Unlocked');
    const second = await runTool(search({ query: 'business' }, 'c2'), s, ROOM);
    expect(second.content).toBe(NO_OTHER_MATCH);
  });

  it('a second search returns only the books the first did not', async () => {
    const s = session();
    await runTool(search({ query: 'Wealth Of Notes' }), s, ROOM);
    const second = await runTool(search({ query: 'business' }, 'c2'), s, ROOM);
    expect(second.content).not.toContain('Wealth Of Notes');
    expect(second.content).toContain('Money Unlocked');
  });
});

describe('search_library under the input budget (T8, C28)', () => {
  const room = (n: number): Promise<{ content: string }> =>
    runTool(search({ query: 'business' }), session(), n);

  it('drops Thoughts a whole book at a time, from the last, as room shrinks', async () => {
    const full = (await room(ROOM)).content;
    const lines = full.split(NL + NL)[0]!;
    const both = estimateTokens(lines) + 20;
    // Room for the lines and one book's Thoughts, not two.
    const one = (await room(both + 20)).content;
    expect(one).toContain('Your Thoughts on "Wealth Of Notes"');
    expect(one).not.toContain('Your Thoughts on "Savings Logic"');
    // Room for the lines only.
    const none = (await room(estimateTokens(lines) + 1)).content;
    expect(none).toBe(lines);
    expect(none).not.toContain('Your Thoughts');
  });

  it('drops the whole result when even the lines do not fit', async () => {
    expect((await room(10)).content).toBe(NO_ROOM);
  });

  it('does not mark books returned when the result was dropped', async () => {
    const s = session();
    await runTool(search({ query: 'business' }), s, 10);
    expect(s.returned.size).toBe(0);
  });
});

describe('what the model sends is untrusted (T10, C29, C32)', () => {
  const canary = 'CANARY-QUERY-9d2f';

  it.each([
    ['an unknown tool', { id: 'x', name: 'delete_everything', arguments: { query: canary } }],
    ['arguments that are not JSON', search(`{"query": "${canary}`)],
    ['a missing query', search({ other: canary })],
    ['a query that is not a string', search({ query: [canary] })],
    ['a blank query', search({ query: '  ' })],
    ['null arguments', search(null)],
    ['no arguments', search(undefined)],
  ])('answers %s with guidance and nothing it sent', async (name, call) => {
    const out = await runTool(call, session(), ROOM);
    expect(out.error).toBe(true);
    expect(out.content).toBe(name === 'an unknown tool' ? UNKNOWN_TOOL : BAD_ARGUMENTS);
    expect(JSON.stringify(out)).not.toContain(canary);
    expect(JSON.stringify(out)).not.toContain('delete_everything');
  });

  it('names the right input in each message', () => {
    expect(BAD_ARGUMENTS).toContain('{"query": "a title or a few key words"}');
    expect(BAD_ARGUMENTS).toContain('list_books');
    expect(UNKNOWN_TOOL).toContain('search_library');
    expect(UNKNOWN_TOOL).toContain('list_books');
  });

  it('a good call is not an error', async () => {
    const out = await runTool(search({ query: 'business' }), session(), ROOM);
    expect(out.error).toBeUndefined();
  });

  it('reads arguments given as a JSON string or as an object', async () => {
    const a = await runTool(search('{"query":"Wealth Of Notes"}'), session(), ROOM);
    const o = await runTool(search({ query: 'Wealth Of Notes' }), session(), ROOM);
    expect(a.content).toBe(o.content);
  });

  it('cuts a query to 200 characters on one line, and sends back only the cleaned query', async () => {
    const out = await runTool(
      search({ query: 'money' + NL + '"' + 'x'.repeat(400) }),
      session(),
      ROOM,
    );
    const sent = JSON.parse(out.wire.function.arguments) as { query: string };
    expect(sent.query).toHaveLength(200);
    expect(sent.query).not.toContain(NL);
    expect(sent.query).not.toContain('"');
    expect(out.wire).toMatchObject({
      id: 'c1',
      type: 'function',
      function: { name: 'search_library' },
    });
  });
});

describe('results that guide the model (T5, T10)', () => {
  it('an empty result with no top-rated book to offer says to try other words or call list_books', async () => {
    const bare = [b('x', 'Plain', { rating: 5 })];
    const s: ToolSession = {
      catalogue: bare,
      source: { catalogue: async () => bare, thoughts: async () => undefined },
      returned: new Set(),
      matched: new Set(),
    };
    const out = await runTool(search({ query: 'zymurgy' }), s, ROOM);
    expect(out.content).toBe('No books matched. Try other words, or call list_books.');
    expect(NO_MATCH).toBe('No books matched. Try other words, or call list_books.');
  });

  it('a second search that finds only books already returned says so, with the same advice', async () => {
    const s = session();
    await runTool(search({ query: 'business' }), s, ROOM);
    const again = await runTool(search({ query: 'business' }, 'c2'), s, ROOM);
    expect(again.content).toBe('No other books matched. Try other words, or call list_books.');
    expect(NO_OTHER_MATCH).toBe(again.content);
  });

  it('a result cut off at 6 says how many it shows of how many matched', async () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      b(`m${String(i)}`, `Money ${String(i)}`, { subjects: 'Business' }),
    );
    const s: ToolSession = {
      catalogue: many,
      source: { catalogue: async () => many, thoughts: async () => undefined },
      returned: new Set(),
      matched: new Set(),
    };
    const out = await runTool(search({ query: 'money' }), s, ROOM);
    const lines = out.content.split(NL);
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe(
      'Showing 6 of 14 matches. Search with more specific words to narrow this down.',
    );
    expect(showing(6, 14)).toBe(lines[6]);
    // Only the 6 shown count as returned, so the next search can reach the rest.
    expect(s.returned.size).toBe(6);
  });

  it('says nothing about a cut when every match is shown', async () => {
    const out = await runTool(search({ query: 'business' }), session(), ROOM);
    expect(out.content).not.toContain('Showing');
  });
});

describe('a query with nothing to search for gets the top-rated books as a normal result (S6)', () => {
  it('returns marked lines and Thoughts for up to 3, like any search', async () => {
    const out = await runTool(search({ query: 'what would you recommend?' }), session(), ROOM);
    const [lines, ...blocks] = out.content.split(NL + NL);
    expect(lines!.split(NL)[0]).toBe(
      '"Wealth Of Notes": read; subjects: Business; rated 5 out of 5; has written Thoughts.',
    );
    expect(lines).not.toContain('Money Unlocked');
    expect(blocks.join(NL)).toContain('Your Thoughts on "Wealth Of Notes"');
  });

  it('is capped at 5 books like a miss, with no truncation note', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      b(`t${String(i)}`, `Topic ${String(i)}`, { thoughts: true, rating: 4 }),
    );
    const s: ToolSession = {
      catalogue: many,
      source: { catalogue: async () => many, thoughts: async () => ['A note.'] },
      returned: new Set(),
      matched: new Set(),
    };
    const out = await runTool(search({ query: 'recommend' }), s, ROOM);
    const lines = out.content.split(NL + NL)[0]!.split(NL);
    expect(lines).toHaveLength(5);
    expect(out.content).not.toContain('Showing');
  });
});

describe('a search with a usable word and no match offers the top-rated books (S6, owner 2026-11-05)', () => {
  it('says nothing matched and that these are not about it, then up to 5 top-rated books with Thoughts', async () => {
    const out = await runTool(search({ query: 'zymurgy' }), session(), ROOM);
    expect(MISS).toBe(
      'No books matched. These are not about that subject, but they are my top-rated books. Try other words, or say nothing matched and offer these.',
    );
    const [head, ...rest] = out.content.split(NL + NL);
    const lines = head!.split(NL);
    expect(lines[0]).toBe(MISS);
    // Only the books with Thoughts, highest rated first: Wealth Of Notes, then Savings Logic.
    expect(lines.slice(1)).toEqual([
      '"Wealth Of Notes": read; subjects: Business; rated 5 out of 5; has written Thoughts.',
      '"Savings Logic": read; subjects: Business; rated 4 out of 5; has written Thoughts.',
    ]);
    expect(rest.join(NL)).toContain('Your Thoughts on "Wealth Of Notes"');
    expect(out.content).not.toContain('Money Unlocked');
  });

  it('a book already returned is left out, and the message says "other" (T6)', async () => {
    const s = session();
    await runTool(search({ query: 'Wealth Of Notes' }), s, ROOM);
    const out = await runTool(search({ query: 'zymurgy' }, 'c2'), s, ROOM);
    expect(out.content.startsWith(MISS_OTHER)).toBe(true);
    expect(MISS_OTHER.startsWith('No other books matched.')).toBe(true);
    expect(out.content).not.toContain('"Wealth Of Notes"');
    expect(out.content).toContain('"Savings Logic"');
  });

  it('is not a miss when something matched', async () => {
    expect((await runTool(search({ query: 'business' }), session(), ROOM)).content).not.toContain(
      MISS,
    );
  });

  it('is the old plain message when no book with Thoughts exists to offer', async () => {
    const bare = [b('x', 'Plain')];
    const s: ToolSession = {
      catalogue: bare,
      source: { catalogue: async () => bare, thoughts: async () => undefined },
      returned: new Set(),
      matched: new Set(),
    };
    expect((await runTool(search({ query: 'zymurgy' }), s, ROOM)).content).toBe(NO_MATCH);
  });

  it('counts the offered books against the room, and a result that cannot fit is left out', async () => {
    expect((await runTool(search({ query: 'zymurgy' }), session(), 5)).content).toBe(NO_ROOM);
  });
});
