/**
 * PROTOTYPE — #369, throwaway. Lives on `prototype/369-held-book-dom-layer` and
 * never merges.
 *
 * Question: does the picked-up book read well as a 3D book that opens its cover,
 * with the Thoughts text in a DOM layer over the open page?
 *
 * Four variants on the ordinary page, switched by `?held=<A|B|C|D>` and a
 * floating bar (arrows or ← →). `?book=N` picks the book, `?t=0..1` freezes the
 * pickup at one moment, `?open=deg` sets how far the cover opens.
 *
 *   A  Page-mapped   — the Thoughts are a DOM element mapped onto the 3D page by
 *                      three's CSS3DRenderer, perspective and all.
 *   B  Pinned sheet  — the same text on a flat, screen-aligned sheet placed over
 *                      the page's projected bounds each frame. No perspective.
 *   C  No Thoughts   — A's mechanism, with the card's own lines on the page.
 *   D  Cover, held   — the closed book, cover filling the viewport, measured.
 *
 * Built through `toRows` → `placeShelf` → `buildBook`, the shelf's own path, as
 * `?solo` is. The held book is the same `THREE.Group` the shelf builds — no
 * instance to hide, no second mesh.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { LibraryBook } from '@stacks/core';
import { toRows } from './books.ts';
import { cardModel } from './card.ts';
import { placeShelf } from './placement.ts';
import { addLighting, buildBook, COVERS } from './scene.ts';
import type { ShelfSettings } from './shelf-settings.ts';

const VARIANTS = ['A', 'B', 'C', 'D'] as const;
type Variant = (typeof VARIANTS)[number];
const NAMES: Record<Variant, string> = {
  A: 'Page-mapped (CSS3D)',
  B: 'Pinned sheet (screen-aligned)',
  C: 'No Thoughts — card on the page',
  D: 'Cover at held size',
};

/** Invented. No real book's prose, and no real person's notes. */
const THOUGHTS = [
  'I came to this expecting a manual and found an argument instead. The middle chapters wander, but the wandering is the point: every detour ends at the same small claim, that people remember what they could do after, not what they were told.',
  'Underlined twice: the bit about the “cognitive leak” — every screen that asks for attention spends the same budget the reader needed for the actual task. I have been designing leaks for years and calling them onboarding.',
  'Would I reread it? The first half, yes. The second half I would rather have as a one-page checklist pinned above the desk. Which is, I suppose, exactly what it told me to make.',
];

const PAGE_PX = 460; // the page element's own width, before CSS3D scales it

