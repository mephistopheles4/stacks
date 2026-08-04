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
 * Three things are missing from a bare `git worktree add` here, and all three
 * fail late rather than loudly:
 *
 *   - `node_modules` is gitignored, so every command dies on a missing import
 *     until someone runs `pnpm install`. Done here.
 *   - `.env` is gitignored too, so there is no vault path, no API key and no
 *     SITE_URL. That one is not fixed by copying — see `envFilePath` in
 *     `packages/cli/src/env.ts`, which reads the main checkout's `.env` from
 *     wherever you are standing. This script *reports* where it resolved,
 *     because a fallback nobody watched work is a fallback nobody can trust.
 *   - **The base is usually stale, whichever branch you name.** Work lands
 *     through pull requests, so nothing here moves until somebody fetches, and
 *     making a worktree is not that. This is the worst of the three, because
 *     the other two stop you on the first command and this one does not stop
 *     you at all: the checkout installs, the tests pass, and the work is built
 *     on the wrong commit. So origin is fetched first, before anything is
 *     decided, and what you were given is always printed.
 *
 * That last one has three shapes, and for a while only the first was handled:
 *
 *   - **A new branch** is cut from `origin/main`, not from the local `main`.
 *   - **A branch origin already has** is checked out from `origin/<branch>`,
 *     tracking it. It used to be created *empty off `origin/main`*, because the
 *     only question asked was whether a local branch existed — so a branch a
 *     colleague or another machine had already pushed came back as a new one of
 *     the same name, and the first push either bounced or, forced, took the
 *     work with it.
 *   - **A branch already here** is fast-forwarded when it is strictly behind
 *     origin, and otherwise reported and left alone. Never merged or rebased:
 *     this makes you a checkout, and resolving a divergence on the way to that
 *     is a much larger thing than it was asked to do.
 *
 * Worktrees are placed beside the main checkout rather than inside it. Nested
 * would in fact be safe — `filesUnder` in `gates/repo.ts` skips dot-prefixed
 * directories and the tsconfig and vitest globs are anchored at `packages/`,
 * `scripts/` and `gates/`, which is why `.claude/worktrees/` can sit where it
 * does — but that safety is three separate coincidences, and the Astro dev
 * server's file watcher and your editor's indexer share none of them.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mainCheckout } from '../packages/cli/src/env.ts';
import { gitOutput, gitStatus } from './lib/git.ts';
import { runExe, runShell } from './lib/run.ts';

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
 * `runExe` and never `runShell`, because a branch name reaches this one — see
 * ADR-0030 for why the two exist. `BRANCH` above already rejects the characters
 * that would matter, but a validation regex and a shell are two chances to be
 * wrong where no shell is one.
 *
 * The catch is only presentation: this script reports its own failures rather
 * than throwing a stack trace at someone who asked for a checkout.
 */
function git(args: readonly string[], cwd: string): void {
  try {
    runExe('git', args, cwd);
  } catch (error) {
    fail(`\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Whether a local branch of this name already exists.
 *
 * Spelled the same way as `onOrigin` below, which asks the identical question
 * about a remote-tracking ref. The two used to differ — this one had its own
 * `spawnSync` with `stdio: 'ignore'` — so one question had two implementations
 * eight lines apart.
 */
function branchExists(name: string, cwd: string): boolean {
  return gitOutput(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], cwd) !== undefined;
}

/**
 * Brings every remote-tracking ref up to date, before anything is decided.
 *
 * The fetch is **best effort and says so**. Failing hard would mean no worktree
 * on a plane, and the refs are still perfectly usable when offline — they are
 * just as old as your last fetch. Refusing to work for a reason that does not
 * stop the work is how a helper earns being worked around. What is not optional
 * is *saying* what you got: this script's whole argument is that a checkout
 * should fail loudly rather than late, and an unannounced base is the one thing
 * here that could be silently wrong.
 *
 * All refs rather than `origin main`, which is what this fetched when the only
 * question was where to cut a *new* branch. Both remaining questions — does
 * origin already have this branch, and has it moved since you last looked — are
 * about `origin/<branch>`, and neither can be answered from a ref that was
 * never fetched.
 */
function fetchOrigin(cwd: string): boolean {
  const hasOrigin = gitOutput(['remote'], cwd)?.split('\n').includes('origin') === true;
  if (!hasOrigin) return false;

  if (gitStatus(['fetch', 'origin', '--quiet'], cwd) !== 0) {
    console.warn('\n! could not reach origin — working from the last fetch, which may be old\n');
  }
  return true;
}

/** Whether `origin` has a branch of this name, as of the last fetch. */
function onOrigin(name: string, cwd: string): boolean {
  return gitOutput(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${name}`], cwd) !== undefined;
}

