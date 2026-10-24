/**
 * The survivor record: one night's surviving mutants as a sorted JSON Lines
 * file, and the one summary line that says what moved since the night before.
 * `docs/spec/survivor-record.md` is the spec; [ADR-0117](../../docs/adr/0117-survivors-are-matched-by-content-and-recorded-on-their-own-orphan-branch.md)
 * is why a survivor is matched by what it mutates and never by `id`.
 *
 * ⚠️ **Pure, and mutated, on purpose.** This module reads no file and runs no
 * process: `scripts/mutation-scopes.ts` reads and writes, `scripts/commit-metrics.ts`
 * runs `git`, and both are excluded from mutation. Every branch with a decision
 * in it lives here, where `./survivor-record.test.ts` reaches it in-process —
 * and no mutant of this file can push, because nothing here can run `git`. The one
 * exception is which record on the branch is the previous one: `newestRecord` in
 * `scripts/commit-metrics.ts` picks it from `ls-tree`'s output, because that needs
 * `git`.
 *
 * ⚠️ **The key is file + mutator + original + replacement, and never `id` or
 * position.** Stryker numbers a mutant by its place in one run's count, so one
 * new mutant early in the file order renumbers everything after it, and the
 * report's own `mutants[]` order differs from run to run
 * ([the measurement](../../docs/log/2026-09-21-the-survivor-set-diffs-cleanly.md)).
 * The `original` is sliced from the report's own `source` at the mutant's
 * location, so it is the text the mutation replaced and not a guess at it.
 * Matching is a multiset: per key, the count tonight against the count before.
 *
 * ⚠️ **Two nights are comparable only under one key definition, one Stryker and
 * one configuration.** `keySchema`, `stryker` and `configHash` ride in the header
 * and a diff across a change in any of them is not computed: it would report the
 * tool's difference as the code's movement.
 */

import {
  assignFiles,
  isSurviving,
  type MutationReport,
  type ReportedMutant,
  type Scope,
} from './mutation-score.ts';
import { parseReport } from './mutation-report.ts';

/** The version of the key's definition; bump it when the key changes. */
export const KEY_SCHEMA = 1;

/**
 * The measurement behind the noise note, which a summary line links by its full
 * address: a step summary renders in the Actions UI, where a relative link goes
 * nowhere.
 */
const NOISE_LOG =
  'https://github.com/mephistopheles4/stacks/blob/main/docs/log/2026-09-21-the-survivor-set-diffs-cleanly.md';

export interface Position {
  line: number;
  column: number;
}

export interface ScopeCounts {
  survived: number;
  noCoverage: number;
}

export interface RecordHeader {
  record: 'survivors';
  keySchema: number;
  stryker: string;
  configHash: string;
  commit: string;
  event: string;
  runUrl: string;
  recordedAt: string;
  counts: Record<string, ScopeCounts>;
}

/** One survivor line. The key order here is the key order on disk. */
export interface SurvivorLine {
  file: string;
  scope: string;
  mutator: string | null;
  status: 'Survived' | 'NoCoverage';
  original: string | null;
  replacement: string | null;
  start: Position | null;
  end: Position | null;
}

export interface ParsedRecord {
  header: RecordHeader;
  survivors: SurvivorLine[];
}

