import { FRONTMATTER_BLOCK } from '../frontmatter.ts';

/**
 * The `## Thoughts` extractor: the one place a note's body is read for a build.
 *
 * Invariant 2's split, as built. A note's body stays private except for one
 * allowlisted section, `## Thoughts`, which ships as a list of plain-text
 * paragraphs in `notes/<id>.json`. This module finds that section and strips
 * it; `ObsidianAdapter.readPublicSection` is its only caller, so the rest of
 * the body never leaves `adapters/`
 * ([ADR-0100](../../../../docs/adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md)).
 *
 * **Every rule fails closed.** A shape the extractor cannot vouch for withholds
 * the whole section rather than shipping what a strip got wrong: a section that
 * does not appear is a gap the owner sees in a warning, and a section that
 * appears with a private aside in it is on a URL that may already be shared
 * ([ADR-0101](../../../../docs/adr/0101-thoughts-ship-as-plain-text-and-withhold-whole.md),
 * spec §3.1). Where this file reads wider than CommonMark, it can only end a
 * section earlier or withhold one, never publish more.
 *
 * ⚠️ **A withhold reason never quotes the section.** It reaches the terminal,
 * and the terminal must hold no Thoughts text (spec §3.1).
 *
 * ⚠️ **`## About` must never be the section.** The merge writes a provider's
 * description there, through `insertBodySection`, and that text goes through
 * `disarmBodyText` below so it can never open a section of its own.
 */

/** The heading text, matched exactly and case-sensitively, at level 2. */
const THOUGHTS = 'Thoughts';

/**
 * The most raw section text that ships, in Unicode code points.
 *
 * Counted on the section **before** stripping, so markup cannot carry a
 * section past it, and in code points rather than `.length`, which counts
 * UTF-16 units. A section over it is withheld, never cut: a cut would publish
 * part of a thought without saying so (#368). The inspector's 40,000-byte cap
 * on the published file sits behind this one (spec §3.1).
 */
export const MAX_SECTION_CODE_POINTS = 8000;

export type ThoughtsResult =
  /** No `## Thoughts` section, or one that strips to nothing. Nothing is said. */
  | { readonly kind: 'absent' }
  /** A section exists and must not ship. `reason` names the shape, never the text. */
  | { readonly kind: 'withheld'; readonly reason: string }
  /** The section, as non-empty plain-text paragraphs. */
  | { readonly kind: 'shipped'; readonly paragraphs: readonly string[] };

export interface AtxHeading {
  readonly level: number;
  readonly text: string;
}

/**
 * A line read as an ATX heading, as broadly as CommonMark allows: 0 to 3
 * spaces of indent, one to six hashes, then a space, a tab or the end of the
 * line, with optional closing hashes. Matching wide can only end a section
 * early (spec §3.1).
 *
 * Shared with `disarmBodyText`, so the line the extractor would read as a
 * heading and the line the `## About` writer disarms cannot drift apart.
 */
export function atxHeading(line: string): AtxHeading | undefined {
  const match = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/.exec(line);
  if (match === null) return undefined;
  const hashes = match[1] ?? '';
  const text = (match[2] ?? '')
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(/^[ \t]*#+[ \t]*$/, '')
    .trim();
  return { level: hashes.length, text };
}

export interface FenceOpener {
  readonly char: '`' | '~';
  readonly length: number;
}

/**
 * A line that opens a code fence under CommonMark: 0 to 3 spaces of indent and
 * three or more backticks or tildes, where a backtick fence's info string may
 * not itself hold a backtick. Shared with `disarmBodyText` for
 * `atxHeading`'s reason.
 */
export function fenceOpener(line: string): FenceOpener | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (match === null) return undefined;
  const run = match[1] ?? '';
  const char = run.startsWith('`') ? '`' : '~';
  if (char === '`' && (match[2] ?? '').includes('`')) return undefined;
  return { char, length: run.length };
}

/** Whether `line` closes the fence `open` opened: the same character, at least as long, nothing after. */
function closesFence(line: string, open: FenceOpener): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  const run = match?.[1];
  return run !== undefined && run.startsWith(open.char) && run.length >= open.length;
}

/** A setext underline: a line of only `=` or only `-`, indented at most three spaces. */
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;

/**
 * Anything Obsidian hides, or that names a file, anywhere in the section.
 *
 * Read on the raw section, fenced lines included: a `%%` inside a fence is
 * literal to Obsidian and a comment to a careless strip, and withholding is the
 * one answer right under both readings (#368, rule 4).
 */
