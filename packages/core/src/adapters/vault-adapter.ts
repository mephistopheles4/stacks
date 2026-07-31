import type { BookInput, BookRecord } from '../types.ts';

/**
 * Frontmatter keys to set, by their contract names (`shelf_order`, not
 * `shelfOrder`). `undefined` removes the key.
 */
export type FrontmatterChanges = Readonly<Record<string, string | number | boolean | undefined>>;

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

  /** Dedupe check: ISBN first, then a normalised title+author. */
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;

  /** Absolute path to where covers are cached. */
  coverDir(): string;
}
