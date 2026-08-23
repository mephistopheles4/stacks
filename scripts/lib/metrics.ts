/**
 * One run of CI, rendered as the OpenMetrics text `promtool` ingests.
 *
 * This is the **writing half** of the trend layer: CI writes a durable record;
 * the machine pulls it. `scripts/emit-metrics.ts` gathers the facts and
 * `.github/workflows/metrics.yml` commits the result to the orphan `metrics`
 * branch, one file per run.
 *
 * ⚠️ **Durable, never immutable** — the argument, and the branch properties it
 * rests on, are in [ADR-0055](../../docs/adr/0055-ci-writes-a-durable-record.md)
 * rather than repeated here.
 *
 * **Nothing here is a gate and nothing here goes red.** A trend's failure is a
 * movement a person reads, not an exit code. The only automated verdict in the
 * whole layer is *"did a number arrive at all"*, which is a question about the
 * pipe rather than about the code.
 *
 * Two rules shape everything below.
 *
 * **The prefix separates run health from trends, structurally.** `run_ok` is not
 * a trend and must never need a row in `docs/gates.md`'s `## Trends` table, so
 * the two live under prefixes G36 can tell apart — rather than under one prefix
 * and a list of exceptions that gate would have to maintain.
 *
 * **A run declares what it set out to compute, and `run_ok` is derived from
 * that.** Passing a boolean would let a run that computed nothing report health;
 * deriving it means a crashed run writes `run_ok 0` **plus whatever computed**,
 * which is what keeps *never ran* (a gap in the branch) distinguishable from
 * *ran and broke* (an explicit zero). Both halves of `metrics.yml` use it, and
 * the merge half legitimately expects five series where the nightly expects eight.
 */

import type { Counts } from './complexity.ts';
import type { DuplicationCounts } from './duplication.ts';
import type { EdgeAnswer } from './edge-probe.ts';

/**
 * The three metric-name prefixes, and the whole of the separation between them.
 *
 * No one of them may be a prefix of another: `trendNamesIn` strips `trend` to
 * recover a name, and if `run` were a prefix of it every run-health sample
 * would parse as a trend with a mangled name rather than being skipped.
 * Asserted by G36 and by `metrics.test.ts` rather than left as a property of
 * three strings that look obviously different.
 *
 * ⚠️ **`edge` is written by the machine, never by CI**, and that is what the
 * prefix buys. Surface D's row is produced by `pnpm trend:sync` into the local
 * store only, so a name under `trend` would owe a `## Trends` row — and that
 * row would make G36's reverse direction red against every CI run, which emits
 * no such series. Structural, rather than an exception list a gate has to
 * maintain. See `docs/spec/trend-layer.md` §5.
 */
export const METRIC_PREFIXES = {
  run: 'stacks_run_',
  trend: 'stacks_trend_',
  edge: 'stacks_edge_',
} as const;

