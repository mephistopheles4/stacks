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
  describeAge,
  judgeRecord,
  newestByTrend,
  parseRecord,
  parseSamples,
  runInfoOf,
  scoresOf,
} from './metrics-read.ts';
import { renderMetrics, type RunFacts } from './metrics.ts';

const NOW = 1_787_000_000;
const SPINE = Date.parse(`${SPINE_LANDED}T00:00:00Z`) / 1000;

/** A nightly: all four series, eight scopes, the shape CI actually writes. */
function nightly(timestamp: number, overrides: Partial<RunFacts> = {}): string {
  return renderMetrics({
    timestamp,
    commit: 'a'.repeat(40),
    event: 'schedule',
    runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/1',
    expected: GATED_SERIES,
    mutationScore: [
      { scope: 'packages/core/src', score: 0.7171964140179299 },
      { scope: 'packages/cli/src', score: 0.4558 },
    ],
    gateSuiteRuntime: 10,
    mutationRunRuntime: 1275,
    liveExclusions: { live: 0, declared: 27 },
    ...overrides,
  });
}

/** A merge row: one series, which is what `push: main` legitimately writes. */
function merge(timestamp: number): string {
  return renderMetrics({
    timestamp,
    commit: 'b'.repeat(40),
    event: 'push',
    runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/2',
    expected: ['gate-suite-runtime'],
    gateSuiteRuntime: 9,
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
    const newest = newestByTrend([
      parseRecord(merge(NOW)),
      parseRecord(nightly(NOW - 2 * DAY)),
    ]);

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
    // four. A wrong number here leaves a CI series outside the bound, which is
    // the one thing that cannot be noticed by reading a green deploy.
    expect([...GATED_SERIES]).toEqual([
      'mutation-score',
      'gate-suite-runtime',
      'mutation-run-runtime',
      'live-exclusions',
    ]);
  });
});

describe('describing an age', () => {
  it('reads without arithmetic at every scale', () => {
    expect(describeAge(30)).toBe('30 seconds');
    expect(describeAge(3600)).toBe('1 hour');
    expect(describeAge(4 * DAY)).toBe('4 days');
  });
});
