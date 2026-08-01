/**
 * `.env` resolution, including from a linked git worktree.
 *
 * A worktree is a real checkout with its own working directory and no `.env` —
 * the file is gitignored, so it exists in exactly one place. Everything else
 * about a worktree works out of the box; this is the part that does not, and
 * every command that needs a vault, an API key or a SITE_URL depends on it.
 *
 * Tested against an actual `git worktree`, not a directory that resembles one.
 * The mechanism is `git rev-parse --git-common-dir`, which answers differently
 * depending on where it is asked from — relative in the main checkout, absolute
 * in a linked worktree — so a stand-in would agree with the implementation and
 * with nothing else.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { envFilePath, loadEnv, mainCheckout } from './env.ts';

/** Gitignored under `.env.*`, so a stray copy cannot be committed. */
const PROBE = '.env.worktree-probe';

const REPO = resolve(process.cwd());
const HERE = process.cwd();

let worktree: string;

beforeAll(() => {
  // Detached, so the test creates no branch and cannot collide with one.
  worktree = join(mkdtempSync(join(tmpdir(), 'stacks-worktree-')), 'checkout');
  execFileSync('git', ['worktree', 'add', '--detach', worktree], { cwd: REPO, stdio: 'ignore' });
});

afterAll(() => {
  process.chdir(HERE);
  try {
    execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO, stdio: 'ignore' });
  } catch {
    // Windows will refuse while anything still holds the directory. Prune drops
    // the registration either way, so a failure here cannot leave the repo
    // believing in a worktree that is gone.
    execFileSync('git', ['worktree', 'prune'], { cwd: REPO, stdio: 'ignore' });
  }
});

afterEach(() => {
  process.chdir(HERE);
  rmSync(join(REPO, PROBE), { force: true });
  delete process.env['STACKS_PROBE_VALUE'];
});

describe('mainCheckout', () => {
  it('resolves the repo root from the repo root', () => {
    expect(mainCheckout()).toBe(REPO);
  });

  it('resolves the repo root from a subdirectory', () => {
    // `--git-common-dir` answers `../../.git` here. Without the resolve() in
    // the implementation this returns `packages`, and the fallback would then
    // look for `.env` in a directory that has never held one.
    process.chdir(join(REPO, 'packages', 'site'));
    expect(mainCheckout()).toBe(REPO);
  });

  it('resolves the main checkout from a linked worktree', () => {
    // The case the whole feature exists for: `--git-common-dir` is absolute
    // here and points into the main checkout, not into this directory.
    process.chdir(worktree);
    expect(mainCheckout()).toBe(REPO);
  });
});

describe('envFilePath', () => {
  it('prefers the file beside you', () => {
    writeFileSync(join(REPO, PROBE), 'STACKS_PROBE_VALUE=beside\n');
    expect(envFilePath(PROBE)).toBe(join(REPO, PROBE));
  });

  it('falls back to the main checkout from a worktree', () => {
    writeFileSync(join(REPO, PROBE), 'STACKS_PROBE_VALUE=shared\n');
    process.chdir(worktree);

    expect(envFilePath(PROBE)).toBe(join(REPO, PROBE));
  });

  it('is undefined when no checkout has one', () => {
    process.chdir(worktree);
    expect(envFilePath(PROBE)).toBeUndefined();
  });
});

describe('loadEnv', () => {
  it('reads the main checkout file from a worktree', () => {
    writeFileSync(join(REPO, PROBE), 'STACKS_PROBE_VALUE=shared\n');
    process.chdir(worktree);

    loadEnv(PROBE);
    expect(process.env['STACKS_PROBE_VALUE']).toBe('shared');
  });

  it('still lets a real environment variable win', () => {
    // The file is a default, not an override. This is what keeps
    // `STACKS_VAULT=... pnpm stacks build` doing what it says, in a worktree
    // exactly as in the main checkout.
    writeFileSync(join(REPO, PROBE), 'STACKS_PROBE_VALUE=shared\n');
    process.env['STACKS_PROBE_VALUE'] = 'from the shell';
    process.chdir(worktree);

    loadEnv(PROBE);
    expect(process.env['STACKS_PROBE_VALUE']).toBe('from the shell');
  });

  it('does nothing when there is no file, rather than throwing', () => {
    // Invariant 3's habit: the absence of optional configuration is the normal
    // case and must never be an exception.
    process.chdir(worktree);
    expect(() => loadEnv(PROBE)).not.toThrow();
  });
});
