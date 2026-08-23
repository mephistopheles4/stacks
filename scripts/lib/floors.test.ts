/**
 * The rules the mutation floor rests on, put to inputs that are broken on
 * purpose.
 *
 * ⚠️ **The gate and the deploy refusal cannot prove they detect anything.**
 * They assert that this repo's floors file agrees with this repo's tree, and an
 * implementation returning "no faults" unconditionally would satisfy both
 * forever. So every clause is planted here against synthetic inputs, and the
 * real-tree assertions are left saying one thing: the real pair is consistent.
 *
 * ⚠️ **Nothing here reads the repository**, for the reason
 * `scope-check.test.ts` states: this file runs inside Stryker's sandbox, which
 * is a *copy* of the tree, so a spec asserting on real paths would pass in
 * `pnpm test` and fail in the run that scores it.
 *
 * **Not a gate and it takes no `docs/gates.md` row** — an ordinary unit test,
 * beside the code it covers.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COGNITIVE_INVENTORY, type CognitiveInputs } from './cognitive.ts';
import { INVENTORY, MCCABE_CUT, type CounterInputs } from './complexity.ts';
import { parseRecord } from './metrics-read.ts';
import type { Scope } from './mutation-score.ts';
import {
  breaches,
  calibration,
  CAPPED_SERIES,
  capBreaches,
  capCalibration,
  countedIn,
  configHashOf,
  correspondence,
  fixtureHashOf,
  floorRefusals,
  countDisableDirectives,
  ignoredMismatches,
  nightliesIn,
  parseFloors,
  renderCapLines,
  renderFloorLines,
  readFloors,
  readMutatedSource,
  runRowsFrom,
  scoredIn,
  type CapCalibration,
  type RunRow,
} from './floors.ts';

const WELL_FORMED = {
  configHash: 'sha256:0123456789abcdef',
  fixtureHash: 'sha256:fedcba9876543210',
  scopes: {
    'packages/core/src': { floor: 71.55, armed: '2026-08-19', ignored: 0, notes: [] },
    scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [] },
  },
};

describe('parseFloors', () => {
  it('keeps `unarmed` as a value distinct from every number', () => {
    const floors = parseFloors(WELL_FORMED);

    expect(floors.configHash).toBe('sha256:0123456789abcdef');
    expect(floors.scopes.get('packages/core/src')?.floor).toBe(71.55);
    expect(floors.scopes.get('scripts')?.floor).toBe('unarmed');
  });
});

describe('correspondence', () => {
  // §7: "a newly-scored scope with no floor refuses nothing" is `coverage.all`'s
  // specimen transposed exactly — it passes in precisely the case it exists to
  // catch. So the check runs both ways.
  it('is clean when the two sides name the same scopes', () => {
    const found = correspondence(['packages/core/src', 'scripts'], parseFloors(WELL_FORMED));

    expect(found.unaccounted).toEqual([]);
    expect(found.orphans).toEqual([]);
  });

  it('reports a declared scope that no entry accounts for', () => {
    const declared = ['packages/core/src', 'scripts', 'packages/cli/src'];

    expect(correspondence(declared, parseFloors(WELL_FORMED)).unaccounted).toEqual([
      'packages/cli/src',
    ]);
  });

  it('reports an entry naming a scope nothing declares', () => {
    const found = correspondence(['packages/core/src'], parseFloors(WELL_FORMED));

    expect(found.orphans).toEqual(['scripts']);
  });
});

function scope(name: string, glob: string, exclusions: Scope['exclusions'] = []): Scope {
  return { name, glob, exclusions };
}

const SCOPES = [
  scope('packages/core/src', 'packages/core/src/*.ts'),
  scope('scripts', 'scripts/**/*.ts', [{ path: 'scripts/deploy.ts', mechanism: 'run by tsx' }]),
];

describe('countDisableDirectives', () => {
  it('attributes a disable comment to the scope whose glob claims the file', () => {
    const counted = countDisableDirectives(
      [
        { path: 'packages/core/src/library.ts', source: '// Stryker disable next-line all\nconst a = 1;\n' },
        { path: 'scripts/lib/walk.ts', source: 'const b = 2;\n' },
      ],
      SCOPES,
    );

    expect(counted.get('packages/core/src')).toBe(1);
    expect(counted.get('scripts')).toBe(0);
  });

  // The counter's own implementation sits in the `scripts` scope, and so does
  // every refusal message that talks about disable comments. A counter matching
  // the bare words would find its own prose and force `scripts` to carry a
  // number no mutant caused — so the words in a string, or in prose, are not a
  // directive.
  it('does not count the words where no comment opens', () => {
    const counted = countDisableDirectives(
      [
        {
          path: 'packages/core/src/library.ts',
          source: 'const help = "Stryker disable next-line withholds a mutant";\n',
        },
      ],
      SCOPES,
    );

    expect(counted.get('packages/core/src')).toBe(0);
  });

  it('counts a block-comment directive, and every directive in a file', () => {
    const counted = countDisableDirectives(
      [
        {
          path: 'packages/core/src/library.ts',
          source: '/* Stryker disable all */\nconst a = 1;\n// Stryker disable next-line all\nconst b = 2;\n',
        },
      ],
      SCOPES,
    );

    expect(counted.get('packages/core/src')).toBe(2);
  });

  it('sweeps neither an excluded file nor one no scope claims', () => {
    const counted = countDisableDirectives(
      [
        { path: 'scripts/deploy.ts', source: '// Stryker disable next-line all\n' },
        { path: 'docs/example.ts', source: '// Stryker disable next-line all\n' },
      ],
      SCOPES,
    );

    expect(counted.get('scripts')).toBe(0);
  });
});

describe('configHashOf', () => {
  const CONFIG = {
    mutate: ['packages/core/src/*.ts', '!**/*.test.ts'],
    timeoutMS: 120000,
    testRunner: 'vitest',
    reporters: ['progress', 'json'],
    jsonReporter: { fileName: 'artifacts/stryker/current/mutation.json' },
  };

  it('does not depend on the order the fields were written in', () => {
    const reordered = { timeoutMS: 120000, testRunner: 'vitest', mutate: CONFIG.mutate,
      jsonReporter: CONFIG.jsonReporter, reporters: CONFIG.reporters };

    expect(configHashOf(reordered)).toBe(configHashOf(CONFIG));
  });

  // §4: lowering the timeout raises the score 0.36 points with no test touched,
  // because a timeout counts as detected. This is the one that must move.
  it('moves when the timeout moves', () => {
    expect(configHashOf({ ...CONFIG, timeoutMS: 15000 })).not.toBe(configHashOf(CONFIG));
  });

  it('moves when the mutated population moves', () => {
    expect(configHashOf({ ...CONFIG, mutate: ['packages/core/src/*.ts'] })).not.toBe(
      configHashOf(CONFIG),
    );
  });

  // ⚠️ The neutral list is a list of *output* fields, and it is the only thing
  // between this hash and a refusal every time somebody adds a reporter.
  it('stands still for a field that only decides where output is written', () => {
    expect(configHashOf({ ...CONFIG, reporters: ['clear-text'] })).toBe(configHashOf(CONFIG));
    expect(configHashOf({ ...CONFIG, jsonReporter: { fileName: 'elsewhere.json' } })).toBe(
      configHashOf(CONFIG),
    );
  });

  // ⚠️ Fail-closed, and the inversion is deliberate: an unrecognised option is
  // hashed. A Stryker release adding a score-affecting option must not slip
  // past a list written before it existed — the cost of guessing wrong is a
  // loud re-derivation, and the cost of the other guess is silent.
  it('moves for an option nobody has classified', () => {
    expect(configHashOf({ ...CONFIG, ignoreStatic: true })).not.toBe(configHashOf(CONFIG));
  });
});

describe('breaches', () => {
  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:fedcba9876543210',
    scopes: {
      'packages/core/src': { floor: 71.55, armed: '2026-08-19', ignored: 0, notes: [] },
      scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [] },
    },
  });

  it('names the scope, the score, the floor and what one mutant is worth', () => {
    const found = breaches(
      [{ scope: 'packages/core/src', score: 71.39, mutants: 1250 }],
      FLOORS,
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.scope).toBe('packages/core/src');
    expect(found[0]?.score).toBe(71.39);
    expect(found[0]?.floor).toBe(71.55);
    expect(found[0]?.resolution).toBeCloseTo(0.08, 2);
  });

  it('does not refuse a score sitting exactly on its floor', () => {
    expect(breaches([{ scope: 'packages/core/src', score: 71.55, mutants: 1250 }], FLOORS)).toEqual(
      [],
    );
  });

  // §10: nothing ends the disarmed period, and an unarmed scope refuses
  // nothing. That is the state this whole rollout ships in.
  it('never refuses an unarmed scope, whatever it scored', () => {
    expect(breaches([{ scope: 'scripts', score: 3.1, mutants: 400 }], FLOORS)).toEqual([]);
  });

  // A scope with no reading is not a scope that passed. Whether the record is
  // fresh enough to read at all is `metrics-freshness`'s refusal, not this one,
  // and answering it twice would be two implementations of one question.
  it('refuses nothing on a scope the record carries no score for', () => {
    expect(breaches([{ scope: 'packages/core/src', score: null }], FLOORS)).toEqual([]);
  });

  it('reports the breach without a resolution when no mutant count is known', () => {
    const found = breaches([{ scope: 'packages/core/src', score: 60 }], FLOORS);

    expect(found).toHaveLength(1);
    expect(found[0]?.resolution).toBeUndefined();
  });
});

