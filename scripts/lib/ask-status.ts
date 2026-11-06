/**
 * The pure half of `pnpm ask:status` (docs/spec/ask-observability.md S3): which days a run
 * reads, what it asks Workers Observability, and how the replies become a day's totals.
 * Nothing here touches the network or the disk, so the suite holds all of it.
 *
 * ⚠️ **The reply shape is Cloudflare's documented one, not a captured one.** Every reply is
 * checked against it and refused on any difference, so a misread reply prints a refusal
 * rather than becoming a wrong day in the trend store, where a record is never corrected.
 */
import { resolve } from 'node:path';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Workers Logs keep 3 days, and 7 for logs written from this date (spec S3). */
export const RETENTION_CHANGE = Date.UTC(2026, 11, 1);

/** How long the logs of the day starting at `dayStart` are kept. */
export function retentionDays(dayStart: number): number {
  return dayStart >= RETENTION_CHANGE ? 7 : 3;
}

/**
 * The completed UTC days whose logs are all still there, newest first: ended at least an
 * hour ago, for late lines, and started after the retention reaches back, so a day that
 * has partly aged out is never read as a low one.
 */
export function daysToRead(now: number): number[] {
  const today = Math.floor(now / DAY) * DAY;
  const days: number[] = [];
  for (let start = today - DAY; start > now - 8 * DAY; start -= DAY) {
    const ended = now - (start + DAY) >= HOUR;
    const whole = start > now - retentionDays(start) * DAY;
    if (ended && whole) days.push(start);
  }
  return days;
}

/** `<unix second of the day's UTC midnight>-ask.prom`, the name `trend:sync` imports by. */
export function recordName(dayStart: number): string {
  return `${String(dayStart / 1000)}-ask.prom`;
}

/**
 * What a run does with a day whose replies passed the shape check: print only without
 * `--record`, leave a day already on disk alone (it is never rewritten), else write it.
 * A refused reply never reaches this; the linked-worktree refusal comes before any day.
 */
export function writeDecision(day: {
  readonly record: boolean;
  readonly onDisk: boolean;
}): 'print' | 'on-disk' | 'write' {
  if (!day.record) return 'print';
  return day.onDisk ? 'on-disk' : 'write';
}

/** Whether `gitDir` belongs to a linked worktree rather than the checkout that owns the store. */
export function isLinkedWorktree(gitDir: string, commonDir: string): boolean {
  const norm = (path: string) => resolve(path).replaceAll('\\', '/').toLowerCase();
  return norm(gitDir) !== norm(commonDir);
}

/**
 * At most this many groups a query: Cloudflare's documented maximum for `limit`. A reply
 * holding this many may be cut off, so it is refused (owner, 2026-11-06).
 */
export const GROUP_LIMIT = 100;

interface Calculation {
  readonly alias: string;
  readonly operator: 'count' | 'sum' | 'avg' | 'max';
  readonly key?: string;
}

interface Query {
  readonly groupBys: readonly string[];
  /** Fields a line must carry to be counted. */
  readonly exists: readonly string[];
  readonly where?: { readonly key: string; readonly value: string };
  readonly calculations: readonly Calculation[];
}

const count: Calculation = { alias: 'lines', operator: 'count' };
const sum = (key: string): Calculation => ({ alias: key, operator: 'sum', key });

/** The six questions a day is asked. Each names its own fields; none reads a line's text. */
export const QUERIES = {
  outcomes: { groupBys: ['outcome', 'reason', 'limit'], exists: [], calculations: [count] },
  questions: {
    groupBys: ['question'],
    exists: ['question'],
    calculations: [count, sum('neurons')],
  },
  metered: { groupBys: [], exists: ['neurons'], calculations: [count, sum('neurons')] },
  spending: { groupBys: [], exists: ['tokensIn'], calculations: [count] },
  cached: {
    groupBys: [],
    exists: ['tokensIn', 'tokensCached'],
    calculations: [sum('tokensIn'), sum('tokensCached')],
  },
  time: {
    groupBys: [],
    exists: ['ms'],
    where: { key: 'outcome', value: 'ai' },
    calculations: [
      { alias: 'msAvg', operator: 'avg', key: 'ms' },
      { alias: 'msMax', operator: 'max', key: 'ms' },
    ],
  },
} as const satisfies Record<string, Query>;

export type QueryName = keyof typeof QUERIES;

/** The telemetry query's body for one query over the day starting at `dayStart`. */
export function queryBody(name: QueryName, dayStart: number): unknown {
  const query: Query = QUERIES[name];
  const type = (key: string) =>
    ['outcome', 'reason', 'limit'].includes(key) ? 'string' : 'number';
  return {
    queryId: `ask-status-${name}`,
    timeframe: { from: dayStart, to: dayStart + DAY },
    view: 'calculations',
    limit: GROUP_LIMIT,
    parameters: {
      datasets: ['cloudflare-workers'],
      filters: [
        { key: '$metadata.service', operation: 'eq', type: 'string', value: 'stacks-ask' },
        ...query.exists.map((key) => ({ key, operation: 'exists', type: type(key) })),
        ...(query.where === undefined
          ? []
          : [{ key: query.where.key, operation: 'eq', type: 'string', value: query.where.value }]),
      ],
      calculations: query.calculations.map((c) => ({
        operator: c.operator,
        alias: c.alias,
        ...(c.key !== undefined && { key: c.key, keyType: 'number' }),
      })),
      groupBys: query.groupBys.map((value) => ({ type: type(value), value })),
      limit: GROUP_LIMIT,
    },
  };
}

