/**
 * G2 — a public build is private, and coherent.
 *
 * `pnpm gate:public` already greps the built output for a canary planted in a
 * note body, and refuses to pass if that canary is missing from the fixture
 * vault. It is a good gate that structurally cannot see three things: it reads
 * the *contents* of *text* files, so a filename is never inspected and a JPEG
 * never opened, and its forbidden list is three known-bad patterns rather than
 * an allowlist, so anything private sitting in a permitted field passes by
 * construction.
 *
 * This covers what that cannot. The staging assertions matter most: the folder
 * used to be additive, so building from a real vault and then running either
 * gate — both of which stage the *fixture* vault into the same folder — left
 * every real cover behind under a filename slugged from a real book title,
 * while the gate reported the build clean.
 *
 * See docs/gates.md, row G2 (public-build).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { parseNote } from '../packages/core/src/frontmatter.ts';
import { buildLibrary } from '../packages/core/src/library.ts';
import { publish } from '../packages/core/src/publish.ts';
import { NOTE_BODY_CANARY, THOUGHTS_SHIP_PHRASE } from '../scripts/lib/public-build.ts';
import { walk } from '../scripts/lib/walk.ts';
import { REPO_ROOT } from './repo.ts';

// Imported rather than declared. It was an independent literal here and in
// `check-public-build.ts`, and a canary that drifts between where it is planted
// and where it is searched for is worse than none: both halves keep passing.
const CANARY = NOTE_BODY_CANARY;
const SHIP_PHRASE = THOUGHTS_SHIP_PHRASE;
const FIXTURE_VAULT = join(REPO_ROOT, 'fixtures', 'vault');

let assets: string;

beforeEach(async () => {
  assets = await mkdtemp(join(tmpdir(), 'stacks-public-build-'));
});

afterEach(async () => {
  await rm(assets, { recursive: true, force: true });
});

async function publishFixtures(): Promise<{ json: string; covers: string[] }> {
  const vault = new ObsidianAdapter(FIXTURE_VAULT);
  const result = await publish(await vault.listBooks(), vault, assets, { isPublic: true });
  return {
    json: await readFile(result.libraryPath, 'utf8'),
    covers: await readdir(join(assets, 'covers')),
  };
}

describe('G2 — note bodies stay private', () => {
  it('has the canary in the fixture vault to begin with', async () => {
    // Without this the body assertion below passes no matter what ships.
    const notes = await readdir(join(FIXTURE_VAULT, 'Library'));
    const bodies = await Promise.all(
      notes
        .filter((name) => name.endsWith('.md'))
        .map((name) => readFile(join(FIXTURE_VAULT, 'Library', name), 'utf8')),
    );
    expect(bodies.some((body) => body.includes(CANARY))).toBe(true);
  });

  it('never carries a note body into library.json', async () => {
    const { json } = await publishFixtures();
    expect(json).not.toContain(CANARY);
  });

  it('does carry frontmatter values, which is the boundary', async () => {
    // Asserted rather than assumed, because it is the half people get wrong.
    // Everything in frontmatter is public by design — titles, authors, reading
    // dates, tags, ratings. The private/public line is the `---` fence, not a
    // list of forbidden words, and `gate:public`'s three patterns can only ever
    // catch the words someone thought of.
    const { json } = await publishFixtures();
    const shipped = JSON.parse(json) as { books: { title: string; tags: string[] }[] };

    expect(shipped.books.length).toBeGreaterThan(0);
    expect(shipped.books.some((book) => book.title.length > 0)).toBe(true);
  });

  it('never ships a book marked private', async () => {
    const { json } = await publishFixtures();
    const shipped = JSON.parse(json) as { books: { title: string; private?: boolean }[] };

    expect(shipped.books.every((book) => book.private !== true)).toBe(true);
    expect(shipped.books.map((book) => book.title)).not.toContain('A Book Kept Back');
  });

  it('has a private book in the fixture vault to hold that against', async () => {
    // Without this the assertion above passes over a vault that never had one,
    // which is the same trap the canary check exists to close.
    const vault = new ObsidianAdapter(FIXTURE_VAULT);
    const books = await vault.listBooks();

    expect(
      books.some((book) => book.private === true),
      'fixtures/vault needs a `private: true` note or the filter is untested',
    ).toBe(true);
  });

  it('exposes no vault path', async () => {
    const { json } = await publishFixtures();
    expect(json).not.toContain('sourcePath');
    expect(json).not.toContain('Library/');
    expect(json).not.toContain('.md');
  });
});

/**
 * The fixture notes that plant the split's cases, by file name.
 *
 * Existing notes rather than new ones, because two tests pin the vault's book
 * count ([#367](https://github.com/mephistopheles4/stacks/issues/367), decision
 * 10). Every case here is one #367 or the spec's §5 `split` row names; every
 * other boundary case belongs to the extractor's unit tests.
 */
