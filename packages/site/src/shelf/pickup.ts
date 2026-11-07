/**
 * Picking a book up: a click brings the book out of the shelf and turns it in
 * your hand, closed and cover-on; the visitor opens it to its Thoughts (spec
 * §3.4–§3.10, `picking-up-closed.md`, ADR-0102, ADR-0103).
 *
 * This module is the drawing half. What a click, Escape or the back button
 * does next is `pickup-state.ts`; the stage timing, the ease and the fade are
 * `pickup-motion.ts`; where the pages lie is `open-spread.ts`; what is on them
 * is `held-page.ts`. Here they meet the live shelf, through the typed seam
 * `ShelfStage`:
 *
 * - **The book is the shelf's own group** (#369), given a hinge at the gutter
 *   and two paper sheets the first time it is picked up, and kept that way: at
 *   0° the hinge reproduces the closed book exactly.
 * - **GSAP is stepped from the shelf's frame**, never its own ticker, so the
 *   pose, the WebGL render and the page placed over it come from one instant
 *   (#371). Imported from `gsap/gsap-core` (#370). One timeline per book,
 *   which stops at closed in the hand and plays on when it is opened
 *   (`pickup-track.ts`).
 * - **The put-back X and the Open button live outside the pages**, in the
 *   header, because a closed book's pages are hidden and a control on them
 *   could neither be seen nor focused. The cursor and the hint say a closed
 *   book opens on a click.
 * - **The rest of the shelf dims under a veil** in three passes — the shelf, a
 *   55% veil, then the held book — keeping depth, so a book still inside the
 *   shelf stays behind its upright (#371).
 * - **The pages are DOM, placed by `CSS3DRenderer`** in the same frame (#369),
 *   hidden until the cover has turned past the fade angle, from sight and from
 *   the accessibility tree alike (`visibility`, not opacity alone, §3.4).
 * - **The held cover** decodes off the main thread and uploads before it is
 *   swapped in; it is freed on put-down (#377, ADR-0105).
 * - **The shadow map is redrawn** when a book leaves its slot, when it comes
 *   to rest and when it is back, and **the painted pieces repainted** when it
 *   leaves and when it is back (§3.10).
 *
 * Every new lit part goes through `withoutShadowFetch`: a book that reads the
 * shadow map again is the one configuration the Pixel cannot hold (ADR-0088).
 * G61 counts it on a page with a book held.
 */
import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { LibraryBook } from '@stacks/core';
import { announceHeld, LAUNCHER_ID } from '../ask/bridge.ts';
import { SQUARE } from './book-turn.ts';
import type { BookViewer } from './book-viewer.ts';
import { announcement } from './card.ts';
import { buildPages, PAGE_PX, rooted, type HeldPages } from './held-page.ts';
import { loadThoughts } from './notes.ts';
import { paperMaterial, sheetGeometry } from './gutter-sheet.ts';
import { openSpread, type OpenSpread } from './open-spread.ts';
import { bezier, openAngle, schedule, textOpacity } from './pickup-motion.ts';
import { createPickupState, type PickupState, type Track } from './pickup-state.ts';
import { buildTrack, engine, type Timeline } from './pickup-track.ts';
import type { TunablePickup, TunerReading } from './pickup-tuner.ts';
import { FRONT_PARTS, PAGE_BLOCK, type ShelfStage, type StagedBook } from './scene.ts';
import { PICKUP_MOTION, type PickupMotion } from './shelf-settings.ts';

/** How far a DOM page stands in front of its paper sheet, in world units. */
const PAGE_LIFT = 0.0003;

/** Below this aspect a screen frames the right-hand page alone (#369). */
const NARROW_ASPECT = 0.9;

/** The layer the veil is drawn on, and the one the held book is drawn on. */
const VEIL_LAYER = 2;
const HELD_LAYER = 1;

/** What a book carries once it has been picked up the first time. */
interface Rigged {
  readonly spread: OpenSpread;
  readonly hinge: THREE.Group;
  readonly rightSheet: THREE.Mesh;
  readonly leftSheet: THREE.Mesh;
  readonly block: THREE.Mesh;
  readonly cover: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
  /** Unlit painted planes on the book itself — the neighbour shadow. Hidden while held. */
  readonly painted: readonly THREE.Mesh[];
  readonly casts: boolean;
}

/** A book off the shelf: lifting, held or on its way back. */
interface Lifted {
  readonly book: LibraryBook;
  readonly staged: StagedBook;
  readonly rig: Rigged;
  readonly home: { readonly position: THREE.Vector3; readonly quaternion: THREE.Quaternion };
  /**
   * The three stages' progress, 0..1 each, tweened by the track — and `c`, how
   * far the book is closed in the hand for examining, tweened on its own. The
   * track's turn is complete before its opening starts, but closing by seeking
   * the shared track would still un-turn the book; the pose reads `o` as
   * `p.o * (1 - p.c)`.
   */
  readonly p: { s: number; u: number; o: number; c: number };
  /** The turn examining has put on the book, about the camera's own axes. */
  readonly turn: { yaw: number; pitch: number };
  /** The tween closing the book or opening it again, while one runs. */
  ease: Timeline | undefined;
  readonly pages: HeldPages;
  readonly pageObjects: readonly CSS3DObject[];
  readonly narrow: boolean;
  track: Track | undefined;
  /** The held copy while it is swapped in, and what it replaced. */
  heldCover?: { readonly texture: THREE.Texture; readonly shelfMap: THREE.Texture | null };
  released: boolean;
}

