import type { Library, LibraryBook } from '@stacks/core';
import { hideCard, showCard, type CardElements } from './card.ts';
import { mountSheet } from './card-sheet.ts';
import { mountCoverViewer, type CoverViewerElements } from './cover-viewer.ts';
import { mountDiagnostics } from './diagnostics.ts';
import { mountShelf, type ShelfHandle, type ShelfStats } from './scene.ts';
import { resolveSettings, type ShelfSettings } from './shelf-settings.ts';
import { bookLimit, readSettings, soloBook } from './shelf-url.ts';

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
   * boolean would be worse than six lines.
   *
   * ⚠️ **Every part of this shape is load-bearing, because it has to merge
   * with vite's own declaration member for member.** The root config excludes
   * the generated `.astro` type directory and the site's config includes it,
   * so under `astro check` this block meets `vite/types/importMeta.d.ts` and
   * `astro/client.d.ts`, while under `pnpm typecheck` it stands alone.
   * Describing the same slice is not enough: an inline
   * `{ readonly DEV: boolean }` here was TS2717 against astro's
   * `readonly env: ImportMetaEnv`, and a `readonly DEV` would be TS2687
   * against vite's mutable one. Named interface, mutable `DEV`, readonly
   * `env` — do not tighten either modifier.
   */
  interface ImportMetaEnv {
    DEV: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    /** Read by `pnpm smoke:render` to assert the shelf really drew books. */
    __shelf?: {
      bookCount: number;
      ready: boolean;
      /** Worst breach of the case's sides, in world units. See `smoke:render`. */
      caseOverflow: number;
      shaderErrors: readonly string[];
      projectBook(index: number): { x: number; y: number } | undefined;
      /**
       * What the renderer is holding, so the gate can report what a change cost.
       *
       * Every effect on map #50 states a per-book texture and draw-call cost, and
       * the one gate that renders 49 books could not see any of them — so a slice
       * that quietly cost more than its ticket claimed came back green. A live
       * getter, not a snapshot: the counters are reset at the top of every frame.
       */
      stats(): ShelfStats;
    };
  }
}

/** The card's elements, handed over by the template that owns the markup. */
export interface CardHandles extends CardElements {
  /** The one dismiss control: a grabber pill below the breakpoint, an `×` above. */
  readonly dismiss: HTMLElement;
  /** The enlarged-cover dialog. See `cover-viewer.ts`. */
  readonly coverViewer: CoverViewerElements;
}

export async function boot(
  canvas: HTMLCanvasElement,
  card: CardHandles,
): Promise<ShelfHandle | undefined> {
  const params = new URLSearchParams(window.location.search);
  const limit = bookLimit(params);
  const all = await loadLibrary();
  const books = limit === undefined ? all : all.slice(0, limit);
  const debug = params.has('debug');

  /**
   * `?solo=N` — one book on a turntable instead of the shelf.
   *
   * Returns before anything else is built: there is no card to open, no panel to
   * dial and no `window.__shelf` to publish, because this is an inspection mode
   * and not a shelf. Everything the shelf would have done is skipped rather than
   * suppressed, which is why it cannot half-apply.
   *
   * It publishes `window.__solo` instead — the turntable, drivable by number, so
   * that a before-and-after is the same picture twice. See `book-inspector.ts`.
   */
  const solo = soloBook(params);
  if (solo !== undefined) {
    const { mountBookInspector } = await import('./book-inspector.ts');
    mountBookInspector(canvas, all, solo, resolveSettings(readSettings(params)));
    return undefined;
  }

  let handle: ShelfHandle | undefined;
  let shaderFailed = false;
  /** Torn down and remade when the panel rebuilds the shelf. */
  let unmountPanel: (() => void) | undefined;

  const mount = (settings: ShelfSettings): ShelfHandle | undefined => {
    try {
      return mountShelf(canvas, books, {
        settings,
        onSelect: (book) => {
          if (book === undefined) hideCard(card);
          else showCard(card, book);
        },
        onContextLost: () => {
          // A shader failure takes the context with it a moment later on the
          // hardware where this happens, and the generic message would land on
          // top of the specific one and bury the only useful sentence.
          if (!shaderFailed) showNotice(canvas, LOST_MESSAGE);
        },
        onContextRestored: () => {
          clearNotice(canvas);
        },
        onShaderFailure: () => {
          shaderFailed = true;
          showNotice(canvas, SHADER_MESSAGE);
        },
      });
    } catch {
      // `new WebGLRenderer` throws when the browser will not hand out a context —
      // no WebGL at all, or, more often here, a browser that has just killed this
      // page's renderer and is refusing to try again. The caller does nothing with
      // the rejection (the .astro script may not, by the "no logic in .astro"
      // rule), so an unhandled throw here is a blank page with no explanation.
      // That is the exact thing the user saw on reload.
      showNotice(canvas, UNAVAILABLE_MESSAGE);
      return undefined;
    }
  };

  // URL (partial) → the total object the shelf runs. `shelf-url.ts` owns the
  // query vocabulary in both directions; nothing else parses or writes it.
  handle = mount(resolveSettings(readSettings(params)));

  // Mounted whether or not the shelf came up: a browser that refused a context
  // is exactly the state worth having a record of, and the record is the only
  // thing that survives the tab being killed.
  //
  // A **static** import, unlike the panel below. The black box has to be running
  // before the thing it measures fails, and a dynamic import adds a round trip
  // on exactly the device and connection where the first seconds of a crash
  // record are the ones worth having. The panel can afford that latency; this
  // cannot.
  if (debug && canvas.parentElement !== null) {
    mountDiagnostics(canvas.parentElement, {
      books: books.length,
      // A getter, so a rebuild does not leave the black box reading a shelf that
      // was disposed. See `DiagnosticsOptions.handle`.
      handle: () => handle,
    });
  }

  if (handle === undefined) return undefined;

  publish(handle);

  /**
   * The panel, loaded only if asked for.
   *
   * A dynamic import so Vite splits it into its own chunk: an ordinary visitor
   * downloads neither the panel nor anything it drags in. That matters more the
   * moment postprocessing joins the graph — see #42, which measured a bloom
   * chain at +4.7 KB gzip and adding ambient occlusion at +12.5 KB.
   */
  if (debug && canvas.parentElement !== null) {
    const host = canvas.parentElement;
    const { mountPanel } = await import('./debug-panel.ts');

    const showPanel = (current: ShelfHandle): void => {
      unmountPanel?.();
      unmountPanel = mountPanel(host, {
        handle: current,
        onRebuild: (settings) => {
          // Dispose before mounting: two live renderers on one canvas is two
          // contexts, and the browser hands out a limited number of those.
          current.dispose();
          const next = mount(settings);
          if (next === undefined) return;
          // Reassigned so the black box's getter — and anything else holding one
          // — follows the live shelf rather than the disposed one.
          handle = next;
          publish(next);
          showPanel(next);
        },
      });
    };

    showPanel(handle);
  }

  /**
   * On any dismissal, move focus to the canvas — **only if focus is inside the
   * card**. Otherwise leave it alone.
   *
   * One conditional rule covering all four dismissals. Activating the close
   * control removes the focused element from the tree, so focus would fall to
   * `<body>` and the next Tab would restart at the top of the document; catching
   * it on the canvas keeps the user's place, on the element that conceptually
   * owns the shelf. And moving focus *unconditionally* on Escape would yank it
   * from wherever the user actually was — the debug panel, say — which is the
   * same "do not steal focus" principle applied at the other end.
   */
  const dismiss = (): void => {
    const focusWasInside = card.card.contains(document.activeElement);
    hideCard(card);
    if (focusWasInside) canvas.focus();
  };

  mountSheet({ card: card.card, control: card.dismiss, onDismiss: dismiss });

  const coverViewer = mountCoverViewer(card.coverViewer, card.body);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // The enlarged cover is a modal `<dialog>`, so the platform closes it on
    // Escape and the keydown still reaches here. Without this guard one press
    // would take the viewer *and* the card underneath it — the user having
    // asked to leave one surface and been returned two levels.
    if (coverViewer.isOpen()) return;
    dismiss();
  });

  watchForRebuilds();
  return handle;
}

