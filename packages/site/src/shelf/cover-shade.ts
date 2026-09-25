import * as THREE from 'three';

import { pageBlock } from './binding-case.ts';
import { PLANK_INSET, SHELF } from './bookcase.ts';
import type { Placement } from './placement.ts';
import { heightOf, type KeyLightSettings } from './shelf-settings.ts';

/**
 * The shadow the bookcase and the books beside it throw across a face-out
 * cover, painted — so nothing on a book ever reads the real-time shadow map.
 *
 * Under `shadows.receivers: 'bookcase'` a book's programs compile with no shadow
 * sampler (`shadow-receivers.ts`), which is what keeps the Pixel 10 Pro XL
 * alive, and it costs the one cast shadow a visitor reads on a book: the dark
 * band the plank above throws across the top of every face-out cover, and the
 * wedge a taller neighbour throws down its right-hand edge. This puts both back
 * as **one mesh for the whole shelf** — a quad laid on each face-out cover,
 * sampling one atlas of masks — so it costs one draw, one texture and no
 * program at every library size, and samples no shadow map.
 *
 * The masks are geometry, not a picture: each texel is a point on the printed
 * cover, and it is dark when a ray from it toward the key light meets the
 * plank above, the right-hand upright, or a book to its right before it
 * escapes past the bookcase's front. That is the same question the shadow map
 * answers, asked of three boxes instead of the scene, from the same two ratios
 * the backboard's painted shade already uses — so moving the light moves the
 * band, and the band's shape is derived rather than drawn.
 *
 * Only covers are painted. A spine stands at the bookcase's front, 0.016 behind
 * the plank's front edge, so the plank's shadow reaches 0.02–0.03 of a unit
 * down its plane and stops well short of the tallest spine's top, which stands
 * a tenth of a unit below the plank — pinned at the 200-book size by the spec.
 * A face-out book stands a quarter of a unit further back, which is the whole
 * reason it has a band.
 *
 * Everything here is pure and runs in Node; the canvas that carries the atlas
 * is painted in `contact-shadow.ts`, which is out of the mutation scope because
 * a canvas is.
 */

/**
 * The key light, reduced to the two ratios a painter needs.
 *
 * `xPerZ` and `yPerZ` are how far a shadow travels sideways and how far it
 * falls, per unit of depth into the bookcase. Both are magnitudes: the light
 * stands high and to the right, so every shadow here runs left and down, and
 * saying so once in prose beats carrying two signs through the arithmetic.
 *
 * ⚠️ **Magnitudes are an assumption about where the light is.** A key light
 * moved to the left of the bookcase from the panel would throw its shadows the
 * other way, and every painter here — this one and the backboard's — would
 * still paint them to the left. That was true before the cover shade existed.
 */
export interface BookcaseLight {
  readonly xPerZ: number;
  readonly yPerZ: number;
}

/**
 * The two ratios, from the key light's real position and aim.
 *
 * Derived rather than tuned by eye, so a light moved on the panel cannot leave
 * the painted shadows describing where it used to be. `unitHeight` matters
 * because the light's height is stated against the bookcase: a taller bookcase
 * puts the light higher, and its shadows fall more steeply.
 */
export function lightRatios(key: KeyLightSettings, unitHeight: number): BookcaseLight {
  const dx = -key.position.x;
  const dy = unitHeight * key.aimHeight - heightOf(key.position.y, unitHeight);
  const dz = -key.position.z;
  return { xPerZ: Math.abs(dx / dz), yPerZ: Math.abs(dy / dz) };
}

/**
 * How much of a shadow reaches a point that is `inside` world units past its
 * edge — 1 well inside, 0 well outside, smooth across `penumbra`, and exactly
 * one half on the edge itself.
 *
 * For a cast shadow, which has a definite edge.
 */
