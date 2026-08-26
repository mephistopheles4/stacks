/**
 * Repository prose in, a GitHub body out.
 *
 * **Two conventions, opposite on purpose, and this is the converter between
 * them.** A file under `docs/` renders as standard Markdown, where a single
 * newline is a soft wrap — so hard-wrapping at 80 columns is correct there, and
 * every ADR and spec in this repository does it. An issue body, a pull request
 * body and every comment on either render as GFM **with hard line breaks
 * enabled**, where the same newline is a `<br>`. So the natural move — author
 * prose the way every file here is authored — is the defect, and it filed
 * fourteen issues before anyone noticed
 * ([#220](https://github.com/mephistopheles4/stacks/issues/220)).
 *
 * ⚠️ **This is the half that reading the body back cannot check.** The bytes
 * arrive perfectly, round-trip byte-identical, and render wrong; all fourteen
 * of those bodies verified as `identical=True` against their local files. Every
 * other failure mode on that ticket is about *whether* the bytes arrived, and
 * `github-post.ts` answers those. This one is about whether they were the right
 * bytes, and only a transform before the post can answer it.
 *
 * ⚠️ **Code is not prose and is never rewritten.** A throwaway script doing
 * exactly the reflow below rewrote the *example* inside the paragraph that
 * explains the relative-link rule, turning "`../blob/main/x` is broken, use the
 * full URL" into "the full URL is broken, use the full URL". A transform that
 * silently edits prose *about* the thing it fixes is its own silent failure
 * mode, so fenced blocks and inline code spans come out byte for byte — and the
 * fixture #220 required first is that document surviving this file.
 *
 * **Pure, and deliberately so.** Text in, text out, no `gh`, no network, no
 * disk — which is what lets G21 (`no-live-network`) be satisfied here with no
 * escape hatch, and what keeps the spec runnable from Stryker's sandbox.
 */

/** Where a link in a GitHub body has to point, since a relative one is dead. */
export const REPO_WEB_ROOT = 'https://github.com/mephistopheles4/stacks';

export interface TransformOptions {
  /**
   * The repository-relative *directory* the prose was written in, so a link
   * relative to that file resolves the way it does on disk. `''` — the default
   * — means the repository root.
   *
   * `docs/agents/issue-tracker.md` writes the ADR as `../adr/0026-…`; without
   * this the transform would have to guess, and guessing produces a URL that
   * looks right and 404s.
   */
  from?: string;
}

/** ATX only. Setext is not written anywhere in this repository. */
const HEADING = /^ {0,3}#{1,6}(\s|$)/;
/** A row of a GFM table: the one structure where the newline *is* the syntax. */
const TABLE_ROW = /^ {0,3}\|/;
/** `- `, `* `, `+ ` or `1. ` — the marker, and how far it is indented. */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/;
const BLOCKQUOTE = /^ {0,3}>/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
/** An opening or closing fence, and the run of characters that has to close it. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** A run of backticks, and everything up to the matching run: one code span. */
const CODE_SPAN = /(`+)(?:[^`]|(?!\1)`)*\1/g;
/** `[text](target)` or `![alt](target)`, with an optional `"title"`. */
const INLINE_LINK = /(!?)(\[[^\]]*\])\(\s*(<[^>]*>|[^)\s]+)(\s+"[^"]*")?\s*\)/g;
/** `[label]: target` at the head of a line — a reference definition. */
const LINK_DEFINITION = /^(\s*\[[^\]]+\]:\s*)(\S+)/;
/** A scheme (`https:`, `mailto:`) or a protocol-relative URL. Already absolute. */
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
/** The shape a repository file produces when it links out by hand, and 404s. */
const ALREADY_WEB = /(?:^|\/)(blob|tree|raw)\/main\/(.+)$/;

/**
 * A run of lines the transform is collecting, and how it will be emitted.
 *
 * `prose` and `list` join with a single space; `quote` joins the same way and
 * keeps one `> ` in front. They are one mechanism rather than three because the
 * question each asks of the next line is identical — *is this a continuation* —
 * and three copies of that question is the drift this repository gates
 * elsewhere.
 */
type RunKind = 'prose' | 'list' | 'quote';

interface Run {
  kind: RunKind;
  parts: string[];
}

/**
 * The body to post, given the prose somebody wrote in this repository's style.
 *
 * Each prose paragraph becomes one line. Headings, table rows, list markers,
 * thematic breaks, fenced blocks and indented code blocks keep their own lines;
 * fenced blocks and inline code spans keep their bytes. Repository-relative
 * link targets become absolute URLs.
 *
 * **Idempotent**, which is load-bearing rather than tidy: `github-post.ts`
 * compares what the server returned against the *transformed* text, so a
 * transform that moved on a second pass would make a correctly-posted body read
 * as a mismatch — mode 5's cry-wolf, reintroduced by the fix for it.
 */
export function bodyForGitHub(markdown: string, options: TransformOptions = {}): string {
  const from = options.from ?? '';
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  const out: string[] = [];
  let run: Run | undefined;
  let fence: string | undefined;

  const flush = (): void => {
    closeRun(out, run);
    run = undefined;
  };

  for (const line of lines) {
    // Inside a fence nothing is prose, nothing is a link, and nothing moves.
    // The closing run has to be at least as long as the opening one, which is
    // what stops a ``` inside a ~~~ block ending it.
    if (fence !== undefined) {
      out.push(line);
      const closing = FENCE.exec(line);
      if (closing !== null && closing[1] !== undefined && closesFence(closing[1], fence)) {
        fence = undefined;
      }
      continue;
    }

    const opening = FENCE.exec(line);
    if (opening !== null && opening[1] !== undefined) {
      flush();
      out.push(line);
      fence = opening[1];
      continue;
    }

    run = absorb(out, run, line, from);
  }

  flush();
  return out.join('\n');
}

