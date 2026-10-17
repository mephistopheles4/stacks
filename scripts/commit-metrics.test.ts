/**
 * C9: `scripts/commit-metrics.ts` against a scratch bare remote.
 *
 * `docs/spec/survivor-record.md` §S5. The script is run as a child process — it
 * is excluded from mutation and has no exports — in a scratch clone, twice, for
 * `metrics` and for `survivors`: **the double run is what found its
 * branch-already-exists bug**, and running it once proves nothing about the
 * second night. The remote is a local `file://` bare repository, so nothing
 * here leaves the machine and G21 (`no-live-network`) is not touched.
 *
 * ⚠️ **Excluded from Stryker's dry run** (`vitest.stryker.config.ts`): it spawns
 * `git` and writes a scratch remote, and a spec under `scripts/` must not touch
 * the filesystem inside the sandbox.
 *
 * ⚠️ **Every path is built with `node:path` and `node:url`, never concatenated.**
 * The target is `ubuntu-latest`; development is on Windows.
 *
 * Three tests, which is the cost limit's whole allowance for this file: the
 * double run is the claim, the rejected push is the one beyond it, and the
 * arguments are the other.
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./commit-metrics.ts', import.meta.url));
const TSX = import.meta.resolve('tsx/esm');

/** Each test spawns `tsx` and `git` several times; Vitest's 5 s default is for pure code. */
const TIMEOUT = 60_000;

let root: string;
let remote: string;
let clone: string;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** Runs the script in the clone, the way the workflow does: from the repo root. */
function run(args: string[] = []): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, ['--import', TSX, SCRIPT, ...args], {
    cwd: clone,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_SHA: 'c0ffee', GITHUB_EVENT_NAME: 'schedule' },
  });
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
}

function record(directory: string, name: string, content: string): void {
  mkdirSync(join(clone, directory), { recursive: true });
  writeFileSync(join(clone, directory, name), content);
}

function tipFiles(branch: string): string[] {
  const listing = git(remote, 'ls-tree', '-r', '--name-only', branch);
  return listing === '' ? [] : listing.split('\n').sort();
}

/** A path as `sh` reads it: forward slashes, which Git for Windows accepts. */
function posix(path: string): string {
  return path.replaceAll('\\', '/');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stacks-c9-'));
  remote = join(root, 'remote.git');
  clone = join(root, 'clone');
  mkdirSync(clone);
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(clone, 'init', '--initial-branch=main');
  git(clone, 'config', 'user.name', 'Scratch');
  git(clone, 'config', 'user.email', 'scratch@example.invalid');
  writeFileSync(join(clone, 'code.txt'), 'the code, which no record branch carries\n');
  git(clone, 'add', 'code.txt');
  git(clone, 'commit', '-m', 'the code');
  git(clone, 'remote', 'add', 'origin', pathToFileURL(remote).href);
  git(clone, 'push', 'origin', 'main');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const BRANCHES = [
  { branch: 'metrics', directory: 'metrics', extension: '.prom', args: [] as string[] },
  {
    branch: 'survivors',
    directory: 'survivors',
    extension: '.jsonl',
    args: ['survivors', '--branch', 'survivors', '--ext', '.jsonl'],
  },
];

describe.each(BRANCHES)('$branch', ({ branch, directory, extension, args }) => {
  const first = `100-aaaaaaaaaaaa${extension}`;
  const second = `200-bbbbbbbbbbbb${extension}`;

  it(
    'creates the branch, lands both records over two runs, and writes one file to disk',
    () => {
      const handed = join(root, 'previous');
      record(directory, first, 'one\n');
      expect(run([...args, '--previous-to', handed]).status).toBe(0);
      // Created from nothing, with the record alone on it and no code; there was
      // no previous record to hand back.
      expect(tipFiles(branch)).toEqual([`${directory}/${first}`]);
      expect(existsSync(handed)).toBe(false);

      // A fresh directory, as on a fresh runner: if the second commit staged the
      // directory rather than the one file, it would delete the first record.
      rmSync(join(clone, directory), { recursive: true });
      record(directory, second, 'two\n');
      const result = run([...args, '--previous-to', handed]);
      expect(result.status, result.out).toBe(0);
      expect(tipFiles(branch)).toEqual([`${directory}/${first}`, `${directory}/${second}`]);
      expect(result.out).toContain(`on disk: ${directory}/${second}\n`);
      expect(readFileSync(handed, 'utf8')).toBe('one\n');
      expect(git(remote, 'log', '-1', '--format=%s', branch)).toBe(`${branch}: c0ffee (schedule)`);

      // A record the tip already holds is a no-op, and moves nothing.
      const tip = git(remote, 'rev-parse', branch);
      expect(run(args).out).toContain('nothing new to record');
      expect(git(remote, 'rev-parse', branch)).toBe(tip);

      // No worktree and no staging branch left behind.
      expect(git(clone, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
      expect(git(clone, 'branch', '--format=%(refname:short)')).toBe('main');
    },
    TIMEOUT,
  );

  it(
    'lands with both records when its first push is rejected',
    () => {
      record(directory, first, 'one\n');
      expect(run(args).status).toBe(0);

      // A second clone puts a commit on the branch between this run's fetch and
      // its push: a pre-push hook, once, which is the only seam git offers there.
      const other = join(root, 'other');
      git(root, 'clone', '--quiet', '--branch', branch, pathToFileURL(remote).href, other);
      git(other, 'config', 'user.name', 'Other');
      git(other, 'config', 'user.email', 'other@example.invalid');
      const rival = `150-cccccccccccc${extension}`;
      writeFileSync(join(other, directory, rival), 'rival\n');
      git(other, 'add', `${directory}/${rival}`);
      git(other, 'commit', '-m', 'rival');
      const rivalSha = git(other, 'rev-parse', 'HEAD');
      const fired = join(root, 'fired');
      const hook = join(clone, '.git', 'hooks', 'pre-push');
      writeFileSync(
        hook,
        [
          '#!/bin/sh',
          // git exports GIT_DIR to a hook, and `git -C` would still obey it.
          'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE',
          `if [ ! -e "${posix(fired)}" ]; then`,
          `  : > "${posix(fired)}"`,
          `  git -C "${posix(other)}" push --quiet origin ${rivalSha}:refs/heads/${branch}`,
          'fi',
          '',
        ].join('\n'),
      );
      chmodSync(hook, 0o755);

      rmSync(join(clone, directory), { recursive: true });
      record(directory, second, 'two\n');
      const result = run(args);
      expect(existsSync(fired)).toBe(true);
      expect(result.out).toContain('rejected');
      expect(result.status, result.out).toBe(0);
      expect(tipFiles(branch)).toEqual(
        [first, rival, second].map((name) => `${directory}/${name}`),
      );
    },
    TIMEOUT,
  );
});

describe('the arguments', () => {
  it(
    'refuses a name that is not plain, and fails when there is no record to commit',
    () => {
      record('metrics', '1-a.prom', 'x\n');
      expect(run(['--branch', '../evil']).status).not.toBe(0);
      expect(run(['..']).status).not.toBe(0);
      expect(run(['--ext', '.prom/../x']).status).not.toBe(0);
      expect(git(clone, 'ls-remote', '--heads', 'origin')).not.toContain('evil');

      mkdirSync(join(clone, 'empty'));
      const result = run(['empty']);
      expect(result.status).toBe(1);
      expect(result.out).toContain('no .prom file');
    },
    TIMEOUT,
  );
});
