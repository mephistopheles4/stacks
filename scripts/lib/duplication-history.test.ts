import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { HistoryReportPoint } from './duplication.ts';
import {
  BACKFILL_TIP,
  HISTORY_FILE,
  HISTORY_RECORD,
  NIGHTLY_START_AT,
  committedFrom,
  historyAction,
  parseHistory,
  pointsFrom,
  serialiseHistory,
  type History,
  type HistoryPoint,
} from './duplication-history.ts';
import { parseRecordName } from './metrics-record.ts';
import { REPO_ROOT } from './repo-root.ts';

const sha = (digit: string): string => digit.repeat(40);

/** One point as jscpd's `history.points` carries it, with only the fields read here. */
function reported(commit: string, over: Partial<HistoryReportPoint> = {}): HistoryReportPoint {
  return { commit, clones: 2, duplicatedLines: 12, lines: 400, ...over };
}

/** A committed file's point, valid unless a test says otherwise. */
function point(over: Partial<HistoryPoint> = {}): HistoryPoint {
  return {
    commit: sha('a'),
    at: 1_785_506_529,
    clones: 0,
    duplicatedLines: 0,
    ignoredLines: 0,
    totalLines: 467,
    ...over,
  };
}

function history(over: Partial<History> = {}): History {
  return {
    tip: BACKFILL_TIP,
    jscpdVersion: '5.4.1',
    duplicationHash: `sha256:${'f'.repeat(64)}`,
    points: [point(), point({ commit: sha('b'), at: 1_785_507_000, clones: 2 })],
    ...over,
  };
}

/** `history()` as the document a reader parses, so a test can break one field of it. */
function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...JSON.parse(serialiseHistory(history())), ...over } as Record<string, unknown>;
}

describe('pointsFrom — one point per first-parent commit', () => {
  const landed = [
    { commit: sha('1'), at: 100 },
    { commit: sha('2'), at: 200 },
  ];

  it('keeps first-parent commits only, and drops the working tree and side branches', () => {
    const points = pointsFrom(
      [
        reported(sha('1'), { clones: 1 }),
        reported(sha('9'), { clones: 50 }),
        reported(sha('2'), { clones: 3 }),
        reported('working tree', { clones: 99 }),
      ],
      landed,
      new Map(),
    );

    expect(points.map((p) => [p.commit, p.clones])).toEqual([
      [sha('1'), 1],
      [sha('2'), 3],
    ]);
  });

  it('builds each point from six fields: jscpd `lines` becomes totalLines, ignored comes from the sweep', () => {
    const [first] = pointsFrom(
      [reported(sha('1'), { duplicatedLines: 7, lines: 321 }), reported(sha('2'))],
      landed,
      new Map([[sha('1'), 5]]),
    );

    expect(first).toEqual({
      commit: sha('1'),
      at: 100,
      clones: 2,
      duplicatedLines: 7,
      ignoredLines: 5,
      totalLines: 321,
    });
  });

  it('refuses a report that is missing a first-parent commit, which is what --history-limit sampling looks like', () => {
    expect(() => pointsFrom([reported(sha('1'))], landed, new Map())).toThrow(/1 of 2/);
  });

  it('keeps the descendant when two first-parent commits landed in the same second', () => {
    const points = pointsFrom(
      [reported(sha('1'), { clones: 1 }), reported(sha('2'), { clones: 2 })],
      [
        { commit: sha('1'), at: 100 },
        { commit: sha('2'), at: 100 },
      ],
      new Map(),
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.commit).toBe(sha('2'));
  });

  it('refuses times that run backwards', () => {
    expect(() =>
      pointsFrom(
        [reported(sha('1')), reported(sha('2'))],
        [
          { commit: sha('1'), at: 200 },
          { commit: sha('2'), at: 100 },
        ],
        new Map(),
      ),
    ).toThrow(/increase/);
  });
});

