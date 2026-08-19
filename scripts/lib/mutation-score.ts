/**
 * One Stryker report, tallied against the eight declared scopes.
 *
 * Extracted from `scripts/mutation-scopes.ts`, which is now only its printer,
 * because a second consumer arrived: `scripts/emit-metrics.ts` writes the same
 * numbers to the metrics record. **Re-deriving the arithmetic there would be two
 * implementations of one question** — the shape ADR-0028 refuses — and the two
 * would drift in the direction nobody checks, since one prints to a terminal a
 * person reads and the other writes a file a dashboard reads.
 *
 * ⚠️ **Moving it here put it in the mutation denominator, which is the point.**
 * `scripts/mutation-scopes.ts` is an excluded file — no spec imports it, it is
 * run by `tsx` — so every line of this arithmetic was unreachable to Stryker
 * while it lived there. `gates/trend-layer.test.ts` imports this module
 * in-process, so it is reachable now, and the `scripts` scope's own rule
 * applies: *a file is excluded because a named mechanism puts it out of reach,
 * or it is not excluded.*
 *
 * The score is Stryker's own **total** mutation score —
 * `(killed + timeout) / (killed + timeout + survived + no-coverage)` — and not
 * the *covered* variant, which drops `NoCoverage` from the denominator. Dropping
 * it would make deleting an untested file raise the number, which is the shape
 * this whole effort exists to refuse. **Verified against the eight runs
 * committed on `experiment/stryker-cost`**: every per-scope figure this produces
 * reproduces `docs/spec/mutation-scoring.md` §4 exactly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './repo-root.ts';

export interface Exclusion {
  path: string;
  mechanism: string;
}

export interface Scope {
  name: string;
  glob: string;
  note?: string;
  exclusions: Exclusion[];
}

/** Only the fields this module reads; a Stryker report carries more. */
export interface MutationReport {
  files: Record<string, { mutants: { status: string; static?: boolean }[] }>;
}

export interface Tally {
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  errors: number;
  ignored: number;
  pending: number;
  statics: number;
}

export function empty(): Tally {
  return {
    killed: 0,
    timeout: 0,
    survived: 0,
    noCoverage: 0,
    errors: 0,
    ignored: 0,
    pending: 0,
    statics: 0,
  };
}

/**
 * The two glob shapes `stryker.scopes.json` uses, and no others.
 *
 * A directory plus `*.ts` is the **non-recursive** scope — the files directly in
 * it — and the same with `**` in front of it is the recursive one. Deliberately
 * not a glob library: those two shapes are the entire vocabulary, the difference
 * between them is the trap `docs/spec/mutation-scoring.md` §4 spends a warning
 * on, and a dependency that silently accepted a third shape would hide the next
 * mistake rather than reject it. Anything else throws.
 */
export function globToRegExp(glob: string): RegExp {
  if (!/^[A-Za-z0-9_@./-]*(\*\*\/)?\*\.ts$/.test(glob)) {
    throw new Error(
      `unsupported glob in stryker.scopes.json: ${glob} (want dir/*.ts or dir/**/*.ts)`,
    );
  }
  // The three replacements run in this order and the order is load-bearing:
  // `**/` becomes a group ending in `)`, and the last step's `(?<!\))` is what
  // stops it from then rewriting that group's own `*` quantifier. Reordering
  // them turns `dir/**/*.ts` into a pattern that matches nothing.
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:[^/]+/)*')
    .replace(/(?<!\))\*/g, '[^/]*');
  return new RegExp(`^${source}$`);
}

export function readScopes(): Scope[] {
  const parsed = JSON.parse(readFileSync(join(REPO_ROOT, 'stryker.scopes.json'), 'utf8')) as {
    scopes: Scope[];
  };
  return parsed.scopes;
}

/**
 * Stryker's statuses, mapped to the field each one lands in.
 *
 * `status` stays a `string` rather than a union: it arrives from a JSON file
 * this code does not produce, so a union would be an assertion rather than a
 * fact. Anything unlisted folds into `errors` — which is where `CompileError`
 * and `RuntimeError` belong, and where a status a future Stryker adds belongs
 * until somebody looks at it.
 *
 * **`Pending` is broken out of that fold, and it is not an error.** It means a
 * mutant was generated and has not been tested, and it exists for Stryker's
 * real-time reporting — so a report written by a run that *finished* cannot
 * contain one. Counted separately anyway, because the one way to see it is to
 * score a report from a run still going, and then every score below covers only
 * the part that completed.
 *
 * `Pending` sits outside the denominator either way, alongside `CompileError`,
 * `RuntimeError` and `Ignored`. That is Stryker's own arithmetic, not a choice
 * made here: excluding a mutant is not the same as counting it as killed.
 */
