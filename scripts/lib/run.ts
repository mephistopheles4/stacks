/**
 * Spawning a child process, and the one piece of platform knowledge it needs.
 *
 * There are two right answers here and they are opposites, which is the whole
 * reason this file exists. They were previously three comments in three scripts,
 * each re-deriving its half and none able to see the other:
 *
 *   - `pnpm` is a `.cmd` shim on Windows and will not spawn without a shell. Node
 *     deprecates passing an args *array* alongside `shell: true` (DEP0190),
 *     because the two are concatenated rather than escaped — so the command has
 *     to be built as one string. See `shellCommand`.
 *
 *   - `git` is a real executable everywhere and needs no shell, so it must not
 *     get one. A branch name reaches that call, and under a shell an args array
 *     is concatenated rather than escaped. A validation regex and a shell are
 *     two chances to be wrong where no shell is one. See `runExe`.
 *
 * Stated together because apart they read as an inconsistency, and the next
 * person to make them "consistent" would have to pick one and be wrong about
 * half the callers. See ADR-0030.
 *
 * **Joining is safe only because nothing hostile goes on these command lines.**
 * Every argument at every `shellCommand` call site is a literal, a path this
 * repo computed, or a path out of the owner's own `.env` — never an argv, a
 * vault note or a branch name. Anything from outside belongs in `runExe`.
 *
 * **Safe from injection is not the same as correct, and quoting is the
 * caller's.** `shellCommand` joins with spaces and quotes nothing, so any
 * argument that may itself contain a space has to arrive already quoted — which
 * absolute paths may, since they start at a home directory somebody named. Both
 * callers that pass one do quote it; that they disagreed about it for a while,
 * with `deploy.ts` quoting its vault and `check-public-build.ts` passing an
 * absolute assets path bare, is the reason this paragraph exists rather than
 * being left to be re-derived a third time.
 *
 * What is deliberately *not* here: process lifecycle. `dev-watch` keeps a pair
 * of long-lived children and takes the other down when one dies; `smoke-render`
 * wraps a build in a promise. Both spawn asynchronously and own their children
 * afterwards, so they take `shellCommand` and nothing else. Absorbing those two
 * into a helper would mean four modes of one function to save two lines.
 */

import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './repo-root.ts';

/**
 * A command and its arguments as the single string `shell: true` requires.
 *
 * The only home for the DEP0190 rule above. It is exported on its own because
 * the two asynchronous callers need the rule without needing the spawn: before
 * this existed they passed an args array alongside `shell: true` — the exact
 * shape the two synchronous callers wrote a paragraph each about avoiding.
 */
export function shellCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(' ');
}

/**
 * Runs a command through a shell, waits, and throws if it fails.
 *
 * For `pnpm` and friends. Echoes the line first: every caller is a build, a
 * gate or a deploy, and which command produced the next hundred lines of output
 * is the question you have while reading them.
 *
 * Callers that present their own failures catch this — the message is the same
 * either way, only the framing differs.
 */
export function runShell(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): void {
  const line = shellCommand(command, args);
  console.log(`\n$ ${line}`);

  const result = spawnSync(line, {
    cwd: options.cwd ?? REPO_ROOT,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  });

  if (result.status !== 0) throw new Error(`${line} exited ${String(result.status)}`);
}

/**
 * Runs a real executable with its arguments passed as arguments, and throws if
 * it fails.
 *
 * No shell, so an argument containing a space, a quote or a semicolon reaches
 * the program as one argument and reaches no interpreter at all. This is the
 * one to reach for when any part of the command line came from outside the
 * script — which is why it takes an array and offers no way to opt into a
 * shell.
 */
export function runExe(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...args], { cwd, stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`);
  }
}

/**
 * `runExe`, but the output is the answer rather than something to look at.
 *
 * The same no-shell rule and the same argument array — this is `runExe` with
 * `stdio: 'inherit'` traded for a pipe, and it is here rather than in a second
 * file because the platform knowledge above is what makes either safe. It
 * exists for `scripts/lib/github-post.ts`, which posts a body and then has to
 * *read it back*: a verification step whose whole job is comparing what came
 * out of `gh` cannot let that go to the terminal.
 *
 * ⚠️ **`input` is a request body and never a command line.** The one caller
 * that uses it sends `{"body": "…"}` to `gh api --input -`, which is the point:
 * a document on stdin cannot be mistaken for a filename the way `-f body=@file`
 * is, and cannot be coerced to a number the way `-F body=…` is. Both of those
 * return HTTP 200 while posting the wrong thing.
 *
 * `maxBuffer` is raised because a body here is prose and Node's default is a
 * megabyte; a truncated read-back would report a mismatch that never happened.
 */
export function runExeOutput(
  command: string,
  args: readonly string[],
  cwd: string,
  input?: string,
): string {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      `${command} ${args.join(' ')} exited ${String(result.status)}${stderr === '' ? '' : `\n${stderr}`}`,
    );
  }

  return result.stdout;
}
