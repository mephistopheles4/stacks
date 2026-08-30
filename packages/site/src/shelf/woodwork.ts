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
 * arrives as a *drawn* fibre in
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
