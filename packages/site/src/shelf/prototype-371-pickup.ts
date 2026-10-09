/**
 * PROTOTYPE — #371, throwaway. Lives on `prototype/371-pickup-choreography` and
 * never merges.
 *
 * Question: how does a book move from the shelf to your hand and back?
 *
 * `?pickup` swaps the card for a pickup on the real shelf. Click a book: it
 * slides out, turns cover-on and opens to its Thoughts (invented text) or, for a
 * book with none, to the card's lines. GSAP plays the three stages; `?debug`
 * adds the pickup tuner (Tweakpane), which scrubs the timeline and edits the
 * constants in `shelf-settings.ts` (`PICKUP_MOTION`).
 *
 * The choices the owner switches between, each also a query parameter:
 *
 *   mover=book|camera        the book comes to the camera, or the camera to the book
 *   rest=none|dim|fade       what the rest of the shelf does while a book is held
 *   interrupt=putback|swap|ignore   a click on another book while one is held
 *   returning=allow|wait     a pickup while another book is still going back
 *   shadow=frozen|refresh|live      what the one-shot shadow map does
 *   motion=system|reduce|full       reduced motion, forced either way or from the OS
 *
 * Built on #369's findings: the held book is the shelf's own `THREE.Group`; the
 * text is a `CSS3DRenderer` page updated in the same frame as the WebGL render;
 * it fades in past ~95° of cover swing; a paper sheet covers the open page; the
 * book settles square to the camera; a narrow screen frames the right page.
 */
import * as THREE from 'three';
import { gsap } from 'gsap/gsap-core';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { LibraryBook } from '@stacks/core';
import { cardModel } from './card.ts';
import { PROTO_371, type Proto371Shelf } from './scene.ts';
import { withoutShadowFetch } from './shadow-receivers.ts';
import { PICKUP_MOTION, type Bezier, type PickupMotion } from './shelf-settings.ts';

export const CHOICES = {
  mover: ['book', 'camera'],
  rest: ['none', 'dim', 'fade'],
  interrupt: ['putback', 'swap', 'ignore'],
  returning: ['allow', 'wait'],
  shadow: ['frozen', 'refresh', 'live'],
  motion: ['system', 'reduce', 'full'],
} as const;

type Choices = { -readonly [K in keyof typeof CHOICES]: (typeof CHOICES)[K][number] };

const DEFAULT_CHOICES: Choices = {
  mover: 'book',
  rest: 'dim',
  interrupt: 'putback',
  returning: 'allow',
  shadow: 'refresh',
  motion: 'system',
};

/** The tween targets. Each runs 0 → 1 on pickup and back on put-back. */
interface Progress {
  s: number; // slide
  u: number; // turn (and the camera, and the rest of the shelf)
  o: number; // open
}

type Phase = 'lifting' | 'held' | 'returning';
/**
 * The slice of a GSAP timeline used here. Declared, because the lint's type
 * service cannot resolve the type `gsap/gsap-core` returns, and every call on
 * it then reads as unsafe; tsc resolves it, and the cast is at one place.
 */
interface Timeline {
  to(target: object, vars: Record<string, unknown>, position?: number): Timeline;
  eventCallback(type: 'onComplete' | 'onReverseComplete', callback: () => void): Timeline;
  progress(): number;
  progress(value: number): Timeline;
  play(): Timeline;
  pause(): Timeline;
  reverse(): Timeline;
  reversed(): boolean;
  paused(): boolean;
  timeScale(value: number): Timeline;
  duration(): number;
  kill(): void;
}

interface Prepared {
  readonly pivot: THREE.Group;
  readonly right: CSS3DObject;
  readonly left: CSS3DObject;
  readonly rightEl: HTMLElement;
  readonly leftEl: HTMLElement;
  /** Unlit painted planes on the book (the neighbour shadow): hidden while held. */
  readonly painted: readonly THREE.Mesh[];
  /** The page block, the one part that casts. */
  readonly block: THREE.Mesh;
  /** Book-local sizes, measured from the built group. */
  readonly thickness: number;
  readonly height: number;
  readonly depth: number;
  readonly blockFace: THREE.Vector3; // centre of the right-hand page, book-local
}

