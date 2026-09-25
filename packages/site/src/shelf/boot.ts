import type { Library, LibraryBook } from '@stacks/core';
import { hideCard, showCard, type CardElements } from './card.ts';
import { mountSheet } from './card-sheet.ts';
import { createRecovery, type Notice, type Recovery, type Surface } from './context-recovery.ts';
import { mountCoverViewer, type CoverViewerElements } from './cover-viewer.ts';
import { mountDiagnostics } from './diagnostics.ts';
import { mountShelf, type ShelfHandle, type ShelfStats } from './scene.ts';
import {
  browserStore,
  describeFallback,
  forgetRecord,
  initialState,
  PAINTED_BASE,
  readRecord,
  RESTORE_WAIT_MS,
  runsShippedShadows,
  samplesShadowMap,
  startingBase,
  writeRecord,
  type FallbackKind,
  type FallbackState,
} from './shadow-fallback.ts';
import {
  LOST_MESSAGE,
  noticeFor,
  settleNotice,
  SHADER_MESSAGE,
  showNotice,
  UNAVAILABLE_MESSAGE,
} from './shelf-notice.ts';
import { resolveSettings, type ShelfSettings } from './shelf-settings.ts';
import { bookLimit, readSettings, soloBook } from './shelf-url.ts';

/**
 * Wires the page up: load the library, mount the shelf, show a card on click.
 *
 * All of this lives in a .ts module rather than in the .astro file because
 * logic in an .astro file is counted by nothing: every mutation scope and every
 * complexity population globs `*.ts`. See "Site code layout" in AGENTS.md.
 *
 * It is no longer true that .astro is untypechecked -- G50 (`astro-types`) runs
 * `astro check` inside `pnpm build` -- and that is exactly why the rule now
 * rests on coverage rather than on the compiler.
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
      /** Shelves in the bookcase. G61 reads it to know its large page is tall. */
      rowCount: number;
      ready: boolean;
      /** Worst breach of the bookcase's sides, in world units. See `smoke:render`. */
      bookcaseOverflow: number;
      shaderErrors: readonly string[];
      /** The live shelf's `profile`, so the gate can read what a fallback drew. */
      readonly profile: string;
      /** Where the lost-context fallback stands. See `shadow-fallback.ts`. */
      fallback(): FallbackKind;
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
   * The lost-context record, read before anything is drawn.
   *
   * A device that lost a context while sampling the shadow map starts from
   * `PAINTED_BASE` rather than the shipped defaults, and the URL is folded on
   * top — so `?shadows=1` still turns real-time shadows on over the record and
   * `?shadows=0` still forces painted, with no code of their own. The record
   * chooses the base and nothing else. See `shadow-fallback.ts`.
   */
  const store = browserStore();
  const record = readRecord(store, Date.now());
  const asked = readSettings(params);
  let base = startingBase(record);

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
   * It starts from the same base as the shelf, so a remembered device does not
   * sample the map here either; it has no fallback of its own.
   */
  const solo = soloBook(params);
  if (solo !== undefined) {
    const { mountBookInspector } = await import('./book-inspector.ts');
    mountBookInspector(canvas, all, solo, resolveSettings(asked, base));
    return undefined;
  }

  /**
   * The canvas the shelf is drawn on **now**.
   *
   * A lost context that is never restored leaves a canvas that hands back the
   * same dead context for ever, so the fallback may swap a new element in.
   * ⚠️ **Every closure below reads this, never the `canvas` parameter**: once
   * the old element is replaced it has no parent, and a notice shown against it
   * is shown nowhere — a blank rectangle with no sentence.
   */
  let surface = canvas;
  let handle: ShelfHandle | undefined;
  /** Torn down and remade when the panel rebuilds the shelf. */
  let unmountPanel: (() => void) | undefined;
  /** Set once the panel's chunk has loaded, and only behind `?debug`. */
  let showPanel: ((current: ShelfHandle) => void) | undefined;
  /**
   * Set right after the first mount, because the GPU string it needs comes from
   * that mount. A context event is dispatched as a task of its own and cannot
   * arrive before then; `onContextLost` still says so if it ever did.
   */
  let recovery: Recovery | undefined = undefined;

  const fallback = (): FallbackState => recovery?.state() ?? { kind: 'none' };

  const mount = (
    settings: ShelfSettings,
    target: HTMLCanvasElement = surface,
  ): ShelfHandle | undefined => {
    // Per mount: a rebuilt shelf has not failed to link anything yet.
    let shaderFailed = false;
    try {
      return mountShelf(target, books, {
        settings,
        onSelect: (book) => {
          if (book === undefined) hideCard(card);
          else showCard(card, book);
        },
        onContextLost: (running) => {
          const loss = {
            sampling: samplesShadowMap(running),
            visible: document.visibilityState === 'visible',
            // A shader failure takes the context with it a moment later on the
            // hardware where this happens, and the generic message would land
            // on top of the specific one and bury the only useful sentence.
            shaderFailed,
            // `?shadows=1&receivers=all` and the other shadow probes still fall
            // back, and write no record: their loss says nothing about the
            // shelf the record would turn off. See `runsShippedShadows`.
            probe: !runsShippedShadows(running),
          };
          if (recovery !== undefined) recovery.lost(loss);
          else if (!shaderFailed) showNotice(surface, LOST_MESSAGE);
        },
        onContextRestored: () => {
          // `handled`: this shelf was just replaced by a painted one, inside this
          // call, and the notice is the recovery's to clear. Otherwise the shelf
          // resumes in place — safe as far as the shadow map goes (see
          // `Recovery.restored`), and no resume at all for a shelf that halted
          // on a program that would not link, which keeps its sentence.
          if (recovery?.restored() !== 'handled') settleNotice(surface, handle);
        },
        onShaderFailure: () => {
          shaderFailed = true;
          showNotice(surface, SHADER_MESSAGE);
        },
      });
    } catch {
      // `new WebGLRenderer` throws when the browser will not hand out a context —
      // no WebGL at all, or, more often here, a browser that has just killed this
      // page's renderer and is refusing to try again. The caller does nothing with
      // the rejection (the .astro script may not, by the "no logic in .astro"
      // rule), so an unhandled throw here is a blank page with no explanation.
      // That is the exact thing the user saw on reload. Each caller says
      // something different about it, so the sentence is theirs.
      return undefined;
    }
  };

  /**
   * The one way a new shelf becomes the live one.
   *
   * It clears the notice, and with it shows the canvas again: a notice hides the
   * canvas it stands in for (`shelf-notice.ts`), so a panel rebuild that draws
   * after one that could not would otherwise be a live shelf nobody can see.
   * ⚠️ **Unless the new shelf halted**: its first frame is drawn inside
   * `mountShelf`, so a program that would not link has stopped it before this
   * runs, and `settleNotice` keeps the shader's sentence up over it.
   */
  const adopt = (next: ShelfHandle): void => {
    handle = next;
    settleNotice(surface, next);
    publish(next, () => fallback().kind);
    showPanel?.(next);
  };

  /**
   * Disposes the lost shelf and draws it again, painted.
   *
   * `paintedOf` flips one key and keeps every dial, so the visitor gets the
   * shelf they had with its shadows painted — not the shipped defaults. The
   * base moves too: from here this is a painted page, and a URL the panel
   * writes is a difference from that (`writeSettings`).
   */
  const remount = (where: Surface): boolean => {
    const old = handle;
    const painted = paintedOf(old?.settings ?? resolveSettings(asked, base));
    old?.dispose();
    handle = undefined;
    base = PAINTED_BASE;
    return where === 'same' ? remountInPlace(painted) : remountOnFreshCanvas(painted);
  };

  const remountInPlace = (settings: ShelfSettings): boolean => {
    const next = mount(settings, surface);
    if (next === undefined) return false;
    adopt(next);
    return true;
  };

  /**
   * A new `<canvas>`, because the old one's context is gone for good.
   *
   * A shallow clone keeps `id`, `tabindex` and Astro's scoped `data-astro-cid-*`
   * attribute, so `Shelf.astro`'s `canvas {}` rule still reaches it. It is
   * mounted while detached — `resize()` returns while the size is 0, and the
   * shelf's `ResizeObserver` sizes it once it is in the page — and it replaces
   * the old element only if a context was actually handed out. On failure the
   * old element stays, so the notice has somewhere to go, and the notice hides
   * it: Chrome paints a lost canvas it will not restore opaque white, and on the
   * Pixel that was the whole page. See `shelf-notice.ts`.
   */
  const remountOnFreshCanvas = (settings: ShelfSettings): boolean => {
    const old = surface;
    const fresh = old.cloneNode(false);
    if (!(fresh instanceof HTMLCanvasElement)) return false;

    const next = mount(settings, fresh);
    if (next === undefined) return false;

    // A restore that still arrives for the old context would reallocate its
    // buffer at full size, for an element nobody can see.
    old.width = 1;
    old.height = 1;
    old.replaceWith(fresh);
    surface = fresh;
    adopt(next);
    return true;
  };

  const tell = (notice: Notice, state: FallbackState): void => {
    // A redraw the recovery counts as drawn can still have halted on its first
    // frame; `settleNotice` reads the live shelf rather than trusting the word.
    if (notice === 'clear') settleNotice(surface, handle);
    else showNotice(surface, noticeFor(notice, state));
  };

  // URL (partial) → the total object the shelf runs, folded onto the base the
  // record chose. `shelf-url.ts` owns the query vocabulary in both directions;
  // nothing else parses or writes it.
  handle = mount(resolveSettings(asked, base));
  if (handle === undefined) showNotice(surface, UNAVAILABLE_MESSAGE);

  const initial = initialState(record, asked.shadows?.enabled, handle?.gpu);
  // A record from a different GPU string is retired: this load was mounted
  // painted and stays so, and the next load tries real-time shadows again.
  if (initial.kind === 'retired') forgetRecord(store);

  recovery = createRecovery({
    waitMs: RESTORE_WAIT_MS,
    now: () => performance.now(),
    setTimer: (run, ms) => window.setTimeout(run, ms),
    clearTimer: (timer) => {
      window.clearTimeout(timer);
    },
    // The GPU string of the shelf that was lost, which is the one the record
    // is compared with on the next load.
    remember: () => writeRecord(store, Date.now(), handle?.gpu),
    remount,
    notify: tell,
    initial,
  });

  // Mounted whether or not the shelf came up: a browser that refused a context
  // is exactly the state worth having a record of, and the record is the only
  // thing that survives the tab being killed.
  //
  // A **static** import, unlike the panel below. The black box has to be running
  // before the thing it measures fails, and a dynamic import adds a round trip
  // on exactly the device and connection where the first seconds of a crash
  // record are the ones worth having. The panel can afford that latency; this
  // cannot.
  if (debug && surface.parentElement !== null) {
    mountDiagnostics(surface.parentElement, {
      books: books.length,
      // A getter, so a rebuild does not leave the black box reading a shelf that
      // was disposed. See `DiagnosticsOptions.handle`.
      handle: () => handle,
      fallback: () =>
        describeFallback(
          fallback(),
          handle === undefined
            ? 'no shelf'
            : handle.settings.shadows.enabled
              ? 'real-time'
              : 'painted',
        ),
      record: {
        exists: () => readRecord(store, Date.now()) !== undefined,
        forget: () => forgetRecord(store),
      },
    });
  }

  if (handle === undefined) return undefined;

  publish(handle, () => fallback().kind);

  /**
   * The panel, loaded only if asked for.
   *
   * A dynamic import so Vite splits it into its own chunk: an ordinary visitor
   * downloads neither the panel nor anything it drags in. That matters more the
   * moment postprocessing joins the graph — see #42, which measured a bloom
   * chain at +4.7 KB gzip and adding ambient occlusion at +12.5 KB.
   */
  if (debug && surface.parentElement !== null) {
    const host = surface.parentElement;
    const { mountPanel } = await import('./debug-panel.ts');

    showPanel = (current: ShelfHandle): void => {
      unmountPanel?.();
      unmountPanel = mountPanel(host, {
        handle: current,
        base: () => base,
        onRebuild: (settings) => {
          // Dispose before mounting: two live renderers on one canvas is two
          // contexts, and the browser hands out a limited number of those.
          current.dispose();
          const next = mount(settings);
          if (next === undefined) {
            handle = undefined;
            showNotice(surface, UNAVAILABLE_MESSAGE);
            return;
          }
          // Adopted so the black box's getter — and anything else holding one —
          // follows the live shelf rather than the disposed one.
          adopt(next);
        },
      });
    };

    // Read again after the import: a fallback while the chunk was in flight has
    // already replaced the shelf, or left none.
    if (handle !== undefined) showPanel(handle);
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
    if (focusWasInside) surface.focus();
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
function publish(handle: ShelfHandle, fallback: () => FallbackKind): void {
  window.__shelf = {
    bookCount: handle.bookCount,
    rowCount: handle.rowCount,
    ready: true,
    bookcaseOverflow: handle.bookcaseOverflow,
    shaderErrors: handle.shaderErrors,
    get profile(): string {
      return handle.profile;
    },
    fallback,
    projectBook: (index) => handle.projectBook(index),
    stats: () => handle.stats(),
  };
}

/** One key flipped, every dial kept: the shelf the visitor had, painted. */
function paintedOf(settings: ShelfSettings): ShelfSettings {
  return resolveSettings({ shadows: { enabled: false } }, settings);
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
