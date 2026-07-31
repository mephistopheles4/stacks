import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from '../adapters/obsidian-adapter.ts';
import { parseAudibleExport } from './audible.ts';
import { importBooks } from './index.ts';
import { readApiFixture } from '../test-support.ts';

const EXPORT = readApiFixture('audible-export.json');

describe('parseAudibleExport', () => {
  it('joins title and subtitle, and always tags the book audiobook', () => {
    const [first] = parseAudibleExport(EXPORT);

    expect(first?.input.title).toBe('The Tidal Engine: Notes From an Estuary');
    expect(first?.input.author).toBe('Marisol Vane');
    expect(first?.input.tags?.[0]).toBe('audiobook');
    expect(first?.input.tags).toContain('engineering');
    expect(first?.input.tags).toContain('nature writing');
  });

  it('maps IsFinished onto status, since Audible has no richer notion', () => {
    const books = parseAudibleExport(EXPORT);
    expect(books[0]?.input.status).toBe('read');
    expect(books[1]?.input.status).toBe('reading');
  });

  it('carries narrator, ASIN, runtime and publisher as extra keys', () => {
    const [first] = parseAudibleExport(EXPORT);
    expect(first?.input.extra).toMatchObject({
      narrator: 'Priya Raman',
      asin: 'B0FIXAUD01',
      duration: '4h 38m',
      publisher: 'Riverbend Audio',
      source: 'audible',
    });
  });

  it('never carries the account email or the publisher blurb', () => {
    // The email is the owner's, and Description is someone else's copyrighted
    // marketing copy. Neither belongs in a note, still less in a public build.
    const json = JSON.stringify(parseAudibleExport(EXPORT));
    expect(json).not.toContain('reader@example.invalid');
    expect(json).not.toContain('marketing copy');
    expect(json).not.toContain('Description');
  });

  it('leaves finished unset unless asked, because the export has no such date', () => {
    expect(parseAudibleExport(EXPORT)[0]?.input.finished).toBeUndefined();

    const dated = parseAudibleExport(EXPORT, { dateAddedAsFinished: true });
    expect(dated[0]?.input.finished).toBe('2026-07-17');
    // An unfinished book never gets a finished date, whatever the flag says.
    expect(dated[1]?.input.finished).toBeUndefined();
    expect(dated[1]?.input.started).toBe('2026-07-17');
  });

  it('prefers the full-resolution cover', () => {
    expect(parseAudibleExport(EXPORT)[0]?.coverUrl).toBe(
      'https://m.media-amazon.com/images/I/81FIXTURELARGE.jpg',
    );
  });

  it('skips a record with no usable title rather than importing a blank book', () => {
    expect(parseAudibleExport(EXPORT)).toHaveLength(3);
  });

  it('returns nothing for input that is not an export', () => {
    expect(parseAudibleExport(null)).toEqual([]);
    expect(parseAudibleExport({ nope: true })).toEqual([]);
    expect(parseAudibleExport([1, 'two', null])).toEqual([]);
  });
});

describe('importBooks', () => {
  let dir: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-import-'));
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the books, with their extra keys intact', async () => {
    const vault = new ObsidianAdapter(dir);
    const result = await importBooks(parseAudibleExport(EXPORT), vault, { skipCovers: true });

    expect(result.added).toBe(3);
    expect(result.duplicates).toBe(0);

    const added = result.outcomes.find((o) => o.kind === 'added');
    const note = await readFile((added as { path: string }).path, 'utf8');
    expect(note).toContain('narrator:');
    expect(note).toContain('asin:');
    expect(note).toContain('source: audible');
  });

  it('is idempotent — running it twice adds nothing the second time', async () => {
    const vault = new ObsidianAdapter(dir);
    const books = parseAudibleExport(EXPORT);

    const first = await importBooks(books, vault, { skipCovers: true });
    const second = await importBooks(books, vault, { skipCovers: true });

    expect(first.added).toBe(3);
    expect(second.added).toBe(0);
    expect(second.duplicates).toBe(3);
    expect(await vault.listBooks()).toHaveLength(3);
  });

  it('does not shelve an audiobook beside the print edition of the same book', async () => {
    const vault = new ObsidianAdapter(dir);
    await vault.writeBook({ title: 'Staff Engineer', author: 'Will Larson', status: 'read' });

    const result = await importBooks(parseAudibleExport(EXPORT), vault, { skipCovers: true });

    // The export's title carries a long subtitle the vault's copy does not.
    expect(result.duplicates).toBe(1);
    const duplicate = result.outcomes.find((o) => o.kind === 'duplicate');
    expect(duplicate).toMatchObject({ existing: 'Staff Engineer' });
  });

  it('catches a book duplicated inside one export, even in a dry run', async () => {
    const vault = new ObsidianAdapter(dir);
    const books = parseAudibleExport(EXPORT);
    const doubled = [...books, ...books];

    const result = await importBooks(doubled, vault, { dryRun: true, skipCovers: true });

    // Nothing is written in a dry run, so a check that re-read the vault would
    // see an empty shelf every time and claim all six were new.
    expect(result.added).toBe(3);
    expect(result.duplicates).toBe(3);
    expect(await vault.listBooks()).toHaveLength(0);
  });
});
