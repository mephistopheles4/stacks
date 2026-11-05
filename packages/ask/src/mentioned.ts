import { MAX_SEARCH_BOOKS } from './limits.ts';
import type { CatalogueBook } from './library.ts';
import type { Exchange } from './prompt.ts';

/**
 * Which catalogue books a text names, for the pills under an answer and for the memory
 * fallback (S6, S7).
 *
 * Four things a model's text does that a plain substring match gets wrong:
 * it writes a curly apostrophe where the title has a straight one (or the other
 * way round); it names a longer title that holds a shorter one ("Lantern Keeper's
 * Path" holds "Lantern Keeper"), so the shorter book shows as a second, wrong pill;
 * it sometimes names no book at all; and it uses a title's words as plain prose
 * ("a staff engineer feels most alive"), which is not the book.
 */

const APOSTROPHES = /[‘’ʼ′]/g;

/** One kind of apostrophe, so matching does not depend on typography. */
const straight = (text: string): string => text.replace(APOSTROPHES, "'");

/**
 * The small words a title is written either way: "The Art of Spending Money" and "The Art Of
 * Spending Money" are one book, and so is "the Art of ..." mid-sentence. Only these fold, in the
 * title and in the answer alike, so the main words still need the title's capitals.
 */
const SMALL_WORD = /\b(?:of|the|a|an|and|in|to)\b/gi;
const foldSmall = (text: string): string =>
  straight(text).replace(SMALL_WORD, (word) => word.toLowerCase());

/** Lower case as well: how a visitor's question is matched, because visitors type loosely. */
export function fold(text: string): string {
  return straight(text).toLowerCase();
}

interface Span {
  readonly book: CatalogueBook;
  readonly start: number;
  readonly end: number;
}

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** The names a book can be called: its whole title, and the part before a colon. */
function namesOf(book: CatalogueBook, normalise: (text: string) => string): string[] {
  const full = normalise(book.title);
  const head = normalise(book.title.split(':')[0] ?? book.title);
  return head !== full && head.length >= 5 ? [full, head] : [full];
}

function spansIn(
  text: string,
  books: readonly CatalogueBook[],
  normalise: (text: string) => string,
): Span[] {
  const spans: Span[] = [];
  for (const book of books) {
    for (const name of namesOf(book, normalise)) {
      if (name === '') continue;
      for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
        const end = at + name.length;
        // A name inside a longer word is not the name.
        if (isWordChar(text[at - 1]) || isWordChar(text[end])) continue;
        spans.push({ book, start: at, end });
      }
    }
  }
  return spans;
}

/** A span that lies inside a longer span at the same place in the text. */
function swallowed(span: Span, all: readonly Span[]): boolean {
  return all.some(
    (other) =>
      other.book !== span.book &&
      other.start <= span.start &&
      other.end >= span.end &&
      other.end - other.start > span.end - span.start,
  );
}

/**
 * The books a text names. `loose` ignores case (a visitor's question); otherwise the
 * title's own capitalisation is required (a model's answer), so prose that happens to
 * hold a title's words in lower case names no book.
 */
function named(text: string, catalogue: readonly CatalogueBook[], loose: boolean): CatalogueBook[] {
  const normalise = loose ? fold : foldSmall;
  const spans = spansIn(normalise(text), catalogue, normalise);
  // A book stays if any occurrence of it is not swallowed by a longer title, so a
  // book named on its own as well as inside a longer one keeps its pill.
  const kept = new Set(spans.filter((s) => !swallowed(s, spans)).map((s) => s.book));
  return catalogue.filter((book) => kept.has(book));
}

/**
 * The books the earlier exchanges name, newest exchange first and in catalogue order
 * within one. A visitor's earlier question is matched loosely, the bot's answer exactly.
 */
export function namedInMemory(
  catalogue: readonly CatalogueBook[],
  history: readonly Exchange[],
  only?: ReadonlySet<string>,
): CatalogueBook[] {
  const found = new Map<string, CatalogueBook>();
  for (const exchange of [...history].reverse()) {
    for (const book of [
      ...named(exchange.answer, catalogue, false),
      ...named(exchange.question, catalogue, true),
    ]) {
      if (!found.has(book.id)) found.set(book.id, book);
    }
  }
  const books = [...found.values()];
  return only === undefined ? books : books.filter((b) => only.has(b.id));
}

/**
 * The books the answer names; when it names none, the books the visitor's question
 * names; when neither does, the books earlier exchanges name, newest first, and only those in
 * `only` when it is given (the books this question's search returned). At most 6.
 */
export function mentioned(
  catalogue: readonly CatalogueBook[],
  answer: string,
  question = '',
  history: readonly Exchange[] = [],
  only?: ReadonlySet<string>,
): CatalogueBook[] {
  const fromAnswer = named(answer, catalogue, false);
  if (fromAnswer.length > 0) return fromAnswer.slice(0, MAX_SEARCH_BOOKS);
  const fromQuestion = named(question, catalogue, true);
  if (fromQuestion.length > 0) return fromQuestion.slice(0, MAX_SEARCH_BOOKS);
  return namedInMemory(catalogue, history, only).slice(0, MAX_SEARCH_BOOKS);
}
