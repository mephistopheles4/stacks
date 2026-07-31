import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from './obsidian-adapter.ts';
import { FIXTURE_VAULT } from '../test-support.ts';

const vault = new ObsidianAdapter(FIXTURE_VAULT);

describe('listBooks against the fixture vault', () => {
  let warnings: string[];
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnings = [];
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.join(' '));
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns exactly the well-formed books', async () => {
    const books = await vault.listBooks();

    // The expected outcome is documented in fixtures/README.md; if this number
    // changes, that table is what should be updated first.
    expect(books).toHaveLength(8);
    expect(books.map((b) => b.title).sort()).toEqual([
      'Compilers for the Impatient: A Field Guide to Fast Iteration',
      'Lantern Work: Notes on Craft',
      'Nine Ways of Seeing a Warehouse',
      'Signal and Sediment (Riverbend Studies in Applied Ecology)',
      'The Quiet Protocol',
      'The Salt Road Ledger',
      'The Salt Road Ledger',
      'The Tidal Engine',
    ]);
  });

  it('warns about each bad note BY NAME and keeps going (invariant 3)', async () => {
    await vault.listBooks();

    expect(warnings).toHaveLength(2);
    // "skip with a console warning listing the file" — the filename is the part
    // that makes the warning actionable, so assert on it, not just on a count.
    expect(warnings.join('\n')).toContain('The Undelivered Manuscript.md');
    expect(warnings.join('\n')).toContain('Untitled Import.md');
  });

  it('says nothing at all about a note that simply is not a book', async () => {
    await vault.listBooks();
    expect(warnings.join('\n')).not.toContain('On Reading Slowly');
  });

  it('never lets a note body through (invariant 2)', async () => {
    const books = await vault.listBooks();
    expect(JSON.stringify(books)).not.toContain('NOTE_BODY_CANARY_do_not_ship');
  });

  it('returns an empty list for a vault that does not exist, rather than throwing', async () => {
    const missing = new ObsidianAdapter(join(tmpdir(), 'stacks-does-not-exist-' + Date.now()));
    await expect(missing.listBooks()).resolves.toEqual([]);
  });
});

describe('bookExists — the two dedupe paths', () => {
  it('matches on ISBN, ignoring hyphenation', async () => {
    expect(await vault.bookExists('9781000000016', 'nothing like this')).toBe(true);
    expect(await vault.bookExists('978-1-00-000001-6', 'nothing like this')).toBe(true);
  });

  it('matches on normalised title+author when there is no shared ISBN', async () => {
    // The audiobook edition carries only an ASIN, so ISBN matching cannot see
    // it — this is the pair the title+author path exists for.
    expect(await vault.bookExists('', 'The Salt Road Ledger Beatrix Okonkwo')).toBe(true);
    expect(await vault.bookExists('', 'Salt Road Ledger, The — Beatrix Okonkwo')).toBe(true);
    // Surname-first, extra whitespace, no punctuation — still the same book.
    expect(await vault.bookExists('', 'salt road ledger  okonkwo, beatrix')).toBe(true);
  });

  it('does not match a book that is not there', async () => {
    expect(await vault.bookExists('9789999999999', 'A Book That Does Not Exist')).toBe(false);
  });
});

describe('writeBook', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-vault-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a note that parses back into the same book', async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({
      title: 'A Written Book',
      author: 'Test Author',
      isbn: '9781000000016',
      status: 'reading',
      rating: 4,
      spineColor: '#2f6d7a',
      pages: 123,
      tags: ['one', 'two'],
    });

    const source = await readFile(path, 'utf8');
    expect(source).toMatch(/^---\n/);
    // Contract key names, not camelCase — the file has to stay editable in Obsidian.
    expect(source).toContain('spine_color:');
    expect(source).not.toContain('spineColor');

    const [book] = await writable.listBooks();
    expect(book).toMatchObject({
      title: 'A Written Book',
      author: 'Test Author',
      status: 'reading',
      rating: 4,
      spineColor: '#2f6d7a',
      pages: 123,
    });
  });

  it('embeds the cover so Obsidian shows it, without that reaching library.json', async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({
      title: 'Covered',
      cover: 'covers/covered.jpg',
    });

    const source = await readFile(path, 'utf8');
    // The wikilink resolves by filename, so it survives the file being moved.
    expect(source).toContain('![[covered.jpg]]');
    expect(source.indexOf('![[covered.jpg]]')).toBeGreaterThan(source.lastIndexOf('---'));

    // It lives in the body, and the body is never parsed back (invariant 2).
    const [book] = await writable.listBooks();
    expect(book?.cover).toBe('covers/covered.jpg');
    expect(JSON.stringify(book)).not.toContain('![[');
  });

  it('writes no embed for a book with no cover', async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({ title: 'Bare' });
    expect(await readFile(path, 'utf8')).not.toContain('![[');
  });

  it('never overwrites an existing note', async () => {
    // The filename comes from the title, so a second book of the same name used
    // to land on the same path and replace the first — losing its dates, its
    // rating and everything written in the body. `stacks add --force` did this
    // silently.
    const writable = new ObsidianAdapter(dir);

    const first = await writable.writeBook({
      title: 'Thinking in Systems',
      author: 'Donella H. Meadows',
      rating: 5,
    });
    const second = await writable.writeBook({ title: 'Thinking in Systems' });

    expect(second).not.toBe(first);
    expect(basename(second)).toBe('Thinking in Systems (2).md');

    // The original is untouched, rating and all.
    expect(await readFile(first, 'utf8')).toContain('rating: 5');
    expect(await writable.listBooks()).toHaveLength(2);
  });

  it('strips characters that Windows and Obsidian reject from the filename', async () => {
    const writable = new ObsidianAdapter(dir);
    const path = await writable.writeBook({ title: 'Who? What: Why*  <Yes>' });
    // basename only — the drive letter in an absolute Windows path has a colon.
    expect(basename(path)).toBe('Who What Why Yes.md');
    expect(await readFile(path, 'utf8')).toContain('Who? What: Why*  <Yes>');
  });
});

describe('coverDir', () => {
  it('points inside the vault, next to the notes', () => {
    expect(vault.coverDir()).toContain('Library');
    expect(vault.coverDir()).toContain('covers');
  });
});
