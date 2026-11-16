import * as THREE from 'three';

/**
 * Where an open book's page goes on screen once it leaves the 3D layer (#599,
 * ADR-0151). At rest the book is square to the camera, so a page is a flat
 * rectangle — scaled, and on a phone's framing possibly turned — and a CSS 2D
 * `matrix(...)` puts the same DOM node exactly where `CSS3DRenderer` had it.
 *
 * **Pure**: `flatPlacement` reads four numbers pairs and answers a string, so
 * it is tested without a DOM. `projectSlot` is the one place three is asked
 * where a page's corners fall.
 */

export interface Corner {
  readonly x: number;
  readonly y: number;
}

/** A page's corners in CSS pixels: top-left, top-right, bottom-right, bottom-left. */
export type Corners = readonly [Corner, Corner, Corner, Corner];

/** The page's own box, in the CSS pixels it is laid out at. */
export interface PageBox {
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  /** A CSS `matrix(a, b, c, d, e, f)`, for a node at `left: 0; top: 0` with `transform-origin: 0 0`. */
  readonly matrix: string;
  /** How far, in px, the fourth corner is from where the matrix puts it: 0 for a flat rectangle. */
  readonly skew: number;
}

/** A square page at rest shows none; over this the page is not flat, and is not moved. */
export const SKEW_LIMIT_PX = 1;

/** Three decimals, and never `-0`: a matrix written only when it differs must not flicker on a sign. */
const fixed = (value: number): string => String(Math.round(value * 1000) / 1000 + 0);

/**
 * The affine map that takes the page's own box onto `corners`, fitted to the
 * first, second and fourth corner, and how far the third is from it.
 */
export function flatPlacement(corners: Corners, box: PageBox): Placement {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const a = (topRight.x - topLeft.x) / box.width;
  const b = (topRight.y - topLeft.y) / box.width;
  const c = (bottomLeft.x - topLeft.x) / box.height;
  const d = (bottomLeft.y - topLeft.y) / box.height;
  const predicted = {
    x: topLeft.x + a * box.width + c * box.height,
    y: topLeft.y + b * box.width + d * box.height,
  };
  return {
    matrix: `matrix(${[a, b, c, d, topLeft.x, topLeft.y].map(fixed).join(', ')})`,
    skew: Math.hypot(bottomRight.x - predicted.x, bottomRight.y - predicted.y),
  };
}

/**
 * A slot's four corners, projected through `camera` into a layer `width` by
 * `height` CSS pixels. The slot is a `CSS3DObject`, whose local unit is a CSS
 * pixel and whose y runs up: its corners sit at ±`box.width`/2 and
 * ±`box.height`/2. The caller has run `updateMatrixWorld` on the slot and the camera.
 */
export function projectSlot(
  slot: THREE.Object3D,
  camera: THREE.Camera,
  layer: { readonly width: number; readonly height: number },
  box: PageBox,
): Corners {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const project = (x: number, y: number): Corner => {
    const point = new THREE.Vector3(x, y, 0).applyMatrix4(slot.matrixWorld).project(camera);
    return { x: ((point.x + 1) / 2) * layer.width, y: ((1 - point.y) / 2) * layer.height };
  };
  return [
    project(-halfWidth, halfHeight),
    project(halfWidth, halfHeight),
    project(halfWidth, -halfHeight),
    project(-halfWidth, -halfHeight),
  ];
}
