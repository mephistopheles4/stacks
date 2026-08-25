/**
 * The mutation floor: the number a deploy refuses under, and what stops it
 * being lowered quietly.
 *
 * Spec: `docs/spec/the-ratchet.md`. **The spec names no floor value, for any
 * scope** — it names the rule that produces one, and the value comes from
 * observed history. This module is that rule, and nothing in it arms anything.
 *
 * **The rules are pure and the disk is at the edge**, which is
 * `scripts/lib/scope-check.ts`'s split and it is here for the reason the G38
 * register entry gives: the row sharing this mechanism, G17 (`deploy-branch`),
 * is exposed because *the gate spawns `scripts/deploy.ts`, so the argv the
 * shipped command supplies is invisible to it* — remedy named, not built. So
 * every judgement below takes its inputs as arguments and `scripts/deploy.ts`
 * is a thin caller, which avoids that subprocess boundary rather than
 * inheriting it.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Type-only, deliberately: `complexity.ts` imports ESLint at its top level, and
// a value import here would drag the linter into every module that reads a
// floor — including the deploy, which computes no count and only compares two
// strings.
import type { CounterInputs } from './complexity.ts';
import { METRIC_PREFIXES, type TrendName } from './metrics.ts';
import { MERGE_EVENT, runInfoOf, samplesOf, scoresOf, type ParsedRecord } from './metrics-read.ts';
import { globToRegExp, type Scope } from './mutation-score.ts';
import { REPO_ROOT } from './repo-root.ts';
import { sourceFiles } from './scope-check.ts';

/** A scope's floor: a number it may not score under, or explicitly not yet set. */
export type FloorValue = number | 'unarmed';

/** The value that is not a number, spelled once. */
export const UNARMED = 'unarmed';

/**
 * The two series that get a cap, and the whole of what may be capped.
 *
 * ⚠️ **`complexity-functions` and `complexity-mass` are deliberately absent.**
 * They grow with the codebase legitimately, and a cap on either would refuse a
 * feature — a check that punishes the work rather than the decay. Naming one of
 * them in the floors file is therefore the same fault as misspelling a capped
 * series, and the reader treats it as one.
 */
export const CAPPED_SERIES = [
  'complexity-max',
  'complexity-mass-over-10',
] as const satisfies readonly TrendName[];

/** A series a cap may name. */
export type CappedSeries = (typeof CAPPED_SERIES)[number];

/** A scope's cap on one series: a number it may not exceed, or explicitly not yet set. */
export type CapValue = number | typeof UNARMED;

/**
 * One scope's cap on one series.
 *
 * **`ScopeFloor`'s mirror, minus `ignored`.** That counter is about disable
 * directives in mutated source and means nothing to a count of branches. The
 * date and the append-only notes carry over unchanged, because the reasons for
 * them do: raising a cap is the lowering of this file, and costs a notes entry
 * like any other.
 */
export interface ScopeCap {
  cap: CapValue;
  /** ISO date — when the entry was added, or when it was armed. */
  armed: string;
  /** Append-only, one line per raising, never cleared. */
  notes: string[];
}

export interface ScopeFloor {
  floor: FloorValue;
  /** ISO date — when the entry was added, or when it was armed. */
  armed: string;
  /** The disable-comment counter. */
  ignored: number;
  /** Append-only, one line per lowering, never cleared. */
  notes: string[];
  /**
   * This scope's caps, by series.
   *
   * ⚠️ **An empty map is a legal shape and a refused state.** Whether every
   * capped series is accounted for is a *completeness* question, and this file
   * already answers those at the refusal rather than at the parse —
   * `correspondence` does exactly this for scopes. Throwing here instead would
   * make the floors file unreadable on the commit that adds a scope, including
   * to the print whose whole job is to say what is missing.
   */
  caps: Map<CappedSeries, ScopeCap>;
}

export interface Floors {
  /** The score-affecting Stryker configuration these floors were derived under. */
  configHash: string;
  /**
   * The counting rule these caps were derived under.
   *
   * `configHash`'s role for the other half of this file, and required for the
   * same reason: an ESLint upgrade that counted one more construct would breach
   * every cap at once and read as a regression. See `fixtureHashOf`.
   */
  fixtureHash: string;
  scopes: Map<string, ScopeFloor>;
}

/**
 * The floors document, or a throw.
 *
 * ⚠️ **A malformed floors file is never a partial one.** Every refusal this
 * module produces reads the file, so a parse that dropped an unreadable entry
 * would turn a corrupted floor into a scope nothing checks — the failure the
 * whole piece exists to prevent, arriving through the reader.
 */
export function parseFloors(document: unknown): Floors {
  if (typeof document !== 'object' || document === null) {
    throw new Error('the floors file is not an object');
  }

  const { configHash, fixtureHash, scopes } = document as {
    configHash?: unknown;
    fixtureHash?: unknown;
    scopes?: unknown;
  };

  if (typeof configHash !== 'string' || configHash === '') {
    throw new Error('the floors file carries no configHash');
  }
  if (typeof fixtureHash !== 'string' || fixtureHash === '') {
    throw new Error('the floors file carries no fixtureHash');
  }
  if (typeof scopes !== 'object' || scopes === null) {
    throw new Error('the floors file carries no scopes object');
  }

  const parsed = new Map<string, ScopeFloor>();
  for (const [name, entry] of Object.entries(scopes as Record<string, unknown>)) {
    parsed.set(name, parseEntry(name, entry));
  }
  return { configHash, fixtureHash, scopes: parsed };
}

function parseEntry(name: string, entry: unknown): ScopeFloor {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`the floors entry for ${name} is not an object`);
  }
  const { floor, armed, ignored, notes, caps } = entry as Record<string, unknown>;

  if (floor !== UNARMED && typeof floor !== 'number') {
    throw new Error(`the floor for ${name} is neither a number nor ${UNARMED}: ${String(floor)}`);
  }
  if (typeof armed !== 'string' || armed === '') {
    throw new Error(`the floors entry for ${name} carries no date`);
  }
  if (typeof ignored !== 'number' || !Number.isInteger(ignored) || ignored < 0) {
    throw new Error(`the ignored counter for ${name} is not a count: ${String(ignored)}`);
  }
  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    throw new Error(`the notes for ${name} are not a list of lines`);
  }

  return { floor, armed, ignored, notes: notes as string[], caps: parseCaps(name, caps) };
}

/**
 * One scope's caps, by series, or a throw.
 *
 * ⚠️ **An unrecognised series name is a fault and never a skipped key.** That
 * is `cover_source`'s rule in `AGENTS.md` applied to a different file: a typo
 * that parsed would leave the series it meant to cap refusing nothing,
 * silently, behind a line in the file that reads as protection. A cap exists to
 * prevent exactly that, so it must not arrive through the reader.
 */
function parseCaps(name: string, caps: unknown): Map<CappedSeries, ScopeCap> {
  const parsed = new Map<CappedSeries, ScopeCap>();
  if (caps === undefined) return parsed;

  if (typeof caps !== 'object' || caps === null) {
    throw new Error(`the caps for ${name} are not an object`);
  }

  const cappable = new Set<string>(CAPPED_SERIES);
  for (const [series, entry] of Object.entries(caps as Record<string, unknown>)) {
    if (!cappable.has(series)) {
      throw new Error(
        `${name} caps ${series}, which is not a capped series. ` +
          `The capped series are ${CAPPED_SERIES.join(' and ')}.`,
      );
    }
    parsed.set(series as CappedSeries, parseCap(`${name} ${series}`, entry));
  }
  return parsed;
}

function parseCap(what: string, entry: unknown): ScopeCap {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`the cap for ${what} is not an object`);
  }
  const { cap, armed, notes } = entry as Record<string, unknown>;

  if (cap !== UNARMED && typeof cap !== 'number') {
    throw new Error(`the cap for ${what} is neither a number nor ${UNARMED}: ${String(cap)}`);
  }
  if (typeof armed !== 'string' || armed === '') {
    throw new Error(`the cap for ${what} carries no date`);
  }
  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    throw new Error(`the notes for ${what} are not a list of lines`);
  }

  return { cap, armed, notes: notes as string[] };
}

/** Scopes one side names and the other does not. Both directions, always. */
export interface Correspondence {
  /** Declared scopes with no entry — the vacuous-green direction. */
  unaccounted: string[];
  /** Entries naming a scope nothing declares — the rotting-list direction. */
  orphans: string[];
}

