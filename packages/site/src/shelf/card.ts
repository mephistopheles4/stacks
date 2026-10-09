import type { LibraryBook } from '@stacks/core';
// A *value* import, and legal only because it comes from a pure subpath — the
// package root would drag `node:fs` and sharp into the browser bundle (G6). It
// is here rather than reimplemented so the split rule and the join rule are one
// piece of code: a second copy of `;` in this file is how a genre with a comma
// in it quietly becomes two.
import { parseSubjects } from '@stacks/core/subjects';
import { providerLinks, type ProviderLink } from './provider-links.ts';
import { markFor } from './provider-marks.ts';

/**
 * The card's content: what it shows, in what order, and what it drops.
 *
 * Eight blocks — cover, title, author, reading line, tags, object line,
 * subjects, links — ordered *what you brought to the book, then what the book
 * is, then the exit*. See docs/spec/enhanced-card.md §2.
 *
 * **The overlay that drew them retired with picking a book up** (spec §3.4,
 * ADR-0102): the same lines now sit on the held book's pages, laid out by
 * `held-page.ts`. What stays here is the model, the announcement and the links
 * row, built with `textContent`, never `innerHTML`: every value comes from the
 * vault, so a title containing markup renders as text.
 */

export function announcement(book: LibraryBook): string {
  return book.author === undefined ? book.title : `${book.title} by ${book.author}`;
}

/**
 * What the card says, before anything draws it.
 *
 * **The content rules are a pure function and the DOM is a thin renderer**, so
 * every collapse rule can be asserted without a browser or a DOM shim — this
 * repo has neither and prefers to keep it that way. `held-page.ts` turns
 * this into nodes and adds nothing to it.
 */
export interface CardModel {
  /**
   * `undefined` rather than absent, on every optional line.
   *
   * A model is not an artifact: `library.json` omits absent keys because a key
   * present-and-null is a claim, but this object exists for one function to hand
   * to another in the same tick. Spelling the absences out means every field is
   * enumerable and a missing one is a type error rather than a silent
   * `undefined` — and it keeps the site from needing `keyIfPresent`, which is a
   * *value* in `@stacks/core` and therefore not importable here (G6).
   */
  readonly cover: string | undefined;
  /**
   * The held copy, `held-covers/<name>`: what the enlarged view shows when the
   * build staged one, larger than the 512px shelf copy (spec §3.4, #377).
   */
  readonly heldCover: string | undefined;
  readonly title: string;
  readonly author: string | undefined;
  /** Always a string — the one line that renders on every card. */
  readonly reading: string;
  readonly tags: string | undefined;
  readonly object: string | undefined;
  readonly subjects: string | undefined;
  /** Always at least one — every book has a title, so every book has a search. */
  readonly links: readonly ProviderLink[];
}

export function cardModel(book: LibraryBook): CardModel {
  return {
    cover: book.cover,
    heldCover: book.heldCover,
    title: book.title,
    author: book.author,
    // **Always.** 19 of 41 real books are `read` with no dates and no rating, so
    // a line that renders only when it has dates is empty on 46% of the library.
    reading: readingLine(book),
    tags: tagsLine(book.tags),
    object: objectLine(book),
    subjects: subjectsLine(book),
    links: providerLinks(book),
  };
}

/**
 * Tags the *importer* wrote, which the owner never did.
 *
 * `import/audible.ts` puts `audiobook` at the front of every book it brings in —
 * "so the shelf can tell them apart later", by its own comment — and that is a
 * marker for other code, not a word the reader chose. The tags strip is the
 * card's one line of the owner's own vocabulary, so a machine's bookkeeping
 * leading 24 of 41 of them is the wrong thing in the wrong place.
 *
 * **Hidden here and nowhere else.** The tag stays in the note, `library.json`
 * still carries it, and `identity.ts` still reads it to keep an audiobook from
 * shelving on top of its print edition. ⚠️ The consequence is that nothing on
 * the card now says a book is an audiobook: `narrator`, `duration` and `asin`
 * are import-only keys and were never `BookRecord` fields.
 *
 * An exact match, not a prefix: `audiobook-club` would be the owner's.
 */
const IMPORTER_TAGS: readonly string[] = ['audiobook'];

