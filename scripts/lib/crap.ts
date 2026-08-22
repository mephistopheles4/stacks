/**
 * CRAP for the functions one commit touches — the arithmetic, the join, and
 * the table.
 *
 * `CRAP(m) = CC² × (1 − coverage)³ + CC`, as published, where `coverage` is a
 * **fraction in `[0, 1]`**. Istanbul's JSON carries counts rather than
 * percentages, so the fraction is computed here and the one input that would
 * cube a negative never arrives from outside.
 *
 * ⚠️ **This is a print, and it is the only thing in this rollout that reads a
 * coverage number.** No floor, no threshold, no series, no badge — the four
 * counts on the trend layer are the record, and CRAP is never a panel because
 * the exponents were never calibrated, by the authors' own account. See
 * `docs/spec/complexity-on-the-trend-layer.md` §5 and
 * [ADR-0069](../../docs/adr/0069-coverage-is-an-ingredient-not-a-goal.md).
 *
 * **Everything here is pure.** Running Vitest, reading the report, asking git
 * what is staged and printing belong to `scripts/crap.ts`, which no in-process
 * oracle reaches. The split is what lets every rule below be planted against a
 * synthetic report rather than measured against this repo's real one.
 */

import { relative } from 'node:path';
import { populationOf, type FunctionKind, type PerFunction } from './complexity.ts';
import type { Declarations } from './mutation-score.ts';

/**
 * The caveat that travels on the same line as the word CRAP.
 *
 * ⚠️ **Not a footnote, and that is §5's requirement rather than a preference.**
 * A reader who takes one line out of this table must not be able to read a
 * number without also reading that nobody ever calibrated the exponents — the
 * fact that keeps a ranking a ranking and stops it becoming a verdict.
 */
export const NEVER_CALIBRATED = 'exponents never calibrated';

/** The formula, spelled out where the reader meets the number. */
export const CRAP_FORMULA = 'CC² × (1 − coverage)³ + CC';

/** What an excluded file prints instead of a number. */
export const NO_ORACLE = 'no in-process oracle';

/**
 * The two kinds ESLint scores as functions and Istanbul cannot.
 *
 * A class field initialiser and a static block are implicit functions: the
 * `complexity` rule counts them, and an Istanbul `fnMap` has no entry for
 * either. **Branching on the kind rather than on a failed join** is what stops
 * a coincidental same-line match attaching a neighbouring function's coverage
 * to one of them — the join key is a line number, and a field initialiser
 * shares its line with whatever else is declared there.
 */
const NO_FNMAP_COUNTERPART: ReadonlySet<FunctionKind> = new Set([
  'class-field-initialiser',
  'static-block',
]);

/** A position in Istanbul's maps. Columns are 0-based, and occasionally null. */
export interface IstanbulPosition {
  line: number;
  column?: number | null;
}

export interface IstanbulRange {
  start: IstanbulPosition;
  end: IstanbulPosition;
}

/**
 * One file's coverage — only the fields this module reads.
 *
 * `loc` is the function's whole body span and `decl` only its name token, so
 * the intersection below uses `loc` and the join uses `decl`. Taking `decl` for
 * the intersection was the spike's first attempt and it is far too narrow: it
 * contains no statements at all.
 */
export interface IstanbulFile {
  statementMap: Record<string, IstanbulRange>;
  fnMap: Record<string, { name?: string; decl: IstanbulRange; loc: IstanbulRange }>;
  /** Execution counts, by statement id. */
  s: Record<string, number>;
}

/** `coverage-final.json`, keyed by absolute path. */
export type IstanbulReport = Record<string, IstanbulFile>;

export interface StatementCoverage {
  hit: number;
  total: number;
  /** `hit / total`, or `0` where the function contains no statement. */
  fraction: number;
}

