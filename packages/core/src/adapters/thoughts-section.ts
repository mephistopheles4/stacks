import { parse, postprocess, preprocess } from 'micromark';
import { gfmFootnote } from 'micromark-extension-gfm-footnote';
import { gfmTable } from 'micromark-extension-gfm-table';
import type { Event, Token, TokenizeContext } from 'micromark-util-types';
import { FRONTMATTER_BLOCK } from '../frontmatter.ts';

/**
 * The `## Thoughts` extractor: the one place a note's body is read for a build.
 *
 * Invariant 2's split, as built. A note's body stays private except for one
 * allowlisted section, `## Thoughts`, which ships as a list of plain-text
 * paragraphs in `notes/<id>.json`. `extractThoughts` finds that section and
 * strips it, and `ObsidianAdapter.readPublicSection` is its only caller, so the
 * rest of the body never leaves `adapters/`
 * ([ADR-0100](../../../../docs/adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md)).
 *
 * **The body is read by `micromark`'s tokenizer**, and ADR-0106's allowlist
 * applies to its tokens: where the section starts and ends, and which blocks
 * and inline shapes it holds, are the parser's answers, and any token outside
 * the allowlist withholds
 * ([ADR-0107](../../../../docs/adr/0107-thoughts-are-read-by-a-commonmark-parser.md),
 * spec §3.1.1). It is never compiled to HTML: `parse`, `preprocess` and
 * `postprocess` are the only calls. Hand rules stay only where Obsidian departs
 * from CommonMark — comments, embeds, inline footnotes, Dataview fields, odd
 * line endings, wikilinks and block ids — or may draw a block's extent
 * differently, and an output check reads what ships after every strip.
 *
 * The rest of the module serves the `## About` writer in `obsidian-adapter.ts`:
 * `notesHeadingAt` finds `## Notes` through the same parse, so the writer and
 * the extractor cannot read a heading differently, and `disarmBodyText`
 * disarms what it writes, by hand predicates that read wider than CommonMark —
 * the safe direction for text being written.
 *
 * **Every rule fails closed.** A shape the extractor cannot vouch for withholds
 * the whole section rather than shipping what a strip got wrong: a section that
 * does not appear is a gap the owner sees in a warning, and a section that
 * appears with a private aside in it is on a URL that may already be shared
 * ([ADR-0101](../../../../docs/adr/0101-thoughts-ship-as-plain-text-and-withhold-whole.md),
 * spec §3.1).
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
 * line, with optional closing hashes.
 *
 * `disarmBodyText`'s predicate. The extractor reads headings through the
 * parse; this reads wider than it does, so a line the writer leaves alone is
 * never one the parse would read as a heading.
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

/**
 * A comment marker: `%%`, an HTML comment's opener, or either of its closers.
 * HTML ends a comment at `--!>` as well as `-->`, so both close one, and a
 * marker list that knew only `-->` would miss a comment the browser closed.
 *
 * ⚠️ **Kept apart from its twin deliberately; move one and move the other.**
 * The inspector's backstop in `scripts/lib/public-build.ts`, `HIDDEN_MARKER`,
 * matches what this constant and `HTML_START` below match together, so its
 * pattern is wider than this one on purpose: `<!` and `<?` are `HTML_START`'s
 * here. Its `OUTPUT_MARKS` are the twin of `SECTION_GUARDS` below, the same
 * way. A shared import would let a one-line weakening clear the extractor and
 * the deploy check at once, `DERIVED_KEYS`'s reason.
 */
const COMMENT_MARKER = /%%|<!--|--!?>/;

/**
 * The start of raw HTML: `<` followed by a letter, `/`, `!` or `?`.
 *
 * No closing `>` is required, because a tag's `>` can sit on a later line and
 * the declaration, processing-instruction and CDATA forms (`<!X`, `<?`,
 * `<![CDATA[`) hide text in reading view too. `a < b` does not match.
 */
const HTML_START = /<[A-Za-z/!?]/;

/**
 * A line ending other than LF or CRLF: a lone CR, or a Unicode line or
 * paragraph separator.
 *
 * CommonMark ends a line at a lone CR, and Obsidian may not, so the two could
 * disagree on where the heading that starts the private remainder is. Any one
 * in the note withholds the section — a hand rule, since no parser can say
 * what Obsidian does (#411's review reproduced the leak through a public
 * build).
 */
