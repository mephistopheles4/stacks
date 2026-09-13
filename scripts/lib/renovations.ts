/**
 * The renovation record: why a counting rule changed, and whether the window survived.
 *
 * A **stamp** records the rule a number was produced under — `configHash` over
 * the Stryker configuration, `fixtureHash` over the complexity counting rule,
 * `duplicationHash` over the jscpd one. When a stamp moves, numbers either side
 * of it are not comparable, so the calibration window restarts. Until
 * [#227](https://github.com/mephistopheles4/stacks/issues/227) nothing anywhere
 * said **why** it moved: a reader of the trend page met a step change and
 * supplied their own story.
 *
 * This file is the home of record. One dated entry per change, each naming the
 * stamp, its new value, the reason, and the pull request that carried it.
 *
 * ⚠️ **Two kinds of entry, and only one of them is checkable.** A *stamp* entry
 * names a value a gate compares to the floors file. A *free* entry —
 * `"stamp": "none"` — records a change a reader notices and no stamp records:
 * a formatter adoption, a Node upgrade. Nothing can force a free entry, because
 * forcing means a comparison and there is no stamp to compare against. That is
 * a property of the class rather than a gap in the gate, and
 * [ADR-0085](../../docs/adr/0085-a-renovation-is-declared-and-the-window-may-survive.md)
 * states it.
 *
 * ⚠️ **An unrecognised stamp name is a parse error**, which is `parseCaps`'s
 * rule in `./floors.ts` for the same reason: a typo must not read as something
 * weaker. `"fixturehash"` would otherwise land as a free entry, leave the real
 * stamp unmarked, and pass the gate.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './repo-root.ts';

/** The file, at the repository root beside the two floors files it explains. */
export const RENOVATIONS_FILE = 'renovations.json';

/**
 * The three stamps, spelled as their floors files spell them.
 *
 * `configHash` and `fixtureHash` are fields of `stryker.floors.json`;
 * `duplicationHash` is a field of `jscpd.floors.json`. The marker keys on the
 * **stamp** and never on the file, because those two files are separate for
 * structural reasons that have nothing to do with this record.
 */
export const STAMP_NAMES = ['configHash', 'fixtureHash', 'duplicationHash'] as const;

export type StampName = (typeof STAMP_NAMES)[number];

/** `"none"` is a free entry: a renovation that moved no stamp. */
export type EntryStamp = StampName | 'none';

interface CommonRenovation {
  /** The day it landed, `YYYY-MM-DD`. Read by the trend page, never by a gate. */
  date: string;
  reason: string;
  /** The pull request that carried it. */
  pr: number;
}

/** A change that moved a stamp, and is therefore checkable by G57. */
export interface StampRenovation extends CommonRenovation {
  stamp: StampName;
  /** The value that stamp took. */
  value: string;
  /**
   * Whether the calibration window survives this change.
   *
   * ⚠️ **Required and never defaulted.** A default would let *nobody decided*
   * read as *the window restarts*, and this flag is the whole decision the
   * marker exists to record. `false` is the conservative answer and it is still
   * an answer somebody gave.
   */
  preserves: boolean;
}

/** A change no stamp records — a formatter adoption, a Node upgrade. */
export interface FreeRenovation extends CommonRenovation {
  stamp: 'none';
}

/**
 * One entry, in the only two shapes it may take.
 *
 * ⚠️ **A union rather than one interface with optional fields**, so the
 * compiler holds what `parseEntry` holds. The optional-field version said
 * *required on a stamp entry* in a comment and `value?: string` in the type, and
 * the cost was a guard in `acceptedValues` for a case the parser had already
 * made impossible — a dead branch that reads as a live one.
 */
export type Renovation = StampRenovation | FreeRenovation;

