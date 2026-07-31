import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LibraryBook } from '@stacks/core';
import { toRows, type ShelfBook, type ShelfRow } from './books.ts';
import { makeSpineTexture, MIN_LEGIBLE_THICKNESS } from './spine-texture.ts';

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

/**
 * Proportions taken from a real bookcase rather than picked to look tidy.
 *
 * A hardback is roughly 3cm thick and 23cm tall, and a shelf about 90cm wide —
 * so width is ~4× book height and a shelf holds ~30 books. Matching that ratio
 * is what makes the thing read as furniture instead of as a chart.
 */
const SHELF = {
  width: 3.4,
  rowHeight: 1.12,
  depth: 0.72,
  plankThickness: 0.07,
  sideThickness: 0.09,
  /** Gap between neighbouring books. */
  bookGap: 0.008,
  /** Books sit slightly forward of the backboard, as they do in life. */
  bookDepth: 0.52,
  /** Breathing room at each end of a shelf. */
  padding: 0.06,
} as const;

/**
 * The case grows with the library, always keeping one empty shelf ahead.
 *
 * A fixed four-shelf unit means a small library sits in a mostly empty case and
 * the camera has to back off far enough to frame all that empty wood, which
 * leaves the spines too small to read. Sizing to content keeps the books large
 * and the shelf honest — there is always somewhere for the next book to go.
 */
const MIN_ROWS = 2;

function rowsForCase(usedRows: number): number {
  return Math.max(usedRows + 1, MIN_ROWS);
}

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
  /**
   * Where a given book currently sits on screen, in CSS pixels.
   *
   * Exists so the click-to-inspect test can aim at a real book instead of a
   * hardcoded coordinate that silently stops pointing at anything the moment
   * the layout changes.
   */
  projectBook(index: number): { x: number; y: number } | undefined;
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

  const rows = toRows(books, SHELF.width - SHELF.padding * 2);
  const rowCount = rowsForCase(rows.length);
  const unitHeight = rowCount * SHELF.rowHeight;

  const fov = 40;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.5;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, unitHeight * 0.48, 0);

  /**
   * Backs the camera off far enough for the whole case to fit — checked against
   * *both* axes and the real viewport aspect.
   *
   * A short wide case is width-constrained and a tall narrow one is
   * height-constrained, so fitting only the height clips the sides of a small
   * library. Runs once, on the first real layout, and then leaves the camera
   * alone so it never fights the user's orbiting.
   */
  const caseWidth = SHELF.width + SHELF.sideThickness * 2;
  let framed = false;

  const frameCamera = (aspect: number): void => {
    const half = Math.tan((fov / 2) * (Math.PI / 180));
    const forHeight = unitHeight / (2 * half);
    const forWidth = caseWidth / (2 * half * aspect);
    const distance = Math.max(forHeight, forWidth) * 1.35 + SHELF.depth;

    camera.position.set(caseWidth * 0.16, unitHeight * 0.52, distance);
    controls.maxDistance = distance * 2.4;
    controls.update();
  };

  frameCamera(16 / 9);

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

    if (!framed) {
      framed = true;
      frameCamera(camera.aspect);
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  renderLoop();

  return {
    bookCount: bookMeshes.length,

    projectBook(index: number): { x: number; y: number } | undefined {
      const mesh = bookMeshes[index];
      if (mesh === undefined) return undefined;

      // Aim at the front face of the spine, not the centre of the box — the
      // centre is buried inside the book and behind its neighbours.
      const point = mesh.localToWorld(new THREE.Vector3(0, 0, 0.5));
      point.project(camera);

      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - point.y) / 2) * rect.height,
      };
    },

    dispose(): void {
      cancelAnimationFrame(frame);
      observer.disconnect();
      picker.dispose();
      controls.dispose();
      textures.dispose();

      // Spine textures are generated per book rather than cached, so they are
      // freed by walking the scene rather than from the cover cache.
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
          material.dispose();
        }
      });

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

  const rowCount = rowsForCase(rows.length);

  rows.forEach((row, rowIndex) => {
    // Drawn top-down: the newest books sit on the top shelf.
    const shelfY = (rowCount - 1 - rowIndex) * SHELF.rowHeight + SHELF.plankThickness / 2;

    // Books stand against the left upright and run right, as a shelf fills.
    let cursor = -SHELF.width / 2 + SHELF.padding;

    for (const entry of row.books) {
      const mesh = buildBook(geometry, entry, textures);
      cursor += entry.gapBefore ?? 0;

      if (entry.faceOut) {
        // Turned to show its cover, leaning back against the books beside it.
        //
        // -90°, not +90°: the cover is the +X face, and rotating +90° about Y
        // maps +X to -Z — pointing away from the room. Face-out books were
        // showing the viewer their back boards.
        mesh.scale.set(entry.thickness, entry.height, SHELF.bookDepth);
        mesh.rotation.y = -Math.PI / 2;
        mesh.rotation.z = 0.06;
        mesh.position.set(
          cursor + SHELF.bookDepth * 0.5,
          shelfY + entry.height / 2,
          (SHELF.depth - SHELF.bookDepth) / 2 - 0.02,
        );
        cursor += SHELF.bookDepth + SHELF.bookGap * 2;
      } else {
        mesh.scale.set(entry.thickness, entry.height, SHELF.bookDepth);
        mesh.position.set(
          cursor + entry.thickness / 2,
          shelfY + entry.height / 2,
          (SHELF.depth - SHELF.bookDepth) / 2 - 0.02,
        );
        cursor += entry.thickness + SHELF.bookGap;
      }

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
  // A spine wide enough to read gets its title printed on it; a very thin one
  // stays a plain board, because type squeezed onto it would just be noise.
  const spineTexture =
    entry.thickness >= MIN_LEGIBLE_THICKNESS
      ? makeSpineTexture({
          title: entry.book.title,
          colour: entry.colour,
          ...(entry.book.author === undefined ? {} : { author: entry.book.author }),
        })
      : undefined;

  const spine = new THREE.MeshStandardMaterial({
    color: spineTexture === undefined ? new THREE.Color(entry.colour) : new THREE.Color(0xffffff),
    roughness: 0.62,
    ...(spineTexture === undefined ? {} : { map: spineTexture }),
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
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));

  const key = new THREE.DirectionalLight(COLOURS.key, 2.4);
  key.position.set(3.5, unitHeight + 3, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.far = 40;
  scene.add(key);

  const fill = new THREE.DirectionalLight(COLOURS.fill, 0.75);
  fill.position.set(-5, unitHeight * 0.6, 4.5);
  scene.add(fill);

  // A warm lamp close to the shelf, so spines nearest the viewer read clearly
  // and the case has a centre of light rather than flat exposure.
  const lamp = new THREE.PointLight(0xffd7a8, 14, 14, 2);
  lamp.position.set(1.6, unitHeight * 0.72, 2.4);
  scene.add(lamp);
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