/** A reply not in the documented shape. The message is fixed words, never the reply's text. */
export class ShapeError extends Error {}

interface Aggregate {
  readonly value: number;
  readonly groups: ReadonlyMap<string, string | number | boolean>;
}

const REPLY_KEYS = new Set(['success', 'errors', 'messages', 'result']);
const CALCULATION_KEYS = new Set(['calculation', 'alias', 'aggregates', 'series']);
const AGGREGATE_KEYS = new Set(['count', 'interval', 'sampleInterval', 'value', 'groups']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function only(record: Record<string, unknown>, allowed: ReadonlySet<string>, where: string): void {
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new ShapeError(`${where} holds a key the documented shape does not`);
  }
}

/** One query's reply, checked against the documented shape, as aggregates per alias. */
function readReply(name: QueryName, reply: unknown): Map<string, Aggregate[]> {
  const where = `the ${name} reply`;
  if (!isRecord(reply)) throw new ShapeError(`${where} is not an object`);
  only(reply, REPLY_KEYS, where);
  if (reply['success'] !== true) throw new ShapeError(`${where} did not succeed`);
  const result = reply['result'];
  if (!isRecord(result) || !Array.isArray(result['calculations'])) {
    throw new ShapeError(`${where} has no calculations`);
  }
  const query: Query = QUERIES[name];
  const byAlias = new Map<string, Aggregate[]>();
  for (const item of result['calculations'] as unknown[]) {
    if (!isRecord(item)) throw new ShapeError(`${where} holds a calculation that is not an object`);
    only(item, CALCULATION_KEYS, where);
    const alias = item['alias'];
    if (typeof alias !== 'string' || !query.calculations.some((c) => c.alias === alias)) {
      throw new ShapeError(`${where} holds a calculation it did not ask for`);
    }
    if (byAlias.has(alias)) throw new ShapeError(`${where} holds a calculation twice`);
    byAlias.set(alias, readAggregates(item['aggregates'], query, where));
  }
  for (const c of query.calculations) {
    if (!byAlias.has(c.alias)) throw new ShapeError(`${where} is missing a calculation`);
  }
  return byAlias;
}

function readAggregates(raw: unknown, query: Query, where: string): Aggregate[] {
  if (!Array.isArray(raw)) throw new ShapeError(`${where} has no aggregates`);
  if (raw.length >= GROUP_LIMIT) throw new ShapeError(`${where} is at the group limit`);
  return raw.map((entry: unknown) => {
    if (!isRecord(entry)) throw new ShapeError(`${where} holds an aggregate that is not an object`);
    only(entry, AGGREGATE_KEYS, where);
    if (!finite(entry['value']) || !finite(entry['count'])) {
      throw new ShapeError(`${where} holds a value that is not a number`);
    }
    for (const key of ['sampleInterval', 'interval'] as const) {
      if (entry[key] !== undefined && entry[key] !== 1) {
        throw new ShapeError(`${where} was sampled, so its counts are estimates`);
      }
    }
    const groups = new Map<string, string | number | boolean>();
    const rawGroups = entry['groups'] ?? [];
    if (!Array.isArray(rawGroups))
      throw new ShapeError(`${where} holds groups that are not a list`);
    for (const group of rawGroups as unknown[]) {
      if (!isRecord(group)) throw new ShapeError(`${where} holds a group that is not an object`);
      only(group, new Set(['key', 'value']), where);
      const { key, value } = group;
      if (typeof key !== 'string' || !query.groupBys.includes(key)) {
        throw new ShapeError(`${where} holds a group the query did not ask for`);
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new ShapeError(`${where} holds a group value of the wrong type`);
      }
      groups.set(key, value as string | number | boolean);
    }
    return { value: entry['value'], groups };
  });
}

export interface OutcomeCount {
  readonly outcome: string;
  readonly reason?: string;
  readonly limit?: string;
  readonly count: number;
}

/** One UTC day, counted. Every figure is a sum or a count; nothing identifies anyone. */
export interface DayTotals {
  /** Lines carrying `question`: the questions admitted past the limits. */
  readonly questions: number;
  readonly outcomes: readonly OutcomeCount[];
  readonly neurons: number;
  /** Lines where a call returned (`tokensIn`) but Cloudflare gave no Neurons. */
  readonly neuronsMissing: number;
  /** Cached input tokens over input tokens, on lines carrying both. */
  readonly cachedShare: number | undefined;
  readonly msAvg: number | undefined;
  readonly msMax: number | undefined;
  /** Visitor-days that reached each question number: `count(question == k)`. */
  readonly reaching: ReadonlyMap<number, number>;
  readonly neuronsByBand: Readonly<Record<Band, number>>;
}