const PLANTED = {
  /** The ship phrase in `## Thoughts`, and the canary below it under `## Notes`. */
  split: 'The Tidal Engine.md',
  /** `private: true`, with the canary inside its Thoughts. */
  private: 'A Book Kept Back.md',
  /** `status: wishlist`, with the canary inside its Thoughts. */
  wishlist: 'The Quiet Protocol.md',
  /** An embed in its Thoughts, which withholds the whole section. */
  embed: 'Lantern Work.md',
  /** A fence opened in its Thoughts and never closed, the canary under `## Notes` below it. */
  unclosedFence: 'Nine Ways of Seeing a Warehouse.md',
  /** No Thoughts at all, and the canary under `## Notes`. */
  noThoughts: 'Compilers for the Impatient.md',
} as const;

/** A fence opener or closer, as CommonMark allows it indented. */
const FENCE = /^ {0,3}(?:```|~~~)/;

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURE_VAULT, 'Library', name), 'utf8');
}

/**
 * A note's `## Thoughts` section and what follows it, split at the next `#` or
 * `##` heading.
 *
 * ⚠️ **Deliberately crude, and not the extractor.** It knows nothing of fences,
 * comments or setext headings, which is why it is safe here: it reads only the
 * fixtures above, to prove each still plants what its case needs. The
 * extractor's boundary is its own unit tests' business (#367, decision 6).
 */
function thoughtsOf(note: string): { section: string; after: string } | undefined {
  const lines = note.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === '## Thoughts');
  if (start === -1) return undefined;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
  return end === -1
    ? { section: rest.join('\n'), after: '' }
    : { section: rest.slice(0, end).join('\n'), after: rest.slice(end).join('\n') };
}

/**
 * Every fixture book's id, keyed by note file name.
 *
 * Read off a local `buildLibrary`, which keeps `sourcePath`, because `idFor` is
 * private. The id is the same in either build: it hashes the ISBN or the vault
 * path, never the mode.
 */
async function fixtureIds(): Promise<ReadonlyMap<string, string>> {
  const vault = new ObsidianAdapter(FIXTURE_VAULT);
  const library = buildLibrary(await vault.listBooks(), { isPublic: false });
  return new Map(
    library.books.flatMap((book) =>
      book.sourcePath === undefined ? [] : [[basename(book.sourcePath), book.id] as const],
    ),
  );
}

describe('G2 — the Thoughts split is planted before anything is asserted about it', () => {
  // The vacuity guard (#367, decision 9). Measured on that ticket, not argued: a
  // `test.fails` reading a deleted fixture reports an expected failure and
  // passes. So these are armed, and each one fails naming the case it lost.

  it('has the ship phrase inside `## Thoughts` and the canary below the section', async () => {
    const thoughts = thoughtsOf(await readFixture(PLANTED.split));

    expect(thoughts, `${PLANTED.split} needs a \`## Thoughts\` section`).toBeDefined();
    expect(thoughts?.section).toContain(SHIP_PHRASE);
    expect(thoughts?.section, 'the canary belongs below the section, not in it').not.toContain(
      CANARY,
    );
    expect(thoughts?.after).toContain(CANARY);
  });

  it('has a private book and a wishlist book, each with the canary in its Thoughts', async () => {
    const vault = new ObsidianAdapter(FIXTURE_VAULT);
    const books = await vault.listBooks();
    const named = (name: string) => books.find((book) => basename(book.sourcePath) === name);

    expect(named(PLANTED.private)?.private).toBe(true);
    expect(named(PLANTED.wishlist)?.status).toBe('wishlist');
    for (const name of [PLANTED.private, PLANTED.wishlist]) {
      expect(thoughtsOf(await readFixture(name))?.section, name).toContain(CANARY);
    }
  });

  it('has an embed inside a `## Thoughts` section, with the canary beside it', async () => {
    const thoughts = thoughtsOf(await readFixture(PLANTED.embed));

    expect(thoughts?.section).toMatch(/!\[\[[^\]]+\]\]/);
    expect(thoughts?.section).toContain(CANARY);
  });

  it('has a fence opened in `## Thoughts` and never closed, with the canary below', async () => {
    const thoughts = thoughtsOf(await readFixture(PLANTED.unclosedFence));
    const opened = (thoughts?.section ?? '').split('\n').filter((line) => FENCE.test(line));
    const later = (thoughts?.after ?? '').split('\n').filter((line) => FENCE.test(line));

    expect(opened.length % 2, 'an even count of fence lines closes the fence it opened').toBe(1);
    expect(later, 'a fence line further down would close it').toEqual([]);
    expect(thoughts?.after).toContain(CANARY);
  });

  it('has a book with no Thoughts and the canary in its body', async () => {
    const note = await readFixture(PLANTED.noThoughts);

    expect(thoughtsOf(note)).toBeUndefined();
    expect(note).toContain(CANARY);
  });
});

