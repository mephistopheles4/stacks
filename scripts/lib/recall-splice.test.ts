/**
 * The subset re-capture `scripts/capture-lookup-recall.ts --only` runs on.
 *
 * Every fetch here is a stub, so nothing reaches a provider (G21).
 *
 * **Not a gate and it takes no `docs/gates.md` row** — an ordinary unit test,
 * beside the code it covers.
 */

import { describe, expect, it } from 'vitest';
import { parseOnly, selectByPrefix, spliceCapture } from './recall-splice.ts';

const OL_OLD = 'https://openlibrary.org/search.json?q=a&fields=old';
const OL_NEW = 'https://openlibrary.org/search.json?q=a&fields=new';
const GOOGLE = 'https://www.googleapis.com/books/v1/volumes?q=a';
const APPLE = 'https://itunes.apple.com/search?term=a';

describe('parseOnly and selectByPrefix', () => {
  it('takes every --only, matches at the start only, and selects everything with none', () => {
    const only = parseOnly(['node', 'x', '--only', 'https://openlibrary.org/', '--only', APPLE]);
    expect(only).toEqual(['https://openlibrary.org/', APPLE]);
    const selected = selectByPrefix(only);
    expect(selected(OL_NEW)).toBe(true);
    expect(selected(APPLE)).toBe(true);
    expect(selected(GOOGLE)).toBe(false);
    expect(selectByPrefix(['openlibrary.org'])(OL_NEW)).toBe(false);
    expect(selectByPrefix([])(GOOGLE)).toBe(true);
    expect(() => parseOnly(['--only=https://openlibrary.org/'])).toThrow('with a space');
    expect(() => parseOnly(['--only'])).toThrow('takes a URL prefix');
    expect(() => parseOnly(['--only', '--cache'])).toThrow('takes a URL prefix');
  });
});

describe('spliceCapture', () => {
  it('fetches only the selected URLs and replays the rest from the committed corpus', async () => {
    const fetched: string[] = [];
    const answers: unknown[] = [];
    const corpus = await spliceCapture({
      committed: {
        [OL_OLD]: { numFound: 0 },
        [GOOGLE]: { items: ['committed'] },
        [APPLE]: { results: [] },
      },
      selected: (url) => url.startsWith('https://openlibrary.org/'),
      live: async (url) => {
        fetched.push(url);
        return { numFound: 0, fresh: true };
      },
      run: async (get) => {
        answers.push(await get(APPLE));
        answers.push(await get(`${OL_NEW}&key=SECRET`));
        answers.push(await get(GOOGLE));
      },
    });
    // The keyed URL goes to the fetch; only the recording strips it.
    expect(fetched).toEqual([`${OL_NEW}&key=SECRET`]);
    // The lookups receive the committed answers, since their next URLs are built from them.
    expect(answers).toEqual([
      { results: [] },
      { numFound: 0, fresh: true },
      { items: ['committed'] },
    ]);
    expect(Object.keys(corpus)).toEqual([APPLE, OL_NEW, GOOGLE]);
    expect(corpus).toEqual({
      [APPLE]: { results: [] },
      [OL_NEW]: { numFound: 0, fresh: true },
      [GOOGLE]: { items: ['committed'] },
    });
  });

  it('drops a committed entry nothing asks for any more', async () => {
    const corpus = await spliceCapture({
      committed: { [OL_OLD]: { numFound: 0 }, [GOOGLE]: {} },
      selected: () => false,
      live: async () => ({}),
      run: async (get) => {
        await get(GOOGLE);
      },
    });
    expect(Object.keys(corpus)).toEqual([GOOGLE]);
  });

  it('records a refusal from a selected URL as null', async () => {
    const corpus = await spliceCapture({
      committed: {},
      selected: () => true,
      live: async () => undefined,
      run: async (get) => {
        await get(OL_NEW);
      },
    });
    expect(corpus).toEqual({ [OL_NEW]: null });
  });

  it('refuses an unselected URL the committed corpus does not hold, rather than going live', async () => {
    let calls = 0;
    await expect(
      spliceCapture({
        committed: {},
        selected: () => false,
        live: async () => {
          calls += 1;
          return {};
        },
        run: async (get) => {
          await get(GOOGLE);
        },
      }),
    ).rejects.toThrow(GOOGLE);
    expect(calls).toBe(0);
  });

  it('matches selection and replay on the URL with the API key stripped', async () => {
    const seen: string[] = [];
    const corpus = await spliceCapture({
      committed: { [GOOGLE]: { items: [] } },
      selected: (url) => {
        seen.push(url);
        return false;
      },
      live: async () => ({}),
      run: async (get) => {
        await get(`${GOOGLE}&key=SECRET`);
      },
    });
    expect(seen).toEqual([GOOGLE]);
    expect(corpus).toEqual({ [GOOGLE]: { items: [] } });
  });
});
