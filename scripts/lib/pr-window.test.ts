/**
 * The PR window, which is panel 1's whole reason for existing.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`.
 *
 * ⚠️ **Nothing here may touch git or the filesystem.** A spec under `scripts/`
 * runs inside Stryker's sandbox too, where the checkout is a copy and its
 * history is not the history this repo has. `windowFrom` is pure over the
 * subject lines for exactly that reason, and the git call that produces them is
 * the thin half deliberately left below the seam.
 */

import { describe, expect, it } from 'vitest';
import { NO_WINDOW, UNKNOWN_WINDOW, windowFrom } from './pr-window.ts';

describe('windowFrom — subjects to the window panel 1 shows', () => {
  it('reads the squash-merge suffix this repo actually writes', () => {
    expect(windowFrom(['feat: the scope list gets a gate (#179)'])).toBe('#179');
  });

  it('keeps the order it was handed, which is oldest merge first', () => {
    const window = windowFrom([
      'docs: 163 lines leave AGENTS.md (#177)',
      'feat(gates): the scope list gets a gate (#179)',
      'feat: trend:sync pulls the record back (#180)',
    ]);

    expect(window).toBe('#177, #179, #180');
  });

  it('says [] for a window with nothing in it, because empty is a reading', () => {
    // An empty window against a non-zero delta reads *tool noise* on sight, so
    // this value is load-bearing rather than a placeholder for nothing.
    expect(windowFrom(['a commit pushed straight to main'])).toBe(NO_WINDOW);
    expect(windowFrom([])).toBe(NO_WINDOW);
  });

  it('says unknown when there were no subjects to read', () => {
    // ⚠️ Distinct from `[]` on purpose. A shallow checkout, a pruned object or
    // a first-ever run cannot say what merged; reporting that as an empty
    // window would manufacture the tool-noise reading out of a missing answer.
    expect(windowFrom(undefined)).toBe(UNKNOWN_WINDOW);
    expect(UNKNOWN_WINDOW).not.toBe(NO_WINDOW);
  });

  it('ignores a number that is merely mentioned, and takes only the suffix', () => {
    // `Fixes #52` in a subject is a reference to an issue, not a pull request
    // that merged. Only the trailing `(#N)` is a merge, because that is the one
    // this repo's squash-merge writes.
    expect(windowFrom(['fix: strike inference from #52 permanently'])).toBe(NO_WINDOW);
    expect(windowFrom(['fix: strike inference from #52 permanently (#153)'])).toBe('#153');
  });

  it('counts a pull request once, however many commits name it', () => {
    // ⚠️ **Both subjects have to match for this to assert anything.** It read
    // `Revert "feat: a thing (#180)"` first, which git really does write — and
    // which ends in a quote, so `\(#\d+\)$` never matched it and the second
    // subject contributed nothing. The test passed on the first subject alone
    // and would have passed with the deduplication deleted.
    expect(windowFrom(['feat: a thing (#180)', 'fix: follow-up to the same (#180)'])).toBe('#180');
  });

  it('does not read a revert as the pull request it reverts', () => {
    // Measured against real git: `git revert` writes `Revert "<subject>"`, so
    // the suffix is inside a quote and the window does not name #180 twice —
    // nor, deliberately, does it name it at all. A revert is a commit on `main`
    // and not a pull request that merged.
    expect(windowFrom(['Revert "feat: a thing (#180)"'])).toBe(NO_WINDOW);
  });

  it('survives the whitespace a git log actually hands over', () => {
    expect(windowFrom(['feat: a thing (#180)   ', '', '  '])).toBe('#180');
  });

  it('takes a real merge commit too, which this repo does not write but git does', () => {
    // `git merge --no-ff` from a maintainer's machine writes this subject and
    // no trailing `(#N)`. Cheap to read, and the alternative is a window that
    // silently omits a merge that really happened.
    expect(windowFrom(['Merge pull request #124 from mephistopheles4/feat/thing'])).toBe('#124');
  });
});
