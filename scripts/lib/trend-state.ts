/**
 * The trend store's `state.json`, read and written by `scripts/trend-sync.ts`.
 *
 * Pure, so the round trip is testable: every field `serializeState` writes,
 * `parseState` must hand back. #522 was a reader that kept only `tip` and
 * `imported`, so every sync re-imported every renovation marker and wrote a
 * fresh ratchet row, and the edited-renovation refusal checked an empty list.
 */
export interface StoreState {
  /** The branch tip the last sync imported, for the fast-forward check. */
  tip?: string;
  /** Every record filename already in the store — branch and local alike. */
  imported: string[];
  /**
   * One digest per renovation already in the store, in file order.
   *
   * ⚠️ **Per entry rather than per document, and the difference is what makes
   * an append cheap and a rewrite loud.** `renovations.json` is one file that is
   * appended to, where every record is a separate immutable file — so a
   * single whole-document digest could only say *something changed*, and the
   * honest response to that is to re-import every marker, which writes blocks
   * overlapping the ones already there. A list says **what** changed: if this
   * is a prefix of the file as it now stands, the difference is an append and
   * only the new entries are imported.
   *
   * ⚠️ **When it is not a prefix, the sync refuses.** An edited entry is a new
   * series — Prometheus identifies a series by its whole label set, and `reason`
   * is a label — so the old one stays in the store and the page draws both. A
   * deleted entry leaves its series with nothing to supersede it. Neither is
   * something `backfill()` can undo, because it only ever adds blocks.
   * `--rebuild` is the measured recovery and the refusal names it.
   *
   * Absent on a store written before markers existed, which imports them once.
   */
  renovations?: string[];
  /**
   * A digest of the tightening asks the store last took in (#463). A sync
   * writes a new `-ratchet.prom` row only when the asks differ from this, so a
   * sync with nothing new stays a no-op rather than restarting the store.
   */
  asksDigest?: string;
}

/** The state a file holds, or `undefined` when it does not parse. */
export function parseState(text: string): StoreState | undefined {
  try {
    const parsed = JSON.parse(text) as Partial<StoreState>;
    return {
      ...(parsed.tip === undefined ? {} : { tip: parsed.tip }),
      imported: parsed.imported ?? [],
      ...(parsed.renovations === undefined ? {} : { renovations: parsed.renovations }),
      ...(parsed.asksDigest === undefined ? {} : { asksDigest: parsed.asksDigest }),
    };
  } catch {
    return undefined;
  }
}

export function serializeState(state: StoreState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}
