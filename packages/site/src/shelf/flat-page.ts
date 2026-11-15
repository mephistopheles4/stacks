/**
 * #599's spec S4, prototyped on #593: where a held page's slot lands on screen, as a 2D CSS
 * matrix, so the page itself can rest in a flat layer outside `CSS3DRenderer`'s, where iOS
 * WebKit scrolls it under a finger.
 */
import * as THREE from 'three';

export interface FlatPlacement {
  /** `matrix(a, b, c, d, e, f)`, for a page at `left: 0; top: 0` with `transform-origin: 0 0`. */
  readonly matrix: string;
  /** How far, in px, the fourth corner lands from where the matrix puts it: 0 for a page square
   * to the camera, more for one that perspective skews, which a 2D matrix cannot draw. */
  readonly skew: number;
}

const corner = new THREE.Vector3();

/**
 * Projects the slot's four corners through the camera into the layer's CSS pixels: top left, top
 * right, bottom right, bottom left, from its local corners at plus or minus half its size, y up,
 * as `CSS3DRenderer` lays an element out about its middle. `slot.element` carries its size inline.
 */
export function flatPlacement(
  slot: THREE.Object3D & { readonly element: HTMLElement },
  camera: THREE.Camera,
  layer: { readonly width: number; readonly height: number },
): FlatPlacement {
  const w = parseFloat(slot.element.style.width);
  const h = parseFloat(slot.element.style.height);
  const [p0, p1, p2, p3] = [
    [-w / 2, h / 2],
    [w / 2, h / 2],
    [w / 2, -h / 2],
    [-w / 2, -h / 2],
  ].map(([x = 0, y = 0]) => {
    corner.set(x, y, 0);
    slot.localToWorld(corner);
    corner.project(camera);
    return { x: ((corner.x + 1) / 2) * layer.width, y: ((1 - corner.y) / 2) * layer.height };
  }) as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  const a = (p1.x - p0.x) / w;
  const b = (p1.y - p0.y) / w;
  const c = (p3.x - p0.x) / h;
  const d = (p3.y - p0.y) / h;
  const skew = Math.hypot(p2.x - (p1.x + p3.x - p0.x), p2.y - (p1.y + p3.y - p0.y));
  const n = (v: number): string => String(Math.round(v * 1e4) / 1e4);
  return { matrix: `matrix(${n(a)}, ${n(b)}, ${n(c)}, ${n(d)}, ${n(p0.x)}, ${n(p0.y)})`, skew };
}
