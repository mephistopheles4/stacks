/**
 * G11 — the two build modes differ only where they are meant to.
 *
 * `stacks build` and `stacks build --public` produce the same `library.json`
 * shape by different routes, and the difference between them is deliberate:
 * a public build strips `sourcePath` and stamps `coverAspect` measured off the
 * covers it just staged, while a local build "is just the index" and does
 * neither.
 *
 * That difference was never written down anywhere and never checked, which made
 * it impossible to tell a design decision from an oversight — a review of this
 * repo read the missing `coverAspect` as a rendering bug, and it took tracing
 * `dev-watch.ts` to establish that the dev flow uses `--public` and is fine.
 * Nobody should have to trace that again, and if a *third* difference appears
 * by accident, this is what says so.
 *
 * See docs/gates.md, row G11 (build-modes).
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLibrary } from '../packages/core/src/library.ts';
import { publish } from '../packages/core/src/publish.ts';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { REPO_ROOT } from './repo.ts';

/**
 * Keys a public build is allowed to differ on, and why.
 *
 * Anything else appearing here is drift: either a field leaked into a public
 * build that should have been stripped, or a derived field silently stopped
 * being derived.
 */
const INTENDED_DIFFERENCES = {
  sourcePath: 'a vault path; stripped from public builds (invariant 2)',
  coverAspect: 'measured off the staged covers, which only a public build has',
  cover: 'rewritten to covers/<filename> so a public build is always same-origin',
} as const;

/**
 * A public build also drops whole books, for two unrelated reasons: wishlist
 * ones because you do not own them, and `private: true` ones because the owner
 * said no. Kept separate from the key list above because these are differences
 * in the *set*, not in a field, and the two are checked differently.
 */
function shipsPublicly(book: Record<string, unknown>): boolean {
  return book['status'] !== 'wishlist' && book['private'] !== true;
}

const FIXTURE_VAULT = join(REPO_ROOT, 'fixtures', 'vault');

async function bothModes(): Promise<{
  local: Record<string, unknown>[];
  publicBuild: Record<string, unknown>[];
}> {
  const vault = new ObsidianAdapter(FIXTURE_VAULT);
  const books = await vault.listBooks();

  const assets = await mkdtemp(join(tmpdir(), 'stacks-build-modes-'));
  try {
    const local = buildLibrary(books, { isPublic: false }).books as unknown as Record<
      string,
      unknown
    >[];
    const result = await publish(books, vault, assets, { isPublic: true });
    return { local, publicBuild: result.library.books as unknown as Record<string, unknown>[] };
  } finally {
    await rm(assets, { recursive: true, force: true });
  }
}

describe('G11 — build modes', () => {
  it('ships every shipping book, in the same order, dropping the rest', async () => {
    const { local, publicBuild } = await bothModes();

    const shipping = local.filter(shipsPublicly);
    expect(shipping.length).toBeGreaterThan(0);

    // The fixture vault must actually contain both kinds, or the assertions
    // below hold over a set nothing was ever removed from.
    expect(
      local.some((book) => book['status'] === 'wishlist'),
      'need a wishlist fixture',
    ).toBe(true);
    expect(
      local.some((book) => book['private'] === true),
      'need a private fixture',
    ).toBe(true);

    expect(publicBuild.map((book) => book['id'])).toEqual(shipping.map((book) => book['id']));
  });

  it('never ships a book you do not own, or one marked private', async () => {
    const { publicBuild } = await bothModes();
    expect(publicBuild.every((book) => book['status'] !== 'wishlist')).toBe(true);
    expect(publicBuild.every((book) => book['private'] !== true)).toBe(true);
  });

  it('differs only on the keys the difference is documented for', async () => {
    const { local, publicBuild } = await bothModes();
    const allowed = new Set(Object.keys(INTENDED_DIFFERENCES));
    const shipping = local.filter(shipsPublicly);

    for (const [index, localBook] of shipping.entries()) {
      const publicBook = publicBuild[index];
      expect(publicBook).toBeDefined();
      if (publicBook === undefined) continue;

      const keys = new Set([...Object.keys(localBook), ...Object.keys(publicBook)]);
      for (const key of keys) {
        if (allowed.has(key)) continue;
        expect(
          publicBook[key],
          `book ${String(localBook['id'])}: "${key}" differs between build modes and is not a ` +
            `documented difference (${[...allowed].join(', ')})`,
        ).toEqual(localBook[key]);
      }
    }
  });

  it('points every public cover at the copy staged beside library.json', async () => {
    const { publicBuild } = await bothModes();
    const withCover = publicBuild.filter((book) => book['cover'] !== undefined);

    expect(withCover.length).toBeGreaterThan(0);
    for (const book of withCover) {
      // Not protocol-relative, not absolute, not a walk — an <img> src built
      // from this can only ever hit the site's own origin.
      expect(String(book['cover'])).toMatch(/^covers\/[^/\\]+$/);
    }
  });

  it('strips sourcePath from a public build and keeps it locally', async () => {
    const { local, publicBuild } = await bothModes();

    // Named explicitly: the check above only proves the two agree on every
    // *other* key, so it would stay green if this stopped being stripped.
    expect(local.some((book) => book['sourcePath'] !== undefined)).toBe(true);
    expect(publicBuild.every((book) => book['sourcePath'] === undefined)).toBe(true);
  });

  it('stamps coverAspect on a public build, for books whose cover shipped', async () => {
    const { publicBuild } = await bothModes();
    const withCover = publicBuild.filter((book) => book['cover'] !== undefined);

    expect(withCover.length, 'fixture vault should have books with covers').toBeGreaterThan(0);
    expect(withCover.some((book) => typeof book['coverAspect'] === 'number')).toBe(true);
  });
});
