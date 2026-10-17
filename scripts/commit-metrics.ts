/**
 * Put this run's record file on an orphan record branch.
 *
 *     pnpm metrics:commit [<directory>] [--branch <name>] [--ext <.ext>] [--previous-to <path>]
 *
 * With no arguments it puts `metrics/<timestamp>-<sha>.prom` on the orphan
 * `metrics` branch, as it always has. `.github/workflows/metrics.yml` is the only
 * caller and the only place with `contents: write`; its nightly job also calls it
 * with `survivors --branch survivors --ext .jsonl` to put the survivor record on
 * its own branch (`docs/spec/survivor-record.md` §S4.6). Nothing on `main` is
 * touched.
 *
 * ⚠️ **It never checks out the branch's tree, and that is the point of the
 * rewrite.** It used to check out the whole tip, which costs nothing for `.prom`
 * files of a few hundred bytes. The survivor tip grows by about 818 KiB a night
 * and is never pruned, so the same checkout would write ~300 MB a year to the
 * runner. The property now is that **it writes exactly one file to disk, the one
 * it adds**, and it prints the files it found on disk so the claim is read off a
 * run and not off this comment. Four rules make it hold, and each replaces
 * something the old script did that would break it:
 *
 * 1. The worktree is `--no-checkout` and its index is filled from the fetched
 *    tip by `git read-tree`, not by `worktree add <tip>`.
 * 2. The new file is added **by its full path**. In a worktree with no files on
 *    disk, `git add metrics` would stage the deletion of every earlier record,
 *    and each night would delete the one before.
 * 3. A rejected push fetches again, `read-tree`s the new tip, adds the one file,
 *    commits again and pushes again — up to three times. `pull --rebase` would
 *    refuse in that worktree, or check the tree out.
 * 4. An absent branch is made from the same kind of worktree, with a commit that
 *    has no parent, not by checking out `HEAD` and running `git rm -rf`.
 *
 * ⚠️ **The commit is made with `commit-tree`, on a tree from `write-tree`.** That
 * is what makes rule 4 and the no-op test one code path: the tree is compared
 * with the tip's, and a branch that does not exist yet has no tip to equal.
 *
 * ⚠️ **This was a bash script first, and TypeScript is not tidiness.** The repo
 * already had one answer for driving git from a script — `gitOutput`,
 * `gitStatus` and `runExe`, whose no-shell rule exists because *"a branch name
 * reaches that call"* ([ADR-0030](../docs/adr/0030-two-spawn-helpers-one-refuses-a-shell.md))
 * — and a shell script bypasses all of it. **The branch name is now an argument**,
 * so it is checked against a plain-name pattern before it reaches git.
 *
 * ⚠️ **Nothing here ever creates a local branch of the record's name, and that is
 * not tidiness either.** The first version did `switch -c metrics`, which works
 * once and fails on the second run in the same clone with *"a branch named
 * 'metrics' already exists"* — invisible in CI, where every run is a fresh
 * checkout, and immediate against a scratch remote. **The bug was found by
 * running the thing twice**; `commit-metrics.test.ts` still does. So: detached
 * HEAD, no staging branch at all, and a push of `<commit>:refs/heads/<branch>`.
 *
 * ⚠️ **The branch is created here when it is absent**, rather than being a
 * precondition somebody has to remember. A workflow that needs a branch a human
 * made once is a workflow that silently stops working the day somebody prunes
 * it — and the failure would look like a dead pipe rather than like a missing
 * ref.
 *
 * The push is retried, because a merge and a nightly can land minutes apart.
 * One file per run reduces the race to a ref update; there is no shared file for
 * two runs to contend on.
 *
 * ⚠️ **It works in the current directory, not in `REPO_ROOT`.** Both callers run
 * from the repository root, so nothing changed for them, and a test can run it in
 * a scratch clone, which is how the paths above are checked at all.
 *
 * `--previous-to <path>` copies the newest record on the fetched tip to a path
 * before this run's is committed, for `scripts/mutation-scopes.ts` to diff
 * against. Newest by the `<timestamp>` in the name, and no file at all when the
 * branch holds none.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gitOutput, gitStatus } from './lib/git.ts';
import { runExe } from './lib/run.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    branch: { type: 'string', default: 'metrics' },
    ext: { type: 'string', default: '.prom' },
    'previous-to': { type: 'string' },
  },
});

/** A name that reaches git or the tree: letters, digits and hyphens, no dots or slashes. */
const PLAIN = /^[a-z][a-z0-9-]*$/;

