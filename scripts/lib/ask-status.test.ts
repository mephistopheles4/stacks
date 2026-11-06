import { describe, expect, it } from 'vitest';
import {
  GROUP_LIMIT,
  QUERIES,
  ShapeError,
  dayTotals,
  daysToRead,
  isLinkedWorktree,
  printDay,
  queryBody,
  recordName,
  retentionDays,
  writeDecision,
  type QueryName,
} from './ask-status.ts';
import { renderAskDay } from './metrics.ts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOV_5 = Date.UTC(2026, 10, 5);

/**
 * ⚠️ **Documented shape, not captured.** Built from Cloudflare's published schema for the
 * telemetry query's `calculations` view; no reply from the live API has been seen. The
 * owner's first run (spec C10) is what proves it, and until then `ask:status` writes nothing.
 */
const aggregate = (value: number, groups?: Record<string, string | number | boolean>) => ({
  count: value,
  interval: 1,
  sampleInterval: 1,
  value,
  ...(groups !== undefined && {
    groups: Object.entries(groups).map(([key, v]) => ({ key, value: v })),
  }),
});
const calc = (alias: string, aggregates: unknown[]) => ({
  calculation: alias === 'lines' ? 'count' : 'sum',
  alias,
  aggregates,
  series: [],
});
const reply = (...calculations: unknown[]) => ({
  success: true,
  errors: [],
  messages: [{ message: 'Successful request' }],
  result: { calculations },
});

/** One day: 3 visitors; one asked 12 questions, two asked 1. */
function fixtureDay(): Record<QueryName, unknown> {
  const reaching = [
    ...Array.from({ length: 12 }, (_, i) => i + 1).map((k) =>
      aggregate(k === 1 ? 3 : 1, { question: k }),
    ),
  ];
  const neuronsByQuestion = Array.from({ length: 12 }, (_, i) => i + 1).map((k) =>
    aggregate(k === 1 ? 150 : 50, { question: k }),
  );
  return {
    outcomes: reply(
      calc('lines', [
        aggregate(12, { outcome: 'ai' }),
        aggregate(2, { outcome: 'search-ai-failed', reason: 'timeout' }),
        aggregate(4, { outcome: 'refused-limit', limit: 'minute' }),
        aggregate(1, { outcome: 'refused-limit', limit: 'error' }),
        aggregate(1, { outcome: 'refused-secret' }),
        aggregate(1, { outcome: 'daily-pass' }),
        aggregate(3, { outcome: 'health-down' }),
      ]),
    ),
    questions: reply(calc('lines', reaching), calc('neurons', neuronsByQuestion)),
    metered: reply(calc('lines', [aggregate(13)]), calc('neurons', [aggregate(756)])),
    spending: reply(calc('lines', [aggregate(15)])),
    cached: reply(calc('tokensIn', [aggregate(20_000)]), calc('tokensCached', [aggregate(15_000)])),
    time: reply(
      { ...calc('msAvg', [aggregate(4_200)]), calculation: 'avg' },
      { ...calc('msMax', [aggregate(29_500)]), calculation: 'max' },
    ),
  };
}

