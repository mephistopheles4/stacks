/**
 * One mutation run, scored per declared scope.
 *
 *     pnpm mutation:run          # produces artifacts/stryker/current/mutation.json
 *     pnpm mutation:score        # this file: turns that into eight numbers
 *
 * Stryker reports **one** score for whatever `mutate` matched, and `mutate` is a
 * flat glob list — so the run cannot tell you which of the eight declared scopes
 * moved. That is the number the whole rollout is about, so it is computed here,
 * from `stryker.scopes.json` and the JSON report, rather than read off a
 * headline.
 *
 * ⚠️ **Nothing here is a gate and nothing here goes red.** A mutation score is a
 * trend: its failure is a movement a person reads, not an exit code. This prints
 * and exits 0 unless it cannot find its inputs.
 *
 * The score is Stryker's own **total** mutation score —
 * `(killed + timeout) / (killed + timeout + survived + no-coverage)` — and not
 * the *covered* variant, which drops `NoCoverage` from the denominator. Dropping
 * it would make deleting an untested file raise the number, which is the shape
 * this whole effort exists to refuse. Verified against the eight runs committed
 * on `experiment/stryker-cost`: every per-scope figure this produces reproduces
 * `docs/spec/mutation-scoring.md` §4 exactly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/repo-root.ts';

interface Exclusion {
  path: string;
  mechanism: string;
}

interface Scope {
  name: string;
  glob: string;
  note?: string;
  exclusions: Exclusion[];
}

/** Only the fields this script reads; a Stryker report carries more. */
interface MutationReport {
  files: Record<string, { mutants: { status: string; static?: boolean }[] }>;
}

const REPORT =
  process.argv[2] ?? join(REPO_ROOT, 'artifacts', 'stryker', 'current', 'mutation.json');

/**
 * The two glob shapes `stryker.scopes.json` uses, and no others.
 *
 * A directory plus `*.ts` is the **non-recursive** scope — the files directly in
 * it — and the same with `**` in front of it is the recursive one. Deliberately
 * not a glob library: those two shapes are the entire vocabulary, the difference
 * between them is the trap §4 of the spec spends a warning on, and a dependency
 * that silently accepted a third shape would hide the next mistake rather than
 * reject it. Anything else throws.
 */
function globToRegExp(glob: string): RegExp {
  if (!/^[A-Za-z0-9_@./-]*(\*\*\/)?\*\.ts$/.test(glob)) {
    throw new Error(
      `unsupported glob in stryker.scopes.json: ${glob} (want dir/*.ts or dir/**/*.ts)`,
    );
  }
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:[^/]+/)*')
    .replace(/(?<!\))\*/g, '[^/]*');
  return new RegExp(`^${source}$`);
}

function readScopes(): Scope[] {
  const parsed = JSON.parse(readFileSync(join(REPO_ROOT, 'stryker.scopes.json'), 'utf8')) as {
    scopes: Scope[];
  };
  return parsed.scopes;
}

function readReport(): MutationReport {
  try {
    return JSON.parse(readFileSync(REPORT, 'utf8')) as MutationReport;
  } catch {
    console.error(`No mutation report at ${REPORT}.`);
    console.error('Run `pnpm mutation:run` first, or pass a report path as the first argument.');
    process.exit(1);
  }
}

interface Tally {
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  errors: number;
  ignored: number;
  statics: number;
}

function empty(): Tally {
  return { killed: 0, timeout: 0, survived: 0, noCoverage: 0, errors: 0, ignored: 0, statics: 0 };
}

function count(tally: Tally, status: string, isStatic: boolean): void {
  if (isStatic) tally.statics += 1;
  if (status === 'Killed') tally.killed += 1;
  else if (status === 'Timeout') tally.timeout += 1;
  else if (status === 'Survived') tally.survived += 1;
  else if (status === 'NoCoverage') tally.noCoverage += 1;
  else if (status === 'Ignored') tally.ignored += 1;
  else tally.errors += 1;
}

function detected(tally: Tally): number {
  return tally.killed + tally.timeout;
}

