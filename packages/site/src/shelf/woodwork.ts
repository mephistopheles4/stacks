import * as THREE from 'three';

/**
 * The bookcase's veneer — one sheet, laid at its true size, with the grain
 * running along each member's own long axis.
 *
 * The owner's report was that the furniture holding the library reads as tinted
 * plastic ([#279](https://github.com/mephistopheles4/stacks/issues/279)): every
 * plank, upright and backboard was one flat `MeshStandardMaterial` with no map
 * in any slot. This is the pigment half of the answer, chosen on a live build
 * across nine decision tickets under map
 * [#280](https://github.com/mephistopheles4/stacks/issues/280) and locked in
 * [`docs/spec/the-woodwork-reads-as-wood.md`](../../../../docs/spec/the-woodwork-reads-as-wood.md).
 *
 * ## Why this module exists rather than living in `scene.ts`
 *
 * `buildShelf` needs a WebGL context and is not a test seam — `scene.ts` sits
 * outside every mutation scope for exactly that reason, and its own comment
 * states the pattern: *all of the arithmetic happens first, in a module with no
 * Three.js in it*. The UV rewrite below is arithmetic, and `scene.ts` calls it.
 *
 * ## What is deliberately absent
 *
 * ⚠️ **The sheet's own normal map is not bound, and must not be.** A flat-sliced
 * veneer is peeled off a log and has almost no relief to encode:
 * [#284](https://github.com/mephistopheles4/stacks/issues/284) measured
 * rosewood's normal map at **0.000% above the just-noticeable threshold at every
 * rung, on two different sheets**, and proved that was the surface rather than
 * the harness by driving the same pipe at `normalScale 8` for 2.684%. Relief
 * arrives as a *drawn* fibre instead — the second half of this file, and
 * [#303](https://github.com/mephistopheles4/stacks/issues/303).
 *
 * ⚠️ **`roughnessMap` is struck.** Poly Haven publishes none for this sheet.
 * Sapele's measured 1.029% and inverted the prior — a finding with no home.
 *
 * ⚠️ **The backboard is not this module's surface.** It keeps `materials.woodDark`
 * flat until [#304](https://github.com/mephistopheles4/stacks/issues/304) gives
 * it a sheet of its own, because the darkness constraint left one candidate of
 * 41 and it is a different image.
 */

/**
 * The one sheet, and the two numbers that are properties of it rather than
 * dials.
 *
 * **Poly Haven `rosewood_veneer1`, CC0**, diffuse only, at 1024. Its published
 * sheet is 2430 mm and this scene's unit is about 0.30 m — `MAX_HEIGHT` is 0.95
 * for a book that would stand about 290 mm — so `7.68` is the size the veneer
 * really is, not a number that looked nice.
 *
 * ⚠️ **Resolution and species are coupled and neither is a knob.** What the eye
 * reads is `resolution / unitsPerTile`, so rosewood's 1024 over 7.68 units is
 * about 133 texels per world unit where sapele's would be 640. A bigger sheet
 * buys away the repetition — one tile of this one is wider than the whole
 * bookcase, so it never repeats on this case at all — and pays for it in texels.
 * That trade was walked on #284 and settled; laying the sheet *smaller* than
 * life to buy texel density back was rejected by eye, twice, because it brings
 * the repetition with it and repetition is the complaint.
 *
 * ⚠️ **`mean` is the sheet's mean-matched flat twin, computed in linear light**
 * by `scripts/prototype-wood-maps.ts` on `prototype/284-woodwork-channels` from
 * this exact 1024 map. Shading multiplies a linear albedo by a linear radiance,
 * so the flat colour that renders to the same average is
 * `linearToSRGB(mean(sRGBToLinear))`; the naive sRGB-byte average lands a step
 * off in green. ⚠️ **It is per resolution**, because a resize is a blur and a
 * blur moves an average — rosewood's moves by one step in two channels between
 * 512 and 1024. Taken from the branch rather than recomputed: this is the twin
 * for the map that ships, and a twin that matches a different map matches
 * nothing.
 */