const ODD_LINE_ENDING = /\r(?!\n)|[\u2028\u2029]/;

/**
 * A URL scheme left in the text after links flatten: an address the
 * flattening never saw, a bare one or an autolink. The four the spec names, in
 * any case — the inspector's `notes-shape` rule asks the same of the file.
 */
const URL_SCHEME = /:\/\/|\b(?:file|obsidian|mailto):/i;

/**
 * The most body a note may have for its section to be read, in code points.
 *
 * Checked **before** the parse, so no note — and no provider description
 * written into one — can stall a build in the tokenizer. About 70 times the
 * longest real note body #368 counted (spec §3.1.1, step 2).
 */
export const MAX_BODY_CODE_POINTS = 200_000;

/**
 * Whether `entry`, the URL `micromark` resolved to, is its default build.
 *
 * `micromark` ships a `development` build beside it that traces its whole
 * parse to stderr when `DEBUG` names it — the whole note body, private
 * remainder included. Node loads it when a `development` condition is set,
 * through an inherited `NODE_OPTIONS` for one, so nothing rests on that never
 * happening: anything but the default entry withholds every section
 * (ADR-0107, spec §3.1.1).
 */
export function isDefaultBuild(entry: string): boolean {
  return /\/node_modules\/micromark\/index\.js$/.test(entry);
}

/** Read once, at load: the build every parse in this process uses. */
const LOADED_DEFAULT_BUILD = isDefaultBuild(import.meta.resolve('micromark'));

/** A shape that withholds the whole section, carrying the reason, never the text. */
class Withhold extends Error {}

/** Every Unicode tag character, which draws as nothing and reads as letters. */
const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u;

/**
 * A line that may read as a heading although CommonMark reads text: one or
 * two `#` after any whitespace or invisible format characters, then
 * whitespace or a format character — a no-break space after the hashes, or a
 * zero-width space or byte-order mark before them (spec §3.1.1, step 7). A
 * real `##` never reaches it, because it ends the section, and neither a
 * `#tag` nor a `###` matches.
 */
const NEAR_MISS_HEADING = /^[\t\p{Zs}\p{Cf}]*#{1,2}[\t\p{Zs}\p{Cf}]/mu;

/**
 * Step 7's patterns but the cap, each with its reason: read on the section, and
 * again on what ships. ⚠️ Twinned, never shared, by `OUTPUT_MARKS` in
 * `scripts/lib/public-build.ts`; move one and move the other.
 */
const SECTION_GUARDS: readonly {
  readonly reason: string;
  readonly test: (text: string) => boolean;
}[] = [
  { reason: 'it holds two dollar signs, which may be math', test: (t) => /\$[\s\S]*\$/.test(t) },
  { reason: 'it holds `![`, an image or an embed', test: (t) => t.includes('![') },
  { reason: 'it holds `^[`, an inline footnote', test: (t) => t.includes('^[') },
  { reason: 'it holds `::`, a Dataview field', test: (t) => t.includes('::') },
  { reason: 'it holds a control character', test: hasControlCharacter },
  { reason: 'it holds Unicode tag characters', test: (t) => TAG_CHARACTER.test(t) },
  { reason: 'it holds a line that may read as a heading', test: (t) => NEAR_MISS_HEADING.test(t) },
];

/** A C0 control other than tab and line feed, DEL, or a C1 control. */
function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f))
      return true;
  }
  return false;
}

/** Why a block in the section withholds it, by its token type. */
const BLOCK_REASONS: Readonly<Record<string, string>> = {
  blockQuote: 'it holds a quote or a callout',
  codeFenced: 'it holds a code fence',
  codeIndented: 'it holds indented code',
  htmlFlow: 'it holds HTML',
  setextHeading: 'it holds a setext heading',
  table: 'it holds a table',
  definition: 'it holds a link definition',
  gfmFootnoteDefinition: 'it holds a footnote definition',
  listOrdered: 'it holds a nested list',
  listUnordered: 'it holds a nested list',
};