/**
 * Exact correspondence between the declared scopes and the floors file.
 *
 * ⚠️ **The forward direction is the one that matters and the one that looks
 * unnecessary.** A scope added to `stryker.scopes.json` and not to the floors
 * file is scored by every run and floored by nothing — it refuses nothing,
 * silently, which is exactly the case a floor exists to catch. G19's own trick,
 * applied to floors: the answer to *a rule nothing can fail on* is a
 * completeness assertion in both directions.
 *
 * **An added scope may be `unarmed` with its date.** Explicitly unarmed is not
 * silently unfloored: it is in a tracked file, it carries a date, and the
 * deploy print lists it every time.
 */
export function correspondence(declared: readonly string[], floors: Floors): Correspondence {
  const entries = new Set(floors.scopes.keys());

  return {
    unaccounted: declared.filter((name) => !entries.has(name)),
    orphans: [...entries].filter((name) => !declared.includes(name)),
  };
}

/** One mutated source file, read by whoever owns the disk. */
export interface SourceFile {
  path: string;
  source: string;
}

/**
 * Stryker's disable directive, and only in a comment.
 *
 * ⚠️ **Matching the bare words would count this file.** Every line of this
 * module is inside the `scripts` scope, so a counter that grepped for the words
 * alone would find its own pattern, its own refusal copy and its own prose, and
 * the counter for `scripts` would have to carry a number no mutant caused.
 * Requiring a comment opener immediately before the word is what makes the
 * module safe to describe itself: the pattern below contains no unescaped `//`
 * or comment opener anywhere in its own source.
 *
 * ⚠️ **It matches every opener a comment can take, not the one an author
 * pictures.** Stryker parses **comment nodes**, so the opener is stripped before
 * its own matcher ever runs: a jsdoc-style opener, and a continuation line
 * inside a block comment, reach it as the same directive as a plain line
 * comment. An earlier version of this pattern saw only the last of those. A
 * check that reads one spelling of something the format lets you write several
 * ways is a hole, and this rollout found three of that species in one branch.
 * The spellings are enumerated in `floors.test.ts` rather than written out here,
 * for the reason in the next paragraph.
 *
 * ⚠️ **Widening it made this module's own prose count**, which is the warning
 * above arriving one paragraph later: a draft of this comment quoted the openers
 * beside the directive words, and the sweep of the real tree went from 0 to 1
 * for `scripts`. The gate caught it. Describe the forms here; spell them only in
 * a spec file, which no scope mutates.
 *
 * **The over-matching direction is the safe one and it is chosen deliberately.**
 * A directive this misses is a mutant withheld from the denominator with the
 * gate green — silent, which is the failure the row exists to prevent. A false
 * positive is a red build somebody investigates. The spec asks for *an actual
 * grep for `Stryker disable`*, which is broader than Stryker's own parser, and
 * that is the reading taken here.
 *
 * `restore` is deliberately not counted. It re-enables mutation, so counting it
 * would add one for each end of a bracketed region and make the total mean
 * neither *directives* nor *mutants withheld*.
 */
const DIRECTIVE = /(?:\/\/|\/\*)[\s*]*Stryker\s+disable\b/g;

/**
 * Disable directives per declared scope, over the files handed in.
 *
 * The attribution chain is `scoreRun`'s, deliberately: an exclusion wins over
 * every glob, and the first scope whose glob matches owns the file. A file no
 * scope claims is counted by nobody, which is right — it is not mutated, so no
 * directive in it withholds a mutant from any denominator.
 */
export function countDisableDirectives(
  files: readonly SourceFile[],
  scopes: readonly Scope[],
): Map<string, number> {
  const excluded = new Set(scopes.flatMap((entry) => entry.exclusions.map((one) => one.path)));
  const matchers = scopes.map((entry) => ({ scope: entry, match: globToRegExp(entry.glob) }));
  const counted = new Map<string, number>(scopes.map((entry) => [entry.name, 0]));

  for (const file of files) {
    if (excluded.has(file.path)) continue;
    const owner = matchers.find((candidate) => candidate.match.test(file.path));
    if (owner === undefined) continue;

    const found = file.source.match(DIRECTIVE)?.length ?? 0;
    counted.set(owner.scope.name, (counted.get(owner.scope.name) ?? 0) + found);
  }
  return counted;
}

/**
 * Stryker options that decide where output goes, and nothing else.
 *
 * ⚠️ **A denylist, in a repo whose doctrine is allowlists — and the direction
 * is the reason.** `private:` fails closed by treating anything unrecognised as
 * private, and this fails closed by treating anything unrecognised as
 * score-affecting: an option nobody has classified is hashed. The two failure
 * modes are not symmetric. A field wrongly hashed produces a loud refusal that
 * costs one re-derivation; a field wrongly ignored produces two numbers that do
 * not mean the same thing and nothing that says so — which is the exact hole
 * the hash exists to close.
 *
 * Every entry here is output, logging or scratch: none of them can change which
 * mutants are generated or what verdict one gets.
 */
export const SCORE_NEUTRAL_OPTIONS: readonly string[] = [
  '$schema',
  'packageManager',
  'reporters',
  'htmlReporter',
  'jsonReporter',
  'dashboard',
  'logLevel',
  'fileLogLevel',
  'allowConsoleColors',
  'tempDirName',
  'cleanTempDir',
  'incremental',
  'incrementalFile',
];

/** JSON with object keys in a fixed order, so a re-ordered file hashes the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonical((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * The score-affecting Stryker configuration, as one string.
 *
 * **Array order is significant and object key order is not.** Re-ordering
 * `mutate` cannot change the population, but this hashes it anyway rather than
 * sorting: a hash that forgives a reordering has to prove the reordering was
 * semantically empty, and `mutate` is a sequence of includes and negations
 * where that is not true in general.
 */
export function configHashOf(config: Record<string, unknown>): string {
  const neutral = new Set(SCORE_NEUTRAL_OPTIONS);
  const scoring: Record<string, unknown> = {};

  for (const key of Object.keys(config).sort()) {
    if (!neutral.has(key)) scoring[key] = canonical(config[key]);
  }
  return digest(scoring);
}

/**
 * The one spelling of a hash in this file, for the reason ADR-0028 gives about
 * two parsers of one format: this module now stamps **two** things, and a
 * digest written twice is free to drift in the half nobody re-reads.
 */
function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/**
 * What the complexity counts *mean*, as one string.
 *
 * `configHashOf`'s job for the other half of this file. A cap is a number about
 * a counting rule, and an ESLint upgrade that counts one more construct would
 * breach every cap at once and read as a regression — so a record stamped under
 * a different rule is **refused rather than compared**.
 *
 * **The canonical inputs are the spec's, in the spec's order**
 * (`docs/spec/complexity-on-the-trend-layer.md` §4): the two installed
 * versions, the resolved rule options, and the fixture's expected totals.
 * Positional, in an array, so the order is structural rather than a promise in
 * a comment — swapping the two version strings is a different hash, which is
 * the property `floors.test.ts` plants.
 *
 * ⚠️ **Severity is absent from `ruleOptions` and that is `CounterInputs`'s
 * judgement, not an omission here.** At `max: 0` every function reports whether
 * the rule says `warn` or `error`, so severity cannot move a count — and
 * hashing it would refuse every record across a `warn` → `error` edit whose
 * numbers were identical either side. It is `SCORE_NEUTRAL_OPTIONS` applied to
 * a different config: hash what changes the number, and nothing else.
 *
 * ⚠️ **`MCCABE_CUT` is deliberately not an input, and is guarded elsewhere.**
 * It decides what `complexity-mass-over-10` means, but §4's canonical list is
 * these three and a fourth would change a contract two implementations are
 * meant to agree on. The fixture cannot see it either — its only over-the-cut
 * function scores 13, so a cut of 10, 11 or 12 produces identical expected
 * totals. What closes that is the series *name*, asserted against the constant
 * in `complexity.test.ts`: move the cut and it is either red or a rename, and a
 * rename is G36's to catch.
 */
export function fixtureHashOf(inputs: CounterInputs): string {
  return digest([
    inputs.eslintVersion,
    inputs.parserVersion,
    canonical(inputs.ruleOptions),
    canonical(inputs.inventory),
  ]);
}