const BRANCH = values.branch;
const DIRECTORY = positionals[0] ?? 'metrics';
const EXTENSION = values.ext;
const PREVIOUS_TO = values['previous-to'];

const ROOT = process.cwd();
const SOURCE = join(ROOT, DIRECTORY);

/**
 * The author on the commit, passed per-invocation rather than written into
 * `.git/config`. `git config user.name …` would mutate the checkout — invisible
 * in CI and rude anywhere else — and it makes this untestable against a scratch
 * clone, which is how the branch-already-exists bug was found.
 */
const AUTHOR = [
  '-c',
  'user.name=github-actions[bot]',
  '-c',
  'user.email=41898282+github-actions[bot]@users.noreply.github.com',
];

function records(): string[] {
  try {
    return readdirSync(SOURCE).filter((name) => name.endsWith(EXTENSION));
  } catch {
    return [];
  }
}

function remoteHasBranch(): boolean {
  // `ls-remote --heads` prints nothing and exits 0 for a branch that is not
  // there, so the output is the answer and the exit code is not.
  const found = gitOutput(['ls-remote', '--heads', 'origin', BRANCH], ROOT);
  return found !== undefined && found !== '';
}

/** The repository's size on disk in KiB, loose and packed, or 0 if git will not say. */
function repositoryKiB(): number {
  const counted = gitOutput(['count-objects', '-v'], ROOT) ?? '';
  const read = (name: string): number => {
    const match = new RegExp(`^${name}: (\\d+)$`, 'm').exec(counted);
    return match === null ? 0 : Number(match[1]);
  };
  return read('size') + read('size-pack');
}

/**
 * The branch's tip, fetched at depth 1 and named by SHA.
 *
 * The SHA and not `FETCH_HEAD`, because `FETCH_HEAD` belongs to this checkout
 * and the worktree it is used in does not see it. The growth in the repository's
 * size is printed because the nightly's budget is read off it (§S4.6).
 */
function fetchTip(): string {
  const before = repositoryKiB();
  runExe('git', ['fetch', 'origin', BRANCH, '--depth=1'], ROOT);
  const tip = gitOutput(['rev-parse', 'FETCH_HEAD'], ROOT);
  if (tip === undefined) throw new Error('git could not name the fetched tip');
  console.log(`fetched about ${String(Math.max(0, repositoryKiB() - before))} KiB`);
  return tip;
}

/** The newest record under `DIRECTORY/` on `tip`, by the timestamp in its name. */
function newestRecord(tip: string): string | undefined {
  const listing = gitOutput(['ls-tree', '--name-only', tip, `${DIRECTORY}/`], ROOT) ?? '';
  const pattern = new RegExp(`^${DIRECTORY}/(\\d+)-[0-9a-z]+${EXTENSION.replace('.', '\\.')}$`);
  let newest: { path: string; timestamp: number } | undefined;
  for (const path of listing.split('\n')) {
    const match = pattern.exec(path);
    const timestamp = Number(match?.[1]);
    if (match !== null && (newest === undefined || timestamp > newest.timestamp)) {
      newest = { path, timestamp };
    }
  }
  return newest?.path;
}

