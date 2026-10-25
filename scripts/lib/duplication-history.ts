/**
 * The whole-tree duplication series before anyone measured it, backfilled once
 * from git history ([#454](https://github.com/mephistopheles4/stacks/issues/454)).
 *
 * **Measured, not reconstructed.** One `jscpd --history` run scans every commit
 * up to `BACKFILL_TIP` under `THRESHOLDS`, and at every commit where it and a
 * nightly record overlap under one counting stamp they agree exactly: 97 of 97
 * (`docs/spec/duplication-backfill.md` §S10). So this module adds no counting
 * of its own — `duplication.ts`'s restraint, for its reason.
 *
 * ⚠️ **It never reaches the ratchet, and that is structural rather than
 * careful.** The result lives in a committed file, `jscpd.history.json`, and
 * `pnpm trend:sync` renders it into the local store under series names of its
 * own. No reader of the `metrics` branch can list it, and no record carries a
 * `run_ok` or a `run_info` for it — `floors.ts` counts every event but `push`
 * as a nightly, so an `event="backfill"` mark would have counted.
 * [ADR-0126](../../docs/adr/0126-the-duplication-backfill-is-a-committed-file.md).
 *
 * **Pure where it can be, with git and the subprocess at the edge**, which is
 * the split every counter here takes: `pointsFrom`, `parseHistory`,
 * `serialiseHistory` and `historyAction` touch nothing, and `measureHistory`
 * is the only function that runs anything.
 */

import { spawnSync } from 'node:child_process';
import {
  duplicationInputs,
  ignoredLinesIn,
  isTypeScript,
  runJscpdHistory,
  type HistoryReportPoint,
} from './duplication.ts';
import { duplicationHashOf } from './floors.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * The last commit the backfill measures: the parent of #262, which published
 * the first duplication series. A constant and never an argument, because a
 * backfill that ran past it would draw a second line over measured data.
 */
export const BACKFILL_TIP = 'aecb7cf8ca3af6cefd99e16205fa00d99fd89ded';

/** `BACKFILL_TIP`'s committer time, which also names the rendered record. */
const BACKFILL_TIP_AT = 1_787_677_348;

/**
 * #262's committer time. No backfilled point may sit at or after it, because
 * from that second on the nightly series is the measurement.
 */
export const NIGHTLY_START_AT = 1_787_678_208;

/** The committed file, at the repository root beside `jscpd.floors.json`. */
export const HISTORY_FILE = 'jscpd.history.json';

/**
 * The rendered record's name in `.trend/local/`.
 *
 * ⚠️ **A constant, so no edit to the data can rename it.** Named after its
 * first point, a file whose first point moved would arrive under a name the
 * store had never imported, and slip past the refusal for an edited copy while
 * the stale one stayed beside it.
 */
export const HISTORY_RECORD = `${String(BACKFILL_TIP_AT)}-history.prom`;

/** One commit's four counts, and nothing else from jscpd's point. */
export interface HistoryPoint {
  commit: string;
  /** The committer time, in unix seconds: when the commit landed on `main`. */
  at: number;
  clones: number;
  duplicatedLines: number;
  ignoredLines: number;
  totalLines: number;
}

/** `jscpd.history.json`, as the reader sees it. */
export interface History {
  tip: string;
  jscpdVersion: string;
  /** The stamp the nightly records carry as `duplication_hash`, for comparing the two. */
  duplicationHash: string;
  points: HistoryPoint[];
}

/** A first-parent commit and when it landed, oldest first. */
export interface Landed {
  commit: string;
  at: number;
}

/**
 * One point per first-parent commit, oldest first.
 *
 * ⚠️ **jscpd walks every commit in the range**, side branches included — 170
 * for this one, against 137 on the first parent — and adds a point for the
 * working tree. Only `main`'s own history is what landed, so everything else
 * is dropped here.
 *
 * ⚠️ **A report short of a first-parent commit is refused**, because that is
 * what `--history-limit`'s even sampling looks like: thirty points by default,
 * and nothing in the report says any were skipped.
 *
 * **Two commits in one second keep the descendant.** A series holds one sample
 * per timestamp, and the tree that stood at the end of that second is the
 * later one. `dafa958` and `69a479e` (#181 and #183) are the pair this exists
 * for.
 *
 * ⚠️ **jscpd's point carries more, and none of it is copied.** It also has
 * `subject` — the commit message — with `date`, `short`, `sources`, `tokens`
 * and `percentage`. A point is rebuilt from three of its counts plus the
 * committer time and the sweep, so no commit message reaches the file.
 */
