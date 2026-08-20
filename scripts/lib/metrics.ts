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
 * the merge half legitimately expects one series where the nightly expects four.
 */

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
