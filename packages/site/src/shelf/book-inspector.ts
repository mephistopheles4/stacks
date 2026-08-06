import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LibraryBook } from '@stacks/core';
import { toRows } from './books.ts';
import { placeShelf } from './placement.ts';
import { addLighting, buildBook, COVERS } from './scene.ts';
import type { ShelfSettings } from './shelf-settings.ts';

/**
 * One book, alone, from every angle — `?solo`.
 *
 * ## Why this exists
 *
 * Every defect the books have had was found by squinting at a crowded shelf, and
 * the shelf is the worst place to look: books occlude each other, the case
 * occludes the row, the camera cannot go below 3.6° or much above, and a fault
 * that shows on one binding is hidden by whichever neighbour is taller. The head
 * cap shipped ~6× too narrow and was caught from a screenshot — after two
 * reviews, a full suite, and a cost line that reports every counter it moved. It
 * moved none of them.
 *
 * So: no case, no neighbours, no clamp. One book at the origin and an orbit that
 * goes over the head and under the tail.
 *
 * ## It builds the book the shipped way, and that is the whole point
 *
 * `toRows` gives the entry, `placeShelf` gives the depth, `buildBook` builds the
 * mesh, `addLighting` lights it — all the functions the shelf itself calls. An
 * inspector with its own copy of the geometry would be a second thing to keep
 * true, and would agree with the shelf right up until the moment it mattered.
 *
 * What is deliberately *not* shared is the case, the painted shading and the
 * placement transform. Those are the shelf, not the book.
 *
 * ⚠️ **The orbit is unclamped, and the shipped shelf's is not.** `maxPolarAngle`
 * is `PI * 0.52` on the real shelf, so the lowest angle a visitor ever reaches is
 * 3.6° above the horizon — which is why #56 decided there is no tail cap and
 * never will be. Anything you can see from below here, nobody can see at all.
 * Look, but do not fix it.
 */

export interface InspectorHandle {
  dispose(): void;
  /** Which book is on the turntable, so the caller can say so. */
  readonly title: string;
}

export function mountBookInspector(
  canvas: HTMLCanvasElement,
  books: readonly LibraryBook[],
  index: number,
  settings: ShelfSettings,
): InspectorHandle | undefined {
  const chosen = books[index] ?? books[0];
  if (chosen === undefined) return undefined;

  /**
   * Through the shelf's own two steps, on a library of exactly one.
   *
   * `toRows` resolves the binding, the height and the thickness; `placeShelf`
   * answers the one thing left, which is how deep the book is built — the shelf
   * depth when it is shelved, its cover's width when it stands face-out. Neither
   * is worth re-deriving here, and a re-derivation is exactly how the packer and
   * the placer came to disagree by 0.162 across a row (ADR-0031).
   */
  const rows = toRows([chosen], settings.books);
  const entry = rows[0]?.books[0];
  const placement = placeShelf(rows)[0]?.[0];
  if (entry === undefined || placement === undefined) return undefined;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.renderer.antialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.renderer.maxPixelRatio));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(settings.scene.background);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  // The two lines that make this an inspector rather than a small shelf.
  controls.minDistance = entry.height * 0.4;
  controls.maxDistance = entry.height * 8;

  COVERS.useRenderer(renderer);
  const book = buildBook(entry, placement.frontZ * 2, COVERS, false, settings);
  scene.add(book);

  /**
   * Lit as the shelf lights it, against a case of this book's height.
   *
   * The lights are positioned relative to the case, so handing `addLighting` the
   * book's own height puts the key where it would be for a one-shelf unit —
   * high, right, and in front. A book lit from somewhere else is a book whose
   * highlights are not the ones that ship.
   */
  addLighting(scene, entry.height, settings);

  camera.position.set(entry.height * 0.9, entry.height * 0.55, entry.height * 1.5);
  controls.target.set(0, 0, 0);
  controls.update();

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
    title: chosen.title,
    dispose(): void {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      // The shared shapes and the cover cache outlive any one mount, exactly as
      // they do for the shelf — see `mountShelf`'s own disposing traverse.
      renderer.dispose();
    },
  };
}
