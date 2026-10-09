/**
 * Picking a book up: a click brings the book out of the shelf, turns it in
 * your hand and opens it to its Thoughts (spec §3.4–§3.10, ADR-0102, ADR-0103).
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
 *   (#371). Imported from `gsap/gsap-core` (#370).
 * - **The rest of the shelf dims under a veil** in three passes — the shelf, a
 *   55% veil, then the held book — keeping depth, so a book still inside the
 *   shelf stays behind its upright (#371).
 * - **The pages are DOM, placed by `CSS3DRenderer`** in the same frame (#369),
 *   hidden until the cover has turned past the fade angle, from sight and from
 *   the accessibility tree alike (`visibility`, not opacity alone, §3.4).
 * - **The held cover** decodes off the main thread and uploads before it is
 *   swapped in; it is freed on put-down (#377, ADR-0105).
 * - **The shadow map is redrawn and the painted pieces repainted** when a book
 *   leaves its slot, when it comes to rest and when it is back (§3.10).
 *
 * Every new lit part goes through `withoutShadowFetch`: a book that reads the
 * shadow map again is the one configuration the Pixel cannot hold (ADR-0088).
 * G61 counts it on a page with a book held.
 */
import * as THREE from 'three';
import { gsap } from 'gsap/gsap-core';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { LibraryBook } from '@stacks/core';
import { announcement } from './card.ts';
import { buildPages, PAGE_PX, type HeldPages } from './held-page.ts';
import { loadThoughts } from './notes.ts';
import { openSpread, type OpenSpread } from './open-spread.ts';
import { bezier, openAngle, schedule, textOpacity } from './pickup-motion.ts';
import { createPickupState, type PickupState, type Track } from './pickup-state.ts';
import type { PickupState as TunerState, TunablePickup } from './pickup-tuner.ts';
import { FRONT_PARTS, PAGE_BLOCK, type ShelfStage, type StagedBook } from './scene.ts';
import { withoutShadowFetch } from './shadow-receivers.ts';
import { PICKUP_MOTION, type PickupMotion } from './shelf-settings.ts';

/**
 * The slice of GSAP used here, declared (spec §3.8).
 *
 * The repo's type-aware lint cannot resolve the timeline type `gsap/gsap-core`
 * returns, and every call on it then reads as unsafe (#371). The cost of a
 * local slice is that an upgrade can drift from it silently; the pickup gate
 * runs the real library.
 */
interface Timeline {
  fromTo(
    target: object,
    from: Readonly<Record<string, number>>,
    to: Readonly<Record<string, unknown>>,
    position: number,
  ): Timeline;
  eventCallback(type: 'onComplete' | 'onReverseComplete', callback: () => void): Timeline;
  progress(): number;
  progress(value: number, suppressEvents: boolean): Timeline;
  play(): Timeline;
  pause(): Timeline;
  reverse(): Timeline;
  timeScale(value: number): Timeline;
  duration(): number;
  kill(): void;
}
interface Engine {
  timeline(vars: { readonly paused: boolean }): Timeline;
  readonly ticker: { remove(callback: unknown): void; sleep(): void };
  /** A property, not a method: it is handed to the ticker unbound. */
  readonly updateRoot: (seconds: number) => void;
}
const engine = gsap as unknown as Engine;

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
  /** The three stages' progress, 0..1 each, tweened by the track. */
  readonly p: { s: number; u: number; o: number };
  readonly pages: HeldPages;
  readonly pageObjects: readonly CSS3DObject[];
  readonly narrow: boolean;
  track: Timeline | undefined;
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
  /** Whether the enlarged cover is up, so one Escape leaves the book held. */
  readonly coverViewerOpen: () => boolean;
}