/** The page's own pieces the pickup drives, handed over by `boot.ts`. */
export interface PickupElements {
  /** The announcer: «Title» by «Author» on pickup, empty after put-back. */
  readonly status: HTMLElement;
  /** Where the page layer goes: the shelf's container. */
  readonly host: HTMLElement;
  /**
   * The examining view's dialog. Its Escape and this module's both listen on
   * the document, so `isOpen` is what keeps one Escape from leaving the view
   * and putting the book back in the same keystroke.
   */
  readonly viewer: BookViewer;
  /** The controls outside the pages: the put-back X, the Open button and the hint. */
  readonly controls: HeldControls;
}

/** The markup `index.astro` owns for a held book, looked up in `start.ts`. */
export interface HeldControls {
  /** The header's `.held-controls`: `hidden` unless a book is in hand. */
  readonly root: HTMLElement;
  /** The X: puts the book back, closed or open. Its name is in the template. */
  readonly putBack: HTMLButtonElement;
  /** "Open «Title»", set through `textContent`; visually hidden until it has focus. */
  readonly open: HTMLButtonElement;
  /** The header's hint line, which says a click opens a closed book. */
  readonly hint: HTMLElement;
}

/** What the gate and the phone read off `window.__shelf` while a book is held. */
export interface HeldReading {
  readonly title: string;
  readonly phase: string;
  readonly progress: number;
  /** Whether the right-hand page is showing its Thoughts. */
  readonly thoughts: boolean;
  /** Whether the book is open at rest in the hand: false while closed, lifting or opening. */
  readonly opened: boolean;
  /** Whether the book is closed in the hand, to be turned (#418). */
  readonly examining: boolean;
  /**
   * Which cover the book's texture wears now: the held copy once it has been
   * swapped in, the shelf copy for a book with none or one that failed to load,
   * and `none` for a book whose cover material carries no texture at all — read
   * off the material, so a fallback that blanked the cover is not the shelf copy.
   */
  readonly cover: 'held' | 'shelf' | 'none';
  /**
   * Whether the book is still being closed or opened again by a tween. Under
   * reduced motion it never is: the move is a cut, in the same call.
   */
  readonly easing: boolean;
  /** The front board's angle to the page block, in degrees: 0 with the book closed. */
  readonly boardAngle: number;
  /**
   * Where the book stands on screen, in CSS pixels: what a gate needs to say
   * that the X leaves a closed book room, which no DOM element can tell it.
   */
  readonly screen: ScreenBox;
  /** The turn examining has put on the book, in degrees. */
  readonly turn: { readonly yaw: number; readonly pitch: number };
}

/** A rectangle on screen, in CSS pixels from the viewport's top left. */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** §3.6, measured from the scene at rest. See `measureSpread`. */
export interface SpreadReading {
  /** The front board's angle to the page block, in degrees. 180 is flat open. */
  readonly boardAngle: number;
  /** The left page and the page block's face, projected, in CSS pixels. */
  readonly left: { readonly width: number; readonly height: number };
  readonly block: { readonly width: number; readonly height: number };
  /** The widest gap between the two pages' inner edges, projected, in CSS pixels. */
  readonly gutterGap: number;
  /** How far each page's plane turns from facing the camera, in degrees. */
  readonly leftTilt: number;
  readonly rightTilt: number;
}

/** One held cover's upload, timed where it happens (spec §8, the swap frame). */
export interface SwapReading {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** `renderer.initTexture`'s wall time, in milliseconds. */
  readonly uploadMs: number;
  /** Textures the renderer holds with the held copy uploaded. */
  readonly textures: number;
}

/** The most recent swaps kept, so a long phone loop cannot grow the list. */
const SWAPS_KEPT = 20;

export interface Pickup {
  /**
   * Picks `book` up, or puts back on `undefined`; never opens. The entry for the
   * hooks and the chat link, which are not clicks.
   */
  select(book: LibraryBook | undefined): void;
  /**
   * The shelf's click, which is what the canvas calls: `select`, except that the
   * book in hand is opened, and a click the Ask drawer closed on (`takenByDrawer`)
   * leaves a held book alone.
   */
  clicked(book: LibraryBook | undefined, takenByDrawer: boolean): void;
  /** Opens the book in hand, as the Open button or a click on it would. */
  open(): void;
  /** Picks up the book at this index of the shelf, as a click on it would. */
  pickUp(index: number): void;
  /** Picks up the book with this id, as a click on it would; false when no book has it. */
  pickUpById(id: string): boolean;
  putBack(): void;
  /** A new shelf, after a rebuild or a fallback. Anything held is dropped first. */
  attach(stage: ShelfStage): void;
  /** The context was lost: everything back at once, as a hard cut (§3.4). */
  drop(): void;
  held(): HeldReading | undefined;
  /** §3.6's three numbers for the open book at rest, or nothing while none is. */
  measureSpread(): SpreadReading | undefined;
  /** The id of the book under a point of the viewport, in CSS pixels, or nothing: a click's target. */
  bookAt(x: number, y: number): string | undefined;
  /** Every held cover's upload so far, newest last. */
  swaps(): readonly SwapReading[];
  readonly tunable: TunablePickup;
}

