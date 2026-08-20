/**
 * G1 — all vault access goes through the adapter (invariant 4).
 *
 * Nothing outside `packages/core/src/adapters/` may read or write vault files
 * directly. The invariant exists so that a second adapter stays possible: the
 * day someone writes a Logseq adapter, every path that touches a note has to be
 * behind the interface, or the new adapter is a lie and half the tool keeps
 * reading YAML off the disk.
 *
 * This gate is **green today**, and that is the point. Its whole value is
 * protecting code that does not exist yet — the invariant is easy to hold while
 * one person remembers it and impossible to hold once nobody does. Every other
 * row in docs/gates.md was written after a rule had already quietly broken;
 * this one is written before.
 *
 * Two halves, and the second is what stops the list rotting:
 *
 *   1. no unlisted file imports `fs`;
 *   2. every allowlist entry still resolves to a file that exists **and** still
 *      actually imports `fs`.
 *
 * Without (2) the allowlist only ever grows: a file gets refactored to go
 * through the adapter, its entry stays, and the permission it was granted sits
 * there waiting for the next file that happens to take the same path.
 *
 * Scope note: this scans `packages/` and `scripts/`. It does **not** scan
 * `gates/`, whose own tests build temp vaults with `node:fs/promises` on
 * purpose — G4 could not test the adapter without one. Widening the scan to
 * `gates/` would detonate on the gates themselves.
 *
 * See docs/gates.md, row G1 (adapter-boundary).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectFound, filesUnder, REPO_ROOT, readRepoFile } from './repo.ts';

/**
 * Any specifier resolving to Node's filesystem module, however it is reached:
 * `from 'node:fs'`, the un-prefixed `'fs'`, either `/promises` variant, a bare
 * side-effect `import`, a dynamic `import(...)` and a CJS `require(...)`.
 *
 * Anchoring to `from` at line start would have missed all but the first, and a
 * boundary this quiet is exactly the kind a rewrite slips through.
 */