describe('calibration', () => {
  const DAY = 86_400;
  const HASH = 'sha256:0123456789abcdef';

  /** `count` nightly runs one day apart, newest last, all healthy. */
  function nightlies(count: number, score = 70): RunRow[] {
    return [...Array(count).keys()].map((index) => ({
      timestamp: 1_760_000_000 + index * DAY,
      ok: true,
      event: 'schedule',
      configHash: HASH,
      scores: new Map([['packages/core/src', score]]),
      counts: new Map(),
    }));
  }

  it('counts consecutive healthy runs and calls a full window full', () => {
    const window = calibration(nightlies(20), ['packages/core/src'], HASH);

    expect(window.runs).toBe(20);
    expect(window.full).toBe(true);
    expect(window.days).toBe(19);
  });

  it('is not full one run short', () => {
    expect(calibration(nightlies(19), ['packages/core/src'], HASH).full).toBe(false);
  });

  // §12's plant, and §10's warning: a crashed run writes `run_ok 0` **plus a
  // partial score**, and *lowest observed* is the rule one bad row destroys
  // forever. So a failure ends the streak rather than being skipped over — the
  // reading that cannot silently slacken a floor.
  it('is not satisfied by twenty rows of which one failed', () => {
    const rows = nightlies(21);
    const broken = rows[15];
    if (broken !== undefined) {
      broken.ok = false;
      broken.scores = new Map([['packages/core/src', 12]]);
    }

    const window = calibration(rows, ['packages/core/src'], HASH);

    expect(window.runs).toBe(5);
    expect(window.full).toBe(false);
    expect(window.lowest.get('packages/core/src')).not.toBe(12);
  });

  // "The 3-day gap clause is what makes *consecutive* mean something on a
  // nightly cadence."
  it('ends the streak at a gap longer than three days', () => {
    // The nightly stopped for five days and then resumed: everything older
    // than the outage moves back, so the gap sits between run 10 and run 11.
    const rows = nightlies(20);
    for (const row of rows.slice(0, 10)) row.timestamp -= 4 * DAY;

    expect(calibration(rows, ['packages/core/src'], HASH).runs).toBe(10);
  });

  // ⚠️ A row scored under a different configuration is not a row about this
  // floor. Counting it would re-open the `timeoutMS` route the hash closes.
  it('ends the streak at a row scored under another configuration', () => {
    const rows = nightlies(20);
    const other = rows[12];
    if (other !== undefined) other.configHash = 'sha256:something-else';

    expect(calibration(rows, ['packages/core/src'], HASH).runs).toBe(7);
  });

  // ⚠️ **`metrics.yml` has two halves and only one of them scores.** The merge
  // half runs `if: github.event_name == 'push'` and emits `gate-suite-runtime`
  // alone; the nightly half runs `if: github.event_name != 'push'` and emits the
  // whole record. A merge record is not a mutation run, so it must neither
  // count toward the window nor break it — counting it would leave every scope
  // with a hole and unarmable forever, and breaking on it would reset the
  // window on every push to main.
  it('neither counts nor breaks on the merge half, which scores nothing', () => {
    const rows = nightlies(20);
    rows.push({
      timestamp: 1_760_000_000 + 20 * DAY,
      ok: true,
      event: 'push',
      configHash: HASH,
      scores: new Map(),
      counts: new Map(),
    });

    const window = calibration(rows, ['packages/core/src'], HASH);

    expect(window.runs).toBe(20);
    expect(window.lowest.get('packages/core/src')).toBe(70);
  });

  // ⚠️ **Zero runs counted and zero runs present are different, and a print
  // that could not tell them apart would be read as "the nightly is dead" on a
  // machine holding a full store of runs that simply predate the stamp.**
  it('counts the nightlies it considered, whether or not any qualified', () => {
    const rows = nightlies(11).map((row) => ({ ...row, configHash: undefined }));

    const window = calibration(rows, ['packages/core/src'], HASH);

    expect(window.runs).toBe(0);
    expect(window.candidates).toBe(11);
  });

  it('does not count the merge half among the nightlies it considered', () => {
    const rows = nightlies(3);
    rows.push({
      timestamp: 1_760_000_000 + 9 * DAY,
      ok: true,
      event: 'push',
      configHash: HASH,
      scores: new Map(),
      counts: new Map(),
    });

    expect(calibration(rows, ['packages/core/src'], HASH).candidates).toBe(3);
  });

  it('takes each scope its lowest score across the window', () => {
    const rows = nightlies(20);
    const dip = rows[7];
    if (dip !== undefined) dip.scores = new Map([['packages/core/src', 66.12]]);

    expect(calibration(rows, ['packages/core/src'], HASH).lowest.get('packages/core/src')).toBe(
      66.12,
    );
  });

  // A hole is not a low. A scope with no sample in one window row has no
  // observed history across that window, so it has nothing to derive from.
  it('gives no lowest to a scope missing a sample anywhere in the window', () => {
    const rows = nightlies(20);
    const hole = rows[3];
    if (hole !== undefined) hole.scores = new Map();

    expect(calibration(rows, ['packages/core/src'], HASH).lowest.get('packages/core/src')).toBeNull();
  });
});

describe('ignoredMismatches', () => {
  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:fedcba9876543210',
    scopes: {
      'packages/core/src': { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [] },
      scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 2, notes: [] },
    },
  });

  it('is silent when every counter matches the sweep', () => {
    const counted = new Map([['packages/core/src', 0], ['scripts', 2]]);

    expect(ignoredMismatches(counted, FLOORS)).toEqual([]);
  });

  // §12: a disable comment lands and the counter stays at 0. This is the
  // direction the row exists for — it catches the comment at merge instead of
  // at deploy, which matters because the gate suite and CodeQL are the only two
  // things in this repo that can stop a merge.
  it('reports a directive the file does not account for', () => {
    const counted = new Map([['packages/core/src', 1], ['scripts', 2]]);
    const found = ignoredMismatches(counted, FLOORS);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ scope: 'packages/core/src', swept: 1, recorded: 0 });
  });

  // §12, reverse: the counter is raised with no comment in the source. A
  // one-way check would let the file drift away from the tree in the direction
  // that never fires.
  // ⚠️ **A scope the floors file does not name at all.** Deploy refuses on the
  // missing entry, but that is a deploy and this row exists to catch a
  // directive at merge. Iterating only the entries would let a directive land
  // green in any scope somebody forgot to account for — the gate silent in
  // precisely the case the file is already wrong.
  it('reports a directive in a declared scope the floors file does not name', () => {
    const counted = new Map([['packages/core/src', 0], ['scripts', 2], ['packages/new', 1]]);
    const found = ignoredMismatches(counted, FLOORS);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ scope: 'packages/new', swept: 1 });
  });

  it('says nothing about a scope with no entry and no directive', () => {
    const counted = new Map([['packages/core/src', 0], ['scripts', 2], ['packages/new', 0]]);

    expect(ignoredMismatches(counted, FLOORS)).toEqual([]);
  });

  it('reports a counter the tree does not account for', () => {
    const counted = new Map([['packages/core/src', 0], ['scripts', 0]]);
    const found = ignoredMismatches(counted, FLOORS);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ scope: 'scripts', swept: 0, recorded: 2 });
  });
});

