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
 *
 * The repository is a scratch one, built in a temp folder with a linked worktree
 * beside it, so no test here writes into the checkout the suite runs from.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { envFilePath, loadEnv, mainCheckout } from './env.ts';

/**
 * The env file the tests write, at the root of the scratch repository's *main*
 * checkout — that is the whole point of the fallback.
 */
const PROBE = `.env.worktree-probe-${String(process.pid)}`;

const HERE = process.cwd();

/** Holds the scratch repository and its linked worktree, side by side. */
let scratch: string;
let repo: string;
let worktree: string;

/**
 * The scratch repository's main checkout, asked a different way than the code
 * under test asks it.
 *
 * `git worktree list` puts the main worktree first, always — a fact about
 * git, not about `--git-common-dir`, which is the mechanism being tested. An
 * oracle derived from the implementation would agree with it while it was
 * wrong. So it is asked of git, never assumed from where the repository was
 * created.
 */
let MAIN: string;

beforeAll(() => {
  // The long form git prints: a Windows temp path can come back in 8.3 short
  // form, and `/var` on macOS is a symlink.
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'stacks-env-')));
  repo = join(scratch, 'repo');
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });

  // Two levels down, so "from a subdirectory" has somewhere to stand.
  mkdirSync(join(repo, 'packages', 'site'), { recursive: true });
  git('init', '--quiet');
  // A worktree cannot be added without a commit, and athanor has no identity.
  const identity = ['-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid'];
  git(...identity, 'commit', '--allow-empty', '-m', 'root', '--quiet');
  // Detached, so the test creates no branch.
  worktree = join(scratch, 'checkout');
  git('worktree', 'add', '--detach', worktree);

  const firstWorktree = /^worktree (.+)$/m.exec(git('worktree', 'list', '--porcelain'))?.[1];
  // The match, not the resolved path: `resolve('')` is the cwd, a real
  // directory, so a guard on the resolved value would pass on a broken parse.
  expect(firstWorktree, 'could not parse a main checkout out of `git worktree list`').toBeDefined();
  MAIN = resolve(firstWorktree ?? '');
  process.chdir(repo);
});

afterAll(() => {
  process.chdir(HERE);
  try {
    execFileSync('git', ['worktree', 'remove', '--force', worktree], {
      cwd: repo,
      stdio: 'ignore',
    });
  } catch {
    // Windows will refuse while anything still holds the directory. Prune is the
    // fallback, and the scratch folder is deleted next either way.
    execFileSync('git', ['worktree', 'prune'], { cwd: repo, stdio: 'ignore' });
  }
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    // A held temp directory is the OS's to clean up, never a test failure.
  }
});

afterEach(() => {
  process.chdir(repo);
  rmSync(join(MAIN, PROBE), { force: true });
  delete process.env['STACKS_PROBE_VALUE'];
});

describe('mainCheckout', () => {
  it('resolves the repo root from the repo root', () => {
    expect(mainCheckout()).toBe(MAIN);
  });

  it('resolves the repo root from a subdirectory', () => {
    // `--git-common-dir` answers `../../.git` here. Without the resolve() in
    // the implementation this returns `packages`, and the fallback would then
    // look for `.env` in a directory that has never held one.
    process.chdir(join(MAIN, 'packages', 'site'));
    expect(mainCheckout()).toBe(MAIN);
  });

  it('resolves the main checkout from a linked worktree', () => {
    // The case the whole feature exists for: `--git-common-dir` is absolute
    // here and points into the main checkout, not into this directory.
    process.chdir(worktree);
    expect(mainCheckout()).toBe(MAIN);
  });
});

describe('envFilePath', () => {
  it('prefers the file beside you', () => {
    // Standing in MAIN explicitly, so "beside you" and "the fallback" name the
    // same file for opposite reasons and the assertion cannot pass by accident
    // when this suite is itself running inside a worktree.
    process.chdir(MAIN);
    writeFileSync(join(MAIN, PROBE), 'STACKS_PROBE_VALUE=beside\n');
    expect(envFilePath(PROBE)).toBe(join(MAIN, PROBE));
  });

  it('falls back to the main checkout from a worktree', () => {
    writeFileSync(join(MAIN, PROBE), 'STACKS_PROBE_VALUE=shared\n');
    process.chdir(worktree);

    expect(envFilePath(PROBE)).toBe(join(MAIN, PROBE));
  });

  it('is undefined when no checkout has one', () => {
    process.chdir(worktree);
    expect(envFilePath(PROBE)).toBeUndefined();
  });
});

describe('loadEnv', () => {
  it('reads the main checkout file from a worktree', () => {
    writeFileSync(join(MAIN, PROBE), 'STACKS_PROBE_VALUE=shared\n');
    process.chdir(worktree);

    loadEnv(PROBE);
    expect(process.env['STACKS_PROBE_VALUE']).toBe('shared');
  });

  it('still lets a real environment variable win', () => {
    // The file is a default, not an override. This is what keeps
    // `STACKS_VAULT=... pnpm stacks build` doing what it says, in a worktree
    // exactly as in the main checkout.
    writeFileSync(join(MAIN, PROBE), 'STACKS_PROBE_VALUE=shared\n');
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
