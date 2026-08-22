/**
 * G44 — the mutation run's Vitest reporters ↔ the ones a laptop resolves.
 *
 * ## The defect
 *
 * Vitest appends its `github-actions` reporter to its own default list whenever
 * `GITHUB_ACTIONS` is `true` — **and only when nothing is declared**, which is
 * the whole mechanism this row rests on. That reporter's job-summary half
 * appends to `$GITHUB_STEP_SUMMARY` on every `onTestRunEnd`, with `flag: 'a'`.
 *
 * Under `pnpm test` that fires **once**: 179 bytes, useful, and the merge job
 * has published it all along. Under Stryker it fires **once per mutant**,
 * because a mutation run is thousands of test runs through one Vitest instance.
 * Measured on this repo: **5 appends / 923 bytes** over a four-mutant scope, and
 * **1054k over the real ~5900** — past the 1024k GitHub accepts. The nightly of
 * 2026-08-22 logged `$GITHUB_STEP_SUMMARY upload aborted`, and the runs before
 * it had been uploading most of a megabyte of the same six lines repeated,
 * which is what made the run page slow to open in a browser.
 *
 * ## Why it needs a gate rather than a comment
 *
 * ⚠️ **Nothing local can catch it, in either direction.** `GITHUB_ACTIONS` is
 * unset on a developer machine, so the reporter is never added, so the appends
 * never happen and the file is never written. The fault exists only in the one
 * environment nobody runs interactively — the same shape as `metrics.yml`'s
 * empty-string ternary, whose docblock says it verbatim: *"Nothing local can
 * catch it — the emitter is green, the suite is green, and the bug lives in
 * expression evaluation."*
 *
 * And it **decays silently**: the summary grew with the mutant count for weeks
 * and cost nothing until it crossed a threshold, so there was no commit to
 * blame and no red to notice. A comment on the option would have been true and
 * unread.
 *
 * ## What it asserts, and the limit
 *
 * Two clauses, because the option is worth nothing in a file Stryker does not
 * load:
 *
 * 1. `stryker.config.mjs` still points `vitest.configFile` at
 *    `vitest.stryker.config.ts` — the wiring, on G39's idiom (*what the gate
 *    asserts is that the script agrees with the judgement today*).
 * 2. That config declares a **non-empty** `test.reporters`, which is exactly
 *    the condition under which Vitest's `GITHUB_ACTIONS` branch cannot append.
 *
 * ⚠️ **It proves the condition, never Vitest's honouring of it.** The append is
 * third-party behaviour in a released package and a version bump could move it;
 * this repo has no offline way to observe a reporter list resolved under an
 * environment variable that is unset. `cover_source`'s stated limit and G40's,
 * reached a third time and written down rather than left implicit.
 *
 * ⚠️ **The root `vitest.config.ts` is deliberately not asserted.** Its single
 * append is the reporter working as intended, and freezing *absence* there
 * would gate a behaviour nobody chose.
 *
 * See docs/gates.md, row G44 (stryker-reporters).
 */

import { describe, expect, it } from 'vitest';
import strykerConfig from '../stryker.config.mjs';
import strykerVitestConfig from '../vitest.stryker.config.ts';
import { expectFound, readRepoFile } from './repo.ts';

/** The config file Stryker's Vitest runner is told to load. */
const STRYKER_VITEST_CONFIG = 'vitest.stryker.config.ts';

describe('G44 — Stryker runs the config this gate reads', () => {
  it('points Stryker at the config file asserted below', () => {
    // Without this the clause underneath is a fact about a file nothing loads.
    // Imported rather than grepped, so a `vitest` block restructured around it
    // fails here instead of passing on a matching string somewhere else.
    expect(
      strykerConfig.vitest?.configFile,
      `${STRYKER_VITEST_CONFIG} is where the reporter list is declared, so Stryker ` +
        'pointing anywhere else silently restores the per-mutant append.',
    ).toBe(STRYKER_VITEST_CONFIG);
  });
});

describe('G44 — the mutation run declares its reporters', () => {
  it('declares a non-empty reporter list', () => {
    // Non-empty is the exact condition, not a proxy for one: Vitest appends its
    // `github-actions` reporter only to a list that resolved empty. `[]` reads
    // as a declaration and is the case that would pass a truthiness check while
    // leaving the door open, so the assertion counts.
    expectFound(
      [strykerVitestConfig.test?.reporters ?? []].flat(),
      `reporters declared in ${STRYKER_VITEST_CONFIG} — an empty or absent list is what ` +
        "lets Vitest add `github-actions`, whose job summary appends once per mutant",
    );
  });

  it('declares them in the file Stryker loads, not somewhere inherited', () => {
    // The import above answers "what does the resolved config say"; this answers
    // "does this file say it". A reporter list arriving from a shared base would
    // satisfy the clause above and move the property out from under the docblock
    // that explains it — where the next person to edit this file will not see it.
    expect(
      readRepoFile(STRYKER_VITEST_CONFIG),
      `${STRYKER_VITEST_CONFIG} must declare \`reporters\` itself; the argument for it ` +
        'lives in that file and a list inherited from elsewhere leaves the argument ' +
        'attached to nothing.',
    ).toMatch(/^\s*reporters:/m);
  });
});
