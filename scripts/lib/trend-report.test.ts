/**
 * What the deploy prints, and what it says when it refuses.
 *
 * Wording is the deliverable here, not decoration: the refusal's whole job is
 * to hand a person the one move that fixes what it found, and the two moves it
 * chooses between — *sync* and *the nightly is dead* — have opposite remedies
 * behind one symptom. A message that named the wrong one is worse than a bare
 * exit code, because it sends somebody to look at CI when their own store is
 * behind.
 */

import { describe, expect, it } from 'vitest';
import { DAY, parseRecord, type ParsedRecord } from './metrics-read.ts';
import { renderMetrics, type RunFacts } from './metrics.ts';
import { empty, type Tally } from './mutation-score.ts';
import { METRICS_ACTIONS_URL, asDate, renderPanel, renderRefusal, scoredRecords } from './trend-report.ts';

const NOW = 1_787_000_000;

function record(overrides: Partial<RunFacts>): ParsedRecord {
  return parseRecord(
    renderMetrics({
      timestamp: NOW,
      commit: 'a'.repeat(40),
      event: 'schedule',
      runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/1',
      expected: ['gate-suite-runtime'],
      gateSuiteRuntime: 10,
      ...overrides,
    }),
  );
}

const scored = (timestamp: number, score: number, commit = 'a'): ParsedRecord =>
  record({
    timestamp,
    commit: commit.repeat(40),
    mutationScore: [{ scope: 'packages/core/src', score }],
  });

function panel(records: readonly ParsedRecord[], extra: Partial<Parameters<typeof renderPanel>[0]> = {}): string {
  return renderPanel({ now: NOW, records, held: records.length, window: [], ...extra }).join('\n');
}

describe('the panel', () => {
  it('names the run that produced the score, not whichever row landed last', () => {
    // `metrics.yml` writes on `push: main` too, so the newest record in a busy
    // week is a runtime and no score at all. A score never appears without its
    // run — the run has to be the one that scored.
    const text = panel([record({ timestamp: NOW, commit: 'b'.repeat(40) }), scored(NOW - DAY, 0.71)]);

    expect(text).toContain('aaaaaaaaaaaa');
    expect(text).not.toContain('bbbbbbbbbbbb');
    expect(text).toContain('71.00%');
  });

  it('prints the delta in points, signed', () => {
    const text = panel([scored(NOW, 0.7186), scored(NOW - DAY, 0.7171, 'c')]);

    expect(text).toContain('(+0.15)');
  });

  it('distinguishes an empty window from an unmeasurable one', () => {
    // An empty window beside a movement reads *tool noise* on sight; "nobody
    // could say" is not a measurement and must not read as one.
    expect(panel([scored(NOW, 0.71), scored(NOW - DAY, 0.71, 'c')], { window: [] })).toContain(
      'no pull request merged',
    );
    expect(
      panel([scored(NOW, 0.71), scored(NOW - DAY, 0.71, 'c')], { window: undefined }),
    ).toContain('not in this checkout');
  });

  it('says first run rather than inventing a movement', () => {
    expect(panel([scored(NOW, 0.71)])).toContain('first run');
    expect(panel([scored(NOW, 0.71)])).not.toContain('(+');
  });

  it('carries the per-mutant resolution beside the score', () => {
    const tally: Tally = { ...empty(), killed: 512, timeout: 3, survived: 190, noCoverage: 12 };
    const text = panel([scored(NOW, 0.71)], {
      resolution: new Map([['packages/core/src', tally]]),
    });

    expect(text).toContain('killed 512, timeout 3, survived 190, no coverage 12');
    // Killed plus timeout over total, which is what the score is — printed
    // beside the resolution so the fraction can be checked by eye.
    expect(text).toContain('515/717');
  });

  it('says the floors half has not landed rather than omitting it', () => {
    // A line that is simply absent teaches nobody that arming is coming, and
    // the print is the entire mechanism by which an unarmed scope gets armed.
    expect(panel([scored(NOW, 0.71)])).toContain('floors');
  });

  it('prints nothing at all for an empty store', () => {
    expect(renderPanel({ now: NOW, records: [], held: 0, window: [] })).toEqual([]);
  });

  it('picks out the scored records in order', () => {
    const records = [record({}), scored(NOW - DAY, 0.71), scored(NOW - 2 * DAY, 0.70, 'c')];

    expect(scoredRecords(records)).toHaveLength(2);
    expect(scoredRecords(records)[0]?.timestamp).toBe(NOW - DAY);
  });
});

describe('the refusal', () => {
  const stale = { kind: 'stale' as const, stale: [{ series: 'mutation-score', newest: NOW - 4 * DAY }] };

  it('names which series is stale and how old it is', () => {
    const text = renderRefusal(stale, NOW, { kind: 'unreachable' }, 5);

    expect(text).toContain('mutation-score');
    expect(text).toContain('4 days ago');
    expect(text).toContain(asDate(NOW - 4 * DAY));
  });

  it('sends you to the sync when the branch has rows you have not imported', () => {
    const text = renderRefusal(stale, NOW, { kind: 'newer', newer: 4 }, 5);

    expect(text).toContain('pnpm trend:sync');
    expect(text).not.toContain(METRICS_ACTIONS_URL);
  });

  it('sends you to Actions when the branch is no fresher', () => {
    // Same symptom, opposite fix. One anonymous fetch is what tells them apart,
    // and getting this backwards sends somebody to CI while their own store is
    // the thing that is behind.
    const text = renderRefusal(stale, NOW, { kind: 'same', branchNewest: '2026-08-14' }, 5);

    expect(text).toContain(METRICS_ACTIONS_URL);
    expect(text).toContain('2026-08-14');
    expect(text).not.toContain('pnpm trend:sync\n');
  });

  it('leaves the question open when the branch cannot be reached', () => {
    const text = renderRefusal(stale, NOW, { kind: 'unreachable' }, 5);

    expect(text).toContain('could not be reached');
    expect(text).toContain('stays open');
  });

  it('says a series never emitted rather than dating a sample it does not have', () => {
    const text = renderRefusal(
      { kind: 'stale', stale: [{ series: 'live-exclusions' }] },
      NOW,
      { kind: 'unreachable' },
      12,
    );

    expect(text).toContain('no sample at all in the 12 newest record(s) read');
  });

  it('says the bootstrap expired, and that it expired on a date', () => {
    const text = renderRefusal({ kind: 'never', days: 4 }, NOW, { kind: 'unreachable' }, 0);

    expect(text).toContain('no metrics record has arrived, 4 days after');
    expect(text).toContain('dead pipe');
  });

  it('states which flags clear it, which is none that publish', () => {
    // The convention landed with the previous row: a refusal says which flags
    // clear it, right where it is written.
    const text = renderRefusal(stale, NOW, { kind: 'unreachable' }, 5);

    expect(text).toContain('No flag clears this');
    expect(text).toContain('--skip-gates');
    expect(text).toContain('--check-only');
  });
});
