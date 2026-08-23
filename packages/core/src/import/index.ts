import { cacheCover } from "../covers/cache-cover.ts";
import { coverKeys } from "../covers/cover-keys.ts";
import { coverUrls, lookup } from "../metadata/index.ts";
import type { HttpGet } from "../metadata/http.ts";
import { isProbablySameBook, normaliseIsbn } from "../identity.ts";
import type { BookInput } from "../types.ts";
import type { VaultAdapter } from "../adapters/vault-adapter.ts";

export {
  parseAudibleExport,
  type AudibleBook,
  type AudibleImportOptions,
} from "./audible.ts";

/**
 * Writing imported books into the vault.
 *
 * Idempotent by construction: every book is checked against what is already
 * there before anything is written, so running an import twice adds nothing the
 * second time. Dedupe is ISBN first, then normalised title+author — the same
 * path `stacks add` uses, so an audiobook cannot land beside the print edition
 * of the same book.
 */

export interface ImportableBook {
  readonly input: BookInput;
  readonly coverUrl?: string;
}

export interface ImportOptions {
  /** Report what would happen without touching the vault. */
  readonly dryRun?: boolean;
  /** Skip cover downloads — much faster, and offline. */
  readonly skipCovers?: boolean;
  /**
   * Look the book up and prefer a print cover over the export's own.
   *
   * Audible ships *square* artwork, because that is what an audiobook cover is.
   * On a shelf drawn as a bookcase they read as odd tiles among the spines, so
   * a print edition's cover is preferred when one can be found — falling back
   * to the export's art, which is always there and always correct for the
   * edition actually owned.
   */
  readonly get?: HttpGet;
  readonly googleBooksKey?: string;
}

export type ImportOutcome =
  | { readonly kind: "added"; readonly title: string; readonly path: string }
  | { readonly kind: "would-add"; readonly title: string }
  | {
      readonly kind: "duplicate";
      readonly title: string;
      readonly existing: string;
    }
  | {
      readonly kind: "failed";
      readonly title: string;
      readonly reason: string;
    };

export interface ImportResult {
  readonly outcomes: readonly ImportOutcome[];
  readonly added: number;
  readonly duplicates: number;
  readonly failed: number;
}

export async function importBooks(
  books: readonly ImportableBook[],
  vault: VaultAdapter,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const outcomes: ImportOutcome[] = [];

  // Read the vault once, then track additions in memory — otherwise importing
  // two copies of one book in a single run would write both, since neither is
  // on disk when the other is checked.
  const existing = await vault.listBooks();
  const seen = existing.map((book) => ({
    isbn: book.isbn ?? "",
    titleAuthor: `${book.title} ${book.author ?? ""}`,
    title: book.title,
  }));

  for (const { input, coverUrl } of books) {
    const titleAuthor = `${input.title} ${input.author ?? ""}`;

    const duplicate = findDuplicate(seen, input.isbn ?? "", titleAuthor);
    if (duplicate !== undefined) {
      outcomes.push({
        kind: "duplicate",
        title: input.title,
        existing: duplicate,
      });
      continue;
    }

    if (options.dryRun === true) {
      outcomes.push({ kind: "would-add", title: input.title });
      seen.push({ isbn: input.isbn ?? "", titleAuthor, title: input.title });
      continue;
    }

    try {
      const candidates =
        options.skipCovers === true
          ? []
          : await coverCandidates(input, coverUrl, options);
      const cover = await cacheCover(candidates, input.title, vault);

      const path = await vault.writeBook({ ...input, ...coverKeys(cover) });

      outcomes.push({ kind: "added", title: input.title, path });
      seen.push({ isbn: input.isbn ?? "", titleAuthor, title: input.title });
    } catch (error) {
      outcomes.push({
        kind: "failed",
        title: input.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    outcomes,
    added: outcomes.filter((o) => o.kind === "added" || o.kind === "would-add")
      .length,
    duplicates: outcomes.filter((o) => o.kind === "duplicate").length,
    failed: outcomes.filter((o) => o.kind === "failed").length,
  };
}

/**
 * Cover URLs in preference order: a print edition first, the export's own last.
 *
 * The export's artwork is the safety net — it is always present and always the
 * right book, just the wrong shape for a bookcase.
 */
async function coverCandidates(
  input: BookInput,
  exportCover: string | undefined,
  options: ImportOptions,
): Promise<readonly (string | undefined)[]> {
  const fallback = [exportCover];
  if (options.get === undefined) return fallback;

  try {
    const [match] = await lookup(
      `${input.title} ${input.author ?? ""}`.trim(),
      options.get,
      options,
    );
    // The importer's own preference, and the reason the ordering rule is not
    // hidden inside the downloader: a print edition first, then whatever
    // `coverUrls` ranks, then the export's square artwork as the safety net.
    return [...coverUrls(match), ...fallback];
  } catch {
    // A lookup failing must not cost the book the cover it already had.
    return fallback;
  }
}

interface SeenBook {
  isbn: string;
  titleAuthor: string;
  title: string;
}

/**
 * Matches against the in-memory set rather than re-reading the vault.
 *
 * Two reasons. `bookExists` re-parses every note on each call, which is a full
 * vault scan per imported book. And in a dry run nothing is written, so a book
 * duplicated *inside one export* would not be on disk for the second copy to
 * find — the run would claim it was adding both.
 *
 * Same rules as the adapter: ISBN first, then normalised title+author.
 */
function findDuplicate(
  seen: readonly SeenBook[],
  isbn: string,
  titleAuthor: string,
): string | undefined {
  const wantedIsbn = normaliseIsbn(isbn);
  if (wantedIsbn.length > 0) {
    const hit = seen.find((book) => normaliseIsbn(book.isbn) === wantedIsbn);
    if (hit !== undefined) return hit.title;
  }

  return seen.find((book) => isProbablySameBook(titleAuthor, book.titleAuthor))
    ?.title;
}
