import type { Library, LibraryBook } from '@stacks/core';
import { mountShelf, type ShelfHandle } from './scene.ts';

/**
 * Wires the page up: load the library, mount the shelf, show a card on click.
 *
 * All of this lives in a .ts module rather than in the .astro file because
 * .astro files are not typechecked (see "Site code layout" in CLAUDE.md).
 */

declare global {
  interface Window {
    /** Read by `pnpm smoke:render` to assert the shelf really drew books. */
    __shelf?: { bookCount: number; ready: boolean };
  }
}

export async function boot(canvas: HTMLCanvasElement, card: HTMLElement): Promise<ShelfHandle> {
  const books = await loadLibrary();

  const handle = mountShelf(canvas, books, {
    onSelect: (book) => {
      if (book === undefined) hideCard(card);
      else showCard(card, book);
    },
  });

  window.__shelf = { bookCount: handle.bookCount, ready: true };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideCard(card);
  });

  return handle;
}

/**
 * `library.json` is a build artifact fetched at runtime, not imported.
 *
 * That way a site built before `stacks build` has run shows an empty shelf
 * rather than failing to build at all.
 */
async function loadLibrary(): Promise<LibraryBook[]> {
  try {
    const response = await fetch('/library.json');
    if (!response.ok) return [];
    const library = (await response.json()) as Library;
    return Array.isArray(library.books) ? [...library.books] : [];
  } catch {
    return [];
  }
}

function showCard(card: HTMLElement, book: LibraryBook): void {
  // replaceChildren, never innerHTML: every value below comes from the vault,
  // and card content is built with textContent so a title containing markup is
  // shown as text rather than parsed as HTML.
  card.replaceChildren(
    ...[
      book.cover === undefined ? undefined : image(book.cover, book.title),
      text('h2', book.title),
      book.author === undefined ? undefined : text('p', book.author, 'author'),
      text('p', describe(book), 'meta'),
      book.tags.length === 0 ? undefined : text('p', book.tags.join(' · '), 'tags'),
    ].filter((node): node is HTMLElement => node !== undefined),
  );
  card.hidden = false;
}

function hideCard(card: HTMLElement): void {
  card.hidden = true;
}

function describe(book: LibraryBook): string {
  const parts: string[] = [];
  if (book.status !== 'read') parts.push(book.status);
  if (book.finished !== undefined) parts.push(`finished ${book.finished}`);
  else if (book.started !== undefined) parts.push(`started ${book.started}`);
  if (book.rating !== undefined) parts.push('★'.repeat(book.rating));
  if (book.pages !== undefined) parts.push(`${book.pages} pages`);
  return parts.join(' · ');
}

function text(tag: string, content: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className !== undefined) node.className = className;
  return node;
}

function image(src: string, alt: string): HTMLElement {
  const node = document.createElement('img');
  node.src = src.startsWith('/') ? src : `/${src}`;
  node.alt = `Cover of ${alt}`;
  node.loading = 'lazy';
  return node;
}
