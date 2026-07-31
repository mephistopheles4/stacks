import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LibraryBook } from '@stacks/core';
import { estimateRowWidth, toRows, type ShelfBook, type ShelfRow } from './books.ts';

/**
 * The shelf.
 *
 * Books stand spine-out, the way books actually sit on a shelf — which is why
 * `spine_color` carries so much of the look. Covers face along the row and are
 * only really visible on the books that sit face-out (the ones you are
 * currently reading).
 *
 * Vanilla Three.js, no react-three-fiber (decided in CLAUDE.md).
 */

const SHELF = {
  width: 7,
  rowHeight: 1.25,
  depth: 0.72,
  plankThickness: 0.08,
  sideThickness: 0.1,
  /** Gap between neighbouring books. */
  bookGap: 0.012,
  /** Books sit slightly forward of the backboard, as they do in life. */
  bookDepth: 0.5,
} as const;

const COLOURS = {
  background: 0x1a1613,
  wood: 0x6b4f3a,
  woodDark: 0x4a3527,
  key: 0xffe9cc,
  fill: 0x5577aa,
} as const;

export interface ShelfHandle {
  dispose(): void;
  /** Books currently on the shelf, in draw order. Used by the smoke gate. */
  readonly bookCount: number;
}

export interface MountOptions {
  /** Called when a book is clicked, or with `undefined` when one is dismissed. */
  readonly onSelect?: (book: LibraryBook | undefined) => void;
}

