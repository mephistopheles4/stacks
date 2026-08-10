import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { enrichBook } from '../packages/core/src/enrich.ts';
import type { HttpGet } from '../packages/core/src/metadata/index.ts';

/**
 * G34 — a book a provider failed on is filled by the next run.
 *
 * **This asserts that the pacing answer is true.** Apple is asked about every
 * book against iTunes' roughly 20 calls a minute, and no throttle was added.
 * The reason that is safe is a property of `http.ts` nobody designed for it:
 * `createCachedHttpGet` writes the cache **only when the request returned
 * something** (`if (body === undefined) return undefined;`), so a success is
 * cached forever and a failure is never cached at all. Run two therefore asks
 * only for what run one missed, and the pass paces itself *across* runs rather
 * than inside one.
 *
 * Without this row, "run it twice" rests on an undocumented property that a
 * well-meant change adding negative caching would break silently — and the
 * symptom would be a book that never acquires an Apple id, which nothing else
 * would notice.
 *
 * The gap left by a failed provider is deliberately **not** recorded in the
 * note: a sentinel like `apple_track_id: none` would put a non-id in an id key,
 * defeating the parse-time shape check, and freeze a claim about the world that
 * Apple listing the book next year would not reverse.
 *
 * See docs/gates.md, row G34 (enrich-convergence).
 */

const OPEN_LIBRARY = {
  'ISBN:9781603580557': {
    title: 'Thinking in Systems',
    authors: [{ name: 'Donella H. Meadows' }],
    number_of_pages: 240,
    publishers: [{ name: 'Chelsea' }],
    publish_date: '2008',
    key: '/books/OL26445570M',
  },
};

const APPLE_HIT = {
  results: [
    {
      trackName: 'Thinking in Systems',
      artistName: 'Donella H. Meadows',
      trackId: 1384286945,
      genres: ['Science & Nature'],
    },
  ],
};

/**
 * Apple refuses on the first run and answers on the second.
 *
 * A `429` reaches the caller as `undefined` after the retries are exhausted,
 * which is exactly what this returns — the shape of a rate-limited book.
 */
function flakyApple(): HttpGet {
  let appleAsked = 0;
  return async (url) => {
    if (url.includes('/api/books')) return OPEN_LIBRARY;
    if (url.includes('itunes.apple.com')) {
      appleAsked += 1;
      return appleAsked === 1 ? undefined : APPLE_HIT;
    }
    return undefined;
  };
}

describe('G34 — a rate-limited book self-heals on the next run', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-converge-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('leaves the id absent when the provider fails, and fills it next time', async () => {
    const get = flakyApple();
    await vault.writeBook({ title: 'Thinking in Systems', isbn: '9781603580557' });

    const [first] = await vault.listBooks();
    await enrichBook(first!, vault, get);

    const [afterOne] = await vault.listBooks();
    expect(
      afterOne?.appleTrackId,
      'run one recorded an Apple id although Apple never answered',
    ).toBeUndefined();
    // The gap is a gap, not a sentinel: nothing about the failure is written
    // down, which is what keeps the book a candidate forever and lets it heal.
    expect(afterOne?.openLibraryOlid, 'the providers that did answer still filled').toBe(
      'OL26445570M',
    );

    await enrichBook(afterOne!, vault, get);

    const [afterTwo] = await vault.listBooks();
    expect(
      afterTwo?.appleTrackId,
      'run two did not fill the gap run one missed. "Run it twice" is the documented ' +
        'pacing answer for iTunes\' ~20/min, and it only works while a failure is never ' +
        'cached — see http.ts:64',
    ).toBe('1384286945');
  });
});