/**
 * One scope's newest score, as a percentage.
 *
 * **Percent, not a fraction, everywhere in this module.** The record stores
 * `0..1` and the floors file is written by hand; a floor reading `71.55` is
 * checkable against a print that reads `71.55`, and one reading `0.7155` is
 * not. The conversion happens once, where the record is read.
 */
export interface ScopeReading {
  scope: string;
  /** `null` where the run produced no mutants for it, which is not a score. */
  score: number | null;
  /** Mutants in that scope, for the per-mutant resolution. Absent when unknown. */
  mutants?: number;
}

/**
 * What one mutant is worth in a scope, in points of score.
 *
 * Spelled once because the refusal and the print both state it, and two scopes
 * differ by a factor of twenty — 1.47 points in `packages/cli/src` against 0.08
 * in `packages/core/src`. A number that large a spread must not be computed two
 * ways.
 */
export function resolutionOf(mutants: number): number {
  return 100 / mutants;
}

export interface Breach {
  scope: string;
  score: number;
  floor: number;
  /** Points one mutant is worth in this scope, where a mutant count was known. */
  resolution?: number;
}

/**
 * Every armed scope scoring under its floor.
 *
 * **Strictly under.** A score sitting exactly on its floor is the floor being
 * met, and a ratchet that refused there would refuse the first deploy after
 * arming on the very run the floor was derived from.
 *
 * ⚠️ **An unarmed scope and a scope with no reading both refuse nothing, and
 * they are different absences.** Unarmed is a decision recorded in a tracked
 * file with a date, printed at every deploy. No reading is the record having
 * nothing to say, which is `metrics-freshness`'s refusal rather than this one —
 * so this returns nothing rather than inventing a verdict on a number it does
 * not have.
 */
export function breaches(readings: readonly ScopeReading[], floors: Floors): Breach[] {
  const found: Breach[] = [];

  for (const reading of readings) {
    const entry = floors.scopes.get(reading.scope);
    if (entry === undefined || entry.floor === UNARMED) continue;
    if (reading.score === null || reading.score >= entry.floor) continue;

    found.push({
      scope: reading.scope,
      score: reading.score,
      floor: entry.floor,
      ...(reading.mutants !== undefined && reading.mutants > 0
        ? { resolution: resolutionOf(reading.mutants) }
        : {}),
    });
  }
  return found;
}

/** One scope's newest value for one capped series. */
export interface CapReading {
  scope: string;
  series: CappedSeries;
  /** `null` where the record carried no value for this pair, which is not a count. */
  value: number | null;
}

export interface CapBreach {
  scope: string;
  series: CappedSeries;
  value: number;
  cap: number;
}

/**
 * Every armed cap the record exceeds.
 *
 * **`breaches`, with the inequality turned over.** For a floor the bad
 * direction is down and for a cap it is up; everything else about the judgement
 * is the same, including the two absences it declines to rule on.
 *
 * **Strictly over**, mirroring `breaches`' strictly under. A value sitting
 * exactly on its cap is the cap being met, and a ratchet that refused there
 * would refuse the first deploy after arming — on the very run the cap was
 * derived from.
 *
 * ⚠️ **An unarmed cap, a missing cap entry and a missing reading all refuse
 * nothing, and they are three different absences.** Unarmed is a decision in a
 * tracked file with a date, printed at every deploy. A missing entry is the
 * *completeness* question `capsUnaccounted` asks at the refusal. A missing
 * reading is the record having nothing to say, which is `metrics-freshness`'s
 * refusal rather than this one — so this returns nothing rather than inventing
 * a verdict on a number it does not have.
 */
export function capBreaches(readings: readonly CapReading[], floors: Floors): CapBreach[] {
  const found: CapBreach[] = [];

  for (const reading of readings) {
    const entry = floors.scopes.get(reading.scope)?.caps.get(reading.series);
    if (entry === undefined || entry.cap === UNARMED) continue;
    if (reading.value === null || reading.value <= entry.cap) continue;

    found.push({
      scope: reading.scope,
      series: reading.series,
      value: reading.value,
      cap: entry.cap,
    });
  }
  return found;
}

/** One CI run, as the record carries it. Scores are percentages. */
export interface RunRow {
  /** Unix seconds. */
  timestamp: number;
  /** Whether the run computed every series it declared. */
  ok: boolean;
  /**
   * Which half of `metrics.yml` wrote it — `push`, `schedule` or
   * `workflow_dispatch`.
   *
   * ⚠️ **The workflow has two halves and only one of them scores.** The merge
   * half runs `if: github.event_name == 'push'` and emits `gate-suite-runtime`
   * alone; the nightly half runs `if: github.event_name != 'push'` and emits
   * the whole record. The window's membership test below is that same
   * condition rather than a list of event names, so the two cannot drift.
   */
  event: string;
  /** The score-affecting configuration it ran under, absent on older rows. */
  configHash?: string;
  /** The counting rule it ran under, absent on rows from before that stamp. */
  fixtureHash?: string;
  scores: Map<string, number>;
  /**
   * Each capped series' values by scope.
   *
   * ⚠️ **Counts, never percentages, and that is the difference from `scores`.**
   * The record stores a mutation score as `0..1` and everything downstream is a
   * percentage, so `scores` converts at the read. A count of branches is already
   * the number it means: `complexity-max` of `12` is twelve, and dividing it by
   * a hundred would put every cap three orders of magnitude out.
   *
   * **A merge record populates this and leaves `scores` empty**, which is why
   * `scoredIn` and the cap's own window disagree about which rows exist. §6 puts
   * the counts on both events, for per-merge resolution.
   */
  counts: Map<CappedSeries, Map<string, number>>;
}

/** How many consecutive healthy runs a window is, and how far apart they may sit. */
export const WINDOW_RUNS = 20;
export const MAX_GAP_DAYS = 3;

/**
 * Why the window ignores `metrics.yml`'s merge half entirely.
 *
 * A merge record is not a mutation run: it carries no score, whatever else it
 * emits. Counting one would leave every scope with a hole in its window and so
 * unarmable forever; breaking the streak on one would reset the window on every
 * push to `main`. It is neither — it is simply not a member.
 *
 * ⚠️ **The event name itself now lives in `./metrics-read.ts`**, where `halfOf`
 * needs the same answer about a parsed record. It was a private constant here
 * beside an export whose own note says *a second spelling of it would drift* —
 * and the third spelling was being written a module away when this moved.
 */

/**
 * The runs that actually score — `metrics.yml`'s nightly half, in order.
 *
 * ⚠️ **Exported because two places need this answer and a second spelling of it
 * would drift.** The window's membership test is one; the deploy's *"which run
 * am I comparing against the floor"* is the other, and getting that one wrong is
 * worse than getting the window wrong: `metrics.yml` writes on every push to
 * `main`, so on a busy week the newest **record** is a merge carrying no score.
 * Read that as the newest run and every armed scope reports *no score in the
 * record* — a floor that refuses nothing precisely when somebody is deploying.
 *
 * The test is the workflow's own condition, `event !== 'push'`, so a
 * `workflow_dispatch` full run counts, as it should.
 */
export function nightliesIn(rows: readonly RunRow[]): RunRow[] {
  return rows.filter((row) => row.event !== MERGE_EVENT);
}

/**
 * The runs that actually carry a score — what a floor is compared against.
 *
 * ⚠️ **Two filters, two questions, and collapsing them breaks one of the two.**
 * `nightliesIn` is the **window's** membership test and must keep a crashed
 * nightly, which wrote `run_ok 0` plus a partial score and has to *break* the
 * streak — *lowest observed* is the rule one bad row destroys forever. This one
 * is the **comparison's**, and it drops that same run for free: a crash emits no
 * `mutation_score` family at all, so a run that measured nothing has no scores
 * to compare and never becomes the subject.
 *
 * ⚠️ **Deliberately not filtered on the event**, which is `scoredRecords` in
 * `./trend-report.ts`. An earlier version intersected this with
 * `event !== 'push'`, which agreed with the panel only because `metrics.yml`'s
 * merge half never emits a score.
 * `docs/spec/trend-layer.md` §2 names on-merge scoring as a deferred move: the
 * day it lands a push record carries scores, and an event filter here would skip
 * the run the panel beside it takes as its subject — so **one deploy would print
 * two different scores for one scope**, arriving as an edit to a workflow file
 * with nothing in either module changed and nothing red. *Which event produced a
 * score* is the window's question, and it is asked there.
 *
 * ⚠️ **It does diverge from the panel on one axis, and the divergence is the
 * point rather than an oversight: `run_ok`.** `renderMetrics` derives that from
 * *did every declared series compute* and emits each family independently, so a
 * nightly whose `pnpm test` step failed writes `run_ok 0` **with a full set of
 * mutation scores**. The panel *prints* such a run and should; this *refuses* on
 * it, and the spec calls a failed run's score partial — the calibration window
 * declines to derive a floor from one. **Comparing against a number the window
 * would not accept is the wrong asymmetry**: it can stop a publish on a score
 * that could never have set the floor it breached, in a design with no override.
 * Skipping it costs nothing, because the previous healthy run is right behind it
 * and a record too old to read has its own refusal.
 */