/** `sha256:` and 64 hex digits — the shape both floors files write. */
const DIGEST = /^sha256:[0-9a-f]{64}$/;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date that is both the right shape **and** a day that exists.
 *
 * ⚠️ **The shape check alone is not enough, and what it lets through is not a
 * local failure.** `renderRenovations` hands this value to `Date.parse`:
 * `2026-02-31` resolves to March 3 and puts the annotation on the wrong day,
 * and `2026-13-01` resolves to `NaN`. A NaN timestamp is *"invalid timestamp
 * NaN"* to `promtool tsdb create-blocks-from openmetrics`, which then writes
 * **zero blocks for the whole document** — and `pnpm trend:sync` joins the
 * markers with every real record before backfilling, so one bad date here loses
 * the entire import rather than one annotation. Measured through the real block
 * builder on [#227](https://github.com/mephistopheles4/stacks/issues/227).
 *
 * The round trip is the check: a day the calendar does not have comes back as a
 * different day, or as nothing.
 */
function isRealDay(date: string): boolean {
  if (!ISO_DAY.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

function isStampName(value: unknown): value is StampName {
  return STAMP_NAMES.includes(value as StampName);
}

export function parseRenovations(document: unknown): Renovation[] {
  if (typeof document !== 'object' || document === null) {
    throw new Error(`${RENOVATIONS_FILE} is not an object`);
  }

  const { renovations } = document as { renovations?: unknown };
  if (!Array.isArray(renovations)) {
    throw new Error(`${RENOVATIONS_FILE} carries no renovations list`);
  }

  return renovations.map((entry, index) => parseEntry(entry, index));
}

function parseEntry(entry: unknown, index: number): Renovation {
  const at = `renovation ${String(index + 1)}`;

  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${at} is not an object`);
  }
  const { date, stamp, value, reason, pr, preserves } = entry as Record<string, unknown>;

  if (typeof date !== 'string' || !ISO_DAY.test(date)) {
    throw new Error(`${at} carries a date that is not an ISO date: ${String(date)}`);
  }
  if (!isRealDay(date)) {
    throw new Error(
      `${at} carries a date that is the right shape and not a real date: ${date}. ` +
        'A day the calendar does not have renders as the wrong day or as NaN, and a NaN ' +
        'timestamp makes promtool reject the whole backfill document.',
    );
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error(`${at} carries no reason, so it marks nothing`);
  }
  if (typeof pr !== 'number' || !Number.isInteger(pr) || pr <= 0) {
    throw new Error(`${at} carries a value that is not a pull request number: ${String(pr)}`);
  }

  if (stamp === 'none') {
    if (value !== undefined) {
      // `JSON.stringify` rather than `String`: the field is whatever the file
      // held, and an object stringifies to `[object Object]`, which names
      // nothing to somebody reading the red.
      throw new Error(`${at} names no stamp and carries a value: ${JSON.stringify(value)}`);
    }
    if (preserves !== undefined) {
      throw new Error(`${at} names no stamp, so it preserves nothing`);
    }
    return { date, stamp: 'none', reason, pr };
  }

  if (!isStampName(stamp)) {
    throw new Error(
      `${at} carries "${String(stamp)}", which is not a stamp name. ` +
        `Expected one of ${STAMP_NAMES.join(', ')}, or "none" for a change that moves no stamp.`,
    );
  }
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${at} names ${stamp} and carries no value`);
  }
  if (!DIGEST.test(value)) {
    throw new Error(`${at} carries a value that is not a digest: ${value}`);
  }
  if (typeof preserves !== 'boolean') {
    throw new Error(
      `${at} names ${stamp} and does not say whether it preserves the calibration window`,
    );
  }

  return { date, stamp, value, reason, pr, preserves };
}

/** `renovations.json`, from the disk. */
export function readRenovations(root: string = REPO_ROOT): Renovation[] {
  return parseRenovations(JSON.parse(readFileSync(join(root, RENOVATIONS_FILE), 'utf8')));
}

/**
 * The newest entry for one stamp, which is the value a gate compares against.
 *
 * **File order and never date order.** Two renovations can land on one day, and
 * a sort by date would pick between them by an accident of the sort's
 * stability. The file is append-only by convention, so its order is the record.
 */
export function newestFor(
  renovations: readonly Renovation[],
  stamp: StampName,
): StampRenovation | undefined {
  return stampEntries(renovations, stamp).at(-1);
}

/** Every entry naming one stamp, in file order. Narrowed, so `value` is a string. */
function stampEntries(
  renovations: readonly Renovation[],
  stamp: StampName,
): readonly StampRenovation[] {
  return renovations.filter((entry): entry is StampRenovation => entry.stamp === stamp);
}

/**
 * Every stamp value whose runs still count toward this stamp's window.
 *
 * The newest value always counts. Each entry that declares `preserves` extends
 * the run one step further back, and the walk stops at the first entry that
 * does not — that entry's own value is still accepted, because what restarted
 * is the run *before* it.
 *
 * Newest first, and empty when no entry names the stamp: a stamp with no
 * marker accepts nothing here, and its caller keeps its own rule.
 */
export function acceptedValues(
  renovations: readonly Renovation[],
  stamp: StampName,
  onDisk: string,
): readonly string[] {
  const forStamp = stampEntries(renovations, stamp);

  // ⚠️ **The chain is trusted only while it describes the file in front of us.**
  // Without this, a head entry naming a superseded value would widen the window
  // with a rule nobody declared comparable to the current one — the route the
  // stamp exists to close, reopened by a stale marker. G57 makes that state a
  // red pull request, so this is the second lock rather than the only one, and
  // `deploy:site` runs where G57 does not.
  if (forStamp.at(-1)?.value !== onDisk) return [];

  const accepted: string[] = [];
  for (let i = forStamp.length - 1; i >= 0; i -= 1) {
    const entry = forStamp[i];
    if (entry === undefined) break;
    accepted.push(entry.value);
    if (!entry.preserves) break;
  }
  return accepted;
}