describe('renderFloorLines', () => {
  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:fedcba9876543210',
    scopes: {
      'packages/core/src': { floor: 71.55, armed: '2026-08-19', ignored: 0, notes: [] },
      'packages/cli/src': { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [] },
      scripts: { floor: 'unarmed', armed: '2026-05-11', ignored: 0, notes: [] },
    },
  });

  /** The line for one scope — the block carries one per declared scope. */
  function lineFor(scope: string, lines: readonly string[]): string {
    const found = lines.find((line) => line.startsWith(scope));
    expect(found, `no print line for ${scope}`).toBeDefined();
    return found ?? '';
  }

  // ⚠️ Every number in the spec's example block is illustrative and none is
  // measured — an earlier draft armed a scope at the directory rollup's score
  // and gave another a window low 26 points off its measured value. The shape
  // comes from the spec; the numbers come from the record.
  it('gives an armed scope its score, its delta and what one mutant is worth', () => {
    const line = lineFor('packages/core/src', renderFloorLines({
      floors: FLOORS,
      readings: [{ scope: 'packages/core/src', score: 71.7, previous: 71.55, mutants: 1250 }],
      window: { runs: 20, candidates: 20, full: true, days: 19, lowest: new Map() },
      today: '2026-08-19',
    }));

    expect(line).toContain('packages/core/src');
    expect(line).toContain('armed 71.55');
    expect(line).toContain('current 71.70');
    expect(line).toContain('(+0.15)');
    expect(line).toContain('1 mutant = 0.08');
  });

  // "window full (20 runs), lowest 44.12 - armable" — the print is the whole
  // mechanism that ends the disarmed period, so a full window has to say so.
  it('tells an unarmed scope with a full window what it would arm at', () => {
    const line = lineFor('packages/cli/src', renderFloorLines({
      floors: FLOORS,
      readings: [{ scope: 'packages/cli/src', score: 45.6, mutants: 68 }],
      window: { runs: 20, candidates: 20, full: true, days: 21, lowest: new Map([['packages/cli/src', 44.12]]) },
      today: '2026-08-19',
    }));

    expect(line).toContain('unarmed');
    expect(line).toContain('window full (20 runs)');
    expect(line).toContain('lowest 44.12');
    expect(line).toContain('armable');
    // ⚠️ The date is §7's only guard on somebody typing `unarmed` to make a
    // refusal go away, and a full window is exactly when that temptation
    // arrives — so this is the last line that should drop it.
    expect(line).toContain('unarmed for');
  });

  // `12/20 runs` beside the day count is deliberate: 41 days and 12 runs says
  // the nightly has been skipping, which is the 60-day scheduled-workflow rule
  // showing itself before it bites.
  it('counts the window in runs, with the day count beside it', () => {
    const line = lineFor('scripts', renderFloorLines({
      floors: FLOORS,
      readings: [{ scope: 'scripts', score: null }],
      window: { runs: 12, candidates: 12, full: false, days: 41, lowest: new Map([['scripts', null]]) },
      today: '2026-08-19',
    }));

    expect(line).toContain('12/20 runs');
    expect(line).toContain('41 days');
    expect(line).not.toContain('armable');
  });

  // The only guard on somebody typing `unarmed` to make a refusal go away: an
  // entry reading `unarmed for 100 days` is legible in a way a mechanism would
  // only duplicate.
  it('says once, above the table, that no window has started', () => {
    const lines = renderFloorLines({
      floors: FLOORS,
      readings: [{ scope: 'scripts', score: null }],
      window: { runs: 0, candidates: 0, full: false, days: 0, lowest: new Map() },
      today: '2026-08-19',
    });

    expect(lines[0]).toContain('no nightly in the record yet');
    // One note, not one per scope: the window is a fact about the record.
    expect(lines.filter((line) => line.includes('no nightly'))).toHaveLength(1);
  });

  it('says how long an entry has sat unarmed', () => {
    const line = lineFor('scripts', renderFloorLines({
      floors: FLOORS,
      readings: [{ scope: 'scripts', score: null }],
      window: { runs: 0, candidates: 0, full: false, days: 0, lowest: new Map() },
      today: '2026-08-19',
    }));

    expect(line).toContain('unarmed for 100 days');
  });
});

describe('floorRefusals', () => {
  // Both capped series, unarmed — the state the whole rollout ships in, and the
  // one that leaves these floor-side clauses readable on their own. Without it
  // every case below would refuse for a cap reason before reaching its subject.
  const CAPS = {
    'complexity-max': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
    'complexity-mass-over-10': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
  };

  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:fedcba9876543210',
    scopes: {
      'packages/core/src': {
        floor: 71.55,
        armed: '2026-08-19',
        ignored: 0,
        notes: [],
        caps: CAPS,
      },
      scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [], caps: CAPS },
    },
  });

  const CLEAN = {
    floors: FLOORS,
    declared: ['packages/core/src', 'scripts'],
    run: { configHash: 'sha256:0123456789abcdef' },
    readings: [
      { scope: 'packages/core/src', score: 72.1, mutants: 1250 },
      { scope: 'scripts', score: 53.7, mutants: 900 },
    ],
  };

  it('refuses nothing when every scope is accounted for and over its floor', () => {
    expect(floorRefusals(CLEAN)).toEqual([]);
  });

  it('names the scope, the score, the floor and the per-mutant resolution', () => {
    const [refusal] = floorRefusals({
      ...CLEAN,
      readings: [{ scope: 'packages/core/src', score: 71.39, mutants: 1250 }],
    });

    expect(refusal).toContain('packages/core/src');
    expect(refusal).toContain('71.39');
    expect(refusal).toContain('71.55');
    expect(refusal).toContain('0.08');
  });

  // §7, forward: a newly-scored scope with no floor refuses nothing — vacuous
  // green walking in the front door. It is the direction that looks unnecessary
  // and is the one the check exists for.
  it('refuses a declared scope no entry accounts for', () => {
    const [refusal] = floorRefusals({ ...CLEAN, declared: [...CLEAN.declared, 'packages/new'] });

    expect(refusal).toContain('packages/new');
    expect(refusal?.toLowerCase()).toContain('unaccounted');
  });

  it('refuses an entry naming a scope nothing declares', () => {
    const [refusal] = floorRefusals({ ...CLEAN, declared: ['packages/core/src'] });

    expect(refusal).toContain('scripts');
    expect(refusal?.toLowerCase()).toContain('orphan');
  });

  // The route `timeoutMS` takes: lowering it raises the score with no test
  // touched, so a run scored under another configuration is not a number about
  // these floors at all.
  it('refuses a run scored under a different configuration', () => {
    const [refusal] = floorRefusals({ ...CLEAN, run: { configHash: 'sha256:elsewhere' } });

    expect(refusal).toContain('derived under a different configuration');
    expect(refusal).toContain('re-derive');
  });

  // ⚠️ Deploy is about to carry two metric refusals, and one blanket override
  // reached for to clear a dead pipe would silently clear the floor as well.
  // Every refusal says so where it is written — the convention `scripts/deploy.ts`
  // adopted, and the one thing every message here must not get wrong.
  it('says on every refusal that no flag clears it', () => {
    const all = [
      ...floorRefusals({ ...CLEAN, readings: [{ scope: 'packages/core/src', score: 1 }] }),
      ...floorRefusals({ ...CLEAN, declared: [...CLEAN.declared, 'packages/new'] }),
      ...floorRefusals({ ...CLEAN, declared: ['packages/core/src'] }),
      ...floorRefusals({ ...CLEAN, run: { configHash: 'sha256:elsewhere' } }),
    ];

    expect(all).toHaveLength(4);
    for (const refusal of all) expect(refusal).toContain('No flag clears this');
  });

  // ⚠️ **Two different absences, and collapsing them would refuse on a machine
  // that has simply never synced.** A record carrying no hash is a row from
  // before the stamp existed, and it refuses — nothing can vouch for what it
  // was scored under. *No record at all* is not that: it is the bootstrap case,
  // and what to do about an empty or stale record belongs to the freshness
  // refusal beside this one, which is the only check that can tell "you have
  // not synced" from "CI stopped writing".
  it('refuses nothing on the hash when the record holds no run at all', () => {
    expect(floorRefusals({ ...CLEAN, run: undefined, readings: [] })).toEqual([]);
  });

  it('still refuses an unaccounted scope with no record at all', () => {
    const refusals = floorRefusals({
      ...CLEAN,
      run: undefined,
      readings: [],
      declared: [...CLEAN.declared, 'packages/new'],
    });

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('packages/new');
  });

  // ⚠️ **The hash guard protects a comparison, so where nothing is armed there
  // is nothing for it to protect.** Every record written before the stamp
  // existed carries no hash, and refusing on those would make the very first
  // deploy after this lands refuse — teaching whoever hit it how to get past
  // the new machinery, which is the precise habit the no-override decision
  // exists to prevent. It is not a weakening: with every floor unarmed no score
  // is compared to anything, and the calibration window already refuses to
  // *derive* a floor from an unstamped run.
  it('does not refuse an unstamped row while every scope is unarmed', () => {
    const unarmed = parseFloors({
      configHash: 'sha256:0123456789abcdef',
      fixtureHash: 'sha256:fedcba9876543210',
      scopes: {
        'packages/core/src': {
          floor: 'unarmed',
          armed: '2026-08-19',
          ignored: 0,
          notes: [],
          caps: CAPS,
        },
        scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [], caps: CAPS },
      },
    });

    expect(floorRefusals({ ...CLEAN, floors: unarmed, run: {}, readings: [] })).toEqual([]);
  });

  // ⚠️ **A record carrying a *different* hash refuses whatever is armed**, and
  // that is the spec's own plant: *lower `timeoutMS` without re-deriving →
  // refuses*. Somebody changed the scoring configuration, which is route 2 down,
  // and it is evidence of that whether or not a floor happens to be armed yet.
  it('refuses a run whose hash differs, even with every scope unarmed', () => {
    const unarmed = parseFloors({
      configHash: 'sha256:0123456789abcdef',
      fixtureHash: 'sha256:fedcba9876543210',
      scopes: {
        'packages/core/src': {
          floor: 'unarmed',
          armed: '2026-08-19',
          ignored: 0,
          notes: [],
          caps: CAPS,
        },
        scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [], caps: CAPS },
      },
    });
    const [refusal] = floorRefusals({
      ...CLEAN,
      floors: unarmed,
      run: { configHash: 'sha256:elsewhere' },
      readings: [],
    });

    expect(refusal).toContain('different configuration');
  });

  it('refuses an unstamped row as soon as one scope is armed', () => {
    const armed = parseFloors({
      configHash: 'sha256:0123456789abcdef',
      fixtureHash: 'sha256:fedcba9876543210',
      scopes: {
        'packages/core/src': {
          floor: 71.55,
          armed: '2026-08-19',
          ignored: 0,
          notes: [],
          caps: CAPS,
        },
      },
    });
    const [refusal] = floorRefusals({
      floors: armed,
      declared: ['packages/core/src'],
      run: {},
      readings: [],
    });

    expect(refusal).toContain('different configuration');
    expect(refusal).toContain('before the stamp existed');
  });

  // A hash mismatch means every score in the record is about another
  // configuration, so comparing one against a floor is the thing the hash
  // exists to prevent. It refuses on its own rather than beside a breach it
  // cannot vouch for.
  it('does not also report a breach it cannot vouch for', () => {
    const refusals = floorRefusals({
      ...CLEAN,
      run: { configHash: 'sha256:elsewhere' },
      readings: [{ scope: 'packages/core/src', score: 1, mutants: 1250 }],
    });

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('different configuration');
  });
});