/** How a local branch stands against its counterpart on origin. */
function divergence(name: string, cwd: string): { behind: number; ahead: number } | undefined {
  const counts = gitOutput(['rev-list', '--left-right', '--count', `origin/${name}...${name}`], cwd);
  const [behind, ahead] = (counts ?? '').split(/\s+/).map(Number);
  if (behind === undefined || ahead === undefined || Number.isNaN(behind) || Number.isNaN(ahead)) {
    return undefined;
  }
  return { behind, ahead };
}

/**
 * Moves a local branch up to origin, and only when that cannot lose anything.
 *
 * `git fetch origin <branch>:<branch>` rather than a checkout and pull, for two
 * reasons: the branch is not checked out anywhere yet, and this form is
 * fast-forward-only by default — so the operation git would refuse is the
 * operation this must not do. It also refuses when the branch *is* checked out
 * in another worktree, which is the case a naive `update-ref` would quietly
 * corrupt.
 *
 * Only called when the local branch is strictly behind. A branch that is ahead
 * or has diverged is reported and left exactly as it is: this command's job is
 * to make you a checkout, and a merge nobody asked for is a large thing for it
 * to do on the way.
 */
function fastForward(name: string, cwd: string): boolean {
  return gitStatus(['fetch', 'origin', `${name}:${name}`, '--quiet'], cwd) === 0;
}

/**
 * What a new branch should be cut from.
 *
 * Falls back to the local `main` when there is no remote at all — a clone with
 * no origin is a legitimate way to work on this.
 */
function resolveBase(cwd: string, hasOrigin: boolean): { ref: string; describe: string } {
  const ref = hasOrigin && gitOutput(['rev-parse', '--verify', '--quiet', 'origin/main'], cwd)
    ? 'origin/main'
    : 'main';

  const describe = gitOutput(['log', '-1', '--format=%h %s', ref], cwd) ?? '(unknown)';
  const behind = gitOutput(['rev-list', '--count', `main..${ref}`], cwd);

  return {
    ref,
    describe:
      behind !== undefined && behind !== '0'
        ? `${ref}  ${describe}\n          (your local main is ${behind} behind this)`
        : `${ref}  ${describe}`,
  };
}