describe.each([
  { mode: 'public', isPublic: true },
  { mode: 'local', isPublic: false },
])('G2 — the Thoughts split, in a $mode build', ({ isPublic }) => {
  // Both builds, because one extractor serves both (#367, decision 7) and the
  // notes stage asks the public shelf's predicate whatever the mode (spec §3.2).

  async function publishSplit(): Promise<{ json: string; ids: ReadonlyMap<string, string> }> {
    const vault = new ObsidianAdapter(FIXTURE_VAULT);
    const result = await publish(await vault.listBooks(), vault, assets, { isPublic });
    return { json: await readFile(result.libraryPath, 'utf8'), ids: await fixtureIds() };
  }

  it('ships the split book, with the id its notes file is named for', async () => {
    // Armed, and the precondition the expected failure below leans on.
    // `test.fails` passes on *any* failure, so a split book missing from the
    // build would let it pass for the wrong reason, and the extractor that makes
    // it pass would never turn it red.
    const { json, ids } = await publishSplit();
    const id = ids.get(PLANTED.split);
    const shipped = JSON.parse(json) as { books: { id: string }[] };

    expect(id).toBeDefined();
    expect(shipped.books.map((book) => book.id)).toContain(id);
  });

  it('stages the canary in no file at all', async () => {
    await publishSplit();

    const leaked: string[] = [];
    for (const file of walk(assets)) {
      if ((await readFile(file)).includes(CANARY)) leaked.push(relative(assets, file));
    }
    expect(leaked, 'staged files carrying note-body text').toEqual([]);
  });

  it('carries no Thoughts text into library.json', async () => {
    // Invariant 2's absolute half: whatever ships as a notes file, the index
    // never carries body text, in any build.
    const { json } = await publishSplit();
    expect(json).not.toContain(SHIP_PHRASE);
  });

  it('stages no notes file for any book but the split one', async () => {
    // One assertion for five planted cases: the private and wishlist books, the
    // embed, the unclosed fence and the book with no Thoughts. A filtered book
    // has no id in a public `library.json` to look a file up by, so the folder
    // is held to an allowlist of one rather than searched for each case.
    const { ids } = await publishSplit();
    const allowed = `${ids.get(PLANTED.split) ?? PLANTED.split}.json`;
    const fixtureFor = new Map([...ids].map(([name, id]) => [`${id}.json`, name]));

    const notesDir = join(assets, 'notes');
    const strays = walk(notesDir)
      .map((file) => relative(notesDir, file).split('\\').join('/'))
      .filter((name) => name !== allowed)
      .map((name) => `${name} (${fixtureFor.get(name) ?? 'no fixture'})`);

    expect(strays, 'notes files no planted case may produce').toEqual([]);
  });

  /**
   * ⚠️ **Expected to fail until the extractor exists, and it arms itself.**
   *
   * The presence half of the split, as a vitest `test.fails` (#367, decision
   * 2): it runs on every CI run and is recorded as an expected failure. The
   * pull request that adds the extractor makes it pass, which turns this red by
   * itself, so that pull request must flip it to `it`. Nothing relies on
   * somebody remembering to arm it. The armed precondition above is what keeps
   * it from failing for the wrong reason.
   */
  it.fails("ships the Thoughts in the split book's notes file", async () => {
    const { ids } = await publishSplit();
    const file = join(assets, 'notes', `${ids.get(PLANTED.split) ?? PLANTED.split}.json`);
    const notes = JSON.parse(await readFile(file, 'utf8')) as { paragraphs: string[] };

    expect(notes.paragraphs.join('\n')).toContain(SHIP_PHRASE);
  });
});