/** Why an inline token in the section withholds it, by its token type. */
const INLINE_REASONS: Readonly<Record<string, string>> = {
  codeText: 'it holds code',
  htmlText: 'it holds HTML',
  image: 'it holds an image',
  autolink: 'it holds an autolink',
  characterReference: 'it holds a character reference',
  gfmFootnoteCall: 'it holds a footnote call',
};

/** Inline tokens whose text a reader sees, and ships. */
const SHOWN = new Set(['data', 'characterEscapeValue']);
/** Inline tokens that are marks or layout: walked through, never shipped, never a reason to withhold. */
const PASSED = new Set([
  'emphasis',
  'emphasisSequence',
  'emphasisText',
  'strong',
  'strongSequence',
  'strongText',
  'characterEscape',
  'escapeMarker',
  'link',
  'label',
  'labelMarker',
  'labelText',
  'hardBreakEscape',
  'hardBreakTrailing',
  'lineSuffix',
  'linePrefix',
  'listItemIndent',
  'whitespace',
]);
/** A link's destination, title and reference: skipped whole, never shipped. */
const SKIPPED = new Set(['resource', 'reference']);
/** Layout between blocks and inside a list: passed, never shipped. */
const LAYOUT = new Set([
  'lineEnding',
  'lineEndingBlank',
  'linePrefix',
  'whitespace',
  'listItemIndent',
  'blankLineEnding',
]);

/** One root-level block: its token, its context, and the events strictly inside it. */
interface Block {
  readonly token: Token;
  readonly context: TokenizeContext;
  readonly inner: readonly Event[];
}

/** The body's events, read by `micromark`'s tokenizer with tables and footnotes. Never compiled. */
function parseBody(body: string): Event[] {
  const chunks = preprocess()(body, undefined, true);
  return postprocess(
    parse({ extensions: [gfmTable(), gfmFootnote()] })
      .document()
      .write(chunks),
  );
}

function rootBlocks(events: readonly Event[]): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let current: { token: Token; context: TokenizeContext; inner: Event[] } | undefined;
  for (const event of events) {
    const [kind, token, context] = event;
    if (kind === 'enter') {
      if (depth === 0) current = { token, context, inner: [] };
      else current?.inner.push(event);
      depth++;
    } else {
      depth--;
      if (depth === 0 && current !== undefined) blocks.push(current);
      else current?.inner.push(event);
    }
  }
  return blocks;
}

/** The heading a root block is, if it is one: its level, its trimmed text, and whether it is setext. */
function headingOf(block: Block): { level: number; text: string; setext: boolean } | undefined {
  const find = (type: string): Event | undefined =>
    block.inner.find(([kind, token]) => kind === 'enter' && (token.type as string) === type);
  const slice = (event: Event | undefined): string =>
    event === undefined ? '' : event[2].sliceSerialize(event[1]);

  if (block.token.type === 'atxHeading') {
    const level = slice(find('atxHeadingSequence')).length;
    return { level, text: slice(find('atxHeadingText')).trim(), setext: false };
  }
  if (block.token.type === 'setextHeading') {
    const level = slice(find('setextHeadingLineSequence')).startsWith('=') ? 1 : 2;
    return { level, text: slice(find('setextHeadingText')).trim(), setext: true };
  }
  return undefined;
}

/**
 * Where `## Notes` starts in a note's body, at the start of its line, or
 * `undefined` when the body has none: the first root-level level-2 ATX heading
 * reading `Notes`, read through the same parse as the extractor's, so the
 * `## About` writer and the extractor cannot read a heading differently. It
 * excludes the frontmatter (the caller passes the body), fenced lines,
 * subheadings, and headings inside a list item or a quote.
 *
 * A body over `MAX_BODY_CODE_POINTS` is not parsed, and reads as having none:
 * the writer then appends, which is what it does on a hand-made note.
 */
export function notesHeadingAt(body: string): number | undefined {
  if ([...body].length > MAX_BODY_CODE_POINTS) return undefined;
  const notes = rootBlocks(parseBody(body)).find((block) => {
    const heading = headingOf(block);
    return heading?.setext === false && heading.level === 2 && heading.text === 'Notes';
  });
  if (notes === undefined) return undefined;
  const at = notes.token.start.offset;
  return at === 0 ? 0 : body.lastIndexOf('\n', at - 1) + 1;
}

