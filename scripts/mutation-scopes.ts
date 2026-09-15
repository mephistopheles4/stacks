/**
 * One mutation run, scored per declared scope.
 *
 *     pnpm mutation:run          # produces artifacts/stryker/current/mutation.json
 *     pnpm mutation:score        # this file: turns that into eight numbers
 *     pnpm mutation:score --markdown   # the nightly's job summary, as Markdown
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

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/repo-root.ts';
import {
  parseReport,
  renderSummary,
  terminalTable,
  type ReportState,
} from './lib/mutation-report.ts';
import {
  readReport,
  readReportText,
  readScopes,
  scoreRun,
  totalOf,
  type MutationReport,
} from './lib/mutation-score.ts';

/**
 * `--markdown` prints the nightly's job summary instead of the terminal table,
 * and nothing else, so the workflow can append stdout to `$GITHUB_STEP_SUMMARY`.
 * It runs this file through `pnpm exec tsx` rather than `pnpm mutation:score`,
 * because `pnpm run` prints its own banner to stdout. The other three flags only
 * feed that summary.
 */
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    markdown: { type: 'boolean', default: false },
    'mutation-status': { type: 'string', default: '' },
    'artifact-url': { type: 'string', default: '' },
    commit: { type: 'string', default: '' },
  },
});

const REPORT =
  positionals[0] ?? join(REPO_ROOT, 'artifacts', 'stryker', 'current', 'mutation.json');

/**
 * ⚠️ **Markdown mode exits 0 on every path, a missing report included.** The
 * summary step must never fail the job: a night with no report already failed
 * for a reason, and a second red step would bury it.
 */
if (values.markdown) {
  let state: ReportState;
  const text = readReportText(REPORT);
  if (text === undefined) {
    state = { kind: 'missing', path: REPORT };
  } else {
    try {
      state = { kind: 'parsed', report: parseReport(text) };
    } catch (error) {
      state = { kind: 'unparseable', path: REPORT, reason: String(error) };
    }
  }
  const summary = renderSummary({
    state,
    scopes: readScopes(),
    date: new Date().toISOString().slice(0, 10),
    commit: values.commit,
    mutationStatus: values['mutation-status'],
    artifactUrl: values['artifact-url'],
  });
  console.log(summary);
  process.exit(0);
}

function reportOrExit(path: string): MutationReport {
  try {
    return readReport(path);
  } catch {
    console.error(`No mutation report at ${path}.`);
    console.error('Run `pnpm mutation:run` first, or pass a report path as the first argument.');
    process.exit(1);
  }
}

const scopes = readScopes();
const run = scoreRun(reportOrExit(REPORT), scopes);

console.log(`Report: ${REPORT}`);
console.log('');
// The table's cells, widths and `n/a` rule live in `lib/mutation-report.ts`,
// shared with the job summary so the two surfaces print one set of numbers.
for (const line of terminalTable(run)) console.log(line);

const all = totalOf(run);

if (all.errors > 0 || all.ignored > 0) {
  console.log('');
  console.log(`Errors: ${all.errors}   Ignored: ${all.ignored}`);
}

// The scores above are not wrong when this fires — they are partial, which is
// worse, because a partial score reads exactly like a finished one.
if (all.pending > 0) {
  console.log('');
  console.log(
    `⚠ ${all.pending} mutant(s) still Pending — this report is from a run that has not finished.`,
  );
  console.log('  Every score above covers only the part that completed.');
}

// An excluded file the report carries anyway — see `scoreRun` for why this
// cannot happen against a report `pnpm mutation:run` produced, and what it
// catches in the reports that are not.
if (run.live.size > 0) {
  console.log('');
  console.log(
    `excluded but present in this report — ${run.live.size} of ${run.declaredExclusions}:`,
  );
  for (const [file, mutants] of run.live) console.log(`  ${file}  (${mutants})`);
}

// A file Stryker mutated that no scope claims. Not possible while `mutate` is
// derived from the same file this script reads — printed anyway, because the day
// somebody hand-edits `mutate` is the day it stops being impossible.
if (run.unclaimed.size > 0) {
  console.log('');
  console.log('mutated but claimed by no declared scope:');
  for (const [file, mutants] of run.unclaimed) console.log(`  ${file}  (${mutants})`);
}
