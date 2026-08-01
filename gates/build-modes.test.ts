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
 * See docs/gates.md, row G11.
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
} as const;

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
  it('produces the same books in the same order either way', async () => {
    const { local, publicBuild } = await bothModes();

    expect(local.length).toBeGreaterThan(0);
    expect(publicBuild.length).toBe(local.length);
    expect(publicBuild.map((book) => book['id'])).toEqual(local.map((book) => book['id']));
  });

  it('differs only on the keys the difference is documented for', async () => {
    const { local, publicBuild } = await bothModes();
    const allowed = new Set(Object.keys(INTENDED_DIFFERENCES));

    for (const [index, localBook] of local.entries()) {
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
