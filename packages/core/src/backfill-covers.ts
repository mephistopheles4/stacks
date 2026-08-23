/**
 * Recording where the covers already in a vault came from.
 *
 * A one-time migration, but a real command rather than a script: anyone who
 * used this tool before `cover_source` existed has a vault full of covers with
 * no provenance, and a script nobody can re-run or review is not much better
 * than doing it by hand.
 *
 * Two rules keep it safe to point at a vault you care about:
 *
 *   - it only ever writes a key that is **absent**, exactly like `stacks
 *     enrich`. A `cover_source` recorded at fetch time is an observation and
 *     always beats this guess;
 *   - it writes `unknown` when the shape is not diagnostic, because that is the
 *     true answer — somebody looked and could not tell — and it leaves the note
 *     saying something accurate rather than something convenient.
 */

import { inferCoverSource } from "./covers/infer-source.ts";
import { resolveCoverPath } from "./covers/cover-path.ts";
import type { CoverSource } from "./covers/cover-source.ts";
import type {
  FrontmatterChanges,
  VaultAdapter,
} from "./adapters/vault-adapter.ts";

/** Injected so the command is testable without sharp or a real image. */
export type MeasureCover = (
  path: string,
) => Promise<{ width: number; height: number } | undefined>;

export interface BackfillOptions {
  readonly dryRun?: boolean;
  readonly measure: MeasureCover;
}

export type BackfillOutcome =
  | {
      readonly kind: "recorded";
      readonly title: string;
      readonly source: CoverSource;
    }
  | {
      readonly kind: "already-known";
      readonly title: string;
      readonly source: CoverSource;
    }
  | { readonly kind: "no-cover"; readonly title: string }
  | { readonly kind: "unreadable"; readonly title: string };

export interface BackfillResult {
  readonly outcomes: readonly BackfillOutcome[];
  readonly recorded: number;
  readonly bySource: ReadonlyMap<CoverSource, number>;
}

export async function backfillCoverSources(
  vault: VaultAdapter,
  options: BackfillOptions,
): Promise<BackfillResult> {
  const outcomes: BackfillOutcome[] = [];
  const bySource = new Map<CoverSource, number>();

  for (const book of await vault.listBooks()) {
    if (book.cover === undefined) {
      outcomes.push({ kind: "no-cover", title: book.title });
      continue;
    }

    // An observation always wins over a guess.
    if (book.coverSource !== undefined) {
      outcomes.push({
        kind: "already-known",
        title: book.title,
        source: book.coverSource,
      });
      continue;
    }

    const path = resolveCoverPath(vault.coverDir(), book.cover);
    const shape = path === undefined ? undefined : await options.measure(path);
    if (shape === undefined) {
      outcomes.push({ kind: "unreadable", title: book.title });
      continue;
    }

    // `undefined` from the heuristic means "the shape is not diagnostic"; the
    // note records that as `unknown`, which is a different statement from the
    // key being absent.
    const source: CoverSource = inferCoverSource(shape) ?? "unknown";

    if (options.dryRun !== true) {
      const changes: FrontmatterChanges = { cover_source: source };
      await vault.updateBook(book.sourcePath, changes);
    }

    outcomes.push({ kind: "recorded", title: book.title, source });
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
  }

  return {
    outcomes,
    recorded: outcomes.filter((outcome) => outcome.kind === "recorded").length,
    bySource,
  };
}
