/**
 * The PR window: which pull requests merged between the previous record and
 * this one.
 *
 * **This is the number panel 1 is built around.** A score that moved is not yet
 * a finding — *"is this real"* is answered before *"is this bad"*, and the
 * window is what answers it. An empty window against a non-zero delta reads
 * **tool noise** on sight ([stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073),
 * the tool disagreeing with itself at a fixed commit); a one-PR window reads
 * *that PR*; a five-PR window reads *you need to look*, which is honest rather
 * than attributive. See `docs/spec/trend-layer.md` §2.
 *
 * ⚠️ **Nothing in the rollout produced this value.** The record ticket
 * ([#157](https://github.com/mephistopheles4/stacks/issues/157)) never listed
 * it and neither did the sync; both the dashboard
 * ([#159](https://github.com/mephistopheles4/stacks/issues/159)) and the deploy
 * print ([#161](https://github.com/mephistopheles4/stacks/issues/161)) consume
 * it. It is emitted **in CI, as a label on `stacks_run_info`**, because that is
 * the only place with the answer: the dashboard is Prometheus and Grafana, and
 * neither can run git.
 *
 * ⚠️ **Three values, and the third is the one that matters.** `#124, #125` is a
 * window; `[]` is an empty one; `unknown` is *no answer* — a shallow checkout, a
 * pruned object, a first-ever run. Collapsing `unknown` into `[]` would
 * manufacture the tool-noise reading out of a missing answer, which is the
 * vacuous-green shape this whole layer is arranged against.
 */

import { gitOutput } from './git.ts';

/** A window with nothing in it — and that is a reading, not a placeholder. */
export const NO_WINDOW = '[]';

/** No answer at all. Never `[]`, for the reason in this file's header. */
export const UNKNOWN_WINDOW = 'unknown';

/**
 * `(#180)` at the end of a subject — what this repo's squash-merge writes — or
 * `Merge pull request #124 from …`, which git writes for a `--no-ff` merge from
 * somebody's machine.
 *
 * Anchored at both ends for the same reason `gates/commands.test.ts`'s extractor
 * is: `Fixes #52` in the middle of a subject is a reference to an issue, and a
 * loose `#\d+` would put it in the window as a pull request that merged.
 */
const MERGED = [/\(#(\d+)\)$/, /^Merge pull request #(\d+) /] as const;

/**
 * The window a list of commit subjects describes, oldest merge first.
 *
 * `undefined` in means `unknown` out. That is the whole reason the git call is
 * below this seam rather than inside it: every way of failing to read the
 * history arrives as one absent answer, and this decides what an absent answer
 * says on the page.
 */
export function windowFrom(subjects: readonly string[] | undefined): string {
  if (subjects === undefined) return UNKNOWN_WINDOW;

  const numbers: string[] = [];
  for (const subject of subjects) {
    const trimmed = subject.trim();
    for (const pattern of MERGED) {
      const found = pattern.exec(trimmed);
      // Counted once however many commits name it: a revert carries the
      // reverted subject verbatim, suffix and all.
      if (found !== null && !numbers.includes(found[1] ?? '')) numbers.push(found[1] ?? '');
    }
  }

  return numbers.length === 0 ? NO_WINDOW : numbers.map((number) => `#${number}`).join(', ');
}

/**
 * The subjects of everything reachable from `head` and not from `previous`, or
 * `undefined` when git cannot answer.
 *
 * `--reverse` because a window reads oldest merge first, and `gitOutput` because
 * *"that object is not here"* is an answer rather than a failure — a shallow
 * checkout is the ordinary case in CI and it must reach `unknown`, not a crash
 * that costs the whole record.
 */
export function subjectsBetween(
  previous: string,
  head: string,
  cwd: string,
): readonly string[] | undefined {
  if (gitOutput(['cat-file', '-e', `${previous}^{commit}`], cwd) === undefined) return undefined;

  const log = gitOutput(['log', '--reverse', '--format=%s', `${previous}..${head}`], cwd);
  if (log === undefined) return undefined;

  return log.split('\n');
}

/**
 * The window between two commits, ready for a label.
 *
 * `previous === undefined` is the first-ever run: there is no previous record,
 * so *"what merged since the last one"* has no answer and must not be spelled
 * as an empty one.
 */
export function prWindow(previous: string | undefined, head: string, cwd: string): string {
  if (previous === undefined || previous === '') return UNKNOWN_WINDOW;

  return windowFrom(subjectsBetween(previous, head, cwd));
}
