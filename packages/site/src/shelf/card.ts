import type { LibraryBook } from '@stacks/core';
import { providerLinks, type ProviderLink } from './provider-links.ts';

/**
 * The book detail card: what it shows, in what order, and what it drops.
 *
 * Eight blocks — cover, title, author, reading line, tags, object line,
 * subjects, links — ordered *what you brought to the book, then what the book
 * is, then the exit*. See docs/spec/enhanced-card.md §2.
 *
 * **Built with `textContent` and `replaceChildren`, never `innerHTML`.** Every
 * value here comes from the vault, so a title containing markup renders as text.
 *
 * **The contents are replaced; the card is not.** `showCard` swaps the children
 * of an inner container, because the close control must survive a tap-to-swap —
 * a control inside the replaced subtree is destroyed and recreated on every tap,
 * dropping focus to `<body>` mid-browse on the primary mobile gesture.
 */

/** The separator core joins `subjects` with. Split, then trim. */
const SUBJECT_SEPARATOR = ';';

export interface CardElements {
  /** The `<aside>`. A named `complementary` landmark, never a `dialog`. */
  readonly card: HTMLElement;
  /** The replaced subtree. Everything else in the card outlives a swap. */
  readonly body: HTMLElement;
  /**
   * A permanently-present, visually-hidden `role="status"` **outside** the card.
   *
   * It cannot live inside it, for a reason that is structural rather than a
   * preference: a `hidden` element is out of the accessibility tree, so a live
   * region in the card could not announce the card *opening* at all. It also
   * carries only title and author — `replaceChildren` on a live region would
   * re-read all eight blocks on every tap, which is an announcement people
   * switch off.
   */
  readonly status: HTMLElement;
}

export function showCard(elements: CardElements, book: LibraryBook): void {
  elements.body.replaceChildren(...blocks(book));
  elements.card.hidden = false;
  // A swap re-announces by the same mechanism as an open, because the text
  // changes. Tapping the same book twice announces nothing, which is correct:
  // nothing changed.
  elements.status.textContent = announcement(book);
}

export function hideCard(elements: CardElements): void {
  elements.card.hidden = true;
  // Cleared silently — clearing a live region produces no announcement, and
  // confirming a dismissal the user just performed is noise on a surface they
  // will dismiss dozens of times.
  elements.status.textContent = '';
}

export function announcement(book: LibraryBook): string {
  return book.author === undefined ? book.title : `${book.title} by ${book.author}`;
}

/**
 * What the card says, before anything draws it.
 *
 * **The content rules are a pure function and the DOM is a thin renderer**, so
 * every collapse rule can be asserted without a browser or a DOM shim — this
 * repo has neither and prefers to keep it that way. `renderCard` below turns
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
    title: book.title,
    author: book.author,
    // **Always.** 19 of 41 real books are `read` with no dates and no rating, so
    // a line that renders only when it has dates is empty on 46% of the library.
    reading: readingLine(book),
    tags: book.tags.length === 0 ? undefined : book.tags.join(' · '),
    object: objectLine(book),
    subjects: subjectsLine(book),
    links: providerLinks(book),
  };
}

function blocks(book: LibraryBook): HTMLElement[] {
  const model = cardModel(book);

  const header = element('div', 'card-header');
  if (model.cover !== undefined) header.append(cover(model.cover, model.title));

  const titles = element('div', 'card-titles');
  titles.append(text('h2', model.title));
  if (model.author !== undefined) titles.append(text('p', model.author, 'author'));
  header.append(titles);

  const nodes: (HTMLElement | undefined)[] = [
    header,
    text('p', model.reading, 'reading'),
    model.tags === undefined ? undefined : text('p', model.tags, 'tags'),
    model.object === undefined ? undefined : text('p', model.object, 'object'),
    model.subjects === undefined ? undefined : text('p', model.subjects, 'subjects'),
    linksRow(model.links),
  ];

  return nodes.filter((node): node is HTMLElement => node !== undefined);
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
  const parts = book.subjects
    .split(SUBJECT_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length === 0 ? undefined : parts.join(' · ');
}

/** The card's terminal element, where an interactive row belongs. */
function linksRow(links: readonly ProviderLink[]): HTMLElement {
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
  node.append(mark(link.kind));
  return node;
}

/**
 * ⚠️ **Placeholder artwork, at the real footprint.**
 *
 * The licensed marks are not vendored: every grant found is permission to *use*
 * a provider's artwork and silent about *redistributing* it, which is an open
 * question rather than a settled one. These occupy the footprint the layout was
 * measured against so nothing moves when the real files land, and each is
 * `aria-hidden` because the anchor carries the name.
 */
function mark(kind: ProviderLink['kind']): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'card-mark');

  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  glyph.setAttribute('x', '12');
  glyph.setAttribute('y', '17');
  glyph.setAttribute('text-anchor', 'middle');
  glyph.setAttribute('font-size', '15');
  glyph.textContent = PLACEHOLDER[kind];
  svg.append(glyph);

  return svg;
}

const PLACEHOLDER: Readonly<Record<ProviderLink['kind'], string>> = {
  'open-library': 'OL',
  google: 'G',
  apple: 'A',
  search: '?',
};

function text(tag: string, content: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className !== undefined) node.className = className;
  return node;
}

function element(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function cover(src: string, title: string): HTMLElement {
  const node = document.createElement('img');
  node.src = src.startsWith('/') ? src : `/${src}`;
  node.alt = `Cover of ${title}`;
  node.loading = 'lazy';
  return node;
}
