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
   * Four rules:
   *
   * - **Written only when `heading` is absent.** That is the absent-only rule
   *   applied to a section, and it is what makes a re-run idempotent — no second
   *   `## About` appended, ever.
   * - **Everything else survives byte for byte**, `updateBook`'s promise
   *   extended to the half of the file it never touched.
   * - **The text it writes is disarmed**: every line ending becomes LF, `<`,
   *   `>` and `%%` are written as entities, every run of three or more
   *   backticks or tildes, every `$` and every `[^` become character
   *   references, a `[` that opens a line becomes one too, and every line
   *   that would read as a heading, behind list markers too, and every setext
   *   underline, gains a backslash first; each line rule reads a line at any
   *   indent. So a provider's prose can never open a `## Thoughts` section of
   *   its own, carry `## Notes` out of one, trip a guard that withholds the
   *   owner's, or land a live comment or HTML block (spec §3.1.1, §4).
   * - **Five writes are refused**, each with a warning naming the note and
   *   never quoting the text: a text over 8,000 code points once disarmed; any
   *   write into a note whose Thoughts are already withheld; a text that,
   *   parsed as written, holds a heading, a definition, HTML or code; one that
   *   would leave the note body over the extractor's 20,000-code-point cap; and
   *   one that would change what the note's Thoughts ship, or why they are
   *   withheld. A parse that throws refuses the write the same way, so it costs
   *   only that book.
   *
   * ⚠️ **Any allowlist of published sections must never name `## About`**: the
   * whole point of storing a description here was that it stays local
   * (AGENTS.md, invariant 2).
   *
   * **Returns whether it wrote.** A caller that reports what it filled has to be
   * able to tell "added the section" from "the section was already there", or
   * every re-run claims to have written something and the report becomes a
   * control that lies — G27's defect, one field over.
   */
  insertBodySection(sourcePath: string, heading: string, text: string): Promise<boolean>;

  /**
   * A note's `## Thoughts` section, as plain-text paragraphs, or `undefined`
   * when it has none or it is withheld.
   *
   * The seventh method, and **the only one that returns text from below the
   * frontmatter**, as `insertBodySection` is the only one that writes there;
   * the writer reads the note's Thoughts too, before and after a write, and
   * keeps only whether the two reads agree. It returns the
   * section and never the body, so no code outside the adapter ever holds the
   * private remainder, and it is never a `BookRecord` field, so `library.json`
   * has nowhere to put the text
   * ([ADR-0100](../../../../docs/adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md)).
   * **The publisher is its only caller.** The body is read through a
   * CommonMark parser, and any shape but plain prose withholds the section
   * ([ADR-0107](../../../../docs/adr/0107-thoughts-are-read-by-a-commonmark-parser.md)).
   *
   * A withheld section warns naming the note and never quoting it (spec §3.1).
   * `sourcePath` is the vault-relative path a `BookRecord` carries.
   */
  readPublicSection(sourcePath: string): Promise<readonly string[] | undefined>;

  /** Dedupe check: ISBN first, then a normalised title+author. */
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;

  /** Absolute path to where covers are cached. */
  coverDir(): string;
}