describe('runRowsFrom', () => {
  function ci(timestamp: number, ok: number, hash: string, score?: number, event = 'schedule'): string {
    return [
      '# TYPE stacks_run_ok gauge',
      `stacks_run_ok ${String(ok)} ${String(timestamp)}`,
      '# TYPE stacks_run_info gauge',
      `stacks_run_info{commit="abc",event="${event}",run_url="u",config_hash="${hash}"} 1 ${String(timestamp)}`,
      ...(score === undefined
        ? []
        : [
            '# TYPE stacks_trend_mutation_score gauge',
            `stacks_trend_mutation_score{scope="packages/core/src"} ${String(score)} ${String(timestamp)}`,
          ]),
      '# EOF',
      '',
    ].join('\n');
  }

  it('reads a run as its health, its configuration and its per-scope scores', () => {
    const [row] = runRowsFrom([parseRecord(ci(1_760_000_000, 1, 'sha256:abc', 0.7155))]);

    expect(row?.timestamp).toBe(1_760_000_000);
    expect(row?.ok).toBe(true);
    expect(row?.configHash).toBe('sha256:abc');
    // ⚠️ The record stores a fraction and everything downstream is a
    // percentage. The conversion happens here, once, where the record is read.
    expect(row?.scores.get('packages/core/src')).toBeCloseTo(71.55, 6);
  });

  it('reads a crashed run as unhealthy rather than dropping it', () => {
    const [row] = runRowsFrom([parseRecord(ci(1_760_000_000, 0, 'sha256:abc', 0.12))]);

    expect(row?.ok).toBe(false);
    expect(row?.scores.get('packages/core/src')).toBeCloseTo(12, 6);
  });

  it('leaves a row written before the stamp existed with no hash', () => {
    const document = ci(1_760_000_000, 1, 'sha256:abc', 0.7).replace(
      ',config_hash="sha256:abc"',
      '',
    );

    expect(runRowsFrom([parseRecord(document)])[0]?.configHash).toBeUndefined();
  });

  // ⚠️ The calibration window is CI-only, by rule: a floor derived on one
  // machine and compared against another is a two-machine comparison wearing
  // one config hash, and the hash cannot catch it because the configuration is
  // identical. Surface D's rows are written locally by `pnpm trend:sync` and
  // carry `surface="edge"` for exactly this reason.
  it('does not read a local edge probe as a CI run', () => {
    const probe = [
      '# TYPE stacks_run_ok gauge',
      'stacks_run_ok{surface="edge"} 1 1760000000',
      '# TYPE stacks_edge_info gauge',
      'stacks_edge_info{origin="https://example.invalid",outcome="current"} 1 1760000000',
      '# EOF',
      '',
    ].join('\n');

    expect(runRowsFrom([parseRecord(probe)])).toEqual([]);
  });

  // ⚠️ A sample's timestamp is optional in the parser's own type, and a run
  // that cannot be dated cannot be placed in a window at all. Dropping it is
  // the honest move: defaulting to 0 would put the run in 1970 and silently
  // open a gap of twenty thousand days in the middle of the streak.
  it('drops a run whose health sample carries no timestamp', () => {
    const undated = [
      '# TYPE stacks_run_ok gauge',
      'stacks_run_ok 1',
      '# EOF',
      '',
    ].join('\n');

    expect(runRowsFrom([parseRecord(undated)])).toEqual([]);
  });

  it('carries the event, which is what tells a nightly from a merge', () => {
    const [row] = runRowsFrom([parseRecord(ci(1_760_000_000, 1, 'sha256:abc', undefined, 'push'))]);

    expect(row?.event).toBe('push');
  });

  it('returns the runs oldest first, whatever order the records arrived in', () => {
    const rows = runRowsFrom([
      parseRecord(ci(1_760_000_200, 1, 'sha256:abc', 0.7)),
      parseRecord(ci(1_760_000_100, 1, 'sha256:abc', 0.7)),
    ]);

    expect(rows.map((row) => row.timestamp)).toEqual([1_760_000_100, 1_760_000_200]);
  });
});

// ⚠️ **A temp directory it is handed, never the repository.** `sourceFiles` in
// `scope-check.test.ts` is exercised the same way and for the same reason: the
// edge functions take their root as a parameter, so they can have an in-process
// oracle without this spec knowing which tree it is running inside. Without one
// these lines sit in the mutation denominator contributing nothing but weight —
// which is exactly how `scripts` fell six points at the commit that moved the
// scoring arithmetic into a file no spec imported.
describe('the disk edge, against a tree it is handed', () => {
  function tree(): string {
    const root = mkdtempSync(join(tmpdir(), 'stacks-floors-'));
    mkdirSync(join(root, 'packages', 'core', 'src'), { recursive: true });
    writeFileSync(
      join(root, 'stryker.floors.json'),
      JSON.stringify({
        configHash: 'sha256:written',
        fixtureHash: 'sha256:counted',
        scopes: { 'packages/core/src': { floor: 70, armed: '2026-08-19', ignored: 1, notes: ['x'] } },
      }),
      'utf8',
    );
    writeFileSync(
      join(root, 'packages', 'core', 'src', 'library.ts'),
      '// Stryker disable next-line all\nexport const a = 1;\n',
      'utf8',
    );
    writeFileSync(
      join(root, 'packages', 'core', 'src', 'library.test.ts'),
      '// Stryker disable next-line all\n',
      'utf8',
    );
    return root;
  }

  it('reads the floors document from the root it is given', () => {
    const floors = readFloors(tree());

    expect(floors.configHash).toBe('sha256:written');
    expect(floors.scopes.get('packages/core/src')?.ignored).toBe(1);
  });

  // A test file is negated out of Stryker's `mutate`, so a directive in one
  // withholds nothing and must not be counted. It is also what makes the
  // fixtures in this very file safe to write literally.
  it('sweeps source and not specs', () => {
    const files = readMutatedSource(tree()).map((file) => file.path);

    expect(files).toContain('packages/core/src/library.ts');
    expect(files).not.toContain('packages/core/src/library.test.ts');
  });

  it('carries each swept file its text, so the counter has something to count', () => {
    const swept = readMutatedSource(tree());
    const counted = countDisableDirectives(swept, [
      scope('packages/core/src', 'packages/core/src/*.ts'),
    ]);

    expect(counted.get('packages/core/src')).toBe(1);
  });
});

describe('nightliesIn', () => {
  const DAY = 86_400;

  function row(timestamp: number, event: string, scores: Map<string, number>): RunRow {
    return { timestamp, ok: true, event, configHash: 'sha256:abc', scores, counts: new Map() };
  }

  // ⚠️ **The bug this exists to stop: reading the newest *record* rather than
  // the newest *run that scored*.** `metrics.yml` writes on every push to main,
  // and a merge record carries no per-scope score — so on a busy week the newest
  // record is a merge, every armed scope reads "no score in the record", and the
  // floor refuses nothing at exactly the moment somebody is deploying. A floor
  // that is silent whenever the last thing to happen was a merge is vacuous.
  it('skips a merge record newer than the last nightly', () => {
    const scored = new Map([['packages/core/src', 60]]);
    const rows = [
      row(1_760_000_000, 'schedule', scored),
      row(1_760_000_000 + DAY, 'push', new Map()),
    ];

    const found = nightliesIn(rows);

    expect(found).toHaveLength(1);
    expect(found.at(-1)?.scores.get('packages/core/src')).toBe(60);
  });

  it('keeps a dispatched run, which is the nightly half run by hand', () => {
    const rows = [row(1_760_000_000, 'workflow_dispatch', new Map([['scripts', 50]]))];

    expect(nightliesIn(rows)).toHaveLength(1);
  });

  it('is empty when every record is a merge', () => {
    expect(nightliesIn([row(1_760_000_000, 'push', new Map())])).toEqual([]);
  });
});

