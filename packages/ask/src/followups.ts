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
 * and the line stays in the answer (behaviour E3).
 */
const MARKER = /^[\s*_#>-]*follow[\s-]*ups?(?:\s+questions?)?[\s*_]*(?:[:\u2013\u2014-]\s*(.*)|)$/i;
const MARKUP = /:\/\/|www\.|[<>`[\]{}|\\]|\]\(/;
/** What a model puts before a list item: a bullet or a number. */
const LEADING = /^\s*(?:[-*•–—]+|\d+[.)])\s*/;
const NONE = /^(?:none|n\/a|no follow-ups?)\.?$/i;

export interface Split {
  readonly answer: string;
  readonly followUps: readonly string[];
}

/** Cuts the answer at the last marker line and reads the lines under it as questions. */
export function splitFollowUps(text: string): Split {
  const lines = text.split(/\r?\n/);
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (MARKER.test(lines[i] ?? '')) {
      at = i;
      break;
    }
  }
  if (at < 0) return { answer: text.trim(), followUps: [] };

  const answer = lines.slice(0, at).join('\n').trim();
  const rest = [MARKER.exec(lines[at] ?? '')?.[1] ?? '', ...lines.slice(at + 1)];
  const kept: string[] = [];
  for (const raw of rest) {
    const line = stripAsterisks(raw.replace(LEADING, '').replace(/^["'“‘]+|["'”’]+$/g, '')).trim();
    if (line === '' || NONE.test(line)) continue;
    if (!acceptable(line) || kept.includes(line)) continue;
    kept.push(line);
    if (kept.length === MAX_FOLLOW_UPS) break;
  }
  return { answer, followUps: kept };
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