export const WOODWORK_SHEET = {
  url: '/wood/rosewood-diff-1024.jpg',
  unitsPerTile: 7.68,
  mean: 0x6e3412,
} as const;

/**
 * What `material.color` must hold once the sheet is bound.
 *
 * A diffuse map **multiplies** `color`, so anything but white renders the sheet
 * darker than the image somebody judged. This is that identity, named rather
 * than written as a bare `0xffffff` at the one place it is used.
 */
export const SHEET_TINT = 0xffffff;

/** `page-edges.ts`'s number, and for its reason: these faces graze the key light. */
const ANISOTROPY = 16;

/** Which world axis a member's grain runs along. */
export type Axis = 'x' | 'y' | 'z';

/**
 * Which world axis each of a `BoxGeometry`'s six faces spans in `u`, and which
 * in `v`, in the order three builds them: `+X, -X, +Y, -Y, +Z, -Z`.
 *
 * Not a convention — it is what `BoxGeometry`'s own `buildPlane` calls do, four
 * vertices per face, `u` and `v` each running `0..1` across the named axis.
 */
const FACE_AXES: readonly (readonly [Axis, Axis])[] = [
  ['z', 'y'], // +X
  ['z', 'y'], // -X
  ['x', 'z'], // +Y
  ['x', 'z'], // -Y
  ['x', 'y'], // +Z
  ['x', 'y'], // -Z
];

/** Vertices per face. `BoxGeometry` at one segment per axis gives four. */
const CORNERS = 4;

/**
 * Rewrite a `BoxGeometry`'s UVs so one map holds a **constant world-space
 * period** on every one of its six faces, with the grain running along `grain`.
 *
 * ## Why the shipped `0..1` cannot work
 *
 * `BoxGeometry` gives every face `0..1` whatever its size, so one shared
 * `texture.repeat` cannot be right for two faces of different sizes. A plank's
 * top face is `3.58 × 0.71` and its front edge is `3.58 × 0.07` — a ten-to-one
 * difference on the axis they do not share — so a repeat that suits the top
 * smears the grain vertically on the edge, which is
 * [#284](https://github.com/mephistopheles4/stacks/issues/284)'s *most
 * plastic-looking surface today*. Multiplying each face's UVs by that face's own
 * world extent, over `unitsPerTile`, turns the shared `0..1` into a shared
 * world-space scale: one tile is `unitsPerTile` units wide on every face of
 * every member.
 *
 * ## The swap, and why it is derived rather than passed
 *
 * **The sheet's figure runs along its own `v` axis**, which is a fact about the
 * downloaded image rather than a convention. So a face whose *long* axis lands
 * on `u` has to exchange its two axes before scaling, and a face whose long axis
 * is already on `v` must not. Naming the member's grain axis and letting each
 * face decide is what puts the figure along a plank's length **and** up an
 * upright's height out of one call — a plank (`x`) swaps its top and front
 * faces and leaves its end caps alone; an upright (`y`) swaps nothing.
 *
 * ⚠️ **The direction is stated by the caller, never inferred from the size.**
 * `rowsForCase` grows the case with the library, so an upright's height changes
 * while a plank's length does not, and the backboard is wider than tall at two
 * rows and taller than wide from four on. A rule that took the longest axis
 * would turn the backboard's grain sideways the day a book was added — which is
 * why [#285](https://github.com/mephistopheles4/stacks/issues/285) *states* each
 * member's direction.
 *
 * ## Where the size comes from
 *
 * ⚠️ **From `geometry.parameters`, and that is structural rather than tidy.**
 * [#301](https://github.com/mephistopheles4/stacks/issues/301) shrank every
 * plank in `x` and `z` and the backboard in `x` and `y` off the planes the
 * uprights own, so a member's world size is its **post-inset** size. Handing the
 * size in as a second argument would be a second copy of `buildShelf`'s
 * arithmetic, and a copy that drifted would leave the grain's world-space period
 * subtly wrong on every member with nothing to notice. Reading it back off the
 * geometry cannot drift.
 */