describe('G2 — the staged folder is exactly this build', () => {
  it('stages no cover that no shipped book references', async () => {
    const { json, covers } = await publishFixtures();
    const shipped = JSON.parse(json) as { books: { cover?: string }[] };

    const referenced = new Set(
      shipped.books
        .map((book) => book.cover)
        .filter((cover): cover is string => cover !== undefined)
        .map((cover) => cover.replace(/^covers\//, '')),
    );

    expect(covers.length).toBeGreaterThan(0);
    const orphans = covers.filter((name) => !referenced.has(name));
    expect(
      orphans,
      `staged covers that no book in library.json points at: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('removes a cover left behind by an earlier build', async () => {
    // The actual regression. A real-vault build followed by a fixture-vault
    // gate used to leave the real covers in place, each filename a slug of a
    // real book title, and report the result clean.
    const coversDir = join(assets, 'covers');
    await publishFixtures();
    await writeFile(join(coversDir, 'a-real-book-you-actually-read.jpg'), 'not a real jpeg');

    const { covers } = await publishFixtures();
    expect(covers).not.toContain('a-real-book-you-actually-read.jpg');
  });

  it('refuses to prune a folder it has never staged into', async () => {
    // Pruning is the only thing in the build that removes data, and `--assets`
    // is a user-supplied flag: `--assets ~/Pictures` must not empty
    // `~/Pictures/covers`. The signal that a folder is one stacks stages into
    // is a library.json left by a previous run, and that is written *after*
    // covers are copied — so a first run into someone else's folder is safe.
    const foreign = await mkdtemp(join(tmpdir(), 'stacks-not-ours-'));
    try {
      await mkdir(join(foreign, 'covers'), { recursive: true });
      await writeFile(join(foreign, 'covers', 'holiday-photo.jpg'), 'someone else’s file');

      const vault = new ObsidianAdapter(FIXTURE_VAULT);
      await publish(await vault.listBooks(), vault, foreign, { isPublic: true });

      expect(await readdir(join(foreign, 'covers'))).toContain('holiday-photo.jpg');
    } finally {
      await rm(foreign, { recursive: true, force: true });
    }
  });

  it('references every staged cover from a book, and every book cover is staged', async () => {
    const { json, covers } = await publishFixtures();
    const shipped = JSON.parse(json) as { books: { cover?: string }[] };
    const referenced = shipped.books
      .map((book) => book.cover)
      .filter((cover): cover is string => cover !== undefined)
      .map((cover) => cover.replace(/^covers\//, ''));

    // Both directions. The fixture vault deliberately contains a book whose
    // cover file is absent, so "every reference has a file" is asserted only
    // for the ones that were actually copied.
    for (const name of covers) expect(referenced).toContain(name);
  });
});

describe('G2 — cover provenance', () => {
  it('records where a cover came from when one is fetched', async () => {
    // Fixture covers are committed rather than downloaded, so they carry no
    // source — which is the honest "absent means nobody looked" case. What is
    // asserted here is that the key survives the trip into library.json at all,
    // because a public build makes provider-dependent decisions off it.
    const vault = new ObsidianAdapter(FIXTURE_VAULT);
    const books = await vault.listBooks();
    // Explicitly a book that ships — indexing blindly picks up whichever note
    // sorts first, which is now the `private: true` fixture, and a filtered
    // book proves nothing about what reaches library.json.
    const shipping = books.find(
      (book) => book.status !== 'wishlist' && book.private !== true && book.cover !== undefined,
    );
    expect(shipping).toBeDefined();

    const result = await publish([{ ...shipping!, coverSource: 'open-library' }], vault, assets, {
      isPublic: true,
    });
    expect(result.library.books[0]?.coverSource).toBe('open-library');
  });

  it('drops an unrecognised cover_source at the parse edge', () => {
    // A typo must not read as a permission. The guard has to be at the parse
    // edge, because that is the only boundary a hand-edited note crosses —
    // everything downstream takes a BookRecord as given.
    const note = (value: string): string =>
      `---\ntype: book\ntitle: A Book\ncover: covers/a.png\ncover_source: ${value}\n---\n\nbody\n`;

    const good = parseNote(note('open-library'), 'good.md');
    expect(good.kind).toBe('book');
    if (good.kind === 'book') expect(good.record.coverSource).toBe('open-library');

    for (const typo of ['open-libary', 'openlibrary', 'yes', 'true', '']) {
      const parsed = parseNote(note(typo), 'typo.md');
      expect(parsed.kind, `\`cover_source: ${typo}\` should still parse as a book`).toBe('book');
      if (parsed.kind !== 'book') continue;
      expect(
        parsed.record.coverSource,
        `\`cover_source: ${typo}\` was kept — an unrecognised value must not become a permission`,
      ).toBeUndefined();
    }
  });
});