/** One function, ready to print. */
export interface CrapRow {
  file: string;
  line: number;
  column: number;
  label: string;
  name?: string;
  kind: FunctionKind;
  complexity: number;
  /** Absent where no coverage grain exists for this function. */
  coverage?: StatementCoverage;
  /** Absent exactly when `coverage` is. */
  crap?: number;
  /** Why there is no number, where there is none. */
  note?: string;
}

/** Where each staged file went. */
export interface Routing {
  /** In a declared scope, and not excluded: measured. */
  measured: string[];
  /** In a declared scope and excluded, with the mechanism that put it there. */
  excluded: { file: string; mechanism: string }[];
  /** No scope declares it. Not a fault; most of a commit is this. */
  outside: string[];
}

/**
 * CRAP, from a complexity and a coverage fraction.
 *
 * ⚠️ **Refuses a percentage rather than cubing a negative.** At `coverage =
 * 100` the untestedness term is −970299 and a complexity-12 function scores
 * −139,722,816 — which sorts to the *bottom* of the table and reads as the
 * safest thing in the commit. It is the one wrong input that produces a
 * confident answer, so it stops the run instead of ranking.
 */
export function crapOf(complexity: number, coverage: number): number {
  if (!(coverage >= 0 && coverage <= 1)) {
    throw new Error(
      `coverage must be a fraction in [0, 1]; got ${coverage}. Istanbul carries counts, not percentages.`,
    );
  }
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

/**
 * Lexicographic on `(line, column)`.
 *
 * ⚠️ **A null column means opposite things at the two ends of a range, and
 * reading both as `0` is a real defect this repo's own report exposes.** Every
 * `loc.end` V8's provider writes carries `"column": null` — `parseNote` ends
 * `{ line: 160, column: null }` — so a null *end* is the end of that line and a
 * null *start* is its beginning. Collapsing both to zero drops every statement
 * sharing a function's last line, which lowers coverage and raises CRAP for
 * exactly the longest functions in the table.
 */
function atOrAfter(position: IstanbulPosition, start: IstanbulPosition): boolean {
  if (position.line !== start.line) return position.line > start.line;
  return (position.column ?? 0) >= (start.column ?? 0);
}

function atOrBefore(position: IstanbulPosition, end: IstanbulPosition): boolean {
  if (position.line !== end.line) return position.line < end.line;
  return (position.column ?? 0) <= (end.column ?? Number.POSITIVE_INFINITY);
}

function within(position: IstanbulPosition, range: IstanbulRange): boolean {
  return atOrAfter(position, range.start) && atOrBefore(position, range.end);
}

/**
 * Per-function statement coverage, by `fnMap` id.
 *
 * The join the #197 spike measured and `js-crap-score` performs: every
 * statement whose start falls inside a function's `loc` belongs to that
 * function. **Plain containment, so a nested function's statements count for
 * the nested function and for its parent both** — which is not
 * double-counting, because an inner statement really is executed when the outer
 * function runs it, and every consumer here is per-function rather than a sum.
 *
 * A function containing no statement comes back `0/0` with a fraction of `0`
 * and no division: `NaN` formats as a number, sorts unpredictably, and would
 * put an empty function at the top of a table about risk.
 */
export function coverageByFunction(file: IstanbulFile): Map<string, StatementCoverage> {
  const statements = Object.entries(file.statementMap);
  const byFunction = new Map<string, StatementCoverage>();

  for (const [id, entry] of Object.entries(file.fnMap)) {
    let hit = 0;
    let total = 0;

    for (const [statementId, range] of statements) {
      if (!within(range.start, entry.loc)) continue;
      total += 1;
      if ((file.s[statementId] ?? 0) > 0) hit += 1;
    }

    byFunction.set(id, { hit, total, fraction: total === 0 ? 0 : hit / total });
  }
  return byFunction;
}

/**
 * One file's entry in a report keyed by absolute path.
 *
 * ⚠️ **A `related` run's report carries every file `coverage.include` matches,
 * not only the ones the selected tests touched** — the spike's own warning. A
 * hook that treated the whole report as scoped to the changed files would read
 * numbers belonging to files this run never exercised.
 *
 * Matching goes through `relative()` rather than string comparison so that
 * Windows' case-insensitive drive letters and backslashes are the platform's
 * problem rather than this module's.
 */
export function fileCoverageOf(
  report: IstanbulReport,
  file: string,
  repoRoot: string,
): IstanbulFile | undefined {
  for (const [key, coverage] of Object.entries(report)) {
    if (relative(repoRoot, key).split(/[\\/]/).join('/') === file) return coverage;
  }
  return undefined;
}

/** How far apart ESLint's 1-based column and Istanbul's 0-based one are. */
function columnDistance(fn: PerFunction, declaration: IstanbulRange): number {
  return Math.abs((declaration.start.column ?? 0) - (fn.column - 1));
}

/**
 * The functions of one file, joined to that file's coverage and scored.
 *
 * **Joined on start line, with the column only as a tiebreak.** ESLint's
 * reported range means three different things depending on the kind — the head
 * of an ordinary function, the whole `PropertyDefinition` of a field
 * initialiser, the bare `static` token of a static block — so containment is
 * how two candidates *sharing* a line are told apart, never a test for whether
 * one range sits inside the other.
 *
 * Three reasons a row carries no number, and each says which:
 * the kind has no `fnMap` counterpart; the file is not in the report; the file
 * is in the report and this function is not. **None of them is a zero.** A file
 * `coverage.include` puts in the report untouched is a real 0% and a real,
 * maximal CRAP — that is the blind spot the spike closed. A file *missing* from
 * the report is a broken pipe, and printing 0% there would invent the worst
 * number in the table out of a plumbing fault.
 */
export function rowsFor(
  functions: readonly PerFunction[],
  file: IstanbulFile | undefined,
): CrapRow[] {
  const coverage = file ? coverageByFunction(file) : undefined;
  const declarations = file ? Object.entries(file.fnMap) : [];

  const rows = functions.map((fn): CrapRow => {
    const base = {
      file: fn.file,
      line: fn.line,
      column: fn.column,
      label: fn.label,
      name: fn.name,
      kind: fn.kind,
      complexity: fn.complexity,
    };

    if (NO_FNMAP_COUNTERPART.has(fn.kind)) {
      return { ...base, note: 'implicit function — no counterpart in the coverage report' };
    }
    if (!coverage) return { ...base, note: 'not in the coverage report' };

    const candidates = declarations.filter(
      ([, entry]) => entry.decl.start.line === fn.line || entry.loc.start.line === fn.line,
    );
    if (candidates.length === 0) return { ...base, note: 'not in the coverage report' };

    const [id] = candidates.reduce((best, candidate) =>
      columnDistance(fn, candidate[1].decl) < columnDistance(fn, best[1].decl) ? candidate : best,
    );

    const measured = coverage.get(id);
    if (!measured || measured.total === 0) {
      return { ...base, coverage: measured, note: 'no statement to measure' };
    }
    return { ...base, coverage: measured, crap: crapOf(fn.complexity, measured.fraction) };
  });

  return rows;
}

/**
 * Highest CRAP first, and every row carrying no number after every row that
 * does.
 *
 * **Separate from `rowsFor`, because a commit touches files rather than a
 * file.** The hook joins each file's functions against that file's own coverage
 * — the report carries every file `include` matches, so there is no
 * whole-report shortcut — and then ranks the union. Sorting inside `rowsFor`
 * too would be work the caller throws away, and a per-file order nothing ever
 * prints.
 */
export function rank(rows: readonly CrapRow[]): CrapRow[] {
  return [...rows].sort(byCrap);
}

/**
 * Highest CRAP first, and every row carrying no number after every row that
 * does — sorted among themselves by complexity, which is the only fact they
 * have. A row with no number is not a low-risk row; it is an unanswered
 * question, and floating it to the top would rank it while sinking it would
 * hide it.
 */
function byCrap(left: CrapRow, right: CrapRow): number {
  if (left.crap === undefined && right.crap === undefined) {
    return right.complexity - left.complexity || left.line - right.line;
  }
  if (left.crap === undefined) return 1;
  if (right.crap === undefined) return -1;
  return right.crap - left.crap || left.line - right.line;
}

/**
 * Where each staged file goes: measured, excluded, or outside every scope.
 *
 * ⚠️ **This is the one place in the rollout that applies the exclusions**, and
 * the rule is the opposite of the emitter's. The series count a population and
 * never read `exclusions`, because a file's complexity is a fact about the code
 * whatever runs it. The hook must, because a CRAP of 420 for `scene.ts` would
 * be a fact about Vitest's reach: its only oracle is a headless browser, no
 * in-process test ever executes a line of it, and 0% is what that looks like
 * from inside a coverage report.
 *
 * `populationOf`'s `*.test.ts` drop is reproduced here through the same
 * `outside` bucket — a spec is in no population, and saying so is quieter than
 * a fourth category nobody acts on.
 */
export function route(files: readonly string[], declarations: Declarations): Routing {
  /**
   * The population rule is `populationOf`'s and is asked for rather than
   * repeated — glob membership and the `*.test.ts` drop both. A second copy of
   * that predicate here would be a second place for the hook's population to
   * drift from the one the four series count, which is the whole reason one
   * counter serves both.
   */
  const scopeOf = new Map<string, (typeof declarations.scopes)[number]>();
  for (const scope of declarations.scopes) {
    for (const file of populationOf(scope, files)) scopeOf.set(file, scope);
  }

  const routing: Routing = { measured: [], excluded: [], outside: [] };

  for (const file of files) {
    const scope = scopeOf.get(file);
    if (!scope) {
      routing.outside.push(file);
      continue;
    }

    const exclusion = scope.exclusions.find((entry) => entry.path === file);
    if (exclusion) routing.excluded.push({ file, mechanism: exclusion.mechanism });
    else routing.measured.push(file);
  }
  return routing;
}

/**
 * `parseNote`, or the kind in parentheses where ESLint had no identifier to
 * quote — `(arrow)`, `(method)`. The `file:line` every row already carries is
 * what identifies an anonymous one; printing the path twice on the same line
 * was the first attempt and it read as a column that had failed to fill.
 */
function identify(row: CrapRow): string {
  return row.name ?? `(${row.kind})`;
}

/**
 * The table, as the hook prints it.
 *
 * **Anonymous functions are named `file:line` and never `anonymous_7`.**
 * Istanbul's ids are positional: adding an unrelated arrow above one shifts
 * every id below it, so a name carried across commits would misattribute. The
 * hook keeps no history, which is what makes a positionally-keyed name safe to
 * print and unsafe to store.
 */
export function renderReport(rows: readonly CrapRow[], routing: Routing): string {
  const lines: string[] = [];

  if (rows.length > 0) {
    lines.push(
      `CRAP over ${rows.length} ${rows.length === 1 ? 'function' : 'functions'} this commit touches — ${CRAP_FORMULA}, ${NEVER_CALIBRATED}`,
    );
    lines.push('');

    for (const row of rows) {
      const score = row.crap === undefined ? '—' : row.crap.toFixed(1);
      const covered =
        row.coverage === undefined
          ? '—'
          : `${Math.round(row.coverage.fraction * 100)}% (${row.coverage.hit}/${row.coverage.total})`;

      lines.push(
        [
          '  ',
          score.padStart(9),
          '  CC ',
          String(row.complexity).padStart(3),
          '  ',
          covered.padEnd(12),
          '  ',
          identify(row).padEnd(28),
          `  ${row.file}:${row.line}`,
          row.note ? `  — ${row.note}` : '',
        ].join(''),
      );
    }
  }

  if (routing.excluded.length > 0) {
    if (lines.length > 0) lines.push('');
    for (const { file } of routing.excluded) {
      lines.push(`  ${NO_ORACLE}: ${file}`);
    }
  }

  return lines.join('\n');
}