describe('scoredIn', () => {
  const DAY = 86_400;

  function row(timestamp: number, event: string, scores: Map<string, number>, ok = true): RunRow {
    return { timestamp, ok, event, configHash: 'sha256:abc', scores, counts: new Map() };
  }

  // ⚠️ **Two filters, two questions, and they must not be collapsed.** The
  // window needs `nightliesIn`, because a crashed nightly wrote `run_ok 0` plus
  // a partial score and has to *break* the streak. The floor comparison needs
  // this one, because a crashed run measured nothing — reading it as the newest
  // run leaves every scope with a null score and the floor silent, which is the
  // vacuity the whole piece is arranged against.
  it('skips a crashed nightly that carries no score', () => {
    const rows = [
      row(1_760_000_000, 'schedule', new Map([['packages/core/src', 60]])),
      row(1_760_000_000 + DAY, 'schedule', new Map(), false),
    ];

    expect(scoredIn(rows).at(-1)?.scores.get('packages/core/src')).toBe(60);
  });

  // The trend panel beside this block picks its subject the same way. Two
  // blocks in one deploy's output showing different scores for one scope would
  // be a defect in whichever of them a reader happened to believe.
  it('skips a merge record, because it carries no score', () => {
    const rows = [
      row(1_760_000_000, 'schedule', new Map([['scripts', 50]])),
      row(1_760_000_000 + DAY, 'push', new Map()),
    ];

    expect(scoredIn(rows)).toHaveLength(1);
  });

  // ⚠️ **`run_ok 0` and *no scores* are not the same thing, and the record can
  // carry both at once.** `renderMetrics` derives `run_ok` from *did every
  // declared series compute*, and emits each family independently — so a nightly
  // whose `pnpm test` step failed writes `run_ok 0` **with a full set of mutation
  // scores**. The spec calls a failed run's score partial and the calibration
  // window refuses to derive a floor from one; comparing against a number the
  // window would not accept is the wrong asymmetry, because it can refuse a
  // publish on a score that could never have set the floor it breached.
  it('skips a failed run even when it carries a full set of scores', () => {
    const rows = [
      row(1_760_000_000, 'schedule', new Map([['scripts', 50]])),
      row(1_760_000_000 + DAY, 'schedule', new Map([['scripts', 12]]), false),
    ];

    expect(scoredIn(rows)).toHaveLength(1);
    expect(scoredIn(rows).at(-1)?.scores.get('scripts')).toBe(50);
  });

  // ⚠️ **The test is scores-are-scores, never the event**, and this is the plant
  // for why. `trend-layer.md` §2 names on-merge scoring as a deferred move. The
  // day it lands a push record carries scores — and an event filter here would
  // skip it while the trend panel beside this block takes it as its subject, so
  // **one deploy would print two different scores for one scope.** It would
  // arrive as an edit to a workflow file, with nothing in either module changed
  // and nothing red.
  it('takes a merge record that does carry a score, for the day on-merge lands', () => {
    const rows = [
      row(1_760_000_000, 'schedule', new Map([['scripts', 50]])),
      row(1_760_000_000 + DAY, 'push', new Map([['scripts', 49]])),
    ];

    expect(scoredIn(rows).at(-1)?.scores.get('scripts')).toBe(49);
  });
});

describe('countDisableDirectives — the spellings a comment can take', () => {
  // ⚠️ **A check that reads one spelling of something the format lets you write
  // several ways is a hole**, and this row's neighbour found three of that
  // species in one branch. Stryker parses *comment nodes*, so the opener is
  // stripped before its own matcher runs and every one of these reaches it as
  // the same directive — while a matcher anchored on `// ` sees only the first.
  const forms: Record<string, string> = {
    'line comment': '// Stryker disable next-line all\n',
    'no space after the opener': '//Stryker disable next-line all\n',
    'block comment': '/* Stryker disable next-line all */\n',
    'jsdoc opener': '/** Stryker disable next-line all */\n',
    'continuation line': '/*\n * Stryker disable next-line all\n */\n',
    'a named mutator rather than all': '// Stryker disable next-line ArithmeticOperator\n',
    'a trailing reason': '// Stryker disable next-line all: the survivor is unreachable\n',
    'extra internal whitespace': '//   Stryker   disable   next-line all\n',
    'a plain disable, not next-line': '// Stryker disable all\n',
  };

  for (const [name, source] of Object.entries(forms)) {
    it(`counts the ${name}`, () => {
      const counted = countDisableDirectives(
        [{ path: 'packages/core/src/library.ts', source }],
        SCOPES,
      );

      expect(counted.get('packages/core/src')).toBe(1);
    });
  }

  // The over-matching direction is the safe one and the under-matching one is
  // not: a directive this misses is a mutant withheld with the gate green,
  // while a false positive is a red build somebody investigates. But the words
  // outside a comment still must not count, or this module's own prose would.
  it('still refuses to count the words where no comment opens', () => {
    const counted = countDisableDirectives(
      [{ path: 'packages/core/src/library.ts', source: 'const s = "Stryker disable all";\n' }],
      SCOPES,
    );

    expect(counted.get('packages/core/src')).toBe(0);
  });
});

describe('fixtureHashOf', () => {
  /** One variant of the cyclomatic counter's inputs. Cast once, so no test repeats it. */
  function inputs(changes: Record<string, unknown> = {}): CounterInputs {
    return {
      eslintVersion: '10.9.0',
      parserVersion: '8.67.0',
      ruleOptions: [{ max: 0, variant: 'classic' }],
      inventory: INVENTORY,
      ...changes,
    };
  }

  /** One variant of the *cognitive* counter's inputs, likewise. */
  function cognitive(changes: Record<string, unknown> = {}): CognitiveInputs {
    return {
      sonarjsVersion: '4.2.0',
      ruleOptions: [0],
      inventory: COGNITIVE_INVENTORY,
      ...changes,
    } as CognitiveInputs;
  }

  /** The stamp both counters produce together, which is the only stamp there is. */
  function hash(one: CounterInputs = inputs(), other: CognitiveInputs = cognitive()): string {
    return fixtureHashOf(one, other);
  }

  it('is a sha256, spelled the way configHashOf spells one', () => {
    expect(hash()).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is stable across key order inside the rule options', () => {
    expect(hash(inputs({ ruleOptions: [{ variant: 'classic', max: 0 }] }))).toBe(hash());
  });

  it('changes when any of the three installed versions changes', () => {
    // ⚠️ Three, not two. The plugin version is an input because the cognitive
    // counts are its rule's output — and it is folded into *this* hash rather
    // than a second one, per #234 §2, which is what makes a plugin upgrade
    // refuse the cyclomatic caps as well.
    expect(hash(inputs({ eslintVersion: '10.9.1' }))).not.toBe(hash());
    expect(hash(inputs({ parserVersion: '8.68.0' }))).not.toBe(hash());
    expect(hash(inputs(), cognitive({ sonarjsVersion: '4.3.0' }))).not.toBe(hash());
  });

  // ⚠️ The versions are hashed at fixed positions rather than into one bag.
  // Swapping their values is the cheapest proof of that: a hash over a set would
  // not notice, and `8.67.0` of ESLint is not `10.9.0` of ESLint.
  it('hashes the versions positionally, not as a set', () => {
    expect(hash(inputs({ eslintVersion: '8.67.0', parserVersion: '10.9.0' }))).not.toBe(hash());
  });

  it('changes when either rule is configured differently', () => {
    expect(hash(inputs({ ruleOptions: [{ max: 5, variant: 'classic' }] }))).not.toBe(hash());
    // ESLint's defaults are `max: 20`, so no options at all is a different rule
    // and reads as one rather than as an absence.
    expect(hash(inputs({ ruleOptions: [] }))).not.toBe(hash());
  });

  it('changes when the cognitive threshold moves', () => {
    // ⚠️ The threshold is count-affecting where severity is not: raise it and
    // every function scoring at or below it vanishes from the report while
    // staying in the denominator, so `cognitive-mass` collapses with no code
    // changed. That is why it is hashed and severity is not.
    expect(hash(inputs(), cognitive({ ruleOptions: [15] }))).not.toBe(hash());
    expect(hash(inputs(), cognitive({ ruleOptions: [] }))).not.toBe(hash());
  });

  it('changes when either fixture expects a different total', () => {
    expect(
      hash(inputs({ inventory: { ...INVENTORY, counts: { ...INVENTORY.counts, mass: 69 } } })),
    ).not.toBe(hash());

    expect(
      hash(
        inputs(),
        cognitive({
          inventory: {
            ...COGNITIVE_INVENTORY,
            counts: { ...COGNITIVE_INVENTORY.counts, mass: 56 },
          },
        }),
      ),
    ).not.toBe(hash());
  });

  // The per-function list and the roll-up are both *the fixture's expected
  // totals*: an upgrade that re-labels one construct moves the list without
  // moving the counts, and that is still a different counting rule.
  it('changes when a single expected function total moves', () => {
    const moved = inputs({
      inventory: {
        ...INVENTORY,
        functions: INVENTORY.functions.map((entry, index) =>
          index === 0 ? { ...entry, complexity: entry.complexity + 1 } : entry,
        ),
      },
    });

    expect(hash(moved)).not.toBe(hash());
  });

  it('changes when a function the cognitive rule was silent about starts scoring', () => {
    // ⚠️ The absent-at-zero rows are hashed like any other, and they are the
    // ones an upgrade is most likely to move: a plugin that starts counting
    // `??=` turns a `null` into a number without touching a single total the
    // cyclomatic fixture holds. It must read as a different counting rule.
    const scoring = cognitive({
      inventory: {
        ...COGNITIVE_INVENTORY,
        functions: COGNITIVE_INVENTORY.functions.map((entry) =>
          entry.cognitive === null ? { ...entry, cognitive: 1 } : entry,
        ),
      },
    });

    expect(hash(inputs(), scoring)).not.toBe(hash());
  });
});