/** A fence closes only on its own character, and never on a shorter run. */
function closesFence(candidate: string, opened: string): boolean {
  return candidate[0] === opened[0] && candidate.length >= opened.length;
}

/**
 * One line, folded into the open run or emitted on its own — and the open run
 * afterwards.
 *
 * The whole of the block-structure judgement, in one place so that *what breaks
 * a paragraph* is a single list rather than a condition repeated per caller.
 */
function absorb(out: string[], run: Run | undefined, line: string, from: string): Run | undefined {
  const emit = (text: string): undefined => {
    closeRun(out, run);
    out.push(text);
    return undefined;
  };

  // Blank, and every structure whose line *is* its meaning. A table joined into
  // one line stops being a table; a heading joined onto the paragraph above it
  // stops being a heading.
  if (line.trim() === '' || THEMATIC_BREAK.test(line)) return emit(line);
  if (HEADING.test(line) || TABLE_ROW.test(line)) return emit(absolutiseLine(line, from));

  if (BLOCKQUOTE.test(line)) {
    const inner = line.replace(/^ {0,3}>\s?/, '');
    // `>` alone separates two quoted paragraphs, and joining across it would
    // merge them. Anything that is a block in its own right ends the run too.
    if (inner.trim() === '' || HEADING.test(inner) || TABLE_ROW.test(inner)) {
      return emit(absolutiseLine(line, from));
    }
    const text = absolutiseLine(inner, from);
    if (run?.kind === 'quote') {
      run.parts.push(text.trim());
      return run;
    }
    return start(out, run, 'quote', text.trim());
  }

  const item = LIST_ITEM.exec(line);
  if (item !== null) return start(out, run, 'list', absolutiseLine(line, from).trimEnd());

  // Four spaces with nothing open is an indented code block; four spaces under
  // an open list item is that item, wrapped. The open run is what tells them
  // apart, and there is no other signal available line by line.
  if (run === undefined && /^ {4,}\S/.test(line)) return emit(line);

  const text = absolutiseLine(line, from);
  if (run !== undefined) {
    run.parts.push(text.trim());
    return run;
  }
  // ⚠️ **The first line of a run keeps its leading whitespace**, which is what
  // holds a continuation paragraph inside the list item it belongs to. A fenced
  // block ends the run, so the paragraph after one starts a fresh run — and
  // trimming it there quietly promotes it to a top-level paragraph.
  return start(out, run, 'prose', text.trimEnd());
}

/** Closes whatever run is open and opens a new one. */
function start(out: string[], run: Run | undefined, kind: RunKind, first: string): Run {
  closeRun(out, run);
  return { kind, parts: [first] };
}

/**
 * Emits an open run, if there is one — the single spelling of *what a run looks
 * like once it is closed*.
 *
 * The three callers each had a byte-identical copy of this line, under a
 * docstring one screen up arguing that three copies of one question is the
 * drift this repository gates elsewhere. Caught in review, which is the only
 * thing that was ever going to catch it.
 */
function closeRun(out: string[], run: Run | undefined): void {
  if (run === undefined) return;

  const joined = run.parts.join(' ');
  out.push(run.kind === 'quote' ? `> ${joined}` : joined);
}