export function scoredIn(rows: readonly RunRow[]): RunRow[] {
  return rows.filter((row) => row.ok && row.scores.size > 0);
}

/**
 * The runs that actually carry counts — what a cap is compared against.
 *
 * ⚠️ **`scoredIn`'s twin, and a different row on a busy week.**
 * `docs/spec/complexity-on-the-trend-layer.md` §6 puts the four counts on
 * **both** halves of `metrics.yml` while only the nightly half scores, so the
 * newest counting run is routinely a merge — exactly the row `scoredIn` drops,
 * because a merge record carries no score and so has an empty `scores`. Reading
 * the caps off `scoredIn`'s newest would report *no count in the record* for
 * every scope, which is a cap refusing nothing at the moment somebody is
 * deploying: the floor's own trap, one mechanism over.
 *
 * **Membership is asked of the samples, not of the `# TYPE` lines**, which is
 * where this differs from `recordsCarrying` in `./metrics-read.ts`. That reader
 * is the right one for a `ParsedRecord`; by the time `runRowsFrom` has produced
 * a `RunRow` the type lines are gone, and the window needs rows. It is safe
 * because of the emitter's all-or-nothing rule — when any population yields no
 * function, **all four** names go to `failed`, every complexity family is
 * omitted, and `run_ok` is `0` — so a family present with samples and a family
 * declared are the same set here. ⚠️ **If that rule ever softens, this must
 * move back to reading type membership**, because a zero-sample family would
 * then be a carried one.
 *
 * **Keyed on `CAPPED_SERIES`, not on one series' name.** Probing only
 * `complexity-max` would single out one member of a set the floors file treats
 * as a unit, and would go quietly wrong the day a third series is capped.
 */
export function countedIn(rows: readonly RunRow[]): RunRow[] {
  return rows.filter(
    (row) => row.ok && CAPPED_SERIES.every((series) => (row.counts.get(series)?.size ?? 0) > 0),
  );
}

const DAY_SECONDS = 86_400;

export interface Calibration {
  /** Consecutive qualifying runs, counting back from the newest. */
  runs: number;
  /**
   * Nightlies in the record at all, qualifying or not.
   *
   * ⚠️ **Zero counted and zero present are different facts**, and a print that
   * could not tell them apart would read as *the nightly is dead* on a machine
   * whose store is full of runs that simply predate the config stamp. This is
   * what lets the print say which of the two it is looking at.
   */
  candidates: number;
  full: boolean;
  /** Days spanned by those runs — `41 days` beside `12/20 runs` says the nightly skipped. */
  days: number;
  /** Lowest score observed per scope across the window, or `null` where the scope has a hole. */
  lowest: Map<string, number | null>;
}

/** The consecutive healthy nightlies at the newest end of a record, and their span. */
interface Streak {
  /** Every qualifying run, newest first — the countdown's numerator. */
  streak: RunRow[];
  /** The newest `WINDOW_RUNS` of them: the window a value is derived from. */
  window: RunRow[];
  /** Nightlies in the record at all, qualifying or not. */
  candidates: number;
  /** Days the window spans. */
  days: number;
}

/**
 * The streak walk both calibrations do, written once.
 *
 * ⚠️ **The floor and the cap must walk identically, and this is what makes that
 * structural rather than a claim.** `docs/spec/complexity-on-the-trend-layer.md`
 * §4 says the cap inherits its machinery *"verbatim from `the-ratchet.md`"*, and
 * a second copy of this loop is free to drift in the half nobody re-reads —
 * ADR-0028's shape, and the reason `digest` and `samplesOf` are each spelled
 * once in this file too. The only thing a caller varies is **which stamp a row
 * must carry**; everything else about *what counts as a streak* is one rule.
 *
 * **Nightlies only**, for both. `the-ratchet.md` is explicit — *"CI nightlies
 * only, 20 consecutive `run_ok 1` runs, no gap over 3 days. Counted in **runs**,
 * not days"* — and a draft of the cap counted merges as well, on the reasoning
 * that more samples could only raise a derived cap. ⚠️ **That reasoning is
 * false for a run-bounded window, and it is worth keeping the correction
 * visible.** `slice(0, WINDOW_RUNS)` takes the newest twenty *runs*, so counting
 * merges does not add samples over a fixed period — it makes twenty runs span
 * two days instead of three weeks. The extremum is then taken over a strictly
 * *narrower* slice of history, and the derived cap comes out **lower and
 * tighter**, which is the opposite of what was claimed. Only a *time*-bounded
 * window would have behaved the way that draft assumed.
 *
 * **Three things end a streak, and all three end it rather than being skipped
 * over.** A run that failed, because it writes `run_ok 0` plus a partial result
 * and *lowest observed* is the rule one bad row destroys forever. A gap over
 * three days, which is what makes *consecutive* mean anything on a nightly
 * cadence. And a row stamped for another configuration or counting rule, which
 * is not a row about this floor or cap at all — including a row carrying **no**
 * stamp, so the countdown starts when the stamp lands rather than counting rows
 * nothing can prove were measured the same way.
 */
function streakOf(rows: readonly RunRow[], stamped: (row: RunRow) => boolean): Streak {
  const ordered = nightliesIn(rows).sort((one, other) => one.timestamp - other.timestamp);

  const streak: RunRow[] = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const row = ordered[index];
    if (row === undefined) break;
    if (!row.ok || !stamped(row)) break;

    const newer = streak.at(-1);
    if (newer !== undefined && newer.timestamp - row.timestamp > MAX_GAP_DAYS * DAY_SECONDS) break;
    streak.push(row);
  }

  const window = streak.slice(0, WINDOW_RUNS);
  const oldest = window.at(-1);
  const newest = window.at(0);

  return {
    streak,
    window,
    candidates: ordered.length,
    days:
      newest === undefined || oldest === undefined
        ? 0
        : Math.round((newest.timestamp - oldest.timestamp) / DAY_SECONDS),
  };
}

/**
 * How far a window has filled, and what it would arm each scope at.
 *
 * > **Floor for a scope = the lowest score observed for that scope across the
 * > window, applied _once, at arming_.**
 *
 * ⚠️ **This computes; it never arms.** Arming is a human judgement after the
 * window fills, per scope. Nothing in this module writes the floors file, and
 * there is no moment at which a ratchet becomes armed — every scope's window
 * starts together and each one is a separate decision.
 *
 * **Three things end a streak, and all three end it rather than being skipped
 * over.** A run that failed, because it writes `run_ok 0` plus a partial score
 * and *lowest observed* is the rule one bad row destroys forever. A gap over
 * three days, which is what makes *consecutive* mean anything on a nightly
 * cadence. And a row scored under another configuration, which is not a row
 * about this floor at all.
 *
 * ⚠️ **A row carrying no hash ends the streak too, and that is a cost paid on
 * purpose.** It means the countdown starts when the stamp lands rather than
 * from whatever the branch already holds. The alternative — counting unstamped
 * rows — derives a floor from runs nothing can prove were scored the same way,
 * which re-opens the route the hash exists to close.
 *
 * **Where a full window has more runs than it needs, the newest `WINDOW_RUNS`
 * are the window.** A long clean history should not be punished by a dip a
 * month before the twentieth-newest run.
 */
