/**
 * What `stacks build --public --list-new-wishlist` prints (#603, spec S10.1).
 *
 * The one-off that lets the owner read, before the first deploy that ships wishlist books, which of
 * them that deploy publishes. **It is computed from the folder the same run staged**: it reads that
 * `library.json` and looks for the files the build wrote beside it, and never filters a vault a
 * second time, so it cannot disagree with what a deploy would ship. It writes nothing.
 *
 * A title is printed in the terminal and never kept: the caller prints it, and nothing here writes
 * it anywhere. The listing itself, `listNewWishlist`, is in `publish.ts` beside the stage it reads back.
 */
export interface NewWishlistEntry {
  readonly title: string;
  /** Whether a `notes/<id>.json` was staged for it. */
  readonly notes: boolean;
  /** Whether a cover or a held cover was staged for it. */
  readonly cover: boolean;
}

/**
 * A title with every control character shown as a space. A provider's or an import's title is outside
 * input, and one with a carriage return or an escape code could hide a line of the list the owner
 * reads before a deploy.
 */
function printable(title: string): string {
  return title.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
}

/**
 * The terminal's lines for the list: a mark for the notes file and one for the cover, then the
 * title. Never a note's text, and never a path.
 */
export function describeNewWishlist(entries: readonly NewWishlistEntry[]): string[] {
  if (entries.length === 0) return ['  no wishlist book would be published'];
  const mark = (shipped: boolean, label: string): string =>
    shipped ? label : '-'.repeat(label.length);
  return [
    `  ${String(entries.length)} wishlist book(s) this build publishes — notes, cover, title:`,
    ...entries.map(
      ({ title, notes, cover }) =>
        `    ${mark(notes, 'notes')}  ${mark(cover, 'cover')}  ${printable(title)}`,
    ),
  ];
}