export function worldSpaceUvs(
  geometry: THREE.BoxGeometry,
  unitsPerTile: number,
  grain: Axis,
): void {
  const uv = geometry.attributes['uv'];
  if (uv === undefined) return;

  const { width, height, depth } = geometry.parameters;
  const extent: Record<Axis, number> = { x: width, y: height, z: depth };

  for (const [face, axes] of FACE_AXES.entries()) {
    const [uAxis, vAxis] = axes;
    // The face's long axis is on `u`, so its two axes exchange before scaling
    // and the grain ends up on the texture's `v`.
    const swap = uAxis === grain;
    const [spanU, spanV] = swap ? [extent[vAxis], extent[uAxis]] : [extent[uAxis], extent[vAxis]];

    for (let corner = 0; corner < CORNERS; corner += 1) {
      const index = face * CORNERS + corner;
      const u = uv.getX(index);
      const v = uv.getY(index);
      const [outU, outV] = swap ? [v, u] : [u, v];
      uv.setXY(index, (outU * spanU) / unitsPerTile, (outV * spanV) / unitsPerTile);
    }
  }

  uv.needsUpdate = true;
}

/**
 * What `material.color` should carry, given the knob and whether the sheet is
 * bound.
 *
 * **`materials.wood` changes meaning with this ticket**: it becomes the colour
 * the woodwork shows *before* its sheet decodes, and if it never does. A diffuse
 * map multiplies `color`, so leaving the knob's old `0x6b4f3a` in place would
 * render the sheet at a third of its brightness — and setting white up front
 * would leave a failed load showing a **white bookcase**. Starting at the
 * sheet's mean-matched hex and switching to white inside the load callback gives
 * a byte-identical frame on success and #284's rendered-and-accepted flat arm on
 * failure.
 *
 * ⚠️ **`applySettings` has to route through this, and that is the trap.** It
 * repaints the material on any change to `materials.wood`; unrouted, one tick of
 * the debug panel or one `?tune=` would put a dark colour back under a decoded
 * sheet and darken the whole bookcase. Once the sheet is bound the knob is a
 * fallback and nothing else, and the `ApplyReport` says so rather than claiming
 * a change the eye cannot find — the map's standing rule that **a control must
 * not lie**.
 */
export function woodColour(fallback: number, bound: boolean): number {
  return bound ? SHEET_TINT : fallback;
}

/**
 * How `bindWoodSheet` fetches — a seam, so a spec can assert the resolved URL
 * without a request.
 *
 * ⚠️ **G21 (`no-live-network`) records any request the suite makes and fails the
 * test that made it**, and `THREE.TextureLoader` needs a DOM this Vitest project
 * does not have. So the loader is a parameter with a real default, constructed
 * only when nobody supplies one.
 */
export type SheetLoader = (url: string, onLoad: () => void, onError: () => void) => THREE.Texture;

/** The real one. Built per call, because constructing it needs a document. */
function textureLoader(): SheetLoader {
  const loader = new THREE.TextureLoader();
  return (url, onLoad, onError) =>
    loader.load(
      url,
      () => {
        onLoad();
      },
      undefined,
      () => {
        onError();
      },
    );
}

/** A handle on the one sheet, for the two callers that need to ask about it. */
export interface SheetBinding {
  /** The URL that was actually requested. */
  readonly url: string;
  /** Whether the sheet has decoded and taken the material's `map`. */
  bound(): boolean;
}

/**
 * Everything a sampled sheet needs that is not its pixels.
 *
 * ⚠️ **`RepeatWrapping` on both axes is load-bearing, not housekeeping.**
 * `worldSpaceUvs` puts UVs well outside `0..1` on every face, and the default
 * `ClampToEdgeWrapping` would smear the tile's last row of texels across
 * everything past the first tile. ⚠️ **`SRGBColorSpace` is too**: without it the
 * sheet is sampled as linear data and renders far darker than the image the
 * `mean` above was computed from, so the fallback would no longer match the map
 * it stands in for.
 */
function configureSheet(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  return texture;
}

