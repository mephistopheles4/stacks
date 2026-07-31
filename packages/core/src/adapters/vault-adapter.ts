import type { BookInput, BookRecord } from '../types.ts';

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

  /** Dedupe check: ISBN first, then a normalised title+author. */
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;

  /** Absolute path to where covers are cached. */
  coverDir(): string;
}
