/**
 * Put this run's `.prom` file on the orphan `metrics` branch.
 *
 *     pnpm metrics:commit [<directory>]
 *
 * Called by both halves of `.github/workflows/metrics.yml`, which is the only
 * caller and the only place with `contents: write`. Nothing on `main` is
 * touched: the branch is fetched into a worktree of its own, the file is copied
 * across, and the worktree is thrown away.
 *
 * ⚠️ **This was a bash script first, and TypeScript is not tidiness.** The repo
 * already had one answer for driving git from a script — `gitOutput`,
 * `gitStatus` and `runExe`, whose no-shell rule exists because *"a branch name
 * reaches that call"* ([ADR-0030](../docs/adr/0030-two-spawn-helpers-one-refuses-a-shell.md))
 * — and a shell script bypasses all of it, on a repo whose other fourteen
 * scripts are TypeScript. A code review caught the bypass; it was a real
 * standards breach and not a style note.
 *
 * ⚠️ **Nothing here ever creates a local branch called `metrics`, and that is
 * not tidiness either.** The first version did `switch -c metrics`, which works
 * once and fails on the second run in the same clone with *"a branch named
 * 'metrics' already exists"* — invisible in CI, where every run is a fresh
 * checkout, and immediate against a scratch remote. **The bug was found by
 * running the thing twice**, which is the only reason the second path is known
 * to work at all. So: detached HEAD, a per-run staging branch where git insists
 * on a name, and a push of `HEAD:refs/heads/metrics`.
 *
 * ⚠️ **The branch is created here when it is absent**, rather than being a
 * precondition somebody has to remember. A workflow that needs a branch a human
 * made once is a workflow that silently stops working the day somebody prunes
 * it — and the failure would look like a dead pipe rather than like a missing
 * ref.
 *
 * The push is retried, because a merge and a nightly can land minutes apart.
 * One file per run reduces the race to a ref update, which a rebase resolves
 * without touching bytes; there is no shared file for two runs to contend on.
 */

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "./lib/repo-root.ts";
import { gitOutput, gitStatus } from "./lib/git.ts";
import { runExe } from "./lib/run.ts";

const BRANCH = "metrics";
const SOURCE = join(REPO_ROOT, process.argv[2] ?? "metrics");

/**
 * Per-run, and never `metrics`. `git switch --orphan` is the one command here
 * that insists on a branch name; the push is what names the branch on the
 * remote, so this name never leaves the machine.
 */
const STAGING = `metrics-staging-${String(process.pid)}`;

/**
 * The author on the commit, passed per-invocation rather than written into
 * `.git/config`. `git config user.name …` would mutate the checkout — invisible
 * in CI and rude anywhere else — and it makes this untestable against a scratch
 * clone, which is how the branch-already-exists bug was found.
 */
const AUTHOR = [
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
];

function records(): string[] {
  try {
    return readdirSync(SOURCE).filter((name) => name.endsWith(".prom"));
  } catch {
    return [];
  }
}

function remoteHasBranch(): boolean {
  // `ls-remote --heads` prints nothing and exits 0 for a branch that is not
  // there, so the output is the answer and the exit code is not.
  const found = gitOutput(
    ["ls-remote", "--heads", "origin", BRANCH],
    REPO_ROOT,
  );
  return found !== undefined && found !== "";
}

/**
 * `staged` rather than an unconditional delete, because `git branch -D` on a
 * branch that was never created prints `error: branch '…' not found` and the
 * helpers inherit stdio. It is harmless and it is a lie in a CI log, which is
 * how a reader learns to skim past the line that matters.
 */
function cleanUp(worktree: string, staged: boolean): void {
  gitStatus(["worktree", "remove", "--force", worktree], REPO_ROOT);
  if (staged) gitStatus(["branch", "-D", STAGING], REPO_ROOT);
}

/**
 * The whole flow, as a function returning an exit code.
 *
 * ⚠️ **`process.exit()` does not run a pending `finally` block**, so calling it
 * from inside the `try` below left the temporary worktree registered and the
 * staging branch behind on two paths — the no-op and the exhausted push. Found
 * by review and confirmed by experiment. That leak is invisible in CI, where the
 * runner is thrown away either way, and it is exactly the leak that matters on
 * the machine this was ported to TypeScript to be testable on.
 *
 * So: a return value, and `process.exitCode` at the very end — which lets the
 * process drain naturally instead of being torn down mid-cleanup. Top-level
 * `return` is not available here; this is an ES module, where it is a syntax
 * error rather than the CommonJS escape hatch it looks like.
 */
function main(): number {
  const found = records();
  if (found.length === 0) {
    console.error(
      `no .prom file in ${SOURCE} — emit-metrics.ts writes one per run, so this is a bug`,
    );
    return 1;
  }

  const worktree = join(
    mkdtempSync(join(tmpdir(), "stacks-metrics-")),
    "record",
  );
  let staged = false;

  try {
    if (remoteHasBranch()) {
      runExe("git", ["fetch", "origin", BRANCH, "--depth=1"], REPO_ROOT);
      runExe(
        "git",
        ["worktree", "add", "--detach", worktree, "FETCH_HEAD"],
        REPO_ROOT,
      );
    } else {
      // `--orphan` rather than branching off main: the record shares no history
      // with the code, and a metrics branch carrying the whole tree would make
      // every `trend:sync` fetch the repository twice.
      runExe(
        "git",
        ["worktree", "add", "--detach", worktree, "HEAD"],
        REPO_ROOT,
      );
      runExe("git", ["switch", "--orphan", STAGING], worktree);
      staged = true;
      gitStatus(["rm", "-rf", "--quiet", "."], worktree);
    }

    const destination = join(worktree, "metrics");
    mkdirSync(destination, { recursive: true });
    for (const name of found)
      copyFileSync(join(SOURCE, name), join(destination, name));

    runExe("git", ["add", "metrics"], worktree);

    // `diff --cached --quiet` exits 1 when there *is* something staged, which is
    // the case this wants to proceed on — an exit code as an answer, which is
    // exactly what `gitStatus` is for.
    if (gitStatus(["diff", "--cached", "--quiet"], worktree) === 0) {
      console.log("nothing new to record");
      return 0;
    }

    const subject = `metrics: ${process.env.GITHUB_SHA ?? "local"} (${process.env.GITHUB_EVENT_NAME ?? "manual"})`;
    runExe("git", [...AUTHOR, "commit", "-m", subject], worktree);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (
        gitStatus(["push", "origin", `HEAD:refs/heads/${BRANCH}`], worktree) ===
        0
      )
        return 0;

      if (attempt === 3) {
        console.error("could not push the record after three attempts");
        return 1;
      }
      console.error(
        `push ${String(attempt)} rejected; rebasing on the branch tip and retrying`,
      );
      runExe(
        "git",
        [...AUTHOR, "pull", "--rebase", "origin", BRANCH],
        worktree,
      );
    }
    return 1;
  } finally {
    cleanUp(worktree, staged);
    rmSync(join(worktree, ".."), { recursive: true, force: true });
  }
}

// `exitCode` rather than `exit()`: it lets the event loop drain, which is the
// whole reason the cleanup above can be trusted to have run.
process.exitCode = main();
