import type { LibraryBook } from '@stacks/core';
import { cardModel, linksRow } from './card.ts';

/**
 * The held book's two pages: what replaced the card (spec §3.4, ADR-0102).
 *
 * The card's content moves onto the open book. The left-hand page carries the
 * title and author, as #371 prototyped. The right-hand page carries the Thoughts
 * when the book has them, closed by a rule, then the card's own lines, so the
 * links stay reachable for every book. The rule belongs to the Thoughts' slot, so
 * a fetch that fails or has not landed leaves no rule over nothing; a book with none shows the card's lines alone
 * (#369's C). On a phone, which frames the right-hand page alone, the title and
 * author lead that page too.
 *
 * **Two controls close the book again** to the closed rest it landed on, where
 * it can be turned (#553): "Close the book" at the top left of the page that
 * carries the title — the left page, or the right one on a phone, where it stays
 * in view while the Thoughts scroll — and "Turn the book over" at the foot of the
 * right page. The page carries no put-back control: the book arrives closed with
 * its pages hidden, so the X that puts it back lives in the header (#531,
 * `index.astro`).
 *
 * **What goes where is a pure function** (`leftPageBlocks`, `rightPageBlocks`),
 * tested without a DOM; `buildPages` turns it into nodes and adds nothing.
 * **Every text node is set through `textContent`**; nothing here is built from
 * markup (#368, rule 8). Styles come from classes in `Shelf.astro`'s
 * stylesheet and from CSSOM, never from a `style` attribute, which the CSP
 * refuses.
 */

/** The class on "Close the book", which `pickup.ts` listens for by delegation. */
export const CLOSE_BUTTON_CLASS = 'held-close';
/** The class on "Turn the book over", the second way to close it. */
export const TURN_OVER_BUTTON_CLASS = 'held-turn-over';

export type LeftBlock = 'close' | 'title' | 'author';
export type RightBlock =
  | 'close'
  | 'title'
  | 'author'
  | 'thoughts'
  | 'reading'
  | 'tags'
  | 'object'
  | 'subjects'
  | 'links'
  | 'turn-over';

/**
 * The left page: the close control by the title, then the title and author. On
 * a phone the left page is off screen and carries no control, so Tab never
 * reaches a button nobody can see.
 */
export function leftPageBlocks(
  book: LibraryBook,
  options: { readonly narrow: boolean },
): LeftBlock[] {
  const blocks: (LeftBlock | false)[] = [
    !options.narrow && 'close',
    'title',
    book.author !== undefined && 'author',
  ];
  return blocks.filter((block): block is LeftBlock => block !== false);
}

export interface RightPageOptions {
  /** A phone's framing: the right-hand page alone fills the screen. */
  readonly narrow: boolean;
  /** Whether `library.json` says this book has a notes file. */
  readonly thoughts: boolean;
}

export function rightPageBlocks(book: LibraryBook, options: RightPageOptions): RightBlock[] {
  const model = cardModel(book);
  const blocks: (RightBlock | false)[] = [
    options.narrow && 'close',
    options.narrow && 'title',
    options.narrow && book.author !== undefined && 'author',
    options.thoughts && 'thoughts',
    'reading',
    model.tags !== undefined && 'tags',
    model.object !== undefined && 'object',
    model.subjects !== undefined && 'subjects',
    'links',
    // Every book, covered or not: what is turned is the book, and a book with
    // no cover still has its binding and its spine colour (#418, S7).
    'turn-over',
  ];
  return blocks.filter((block): block is RightBlock => block !== false);
}

/** How long Thoughts that arrive after the page has shown take to fade in. */
const THOUGHTS_FADE_MS = 400;

/** The width a page is laid out at, in CSS pixels, before `CSS3DRenderer` scales it. */
export const PAGE_PX = 460;

export interface HeldPages {
  readonly left: HTMLElement;
  readonly right: HTMLElement;
  /** "Close the book", by the title: back to the closed rest (#553). */
  readonly close: HTMLButtonElement;
  /** "Turn the book over", at the foot of the right page: the same close. */
  readonly turnOver: HTMLButtonElement;
  /**
   * Fills the Thoughts slot, when they arrive: plain text, one `<p>` each, and
   * the rule below them. `fade` for Thoughts that land once the page is
   * already showing, which fade in at rest rather than pop in (spec §3.1).
   */
  showThoughts(paragraphs: readonly string[], fade: boolean): void;
  /** Long Thoughts scroll at rest only (#369): on while held, off in motion. */
  setScrollable(scrollable: boolean): void;
}