interface Held {
  readonly book: LibraryBook;
  readonly group: THREE.Group;
  readonly parts: Prepared;
  readonly home: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  readonly p: Progress;
  tl: Timeline;
  phase: Phase;
  /** Camera-to-book: the camera pose this flight starts from. */
  camFrom: { position: THREE.Vector3; target: THREE.Vector3 };
  /** Runs once, when it is back on the shelf. */
  after?: () => void;
}

export interface Pickup {
  select(book: LibraryBook | undefined): void;
  readonly motion: PickupMotion;
  readonly choices: Choices;
  /** The book the scrub and the read-backs follow: the latest picked. */
  current(): Held | undefined;
  setChoice<K extends keyof Choices>(key: K, value: Choices[K]): void;
  /** Rebuild the current timeline from the constants, keeping where it is. */
  retime(): void;
  pickIndex(index: number): void;
  putBack(): void;
}

const PAGE_PX = 460;

/** Invented. No real book's prose and no real person's notes. */
const THOUGHTS: readonly (readonly string[])[] = [
  [
    'I came to this expecting a manual and found an argument instead. The middle chapters wander, but the wandering is the point: every detour ends at the same small claim.',
    'Underlined twice: the line about attention being a budget, not a mood. I have been spending other people’s and calling it onboarding.',
    'Would I reread it? The first half, yes. The second half I would rather have as one page pinned above the desk.',
  ],
  [
    'Read this on a train that kept stopping, which suited it. Short chapters, each one a room you could leave.',
    'The narrator never explains the house, and by the end I did not want her to.',
  ],
  [
    'Slow for a hundred pages and then impossible to put down. I still cannot say what changed.',
    'Lent my copy out twice. It came back once.',
    'The appendix is the best part, which feels like a confession.',
  ],
];