const FS_IMPORT = /(?:from|import|require)\s*\(?\s*['"]((?:node:)?fs(?:\/promises)?)['"]/;

/** Where the adapter lives — the one place fs access is the whole job. */
const ADAPTER_DIR = 'packages/core/src/adapters/';

/**
 * Reviewed exceptions: files that touch the filesystem for something that is
 * *not* vault note access, plus the scripts, which exist to write files.
 *
 * Each line is a standing claim about that file. When the reverse-assert below
 * goes red on one, the honest fix is usually to delete the entry, not to
 * restore the import.
 */
const ALLOWED = [
  // Reads `.env` before anything else exists to read it through.
  'packages/cli/src/env.ts',
  // Writes `library.json` and reads it back — a build artifact, not a note.
  'packages/cli/src/index.ts',
  // Writes cover bytes into the directory `vault.coverDir()` names, so the
  // adapter still owns *where*; only the bytes land outside it.
  'packages/core/src/covers/cache-cover.ts',
  // The `.cache/` of API responses, so tests and rebuilds never re-hit a
  // provider. Nothing here is vault data.
  'packages/core/src/metadata/http.ts',
  // Stages the public folder for `astro build` to fold into `dist/`.
  'packages/core/src/publish.ts',
  // Loads captured API fixtures for the tests. Read-only, fixtures only.
  'packages/core/src/test-support.ts',
  // `fs.watch` *observes* the vault rather than reading a note: it learns that
  // a path changed and hands the path to the adapter, which does the reading.
  // The entry a reader is most likely to challenge, so: watching is not access.
  'packages/core/src/watch.ts',
  // Everything under scripts/ writes files for a living — fixtures, captured
  // API responses, screenshots, the public-build check. None of them parse a
  // note; the two that need books shell out to the CLI.
  'scripts/capture-api-fixtures.ts',
  // Sibling of the above, and the same permission for the same reason: it
  // writes one file into `fixtures/api/`. It calls `lookup()`, which is the
  // metadata layer and has never known what a vault is — the books it asks
  // about are a hardcoded list in `gates/recall-corpus.ts`, not notes it read.
  'scripts/capture-lookup-recall.ts',
  'scripts/check-public-build.ts',
  // Reads the built `dist/` back to pre-flight it before uploading. Its `fs`
  // use is entirely on that folder: the real vault it shells out to the CLI
  // for, and the fixture vault it reads through `ObsidianAdapter` — which is
  // this invariant working rather than an exception to it. Nothing here parses
  // a note.
  'scripts/deploy.ts',
  // Reads a *built* folder — `dist/`, assembled by `astro build` — to answer
  // whether it is safe to publish. The two scripts above are its callers. It
  // has never seen a vault and could not find one: it is handed a directory and
  // does not know which vault produced it, which is the property that lets G20
  // point it at a synthetic folder in a temp directory.
  'scripts/lib/public-build.ts',
  // Walks a directory and returns the files in it. Shared by the two above; it
  // knows nothing about vaults, notes or builds, and the callers own what they
  // point it at.
  'scripts/lib/walk.ts',
  'scripts/make-50-book-fixture.ts',
  'scripts/make-fixture-covers.ts',
  // Rasterises the committed brand SVGs into the icon PNGs. Its inputs are two
  // files it names literally and its output is `packages/site/public/` — it
  // takes no path from anywhere and has no way to reach a vault.
  'scripts/make-icons.ts',
  // Crops the render gate's screenshot into the README's image. Its only input
  // is `artifacts/shelf.png`, which the gate renders from the *fixture* vault —
  // it checks that file exists and never looks at a vault at all.
  'scripts/make-readme-image.ts',
  // Reads the `.prom` files `emit-metrics.ts` wrote and copies them into a
  // throwaway git worktree. Never opens the vault — it does not know what a book
  // is; `git` does all of its real work, through `lib/git.ts` and `lib/run.ts`.
  'scripts/commit-metrics.ts',
  // Writes one CI run's `.prom` record. The only thing it reads from disk is a
  // Stryker report, through `lib/mutation-score.ts`; the only thing it writes is
  // a file under `metrics/`, which is gitignored on main and lives on the orphan
  // `metrics` branch. It does not know what a book is.
  'scripts/emit-metrics.ts',
  // Reads the declared mutation scopes and the report a Stryker run wrote, and
  // tallies them. Neither is vault data and neither is a path it derives — one
  // is a fixed filename, the other is passed in. It writes nothing.
  'scripts/lib/mutation-score.ts',
  // Lists the *paths* of source files under `packages/`, `scripts/` and
  // `gates/`, so G38 can ask whether every one of them is in a declared
  // mutation scope. It opens none of them — the walk reads directory entries
  // and file names and nothing else — and the root it walks is a parameter, so
  // it does not know which tree it was pointed at, let alone where a vault is.
  'scripts/lib/scope-check.ts',
  // Imports the `.prom` records CI wrote into the local trend store, and writes
  // surface D's own row beside them. The only vault-derived thing it opens is
  // the *published* `dist/` — `index.html` for its build stamp and
  // `library.json` for what each cover weighs — which is the artifact, never the
  // vault. It does not know what a book is.
  'scripts/trend-sync.ts',
  // `scripts/mutation-scopes.ts` was here and is gone: its filesystem access
  // moved into `lib/mutation-score.ts` with the arithmetic, and the rot-catcher
  // below went red on the spent permission. That is the gate working.
  'scripts/smoke-render.ts',
  // Checks whether a worktree's directory and the shared `.env` are there
  // before creating one. Never opens the vault — it does not know what a book
  // is; `git` and `pnpm` do all of its real work.
  'scripts/worktree.ts',
] as const;

/**
 * Every `.ts` this invariant governs: `packages/` and `scripts/`, minus the
 * adapters themselves and minus tests, which build temp vaults on disk because
 * that is the only honest way to test a thing that writes to disk.
 */
function governedFiles(): string[] {
  return [...filesUnder('packages', ['.ts']), ...filesUnder('scripts', ['.ts'])].filter(
    (path) => !path.endsWith('.test.ts') && !path.startsWith(ADAPTER_DIR),
  );
}

function importsFs(path: string): boolean {
  return FS_IMPORT.test(readRepoFile(path));
}

describe('G1 — adapter boundary', () => {
  it('scans a plausible number of files', () => {
    // A `filesUnder` that walked nothing would report zero offenders, and the
    // gate would go permanently green while checking nothing at all.
    expectFound(governedFiles(), 'source files governed by invariant 4', 20);
  });

  it('lets no unlisted file reach the filesystem directly', () => {
    const allowed = new Set<string>(ALLOWED);
    const offenders = governedFiles().filter((path) => !allowed.has(path) && importsFs(path));

    expect(
      offenders,
      'these import fs directly but are outside packages/core/src/adapters/ and off the ' +
        `reviewed allowlist: ${offenders.join(', ')}. Vault access belongs behind VaultAdapter ` +
        '(invariant 4); if the access genuinely is not vault data, add the file to ALLOWED ' +
        'with a one-line justification.',
    ).toEqual([]);
  });

  it('keeps every allowlist entry pointing at a file that exists', () => {
    const missing = ALLOWED.filter((path) => !existsSync(join(REPO_ROOT, path)));

    expect(
      missing,
      `allowlisted but no longer in the tree: ${missing.join(', ')}. Delete the entry — a ` +
        'permission granted to a file nobody can find is a permission waiting to be inherited ' +
        'by the next file that takes the same path.',
    ).toEqual([]);
  });

  it('keeps every allowlist entry on a file that still imports fs', () => {
    // The rot-catcher. Without it the list only grows: a file moves behind the
    // adapter, its exception survives the refactor, and the boundary quietly
    // has a hole in it that nobody granted.
    //
    // Two entries here — publish.ts and cli/src/index.ts — are under active
    // change elsewhere. If one of them stops importing fs, this going red is
    // the gate working: drop the line.
    const present = new Set(ALLOWED.filter((path) => existsSync(join(REPO_ROOT, path))));
    const stale = [...present].filter((path) => !importsFs(path));

    expect(
      stale,
      `allowlisted but no longer imports fs: ${stale.join(', ')}. The exception is spent; ` +
        'remove it rather than leaving the permission lying about.',
    ).toEqual([]);
  });

  it('still finds fs in the adapter itself, so the detector is not broken', () => {
    // Every assertion above is satisfied by a regex that matches nothing. This
    // is the one place fs access is certain, so it is the control.
    expect(importsFs('packages/core/src/adapters/obsidian-adapter.ts')).toBe(true);
  });
});
