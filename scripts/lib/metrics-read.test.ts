/**
 * The reading half of the record, planted.
 *
 * G39 (`metrics-freshness`) drives the refusal through the real
 * `scripts/deploy.ts` against a scratch repository, which is what proves it is
 * wired in. **What it cannot plant is the calendar**: the script has no way to
 * be told what day it is, so *no record 4 days after the spine landed* is
 * observed here, against the judgement itself, with `now` a parameter.
 *
 * Round-tripped through `renderMetrics` rather than through hand-written
 * OpenMetrics text: a parser tested against strings its own author invented
 * agrees with the author, not with the writer.
 */

import { describe, expect, it } from 'vitest';
import {
  DAY,
  GATED_SERIES,
  SPINE_LANDED,
  STALE_AFTER_DAYS,
  deltaPair,
  describeAge,
  halfOf,
  judgeRecord,
  newestByTrend,
  parseRecord,
  parseSamples,
  recordsCarrying,
  runInfoOf,
  samplesOf,
  scoresOf,
} from './metrics-read.ts';
import {
  COMPLEXITY_SERIES,
  COGNITIVE_SERIES,
  DUPLICATION_SERIES,
  renderMetrics,
  type RunFacts,
} from './metrics.ts';

const NOW = 1_787_000_000;
const SPINE = Date.parse(`${SPINE_LANDED}T00:00:00Z`) / 1000;

/**
 * The complexity half of any record here.
 *
 * ⚠️ **Both halves of `metrics.yml` write it**, which is why it appears in the
 * merge fixture below as well. A merge record carrying only a runtime is the
 * shape this file planted before the counts existed, and it stopped being a
 * shape CI produces.
 */
const COGNITIVE = [
  { scope: 'packages/core/src', functions: 118, mass: 296, massOver15: 61, max: 24 },
];

const COMPLEXITY = [
  { scope: 'packages/core/src', functions: 120, mass: 340, massOver10: 88, max: 21 },
  { scope: 'packages/cli/src', functions: 26, mass: 96, massOver10: 22, max: 14 },
];

/**
 * The duplication half of any record here.
 *
 * **Both halves of `metrics.yml` write it too**, for `COMPLEXITY`'s reason: the
 * counter runs inside the emitter rather than as a workflow step, so it is not
 * a nightly-only measurement. Two scopes and a tree, because the eight scoped
 * samples and the one unlabelled tree sample are different renderings and a
 * fixture carrying only the first would exercise half the family.
 */
const DUPLICATION = {
  scopes: [
    {
      scope: 'packages/core/src',
      clones: 3,
      duplicatedLines: 46,
      ignoredLines: 0,
      totalLines: 2381,
    },
    { scope: 'packages/cli/src', clones: 0, duplicatedLines: 0, ignoredLines: 0, totalLines: 702 },
  ],
  tree: { clones: 34, duplicatedLines: 357, ignoredLines: 0, totalLines: 47_209 },
};

/** A nightly: all eight series, the shape CI actually writes on a schedule. */
function nightly(timestamp: number, overrides: Partial<RunFacts> = {}): string {
  return renderMetrics({
    timestamp,
    commit: 'a'.repeat(40),
    event: 'schedule',
    runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/1',
    // Nobody measured a window for a record this test invented.
    prWindow: 'unknown',
    expected: GATED_SERIES,
    mutationScore: [
      { scope: 'packages/core/src', score: 0.7171964140179299 },
      { scope: 'packages/cli/src', score: 0.4558 },
    ],
    gateSuiteRuntime: 10,
    mutationRunRuntime: 1275,
    liveExclusions: { live: 0, declared: 27 },
    complexity: COMPLEXITY,
    duplication: DUPLICATION,
    cognitive: COGNITIVE,
    ...overrides,
  });
}

/**
 * A merge row: the runtime and the four counts, which is what `push: main`
 * legitimately writes. **Not the whole record** — the mutation series stay
 * nightly, so a merge record is still not a scored one.
 */
function merge(timestamp: number, overrides: Partial<RunFacts> = {}): string {
  return renderMetrics({
    timestamp,
    commit: 'b'.repeat(40),
    event: 'push',
    runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/2',
    // Nobody measured a window for a record this test invented.
    prWindow: 'unknown',
    expected: [
      'gate-suite-runtime',
      ...COMPLEXITY_SERIES,
      ...DUPLICATION_SERIES,
      ...COGNITIVE_SERIES,
    ],
    gateSuiteRuntime: 9,
    complexity: COMPLEXITY,
    duplication: DUPLICATION,
    cognitive: COGNITIVE,
    ...overrides,
  });
}