export function installPickup(params: URLSearchParams): Pickup {
  const choices: Choices = { ...DEFAULT_CHOICES };
  for (const key of Object.keys(CHOICES) as (keyof Choices)[]) {
    const asked = params.get(key === 'mover' ? 'pickup' : key);
    if (asked !== null && (CHOICES[key] as readonly string[]).includes(asked))
      (choices as Record<string, string>)[key] = asked;
  }
  const motion: PickupMotion = { ...PICKUP_MOTION };

  let shelf: Proto371Shelf | undefined;
  let byId = new Map<string, THREE.Group>();
  let prepared = new WeakMap<THREE.Group, Prepared>();
  let active: Held[] = [];
  let queued: LibraryBook | undefined;
  let home: { position: THREE.Vector3; target: THREE.Vector3 } | undefined;
  let fogHome: { near: number; far: number; on: boolean } | undefined;

  // ---- the DOM layer ------------------------------------------------------
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '5',
  } satisfies Partial<CSSStyleDeclaration>);
  const css = new CSS3DRenderer();
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0' });
  overlay.append(css.domElement);

  // ---- the veil: the rest of the shelf, dimmed --------------------------------
  const veilMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veilMaterial);
  veil.layers.set(2);
  veil.frustumCulled = false;
  veil.renderOrder = 9999;

  // GSAP is stepped from the shelf's own frame, so the pose, the render and the
  // DOM page are all from one instant. Its own ticker would run a frame apart.
  gsap.ticker.remove(gsap.updateRoot);

  PROTO_371.mounted = (next) => {
    shelf = next;
    active = [];
    queued = undefined;
    home = undefined;
    fogHome = undefined;
    prepared = new WeakMap();
    byId = new Map();
    for (const { group } of next.placed) {
      const book = next.lookup.get(group.children[0] ?? group);
      if (book !== undefined) byId.set(book.id, group);
    }
    // The veil hangs in front of the camera, on a layer of its own.
    next.camera.add(veil);
    veil.position.set(0, 0, -0.2);
    next.scene.add(next.camera);
    // Lights are culled by layer like anything else; the held book's pass needs them.
    next.scene.traverse((o) => {
      if (o instanceof THREE.Light) o.layers.enableAll();
    });
    const host = next.canvas.parentElement ?? document.body;
    host.append(overlay);
    const sync = (): void => {
      const r = next.canvas.getBoundingClientRect();
      css.setSize(r.width, r.height);
      Object.assign(css.domElement.style, {
        left: `${String(r.left)}px`,
        top: `${String(r.top)}px`,
        width: `${String(r.width)}px`,
        height: `${String(r.height)}px`,
      });
    };
    new ResizeObserver(sync).observe(next.canvas);
    sync();
  };

  PROTO_371.render = (draw) => {
    gsap.updateRoot(performance.now() / 1000);
    const s = shelf;
    if (s === undefined) {
      draw();
      return;
    }
    poseAll(s);
    const rest = restAmount();
    if (choices.rest === 'dim' && rest > 0 && active.length > 0) {
      // Three passes: the shelf, the veil over it, then the held books on top —
      // depth kept, so a book still inside the shelf is still behind its upright.
      veilMaterial.opacity = motion.dim * rest;
      const { renderer, scene, camera } = s;
      for (const h of active) h.group.visible = false;
      draw();
      const auto = renderer.autoClear;
      // A colour background clears on every render() whatever autoClear says
      // (`WebGLBackground.js:58`), so the later passes run with none.
      const background = scene.background;
      scene.background = null;
      renderer.autoClear = false;
      camera.layers.set(2);
      renderer.render(scene, camera);
      for (const h of active) h.group.visible = true;
      camera.layers.set(1);
      renderer.render(scene, camera);
      camera.layers.set(0);
      renderer.autoClear = auto;
      scene.background = background;
    } else {
      draw();
    }
  };

  PROTO_371.after = () => {
    const s = shelf;
    if (s === undefined) return;
    for (const h of active) {
      const angle = h.p.o * motion.openDegrees;
      const fade = Math.min(1, Math.max(0, (angle - motion.textFadeFrom) / 40));
      h.parts.rightEl.style.opacity = String(fade);
      h.parts.leftEl.style.opacity = String(fade);
    }
    css.render(s.scene, s.camera);
  };

  // ---- pose ------------------------------------------------------------------

  const tmp = {
    q: new THREE.Quaternion(),
    m: new THREE.Matrix4(),
    v: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(),
    x: new THREE.Vector3(),
    z: new THREE.Vector3(),
  };

  /** Where the held book's origin goes and how it faces, for an opening `o`. */
  const heldPose = (
    s: Proto371Shelf,
    h: Held,
    o: number,
  ): {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    camera?: { position: THREE.Vector3; target: THREE.Vector3 };
  } => {
    const { camera } = s;
    const parts = h.parts;
    const narrow = camera.aspect < 0.9;
    const vFov = (camera.fov * Math.PI) / 180;
    // Closed: the cover. Open: the spread, or on a narrow screen the right page.
    const closedFocus = new THREE.Vector3(parts.thickness / 2, 0, 0);
    const openFocus = narrow
      ? parts.blockFace.clone()
      : new THREE.Vector3(parts.thickness / 2, 0, parts.depth / 2);
    const focus = closedFocus.lerp(openFocus, o);
    const width = THREE.MathUtils.lerp(parts.depth, narrow ? parts.depth : parts.depth * 2, o);
    const dist = Math.max(
      (parts.height * motion.margin) / 2 / Math.tan(vFov / 2),
      (width * motion.margin) / 2 / Math.tan(vFov / 2) / camera.aspect,
    );

    if (choices.mover === 'book') {
      // Square to the camera: cover (+X) towards it, head (+Y) up.
      camera.getWorldDirection(tmp.dir);
      tmp.x.copy(tmp.dir).negate();
      tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      tmp.z.crossVectors(tmp.x, tmp.up);
      tmp.m.makeBasis(tmp.x, tmp.up, tmp.z);
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(tmp.m);
      const at = camera.position.clone().addScaledVector(tmp.dir, dist);
      const position = at.sub(focus.applyQuaternion(quaternion));
      return { position, quaternion };
    }

    // Camera-to-book: held cover-on to the room, in front of its own slot.
    tmp.m.makeBasis(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-1, 0, 0),
    );
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(tmp.m);
    const anchor = h.home.position
      .clone()
      .add(new THREE.Vector3(0, motion.lift, motion.slideOut + motion.pullOut));
    const position = anchor.clone().sub(focus.clone().applyQuaternion(quaternion));
    const target = anchor.clone();
    return {
      position,
      quaternion,
      camera: { position: target.clone().add(new THREE.Vector3(0, 0, dist)), target },
    };
  };

  const poseAll = (s: Proto371Shelf): void => {
    let driver: Held | undefined;
    for (const h of active) {
      const { p, group, parts } = h;
      const held = heldPose(s, h, p.o);
      const slid = h.home.position
        .clone()
        .add(new THREE.Vector3(0, motion.lift * p.s, motion.slideOut * p.s));
      group.position.copy(slid.lerp(held.position, p.u));
      group.quaternion.copy(h.home.quaternion).slerp(held.quaternion, p.u);
      parts.pivot.rotation.y = -THREE.MathUtils.degToRad(motion.openDegrees) * p.o;
      if (held.camera !== undefined) driver = h;
    }
    // Camera-to-book: the latest book in flight drives the camera.
    const last = active.at(-1);
    if (
      choices.mover === 'camera' &&
      last !== undefined &&
      driver !== undefined &&
      home !== undefined
    ) {
      const end = heldPose(s, last, last.p.o).camera;
      if (end !== undefined) {
        s.camera.position.copy(last.camFrom.position).lerp(end.position, last.p.u);
        s.controls.target.copy(last.camFrom.target).lerp(end.target, last.p.u);
        s.camera.lookAt(s.controls.target);
      }
    }
    // The rest of the shelf, faded into the background by the fog.
    if (choices.rest === 'fade' && fogHome !== undefined) {
      // Fog starts just behind the held book, so the book itself stays clear.
      const r = restAmount();
      const book = active.at(-1)?.group.position ?? s.controls.target;
      const near = s.camera.position.distanceTo(book) + 0.08;
      const far = near + 0.4 + 4 * (1 - motion.dim);
      s.fog.near = THREE.MathUtils.lerp(fogHome.near, near, r);
      s.fog.far = THREE.MathUtils.lerp(fogHome.far, far, r);
    }
    if (choices.shadow === 'live' && active.some((h) => h.phase !== 'held'))
      s.renderer.shadowMap.needsUpdate = true;
  };

  /** How far into "a book is held" the shelf is: the most-lifted book's turn. */
  const restAmount = (): number => Math.max(0, ...active.map((h) => h.p.u));

  // ---- preparing a book ---------------------------------------------------------

  const prepare = (
    s: Proto371Shelf,
    group: THREE.Group,
    book: LibraryBook,
    index: number,
  ): Prepared => {
    const known = prepared.get(group);
    if (known !== undefined) return known;

    // Measure in the book's own frame.
    const saved = { p: group.position.clone(), q: group.quaternion.clone() };
    group.position.set(0, 0, 0);
    group.quaternion.identity();
    group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    group.position.copy(saved.p);
    group.quaternion.copy(saved.q);
    group.updateMatrixWorld(true);
    const thickness = size.x;
    const height = size.y;
    const depth = size.z;

    const meshes = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    const block = meshes.find(
      (m) =>
        m.geometry instanceof THREE.BoxGeometry &&
        m.material instanceof THREE.MeshStandardMaterial &&
        m.material.roughness >= 0.88,
    );
    if (block === undefined) throw new Error('prototype #371: no page block');
    const board = (thickness - block.scale.x) / 2;

    // The hinge: everything on the cover side swings about the joint at the spine.
    const pivot = new THREE.Group();
    pivot.position.set(thickness / 2, 0, depth / 2);
    group.add(pivot);
    for (const m of meshes) {
      if (m === block || m.position.x <= thickness * 0.2) continue;
      pivot.attach(m);
    }
    const painted = [...meshes, ...pivot.children].filter(
      (m): m is THREE.Mesh =>
        m instanceof THREE.Mesh && m.material instanceof THREE.MeshBasicMaterial,
    );

    // New lit parts compile with the shadow fetch unless told not to — and a
    // book that reads the map is the one configuration the Pixel cannot hold.
    const paper = withoutShadowFetch(
      new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.95 }),
    );
    const endpaper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paper);
    endpaper.scale.set(depth * 0.97, height * 0.97, 1);
    endpaper.rotation.y = -Math.PI / 2;
    endpaper.position.set(-board - 0.0008, 0, -depth / 2);
    pivot.add(endpaper);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paper);
    sheet.scale.set(block.scale.z, block.scale.y, 1);
    sheet.rotation.y = Math.PI / 2;
    sheet.position.set(
      block.position.x + block.scale.x / 2 + 0.0003,
      block.position.y,
      block.position.z,
    );
    group.add(sheet);
    for (const m of [endpaper, sheet]) {
      m.receiveShadow = false;
      m.castShadow = false;
      s.lookup.set(m, book);
    }
    for (const m of pivot.children) s.lookup.set(m, book);

    const pageW = block.scale.z;
    const pageH = block.scale.y;
    const pagePxH = (PAGE_PX * pageH) / pageW;
    const thoughts = THOUGHTS[index % 4];
    const rightEl = makePage(
      thoughts === undefined ? cardPage(book) : thoughtsPage(thoughts),
      PAGE_PX,
      pagePxH,
    );
    const leftEl = makePage(titlePage(book), PAGE_PX, pagePxH);
    const right = new CSS3DObject(rightEl);
    right.scale.setScalar(pageW / PAGE_PX);
    right.rotation.y = Math.PI / 2;
    right.position.set(
      block.position.x + block.scale.x / 2 + 0.0006,
      block.position.y,
      block.position.z,
    );
    group.add(right);
    const left = new CSS3DObject(leftEl);
    left.scale.setScalar(pageW / PAGE_PX);
    left.rotation.y = -Math.PI / 2;
    left.position.set(-board - 0.0016, 0, -depth / 2);
    pivot.add(left);
    right.visible = false;
    left.visible = false;

    const result: Prepared = {
      pivot,
      right,
      left,
      rightEl,
      leftEl,
      painted,
      block,
      thickness,
      height,
      depth,
      blockFace: new THREE.Vector3(
        block.position.x + block.scale.x / 2,
        block.position.y,
        block.position.z,
      ),
    };
    prepared.set(group, result);
    return result;
  };

  // ---- the timeline -------------------------------------------------------------

  const reduced = (): boolean =>
    choices.motion === 'reduce' ||
    (choices.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const timeline = (p: Progress): Timeline => {
    const tl = gsap.timeline({ paused: true }) as unknown as Timeline;
    const turnAt = Math.max(0, motion.slide - Math.min(motion.overlapSlideTurn, motion.slide));
    const openAt = Math.max(
      0,
      turnAt + motion.turn - Math.min(motion.overlapTurnOpen, motion.turn),
    );
    tl.to(p, { s: 1, duration: motion.slide, ease: bezier(motion.easeSlide) }, 0);
    tl.to(p, { u: 1, duration: motion.turn, ease: bezier(motion.easeTurn) }, turnAt);
    tl.to(p, { o: 1, duration: motion.open, ease: bezier(motion.easeOpen) }, openAt);
    return tl;
  };

  const wire = (h: Held): void => {
    h.tl.eventCallback('onComplete', () => {
      h.phase = 'held';
      shadowAtRest();
    });
    h.tl.eventCallback('onReverseComplete', () => {
      settle(h);
    });
  };

  // ---- pick and put back ----------------------------------------------------------

  const pick = (book: LibraryBook): void => {
    const s = shelf;
    if (s === undefined) return;
    const group = byId.get(book.id);
    if (group === undefined) return;
    const index = s.placed.findIndex((b) => b.group === group);
    const parts = prepare(s, group, book, index);

    if (active.length === 0) {
      home = { position: s.camera.position.clone(), target: s.controls.target.clone() };
      fogHome = { near: s.fog.near, far: s.fog.far, on: s.scene.fog !== null };
      if (choices.rest === 'fade') s.scene.fog = s.fog;
    }
    PROTO_371.holdCamera = true;
    s.controls.enabled = false;

    const p: Progress = { s: 0, u: 0, o: 0 };
    const held: Held = {
      book,
      group,
      parts,
      home: { position: group.position.clone(), quaternion: group.quaternion.clone() },
      p,
      tl: timeline(p),
      phase: 'lifting',
      camFrom: {
        position: s.camera.position.clone(),
        target: s.controls.target.clone(),
      },
    };
    wire(held);
    for (const m of parts.painted) m.visible = false;
    parts.right.visible = true;
    parts.left.visible = true;
    group.traverse((o) => o.layers.enable(1));
    if (choices.shadow !== 'frozen') {
      parts.block.castShadow = false;
      s.renderer.shadowMap.needsUpdate = true;
    }
    active.push(held);

    if (history.state === null || (history.state as { pickup?: string }).pickup === undefined)
      history.pushState({ pickup: book.id }, '');
    else history.replaceState({ pickup: book.id }, '');

    if (reduced()) {
      held.tl.progress(1);
      held.phase = 'held';
    } else held.tl.play();
  };

  const putBack = (h: Held, then?: () => void): void => {
    if (h.phase === 'returning') return;
    h.phase = 'returning';
    h.after = then;
    if (choices.mover === 'camera' && home !== undefined && h === active.at(-1)) {
      // Back to where the shelf was looked at from, not to a mid-flight pose.
      h.camFrom = { position: home.position.clone(), target: home.target.clone() };
    }
    if (reduced()) {
      h.tl.progress(0);
      settle(h);
      return;
    }
    h.tl.timeScale(motion.returnSpeed).reverse();
  };

  const settle = (h: Held): void => {
    const s = shelf;
    if (s === undefined) return;
    h.tl.kill();
    h.group.position.copy(h.home.position);
    h.group.quaternion.copy(h.home.quaternion);
    h.parts.pivot.rotation.y = 0;
    h.parts.right.visible = false;
    h.parts.left.visible = false;
    for (const m of h.parts.painted) m.visible = true;
    h.group.traverse((o) => o.layers.disable(1));
    h.parts.block.castShadow = true;
    if (choices.shadow !== 'frozen') s.renderer.shadowMap.needsUpdate = true;
    active = active.filter((a) => a !== h);
    if (active.length === 0) {
      if (home !== undefined) {
        s.camera.position.copy(home.position);
        s.controls.target.copy(home.target);
        s.camera.lookAt(home.target);
      }
      if (fogHome !== undefined) {
        s.fog.near = fogHome.near;
        s.fog.far = fogHome.far;
        if (!fogHome.on) s.scene.fog = null;
      }
      veilMaterial.opacity = 0;
      PROTO_371.holdCamera = false;
      s.controls.enabled = true;
      home = undefined;
      fogHome = undefined;
    }
    const then = h.after;
    h.after = undefined;
    then?.();
    if (active.length === 0 && queued !== undefined) {
      const next = queued;
      queued = undefined;
      pick(next);
    }
  };

  const shadowAtRest = (): void => {
    // Nothing: the map was redrawn when the book left. A hook for `live`.
  };

  /** The book you are holding — lifting or held, not going back. */
  const holding = (): Held | undefined => active.findLast((h) => h.phase !== 'returning');

  /** Put back, through history when the pickup pushed an entry. */
  const requestPutBack = (): void => {
    if (holding() === undefined) return;
    if ((history.state as { pickup?: string } | null)?.pickup !== undefined) history.back();
    else for (const h of active) putBack(h);
  };

  addEventListener('popstate', () => {
    for (const h of active) putBack(h);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') requestPutBack();
  });

  const select = (book: LibraryBook | undefined): void => {
    if (book === undefined) {
      requestPutBack();
      return;
    }
    const same = active.find((h) => h.book.id === book.id);
    if (same !== undefined) {
      if (same.phase === 'returning') {
        // Caught on the way back: play it forward again.
        same.phase = 'lifting';
        same.after = undefined;
        same.tl.timeScale(1).play();
        history.pushState({ pickup: book.id }, '');
      }
      return;
    }
    const current = holding();
    if (current === undefined) {
      if (active.length > 0 && choices.returning === 'wait') queued = book;
      else pick(book);
      return;
    }
    if (choices.interrupt === 'ignore') return;
    if (choices.interrupt === 'swap') {
      putBack(current);
      pick(book);
      return;
    }
    // Put back, then pick up.
    queued = book;
    putBack(current);
  };

  const api: Pickup = {
    select,
    motion,
    choices,
    current: () => active.at(-1),
    setChoice(key, value) {
      choices[key] = value;
    },
    retime() {
      for (const h of active) {
        const at = h.tl.progress();
        const reversed = h.tl.reversed();
        const paused = h.tl.paused();
        h.tl.kill();
        h.tl = timeline(h.p);
        wire(h);
        h.tl.progress(at);
        if (reversed) h.tl.timeScale(motion.returnSpeed).reverse();
        else if (!paused && at < 1) h.tl.play();
      }
    },
    pickIndex(index) {
      const group = shelf?.placed[index]?.group;
      const book = group === undefined ? undefined : shelf?.lookup.get(group.children[0] ?? group);
      if (book !== undefined) select(book);
    },
    putBack: requestPutBack,
  };

  (window as unknown as { __pickup: unknown }).__pickup = {
    ...api,
    get active() {
      return active.map((h) => ({ id: h.book.id, phase: h.phase, progress: h.tl.progress() }));
    },
  };

  if (params.has('autoplay')) autoplay(api);
  return api;
}

