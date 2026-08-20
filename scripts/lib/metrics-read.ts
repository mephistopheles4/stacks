/**
 * Reading a record back: what it says, and whether it is still saying it.
 *
 * `./metrics.ts` renders one run as OpenMetrics text and `./metrics-record.ts`
 * knows where those files live. This is the third piece — **the half that reads
 * samples** — and it exists because the deploy's staleness refusal is
 * **per-series**, and a filename cannot answer a per-series question.
 *
 * ⚠️ **This is a design that moved and took a sentence with it.** #121 specced
 * the freshness check to read a **filename**, which is cheap and exactly right
 * for an aggregate bound; #140 then made staleness per-series, and one series
 * going quiet while the others stay healthy is precisely what a name like
 * `1755600000-a1b2c3d.prom` cannot tell you. The superseded line survives in
 * `docs/spec/trend-layer.md` §7 as the vacuous-green entry it was. See §4 of
 * that file for the rule this module implements.
 *
 * **Absent and stale are one verdict, and it is entailed rather than chosen.**
 * *"The newest sample is older than 3 days"* is undefined for a series with no
 * samples at all, and a series that never emitted — renamed, dropped from the
 * run, silently misconfigured — **is the failure per-series staleness exists to
 * expose.** Any other answer fails closed in the wrong direction, leaving the
 * one case the check cannot see.
 *
 * **Nothing here reaches git, the network, or the clock.** Every input is a
 * parameter, which is what lets the dated half of the rule be planted at all:
 * the deploy cannot be told what day it is, so *no record 4 days after the
 * spine landed* is observed here rather than through the script.
 */

import {
  METRIC_PREFIXES,
  TREND_SERIES,
  trendNamesIn,
  trendOfMetric,
  unescape,
  type TrendName,
} from './metrics.ts';

/** Seconds in a day, as the bounds below are stated in days. */
export const DAY = 86_400;

/**
 * The staleness bound, in days, for every CI-written series.
 *
 * ⚠️ **Not a fresh number, and the same one in three places.** The ratchet's
 * calibration window breaks on any gap over 3 days and the bootstrap below
 * expires at 3, so **a record too stale to deploy on is exactly a record too
 * stale to calibrate on**. It absorbs a weekend of Actions flakiness, and it
 * learns GitHub's 60-day scheduled-workflow disablement in 3 days rather than
 * in 60.
 *
 * **The bound is a multiple of the nightly, never of pushes.** `metrics.yml`
 * fires on `push: main` too, but that is bursty and a week without a merge is
 * not a fault.
 *
 * ⚠️ **It is also the most weakeable artifact this piece produces** — widening
 * 3 to 90 makes the refusal never fire and deletes nothing. Graded as such in
 * `docs/spec/trend-layer.md` §7 rather than defended by a mechanism that does
 * not exist.
 */
export const STALE_AFTER_DAYS = 3;

/**
 * The day the trend spine landed — `f8bd379`, `metrics.yml` and the orphan
 * branch, 2026-08-19.
 *
 * ⚠️ **A date, and expiring rather than conditional.** The rollout creates a
 * window in which *no record has ever existed*, and an empty record is
 * maximally stale — so the first `deploy:site` after the spine would refuse,
 * and the first thing this machinery would teach its only user is how to get
 * past it. **The bootstrap exemption is the single most likely thing in this
 * design to become permanent furniture**, a special case whose entire job is
 * suppressing a refusal, which is why it dies on a calendar day rather than on
 * *"until the first record arrives"*. Three missed nightlies is a dead pipe,
 * not a bootstrap.
 */
export const SPINE_LANDED = '2026-08-19';

/** One sample line, as parsed. */
export interface Sample {
  metric: string;
  labels: Record<string, string>;
  value: number;
  /** Unix seconds. Every sample this project writes carries one. */
  timestamp?: number;
}

/** One record, parsed far enough to answer both questions asked of it. */
export interface ParsedRecord {
  samples: Sample[];
  /**
   * The trend series this record emitted, and the newest sample each carries.
   *
   * ⚠️ **Membership comes from `# TYPE` lines and never from samples.** A
   * series is *emitted* when the run computed it, and that is true of a family
   * with zero samples — every declared scope having produced no mutants, say.
   * Reading samples for membership would make a real emission look like a
   * missing one, which is the direction that reads as health. The **age** of
   * such a family falls back to the record's own newest sample, which is what
   * `run_ok` guarantees exists.
   */
  trends: Map<string, number | undefined>;
  /** The newest sample in the whole document, or `undefined` if it has none. */
  timestamp?: number;
}