export function createPickup(stage: ShelfStage, elements: PickupElements): Pickup {
  let current = stage;
  const { controls } = elements;
  const motion: { -readonly [K in keyof PickupMotion]: PickupMotion[K] } = { ...PICKUP_MOTION };
  const rigs = new WeakMap<THREE.Group, Rigged>();
  const lifted = new Map<string, Lifted>();
  const swaps: SwapReading[] = [];
  const record = (swap: SwapReading): void => {
    swaps.push(swap);
    if (swaps.length > SWAPS_KEPT) swaps.shift();
  };

  // GSAP runs from the shelf's frame, never its own ticker, which would step a
  // frame apart from the render and slide the page off its sheet.
  engine.ticker.remove(engine.updateRoot);

  const layer = document.createElement('div');
  layer.className = 'held-layer';
  const css = new CSS3DRenderer({ element: layer });
  elements.host.append(layer);

  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  veil.layers.set(VEIL_LAYER);
  veil.frustumCulled = false;
  veil.position.set(0, 0, -0.2);

  const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const staged = (book: LibraryBook): StagedBook | undefined =>
    current.books.find((candidate) => candidate.entry.book.id === book.id);

  // ---- the state machine's effects ------------------------------------------

  const state: PickupState<LibraryBook> = createPickupState<LibraryBook>(
    {
      track: (book, events) => {
        const entry = lifted.get(book.id);
        if (entry === undefined) return inertTrack();
        entry.track?.dispose();
        const track = buildTrack(entry.p, motion, events);
        entry.track = track;
        return track;
      },
      left: (book) => {
        lift(book);
      },
      landed: (book) => {
        // At rest, closed and cover-on: the pages are still hidden and the Open
        // button is the way in. Long Thoughts scroll once it is open.
        current.redrawShadows();
        syncControls();
        // A chat link's pickup, with focus on the launcher: to Open at landing.
        if (chatPickup === book.id && launcherHasFocus()) controls.open.focus();
        chatPickup = undefined;
      },
      opening: () => {
        // The Open button hides now; focus it held is caught on the canvas.
        syncControls();
      },
      opened: (book) => {
        const entry = lifted.get(book.id);
        entry?.pages.setScrollable(true);
        current.redrawShadows();
        // A hidden page cannot take focus: pose it visible first.
        pose();
        syncControls();
        const pending = focusPageOnOpen;
        focusPageOnOpen = false;
        const at = document.activeElement;
        if (pending && entry !== undefined && !entry.released) {
          if (at === document.body || at === current.canvas) {
            entry.pages.right.focus({ preventScroll: true });
          }
        }
      },
      settled: (book) => {
        settle(book);
      },
      announce: (book) => {
        elements.status.textContent = book === undefined ? '' : announcement(book);
        // The Ask the library drawer closes on this, a signal and not a timer.
        if (book !== undefined) announceHeld(window, book.id);
        // The hand emptied, by whichever way down: the pages are about to hide.
        if (book === undefined) {
          catchFocus();
          focusPageOnOpen = false;
        } else if (chatPickup !== undefined && chatPickup !== book.id) {
          // Not cleared when the hand empties: a chat link to another book empties
          // it on the way to the new one. A different book announced ends the ask.
          chatPickup = undefined;
        }
        syncControls();
      },
      examine: (book) => {
        const entry = lifted.get(book.id);
        if (entry === undefined) return;
        entry.ease?.kill();
        entry.ease = undefined;
        setTurn(entry, SQUARE);
        // The X is hidden while the modal holds everything, so no inert control
        // shows behind a transparent dialog.
        syncControls();
        elements.viewer.open(`${book.title}, closed in your hand`);
        if (reduced()) {
          entry.p.c = 1;
          return;
        }
        entry.ease = engine
          .timeline({ paused: false })
          .fromTo(
            entry.p,
            { c: entry.p.c },
            { c: 1, duration: motion.open, ease: bezier(motion.easeOpen) },
            0,
          )
          .eventCallback('onComplete', () => {
            entry.ease = undefined;
          });
      },
      leave: (book) => {
        const entry = lifted.get(book.id);
        if (entry === undefined) return;
        entry.ease?.kill();
        entry.ease = undefined;
        // Closing the dialog sends focus to the control that opened it, which is
        // still hidden: it would drop to `<body>`. Hold it on the canvas until
        // the page is visible again (S5).
        elements.viewer.close();
        current.canvas.focus();
        syncControls();
        const done = (): void => {
          entry.ease = undefined;
          entry.p.c = 0;
          setTurn(entry, SQUARE);
          pose();
          const at = document.activeElement;
          if (!entry.released && (at === document.body || at === current.canvas)) {
            entry.pages.examine.focus();
          }
        };
        if (reduced()) {
          done();
          return;
        }
        // Square first, then open: the book is closed until the turn has gone.
        const squaring = entry.turn.yaw === 0 && entry.turn.pitch === 0 ? 0 : motion.slide;
        const tl = engine.timeline({ paused: false });
        if (squaring > 0) {
          tl.fromTo(
            entry.turn,
            { yaw: entry.turn.yaw, pitch: entry.turn.pitch },
            { yaw: 0, pitch: 0, duration: squaring, ease: bezier(motion.easeOpen) },
            0,
          );
        }
        tl.fromTo(
          entry.p,
          { c: entry.p.c },
          { c: 0, duration: motion.open, ease: bezier(motion.easeOpen) },
          squaring,
        ).eventCallback('onComplete', done);
        entry.ease = tl;
      },
      cutExamining: (book) => {
        const entry = lifted.get(book.id);
        if (entry === undefined) return false;
        const was = entry.p.c > 0 || entry.ease !== undefined || elements.viewer.isOpen();
        entry.ease?.kill();
        entry.ease = undefined;
        entry.p.c = 0;
        setTurn(entry, SQUARE);
        if (elements.viewer.isOpen()) {
          elements.viewer.close();
          current.canvas.focus();
        }
        return was;
      },
      reduced,
      returnSpeed: () => motion.returnSpeed,
      history: {
        held: () => (history.state as { pickup?: unknown } | null)?.pickup !== undefined,
        push: (id) => {
          history.pushState({ pickup: id }, '');
        },
        replace: (id) => {
          history.replaceState({ pickup: id }, '');
        },
        back: () => {
          history.back();
        },
      },
    },
    (book) => book.id,
  );

  /** Takes the book out of its slot: rig it, open its pages, redraw without it. */
  const lift = (book: LibraryBook): void => {
    const target = staged(book);
    if (target === undefined) return;
    const { group } = target;
    const rig = rigFor(target);
    const narrow = current.camera.aspect < NARROW_ASPECT;
    const thoughts = book.thoughts === true;
    const pages = buildPages(
      book,
      { width: rig.spread.right.width, height: rig.spread.right.height },
      { narrow, thoughts },
    );
    const pageObjects = placePages(rig, pages);

    const entry: Lifted = {
      book,
      staged: target,
      rig,
      home: { position: group.position.clone(), quaternion: group.quaternion.clone() },
      p: { s: 0, u: 0, o: 0, c: 0 },
      turn: { yaw: 0, pitch: 0 },
      ease: undefined,
      pages,
      pageObjects,
      narrow,
      track: undefined,
      released: false,
    };
    lifted.set(book.id, entry);

    rig.rightSheet.visible = true;
    rig.leftSheet.visible = true;
    for (const mesh of rig.painted) mesh.visible = false;
    rig.block.castShadow = false;
    group.traverse((object) => {
      object.layers.enable(HELD_LAYER);
    });
    current.controls.enabled = false;
    current.redrawShadows();
    current.repaint(new Set(lifted.keys()));

    void loadThoughts(book).then((paragraphs) => {
      if (paragraphs === undefined || entry.released) return;
      // Already showing: fade them in at rest, never pop (spec §3.1).
      const showing = pages.right.style.visibility === 'visible';
      pages.showThoughts(paragraphs, showing && !reduced());
    });
    void swapInHeldCover(entry);
  };

  /**
   * Focus does not move on a shelf pickup (ADR-0049's reason; a chat link is the
   * one exception, ADR-0137). When the pages or the header controls that hold it
   * hide or go, it is caught on the canvas rather than dropped to `<body>` — the
   * X, Escape, the back button and a lost context alike.
   */
  const catchFocus = (): void => {
    const at = document.activeElement;
    if (layer.contains(at) || controls.root.contains(at)) current.canvas.focus();
  };

  // ---- the controls outside the pages ------------------------------------------

  const hintText = controls.hint.textContent;
  const CLOSED_HINT = 'Click the book to open it';
  /** A chat link's pickup in flight, so focus can move to Open when it lands. */
  let chatPickup: string | undefined;
  /** The open began from the controls: a screen reader or a keyboard asked for it. */
  let focusPageOnOpen = false;

  const launcherHasFocus = (): boolean => document.activeElement?.id === LAUNCHER_ID;

  const heldEntry = (): Lifted | undefined => {
    const holding = state.holding();
    return holding === undefined ? undefined : lifted.get(holding.book.id);
  };

  /**
   * Shows the controls the state calls for. The X is on screen from the pickup
   * until the hand empties, and away while the examining view holds the page.
   * The Open button, the hint and the cursor are for a book closed at rest, and
   * for that alone. Hiding what holds focus catches it on the canvas.
   */
  const syncControls = (): void => {
    const holding = state.holding();
    const closed = state.closed();
    const showX = holding !== undefined && !state.examining();
    const at = document.activeElement;
    if (
      (!showX && controls.root.contains(at)) ||
      (!closed && at === controls.open && controls.root.contains(at))
    ) {
      current.canvas.focus();
    }
    controls.root.hidden = !showX;
    controls.open.hidden = !closed;
    controls.hint.textContent = closed ? CLOSED_HINT : hintText;
    if (closed && holding !== undefined) controls.open.textContent = `Open ${holding.book.title}`;
    setCursor(closed);
  };

  // The cursor: a pointer over the held book while it is closed at rest.
  const caster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let cursorOn: HTMLCanvasElement | undefined;
  const overBook = (event: PointerEvent): void => {
    const entry = heldEntry();
    if (cursorOn === undefined || entry === undefined) return;
    const box = cursorOn.getBoundingClientRect();
    ndc.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    caster.setFromCamera(ndc, current.camera);
    cursorOn.style.cursor =
      caster.intersectObject(entry.staged.group, true).length > 0 ? 'pointer' : '';
  };
  const setCursor = (on: boolean): void => {
    if (on && cursorOn === current.canvas) return;
    if (cursorOn !== undefined) {
      cursorOn.removeEventListener('pointermove', overBook);
      cursorOn.style.cursor = '';
      cursorOn = undefined;
    }
    if (!on) return;
    cursorOn = current.canvas;
    cursorOn.addEventListener('pointermove', overBook);
  };

  /**
   * Runs `action`, which may open the book (the Open button, a click on it).
   * When it starts an opening and focus was in the header controls, a screen
   * reader or a keyboard asked for it, so the right-hand page takes focus once
   * the book is open; a pointer open moves none.
   */
  const noteFocusThen = (action: () => void): void => {
    focusPageOnOpen = controls.root.contains(document.activeElement);
    action();
    // Nothing started: a stale ask must not steal focus from a later open.
    if (state.closed() || state.holding() === undefined) focusPageOnOpen = false;
  };

  controls.putBack.addEventListener('click', () => {
    state.putBack();
  });
  controls.open.addEventListener('click', () => {
    noteFocusThen(() => {
      state.open();
    });
  });

  /** Back in its slot: every change `lift` made, undone. */
  const settle = (book: LibraryBook): void => {
    const entry = lifted.get(book.id);
    if (entry === undefined) return;
    catchFocus();
    lifted.delete(book.id);
    entry.released = true;
    entry.track?.dispose();
    entry.ease?.kill();
    const { group } = entry.staged;
    const { rig } = entry;
    group.position.copy(entry.home.position);
    group.quaternion.copy(entry.home.quaternion);
    rig.hinge.rotation.y = 0;
    rig.rightSheet.visible = false;
    rig.leftSheet.visible = false;
    for (const mesh of rig.painted) mesh.visible = true;
    rig.block.castShadow = rig.casts;
    group.traverse((object) => {
      object.layers.disable(HELD_LAYER);
    });
    for (const object of entry.pageObjects) object.removeFromParent();
    releaseHeldCover(entry);
    if (lifted.size === 0) {
      current.controls.enabled = true;
      veil.material.opacity = 0;
    }
    current.redrawShadows();
    current.repaint(new Set(lifted.keys()));
  };

  // ---- the held cover --------------------------------------------------------

  const swapInHeldCover = async (entry: Lifted): Promise<void> => {
    const path = entry.book.heldCover;
    const material = entry.rig.cover?.material;
    if (path === undefined || material === undefined) return;
    try {
      const loader = new THREE.ImageBitmapLoader();
      loader.setOptions({ imageOrientation: 'flipY' });
      const bitmap = await loader.loadAsync(rooted(path));
      if (entry.released) {
        bitmap.close();
        return;
      }
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = current.renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      // Uploaded before the swap, so the frame that shows it does not also pay
      // for it. Nobody had timed this on a phone; §8 asks for it, so it is timed
      // here and read back by scripts/phone-check.ts --pickups.
      const started = performance.now();
      current.renderer.initTexture(texture);
      record({
        title: entry.book.title,
        width: bitmap.width,
        height: bitmap.height,
        uploadMs: performance.now() - started,
        textures: current.renderer.info.memory.textures,
      });
      entry.heldCover = { texture, shelfMap: material.map };
      material.map = texture;
    } catch {
      // The shelf texture stays, which is what a book with no held copy shows.
    }
  };

  const releaseHeldCover = (entry: Lifted): void => {
    const held = entry.heldCover;
    const material = entry.rig.cover?.material;
    if (held === undefined || material === undefined) return;
    material.map = held.shelfMap;
    const image: unknown = held.texture.image;
    held.texture.dispose();
    if (image instanceof ImageBitmap) image.close();
    entry.heldCover = undefined;
  };

  // ---- rigging a book ---------------------------------------------------------

  const rigFor = (target: StagedBook): Rigged => {
    const known = rigs.get(target.group);
    if (known !== undefined) return known;
    const { group, entry, depth } = target;
    const spread = openSpread(entry, depth, current.headCap);

    const hinge = new THREE.Group();
    hinge.position.set(spread.pivot.x, 0, spread.pivot.z);
    group.add(hinge);
    group.updateMatrixWorld(true);
    for (const name of FRONT_PARTS) {
      const part = group.children.find((child) => child.name === name);
      if (part !== undefined) hinge.attach(part);
    }

    const block = asMesh(group.children.find((child) => child.name === PAGE_BLOCK));
    if (block === undefined) throw new Error(`no page block on ${entry.book.title}`);
    const found = hinge.children.find((child) => child.name === 'cover');
    const cover =
      found instanceof THREE.Mesh && found.material instanceof THREE.MeshStandardMaterial
        ? (found as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>)
        : undefined;

    const paper = paperMaterial();
    const rightSheet = sheetMesh(paper, 'right');
    const { right, leftOnBoard } = spread;
    rightSheet.scale.set(right.width, right.height, 1);
    rightSheet.rotation.y = Math.PI / 2;
    rightSheet.position.set(right.x, right.y, right.z);
    group.add(rightSheet);

    const leftSheet = sheetMesh(paper, 'left');
    leftSheet.scale.set(leftOnBoard.width, leftOnBoard.height, 1);
    leftSheet.rotation.y = -Math.PI / 2;
    leftSheet.position.set(
      leftOnBoard.x - spread.pivot.x,
      leftOnBoard.y,
      leftOnBoard.z - spread.pivot.z,
    );
    hinge.add(leftSheet);

    // A click on a sheet is a click on the book, not on empty space.
    current.lookup.set(rightSheet, entry.book);
    current.lookup.set(leftSheet, entry.book);

    const painted = group.children.filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial,
    );

    const rig: Rigged = {
      spread,
      hinge,
      rightSheet,
      leftSheet,
      block,
      cover,
      painted,
      casts: block.castShadow,
    };
    rigs.set(group, rig);
    return rig;
  };

  const placePages = (rig: Rigged, pages: HeldPages): CSS3DObject[] => {
    const { spread } = rig;
    const scale = spread.right.width / PAGE_PX;
    for (const element of [pages.left, pages.right]) {
      element.style.backfaceVisibility = 'hidden';
      element.style.pointerEvents = 'auto';
      element.style.opacity = '0';
      element.style.visibility = 'hidden';
    }
    pages.setScrollable(false);

    const right = new CSS3DObject(pages.right);
    right.scale.setScalar(scale);
    right.rotation.y = Math.PI / 2;
    right.position.set(spread.right.x + PAGE_LIFT, spread.right.y, spread.right.z);
    rig.rightSheet.parent?.add(right);

    const left = new CSS3DObject(pages.left);
    left.scale.setScalar(scale);
    left.rotation.y = -Math.PI / 2;
    const board = spread.leftOnBoard;
    left.position.set(board.x - PAGE_LIFT - spread.pivot.x, board.y, board.z - spread.pivot.z);
    rig.hinge.add(left);
    return [right, left];
  };

  // ---- each frame ----------------------------------------------------------------

  const tmp = {
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(),
    x: new THREE.Vector3(),
    z: new THREE.Vector3(),
    right: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
  };

  const setTurn = (entry: Lifted, turn: { readonly yaw: number; readonly pitch: number }): void => {
    entry.turn.yaw = turn.yaw;
    entry.turn.pitch = turn.pitch;
  };

  /**
   * Where the book's origin goes for an opening `o`: square to the camera, then
   * turned by `turn` about the camera's own axes and about the book's focus.
   */
  const heldPose = (
    entry: Lifted,
    o: number,
    turn: { readonly yaw: number; readonly pitch: number } = SQUARE,
  ): { position: THREE.Vector3; quaternion: THREE.Quaternion } => {
    const { camera } = current;
    const { spread } = entry.rig;
    const { thickness, height } = entry.staged.entry;
    const { depth } = entry.staged;
    const vFov = THREE.MathUtils.degToRad(camera.fov);

    // Closed: the cover. Open: the spread's gutter, or on a phone the right page.
    const closed = new THREE.Vector3(thickness / 2, 0, 0);
    const open = entry.narrow
      ? new THREE.Vector3(spread.right.x, spread.right.y, spread.right.z)
      : new THREE.Vector3(spread.pivot.x, spread.right.y, spread.pivot.z);
    const focus = closed.lerp(open, o);
    const width = THREE.MathUtils.lerp(
      depth,
      entry.narrow ? spread.right.width : spread.right.width * 2,
      o,
    );
    const tan = Math.tan(vFov / 2);
    const distance = Math.max(
      (height * motion.margin) / 2 / tan,
      (width * motion.margin) / 2 / tan / camera.aspect,
    );

    // Square to the camera: the cover side (+X) towards it, the head (+Y) up.
    camera.getWorldDirection(tmp.dir);
    tmp.x.copy(tmp.dir).negate();
    tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    tmp.z.crossVectors(tmp.x, tmp.up);
    tmp.basis.makeBasis(tmp.x, tmp.up, tmp.z);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(tmp.basis);
    if (turn.yaw !== 0 || turn.pitch !== 0) {
      // Turned about the camera's own axes, after squaring, and about the focus
      // below, so the book turns where it hangs and stays centred in the frame.
      tmp.right.crossVectors(tmp.up, tmp.x);
      const pitch = new THREE.Quaternion().setFromAxisAngle(tmp.right, turn.pitch);
      const yaw = new THREE.Quaternion().setFromAxisAngle(tmp.up, turn.yaw);
      quaternion.premultiply(pitch).premultiply(yaw);
    }
    const position = camera.position
      .clone()
      .addScaledVector(tmp.dir, distance)
      .sub(focus.applyQuaternion(quaternion));
    return { position, quaternion };
  };

  const pose = (): void => {
    for (const entry of lifted.values()) {
      const { p } = entry;
      const { group } = entry.staged;
      // Open in the hand less however far it is closed for examining.
      const o = p.o * (1 - p.c);
      const held = heldPose(entry, o, entry.turn);
      const slid = entry.home.position
        .clone()
        .add(new THREE.Vector3(0, motion.lift * p.s, motion.slideOut * p.s));
      group.position.copy(slid.lerp(held.position, p.u));
      group.quaternion.copy(entry.home.quaternion).slerp(held.quaternion, p.u);
      entry.rig.hinge.rotation.y = -THREE.MathUtils.degToRad(openAngle(o));
      const shown = textOpacity(o, motion);
      for (const element of [entry.pages.left, entry.pages.right]) {
        element.style.opacity = String(shown);
        // Out of the accessibility tree until it is on screen (§3.4).
        element.style.visibility = shown > 0 ? 'visible' : 'hidden';
      }
    }
  };

  const hooks = {
    holdsCamera: (): boolean => lifted.size > 0,
    draw: (drawShelf: () => void): void => {
      engine.updateRoot(performance.now() / 1000);
      // GSAP wakes its own ticker on import and whenever a timeline is made,
      // and that ticker runs a requestAnimationFrame loop of its own until it
      // auto-sleeps 120 of its frames later. Stepped from here, it needs none:
      // a second loop beside the shelf's is what G60 reads as a disposed shelf
      // still drawing, and on a slow runner it was still awake when counted.
      engine.ticker.sleep();
      pose();
      const rest = Math.max(0, ...[...lifted.values()].map((entry) => entry.p.u));
      if (lifted.size === 0 || rest === 0) {
        drawShelf();
        return;
      }
      const { renderer, scene, camera } = current;
      veil.material.opacity = motion.dim * rest;
      // Three passes: the shelf without the held books, the veil over it, then
      // the held books — depth kept, so a book still in its slot stays behind
      // the upright beside it.
      for (const entry of lifted.values()) entry.staged.group.visible = false;
      drawShelf();
      for (const entry of lifted.values()) entry.staged.group.visible = true;
      const autoClear = renderer.autoClear;
      // A colour background clears on every render whatever autoClear says
      // (`WebGLBackground.js`), so the later passes run with none.
      const background = scene.background;
      scene.background = null;
      renderer.autoClear = false;
      camera.layers.set(VEIL_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(HELD_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(0);
      renderer.autoClear = autoClear;
      scene.background = background;
    },
    after: (): void => {
      css.render(current.scene, current.camera);
    },
  };

  const install = (next: ShelfStage): void => {
    current = next;
    next.camera.add(veil);
    if (next.camera.parent === null) next.scene.add(next.camera);
    // Lights are culled by layer like anything else; the held book's pass needs them.
    next.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.layers.enableAll();
    });
    next.setFrame(hooks);
    sizeLayer();
    observer.disconnect();
    observer.observe(next.canvas);
  };

  const sizeLayer = (): void => {
    const box = current.canvas.getBoundingClientRect();
    css.setSize(box.width, box.height);
  };
  const observer = new ResizeObserver(sizeLayer);

  // A reload keeps `history.state`, so a page loaded on a pickup's entry would
  // treat it as this document's own: the first pickup would replace it rather
  // than push, and its put-back's `history.back()` would leave the document.
  // Nothing is held on load, so the key is cleared and anything else kept.
  const loaded = history.state as Record<string, unknown> | null;
  if (loaded !== null && typeof loaded === 'object' && 'pickup' in loaded) {
    const { pickup: _stale, ...rest } = loaded;
    history.replaceState(Object.keys(rest).length === 0 ? null : rest, '');
  }

  install(stage);

  addEventListener('popstate', () => {
    state.popped();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // An open Ask the library drawer took this Escape (it listens first, on the
    // window): it closes and the book stays held.
    if (event.defaultPrevented) return;
    // The examining view is a modal `<dialog>`: the platform closes it on
    // Escape, and the keydown still reaches here. One Escape leaves the view
    // and keeps the book held (§3.5, check 9). Also while the book is still
    // easing open again: that Escape already left the view once.
    if (elements.viewer.isOpen() || [...lifted.values()].some((entry) => entry.p.c > 0)) return;
    state.putBack();
  });

  /** What the view's dialog asks for, bound once: the pickup answers each. */
  elements.viewer.bind({
    examine: () => {
      state.examine();
    },
    leave: () => {
      state.leave();
    },
    turn: (update) => {
      const holding = state.holding();
      const entry = holding === undefined ? undefined : lifted.get(holding.book.id);
      if (entry === undefined || !state.examining()) return;
      setTurn(entry, update(entry.turn));
    },
  });

  const tunable: TunablePickup = {
    motion,
    retime: () => {
      state.retime();
    },
    state: (): TunerReading | undefined => {
      const moving = state.current();
      if (moving === undefined) return undefined;
      return {
        title: moving.book.title,
        phase: moving.phase,
        progress: moving.progress(),
        duration: schedule(motion).end,
      };
    },
    scrub: (progress) => {
      state.scrub(progress);
    },
    play: () => {
      state.play();
    },
    putBack: () => {
      state.putBack();
    },
  };

  return {
    select: (book) => {
      state.select(book);
    },
    clicked: (book, takenByDrawer) => {
      noteFocusThen(() => {
        state.clicked(book, takenByDrawer);
      });
    },
    open: () => {
      noteFocusThen(() => {
        state.open();
      });
    },
    pickUp: (index) => {
      const book = current.books[index]?.entry.book;
      if (book !== undefined) state.select(book);
    },
    pickUpById: (id) => {
      // Already in the hand: no new pickup, but the drawer still has to hear it.
      if (state.holding()?.book.id === id) {
        announceHeld(window, id);
        // Closed at rest, the way on is Open: a keyboard reader's focus is on the
        // launcher the drawer just returned it to. An open book leaves it there.
        if (state.closed() && launcherHasFocus()) controls.open.focus();
        return true;
      }
      const book = current.books.find((placed) => placed.entry.book.id === id)?.entry.book;
      if (book === undefined) return false;
      // Read when the pickup lands, because the drawer closes as it starts.
      chatPickup = id;
      state.select(book);
      return true;
    },
    putBack: () => {
      state.putBack();
    },
    attach: (next) => {
      state.drop();
      // The canvas may be a new element: the old one's cursor listener goes first.
      setCursor(false);
      install(next);
    },
    drop: () => {
      state.drop();
    },
    held: () => {
      const holding = state.holding();
      if (holding === undefined) return undefined;
      const entry = lifted.get(holding.book.id);
      return {
        title: holding.book.title,
        phase: holding.phase,
        progress: entry?.track?.progress() ?? 1,
        thoughts: entry?.pages.right.querySelector('.held-thoughts:not([hidden])') !== null,
        opened: holding.opened,
        examining: state.examining(),
        easing: entry?.ease !== undefined,
        cover: coverReading(entry),
        boardAngle: entry === undefined ? 0 : boardAngleOf(entry),
        screen: entry === undefined ? EMPTY_BOX : screenBoxOf(entry, current),
        turn: {
          yaw: THREE.MathUtils.radToDeg(entry?.turn.yaw ?? 0),
          pitch: THREE.MathUtils.radToDeg(entry?.turn.pitch ?? 0),
        },
      };
    },
    measureSpread: () => {
      const holding = state.holding();
      // The spread at rest: a closed book, or one still opening, has none.
      if (holding?.phase !== 'held' || !holding.opened) return undefined;
      const entry = lifted.get(holding.book.id);
      return entry === undefined || entry.narrow ? undefined : measure(entry, current);
    },
    bookAt: (x, y) => {
      const box = current.canvas.getBoundingClientRect();
      ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
      caster.setFromCamera(ndc, current.camera);
      const hit = caster.intersectObjects(
        current.books.map((placed) => placed.group),
        true,
      )[0];
      return hit === undefined ? undefined : current.lookup.get(hit.object)?.id;
    },
    swaps: () => [...swaps],
    tunable,
  };
}