/** The eight series, and the whole of what this record carries as a trend. */
export const TREND_SERIES = [
  {
    name: 'mutation-score',
    help: 'Killed plus timeout over total, per declared scope, 0..1. Stryker total score.',
  },
  { name: 'gate-suite-runtime', help: 'Wall-clock seconds of pnpm test.' },
  { name: 'mutation-run-runtime', help: 'Wall-clock seconds of the Stryker run.' },
  {
    name: 'live-exclusions',
    help: 'Declared exclusions that produced at least one executed mutant. Healthy value 0.',
  },
  // The four counts, read side by side. ⚠️ **No ratio, and that is measured
  // rather than preferred**: the prototype put every candidate statistic
  // through a mechanical split and thirty trivial functions, and no ratio
  // survived both games. The record carries counts and the page derives
  // shares — `mutation-score` being spelled *killed ÷ total*, applied one step
  // earlier. See docs/spec/complexity-on-the-trend-layer.md §2, whose Measures
  // column each `help` below carries.
  {
    name: 'complexity-functions',
    help: 'Functions counted — the denominator the other three are read against.',
  },
  { name: 'complexity-mass', help: 'Σ cyclomatic complexity over those functions.' },
  {
    name: 'complexity-mass-over-10',
    help: 'Σ complexity over functions with CC > 10. The cut is McCabe 1976, and is not a threshold.',
  },
  { name: 'complexity-max', help: "The largest single function's complexity." },
  // Eight duplication counts, four over each of two populations. ⚠️ **Both
  // populations, never one**: a clone is a relation between two places, so a
  // scope list cannot see a clone spanning two scopes and `gates/` is read by
  // no scope at all. Counts and never a ratio, which is the rule the four
  // above already follow and for the reason they follow it — a share falls
  // when the tree grows and nothing else happens.
  // See docs/spec/static-analysis-and-style.md §5 and ADR-0072.
  {
    name: 'duplication-clones',
    help: 'Clones found, over the eight declared scopes. A clone spanning two is counted by both.',
  },
  { name: 'duplication-lines', help: 'Duplicated lines, over the eight declared scopes.' },
  {
    name: 'duplication-ignored-lines',
    help: 'Lines inside a jscpd suppression block, over the eight declared scopes.',
  },
  {
    name: 'duplication-total-lines',
    help: 'Lines scanned, over the eight declared scopes — the denominator the other three are read against.',
  },
  { name: 'duplication-tree-clones', help: 'Clones found, whole-tree TypeScript.' },
  { name: 'duplication-tree-lines', help: 'Duplicated lines, whole-tree TypeScript.' },
  {
    name: 'duplication-tree-ignored-lines',
    help: 'Lines inside a jscpd suppression block, whole-tree TypeScript.',
  },
  {
    name: 'duplication-tree-total-lines',
    help: 'Lines scanned, whole-tree TypeScript — no scope list can shrink it.',
  },
] as const;

export type TrendName = (typeof TREND_SERIES)[number]['name'];

/** One declared scope's score, or `null` where the scope produced no mutants. */
export interface ScopeScore {
  scope: string;
  /**
   * ⚠️ **`null`, never `1`.** An empty denominator produces 100% arithmetically
   * and that is indistinguishable from a scope that is genuinely perfect — a
   * declared scope matching no mutants is a broken declaration, and the residual
   * check that catches it cannot be written against a value it shares with
   * health. A `null` scope emits no sample at all.
   */
  score: number | null;
}

/**
 * One declared scope's four counts, as the record carries them.
 *
 * **One compound field rather than four parallel lists**, mirroring
 * `mutationScore` — the four are produced together, fail together, and are read
 * against each other, so a shape that let three arrive without the fourth would
 * be a shape `complexityFactsOf` then had to talk callers out of.
 */
export interface ScopeComplexity extends Counts {
  scope: string;
}

/**
 * Each complexity series, and the count it reads off a scope.
 *
 * **The names and the fields in one table**, so a series can neither be
 * rendered from the wrong count nor added without a way to fill it. The
 * `Counts` fields are `complexity.ts`'s, imported as a type, which is what
 * keeps the counter's vocabulary and the record's from drifting apart.
 */
const COMPLEXITY_FACTS = [
  ['complexity-functions', (entry: ScopeComplexity): number => entry.functions],
  ['complexity-mass', (entry: ScopeComplexity): number => entry.mass],
  ['complexity-mass-over-10', (entry: ScopeComplexity): number => entry.massOver10],
  ['complexity-max', (entry: ScopeComplexity): number => entry.max],
] as const;

/**
 * The four names this record spells for complexity, in rendering order.
 *
 * **Derived from the table above, never written twice.** Two callers need the
 * set — the all-or-nothing rule below, and anything that has to say *which*
 * series went quiet — and a second hand-written list is the drift this repo
 * has three logged rows about.
 */
export const COMPLEXITY_SERIES: readonly TrendName[] = COMPLEXITY_FACTS.map(([name]) => name);

