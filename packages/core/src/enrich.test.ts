import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { enrichBook, missingFields } from './enrich.ts';
import type { HttpGet } from './metadata/http.ts';

/** Open Library answers with a complete record; nothing else responds. */
const knowsTheBook: HttpGet = async (url) =>
  url.includes('/search.json')
    ? {
        docs: [
          {
            title: 'Thinking in Systems',
            author_name: ['Donella H. Meadows'],
            isbn: ['9781603580557'],
            number_of_pages_median: 240,
          },
        ],
      }
    : undefined;

const knowsNothing: HttpGet = async () => undefined;

describe('missingFields', () => {
  it('counts a cover with no spine colour as a gap', () => {
    const base = { sourcePath: 'Library/A.md', title: 'A', status: 'read' as const, tags: [] };
    expect(missingFields({ ...base, cover: 'covers/a.jpg' })).toContain('spine_color');
    expect(missingFields({ ...base, cover: 'covers/a.jpg', spineColor: '#123456' })).not.toContain(
      'spine_color',
    );
  });
});

describe('enrichBook', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-enrich-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('fills only what is missing and leaves the rest alone', async () => {
    await vault.writeBook({
      title: 'Thinking in Systems',
      author: 'Donella H. Meadows',
      status: 'reading',
      rating: 4,
    });
    const [book] = await vault.listBooks();

    const outcome = await enrichBook(book!, vault, knowsTheBook);
    expect(outcome.kind).toBe('filled');

    const [after] = await vault.listBooks();
    expect(after?.isbn).toBe('9781603580557');
    expect(after?.pages).toBe(240);
    // Status and rating are untouched — this is the whole difference between
    // enrich and delete-and-re-add.
    expect(after?.status).toBe('reading');
    expect(after?.rating).toBe(4);
  });

  it('refuses when the author is written differently enough to be uncertain', async () => {
    // "D. Meadows" against "Donella H. Meadows" does not clear the identity
    // bar. Strict on purpose: this runs unattended over a whole vault, and a
    // wrong ISBN written into a note is far harder to notice than a gap left
    // open. Spell the author out and it fills.
    await vault.writeBook({ title: 'Thinking in Systems', author: 'D. Meadows' });
    const [book] = await vault.listBooks();

    expect((await enrichBook(book!, vault, knowsTheBook)).kind).toBe('mismatch');
  });

  it('reports complete and writes nothing when there are no gaps', async () => {
    await vault.writeBook({
      title: 'Thinking in Systems',
      author: 'Donella H. Meadows',
      isbn: '9781603580557',
      pages: 240,
      cover: 'covers/x.jpg',
      spineColor: '#2f6d7a',
    });
    const [book] = await vault.listBooks();
    const before = await readFile(join(dir, book!.sourcePath), 'utf8');

    expect((await enrichBook(book!, vault, knowsNothing)).kind).toBe('complete');
    expect(await readFile(join(dir, book!.sourcePath), 'utf8')).toBe(before);
  });

  it('refuses metadata from a book that merely shares words with this one', async () => {
    // Shares "systems" and "thinking", so the provider's own relevance filter
    // lets it through — the identity check is the only thing standing between
    // this note and another book's ISBN.
    await vault.writeBook({ title: 'Systems Thinking for Gardeners', author: 'Someone Else' });
    const [book] = await vault.listBooks();

    const outcome = await enrichBook(book!, vault, knowsTheBook);
    expect(outcome.kind).toBe('mismatch');

    // Nothing was written — a wrong ISBN is worse than no ISBN.
    const [after] = await vault.listBooks();
    expect(after?.isbn).toBeUndefined();
  });

  it('says not-found when no provider knows the book', async () => {
    await vault.writeBook({ title: 'A Book Nobody Has Written', author: 'Nobody' });
    const [book] = await vault.listBooks();

    expect((await enrichBook(book!, vault, knowsNothing)).kind).toBe('not-found');
  });

  it('writes nothing under dryRun', async () => {
    await vault.writeBook({ title: 'Thinking in Systems', author: 'Donella H. Meadows' });
    const [book] = await vault.listBooks();
    const before = await readFile(join(dir, book!.sourcePath), 'utf8');

    const outcome = await enrichBook(book!, vault, knowsTheBook, { dryRun: true });

    expect(outcome.kind).toBe('filled');
    expect(await readFile(join(dir, book!.sourcePath), 'utf8')).toBe(before);
  });
});
