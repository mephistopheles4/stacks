/**
 * One run of CI, rendered as the OpenMetrics text `promtool` ingests.
 *
 * This is the **writing half** of the trend layer: CI writes a durable record;
 * the machine pulls it. `scripts/emit-metrics.ts` gathers the facts and
 * `.github/workflows/metrics.yml` commits the result to the orphan `metrics`
 * branch, one file per run.
 *
 * ⚠️ **Durable, never immutable.** The `metrics` branch is unprotected and
 * force-pushable by construction, and append-only is a convention enforced by
 * nothing. What git buys is that the record survives the laptop, the store, and
 * any rebuild of Prometheus — see
 * [ADR-0055](../../docs/adr/0055-ci-writes-a-durable-record.md).
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
 * the merge half legitimately expects one series where the nightly expects four.
 */

/**
 * The two metric-name prefixes, and the whole of the separation between them.
 *
 * Neither may be a prefix of the other: `trendNamesIn` strips `trend` to recover
 * a name, and if `run` were a prefix of it every run-health sample would parse
 * as a trend with a mangled name rather than being skipped. Asserted by G36
 * rather than left as a property of two strings that look obviously different.
 */
export const METRIC_PREFIXES = {
  run: 'stacks_run_',
  trend: 'stacks_trend_',
} as const;

/** The four series, and the whole of what this record carries as a trend. */
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

export interface RunFacts {
  /** Unix seconds. Explicit on every sample, so a replay lands at the right hour. */
  timestamp: number;
  commit: string;
  /** `push`, `schedule` or `workflow_dispatch` — which half of `metrics.yml` ran. */
  event: string;
  runUrl: string;
  /** What this run set out to compute. `run_ok` is derived from it. */
  expected: readonly TrendName[];
  mutationScore?: readonly ScopeScore[];
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
    names.push((match[1] ?? '').slice(METRIC_PREFIXES.trend.length).replace(/_/g, '-'));
  }
  return names;
}

/** OpenMetrics escaping for a `# HELP` line and for a label value. */
function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
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
 * what lets the same renderer serve the nightly (four series) and the merge
 * (one) without either one lying about the other.
 */
function trendFamilies(facts: RunFacts): Family[] {
  const families: Family[] = [];

  if (facts.mutationScore !== undefined) {
    families.push({
      metric: metricNameOf('mutation-score'),
      help: helpFor('mutation-score'),
      samples: facts.mutationScore
        .filter((entry) => entry.score !== null)
        .map((entry) => ({ labels: { scope: entry.scope }, value: entry.score ?? 0 })),
    });
  }
  if (facts.gateSuiteRuntime !== undefined) {
    families.push({
      metric: metricNameOf('gate-suite-runtime'),
      help: helpFor('gate-suite-runtime'),
      samples: [{ labels: {}, value: facts.gateSuiteRuntime }],
    });
  }
  if (facts.mutationRunRuntime !== undefined) {
    families.push({
      metric: metricNameOf('mutation-run-runtime'),
      help: helpFor('mutation-run-runtime'),
      samples: [{ labels: {}, value: facts.mutationRunRuntime }],
    });
  }
  if (facts.liveExclusions !== undefined) {
    families.push({
      metric: metricNameOf('live-exclusions'),
      help: helpFor('live-exclusions'),
      samples: [{ labels: {}, value: facts.liveExclusions.live }],
    });
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
          labels: { commit: facts.commit, event: facts.event, run_url: facts.runUrl },
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
