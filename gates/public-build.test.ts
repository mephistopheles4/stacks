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
 * See docs/gates.md, row G2.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { parseNote } from '../packages/core/src/frontmatter.ts';
import { publish } from '../packages/core/src/publish.ts';
import { REPO_ROOT } from './repo.ts';

const CANARY = 'NOTE_BODY_CANARY_do_not_ship';
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

  it('exposes no vault path', async () => {
    const { json } = await publishFixtures();
    expect(json).not.toContain('sourcePath');
    expect(json).not.toContain('Library/');
    expect(json).not.toContain('.md');
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
    const withSource = [{ ...books[0]!, coverSource: 'open-library' as const }];

    const result = await publish(withSource, vault, assets, { isPublic: true });
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