export function calibration(
  rows: readonly RunRow[],
  scopes: readonly string[],
  configHash: string,
): Calibration {
  const { streak, window, candidates, days } = streakOf(
    rows,
    (row) => row.configHash === configHash,
  );

  const lowest = new Map<string, number | null>();
  for (const name of scopes) {
    const seen = window.map((row) => row.scores.get(name));
    lowest.set(
      name,
      window.length === 0 || seen.some((score) => score === undefined)
        ? null
        : Math.min(...(seen as number[])),
    );
  }

  return {
    runs: streak.length,
    candidates,
    full: streak.length >= WINDOW_RUNS,
    days,
    lowest,
  };
}

/** How far the cap window has filled, and what it would arm each pair at. */
export interface CapCalibration {
  /** Consecutive qualifying runs, counting back from the newest. */
  runs: number;
  /** Runs in the record at all, qualifying or not. */
  candidates: number;
  full: boolean;
  /** Days spanned by those runs. */
  days: number;
  /**
   * Highest value observed per series per scope across the window, or `null`
   * where that scope has a hole in it.
   */
  highest: Map<CappedSeries, Map<string, number | null>>;
}

/**
 * How far the cap window has filled, and what it would arm each scope at.
 *
 * > **Cap for a scope = the highest value observed for that scope across the
 * > calibration window, applied _once, at arming_.** After arming it moves down
 * > only, by hand.
 *
 * ⚠️ **This computes; it never arms.** `calibration`'s rule exactly, and for
 * the same reason: arming is a human judgement after the window fills, per
 * scope, and nothing in this module writes the floors file.
 *
 * **The window is the floor's window**, walked by the same `streakOf` and
 * counting the same runs: CI nightlies only, twenty consecutive healthy runs,
 * no gap over three days. §4 says the machinery is inherited *verbatim* from
 * `the-ratchet.md`, and sharing the walk is what makes that structural.
 *
 * ⚠️ **A draft counted merges as well, and the reasoning was wrong.** It is
 * recorded in `streakOf` rather than deleted, because the mistake is easy to
 * make twice: a run-bounded window that counts merges does not see *more* of
 * history, it sees *less of it, faster*, and derives a tighter cap. §6's
 * per-merge resolution is about what the record carries and what the print
 * reads — not about which runs a cap is derived from.
 *
 * **The comparison is not the window, and they read different rows on purpose.**
 * A cap is derived from nightlies and then applied to whatever ran last,
 * including a merge. That is the intended asymmetry: the cap is a stable
 * historical bound, and any run exceeding it is the event worth refusing on.
 */
export function capCalibration(
  rows: readonly RunRow[],
  scopes: readonly string[],
  fixtureHash: string,
): CapCalibration {
  const { streak, window, candidates, days } = streakOf(
    rows,
    (row) => row.fixtureHash === fixtureHash,
  );

  const highest = new Map<CappedSeries, Map<string, number | null>>();
  for (const series of CAPPED_SERIES) {
    const perScope = new Map<string, number | null>();
    for (const name of scopes) {
      const seen = window.map((row) => row.counts.get(series)?.get(name));
      perScope.set(
        name,
        window.length === 0 || seen.some((value) => value === undefined)
          ? null
          : Math.max(...(seen as number[])),
      );
    }
    highest.set(series, perScope);
  }

  return {
    runs: streak.length,
    candidates,
    full: streak.length >= WINDOW_RUNS,
    days,
    highest,
  };
}

/** A scope where the sweep and the recorded counter disagree, and by how much. */
export interface IgnoredMismatch {
  scope: string;
  /** Directives the sweep actually found. */
  swept: number;
  /** What the floors file says. */
  recorded: number;
}

/**
 * Every scope whose recorded counter is not what the tree holds.
 *
 * **Both directions, and neither is the redundant one.** A directive arriving
 * with the counter left alone is the route down this row was minted to close.
 * A counter raised with no directive under it is the file drifting away from
 * the tree in the direction that would otherwise never fire — and it is what
 * stops the counter being pre-raised, once, quietly, so that a later directive
 * lands green.
 *
 * ⚠️ **This asserts one field and says nothing about the floors beside it.** A
 * note-presence check was declined: any string satisfies it, so it would catch
 * the honest omission and not the adversary, and a check asserting
 * note-*presence* while reading as note-*quality* states a scope exceeding its
 * real one — the exact fault this row repairs.
 */
export function ignoredMismatches(
  counted: ReadonlyMap<string, number>,
  floors: Floors,
): IgnoredMismatch[] {
  const found: IgnoredMismatch[] = [];

  for (const [scope, entry] of floors.scopes) {
    const swept = counted.get(scope);
    if (swept === undefined || swept === entry.ignored) continue;
    found.push({ scope, swept, recorded: entry.ignored });
  }

  // ⚠️ **A scope the floors file does not name at all is not a scope with a
  // counter of zero — but a directive in one is still a mutant withheld.**
  // Iterating only the entries would leave this gate silent in precisely the
  // case where the file is already wrong, and the deploy's correspondence
  // refusal is no help here: this row exists to catch a directive **at merge**.
  // Reported only when the sweep actually found something, so a merely missing
  // entry stays the deploy's finding rather than becoming this row's too.
  for (const [scope, swept] of counted) {
    if (floors.scopes.has(scope) || swept === 0) continue;
    found.push({ scope, swept, recorded: 0 });
  }
  return found;
}

/** A scope's newest reading, plus the one before it, for the print. */
export interface PrintReading extends ScopeReading {
  /** The same scope's score in the previous run, where there was one. */
  previous?: number;
}

export interface PrintInput {
  floors: Floors;
  readings: readonly PrintReading[];
  window: Calibration;
  /** Today, as `YYYY-MM-DD`. Passed in: a print is not where a clock belongs. */
  today: string;
}

function days(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / (DAY_SECONDS * 1000));
}

function padded(text: string, width: number): string {
  return text.padEnd(width);
}

/**
 * The block `pnpm deploy:site` prints, one line per declared scope.
 *
 * ```
 * packages/core/src   armed 71.55   current 71.70  (+0.15)   1 mutant = 0.08
 * packages/cli/src    unarmed       window full (20 runs), lowest 44.12 - armable
 * scripts             unarmed       12/20 runs, 100 days
 * ```
 *
 * ⚠️ **The shape is the spec's and every number in the spec's version of this
 * block is illustrative.** One draft armed a scope at the *directory rollup's*
 * score rather than the declared scope's, and gave another a window low 26
 * points off its measured value — one real number borrowed from the wrong
 * population beside one invented outright, in the example an implementer
 * copies. Nothing here carries a literal from it.
 *
 * **This escalates never and files nothing**, which is what keeps it inside the
 * standing constraint. It is also the whole mechanism that ends the disarmed
 * period: it converts *indefinite* from a silence into a dated question asked
 * repeatedly of the one person who can answer it.
 *
 * `12/20 runs` sits beside the day count deliberately — **100 days and 12 runs
 * says the nightly has been skipping**, which is GitHub's 60-day
 * scheduled-workflow disablement showing itself before it bites.
 */
export function renderFloorLines(input: PrintInput): string[] {
  const scores = new Map(input.readings.map((reading) => [reading.scope, reading]));
  const names = [...input.floors.scopes.keys()];
  const width = Math.max(...names.map((name) => name.length), 1) + 2;

  // `names` comes from this same map, so every lookup below resolves. An
  // `entry === undefined` branch here would be unreachable — and an unkillable
  // mutant inside the module the mutation floor is made of.
  const rows = [...input.floors.scopes].map(([name, entry]) => {
    const reading = scores.get(name);

    return `${padded(name, width)}${
      entry.floor === UNARMED ? unarmedState(name, entry, input) : armedState(entry.floor, reading)
    }`;
  });

  // ⚠️ **The window is one fact about the record, not eight about the scopes.**
  // Every scope's window starts together and fills together, so a reason that
  // nothing has counted yet belongs above the table once rather than repeated
  // on every line — where eight identical sentences would read as eight
  // separate findings.
  const note = emptyWindowNote(input.window);
  return note === undefined ? rows : [note, ...rows];
}

