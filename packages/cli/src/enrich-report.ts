import type { EnrichOutcome } from "@stacks/core";

/**
 * What `stacks enrich` prints, as a value rather than as a side effect.
 *
 * This lived inside the command's action callback, where nothing could call it,
 * and it under-reported: `33 book(s) considered, 6 with gaps` followed by
 * `would fill 3, 2 left alone`. Five books accounted for out of six. The sixth
 * had a gap, was looked up, matched correctly and had nothing to fill — and the
 * `complete` branch of the switch printed nothing and counted nothing, so it
 * left no trace at all.
 *
 * The rule this file exists to keep is one line: **every book the header counted
 * appears in exactly one printed line and exactly one total.** It is a rule
 * about arithmetic, so it is worth being able to assert — which is the other
 * half of why the tally is here and not in a callback. See docs/gates.md, row
 * G27.
 *
 * The rule is held by shape rather than by care: `reportEntry` returns a book's
 * line *and* the total it belongs to together, so there is no way to write the
 * one without the other. The original defect was two switches' worth of work
 * done in one switch that could fall through — and a `break` that did neither
 * looked exactly like a `break` that did both.
 *
 * The type-only import matters: this module pulls in no runtime code, so a gate
 * can exercise it without loading the CLI or anything the CLI loads.
 */

/** One book's outcome, with the gaps it had *before* the attempt. */
export interface EnrichEntry {
  readonly outcome: EnrichOutcome;
  /** `missingFields(book).join(', ')`, computed before `enrichBook` ran. */
  readonly gaps: string;
}

/** The totals the closing line names. One book lands in exactly one. */
export type EnrichBucket = "filled" | "missed" | "unfilled" | "complete";

export interface EnrichReport {
  /**
   * One string per entry — never zero, never two. A book whose report spans two
   * printed lines carries the newline inside its own string, so this stays a
   * count of *books* and the rule above can be checked by reading it.
   */
  readonly lines: readonly string[];
  readonly filled: number;
  /** No provider knew it, or the one that answered offered a different book. */
  readonly missed: number;
  /** Had gaps; nothing could be filled. The case that used to vanish. */
  readonly unfilled: number;
  /**
   * Had no gaps at all.
   *
   * The command filters these out before it enriches anything, so this is
   * normally zero — but it is counted rather than dropped, because dropping an
   * unreachable case is exactly how the defect above was written. If the filter
   * ever loosens, the report stays honest instead of quietly losing books.
   */
  readonly complete: number;
}

/**
 * One book's line and the total it belongs to, decided together.
 *
 * Exported because the command prints as it goes — the lookups take a while and
 * a command that sits silent for a minute looks hung — while the totals can only
 * be known at the end.
 */
export function reportEntry({ outcome, gaps }: EnrichEntry): {
  line: string;
  bucket: EnrichBucket;
} {
  switch (outcome.kind) {
    case "filled":
      return {
        bucket: "filled",
        line:
          `  + ${outcome.title.slice(0, 52)}\n` +
          `      ${outcome.fields.join(", ")}  (was missing: ${gaps})`,
      };
    case "not-found":
      return {
        bucket: "missed",
        line: `  ? ${outcome.title.slice(0, 52)} — no provider knows it`,
      };
    case "mismatch":
      // Refusing is the right answer: metadata for a book that merely resembles
      // this one is worse than leaving the gap.
      return {
        bucket: "missed",
        line:
          `  ! ${outcome.title.slice(0, 46)}\n` +
          `      refused "${outcome.found.slice(0, 52)}" — not the same book`,
      };
    case "unfilled":
      // Deliberately silent about *who* was asked. One of the two paths to this
      // outcome never asks anybody — see `EnrichOutcome` — so "no provider has
      // it" would be a claim this line cannot make.
      return {
        bucket: "unfilled",
        line: `  = ${outcome.title.slice(0, 52)}\n      nothing to fill: ${gaps}`,
      };
    case "complete":
      return {
        bucket: "complete",
        line: `  · ${outcome.title.slice(0, 52)} — nothing was missing`,
      };
  }
}

export function enrichReport(entries: readonly EnrichEntry[]): EnrichReport {
  const lines: string[] = [];
  const totals: Record<EnrichBucket, number> = {
    filled: 0,
    missed: 0,
    unfilled: 0,
    complete: 0,
  };

  for (const entry of entries) {
    const { line, bucket } = reportEntry(entry);
    lines.push(line);
    totals[bucket] += 1;
  }

  return { lines, ...totals };
}

/**
 * The closing line.
 *
 * Every non-zero total is named. The clauses are conditional so an ordinary run
 * still reads as a sentence rather than a row of zeroes — but a total that is
 * not zero is never omitted, which is the whole complaint this file answers.
 */
export function enrichSummary(report: EnrichReport, dryRun: boolean): string {
  return [
    `${dryRun ? "would fill" : "filled"} ${report.filled} book(s)`,
    ...(report.missed > 0 ? [`${report.missed} left alone`] : []),
    ...(report.unfilled > 0 ? [`${report.unfilled} with nothing to fill`] : []),
    ...(report.complete > 0 ? [`${report.complete} already complete`] : []),
  ].join(", ");
}