const FIELD_OF: Record<string, keyof Tally> = {
  Killed: 'killed',
  Timeout: 'timeout',
  Survived: 'survived',
  NoCoverage: 'noCoverage',
  Ignored: 'ignored',
  Pending: 'pending',
};

function count(tally: Tally, status: string, isStatic: boolean): void {
  if (isStatic) tally.statics += 1;
  tally[FIELD_OF[status] ?? 'errors'] += 1;
}

export function detected(tally: Tally): number {
  return tally.killed + tally.timeout;
}

export function total(tally: Tally): number {
  return detected(tally) + tally.survived + tally.noCoverage;
}

/**
 * A scope's score as a fraction, or `null` where it produced no mutants.
 *
 * ⚠️ **`null` rather than `1`.** An empty denominator produces 100%
 * arithmetically and that is indistinguishable from a scope that is genuinely
 * perfect — which is what Stryker's own summary line does with one, and why the
 * residual check later in this rollout cannot be written against that line. A
 * declared scope that matched no mutants is a broken declaration.
 */
export function fraction(tally: Tally): number | null {
  return total(tally) === 0 ? null : detected(tally) / total(tally);
}

export interface ScoredRun {
  scopes: Scope[];
  perScope: Map<string, Tally>;
  /** Excluded files the report carries anyway, with their mutant counts. */
  live: Map<string, number>;
  /** Files the report carries that no declared scope claims — a config fault. */
  unclaimed: Map<string, number>;
  /** Every exclusion entry declared across every scope. */
  declaredExclusions: number;
}

export function readReport(path: string): MutationReport {
  return JSON.parse(readFileSync(path, 'utf8')) as MutationReport;
}

/** Tally one report against the declared scopes. */
export function scoreRun(report: MutationReport, scopes: Scope[]): ScoredRun {
  const excluded = new Set(scopes.flatMap((scope) => scope.exclusions.map((entry) => entry.path)));
  const matchers = scopes.map((scope) => ({ scope, match: globToRegExp(scope.glob) }));

  const perScope = new Map<string, Tally>(scopes.map((scope) => [scope.name, empty()]));
  const unclaimed = new Map<string, number>();

  /**
   * Excluded files that turned up in the report anyway.
   *
   * ⚠️ **Empty by construction while `mutate` is derived from the same file**,
   * and that is worth stating rather than leaving as an apparently-live check:
   * an exclusion is negated out of `mutate`, so Stryker never mutates it and it
   * never reaches a report.
   *
   * ⚠️ **This feeds the `live-exclusions` trend, and under the standard config
   * that series cannot move.** The claim here changed sides during #157 and the
   * correction is recorded rather than the reversal quietly kept: the version of
   * this comment in `scripts/mutation-scopes.ts` said *"this is **not** the
   * spec's `live-exclusions` trend, which asks a question a run of this config
   * cannot answer — it needs a deliberately wider run"*, and **that version was
   * right**. `docs/spec/mutation-scoring.md` §7 says the exclusion flips when you
   * *"write a test that touches it"*; a test cannot flip a file Stryker never
   * mutates.
   *
   * So what ships is the **denominator half honestly and the numerator half
   * structurally zero** — a config-drift tripwire rather than the measurement
   * the spec names. Carried as an open weakness on G36 in
   * `docs/gate-register.md` rather than as a solved problem, because a series
   * incapable of movement is a flat line, and a flat line that arrives on time
   * is the exact shape this whole layer was built to refuse.
   *
   * What it does catch is scoring a report some *other* `mutate` produced — a
   * probe config, or one of the historical wide runs on
   * `experiment/stryker-cost` — without silently folding an excluded file into a
   * scope's denominator.
   */
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

  return { scopes, perScope, live, unclaimed, declaredExclusions: excluded.size };
}

/** The tally of a run, summed across every declared scope. */
export function totalOf(run: ScoredRun): Tally {
  const all = empty();
  for (const scope of run.scopes) {
    const tally = run.perScope.get(scope.name);
    if (tally === undefined) throw new Error(`no tally for scope ${scope.name}`);
    all.killed += tally.killed;
    all.timeout += tally.timeout;
    all.survived += tally.survived;
    all.noCoverage += tally.noCoverage;
    all.errors += tally.errors;
    all.ignored += tally.ignored;
    all.pending += tally.pending;
    all.statics += tally.statics;
  }
  return all;
}