function armedState(floor: number, reading: PrintReading | undefined): string {
  const parts = [padded(`armed ${floor.toFixed(2)}`, 14)];

  if (reading === undefined || reading.score === null) {
    parts.push('no score in the record');
    return parts.join('');
  }

  parts.push(`current ${reading.score.toFixed(2)}`);
  if (reading.previous !== undefined) {
    const delta = reading.score - reading.previous;
    parts.push(`  (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`);
  }
  // Computed live, per scope, and never a constant: what one mutant is worth
  // is the difference between a floor that is nearly met and one that is two
  // tests away, and it is 20 times larger in the smallest scope than the
  // largest.
  if (reading.mutants !== undefined && reading.mutants > 0) {
    parts.push(`   1 mutant = ${resolutionOf(reading.mutants).toFixed(2)}`);
  }
  return parts.join('');
}

/**
 * Why nothing has counted yet, said once, or `undefined` when something has.
 *
 * ⚠️ **Nothing counted and nothing present are different facts.** A store with
 * nightlies in it and none of them counting means every one predates the
 * configuration these floors name — the window starts when the stamp does,
 * which is the cost of closing the configuration route rather than an outage. A
 * store with no nightlies at all is the other thing entirely, and reading the
 * first as the second is reading a working pipe as a dead one.
 */
function emptyWindowNote(
  window: { runs: number; candidates: number },
  measuredUnder = 'scored under this configuration',
): string | undefined {
  if (window.runs > 0) return undefined;

  const seen = window.candidates;
  return seen === 0
    ? 'no nightly in the record yet — every window starts at its first one'
    : `no window has started: the ${String(seen)} nightl${seen === 1 ? 'y' : 'ies'} in the record ` +
        `${seen === 1 ? 'was' : 'were'} not ${measuredUnder}`;
}

function unarmedState(name: string, entry: ScopeFloor, input: PrintInput): string {
  const state = padded(UNARMED, 14);
  const lowest = input.window.lowest.get(name);
  const sat = `(${UNARMED} for ${String(days(entry.armed, input.today))} days)`;

  if (input.window.full) {
    const derived =
      lowest === null || lowest === undefined
        ? 'no complete history for this scope'
        : `lowest ${lowest.toFixed(2)} - armable`;
    // ⚠️ **The date stays on this line above all others.** A full window is
    // exactly when somebody is deciding what to type into `floor`, and the date
    // is §7's only guard on typing `unarmed` instead. An earlier draft dropped
    // it here, which put the guard everywhere except where the temptation is.
    return `${state}window full (${String(WINDOW_RUNS)} runs), ${derived}   ${sat}`;
  }

  // ⚠️ **Two different day counts, and the spec uses both.** The one beside the
  // run count is the **window's own span**: `12/20 runs, 41 days` says the
  // nightly has been skipping, which is the diagnostic that count exists for.
  // `sat`, above, is **how long this entry has sat unarmed**, and it is the only
  // guard on somebody typing `unarmed` to make a refusal go away. Carrying only
  // the first would drop the guard; carrying only the second would drop the
  // skipping signal.
  return input.window.runs > 0
    ? `${state}${String(input.window.runs)}/${String(WINDOW_RUNS)} runs, ${String(input.window.days)} days   ${sat}`
    : `${state}0/${String(WINDOW_RUNS)} runs   ${sat}`;
}

/** A scope-and-series pair's newest count, plus the one before it, for the print. */
export interface CapPrintReading extends CapReading {
  /** The same pair's count in the previous record, where there was one. */
  previous?: number;
}

export interface CapPrintInput {
  floors: Floors;
  readings: readonly CapPrintReading[];
  window: CapCalibration;
  /** Today, as `YYYY-MM-DD`. Passed in: a print is not where a clock belongs. */
  today: string;
}

/**
 * The cap block `pnpm deploy:site` prints, one line per capped pair.
 *
 * ```
 * scripts  complexity-max            armed 12   current 11  (-2)
 * scripts  complexity-mass-over-10   unarmed    14/20 runs, 14 days   (unarmed for 106 days)
 * ```
 *
 * **`renderFloorLines`' twin, and it prints beside it rather than inside it.**
 * Two blocks because they answer two questions and count two different windows;
 * one merged table would have to explain per row which window a countdown
 * belonged to.
 *
 * ⚠️ **Counts print as integers.** The floor block prints two decimals because
 * a score is a percentage and a floor of `71.55` has to be checkable against a
 * print reading `71.55`. A branch count has no such precision, and rendering
 * `complexity-max` as `12.00` would claim one it does not have.
 *
 * **This escalates never and files nothing**, `renderFloorLines`' constraint
 * exactly. It is also the mechanism that ends *this* disarmed period: the cap
 * lands early, per §9 step 4, precisely so the countdown is visible for the
 * whole window.
 */
export function renderCapLines(input: CapPrintInput): string[] {
  // ⚠️ **Nested, never a `scope + separator + series` string key.** A composite
  // key needs a separator no scope name can contain, and choosing one is a
  // question with a wrong answer available: a draft of this line used a literal
  // NUL, which worked perfectly and turned the module into a file `grep` reports
  // as binary. `CapCalibration.highest` is already series-then-scope, so this
  // matches its shape rather than inventing a second one.
  const counts = new Map<CappedSeries, Map<string, CapPrintReading>>();
  for (const reading of input.readings) {
    const perScope = counts.get(reading.series) ?? new Map<string, CapPrintReading>();
    perScope.set(reading.scope, reading);
    counts.set(reading.series, perScope);
  }

  const rows: string[] = [];
  const width = Math.max(...[...input.floors.scopes.keys()].map((name) => name.length), 1) + 2;
  const seriesWidth = Math.max(...CAPPED_SERIES.map((series) => series.length)) + 3;

  // ⚠️ **Measured from what is actually printed, never fixed at the width of the
  // longest label that existed when this was written.** `trend-report.ts` says
  // the same thing one file over and learned it the hard way: a hardcoded 22
  // held until `complexity-mass-over-10` arrived at 23. `padded` returns an
  // over-long string uncut, so a stale constant does not truncate — it silently
  // stops aligning, which nothing fails on.
  const stateWidth =
    Math.max(
      UNARMED.length,
      ...[...input.floors.scopes.values()].flatMap((entry) =>
        [...entry.caps.values()].map((cap) =>
          cap.cap === UNARMED ? UNARMED.length : `armed ${String(cap.cap)}`.length,
        ),
      ),
    ) + 3;

  for (const [name, entry] of input.floors.scopes) {
    for (const series of CAPPED_SERIES) {
      const cap = entry.caps.get(series);
      // A pair with no entry is `capsUnaccounted`'s refusal, which names it in
      // full. Printing a placeholder here would report one omission twice.
      if (cap === undefined) continue;

      const reading = counts.get(series)?.get(name);
      rows.push(
        `${padded(name, width)}${padded(series, seriesWidth)}${
          cap.cap === UNARMED
            ? capUnarmedState(name, series, cap, input, stateWidth)
            : capArmedState(cap.cap, reading, stateWidth)
        }`,
      );
    }
  }

  // ⚠️ **Nothing counted and nothing present are different facts**, and the
  // floor block carries this same note above its own table for the same reason.
  // A store with nightlies in it and none of them counting means every one
  // predates the counting stamp — the window starts when the stamp does — and a
  // store with no nightlies at all is the other thing entirely. Reading the
  // first as the second is reading a working pipe as a dead one.
  //
  // It is `emptyWindowNote`'s, not a second copy: both windows are now the same
  // twenty nightlies, so a second sentence saying it differently would be a
  // second sentence to keep true.
  const note = emptyWindowNote(input.window, 'counted under this rule');
  return note === undefined ? rows : [note, ...rows];
}

function capArmedState(
  cap: number,
  reading: CapPrintReading | undefined,
  stateWidth: number,
): string {
  const parts = [padded(`armed ${String(cap)}`, stateWidth)];

  if (reading === undefined || reading.value === null) {
    parts.push('no count in the record');
    return parts.join('');
  }

  parts.push(`current ${String(reading.value)}`);
  if (reading.previous !== undefined) {
    const delta = reading.value - reading.previous;
    parts.push(`  (${delta >= 0 ? '+' : ''}${String(delta)})`);
  }
  return parts.join('');
}

