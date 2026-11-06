/**
 * Follow-up questions the model writes after its answer (docs/spec/ask-the-library.md
 * S6). Everything here treats the model's text as untrusted: a line is kept only if
 * it is a short plain question, and anything else is dropped without failing the
 * answer.
 */
import { stripAsterisks } from './asterisks.ts';
import type { CatalogueBook } from './library.ts';
import { STOP_WORDS, namesTitle, words } from './search.ts';

export const MAX_FOLLOW_UPS = 2;
export const MAX_FOLLOW_UP_CHARS = 120;

/**
 * The marker line: FOLLOW-UPS, in any case, with bold marks or a heading around it. What follows the
 * word is read as the first follow-up only after a colon or a dash; anything else on the line means
 * it is a sentence that happens to start with those words ("Follow up with Nexus, it is great."),
 * and the line stays in the answer (behaviour E3). A single full stop or question mark with nothing
 * after it still counts as the marker (behaviour N2). `MARKER_IN_LINE` below is the narrower rule for
 * a marker that does not start its line.
 */
const MARKER =
  /^[\s*_#>-]*follow[\s-]*ups?(?:\s+questions?)?[\s*_]*(?:[:\u2013\u2014-]\s*(.*)|[.?]?[\s*_]*)$/i;
/**
 * The marker inside a line that starts with something else, as DeepSeek writes it at the end of an
 * answer line (M3). Narrower than `MARKER` on purpose, because prose says "follow-up:" and "the
 * follow-up - it sat unread": only the exact `FOLLOW-UPS` the rules ask for, in capitals, then a
 * colon, and only when what follows is nothing, "none" or the opening of a list item. The bold marks
 * right round it, and the closing ones after the colon, go with it; the last one in a line wins.
 * The evals' `MARKER_LINE` and `MARKER_LEFT_IN_LINE` (scripts/lib/ask-evals.ts) are the same rule seen
 * from the other side; the in-line one is looser in what may follow the colon on purpose, and says why.
 */
const MARKER_IN_LINE =
  /[*_#>]{0,3}(?<![\p{L}\p{N}])FOLLOW-UPS[*_]*:[*_]*(?=\s*(?:$|(?:none|None|NONE)\b|[-*•–—]\s|\d+[.)]\s))/gu;
/** Items written on one line: a question mark, then a dash or bullet, then the next item. */
const BETWEEN_ITEMS = /(?<=\?)\s+[-*•–—]\s+/;
const MARKUP = /:\/\/|www\.|[<>`[\]{}|\\]|\]\(/;
/** What a model puts before a list item: a bullet or a number. */
const LEADING = /^\s*(?:(?:[-*•–—]+|\d+[.)])\s*)+/;
const NONE = /^(?:none|n\/a|no follow-ups?)\.?$/i;

export interface Split {
  readonly answer: string;
  readonly followUps: readonly string[];
}

type Cut = { before: string; after: string } | undefined;

/** A line that is a marker: nothing before it, and the text after it. */
function wholeLine(line: string): Cut {
  const whole = MARKER.exec(line);
  return whole ? { before: '', after: whole[1] ?? '' } : undefined;
}

/** A line that holds the marker after other text: that text, and the text after the marker. */
function inLine(line: string): Cut {
  const last = [...line.matchAll(MARKER_IN_LINE)].at(-1);
  if (last === undefined) return undefined;
  return { before: line.slice(0, last.index), after: line.slice(last.index + last[0].length) };
}

/**
 * Cuts the answer at the last marker line and reads what follows it as questions. A line that is a
 * marker on its own wins over a marker inside a line, wherever each is; the inside form is tried
 * only when no line is one.
 */
export function splitFollowUps(text: string): Split {
  const lines = text.split(/\r?\n/);
  for (const find of [wholeLine, inLine]) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const cut = find(lines[i] ?? '');
      if (cut === undefined) continue;
      const answer = [...lines.slice(0, i), cut.before].join('\n').trim();
      return { answer, followUps: readItems([cut.after, ...lines.slice(i + 1)]) };
    }
  }
  return { answer: text.trim(), followUps: [] };
}

/** The questions kept from the text after the marker: untrusted, so each must pass the filters. */
function readItems(rest: readonly string[]): readonly string[] {
  const kept: string[] = [];
  for (const raw of rest.flatMap((line) => line.split(BETWEEN_ITEMS))) {
    const line = stripAsterisks(raw.replace(LEADING, '').replace(/^["'“‘]+|["'”’]+$/g, '')).trim();
    if (line === '' || NONE.test(line)) continue;
    if (!acceptable(line) || kept.includes(line)) continue;
    kept.push(line);
    if (kept.length === MAX_FOLLOW_UPS) break;
  }
  return kept;
}

/** A plain question: ends in one, is short, holds no link or markup, no control characters. */
export function acceptable(line: string): boolean {
  if (line.length < 8 || line.length > MAX_FOLLOW_UP_CHARS) return false;
  if (!line.endsWith('?') || MARKUP.test(line)) return false;
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

/**
 * T9: a follow-up is kept only if it names a catalogue title or a word that is in a
 * catalogue subject. The rule alone did not stop the model asking about a book that is
 * not on the shelf ("Have you written about The Great Gatsby?"), and a check it cannot
 * break costs nothing. A broad subject word ("business", "history") can let a weak one
 * through, and that is accepted.
 */
export function onTheShelf(line: string, catalogue: readonly CatalogueBook[]): boolean {
  if (catalogue.some((book) => namesTitle(book.title, line))) return true;
  const have = new Set(words(line));
  return catalogue.some((book) =>
    words(book.subjects ?? '').some((w) => w.length >= 4 && !STOP_WORDS.has(w) && have.has(w)),
  );
}