export function pointsFrom(
  reported: readonly HistoryReportPoint[],
  firstParent: readonly Landed[],
  ignored: ReadonlyMap<string, number>,
): HistoryPoint[] {
  const byCommit = new Map(reported.map((entry) => [entry.commit, entry]));
  const missing = firstParent.filter((landed) => !byCommit.has(landed.commit));
  if (missing.length > 0) {
    throw new Error(
      `jscpd reported ${String(firstParent.length - missing.length)} of ${String(firstParent.length)} ` +
        'first-parent commits. A short report is what --history-limit sampling looks like, ' +
        'and a backfill with holes nobody can see is not one.',
    );
  }

  const points: HistoryPoint[] = [];
  for (const landed of firstParent) {
    const entry = byCommit.get(landed.commit);
    // Never taken: the refusal above already threw for any absent commit. It
    // is here so the type narrows without an assertion.
    if (entry === undefined) continue;
    const next: HistoryPoint = {
      commit: landed.commit,
      at: landed.at,
      clones: entry.clones,
      duplicatedLines: entry.duplicatedLines,
      ignoredLines: ignored.get(landed.commit) ?? 0,
      totalLines: entry.lines,
    };
    if (points.at(-1)?.at === next.at) points.pop();
    points.push(next);
  }
  requireIncreasing(points);
  return points;
}

function requireIncreasing(points: readonly HistoryPoint[]): void {
  for (let i = 1; i < points.length; i += 1) {
    const before = points[i - 1];
    const after = points[i];
    if (before !== undefined && after !== undefined && after.at <= before.at) {
      throw new Error(
        `point ${String(i)} does not increase in time on the one before it. The store ingests ` +
          'a document in order, and a sample that runs backwards rejects the whole of it.',
      );
    }
  }
}

// ── the committed file ───────────────────────────────────────────────────────

const COMMIT = /^[0-9a-f]{40}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const POINT_KEYS = [
  'commit',
  'at',
  'clones',
  'duplicatedLines',
  'ignoredLines',
  'totalLines',
] as const;

/**
 * The committed file, or a throw.
 *
 * `parseDeclarations`' rule: **a malformed file is never a partial one**, since
 * a half-read history draws a chart with holes nobody can see.
 *
 * ⚠️ **Bounds as well as types.** The sync joins every record into one document
 * for the block builder, and one timestamp it rejects writes no block for any
 * of them — `renovations.ts`'s `isRealDay` records the same trap. So a time is
 * a safe integer inside the backfill's range, and every count is one a tree
 * could have. Messages name a field and a position, never a value.
 */
export function parseHistory(document: unknown): History {
  if (typeof document !== 'object' || document === null) {
    throw new Error(`${HISTORY_FILE} is not an object`);
  }
  const { tip, jscpdVersion, duplicationHash, points } = document as Record<string, unknown>;

  if (tip !== BACKFILL_TIP) {
    throw new Error(`${HISTORY_FILE}'s tip is not BACKFILL_TIP, so it measured some other range`);
  }
  if (typeof jscpdVersion !== 'string' || !VERSION.test(jscpdVersion)) {
    throw new Error(`${HISTORY_FILE} carries no dotted jscpdVersion`);
  }
  if (typeof duplicationHash !== 'string' || !HASH.test(duplicationHash)) {
    throw new Error(`${HISTORY_FILE} carries no sha256 duplicationHash`);
  }
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error(`${HISTORY_FILE} has no points`);
  }

  const parsed = points.map((entry, index) => parsePoint(entry, index));
  requireIncreasing(parsed);
  const last = parsed.at(-1);
  if (last !== undefined && last.at >= NIGHTLY_START_AT) {
    throw new Error(
      `${HISTORY_FILE}'s last point is at or after #262, where the nightly series starts`,
    );
  }
  return { tip, jscpdVersion, duplicationHash, points: parsed };
}