function capUnarmedState(
  name: string,
  series: CappedSeries,
  entry: ScopeCap,
  input: CapPrintInput,
  stateWidth: number,
): string {
  const state = padded(UNARMED, stateWidth);
  const highest = input.window.highest.get(series)?.get(name);
  const sat = `(${UNARMED} for ${String(days(entry.armed, input.today))} days)`;

  if (input.window.full) {
    const derived =
      highest === null || highest === undefined
        ? 'no complete history for this scope'
        : `highest ${String(highest)} - armable`;
    return `${state}window full (${String(WINDOW_RUNS)} runs), ${derived}   ${sat}`;
  }

  return input.window.runs > 0
    ? `${state}${String(input.window.runs)}/${String(WINDOW_RUNS)} runs, ${String(input.window.days)} days   ${sat}`
    : `${state}0/${String(WINDOW_RUNS)} runs   ${sat}`;
}

export interface RefusalInput {
  floors: Floors;
  /** The scopes `stryker.scopes.json` declares. */
  declared: readonly string[];
  /**
   * The newest CI run in the record, or `undefined` when the record holds none.
   *
   * ⚠️ **Two different absences, and they must not collapse.** A run whose
   * `configHash` is missing is a row from *before the stamp existed*, and it
   * refuses: nothing can vouch for what it was scored under. **No run at all**
   * is the bootstrap case — a machine that has never synced — and refusing on
   * it here would answer a question the freshness refusal beside this one is
   * the only check equipped to ask, since it is the one that can tell *you have
   * not synced* from *CI stopped writing*.
   */
  run?: { configHash?: string };
  /**
   * The newest CI run that **counted**, which is a different row from the one
   * above on a busy week — see `countedIn`.
   *
   * ⚠️ **A separate field, and merging the two was a real defect.** A draft put
   * `fixtureHash` on `run` and filled it from whichever row had one, so a store
   * holding counting merges but no scoring nightly produced `{ fixtureHash }`
   * with no `configHash` — and with any floor armed, that reads to the check
   * below as *a scoring run from before the config stamp existed* and refuses
   * with "these floors were derived under a different configuration". A
   * truthful sentence about a row that does not exist. Two rows answer two
   * questions, so they arrive as two fields.
   */
  countedRun?: { fixtureHash?: string };
  readings: readonly ScopeReading[];
  /**
   * The newest value per scope per capped series.
   *
   * **Empty is a legal input and refuses nothing**, which is the bootstrap case
   * again: a store holding only records from before the counts existed has
   * nothing to compare, and the freshness refusal is the check equipped to say
   * so.
   */
  capReadings?: readonly CapReading[];
}

/** A scope declared and counted, with no cap entry naming a capped series. */
export interface CapCorrespondence {
  scope: string;
  series: CappedSeries;
}

/**
 * Every declared scope that does not account for every capped series.
 *
 * ⚠️ **`correspondence`'s forward direction, one level down, and it exists for
 * the identical reason.** A scope with no entry for `complexity-max` is counted
 * by every run and capped by nothing — it refuses nothing, silently, which is
 * the one case a cap exists to catch.
 *
 * **There is no reverse direction here**, and that asymmetry is not an
 * oversight: an entry naming a scope nothing declares is already `orphans`, and
 * an entry naming a series nothing may cap cannot survive `parseCaps`. Both
 * rotting directions are closed before this runs.
 */
export function capsUnaccounted(declared: readonly string[], floors: Floors): CapCorrespondence[] {
  const missing: CapCorrespondence[] = [];

  for (const scope of declared) {
    const entry = floors.scopes.get(scope);
    // A scope with no floors entry at all is `unaccounted`'s finding, reported
    // there and not doubled here — one missing scope must read as one problem.
    if (entry === undefined) continue;
    for (const series of CAPPED_SERIES) {
      if (!entry.caps.has(series)) missing.push({ scope, series });
    }
  }
  return missing;
}

/**
 * Every reason `pnpm deploy:site` refuses on the floors, in the order it should
 * hear them.
 *
 * ⚠️ **No flag clears any of these, and the absence of one is the design.**
 * Deploy is about to carry two metric refusals — a stale record and a floor
 * breach — and *the flag would get reached for on the stale-record refusal*: a
 * dead pipe is the ordinary, blameless reason a deploy stops, so a blanket
 * override gets typed for that and silently clears the floor at the same time.
 * Adding no flag dissolves that rather than documenting it. Every message below
 * says so at the refusal, which is the convention `scripts/deploy.ts` adopted.
 *
 * **A hash mismatch refuses alone.** If the run was scored under another
 * configuration then every score in it is about that configuration, and
 * reporting a breach beside the mismatch would be the deploy asserting a
 * comparison it has just said it cannot make.
 */
export function floorRefusals(input: RefusalInput): string[] {
  const refusals: string[] = [];
  const { unaccounted, orphans } = correspondence(input.declared, input.floors);

  if (unaccounted.length > 0) {
    refusals.push(
      `declared scope(s) with no floors entry — unaccounted: ${unaccounted.join(', ')}\n\n` +
        `  A scope ${FLOORS_FILE} does not name is scored by every run and floored by\n` +
        '  nothing. It refuses nothing, silently, which is the one case a floor exists to\n' +
        '  catch — so the deploy refuses instead.\n' +
        `    - Add an entry to ${FLOORS_FILE}. "floor": "${UNARMED}" with today's date is\n` +
        '      the honest starting value: explicitly unarmed is not silently unfloored.\n\n' +
        noFlag(),
    );
  }

  if (orphans.length > 0) {
    refusals.push(
      `floors entries naming no declared scope — orphan(s): ${orphans.join(', ')}\n\n` +
        '  A floor for a scope that no longer exists measures nothing, and left alone this\n' +
        '  file rots into a list of places that are not there any more.\n' +
        `    - Remove the entry from ${FLOORS_FILE}, or restore the scope in\n` +
        '      stryker.scopes.json if the rename was the mistake. A rename carries the\n' +
        '      floor across, with the number visible on both sides of one diff.\n\n' +
        noFlag(),
    );
  }

  const uncapped = capsUnaccounted(input.declared, input.floors);
  if (uncapped.length > 0) {
    const pairs = uncapped.map(({ scope, series }) => `${scope} (${series})`).join(', ');
    refusals.push(
      `declared scope(s) with no cap entry — uncapped: ${pairs}\n\n` +
        `  A scope ${FLOORS_FILE} counts but does not cap is measured by every run and\n` +
        '  capped by nothing. That is the floors entry problem one level down, and it is\n' +
        '  silent in the same way.\n' +
        `    - Add a "caps" entry to that scope in ${FLOORS_FILE}. "cap": "${UNARMED}" with\n` +
        "      today's date is the honest starting value: explicitly unarmed is not\n" +
        '      silently uncapped.\n\n' +
        noFlag(),
    );
  }

  // ⚠️ **A different hash and a missing hash are different findings, and only
  // one of them is evidence.**
  //
  // A run stamped with a hash that is *not* the floors file's means somebody
  // changed the scoring configuration without re-deriving — route 2 down, and
  // the spec's own plant (*lower `timeoutMS` without re-deriving → refuses*).
  // That is evidence of the thing the guard exists for, so it refuses whatever
  // is armed.
  //
  // A run carrying **no** hash is a record from before the stamp existed. It is
  // not evidence of anything, and refusing on it while every floor is unarmed
  // would have made the very first deploy after this landed refuse — teaching
  // whoever hit it how to get past the new machinery, which is the precise habit
  // the no-override decision exists to prevent. So an absent hash refuses only
  // once there is a comparison to protect. The configuration route stays shut
  // either way, because `calibration` refuses to **derive** a floor from a run
  // it cannot place under this configuration.
  const armed = [...input.floors.scopes.values()].some((entry) => entry.floor !== UNARMED);
  const stamped = input.run?.configHash;
  const mismatched =
    input.run !== undefined &&
    (stamped === undefined ? armed : stamped !== input.floors.configHash);

  if (mismatched) {
    refusals.push(
      'these floors were derived under a different configuration; re-derive them\n\n' +
        `  floors:  ${input.floors.configHash}\n` +
        `  the run: ${stamped ?? 'no hash — a record from before the stamp existed'}\n\n` +
        '  Lowering timeoutMS raises the score with no test touched, because a timeout\n' +
        '  counts as detected — so a score computed under one configuration is not a\n' +
        '  number about a floor derived under another. Nothing else is compared until\n' +
        '  these agree.\n' +
        '    - If the configuration change was deliberate, the floors have to be derived\n' +
        '      again from runs made under it, and re-deriving is lowering: it costs a\n' +
        `      notes line in ${FLOORS_FILE} like any other lowering.\n\n` +
        noFlag(),
    );
    return refusals;
  }

  // ⚠️ **The counting rule's own mismatch, and the same three judgements.** A
  // *different* fixture hash is evidence that somebody changed what a count
  // means without re-deriving; **no** hash is a record from before the stamp,
  // which is evidence of nothing and refuses only once there is a comparison to
  // protect. The armed predicate is about **caps**, not floors: a repo with an
  // armed floor and no armed cap is comparing nothing here.
  const capArmed = [...input.floors.scopes.values()].some((entry) =>
    [...entry.caps.values()].some((cap) => cap.cap !== UNARMED),
  );
  const counted = input.countedRun?.fixtureHash;
  const countedElsewhere =
    input.countedRun !== undefined &&
    (counted === undefined ? capArmed : counted !== input.floors.fixtureHash);

  if (countedElsewhere) {
    refusals.push(
      'these caps were derived under a different counting rule; re-derive them\n\n' +
        `  floors:  ${input.floors.fixtureHash}\n` +
        `  the run: ${counted ?? 'no hash — a record from before the stamp existed'}\n\n` +
        '  An ESLint upgrade that counts one more construct raises every count with no\n' +
        '  branch written, so a count produced under one rule is not a number about a cap\n' +
        '  derived under another — it would breach every cap at once and read as a\n' +
        '  regression nobody caused. Nothing else is compared until these agree.\n' +
        '    - If the counter change was deliberate, the caps have to be derived again\n' +
        '      from runs counted under it, and re-deriving is raising: it costs a notes\n' +
        `      line in ${FLOORS_FILE} like any other.\n\n` +
        noFlag(),
    );
    return refusals;
  }

  for (const breach of breaches(input.readings, input.floors)) {
    refusals.push(
      `${breach.scope} scored ${breach.score.toFixed(2)}, under its floor of ` +
        `${breach.floor.toFixed(2)}\n\n` +
        (breach.resolution === undefined
          ? ''
          : `  One mutant is worth ${breach.resolution.toFixed(2)} points in this scope.\n`) +
        '  The floor is what the tests protecting this code were observed to be worth. A\n' +
        '  score under it means that protection weakened, whatever else changed.\n' +
        '    - Kill the survivors: run `pnpm mutation:run` and read the per-file table.\n' +
        `    - Or lower the floor, which is a one-line diff in ${FLOORS_FILE} plus a\n` +
        '      notes line saying why — in a pull request, through gates, because deploy\n' +
        '      runs from main. That is the only way past, and it is meant to be visible\n' +
        '      rather than avoidable.\n\n' +
        noFlag(),
    );
  }

  for (const breach of capBreaches(input.capReadings ?? [], input.floors)) {
    refusals.push(
      `${breach.scope} counted ${String(breach.value)} for ${breach.series}, over its cap of ` +
        `${String(breach.cap)}\n\n` +
        '  The cap is the highest this scope was observed to reach across its own\n' +
        '  calibration window. A count over it means a function got harder to test than\n' +
        '  anything this scope had held before.\n' +
        '    - Bring the function back under the cap. `pnpm mutation:run` is not the tool\n' +
        '      here; the count is ESLint’s complexity rule, and the remedy is fewer\n' +
        '      branches in one function rather than more tests around it.\n' +
        `    - Or raise the cap, which is a one-line diff in ${FLOORS_FILE} plus a notes\n` +
        '      line saying why — in a pull request, through gates, because deploy runs\n' +
        '      from main. Raising a cap is the lowering of this file and costs exactly\n' +
        '      what a lowering costs.\n\n' +
        noFlag(),
    );
  }
  return refusals;
}