/** Writes the newest record on the tip to `PREVIOUS_TO`, or leaves nothing there. */
function handBack(tip: string, destination: string): void {
  rmSync(destination, { force: true });
  const path = newestRecord(tip);
  if (path === undefined) return;
  // Not `gitOutput`, which trims: this is a file's bytes, and it is large.
  const shown = spawnSync('git', ['show', `${tip}:${path}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (shown.status !== 0) throw new Error(`git show ${tip}:${path} exited ${String(shown.status)}`);
  writeFileSync(destination, shown.stdout);
}

/** Every file on disk under `directory`, `.git` excepted, as `/`-separated paths. */
function filesOnDisk(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== '.git')
    .map((entry) => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();
}

function cleanUp(worktree: string): void {
  gitStatus(['worktree', 'remove', '--force', worktree], ROOT);
  rmSync(join(worktree, '..'), { recursive: true, force: true });
}

/**
 * The whole flow, as a function returning an exit code.
 *
 * ⚠️ **`process.exit()` does not run a pending `finally` block**, so calling it
 * from inside the `try` below left the temporary worktree registered on two
 * paths — the no-op and the exhausted push. Found by review and confirmed by
 * experiment. That leak is invisible in CI, where the runner is thrown away
 * either way, and it is exactly the leak that matters on a machine.
 *
 * So: a return value, and `process.exitCode` at the very end — which lets the
 * process drain naturally instead of being torn down mid-cleanup. Top-level
 * `return` is not available here; this is an ES module, where it is a syntax
 * error rather than the CommonJS escape hatch it looks like.
 */
function main(): number {
  if (!PLAIN.test(BRANCH) || !PLAIN.test(DIRECTORY) || !/^\.[a-z]+$/.test(EXTENSION)) {
    console.error('the branch and the directory must be plain names, and the extension `.ext`');
    return 1;
  }

  const found = records();
  if (found.length === 0) {
    console.error(
      `no ${EXTENSION} file in ${SOURCE} — the step before this one writes one per run, so this is a bug`,
    );
    return 1;
  }

  const worktree = join(mkdtempSync(join(tmpdir(), 'stacks-record-')), 'record');
  const subject = `${BRANCH}: ${process.env.GITHUB_SHA ?? 'local'} (${process.env.GITHUB_EVENT_NAME ?? 'manual'})`;

  try {
    // `HEAD` is only a commit to hang the worktree on: nothing is checked out of
    // it, and no commit made here has it as a parent.
    runExe('git', ['worktree', 'add', '--no-checkout', '--detach', worktree, 'HEAD'], ROOT);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const tip = remoteHasBranch() ? fetchTip() : undefined;
      if (attempt === 1 && PREVIOUS_TO !== undefined && tip !== undefined) {
        handBack(tip, resolve(ROOT, PREVIOUS_TO));
      }

      // The index only. `--empty` for a branch that does not exist yet.
      runExe('git', ['read-tree', ...(tip === undefined ? ['--empty'] : [tip])], worktree);

      const destination = join(worktree, DIRECTORY);
      mkdirSync(destination, { recursive: true });
      for (const name of found) {
        copyFileSync(join(SOURCE, name), join(destination, name));
        runExe('git', ['add', `${DIRECTORY}/${name}`], worktree);
      }
      console.log(`on disk: ${filesOnDisk(worktree).join(', ')}`);

      const tree = gitOutput(['write-tree'], worktree);
      if (tree === undefined) throw new Error('git could not write the tree');
      if (tip !== undefined && tree === gitOutput(['rev-parse', `${tip}^{tree}`], ROOT)) {
        console.log('nothing new to record');
        return 0;
      }

      const commit = gitOutput(
        [...AUTHOR, 'commit-tree', tree, ...(tip === undefined ? [] : ['-p', tip]), '-m', subject],
        worktree,
      );
      if (commit === undefined) throw new Error('git could not make the commit');

      if (gitStatus(['push', 'origin', `${commit}:refs/heads/${BRANCH}`], worktree) === 0) return 0;

      if (attempt === 3) {
        console.error('could not push the record after three attempts');
        return 1;
      }
      // The file already on disk stays, and the next pass adds it again to the
      // new tip's index.
      console.error(`push ${String(attempt)} rejected; fetching the branch tip and retrying`);
    }
    return 1;
  } finally {
    cleanUp(worktree);
  }
}

// `exitCode` rather than `exit()`: it lets the event loop drain, which is the
// whole reason the cleanup above can be trusted to have run.
process.exitCode = main();
