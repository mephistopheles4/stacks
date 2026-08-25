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
import { DAY, MERGE_EVENT, parseRecord, type ParsedRecord } from './metrics-read.ts';
import {
  COMPLEXITY_SERIES,
  renderMetrics,
  type RunFacts,
  type ScopeComplexity,
} from './metrics.ts';
import { empty, type Tally } from './mutation-score.ts';
import {
  COMPLEXITY_COUNTS,
  METRICS_ACTIONS_URL,
  asDate,
  renderComplexity,
  renderPanel,
  renderRefusal,
  scoredRecords,
} from './trend-report.ts';

const NOW = 1_787_000_000;

function record(overrides: Partial<RunFacts>): ParsedRecord {
  return parseRecord(
    renderMetrics({
      timestamp: NOW,
      commit: 'a'.repeat(40),
      event: 'schedule',
      runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/1',
      // Nobody measured a window for a record this test invented.
      prWindow: 'unknown',
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

function panel(
  records: readonly ParsedRecord[],
  extra: Partial<Parameters<typeof renderPanel>[0]> = {},
): string {
  return renderPanel({ now: NOW, records, held: records.length, window: [], ...extra }).join('\n');
}

describe('the panel', () => {
  it('names the run that produced the score, not whichever row landed last', () => {
    // `metrics.yml` writes on `push: main` too, so the newest record in a busy
    // week is a runtime and no score at all. A score never appears without its
    // run — the run has to be the one that scored.
    const text = panel([
      record({ timestamp: NOW, commit: 'b'.repeat(40) }),
      scored(NOW - DAY, 0.71),
    ]);

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

  it('shows a broken run, rather than hiding it or skipping its score', () => {
    // ⚠️ `run_ok` is derived from everything the run declared, while each family
    // is emitted on its own input — so a nightly whose suite step failed writes
    // zero health beside a full and correct set of scores. Nothing about the
    // scores looks wrong, because nothing about them is wrong. Skipping the run
    // would compute the delta against the wrong window; showing it silently
    // would print a number stripped of the context panel 1 exists to supply.
    const broken = record({
      timestamp: NOW,
      expected: ['gate-suite-runtime', 'mutation-score'],
      failed: ['gate-suite-runtime'],
      mutationScore: [{ scope: 'packages/core/src', score: 0.71 }],
    });
    const text = panel([broken]);

    expect(text).toContain('71.00%');
    expect(text).toContain('run_ok 0');
    expect(text).toContain('something else it set out to measure is missing');
  });

  it('stays silent about health when the run was healthy', () => {
    // Silence here has to mean `run_ok 1` and nothing else, or the line is a
    // decoration rather than a signal.
    expect(panel([scored(NOW, 0.71)])).not.toContain('health');
  });

  it('says so when a record does not report its health at all', () => {
    const unstated = parseRecord(
      '# TYPE stacks_trend_mutation_score gauge\n' +
        '# HELP stacks_trend_mutation_score Killed plus timeout over total.\n' +
        `stacks_trend_mutation_score{scope="packages/core/src"} 0.71 ${String(NOW)}\n# EOF\n`,
    );

    expect(panel([unstated])).toContain('does not say whether its run completed');
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
    const records = [record({}), scored(NOW - DAY, 0.71), scored(NOW - 2 * DAY, 0.7, 'c')];

    expect(scoredRecords(records)).toHaveLength(2);
    expect(scoredRecords(records)[0]?.timestamp).toBe(NOW - DAY);
  });
});

/**
 * One scope's four counts, named.
 *
 * ⚠️ **Named and not positional.** This was `[scope, 412, 1204, 321, 40]`, and
 * nothing at a call site said which number was `massOver10` and which was
 * `max` — so a case asserting on the wrong count would have read as correct.
 * `ScopeComplexity` is the shape `metrics.ts` already uses; borrowing it costs
 * four words a case and makes the fixtures say what they mean.
 */
type Counted = ScopeComplexity;

const counted = (
  timestamp: number,
  complexity: readonly Counted[],
  extra: Partial<RunFacts> = {},
): ParsedRecord => record({ timestamp, complexity, ...extra });

const CORE: Counted = {
  scope: 'packages/core/src',
  functions: 412,
  mass: 1204,
  massOver10: 321,
  max: 40,
};

/** The same scope with `mass` moved, for the cases that need a second reading. */
const core = (changes: Partial<Counted>): Counted => ({ ...CORE, ...changes });

/**
 * ⚠️ **`MERGE_EVENT`, never the literal.** A fixture hardcoding `'push'` would
 * keep building *nightly* records if the constant ever moved, while its name
 * and its assertions still claimed merge — passing, and testing the other half.
 */
const MERGE = { event: MERGE_EVENT };

/** The block under test, at the panel's own clock. */
const complexity = (records: readonly ParsedRecord[]): string[] => renderComplexity(records, NOW);

describe('the complexity block', () => {
  it('spells the same four counts the record does, in the same order', () => {
    // ⚠️ The drift guard, and the reason this block owns no second list of
    // names. `COMPLEXITY_SERIES` is derived from the emitter's own table; a
    // fifth count added there and not here would print three of four and say
    // nothing, which is the failure a reader cannot see.
    expect(COMPLEXITY_COUNTS.map(([series]) => series)).toEqual(COMPLEXITY_SERIES);
  });

  it('prints four lines per scope, one for each count', () => {
    const lines = complexity([
      counted(NOW, [
        CORE,
        { scope: 'packages/cli/src', functions: 3, mass: 9, massOver10: 0, max: 5 },
      ]),
    ]);

    expect(lines.filter((line) => line.includes('packages/core/src'))).toHaveLength(4);
    expect(lines.filter((line) => line.includes('packages/cli/src'))).toHaveLength(4);
  });

  it('carries every count and its value', () => {
    const text = complexity([counted(NOW, [CORE])]).join('\n');

    expect(text).toMatch(/functions {2,}412/);
    expect(text).toMatch(/mass {2,}1204/);
    expect(text).toMatch(/mass over 10 {2,}321/);
    expect(text).toMatch(/max {2,}40/);
  });

  it('reads a merge against the previous merge, stepping over the nightly between', () => {
    // ⚠️ The whole reason this block cannot reuse `scoredRecords`. The counts
    // land on both halves, and a merge compared against a nightly prints a
    // movement nobody made — the two halves measure the same tree at different
    // cadences, so the interval between them is not a thing anybody asked about.
    const text = complexity([
      counted(NOW, [core({ mass: 1300 })], MERGE),
      counted(NOW - DAY, [core({ functions: 999, mass: 9999, massOver10: 999, max: 99 })], {
        event: 'schedule',
      }),
      counted(NOW - 2 * DAY, [core({ functions: 410, mass: 1200 })], MERGE),
    ]).join('\n');

    expect(text).toContain('(+100)');
    expect(text).not.toContain('9999');
    expect(text).toContain('merge');
  });

  it('pairs a nightly against the previous nightly for the same reason', () => {
    const text = complexity([
      counted(NOW, [core({ mass: 1300 })], { event: 'schedule' }),
      counted(NOW - DAY, [core({ functions: 999, mass: 9999, massOver10: 999, max: 99 })], MERGE),
      counted(NOW - 2 * DAY, [core({ mass: 1250 })], { event: 'schedule' }),
    ]).join('\n');

    expect(text).toContain('(+50)');
    expect(text).toContain('nightly');
  });

  it('treats a hand-run nightly as a nightly, not as a third kind', () => {
    // `workflow_dispatch` is a real trigger on `metrics.yml`, and pairing on the
    // raw event label would step over the scheduled run before it.
    const text = complexity([
      counted(NOW, [core({ mass: 1300 })], { event: 'workflow_dispatch' }),
      counted(NOW - DAY, [core({ mass: 1250 })], { event: 'schedule' }),
    ]).join('\n');

    expect(text).toContain('(+50)');
  });

  it('names the record the counts came from, which is not the run panel 1 printed', () => {
    // ⚠️ Observed by running it. Panel 1 names the newest *scored* run and this
    // anchors on the newest *carrier* — a merge carries counts and no score, so
    // on a busy week they are two different records, and the counts would
    // otherwise appear under somebody else's commit. A count never appears
    // without its run, which is the score's rule one level down.
    const text = panel([
      counted(NOW, [CORE], { ...MERGE, commit: 'd'.repeat(40) }),
      scored(NOW - DAY, 0.71, 'e'),
    ]);

    expect(text).toContain('eeeeeeeeeeee'); // panel 1's run: the newest scored one
    expect(text).toMatch(/counted {2}dddddddddddd {2}merge/); // the counts' own
  });

  it('says first run rather than inventing a movement', () => {
    const text = complexity([counted(NOW, [CORE])]).join('\n');

    expect(text).toContain('first run');
    expect(text).not.toContain('(+');
  });

  it('says new scope for a scope the previous record did not carry', () => {
    // Three states and not two, as the block above it already learned: a scope
    // absent from the comparison is a fact about the declaration, and printing
    // a delta against nothing would read as a movement.
    const text = complexity([
      counted(NOW, [
        CORE,
        { scope: 'packages/site/src/shelf', functions: 385, mass: 900, massOver10: 210, max: 22 },
      ]),
      counted(NOW - DAY, [CORE]),
    ]).join('\n');

    expect(text).toContain('new scope');
    expect(text).toContain('(+0)');
  });

  it('prints nothing but a reason when no record carries the counts', () => {
    // The pre-#202 record, and the zero-function failure, wear one face here:
    // the families are absent either way, and absent is not zero.
    const lines = complexity([scored(NOW, 0.71)]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('no record read carries the four counts');
    expect(lines.join('\n')).not.toMatch(/\b0\b/);
  });

  it('skips a record written before the series existed rather than pairing against it', () => {
    // Membership is the `# TYPE` line, so an older record with no families is
    // not a carrier — pairing against it would read every count as brand new.
    const text = complexity([counted(NOW, [CORE]), scored(NOW - DAY, 0.71, 'c')]).join('\n');

    expect(text).toContain('first run');
  });

  it('derives no share, no ratio and no composite — it prints the counts', () => {
    // Spec §2: the record carries counts and the *page* derives shares. A
    // percentage here would be the ratio that survived neither game.
    const text = complexity([counted(NOW, [CORE]), counted(NOW - DAY, [CORE])]).join('\n');

    expect(text).not.toContain('%');
    expect(text.toLowerCase()).not.toContain('crap');
  });

  it('sits under the score and above the floors pointer in the panel', () => {
    // Panel order is a design rule here as it is on the page: the counts are
    // read against the score directly above them.
    const text = panel([
      counted(NOW, [CORE], { mutationScore: [{ scope: 'packages/core/src', score: 0.71 }] }),
    ]);

    expect(text.indexOf('71.00%')).toBeLessThan(text.indexOf('complexity'));
    expect(text.indexOf('complexity')).toBeLessThan(text.indexOf('floors'));
  });
});

describe('the refusal', () => {
  const stale = {
    kind: 'stale' as const,
    stale: [{ series: 'mutation-score', newest: NOW - 4 * DAY }],
  };

  it('names which series is stale and how old it is', () => {
    const text = renderRefusal(stale, NOW, { kind: 'unreachable' }, 5);

    expect(text).toContain('mutation-score');
    expect(text).toContain('4 days ago');
    expect(text).toContain(asDate(NOW - 4 * DAY));
  });

  it('keeps a name off its own explanation, however long the name is', () => {
    // ⚠️ Observed, not anticipated. The column was fixed at 22 and `pad`
    // returns an over-long name unchanged, so `complexity-mass-over-10` at 23
    // rendered as `complexity-mass-over-10no sample at all in the 1 newest
    // record(s) read` — in the one message a refusal is actually read from.
    const long = {
      kind: 'stale' as const,
      stale: [{ series: 'complexity-mass-over-10' }, { series: 'mutation-score' }],
    };
    const text = renderRefusal(long, NOW, { kind: 'unreachable' }, 1);

    expect(text).toContain('complexity-mass-over-10  no sample at all');
    // And the short name still lines up with the long one beside it.
    expect(text).toMatch(/^ {4}mutation-score {11}no sample at all/m);
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
    //
    // ⚠️ **It named `--skip-gates` until #152 deleted that flag.** The
    // assertion moved to the two that still exist rather than being dropped:
    // what this row is about is a refusal naming the live roster, and a
    // refusal naming a flag nobody can type is the same defect pointing the
    // other way.
    const text = renderRefusal(stale, NOW, { kind: 'unreachable' }, 5);

    expect(text).toContain('No flag clears this');
    expect(text).toContain('--dry-run');
    expect(text).toContain('--check-only');
    expect(text, 'a deleted flag must not survive in a refusal').not.toContain('--skip-gates');
  });
});