export function mountShelf(
  canvas: HTMLCanvasElement,
  books: readonly LibraryBook[] = [],
  options: MountOptions = {},
): ShelfHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOURS.background);
  scene.fog = new THREE.Fog(COLOURS.background, 14, 30);

  const rows = toRows(books);
  const rowCount = Math.max(rows.length, 1);
  const unitHeight = rowCount * SHELF.rowHeight;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, unitHeight * 0.55, Math.max(8, unitHeight * 1.4));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.5;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, unitHeight / 2, 0);

  scene.add(buildShelf(rowCount));
  addLighting(scene, unitHeight);

  const textures = new TextureCache(renderer);
  const lookup: BookLookup = new Map();
  const bookMeshes = placeBooks(scene, rows, textures, lookup);

  const picker = new Picker(canvas, camera, bookMeshes, lookup, options.onSelect);

  let frame = 0;
  const renderLoop = (): void => {
    frame = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
  };

  const resize = (): void => {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  renderLoop();

  return {
    bookCount: bookMeshes.length,
    dispose(): void {
      cancelAnimationFrame(frame);
      observer.disconnect();
      picker.dispose();
      controls.dispose();
      textures.dispose();
      renderer.dispose();
    },
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Which book a mesh is.
 *
 * A side table rather than Three's `userData`, which is typed `Record<string,
 * any>` and would quietly swallow a wrong key.
 */
export type BookLookup = Map<THREE.Object3D, LibraryBook>;

function placeBooks(
  scene: THREE.Scene,
  rows: readonly ShelfRow[],
  textures: TextureCache,
  lookup: BookLookup,
): THREE.Mesh[] {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const meshes: THREE.Mesh[] = [];

  rows.forEach((row, rowIndex) => {
    // Rows are drawn top-down: the newest year sits on the top shelf.
    const shelfY = (rows.length - 1 - rowIndex) * SHELF.rowHeight + SHELF.plankThickness / 2;

    const totalWidth = estimateRowWidth(row.books, SHELF.bookGap);
    // Books lean against the left upright and run right, as they fill up.
    let cursor = -SHELF.width / 2 + 0.06;
    const scale = totalWidth > SHELF.width ? SHELF.width / (totalWidth + 0.12) : 1;

    for (const entry of row.books) {
      const mesh = buildBook(geometry, entry, textures);
      const thickness = entry.thickness * scale;

      if (entry.faceOut) {
        // Turn the book to show its cover, and give it room to breathe.
        cursor += SHELF.bookDepth * 0.5;
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(cursor, shelfY + entry.height / 2, 0.02);
        cursor += SHELF.bookDepth * 0.5 + SHELF.bookGap * 3;
      } else {
        mesh.position.set(
          cursor + thickness / 2,
          shelfY + entry.height / 2,
          (SHELF.depth - SHELF.bookDepth) / 2 - 0.02,
        );
        cursor += thickness + SHELF.bookGap;
      }

      mesh.scale.set(thickness, entry.height, SHELF.bookDepth);
      if (entry.faceOut) mesh.scale.set(entry.thickness, entry.height, SHELF.bookDepth);

      scene.add(mesh);
      meshes.push(mesh);
      lookup.set(mesh, entry.book);
    }
  });

  return meshes;
}

/**
 * Box faces are ordered +X, -X, +Y, -Y, +Z, -Z.
 *
 * Spine is +Z (facing the viewer when shelved); the cover goes on +X, which is
 * what you see once a book is turned face-out.
 */
function buildBook(
  geometry: THREE.BoxGeometry,
  entry: ShelfBook,
  textures: TextureCache,
): THREE.Mesh {
  const spine = new THREE.MeshStandardMaterial({
    color: new THREE.Color(entry.colour),
    roughness: 0.62,
  });
  // Pages: slightly lighter than the boards, never pure white.
  const pages = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.95 });
  const boards = new THREE.MeshStandardMaterial({
    color: new THREE.Color(entry.colour).multiplyScalar(0.82),
    roughness: 0.7,
  });

  const cover = new THREE.MeshStandardMaterial({
    color: new THREE.Color(entry.colour),
    roughness: 0.55,
  });
  if (entry.book.cover !== undefined) {
    textures.load(entry.book.cover).then((texture) => {
      if (texture !== undefined) {
        cover.map = texture;
        cover.color.set(0xffffff);
        cover.needsUpdate = true;
      }
    });
  }

  const mesh = new THREE.Mesh(geometry, [
    cover, // +X  cover
    boards, // -X  back board
    boards, // +Y  top
    boards, // -Y  bottom
    spine, // +Z  spine, facing the room
    pages, // -Z  fore-edge
  ]);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildShelf(rowCount: number): THREE.Group {
  const group = new THREE.Group();

  const wood = new THREE.MeshStandardMaterial({ color: COLOURS.wood, roughness: 0.82 });
  const backing = new THREE.MeshStandardMaterial({ color: COLOURS.woodDark, roughness: 0.95 });

  const unitHeight = rowCount * SHELF.rowHeight;
  const outerWidth = SHELF.width + SHELF.sideThickness * 2;

  const back = new THREE.Mesh(new THREE.BoxGeometry(outerWidth, unitHeight, 0.05), backing);
  back.position.set(0, unitHeight / 2, -SHELF.depth / 2);
  back.receiveShadow = true;
  group.add(back);

  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(
      new THREE.BoxGeometry(SHELF.sideThickness, unitHeight, SHELF.depth),
      wood,
    );
    upright.position.set((side * (SHELF.width + SHELF.sideThickness)) / 2, unitHeight / 2, 0);
    upright.castShadow = true;
    upright.receiveShadow = true;
    group.add(upright);
  }

  for (let row = 0; row <= rowCount; row += 1) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(outerWidth, SHELF.plankThickness, SHELF.depth),
      wood,
    );
    plank.position.set(0, row * SHELF.rowHeight, 0);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  return group;
}

function addLighting(scene: THREE.Scene, unitHeight: number): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));

  const key = new THREE.DirectionalLight(COLOURS.key, 2.0);
  key.position.set(4, unitHeight + 4, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.far = 40;
  scene.add(key);

  const fill = new THREE.DirectionalLight(COLOURS.fill, 0.5);
  fill.position.set(-6, unitHeight * 0.6, 5);
  scene.add(fill);
}

/* -------------------------------------------------------------------------- */

/**
 * Covers, loaded once each and shared.
 *
 * The fixture library reuses a handful of images across fifty books, and a real
 * library will not — so this caches by path rather than assuming uniqueness,
 * and a failed load degrades to the flat spine colour rather than an error.
 */
class TextureCache {
  readonly #loader = new THREE.TextureLoader();
  readonly #cache = new Map<string, Promise<THREE.Texture | undefined>>();
  readonly #anisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.#anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  load(path: string): Promise<THREE.Texture | undefined> {
    const existing = this.#cache.get(path);
    if (existing !== undefined) return existing;

    const url = path.startsWith('http') || path.startsWith('/') ? path : `/${path}`;
    const promise = new Promise<THREE.Texture | undefined>((resolve) => {
      this.#loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = this.#anisotropy;
          resolve(texture);
        },
        undefined,
        () => resolve(undefined),
      );
    });

    this.#cache.set(path, promise);
    return promise;
  }

  dispose(): void {
    for (const promise of this.#cache.values()) {
      void promise.then((texture) => texture?.dispose());
    }
    this.#cache.clear();
  }
}

/**
 * Click-to-inspect.
 *
 * The card itself is plain DOM positioned from the hit (CLAUDE.md) — this only
 * decides *which* book was hit and hands the record over.
 */
class Picker {
  readonly #raycaster = new THREE.Raycaster();
  readonly #pointer = new THREE.Vector2();
  readonly #canvas: HTMLCanvasElement;
  readonly #camera: THREE.Camera;
  readonly #meshes: THREE.Object3D[];
  readonly #lookup: BookLookup;
  readonly #onSelect: ((book: LibraryBook | undefined) => void) | undefined;
  #downAt: { x: number; y: number } | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
    meshes: readonly THREE.Mesh[],
    lookup: BookLookup,
    onSelect: ((book: LibraryBook | undefined) => void) | undefined,
  ) {
    this.#canvas = canvas;
    this.#camera = camera;
    this.#meshes = [...meshes];
    this.#lookup = lookup;
    this.#onSelect = onSelect;
    canvas.addEventListener('pointerdown', this.#handleDown);
    canvas.addEventListener('pointerup', this.#handleUp);
  }

  #handleDown = (event: PointerEvent): void => {
    this.#downAt = { x: event.clientX, y: event.clientY };
  };

  /** Only a click that didn't drag counts — orbiting must not select a book. */
  #handleUp = (event: PointerEvent): void => {
    const down = this.#downAt;
    this.#downAt = undefined;
    if (down === undefined) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;

    const rect = this.#canvas.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);

    const hit = this.#raycaster.intersectObjects(this.#meshes, false)[0];
    this.#onSelect?.(hit === undefined ? undefined : this.#lookup.get(hit.object));
  };

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#handleDown);
    this.#canvas.removeEventListener('pointerup', this.#handleUp);
  }
}