/**
 * The complexity half of `RunFacts`, from what the counter returned per scope.
 *
 * ⚠️ **All four, or none of them — and this is the rule the slice exists
 * around.** `undefined` means the counter never ran (it threw); a `null` value
 * means that population yielded no function. Both, and an empty map, produce
 * the same answer: every complexity name into `failed`, no families at all,
 * and `run_ok 0` falling out of the mechanism a broken producing step already
 * used.
 *
 * Three shapes this rules out, each for its own reason:
 *
 *   - **Emitting the seven populations that counted.** The renderer treats a
 *     zero-sample family as emitted, so the record would read `run_ok 1` with
 *     a population silently gone — health, describing a hole.
 *   - **A `0` sample for `complexity-max`.** That is a legal value for a scope
 *     of trivial functions, and indistinguishable from the failure.
 *   - **Throwing, as `scoresFrom` does on an undefined tally.** The shape
 *     borrowed here is `failed`, which marks; a throw would lose the other
 *     series computed by the same run.
 *
 * **It lives here rather than in `scripts/emit-metrics.ts`** because that file
 * is excluded from the `scripts` mutation scope and imported by no spec, so the
 * rule would sit exactly where nothing can hold it. This is a pure function
 * over a map, and `metrics.test.ts` holds it.
 */
export function complexityFactsOf(counted: ReadonlyMap<string, Counts | null> | undefined): {
  complexity?: readonly ScopeComplexity[];
  failed: readonly TrendName[];
} {
  const facts: ScopeComplexity[] = [];

  for (const [scope, counts] of counted ?? []) {
    // Narrowed by returning rather than by a cast: the one value this function
    // must never let through is the one a cast would wave past.
    if (counts === null) return { failed: COMPLEXITY_SERIES };
    facts.push({ scope, ...counts });
  }

  // An empty map is not a healthy run either. Eight scopes are declared, so
  // nothing to walk is a broken declaration wearing the shape of a clean pass.
  if (facts.length === 0) return { failed: COMPLEXITY_SERIES };

  return { complexity: facts, failed: [] };
}

/**
 * One declared scope's four duplication counts, as the record carries them.
 *
 * `ScopeComplexity`'s shape and its reason: the four are produced together,
 * fail together, and are read against each other.
 */
export interface ScopeDuplication extends DuplicationCounts {
  scope: string;
}

/**
 * Each duplication series, the population it reads, and the count it takes.
 *
 * **One table rather than eight hand-written pairs**, `COMPLEXITY_FACTS`'
 * rule: a series can neither be rendered from the wrong count nor added without
 * a way to fill it. `scoped` is what separates the two populations — the four
 * scoped families carry a `scope` label and a sample per population, the four
 * tree families carry one unlabelled sample, and nothing else differs.
 */
const DUPLICATION_FACTS = [
  ['duplication-clones', true, (entry: DuplicationCounts): number => entry.clones],
  ['duplication-lines', true, (entry: DuplicationCounts): number => entry.duplicatedLines],
  ['duplication-ignored-lines', true, (entry: DuplicationCounts): number => entry.ignoredLines],
  ['duplication-total-lines', true, (entry: DuplicationCounts): number => entry.totalLines],
  ['duplication-tree-clones', false, (entry: DuplicationCounts): number => entry.clones],
  ['duplication-tree-lines', false, (entry: DuplicationCounts): number => entry.duplicatedLines],
  [
    'duplication-tree-ignored-lines',
    false,
    (entry: DuplicationCounts): number => entry.ignoredLines,
  ],
  ['duplication-tree-total-lines', false, (entry: DuplicationCounts): number => entry.totalLines],
] as const satisfies readonly (readonly [TrendName, boolean, (entry: DuplicationCounts) => number])[];

/** The eight names this record spells for duplication. Derived, never written twice. */
export const DUPLICATION_SERIES: readonly TrendName[] = DUPLICATION_FACTS.map(([name]) => name);

/** The two populations' counts, as one fact — they come from one tool and one hash. */
export interface DuplicationFacts {
  scopes: readonly ScopeDuplication[];
  tree: DuplicationCounts;
}