export function mountHeldPrototype(
  canvas: HTMLCanvasElement,
  books: readonly LibraryBook[],
  params: URLSearchParams,
  settings: ShelfSettings,
): void {
  const variant: Variant = (VARIANTS as readonly string[]).includes(params.get('held') ?? '')
    ? (params.get('held') as Variant)
    : 'A';
  const index = Number(params.get('book') ?? '34');
  const chosen = books[index] ?? books[0];
  if (chosen === undefined) return;
  const frozenT = params.has('t') ? Number(params.get('t')) : undefined;
  const openDeg = Number(params.get('open') ?? '165');

  // Face-out, so the book is built at its cover's own aspect — a shelved book is
  // built at shelf depth and its cover plane would be stretched to fit.
  const rows = toRows([{ ...chosen, faceOut: true }], settings.books);
  const entry = rows[0]?.books[0];
  const placement = placeShelf(rows)[0]?.[0];
  if (entry === undefined || placement === undefined) return;
  const depth = placement.frontZ * 2;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.renderer.antialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.renderer.maxPixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(settings.scene.background);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;

  COVERS.useRenderer(renderer);
  const book = buildBook(entry, depth, COVERS, false, settings);
  addLighting(scene, entry.height, settings);

  // The page block: the only box whose material is paper-rough.
  const meshes = book.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
  const block = meshes.find(
    (m) =>
      m.geometry instanceof THREE.BoxGeometry &&
      (m.material as THREE.MeshStandardMaterial).roughness >= 0.88,
  );
  if (block === undefined) throw new Error('prototype: no page block');
  const boardMaterial = meshes.find(
    (m) => m.geometry instanceof THREE.BoxGeometry && m !== block,
  )?.material;
  const coverFace = meshes.find(
    (m) => m.geometry instanceof THREE.PlaneGeometry && Math.abs(m.rotation.y - Math.PI / 2) < 1e-6,
  );
  const thickness = entry.thickness;
  const board = (thickness - block.scale.x) / 2;

  // The hinge: front board, its head piece and the printed cover swing about the
  // joint at the spine edge of the +X face.
  const pivot = new THREE.Group();
  pivot.position.set(thickness / 2, 0, depth / 2);
  book.add(pivot);
  for (const m of meshes) {
    const front =
      m === coverFace || (m.material === boardMaterial && m.position.x > thickness * 0.2);
    if (!front) continue;
    pivot.attach(m);
  }

  // The inside of the cover gets an endpaper, so the left page reads as paper.
  const endpaper = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.95 }),
  );
  endpaper.scale.set(depth * 0.97, entry.height * 0.97, 1);
  endpaper.rotation.y = -Math.PI / 2;
  endpaper.position.set(-board - 0.0008, 0, -depth / 2);
  pivot.add(endpaper);

  // The block's +X face carries the fore-edge striation map (one material for
  // all six faces), which reads as page *edges* — so the open page gets a sheet.
  const sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), endpaper.material);
  sheetMesh.scale.set(block.scale.z, block.scale.y, 1);
  sheetMesh.rotation.y = Math.PI / 2;
  sheetMesh.position.set(block.scale.x / 2 + 0.0003, block.position.y, block.position.z);
  book.add(sheetMesh);

  const holder = new THREE.Group(); // the hand: position and turn of the held book
  holder.add(book);
  scene.add(holder);

  // ---- the DOM layer -------------------------------------------------------
  const host = canvas.parentElement ?? document.body;
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '5',
  } satisfies Partial<CSSStyleDeclaration>);
  host.append(overlay);

  const css = new CSS3DRenderer();
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0' });
  overlay.append(css.domElement);

  const pageWorldW = block.scale.z;
  const pageWorldH = block.scale.y;
  const pagePxH = (PAGE_PX * pageWorldH) / pageWorldW;

  const rightPage = makePage(variant === 'C' ? cardPage(chosen) : thoughtsPage(), PAGE_PX, pagePxH);
  const leftPage = makePage(titlePage(chosen), PAGE_PX, pagePxH);

  let rightObject: CSS3DObject | undefined;
  let sheet: HTMLElement | undefined;

  if (variant === 'A' || variant === 'C') {
    rightObject = new CSS3DObject(rightPage);
    rightObject.scale.setScalar(pageWorldW / PAGE_PX);
    rightObject.rotation.y = Math.PI / 2;
    rightObject.position.set(block.scale.x / 2 + 0.0006, block.position.y, block.position.z);
    book.add(rightObject);
    const leftObject = new CSS3DObject(leftPage);
    leftObject.scale.setScalar(pageWorldW / PAGE_PX);
    leftObject.rotation.y = -Math.PI / 2;
    leftObject.position.set(-board - 0.0016, 0, -depth / 2);
    pivot.add(leftObject);
  } else if (variant === 'B') {
    sheet = rightPage;
    Object.assign(sheet.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transformOrigin: '0 0',
    });
    overlay.append(sheet);
  }

  // ---- motion --------------------------------------------------------------
  const DURATION = 1800;
  let start = performance.now();
  const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

  const pose = (t: number): number => {
    // 0–0.45: out of the shelf and turning from spine-on to cover-on.
    // 0.40–1: the cover opens (not in D).
    const turn = ease(clamp01(t / 0.45));
    holder.position.set(-entry.height * 0.25 * (1 - turn), 0, -entry.height * 0.6 * (1 - turn));
    holder.rotation.set(-0.05 * turn, (Math.PI / 2) * (1 - turn), 0.035 * turn);
    const open = variant === 'D' ? 0 : ease(clamp01((t - 0.4) / 0.6));
    pivot.rotation.y = -((openDeg * Math.PI) / 180) * open;
    return open;
  };

  // ---- framing -------------------------------------------------------------
  const frame = (): void => {
    const aspect = camera.aspect;
    const vFov = (camera.fov * Math.PI) / 180;
    const narrow = aspect < 0.9;
    // D: the cover fills the frame. Otherwise the spread, or on a narrow screen
    // the right-hand page on its own.
    const w = variant === 'D' ? depth : narrow ? depth : depth * 2;
    const h = entry.height;
    const margin = variant === 'D' ? 1.04 : 1.12;
    const dist = Math.max(
      (h * margin) / 2 / Math.tan(vFov / 2),
      (w * margin) / 2 / Math.tan(vFov / 2) / aspect,
    );
    const cz = variant === 'D' || narrow ? block.position.z : depth / 2;
    controls.target.set(0, 0, cz);
    camera.position.set(dist, 0, cz);
    controls.update();
  };

  // ---- measurement ---------------------------------------------------------
  const hud = document.createElement('pre');
  Object.assign(hud.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    margin: '0',
    padding: '6px 8px',
    font: '11px/1.35 ui-monospace, monospace',
    background: 'rgba(0,0,0,0.72)',
    color: '#9ef',
    zIndex: '20',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    maxWidth: 'calc(100vw - 32px)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(hud);

  const corners = (): THREE.Vector2[] => {
    const x = block.scale.x / 2;
    const hy = pageWorldH / 2;
    const hz = pageWorldW / 2;
    const rect = canvas.getBoundingClientRect();
    return [
      [x, hy, block.position.z + hz],
      [x, hy, block.position.z - hz],
      [x, -hy, block.position.z - hz],
      [x, -hy, block.position.z + hz],
    ].map(([px, py, pz]) => {
      const v = book.localToWorld(new THREE.Vector3(px, py, pz)).project(camera);
      return new THREE.Vector2(
        rect.left + ((v.x + 1) / 2) * rect.width,
        rect.top + ((1 - v.y) / 2) * rect.height,
      );
    });
  };
  const bbox = (pts: THREE.Vector2[]): DOMRect => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return new DOMRect(
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
  };
  let maxErr = 0;
  let maxSkew = 0;
  let worst: unknown;

  const coverReport = (): string => {
    const mat = coverFace?.material as THREE.MeshStandardMaterial | undefined;
    const img = mat?.map?.image as { width?: number; height?: number } | undefined;
    if (coverFace === undefined || img?.width === undefined || img.height === undefined)
      return 'cover: not loaded';
    const box = new THREE.Box3().setFromObject(coverFace);
    const pts: THREE.Vector2[] = [];
    const rect = canvas.getBoundingClientRect();
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const v = new THREE.Vector3(x, y, z).project(camera);
          pts.push(new THREE.Vector2(((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height));
        }
    const b = bbox(pts);
    const dpr = window.devicePixelRatio;
    const drawnH = b.height * renderer.getPixelRatio();
    return (
      `cover source ${String(img.width)}×${String(img.height)} px\n` +
      `drawn ${b.width.toFixed(0)}×${b.height.toFixed(0)} CSS px, ` +
      `${drawnH.toFixed(0)} device px tall (renderer DPR ${renderer.getPixelRatio().toFixed(2)}, window DPR ${dpr.toFixed(2)})\n` +
      `upscale ${(drawnH / img.height).toFixed(2)}× here; ` +
      `on a DPR-3 phone ${((b.height * 3) / img.height).toFixed(2)}×`
    );
  };

  const report = (t: number, open: number): void => {
    const lines = [
      `#369 prototype · ${variant} ${NAMES[variant]}`,
      `book ${String(index)}: ${chosen.title.slice(0, 48)}`,
      `t ${t.toFixed(2)}  cover open ${(open * openDeg).toFixed(0)}°  viewport ${String(innerWidth)}×${String(innerHeight)}`,
    ];
    if (variant === 'A' || variant === 'C' || variant === 'B') {
      lines.push(
        `DOM vs page bbox, worst corner: ${maxErr.toFixed(2)} px (this run)`,
        variant === 'B'
          ? `perspective the flat sheet ignores, worst: ${maxSkew.toFixed(1)} px`
          : 'text follows the page in perspective',
      );
    }
    lines.push(coverReport());
    hud.textContent = lines.join('\n');
  };

  // ---- loop ----------------------------------------------------------------
  let rafId = 0;
  let frames = 0;
  const loop = (now: number): void => {
    rafId = requestAnimationFrame(loop);
    frames += 1;
    tick(frozenT ?? clamp01((now - start) / DURATION));
  };
  const tick = (t: number): void => {
    const open = pose(t);
    controls.update();
    renderer.render(scene, camera);

    // The DOM cannot be occluded by WebGL: text on the right page would show
    // through the closing cover, so it only appears once the cover is past 90°.
    const visible = open * openDeg > 95 ? String(clamp01((open * openDeg - 95) / 40)) : '0';
    rightPage.style.opacity = visible;
    leftPage.style.opacity = visible;

    const pts = corners();
    const want = bbox(pts);
    if (rightObject !== undefined) {
      css.render(scene, camera);
      // The first frames run before the CSS3D layer has laid out once.
      if (visible !== '0' && frames > 2) {
        const got = rightPage.getBoundingClientRect();
        const err = Math.max(
          Math.abs(got.left - want.left),
          Math.abs(got.top - want.top),
          Math.abs(got.right - want.right),
          Math.abs(got.bottom - want.bottom),
        );
        if (err > maxErr)
          worst = { t, err, got: got.toJSON() as unknown, want: want.toJSON() as unknown };
        maxErr = Math.max(maxErr, err);
      }
    } else if (sheet !== undefined) {
      // Same frame, after the render: placed from this frame's own camera.
      const scale = want.width / PAGE_PX;
      sheet.style.transform = `translate(${String(want.left)}px, ${String(want.top)}px) scale(${String(scale)})`;
      sheet.style.height = `${String(want.height / scale)}px`;
      if (visible !== '0') {
        const got = sheet.getBoundingClientRect();
        maxErr = Math.max(
          maxErr,
          Math.abs(got.left - want.left),
          Math.abs(got.top - want.top),
          Math.abs(got.right - want.right),
          Math.abs(got.bottom - want.bottom),
        );
        // How far the true (perspective) page corners sit from the flat sheet's.
        const flat = [
          new THREE.Vector2(want.left, want.top),
          new THREE.Vector2(want.right, want.top),
          new THREE.Vector2(want.right, want.bottom),
          new THREE.Vector2(want.left, want.bottom),
        ];
        maxSkew = Math.max(maxSkew, ...pts.map((p, i) => p.distanceTo(flat[i] ?? p)));
      }
    }
    report(t, open);
  };

  const resize = (): void => {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    css.setSize(clientWidth, clientHeight);
    const r = canvas.getBoundingClientRect();
    Object.assign(css.domElement.style, {
      left: `${String(r.left)}px`,
      top: `${String(r.top)}px`,
      width: `${String(clientWidth)}px`,
      height: `${String(clientHeight)}px`,
    });
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    frame();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  rafId = requestAnimationFrame(loop);

  switcher(variant);

  (window as unknown as { __held: unknown }).__held = {
    replay(): void {
      maxErr = 0;
      maxSkew = 0;
      start = performance.now();
    },
    get maxErr(): number {
      return maxErr;
    },
    get maxSkew(): number {
      return maxSkew;
    },
    get worst(): unknown {
      return worst;
    },
    stop(): void {
      cancelAnimationFrame(rafId);
    },
    /** A control: move the DOM page off its 3D page by `dz` world units. */
    nudge(dz: number): void {
      if (rightObject !== undefined) rightObject.position.z += dz;
    },
    /** A control: render the DOM layer one camera step late (the swim). */
    lag: false,
    /**
     * Step the whole pickup synchronously, `n` samples, with the camera nudged
     * off-axis by up to `wobble` degrees each step (a settling orbit). Layout is
     * forced by `getBoundingClientRect`, so this measures without rAF.
     */
    sweep(n = 120, wobble = 12): { maxErr: number; maxSkew: number } {
      cancelAnimationFrame(rafId);
      frames = 10;
      maxErr = 0;
      maxSkew = 0;
      const base = camera.position.clone();
      for (let i = 0; i <= n; i += 1) {
        const a = (Math.sin(i * 0.37) * wobble * Math.PI) / 180;
        const e = (Math.cos(i * 0.23) * wobble * 0.5 * Math.PI) / 180;
        const off = base.clone().sub(controls.target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        off.applyAxisAngle(new THREE.Vector3(0, 0, 1), e);
        const late = (window as unknown as { __held: { lag: boolean } }).__held.lag;
        if (late && rightObject !== undefined) {
          // Freeze the DOM at last step's camera: skip this step's css.render.
          const r = css.render.bind(css);
          css.render = () => undefined;
          camera.position.copy(controls.target).add(off);
          camera.lookAt(controls.target);
          camera.updateMatrixWorld();
          tick(i / n);
          css.render = r;
          r(scene, camera);
          continue;
        }
        camera.position.copy(controls.target).add(off);
        camera.lookAt(controls.target);
        camera.updateMatrixWorld();
        tick(i / n);
      }
      camera.position.copy(base);
      controls.update();
      tick(1);
      return { maxErr, maxSkew };
    },
  };
}

// ---- the pages -------------------------------------------------------------

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

function thoughtsPage(): HTMLElement[] {
  return [
    el('div', 'Thoughts', {
      font: '600 12px/1 ui-sans-serif, system-ui, sans-serif',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: '#8a7d6c',
      marginBottom: '22px',
    }),
    ...THOUGHTS.map((p) => el('p', p, { margin: '0 0 14px', textIndent: '1.4em' })),
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

/** A book with no Thoughts: the card's lines, laid out as a page. */
function cardPage(book: LibraryBook): HTMLElement[] {
  const m = cardModel(book);
  const small = {
    font: '14px/1.5 ui-sans-serif, system-ui, sans-serif',
    color: '#5d5347',
    margin: '0 0 10px',
  };
  const nodes: HTMLElement[] = [
    el('div', 'About this copy', {
      font: '600 12px/1 ui-sans-serif, system-ui, sans-serif',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: '#8a7d6c',
      marginBottom: '22px',
    }),
    el('p', m.reading, { margin: '0 0 18px', fontStyle: 'italic' }),
  ];
  if (m.tags !== undefined) nodes.push(el('p', m.tags, small));
  if (m.object !== undefined) nodes.push(el('p', m.object, small));
  if (m.subjects !== undefined) nodes.push(el('p', m.subjects, small));
  const links = document.createElement('p');
  Object.assign(links.style, { ...small, marginTop: '24px', pointerEvents: 'auto' });
  for (const link of m.links) {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.text ?? link.name;
    Object.assign(a.style, { marginRight: '14px', color: '#6b4f2a' });
    links.append(a);
  }
  nodes.push(links);
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

// ---- the switcher ----------------------------------------------------------

function switcher(current: Variant): void {
  const go = (step: number): void => {
    const i = VARIANTS.indexOf(current);
    const next = VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length] ?? 'A';
    const url = new URL(location.href);
    url.searchParams.set('held', next);
    location.replace(url);
  };
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '14px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#111',
    color: '#ff0',
    font: '13px/1 ui-monospace, monospace',
    boxShadow: '0 4px 18px rgba(0,0,0,.4)',
    zIndex: '30',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  const button = (label: string, step: number): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, {
      background: 'none',
      border: '0',
      color: 'inherit',
      font: 'inherit',
      cursor: 'pointer',
    });
    b.addEventListener('click', () => {
      go(step);
    });
    return b;
  };
  bar.append(button('◀', -1), el('span', `${current} · ${NAMES[current]}`), button('▶', 1));
  document.body.append(bar);
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });
}