describe('parseHistory — fails closed', () => {
  it('reads back exactly what serialiseHistory wrote', () => {
    expect(parseHistory(JSON.parse(serialiseHistory(history())))).toEqual(history());
  });

  it('refuses an empty points list', () => {
    expect(() => parseHistory(doc({ points: [] }))).toThrow(/no points/);
  });

  it.each([
    ['a missing field', { totalLines: undefined }, /totalLines/],
    ['a non-integer count', { clones: 1.5 }, /clones/],
    ['a negative count', { ignoredLines: -1 }, /ignoredLines/],
    [
      'more duplicated lines than lines',
      { duplicatedLines: 500, totalLines: 400 },
      /more duplicated/,
    ],
    ['an unsafe count', { clones: 2 ** 60 }, /clones/],
    ['a time of zero', { at: 0 }, /positive at/],
    ['a short commit', { commit: 'aecb7cf' }, /commit/],
    ['a commit with a prefix', { commit: `x${sha('a')}` }, /commit/],
    ['a commit with a suffix', { commit: `${sha('a')}x` }, /commit/],
  ])('refuses a point with %s', (_, broken, message) => {
    const points = [{ ...point(), ...broken }];
    expect(() => parseHistory(doc({ points }))).toThrow(message);
  });

  it('refuses a point that is not an object, and a document that is not one', () => {
    expect(() => parseHistory(doc({ points: [null] }))).toThrow(/point 0 is not an object/);
    expect(() => parseHistory(null)).toThrow(/not an object/);
  });

  it('accepts a point whose every line is duplicated', () => {
    const points = [point({ duplicatedLines: 467, totalLines: 467 })];
    expect(parseHistory(doc({ points })).points[0]?.duplicatedLines).toBe(467);
  });

  it('refuses times that do not strictly increase', () => {
    const points = [point({ at: 200 }), point({ commit: sha('b'), at: 200 })];
    expect(() => parseHistory(doc({ points }))).toThrow(/increase/);
  });

  it('refuses a last point at or past the first nightly duplication record', () => {
    const points = [point({ at: NIGHTLY_START_AT })];
    expect(() => parseHistory(doc({ points }))).toThrow(/#262/);
  });

  it.each([
    ['a tip other than BACKFILL_TIP', { tip: sha('c') }, /tip/],
    ['a version with a prefix', { jscpdVersion: 'v5.4.1' }, /jscpdVersion/],
    ['a version with a suffix', { jscpdVersion: '5.4.1-rc' }, /jscpdVersion/],
    ['a short hash', { duplicationHash: 'sha256:abc' }, /duplicationHash/],
    ['a hash with a prefix', { duplicationHash: `xsha256:${'f'.repeat(64)}` }, /duplicationHash/],
    ['a hash with a suffix', { duplicationHash: `sha256:${'f'.repeat(64)}0` }, /duplicationHash/],
  ])('refuses %s', (_, broken, message) => {
    expect(() => parseHistory(doc(broken))).toThrow(message);
  });

  it('reads multi-digit version parts', () => {
    expect(parseHistory(doc({ jscpdVersion: '15.40.112' })).jscpdVersion).toBe('15.40.112');
  });

  it('names a field and a position in a refusal, never the value it refused', () => {
    const planted = `${'c0ffee'.repeat(6)}zzzz`;
    expect(() => parseHistory(doc({ points: [point({ commit: planted })] }))).toThrow(
      /^(?!.*c0ffee).*point 0 has no 40-character commit/,
    );
  });
});

describe('the committed file', () => {
  // Read inside each test rather than at collection time: code a describe body
  // runs is attributed to no test, and Stryker's per-test coverage then lets
  // mutants in the parser survive tests that would kill them.
  const committedText = (): string =>
    readFileSync(join(REPO_ROOT, HISTORY_FILE), 'utf8').replace(/\r\n/g, '\n');

  it('is the backfill up to the parent of #262, as the generator wrote it', () => {
    const committed = parseHistory(JSON.parse(committedText()) as unknown);
    expect(BACKFILL_TIP).toBe('aecb7cf8ca3af6cefd99e16205fa00d99fd89ded');
    expect(committed.tip).toBe(BACKFILL_TIP);
    expect(committed.points).toHaveLength(136);
    expect(committed.points[0]?.commit).toBe('d700bc57adb4d65a7bc27cfeee1136d610056130');
    expect(committed.points.at(-1)?.commit).toBe(BACKFILL_TIP);
  });

  it('is written byte for byte as serialiseHistory writes it', () => {
    const text = committedText();
    expect(serialiseHistory(parseHistory(JSON.parse(text) as unknown))).toBe(text);
  });

  it('renders under a fixed record name the store reads as a local row', () => {
    expect(HISTORY_RECORD).toBe('1787677348-history.prom');
    expect(parseRecordName(HISTORY_RECORD)?.timestamp).toBe(1_787_677_348);
  });
});

describe('committedFrom — the file as the sync reads it', () => {
  const render = (h: History): string => `RENDERED ${String(h.points.length)}`;

  it('is missing when there is no text', () => {
    expect(committedFrom(undefined, render)).toEqual({ state: 'missing' });
  });

  it('reports a syntax error as fixed text, so no snippet of the file is echoed', () => {
    expect(committedFrom('{"tip": "secret-snippet', render)).toEqual({
      state: 'malformed',
      reason: 'it is not JSON',
    });
  });

  it("passes the parser's own refusal through", () => {
    expect(committedFrom(JSON.stringify(doc({ points: [] })), render)).toEqual({
      state: 'malformed',
      reason: `${HISTORY_FILE} has no points`,
    });
  });

  it('renders a file that parses', () => {
    expect(committedFrom(serialiseHistory(history()), render)).toEqual({
      state: 'ok',
      rendered: 'RENDERED 2',
    });
  });
});

describe('serialiseHistory — the committed bytes', () => {
  it('writes two-space JSON with a final newline, and only the six fields per point', () => {
    const text = serialiseHistory(history());
    const parsed = JSON.parse(text) as { points: Record<string, unknown>[] };

    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "tip": ');
    expect(Object.keys(parsed.points[0] ?? {}).sort()).toEqual(
      ['at', 'clones', 'commit', 'duplicatedLines', 'ignoredLines', 'totalLines'].sort(),
    );
  });
});

describe('historyAction — the rendered copy in the local store', () => {
  const ok = { state: 'ok', rendered: 'RENDERED' } as const;

  it('writes the record when the store has none', () => {
    expect(historyAction({ committed: ok, existing: new Map(), imported: [] })).toEqual({
      kind: 'write',
      name: HISTORY_RECORD,
      bytes: 'RENDERED',
    });
  });

  it('does nothing when the copy already holds the same bytes', () => {
    const existing = new Map([[HISTORY_RECORD, 'RENDERED']]);
    expect(historyAction({ committed: ok, existing, imported: [HISTORY_RECORD] })).toEqual({
      kind: 'none',
    });
  });

  it('writes the record again when the store imported it but the local copy is gone', () => {
    expect(
      historyAction({ committed: ok, existing: new Map(), imported: [HISTORY_RECORD] }).kind,
    ).toBe('write');
  });

  it('rewrites a copy that changed before it was ever imported', () => {
    const existing = new Map([[HISTORY_RECORD, 'OLD']]);
    expect(historyAction({ committed: ok, existing, imported: [] }).kind).toBe('write');
  });

  it('refuses, naming --rebuild, when a copy the store already holds has changed', () => {
    const existing = new Map([[HISTORY_RECORD, 'OLD']]);
    const action = historyAction({ committed: ok, existing, imported: [HISTORY_RECORD] });

    expect(action.kind).toBe('refuse');
    expect(action.kind === 'refuse' && action.message).toMatch(/--rebuild/);
  });

  it('refuses when a history record sits there under any other name, imported or not', () => {
    const existing = new Map([['1-history.prom', 'STALE']]);
    for (const imported of [['1-history.prom'], []]) {
      const action = historyAction({ committed: ok, existing, imported });

      expect(action.kind).toBe('refuse');
      expect(action.kind === 'refuse' && action.message).toMatch(/1-history\.prom[\s\S]*--rebuild/);
    }
  });

  it.each([
    ['missing', { state: 'missing' }, /jscpd\.history\.json is missing/],
    [
      'malformed',
      { state: 'malformed', reason: 'point 3 has no clones' },
      /jscpd\.history\.json cannot be read \(point 3 has no clones\)/,
    ],
  ] as const)(
    'only warns when the committed file is %s, so the nightly records still import',
    (_, committed, message) => {
      const action = historyAction({ committed, existing: new Map(), imported: [] });

      expect(action.kind).toBe('warn');
      expect(action.kind === 'warn' && action.message).toMatch(message);
    },
  );
});
