import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { renderOgImage } from './og-image.ts';
import { publish } from './publish.ts';
import { buildLibrary } from './library.ts';
import { FIXTURE_VAULT } from './test-support.ts';

const CANARY = 'NOTE_BODY_CANARY_do_not_ship';
const vault = new ObsidianAdapter(FIXTURE_VAULT);

describe('publish', () => {
  let out: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    out = await mkdtemp(join(tmpdir(), 'stacks-publish-'));
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    await rm(out, { recursive: true, force: true });
  });

  it('stages library.json, the covers it references, and an og image', async () => {
    const books = await vault.listBooks();
    const result = await publish(books, vault, out, { isPublic: true });

    const staged = await readdir(out);
    expect(staged).toContain('library.json');
    expect(staged).toContain('covers');
    expect(staged).toContain('og.png');

    // Six of the eight fixture books carry a cover; two deliberately do not.
    expect(result.coversCopied).toBe(6);
    expect(result.coversMissing).toEqual([]);
  });

  it('copies only referenced covers, not the whole covers folder', async () => {
    const books = await vault.listBooks();
    await publish(books, vault, out, { isPublic: true });

    const copied = await readdir(join(out, 'covers'));
    // `white-bordered.png` and `all-white.png` exist in the vault for the
    // extractor's tests and belong to no book, so they must not ship.
    expect(copied).not.toContain('white-bordered.png');
    expect(copied).not.toContain('all-white.png');
    expect(copied).toContain('the-tidal-engine.png');
  });

  it('writes a public library.json with no note bodies and no vault paths', async () => {
    const books = await vault.listBooks();
    const result = await publish(books, vault, out, { isPublic: true });

    const json = await readFile(result.libraryPath, 'utf8');
    expect(json).not.toContain(CANARY);
    expect(json).not.toContain('sourcePath');
    expect(json).not.toContain('Library/');
    expect(json).not.toContain('.md');
  });

  it('reports a missing cover instead of failing the build', async () => {
    const books = await vault.listBooks();
    const withGhost = [...books, { ...books[0]!, cover: 'covers/not-here.png', title: 'Ghost' }];

    const result = await publish(withGhost, vault, out, { isPublic: true });
    expect(result.coversMissing).toEqual(['not-here.png']);
    expect(result.library.bookCount).toBe(withGhost.length);
  });

  it('refuses to let a cover path climb out of the covers directory', async () => {
    const books = await vault.listBooks();
    const escaping = [
      { ...books[0]!, cover: '../../../../etc/passwd', title: 'Escaping' },
    ];

    const result = await publish(escaping, vault, out, { isPublic: true });
    // Only the basename is ever used, so this looks for `passwd` inside the
    // vault's covers folder and simply fails to find it.
    expect(result.coversMissing).toEqual(['passwd']);
    const copied = await readdir(join(out, 'covers'));
    expect(copied).toEqual([]);
  });
});

describe('renderOgImage', () => {
  it('produces a 1200x630 PNG', async () => {
    const books = await vault.listBooks();
    const library = buildLibrary(books, { isPublic: true });

    const png = await renderOgImage(library.books);
    const meta = await sharp(png).metadata();

    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it('actually draws the books rather than an empty case', async () => {
    const books = await vault.listBooks();
    const library = buildLibrary(books, { isPublic: true });

    const withBooks = await sharp(await renderOgImage(library.books)).stats();
    const empty = await sharp(await renderOgImage([])).stats();

    // Spines add colour variance the bare case does not have.
    const spread = (s: typeof withBooks): number =>
      s.channels.reduce((total, channel) => total + channel.stdev, 0);
    expect(spread(withBooks)).toBeGreaterThan(spread(empty));
  });

  it('survives a library with no books at all', async () => {
    const png = await renderOgImage([]);
    expect((await sharp(png).metadata()).width).toBe(1200);
  });

  it('ignores a spine colour that is not a hex colour', async () => {
    // `spine_color` comes from a hand-edited note and lands in an SVG attribute.
    const nasty = [
      {
        id: 'x',
        title: 'X',
        status: 'read',
        tags: [],
        spineColor: '"><script>alert(1)</script>',
      },
    ];
    const png = await renderOgImage(nasty as never);
    expect((await sharp(png).metadata()).format).toBe('png');
  });
});