/**
 * `key="value"` pairs, unescaped by the function that escaped them.
 *
 * Scanned rather than split on `,`: a label value may contain one legitimately,
 * and a splitter that broke on `Health, Mind & Body` would invent two labels
 * out of one — the same class of mistake the `subjects` separator exists to
 * avoid one layer down.
 */
function parseLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const match of text.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
    const key = match[1];
    if (key === undefined) continue;
    labels[key] = unescape(match[2] ?? '');
  }
  return labels;
}

const SAMPLE_LINE =
  /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^\n]*\})?[ \t](-?(?:[0-9]+\.?[0-9]*(?:[eE][+-]?[0-9]+)?|Inf|NaN))(?:[ \t](-?[0-9]+(?:\.[0-9]+)?))?$/;

/** Every sample line of an OpenMetrics document. Metadata and `# EOF` are skipped. */
export function parseSamples(document: string): Sample[] {
  const samples: Sample[] = [];

  for (const raw of document.split('\n')) {
    // A record read back through git on Windows arrives with `\r` on every
    // line, and this module is downstream of exactly that path.
    const line = raw.replace(/\r$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;

    const match = SAMPLE_LINE.exec(line);
    if (match === null) continue;

    const timestamp = match[4] === undefined ? undefined : Number(match[4]);
    samples.push({
      metric: match[1] ?? '',
      labels: match[2] === undefined ? {} : parseLabels(match[2]),
      value: Number(match[3]),
      timestamp: timestamp === undefined || !Number.isFinite(timestamp) ? undefined : timestamp,
    });
  }
  return samples;
}

/** One record's samples, plus which series it emitted and when. */
export function parseRecord(document: string): ParsedRecord {
  const samples = parseSamples(document);

  const stamps = samples
    .map((sample) => sample.timestamp)
    .filter((stamp): stamp is number => stamp !== undefined);
  const timestamp = stamps.length === 0 ? undefined : Math.max(...stamps);

  const trends = new Map<string, number | undefined>();
  for (const name of trendNamesIn(document)) trends.set(name, timestamp);

  // A family's own samples are more precise than the document's newest, and
  // they are what makes this a parse of samples rather than of a header.
  for (const sample of samples) {
    const trend = trendOfMetric(sample.metric);
    if (trend === undefined || sample.timestamp === undefined) continue;
    const seen = trends.get(trend);
    trends.set(trend, seen === undefined ? sample.timestamp : Math.max(seen, sample.timestamp));
  }

  return { samples, trends, timestamp };
}

/** The newest sample each series carries, across every record given. */
export function newestByTrend(records: readonly ParsedRecord[]): Map<string, number> {
  const newest = new Map<string, number>();

  for (const record of records) {
    for (const [trend, stamp] of record.trends) {
      if (stamp === undefined) continue;
      const seen = newest.get(trend);
      if (seen === undefined || stamp > seen) newest.set(trend, stamp);
    }
  }
  return newest;
}

/** A series past its bound, or one that never arrived at all. */
export interface StaleSeries {
  series: string;
  /** The newest sample seen, or `undefined` — **no sample at all**. */
  newest?: number;
}

/**
 * What the record is, as a verdict.
 *
 * `bootstrap` prints and does not refuse; every other non-`fresh` kind refuses.
 */
export type RecordVerdict =
  | { kind: 'fresh' }
  | { kind: 'bootstrap'; days: number }
  | { kind: 'never'; days: number }
  | { kind: 'stale'; stale: StaleSeries[] };

/**
 * ⚠️ **`now` is the only injected input, and the absences are deliberate.**
 * An earlier version also took the bound, the spine's date and the series list.
 * Nothing passed any of them — and the bound half-worked, governing staleness
 * while the bootstrap's expiry still read the constant, so an injected 90 would
 * have produced two different answers about the same number. Three knobs no
 * caller turns, one of them wrong: the constants below are the contract, and
 * `now` is a parameter because the deploy cannot be told what day it is.
 */
export interface JudgeInput {
  /** Unix seconds. */
  now: number;
  /** What the local store holds, in any order. Empty means nothing ever arrived. */
  records: readonly ParsedRecord[];
}

/** The four CI-written series, which is every series the bound covers. */
export const GATED_SERIES: readonly TrendName[] = TREND_SERIES.map((series) => series.name);

/**
 * Is this record fresh enough to deploy on?
 *
 * ⚠️ **Per-series, because the record is not one number.** Four series written
 * by different things on different clocks, and an aggregate freshness check
 * **cannot see the failure the record was built to expose**: one series going
 * quiet while the others stay healthy. A working nightly keeps the newest row
 * minutes old forever, and the aggregate stays green while a third of the
 * instrument is dead.
 */
export function judgeRecord(input: JudgeInput): RecordVerdict {
  const bound = STALE_AFTER_DAYS * DAY;
  const spine = Date.parse(`${SPINE_LANDED}T00:00:00Z`) / 1000;

  if (input.records.length === 0) {
    const days = Math.floor((input.now - spine) / DAY);
    return days >= STALE_AFTER_DAYS ? { kind: 'never', days } : { kind: 'bootstrap', days };
  }

  const newest = newestByTrend(input.records);
  const stale: StaleSeries[] = [];

  for (const series of GATED_SERIES) {
    const stamp = newest.get(series);
    // Absent and stale are the same verdict. The `undefined` is carried rather
    // than collapsed, because the two need different remedies in the message.
    if (stamp === undefined) stale.push({ series });
    else if (input.now - stamp > bound) stale.push({ series, newest: stamp });
  }

  return stale.length === 0 ? { kind: 'fresh' } : { kind: 'stale', stale };
}

/** `4 days`, `19 hours`, `3 minutes` — an age a person reads without arithmetic. */
export function describeAge(seconds: number): string {
  const plural = (count: number, unit: string): string =>
    `${String(count)} ${unit}${count === 1 ? '' : 's'}`;

  // Bucketed on the **rounded** value rather than on the raw seconds, so an age
  // one second short of an hour reads `1 hour` and never `60 minutes`.
  if (seconds < 90) return plural(Math.max(0, Math.round(seconds)), 'second');

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute');

  const hours = Math.round(seconds / 3600);
  if (hours < 36) return plural(hours, 'hour');
  return plural(Math.round(seconds / DAY), 'day');
}

/**
 * Whether the run that wrote a record computed every series it declared, or
 * `undefined` where it did not say.
 *
 * ⚠️ **A `run_ok 0` run can carry a full and correct set of scores, which is
 * what makes this worth reading.** `renderMetrics` derives `run_ok` from
 * *everything the run declared*, while each family is emitted on its own
 * input — so a nightly whose `pnpm test` step failed writes zero here and a
 * complete `mutation_score` family beside it. **Nothing about the scores looks
 * wrong**, because nothing about them is wrong; what is missing is something
 * else the run set out to measure.
 *
 * The `surface` label is what keeps this a question about CI. A local edge
 * probe writes `run_ok{surface="edge"}` into the store's own directory —
 * different series, same name — and the deploy reads only the branch, so this
 * cannot meet one today. Filtered anyway, because *the deploy reads only the
 * branch* is a fact about a call site rather than about this function.
 */
export function runHealthOf(record: ParsedRecord): boolean | undefined {
  const sample = record.samples.find(
    (one) => one.metric === `${METRIC_PREFIXES.run}ok` && one.labels['surface'] === undefined,
  );
  return sample === undefined ? undefined : sample.value === 1;
}

/** The run that wrote a record: `stacks_run_info`'s labels. */
export function runInfoOf(record: ParsedRecord): Record<string, string> | undefined {
  return record.samples.find((sample) => sample.metric === `${METRIC_PREFIXES.run}info`)?.labels;
}

/** Each declared scope's score in one record, by scope name. */
export function scoresOf(record: ParsedRecord): Map<string, number> {
  const scores = new Map<string, number>();

  for (const sample of record.samples) {
    if (trendOfMetric(sample.metric) !== 'mutation-score') continue;
    const scope = sample.labels['scope'];
    if (scope !== undefined) scores.set(scope, sample.value);
  }
  return scores;
}
