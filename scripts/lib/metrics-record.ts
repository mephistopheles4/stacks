/**
 * Where the record lives, and which of it a sync has not seen.
 *
 * **Exactly one piece of code knows where the record lives**, which is this
 * one. `pnpm trend:sync` pulls the branch through here, and the deploy-side
 * staleness refusal reads it through here too — a second answer to *where is
 * the record* is the shape that lets two checks disagree about whether one
 * exists. See `docs/spec/trend-layer.md` §1.
 *
 * The record is **durable, never immutable**: the `metrics` branch is
 * unprotected and force-pushable by construction, and append-only is a
 * convention enforced by nothing. The argument lives in
 * [ADR-0055](../../docs/adr/0055-ci-writes-a-durable-record.md).
 *
 * ⚠️ **The fetch is anonymous and writes a remote-tracking ref**, rather than
 * being read out of `FETCH_HEAD`. The repo is public, so no credential is
 * involved at this end — and a real ref is what keeps the objects of the tip a
 * previous sync imported from being pruned, which is what
 * `isFastForward` needs to be able to answer at all. `commit-metrics.ts`'s
 * shallow fetch is the other end and has no such need: it appends and pushes.
 */

import { gitOutput, gitStatus } from './git.ts';
import { REPO_ROOT } from './repo-root.ts';

/** The orphan branch CI commits one `.prom` file per run to. */
export const METRICS_BRANCH = 'metrics';

/** The directory inside that branch, and inside the local store, holding them. */
export const RECORD_DIR = 'metrics';

/** Where a fetched branch is kept locally. */
export const METRICS_REF = `refs/remotes/origin/${METRICS_BRANCH}`;

export interface RecordName {
  name: string;
  /** Unix seconds, from the filename — the cheapest possible staleness read. */
  timestamp: number;
  /** The commit CI recorded, or `edge` for a locally-written probe row. */
  source: string;
}

/**
 * `<timestamp>-<sha>.prom`, or `undefined` for anything else.
 *
 * Undefined rather than a guess: a name this cannot date has no place in a
 * timestamp-ordered import, and inventing one would put its samples at the
 * wrong hour permanently — a replay is exactly what this record exists to make
 * possible.
 */
export function parseRecordName(name: string): RecordName | undefined {
  const match = /^(\d+)-([0-9a-z]+)\.prom$/.exec(name);
  if (match === null) return undefined;

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return undefined;

  return { name, timestamp, source: match[2] ?? '' };
}

/**
 * The records to import, oldest first.
 *
 * **By name and not by watermark.** *"Newer than what is stored"* is the spec's
 * phrase and a timestamp alone cannot spell it: two runs can share a second but
 * not a second *and* a commit, so a merge and a nightly landing together would
 * cost the second one permanently. The imported set is small — one entry per CI
 * run — and it makes the second run of a sync a no-op by construction rather
 * than by arithmetic.
 *
 * Sorted because promtool appends as it parses: a document whose samples run
 * backwards is a rejected file, not a re-ordered one.
 */
export function selectNewRecords(
  available: readonly string[],
  imported: readonly string[],
): string[] {
  const seen = new Set(imported);

  return available
    .map((name) => parseRecordName(name))
    .filter((record): record is RecordName => record !== undefined)
    .filter((record) => !seen.has(record.name))
    .sort((one, other) => one.timestamp - other.timestamp || one.name.localeCompare(other.name))
    .map((record) => record.name);
}

/**
 * The newest record written by a CI run, which is the one a new run's PR window
 * is measured against.
 *
 * **Surface D's rows are skipped, and that is the whole subtlety here.** They
 * share the store and sort by the same key, they are newer than every CI record
 * on a machine that has just synced, and `edge` stands where a commit does — so
 * taking the newest row outright would hand `git log` the string `edge` and make
 * every window `unknown` from the first sync onwards. The commit is read from
 * the **filename** rather than from the document: `<timestamp>-<sha12>.prom`
 * already carries it, and an abbreviated sha is a revision git resolves.
 */
export function newestCommitRecord(names: readonly string[]): RecordName | undefined {
  return names
    .map((name) => parseRecordName(name))
    .filter((record): record is RecordName => record !== undefined)
    .filter((record) => /^[0-9a-f]{7,40}$/.test(record.source))
    .sort((one, other) => one.timestamp - other.timestamp || one.name.localeCompare(other.name))
    .at(-1);
}

export interface FetchedRecord {
  /** The branch tip this listing came from. */
  tip: string;
  /** Every `.prom` filename on it, unordered. */
  names: string[];
}

/**
 * Fetch the branch and list what is on it, or `undefined` when it cannot.
 *
 * `undefined` covers offline, no remote, and a branch nobody has written yet —
 * all three leave the caller with the same move, which is to carry on with
 * whatever is already in the store and say what happened.
 */
export function fetchRecords(cwd: string = REPO_ROOT): FetchedRecord | undefined {
  const fetched = gitStatus(
    ['fetch', '--no-tags', 'origin', `+refs/heads/${METRICS_BRANCH}:${METRICS_REF}`],
    cwd,
  );
  if (fetched !== 0) return undefined;

  const tip = gitOutput(['rev-parse', METRICS_REF], cwd);
  if (tip === undefined || tip === '') return undefined;

  const listing = gitOutput(['ls-tree', '--name-only', tip, `${RECORD_DIR}/`], cwd);
  if (listing === undefined) return undefined;

  const names = listing
    .split('\n')
    .map((line) => line.trim().replace(new RegExp(`^${RECORD_DIR}/`), ''))
    .filter((name) => name !== '');

  return { tip, names };
}

/**
 * One record's bytes, straight out of the object store.
 *
 * `cat-file` rather than `show`, because this wants the blob as it was
 * committed and not as a checkout filter would render it — a `.prom` file with
 * a `\r` in it is a parse error over the whole document.
 */
export function readRecord(tip: string, name: string, cwd: string = REPO_ROOT): string | undefined {
  return gitOutput(['cat-file', 'blob', `${tip}:${RECORD_DIR}/${name}`], cwd);
}

/**
 * Whether the branch has only grown since the tip a sync last imported.
 *
 * ⚠️ **Tamper-evident, and deliberately not tamper-proof.** Nothing can stop a
 * force-push to an unprotected branch; what this buys is that the next sync
 * *notices*, rather than importing across a rewrite and leaving a store nobody
 * can reconcile with the branch. `docs/spec/trend-layer.md` §8 recorded the
 * mechanism as a candidate and left adopting it to the implementation session:
 * adopted, because once a floor is armed the branch's history **is** its
 * calibration evidence, and a rewrite that goes unnoticed is worse than an
 * unarmed floor — it is indistinguishable from a good one.
 *
 * `true` when the stored tip is unknown to git at all, which is the honest
 * answer for a store whose objects were pruned: this cannot see a rewrite there
 * and must not claim to.
 */
export function isFastForward(from: string, to: string, cwd: string = REPO_ROOT): boolean {
  if (from === to) return true;
  if (gitOutput(['cat-file', '-e', `${from}^{commit}`], cwd) === undefined) return true;

  return gitStatus(['merge-base', '--is-ancestor', from, to], cwd) === 0;
}
