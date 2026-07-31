import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BookRecord } from '@stacks/core';

/**
 * The empty shelf.
 *
 * Phase 0 renders furniture only — no books. Phase 2 adds the books as an
 * InstancedMesh driven by library.json, so everything here is deliberately
 * arranged around leaving room for that: `SHELF` is the single source of the
 * geometry the books will have to sit on.
 *
 * Vanilla Three.js, no react-three-fiber (decided in CLAUDE.md).
 */

const SHELF = {
  /** Inner width available for books, in world units. */
  width: 7,
  /** Vertical gap between one plank's top face and the next. */
  rowHeight: 1.25,
  rows: 4,
  depth: 0.72,
  plankThickness: 0.08,
  sideThickness: 0.1,
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
}

export function mountShelf(
  canvas: HTMLCanvasElement,
  books: readonly BookRecord[] = [],
): ShelfHandle {
  if (books.length > 0) {
    throw new Error('rendering books lands in phase 2');
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOURS.background);
  scene.fog = new THREE.Fog(COLOURS.background, 12, 26);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, SHELF.rowHeight * 1.6, 9.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 18;
  // Keep the camera above the floor — orbiting under the shelf looks broken.
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, (SHELF.rows * SHELF.rowHeight) / 2, 0);

  scene.add(buildShelf());
  addLighting(scene);

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
    dispose(): void {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

/** Back panel, two uprights, and one plank per row. */
function buildShelf(): THREE.Group {
  const group = new THREE.Group();

  const wood = new THREE.MeshStandardMaterial({ color: COLOURS.wood, roughness: 0.82 });
  const backing = new THREE.MeshStandardMaterial({ color: COLOURS.woodDark, roughness: 0.95 });

  const unitHeight = SHELF.rows * SHELF.rowHeight;
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

  // One plank per row, plus a closing plank on top.
  for (let row = 0; row <= SHELF.rows; row += 1) {
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

function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const key = new THREE.DirectionalLight(COLOURS.key, 2.1);
  key.position.set(4, 8, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  // Cool bounce from the opposite side so the shelf reads as a place, not a chart.
  const fill = new THREE.DirectionalLight(COLOURS.fill, 0.55);
  fill.position.set(-6, 3, 4);
  scene.add(fill);
}