/**
 * Bind the sheet to the woodwork material, and switch its colour when it lands.
 *
 * ⚠️ **The map is assigned inside the load callback rather than on the way
 * out**, which is the one place this differs from the prototype and it is the
 * difference between the two failure modes. `TextureLoader.load` returns a
 * `Texture` whose image is filled in later, so a material holding it through a
 * *failed* load carries a map with no pixels — and what the visitor gets then is
 * whatever the renderer substitutes, not the flat brown this ticket promises.
 * Assigning both the map and the white tint in the callback costs one shader
 * recompile at boot and makes the promise literal: **no sheet, no map, the
 * fallback colour**.
 *
 * One request. Resolving inside the callback and calling `load` again for the
 * return value would fetch the file twice, and the +1 texture this ticket
 * reports would be a lie.
 */
export function bindWoodSheet(
  material: THREE.MeshStandardMaterial,
  load: SheetLoader = textureLoader(),
): SheetBinding {
  let bound = false;

  const texture = load(
    WOODWORK_SHEET.url,
    () => {
      bound = true;
      material.map = configureSheet(texture);
      material.color.setHex(SHEET_TINT);
      material.needsUpdate = true;
    },
    () => {
      // Said out loud, because a sheet that never arrives looks like a sheet
      // that was never bound — the ambiguity #68 records under another name.
      console.warn(
        `[woodwork] ${WOODWORK_SHEET.url} did not load; the bookcase keeps its flat colour`,
      );
    },
  );

  return { url: WOODWORK_SHEET.url, bound: () => bound };
}

/* -------------------------------------------------------------------------- */
/*  the drawn fibre                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The relief half of the answer: fine wood fibre, **drawn in code**, tiled far
 * tighter than the photograph and bound into the slot the photograph was
 * wasting.
 *
 * ## Why drawn and not photographed
 *
 * [#284](https://github.com/mephistopheles4/stacks/issues/284) measured both.
 * Against pigment alone this fibre adds **0.742% of frame level and 1.481%
 * orbited**, where the sheet's own normal map adds **0.000%** at every rung, on
 * two different sheets. So the `normalMap` slot was holding a texture and doing
 * nothing, and this is not an extra texture — it is a better use of one.
 *
 * **The two problems are at different frequencies.** The photograph carries the
 * low-frequency figure, and it has to be laid huge for that figure not to
 * repeat — 7.68 world units, which is what caps it at 133 texels per world unit.
 * Close-up crispness is high-frequency fibre, which is the same everywhere on a
 * board and may therefore repeat every few centimetres without anybody seeing
 * it. Laid at `FIBRE_PERIOD` from a 256 canvas it supplies **512 texels per
 * world unit**, and no file size fixes the figure's ceiling because you cannot
 * invent detail that was never captured.
 *
 * ## What it costs
 *
 * One 256-square `CanvasTexture` for the whole bookcase, baked once at module
 * level — `page-edges.ts`'s pattern exactly, and for its reason: one upload for
 * a shelf of any size. **Zero bytes on the wire**, because there is no file.
 *
 * ## The seam, which the prototype had and this does not
 *
 * The bake is judged on renders and the height field is arithmetic, which is how
 * `page-edges.ts` and its spec already divide. Splitting them here paid for
 * itself immediately: `prototype/284-woodwork-channels` wraps its lattice at
 * `round(EDGE / spacing)` cells of the spacing it was *asked* for, so its
 * coarsest octave repeats every **264** texels across a **256** tile and the map
 * does not tile. The fix is to keep the cell *count* and let the spacing land
 * where it must — 23.3 texels rather than 24, a 3% move nobody can see, against
 * a discontinuity down every tile boundary that anybody could. It is
 * `page-edges.ts`'s own wrap defect, in two dimensions, found the same way.
 */