describe('parseFloors, the cap half', () => {
  /** A floors document carrying one capped scope. */
  function document(caps: unknown): unknown {
    return {
      configHash: 'sha256:0123456789abcdef',
      fixtureHash: 'sha256:fedcba9876543210',
      scopes: {
        scripts: { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [], caps },
      },
    };
  }

  const BOTH = {
    'complexity-max': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
    'complexity-mass-over-10': { cap: 13, armed: '2026-08-22', notes: ['raised once'] },
  };

  it('requires a fixtureHash the way it requires a configHash', () => {
    const { fixtureHash: _dropped, ...without } = WELL_FORMED;

    expect(() => parseFloors(without)).toThrow(/fixtureHash/);
    expect(() => parseFloors({ ...WELL_FORMED, fixtureHash: '' })).toThrow(/fixtureHash/);
  });

  it('keeps the fixture hash beside the config hash', () => {
    const floors = parseFloors(document(BOTH));

    expect(floors.fixtureHash).toBe('sha256:fedcba9876543210');
    expect(floors.configHash).toBe('sha256:0123456789abcdef');
  });

  it('keeps `unarmed` as a cap value distinct from every number', () => {
    const caps = parseFloors(document(BOTH)).scopes.get('scripts')?.caps;

    expect(caps?.get('complexity-max')?.cap).toBe('unarmed');
    expect(caps?.get('complexity-mass-over-10')?.cap).toBe(13);
    expect(caps?.get('complexity-mass-over-10')?.notes).toEqual(['raised once']);
  });

  // ⚠️ A scope with no `caps` key parses, and is refused at deploy instead.
  // Shape is this function's question and completeness is `floorRefusals`',
  // which is exactly how the scope-level `unaccounted` check already splits.
  it('treats a missing caps object as no caps rather than as a fault', () => {
    expect(parseFloors(document(undefined)).scopes.get('scripts')?.caps.size).toBe(0);
  });

  // A typo must not read as a cap on nothing. `functions` and `mass` are not
  // capped by decision — they grow with the codebase — so naming one is the
  // same fault as misspelling `complexity-max`.
  it('throws on a cap naming a series that cannot be capped', () => {
    expect(() => parseFloors(document({ 'complexity-maxx': BOTH['complexity-max'] }))).toThrow(
      /complexity-maxx/,
    );
    expect(() => parseFloors(document({ 'complexity-mass': BOTH['complexity-max'] }))).toThrow(
      /complexity-mass/,
    );
  });

  it('throws on a cap that is neither a number nor unarmed', () => {
    expect(() =>
      parseFloors(document({ 'complexity-max': { cap: 'later', armed: '2026-08-22', notes: [] } })),
    ).toThrow(/neither a number nor unarmed/);
  });

  it('throws on a cap carrying no date, so `unarmed` cannot be typed in blind', () => {
    expect(() =>
      parseFloors(document({ 'complexity-max': { cap: 'unarmed', notes: [] } })),
    ).toThrow(/date/);
  });

  it('throws on notes that are not a list of lines', () => {
    expect(() =>
      parseFloors(document({ 'complexity-max': { cap: 4, armed: '2026-08-22', notes: 'why' } })),
    ).toThrow(/notes/);
  });
});

describe('CAPPED_SERIES', () => {
  it('caps the two series the spec caps, and neither of the two it does not', () => {
    expect([...CAPPED_SERIES]).toEqual(['complexity-max', 'complexity-mass-over-10']);
  });

  // ⚠️ **The one input to a count that the fixture hash cannot see.** Move
  // `MCCABE_CUT` to 11 or 12 and `INVENTORY` is unchanged — its only
  // over-the-cut function scores 13 — so the hash matches and a cap compares
  // two numbers that no longer mean the same thing. The series name is what
  // closes it: change the cut and this is red, or the name changes and G36
  // catches the missing Trends row.
  it('names the cut in the series that measures it', () => {
    expect(CAPPED_SERIES).toContain(`complexity-mass-over-${String(MCCABE_CUT)}`);
  });
});

describe('runRowsFrom, the cap half', () => {
  /** A CI record carrying the counting stamp and one capped series. */
  function counted(
    timestamp: number,
    hash: string,
    max?: number,
    event = 'push',
  ): string {
    return [
      '# TYPE stacks_run_ok gauge',
      `stacks_run_ok 1 ${String(timestamp)}`,
      '# TYPE stacks_run_info gauge',
      `stacks_run_info{commit="abc",event="${event}",run_url="u",config_hash="sha256:abc",fixture_hash="${hash}"} 1 ${String(timestamp)}`,
      ...(max === undefined
        ? []
        : [
            '# TYPE stacks_trend_complexity_max gauge',
            `stacks_trend_complexity_max{scope="scripts"} ${String(max)} ${String(timestamp)}`,
          ]),
      '# EOF',
      '',
    ].join('\n');
  }

  it('reads the counting stamp beside the scoring one', () => {
    const [row] = runRowsFrom([parseRecord(counted(1_760_000_000, 'sha256:counted', 12))]);

    expect(row?.fixtureHash).toBe('sha256:counted');
    expect(row?.configHash).toBe('sha256:abc');
  });

  // ⚠️ A count is not a score and is not divided by a hundred. `scores` holds a
  // fraction the record stores as `0..1`; `complexity-max` is a branch count and
  // `12` means twelve.
  it('reads a count verbatim, never as a percentage', () => {
    const [row] = runRowsFrom([parseRecord(counted(1_760_000_000, 'sha256:counted', 12))]);

    expect(row?.counts.get('complexity-max')?.get('scripts')).toBe(12);
  });

  it('leaves a row written before the counting stamp existed with no fixture hash', () => {
    const document = counted(1_760_000_000, 'sha256:counted', 12).replace(
      ',fixture_hash="sha256:counted"',
      '',
    );

    expect(runRowsFrom([parseRecord(document)])[0]?.fixtureHash).toBeUndefined();
  });

  // ⚠️ **A merge record carries counts and no score, and both halves must
  // survive that.** `scoredIn` drops it — it has no mutation score to compare —
  // while the cap's own window keeps it, because §6 puts the counts on both
  // events for per-merge resolution.
  it('keeps a merge record that counted but did not score', () => {
    const rows = runRowsFrom([parseRecord(counted(1_760_000_000, 'sha256:counted', 12))]);

    expect(rows[0]?.scores.size).toBe(0);
    expect(rows[0]?.counts.get('complexity-max')?.get('scripts')).toBe(12);
    expect(scoredIn(rows)).toEqual([]);
  });

  it('reads a record that carried no counts as carrying none', () => {
    const [row] = runRowsFrom([parseRecord(counted(1_760_000_000, 'sha256:counted'))]);

    expect(row?.counts.get('complexity-max')?.size ?? 0).toBe(0);
  });
});

describe('capBreaches', () => {
  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:counted',
    scopes: {
      scripts: {
        floor: 'unarmed',
        armed: '2026-08-19',
        ignored: 0,
        notes: [],
        caps: {
          'complexity-max': { cap: 12, armed: '2026-08-22', notes: [] },
          'complexity-mass-over-10': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
        },
      },
      'packages/cli/src': { floor: 'unarmed', armed: '2026-08-19', ignored: 0, notes: [] },
    },
  });

  it('names the scope, the series, the value and the cap', () => {
    const found = capBreaches(
      [{ scope: 'scripts', series: 'complexity-max', value: 13 }],
      FLOORS,
    );

    expect(found).toEqual([{ scope: 'scripts', series: 'complexity-max', value: 13, cap: 12 }]);
  });

  // ⚠️ **Strictly over, mirroring `breaches`' strictly under.** A value sitting
  // exactly on its cap is the cap being met, and a ratchet that refused there
  // would refuse the first deploy after arming — on the very run the cap was
  // derived from.
  it('does not breach on a value sitting exactly on its cap', () => {
    expect(capBreaches([{ scope: 'scripts', series: 'complexity-max', value: 12 }], FLOORS)).toEqual(
      [],
    );
  });

  it('refuses nothing for an unarmed cap, however large the value', () => {
    expect(
      capBreaches([{ scope: 'scripts', series: 'complexity-mass-over-10', value: 999 }], FLOORS),
    ).toEqual([]);
  });

  it('refuses nothing for a scope that has no cap entry at all', () => {
    expect(
      capBreaches([{ scope: 'packages/cli/src', series: 'complexity-max', value: 999 }], FLOORS),
    ).toEqual([]);
  });

  // A reading the record could not supply is the freshness refusal's subject,
  // not this one's — the same split `breaches` makes for a missing score.
  it('invents no verdict where the record carried no value', () => {
    expect(capBreaches([{ scope: 'scripts', series: 'complexity-max', value: null }], FLOORS)).toEqual(
      [],
    );
  });
});

