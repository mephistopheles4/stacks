import * as THREE from 'three';

/**
 * Shadows, painted rather than rasterised.
 *
 * Three's shadows are *shadow mapping*: render the whole scene from the light
 * into a depth texture, then have every fragment in the main pass sample that
 * texture to ask whether it is lit. It is a technique for scenes that change,
 * and it is the wrong tool here — nothing on this shelf moves. Books are placed
 * once, the light never moves, and a shadow does not depend on the camera, which
 * is the only thing that does. The scene was paying a fully dynamic solution for
 * a completely static problem.
 *
 * So the shading is computed once, from the layout, and drawn into a texture.
 * There is no shadow pass, no depth target, and no per-fragment lookup: the
 * darkness is simply part of the picture.
 *
 * That was the better design before any of this came up. It also happens to be
 * the only one that runs on the owner's phone — a Pixel 10 Pro, whose Tensor G5
 * carries Imagination's PowerVR D-Series. Every real-time configuration lost the
 * WebGL context within a minute: soft filtering and basic, 2048 and 512, and
 * with the casters removed entirely so nothing was drawn into the map at all.
 * Only the absence of a depth target survived. That is a driver fault rather
 * than a budget — 195 draws and 1,720 triangles is not a load — and nothing here
 * can fix it. Not depending on it is the fix.
 */

/**
 * One book's footprint on the plank it stands on, in world units.
 */
export interface Footprint {
  /** Centre of the book along the shelf. */
  readonly x: number;
  /** How much of the shelf's width it occupies. */
  readonly width: number;
  /** Centre and extent across the shelf's depth. */
  readonly z: number;
  readonly depth: number;
}

/**
 * Texture pixels across the plank's width. The plank is ~4.7× wider than deep,
 * and this is a blurred smudge rather than artwork — 512 is already generous.
 */
const TEXTURE_WIDTH = 512;

/** How dark the contact line under a book goes, at its strongest. */
const CONTACT_ALPHA = 0.5;

/**
 * Direction the shadow is thrown, as a fraction of the plank.
 *
 * Taken from the key light, which sits high and to the right — so the shadow
 * falls left, and only slightly back. Mostly sideways rather than mostly
 * backwards: a shadow thrown straight back disappears under the books that cast
 * it and the light reads as coming from directly in front, which is the flattest
 * possible answer and not what the shelf looked like with real shadows.
 *
 * It is still not a projection of the book's real height. A contact shadow reads
 * as contact because it is *short*, and a long one drawn on a plank the next
 * shelf overhangs would only look like dirt.
 */
const THROW_X = -0.07;
const THROW_Z = -0.03;

export function makeContactShadowTexture(
  footprints: readonly Footprint[],
  shelfWidth: number,
  shelfDepth: number,
): THREE.CanvasTexture | undefined {
  const height = Math.max(64, Math.round((TEXTURE_WIDTH * shelfDepth) / shelfWidth));

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  // World → texture. The plane this lands on is rotated so that its local +Y
  // becomes world -Z, which puts the *back* of the shelf at the top of the
  // canvas — hence z is mapped without a flip.
  const toX = (x: number): number => ((x + shelfWidth / 2) / shelfWidth) * TEXTURE_WIDTH;
  const toY = (z: number): number => ((z + shelfDepth / 2) / shelfDepth) * height;
  const scaleX = TEXTURE_WIDTH / shelfWidth;
  const scaleY = height / shelfDepth;

  // The corner a shelf makes with its backboard is dark in any real bookcase,
  // whether or not a book is standing there — light does not reach into it. That
  // is ambient occlusion rather than a cast shadow, so it does not belong to any
  // book, and drawing it here means an empty shelf still has depth instead of
  // reading as a flat plank.
  const ao = ctx.createLinearGradient(0, 0, 0, height * 0.45);
  ao.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  ao.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = ao;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, height * 0.45);

  // Softness is the whole effect, and `ctx.filter` is what provides it. Where it
  // is missing the same code would paint hard black rectangles under every book,
  // which looks far worse than no cast shadow at all — so the books are skipped
  // and the shelf keeps its corner darkening. Checked by writing and reading
  // back, because an unsupported filter assigns silently.
  ctx.filter = 'blur(2px)';
  const canBlur = ctx.filter !== 'none';
  ctx.filter = 'none';
  if (!canBlur) return finish(canvas);

  ctx.fillStyle = '#000000';

  // Two passes, because a shadow has a soft body and a hard root. The blurred
  // pass is the shape thrown onto the plank; the tight pass is the line where
  // the book actually meets the wood, and it is the one that makes a book look
  // like it is standing on something rather than hovering a millimetre above it.
  for (const [blur, alpha, offset] of [
    [10, CONTACT_ALPHA * 0.55, 1],
    [2.5, CONTACT_ALPHA, 0.25],
  ] as const) {
    ctx.filter = `blur(${String(blur)}px)`;
    ctx.globalAlpha = alpha;

    for (const print of footprints) {
      const x = toX(print.x + THROW_X * offset) - (print.width * scaleX) / 2;
      const y = toY(print.z + THROW_Z * offset) - (print.depth * scaleY) / 2;
      ctx.fillRect(x, y, print.width * scaleX, print.depth * scaleY);
    }
  }

  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  return finish(canvas);
}

/**
 * The shadow a shelved book throws across the cover of a face-out one.
 *
 * A face-out book is turned to show its cover, so it sits well back — its cover
 * is around 0.08 from the shelf's centre line where a shelved book's fore-edge
 * reaches 0.34. The neighbour to its right therefore stands a quarter of a unit
 * proud of it, directly between it and a key light that is up and to the right,
 * and the cover is the one large flat surface on the shelf where that reads.
 *
 * Dark at the right edge and gone by two thirds of the way across, because the
 * occluder is beside the cover rather than above it: the shadow is a band down
 * one side, not a shape.
 */
export function makeNeighbourShadow(width: number, height: number): THREE.Mesh | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 4;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Not shared between books: `dispose()` walks the scene and disposes every
  // material's map, so one cached texture would be freed by the first book and
  // gone for the rest. A 64×4 gradient is a kilobyte; the caching would cost
  // more to get right than it saves.
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: finish(canvas), transparent: true, depthWrite: false }),
  );
  mesh.renderOrder = 1;
  return mesh;
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How far the shadow plane floats above the plank, to avoid z-fighting. */
const LIFT = 0.0015;

/**
 * The plane that carries one shelf's painted shadow.
 *
 * `MeshBasicMaterial` on purpose: a shadow that responded to the lights would be
 * lit, which is precisely backwards. `depthWrite: false` so books standing on it
 * are never occluded by it.
 */
export function makeContactShadow(
  footprints: readonly Footprint[],
  shelfWidth: number,
  shelfDepth: number,
  y: number,
): THREE.Mesh | undefined {
  const texture = makeContactShadowTexture(footprints, shelfWidth, shelfDepth);
  if (texture === undefined) return undefined;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(shelfWidth, shelfDepth),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: 0xffffff,
    }),
  );

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y + LIFT, 0);
  mesh.renderOrder = 1;
  return mesh;
}