export interface PageSize {
  /** The page's width and height in world units, for its aspect. */
  readonly width: number;
  readonly height: number;
}

export function buildPages(
  book: LibraryBook,
  size: PageSize,
  options: RightPageOptions,
): HeldPages {
  const model = cardModel(book);
  const heightPx = (PAGE_PX * size.height) / size.width;

  const close = closeButton();
  const left = page('held-page held-page-left', heightPx);
  for (const block of leftPageBlocks(book, options)) {
    left.append(
      block === 'close'
        ? close
        : block === 'title'
          ? text('h2', model.title, 'held-title')
          : text('p', model.author ?? '', 'held-author'),
    );
  }

  const right = page('held-page held-page-right', heightPx);
  // Focusable by script and never by Tab: where focus goes when a screen reader
  // opens the book, so the Thoughts are read next.
  right.tabIndex = -1;
  const thoughts = element('div', 'held-thoughts');
  const turnOver = document.createElement('button');
  turnOver.type = 'button';
  turnOver.className = TURN_OVER_BUTTON_CLASS;
  turnOver.textContent = 'Turn the book over';

  for (const block of rightPageBlocks(book, options)) {
    right.append(rightBlock(block, model, { thoughts, close, turnOver }));
  }

  return {
    left,
    right,
    close,
    turnOver,
    showThoughts(paragraphs, fade) {
      const label = text('p', 'Thoughts', 'held-label');
      thoughts.replaceChildren(
        label,
        ...paragraphs.map((paragraph) => text('p', paragraph)),
        document.createElement('hr'),
      );
      // A book whose flag promised Thoughts and whose fetch then failed keeps
      // the slot empty; one that delivered shows them above the rule.
      thoughts.hidden = false;
      // The Web Animations API rather than a CSS transition: a script-driven
      // animation is not a `style` the CSP has to admit.
      if (fade) thoughts.animate([{ opacity: 0 }, { opacity: 1 }], { duration: THOUGHTS_FADE_MS });
    },
    setScrollable(scrollable) {
      right.style.overflowY = scrollable ? 'auto' : 'hidden';
    },
  };
}

function rightBlock(
  block: RightBlock,
  model: ReturnType<typeof cardModel>,
  nodes: {
    readonly thoughts: HTMLElement;
    readonly close: HTMLButtonElement;
    readonly turnOver: HTMLButtonElement;
  },
): HTMLElement {
  switch (block) {
    case 'title':
      return text('h2', model.title, 'held-title');
    case 'author':
      return text('p', model.author ?? '', 'held-author');
    case 'thoughts':
      // Empty until the fetch returns, and out of the accessibility tree while
      // it is: an empty labelled region would be read out as nothing.
      nodes.thoughts.hidden = true;
      return nodes.thoughts;
    case 'reading':
      return text('p', model.reading, 'reading');
    case 'tags':
      return text('p', model.tags ?? '', 'tags');
    case 'object':
      return text('p', model.object ?? '', 'object');
    case 'subjects':
      return text('p', model.subjects ?? '', 'subjects');
    case 'links':
      return linksRow(model.links);
    case 'close':
      return nodes.close;
    case 'turn-over':
      return nodes.turnOver;
  }
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * "Close the book": a closed book's outline and the word, built as elements and
 * never parsed from markup (rule 8), its name set through `textContent`.
 */
function closeButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = CLOSE_BUTTON_CLASS;
  const icon = document.createElementNS(SVG, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '16');
  icon.setAttribute('height', '16');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  // A book seen from the front: the board, and the spine's edge down its left.
  for (const d of ['M6 3h12v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 3v18']) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    icon.append(path);
  }
  button.append(icon, text('span', 'Close the book'));
  return button;
}

function page(className: string, heightPx: number): HTMLElement {
  const node = element('div', className);
  node.style.width = `${String(PAGE_PX)}px`;
  node.style.height = `${String(Math.round(heightPx))}px`;
  return node;
}

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

/** A same-origin path from the site root, the shape `library.json` writes without the slash. */
export function rooted(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