/**
 * The duplication half of `RunFacts`, from what the counter returned.
 *
 * ⚠️ **All eight, or none of them**, which is `complexityFactsOf`'s rule and is
 * chosen here for a reason of its own rather than by imitation: the two
 * populations are two runs of **one tool**, under **one counting rule** stamped
 * by **one hash**, so a record carrying the tree four without the scoped four
 * would need a reader able to say which half is missing and what that means.
 * *The counts did not arrive* is the whole of what a reader can act on, and it
 * is what `run_ok 0` already says.
 *
 * `undefined` means the counter never ran; a `null` population means jscpd had
 * nothing to run over. Both, and an empty scope list, produce the same answer:
 * every duplication name into `failed`, no families at all, and `run_ok 0`
 * falling out of the mechanism a broken producing step already used.
 */
export function duplicationFactsOf(
  counted: { scopes: ReadonlyMap<string, DuplicationCounts | null>; tree: DuplicationCounts | null } | undefined,
): { duplication?: DuplicationFacts; failed: readonly TrendName[] } {
  if (counted === undefined || counted.tree === null) return { failed: DUPLICATION_SERIES };

  const scopes: ScopeDuplication[] = [];
  for (const [scope, counts] of counted.scopes) {
    // Narrowed by returning rather than by a cast, `complexityFactsOf`'s rule:
    // the one value this function must never let through is the one a cast
    // would wave past.
    if (counts === null) return { failed: DUPLICATION_SERIES };
    scopes.push({ scope, ...counts });
  }

  // An empty map is not a healthy run either. Eight scopes are declared, so
  // nothing to walk is a broken declaration wearing the shape of a clean pass.
  if (scopes.length === 0) return { failed: DUPLICATION_SERIES };

  return { duplication: { scopes, tree: counted.tree }, failed: [] };
}

export interface RunFacts {
  /** Unix seconds. Explicit on every sample, so a replay lands at the right hour. */
  timestamp: number;
  commit: string;
  /** `push`, `schedule` or `workflow_dispatch` — which half of `metrics.yml` ran. */
  event: string;
  /**
   * The score-affecting Stryker configuration this run was scored under.
   *
   * ⚠️ **Run context, and the only field here a floor is compared through.**
   * The floors in `stryker.floors.json` were derived under one configuration,
   * and a score computed under another is not a number about them — lowering
   * `timeoutMS` raises the score 0.36 points with no test touched, because a
   * timeout counts as *detected*. So the run stamps its own, computed from the
   * config it actually loaded rather than passed in from outside: a flag would
   * let the stamp disagree with the configuration it claims to describe.
   *
   * **Optional, because a row written before this existed is not a row with a
   * wrong hash.** It is a row from before the stamp, and the calibration window
   * declines to count it rather than guessing. See `scripts/lib/floors.ts`.
   */
  configHash?: string;
  /**
   * The counting rule this run's complexity counts were produced under.
   *
   * ⚠️ **`configHash`'s twin, for the other half of the floors file, and the
   * only field a *cap* is compared through.** The caps in
   * `stryker.floors.json` were derived under one counting rule, and a count
   * produced under another is not a number about them: an ESLint upgrade that
   * counted one more construct would breach every cap at once and read as a
   * regression. So the run stamps its own, computed from the config ESLint
   * actually resolved — see `fixtureHashOf` and `counterInputs`.
   *
   * **Optional, for `configHash`'s reason exactly.** A row written before this
   * existed is not a row with a wrong hash; the cap's calibration window
   * declines to count it rather than guessing.
   */
  fixtureHash?: string;
  runUrl: string;
  /**
   * Which pull requests merged between the previous record and this one:
   * `#124, #125`, or `[]` for a window with nothing in it, or `unknown` when
   * there was no answer to read. See [`./pr-window.ts`](./pr-window.ts), which
   * owns those three values and the difference between the last two.
   *
   * ⚠️ **Required, and not defaulted here.** It is the field panel 1 is built
   * around — *is this real* is answered before *is this bad* — and a caller that
   * forgot it would publish an empty window, which is the tool-noise reading.
   * A type error is the cheapest place for that to be caught. **A string and
   * not a list**: this is a label value, and rendering it once at the source
   * keeps the page, the deploy print and the record spelling it the same way.
   */
  prWindow: string;
  /** What this run set out to compute. `run_ok` is derived from it. */
  expected: readonly TrendName[];
  /**
   * Series whose producing step failed, and which are therefore **not emitted
   * at all** — which is what makes `run_ok` go to zero, through the same
   * mechanism as a missing input rather than through a second one.
   *
   * ⚠️ **Without this, a red `pnpm test` records `run_ok 1`.** The wall-clock
   * is still there to be read, so *"computed every series it declared"* was
   * satisfied by a run that broke — found by review, and it narrowed *ran and
   * broke* to *ran and produced no report*. **A failed step's number is not a
   * measurement**: a suite that fails fast is faster, and shipping that
   * wall-clock corrupts the very trend it is a sample of.
   */
  failed?: readonly TrendName[];
  mutationScore?: readonly ScopeScore[];
  /**
   * The four counts per declared population, or absent when any of them failed.
   *
   * ⚠️ **Present means all eight scopes are here**, which `mutationScore` does
   * not promise: a scope with no mutants emits no score sample, while a
   * population with no function fails the whole set. Read
   * `complexityFactsOf` for why, and rely on it — the reading half does.
   */
  complexity?: readonly ScopeComplexity[];
  /**
   * The four counts over each of the two duplication populations, or absent
   * when any of the eight failed.
   *
   * ⚠️ **Present means all eight scopes *and* the tree are here.** Read
   * `duplicationFactsOf` for why, and rely on it — the renderer below does.
   */
  duplication?: DuplicationFacts;
  gateSuiteRuntime?: number;
  mutationRunRuntime?: number;
  liveExclusions?: { live: number; declared: number };
}