export function inShadow(inside: number, penumbra: number): number {
  const t = inside / penumbra + 0.5;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Width of the cover shade's soft edge, in world units.
 *
 * Measured, not chosen: the band the shadow map threw across a cover had an
 * edge 2–4 pixels wide at the phone's resolution, about 0.01 of a unit — five
 * times harder than the 0.05 the backboard's shade uses. One shadow-map texel
 * at seven rows is 0.0046, so this is two of them.
 */
export const COVER_PENUMBRA = 0.01;

/**
 * How dark the cover shade goes where it is fully in shadow.
 *
 * The strength is the material's `opacity` and the mask stays a pure 0–1
 * geometric answer, because blending black over a surface gives
 * `surface × (1 − opacity × mask)`: linear in the opacity, so it can be fitted
 * in closed form against the real shadow map rather than dialled by eye.
 *
 * Fitted against `?shadows=1&receivers=all` at the phone's viewport, and **the
 * fits disagree**, because a real shadow takes away only the key light and how
 * much of a cover's light that is depends on where it stands: 0.23 on the
 * 50-book fixture (0.26 on its top row, 0.20 on the row by the lamp), 0.33 on
 * the seven-book one. 0.28 is the value that keeps both inside the target —
 * the worse of the two leaves 0.38 of the unpainted error — and it sits beside
 * the 0.275 read off the live library's broad bands. A strength per cover,
 * derived from the lights, is the next step if one number stops being enough;
 * see `docs/log/2026-09-24-the-cover-shade.md`.
 */
export const COVER_SHADE_ALPHA = 0.28;

/**
 * How far the cover shade floats off the printed cover.
 *
 * The lift `makeNeighbourShadow`'s plane has always had — twice the old
 * `SKIN`, 0.0012, the hair a printed face used to float above its board before
 * the faces were laid on their boards with a polygon offset. The two overlays
 * share one plane, which is harmless: neither writes depth, and two black
 * overlays darken the same whichever is drawn first. It is far larger than the
 * depth buffer can resolve at this distance, so the printed cover never wins.
 */
export const COVER_LIFT = 0.0024;

/** Where the plank's front edge stands, in world `z`. */
const PLANK_FRONT_Z = SHELF.depth / 2 - PLANK_INSET;

/** The inner face of the right-hand upright, in world `x`. */
const UPRIGHT_INNER_X = SHELF.width / 2;

/** The upright's front edge, in world `z`. It keeps every plane it owns. */
const UPRIGHT_FRONT_Z = SHELF.depth / 2;

/**
 * Puts a book where its placement says.
 *
 * One function, called by `buildBooks` for the book itself and by this module
 * for the mirror it computes the cover's corners from, so the quad the shade is
 * drawn on and the cover it darkens cannot be placed by two copies of the same
 * three lines that drift apart.
 */
export function applyPlacement(object: THREE.Object3D, placement: Placement): void {
  object.rotation.y = placement.rotationY;
  object.rotation.z = placement.rotationZ;
  object.position.set(placement.position.x, placement.position.y, placement.position.z);
}

/**
 * A book to the right of a cover, as the three numbers a ray needs.
 *
 * Its left face — the face a ray travelling right meets first — is the line
 * `x = a + b·y` in world space: vertical for a face-out book, which stands
 * square along the row, and sloped for a spine, which leans. `top` is where that
 * face ends, and the front is where a ray passing along the book escapes into
 * the room, `z = front + frontSlope·y` — flat for a spine, and tilted with the
 * lean for a face-out book, whose front is its own cover.
 */
export interface BookOccluder {
  readonly a: number;
  readonly b: number;
  readonly top: number;
  readonly front: number;
  readonly frontSlope: number;
  /** The leftmost `x` its left face reaches, for discarding it cheaply. */
  readonly nearest: number;
}

/** Everything that can throw a shadow on one cover. */
export interface CoverOccluders {
  /** The underside of the plank above, in world `y`. */
  readonly plankUnderside: number;
  /** Every later book in the same row, left to right. */
  readonly books: readonly BookOccluder[];
}

/**
 * What can shade the cover at `index` in `row`: the plank above it, and every
 * book to its right on the same shelf.
 *
 * Every later book rather than only the next one, because the one that shades
 * a cover need not be touching it — a tall spine two books along throws its
 * corner across a short one. Which of them is actually in reach depends on the
 * light, so it is decided when the mask is painted, not here. The left upright
 * and books to the left never appear: the light is on the right.
 *
 * `headCap` is the shelf's, as built: it sets how deep the covering at a
 * hardback's joint runs, and so where its page block stops.
 */
export function coverOccluders(
  row: readonly Placement[],
  index: number,
  headCap: number,
): CoverOccluders {
  const cover = row[index];
  if (cover === undefined) throw new Error(`no placement at ${String(index)}`);

  // A face-out book stands square, so its foot is its centre less half its
  // height — which is also the plank it stands on.
  const shelfY = cover.position.y - cover.entry.height / 2;

  return {
    plankUnderside: shelfY + SHELF.rowHeight - SHELF.plankThickness,
    books: row.slice(index + 1).map((placement) => bookOccluder(placement, headCap)),
  };
}

/**
 * The occluder a book presents: its **page block**, not its case.
 *
 * The block is the one part of a book that draws into the shadow map, so it is
 * what threw every wedge this is tuned against — inset from the case by a board
 * at the side, the square at the head and the covering at the joint. Painting
 * from the whole case put the wedge a few pixels left of and above the real one,
 * which on a cover shaded mostly by its neighbour was most of the error left.
 */
function bookOccluder(placement: Placement, headCap: number): BookOccluder {
  const mirror = new THREE.Object3D();
  applyPlacement(mirror, placement);
  mirror.updateMatrixWorld(true);
  const at = (x: number, y: number, z: number): THREE.Vector3 =>
    mirror.localToWorld(new THREE.Vector3(x, y, z));

  const {
    scale: [sx, sy, sz],
    position: [px, py, pz],
  } = pageBlock(placement.entry, placement.frontZ * 2, headCap);
  const minX = px - sx / 2;
  const maxX = px + sx / 2;
  const minY = py - sy / 2;
  const maxY = py + sy / 2;
  const maxZ = pz + sz / 2;

  // A face-out book has been turned a quarter turn, so the face a ray from the
  // left meets is its local +Z (the joint) and its front is the cover, local
  // +X; a shelved book's are local -X and +Z (the spine).
  const faceOut = placement.entry.faceOut;
  const foot = faceOut ? at(0, minY, maxZ) : at(minX, minY, 0);
  const head = faceOut ? at(0, maxY, maxZ) : at(minX, maxY, 0);
  const frontFoot = faceOut ? at(maxX, minY, 0) : at(0, minY, maxZ);
  const frontHead = faceOut ? at(maxX, maxY, 0) : at(0, maxY, maxZ);

  const b = (head.x - foot.x) / (head.y - foot.y);
  const frontSlope = (frontHead.z - frontFoot.z) / (frontHead.y - frontFoot.y);

  return {
    a: foot.x - b * foot.y,
    b,
    // Where the left face ends. A face-out book leans back, which lifts its
    // front edge above its back, and a ray that clears the book clears that
    // edge; a spine leans left, so its left face ends at its top-left corner
    // and the top rises to the right far more slowly than any ray climbs.
    top: faceOut ? frontHead.y : head.y,
    front: frontFoot.z - frontSlope * frontFoot.y,
    frontSlope,
    nearest: Math.min(foot.x, head.x),
  };
}

/**
 * How far into a book's shadow a point is, in world units — positive inside.
 *
 * The ray toward the light leaves `point` travelling `xPerZ` right and `yPerZ`
 * up per unit forward, meets the book's left face after `s` units of depth, and
 * is shadowed if it arrives there both behind the book's front and below its
 * top. The two margins are measured in world units, so the smaller of them is
 * the distance to the shadow's edge. A face the ray never reaches — to its left,
 * or leaning away faster than the ray climbs — shades nothing.
 */
function insideBook(point: THREE.Vector3, book: BookOccluder, light: BookcaseLight): number {
  const closing = light.xPerZ - book.b * light.yPerZ;
  if (closing <= 0) return Number.NEGATIVE_INFINITY;

  const s = (book.a + book.b * point.y - point.x) / closing;
  if (s < 0) return Number.NEGATIVE_INFINITY;

  const y = point.y + s * light.yPerZ;
  const behindFront = (book.front + book.frontSlope * y - (point.z + s)) * light.xPerZ;
  const belowTop = book.top - y;
  return Math.min(behindFront, belowTop);
}

/**
 * How much of the cast shadow reaches one point on a cover, 0 to 1.
 *
 * The union of three occluders, never the sum, so the corner where the plank's
 * band meets a neighbour's wedge goes no darker than either:
 *
 *  - **the plank above**, whose shadow line falls `yPerZ` per unit of depth
 *    behind its front edge — which is why a wider cover, standing further back,
 *    carries a deeper band;
 *  - **the right-hand upright**, reaching `xPerZ` per unit of depth in from its
 *    inner face — `makeBackboardShade`'s term, asked at the cover's depth;
 *  - **every book to the right**, see `insideBook`.
 */
export function coverShadeAt(
  point: THREE.Vector3,
  occluders: CoverOccluders,
  light: BookcaseLight,
  penumbra: number = COVER_PENUMBRA,
): number {
  const plank = point.y - occluders.plankUnderside + (PLANK_FRONT_Z - point.z) * light.yPerZ;
  const upright = point.x - UPRIGHT_INNER_X + (UPRIGHT_FRONT_Z - point.z) * light.xPerZ;

  let inside = Math.max(plank, upright);
  for (const book of occluders.books) inside = Math.max(inside, insideBook(point, book, light));
  return inShadow(inside, penumbra);
}

/**
 * One face-out cover, as the shade needs it: where it is, and what shades it.
 *
 * `matrix` is the book's own local-to-world transform, from `applyPlacement`,
 * so a texel's point on the cover includes the book's lean. `corners` are the
 * quad the shade is drawn on — the cover lifted by `COVER_LIFT` — in the order
 * `PlaneGeometry` lays its vertices: top-left, top-right, bottom-left,
 * bottom-right, as seen from the room.
 */
export interface CoverQuad {
  readonly placement: Placement;
  readonly matrix: THREE.Matrix4;
  readonly corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  readonly occluders: CoverOccluders;
}

/**
 * Every face-out cover on the shelf, row by row and left to right, under a
 * shelf built with head caps of `headCap` — see `coverOccluders`.
 */
export function coverQuads(rows: readonly (readonly Placement[])[], headCap: number): CoverQuad[] {
  return rows.flatMap((row) =>
    row.flatMap((placement, index) =>
      placement.entry.faceOut ? [coverQuad(placement, coverOccluders(row, index, headCap))] : [],
    ),
  );
}

function coverQuad(placement: Placement, occluders: CoverOccluders): CoverQuad {
  const { height, thickness } = placement.entry;
  const width = placement.frontZ * 2;

  // Exactly how `buildBook` lays `makeNeighbourShadow`'s plane on a cover: a
  // plane the cover's size, turned to face the book's +X, a lift proud of it.
  const mirror = new THREE.Object3D();
  applyPlacement(mirror, placement);
  const plane = new THREE.Object3D();
  plane.rotation.y = Math.PI / 2;
  plane.position.set(thickness / 2 + COVER_LIFT, 0, 0);
  mirror.add(plane);
  mirror.updateMatrixWorld(true);

  const corner = (x: number, y: number): THREE.Vector3 =>
    plane.localToWorld(new THREE.Vector3(x, y, 0));

  return {
    placement,
    matrix: mirror.matrixWorld.clone(),
    corners: [
      corner(-width / 2, height / 2),
      corner(width / 2, height / 2),
      corner(-width / 2, -height / 2),
      corner(width / 2, -height / 2),
    ],
    occluders,
  };
}

/**
 * The world point a fraction of the way across and down a printed cover.
 *
 * `u` runs from the cover's left edge to its right as seen from the room, and
 * `v` from its top to its foot. On the printed face itself, not on the lifted
 * quad: the shadow falls on the cover.
 */
export function coverPoint(
  quad: CoverQuad,
  u: number,
  v: number,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const { height, thickness } = quad.placement.entry;
  const width = quad.placement.frontZ * 2;
  // Local -Z is the room's +X once a face-out book is turned, so the cover's
  // left edge is its local +Z.
  return target.set(thickness / 2, (0.5 - v) * height, (0.5 - u) * width).applyMatrix4(quad.matrix);
}

/** Texels across one cover's tile. A cover is a soft mask, not artwork. */
export const TILE_WIDTH = 64;

/** Texels down one cover's tile — twice the width, as a cover is taller than wide. */
export const TILE_HEIGHT = 128;

/**
 * Texels of edge-copy round every tile, so filtering at a tile's edge reads its
 * own mask and never its neighbour's. The quad's UVs sit on the centres of the
 * tile's outermost texels, which is already enough for bilinear filtering; the
 * gutter is for the rounding a GPU does on the way there.
 */
export const TILE_GUTTER = 2;

/** The largest atlas this may ask for — a size every WebGL device supports. */
export const MAX_ATLAS_SIZE = 4096;

/** Where each cover's tile sits in the one texture they share. */
export interface AtlasLayout {
  readonly count: number;
  readonly columns: number;
  readonly rows: number;
  /** Texels across and down the whole atlas. */
  readonly width: number;
  readonly height: number;
}

/**
 * Tiles in a near-square grid — `ceil(√(2n))` columns of tiles half as wide as
 * they are tall — or `undefined` when there is nothing to lay out.
 */
export function atlasLayout(count: number): AtlasLayout | undefined {
  if (count <= 0) return undefined;
  const columns = Math.ceil(Math.sqrt(2 * count));
  const rows = Math.ceil(count / columns);
  const layout = {
    count,
    columns,
    rows,
    width: columns * (TILE_WIDTH + TILE_GUTTER * 2),
    height: rows * (TILE_HEIGHT + TILE_GUTTER * 2),
  };
  if (layout.width > MAX_ATLAS_SIZE || layout.height > MAX_ATLAS_SIZE) {
    throw new Error(
      `${String(count)} covers need a ${String(layout.width)}×${String(layout.height)} atlas`,
    );
  }
  return layout;
}

/** The atlas texel where a tile's own first texel sits, gutter excluded. */
export function tileOrigin(layout: AtlasLayout, index: number): { x: number; y: number } {
  return {
    x: (index % layout.columns) * (TILE_WIDTH + TILE_GUTTER * 2) + TILE_GUTTER,
    y: Math.floor(index / layout.columns) * (TILE_HEIGHT + TILE_GUTTER * 2) + TILE_GUTTER,
  };
}

/**
 * The UV rectangle a cover's quad samples, on the centres of its tile's
 * outermost texels.
 *
 * With `flipY` on, which is how the atlas is uploaded, canvas row 0 is the top
 * of the texture — so `top` is the larger `v`, and the cover's top edge reads
 * its tile's first row.
 */
export function tileUv(
  layout: AtlasLayout,
  index: number,
): { left: number; right: number; top: number; bottom: number } {
  const { x, y } = tileOrigin(layout, index);
  return {
    left: (x + 0.5) / layout.width,
    right: (x + TILE_WIDTH - 0.5) / layout.width,
    top: 1 - (y + 0.5) / layout.height,
    bottom: 1 - (y + TILE_HEIGHT - 0.5) / layout.height,
  };
}

/**
 * The whole atlas's mask, one number per texel, row by row from the top.
 *
 * Texel `(c, r)` of a tile is the cover point `(c / (TILE_WIDTH − 1),
 * r / (TILE_HEIGHT − 1))` — the corners' UVs sit on the outermost texels'
 * centres, so those texels *are* the corners. A gutter texel copies the
 * nearest tile texel.
 */
export function coverShadeMask(
  covers: readonly CoverQuad[],
  layout: AtlasLayout,
  light: BookcaseLight,
  penumbra: number = COVER_PENUMBRA,
): Float32Array {
  const mask = new Float32Array(layout.width * layout.height);
  const point = new THREE.Vector3();

  covers.forEach((cover, index) => {
    const occluders = { ...cover.occluders, books: inReach(cover, light) };
    const { x, y } = tileOrigin(layout, index);

    for (let row = -TILE_GUTTER; row < TILE_HEIGHT + TILE_GUTTER; row += 1) {
      const v = clampTexel(row, TILE_HEIGHT) / (TILE_HEIGHT - 1);
      for (let column = -TILE_GUTTER; column < TILE_WIDTH + TILE_GUTTER; column += 1) {
        const u = clampTexel(column, TILE_WIDTH) / (TILE_WIDTH - 1);
        coverPoint(cover, u, v, point);
        mask[(y + row) * layout.width + x + column] = coverShadeAt(
          point,
          occluders,
          light,
          penumbra,
        );
      }
    }
  });

  return mask;
}

function clampTexel(texel: number, size: number): number {
  return Math.min(Math.max(texel, 0), size - 1);
}

/**
 * The books a ray from this cover can reach before it passes the bookcase's
 * front — every other book is left out before the per-texel loop, which is the
 * difference between a few and a whole row per texel.
 */
function inReach(cover: CoverQuad, light: BookcaseLight): BookOccluder[] {
  const right = Math.max(...cover.corners.map((corner) => corner.x));
  const back = Math.min(...cover.corners.map((corner) => corner.z));
  const reach = (UPRIGHT_FRONT_Z - back) * light.xPerZ;
  return cover.occluders.books.filter((book) => book.nearest <= right + reach);
}

/**
 * Every cover's quad in one geometry, in world space: four vertices and two
 * triangles a cover, UVs on its tile.
 *
 * In world space because the whole point is one draw — which also means the
 * mesh does not follow a book that moves. Nothing moves one yet; the day a
 * picked-up book does, it has to blank its own quad.
 */
export function coverShadeGeometry(
  covers: readonly CoverQuad[],
  layout: AtlasLayout,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  covers.forEach((cover, index) => {
    const uv = tileUv(layout, index);
    for (const corner of cover.corners) positions.push(corner.x, corner.y, corner.z);
    uvs.push(uv.left, uv.top, uv.right, uv.top, uv.left, uv.bottom, uv.right, uv.bottom);
    // `PlaneGeometry`'s own winding, so the quad faces the room.
    const first = index * 4;
    indices.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // Nothing unlit reads a normal. The *program key* does: three defines
  // `HAS_NORMAL` from the geometry, and every other painted plane is a
  // `PlaneGeometry`, which carries one — so a quad without them compiled a
  // second MeshBasic program, measured at +1 before this line.
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Black, carrying the atlas as alpha, and as strong as `COVER_SHADE_ALPHA`.
 *
 * `MeshBasicMaterial` because a shadow that took the lights would be lit, and
 * because it compiles no shadow-map chunk at all — three's `meshbasic` shader
 * includes neither `shadowmap_pars` nor any `lights_` chunk, in either stage.
 * Its parameters match every other painted plane's, so it shares their program.
 *
 * No mipmaps: a mip level averages neighbouring tiles into each other, so a
 * zoomed-out shelf would bleed one cover's band onto the next.
 */
export function coverShadeMaterial(atlas: THREE.Texture): THREE.MeshBasicMaterial {
  atlas.generateMipmaps = false;
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.wrapS = THREE.ClampToEdgeWrapping;
  atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.flipY = true;
  return new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    depthWrite: false,
    opacity: COVER_SHADE_ALPHA,
  });
}

/**
 * The mesh, as the painters add it: over the books, casting nothing and in no
 * book's group.
 *
 * Not a child of any book, on purpose. The picker raycasts the books' groups,
 * and a child added after `buildBooks` filled its lookup would take a click and
 * find no book behind it.
 */
export function coverShadeMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshBasicMaterial,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cover-shade';
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  // Under VSM three draws every receiver into the map, and a painted shadow
  // must never cast one.
  mesh.receiveShadow = false;
  return mesh;
}
