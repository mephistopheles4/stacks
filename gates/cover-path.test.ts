/**
 * G10 — one cover-path rule, one implementation.
 *
 * `covers/cover-path.test.ts` proves the shared helper is correct. This proves
 * it is the only one, which is the half that actually failed: the rule was
 * implemented twice, the second copy was wrong on Windows, and the comment
 * above it asserted it was not.
 *
 * Both assertions below are structural, so they hold for code nobody has
 * written yet — the next time someone needs the filename out of a `cover:`
 * value, the gate makes them find the helper instead of reaching for the
 * obvious thing and getting the platform-dependent answer.
 *
 * See docs/gates.md, row G10 (cover-path).
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expectFound, filesUnder, readRepoFile, REPO_ROOT } from './repo.ts';

/** The one module allowed to define how a `cover:` value becomes a path. */
const OWNER = 'packages/core/src/covers/cover-path.ts';

/**
 * Files permitted to import `basename` from `node:path` despite the rule.
 *
 * Empty on purpose. `node:path`'s `basename` is platform-aware, which is the
 * exact property that made the original bug invisible on one OS and live on the
 * other, so reaching for it near a vault-supplied path is the mistake worth
 * catching. A genuine unrelated need can be added here — as a deliberate line
 * in a diff, which is the point.
 */
const MAY_IMPORT_BASENAME: readonly string[] = [];

function sourceFiles(): string[] {
  return filesUnder('packages', ['.ts']).filter((path) => !path.endsWith('.test.ts'));
}

describe('G10 — one cover-path implementation', () => {
  it('scans a plausible number of source files', () => {
    expectFound(sourceFiles(), 'source files to scan', 20);
  });

  it('is the only module that derives a filename from a cover value', () => {
    const offenders = sourceFiles().filter((path) => {
      if (path === OWNER) return false;
      const contents = readRepoFile(path);
      // The shape of the original defect: split on one separator, take the tail.
      return /\.split\(\s*['"][/\\]['"]\s*\)\s*(?:\.pop\(\)|\[)/.test(contents);
    });

    expect(
      offenders,
      `these re-implement the cover filename rule instead of using ${OWNER}: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it("does not import node:path's platform-aware basename", () => {
    const allowed = new Set(MAY_IMPORT_BASENAME);
    const offenders = sourceFiles().filter((path) => {
      if (allowed.has(path)) return false;
      const contents = readRepoFile(path);
      return /import\s*\{[^}]*\bbasename\b[^}]*\}\s*from\s*['"]node:path['"]/.test(contents);
    });

    expect(
      offenders,
      `import basename from node:path — use ${OWNER} instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    // An allowlist that outlives the file it excused silently accumulates
    // permissions. Every entry must still exist and still need the exemption.
    for (const path of MAY_IMPORT_BASENAME) {
      expect(existsSync(join(REPO_ROOT, path)), `allowlisted file no longer exists: ${path}`).toBe(
        true,
      );
      expect(
        /import\s*\{[^}]*\bbasename\b[^}]*\}\s*from\s*['"]node:path['"]/.test(readRepoFile(path)),
        `${path} is allowlisted but no longer imports basename — drop it from the list`,
      ).toBe(true);
    }
  });

  it('routes both real call sites through the helper', () => {
    for (const path of ['packages/core/src/publish.ts', 'packages/core/src/enrich.ts']) {
      expect(readRepoFile(path), `${path} should use ${OWNER}`).toMatch(
        /from\s*['"]\.{1,2}\/(?:covers\/)?cover-path\.ts['"]/,
      );
    }
  });
});