export interface BuildInput {
  report: MutationReport;
  scopes: Scope[];
  stryker: string;
  configHash: string;
  commit: string;
  event: string;
  runUrl: string;
  recordedAt: string;
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function offsetOf(starts: number[], line: number, column: number): number | undefined {
  const start = starts[line - 1];
  return start === undefined ? undefined : start + column - 1;
}

/**
 * The text a mutant replaced: 1-based line, 1-based column, end exclusive.
 * `null` where the report gives no location, no source, or a column to slice by.
 */
function originalOf(
  source: string | undefined,
  starts: number[],
  location: ReportedMutant['location'],
): string | null {
  const from = location?.start;
  const to = location?.end;
  if (source === undefined || from?.column === undefined || to?.column === undefined) return null;
  const first = offsetOf(starts, from.line, from.column);
  const last = offsetOf(starts, to.line, to.column);
  return first === undefined || last === undefined ? null : source.slice(first, last);
}

function position(point: { line: number; column?: number } | undefined): Position | null {
  return point?.column === undefined ? null : { line: point.line, column: point.column };
}

/** By UTF-16 code unit, never `localeCompare`, whose order depends on the locale. */
function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

function compareNumber(a: number | undefined, b: number | undefined): number {
  return (a ?? -1) - (b ?? -1);
}

/** The full key, then the location, then the status — a total order. */
function compareLines(a: SurvivorLine, b: SurvivorLine): number {
  return (
    compareText(a.file, b.file) ||
    compareText(a.mutator, b.mutator) ||
    compareText(a.original, b.original) ||
    compareText(a.replacement, b.replacement) ||
    compareNumber(a.start?.line, b.start?.line) ||
    compareNumber(a.start?.column, b.start?.column) ||
    compareNumber(a.end?.line, b.end?.line) ||
    compareNumber(a.end?.column, b.end?.column) ||
    compareText(a.status, b.status)
  );
}

/**
 * A report's survivors as record lines, and the per-scope counts, in a fixed
 * order. Files come from `assignFiles`, so a file is in the same scope here as in
 * the score table, and one no scope claims is not here at all.
 */
function recordLinesOf(
  report: MutationReport,
  scopes: Scope[],
): { survivors: SurvivorLine[]; counts: Record<string, ScopeCounts> } {
  const survivors: SurvivorLine[] = [];
  const counts: Record<string, ScopeCounts> = {};

  for (const [scope, files] of assignFiles(report, scopes).byScope) {
    const tally = { survived: 0, noCoverage: 0 };
    counts[scope] = tally;
    for (const [file, mutants] of files) {
      const source = report.files[file]?.source;
      const starts = source === undefined ? [] : lineStarts(source);
      for (const mutant of mutants) {
        if (!isSurviving(mutant.status)) continue;
        if (mutant.status === 'Survived') tally.survived += 1;
        else tally.noCoverage += 1;
        survivors.push({
          file,
          scope,
          mutator: mutant.mutatorName ?? null,
          status: mutant.status,
          original: originalOf(source, starts, mutant.location),
          replacement: mutant.replacement ?? null,
          start: position(mutant.location?.start),
          end: position(mutant.location?.end),
        });
      }
    }
  }
  return { survivors: survivors.sort(compareLines), counts };
}

/**
 * Tonight's record as the text of the file: the header, then one survivor per
 * line, each a JSON object. Its bytes are a function of the report's content
 * and the header's inputs, never of the order the report lists its mutants in.
 */
export function buildRecord(input: BuildInput): string {
  const { survivors, counts } = recordLinesOf(input.report, input.scopes);
  const header: RecordHeader = {
    record: 'survivors',
    keySchema: KEY_SCHEMA,
    stryker: input.stryker,
    configHash: input.configHash,
    commit: input.commit,
    event: input.event,
    runUrl: input.runUrl,
    recordedAt: input.recordedAt,
    counts,
  };
  return [header, ...survivors].map((line) => JSON.stringify(line)).join('\n') + '\n';
}

const COMMIT = /^[0-9a-f]{40}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function text(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  if (typeof value !== 'string') throw new Error(`the header's ${name} is missing`);
  return value;
}

function textOrNull(fields: Record<string, unknown>, name: string): string | null {
  const value = fields[name];
  if (value === null || typeof value === 'string') return value;
  throw new Error(`a survivor's ${name} is missing`);
}

function readHeader(value: unknown): RecordHeader {
  const fields = object(value, 'the header');
  const keySchema = fields.keySchema;
  if (typeof keySchema !== 'number') throw new Error("the header's keySchema is missing");
  const commit = text(fields, 'commit');
  const recordedAt = text(fields, 'recordedAt');
  // Both come from an unprotected branch and are printed into Markdown, so a
  // value that is not the shape it claims is refused rather than escaped.
  if (!COMMIT.test(commit)) throw new Error("the header's commit is not 40 hex characters");
  if (!ISO_UTC.test(recordedAt) || Number.isNaN(Date.parse(recordedAt))) {
    throw new Error("the header's recordedAt is not an ISO 8601 UTC timestamp");
  }
  return {
    record: 'survivors',
    keySchema,
    stryker: text(fields, 'stryker'),
    configHash: text(fields, 'configHash'),
    commit,
    event: typeof fields.event === 'string' ? fields.event : '',
    runUrl: typeof fields.runUrl === 'string' ? fields.runUrl : '',
    recordedAt,
    counts: {},
  };
}

function readSurvivor(value: unknown): SurvivorLine {
  const fields = object(value, 'a survivor line');
  const file = fields.file;
  if (typeof file !== 'string') throw new Error("a survivor's file is missing");
  const status = fields.status;
  if (status !== 'Survived' && status !== 'NoCoverage') {
    throw new Error("a survivor's status is not Survived or NoCoverage");
  }
  return {
    file,
    scope: typeof fields.scope === 'string' ? fields.scope : '',
    mutator: textOrNull(fields, 'mutator'),
    status,
    original: textOrNull(fields, 'original'),
    replacement: textOrNull(fields, 'replacement'),
    start: null,
    end: null,
  };
}

/**
 * A record read back, or a throw naming what is wrong with it.
 *
 * Reads the fields a diff needs and refuses the rest of the header's shape that
 * could reach the summary: the previous record comes from an unprotected branch.
 * `counts` and the locations are for a person reading the file and are not
 * rebuilt here.
 */
export function parseRecord(source: string): ParsedRecord {
  const rows = source.split('\n').filter((row) => row !== '');
  const [first, ...rest] = rows;
  if (first === undefined) throw new Error('the record is empty');
  const header = readHeader(JSON.parse(first));
  const survivors = rest.map((row) => readSurvivor(JSON.parse(row)));
  const parsed: ParsedRecord = { header, survivors };
  // The header's own counts survive a round trip, for a reader of `ParsedRecord`.
  const counts = object(JSON.parse(first), 'the header').counts;
  if (typeof counts === 'object' && counts !== null && !Array.isArray(counts)) {
    parsed.header.counts = counts as Record<string, ScopeCounts>;
  }
  return parsed;
}

function keyOf(line: SurvivorLine): string {
  return JSON.stringify([line.file, line.mutator, line.original, line.replacement]);
}

function multiset(lines: SurvivorLine[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = keyOf(line);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type Comparison =
  { kind: 'diff'; added: number; gone: number } | { kind: 'not-compared'; changed: string[] };

/**
 * Tonight against the record before it.
 *
 * `added` is the sum of the positive differences, per key, and `gone` the sum of
 * the negative ones: colliding survivors are counted and never de-duplicated.
 * Records made under a different key, Stryker or configuration are not compared.
 */
export function diffRecords(previous: ParsedRecord, current: ParsedRecord): Comparison {
  const changed = changedBetween(previous.header, current.header);
  if (changed.length > 0) return { kind: 'not-compared', changed };

  const before = multiset(previous.survivors);
  const after = multiset(current.survivors);
  let added = 0;
  let gone = 0;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const difference = (after.get(key) ?? 0) - (before.get(key) ?? 0);
    if (difference > 0) added += difference;
    else gone -= difference;
  }
  return { kind: 'diff', added, gone };
}

/** What makes two records comparable, named as `diffRecords` and the summary name it. */
function changedBetween(a: RecordHeader, b: RecordHeader): string[] {
  const changed: string[] = [];
  if (a.keySchema !== b.keySchema) changed.push('key schema');
  if (a.stryker !== b.stryker) changed.push('Stryker version');
  if (a.configHash !== b.configHash) changed.push('config hash');
  return changed;
}

const RECORD_PATH = /^survivors\/(\d+)-[0-9a-z]+\.jsonl$/;

/** Record paths from an `ls-tree` listing, newest first by the timestamp in the name. */
export function recordsNewestFirst(listing: string): string[] {
  return listing
    .split('\n')
    .flatMap((path) => {
      const match = RECORD_PATH.exec(path);
      return match === null ? [] : [{ path, timestamp: Number(match[1]) }];
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ path }) => path);
}

export interface PersistentSurvivor {
  scope: string;
  file: string;
  mutator: string | null;
  original: string | null;
  replacement: string | null;
  /** The fewest copies of this key on any of the records read. */
  count: number;
}

export interface Persistence {
  /** How many records, newest first, were comparable with the newest. */
  compared: number;
  /** Where the run of comparable records ended before reaching N, and why. */
  stop?: { index: number; reason: string };
  /** Empty unless all N records were comparable. */
  survivors: PersistentSurvivor[];
}

/**
 * The survivors on every one of the newest `n` records (#472): the candidates
 * for an equivalent mutant, which survives on the same code night after night.
 *
 * `records` is newest first. Matching is the multiset of `diffRecords`, so a key
 * twice on every night counts 2. Every record is compared with the newest under
 * the key schema, Stryker version and config hash, and the run stops at the
 * first that disagrees or does not parse; short of `n`, nothing is listed.
 */
export function persistentSurvivors(records: readonly string[], n: number): Persistence {
  if (!Number.isInteger(n) || n < 1) throw new Error('N must be a whole number, at least 1');
  const parsed: ParsedRecord[] = [];
  let stop: Persistence['stop'];
  for (let index = 0; index < n; index += 1) {
    const source = records[index];
    if (source === undefined) {
      stop = { index, reason: 'there are no older records' };
      break;
    }
    let record: ParsedRecord;
    try {
      record = parseRecord(source);
    } catch {
      stop = { index, reason: 'the record could not be read' };
      break;
    }
    const changed = parsed[0] === undefined ? [] : changedBetween(parsed[0].header, record.header);
    if (changed.length > 0) {
      stop = { index, reason: `the ${nameList(changed)} changed` };
      break;
    }
    parsed.push(record);
  }
  const newest = parsed[0];
  if (stop !== undefined || newest === undefined) {
    return { compared: parsed.length, ...(stop && { stop }), survivors: [] };
  }

  const counts = parsed.map((record) => multiset(record.survivors));
  const survivors: PersistentSurvivor[] = [];
  const seen = new Set<string>();
  for (const line of newest.survivors) {
    const key = keyOf(line);
    if (seen.has(key)) continue;
    seen.add(key);
    const count = Math.min(...counts.map((tally) => tally.get(key) ?? 0));
    if (count === 0) continue;
    const { scope, file, mutator, original, replacement } = line;
    survivors.push({ scope, file, mutator, original, replacement, count });
  }
  return { compared: parsed.length, survivors };
}

export type RecordDecision = { ok: true; report: MutationReport } | { ok: false; reason: string };

export interface RecordDecisionInput {
  /** The mutation step's exit status as the workflow recorded it; `''` if none. */
  mutationStatus: string;
  /** `github.ref`. */
  ref: string;
  /** The report file's text, or `undefined` when there is none. */
  reportText: string | undefined;
}

/**
 * Whether tonight writes a record at all, and if not, why.
 *
 * Only after a clean mutation run — Stryker's config sets no break threshold, so
 * a non-zero exit is a crash and the report on disk may be partial — and only
 * from the default branch: a dispatch can target any ref, and its record would
 * become the next night's baseline. The status is a number or it is not echoed.
 */
export function shouldRecord(input: RecordDecisionInput): RecordDecision {
  if (input.mutationStatus === '') return { ok: false, reason: 'the mutation step did not run' };
  if (!/^\d{1,3}$/.test(input.mutationStatus)) {
    return { ok: false, reason: 'the mutation run ended with an unrecognised status' };
  }
  if (input.mutationStatus !== '0') {
    return { ok: false, reason: `the mutation run exited with status ${input.mutationStatus}` };
  }
  if (input.ref !== 'refs/heads/main') return { ok: false, reason: 'the run is not on main' };
  try {
    if (input.reportText === undefined) throw new Error('no report');
    return { ok: true, report: parseReport(input.reportText) };
  } catch {
    return { ok: false, reason: 'the mutation report could not be read' };
  }
}

/** `3699` as `3,699`, without asking the runner's locale. */
function grouped(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function nameList(names: string[]): string {
  const last = names.at(-1) ?? '';
  return names.length === 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
}

export interface LineInput {
  /** The reason the decision gave, when it refused; the line is then the not-written form. */
  skipped?: string;
  /** Tonight's record as it is on disk, or `undefined` when none is. */
  tonight: string | undefined;
  /** The newest record on the branch before tonight's, or `undefined` when there is none. */
  previous: string | undefined;
  /** The commit step's exit status; `''` when it did not run. */
  commitStatus: string;
}

function notWritten(reason: string): string {
  return `Survivors: not recorded tonight — ${reason}.`;
}

/**
 * The one summary line, in one of five forms: a diff, the first record, not
 * compared, the previous record unreadable, or not written.
 *
 * The previous record's short SHA and date are printed only after its commit and
 * `recordedAt` have passed their shape checks in `parseRecord` — they come from
 * an unprotected branch and a step summary renders Markdown.
 */
export function summaryLine(input: LineInput): string {
  if (input.skipped !== undefined) return notWritten(input.skipped);
  if (input.tonight === undefined) return notWritten('the record was not written');
  if (input.commitStatus !== '0') {
    return notWritten('the record could not be committed to the survivors branch');
  }

  let current: ParsedRecord;
  try {
    current = parseRecord(input.tonight);
  } catch {
    return notWritten("tonight's record could not be read back");
  }
  const total = `Survivors: ${grouped(current.survivors.length)} tonight`;
  if (input.previous === undefined) {
    return `${total} — the first record, so there is nothing to compare with.`;
  }

  let previous: ParsedRecord;
  try {
    previous = parseRecord(input.previous);
  } catch {
    return `${total} — the previous record could not be read, so no diff.`;
  }
  const since = `${previous.header.commit.slice(0, 7)} (${previous.header.recordedAt.slice(0, 10)})`;
  const comparison = diffRecords(previous, current);
  if (comparison.kind === 'not-compared') {
    return `${total} — not compared with ${since}: the ${nameList(comparison.changed)} changed.`;
  }
  return (
    `${total} — ${grouped(comparison.added)} new, ${grouped(comparison.gone)} gone since ${since}. ` +
    `On unchanged code, up to two either way is noise ([measured](${NOISE_LOG})).`
  );
}
