/**
 * The reading ritual, as text: what `pnpm deploy:site` prints, and what it says
 * when it refuses.
 *
 * **It prints, and separately it refuses.** The score is printed and never
 * refuses — *"write better tests"* is not a diff and a mutation score of 71.4%
 * has no named remedy — while the refusals here are about the **instrument**:
 * a record too stale to read is not a number you can act on. See
 * `docs/spec/trend-layer.md` §4 and [ADR-0054](../../docs/adr/0054-a-check-is-a-gate-or-a-trend.md).
 *
 * ⚠️ **The panel order is fixed and is not cosmetic.** *Is this real* comes
 * before *is this bad*, because this repo has conflated those two questions
 * before ([ADR-0027](../../docs/adr/0027-deploy-check-reports-refusal.md)) — and
 * because a delta with an **empty PR window** reads *tool noise* on sight,
 * which is a direct measurement of
 * [stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073)
 * rather than a signal about the code. **A score never appears without its
 * run**, which is why the run line is printed even when nothing moved.
 *
 * Everything here is a pure function over parsed records. The git reads, the
 * clock and the printing belong to `scripts/deploy.ts`.
 */

import {
  deltaPair,
  describeAge,
  halfOf,
  runHealthOf,
  runInfoOf,
  samplesOf,
  scoresOf,
  type ParsedRecord,
  type RecordVerdict,
} from "./metrics-read.ts";
import type { TrendName } from "./metrics.ts";
import { detected, total, type Tally } from "./mutation-score.ts";

/** Where a person goes to see whether the nightly is still running. */
export const METRICS_ACTIONS_URL =
  "https://github.com/mephistopheles4/stacks/actions/workflows/metrics.yml";

/** `1755600000` → `2026-08-19`, which is how a stale date is worth reading. */
export function asDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

/**
 * The pull requests merged between two runs — the window, already resolved.
 *
 * `undefined` means *nobody could say*: the commits a record names are not in
 * this checkout. That is deliberately not the same as `[]`, which is a real
 * measurement — **a nightly runs whether or not `main` moved**, so an empty
 * window beside a non-zero delta is the tool disagreeing with itself.
 */
export type PrWindow = readonly string[] | undefined;

export interface PanelInput {
  /** Unix seconds. */
  now: number;
  /** What the store holds, newest first. */
  records: readonly ParsedRecord[];
  /** How many records the store holds in total, which may exceed those parsed. */
  held: number;
  window: PrWindow;
  /** Per-mutant resolution from the last local mutation run, by scope. */
  resolution?: Map<string, Tally>;
  /** Why there is no resolution to show, when there is none. */
  resolutionNote?: string;
}

function percent(score: number): string {
  return `${(score * 100).toFixed(2)}%`;
}

/** `+0.15`, `-0.02`, in points of score rather than in fractions. */
function delta(now: number, before: number): string {
  const points = (now - before) * 100;
  return `${points >= 0 ? "+" : "-"}${Math.abs(points).toFixed(2)}`;
}