describe('capCalibration', () => {
  const HASH = 'sha256:counted';

  function row(timestamp: number, max: number, event = 'schedule', ok = true): RunRow {
    return {
      timestamp,
      ok,
      event,
      configHash: 'sha256:abc',
      fixtureHash: HASH,
      scores: new Map(),
      counts: new Map([['complexity-max', new Map([['scripts', max]])]]),
    };
  }

  /** `count` runs one day apart, newest last, each carrying `max`. */
  function runs(count: number, max = 10): RunRow[] {
    return Array.from({ length: count }, (_, index) => row(1_760_000_000 + index * 86_400, max));
  }

  it('arms at the highest value observed, which is the cap rule', () => {
    const rows = [...runs(19), row(1_760_000_000 + 19 * 86_400, 17)];

    expect(capCalibration(rows, ['scripts'], HASH).highest.get('complexity-max')?.get('scripts')).toBe(
      17,
    );
  });

  it('is full at twenty consecutive healthy runs and not at nineteen', () => {
    expect(capCalibration(runs(19), ['scripts'], HASH).full).toBe(false);
    expect(capCalibration(runs(20), ['scripts'], HASH).full).toBe(true);
  });

  // ⚠️ **Nightlies only, exactly like the floor's window — and a draft had this
  // the other way round.** `the-ratchet.md`: *"CI nightlies only, 20 consecutive
  // run_ok 1 runs, no gap over 3 days. Counted in **runs**, not days."* The
  // draft counted merges too, reasoning that more samples could only raise a
  // derived cap. That is false for a run-bounded window: `slice(0, 20)` takes
  // the newest twenty *runs*, so counting merges makes twenty runs span two days
  // instead of three weeks, the maximum is taken over a narrower slice of
  // history, and the cap comes out **tighter**. This asserts the corrected rule.
  it('counts no merge run, matching the mutation floor window exactly', () => {
    const merges = runs(20).map((entry) => ({ ...entry, event: 'push' }));

    expect(capCalibration(merges, ['scripts'], HASH).runs).toBe(0);
    expect(nightliesIn(merges)).toEqual([]);
  });

  // The two windows are now one walk with one varying predicate, so a run that
  // fills the floor's window fills the cap's — same rows, same count.
  it('fills in step with the floor window on the same rows', () => {
    const rows = runs(20).map((entry) => ({ ...entry, configHash: 'sha256:abc' }));

    expect(capCalibration(rows, ['scripts'], HASH).runs).toBe(
      calibration(rows, ['scripts'], 'sha256:abc').runs,
    );
  });

  it('breaks the streak on a run scored under another counting rule', () => {
    const rows = runs(20);
    const middle = rows[10];
    if (middle !== undefined) middle.fixtureHash = 'sha256:elsewhere';

    expect(capCalibration(rows, ['scripts'], HASH).runs).toBe(9);
  });

  it('breaks the streak on a row from before the counting stamp existed', () => {
    const rows = runs(20).map((entry, index) =>
      index === 10 ? { ...entry, fixtureHash: undefined } : entry,
    );

    expect(capCalibration(rows, ['scripts'], HASH).runs).toBe(9);
  });

  it('breaks the streak on a failed run and on a gap over three days', () => {
    const failed = runs(20);
    failed[10] = { ...row(1_760_000_000 + 10 * 86_400, 10), ok: false };
    expect(capCalibration(failed, ['scripts'], HASH).runs).toBe(9);

    const gapped = runs(20).map((entry, index) =>
      index < 10 ? { ...entry, timestamp: entry.timestamp - 10 * 86_400 } : entry,
    );
    expect(capCalibration(gapped, ['scripts'], HASH).runs).toBe(10);
  });

  // A scope the window cannot see all the way across has no derived cap — the
  // same hole `calibration` reports as `null` rather than inventing a lowest.
  it('reports a hole rather than a number where a scope is missing from a run', () => {
    const rows = runs(20);
    rows[5] = { ...row(1_760_000_000 + 5 * 86_400, 10), counts: new Map() };

    expect(
      capCalibration(rows, ['scripts'], HASH).highest.get('complexity-max')?.get('scripts'),
    ).toBeNull();
  });
});

describe('floorRefusals, the cap half', () => {
  /** Both capped series, unarmed, for one scope. */
  function unarmedCaps(): Record<string, unknown> {
    return {
      'complexity-max': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
      'complexity-mass-over-10': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
    };
  }

  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:counted',
    scopes: {
      scripts: {
        floor: 'unarmed',
        armed: '2026-08-19',
        ignored: 0,
        notes: [],
        caps: {
          'complexity-max': { cap: 12, armed: '2026-08-22', notes: [] },
          'complexity-mass-over-10': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
        },
      },
      'packages/cli/src': {
        floor: 'unarmed',
        armed: '2026-08-19',
        ignored: 0,
        notes: [],
        caps: unarmedCaps(),
      },
    },
  });

  const CLEAN = {
    floors: FLOORS,
    declared: ['scripts', 'packages/cli/src'],
    run: { configHash: 'sha256:0123456789abcdef' },
    countedRun: { fixtureHash: 'sha256:counted' },
    readings: [],
    capReadings: [
      { scope: 'scripts', series: 'complexity-max', value: 11 },
      { scope: 'scripts', series: 'complexity-mass-over-10', value: 40 },
    ] as const,
  };

  it('refuses nothing when every cap is accounted for and unbreached', () => {
    expect(floorRefusals(CLEAN)).toEqual([]);
  });

  // ⚠️ **The plant §4 asks for by name.** A record counted under a different
  // rule is refused rather than compared, because an ESLint upgrade that
  // counted one more construct would breach every cap at once and read as a
  // regression that nobody caused.
  it('refuses a record counted under a different rule, naming both hashes', () => {
    const [refusal] = floorRefusals({
      ...CLEAN,
      countedRun: { fixtureHash: 'sha256:elsewhere' },
    });

    expect(refusal).toContain('sha256:counted');
    expect(refusal).toContain('sha256:elsewhere');
    expect(refusal?.toLowerCase()).toContain('counting rule');
  });

  // A mismatch and a breach in the same run is the deploy asserting a
  // comparison it has just said it cannot make. The floor's hash refusal makes
  // exactly this choice, for exactly this reason.
  it('refuses the mismatch alone, never beside a breach it cannot vouch for', () => {
    const refusals = floorRefusals({
      ...CLEAN,
      countedRun: { fixtureHash: 'sha256:elsewhere' },
      capReadings: [{ scope: 'scripts', series: 'complexity-max', value: 99 }],
    });

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('sha256:elsewhere');
  });

  // ⚠️ **An absent stamp is not a wrong one.** A record from before this slice
  // carries no `fixture_hash`, and refusing on it while every cap is unarmed
  // would make the first deploy after this lands refuse — teaching whoever hit
  // it how to get past machinery that is not yet guarding anything.
  it('lets a record from before the counting stamp through while every cap is unarmed', () => {
    const unarmed = parseFloors({
      configHash: 'sha256:0123456789abcdef',
      fixtureHash: 'sha256:counted',
      scopes: {
        scripts: {
          floor: 'unarmed',
          armed: '2026-08-19',
          ignored: 0,
          notes: [],
          caps: unarmedCaps(),
        },
      },
    });

    const refusals = floorRefusals({
      ...CLEAN,
      floors: unarmed,
      declared: ['scripts'],
      countedRun: {},
      capReadings: [],
    });

    expect(refusals).toEqual([]);
  });

  it('refuses an unstamped record once a cap is armed', () => {
    const [refusal] = floorRefusals({ ...CLEAN, countedRun: {} });

    expect(refusal).toContain('sha256:counted');
    expect(refusal?.toLowerCase()).toContain('before the stamp existed');
  });

  it('names the scope, the series, the value and the cap on a breach', () => {
    const [refusal] = floorRefusals({
      ...CLEAN,
      capReadings: [{ scope: 'scripts', series: 'complexity-max', value: 17 }],
    });

    expect(refusal).toContain('scripts');
    expect(refusal).toContain('complexity-max');
    expect(refusal).toContain('17');
    expect(refusal).toContain('12');
  });

  // The three routes past a refusal all land in the one file with a visible
  // diff, and raising a cap is the lowering of that file: it costs a notes
  // entry like any other.
  it('says raising the cap costs a notes entry, and that no flag clears it', () => {
    const [refusal] = floorRefusals({
      ...CLEAN,
      capReadings: [{ scope: 'scripts', series: 'complexity-max', value: 17 }],
    });

    expect(refusal).toContain('notes');
    expect(refusal).toContain('No flag clears this');
    expect(refusal).not.toContain('--skip-gates');
  });

  // ⚠️ §7's vacuous-green direction, aimed at the caps: a scope carrying no cap
  // entry for a capped series is counted by every run and capped by nothing. It
  // is the forward direction of `correspondence`, one level down.
  it('refuses a declared scope carrying no entry for a capped series', () => {
    const half = parseFloors({
      configHash: 'sha256:0123456789abcdef',
      fixtureHash: 'sha256:counted',
      scopes: {
        scripts: {
          floor: 'unarmed',
          armed: '2026-08-19',
          ignored: 0,
          notes: [],
          caps: { 'complexity-max': { cap: 'unarmed', armed: '2026-08-22', notes: [] } },
        },
      },
    });

    const [refusal] = floorRefusals({
      ...CLEAN,
      floors: half,
      declared: ['scripts'],
      capReadings: [],
    });

    expect(refusal).toContain('scripts');
    expect(refusal).toContain('complexity-mass-over-10');
    expect(refusal).not.toContain('complexity-max ');
  });
});