describe('which days a run reads (spec S3, C7)', () => {
  it('keeps 3 days of logs before 2026-12-01 and 7 from then', () => {
    expect(retentionDays(Date.UTC(2026, 10, 30))).toBe(3);
    expect(retentionDays(Date.UTC(2026, 11, 1))).toBe(7);
  });

  it('reads completed days an hour old, skipping today and the oldest, partly aged-out day', () => {
    const now = NOV_5 + 2 * HOUR;
    // Nov 4 ended two hours ago; Nov 3 and Nov 2 are whole; Nov 2's start is exactly 3 days
    // and 2 hours back, so part of it has aged out.
    expect(daysToRead(now)).toEqual([NOV_5 - DAY, NOV_5 - 2 * DAY]);
  });

  it('does not read a day that ended under an hour ago', () => {
    expect(daysToRead(NOV_5 + 30 * 60_000)).not.toContain(NOV_5 - DAY);
    expect(daysToRead(NOV_5 + HOUR)).toContain(NOV_5 - DAY);
  });

  it('reads further back once the day itself falls under the 7-day rule', () => {
    const now = Date.UTC(2026, 11, 8) + 2 * HOUR;
    const read = daysToRead(now);
    expect(read).toContain(Date.UTC(2026, 11, 2));
    expect(read).toContain(Date.UTC(2026, 11, 3));
    // Nov 30 was kept 3 days: long gone by Dec 8.
    expect(read).not.toContain(Date.UTC(2026, 10, 30));
    expect(read).not.toContain(Date.UTC(2026, 11, 1));
  });

  it('reads no day from before the switch under the longer rule, at the boundary', () => {
    // Dec 3, 02:00: Nov 30 started 3 days and 2 hours back, past its own 3 days.
    expect(daysToRead(Date.UTC(2026, 11, 3) + 2 * HOUR)).not.toContain(Date.UTC(2026, 10, 30));
  });

  it('names a day by the unix second its UTC midnight starts', () => {
    expect(recordName(NOV_5)).toBe(`${String(NOV_5 / 1000)}-ask.prom`);
    expect(recordName(NOV_5)).toMatch(/^\d+-[0-9a-z]+\.prom$/);
  });
});

describe('the queries (spec S3)', () => {
  it('asks the stacks-ask service for one day, with an explicit group limit', () => {
    for (const name of Object.keys(QUERIES) as QueryName[]) {
      const body = queryBody(name, NOV_5) as {
        timeframe: { from: number; to: number };
        view: string;
        limit: number;
        parameters: { filters: { key: string; value?: unknown }[]; limit: number };
      };
      expect(body.timeframe).toEqual({ from: NOV_5, to: NOV_5 + DAY });
      expect(body.view).toBe('calculations');
      expect(body.limit).toBe(GROUP_LIMIT);
      expect(body.parameters.limit).toBe(GROUP_LIMIT);
      expect(body.parameters.filters[0]).toMatchObject({
        key: '$metadata.service',
        value: 'stacks-ask',
      });
    }
  });
});

