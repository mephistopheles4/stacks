import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { MAX_COVER_EDGE } from './covers/cover-budget.ts';
import { publish } from './publish.ts';
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

  it('stages library.json and the covers it references', async () => {
    const books = await vault.listBooks();
    const result = await publish(books, vault, out, { isPublic: true });

    const staged = await readdir(out);
    expect(staged).toContain('library.json');
    expect(staged).toContain('covers');

    // And nothing else. `og.png` is committed brand art living in the folder
    // this stages into, so a build that wrote one would overwrite the designed
    // card with a generated one at the same path, at the same size, silently.
    expect(staged).not.toContain('og.png');

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

  it('measures each cover so the shelf knows the book is not one shape', async () => {
    const books = await vault.listBooks();
    const result = await publish(books, vault, out, { isPublic: true });

    const withCover = result.library.books.filter((b) => b.cover !== undefined);
    expect(withCover.length).toBeGreaterThan(0);
    for (const book of withCover) {
      expect(book.coverAspect).toBeGreaterThan(0);
    }

    // The fixtures are 200x300 and one is 1400x2100 — both 2:3.
    expect(withCover[0]?.coverAspect).toBeCloseTo(200 / 300, 2);

    // A book with no cover has no aspect to report.
    const bare = result.library.books.find((b) => b.cover === undefined);
    expect(bare?.coverAspect).toBeUndefined();
  });

  it('reports a missing cover instead of failing the build', async () => {
    const books = await vault.listBooks();
    // Cloned from a book that actually ships: cloning the wishlist or the
    // `private: true` fixture would make the ghost be filtered out, and the
    // test would pass while asserting nothing.
    const shippable = books.find(
      (book) => book.status !== 'wishlist' && book.private !== true && book.cover !== undefined,
    );
    expect(shippable).toBeDefined();
    const withGhost = [...books, { ...shippable!, cover: 'covers/not-here.png', title: 'Ghost' }];

    const result = await publish(withGhost, vault, out, { isPublic: true });
    expect(result.coversMissing).toEqual(['not-here.png']);

    // Every shipping book still ships — a cover the vault lost costs the book
    // its picture, not its place. Two kinds never ship: wishlist (you do not
    // own them) and `private: true` (the owner said no), so count against
    // those rather than against everything handed in.
    const shelved = withGhost.filter((book) => book.status !== 'wishlist' && book.private !== true);
    expect(result.library.bookCount).toBe(shelved.length);
  });

  it('refuses to let a cover path climb out of the covers directory', async () => {
    const books = await vault.listBooks();
    // A book that actually ships, so the traversal is genuinely attempted —
    // cloning the private fixture would filter it out before publish ever
    // resolved the path, and the test would pass having tested nothing.
    const shipping = books.find((book) => book.status !== 'wishlist' && book.private !== true);
    const escaping = [{ ...shipping!, cover: '../../../../etc/passwd', title: 'Escaping' }];

    const result = await publish(escaping, vault, out, { isPublic: true });
    // Only the basename is ever used, so this looks for `passwd` inside the
    // vault's covers folder and simply fails to find it.
    expect(result.coversMissing).toEqual(['passwd']);
    const copied = await readdir(join(out, 'covers'));
    expect(copied).toEqual([]);
  });
});

/**
 * What a re-encode is allowed to cost.
 *
 * The resize is not optional — see cover-budget.ts — but the *encoder settings*
 * it runs under were never chosen, and sharp's defaults are quality 80 with
 * 4:2:0 chroma subsampling. 4:2:0 stores colour at half resolution on both
 * axes, which is invisible on a photograph and very visible on the thing a book
 * cover actually is: hard-edged type over a saturated flat field. The owner
 * reported "artifacts" on a white-serif-on-red cover and was right — the
 * fringing was ours, introduced between the vault and the shelf, on a file the
 * provider had served clean.
 *
 * Only covers *over* the cap are re-encoded; everything else is copied byte for
 * byte, so this is the whole population that could be damaged.
 */
describe('publish — the re-encode it imposes', () => {
  let vaultPath: string;

  /** A vault holding one book whose cover is `bytes` under `filename`. */
  async function vaultWithCover(filename: string, bytes: Buffer): Promise<ObsidianAdapter> {
    await mkdir(join(vaultPath, 'Library', 'covers'), { recursive: true });
    await writeFile(
      join(vaultPath, 'Library', 'Big.md'),
      `---\ntype: book\ntitle: Big\ncover: covers/${filename}\n---\n\nA body.\n`,
    );
    await writeFile(join(vaultPath, 'Library', 'covers', filename), bytes);
    return new ObsidianAdapter(vaultPath);
  }

  /**
   * White type on a saturated red field, well over the cap — the exact shape
   * 4:2:0 handles worst, and the shape every book cover has.
   */
  function typeOnRed(): Sharp {
    const width = MAX_COVER_EDGE * 2;
    const height = Math.round(width * 1.5);
    return sharp({ create: { width, height, channels: 3, background: '#c8102e' } }).composite([
      {
        input: {
          create: {
            width: Math.round(width * 0.6),
            height: 24,
            channels: 3,
            background: '#ffffff',
          },
        },
        left: Math.round(width * 0.2),
        top: Math.round(height * 0.2),
      },
    ]);
  }

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'stacks-encode-'));
  });

  afterEach(async () => {
    await rm(vaultPath, { recursive: true, force: true });
  });

  it('does not subsample chroma on a jpeg it has to shrink', async () => {
    const vault = await vaultWithCover('big.jpg', await typeOnRed().jpeg().toBuffer());
    const out = await mkdtemp(join(tmpdir(), 'stacks-encode-out-'));

    try {
      await publish(await vault.listBooks(), vault, out, { isPublic: true });
      const staged = await sharp(join(out, 'covers', 'big.jpg')).metadata();

      expect(staged.width).toBeLessThanOrEqual(MAX_COVER_EDGE);
      expect(
        staged.chromaSubsampling,
        'the staged cover stores colour at half resolution — white type on a flat ' +
          'field comes out fringed, and the fringe is ours, not the provider’s',
      ).toBe('4:4:4');
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  /**
   * The trap in the fix, and the reason it cannot be an unconditional
   * `.jpeg(...)`: sharp takes the output format from that call, not from the
   * filename. A PNG cover would be written as JPEG bytes under a `.png` name —
   * which browsers sniff and render anyway, so nothing downstream would notice.
   */
  it('leaves a png a png', async () => {
    const vault = await vaultWithCover('big.png', await typeOnRed().png().toBuffer());
    const out = await mkdtemp(join(tmpdir(), 'stacks-encode-out-'));

    try {
      await publish(await vault.listBooks(), vault, out, { isPublic: true });
      const staged = await sharp(join(out, 'covers', 'big.png')).metadata();

      expect(staged.width).toBeLessThanOrEqual(MAX_COVER_EDGE);
      expect(staged.format, 'a .png cover was rewritten as some other format').toBe('png');
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
