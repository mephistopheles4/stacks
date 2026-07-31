import type { Library, LibraryBook } from '@stacks/core';
import { mountShelf, type ShelfHandle } from './scene.ts';

/**
 * Wires the page up: load the library, mount the shelf, show a card on click.
 *
 * All of this lives in a .ts module rather than in the .astro file because
 * .astro files are not typechecked (see "Site code layout" in CLAUDE.md).
 */

declare global {
  /**
   * Just the slice of Vite's `import.meta.env` this file uses.
   *
   * Declared rather than pulled from `vite/client`: vite is a transitive
   * dependency of astro, so it is not resolvable from the root tsconfig under
   * pnpm's strict layout, and adding it as a direct dependency to satisfy one
   * boolean would be worse than four lines.
   */
  interface ImportMeta {
    readonly env: { readonly DEV: boolean };
  }

  interface Window {
    /** Read by `pnpm smoke:render` to assert the shelf really drew books. */
    __shelf?: {
      bookCount: number;
      ready: boolean;
      projectBook(index: number): { x: number; y: number } | undefined;
    };
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

  window.__shelf = {
    bookCount: handle.bookCount,
    ready: true,
    projectBook: (index) => handle.projectBook(index),
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideCard(card);
  });

  watchForRebuilds();
  return handle;
}

/** How often the dev page checks whether the vault was rebuilt. */
const REBUILD_POLL_MS = 1500;

/**
 * Reloads the page when `stacks build --watch` writes a new library.
 *
 * Astro's HMR watches `src/`, not `public/`, so a regenerated `library.json`
 * would otherwise sit there unnoticed until a manual refresh.
 *
 * Development only. A published shelf polling itself forever would be pointless
 * traffic — the file cannot change without a redeploy.
 */
function watchForRebuilds(): void {
  if (!import.meta.env.DEV) return;

  let current: string | undefined;

  const check = async (): Promise<void> => {
    try {
      const response = await fetch('/library.json', { cache: 'no-store' });
      if (!response.ok) return;
      const { generatedAt } = (await response.json()) as Library;

      if (current === undefined) {
        current = generatedAt;
      } else if (generatedAt !== current) {
        location.reload();
      }
    } catch {
      // The dev server restarting is not worth reporting.
    }
  };

  setInterval(() => void check(), REBUILD_POLL_MS);
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
