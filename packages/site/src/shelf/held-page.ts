import type { LibraryBook } from '@stacks/core';
import { cardModel, linksRow } from './card.ts';
import { COVER_BUTTON_CLASS, offerCover } from './cover-viewer.ts';

/**
 * The held book's two pages: what replaced the card (spec §3.4, ADR-0102).
 *
 * The card's content moves onto the open book. The left-hand page carries the
 * title and author, as #371 prototyped. The right-hand page carries the Thoughts
 * when the book has them, then a rule, then the card's own lines, so the links
 * stay reachable for every book; a book with none shows the card's lines alone
 * (#369's C). On a phone, which frames the right-hand page alone, the title and
 * author lead that page too. The enlarged cover is opened from a control among
 * the lines, and a put-back control ends the page: a phone fills the screen with
 * the page, so there is no empty space to tap.
 *
 * **What goes where is a pure function** (`leftPageBlocks`, `rightPageBlocks`),
 * tested without a DOM; `buildPages` turns it into nodes and adds nothing.
 * **Every text node is set through `textContent`**; nothing here is built from
 * markup (#368, rule 8). Styles come from classes in `Shelf.astro`'s
 * stylesheet and from CSSOM, never from a `style` attribute, which the CSP
 * refuses.
 */

export type LeftBlock = 'title' | 'author';
export type RightBlock =
  | 'title'
  | 'author'
  | 'thoughts'
  | 'rule'
  | 'reading'
  | 'tags'
  | 'object'
  | 'subjects'
  | 'links'
  | 'cover'
  | 'put-back';

export function leftPageBlocks(book: LibraryBook): LeftBlock[] {
  return book.author === undefined ? ['title'] : ['title', 'author'];
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
    options.narrow && 'title',
    options.narrow && book.author !== undefined && 'author',
    options.thoughts && 'thoughts',
    options.thoughts && 'rule',
    'reading',
    model.tags !== undefined && 'tags',
    model.object !== undefined && 'object',
    model.subjects !== undefined && 'subjects',
    'links',
    model.cover !== undefined && 'cover',
    'put-back',
  ];
  return blocks.filter((block): block is RightBlock => block !== false);
}

/** The width a page is laid out at, in CSS pixels, before `CSS3DRenderer` scales it. */
export const PAGE_PX = 460;

export interface HeldPages {
  readonly left: HTMLElement;
  readonly right: HTMLElement;
  /** The put-back control: a real `<button>`, named for what it does. */
  readonly putBack: HTMLButtonElement;
  /** Fills the Thoughts slot, when they arrive. Plain text, one `<p>` each. */
  showThoughts(paragraphs: readonly string[]): void;
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

  const left = page('held-page held-page-left', heightPx);
  for (const block of leftPageBlocks(book)) {
    left.append(
      block === 'title'
        ? text('h2', model.title, 'held-title')
        : text('p', model.author ?? '', 'held-author'),
    );
  }

  const right = page('held-page held-page-right', heightPx);
  const thoughts = element('div', 'held-thoughts');
  const putBack = document.createElement('button');
  putBack.type = 'button';
  putBack.className = 'held-put-back';
  putBack.textContent = 'Put the book back';

  for (const block of rightPageBlocks(book, options)) {
    right.append(rightBlock(block, model, thoughts, putBack));
  }

  return {
    left,
    right,
    putBack,
    showThoughts(paragraphs) {
      const label = text('p', 'Thoughts', 'held-label');
      thoughts.replaceChildren(label, ...paragraphs.map((paragraph) => text('p', paragraph)));
      // A book whose flag promised Thoughts and whose fetch then failed keeps
      // the slot empty; one that delivered shows them above the rule.
      thoughts.hidden = false;
    },
    setScrollable(scrollable) {
      right.style.overflowY = scrollable ? 'auto' : 'hidden';
    },
  };
}

function rightBlock(
  block: RightBlock,
  model: ReturnType<typeof cardModel>,
  thoughts: HTMLElement,
  putBack: HTMLButtonElement,
): HTMLElement {
  switch (block) {
    case 'title':
      return text('h2', model.title, 'held-title');
    case 'author':
      return text('p', model.author ?? '', 'held-author');
    case 'thoughts':
      // Empty until the fetch returns, and out of the accessibility tree while
      // it is: an empty labelled region would be read out as nothing.
      thoughts.hidden = true;
      return thoughts;
    case 'rule':
      return document.createElement('hr');
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
    case 'cover':
      return coverControl(model.cover ?? '', model.heldCover, model.title);
    case 'put-back':
      return putBack;
  }
}

/**
 * The enlarged cover's control. A text button rather than a thumbnail: the
 * page shows no picture of the cover, because the book in your hand is one.
 * The paths and the alt text are offered to the viewer in memory, keyed by the
 * button, and never written into the page (`cover-viewer.ts`).
 */
function coverControl(cover: string, held: string | undefined, title: string): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = COVER_BUTTON_CLASS;
  button.textContent = 'See the cover larger';
  offerCover(button, {
    cover: rooted(cover),
    held: held === undefined ? undefined : rooted(held),
    alt: `Cover of ${title}`,
  });
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
function rooted(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