/**
 * Republished after every remount.
 *
 * `window.__shelf` is what `pnpm smoke:render` reads, and it closes over one
 * handle. A rebuild makes a new one, so without this the gate would be asking a
 * disposed shelf how many books it has.
 */
function publish(handle: ShelfHandle): void {
  window.__shelf = {
    bookCount: handle.bookCount,
    ready: true,
    caseOverflow: handle.caseOverflow,
    shaderErrors: handle.shaderErrors,
    projectBook: (index) => handle.projectBook(index),
    stats: () => handle.stats(),
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Saying so, rather than showing an empty room.
 *
 * A 3D page that fails renders as nothing at all: no error, no broken image, no
 * clue that anything was ever meant to be there. Both of these replace that with
 * a sentence, because a visitor who knows the shelf is missing can reload, and a
 * visitor looking at a black rectangle cannot tell it apart from the design.
 */
const NOTICE_CLASS = 'shelf-notice';

// Says what happened, not why. `webglcontextlost` carries no reason, and the
// first wording asserted one — "ran out of graphics memory" — that the evidence
// then contradicted: the page survived the loss and exited cleanly, so nothing
// was killed for running out of anything it could name.
const LOST_MESSAGE = 'The browser reset the shelf’s 3D canvas. Reload to bring it back.';

// Says what happened and where to look, because the whole point of stopping is
// that somebody reads the panel. Without `?debug` there is no panel, so the
// sentence has to be able to stand alone.
const SHADER_MESSAGE =
  'This device would not compile the shelf’s shaders, so drawing has stopped. Reload with ?debug to see what the driver said.';

const UNAVAILABLE_MESSAGE =
  "This browser wouldn't give the page a 3D canvas, so the shelf can't be drawn. Reloading usually fixes it.";

function showNotice(canvas: HTMLCanvasElement, message: string): void {
  const host = canvas.parentElement;
  if (host === null) return;

  clearNotice(canvas);

  const notice = document.createElement('p');
  notice.className = NOTICE_CLASS;
  // textContent, not innerHTML — same rule as the card, and these strings are
  // fixed anyway.
  notice.textContent = message;
  notice.setAttribute('role', 'status');
  host.append(notice);
}

function clearNotice(canvas: HTMLCanvasElement): void {
  canvas.parentElement?.querySelector(`.${NOTICE_CLASS}`)?.remove();
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
    // ⚠️ **Two assertions and one real check, and the check is only the shape.**
    // `response.json()` is `any`, so `as Library` is a promise about a file
    // nothing validated; `Array.isArray` then confirms `books` is an array and
    // says nothing about what is in it, which is what the second assertion
    // admits. The `unknown` binding exists because `Array.isArray` narrows to
    // `any[]`, and without it that `any` would leave through the return type
    // and spread into every caller.
    //
    // That is the honest description of a JSON boundary with no validator, and
    // it is deliberate: a malformed `library.json` shows an empty or a broken
    // shelf, never a failed build. The shelf reads a build artifact it produced.
    const books: unknown = ((await response.json()) as Library).books;
    return Array.isArray(books) ? (books as LibraryBook[]) : [];
  } catch {
    return [];
  }
}