describe("a day's totals from the replies (spec C6)", () => {
  it('turns the documented shape into the totals', () => {
    const totals = dayTotals(fixtureDay());
    expect(totals.questions).toBe(14);
    expect(totals.outcomes).toContainEqual({ outcome: 'ai', count: 12 });
    expect(totals.outcomes).toContainEqual({
      outcome: 'search-ai-failed',
      reason: 'timeout',
      count: 2,
    });
    expect(totals.neurons).toBe(756);
    expect(totals.neuronsMissing).toBe(2);
    expect(totals.cachedShare).toBeCloseTo(0.75);
    expect(totals.msAvg).toBe(4_200);
    expect(totals.msMax).toBe(29_500);
    expect(totals.reaching.get(1)).toBe(3);
    expect(totals.reaching.get(12)).toBe(1);
    expect(totals.reaching.get(13)).toBeUndefined();
    expect(totals.neuronsByBand).toEqual({ '1-10': 600, '11-20': 100, '21-30': 0 });
  });

  it('prints the figures the owner reads, and never a reply body', () => {
    const text = printDay(NOV_5, dayTotals(fixtureDay())).join('\n');
    expect(text).toContain('2026-11-05');
    expect(text).toContain('questions 14');
    expect(text).toContain('Neurons 756');
    expect(text).toContain('2 spending lines with no Neurons');
    expect(text).toContain('visitor-days reaching 1, 5, 10, 20, 30: 3, 1, 1, 0, 0');
    expect(text).toContain('questions 11 and up: 13% of Neurons, a lower bound');
    expect(text).toContain('refused-limit (error) 1');
    expect(text).toContain('daily test: pass');
    expect(text).not.toContain('Successful request');
  });

  it('reads an empty day as zeros', () => {
    const empty = Object.fromEntries(
      (Object.keys(QUERIES) as QueryName[]).map((name) => [
        name,
        reply(...QUERIES[name].calculations.map((c) => calc(c.alias, []))),
      ]),
    ) as Record<QueryName, unknown>;
    const totals = dayTotals(empty);
    expect(totals.questions).toBe(0);
    expect(totals.neurons).toBe(0);
    expect(totals.msAvg).toBeUndefined();
    expect(printDay(NOV_5, totals).join('\n')).toContain('daily test: no line');
  });

  const reshaped: [string, (day: Record<QueryName, unknown>) => void][] = [
    ['a reply with no result', (day) => void (day.spending = { success: true })],
    [
      'an unsuccessful reply',
      (day) => void ((day.spending as { success: boolean }).success = false),
    ],
    [
      'a missing calculation',
      (day) =>
        void ((day.metered as { result: { calculations: unknown[] } }).result.calculations = []),
    ],
    [
      'an unknown key',
      (day) =>
        void Object.assign(
          (day.spending as { result: { calculations: { aggregates: object[] }[] } }).result
            .calculations[0]!.aggregates[0]!,
          { extra: 1 },
        ),
    ],
    [
      'a value that is not a number',
      (day) =>
        void Object.assign(
          (day.metered as { result: { calculations: { aggregates: object[] }[] } }).result
            .calculations[1]!.aggregates[0]!,
          { value: '756' },
        ),
    ],
    [
      'a sampled count',
      (day) =>
        void Object.assign(
          (day.spending as { result: { calculations: { aggregates: object[] }[] } }).result
            .calculations[0]!.aggregates[0]!,
          { sampleInterval: 10 },
        ),
    ],
    [
      'a group the query did not ask for',
      (day) =>
        void ((
          day.outcomes as { result: { calculations: { aggregates: unknown[] }[] } }
        ).result.calculations[0]!.aggregates[0] = aggregate(1, { outcome: 'ai', visitor: 'x' })),
    ],
    [
      'a reply at the group limit, possibly cut off',
      (day) =>
        void ((
          day.questions as { result: { calculations: { aggregates: unknown[] }[] } }
        ).result.calculations[0]!.aggregates = Array.from({ length: GROUP_LIMIT }, (_, i) =>
          aggregate(1, { question: i + 1 }),
        )),
    ],
  ];
  it.each(reshaped)('refuses %s', (_name, change) => {
    const day = fixtureDay();
    change(day);
    expect(() => dayTotals(day)).toThrow(ShapeError);
  });

  it('names a refusal in fixed words, never with text from the reply', () => {
    const day = fixtureDay();
    day.spending = { success: true, result: { calculations: [{ CANARY_REPLY: 'x' }] } };
    try {
      dayTotals(day);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('CANARY');
    }
  });
});

describe("a day's record (spec S3)", () => {
  it('renders the stacks_ask_ series at the day start, and no account or endpoint', () => {
    const document = renderAskDay(dayTotals(fixtureDay()), NOV_5 / 1000);
    const at = String(NOV_5 / 1000);
    expect(document).toContain(`stacks_ask_day_recorded 1 ${at}`);
    expect(document).toContain(`stacks_ask_neurons 756 ${at}`);
    expect(document).toContain(`stacks_ask_neurons_missing 2 ${at}`);
    expect(document).toContain(`stacks_ask_visitors_reaching{question="12"} 1 ${at}`);
    expect(document).toContain(`stacks_ask_neurons_by_band{band="11-20"} 100 ${at}`);
    expect(document).toContain(
      `stacks_ask_outcomes{outcome="refused-limit",limit="error"} 1 ${at}`,
    );
    expect(document).toContain(`stacks_ask_daily_test{result="pass"} 1 ${at}`);
    expect(document.endsWith('# EOF\n')).toBe(true);
    expect(document).not.toMatch(/cloudflare|account|api\./i);
    const samples = document.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
    expect(samples.every((line) => line.startsWith('stacks_ask_'))).toBe(true);
  });
});

