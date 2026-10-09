import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import type { VaultAdapter } from './adapters/vault-adapter.ts';
import { HELD_COVER_EDGE, MAX_COVER_EDGE } from './covers/cover-budget.ts';
import { publish } from './publish.ts';
import { FIXTURE_VAULT, spyOnWarn, type WarnSpy } from './test-support.ts';

const CANARY = 'NOTE_BODY_CANARY_do_not_ship';
const vault = new ObsidianAdapter(FIXTURE_VAULT);

describe('publish', () => {
  let out: string;
  let warn: WarnSpy;

  beforeEach(async () => {
    out = await mkdtemp(join(tmpdir(), 'stacks-publish-'));
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
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

    // Six of the books a public build ships carry a cover; `Lantern Work`
    // deliberately does not. The private and wishlist books carry one each,
    // for the held tier, and are filtered out before anything is copied.
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
 * The notes stage: `notes/<id>.json` for every book a public build would
 * publish, in both builds (spec §3.1, §3.2).
 *
 * G2 holds the split against the fixture vault; this holds the stage's own
 * rules against vaults built for each case, every word invented (ADR-0004).
 */
describe('publish — the notes stage', () => {
  const PRIVATE_THOUGHTS = 'PRIVATE_DUPLICATE_thoughts';

  let vaultPath: string;
  let assets: string;
  let warn: WarnSpy;

  const note = async (file: string, frontmatter: string[], ...body: string[]): Promise<void> => {
    await mkdir(join(vaultPath, 'Library'), { recursive: true });
    const contents = ['---', 'type: book', ...frontmatter, '---', '', ...body, ''].join('\n');
    await writeFile(join(vaultPath, 'Library', file), contents, 'utf8');
  };

  const build = async (isPublic: boolean) => {
    const vault = new ObsidianAdapter(vaultPath);
    // Stage forced on, whatever `PUBLISH_THOUGHTS` says: these test the stage itself.
    return publish(await vault.listBooks(), vault, assets, { isPublic, publishThoughts: true });
  };

  const notesFiles = async (): Promise<string[]> => {
    try {
      return (await readdir(join(assets, 'notes'))).sort();
    } catch {
      return [];
    }
  };

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'stacks-notes-vault-'));
    assets = await mkdtemp(join(tmpdir(), 'stacks-notes-assets-'));
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(vaultPath, { recursive: true, force: true });
    await rm(assets, { recursive: true, force: true });
  });

  describe.each([
    { mode: 'public', isPublic: true },
    { mode: 'local', isPublic: false },
  ])('in a $mode build', ({ isPublic }) => {
    it('writes { paragraphs } named for the book, and marks the book', async () => {
      await note(
        'Kept.md',
        ['title: Kept'],
        '## Thoughts',
        '',
        'One.',
        '',
        'Two.',
        '## Notes',
        'x',
      );

      const result = await build(isPublic);
      const book = result.library.books.find((b) => b.title === 'Kept');
      const file = join(assets, 'notes', `${book?.id ?? ''}.json`);

      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ paragraphs: ['One.', 'Two.'] });
      expect(book?.thoughts).toBe(true);
    });

    it('marks no book whose note has no file', async () => {
      await note('Bare.md', ['title: Bare'], '## Notes', 'x');
      await note('Withheld.md', ['title: Withheld'], '## Thoughts', '', '%% hidden %%');

      const result = await build(isPublic);

      expect(await notesFiles()).toEqual([]);
      expect(result.library.books.filter((b) => b.thoughts !== undefined)).toEqual([]);
    });

    it('writes nothing for a private or a wishlist book', async () => {
      await note('P.md', ['title: P', 'private: true'], '## Thoughts', '', 'Held back.');
      await note('W.md', ['title: W', 'status: wishlist'], '## Thoughts', '', 'Not owned.');

      const result = await build(isPublic);

      expect(await notesFiles()).toEqual([]);
      expect(result.library.books.filter((b) => b.thoughts !== undefined)).toEqual([]);
    });

    it('never puts a private duplicate’s Thoughts in the public book’s file', async () => {
      // Same title, same ISBN, so the same id: the one case `orphan-note`
      // cannot tell apart, since the file names a book that is listed.
      const isbn = 'isbn: "9780000000002"';
      await note('Twin.md', ['title: Twin', isbn], '## Thoughts', '', 'Public words.');
      await note(
        'Twin (2).md',
        ['title: Twin', isbn, 'private: true'],
        '## Thoughts',
        '',
        PRIVATE_THOUGHTS,
      );

      const result = await build(isPublic);
      const files = await notesFiles();
      const text = await Promise.all(files.map((f) => readFile(join(assets, 'notes', f), 'utf8')));

      expect(files).toHaveLength(1);
      expect(text.join('')).toContain('Public words.');
      expect(text.join('')).not.toContain(PRIVATE_THOUGHTS);
      // Locally both are listed, under one id, and only the public one is marked.
      const marked = result.library.books.filter((b) => b.thoughts === true);
      expect(marked.map((b) => b.private)).toEqual([undefined]);
    });

    it('writes no file for an id two published books share, and says so', async () => {
      const isbn = 'isbn: "9780000000019"';
      await note('One.md', ['title: Same', isbn], '## Thoughts', '', 'First words.');
      await note('Two.md', ['title: Same', isbn], '## Thoughts', '', 'Second words.');

      const result = await build(isPublic);

      expect(await notesFiles()).toEqual([]);
      expect(result.library.books.filter((b) => b.thoughts !== undefined)).toEqual([]);
      // Both notes named, so the owner can find the two (#411's round 3, integrity F12).
      expect(warn.lines.join('\n')).toMatch(/One\.md, .*Two\.md — they share one book id/);
      expect(warn.lines.join('\n')).not.toMatch(/First words|Second words/);
    });
  });

  it('prunes a file the next build did not write', async () => {
    await note('Gone.md', ['title: Gone'], '## Thoughts', '', 'Soon withdrawn.');
    await build(true);
    expect(await notesFiles()).toHaveLength(1);

    await note('Gone.md', ['title: Gone'], '## Notes', 'withdrawn');
    await build(true);

    expect(await notesFiles()).toEqual([]);
  });

  it('leaves a notes folder alone when no library.json says this tool stages there', async () => {
    // `pruneCovers`'s rule: `--assets` is a user-supplied flag, and a folder
    // with no previous `library.json` beside it may be somebody else's.
    await mkdir(join(assets, 'notes'), { recursive: true });
    await writeFile(join(assets, 'notes', 'theirs.json'), '{}', 'utf8');
    await note('Bare.md', ['title: Bare'], '## Notes', 'x');

    await build(true);

    expect(await notesFiles()).toEqual(['theirs.json']);
    // The message's own words, not the folder path: the temp folder's name
    // holds "notes" too, so matching that would check nothing.
    expect(warn.lines.join('\n')).toMatch(
      /Leaving it alone — notes from this build were still written/,
    );
  });

  it('skips a note it cannot read, with a warning, and still writes the rest', async () => {
    // Invariant 3: a note deleted or locked between `listBooks` and the second
    // read must cost its own Thoughts, never the build.
    await note('Gone.md', ['title: Gone'], '## Thoughts', '', 'Unreachable.');
    await note('Kept.md', ['title: Kept'], '## Thoughts', '', 'Reachable.');
    const real = new ObsidianAdapter(vaultPath);
    const flaky: VaultAdapter = {
      listBooks: () => real.listBooks(),
      writeBook: (book) => real.writeBook(book),
      updateBook: (path, changes) => real.updateBook(path, changes),
      insertBodySection: (path, heading, text) => real.insertBodySection(path, heading, text),
      bookExists: (isbn, titleAuthor) => real.bookExists(isbn, titleAuthor),
      coverDir: () => real.coverDir(),
      readPublicSection: (path) =>
        path.endsWith('Gone.md')
          ? Promise.reject(new Error('EBUSY'))
          : real.readPublicSection(path),
    };

    const result = await publish(await real.listBooks(), flaky, assets, {
      isPublic: true,
      publishThoughts: true,
    });

    expect(result.notesWritten).toBe(1);
    expect(result.library.books.filter((b) => b.thoughts === true).map((b) => b.title)).toEqual([
      'Kept',
    ]);
    expect(warn.lines.join('\n')).toMatch(/Library\/Gone\.md — the note could not be read/);
    expect(warn.lines.join('\n')).not.toMatch(/EBUSY|Unreachable/);
  });

  it('counts the notes files it wrote', async () => {
    await note('A.md', ['title: A'], '## Thoughts', '', 'One.');
    await note('B.md', ['title: B'], '## Thoughts', '', 'Two.');
    await note('C.md', ['title: C'], '## Notes', 'none');

    expect((await build(true)).notesWritten).toBe(2);
  });

  it('prunes files only, never a folder', async () => {
    await note('Bare.md', ['title: Bare'], '## Notes', 'x');
    await build(true);
    await mkdir(join(assets, 'notes', 'kept-dir'), { recursive: true });

    await build(true);

    expect(await notesFiles()).toEqual(['kept-dir']);
  });
});