describe('renderCapLines', () => {
  const FLOORS = parseFloors({
    configHash: 'sha256:0123456789abcdef',
    fixtureHash: 'sha256:counted',
    scopes: {
      scripts: {
        floor: 'unarmed',
        armed: '2026-08-19',
        ignored: 0,
        notes: [],
        caps: {
          'complexity-max': { cap: 12, armed: '2026-08-22', notes: [] },
          'complexity-mass-over-10': { cap: 'unarmed', armed: '2026-05-11', notes: [] },
        },
      },
    },
  });

  function window(runs: number, highest: number | null = 17): CapCalibration {
    return {
      runs,
      candidates: runs,
      full: runs >= 20,
      days: runs,
      highest: new Map([
        ['complexity-max', new Map([['scripts', highest]])],
        ['complexity-mass-over-10', new Map([['scripts', highest]])],
      ]),
    };
  }

  /** The line for one scope-and-series pair. */
  function lineFor(series: string, lines: readonly string[]): string {
    const found = lines.find((line) => line.includes(series));
    expect(found, `no print line for ${series}`).toBeDefined();
    return found ?? '';
  }

  it('states an armed cap, the current count and the move since the last record', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [{ scope: 'scripts', series: 'complexity-max', value: 11, previous: 13 }],
      window: window(4),
      today: '2026-08-25',
    });

    const line = lineFor('complexity-max', lines);
    expect(line).toContain('scripts');
    expect(line).toContain('armed 12');
    expect(line).toContain('current 11');
    expect(line).toContain('(-2)');
  });

  // ⚠️ **A count is an integer and prints as one.** The floor block prints two
  // decimals because a score is a percentage; `complexity-max` of 12 rendered
  // as `12.00` would read as a measurement with a precision it does not have.
  it('prints a count as an integer, never with the score block decimals', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [{ scope: 'scripts', series: 'complexity-max', value: 11 }],
      window: window(4),
      today: '2026-08-25',
    });

    expect(lineFor('complexity-max', lines)).not.toContain('11.00');
  });

  it('says so when an armed cap has no count in the record', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: window(4),
      today: '2026-08-25',
    });

    expect(lineFor('complexity-max', lines)).toContain('no count in the record');
  });

  // The countdown: the whole mechanism that ends the disarmed period, and the
  // reason the cap lands early. It converts *indefinite* into a dated question.
  it('counts the window down while a cap is unarmed', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: window(14),
      today: '2026-08-25',
    });

    const line = lineFor('complexity-mass-over-10', lines);
    expect(line).toContain('unarmed');
    expect(line).toContain('14/20 runs');
  });

  // ⚠️ **The date stays on the line where the temptation is.** A full window is
  // exactly when somebody is deciding what to type into `cap`, and how long the
  // entry has sat unarmed is the only guard on typing `unarmed` instead.
  it('offers the derived cap and the sat-unarmed date once the window is full', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: window(20),
      today: '2026-08-25',
    });

    const line = lineFor('complexity-mass-over-10', lines);
    expect(line).toContain('window full (20 runs)');
    expect(line).toContain('highest 17 - armable');
    expect(line).toContain('106 days');
  });

  it('reports a hole rather than offering a cap it cannot derive', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: window(20, null),
      today: '2026-08-25',
    });

    expect(lineFor('complexity-mass-over-10', lines)).toContain('no complete history');
  });

  // ⚠️ **Nothing counted and nothing present are different facts**, and the
  // floor block already says so above its own table. A store full of nightlies
  // that all predate the counting stamp is a working pipe; a store with no
  // nightlies at all is not, and a print that could not tell them apart reports
  // the first as the second.
  it('tells an empty record apart from one nothing counted under this rule', () => {
    const nothing = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: { ...window(0), candidates: 0 },
      today: '2026-08-25',
    }).join('\n');

    const unstamped = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: { ...window(0), candidates: 7 },
      today: '2026-08-25',
    }).join('\n');

    expect(nothing).toContain('no nightly in the record yet');
    expect(unstamped).toContain('7 nightlies');
    // ⚠️ The floor block's wording names a *configuration*; a cap is about a
    // counting rule, and reusing the sentence unchanged would name the wrong
    // stamp on the one line that exists to explain an empty table.
    expect(unstamped).toContain('counted under this rule');
    expect(unstamped).not.toContain('scored under this configuration');
  });

  // The header used to claim this window counted every event and so filled
  // faster than the floor's. Both halves went false when the window became
  // nightlies-only, and a stale sentence above a table is worse than none.
  it('claims nothing about counting merges, because it does not count them', () => {
    const lines = renderCapLines({
      floors: FLOORS,
      readings: [],
      window: window(4),
      today: '2026-08-25',
    }).join('\n');

    expect(lines).not.toContain('every event');
    expect(lines).not.toContain('fills faster');
  });
});

describe('countedIn', () => {
  function row(event: string, counts: Map<string, Map<string, number>>, ok = true): RunRow {
    return {
      timestamp: 1_760_000_000,
      ok,
      event,
      configHash: 'sha256:abc',
      fixtureHash: 'sha256:counted',
      scores: new Map(),
      counts: counts as RunRow['counts'],
    };
  }

  function both(max: number, massOver10: number): Map<string, Map<string, number>> {
    return new Map([
      ['complexity-max', new Map([['scripts', max]])],
      ['complexity-mass-over-10', new Map([['scripts', massOver10]])],
    ]);
  }

  // ⚠️ **The whole reason this is not `scoredIn`.** §6 puts the counts on both
  // events while only the nightly half scores, so a merge record carries counts
  // and an empty `scores` — and `scoredIn` drops it. Reading caps off that row
  // would report "no count in the record" for every scope, which is a cap
  // refusing nothing at the moment somebody deploys.
  it('keeps a merge run that counted, which scoredIn drops', () => {
    const rows = [row('push', both(12, 40))];

    expect(countedIn(rows)).toHaveLength(1);
    expect(scoredIn(rows)).toEqual([]);
  });

  it('drops a run that carried no counts at all', () => {
    expect(countedIn([row('schedule', new Map())])).toEqual([]);
  });

  it('drops a failed run, whatever it managed to carry', () => {
    expect(countedIn([row('schedule', both(12, 40), false)])).toEqual([]);
  });

  // ⚠️ **Every capped series, not one of them.** Probing only `complexity-max`
  // would single out one member of a set the floors file treats as a unit, and
  // would read a half-emitted record as a whole one. The emitter's
  // all-or-nothing rule means this should never be seen in practice — which is
  // exactly why the filter must not depend on it silently.
  it('drops a run carrying one capped series and not the other', () => {
    const half = new Map([['complexity-max', new Map([['scripts', 12]])]]);

    expect(countedIn([row('schedule', half)])).toEqual([]);
  });

  it('keeps a nightly that counted, so the window and the comparison agree', () => {
    expect(countedIn([row('schedule', both(12, 40))])).toHaveLength(1);
  });
});

describe('floorRefusals — the two runs are two fields', () => {
  const FLOORS = parseFloors({
    configHash: 'sha256:config',
    fixtureHash: 'sha256:counted',
    scopes: {
      scripts: {
        floor: 71.55,
        armed: '2026-08-19',
        ignored: 0,
        notes: [],
        caps: {
          'complexity-max': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
          'complexity-mass-over-10': { cap: 'unarmed', armed: '2026-08-22', notes: [] },
        },
      },
    },
  });

  // ⚠️ **The defect this split exists for.** A store can hold counting merge
  // records and no scoring nightly. A draft carried one `run` object filled from
  // whichever row had a hash, so that store produced `{ fixtureHash }` with no
  // `configHash` — and with a floor armed, the config check read it as *a
  // scoring run from before the stamp existed* and refused with "derived under a
  // different configuration". A true sentence about a row that is not there.
  it('does not refuse on the configuration when there is no scoring run at all', () => {
    const refusals = floorRefusals({
      floors: FLOORS,
      declared: ['scripts'],
      countedRun: { fixtureHash: 'sha256:counted' },
      readings: [],
      capReadings: [],
    });

    expect(refusals).toEqual([]);
  });

  // The mirror: a scoring run and no counting run says nothing about the caps.
  it('does not refuse on the counting rule when there is no counting run at all', () => {
    const refusals = floorRefusals({
      floors: FLOORS,
      declared: ['scripts'],
      run: { configHash: 'sha256:config' },
      readings: [],
      capReadings: [],
    });

    expect(refusals).toEqual([]);
  });
});