const HIDDEN: readonly { readonly reason: string; readonly pattern: RegExp }[] = [
  { reason: 'it holds a comment marker (%%, <!-- or -->)', pattern: /%%|<!--|-->/ },
  { reason: 'it embeds a file or an image', pattern: /!\[\[|!\[[^\]\n]*\]\(/ },
  { reason: 'it holds an HTML tag', pattern: /<\/?[A-Za-z][^>\n]*>/ },
  {
    reason: 'it holds a link reference or footnote definition',
    pattern: /^ {0,3}\[[^\]\n]+\]:/m,
  },
];

/**
 * A URL scheme left in the text after links flatten: an address the
 * flattening never saw, a bare one or an autolink. The four the spec names, in
 * any case — the inspector's `notes-shape` rule asks the same of the file.
 */
const URL_SCHEME = /:\/\/|\b(?:file|obsidian|mailto):/i;

/**
 * Finds and strips a note's `## Thoughts` section.
 *
 * The scan starts below the frontmatter block and computes fence state from the
 * start of the body, so a `## Thoughts` inside an open fence is no heading. A
 * section ends at the next `#` or `##` heading outside a fence, or at the end
 * of the file; `###` stays inside.
 */
export function extractThoughts(source: string): ThoughtsResult {
  const frontmatter = FRONTMATTER_BLOCK.exec(source);
  if (frontmatter === null) return { kind: 'absent' };

  const lines = source.slice(frontmatter.index + frontmatter[0].length).split(/\r?\n/);
  const starts = sectionStarts(lines);

  const first = starts[0];
  if (first === undefined) return { kind: 'absent' };
  if (starts.length > 1) return withheld('the note has two `## Thoughts` headings');

  // A comment open where the section starts makes its heading no heading, and a
  // marker inside a fence above it is read differently by Obsidian than by a
  // scan. Rather than guess which, any marker above the section withholds it.
  if (/%%|<!--|-->/.test(lines.slice(0, first).join('\n'))) {
    return withheld('a comment marker sits above the section');
  }

  const bounded = sectionLines(lines, first + 1);
  if (typeof bounded === 'string') return withheld(bounded);

  const raw = bounded.join('\n');
  if ([...raw].length > MAX_SECTION_CODE_POINTS) {
    return withheld(`it is over ${String(MAX_SECTION_CODE_POINTS)} characters`);
  }
  for (const { reason, pattern } of HIDDEN) {
    if (pattern.test(raw)) return withheld(reason);
  }

  const paragraphs = toParagraphs(bounded);
  if (paragraphs.some((paragraph) => URL_SCHEME.test(paragraph))) {
    return withheld('it holds a web address or a file link');
  }
  return paragraphs.length === 0 ? { kind: 'absent' } : { kind: 'shipped', paragraphs };
}

/**
 * Disarms provider text before it is written into a note's body: every line
 * `atxHeading` or `fenceOpener` would recognise gains a backslash before its
 * first mark, so it reads as neither.
 *
 * A description's line breaks survive `toPlainText`, so a listing line reading
 * `## Thoughts` would otherwise land at column 0 — shipping a stranger's words
 * as the owner's on a note with no Thoughts, withholding the real section on
 * one with them, or, followed by an unclosed fence, carrying `## Notes` out
 * (spec §4).
 */
export function disarmBodyText(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      atxHeading(line) === undefined && fenceOpener(line.replace(/\r$/, '')) === undefined
        ? line
        : line.replace(/^( *)/, '$1\\'),
    )
    .join('\n');
}

function withheld(reason: string): ThoughtsResult {
  return { kind: 'withheld', reason };
}

/** The index of every `## Thoughts` heading outside a fence. */
function sectionStarts(lines: readonly string[]): number[] {
  const starts: number[] = [];
  let open: FenceOpener | undefined;

  lines.forEach((line, index) => {
    if (open !== undefined) {
      if (closesFence(line, open)) open = undefined;
      return;
    }
    open = fenceOpener(line);
    if (open !== undefined) return;

    const heading = atxHeading(line);
    if (heading?.level === 2 && heading.text === THOUGHTS) starts.push(index);
  });

  return starts;
}

/**
 * The section's lines, from `from` to the next `#` or `##` heading or the end,
 * or the reason it must be withheld.
 *
 * Three boundary shapes withhold, because each is a place the boundary could
 * run on into the private remainder (spec §3.1):
 *
 * - a fence still open at the end of the file;
 * - a fenced line shaped like a section-ending heading — wider than "a fence
 *   open at the next heading", since a fence the section opened and the private
 *   part closed is balanced and would pass an end-of-file check;
 * - a setext heading, which Obsidian renders as a heading the scan does not know.
 */