/**
 * The held stage: a copy of each cover over the shelf cap, at most
 * `HELD_COVER_EDGE` on its long edge, in `held-covers/`, named by `heldCover`
 * (spec §3.3, #377, ADR-0105).
 *
 * Held to vaults built for each case, every image generated here (ADR-0004).
 * `gate:public` and G20 hold the same tier on a real build; this holds the
 * stage's own rules, in both builds.
 */
describe('publish — the held stage', () => {
  let vaultPath: string;
  let assets: string;
  let warn: WarnSpy;

  const cover = async (file: string, bytes: Buffer): Promise<void> => {
    await mkdir(join(vaultPath, 'Library', 'covers'), { recursive: true });
    await writeFile(join(vaultPath, 'Library', 'covers', file), bytes);
  };

  const note = async (title: string, ...frontmatter: string[]): Promise<void> => {
    await mkdir(join(vaultPath, 'Library'), { recursive: true });
    const contents = ['---', 'type: book', `title: ${title}`, ...frontmatter, '---', ''].join('\n');
    await writeFile(join(vaultPath, 'Library', `${title}.md`), contents, 'utf8');
  };

  const image = (
    width: number,
    height: number,
    format: 'png' | 'jpeg' = 'png',
    options: { exif?: boolean; xmp?: boolean; orientation?: number } = {},
  ): Promise<Buffer> => {
    let pipeline = sharp({
      create: { width, height, channels: 3, background: '#2f6d7a' },
    });
    if (options.exif === true) {
      pipeline = pipeline.withExif({ IFD0: { ImageDescription: 'Invented planted camera' } });
    }
    if (options.xmp === true) {
      pipeline = pipeline.withXmp(
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
          'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>',
      );
    }
    if (options.orientation !== undefined) {
      pipeline = pipeline.withMetadata({ orientation: options.orientation });
    }
    return format === 'jpeg' ? pipeline.jpeg().toBuffer() : pipeline.png().toBuffer();
  };

  const build = async (isPublic: boolean) => {
    const vault = new ObsidianAdapter(vaultPath);
    return publish(await vault.listBooks(), vault, assets, { isPublic });
  };

  const heldFiles = async (): Promise<string[]> => {
    try {
      return (await readdir(join(assets, 'held-covers'))).sort();
    } catch {
      return [];
    }
  };

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'stacks-held-vault-'));
    assets = await mkdtemp(join(tmpdir(), 'stacks-held-assets-'));
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(vaultPath, { recursive: true, force: true });
    await rm(assets, { recursive: true, force: true });
  });

  describe.each([
    { mode: 'public', isPublic: true },
    { mode: 'local', isPublic: false },
  ])('in a $mode build', ({ isPublic }) => {
    it('stages a cover over the held cap at the cap, proportions kept, and names it', async () => {
      await cover('big.png', await image(1400, 2100));
      await note('Big', 'cover: covers/big.png');

      const result = await build(isPublic);
      const held = await sharp(join(assets, 'held-covers', 'big.png')).metadata();
      const shelf = await sharp(join(assets, 'covers', 'big.png')).metadata();

      expect([held.width, held.height]).toEqual([800, HELD_COVER_EDGE]);
      expect(held.format).toBe('png');
      // The shelf's copy is untouched by the held stage.
      expect(Math.max(shelf.width, shelf.height)).toBe(MAX_COVER_EDGE);
      expect(result.library.books.find((b) => b.title === 'Big')?.heldCover).toBe(
        'held-covers/big.png',
      );
    });

    it('re-encodes a cover between the two caps at its own size, dropping EXIF and XMP', async () => {
      // The size #377 would have copied byte for byte. A copy would ship the
      // camera metadata a photographed cover carries, location included.
      const source = await image(800, 1200, 'jpeg', { exif: true, xmp: true });
      const planted = await sharp(source).metadata();
      expect(planted.exif, 'the plant carries EXIF').toBeDefined();
      expect(planted.xmp, 'the plant carries XMP').toBeDefined();
      await cover('mid.jpg', source);
      await note('Mid', 'cover: covers/mid.jpg');

      await build(isPublic);
      const bytes = await readFile(join(assets, 'held-covers', 'mid.jpg'));
      const held = await sharp(bytes).metadata();

      expect([held.width, held.height]).toEqual([800, 1200]);
      expect(held.exif).toBeUndefined();
      expect(held.xmp).toBeUndefined();
      expect(bytes.equals(source), 'the held copy is the vault file, byte for byte').toBe(false);
      // The shelf tier's encoder settings, for the shelf tier's reason.
      expect(held.chromaSubsampling).toBe('4:4:4');
    });

    it('turns a photographed cover upright before its orientation tag is dropped', async () => {
      // Stored landscape and tagged "rotate 90°", the way a phone writes a
      // portrait photo. Dropping the tag without applying it would ship the
      // cover on its side.
      await cover('turned.jpg', await image(1200, 800, 'jpeg', { orientation: 6 }));
      await note('Turned', 'cover: covers/turned.jpg');

      await build(isPublic);
      const held = await sharp(join(assets, 'held-covers', 'turned.jpg')).metadata();

      expect([held.width, held.height]).toEqual([800, 1200]);
      expect(held.orientation ?? 1).toBe(1);
    });

    it('stages nothing for a cover the shelf cap already holds', async () => {
      await cover('small.png', await image(MAX_COVER_EDGE, MAX_COVER_EDGE));
      await note('Small', 'cover: covers/small.png');

      const result = await build(isPublic);

      expect(await heldFiles()).toEqual([]);
      expect(result.library.books.find((b) => b.title === 'Small')?.heldCover).toBeUndefined();
    });

    it('stages nothing, and fails nothing, for a cover that is missing or unreadable', async () => {
      await cover('broken.png', Buffer.from('not an image'));
      await note('Broken', 'cover: covers/broken.png');
      await note('Lost', 'cover: covers/lost.png');

      const result = await build(isPublic);

      expect(await heldFiles()).toEqual([]);
      expect(result.library.books.filter((b) => b.heldCover !== undefined)).toEqual([]);
    });

    it('lands a cover path that climbs out of the vault as its basename', async () => {
      // `coverFileName`'s rule, which G10 holds: a vault path never decides
      // where a held copy lands.
      await cover('big.png', await image(1400, 2100));
      await note('Climbing', 'cover: ../../covers/big.png');

      const result = await build(isPublic);

      expect(await heldFiles()).toEqual(['big.png']);
      expect(result.library.books[0]?.heldCover).toBe('held-covers/big.png');
    });
  });

  it('stages no held copy for a private or a wishlist book in a public build', async () => {
    await cover('kept.png', await image(1400, 2100));
    await cover('wanted.png', await image(1400, 2100));
    await note('Kept', 'private: true', 'cover: covers/kept.png');
    await note('Wanted', 'status: wishlist', 'cover: covers/wanted.png');

    await build(true);

    expect(await heldFiles()).toEqual([]);
  });

  it('stages them in a local build, which shelves every book', async () => {
    // Held copies follow the shelf covers, not the notes (spec §3.2): a larger
    // copy of a cover a local shelf already shows exposes nothing new.
    await cover('kept.png', await image(1400, 2100));
    await cover('wanted.png', await image(1400, 2100));
    await note('Kept', 'private: true', 'cover: covers/kept.png');
    await note('Wanted', 'status: wishlist', 'cover: covers/wanted.png');

    await build(false);

    expect(await heldFiles()).toEqual(['kept.png', 'wanted.png']);
  });

  it('prunes a held copy once its book stops publishing it', async () => {
    await cover('big.png', await image(1400, 2100));
    await note('Big', 'cover: covers/big.png');
    await build(true);
    expect(await heldFiles()).toEqual(['big.png']);

    await note('Big', 'private: true', 'cover: covers/big.png');
    await build(true);

    expect(await heldFiles()).toEqual([]);
  });

  it('prunes a held copy once its cover shrinks inside the shelf cap', async () => {
    await cover('big.png', await image(1400, 2100));
    await note('Big', 'cover: covers/big.png');
    await build(true);

    await cover('big.png', await image(300, 450));
    await build(true);

    expect(await heldFiles()).toEqual([]);
  });

  it('leaves a held folder alone when no library.json says this tool stages there', async () => {
    await mkdir(join(assets, 'held-covers'), { recursive: true });
    await writeFile(join(assets, 'held-covers', 'theirs.png'), 'x');
    await note('Bare');

    await build(true);

    expect(await heldFiles()).toEqual(['theirs.png']);
    expect(warn.lines.join('\n')).toMatch(/held copies/);
  });

  it('prunes files only, never a folder', async () => {
    await note('Bare');
    await build(true);
    await mkdir(join(assets, 'held-covers', 'kept-dir'), { recursive: true });

    await build(true);

    expect(await heldFiles()).toEqual(['kept-dir']);
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
