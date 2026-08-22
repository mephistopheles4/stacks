/**
 * The reading half of the record, where the writing half's format has to hold.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row.
 * `gates/trend-layer.test.ts` (G36) owns the CI document and its correspondence
 * with the scoreboard; this owns the two pieces only `pnpm trend:sync` uses:
 * the join that makes many records ingestible as one, and surface D's row.
 *
 * ⚠️ **Nothing here may touch the filesystem.** A spec under `scripts/` runs
 * inside Stryker's sandbox too, where `REPO_ROOT` resolves somewhere else
 * entirely — so a spec that reads a real file passes under `pnpm test` and
 * fails as a mutation-run fault. Both subjects here are pure functions over
 * strings for that reason.
 */

import { describe, expect, it } from 'vitest';
import type { Counts } from './complexity.ts';
import {
  COMPLEXITY_SERIES,
  METRIC_PREFIXES,
  TREND_SERIES,
  complexityFactsOf,
  joinRecords,
  renderEdgeCheck,
  renderMetrics,
  trendNamesIn,
  type EdgeFacts,
  type RunFacts,
} from './metrics.ts';

const AT = 1_787_183_835;

/** A run with nothing computed, for the tests that add exactly one thing to it. */
const BASE: RunFacts = {
  timestamp: AT,
  commit: 'abc123',
  event: 'schedule',
  runUrl: 'https://example.invalid/run/1',
  // Nobody measured a window for a record these tests invented.
  prWindow: 'unknown',
  expected: [],
};

function record(value: number): string {
  return [
    '# TYPE stacks_run_ok gauge',
    '# HELP stacks_run_ok One when this run computed every series it declared.',
    `stacks_run_ok ${String(value)} ${String(AT)}`,
    '# EOF',
    '',
  ].join('\n');
}

function edge(build: EdgeFacts['build'], covers?: EdgeFacts['covers']): string {
  return renderEdgeCheck({
    timestamp: AT,
    origin: 'https://stacks.example',
    expected: 'a1b2c3d4e5f6',
    build,
    covers,
  });
}