function resolutionOf(tally: Tally): string {
  const parts = [
    `killed ${String(tally.killed)}`,
    `timeout ${String(tally.timeout)}`,
    `survived ${String(tally.survived)}`,
    `no coverage ${String(tally.noCoverage)}`,
  ];
  if (tally.ignored > 0) parts.push(`ignored ${String(tally.ignored)}`);
  if (tally.errors > 0) parts.push(`errors ${String(tally.errors)}`);
  return `${parts.join(", ")} — ${String(detected(tally))}/${String(total(tally))}`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/**
 * The records carrying a score, newest first — the panel's actual subject.
 *
 * ⚠️ **Not simply the newest record.** `metrics.yml` writes on `push: main`
 * too, and a merge record legitimately carries no score; the newest record in
 * a busy week is therefore a runtime, four counts, and no score at all. **A score never
 * appears without its run**, so the run panel 1 names is the run that produced
 * the score — not whichever row landed last. Exported because the PR window is
 * computed between exactly this pair, and computing it between a different two
 * runs would attribute a movement to pull requests that had nothing to do with
 * it.
 */
export function scoredRecords(
  records: readonly ParsedRecord[],
): ParsedRecord[] {
  return records.filter((record) => scoresOf(record).size > 0);
}

/**
 * The four counts, and the word each is printed under.
 *
 * **The series names are not written twice.** `COMPLEXITY_SERIES` in
 * `./metrics.ts` is derived from the emitter's own table, and
 * `trend-report.test.ts` holds this list to it in order — so a fifth count
 * added there and not here prints three of four and goes red, rather than
 * printing three of four and saying nothing.
 *
 * ⚠️ **`mass over 10` is spelled out rather than shown as a ratio.** Spec §2:
 * the record carries counts and the *page* derives shares, because no ratio
 * survived both gaming tests. A share printed here would be the statistic the
 * measurement was designed to avoid.
 */
export const COMPLEXITY_COUNTS = [
  ["complexity-functions", "functions"],
  ["complexity-mass", "mass"],
  ["complexity-mass-over-10", "mass over 10"],
  ["complexity-max", "max"],
] as const satisfies readonly (readonly [TrendName, string])[];

/**
 * Any one of the four answers for the group.
 *
 * `complexityFactsOf` fails the set together, so a record carrying one family
 * carries all four — which makes *which* series the pairing is anchored on a
 * detail rather than a decision, and picking the first keeps it from becoming
 * a second hand-written name.
 */
const [[COMPLEXITY_ANCHOR]] = COMPLEXITY_COUNTS;

/** `+3`, `-10`, `+0` — whole branches, always signed, never a percentage. */
function countDelta(now: number, before: number): string {
  const moved = now - before;
  return `${moved >= 0 ? "+" : "-"}${String(Math.abs(moved))}`;
}

/**
 * What a row says where its delta would go — three states, in one place.
 *
 * ⚠️ **Three and not two, and the two absences are different facts.** No
 * earlier record at all is a fact about the **store**; a row the earlier record
 * did not carry is a fact about the **declaration**; and printing `(+0)` for
 * either would read as a movement nothing measured.
 *
 * **One authority because two blocks say it.** The score block and the counts
 * block reached this shape independently and wrote it out verbatim, differing
 * only in how the number is formatted. A third caller spelling *"new scope"*
 * some other way is the same class of defect as the refusal column that ran a
 * series name into its own explanation: nothing fails, and the wording is
 * wrong in the one place it is read from.
 */
function movedLabel(
  previous: unknown,
  was: number | undefined,
  format: (was: number) => string,
): string {
  if (previous === undefined) return "first run";
  return was === undefined ? "new scope" : `(${format(was)})`;
}

/**
 * The four counts per scope, each against the previous record of its own half.
 *
 * ⚠️ **Halves, and never `scoredRecords`.** The counts land on both the merge
 * and the nightly, so the pairing this block needs is the one `deltaPair`
 * derives from `halfOf` — a merge read against a nightly reports a movement
 * across an interval nobody asked about. The mutation block next door pairs
 * nightly-to-nightly for free, because a merge record carries no score; that
 * accident does not extend to here, and reusing it would look like it did.
 *
 * ⚠️ **Absent is not zero, and it is the common case for a while.** A record
 * written before the series existed and a run whose population yielded no
 * function both arrive with no families at all — `complexityFactsOf` omits the
 * set rather than emitting a `0` for `max`, which is a legal value for a scope
 * of trivial functions. So this says *no record carries them* and prints no
 * number, rather than printing a wall of zeroes that reads as a measurement.
 *
 * **It never refuses.** Nothing in this block has a remedy that is a finite
 * diff — the cap in `./floors.ts` is where a complexity number acquires teeth.
 *
 * ⚠️ **It names its own record, because that is not the run panel 1 printed.**
 * Panel 1 shows the newest *scored* run, and this anchors on the newest
 * *carrier* — a merge carries counts and no score, so on a busy week the two
 * are different records and the print would otherwise show a merge's counts
 * under a nightly's commit. Observed by running it, not by reading it. *A
 * score never appears without its run*, one level down: a count does not
 * either.
 */
export function renderComplexity(
  records: readonly ParsedRecord[],
  now: number,
): string[] {
  const { latest, previous } = deltaPair(records, COMPLEXITY_ANCHOR);
  if (latest === undefined) {
    return [
      "  complexity  no record read carries the four counts — absent is not zero",
    ];
  }

  const half = halfOf(latest);
  const named = half ?? "comparable";
  const info = runInfoOf(latest);
  const age =
    latest.timestamp === undefined
      ? ""
      : `  ${describeAge(now - latest.timestamp)} ago`;
  const lines = [
    `  complexity — four counts per scope, ${
      previous === undefined
        ? `no earlier ${named} record carries them, so nothing below is a movement`
        : `against the previous ${named} record`
    }`,
    `    counted  ${(info?.["commit"] ?? "unknown").slice(0, 12)}  ${named}${age}`,
  ];

  const current = COMPLEXITY_COUNTS.map(([series]) =>
    samplesOf(latest, series),
  );
  const earlier = COMPLEXITY_COUNTS.map(([series]) =>
    previous === undefined
      ? new Map<string, number>()
      : samplesOf(previous, series),
  );

  // Scope order is the anchor family's, so the four lines of a scope stay
  // together and the scopes stay in the order the mutation block above printed
  // them — both read off `stryker.scopes.json` in the emitter.
  const scopes = [...(current[0]?.keys() ?? [])];
  const scopeWidth = Math.max(0, ...scopes.map((scope) => scope.length));
  const labelWidth = Math.max(
    ...COMPLEXITY_COUNTS.map(([, label]) => label.length),
  );
  const valueWidth = Math.max(
    0,
    ...current.flatMap((samples) =>
      [...samples.values()].map((value) => String(value).length),
    ),
  );

  for (const scope of scopes) {
    COMPLEXITY_COUNTS.forEach(([, label], index) => {
      const value = current[index]?.get(scope);
      if (value === undefined) return;
      const was = earlier[index]?.get(scope);
      const moved = movedLabel(previous, was, (before) =>
        countDelta(value, before),
      );
      lines.push(
        `    ${pad(scope, scopeWidth)}  ${pad(label, labelWidth)}  ${String(value).padStart(valueWidth)}  ${moved}`.trimEnd(),
      );
    });
  }
  return lines;
}

/**
 * The panel, as lines.
 *
 * Empty when the store holds nothing — **printing that a record has never
 * arrived is the whole of what the bootstrap does**, and it is the caller's
 * line to write, since only the caller knows the spine's date.
 */
export function renderPanel(input: PanelInput): string[] {
  const [newest] = input.records;
  if (newest === undefined) return [];

  const age =
    newest.timestamp === undefined
      ? "unknown"
      : `${describeAge(input.now - newest.timestamp)} ago`;
  const lines = [
    `\ntrend record — ${String(input.held)} record(s) in the local store, newest ${age}`,
  ];

  const [latest, previous] = scoredRecords(input.records);
  lines.push("  is this real");

  if (latest === undefined) {
    lines.push(
      `    run      no run in the ${String(input.records.length)} record(s) read carries a mutation score`,
    );
  } else {
    const info = runInfoOf(latest);
    const scoredAge =
      latest.timestamp === undefined
        ? ""
        : `  ${describeAge(input.now - latest.timestamp)} ago`;
    lines.push(
      `    run      ${(info?.["commit"] ?? "unknown").slice(0, 12)}  ${info?.["event"] ?? "unknown"}${scoredAge}  ${info?.["run_url"] ?? ""}`.trimEnd(),
    );
    // ⚠️ **Printed when the run was *not* healthy, and when it did not say —
    // so silence here means `run_ok 1` and nothing else.** The panel keeps
    // showing the newest scored run whatever its health, because a score from a
    // run whose suite step failed is still a real measurement and skipping it
    // would compute the delta against the wrong window. What it must not do is
    // show that score as though nothing happened: panel 1 is *is this real*,
    // and the run's own health is exactly that question.
    //
    // ⚠️ **This is where the print and the floor legitimately part company.**
    // The ratchet refuses to compare a floor against a `run_ok 0` row, on the
    // asymmetry that such a row could never have *set* the floor it breached.
    // A print showing it is honest; a refusal firing on it is not. The two
    // predicates differ on purpose — see `scoredIn` in `./floors.ts` — and
    // aligning them back together would restore the defect this line reports.
    const health = runHealthOf(latest);
    if (health !== true) {
      lines.push(
        `    health   ${
          health === undefined
            ? "no run_ok sample — this record does not say whether its run completed"
            : "run_ok 0 — the run did not compute every series it declared; its scores are real, and something else it set out to measure is missing"
        }`,
      );
    }

    lines.push(
      `    window   ${
        input.window === undefined
          ? "unknown — the commits these records name are not in this checkout"
          : input.window.length === 0
            ? "[] — no pull request merged since the previous scored run, so any movement below is the tool disagreeing with itself"
            : input.window.join(", ")
      }`,
    );
  }

  const scores =
    latest === undefined ? new Map<string, number>() : scoresOf(latest);
  const before =
    previous === undefined ? new Map<string, number>() : scoresOf(previous);

  lines.push(
    "  is this bad — each scope against its own history, never against a target",
  );
  if (scores.size === 0) {
    lines.push(
      "    nothing to read — no run in the records read carries a per-scope score",
    );
  }

  const width = Math.max(0, ...[...scores.keys()].map((scope) => scope.length));
  for (const [scope, score] of scores) {
    const was = before.get(scope);
    const moved = movedLabel(previous, was, (earlier) => delta(score, earlier));
    const tally = input.resolution?.get(scope);
    lines.push(
      `    ${pad(scope, width)}  ${percent(score).padStart(7)}  ${pad(moved, 12)}${
        tally === undefined ? "" : resolutionOf(tally)
      }`.trimEnd(),
    );
  }
  if (input.resolutionNote !== undefined)
    lines.push(`    ${input.resolutionNote}`);

  // ⚠️ **Directly under the score, and the order is the page's order.** A
  // scope whose mass is rising while its mutation score holds or falls is
  // where the next tests go, and that reading needs both numbers in one
  // glance — which is also why the four panels sit under the mutation panel in
  // `grafana/dashboards/trend-layer.json` rather than in a section of their own.
  lines.push(...renderComplexity(input.records, input.now));

  // ⚠️ **This line said "none yet — every scope is unfloored until the ratchet
  // lands" and the ratchet has landed**, so it now points at the block that
  // owns the answer instead of standing in for it. It was written as a
  // placeholder on purpose — *a line that simply is not there teaches nobody
  // that it is coming* — and the same argument is why it is corrected rather
  // than deleted: a person reading this block is the whole mechanism by which
  // an unarmed scope ever gets armed.
  //
  // ⚠️ **It names the file and claims nothing about what is in it.** Two
  // wordings were wrong before this one: *"none yet"* went false the moment the
  // ratchet landed, and *"every scope is unarmed"* would go false the moment
  // somebody arms one — a decaying claim in a panel that cannot read the file it
  // describes. *"See the block below"* was wrong too, more quietly: this panel
  // prints under `--check-only`, where the floors block deliberately does not
  // run, so it promised something that was not there.
  //
  // `scripts/lib/floors.ts` reads `stryker.floors.json` and prints the state.
  // One authority, pointed at rather than summarised.
  lines.push(
    "  floors     stryker.floors.json — the mutation floors block reads it, and arming one is a human judgement per scope after its window fills",
  );
  return lines;
}

/**
 * What the one fetch found, as three cases that cannot be confused.
 *
 * A union rather than a `kind` beside optional fields: `newer` without its
 * count is not a state this can be in, and typing it as one would need a
 * `?? 0` at the point of printing — a default standing in for a case the
 * design forbids, which is how a message comes to say *0 records you have not
 * imported* and send somebody the wrong way.
 */
export type Disambiguation =
  /** The branch holds records the store does not — you have not synced. */
  | { kind: "newer"; newer: number }
  /** The branch is no fresher, so the nightly has stopped writing. */
  | { kind: "same"; branchNewest?: string }
  /** Nothing answered, so which of the two this is stays open. */
  | { kind: "unreachable" };

/**
 * The refusal, including the half that took one request to know.
 *
 * ⚠️ **A stale local store is the one pair in this design that genuinely fires
 * as a single fault with two opposite fixes**: *you have not synced*, and *CI
 * stopped writing*. They wear the same face at the machine, so the refusal
 * spends one anonymous fetch of the branch tip to tell them apart — one
 * request, two messages. Extending
 * [ADR-0027](../../docs/adr/0027-deploy-check-reports-refusal.md)'s discipline
 * from the origin's answer to the **fault**.
 */
export function renderRefusal(
  verdict: RecordVerdict,
  now: number,
  probe: Disambiguation,
  scanned: number,
): string {
  // ⚠️ Measured from the names being printed, not fixed at the width of the
  // longest one that existed when this was written. A hardcoded 22 held until
  // `complexity-mass-over-10` arrived at 23, and `pad` returns an over-long
  // name unchanged — so the series ran straight into its own explanation with
  // no space, in the message a refusal is read from. `renderPanel` measures its
  // own column from its own data too, one function up; the `+ 2` here is the
  // gap, where that one carries its separator in the format string.
  const names =
    verdict.kind === "stale"
      ? verdict.stale.map((one) => one.series.length)
      : [];
  const column = Math.max(22, ...names) + 2;

  const head =
    verdict.kind === "never"
      ? `no metrics record has arrived, ${String(verdict.days)} days after the trend spine landed.\n` +
        "  The bootstrap exemption is dated and it has expired. Three missed nightlies is a\n" +
        "  dead pipe rather than a bootstrap, which is why this expires on a day rather than\n" +
        '  on "until the first record arrives".'
      : verdict.kind === "stale"
        ? `the trend record is stale: ${verdict.stale.map((one) => one.series).join(", ")}\n\n` +
          "  Per-series, because one series going quiet while the others stay healthy is the\n" +
          "  failure this record exists to expose — an aggregate check cannot see it.\n" +
          verdict.stale
            .map(
              (one) =>
                `    ${pad(one.series, column)}${
                  one.newest === undefined
                    ? `no sample at all in the ${String(scanned)} newest record(s) read`
                    : `newest sample ${describeAge(now - one.newest)} ago (${asDate(one.newest)})`
                }`,
            )
            .join("\n")
        : "the trend record cannot be read";

  const route =
    probe.kind === "newer"
      ? `\n\n  The branch holds ${String(probe.newer)} record(s) this machine has not imported, so this\n` +
        "  is a store that is behind rather than a pipe that has stopped:\n" +
        "      pnpm trend:sync"
      : probe.kind === "same"
        ? `\n\n  The branch is no fresher${
            probe.branchNewest === undefined
              ? ""
              : `, newest row ${probe.branchNewest}`
          } — syncing would import nothing. The nightly has\n` +
          "  stopped writing, and GitHub disables a scheduled workflow after 60 days of\n" +
          "  repository inactivity:\n" +
          `      ${METRICS_ACTIONS_URL}`
        : "\n\n  The branch could not be reached, so which of the two this is stays open:\n" +
          "  either this machine is behind (`pnpm trend:sync`) or the nightly has stopped\n" +
          `      ${METRICS_ACTIONS_URL}`;

  return (
    `${head}${route}\n\n` +
    "  No flag clears this. --dry-run runs this check and is the honest way to watch it\n" +
    "  fail. --check-only reports instead of refusing: it uploads nothing, and a mode\n" +
    "  that exists to ask a live origin what it is serving must not be blocked by the\n" +
    "  age of a local record."
  );
}