const branch = process.argv[2];
if (branch === undefined || branch.startsWith('-')) {
  console.error('usage: pnpm worktree <branch>\n');
  console.error('Existing worktrees:');
  gitStatus(['worktree', 'list'], process.cwd());
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

console.log(`worktree  ${target}`);

// Fetched before anything else is decided, because *which* of the three cases
// below this is depends on what origin has, and a ref nobody fetched cannot
// answer that. Everything after this reads remote-tracking refs only.
const hasOrigin = fetchOrigin(main);

const existing = branchExists(branch, main);
const alreadyPushed = hasOrigin && onOrigin(branch, main);

let addArgs: readonly string[];

if (existing) {
  // ── The branch is already here ───────────────────────────────────────────
  //
  // Which says nothing about whether it is current. This is the same failure
  // as branching off a stale `main` — the checkout installs, the tests pass,
  // and the work is built on an old commit — one branch over.
  //
  // Fast-forwarded only when that cannot lose anything, and reported either
  // way. A branch that is ahead or has diverged is left exactly as it is: this
  // command exists to make you a checkout, and a merge nobody asked for is a
  // large thing for it to do on the way to that.
  console.log(`branch    ${branch} (existing)`);

  const moved = alreadyPushed ? divergence(branch, main) : undefined;
  if (!alreadyPushed) {
    console.log(`base      not on origin yet — nothing to compare against`);
  } else if (moved === undefined) {
    console.log(`base      could not compare with origin/${branch}`);
  } else if (moved.behind === 0 && moved.ahead === 0) {
    console.log(`base      up to date with origin/${branch}`);
  } else if (moved.ahead === 0) {
    console.log(`base      ${String(moved.behind)} behind origin/${branch} — fast-forwarding`);
    if (!fastForward(branch, main)) {
      console.warn(
        `          could not fast-forward — it is probably checked out in another worktree.\n` +
          `          The new checkout will be ${String(moved.behind)} behind origin.`,
      );
    }
  } else if (moved.behind === 0) {
    console.log(`base      ${String(moved.ahead)} ahead of origin/${branch} — left alone`);
  } else {
    console.log(
      `base      diverged from origin/${branch}: ${String(moved.ahead)} ahead, ` +
        `${String(moved.behind)} behind — left alone, merge it yourself`,
    );
  }

  // Printed after any fast-forward, so it names the commit you will actually
  // be standing on rather than the one you would have been.
  console.log(`          ${gitOutput(['log', '-1', '--format=%h %s', branch], main) ?? '(unknown)'}`);
  addArgs = ['worktree', 'add', target, branch];
} else if (alreadyPushed) {
  // ── Origin has this branch and we do not ─────────────────────────────────
  //
  // The worst case this script can hit, and until now it was not handled at
  // all: `branchExists` asks only about `refs/heads/`, so a branch someone
  // else — or an agent on another machine — has already pushed looked *new*,
  // and got created empty off `origin/main`. It installs, it runs green, and
  // the first `git push` is either rejected or, if anyone reaches for
  // `--force`, destroys the work it was supposed to continue.
  //
  // Tracking, unlike the new-branch case below: the upstream this wants is
  // its own remote branch, which is exactly what `--track` sets.
  console.log(`branch    ${branch} (new here, tracking origin/${branch})`);
  console.log(
    `base      origin/${branch}  ` +
      `${gitOutput(['log', '-1', '--format=%h %s', `origin/${branch}`], main) ?? '(unknown)'}`,
  );
  addArgs = ['worktree', 'add', '--track', target, '-b', branch, `origin/${branch}`];
} else {
  // ── Genuinely new ────────────────────────────────────────────────────────
  //
  // Based on what the *remote* has, not on whatever the local `main` happens
  // to be sitting at. Those differ constantly here: work lands through pull
  // requests, so the local `main` only moves when somebody pulls, and nothing
  // about creating a worktree makes that happen.
  const base = resolveBase(main, hasOrigin);
  console.log(`branch    ${branch} (new, off ${base.ref})`);
  console.log(`base      ${base.describe}`);

  // `--no-track` because branching from a remote-tracking ref otherwise makes
  // git set the new branch's upstream to `origin/main` — so a later `git push`
  // on a feature branch aims at `main`. It is refused rather than obeyed under
  // the default push policy, but a confusing refusal is a poor substitute for
  // not pointing it there. First push sets its own:
  // `git push -u origin <branch>`.
  addArgs = ['worktree', 'add', '--no-track', target, '-b', branch, base.ref];
}

console.log('');
git(addArgs, main);

console.log('\nInstalling dependencies…');
// `runShell` because pnpm is a `.cmd` shim and needs one. Nothing variable goes
// on this command line; the path it runs in travels as `cwd`, not as an
// argument — which is the whole reason this may take a shell where `git` above
// may not.
try {
  runShell('pnpm', ['install'], { cwd: target });
} catch (error) {
  fail(`\n${error instanceof Error ? error.message : String(error)}`);
}

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