function tagsLine(tags: readonly string[]): string | undefined {
  const owned = tags.filter((tag) => !IMPORTER_TAGS.includes(tag));
  return owned.length === 0 ? undefined : owned.join(' · ');
}

/**
 * Status, then a date, then stars — and it leads with the status word every
 * time.
 *
 * `read` used to be suppressed as the default. That was defensible while status
 * shared a line with the page count; once the line is *about* reading, dropping
 * it leaves an empty group on half the shelf.
 *
 * ⚠️ `'★'.repeat(rating)` is unchanged and **has never been rendered by
 * anything**: `rating` is on 0 of 41 real books.
 */
function readingLine(book: LibraryBook): string {
  const parts: string[] = [book.status];
  if (book.finished !== undefined) parts.push(`finished ${book.finished}`);
  else if (book.started !== undefined) parts.push(`started ${book.started}`);
  if (book.rating !== undefined) parts.push('★'.repeat(book.rating));
  return parts.join(' · ');
}

/**
 * Catalogue order: publication, then physical object, then identifier.
 *
 * The order a reader already knows from a catalogue entry, and it costs no new
 * line. Drops **whole** when all five are absent — 5 of 41 books — while the
 * region it sits in never vanishes, because the links row always renders.
 */
function objectLine(book: LibraryBook): string | undefined {
  const parts: string[] = [];
  if (book.publisher !== undefined) parts.push(book.publisher);
  const year = publicationYear(book.published);
  if (year !== undefined) parts.push(year);
  if (book.pages !== undefined) parts.push(`${String(book.pages)} pages`);
  // Shown only when declared, never inferred from the shelf's per-book hash: the
  // card must not present a guess as a fact.
  if (book.binding !== undefined) parts.push(book.binding);
  // A visible string in its own right, independent of the link it produces.
  if (book.isbn !== undefined) parts.push(book.isbn);

  return parts.length === 0 ? undefined : parts.join(' · ');
}

/**
 * The first four-digit run, or the string itself.
 *
 * The note stores whatever the provider said — `2019-03-05T07:00:00Z` if that is
 * what Apple gave — because normalising at write time was the one irreversible
 * option. Tidiness is a display need and lives here.
 *
 * **Fail open**: a value with no four-digit run renders verbatim rather than
 * vanishing, so a hand-editor who wrote `forthcoming` sees `forthcoming`. The
 * card must never hide what the note says.
 */
export function publicationYear(published: string | undefined): string | undefined {
  if (published === undefined) return undefined;
  return /\d{4}/.exec(published)?.[0] ?? published;
}

/**
 * Provider categories, on their own line below the object line.
 *
 * Owner `tags` stay up in the reading half and provider subjects sit down in the
 * object half, which is the card's own "what you brought to the book / what the
 * book is" split doing the work it was built for — and it keeps the two category
 * strips from being mistaken for each other.
 */
function subjectsLine(book: LibraryBook): string | undefined {
  if (book.subjects === undefined) return undefined;
  const parts = parseSubjects(book.subjects);
  return parts.length === 0 ? undefined : parts.join(' · ');
}

/** The links row: the card's exit, now on the held book's right-hand page. */
export function linksRow(links: readonly ProviderLink[]): HTMLElement {
  const row = element('div', 'card-links');
  for (const link of links) row.append(anchor(link));
  return row;
}

function anchor(link: ProviderLink): HTMLAnchorElement {
  const node = document.createElement('a');
  node.href = link.href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  node.className = `card-link card-link-${link.kind}`;

  if (link.text !== undefined) {
    // A text link names itself. Adding `title` or `aria-label` on top risks a
    // WCAG 2.5.3 mismatch from the other direction.
    node.textContent = link.text;
    return node;
  }

  // `title` is the tooltip *and* the accessible name — see `ProviderLink.name`.
  node.title = link.name;

  const mark = markFor(link.kind);
  // A mark that failed to parse leaves the name as the link's only content,
  // which is a degraded row rather than an empty one: `title` still names it and
  // the anchor is still the right size. An icon-only link with no icon *and* no
  // text would be an invisible control.
  node.append(mark ?? link.name);
  return node;
}

function element(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
