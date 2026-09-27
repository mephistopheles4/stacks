import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { addBook } from './add-book.ts';
import { enrichBook } from './enrich.ts';
import { importBooks } from './import/index.ts';
import type { HttpGet } from './metadata/http.ts';
import { lookup } from './metadata/index.ts';
import { isHost } from './test-support.ts';

/**
 * A reading language other than English reaches every path that searches.
 *
 * The failure this guards is the one the setting's own design names as the
 * worst: a `language` dropped somewhere on the way silently becomes English,
 * which is indistinguishable from the setting working. Every assertion here
 * runs at `tr` for that reason — at the default, a hard-coded `'en'` passes.
 * See ADR-0094.
 *
 * ⚠️ **Google's title search is observed by its arguments, not its output**, and
 * only here. `fillGaps` never reads its candidate's ISBN, so whether that call
 * site passed `tr` or `en` changes nothing a caller can see — and a test that
 * cannot fail is not a test of the call site. The wrapper passes every call
 * through unchanged, and lives in its own file so the hoisted mock touches no
 * other spec.
 */

const google = vi.hoisted(() => ({
  titleSearches: [] as { query: string; language: unknown }[],
}));

vi.mock('./metadata/google-books.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./metadata/google-books.ts')>();
  return {
    ...actual,
    searchByTitle: async (...args: Parameters<typeof actual.searchByTitle>) => {
      google.titleSearches.push({ query: args[0], language: args[2] });
      return await actual.searchByTitle(...args);
    },
  };
});

const TITLE = 'Hızlı ve Yavaş Düşünme';

/** Every URL asked, answering only Open Library's search, with `work` if given. */
function recording(work?: Record<string, unknown>): { asked: string[]; get: HttpGet } {
  const asked: string[] = [];
  const get: HttpGet = async (url) => {
    asked.push(url);
    return work !== undefined && url.includes('/search.json') ? { docs: [work] } : undefined;
  };
  return { asked, get };
}

/** The `q` of the Open Library search among `asked`. */
function openLibraryQuery(asked: readonly string[]): string | null {
  const search = asked.find(
    (url) => isHost(url, 'openlibrary.org') && url.includes('/search.json'),
  );
  return new URL(search ?? 'about:blank').searchParams.get('q');
}

beforeEach(() => {
  google.titleSearches.length = 0;
});

describe('the metadata layer, at a reading language of tr', () => {
  it("passes it to Google's title search when Open Library has nothing", async () => {
    const { get } = recording();
    await lookup(TITLE, get, { language: 'tr' });

    expect(google.titleSearches.map((call) => call.language)).toEqual(['tr']);
  });

  it("passes it to Google's title search when filling a gap Open Library left", async () => {
    // Open Library finds the work and has no edition to take an ISBN from, so
    // `fillGaps` searches Google by title — its own call site.
    const { get } = recording({ title: TITLE, author_name: ['Daniel Kahneman'] });
    await lookup(TITLE, get, { language: 'tr' });

    expect(google.titleSearches).toEqual([{ query: `${TITLE} Daniel Kahneman`, language: 'tr' }]);
  });

  it('asks Open Library for Turkish editions', async () => {
    const { asked, get } = recording();
    await lookup(TITLE, get, { language: 'tr' });

    expect(openLibraryQuery(asked)).toBe(`${TITLE} language:tur`);
  });
});

describe('each command, at a reading language of tr', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-language-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('add', async () => {
    const { asked, get } = recording();
    await addBook(TITLE, vault, get, { language: 'tr' });

    expect(openLibraryQuery(asked)).toMatch(/ language:tur$/);
  });

  it('enrich', async () => {
    await vault.writeBook({ title: TITLE, author: 'Daniel Kahneman' });
    const [book] = await vault.listBooks();
    const { asked, get } = recording();

    await enrichBook(book!, vault, get, { dryRun: true, language: 'tr' });

    expect(openLibraryQuery(asked)).toMatch(/ language:tur$/);
  });

  it('import', async () => {
    const { asked, get } = recording();
    // Not a dry run: the lookup is how an import chooses a cover, and a dry run
    // never gets that far.
    await importBooks([{ input: { title: TITLE, author: 'Daniel Kahneman' } }], vault, {
      get,
      language: 'tr',
    });

    expect(openLibraryQuery(asked)).toMatch(/ language:tur$/);
  });
});