describe('joinRecords — many documents, one ingestible file', () => {
  it('leaves exactly one terminator, at the end', () => {
    // Measured, and it is the whole file that dies: `# EOF` terminates an
    // OpenMetrics document, so a second document after it is "unexpected data
    // after # EOF" and promtool writes no block at all — not a partial ingest.
    const joined = joinRecords([record(1), record(0)]);

    expect(joined.match(/^# EOF$/gm)).toHaveLength(1);
    expect(joined.endsWith('# EOF\n')).toBe(true);
  });

  it('keeps every sample from every record', () => {
    const joined = joinRecords([record(1), record(0)]);

    expect(joined).toContain(`stacks_run_ok 1 ${String(AT)}`);
    expect(joined).toContain(`stacks_run_ok 0 ${String(AT)}`);
  });

  it('writes LF, whatever it was handed', () => {
    // "invalid metric type \"gauge\\r\"" — a CRLF anywhere in the file is a
    // parse error, and a record read back through git on Windows is exactly
    // where one arrives.
    const joined = joinRecords([record(1).replace(/\n/g, '\r\n')]);

    expect(joined).not.toContain('\r');
    expect(joined).toContain(`stacks_run_ok 1 ${String(AT)}`);
  });

  it('drops blank lines rather than passing them through', () => {
    const joined = joinRecords([`${record(1)}\n\n`]);

    expect(joined).not.toMatch(/\n\n/);
  });

  it('refuses to join nothing, rather than writing an empty document', () => {
    // An empty file ingests as zero blocks and reports success, which reads as
    // "synced" to the one command that exists to say whether anything arrived.
    expect(() => joinRecords([])).toThrow(/nothing to join/i);
  });
});

describe('renderEdgeCheck — surface D, with nothing invented', () => {
  it('writes run_ok 1 and a zero when the origin serves a stale build', () => {
    // A real answer, and a red one. Distinct from a refusal in both directions:
    // the run worked, and what it learned is bad.
    const document = edge({ kind: 'stale', serving: '9f9f9f9f9f9f' });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 1 1787183835$/m);
    expect(document).toMatch(/^stacks_edge_build_current\{[^}]*\} 0 1787183835$/m);
    expect(document).toContain('outcome="stale"');
    expect(document).toContain('serving="9f9f9f9f9f9f"');
  });

  it('writes run_ok 1 and a one when the origin serves this build', () => {
    const document = edge({ kind: 'current', serving: 'a1b2c3d4e5f6' });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 1 1787183835$/m);
    expect(document).toMatch(/^stacks_edge_build_current\{[^}]*\} 1 1787183835$/m);
    expect(document).toContain('outcome="current"');
  });

  it('writes run_ok 0 and no build sample at all when the origin refuses', () => {
    // ADR-0027's distinction, kept in the record: a refusal is not an answer,
    // so there is no build number to write. A zero here would say "serving the
    // wrong build", which nothing measured.
    const document = edge({ kind: 'refused', status: 403 });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 0 1787183835$/m);
    expect(document).not.toContain('stacks_edge_build_current');
    expect(document).toContain('outcome="refused"');
    expect(document).toContain('status="403"');
  });

  it('writes run_ok 0 when the origin could not be reached', () => {
    const document = edge({ kind: 'unreachable' });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 0 1787183835$/m);
    expect(document).not.toContain('stacks_edge_build_current');
    expect(document).toContain('outcome="unreachable"');
  });

  it('carries the cover sweep when it ran, and no sample when it did not', () => {
    // The half CI could never buy: the comparison needs the local dist/ to
    // know what each cover should weigh.
    const swept = edge(
      { kind: 'current', serving: 'a1b2c3d4e5f6' },
      { checked: 41, stale: 2, uncomparable: 6 },
    );

    expect(swept).toMatch(/^stacks_edge_stale_covers\{[^}]*\} 2 1787183835$/m);
    expect(edge({ kind: 'current', serving: 'a1b2c3d4e5f6' })).not.toContain(
      'stacks_edge_stale_covers',
    );
  });

  it('counts what could not be compared beside what was stale', () => {
    // "0 stale of 41" while six were never compared is a green that means
    // nothing — an origin answering without a content-length said nothing
    // about those covers, and a zero would claim it did.
    const swept = edge(
      { kind: 'current', serving: 'a1b2c3d4e5f6' },
      { checked: 41, stale: 0, uncomparable: 6 },
    );

    expect(swept).toMatch(/^stacks_edge_stale_covers\{[^}]*\} 0 1787183835$/m);
    expect(swept).toMatch(/^stacks_edge_uncomparable_covers\{[^}]*\} 6 1787183835$/m);
  });

  it('names no trend, so the Trends table owes it no row', () => {
    // D's series live under a third prefix precisely so G36 cannot see them:
    // a row for a series CI never emits would make the gate's reverse
    // direction red against every CI run. Structural, not a list of exceptions.
    expect(trendNamesIn(edge({ kind: 'current', serving: 'a1b2c3d4e5f6' }))).toEqual([]);
  });

  it('closes the document so promtool will ingest it', () => {
    expect(edge({ kind: 'unreachable' }).endsWith('# EOF\n')).toBe(true);
  });

  it('escapes a label value rather than letting it end the label', () => {
    const document = renderEdgeCheck({
      timestamp: AT,
      origin: 'https://example.invalid/?a="b"\\c',
      expected: 'a1b2c3d4e5f6',
      build: { kind: 'unreachable' },
    });

    expect(document).toContain('origin="https://example.invalid/?a=\\"b\\"\\\\c"');
  });
});

describe('the three metric prefixes name three things', () => {
  it('makes no prefix a prefix of another', () => {
    // `trendNamesIn` strips a prefix to recover a name. If one prefix were a
    // prefix of another, every sample under the longer one would parse as a
    // series under the shorter with a mangled name — which is health-shaped.
    const prefixes = Object.values(METRIC_PREFIXES);
    const overlapping = prefixes.flatMap((one) =>
      prefixes.filter((other) => other !== one && other.startsWith(one)).map((other) => `${one} ⊂ ${other}`),
    );

    expect(overlapping, `prefixes that swallow another: ${overlapping.join(', ')}`).toEqual([]);
  });
});