const EMPTY_BOX: ScreenBox = { left: 0, top: 0, right: 0, bottom: 0 };

/** The book's bounding box, projected to the viewport: the room it takes on screen. */
function screenBoxOf(entry: Lifted, stage: ShelfStage): ScreenBox {
  entry.staged.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(entry.staged.group);
  const rect = stage.canvas.getBoundingClientRect();
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(stage.camera);
        xs.push(rect.left + ((point.x + 1) / 2) * rect.width);
        ys.push(rect.top + ((1 - point.y) / 2) * rect.height);
      }
    }
  }
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/**
 * The mesh this object is, with three's generic defaults back on it — see
 * `asMesh` in scene.ts for why instanceof alone gives a weaker type.
 */
function asMesh(object: THREE.Object3D | undefined): THREE.Mesh | undefined {
  return object instanceof THREE.Mesh ? object : undefined;
}

/**
 * One of the two paper sheets: lit, reading no shadow map, casting none, and
 * darkening into the fold — see gutter-sheet.ts.
 */
function sheetMesh(material: THREE.MeshStandardMaterial, page: 'left' | 'right'): THREE.Mesh {
  const mesh = new THREE.Mesh(sheetGeometry(page), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  return mesh;
}

/** For a book the shelf no longer has: a track that goes nowhere. */
function inertTrack(): Track {
  return {
    play: () => undefined,
    reverse: () => undefined,
    finish: () => undefined,
    finishOpen: () => undefined,
    rewind: () => undefined,
    seek: () => undefined,
    progress: () => 0,
    closedProgress: () => 0,
    dispose: () => undefined,
  };
}

/** What the cover material carries, for `HeldReading.cover`. */
function coverReading(entry: Lifted | undefined): 'held' | 'shelf' | 'none' {
  if (entry?.heldCover !== undefined) return 'held';
  return entry?.rig.cover?.material.map == null ? 'none' : 'shelf';
}

/**
 * The front board's angle to the page block, in degrees, read off the scene:
 * its outward normal (+X) against the block's, 0° shut and 180° flat open.
 * Unmoved by turning the whole book, so examining reads 0 at any turn.
 */
function boardAngleOf(entry: Lifted): number {
  const { rig } = entry;
  entry.staged.group.updateMatrixWorld(true);
  const board = rig.hinge.children.find((child) => child.name === 'front-board') ?? rig.hinge;
  const boardNormal = new THREE.Vector3(1, 0, 0).transformDirection(board.matrixWorld);
  const blockNormal = new THREE.Vector3(1, 0, 0).transformDirection(rig.block.matrixWorld);
  return THREE.MathUtils.radToDeg(boardNormal.angleTo(blockNormal));
}

/**
 * §3.6, read off the scene: the board's angle to the block, the left page's
 * projected size against the block face's, and the gap at the gutter.
 */
function measure(entry: Lifted, stage: ShelfStage): SpreadReading {
  const { camera, canvas } = stage;
  const { rig } = entry;
  const box = canvas.getBoundingClientRect();
  entry.staged.group.updateMatrixWorld(true);

  const project = (local: THREE.Vector3, object: THREE.Object3D): THREE.Vector2 => {
    const point = object.localToWorld(local.clone()).project(camera);
    return new THREE.Vector2(((point.x + 1) / 2) * box.width, ((1 - point.y) / 2) * box.height);
  };

  // A sheet's extent read off its own vertices, never assumed: a geometry that
  // drifted off the unit plane, or bent out of it, must move these numbers.
  const extent = (mesh: THREE.Mesh): THREE.Box3 => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox ?? new THREE.Box3();
  };
  const corners = (mesh: THREE.Mesh): THREE.Vector2[] => {
    const { min, max } = extent(mesh);
    return [min.x, max.x].flatMap((x) =>
      [min.y, max.y].flatMap((y) =>
        [min.z, max.z].map((z) => project(new THREE.Vector3(x, y, z), mesh)),
      ),
    );
  };
  const size = (points: THREE.Vector2[]): { width: number; height: number } => {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };

  const block = rig.block;
  // The block's cover-side face, as a plane of its own: +X, half a unit out.
  const faceCorners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([z, y]) => project(new THREE.Vector3(0.5, y, z), block));

  const boardAngle = boardAngleOf(entry);

  // The inner edges at the gutter. Each sheet is a plane turned about Y: the
  // right one by +90°, so its local −x points to the spine; the left one rides
  // the board turned −90° and then the hinge's −180°, so its local +x does.
  const leftEdge = extent(rig.leftSheet);
  const rightEdge = extent(rig.rightSheet);
  const gaps = [-0.5, 0, 0.5].map((y) =>
    project(new THREE.Vector3(leftEdge.max.x, y, leftEdge.max.z), rig.leftSheet).distanceTo(
      project(new THREE.Vector3(rightEdge.min.x, y, rightEdge.max.z), rig.rightSheet),
    ),
  );

  const toCamera = new THREE.Vector3();
  camera.getWorldDirection(toCamera).negate();
  const tilt = (mesh: THREE.Object3D): number =>
    THREE.MathUtils.radToDeg(
      new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld).angleTo(toCamera),
    );

  return {
    boardAngle,
    left: size(corners(rig.leftSheet)),
    block: size(faceCorners),
    gutterGap: Math.max(...gaps),
    leftTilt: tilt(rig.leftSheet),
    rightTilt: tilt(rig.rightSheet),
  };
}