/** `mutation-score` → `stacks_trend_mutation_score`. OpenMetrics names take no hyphen. */
export function metricNameOf(trend: string): string {
  return `${METRIC_PREFIXES.trend}${trend.replace(/-/g, '_')}`;
}

/**
 * The trend series a rendered document carries, by name.
 *
 * Reads the `# TYPE` lines rather than the samples, because a series is
 * *emitted* when the run computed it and that is true of a family with zero
 * samples — every declared scope having produced no mutants, say. Reading
 * samples would make a real emission look like a missing one, which is the
 * direction that reads as health.
 */
export function trendNamesIn(document: string): string[] {
  const names: string[] = [];
  const pattern = new RegExp(`^# TYPE (${METRIC_PREFIXES.trend}[a-z0-9_]+) `, 'gm');

  for (const match of document.matchAll(pattern)) {
    const trend = trendOfMetric(match[1] ?? '');
    if (trend !== undefined) names.push(trend);
  }
  return names;
}

/**
 * `stacks_trend_mutation_score` → `mutation-score`, or `undefined` for a metric
 * under another prefix. **The inverse of `metricNameOf`, and it lives beside it.**
 *
 * Written out because the reading half needs it per *sample* where
 * `trendNamesIn` needs it per `# TYPE` line, and this repo has three rows
 * (G10, G22, G23) logging what happens when one rule acquires several
 * implementations: they agree until the day one of them does not.
 */
export function trendOfMetric(metric: string): string | undefined {
  if (!metric.startsWith(METRIC_PREFIXES.trend)) return undefined;
  return metric.slice(METRIC_PREFIXES.trend.length).replace(/_/g, '-');
}

/** OpenMetrics escaping for a `# HELP` line and for a label value. */
export function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

/** `escape` undone, for a label value read back off the disk. Same reason as above. */
export function unescape(text: string): string {
  return text.replace(/\\(.)/g, (_, char: string) => (char === 'n' ? '\n' : char));
}

/**
 * A number as OpenMetrics wants it.
 *
 * `toString()` on a float can produce exponent notation, which the parser
 * rejects — so a value small enough to reach it is fixed rather than defaulted.
 */
function value(n: number): string {
  return Number.isInteger(n) ? String(n) : (String(n).includes('e') ? n.toFixed(9) : String(n));
}

