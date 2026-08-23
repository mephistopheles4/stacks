/**
 * G9 — `.env.example` ↔ `process.env`.
 *
 * A variable the code needs and nobody knows to set is a deploy-only failure:
 * it works on the machine where it happens to be exported and nowhere else.
 * The reverse — a documented variable nothing reads — is the same drift facing
 * the other way, and it sends whoever reads the file hunting for a setting that
 * does nothing.
 *
 * See docs/gates.md, row G9 (env-contract).
 */

import { describe, expect, it } from 'vitest';
import { extractAll, expectFound, filesUnder, readRepoFile } from './repo.ts';

/** `process.env['KEY']` and `process.env.KEY`. Dynamic `process.env[key]` — the
 *  `.env` loader's own indirection — has no literal to capture, so it is
 *  naturally excluded rather than needing a special case. */
const ENV_READ = /process\.env(?:\[['"]([A-Z][A-Z0-9_]*)['"]\]|\.([A-Z][A-Z0-9_]*)\b)/;

/** `KEY=` at the start of a line, or commented out as `# KEY=`. A commented
 *  declaration still documents the variable; prose comments do not match. */
const EXAMPLE_DECLARATION = /^[ \t]*#?[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=/m;

/**
 * Variables supplied by the platform, not by this project's `.env`.
 *
 * `GITHUB_SHA` and `GITHUB_EVENT_NAME` are set by GitHub Actions on every run
 * and read by `scripts/commit-metrics.ts` for the commit subject on the
 * `metrics` branch. Documenting them in `.env.example` would be worse than
 * silent: that file is what a contributor copies to `.env` and fills in, and
 * these two are **never** set by hand — a value there would be a stale commit
 * message pretending to name a commit. Both are absent locally, which is why
 * the script falls back to `local` and `manual` rather than to `undefined`.
 */
const PROVIDED_BY_PLATFORM = new Set(['CI', 'NODE_ENV', 'GITHUB_SHA', 'GITHUB_EVENT_NAME']);

function keysReadInCode(): string[] {
  const sources = [...filesUnder('packages', ['.ts']), ...filesUnder('scripts', ['.ts'])].filter(
    (path) => !path.endsWith('.test.ts'),
  );
  expectFound(sources, 'source files to scan', 20);

  const keys = new Set<string>();
  for (const path of sources) {
    const contents = readRepoFile(path);
    // Two alternations, so pull both capture groups.
    for (const match of contents.matchAll(new RegExp(ENV_READ.source, 'g'))) {
      const key = match[1] ?? match[2];
      if (key !== undefined && !PROVIDED_BY_PLATFORM.has(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

function keysDocumented(): string[] {
  return extractAll(readRepoFile('.env.example'), EXAMPLE_DECLARATION);
}

describe('G9 — env contract', () => {
  it('extracts a plausible number of keys from both sides', () => {
    // Without this the gate green-washes: if either pattern stopped matching,
    // "every key read is documented" would hold over an empty set.
    expectFound(keysReadInCode(), 'environment variables read in code', 2);
    expectFound(keysDocumented(), 'environment variables documented in .env.example', 2);
  });

  it('documents every environment variable the code reads', () => {
    const documented = new Set(keysDocumented());
    const undocumented = keysReadInCode().filter((key) => !documented.has(key));

    expect(
      undocumented,
      `read by the code but absent from .env.example: ${undocumented.join(', ')}`,
    ).toEqual([]);
  });

  it('reads every environment variable .env.example documents', () => {
    const read = new Set(keysReadInCode());
    const unread = keysDocumented().filter((key) => !read.has(key));

    expect(unread, `documented in .env.example but read nowhere: ${unread.join(', ')}`).toEqual([]);
  });

  it('pins STACKS_VAULT, so a rename cannot pass quietly', () => {
    // The one variable every command falls back to. Named explicitly because
    // both checks above are set comparisons: renaming it on both sides at once
    // would keep them equal and silently break every existing .env.
    expect(keysDocumented()).toContain('STACKS_VAULT');
    expect(keysReadInCode()).toContain('STACKS_VAULT');
  });
});