/**
 * One line with its repository-relative link targets absolutised, and its code
 * spans untouched.
 *
 * ⚠️ **What decides is where the *target* sits, not where the link sits.** The
 * first version of this split the line on code spans and rewrote the pieces
 * between them, which is wrong for the shape this repository writes constantly:
 * in ``[`CONTRIBUTING.md`](../../CONTRIBUTING.md)`` the backticks are in the
 * label, so the `[…]` and the `(…)` land in different pieces and the target is
 * never seen. Two of `docs/agents/issue-tracker.md`'s three relative links have
 * that shape, and a dry run over the real file is what found it.
 *
 * So the spans are measured once and used as a *filter*: a link whose target
 * falls inside one is code and is left alone, and every other link is rewritten
 * wherever its label's backticks happen to be.
 */
function absolutiseLine(line: string, from: string): string {
  const spans = codeSpanRanges(line);
  const inCode = (at: number): boolean => spans.some((span) => at >= span.start && at < span.end);

  const definition = LINK_DEFINITION.exec(line);
  if (
    definition?.[1] !== undefined &&
    definition[2] !== undefined &&
    !inCode(definition[1].length)
  ) {
    return (
      definition[1] + absolutise(definition[2], from, false) + line.slice(definition[0].length)
    );
  }

  return line.replace(
    INLINE_LINK,
    (
      whole: string,
      bang: string,
      label: string,
      target: string,
      title: string | undefined,
      offset: number,
    ) => {
      // Somewhere inside the parentheses is enough to decide: a code span
      // either swallows the whole link or none of it.
      const at = offset + whole.indexOf('(', bang.length + label.length) + 1;
      if (inCode(at)) return whole;

      const bare = target.startsWith('<') ? target.slice(1, -1) : target;
      const rewritten = absolutise(bare, from, bang === '!');
      if (rewritten === bare) return whole;
      return `${bang}${label}(${rewritten}${title ?? ''})`;
    },
  );
}

/** Where every inline code span in a line begins and ends. */
function codeSpanRanges(line: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];

  CODE_SPAN.lastIndex = 0;
  for (let span = CODE_SPAN.exec(line); span !== null; span = CODE_SPAN.exec(line)) {
    spans.push({ start: span.index, end: span.index + span[0].length });
  }
  return spans;
}

/**
 * One link target, absolutised — or handed back exactly as it arrived.
 *
 * ⚠️ **Unresolvable is left alone rather than guessed at.** A target that
 * escapes the repository has no URL, and inventing one produces a link that
 * looks right and 404s — which is strictly worse than a relative link a reader
 * can see is relative.
 *
 * `blob/` serves a page, `raw/` serves the bytes, and `tree/` serves a
 * directory listing. An image pointed at `blob/` renders as a broken image,
 * which is why the `!` matters here and nowhere else.
 */
function absolutise(target: string, from: string, isImage: boolean): string {
  if (target === '' || ABSOLUTE.test(target) || target.startsWith('#')) return target;

  const hash = target.indexOf('#');
  const path = hash === -1 ? target : target.slice(0, hash);
  const anchor = hash === -1 ? '' : target.slice(hash);
  if (path === '') return target;

  // A path that already carries `blob/main` is the shape a repository file
  // produces when it links out by hand. Resolving it would be wrong twice
  // over — the answer is the part after the segment, not the part before it.
  const web = ALREADY_WEB.exec(path);
  const resolved = web?.[2] ?? resolve(from, path);
  if (resolved === undefined) return target;

  const kind = isImage ? 'raw' : resolved.endsWith('/') ? 'tree' : 'blob';
  return `${REPO_WEB_ROOT}/${kind}/main/${resolved}${anchor}`;
}

/**
 * A repository-relative path resolved against the directory it was written in,
 * or `undefined` when it climbs out of the repository.
 *
 * Written out rather than taken from `node:path`, because `resolve` there
 * answers in the host's dialect: on Windows it produces backslashes and a drive
 * letter, and a URL is neither. A path in a link is POSIX wherever it is read.
 */
function resolve(from: string, path: string): string | undefined {
  const trailing = path.endsWith('/') ? '/' : '';
  const base = path.startsWith('/') ? [] : from.split('/').filter((part) => part !== '');
  const segments = [...base];

  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') {
      segments.push(part);
      continue;
    }
    if (segments.length === 0) return undefined;
    segments.pop();
  }

  return segments.length === 0 ? undefined : segments.join('/') + trailing;
}
