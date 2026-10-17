/**
 * The subset re-capture `scripts/capture-lookup-recall.ts --only` runs on.
 *
 * Every fetch here is a stub, so nothing reaches a provider (G21).
 *
 * **Not a gate and it takes no `docs/gates.md` row** — an ordinary unit test,
 * beside the code it covers.
 */

import { describe, expect, it } from 'vitest';
import { spliceCapture } from './recall-splice.ts';

const OL_OLD = 'https://openlibrary.org/search.json?q=a&fields=old';
const OL_NEW = 'https://openlibrary.org/search.json?q=a&fields=new';
const GOOGLE = 'https://www.googleapis.com/books/v1/volumes?q=a';

describe('spliceCapture', () => {
  it('fetches only the selected URLs and replays the rest from the committed corpus', async () => {
    const fetched: string[] = [];
    const corpus = await spliceCapture({
      committed: { [OL_OLD]: { numFound: 0 }, [GOOGLE]: { items: ['committed'] } },
      selected: (url) => url.startsWith('https://openlibrary.org/'),
      live: async (url) => {
        fetched.push(url);
        return { numFound: 0, fresh: true };
      },
      run: async (get) => {
        await get(OL_NEW);
        await get(GOOGLE);
      },
    });
    expect(fetched).toEqual([OL_NEW]);
    expect(corpus).toEqual({
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