/** For the phone run: pick a book, hold, put it back, next book — forever. */
function autoplay(api: Pickup): void {
  let i = Number(new URLSearchParams(location.search).get('autoplay')) || 3;
  const step = (): void => {
    api.pickIndex(i);
    setTimeout(() => {
      api.putBack();
      i = (i + 7) % 40;
      setTimeout(step, 2500);
    }, 3500);
  };
  setTimeout(step, 2000);
}

// ---- eases ------------------------------------------------------------------------

/** CSS `cubic-bezier()` as a GSAP ease function, so core needs no CustomEase. */
export function bezier([x1, y1, x2, y2]: Bezier): (t: number) => number {
  const a = (p1: number, p2: number): number => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number): number => 3 * p2 - 6 * p1;
  const c = (p1: number): number => 3 * p1;
  const at = (t: number, p1: number, p2: number): number =>
    ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number): number =>
    3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const d = at(t, x1, x2) - x;
      const s = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6 || Math.abs(s) < 1e-6) break;
      t -= d / s;
    }
    if (t < 0 || t > 1 || Math.abs(at(t, x1, x2) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 30; i += 1) {
        const v = at(t, x1, x2);
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return at(t, y1, y2);
  };
}

// ---- the pages (from #369) ------------------------------------------------------------

function makePage(children: HTMLElement[], w: number, h: number): HTMLElement {
  const page = document.createElement('div');
  Object.assign(page.style, {
    width: `${String(w)}px`,
    height: `${String(h)}px`,
    boxSizing: 'border-box',
    padding: '44px 40px',
    color: '#2b2520',
    font: '17px/1.55 Georgia, "Iowan Old Style", "Palatino Linotype", serif',
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    opacity: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  page.append(...children);
  return page;
}

function el(tag: string, text: string, style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  Object.assign(node.style, style);
  return node;
}

const LABEL: Partial<CSSStyleDeclaration> = {
  font: '600 12px/1 ui-sans-serif, system-ui, sans-serif',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#8a7d6c',
  marginBottom: '22px',
};

function thoughtsPage(paragraphs: readonly string[]): HTMLElement[] {
  return [
    el('div', 'Thoughts', LABEL),
    ...paragraphs.map((p) => el('p', p, { margin: '0 0 14px', textIndent: '1.4em' })),
  ];
}

function titlePage(book: LibraryBook): HTMLElement[] {
  return [
    el('div', '', { height: '30%' }),
    el('div', book.title, { font: '600 26px/1.2 Georgia, serif', textAlign: 'center' }),
    el('div', book.author ?? '', {
      font: 'italic 17px/1.4 Georgia, serif',
      textAlign: 'center',
      marginTop: '14px',
      color: '#5d5347',
    }),
  ];
}

/** A book with no Thoughts: the card's lines, laid out as a page (#369's C). */
function cardPage(book: LibraryBook): HTMLElement[] {
  const m = cardModel(book);
  const small = {
    font: '14px/1.5 ui-sans-serif, system-ui, sans-serif',
    color: '#5d5347',
    margin: '0 0 10px',
  };
  const nodes: HTMLElement[] = [
    el('div', 'About this copy', LABEL),
    el('p', m.reading, { margin: '0 0 18px', fontStyle: 'italic' }),
  ];
  if (m.tags !== undefined) nodes.push(el('p', m.tags, small));
  if (m.object !== undefined) nodes.push(el('p', m.object, small));
  if (m.subjects !== undefined) nodes.push(el('p', m.subjects, small));
  nodes.push(
    el('p', 'No Thoughts written for this one.', {
      ...small,
      marginTop: '40px',
      fontStyle: 'italic',
      color: '#a2968a',
    }),
  );
  return nodes;
}
