/**
 * Follow-up questions the model writes after its answer (docs/spec/ask-the-library.md
 * S6). Everything here treats the model's text as untrusted: a line is kept only if
 * it is a short plain question, and anything else is dropped without failing the
 * answer.
 */
import { stripAsterisks } from './asterisks.ts';

export const MAX_FOLLOW_UPS = 2;
export const MAX_FOLLOW_UP_CHARS = 120;

/** The marker line: FOLLOW-UPS, in any case, with bold marks, a colon or a dash around it. */
const MARKER = /^[\s*_#>-]*follow[\s-]*ups?(?:\s+questions?)?[\s*_:.-]*(.*)$/i;
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