/**
 * The phone loop (spec §4): picks up `rounds` books in turn, holds each closed,
 * opens it and holds it open, puts it back, and resolves with how many rounds
 * reached the closed rest and how many reached open, each on its own. A pass has
 * then tested a closed book, and its memory figure still measures an open one
 * (#531).
 *
 * Replaces #371's `?autoplay=5`, which any link could carry to a visitor's
 * device. This is reachable only from `window.__shelf`, which is to say from a
 * script driving the page — `scripts/phone-check.ts`.
 */
export async function loopPickups(
  pickup: Pickup,
  books: number,
  rounds: number,
): Promise<LoopResult> {
  let closedRounds = 0;
  let openRounds = 0;
  for (let round = 0; round < rounds; round += 1) {
    // A stride through the shelf, so the loop visits books far apart.
    pickup.pickUp((3 + round * 7) % Math.max(1, books));
    const closed = await until(
      () => pickup.held()?.phase === 'held' && pickup.held()?.opened === false,
      LOOP_WAIT_MS,
    );
    await pause(LOOP_HOLD_MS);
    pickup.open();
    const open = await until(() => pickup.held()?.opened === true, LOOP_WAIT_MS);
    if (closed) closedRounds += 1;
    if (open) openRounds += 1;
    await pause(LOOP_HOLD_MS);
    pickup.putBack();
    await until(() => pickup.held() === undefined, LOOP_WAIT_MS);
    await pause(LOOP_SETTLE_MS);
  }
  return { closed: closedRounds, open: openRounds };
}

/** How many rounds reached the closed rest and the open rest, each counted on its own. */
export interface LoopResult {
  readonly closed: number;
  readonly open: number;
}

const LOOP_WAIT_MS = 5000;
const LOOP_HOLD_MS = 1500;
/** Long enough for the return at 1.6× speed to land before the next pickup. */
const LOOP_SETTLE_MS = 1200;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(condition: () => boolean, ms: number): Promise<boolean> {
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) {
    if (condition()) return true;
    await pause(50);
  }
  return condition();
}