function sectionLines(lines: readonly string[], from: number): string[] | string {
  const section: string[] = [];
  let open: FenceOpener | undefined;

  for (const line of lines.slice(from)) {
    if (open !== undefined) {
      if (closesFence(line, open)) {
        open = undefined;
      } else if ((atxHeading(line)?.level ?? 3) <= 2) {
        return 'a code fence in it holds a line shaped like a heading';
      }
      section.push(line);
      continue;
    }

    const heading = atxHeading(line);
    if (heading !== undefined && heading.level <= 2) return section;

    if (SETEXT_UNDERLINE.test(line) && isParagraphLine(section.at(-1))) {
      return 'it holds a setext heading';
    }
    open = fenceOpener(line);
    section.push(line);
  }

  return open === undefined ? section : 'a code fence in it is never closed';
}

/** Whether a line can carry a setext underline: text, not a heading or a fence. */
function isParagraphLine(line: string | undefined): boolean {
  return (
    line !== undefined &&
    line.trim() !== '' &&
    atxHeading(line) === undefined &&
    fenceOpener(line) === undefined
  );
}

/**
 * The section as plain-text paragraphs: split on blank lines, single line
 * breaks kept, Markdown stripped by hand the way `remove-markdown` does (#368).
 * A fenced line ships as written and its fence markers do not ship at all.
 */
function toParagraphs(section: readonly string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let open: FenceOpener | undefined;

  const flush = (): void => {
    if (current.length > 0) paragraphs.push(current.join('\n'));
    current = [];
  };

  for (const line of section) {
    if (open !== undefined) {
      if (closesFence(line, open)) open = undefined;
      else current.push(line.trimEnd());
      continue;
    }
    open = fenceOpener(line);
    if (open !== undefined) continue;

    const text = stripLine(line);
    if (text === '') flush();
    else current.push(text);
  }
  flush();

  return paragraphs.filter((paragraph) => paragraph.trim() !== '');
}

/** Private-use characters standing in for escaped ones while marks are stripped. */
const ESCAPE_OPEN = '';
const ESCAPE_CLOSE = '';

/** One line, its block marks and inline marks removed, its words kept. */
function stripLine(line: string): string {
  const escapes: string[] = [];
  let text = line.replace(/\\([!-/:-@[-`{-~])/g, (_, char: string) => {
    escapes.push(char);
    return `${ESCAPE_OPEN}${String(escapes.length - 1)}${ESCAPE_CLOSE}`;
  });

  // Block marks: quote markers, nested ones too; a callout's `[!type]` and fold
  // mark, keeping its title; a heading's hashes, keeping its text.
  text = text.replace(/^[ \t]*(?:>[ \t]?)+/, '').replace(/^\[![^\]\n]*\][+-]?[ \t]*/, '');
  const heading = atxHeading(text);
  if (heading !== undefined) text = heading.text;

  // A block id names a place in the vault, for the wikilink rule's reason.
  text = text.replace(/(?:^|[ \t]+)\^[A-Za-z0-9-]+[ \t]*$/, '');

  // Links flatten to the text a reader sees. A wikilink's heading or block
  // part names a place in the vault and is dropped with it.
  text = text
    .replace(
      /\[\[([^\]|#^]*)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g,
      (_, target: string, alias?: string) => (alias ?? target).trim(),
    )
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/\[([^\]\n]*)\]\[[^\]\n]*\]/g, '$1');

  // Emphasis and code marks go; the words stay. An underscore inside a word is
  // part of the word.
  text = text
    .replace(/(`+)([^`]+?)\1/g, '$2')
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')
    .replace(/(?<!\w)__(?=\S)([^\n]*?\S)__(?!\w)/g, '$1')
    .replace(/\*(?=\S)([^\n*]*?\S)\*/g, '$1')
    .replace(/(?<!\w)_(?=\S)([^\n_]*?\S)_(?!\w)/g, '$1')
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
    .replace(/==(?=\S)([^\n]*?\S)==/g, '$1');

  return text
    .replace(
      new RegExp(`${ESCAPE_OPEN}(\\d+)${ESCAPE_CLOSE}`, 'g'),
      (_, index: string) => escapes[Number(index)] ?? '',
    )
    .trimEnd();
}