describe('one store (spec S3, C7)', () => {
  it('knows a linked worktree from the main checkout', () => {
    expect(isLinkedWorktree('/r/.git/worktrees/x', '/r/.git')).toBe(true);
    expect(isLinkedWorktree('/r/.git', '/r/.git')).toBe(false);
    expect(isLinkedWorktree('H:\\r\\.git', 'H:/r/.git')).toBe(false);
  });
});

describe('the Ask page (spec S4, C8)', () => {
  interface Panel {
    title: string;
    type: string;
    targets?: { expr: string; datasource: { uid: string } }[];
  }
  const load = async () => {
    const { readFileSync } = await import('node:fs');
    return JSON.parse(readFileSync('grafana/dashboards/ask.json', 'utf8')) as {
      uid: string;
      editable: boolean;
      panels: Panel[];
    };
  };

  it("holds S4's panels in S4's order, read-only, after a note on how to read it", async () => {
    const page = await load();
    expect(page.uid).toBe('stacks-ask');
    expect(page.editable).toBe(false);
    expect(page.panels[0]?.type).toBe('text');
    const numbers = page.panels.slice(1).map((p) => /^Panel (\d) ·/.exec(p.title)?.[1]);
    expect(numbers).toEqual(['1', '2', '3', '3', '4', '4', '5', '6']);
    expect(page.panels[1]?.title).toMatch(/Days with a record/);
    expect(page.panels[2]?.title).toMatch(/Neurons a day/);
  });

  it("reads only this page's series, from the provisioned store", async () => {
    const page = await load();
    const targets = page.panels.flatMap((p) => p.targets ?? []);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.datasource.uid).toBe('stacks-trend');
      const metrics = target.expr.match(/\bstacks_[a-z_]+/g) ?? [];
      expect(metrics.length).toBeGreaterThan(0);
      for (const metric of metrics) expect(metric.startsWith('stacks_ask_')).toBe(true);
    }
  });

  it('draws only series a record carries', async () => {
    const page = await load();
    const document = renderAskDay(dayTotals(fixtureDay()), NOV_5 / 1000);
    const drawn = page.panels
      .flatMap((p) => p.targets ?? [])
      .flatMap((t) => t.expr.match(/\bstacks_ask_[a-z_]+/g) ?? []);
    for (const metric of new Set(drawn)) expect(document).toContain(`# TYPE ${metric} gauge`);
  });

  it('is provisioned from the directory trend:sync mounts', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('grafana/provisioning/dashboards/stacks.yml', 'utf8')).toMatch(
      /allowUiUpdates: false[\s\S]*path: \/etc\/grafana\/dashboards/,
    );
  });
});

describe('what a run writes (spec C7)', () => {
  it('writes only with --record, and never over a day already on disk', () => {
    expect(writeDecision({ record: false, onDisk: false })).toBe('print');
    expect(writeDecision({ record: false, onDisk: true })).toBe('print');
    expect(writeDecision({ record: true, onDisk: true })).toBe('on-disk');
    expect(writeDecision({ record: true, onDisk: false })).toBe('write');
  });

  it('the script refuses --record from a worktree, and runs wrangler with its telemetry off', async () => {
    const { readFileSync } = await import('node:fs');
    const script = readFileSync('scripts/ask-status.ts', 'utf8');
    expect(script).toMatch(/if \(isLinkedWorktree\(gitDir, commonDir\)\) \{\s*fail\(/);
    expect(script).toContain('env: uploadEnv(process.env, loaded)');
    // A reply body is never printed: the only print of a reply is through printDay.
    expect(script).not.toMatch(/console\.log\([^)]*(?:text|body|reply)\b/);
  });
});