describe('the run stamps the configuration it was scored under', () => {
  const facts = {
    timestamp: AT,
    commit: 'abc123',
    event: 'schedule',
    runUrl: 'https://example.invalid/run/1',
    // Nobody measured a window for a record this test invented.
    prWindow: 'unknown',
    expected: [],
  } as const;

  // The floors a deploy compares against were derived under one Stryker
  // configuration, and a score computed under another is not a number about
  // them. Lowering `timeoutMS` raises the score with no test touched, because a
  // timeout counts as detected — so the run has to say which configuration it
  // ran, at the moment it ran, and it cannot be told from outside.
  it('carries the hash as run context, beside the commit', () => {
    const document = renderMetrics({ ...facts, configHash: 'sha256:abcdef' });

    expect(document).toMatch(/^stacks_run_info\{[^}]*config_hash="sha256:abcdef"[^}]*\} 1 /m);
  });

  // ⚠️ An unstamped row is not a row with a wrong hash: it is a row from before
  // the stamp existed. It stays renderable, and the calibration window declines
  // to count it — which is the honest cost of closing the configuration route.
  it('renders a row that carries no hash at all', () => {
    expect(renderMetrics(facts)).toMatch(/^stacks_run_info\{/m);
    expect(renderMetrics(facts)).not.toContain('config_hash');
  });

  // The counting rule's stamp, for the caps, riding the same family for the
  // same reason: *a score never appears without its run*, and now neither does
  // a count. See docs/spec/complexity-on-the-trend-layer.md §4.
  it('carries the counting stamp beside the scoring one', () => {
    const document = renderMetrics({
      ...facts,
      configHash: 'sha256:abcdef',
      fixtureHash: 'sha256:counted',
    });

    expect(document).toMatch(/^stacks_run_info\{[^}]*fixture_hash="sha256:counted"[^}]*\} 1 /m);
    expect(document).toMatch(/^stacks_run_info\{[^}]*config_hash="sha256:abcdef"[^}]*\} 1 /m);
  });

  // ⚠️ **The two stamps are independent, and a record may carry either alone.**
  // They answer different questions — *scored under which configuration* and
  // *counted under which rule* — and every record written before this slice
  // carries the first without the second.
  it('renders a row stamped for scoring and not for counting', () => {
    const document = renderMetrics({ ...facts, configHash: 'sha256:abcdef' });

    expect(document).toContain('config_hash');
    expect(document).not.toContain('fixture_hash');
  });
});

describe('the two tables that spell the complexity series', () => {
  it('gives every declared complexity series a count to render from', () => {
    // ⚠️ The names live in two tables in `metrics.ts` — `TREND_SERIES` for the
    // help text, `COMPLEXITY_FACTS` for the accessor — coupled only by
    // `TrendName`, which catches a typo and not an omission. A fifth entry
    // added to the first alone is declared, never emitted, and G36 sees eight
    // on both sides: red only if somebody also writes the row, or puts the
    // name on an `--expect` list. Narrow, and four lines to close.
    const declared = TREND_SERIES.map((series) => series.name).filter((name) =>
      name.startsWith('complexity-'),
    );

    expect([...COMPLEXITY_SERIES].sort()).toEqual([...declared].sort());
  });
});