/**
 * Finds and strips a note's `## Thoughts` section, reading the body with a
 * CommonMark parser and the allowlist of spec §3.1.1 over its tokens.
 *
 * The steps run in the spec's order, and each one that fails withholds the
 * whole section with a reason naming the shape, never the text.
 */
export function extractThoughts(source: string): ThoughtsResult {
  // 1. No frontmatter block: no note, so no section.
  const frontmatter = FRONTMATTER_BLOCK.exec(source);
  if (frontmatter === null) return { kind: 'absent' };
  if (!LOADED_DEFAULT_BUILD) {
    return withheld('micromark loaded its development build, so no section is read');
  }

  // 2. Line endings and size, on raw text. The whole source, frontmatter
  // included: if Obsidian drew the properties block's edge differently, a stray
  // ending there would be body to it.
  if (ODD_LINE_ENDING.test(source))
    return withheld('the note holds a line ending other than a newline');
  const body = source.slice(frontmatter.index + frontmatter[0].length);
  if ([...body].length > MAX_BODY_CODE_POINTS) {
    return withheld(
      `the note body is over ${String(MAX_BODY_CODE_POINTS)} characters, so it was not read`,
    );
  }

  try {
    return readSection(body);
  } catch (error) {
    if (error instanceof Withhold) return withheld(error.message);
    throw error;
  }
}