/**
 * The sentence every floors refusal ends with.
 *
 * Written once because it is the same fact four times, and getting it wrong on
 * one of them is how a reader learns there is an override somewhere.
 */
function noFlag(): string {
  return (
    '  No flag clears this. --dry-run runs it and uploads nothing, which is how to\n' +
    '  watch it fail on purpose.'
  );
}

/**
 * The CI runs a set of parsed records describes, oldest first.
 *
 * **The parsing is `metrics-read.ts`'s, deliberately.** The staleness refusal
 * beside this one reads the same records for different fields, and two parsers
 * of one format drift in the direction nobody checks — ADR-0028's shape. What
 * is different here is the *question*: freshness needs the newest record and
 * stops, and a window needs twenty consecutive ones.
 *
 * ⚠️ **A local probe is not a CI run, and the label is what tells them apart.**
 * `pnpm trend:sync` writes surface D's rows into the same store, under the same
 * `stacks_run_ok` name but carrying `surface="edge"` — a different label set, so
 * Prometheus holds them as a different series and so does this. The calibration
 * window is CI-only by rule: a floor derived on one machine and compared
 * against another is a two-machine comparison wearing one config hash, and the
 * hash cannot catch it, because the configuration is identical. **It is the one
 * door that guard does not watch**, and this is where it is shut.
 *
 * A crashed run is read rather than dropped. It wrote `run_ok 0` **plus
 * whatever computed**, and keeping it is what lets the window refuse to count
 * across it — dropping it would silently splice the two healthy stretches
 * either side into one.
 */
export function runRowsFrom(records: readonly ParsedRecord[]): RunRow[] {
  const rows: RunRow[] = [];

  for (const record of records) {
    const health = record.samples.find(
      (sample) =>
        sample.metric === `${METRIC_PREFIXES.run}ok` && sample.labels['surface'] === undefined,
    );
    if (health === undefined) continue;

    // The record stores a fraction; every floor, print and refusal downstream is
    // a percentage. Converted once, here, where the record is read.
    const scores = new Map<string, number>();
    for (const [scope, score] of scoresOf(record)) scores.set(scope, score * 100);

    // ⚠️ **A run that cannot be dated is dropped, not defaulted.** A sample's
    // timestamp is optional in the parser's type, and every record this project
    // writes carries one — but defaulting a missing one to zero would place the
    // run in 1970 and open a twenty-thousand-day gap in the middle of a streak,
    // which the window would read as the nightly having stopped.
    const timestamp = health.timestamp ?? record.timestamp;
    if (timestamp === undefined) continue;

    // The counts are read verbatim — a branch count is already the number it
    // means, unlike the score above it. `samplesOf` is `metrics-read.ts`'s, and
    // deliberately not a second reader: the print block reads the same families
    // through the same seam, and two readers of one format drift in the half
    // nobody checks.
    const counts = new Map<CappedSeries, Map<string, number>>();
    for (const series of CAPPED_SERIES) counts.set(series, samplesOf(record, series));

    const info = runInfoOf(record);
    const configHash = info?.['config_hash'];
    const fixtureHash = info?.['fixture_hash'];
    rows.push({
      timestamp,
      ok: health.value === 1,
      event: info?.['event'] ?? 'unknown',
      ...(configHash === undefined || configHash === '' ? {} : { configHash }),
      ...(fixtureHash === undefined || fixtureHash === '' ? {} : { fixtureHash }),
      scores,
      counts,
    });
  }
  return rows.sort((one, other) => one.timestamp - other.timestamp);
}
// ── The disk, kept at the edge ──────────────────────────────────────────────
//
// ⚠️ **Nothing below may be called from a spec under `scripts/`.** Those run
// inside Stryker's sandbox, where `REPO_ROOT` resolves to a directory that is
// not the repository — `vitest.stryker.config.ts` carries the reason. The
// judgement above is pure and planted against synthetic inputs in
// `floors.test.ts`; the real tree is `gates/ignored-mutants.test.ts`'s and
// `scripts/deploy.ts`'s to read.

/** The floors file, beside the Stryker config it is tied to by the hash. */
export const FLOORS_FILE = 'stryker.floors.json';

export function readFloors(root: string = REPO_ROOT): Floors {
  return parseFloors(JSON.parse(readFileSync(join(root, FLOORS_FILE), 'utf8')));
}

/**
 * Every mutated source file, with its text.
 *
 * `sourceFiles` is `scope-check.ts`'s, deliberately: *what counts as source* is
 * one question, and the counter asking it a second way would be free to drift
 * from the check that decides which files a scope must account for.
 */
export function readMutatedSource(root: string = REPO_ROOT): SourceFile[] {
  return sourceFiles(root).map((path) => ({
    path,
    source: readFileSync(join(root, path), 'utf8'),
  }));
}