describe('complexityFactsOf — all four, or none of them', () => {
  const counts = (functions: number, mass: number, massOver10: number, max: number): Counts => ({
    functions,
    mass,
    massOver10,
    max,
  });

  const counted = (): Map<string, Counts | null> =>
    new Map([
      ['packages/core/src', counts(120, 340, 88, 21)],
      ['scripts', counts(96, 410, 150, 40)],
    ]);

  it('carries one entry per population, in the order counted', () => {
    const { complexity, failed } = complexityFactsOf(counted());

    expect(failed).toEqual([]);
    expect(complexity).toEqual([
      { scope: 'packages/core/src', functions: 120, mass: 340, massOver10: 88, max: 21 },
      { scope: 'scripts', functions: 96, mass: 410, massOver10: 150, max: 40 },
    ]);
  });

  it('fails all four names when any one population yielded no function', () => {
    // The spec's loudest rule for this slice. Emitting the seven populations
    // that counted and omitting the eighth is the shape ruled out by name: the
    // renderer treats a zero-sample family as emitted, so the record would read
    // `run_ok 1` with a population silently gone.
    const partial = counted();
    partial.set('packages/site/src/shelf', null);

    const { complexity, failed } = complexityFactsOf(partial);

    expect(complexity).toBeUndefined();
    expect([...failed].sort()).toEqual([
      'complexity-functions',
      'complexity-mass',
      'complexity-mass-over-10',
      'complexity-max',
    ]);
  });

  it('never reports a zero for max instead of a failure', () => {
    // `0` is a legal value for a scope of trivial functions, so a zeroed entry
    // would be indistinguishable from the failure. Asserted on the bytes rather
    // than on the facts, because the bytes are what a dashboard ever sees.
    const partial = counted();
    partial.set('scripts', null);

    const document = renderMetrics({
      ...BASE,
      expected: ['complexity-max'],
      ...complexityFactsOf(partial),
    });

    expect(document).not.toContain('stacks_trend_complexity_max');
    expect(document).toMatch(/^stacks_run_ok 0 /m);
  });

  it('fails all four when the counter never ran at all', () => {
    // An ESLint throw and an empty population reach the same destination for
    // different reasons — the caller logs which, and the record cannot tell
    // them apart because a record that could would be inviting a third state.
    const { complexity, failed } = complexityFactsOf(undefined);

    expect(complexity).toBeUndefined();
    expect(failed).toHaveLength(4);
  });

  it('fails all four when no population was counted', () => {
    // Eight scopes are declared, so an empty map is the counter having found
    // nothing to walk — a broken declaration, not a healthy run.
    expect(complexityFactsOf(new Map()).complexity).toBeUndefined();
    expect(complexityFactsOf(new Map()).failed).toHaveLength(4);
  });

  it('fails no series it does not own', () => {
    const partial = counted();
    partial.set('scripts', null);

    expect(complexityFactsOf(partial).failed).not.toContain('mutation-score');
    expect(complexityFactsOf(partial).failed).not.toContain('gate-suite-runtime');
  });
});

describe('the complexity families, as rendered', () => {
  const withComplexity = (): RunFacts => ({
    ...BASE,
    complexity: [
      { scope: 'packages/core/src', functions: 120, mass: 340, massOver10: 88, max: 21 },
      { scope: 'scripts', functions: 96, mass: 410, massOver10: 150, max: 40 },
    ],
  });

  it('renders four families, one sample per scope', () => {
    const document = renderMetrics(withComplexity());

    expect(document).toMatch(
      /^stacks_trend_complexity_functions\{scope="packages\/core\/src"\} 120 /m,
    );
    expect(document).toMatch(/^stacks_trend_complexity_mass\{scope="scripts"\} 410 /m);
    expect(document).toMatch(/^stacks_trend_complexity_mass_over_10\{scope="scripts"\} 150 /m);
    expect(document).toMatch(/^stacks_trend_complexity_max\{scope="scripts"\} 40 /m);
  });

  it('names all four series in the rendered document', () => {
    expect(trendNamesIn(renderMetrics(withComplexity()))).toEqual(
      expect.arrayContaining([
        'complexity-functions',
        'complexity-mass',
        'complexity-mass-over-10',
        'complexity-max',
      ]),
    );
  });

  it('round-trips the hyphenated name through the metric name', () => {
    // `complexity-mass-over-10` is the one name here with more than one hyphen,
    // and `metricNameOf`/`trendOfMetric` are a pair of separate implementations
    // — the shape this repo has three logged rows about. A name that did not
    // survive the trip would reach the dashboard as a family nothing reads.
    expect(trendNamesIn(renderMetrics(withComplexity()))).toContain('complexity-mass-over-10');
  });

  it('drops one complexity family without dropping the others', () => {
    // Not a state the emitter can produce — it fails all four together — but
    // `failed` is per-name, and a renderer that dropped the set on one name
    // would be a second all-or-nothing rule living where nothing tests it.
    const document = renderMetrics({ ...withComplexity(), failed: ['complexity-max'] });

    expect(trendNamesIn(document)).not.toContain('complexity-max');
    expect(trendNamesIn(document)).toContain('complexity-mass');
  });
});