function parsePoint(entry: unknown, index: number): HistoryPoint {
  const where = `${HISTORY_FILE} point ${String(index)}`;
  if (typeof entry !== 'object' || entry === null) throw new Error(`${where} is not an object`);
  const fields = entry as Record<string, unknown>;

  if (typeof fields.commit !== 'string' || !COMMIT.test(fields.commit)) {
    throw new Error(`${where} has no 40-character commit`);
  }
  for (const key of POINT_KEYS.slice(1)) {
    const count = fields[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`${where} has no ${key} that is a non-negative safe integer`);
    }
  }
  const point = fields as unknown as HistoryPoint;
  if (point.at === 0) throw new Error(`${where} has no positive at`);
  if (point.duplicatedLines > point.totalLines) {
    throw new Error(`${where} has more duplicated lines than lines`);
  }
  return {
    commit: point.commit,
    at: point.at,
    clones: point.clones,
    duplicatedLines: point.duplicatedLines,
    ignoredLines: point.ignoredLines,
    totalLines: point.totalLines,
  };
}

/**
 * The file's bytes: two-space JSON and a final newline, which Prettier leaves as
 * it is, so a format pass never breaks a byte-identical rerun.
 */
export function serialiseHistory(history: History): string {
  const document = {
    $comment: [
      'Written by `pnpm duplication:report --history`, never by hand. The whole-tree',
      'duplication counts for every first-parent commit up to the parent of #262, measured',
      'by jscpd --history under THRESHOLDS. Two commits in one second keep the descendant.',
      'See docs/spec/duplication-backfill.md and ADR-0126.',
    ],
    tip: history.tip,
    jscpdVersion: history.jscpdVersion,
    duplicationHash: history.duplicationHash,
    points: history.points.map((point) =>
      Object.fromEntries(POINT_KEYS.map((key) => [key, point[key]])),
    ),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

// ── the rendered copy in the local store ─────────────────────────────────────

/** The committed file as the sync found it. */
export type Committed =
  { state: 'ok'; rendered: string } | { state: 'missing' } | { state: 'malformed'; reason: string };

/**
 * The committed file's text, read and rendered, or why it could not be.
 *
 * ⚠️ **A JSON syntax error is reported as fixed text and never by its message**,
 * because V8's message can quote a snippet of the file. `parseHistory`'s own
 * messages name a field and a position only, so those pass through. `render`
 * is a parameter so this module needs nothing from the metrics renderer.
 */
export function committedFrom(
  text: string | undefined,
  render: (history: History) => string,
): Committed {
  if (text === undefined) return { state: 'missing' };
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { state: 'malformed', reason: 'it is not JSON' };
  }
  try {
    return { state: 'ok', rendered: render(parseHistory(document)) };
  } catch (error) {
    return { state: 'malformed', reason: error instanceof Error ? error.message : 'unknown' };
  }
}

/** What the sync does with the rendered copy. */
export type HistoryAction =
  | { kind: 'write'; name: string; bytes: string }
  | { kind: 'none' }
  | { kind: 'refuse'; message: string }
  | { kind: 'warn'; message: string };

/**
 * The rendered copy's fate, given the committed file and what the store holds.
 *
 * **A file that cannot be read costs only the backfill.** It warns and the sync
 * carries on, as `writeAsks` does when it cannot judge: a broken data file must
 * not stop the nightly records reaching the page.
 *
 * ⚠️ **A copy the store has already imported is never rewritten.** A changed
 * value at the same timestamp cannot be undone by adding blocks, so the sync
 * refuses and names `--rebuild` — `renovations.json`'s rule for an edited
 * entry. A history record under any other name is refused the same way, so a
 * stale copy never sits beside the current one.
 */
export function historyAction(input: {
  committed: Committed;
  existing: ReadonlyMap<string, string>;
  imported: readonly string[];
}): HistoryAction {
  const stray = [...input.existing.keys()].filter((name) => name !== HISTORY_RECORD);
  if (stray.length > 0) {
    return {
      kind: 'refuse',
      message:
        `.trend/local/ holds a history record under another name: ${stray.join(', ')}.\n` +
        `  Only ${HISTORY_RECORD} is the backfill. Delete the other, then run\n` +
        '  `pnpm trend:sync --rebuild` so the store drops what it imported from it.',
    };
  }

  if (input.committed.state !== 'ok') {
    return {
      kind: 'warn',
      message:
        input.committed.state === 'missing'
          ? `! ${HISTORY_FILE} is missing, so the backfill was not refreshed; a copy the store already holds is still drawn`
          : `! ${HISTORY_FILE} cannot be read (${input.committed.reason}), so the backfill was not refreshed; a copy the store already holds is still drawn`,
    };
  }

  const held = input.existing.get(HISTORY_RECORD);
  if (held === input.committed.rendered) return { kind: 'none' };
  if (held !== undefined && input.imported.includes(HISTORY_RECORD)) {
    return {
      kind: 'refuse',
      message:
        `${HISTORY_FILE} changed after the store imported it.\n` +
        '  A changed value at the same timestamp cannot be undone by adding blocks.\n' +
        '  `pnpm trend:sync --rebuild` drops the local blocks and imports it again.',
    };
  }
  return { kind: 'write', name: HISTORY_RECORD, bytes: input.committed.rendered };
}

// ── the measurement ──────────────────────────────────────────────────────────

/**
 * git, for its lines, telling "matched nothing" from "failed".
 *
 * ⚠️ **`gitOutput` cannot be used for `grep`**: it answers `undefined` for every
 * non-zero exit, and `git grep` exits 1 when nothing matched. A failed sweep
 * read as an empty one is a zero nobody measured.
 *
 * So these two helpers are an exception to ADR-0030's rule that git's capture
 * contracts live in `git.ts`, named here the way `commit-metrics.ts` names its
 * own. Both keep the no-shell half: an argument array, never a command line.
 */
function gitLines(args: readonly string[], root: string): string[] {
  const result = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status === 1 && args[0] === 'grep') return [];
  if (result.status !== 0) throw new Error(`git ${args[0] ?? ''} failed`);
  return result.stdout.split('\n').filter((line) => line !== '');
}