function labels(pairs: Record<string, string>): string {
  const entries = Object.entries(pairs);
  if (entries.length === 0) return '';
  return `{${entries.map(([key, text]) => `${key}="${escape(text)}"`).join(',')}}`;
}

interface Family {
  metric: string;
  help: string;
  samples: { labels: Record<string, string>; value: number }[];
}

function render(family: Family, timestamp: number): string[] {
  // TYPE before HELP, which is the order OpenMetrics documents for metric
  // family metadata. Every series here is a gauge: each one can go down.
  const lines = [`# TYPE ${family.metric} gauge`, `# HELP ${family.metric} ${escape(family.help)}`];
  for (const sample of family.samples) {
    lines.push(`${family.metric}${labels(sample.labels)} ${value(sample.value)} ${timestamp}`);
  }
  return lines;
}

function helpFor(trend: TrendName): string {
  const found = TREND_SERIES.find((series) => series.name === trend);
  if (found === undefined) throw new Error(`no declared trend series called ${trend}`);
  return found.help;
}

/**
 * The families this run computed, in declaration order.
 *
 * A series is present when its input is present, and absent otherwise — which is
 * what lets the same renderer serve the nightly (eight series) and the merge
 * (five) without either one lying about the other.
 */
function trendFamilies(facts: RunFacts): Family[] {
  const broke = new Set<string>(facts.failed ?? []);
  const families: Family[] = [];

  if (facts.mutationScore !== undefined && !broke.has('mutation-score')) {
    families.push({
      metric: metricNameOf('mutation-score'),
      help: helpFor('mutation-score'),
      samples: facts.mutationScore
        .filter((entry) => entry.score !== null)
        .map((entry) => ({ labels: { scope: entry.scope }, value: entry.score ?? 0 })),
    });
  }
  if (facts.gateSuiteRuntime !== undefined && !broke.has('gate-suite-runtime')) {
    families.push({
      metric: metricNameOf('gate-suite-runtime'),
      help: helpFor('gate-suite-runtime'),
      samples: [{ labels: {}, value: facts.gateSuiteRuntime }],
    });
  }
  if (facts.mutationRunRuntime !== undefined && !broke.has('mutation-run-runtime')) {
    families.push({
      metric: metricNameOf('mutation-run-runtime'),
      help: helpFor('mutation-run-runtime'),
      samples: [{ labels: {}, value: facts.mutationRunRuntime }],
    });
  }
  if (facts.liveExclusions !== undefined && !broke.has('live-exclusions')) {
    families.push({
      metric: metricNameOf('live-exclusions'),
      help: helpFor('live-exclusions'),
      samples: [{ labels: {}, value: facts.liveExclusions.live }],
    });
  }

  // One family per count, each carrying every population — the four names
  // rather than one series with a `stat` label, because G36 holds *names* to
  // Trends rows and a label would be invisible to it.
  //
  // ⚠️ The `failed` check is per name here, as it is above, although the
  // emitter can only ever fail the four together. A renderer that dropped the
  // set on one name would be a second copy of the all-or-nothing rule, living
  // where `complexityFactsOf`'s spec cannot reach it.
  const complexity = facts.complexity;
  if (complexity !== undefined) {
    for (const [series, of] of COMPLEXITY_FACTS) {
      if (broke.has(series)) continue;
      families.push({
        metric: metricNameOf(series),
        help: helpFor(series),
        samples: complexity.map((entry) => ({ labels: { scope: entry.scope }, value: of(entry) })),
      });
    }
  }

  // Eight families, four per population. The scoped four carry a `scope` label
  // and a sample per declared scope; the tree four carry one unlabelled sample.
  //
  // ⚠️ **Eight names rather than four with a `population` label**, which is the
  // `COMPLEXITY_FACTS` rule one turn further: G36 holds *names* to `## Trends`
  // rows, and a population expressed as a label would be invisible to it — the
  // whole-tree number could then disappear with no row going red.
  const duplication = facts.duplication;
  if (duplication !== undefined) {
    for (const [series, scoped, of] of DUPLICATION_FACTS) {
      if (broke.has(series)) continue;
      families.push({
        metric: metricNameOf(series),
        help: helpFor(series),
        samples: scoped
          ? duplication.scopes.map((entry) => ({
              labels: { scope: entry.scope },
              value: of(entry),
            }))
          : [{ labels: {}, value: of(duplication.tree) }],
      });
    }
  }
  return families;
}

