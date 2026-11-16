import * as THREE from 'three';
import { gutterStops } from './gutter-shade.ts';

/**
 * The held book's two paper sheets, as `pickup.ts` rigs them: the geometry
 * that carries the gutter's shadow and the paper that shows it.
 *
 * Apart from `pickup.ts` so the wiring is unit-tested — which edge each page
 * darkens on, that a colour attribute is there, that the paper multiplies it
 * in — because no check on the built scene reads a vertex colour (#439).
 */

/**
 * Where each page's fold lies along the unit plane's own x. The right page is
 * turned +90° about Y, so its local −x points to the spine; the left one rides
 * the board turned −90° and then the hinge's 180°, so its local +x does.
 */
const FOLD = { right: -1, left: 1 } as const;

/**
 * The paper both sheets share: **unlit**, shaded per vertex, taking no fog
 * (#599, ADR-0151). The pages are read, and a page that darkened with the room
 * or went grey in the fog would be harder to read than the same text on a
 * flat card. The cover, boards and page block stay lit. A basic material
 * samples no shadow map, so G61's count of readers cannot rise.
 */
export function paperMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0xece2cf, vertexColors: true, fog: false });
}

/**
 * A unit plane facing +z, as `PlaneGeometry(1, 1)` is, cut into columns at the
 * gutter shade's stops so each column edge carries that stop's shade. One row:
 * the shadow runs the page's whole height, so nothing varies along y. No UVs:
 * the paper carries no map, and nothing else reads them.
 */
export function sheetGeometry(page: keyof typeof FOLD): THREE.BufferGeometry {
  const stops = gutterStops(FOLD[page]);
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  for (const y of [0.5, -0.5]) {
    for (const { x, shade } of stops) {
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      colours.push(shade, shade, shade);
    }
  }
  const across = stops.length;
  const index: number[] = [];
  for (let i = 0; i < across - 1; i++) {
    const [a, b, c, d] = [i, i + 1, i + across, i + across + 1];
    index.push(a, c, b, c, d, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/** Set on a sheet's `userData`, so nothing mistakes the paper for a painted piece. */
const SHEET = 'paperSheet';

/**
 * One of the two paper sheets: unlit, reading no shadow map, casting none, and
 * darkening into the fold. Marked as a sheet (`isSheet`) because it is a
 * `MeshBasicMaterial` like the painted shadows, and the two must never be
 * confused (#599, C7).
 */
export function sheetMesh(material: THREE.MeshBasicMaterial, page: 'left' | 'right'): THREE.Mesh {
  const mesh = new THREE.Mesh(sheetGeometry(page), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.userData[SHEET] = true;
  return mesh;
}

export function isSheet(object: THREE.Object3D): boolean {
  return object.userData[SHEET] === true;
}

/**
 * The unlit painted planes among a book's children — the neighbour shadow,
 * hidden while the book is held and shown again when it is put back. Never a
 * paper sheet, whenever it was added: a sheet in this set would hide while the
 * book is held and show on the shelf after the put-back.
 */
export function paintedPieces(children: readonly THREE.Object3D[]): THREE.Mesh[] {
  return children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.MeshBasicMaterial &&
      !isSheet(child),
  );
}
