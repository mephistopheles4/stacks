import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { enrichBook } from '../packages/core/src/enrich.ts';
import type { HttpGet } from '../packages/core/src/metadata/index.ts';

/**
 * G33 — running `enrich` twice changes nothing the second time.
 *
 * **The only gate that reaches the `## About` body insert.** A body section is
 * not a `FILLABLE` key — `missingFields` reads a `BookRecord`, and a
 * `BookRecord` has no body, which is invariant 2 by construction — so G32 cannot
 * see that write at all. It is also the riskiest write this project owns:
 * surgical insertion into a file the owner edits by hand.
 *
 * A whole-pass assertion rather than a per-branch one, for G27's reason: a test
 * that checks the *condition* passes a refactor that moves the condition. This
 * asserts the claim the operating instruction rests on — **"run it twice"** is
 * only safe advice if the second run is a no-op.
 *
 * Phase 4's import gate set the precedent. G21-safe: the provider is a stub.
 *
 * See docs/gates.md, row G33 (enrich-idempotence).
 */

const provider: HttpGet = async (url) => {
  if (url.includes('/api/books')) {
    return {
      'ISBN:9781603580557': {
        title: 'Thinking in Systems',
        authors: [{ name: 'Donella H. Meadows' }],
        number_of_pages: 240,
        publishers: [{ name: 'Chelsea' }],
        publish_date: '2008',
        subjects: [{ name: 'systems thinking' }, { name: 'science' }],
        key: '/books/OL26445570M',
      },
    };
  }
  if (url.includes('googleapis.com')) {
    return {
      items: [
        {
          id: 'CpbLAgAAQBAJ',
          volumeInfo: {
            title: 'Thinking in Systems',
            authors: ['Donella H. Meadows'],
            publisher: 'Chelsea Green Publishing',
            publishedDate: '2008-12-05',
            categories: ['Business & Economics'],
            description: 'A primer on systems thinking.',
            pageCount: 242,
          },
        },
      ],
    };
  }
  if (url.includes('itunes.apple.com')) {
    return {
      results: [
        {
          trackName: 'Thinking in Systems',
          artistName: 'Donella H. Meadows',
          trackId: 1384286945,
          releaseDate: '2008-12-05T08:00:00Z',
          genres: ['Books', 'Science & Nature'],
          description: 'Apple’s blurb.',
        },
      ],
    };
  }
  return undefined;
};

describe('G33 — the whole pass is idempotent', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-idempotent-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes on the first run and nothing at all on the second', async () => {
    await vault.writeBook({ title: 'Thinking in Systems', isbn: '9781603580557' });

    const [first] = await vault.listBooks();
    const path = join(dir, first!.sourcePath);
    const before = await readFile(path, 'utf8');

    await enrichBook(first!, vault, provider);
    const afterFirst = await readFile(path, 'utf8');

    expect(afterFirst, 'the first run filled nothing, so this proves nothing').not.toBe(before);
    // The write this gate exists for: not a frontmatter key, so nothing else
    // watches it.
    expect(afterFirst).toContain('## About');

    const [second] = await vault.listBooks();
    await enrichBook(second!, vault, provider);

    expect(
      await readFile(path, 'utf8'),
      'the second run changed the note. Re-running is the documented way to finish a ' +
        'rate-limited pass, so a second run that writes is a pass nobody can safely repeat',
    ).toBe(afterFirst);
  });

  it('appends no second ## About when the note already has one', async () => {
    await vault.writeBook({ title: 'Thinking in Systems', isbn: '9781603580557' });
    const [book] = await vault.listBooks();
    const path = join(dir, book!.sourcePath);

    await enrichBook(book!, vault, provider);
    const [again] = await vault.listBooks();
    await enrichBook(again!, vault, provider);

    const contents = await readFile(path, 'utf8');
    expect(contents.match(/^## About$/gm) ?? []).toHaveLength(1);
  });
});