/** Whether the run produced every series it declared it would. */
function ran(facts: RunFacts, trend: TrendName): boolean {
  return trendFamilies(facts).some((family) => family.metric === metricNameOf(trend));
}

/**
 * One run as an OpenMetrics document, terminated with `# EOF`.
 *
 * The terminator is not decoration: without it
 * `promtool tsdb create-blocks-from openmetrics` rejects the whole file, and a
 * record nothing can replay is a record that does not exist.
 */
export function renderMetrics(facts: RunFacts): string {
  const ok = facts.expected.every((trend) => ran(facts, trend));

  const health: Family[] = [
    {
      metric: `${METRIC_PREFIXES.run}ok`,
      help: 'One when this run computed every series it declared, zero when it did not.',
      samples: [{ labels: {}, value: ok ? 1 : 0 }],
    },
    {
      metric: `${METRIC_PREFIXES.run}info`,
      help: 'The run that wrote this file. A score never appears without its run.',
      samples: [
        {
          labels: {
            commit: facts.commit,
            event: facts.event,
            run_url: facts.runUrl,
            // The window rides on `run_info` rather than on a series of its
            // own, because it is context and not a measurement — and because
            // *a score never appears without its run* is a layout rule the
            // dashboard can only keep if the two arrive together.
            pr_window: facts.prWindow,
            ...(facts.configHash === undefined ? {} : { config_hash: facts.configHash }),
            // Beside `config_hash` rather than on a series of its own: a count
            // never appears without the rule that produced it, which is the
            // same layout rule the score already keeps.
            ...(facts.fixtureHash === undefined ? {} : { fixture_hash: facts.fixtureHash }),
          },
          value: 1,
        },
      ],
    },
  ];

  // The denominator `live-exclusions` is read against — *N of them declared* —
  // carried as run context rather than as a fifth series, because a count of
  // declarations is a property of `stryker.scopes.json` and not a measurement.
  if (facts.liveExclusions !== undefined) {
    health.push({
      metric: `${METRIC_PREFIXES.run}declared_exclusions`,
      help: 'Exclusion entries declared in stryker.scopes.json, the denominator for live-exclusions.',
      samples: [{ labels: {}, value: facts.liveExclusions.declared }],
    });
  }

  const lines = [...health, ...trendFamilies(facts)].flatMap((family) =>
    render(family, facts.timestamp),
  );
  return `${lines.join('\n')}\n# EOF\n`;
}

// ── The reading half: surface D, and the join that makes a sync ingestible ───

// The verdict is defined where it is produced, and imported as a *type* — so
// this module gains no runtime edge to anything that fetches. Four cases and
// not three, because *refused* and *stale* are the pair ADR-0027 already paid
// to keep apart: one is no answer at all, the other is a real answer and a red
// one. See `./edge-probe.ts`.


export interface EdgeFacts {
  /** Unix seconds — the moment of the sync, not of a CI run. */
  timestamp: number;
  origin: string;
  /** The build stamp the local `dist/` says was last published. */
  expected: string;
  build: EdgeAnswer;
  /**
   * The cover sweep, when it ran. The half CI could never buy: the comparison
   * needs the local `dist/` to know what each cover should weigh.
   *
   * `uncomparable` is carried beside `stale` rather than folded into it: an
   * origin that answered without a `content-length` said nothing about that
   * cover, and a zero in the stale count with six covers unmeasured is the
   * vacuous green this whole layer is arranged against.
   */
  covers?: { checked: number; stale: number; uncomparable: number };
}

function servingOf(build: EdgeAnswer): string {
  if (build.kind === 'current') return build.serving;
  if (build.kind === 'stale') return build.serving ?? 'unstamped';
  return '';
}

