import { MAX_SEARCH_BOOKS } from './limits.ts';
import type { CatalogueBook } from './library.ts';

/**
 * Which catalogue books a text names, for the pills under an answer (S6, S7).
 *
 * Three things a model's text does that a plain substring match gets wrong:
 * it writes a curly apostrophe where the title has a straight one (or the other
 * way round); it names a longer title that holds a shorter one ("Lantern Keeper's
 * Path" holds "Lantern Keeper"), so the shorter book shows as a second, wrong pill;
 * and it sometimes names no book at all.
 */

const APOSTROPHES = /[‘’ʼ′]/g;

/** Lower case, one kind of apostrophe, so matching does not depend on typography. */
export function fold(text: string): string {
  return text.toLowerCase().replace(APOSTROPHES, "'");
}

interface Span {
  readonly book: CatalogueBook;
  readonly start: number;
  readonly end: number;
}

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** The names a book can be called: its whole title, and the part before a colon. */
function namesOf(book: CatalogueBook): string[] {
  const full = fold(book.title);
  const head = fold(book.title.split(':')[0] ?? book.title);
  return head !== full && head.length >= 5 ? [full, head] : [full];
}

function spansIn(text: string, books: readonly CatalogueBook[]): Span[] {
  const spans: Span[] = [];
  for (const book of books) {
    for (const name of namesOf(book)) {
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

function named(text: string, catalogue: readonly CatalogueBook[]): CatalogueBook[] {
  const spans = spansIn(fold(text), catalogue);
  // A book stays if any occurrence of it is not swallowed by a longer title, so a
  // book named on its own as well as inside a longer one keeps its pill.
  const kept = new Set(spans.filter((s) => !swallowed(s, spans)).map((s) => s.book));
  return catalogue.filter((book) => kept.has(book));
}

/**
 * The books the answer names; when it names none, the books the visitor's question
 * names, by the same matching. At most 6, in catalogue order.
 */
export function mentioned(
  catalogue: readonly CatalogueBook[],
  answer: string,
  question = '',
): CatalogueBook[] {
  const fromAnswer = named(answer, catalogue);
  const books = fromAnswer.length > 0 ? fromAnswer : named(question, catalogue);
  return books.slice(0, MAX_SEARCH_BOOKS);
}
