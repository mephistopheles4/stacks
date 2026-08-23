/**
 * Asking Docker a question, when the answer may be "no" and that is fine.
 *
 * The same shape as [`./git.ts`](./git.ts), for the same reason and by its
 * precedent: [ADR-0030](../../docs/adr/0030-two-spawn-helpers-not-one.md) keeps
 * [`./run.ts`](./run.ts) free of any one program's vocabulary, and *"there is no
 * container by that name"* is Docker's vocabulary exactly as *"a ref that is
 * absent exits 1"* is git's. `docker ps --filter` prints nothing and exits 0 for
 * a container that is not there, so the **output** is the answer and the exit
 * code is not.
 *
 * ⚠️ **This was a third export on `run.ts` first, and that was a real breach
 * rather than a tidiness note.** ADR-0030 decided in as many words that a
 * capture-output helper does not join `run.ts` — *"a third export on `run.ts`
 * returning a status instead of throwing would also have been the flag in a
 * different costume."* A code review caught it. The fix is the ADR's own
 * pattern, not an amendment to it: one module per program that has vocabulary,
 * `runExe` for everything that simply has to succeed.
 *
 * Same no-shell rule as `runExe`, for the same reason — a container name and a
 * mounted path reach these.
 */

import { spawnSync } from "node:child_process";

/**
 * Docker, captured and non-fatal — `undefined` when it fails for any reason.
 *
 * "Any reason" is deliberate and covers three that look different and are not:
 * no `docker` on the PATH, a daemon that is not running, and a container that
 * does not exist. Every caller here wants the same thing from all three — carry
 * on without an answer, and say so.
 */
export function dockerOutput(
  args: readonly string[],
  cwd: string,
): string | undefined {
  const result = spawnSync("docker", [...args], { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