describe('parsing a record', () => {
  it('reads every sample line and skips the metadata', () => {
    const samples = parseSamples(nightly(NOW));

    expect(samples.length).toBeGreaterThan(5);
    expect(samples.every((sample) => sample.timestamp === NOW)).toBe(true);
    expect(samples.some((sample) => sample.metric.startsWith('#'))).toBe(false);
  });

  it('reads a label set rather than splitting on the comma inside one', () => {
    // `run_info` carries three labels and a URL. A splitter on `,` would be
    // right here and wrong the first time a value contained one, which is the
    // mistake the `subjects` separator exists to avoid one layer down.
    const info = runInfoOf(parseRecord(nightly(NOW)));

    expect(info?.['event']).toBe('schedule');
    expect(info?.['run_url']).toBe('https://github.com/mephistopheles4/stacks/actions/runs/1');
    expect(info?.['commit']).toBe('a'.repeat(40));
  });

  it('reads each declared scope score', () => {
    const scores = scoresOf(parseRecord(nightly(NOW)));

    expect(scores.get('packages/core/src')).toBeCloseTo(0.7171964140179299, 12);
    expect(scores.size).toBe(2);
  });

  it('survives the carriage returns a record read back through git carries', () => {
    const parsed = parseRecord(nightly(NOW).replace(/\n/g, '\r\n'));

    expect([...parsed.trends.keys()].sort()).toEqual([...GATED_SERIES].sort());
    expect(scoresOf(parsed).size).toBe(2);
  });

  it('counts a family with no samples as emitted, dated by the record', () => {
    // Every declared scope producing no mutants renders a `# TYPE` line and no
    // samples. That is a real emission, and reading membership from samples
    // would report it as a missing series — the direction that reads as health.
    const document = nightly(NOW, { mutationScore: [{ scope: 'packages/core/src', score: null }] });
    const parsed = parseRecord(document);

    expect(scoresOf(parsed).size).toBe(0);
    expect(parsed.trends.get('mutation-score')).toBe(NOW);
  });

  it('takes the newest sample per series across records', () => {
    const newest = newestByTrend([parseRecord(merge(NOW)), parseRecord(nightly(NOW - 2 * DAY))]);

    expect(newest.get('gate-suite-runtime')).toBe(NOW);
    expect(newest.get('mutation-score')).toBe(NOW - 2 * DAY);
  });
});