/**
 * One blob's text, byte for byte. Not through `gitLines`, which drops blank
 * lines — and a suppression block's span is counted in lines.
 */
function blobText(commit: string, path: string, root: string): string {
  const result = spawnSync('git', ['cat-file', 'blob', `${commit}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git cat-file failed on ${path} at ${commit}`);
  return result.stdout;
}

/** The skip rule `walkSource` applies on disk, applied to a path from a git tree. */
function walked(path: string): boolean {
  return !path
    .split('/')
    .slice(0, -1)
    .some((part) => part.startsWith('.') || ['node_modules', 'dist', 'artifacts'].includes(part));
}

/**
 * Lines one commit's tree declares suppressed, by the repository's own sweep.
 *
 * `git grep` names the candidate files and `ignoreBlocksIn` counts each one, so
 * the number is the same rule the nightly applies to the tree on disk. The
 * pattern leaves out the marker on purpose: this file is inside both
 * populations, and `duplication.ts` explains why none of them may spell it.
 */
function ignoredLinesAt(commit: string, root: string): number {
  const files = gitLines(
    ['grep', '-l', '-E', 'ignore-(start|end)', commit, '--', '*.ts', '*.tsx', '*.mts', '*.cts'],
    root,
  )
    .map((line) => line.slice(commit.length + 1))
    .filter((path) => isTypeScript(path) && walked(path));

  return files.reduce((sum, path) => sum + ignoredLinesIn(blobText(commit, path, root), path), 0);
}

/** The whole backfill, measured: one jscpd run, the first-parent list and the sweep. */
export function measureHistory(root: string = REPO_ROOT): History {
  const firstParent = gitLines(
    ['log', '--first-parent', '--reverse', '--format=%H %ct', BACKFILL_TIP],
    root,
  ).map((line) => {
    const [commit = '', at = ''] = line.split(' ');
    return { commit, at: Number(at) };
  });

  const ignored = new Map(
    firstParent.map((landed) => [landed.commit, ignoredLinesAt(landed.commit, root)]),
  );
  const inputs = duplicationInputs();
  return {
    tip: BACKFILL_TIP,
    jscpdVersion: inputs.jscpdVersion,
    duplicationHash: duplicationHashOf(inputs),
    points: pointsFrom(runJscpdHistory(BACKFILL_TIP, root), firstParent, ignored),
  };
}