/**
 * World units one tile of the fibre covers.
 *
 * ⚠️ **A constant, and deliberately not a knob.**
 * [#284](https://github.com/mephistopheles4/stacks/issues/284) notes that 0.3
 * would make the fibre pixel-sharp at the camera's clamp and records it
 * explicitly as *"a lead rather than a recommendation"* — it was never rendered
 * after the noise fix. A number nobody has looked at does not become a control.
 * The knob is `materials.woodFibre`, which is `normalScale` and nothing else.
 */
export const FIBRE_PERIOD = 0.5;

/**
 * How many fibre tiles fit one tile of the sheet.
 *
 * `worldSpaceUvs` has already divided every face's UVs by `unitsPerTile`, so
 * this `repeat` converts them into the fibre's own, much tighter period out of
 * **one set of UVs and with no second file** — the figure stays laid huge and
 * the fibre is laid fine. Derived rather than written down, because the sheet's
 * world size is a property of the sheet.
 */
export const FIBRE_TILES = WOODWORK_SHEET.unitsPerTile / FIBRE_PERIOD;

/** Square, and small: the fibre is high-frequency, so it needs period, not extent. */
const FIBRE_EDGE = 256;

/**
 * How hard the fibre pushes the normal, before `normalScale`.
 *
 * ⚠️ **The prototype's first draft multiplied the slope by the texture's edge,
 * and what that looked like was hard vertical bars in blocks.** Two mistakes,
 * both worth naming because either alone still reads as "a texture" from across
 * the room. The noise was never interpolated — a fresh value per texel, held
 * constant in bands — and a normal map is the *derivative* of its height field,
 * so every texel pointed somewhere unrelated to its neighbour. And the gain was
 * 256 times too large, which drove nearly every texel to the edge of the
 * hemisphere and left the map two colours.
 *
 * Gentle on purpose: the point is a board that stops reading as a photograph
 * pinned to a plank, not a carved one, and `normalScale` is where strength gets
 * dialled live.
 */
const RELIEF = 1.6;

/**
 * How much of that gain each axis takes — **a fifth along the grain**.
 *
 * A fibre is long, so its slope along `v` is genuinely small; encoding the two
 * axes level would read as noise rather than as grain. This is the one place the
 * anisotropy of the *encoding* lives, as against the anisotropy of the lattice
 * below, and they compound.
 */
const RELIEF_ACROSS = 0.05;
const RELIEF_ALONG = 0.01;

/**
 * The fibre's shape, as the lattice spacing in texels at `FIBRE_EDGE`.
 *
 * Wildly anisotropic, because that is what a fibre *is* — a few texels across
 * the grain against most of the tile along it. Three octaves, each half the
 * spacing of the last.
 *
 * ⚠️ **Across is `u` and along is `v`, and that pairing is load-bearing.**
 * `worldSpaceUvs` puts every member's grain on the texture's `v`, so a fibre
 * laid the other way is bound at 90° to the figure it sits on — which is what
 * [#297](https://github.com/mephistopheles4/stacks/issues/297) shipped, and
 * every whole-frame number it measured sat in the normal range.
 */
const LATTICE = { across: 24, along: 192 } as const;
const OCTAVES = 3;

/**
 * FNV-1a on two integers, squashed to 0..1.
 *
 * `hash.ts`'s constants over a pair of numbers rather than over a string, so a
 * rebuild redraws the same board — `page-edges.ts`'s determinism rule, and
 * `heightFor`'s.
 */
