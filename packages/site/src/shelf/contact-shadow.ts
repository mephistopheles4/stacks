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
 * The key light, reduced to the two ratios a painter needs.
 *
 * `xPerZ` and `yPerZ` are how far a shadow travels sideways and how far it
 * falls, per unit of depth into the case. Both are magnitudes: the light stands
 * high and to the right, so every shadow here runs left and down, and saying so
 * once in prose beats carrying two signs through the arithmetic.
 *
 * Derived from the light's real position rather than tuned by eye (see
 * `caseLight` in `scene.ts`), so moving the light cannot leave the painted
 * shadows describing where it used to be.
 */
export interface CaseLight {
  readonly xPerZ: number;
  readonly yPerZ: number;
}

/**
 * Where one book meets the plank it stands on, in world units.
 *
 * Not the same thing as a book's **footprint**, which is the scalar width it
 * eats along the row — a face-out book's footprint is its cover's width, but its
 * contact is that width by its own *thickness*, because it has been turned a
 * quarter turn and puts the same slab on the wood as any other book, seen
 * end-on. Taking the cover's width for both painted a shadow the size of the
 * cover flat on the shelf. The two senses have separate names for that reason;
 * see `CONTEXT.md`.
 */
export interface Contact {
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

/**
 * How dark each painted shadow goes, at its strongest.
 *
 * Set against the real thing rather than by taste: `?shadows=1` still renders
 * Three's shadow map, so the two can be photographed at the same camera and
 * differenced. The first pass at 0.5 and 0.4 came back darker than the shadows
 * it was imitating, over the whole backboard and the right-hand end of every
 * plank.
 */
const SIDE_ALPHA = 0.22;
const BACKBOARD_ALPHA = 0.22;

/**
 * How dark the recess under a plank goes, and how far down it reaches.
 *
 * The one effect here that is *not* a cast shadow. A shadow needs the light to
 * be blocked, and almost nothing blocks it from a book's face: every book on
 * the shelf stands its front within two centimetres of the case's front plane,
 * so a ray leaving one escapes into the room almost at once. What darkens the
 * top of a book is the recess it stands in — a plank directly overhead, a
 * backboard behind, and only a narrow wedge of room left to catch light from.
 * That is ambient occlusion, and it is why this reaches down from the plank by
 * a fixed distance rather than following any book's own height.
 */
const RECESS_ALPHA = 0.34;
const RECESS_REACH = 0.62;

/**
 * The same thing along the shelf: the corner a shelf makes with its upright.
 *
 * Asked for directly — "the shelf sides should also cast a shadow on the
 * books" — and true of both ends for the same reason the top is dark, which is
 * why it is not the light's `xPerZ` that sets it. A cast shadow from the
 * upright would fall on one side only and would barely touch a book anyway; the
 * corner is dark on both sides whatever the light does.
 */
const SIDE_SHADE_ALPHA = 0.22;
const SIDE_SHADE_REACH = 0.28;

/**
 * Width of a shadow's soft edge, in world units.
 *
 * These edges are cast by a directional light, so in life they would be nearly
 * hard. A few millimetres of penumbra is what stops a painted boundary reading
 * as a seam between two pieces of wood.
 */
const PENUMBRA = 0.05;

export function makeContactShadowTexture(
  contacts: readonly Contact[],
  shelfWidth: number,
  shelfDepth: number,
  light: CaseLight,
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

  // The right-hand upright stands between the shelf and the light, so it throws
  // a wedge across the plank — widest at the back, narrowing to nothing at the
  // front edge.
  //
  // That shape is the whole of it: a ray leaving the wood at the back of the
  // shelf has the case's entire depth to cross before it escapes past the front,
  // and travels `xPerZ` sideways doing it, so anything within that distance of
  // the upright is behind it. A ray leaving the front edge escapes immediately
  // and is behind nothing at all. The left upright never appears here, for the
  // same reason and in reverse: the light is to the right, so its shadow falls
  // out of the case rather than into it.
  const softPx = Math.max(1, (PENUMBRA / shelfWidth) * TEXTURE_WIDTH);
  for (let row = 0; row < height; row += 1) {
    const z = ((row + 0.5) / height) * shelfDepth - shelfDepth / 2;
    const reach = (shelfDepth / 2 - z) * light.xPerZ * scaleX;
    if (reach <= 0) continue;

    const start = TEXTURE_WIDTH - reach;
    const penumbra = ctx.createLinearGradient(start, 0, start + softPx, 0);
    penumbra.addColorStop(0, 'rgba(0, 0, 0, 0)');
    penumbra.addColorStop(1, `rgba(0, 0, 0, ${String(SIDE_ALPHA)})`);
    ctx.fillStyle = penumbra;
    ctx.fillRect(start, row, softPx, 1);

    ctx.fillStyle = `rgba(0, 0, 0, ${String(SIDE_ALPHA)})`;
    ctx.fillRect(start + softPx, row, TEXTURE_WIDTH - start - softPx, 1);
  }

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

    for (const print of contacts) {
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
  // Reaches half way across and goes a little deeper than it did. The real
  // shadow map is darker still on every face-out cover it was measured against,
  // and shaped — the occluder is a *taller* neighbour, so its top corner throws
  // a diagonal rather than a straight band. That part is not reproduced here: it
  // would need each book to know how tall the one beside it is.
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
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

/**
 * The shadow the case throws on its own backboard.
 *
 * This is the piece the shelf was missing, and the one a viewer reads as "the
 * shelf casts a shadow over the books" — the books themselves barely take a
 * cast shadow at all, because their fronts sit within a couple of centimetres
 * of the case's front plane and a ray leaving them escapes almost at once. The
 * backboard is the opposite case: it is the full depth of the case back, so a
 * ray leaving it has to cross all of that before it gets out, and mostly does
 * not. So the dark band across the top of a shelf is the *wall* behind the
 * books, not the books.
 *
 * Two occluders, unioned rather than added so the corner where they meet does
 * not go twice as dark as either:
 *
 *  - the plank above, whose shadow falls `depth × yPerZ` down the wall — on a
 *    five-row case that is about three quarters of the open height, which is
 *    why only a strip along the bottom of each shelf stays lit;
 *  - the right-hand upright, whose shadow reaches `depth × xPerZ` in from the
 *    side, full height.
 *
 * Painted a pixel at a time rather than with gradients: two overlapping regions
 * with soft edges are a compositing puzzle in canvas terms and an `if` in pixel
 * terms, and it makes this one independent of `ctx.filter`, which the contact
 * shadows have to feature-check for.
 */
export function makeBackboardShade(
  width: number,
  openHeight: number,
  depth: number,
  light: CaseLight,
): THREE.Mesh | undefined {
  const fall = depth * light.yPerZ;
  const reach = depth * light.xPerZ;

  return shadePlane(
    width,
    openHeight,
    (inward, below) => BACKBOARD_ALPHA * Math.max(inShadow(fall - below), inShadow(reach - inward)),
  );
}

/**
 * The darkening in the recess itself, drawn across the front of a whole shelf.
 *
 * One plane per shelf rather than a band on each book. It costs a draw call per
 * *row* instead of per book, which matters on the phone this shading exists to
 * serve; and it is the truer shape anyway — how dark a book's top goes is a
 * property of where it stands, not of the book, so it is keyed to the plank
 * overhead and to the upright beside it and falls away from both.
 *
 * That is also why a short book takes less of it than a tall one standing in
 * the same place: it is further down out of the overhang, with more of the room
 * to see.
 *
 * It sits a few millimetres in front of the books, which all present their
 * faces in the same plane, and stops short of the planks so it never darkens
 * the wood's own front edge.
 */
export function makeRecessShade(width: number, openHeight: number): THREE.Mesh | undefined {
  return shadePlane(width, openHeight, (inward, below) =>
    Math.max(
      RECESS_ALPHA * fallsAway(below / RECESS_REACH),
      SIDE_SHADE_ALPHA * fallsAway(Math.min(inward, width - inward) / SIDE_SHADE_REACH),
    ),
  );
}

/** Texture pixels across a shade plane's width. A blurred mask; 256 is plenty. */
const SHADE_TEXTURE_WIDTH = 256;

/**
 * A plane carrying a painted mask, built a pixel at a time.
 *
 * Per-pixel rather than with canvas gradients because every one of these is a
 * *union* of two overlapping regions — a plank above and an upright beside —
 * and taking the darker of two soft edges is a compositing puzzle in gradient
 * terms and a `Math.max` in pixel terms. It also makes these independent of
 * `ctx.filter`, which the contact shadows have to feature-check for.
 *
 * `alphaAt` is handed world distances rather than texture coordinates: `inward`
 * from the right-hand edge, `below` from the top. Both are the directions the
 * light casts in, so a caller never has to think about which way a texture runs.
 */
function shadePlane(
  width: number,
  height: number,
  alphaAt: (inward: number, below: number) => number,
): THREE.Mesh | undefined {
  const rows = Math.max(32, Math.round((SHADE_TEXTURE_WIDTH * height) / width));

  const canvas = document.createElement('canvas');
  canvas.width = SHADE_TEXTURE_WIDTH;
  canvas.height = rows;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const image = ctx.createImageData(canvas.width, rows);
  // Only the alpha channel is written. The rest stays zero, so the mask is
  // black and the wood's own colour shows through it.
  for (let row = 0; row < rows; row += 1) {
    // Row 0 is the top of the texture and, with `flipY` on, the top of the
    // plane — so this counts downward from the underside of the plank above.
    const below = ((row + 0.5) / rows) * height;

    for (let column = 0; column < canvas.width; column += 1) {
      const inward = (1 - (column + 0.5) / canvas.width) * width;
      const alpha = alphaAt(inward, below);
      image.data[(row * canvas.width + column) * 4 + 3] = Math.round(255 * alpha);
    }
  }
  ctx.putImageData(image, 0, 0);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: finish(canvas), transparent: true, depthWrite: false }),
  );
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * How much of the shadow reaches a point that is `inside` world units past its
 * edge — 1 well inside, 0 well outside, smooth across the penumbra.
 *
 * For a cast shadow, which has a definite edge.
 */
function inShadow(inside: number): number {
  const t = inside / PENUMBRA + 0.5;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * How much darkening survives `t` of the way out of a recess — 1 at the corner
 * itself, 0 at the far end, and never a straight line between them.
 *
 * For occlusion, which has no edge at all: it is strongest where the wood is
 * and thins as a surface comes out into the open. A linear ramp reads as a band
 * with a border, which is the one thing this must not look like.
 */
function fallsAway(t: number): number {
  if (t >= 1) return 0;
  return (1 - t) ** 1.6;
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How far a shadow plane floats off the wood it darkens, to avoid z-fighting. */
export const LIFT = 0.0015;

/**
 * The plane that carries one shelf's painted shadow.
 *
 * `MeshBasicMaterial` on purpose: a shadow that responded to the lights would be
 * lit, which is precisely backwards. `depthWrite: false` so books standing on it
 * are never occluded by it.
 */
export function makeContactShadow(
  contacts: readonly Contact[],
  shelfWidth: number,
  shelfDepth: number,
  y: number,
  light: CaseLight,
): THREE.Mesh | undefined {
  const texture = makeContactShadowTexture(contacts, shelfWidth, shelfDepth, light);
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