function total(tally: Tally): number {
  return detected(tally) + tally.survived + tally.noCoverage;
}

/**
 * ⚠️ **What a zero-mutant scope prints is a decision, not an accident.**
 * `n/a` rather than `100`, because `100` is what an empty denominator produces
 * arithmetically and it is indistinguishable from a scope that is genuinely
 * perfect — which is exactly what Stryker's own summary line does with one, and
 * why the residual check later in this rollout cannot be written against that
 * line. A declared scope that matched no mutants is a broken declaration.
 */
function score(tally: Tally): string {
  return total(tally) === 0 ? 'n/a' : `${((100 * detected(tally)) / total(tally)).toFixed(2)}%`;
}

const scopes = readScopes();
const report = readReport();

const excluded = new Set(scopes.flatMap((scope) => scope.exclusions.map((entry) => entry.path)));
const matchers = scopes.map((scope) => ({ scope, match: globToRegExp(scope.glob) }));

const perScope = new Map<string, Tally>(scopes.map((scope) => [scope.name, empty()]));
/** Files the report carries that no declared scope claims — a config fault, printed rather than hidden. */
const unclaimed = new Map<string, number>();
/** Excluded files that produced mutants anyway — the `live-exclusions` count, measured here first. */
const live = new Map<string, number>();

for (const [file, entry] of Object.entries(report.files)) {
  if (excluded.has(file)) {
    live.set(file, entry.mutants.length);
    continue;
  }
  const owner = matchers.find((candidate) => candidate.match.test(file));
  if (owner === undefined) {
    unclaimed.set(file, entry.mutants.length);
    continue;
  }
  const tally = perScope.get(owner.scope.name);
  if (tally === undefined) throw new Error(`no tally for scope ${owner.scope.name}`);
  for (const mutant of entry.mutants) count(tally, mutant.status, mutant.static === true);
}

const rows = scopes.map((scope) => {
  const tally = perScope.get(scope.name);
  if (tally === undefined) throw new Error(`no tally for scope ${scope.name}`);
  return { scope, tally };
});

const nameWidth = Math.max(...rows.map((row) => row.scope.name.length), 'all declared'.length);
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
  ].join('  ');
}

console.log(`Report: ${REPORT}`);
console.log('');
console.log(
  [
    cell('scope', nameWidth),
    cell('mutants', 7),
    cell('score', 7),
    cell('killed', 6),
    cell('timeout', 7),
    cell('survived', 8),
    cell('no cov', 6),
    cell('static', 6),
    cell('excl', 4),
  ].join('  '),
);
for (const row of rows) console.log(line(row.scope.name, row.tally, String(row.scope.exclusions.length)));

const all = empty();
for (const row of rows) {
  all.killed += row.tally.killed;
  all.timeout += row.tally.timeout;
  all.survived += row.tally.survived;
  all.noCoverage += row.tally.noCoverage;
  all.errors += row.tally.errors;
  all.ignored += row.tally.ignored;
  all.statics += row.tally.statics;
}
console.log(line('all declared', all, String(excluded.size)));

if (all.errors > 0 || all.ignored > 0) {
  console.log('');
  console.log(`Errors: ${all.errors}   Ignored: ${all.ignored}`);
}

// `live-exclusions` — declared exclusions that produced at least one mutant.
// Healthy value is zero, and it is a count rather than a verdict: an entry going
// live means the mechanism written beside it stopped being true, which is a
// thing to read, not a thing to fail on.
if (live.size > 0) {
  console.log('');
  console.log(`live exclusions — ${live.size} of ${excluded.size} produced mutants:`);
  for (const [file, mutants] of live) console.log(`  ${file}  (${mutants})`);
}

// A file Stryker mutated that no scope claims. Not possible while `mutate` is
// derived from the same file this script reads — printed anyway, because the day
// somebody hand-edits `mutate` is the day it stops being impossible.
if (unclaimed.size > 0) {
  console.log('');
  console.log('mutated but claimed by no declared scope:');
  for (const [file, mutants] of unclaimed) console.log(`  ${file}  (${mutants})`);
}
