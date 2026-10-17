import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { buildPages, leftPageBlocks, rightPageBlocks } from './held-page.ts';

/**
 * Just enough of a DOM element to run `buildPages`, with no DOM library: the
 * suite runs in node and this repo adds no dependency for one test.
 *
 * **A markup write is recorded and parses nothing**, so a node filled through
 * `innerHTML` reads back as empty text and fails the assertions below — the
 * builder must reach the text through `textContent` or not at all (#426).
 */
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  className = '';
  hidden = false;
  type = '';
  #text = '';

  constructor(
    readonly tagName: string,
    private readonly markupWrites: string[],
  ) {}

  get textContent(): string {
    return this.#text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.children.length = 0;
    this.#text = value;
  }

  set innerHTML(value: string) {
    this.markupWrites.push(value);
  }

  set outerHTML(value: string) {
    this.markupWrites.push(value);
  }

  insertAdjacentHTML(_where: string, value: string): void {
    this.markupWrites.push(value);
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') throw new Error(`a bare string was appended: ${node}`);
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  animate(): void {}
}

function all(node: FakeElement): FakeElement[] {
  return [node, ...node.children.flatMap(all)];
}

function byClass(root: FakeElement, className: string): FakeElement[] {
  return all(root).filter((node) => node.className.split(' ').includes(className));
}

const book = (patch: Partial<LibraryBook> = {}): LibraryBook => ({
  id: 'a-1',
  title: 'The Quiet Orchard',
  author: 'Ines Marlow',
  status: 'read',
  tags: [],
  ...patch,
});

describe('the left-hand page', () => {
  it('carries the title and the author, as prototyped (#371)', () => {
    expect(leftPageBlocks(book())).toEqual(['title', 'author']);
  });

  it('drops the author line for a book with none', () => {
    expect(leftPageBlocks(book({ author: undefined }))).toEqual(['title']);
  });
});

describe('the right-hand page', () => {
  it("is the card's lines and the examine control for a book with no Thoughts (#369's C)", () => {
    expect(rightPageBlocks(book(), { narrow: false, thoughts: false })).toEqual([
      'reading',
      'links',
      'examine',
      'put-back',
    ]);
  });

  it("puts the Thoughts first, then the card's lines, so the links stay reachable", () => {
    // The rule below the Thoughts is part of their slot, so a fetch that fails or
    // has not landed leaves no rule standing over nothing (spec §3.1).
    expect(rightPageBlocks(book(), { narrow: false, thoughts: true })).toEqual([
      'thoughts',
      'reading',
      'links',
      'examine',
      'put-back',
    ]);
  });

  it('leads with the title and author on a phone, which frames this page alone', () => {
    expect(rightPageBlocks(book(), { narrow: true, thoughts: true })).toEqual([
      'title',
      'author',
      'thoughts',
      'reading',
      'links',
      'examine',
      'put-back',
    ]);
  });

  it('carries every optional line the card would, in the card order, and the examine control', () => {
    const full = book({
      tags: ['autumn'],
      publisher: 'Fieldfare Press',
      subjects: 'Fiction; Gardens',
      cover: 'covers/a.jpg',
    });

    expect(rightPageBlocks(full, { narrow: false, thoughts: false })).toEqual([
      'reading',
      'tags',
      'object',
      'subjects',
      'links',
      'examine',
      'put-back',
    ]);
  });

  it('offers the examine control to a book with no cover too: the binding is the point (#418)', () => {
    const bare = book({ cover: undefined });
    expect(rightPageBlocks(bare, { narrow: false, thoughts: false })).toContain('examine');
  });
});

describe('the pages as built', () => {
  // Markup-shaped on purpose: each would become an element, or run, if any
  // builder on the page took it as HTML.
  const TITLE = '<img src=x onerror="alert(1)"><b>Orchard</b>';
  const AUTHOR = '<script>alert(2)</script>';
  const THOUGHT = '<a href="javascript:alert(3)">read me</a>';

  let markupWrites: string[];

  beforeEach(() => {
    markupWrites = [];
    vi.stubGlobal('document', {
      createElement: (tag: string) => new FakeElement(tag, markupWrites),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const build = (narrow: boolean) =>
    buildPages(
      book({ title: TITLE, author: AUTHOR }),
      { width: 1, height: 1.5 },
      { narrow, thoughts: true },
    ) as unknown as {
      readonly left: FakeElement;
      readonly right: FakeElement;
      showThoughts(paragraphs: readonly string[], fade: boolean): void;
      setScrollable(scrollable: boolean): void;
    };

  it('lands a markup-shaped title and author as text, on the left-hand page', () => {
    const pages = build(false);

    const [title] = byClass(pages.left, 'held-title');
    const [author] = byClass(pages.left, 'held-author');
    expect(title?.tagName).toBe('h2');
    expect(title?.textContent).toBe(TITLE);
    expect(title?.children).toEqual([]);
    expect(author?.textContent).toBe(AUTHOR);
    expect(markupWrites).toEqual([]);
  });

  it('lands them as text on a phone too, where the right-hand page leads with them', () => {
    const pages = build(true);

    expect(byClass(pages.right, 'held-title').map((node) => node.textContent)).toEqual([TITLE]);
    expect(byClass(pages.right, 'held-author').map((node) => node.textContent)).toEqual([AUTHOR]);
    expect(markupWrites).toEqual([]);
  });

  it('lands Thoughts as text, one paragraph each, when they arrive', () => {
    const pages = build(false);
    pages.showThoughts([THOUGHT, 'A second, plain one.'], false);

    const [slot] = byClass(pages.right, 'held-thoughts');
    expect(slot?.hidden).toBe(false);
    const paragraphs = (slot?.children ?? []).filter((node) => node.tagName === 'p');
    expect(paragraphs.map((node) => node.textContent)).toEqual([
      'Thoughts',
      THOUGHT,
      'A second, plain one.',
    ]);
    expect(all(slot ?? new FakeElement('none', [])).some((node) => node.tagName === 'a')).toBe(
      false,
    );
    expect(markupWrites).toEqual([]);
  });

  it('scrolls the right-hand page at rest and holds it still in motion (#369)', () => {
    const pages = build(false);

    pages.setScrollable(true);
    expect(pages.right.style.overflowY).toBe('auto');
    pages.setScrollable(false);
    expect(pages.right.style.overflowY).toBe('hidden');
    // The left-hand page carries two lines and never scrolls.
    expect(pages.left.style.overflowY).toBeUndefined();
  });
});
