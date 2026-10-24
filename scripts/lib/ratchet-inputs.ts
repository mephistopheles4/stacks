/**
 * What the ratchet's two readers both need before they can ask anything: the
 * window's records, and the mutants per scope from the last local run.
 *
 * Moved out of `scripts/deploy.ts` for #463, so `pnpm trend:sync` asks the
 * tightening question from the same rows by the same reads the deploy print
 * does, rather than a second copy of them.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readWindow, type Floors, type WindowStamps } from './floors.ts';
import { parseRecord, type ParsedRecord } from './metrics-read.ts';
import { parseRecordName, readRecord, type FetchedRecord } from './metrics-record.ts';
import {
  readDeclarations,
  readReport,
  scoreRun,
  total,
  type MutationReport,
  type Scope,
} from './mutation-score.ts';
import { acceptedValues, type Renovation } from './renovations.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * The two stamps a window is read under, each with the values its renovations
 * declared they preserve — ADR-0085.
 */
export function windowStamps(floors: Floors, renovations: readonly Renovation[]): WindowStamps {
  return {
    configHash: floors.configHash,
    configAccepted: acceptedValues(renovations, 'configHash', floors.configHash),
    fixtureHash: floors.fixtureHash,
    fixtureAccepted: acceptedValues(renovations, 'fixtureHash', floors.fixtureHash),
  };
}

/** Where `pnpm mutation:run` leaves its report on this machine. */
const REPORT_PATH = join(REPO_ROOT, 'artifacts', 'stryker', 'current', 'mutation.json');

/**
 * How many records one window read takes, at the most — deploy and trend-sync alike.
 *
 * Merge records are not window members, so a busy week of pushes sits between
 * two nightlies; this is the bound that keeps that from being an unbounded
 * walk. Generous rather than tight — reading a record is one `git cat-file`.
 */
const WINDOW_RECORD_CAP = 200;

/**
 * The last mutation run on this machine — and **three states, not two.**
 *
 * ⚠️ **Unreadable is its own answer, beside present and absent.** Both readers
 * are a bare `JSON.parse`, and a `pnpm mutation:run` interrupted partway
 * through its ~41 minutes leaves a truncated `mutation.json` behind. Read
 * unguarded, that throws out of a **print** and takes the whole deploy with it
 * — before the freshness verdict, before the gates, as a raw stack trace. The
 * two steps in `scripts/deploy.ts` say the panel prints and the refusals are separate; a parse
 * error broke both, and it broke them from the least important half.
 *
 * ⚠️ **One reader because there were two call sites and the crash was in both.**
 * Guarding deploy step 0b alone would have moved the stack trace two steps later
 * rather than removed it — the instance fixed and the population left, which is
 * the failure this rollout's own spec is a catalogue of.
 *
 * The distinction is kept rather than collapsed to `undefined`: *nobody ran it*
 * is the ordinary case on a fresh checkout, and *it is there and I cannot read
 * it* is a fault worth naming. Silently treating the second as the first is
 * this repo's oldest rule about instruments, broken.
 */
export type MutationRun =
  | { kind: 'none' }
  | { kind: 'unreadable'; why: string }
  | { kind: 'read'; report: MutationReport; scopes: Scope[] };

export function lastMutationRun(): MutationRun {
  if (!existsSync(REPORT_PATH)) return { kind: 'none' };

  try {
    return { kind: 'read', report: readReport(REPORT_PATH), scopes: readDeclarations().scopes };
  } catch (error) {
    return { kind: 'unreadable', why: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The records one window read takes, for the deploy print and for trend-sync.
 *
 * ⚠️ **A separate read from `trendRecords` in `scripts/deploy.ts`, and not a duplicate of it.** That
 * one answers *is the record fresh* and stops as soon as it has seen every
 * series plus one more scoring run — one or two records on a healthy machine.
 * This one answers *how far has each window filled*, which needs every
 * nightly back to where both streaks broke. Same store, same parser, different
 * question.
 *
 * It reads newest-first and stops once both streaks have ended inside the read,
 * keeping the row that broke each, and never on fewer than `WINDOW_RUNS + 1`
 * nightlies.
 * ⚠️ **Eleven nightlies was the rule until #464**, written when one nightly was
 * one sample; since ADR-0084 a sample is a distinct tree, and eleven nightlies
 * covered about five. The rule is `readWindow`'s, in `lib/floors.ts`, where a
 * test can plant it. The hard cap is what stops a store full of merge records,
 * which score nothing and are not window members, turning one read into an
 * unbounded walk.
 */
export function windowRecords(
  store: FetchedRecord | undefined,
  stamps: WindowStamps,
): ParsedRecord[] {
  if (store === undefined) return [];

  const ordered = store.names
    .map((name) => parseRecordName(name))
    .filter((record) => record !== undefined)
    .sort((one, other) => other.timestamp - one.timestamp || other.name.localeCompare(one.name))
    .map((record) => record.name);

  return readWindow(
    ordered,
    (name) => {
      const bytes = readRecord(store.tip, name);
      return bytes === undefined ? undefined : parseRecord(bytes);
    },
    stamps,
    WINDOW_RECORD_CAP,
  );
}

/**
 * Mutants per declared scope, from the newest local run, for the per-mutant
 * resolution the print and the breach both carry.
 *
 * ⚠️ **The scores come from the record and this comes from the local report,
 * and mixing them is deliberate.** A floor is derived from CI runs and compared
 * against CI runs — comparing one to a local report would be the two-machine
 * comparison the calibration rule exists to forbid. But *how many mutants a
 * scope holds* is a property of the tree rather than of the machine, and it is
 * the number that says whether a floor is one test away or ten. Absent when no
 * report exists, which prints as a line without it rather than as a silence.
 */
export function mutantsPerScope(run: MutationRun): Map<string, number> {
  const counts = new Map<string, number>();
  // ⚠️ **Three states, not two, and this reads none of them off the disk
  // itself.** `readReport` is a bare `JSON.parse`, and an interrupted
  // `pnpm mutation:run` leaves a truncated `mutation.json` — a third reader here
  // would throw out of the print and kill the deploy *before* the gates (or the sync), which
  // is the fault `lastMutationRun` was extracted to fix. *Nobody ran it* is
  // ordinary on a fresh checkout; *it is there and unreadable* is a fault worth
  // naming; collapsing them makes a corrupt report read as checked-and-clean.
  // Both non-`read` states degrade the line rather than refusing, on deploy section
  // 0b's rule that no report is a print and never a silence.
  if (run.kind !== 'read') return counts;

  const declarations = { scopes: run.scopes };
  const scored = scoreRun(run.report, declarations.scopes);
  for (const scope of declarations.scopes) {
    const tally = scored.perScope.get(scope.name);
    if (tally !== undefined && total(tally) > 0) counts.set(scope.name, total(tally));
  }
  return counts;
}