export const BANDS = ['1-10', '11-20', '21-30'] as const;
export type Band = (typeof BANDS)[number];

const total = (aggregates: readonly Aggregate[] | undefined): number =>
  (aggregates ?? []).reduce((acc, a) => acc + a.value, 0);
const single = (aggregates: readonly Aggregate[] | undefined): number | undefined =>
  aggregates?.[0]?.value;
const label = (value: string | number | boolean | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : String(value);

/** The day's totals from its six replies, or a `ShapeError` if any reply is not as documented. */
export function dayTotals(replies: Readonly<Record<QueryName, unknown>>): DayTotals {
  const read = Object.fromEntries(
    (Object.keys(QUERIES) as QueryName[]).map((name) => [name, readReply(name, replies[name])]),
  ) as Record<QueryName, Map<string, Aggregate[]>>;

  const outcomes = (read.outcomes.get('lines') ?? []).map((a) => {
    const outcome = label(a.groups.get('outcome'));
    if (outcome === undefined)
      throw new ShapeError('the outcomes reply holds a line with no outcome');
    const reason = label(a.groups.get('reason'));
    const limit = label(a.groups.get('limit'));
    return {
      outcome,
      ...(reason !== undefined && { reason }),
      ...(limit !== undefined && { limit }),
      count: a.value,
    };
  });

  const byQuestion = (alias: string): Map<number, number> => {
    const map = new Map<number, number>();
    for (const a of read.questions.get(alias) ?? []) {
      const k = a.groups.get('question');
      if (typeof k !== 'number' || !Number.isInteger(k) || k < 1) {
        throw new ShapeError('the questions reply holds a question that is not a count');
      }
      map.set(k, a.value);
    }
    return map;
  };
  const reaching = byQuestion('lines');
  const neuronsByQuestion = byQuestion('neurons');
  const neuronsByBand: Record<Band, number> = { '1-10': 0, '11-20': 0, '21-30': 0 };
  for (const [k, neurons] of neuronsByQuestion) {
    neuronsByBand[k <= 10 ? '1-10' : k <= 20 ? '11-20' : '21-30'] += neurons;
  }

  const tokensIn = single(read.cached.get('tokensIn'));
  const tokensCached = single(read.cached.get('tokensCached'));
  return {
    questions: total(read.questions.get('lines')),
    outcomes,
    neurons: total(read.metered.get('neurons')),
    neuronsMissing: Math.max(
      0,
      total(read.spending.get('lines')) - total(read.metered.get('lines')),
    ),
    cachedShare:
      tokensIn === undefined || tokensCached === undefined || tokensIn === 0
        ? undefined
        : tokensCached / tokensIn,
    msAvg: single(read.time.get('msAvg')),
    msMax: single(read.time.get('msMax')),
    reaching,
    neuronsByBand,
  };
}

const day = (dayStart: number): string => new Date(dayStart).toISOString().slice(0, 10);
const counted = (totals: DayTotals, outcome: string): number =>
  totals.outcomes.filter((o) => o.outcome === outcome).reduce((acc, o) => acc + o.count, 0);

/** The lines `ask:status` prints for one day. */
export function printDay(dayStart: number, totals: DayTotals): string[] {
  const heavy = totals.neuronsByBand['11-20'] + totals.neuronsByBand['21-30'];
  const share = totals.neurons === 0 ? 0 : Math.round((heavy / totals.neurons) * 100);
  const daily =
    counted(totals, 'daily-pass') > 0
      ? 'pass'
      : counted(totals, 'daily-fail') > 0
        ? 'fail'
        : 'no line';
  const outcomes = [...totals.outcomes]
    .sort((a, b) => b.count - a.count)
    .map((o) => {
      const why = o.reason ?? o.limit;
      return `  ${o.outcome}${why === undefined ? '' : ` (${why})`} ${String(o.count)}`;
    });
  return [
    `${day(dayStart)}: questions ${String(totals.questions)}`,
    ...outcomes,
    `  Neurons ${totals.neurons.toFixed(0)}, ${String(totals.neuronsMissing)} spending lines with no Neurons` +
      (totals.cachedShare === undefined
        ? ''
        : `, ${String(Math.round(totals.cachedShare * 100))}% of input tokens cached`),
    `  AI time: ${totals.msAvg === undefined ? 'no ai lines' : `average ${totals.msAvg.toFixed(0)} ms, largest ${String(totals.msMax ?? 0)} ms`}`,
    `  visitor-days reaching 1, 5, 10, 20, 30: ${[1, 5, 10, 20, 30].map((k) => String(totals.reaching.get(k) ?? 0)).join(', ')}`,
    `  questions 11 and up: ${String(share)}% of Neurons, a lower bound`,
    `  daily test: ${daily}; health-down ${String(counted(totals, 'health-down'))}`,
  ];
}