function latticeNoise(x: number, y: number): number {
  let hash = 0x811c9dc5;
  for (const value of [x, y]) {
    for (let byte = 0; byte < 4; byte += 1) {
      hash ^= (value >>> (byte * 8)) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return (hash >>> 8) / 0x1000000;
}

/** Hermite ease, so the lattice's corners do not show as creases. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * How many lattice cells one tile is cut into, for a wanted spacing in texels.
 *
 * ⚠️ **The count is what is exact and the spacing is what gives**, which is the
 * whole of the seam fix above. A lattice of `n` cells per tile wraps on the tile
 * by construction, whatever `n` is; a lattice of a fixed *spacing* only wraps
 * when that spacing happens to divide the tile, and none of these six does.
 */
function latticeCells(spacing: number): number {
  return Math.max(1, Math.round(FIBRE_EDGE / Math.max(2, spacing)));
}

/**
 * Value noise on a wrapping lattice, with the two axes on different counts.
 *
 * `u` and `v` are tile fractions, not texels, so nothing here knows what
 * resolution it will be baked at — which is what lets a spec sample the surface
 * at 32 and get the same surface the page bakes at 256.
 */
function valueNoise(u: number, v: number, acrossCells: number, alongCells: number): number {
  const gu = u * acrossCells;
  const gv = v * alongCells;
  const u0 = Math.floor(gu);
  const v0 = Math.floor(gv);
  const fu = smooth(gu - u0);
  const fv = smooth(gv - v0);

  const at = (iu: number, iv: number): number =>
    latticeNoise(
      ((iu % acrossCells) + acrossCells) % acrossCells,
      ((iv % alongCells) + alongCells) % alongCells,
    );

  const near = at(u0, v0) * (1 - fu) + at(u0 + 1, v0) * fu;
  const far = at(u0, v0 + 1) * (1 - fu) + at(u0 + 1, v0 + 1) * fu;
  return near * (1 - fv) + far * fv;
}

/**
 * The fibre's height at a point on the tile — three octaves of the lattice
 * above, each half the spacing and half the weight.
 *
 * Periodic in both axes with period 1, deterministic, and pure. Normalised to
 * `0..1` by the weight sum so the octave count can move without changing how
 * hard the relief reads.
 */
export function fibreHeight(u: number, v: number): number {
  let total = 0;
  let weight = 0;

  for (let octave = 0; octave < OCTAVES; octave += 1) {
    const scale = 2 ** octave;
    const amplitude = 1 / scale;
    total +=
      valueNoise(u, v, latticeCells(LATTICE.across / scale), latticeCells(LATTICE.along / scale)) *
      amplitude;
    weight += amplitude;
  }

  return total / weight;
}

/**
 * The height field, one sample per texel, **in canvas row order**.
 *
 * ⚠️ **Row 0 is `v = 1`, not `v = 0`.** `CanvasTexture` defaults to `flipY`, so
 * the canvas's rows run down the image while the texture's `v` runs up it.
 * Sampling `v` backwards here is what keeps `fibreNormals`' green channel
 * pointing the way the shader will read it, and it is written as a coordinate
 * rather than as a sign on a difference because a sign is a coin toss nobody can
 * check — #297 is what an orientation nobody checked costs.
 */
export function fibreHeightField(edge: number = FIBRE_EDGE): Float32Array {
  const field = new Float32Array(edge * edge);

  for (let row = 0; row < edge; row += 1) {
    const v = 1 - (row + 0.5) / edge;
    for (let col = 0; col < edge; col += 1) {
      field[row * edge + col] = fibreHeight((col + 0.5) / edge, v);
    }
  }

  return field;
}

/**
 * The unit surface normal at every texel, three floats each, in the same order.
 *
 * A height field's normal is `normalize(-dh/du, -dh/dv, 1)`, and the derivatives
 * are plain wrapping central differences — **exact** rather than approximate at
 * the tile boundary, because `latticeCells` makes the field genuinely periodic.
 *
 * ⚠️ **No factor of the texture's own size.** The difference between two texels
 * is `dh/du` divided by `edge`, so multiplying it back by `edge` is what makes
 * this resolution-independent — and *not* dividing it out is exactly the 256×
 * gain that turned the prototype's first draft into two colours.
 */
export function fibreNormals(height: Float32Array, edge: number = FIBRE_EDGE): Float32Array {
  const normals = new Float32Array(edge * edge * 3);
  const wrap = (index: number): number => ((index % edge) + edge) % edge;
  const at = (row: number, col: number): number => height[wrap(row) * edge + wrap(col)] ?? 0;

  for (let row = 0; row < edge; row += 1) {
    for (let col = 0; col < edge; col += 1) {
      const du = ((at(row, col + 1) - at(row, col - 1)) / 2) * edge;
      // The row above is the *larger* `v`, per `fibreHeightField`'s flip.
      const dv = ((at(row - 1, col) - at(row + 1, col)) / 2) * edge;

      const nx = -du * RELIEF * RELIEF_ACROSS;
      const ny = -dv * RELIEF * RELIEF_ALONG;
      const length = Math.hypot(nx, ny, 1);

      const offset = (row * edge + col) * 3;
      normals[offset] = nx / length;
      normals[offset + 1] = ny / length;
      normals[offset + 2] = 1 / length;
    }
  }

  return normals;
}

/**
 * The one fibre map, for the life of the page.
 *
 * Module-level like `pageStriationMap`'s and the spine profile's, and for their
 * reason — the whole claim of this effect is that a bookcase of any size uploads
 * one of these, so a per-mount cache would give that away on the first rebuild.
 * Never freed by `mountShelf`'s traverse, which touches `map` and not
 * `normalMap`.
 */
let fibre: THREE.CanvasTexture | undefined;
let fibreBuilt = false;

export function woodFibreMap(): THREE.CanvasTexture | undefined {
  if (!fibreBuilt) {
    fibreBuilt = true;
    fibre = bakeFibre();
  }
  return fibre;
}

function bakeFibre(): THREE.CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = FIBRE_EDGE;
  canvas.height = FIBRE_EDGE;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const normals = fibreNormals(fibreHeightField());
  const image = ctx.createImageData(FIBRE_EDGE, FIBRE_EDGE);
  for (let texel = 0; texel < FIBRE_EDGE * FIBRE_EDGE; texel += 1) {
    const from = texel * 3;
    const to = texel * 4;
    image.data[to] = Math.round(((normals[from] ?? 0) * 0.5 + 0.5) * 255);
    image.data[to + 1] = Math.round(((normals[from + 1] ?? 0) * 0.5 + 0.5) * 255);
    image.data[to + 2] = Math.round(((normals[from + 2] ?? 1) * 0.5 + 0.5) * 255);
    image.data[to + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // A normal map carries geometry, not colour: it must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace;
  // Laid many times across a single plank, so both axes must wrap.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  texture.repeat.set(FIBRE_TILES, FIBRE_TILES);
  return texture;
}

/**
 * Put the fibre on the woodwork at `scale`, or take it off entirely at zero.
 * Returns the scale **actually in force**.
 *
 * ⚠️ **Zero short-circuits to no map bound at all**, not to a map scaled by
 * zero: off must cost nothing, rather than a texture unit and a `#define` on
 * every member of the case to say nothing. That is the rule `spine-profile.ts`
 * and `page-edges.ts` both follow, and it is what makes "off" honest.
 *
 * The return value is the other half of that honesty. A browser that will not
 * give a 2D context has no map to bind, and a knob reporting the scale it was
 * *asked* for would be `applySettings` claiming a change the eye cannot find —
 * the map's standing rule that **a control must not lie**.
 *
 * The map is a parameter with a real default for `bindWoodSheet`'s reason: G21
 * (`no-live-network`) and a Vitest project with no DOM, so a spec drives this
 * with a texture it made itself.
 *
 * ⚠️ **A thunk and not a texture, which is the difference between "off binds no
 * map" and "off costs nothing".** A default parameter is evaluated whenever the
 * argument is omitted — so passing the map itself would bake a 256-square canvas
 * on every boot that has the fibre turned off, sample it 65,536 times, and throw
 * it away. Zero must not pay for the thing it turned off.
 */
export function applyWoodFibre(
  material: THREE.MeshStandardMaterial,
  scale: number,
  map: () => THREE.Texture | null = () => woodFibreMap() ?? null,
): number {
  const wanted = scale > 0 ? map() : null;
  const inForce = wanted === null ? 0 : scale;

  if (material.normalMap !== wanted) {
    // Binding or unbinding a map changes the program's defines, so without this
    // the map is uploaded and never sampled — or stays sampled after "off".
    material.normalMap = wanted;
    material.needsUpdate = true;
  }
  material.normalScale.set(inForce, inForce);

  return inForce;
}
