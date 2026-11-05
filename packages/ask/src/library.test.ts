import { describe, expect, it, vi } from 'vitest';
import { DataError, createLibrarySource, toCatalogue } from './library.ts';
import { AI_DEADLINE_MS, DATA_TIMEOUT_MS } from './limits.ts';

const BOOKS = [
  {
    id: 'a-book',
    title: 'A Book',
    author: 'Ann',
    status: 'read',
    thoughts: true,
    rating: 5,
    finished: '2026-01-01',
    subjects: 'Business',
    body: 'CANARY-BODY',
    notePath: 'Library/secret.md',
  },
  { id: 'b-book', title: 'B Book', status: 'read', finished: '2025-01-01' },
];

function site(
  books: unknown = BOOKS,
  notes: Record<string, unknown> = { 'a-book': { paragraphs: ['I liked it.'] } },
) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith('/library.json')) return Response.json({ books });
    const id = /notes\/(.+)\.json$/.exec(url)?.[1] ?? '';
    if (id in notes) return Response.json(notes[id]);
    return new Response('<html>home</html>', { headers: { 'content-type': 'text/html' } });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('toCatalogue (C3)', () => {
  it('keeps public fields only and drops anything else a record carries', () => {
    const [book] = toCatalogue({ books: BOOKS });
    expect(JSON.stringify(book)).not.toContain('CANARY-BODY');
    expect(JSON.stringify(book)).not.toContain('secret.md');
    expect(book).toMatchObject({ id: 'a-book', thoughts: true, rating: 5 });
  });

  it('drops a book with an unusable id or title and a rating out of range', () => {
    const out = toCatalogue({
      books: [
        { id: '../x', title: 'T' },
        { id: 'ok', title: '' },
        { id: 'fine', title: 'F', rating: 9 },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('rating');
  });

  it('throws on a library with no books', () => {
    expect(() => toCatalogue({})).toThrow(DataError);
  });
});

describe('a local build is refused (invariant 2)', () => {
  it.each([
    ['a private flag', { id: 'x', title: 'X', private: false }],
    ['a source path', { id: 'x', title: 'X', sourcePath: 'Library/X.md' }],
    ['a wishlist book', { id: 'x', title: 'X', status: 'wishlist' }],
  ])('throws on %s', (_n, book) => {
    expect(() => toCatalogue({ books: [book] })).toThrow(DataError);
  });
});

describe('createLibrarySource', () => {
  it('fetches the catalogue once inside five minutes', async () => {
    const { impl, calls } = site();
    let t = 0;
    const source = createLibrarySource('https://s.example', impl, () => t);
    await source.catalogue();
    t = 4 * 60_000;
    await source.catalogue();
    expect(calls).toHaveLength(1);
  });

  it('reads a note by the id in library.json and returns its paragraphs', async () => {
    const { impl, calls } = site();
    const source = createLibrarySource('https://s.example', impl);
    const [a] = await source.catalogue();
    expect(await source.thoughts(a!)).toEqual(['I liked it.']);
    expect(calls).toContain('https://s.example/notes/a-book.json');
  });

  it('never fetches a note for a book the catalogue does not mark', async () => {
    const { impl, calls } = site();
    const source = createLibrarySource('https://s.example', impl);
    const cat = await source.catalogue();
    expect(await source.thoughts(cat[1]!)).toBeUndefined();
    expect(calls.filter((u) => u.includes('/notes/'))).toHaveLength(0);
  });

  it('treats the home page served with 200 as no note', async () => {
    const { impl } = site(BOOKS, {});
    const source = createLibrarySource('https://s.example', impl);
    const [a] = await source.catalogue();
    expect(await source.thoughts(a!)).toBeUndefined();
  });

  it('C14: past five minutes, a failed refresh serves nothing old', async () => {
    let t = 0;
    let down = false;
    const { impl } = site();
    const flaky = (async (url: string, init?: RequestInit) => {
      if (down) throw new Error('offline');
      return (impl as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    const source = createLibrarySource('https://s.example', flaky, () => t);
    const [a] = await source.catalogue();
    await source.thoughts(a!);
    t = 5 * 60_000 + 1;
    down = true;
    await expect(source.catalogue()).rejects.toThrow(DataError);
    await expect(source.thoughts(a!)).rejects.toThrow(DataError);
  });

  it('C14: a note is not renewed by a catalogue refresh, and a withdrawn Thoughts section leaves', async () => {
    let t = 0;
    let marked = true;
    const calls: string[] = [];
    const impl = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('/library.json')) {
        return Response.json({
          books: [{ id: 'a-book', title: 'A', ...(marked && { thoughts: true }) }],
        });
      }
      return Response.json({ paragraphs: ['v@' + String(t)] });
    }) as unknown as typeof fetch;
    const source = createLibrarySource('https://s.example', impl, () => t);
    const [a] = await source.catalogue();
    expect(await source.thoughts(a!)).toEqual(['v@0']);
    t = 4 * 60_000;
    expect(await source.thoughts(a!)).toEqual(['v@0']);
    t = 5 * 60_000 + 1;
    expect(await source.thoughts(a!)).toEqual(['v@' + String(t)]);
    t += 5 * 60_000 + 1;
    marked = false;
    expect(await source.thoughts(a!)).toBeUndefined();
  });

  it('removes a withdrawn book from the catalogue after expiry', async () => {
    let t = 0;
    let books: unknown = BOOKS;
    const impl = (async () => Response.json({ books })) as unknown as typeof fetch;
    const source = createLibrarySource('https://s.example', impl, () => t);
    expect(await source.catalogue()).toHaveLength(2);
    books = [BOOKS[1]];
    t = 5 * 60_000 + 1;
    expect(await source.catalogue()).toHaveLength(1);
  });

  it('rejects a non-JSON library even when the status is 200', async () => {
    const impl = (async () =>
      new Response('<html>', {
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;
    await expect(createLibrarySource('https://s.example', impl).catalogue()).rejects.toThrow(
      DataError,
    );
  });
});

describe("a read that never answers ends inside the question's deadline (behaviour E1)", () => {
  const hangs = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('aborted'));
      });
    })) as typeof fetch;

  it('passes an abort signal on both fetches', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const spy = (async (url: string, init?: RequestInit) => {
      seen.push(init?.signal);
      return url.endsWith('library.json')
        ? Response.json(
            { books: [{ id: 'a', title: 'A', thoughts: true }] },
            { headers: { 'content-type': 'application/json' } },
          )
        : Response.json({ paragraphs: ['x'] }, { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const source = createLibrarySource('https://x.invalid', spy);
    const [book] = await source.catalogue();
    await source.thoughts(book!);
    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it('a catalogue that never answers is a data failure when its time is up', async () => {
    const source = createLibrarySource('https://x.invalid', hangs, Date.now, 20);
    await expect(source.catalogue()).rejects.toBeInstanceOf(DataError);
  });

  it('a note that never answers is searched by its catalogue fields only, when its time is up', async () => {
    const mixed = ((input: string, init?: RequestInit) => {
      if (input.endsWith('library.json')) {
        return Promise.resolve(
          Response.json(
            { books: [{ id: 'a', title: 'A', thoughts: true }] },
            { headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return hangs(input, init);
    }) as unknown as typeof fetch;
    const source = createLibrarySource('https://x.invalid', mixed, Date.now, 20);
    const [book] = await source.catalogue();
    expect(await source.thoughts(book!)).toBeUndefined();
  });

  it('is 5 seconds by default, well inside the 30-second deadline', () => {
    expect(DATA_TIMEOUT_MS).toBe(5_000);
    expect(DATA_TIMEOUT_MS * 2).toBeLessThan(AI_DEADLINE_MS);
  });
});