describe('judging a record — per-series, because the record is not one number', () => {
  it('passes a nightly inside the bound', () => {
    expect(judgeRecord({ now: NOW, records: [parseRecord(nightly(NOW - 3600))] })).toEqual({
      kind: 'fresh',
    });
  });

  it('refuses the series that went quiet, not the record', () => {
    // The failure an aggregate check cannot see: a working merge pipeline keeps
    // the newest row minutes old forever while three series are four days dead.
    const verdict = judgeRecord({
      now: NOW,
      records: [parseRecord(merge(NOW)), parseRecord(nightly(NOW - 4 * DAY))],
    });

    expect(verdict.kind).toBe('stale');
    expect(verdict.kind === 'stale' ? verdict.stale.map((one) => one.series) : []).toEqual([
      'mutation-score',
      'mutation-run-runtime',
      'live-exclusions',
    ]);
    expect(verdict.kind === 'stale' ? verdict.stale[0]?.newest : undefined).toBe(NOW - 4 * DAY);
  });

  it('treats a series with no sample at all exactly as a stale one', () => {
    // Absent and stale are one verdict, entailed rather than decided: "the
    // newest sample is older than 3 days" is undefined for a series that never
    // emitted, and that series is the failure this check exists to expose.
    const verdict = judgeRecord({ now: NOW, records: [parseRecord(merge(NOW))] });

    expect(verdict.kind).toBe('stale');
    expect(verdict.kind === 'stale' ? verdict.stale.map((one) => one.newest) : []).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('holds the bound at three days rather than near it', () => {
    const at = (age: number): string =>
      judgeRecord({ now: NOW, records: [parseRecord(nightly(NOW - age))] }).kind;

    expect(at(STALE_AFTER_DAYS * DAY)).toBe('fresh');
    expect(at(STALE_AFTER_DAYS * DAY + 1)).toBe('stale');
  });

  it('prints and does not refuse two days after the spine landed', () => {
    // The dated bootstrap. As specified without it, the first deploy after the
    // spine refuses on an empty record — and the first thing the machinery
    // would teach is how to get past it.
    expect(judgeRecord({ now: SPINE + 2 * DAY, records: [] })).toEqual({
      kind: 'bootstrap',
      days: 2,
    });
  });

  it('refuses four days after the spine landed, with no record', () => {
    expect(judgeRecord({ now: SPINE + 4 * DAY, records: [] })).toEqual({ kind: 'never', days: 4 });
  });

  it('expires the exemption on the third day, not the fourth', () => {
    // Expiring on a day rather than on "until the first record arrives" is what
    // stops *never ran* and *ran and broke* collapsing into a permanent pass.
    expect(judgeRecord({ now: SPINE + STALE_AFTER_DAYS * DAY, records: [] }).kind).toBe('never');
    expect(judgeRecord({ now: SPINE + STALE_AFTER_DAYS * DAY - 1, records: [] }).kind).toBe(
      'bootstrap',
    );
  });

  it('bounds every CI-written series and no fewer', () => {
    // The spec's own table said "the three nightly-written ones" and it is
    // eight. A wrong number here leaves a CI series outside the bound, which is
    // the one thing that cannot be noticed by reading a green deploy.
    expect([...GATED_SERIES]).toEqual([
      'mutation-score',
      'gate-suite-runtime',
      'mutation-run-runtime',
      'live-exclusions',
      'complexity-functions',
      'complexity-mass',
      'complexity-mass-over-10',
      'complexity-max',
      'duplication-clones',
      'duplication-lines',
      'duplication-ignored-lines',
      'duplication-total-lines',
      'duplication-tree-clones',
      'duplication-tree-lines',
      'duplication-tree-ignored-lines',
      'duplication-tree-total-lines',
      'cognitive-functions',
      'cognitive-mass',
      'cognitive-mass-over-15',
      'cognitive-max',
    ]);
  });

  it('refuses a deploy when one complexity series goes quiet and the rest do not', () => {
    // The failure per-series staleness exists to expose, in the shape this
    // slice adds it: a working merge pipeline keeps every other series minutes
    // old while the counts stop arriving.
    const quiet = judgeRecord({
      now: NOW,
      records: [nightly(NOW - 600, { complexity: undefined })].map((text) => parseRecord(text)),
    });

    expect(quiet.kind).toBe('stale');
    expect(quiet.kind === 'stale' ? quiet.stale.map((one) => one.series) : []).toEqual([
      'complexity-functions',
      'complexity-mass',
      'complexity-mass-over-10',
      'complexity-max',
    ]);
  });
});

describe('reading one trend off a record', () => {
  it('reads a per-scope sample by trend name, not by metric string', () => {
    // The consumers never spell `stacks_trend_complexity_mass_over_10`. A typo
    // in a metric string reaches PromQL and returns an empty series, which is
    // a blank panel and not an error; a typo in a `TrendName` does not compile.
    const record = parseRecord(nightly(NOW));

    expect(samplesOf(record, 'complexity-mass').get('packages/core/src')).toBe(340);
    expect(samplesOf(record, 'complexity-mass-over-10').get('packages/cli/src')).toBe(22);
    expect(samplesOf(record, 'complexity-max').get('packages/core/src')).toBe(21);
  });

  it('reads nothing for a series the record does not carry', () => {
    expect(samplesOf(parseRecord(merge(NOW)), 'mutation-score').size).toBe(0);
  });

  it('keeps scoresOf mutation-specific', () => {
    // A merge record carries complexity now, and must still not read as a
    // scored record: `scoredRecords` filters on exactly this, and a merge that
    // read as scored would be paired against a nightly in the delta.
    const record = parseRecord(merge(NOW));

    expect(samplesOf(record, 'complexity-mass').size).toBe(2);
    expect(scoresOf(record).size).toBe(0);
  });

  it('answers alike for the same question asked twice', () => {
    // `scoresOf` is `samplesOf(record, 'mutation-score')` and stays that way.
    // Two implementations of one rule agree until the day one of them does not.
    const record = parseRecord(nightly(NOW));

    expect([...scoresOf(record)]).toEqual([...samplesOf(record, 'mutation-score')]);
  });
});

describe('which half of metrics.yml wrote a record', () => {
  it('reads push as the merge half and everything else as the nightly', () => {
    // ⚠️ Borrowed from the workflow's own job conditions — `push` and
    // `!= push` — and not from the event name. A nightly fires as `schedule`
    // *or* `workflow_dispatch`, so pairing on the raw label would make a
    // hand-run nightly a third category whose delta skips the scheduled one
    // before it.
    expect(halfOf(parseRecord(merge(NOW)))).toBe('merge');
    expect(halfOf(parseRecord(nightly(NOW)))).toBe('nightly');
    expect(halfOf(parseRecord(nightly(NOW, { event: 'workflow_dispatch' })))).toBe('nightly');
  });

  it('says nothing about a record carrying no run', () => {
    expect(halfOf(parseRecord('# EOF\n'))).toBeUndefined();
  });
});

describe('the records a delta compares', () => {
  /** Newest first, which is the order every caller of these hands in. */
  const store = (...documents: string[]) => documents.map((text) => parseRecord(text));

  it('keeps only the records carrying the series asked about', () => {
    const records = store(merge(NOW), nightly(NOW - DAY), merge(NOW - 2 * DAY));

    expect(recordsCarrying(records, 'mutation-score')).toHaveLength(1);
    expect(recordsCarrying(records, 'complexity-mass')).toHaveLength(3);
  });

  it('skips a record written before the series existed', () => {
    // A pre-#202 record carries no `# TYPE stacks_trend_complexity_*` line at
    // all, so it must be skipped rather than paired as an empty previous —
    // which would print a delta against a run that measured nothing.
    const records = store(merge(NOW), merge(NOW - DAY, { complexity: undefined }));

    expect(recordsCarrying(records, 'complexity-mass')).toHaveLength(1);
  });

  it('pairs the newest carrier with the previous one of the same half', () => {
    // A nightly sits between the two merges, and a merge-to-merge delta must
    // step over it: the two halves run on different clocks, and comparing
    // across them attributes a movement to the wrong interval.
    const records = store(merge(NOW), nightly(NOW - DAY), merge(NOW - 2 * DAY));
    const { latest, previous } = deltaPair(records, 'complexity-mass');

    expect(latest === undefined ? undefined : halfOf(latest)).toBe('merge');
    expect(latest?.timestamp).toBe(NOW);
    expect(previous?.timestamp).toBe(NOW - 2 * DAY);
  });

  it('lets the newest carrier decide which half is compared', () => {
    const records = store(nightly(NOW), merge(NOW - DAY), nightly(NOW - 2 * DAY));
    const { previous } = deltaPair(records, 'complexity-mass');

    expect(previous?.timestamp).toBe(NOW - 2 * DAY);
  });

  it('offers no previous when only one record of the half carries the series', () => {
    // State 2 of four — *first run*, and not a delta of zero. Printing
    // `(+0.00)` for a run with nothing to compare against would read as a
    // measured movement.
    const { latest, previous } = deltaPair(
      store(merge(NOW), nightly(NOW - DAY)),
      'complexity-mass',
    );

    expect(latest?.timestamp).toBe(NOW);
    expect(previous).toBeUndefined();
  });

  it('refuses to pair two records whose half is unknown', () => {
    // ⚠️ Reachable, not theoretical: `emit-metrics.ts` writes
    // `event: flags.get('event') ?? 'unknown'`, so any hand-run emit produces
    // one of these. `undefined === undefined` would have paired them and drawn
    // a delta across an interval belonging to neither half — the shape
    // `renderMetrics` already refuses when it keeps an unreadable PR window
    // apart from an empty one. Found by review.
    const records = store(merge(NOW, { event: 'unknown' }), merge(NOW - DAY, { event: 'unknown' }));

    expect(halfOf(records[0] ?? parseRecord('# EOF\n'))).toBeUndefined();
    expect(deltaPair(records, 'complexity-mass')).toEqual({ latest: records[0] });
  });

  it('still pairs when the half is known on both', () => {
    // The guard above must not have closed the ordinary case with it.
    const { previous } = deltaPair(store(merge(NOW), merge(NOW - DAY)), 'complexity-mass');

    expect(previous?.timestamp).toBe(NOW - DAY);
  });

  it('offers nothing at all when no record carries the series', () => {
    // State 1 of four, and the reason the filter belongs in `recordsCarrying`:
    // the caller prints *nothing to read* off exactly this.
    expect(deltaPair(store(merge(NOW, { complexity: undefined })), 'complexity-mass')).toEqual({});
    expect(deltaPair(store(), 'complexity-mass')).toEqual({});
  });
});

describe('describing an age', () => {
  it('reads without arithmetic at every scale', () => {
    expect(describeAge(30)).toBe('30 seconds');
    expect(describeAge(3600)).toBe('1 hour');
    expect(describeAge(4 * DAY)).toBe('4 days');
  });
});
