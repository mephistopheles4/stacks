/**
 * One mutation run, scored per declared scope.
 *
 *     pnpm mutation:run          # produces artifacts/stryker/current/mutation.json
 *     pnpm mutation:score        # this file: turns that into eight numbers
 *
 * Stryker reports **one** score for whatever `mutate` matched, and `mutate` is a
 * flat glob list — so the run cannot tell you which of the eight declared scopes
 * moved. That is the number the whole rollout is about, so it is computed from
 * `stryker.scopes.json` and the JSON report rather than read off a headline.
 *
 * ⚠️ **The arithmetic moved to `scripts/lib/mutation-score.ts`; this file is now
 * only its printer.** A second consumer arrived — `scripts/emit-metrics.ts`
 * writes the same numbers to the metrics record — and two implementations of one
 * question drift in the direction nobody checks. The move also put every line of
 * that arithmetic inside the mutation denominator for the first time: this file
 * is excluded (no spec imports it), and the library is not.
 *
 * ⚠️ **Nothing here is a gate and nothing here goes red.** A mutation score is a
 * trend: its failure is a movement a person reads, not an exit code. This prints
 * and exits 0 unless it cannot find its inputs.
 */

import { join } from "node:path";
import { REPO_ROOT } from "./lib/repo-root.ts";
import {
  fraction,
  readReport,
  readScopes,
  scoreRun,
  total,
  totalOf,
  type MutationReport,
  type Tally,
} from "./lib/mutation-score.ts";

const REPORT =
  process.argv[2] ??
  join(REPO_ROOT, "artifacts", "stryker", "current", "mutation.json");

/**
 * ⚠️ **What a zero-mutant scope prints is a decision, not an accident.**
 * `n/a` rather than `100`, because `100` is what an empty denominator produces
 * arithmetically and it is indistinguishable from a scope that is genuinely
 * perfect — which is exactly what Stryker's own summary line does with one, and
 * why the residual check later in this rollout cannot be written against that
 * line. A declared scope that matched no mutants is a broken declaration.
 */
function score(tally: Tally): string {
  const value = fraction(tally);
  return value === null ? "n/a" : `${(100 * value).toFixed(2)}%`;
}

function reportOrExit(path: string): MutationReport {
  try {
    return readReport(path);
  } catch {
    console.error(`No mutation report at ${path}.`);
    console.error(
      "Run `pnpm mutation:run` first, or pass a report path as the first argument.",
    );
    process.exit(1);
  }
}

const scopes = readScopes();
const run = scoreRun(reportOrExit(REPORT), scopes);

const rows = scopes.map((scope) => {
  const tally = run.perScope.get(scope.name);
  if (tally === undefined) throw new Error(`no tally for scope ${scope.name}`);
  return { scope, tally };
});

const nameWidth = Math.max(
  ...rows.map((row) => row.scope.name.length),
  "all declared".length,
);
const cell = (text: string, width: number): string => text.padStart(width);

function line(name: string, tally: Tally, exclusions: string): string {
  return [
    cell(name, nameWidth),
    cell(String(total(tally)), 7),
    cell(score(tally), 7),
    cell(String(tally.killed), 6),
    cell(String(tally.timeout), 7),
    cell(String(tally.survived), 8),
    cell(String(tally.noCoverage), 6),
    cell(String(tally.statics), 6),
    cell(exclusions, 4),
  ].join("  ");
}

console.log(`Report: ${REPORT}`);
console.log("");
console.log(
  [
    cell("scope", nameWidth),
    cell("mutants", 7),
    cell("score", 7),
    cell("killed", 6),
    cell("timeout", 7),
    cell("survived", 8),
    cell("no cov", 6),
    cell("static", 6),
    cell("excl", 4),
  ].join("  "),
);
for (const row of rows)
  console.log(
    line(row.scope.name, row.tally, String(row.scope.exclusions.length)),
  );

const all = totalOf(run);
console.log(line("all declared", all, String(run.declaredExclusions)));

if (all.errors > 0 || all.ignored > 0) {
  console.log("");
  console.log(`Errors: ${all.errors}   Ignored: ${all.ignored}`);
}

// The scores above are not wrong when this fires — they are partial, which is
// worse, because a partial score reads exactly like a finished one.
if (all.pending > 0) {
  console.log("");
  console.log(
    `⚠ ${all.pending} mutant(s) still Pending — this report is from a run that has not finished.`,
  );
  console.log("  Every score above covers only the part that completed.");
}

// An excluded file the report carries anyway — see `scoreRun` for why this
// cannot happen against a report `pnpm mutation:run` produced, and what it
// catches in the reports that are not.
if (run.live.size > 0) {
  console.log("");
  console.log(
    `excluded but present in this report — ${run.live.size} of ${run.declaredExclusions}:`,
  );
  for (const [file, mutants] of run.live)
    console.log(`  ${file}  (${mutants})`);
}

// A file Stryker mutated that no scope claims. Not possible while `mutate` is
// derived from the same file this script reads — printed anyway, because the day
// somebody hand-edits `mutate` is the day it stops being impossible.
if (run.unclaimed.size > 0) {
  console.log("");
  console.log("mutated but claimed by no declared scope:");
  for (const [file, mutants] of run.unclaimed)
    console.log(`  ${file}  (${mutants})`);
}