/** What the gate and the phone read off `window.__shelf` while a book is held. */
export interface HeldReading {
  readonly title: string;
  readonly phase: string;
  readonly progress: number;
  /** Whether the right-hand page is showing its Thoughts. */
  readonly thoughts: boolean;
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
  /** The shelf's click: a book, or empty space. */
  select(book: LibraryBook | undefined): void;
  /** Picks up the book at this index of the shelf, as a click on it would. */
  pickUp(index: number): void;
  putBack(): void;
  /** A new shelf, after a rebuild or a fallback. Anything held is dropped first. */
  attach(stage: ShelfStage): void;
  /** The context was lost: everything back at once, as a hard cut (§3.4). */
  drop(): void;
  held(): HeldReading | undefined;
  /** §3.6's three numbers for the book at rest, or nothing while none is. */
  measureSpread(): SpreadReading | undefined;
  /** Every held cover's upload so far, newest last. */
  swaps(): readonly SwapReading[];
  readonly tunable: TunablePickup;
}

export function createPickup(stage: ShelfStage, elements: PickupElements): Pickup {
  let current = stage;
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
        entry.track?.kill();
        const at = schedule(motion);
        const tl = engine.timeline({ paused: true });
        tl.fromTo(
          entry.p,
          { s: 0 },
          { s: 1, duration: motion.slide, ease: bezier(motion.easeSlide) },
          at.slide,
        );
        tl.fromTo(
          entry.p,
          { u: 0 },
          { u: 1, duration: motion.turn, ease: bezier(motion.easeTurn) },
          at.turn,
        );
        tl.fromTo(
          entry.p,
          { o: 0 },
          { o: 1, duration: motion.open, ease: bezier(motion.easeOpen) },
          at.open,
        );
        tl.eventCallback('onComplete', events.landed);
        tl.eventCallback('onReverseComplete', events.returned);
        entry.track = tl;
        return trackOf(tl);
      },
      left: (book) => {
        lift(book);
      },
      landed: (book) => {
        const entry = lifted.get(book.id);
        entry?.pages.setScrollable(true);
        current.redrawShadows();
      },
      settled: (book) => {
        settle(book);
      },
      announce: (book) => {
        elements.status.textContent = book === undefined ? '' : announcement(book);
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
    pages.putBack.addEventListener('click', () => {
      const inside = layer.contains(document.activeElement);
      state.putBack();
      // Focus never moves on pickup (ADR-0049's reason); on put-back it is
      // caught on the canvas only if the control that held it is going away.
      if (inside) current.canvas.focus();
    });

    const entry: Lifted = {
      book,
      staged: target,
      rig,
      home: { position: group.position.clone(), quaternion: group.quaternion.clone() },
      p: { s: 0, u: 0, o: 0 },
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

  /** Back in its slot: every change `lift` made, undone. */
  const settle = (book: LibraryBook): void => {
    const entry = lifted.get(book.id);
    if (entry === undefined) return;
    lifted.delete(book.id);
    entry.released = true;
    entry.track?.kill();
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
      const bitmap = await loader.loadAsync(path.startsWith('/') ? path : `/${path}`);
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

    const paper = withoutShadowFetch(
      new THREE.MeshStandardMaterial({ color: 0xece2cf, roughness: 0.95 }),
    );
    const rightSheet = sheetMesh(paper);
    const { right, leftOnBoard } = spread;
    rightSheet.scale.set(right.width, right.height, 1);
    rightSheet.rotation.y = Math.PI / 2;
    rightSheet.position.set(right.x, right.y, right.z);
    group.add(rightSheet);

    const leftSheet = sheetMesh(paper);
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
    basis: new THREE.Matrix4(),
  };

  /** Where the book's origin goes, square to the camera, for an opening `o`. */
  const heldPose = (
    entry: Lifted,
    o: number,
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
      const held = heldPose(entry, p.o);
      const slid = entry.home.position
        .clone()
        .add(new THREE.Vector3(0, motion.lift * p.s, motion.slideOut * p.s));
      group.position.copy(slid.lerp(held.position, p.u));
      group.quaternion.copy(entry.home.quaternion).slerp(held.quaternion, p.u);
      entry.rig.hinge.rotation.y = -THREE.MathUtils.degToRad(openAngle(p.o));
      const shown = textOpacity(p.o, motion);
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

  install(stage);

  addEventListener('popstate', () => {
    state.popped();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // The enlarged cover is a modal `<dialog>`: the platform closes it on
    // Escape, and the keydown still reaches here. One Escape closes the viewer
    // and leaves the book held (§3.5, check 9).
    if (elements.coverViewerOpen()) return;
    state.putBack();
  });

  const tunable: TunablePickup = {
    motion,
    retime: () => {
      state.retime();
    },
    state: (): TunerState | undefined => {
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
    pickUp: (index) => {
      const book = current.books[index]?.entry.book;
      if (book !== undefined) state.select(book);
    },
    putBack: () => {
      state.putBack();
    },
    attach: (next) => {
      state.drop();
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
      };
    },
    measureSpread: () => {
      const holding = state.holding();
      if (holding?.phase !== 'held') return undefined;
      const entry = lifted.get(holding.book.id);
      return entry === undefined || entry.narrow ? undefined : measure(entry, current);
    },
    swaps: () => [...swaps],
    tunable,
  };
}

/**
 * The mesh this object is, with three's generic defaults back on it — see
 * sMesh in scene.ts for why instanceof alone gives a weaker type.
 */
function asMesh(object: THREE.Object3D | undefined): THREE.Mesh | undefined {
  return object instanceof THREE.Mesh ? object : undefined;
}

/** One of the two paper sheets: lit, reading no shadow map, casting none. */
function sheetMesh(material: THREE.MeshStandardMaterial): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  return mesh;
}

function trackOf(tl: Timeline): Track {
  return {
    play: () => {
      tl.timeScale(1).play();
    },
    reverse: (speed) => {
      tl.timeScale(speed).reverse();
    },
    finish: () => {
      tl.pause().progress(1, true);
    },
    rewind: () => {
      tl.pause().progress(0, true);
    },
    seek: (progress) => {
      tl.pause().progress(progress, true);
    },
    progress: () => tl.progress(),
    dispose: () => {
      tl.kill();
    },
  };
}

/** For a book the shelf no longer has: a track that goes nowhere. */
function inertTrack(): Track {
  return {
    play: () => undefined,
    reverse: () => undefined,
    finish: () => undefined,
    rewind: () => undefined,
    seek: () => undefined,
    progress: () => 0,
    dispose: () => undefined,
  };
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

  // A unit plane's corners, in its own frame: ±0.5 along x and y.
  const corners = (mesh: THREE.Object3D): THREE.Vector2[] =>
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([x, y]) => project(new THREE.Vector3(x, y, 0), mesh));
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

  // The board's outward normal (+X) against the block's: 0° shut, 180° flat open.
  const board = rig.hinge.children.find((child) => child.name === 'front-board') ?? rig.hinge;
  const boardNormal = new THREE.Vector3(1, 0, 0).transformDirection(board.matrixWorld);
  const blockNormal = new THREE.Vector3(1, 0, 0).transformDirection(block.matrixWorld);
  const boardAngle = THREE.MathUtils.radToDeg(boardNormal.angleTo(blockNormal));

  // The inner edges at the gutter. Each sheet is a plane turned about Y: the
  // right one by +90°, so its local −x points to the spine; the left one rides
  // the board turned −90° and then the hinge's −180°, so its local +x does.
  const gaps = [-0.5, 0, 0.5].map((y) =>
    project(new THREE.Vector3(0.5, y, 0), rig.leftSheet).distanceTo(
      project(new THREE.Vector3(-0.5, y, 0), rig.rightSheet),
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
 * The phone loop (spec §4): picks up `rounds` books in turn, holds each, puts it
 * back, and resolves with how many reached the held state.
 *
 * Replaces #371's `?autoplay=5`, which any link could carry to a visitor's
 * device. This is reachable only from `window.__shelf`, which is to say from a
 * script driving the page — `scripts/phone-check.ts`.
 */
export async function loopPickups(pickup: Pickup, books: number, rounds: number): Promise<number> {
  let held = 0;
  for (let round = 0; round < rounds; round += 1) {
    // A stride through the shelf, so the loop visits books far apart.
    pickup.pickUp((3 + round * 7) % Math.max(1, books));
    if (await until(() => pickup.held()?.phase === 'held', LOOP_WAIT_MS)) held += 1;
    await pause(LOOP_HOLD_MS);
    pickup.putBack();
    await until(() => pickup.held() === undefined, LOOP_WAIT_MS);
    await pause(LOOP_SETTLE_MS);
  }
  return held;
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
