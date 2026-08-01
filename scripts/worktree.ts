/**
 * Create a git worktree that can actually run this project.
 *
 *     pnpm worktree <branch>
 *
 * A worktree is a second working directory on the same repository, so two
 * branches can be checked out at once — an agent working on one while you look
 * at another, or a build running on `main` while you edit a feature. `git
 * worktree add` gets you the checkout; this gets you a checkout that works.
 *
 * Two things are missing from a bare `git worktree add` here, and both fail
 * late rather than loudly:
 *
 *   - `node_modules` is gitignored, so every command dies on a missing import
 *     until someone runs `pnpm install`. Done here.
 *   - `.env` is gitignored too, so there is no vault path, no API key and no
 *     SITE_URL. That one is not fixed by copying — see `envFilePath` in
 *     `packages/cli/src/env.ts`, which reads the main checkout's `.env` from
 *     wherever you are standing. This script *reports* where it resolved,
 *     because a fallback nobody watched work is a fallback nobody can trust.
 *
 * Worktrees are placed beside the main checkout rather than inside it. Nested
 * would in fact be safe — `filesUnder` in `gates/repo.ts` skips dot-prefixed
 * directories and the tsconfig and vitest globs are anchored at `packages/`,
 * `scripts/` and `gates/`, which is why `.claude/worktrees/` can sit where it
 * does — but that safety is three separate coincidences, and the Astro dev
 * server's file watcher and your editor's indexer share none of them.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mainCheckout } from '../packages/cli/src/env.ts';

/**
 * What may appear in a branch name here.
 *
 * Narrower than git allows, for two reasons: the name reaches a directory name,
 * and rejecting the exotic cases outright is better than discovering how each
 * one behaves on Windows. git's own `check-ref-format` rules still apply on top
 * — this only decides what this script is willing to pass along.
 */
const BRANCH = /^[a-z0-9][a-z0-9._/-]*$/i;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * git, with its arguments passed as arguments.
 *
 * Deliberately not `shell: true`: a branch name reaches this, and under a shell
 * an args array is concatenated rather than escaped — Node warns about exactly
 * that (DEP0190). `BRANCH` above already rejects the characters that would
 * matter, but a validation regex and a shell are two chances to be wrong where
 * no shell is one. git is a real executable on every platform, so it needs none.
 */
function git(args: readonly string[], cwd: string): void {
  const result = spawnSync('git', [...args], { cwd, stdio: 'inherit' });
  if (result.status !== 0) fail(`\ngit ${args.join(' ')} exited ${String(result.status)}`);
}

/** Whether a local branch of this name already exists. */
function branchExists(name: string, cwd: string): boolean {
  return (
    spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], {
      cwd,
      stdio: 'ignore',
    }).status === 0
  );
}

const branch = process.argv[2];
if (branch === undefined || branch.startsWith('-')) {
  console.error('usage: pnpm worktree <branch>\n');
  console.error('Existing worktrees:');
  spawnSync('git', ['worktree', 'list'], { stdio: 'inherit' });
  console.error('\nRemove one with: git worktree remove <path>');
  process.exit(1);
}

if (!BRANCH.test(branch)) {
  fail(`"${branch}" is not a branch name this script will use.\n` + `Allowed: ${String(BRANCH)}`);
}

const main = mainCheckout();
if (main === undefined) fail('Not a git checkout — nothing to add a worktree to.');

// Beside the main checkout, and named after it, so a directory listing shows
// which project a stray worktree belongs to. Slashes in `feat/shadows` would
// otherwise ask for a nested directory nobody meant to create.
const target = join(dirname(main), `stacks-${branch.replace(/\//g, '-')}`);
if (existsSync(target)) fail(`${target} already exists.`);

const existing = branchExists(branch, main);
console.log(`worktree  ${target}`);
console.log(`branch    ${branch}${existing ? ' (existing)' : ' (new, off main)'}\n`);

git(
  existing
    ? ['worktree', 'add', target, branch]
    : ['worktree', 'add', target, '-b', branch, 'main'],
  main,
);

console.log('\nInstalling dependencies…\n');
// One constant string rather than an args array, because pnpm is a `.cmd` shim
// on Windows and cannot be spawned without a shell. Nothing variable goes on
// this command line; the path it runs in travels as `cwd`.
const install = spawnSync('pnpm install', { cwd: target, shell: true, stdio: 'inherit' });
if (install.status !== 0) fail(`\npnpm install exited ${String(install.status)}`);

// A new worktree never has its own `.env` — it is gitignored and was created a
// second ago — so the one it will read is always the main checkout's. Said out
// loud because it is shared: editing it here changes every worktree at once,
// which is the point, and a surprise if you assumed a copy.
const env = join(main, '.env');
console.log(
  `\n.env      ${existsSync(env) ? `${env} (shared)` : 'NOT FOUND — vault commands will fail until one exists'}`,
);

console.log(`\nReady:\n  cd ${target}\n  pnpm test`);
console.log('\nPorts: `pnpm dev` picks the next free one from 4321. `pnpm dev:watch`');
console.log('takes PORT from .env, which is shared — set it per shell to run two.');