/**
 * One probe of the live origin, as the OpenMetrics text `promtool` ingests.
 *
 * **`run_ok 0` covers a refusal with nothing invented.** A refusal produces no
 * `stacks_edge_build_current` sample at all — a zero there would say *the
 * origin is serving the wrong build*, which nothing measured. Same discipline
 * as the CI record's `run_ok 0` **plus whatever computed**, and the same reason:
 * *never ran* and *ran and broke* have to stay distinguishable.
 *
 * ⚠️ **`run_ok` carries `surface="edge"`, which CI's does not.** Same metric
 * name, so *did the pipe work* answers over both; different label set, so the
 * two are different series and a local probe can never overwrite or dilute a
 * CI run's health. Prometheus decides series identity on the label set, which
 * is what makes that structural rather than a convention.
 */
export function renderEdgeCheck(facts: EdgeFacts): string {
  const answered = facts.build.kind === 'current' || facts.build.kind === 'stale';
  const context = { origin: facts.origin, expected: facts.expected };

  const families: Family[] = [
    {
      metric: `${METRIC_PREFIXES.run}ok`,
      help: 'One when this probe got an answer out of the origin, zero when it did not.',
      samples: [{ labels: { surface: 'edge' }, value: answered ? 1 : 0 }],
    },
    {
      metric: `${METRIC_PREFIXES.edge}info`,
      help: 'The probe that wrote this file. A number never appears without what it asked.',
      samples: [
        {
          labels: {
            ...context,
            serving: servingOf(facts.build),
            // The verdict's own name is the label: `current`, `stale`,
            // `refused`, `unreachable`. A second vocabulary here would be a
            // place for the record and the message to disagree.
            outcome: facts.build.kind,
            status: facts.build.kind === 'refused' ? String(facts.build.status) : '',
          },
          value: 1,
        },
      ],
    },
  ];

  if (answered) {
    families.push({
      metric: `${METRIC_PREFIXES.edge}build_current`,
      help: 'One when the origin is serving the build that was last published, zero when it is not.',
      samples: [{ labels: context, value: facts.build.kind === 'current' ? 1 : 0 }],
    });
  }

  if (facts.covers !== undefined) {
    const sweep = { ...context, checked: String(facts.covers.checked) };
    families.push(
      {
        metric: `${METRIC_PREFIXES.edge}stale_covers`,
        help: 'Covers the origin serves at a different size from the local build, of N checked.',
        samples: [{ labels: sweep, value: facts.covers.stale }],
      },
      {
        metric: `${METRIC_PREFIXES.edge}uncomparable_covers`,
        help: 'Covers the origin answered without a content-length, so nothing was compared.',
        samples: [{ labels: sweep, value: facts.covers.uncomparable }],
      },
    );
  }

  const lines = families.flatMap((family) => render(family, facts.timestamp));
  return `${lines.join('\n')}\n# EOF\n`;
}

/**
 * Many records as the one document `promtool tsdb create-blocks-from` ingests.
 *
 * ⚠️ **A naive concatenation writes no block at all**, which is the part worth
 * knowing: `# EOF` terminates an OpenMetrics document, so a second document
 * after it is *"unexpected data after # EOF"* and the **whole file** is
 * rejected — not partially ingested. Measured 2026-08-19 against
 * `prom/prometheus`; the same records with the terminator stripped from all but
 * the last ingest as separate blocks with their timestamps intact.
 *
 * So this owns the terminator rather than trusting each record's: every `# EOF`
 * is dropped and exactly one is appended. It owns the line endings too — a
 * `\r` anywhere is *"invalid metric type \"gauge\\r\""*, and a record read back
 * through git on Windows is exactly where one arrives.
 */
export function joinRecords(documents: readonly string[]): string {
  if (documents.length === 0) {
    throw new Error(
      'nothing to join — an empty document ingests as zero blocks and reports success, ' +
        'which reads as "synced" from the one command that exists to say whether anything arrived',
    );
  }

  const lines = documents
    .flatMap((document) => document.replace(/\r/g, '').split('\n'))
    .filter((line) => line !== '' && line !== '# EOF');

  return `${[...lines, '# EOF'].join('\n')}\n`;
}
