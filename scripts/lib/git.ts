/**
 * Asking git a question, when the answer may be "no" and that is fine.
 *
 * `runExe` in `./run.ts` is the other half: it runs a command and throws when
 * the command fails, which is right for the git that *does* something —
 * `worktree add`, and the fetch that moves a branch. These two are for the git
 * that is *consulted*, where a non-zero exit is an answer rather than a
 * failure. `rev-parse --verify --quiet` on a ref that does not exist exits 1,
 * and there is nothing wrong.
 *
 * That distinction is why these live here and not beside `runExe`: ADR-0030
 * keeps `run.ts` free of any one program's vocabulary, and "a ref that is
 * absent exits non-zero" is git's vocabulary. Same no-shell rule as `runExe`,
 * for the same reason — a branch name reaches these.
 *
 * Shared because `gitOutput` existed twice, in `worktree.ts` and, spelled
 * differently and named nothing at all, inline in `deploy.ts`'s branch check.
 * Two files deriving one contract is what ADR-0030's commit set out to remove
 * and missed on its first pass; a code review found it.
 */

import { spawnSync } from 'node:child_process';

/**
 * git, captured and non-fatal — `undefined` when it fails for any reason.
 *
 * "Any reason" is deliberate and covers more than a non-zero exit: no git on
 * the PATH, and not a checkout at all, both arrive here as `undefined`. Every
 * caller wants the same thing from all three — carry on without an answer.
 */
export function gitOutput(args: readonly string[], cwd: string): string | undefined {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * git, run for its effect and its exit code, with its output left on the
 * terminal. `null` when it could not be spawned at all.
 *
 * The caller decides what a non-zero means. For `fetch` it means "you are
 * offline, carry on with older refs"; for the fast-forward it means "that would
 * not have been a fast-forward, so nothing moved" — neither is an error this
 * script should stop for, which is exactly what separates this from `runExe`.
 */
export function gitStatus(args: readonly string[], cwd: string): number | null {
  return spawnSync('git', [...args], { cwd, stdio: 'inherit' }).status;
}