function readSection(body: string): ThoughtsResult {
  const events = parseBody(body);
  const blocks = rootBlocks(events);

  // 3. The start: a root-level ATX `## Thoughts`. A second root-level level-2
  // `Thoughts`, ATX or setext, withholds.
  const thoughts = blocks.flatMap((block, index) => {
    const heading = headingOf(block);
    return heading?.level === 2 && heading.text === THOUGHTS ? [{ index, heading }] : [];
  });
  const start = thoughts.find(({ heading }) => !heading.setext);
  if (start === undefined) return { kind: 'absent' };
  if (thoughts.length > 1) throw new Withhold('the note has two `## Thoughts` headings');
  const heading = blocks[start.index] as Block;

  // 4. The end: the next root-level heading of level 1 or 2, or the end of the body.
  let end = blocks.length;
  for (let index = start.index + 1; index < blocks.length; index++) {
    const next = headingOf(blocks[index] as Block);
    if (next !== undefined && next.level <= 2) {
      if (next.setext) throw new Withhold('a setext heading ends the section');
      end = index;
      break;
    }
  }
  const sectionStart = heading.token.end.offset;
  const sectionEnd = end < blocks.length ? (blocks[end] as Block).token.start.offset : body.length;
  for (const block of [heading, blocks[end]]) {
    // The raw guards below read the body by the parser's offsets; if the two
    // ever disagree, the guards would read the wrong text.
    if (
      block !== undefined &&
      body.slice(block.token.start.offset, block.token.end.offset) !==
        block.context.sliceSerialize(block.token)
    ) {
      throw new Withhold('the parse and the text disagree on where the section is');
    }
  }

  // 5. HTML above the section: any HTML token, and the raw tag start.
  const headingAt = heading.token.start.offset;
  const htmlAbove = events.some(
    ([kind, token]) =>
      kind === 'enter' &&
      (token.type === 'htmlFlow' || token.type === 'htmlText') &&
      token.start.offset < headingAt,
  );
  if (htmlAbove || HTML_START.test(body.slice(0, headingAt))) {
    throw new Withhold('HTML sits above the section');
  }

  // 6. Raw guards from the start of the body to the section's end, where
  // Obsidian may draw a block's extent differently from CommonMark.
  const upToEnd = body.slice(0, sectionEnd);
  if (upToEnd.includes('%%'))
    throw new Withhold('a `%%` comment marker sits in or above the section');
  if (/`{3,}|~{3,}/.test(upToEnd)) {
    throw new Withhold('a run of three backticks or tildes sits in or above the section');
  }
  if (upToEnd.includes('$$')) throw new Withhold('a `$$` sits in or above the section');

  // 7. Raw guards in the section. The heading's own line ending is the
  // heading's; a CRLF counts as one break; trailing whitespace does not count.
  const raw = body.slice(sectionStart, sectionEnd).replace(/\r\n/g, '\n').replace(/^\n/, '');
  if ([...raw.trimEnd()].length > MAX_SECTION_CODE_POINTS) {
    throw new Withhold(`it is over ${String(MAX_SECTION_CODE_POINTS)} characters`);
  }
  for (const guard of SECTION_GUARDS) if (guard.test(raw)) throw new Withhold(guard.reason);

  // 8. The token allowlist; 9. Obsidian's marks; 10. the output check.
  const paragraphs = blocks
    .slice(start.index + 1, end)
    .map(blockText)
    .filter((text): text is string => text !== undefined)
    .map(obsidianMarks)
    .filter((text) => text !== '');
  paragraphs.forEach(outputCheck);

  // 11. Nothing left: no section.
  return paragraphs.length === 0 ? { kind: 'absent' } : { kind: 'shipped', paragraphs };
}

/** A root block's shipped text, `undefined` for layout, or a withhold for a block outside the allowlist. */
function blockText(block: Block): string | undefined {
  const type: string = block.token.type;
  if (LAYOUT.has(type)) return undefined;
  if (type === 'content') return contentText(block.inner);
  if (type === 'thematicBreak') return '---';
  if (type === 'listUnordered' || type === 'listOrdered') return listText(block);
  if (type === 'atxHeading') {
    const text = innerOf(block.inner, 'atxHeadingText');
    return text === undefined ? '' : inlineText(text);
  }
  throw new Withhold(BLOCK_REASONS[type] ?? `it holds a shape outside the allowlist (${type})`);
}

/** The events strictly inside the first `type` token in `events`, or `undefined`. */
function innerOf(events: readonly Event[], type: string): Event[] | undefined {
  const at = events.findIndex(
    ([kind, token]) => kind === 'enter' && (token.type as string) === type,
  );
  if (at === -1) return undefined;
  const token = (events[at] as Event)[1];
  const close = events.findIndex(
    ([kind, t], index) => index > at && kind === 'exit' && t === token,
  );
  return events.slice(at + 1, close);
}

/** A `content` block's paragraph text; a definition in it withholds. */
function contentText(inner: readonly Event[]): string {
  for (const [kind, token] of inner) {
    if (kind === 'enter' && token.type === 'definition') {
      throw new Withhold('it holds a link definition');
    }
  }
  return inlineText(inner.filter(([, token]) => token.type !== 'paragraph'));
}

/**
 * A list one level deep, each item holding paragraphs only, as one string:
 * a line per paragraph, the item's mark kept before its first.
 */
function listText(block: Block): string {
  const lines: string[] = [];
  let mark = '';
  let index = 0;
  const { inner } = block;
  while (index < inner.length) {
    const [kind, token, context] = inner[index] as Event;
    const type: string = token.type;
    const close = inner.findIndex(([k, t], at) => at > index && k === 'exit' && t === token);
    if (kind === 'exit' || LAYOUT.has(type)) {
      index++;
      continue;
    }
    if (type === 'listItemPrefix') mark = context.sliceSerialize(token).trim();
    else if (type === 'content') {
      const text = contentText(inner.slice(index + 1, close));
      lines.push(mark === '' ? text : `${mark} ${text}`);
      mark = '';
    } else if (type === 'listOrdered' || type === 'listUnordered') {
      throw new Withhold('it holds a nested list');
    } else throw new Withhold('a list item holds more than a paragraph');
    index = close + 1;
  }
  return lines.join('\n');
}

/** The shown text of an inline run: text, escapes, and a link's label only. */
function inlineText(events: readonly Event[]): string {
  let text = '';
  let skipping: Token | undefined;
  for (const [kind, token, context] of events) {
    if (skipping !== undefined) {
      if (kind === 'exit' && token === skipping) skipping = undefined;
      continue;
    }
    if (kind === 'exit') continue;
    const type: string = token.type;
    if (SKIPPED.has(type)) skipping = token;
    else if (SHOWN.has(type)) text += context.sliceSerialize(token);
    else if (type === 'lineEnding') text += '\n';
    else if (!PASSED.has(type)) {
      throw new Withhold(
        INLINE_REASONS[type] ?? `it holds a shape outside the allowlist (${type})`,
      );
    }
  }
  return text;
}

/**
 * A wikilink: its target, any `#heading` or `^block` part, and an alias. The
 * alias ships, else the target without the part, which names a place in the
 * vault.
 */
const WIKILINK = /\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]/g;
/** A block id at the end of a line, which names a place in the vault. */
const BLOCK_ID = /(?:^|[ \t]+)\^[A-Za-z0-9-]+[ \t]*$/;

/** Step 9: Obsidian's marks, which no CommonMark parser knows, on text that ships. */
function obsidianMarks(text: string): string {
  const flattened = text.replace(WIKILINK, (_, target: string, alias?: string) =>
    (alias ?? target.split(/[#^]/)[0] ?? '').trim(),
  );
  if (/\[\[|\]\]/.test(flattened)) throw new Withhold('a wikilink did not flatten');
  return flattened
    .split('\n')
    .map((line) =>
      line
        .replace(BLOCK_ID, '')
        .replace(/==(?=\S)(.*?\S)==/g, '$1')
        .replace(/~~(?=\S)(.*?\S)~~/g, '$1')
        .trimEnd(),
    )
    .join('\n')
    .trim();
}

/**
 * Step 10, on each paragraph that ships, after every strip and escape: an
 * escaped mark the strip restored withholds here, so it never reaches the
 * inspector's twin and fails the deploy.
 */
function outputCheck(paragraph: string): void {
  if (COMMENT_MARKER.test(paragraph))
    throw new Withhold('after the strip, it holds a comment marker');
  if (HTML_START.test(paragraph)) throw new Withhold('after the strip, it holds a tag start');
  if (URL_SCHEME.test(paragraph)) throw new Withhold('it holds a web address or a file link');
  for (const guard of SECTION_GUARDS) {
    if (guard.test(paragraph)) throw new Withhold(`after the strip, ${guard.reason}`);
  }
}

/**
 * Disarms provider text before it is written into a note's body.
 *
 * - **Every line ending becomes LF** — CRLF, a lone CR, U+2028 and U+2029 — so
 *   a line the extractor reads is the line this disarms.
 * - **`<`, `>` and `%%` become entities**, so a description cannot carry a live
 *   comment or HTML block. `toPlainText` decodes `&lt;` after stripping tags,
 *   so escaped markup in a listing would otherwise arrive live, and on a note
 *   whose `## Notes` sits above its Thoughts it would land above the section
 *   and withhold it, or hide it in reading view.
 * - **Every run of three or more backticks or tildes, anywhere in a line,
 *   every `$` and every `[^` become character references.** On a note whose
 *   `## About` sits above its Thoughts, the extractor's raw guards read the
 *   description, so a mid-line run or a `$$` would withhold the owner's
 *   section, and a provider's `[^x]:` would turn the owner's `[^x]` into a
 *   footnote call (spec §3.1.1, D9). Encoding the run is also what disarms a
 *   fence opener.
 * - **Every line `atxHeading` reads as a heading, and every setext underline,
 *   gains a backslash** before its first mark, so it reads as neither.
 *
 * A description's line breaks survive `toPlainText`, so a listing line reading
 * `## Thoughts` would otherwise land at column 0 — shipping a stranger's words
 * as the owner's on a note with no Thoughts, withholding the real section on
 * one with them, or, followed by an unclosed fence, carrying `## Notes` out
 * (spec §4).
 */
export function disarmBodyText(text: string): string {
  return text
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/%%/g, '%&#37;')
    .replace(/`{3,}|~{3,}/g, (run) => run.replace(/`/g, '&#96;').replace(/~/g, '&#126;'))
    .replace(/\$/g, '&#36;')
    .replace(/\[\^/g, '&#91;^')
    .split('\n')
    .map((line) =>
      atxHeading(line) === undefined && !SETEXT_UNDERLINE.test(line)
        ? line
        : line.replace(/^( *)/, '$1\\'),
    )
    .join('\n');
}

/**
 * A setext underline in CommonMark's shape: up to three spaces of indent, only
 * `=` or only `-`, trailing whitespace allowed. Under a line reading
 * `Thoughts`, a provider's dashes would make a second `Thoughts` heading and
 * withhold the owner's real section (spec §3.1.1).
 */
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;

function withheld(reason: string): ThoughtsResult {
  return { kind: 'withheld', reason };
}
