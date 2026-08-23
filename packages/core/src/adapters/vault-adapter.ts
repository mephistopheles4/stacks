import type { BookInput, BookRecord } from "../types.ts";

/**
 * Frontmatter keys to set, by their contract names (`shelf_order`, not
 * `shelfOrder`). `undefined` removes the key.
 */
export type FrontmatterChanges = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/**
 * The only way any code in this project touches vault files (invariant 4).
 *
 * v1 ships `ObsidianAdapter` and nothing else. This interface exists so that a
 * Logseq or Anytype adapter stays *possible*, not so that adapters become a
 * framework — CLAUDE.md forbids a second adapter and any config plumbing beyond
 * a single vault-path constructor argument.
 */
export interface VaultAdapter {
  /**
   * Parse every `type: book` note in the vault.
   *
   * Must never throw because of one bad note (invariant 3): malformed
   * frontmatter is warned about by file name and skipped.
   */
  listBooks(): Promise<BookRecord[]>;

  /** Create a note and return the path it was written to. */
  writeBook(book: BookInput): Promise<string>;

  /**
   * Change frontmatter keys on a note that already exists.
   *
   * Surgical on purpose: only the named keys move, every other line of the file
   * — the rest of the frontmatter, its key order, and the whole note body —
   * survives byte for byte. Re-serialising the YAML would be simpler and would
   * quietly reformat a file the owner hand-edits.
   *
   * `sourcePath` is the vault-relative path from the `BookRecord`. Scalar
   * values only; a key whose current value is a block (a `tags:` list, say) is
   * left alone rather than mangled.
   */
  updateBook(sourcePath: string, changes: FrontmatterChanges): Promise<void>;

  /**
   * Add a section to a note's **body**, and only when it is not already there.
   *
   * The sixth method, and the only one that writes below the frontmatter. It
   * exists for one thing: a provider's description, which the merge stores in
   * the note rather than in a property because 600–700 words above every note
   * would fight `updateBook`'s line rewriter and tax invariant 5 forever — and
   * because a body section **is not a `BookRecord` field**, so "never published"
   * becomes structural rather than a discipline. No build can carry it.
   *
   * Two rules, both inherited rather than new:
   *
   * - **Written only when `heading` is absent.** That is the absent-only rule
   *   applied to a section, and it is what makes a re-run idempotent — no second
   *   `## About` appended, ever.
   * - **Everything else survives byte for byte**, `updateBook`'s promise
   *   extended to the half of the file it never touched.
   *
   * ⚠️ Invariant 2's future allowlisted-section publishing **must never name
   * `## About`**: the whole point of storing it here was that it stays local.
   *
   * **Returns whether it wrote.** A caller that reports what it filled has to be
   * able to tell "added the section" from "the section was already there", or
   * every re-run claims to have written something and the report becomes a
   * control that lies — G27's defect, one field over.
   */
  insertBodySection(
    sourcePath: string,
    heading: string,
    text: string,
  ): Promise<boolean>;

  /** Dedupe check: ISBN first, then a normalised title+author. */
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;

  /** Absolute path to where covers are cached. */
  coverDir(): string;
}
