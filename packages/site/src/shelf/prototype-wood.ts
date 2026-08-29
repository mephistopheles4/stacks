/**
 * PROTOTYPE ONLY — wayfinder ticket #284, "Which channel makes the woodwork
 * read as wood — pigment, relief, or both?", under map #280. Never merged to
 * `main`, and deliberately not wired to `ShelfSettings`, `applySettings` or the
 * debug panel: those are the standing rules for the treatment that eventually
 * *ships*, and this is a branch that never does.
 *
 * Drive it with `?wood=<arm>` — the owner judges on a live build, which #282
 * settled, so the arms have to be reachable by hand and not only by the render
 * script.
 *
 *     ?wood=pigment          the sapele diffuse in `map`
 *     ?wood=relief           the sapele normal in `normalMap`
 *     ?wood=both             both
 *     ?wood=rough            the sapele roughness in `roughnessMap`
 *     ?wood=flat             no map at all, at the diffuse map's own mean colour
 *     ?wood=wire             the wiring check — every channel driven past plausible
 *     ?wood=pigment2k        the pigment arm at 2048 instead of 512
 *     ?wood=off  (default)   today's shelf
 *
 * `?woodTile=<units>` and `?woodNormal=<scale>` open the two numbers below to a
 * live hand, because a still argues about them and a mouse settles them.
 *
 * ## The three decisions this file makes, and why each is a finding
 *
 * 1. **The UVs are rewritten to world space, per box face.** `BoxGeometry`
 *    gives every face `0..1`, so one shared `repeat` cannot be right for two
 *    faces of different sizes — a plank's top face is `3.58 x 0.72` and its
 *    front edge is `3.58 x 0.07`, a ten-to-one difference on the axis they do
 *    not share. Left alone, the grain smears vertically on the front edge:
 *    exactly the surface #284 names as the most plastic-looking one today, so
 *    the arm would have been judged on an artefact of the UVs rather than on
 *    the channel. Rewritten, one map holds a constant world-space period on
 *    every face of every member. ⚠️ **This is the map's own "grain's
 *    world-space period" fog, met rather than solved** — it makes the period
 *    constant across the *members that exist*, and says nothing about what
 *    happens when the library grows an upright taller.
 * 2. **The texture's grain runs along its `v` axis**, which is a fact about
 *    the downloaded image and not a convention: the sapele veneer's stripes run
 *    top to bottom. So a face whose long axis is `u` gets its two axes swapped,
 *    which is what puts the grain along a plank's length and up an upright's
 *    height rather than across either. ⚠️ **That choice belongs to #285**, which
 *    owns which way the grain runs on each member. It is made here because a
 *    render needs *some* answer, and crosswise grain on every plank would have
 *    sunk every arm for a reason that is not the channel.
 * 3. **One material, one texture set, for planks and uprights alike.** Giving
 *    the uprights their own `repeat` means cloning the textures, and a cloned
 *    `THREE.Texture` uploads its own copy to the GPU — the cost the arms are
 *    supposed to be measuring. World-space UVs get the same result for +0
 *    textures.
 */
import * as THREE from 'three';
import { hashUnit } from './hash.ts';

/** Which arm is mounted. `off` is today's shelf. */
export type WoodArm =
  | 'off'
  | 'pigment'
  | 'relief'
  | 'both'
  | 'rough'
  | 'flat'
  | 'wire'
  | 'pigment2k';

const ARMS: readonly WoodArm[] = [
  'off',
  'pigment',
  'relief',
  'both',
  'rough',
  'flat',
  'wire',
  'pigment2k',
];

/**
 * The mean-matched flat twin's colour, computed by
 * `scripts/prototype-wood-maps.ts` from the decoded **512** diffuse map.
 *
 * ⚠️ **Computed in linear light, not by averaging the sRGB bytes.** Shading
 * multiplies a linear albedo by a linear radiance, so the flat colour that
 * renders to the same average as the map is `linearToSRGB(mean(sRGBToLinear))`.
 * The naive average lands `0xc68059`, one step off in green — small here
 * because this veneer is nearly uniform, and not small in general.
 *
 * ⚠️ **It matches the 512 map, which is what `pigment` and `both` bind.** The
 * `pigment2k` arm is a *resolution* control and is deliberately differenced
 * against `pigment`, never against this.
 */
export const SAPELE_MEAN = 0xc68159;

/**
 * The two sheets, and the trade between them that only shows once both are laid
 * at their true size.
 *
 * `unitsPerTile` is how many world units one tile of the map covers. This
 * scene's unit is about 0.30 m — `MAX_HEIGHT` is 0.95 for a book that would
 * stand about 290 mm — so a sheet's published millimetres convert directly, and
 * each veneer is laid at the size it really is rather than at whatever looked
 * nice.
 *
 * ⚠️ **A bigger sheet buys away the tiling and pays for it in texels.** At a
 * fixed 512, sapele's 500 mm sheet gives about 320 texels per world unit and
 * repeats about 2.2 times along a 3.58-unit plank; rosewood's 2430 mm sheet
 * gives about 67 and never repeats on this case at all, because one tile is
 * wider than the whole bookcase. So the species choice and the resolution
 * choice are **not independent**, which #281 could not have known — it settled
 * 512 on `MAX_COVER_EDGE`'s precedent while looking at four plain veneers of
 * roughly one size.
 *
 * ⚠️ **`mean` is each sheet's own mean-matched flat twin**, computed in linear
 * light by `scripts/prototype-wood-maps.ts` from its **512** map. Rosewood's
 * `0x6e3311` is close to today's `0x6b4f3a` and sapele's `0xc68159` is not,
 * which is why the sapele arms move a fifth of the frame before any grain is
 * involved and the rosewood arms will not.
 */
const SPECIES = {
  sapele: { prefix: 'sapele', unitsPerTile: 1.6, mean: SAPELE_MEAN, rough: true },
  rosewood: { prefix: 'rosewood', unitsPerTile: 7.68, mean: 0x6e3311, rough: false },
} as const;

export type Species = keyof typeof SPECIES;

const SPECIES_NAMES = Object.keys(SPECIES) as readonly Species[];

/** `page-edges.ts`'s number, and for its reason: these faces graze the key light. */
const ANISOTROPY = 16;

/**
 * How far a member is pulled back off a plane another member already owns.
 *
 * ⚠️ **This is a fix for a defect that predates every arm here, and the arms
 * are what made it visible.** Every member of the bookcase is a box, and boxes
 * that share a plane tie in the depth buffer. `scripts/prototype-coplanar.ts`
 * enumerates them: on today's geometry there are **46 coplanar, overlapping
 * face pairs**, at a camera whose near and far are 0.1 and 100 — a thousand to
 * one — so the two faces trade places frame by frame while the camera moves and
 * settle into whichever won when it stops. That is precisely what the owner
 * reported, twice: once at the plank ends and once at the backboard.
 *
 * It is invisible on `main` because every one of those faces carries the same
 * flat colour and the tie resolves to the same pixel either way. Give them
 * different UVs and the tie becomes a flicker. **A texture did not cause this;
 * it revealed it.** The backboard's own pairs flicker on `main` already,
 * because the backboard is a *second* material in `woodDark`.
 *
 * ⚠️ **Fixing only the pair somebody points at leaves 36 of them.** The first
 * pass here shortened the planks in `x` and cleared 10 — and left the plank
 * *front and back* faces tied against the uprights at `z = ±0.36`, which
 * nobody had looked at, plus every backboard pair. So the rule is applied to
 * the class: the uprights keep every plane they have, and each other member is
 * shrunk off the planes the uprights own.
 *
 * - **Planks** shrink in `x` and in `z` — ends inside the uprights, front and
 *   back faces just behind the uprights'.
 * - **The backboard** shrinks in `x` and in `y` — sides inside the uprights,
 *   top and bottom clear of theirs.
 *
 * 0.004 units is about 1.2 mm at this scene's scale, against an upright 0.09
 * thick — so every shortened face sits well inside a neighbour's volume where
 * nothing can see it, and the silhouette does not move.
 */
export const PLANK_INSET = 0.004;

/** How much of the tile's own range one member's offset may wander. */
const OFFSET_SPREAD = 1;
/** Half-range of the per-member scale jitter, as a fraction. */
const SCALE_SPREAD = 0.09;
/** Half-range of the per-member tint, as a linear multiplier. */
const TINT_SPREAD = 0.1;

export interface WoodArmConfig {
  readonly arm: WoodArm;
  readonly unitsPerTile: number;
  readonly normalScale: number;
  /** 0 turns every per-member difference off; 1 is the full spread above. */
  readonly vary: number;
  /** `inset` shortens the planks off the uprights' outer face; `flush` is today's geometry. */
  readonly joint: 'inset' | 'flush';
  readonly species: Species;
}

/** Reads `?wood=`, `?woodTile=`, `?woodNormal=`, `?woodVary=` and `?woodJoint=`. */
export function readWoodArm(search: string): WoodArmConfig {
  const params = new URLSearchParams(search);
  const raw = params.get('wood');
  const arm = ARMS.find((candidate) => candidate === raw) ?? 'off';
  const number = (key: string, fallback: number): number => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const varyRaw = Number(params.get('woodVary'));
  const speciesRaw = params.get('woodSpecies');
  const species = SPECIES_NAMES.find((name) => name === speciesRaw) ?? 'sapele';
  return {
    species,
    arm,
    unitsPerTile: number('woodTile', SPECIES[species].unitsPerTile),
    normalScale: number('woodNormal', arm === 'wire' ? 4 : 1),
    vary: Number.isFinite(varyRaw) && varyRaw >= 0 ? Math.min(varyRaw, 1) : 1,
    joint: params.get('woodJoint') === 'flush' ? 'flush' : 'inset',
  };
}

/**
 * Rewrite a `BoxGeometry`'s UVs so one map holds a constant world-space period
 * on every one of its six faces.
 *
 * `BoxGeometry` lays its faces out in a fixed order — `+X, -X, +Y, -Y, +Z, -Z`
 * — four vertices each, with `u` and `v` running `0..1` across whichever two
 * world axes that face spans. Multiplying each face's UVs by that face's own
 * world extent, over `unitsPerTile`, turns the shared `0..1` into a shared
 * world-space scale.
 *
 * `swapAxes` exchanges `u` and `v` before scaling, which is decision 2 in the
 * header: the veneer's grain runs down its `v` axis, so a member whose long
 * axis lands on `u` needs the swap to have the grain run along it.
 */
export function worldSpaceUvs(
  geometry: THREE.BoxGeometry,
  size: { x: number; y: number; z: number },
  unitsPerTile: number,
  swapAxes: boolean,
): void {
  // Per face, in `BoxGeometry`'s own order: which world extent `u` spans, and
  // which one `v` spans.
  const spans: readonly [number, number][] = [
    [size.z, size.y], // +X
    [size.z, size.y], // -X
    [size.x, size.z], // +Y
    [size.x, size.z], // -Y
    [size.x, size.y], // +Z
    [size.x, size.y], // -Z
  ];

  const uv = geometry.attributes['uv'];
  if (uv === undefined) return;

  for (let face = 0; face < spans.length; face += 1) {
    const [spanU, spanV] = spans[face] ?? [1, 1];
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      const u = uv.getX(index);
      const v = uv.getY(index);
      // The swap happens in UV space, before scaling, so the extent that ends
      // up on the texture's `v` axis is the one the grain will run along.
      const [outU, outV] = swapAxes ? [v, u] : [u, v];
      const [scaleU, scaleV] = swapAxes ? [spanV, spanU] : [spanU, spanV];
      uv.setXY(index, (outU * scaleU) / unitsPerTile, (outV * scaleV) / unitsPerTile);
    }
  }
  uv.needsUpdate = true;
}

/**
 * Make one member's boards differ from its neighbours', for **+0 textures, +0
 * materials and +0 draw calls**.
 *
 * The owner's report was that the case reads uniform, and it has two causes
 * that want separating because only one of them is about the asset:
 *
 * 1. **The sheet itself is plain.** `sapele_veneer` is a flat-sliced veneer with
 *    fine, low-contrast stripe and no figure. Nothing done per member fixes
 *    that; it wants a different sheet, or a procedure.
 * 2. **Every member shows the same sheet at the same phase.** Six boards
 *    carrying one map at one offset is one board photocopied six times, which
 *    the eye reads instantly. That is this function's half, and it is free.
 *
 * Four differences, none of which is a second texture:
 *
 * - **Offset** — where in the sheet this member's board was cut from.
 * - **Mirror** — veneers are book-matched in life, and a flipped sheet is the
 *   cheapest way to stop a tiling seam repeating identically down the case.
 * - **Scale** — ±9%, so the grain's period is not the same on two boards.
 * - **Tint** — ±10%, through a **vertex colour**, which is the one that needs
 *   saying: a per-member `THREE.Color` would need a per-member *material*, and
 *   that is +1 draw call each. A colour attribute rides the geometry every
 *   member already has its own copy of, so one material still draws them all.
 *   `scene.ts`'s per-book page-block drift is the same trick.
 *
 * ⚠️ **The seed is the member's distance from the *bottom*, and that choice is
 * [#287](https://github.com/mephistopheles4/stacks/issues/287)'s to make, not
 * this file's.** `rowsForCase` keeps one empty shelf ahead, so the case grows
 * upward as the library does — seeding from a top-down index would repaint
 * every plank in the case the day a book is added, which is exactly the trap
 * that ticket exists to spring safely. Bottom-up is stable under growth. It is
 * still only *a* answer: it says a plank's identity is its height off the
 * floor, and a plank that is genuinely the same board would keep its figure if
 * the case were rebuilt taller — which this does, and which nothing here proves
 * is what anybody wants.
 */
export function varyMember(
  geometry: THREE.BoxGeometry,
  seed: string,
  strength: number,
): void {
  const uv = geometry.attributes['uv'];
  const position = geometry.attributes['position'];
  if (uv === undefined || position === undefined) return;

  // Three draws off one hash, decorrelated by prefix — the same shape
  // `books.ts` uses for a book's height and its spine colour.
  const offsetU = hashUnit(`${seed}-u`);
  const offsetV = hashUnit(`${seed}-v`);
  const mirror = hashUnit(`${seed}-mirror`) < 0.5 ? -1 : 1;
  const scale = 1 + (hashUnit(`${seed}-scale`) - 0.5) * 2 * SCALE_SPREAD * strength;
  const tint = 1 + (hashUnit(`${seed}-tint`) - 0.5) * 2 * TINT_SPREAD * strength;

  for (let index = 0; index < uv.count; index += 1) {
    const u = uv.getX(index) * scale * mirror + offsetU * OFFSET_SPREAD * strength;
    const v = uv.getY(index) * scale + offsetV * OFFSET_SPREAD * strength;
    uv.setXY(index, u, v);
  }
  uv.needsUpdate = true;

  // ⚠️ A colour attribute is read as **linear**, unlike `material.color`, which
  // three.js decodes from sRGB. A multiplier near 1 is the same number in
  // either space, which is why this is a multiplier and not a colour.
  const colours = new Float32Array(position.count * 3);
  colours.fill(tint);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

function configure(texture: THREE.Texture, colour: boolean): THREE.Texture {
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  return texture;
}

/**
 * Bind an arm's maps onto the woodwork material.
 *
 * Asynchronous, because a file is a file. `window.__woodReady` goes true when
 * every map an arm asked for has decoded and the material has been recompiled,
 * so the render script waits on the same signal a person's eye does rather than
 * on a timeout. ⚠️ **Without it, "the arm is invisible" and "the arm had not
 * loaded yet" are the same screenshot** — the failure #68 records under a
 * different name.
 */
export function applyWoodArm(
  material: THREE.MeshStandardMaterial,
  config: WoodArmConfig,
): void {
  // Every mesh wearing this material gets a colour attribute in `varyMember`,
  // so the flag is safe to raise for the whole material at once.
  if (config.vary > 0) material.vertexColors = true;

  const done = (): void => {
    material.needsUpdate = true;
    (window as unknown as { __woodReady?: boolean }).__woodReady = true;
  };

  if (config.arm === 'off') {
    done();
    return;
  }

  const sheet = SPECIES[config.species];

  if (config.arm === 'flat') {
    material.color.setHex(sheet.mean);
    done();
    return;
  }

  const loader = new THREE.TextureLoader();
  const size = config.arm === 'pigment2k' ? '2k' : '512';
  const pending: Promise<unknown>[] = [];

  // `TextureLoader.load` returns the `Texture` immediately and fills its image
  // in later, so the material can hold it now and the promise only reports
  // *when* it decoded. One request per map — resolving inside the callback and
  // calling `load` a second time for the return value would fetch each twice,
  // and the byte cost this ticket reports would then be a lie.
  const load = (file: string, colour: boolean): THREE.Texture => {
    let settle: () => void = () => undefined;
    pending.push(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const texture = loader.load(
      `/wood/${file}`,
      () => {
        settle();
      },
      undefined,
      () => {
        console.warn(`[prototype-wood] ${file} failed to load`);
        settle();
      },
    );
    return configure(texture, colour);
  };

  const wantsPigment =
    config.arm === 'pigment' || config.arm === 'both' || config.arm === 'wire' || config.arm === 'pigment2k';
  const wantsRelief = config.arm === 'relief' || config.arm === 'both' || config.arm === 'wire';
  const wantsRough = config.arm === 'rough' || config.arm === 'wire';

  if (wantsPigment) {
    material.map = load(`${sheet.prefix}-diff-${size}.jpg`, true);
    // ⚠️ `map` **multiplies** `color`, and `color` is today's dark `0x6b4f3a`.
    // Left alone every pigment arm renders at a third of the texture's own
    // brightness, and the mean-matched twin then matches nothing. White is the
    // only value that lets the map speak for itself.
    material.color.setHex(0xffffff);
  }
  if (wantsRelief) {
    material.normalMap = load(`${sheet.prefix}-nor-512.jpg`, false);
    material.normalScale = new THREE.Vector2(config.normalScale, config.normalScale);
  }
  // ⚠️ Only sapele ships a roughness map. Asking for `?wood=rough` on a sheet
  // that has none would 404 and read as an arm that did nothing — the exact
  // ambiguity the wiring check exists to remove — so it is refused out loud.
  if (wantsRough) {
    if (sheet.rough) material.roughnessMap = load(`${sheet.prefix}-rough-512.jpg`, false);
    else console.warn(`[prototype-wood] ${config.species} ships no roughness map`);
  }

  if (config.arm === 'wire') {
    // The wiring check, and it is meant to be ugly: #68 established that
    // "invisible" and "never bound" are the same screenshot, so one arm drives
    // every channel past anything anybody would ship. If this one also looks
    // like today's shelf, nothing bound and no other arm's zero means anything.
    material.color.setHex(0xff4488);
    material.roughness = 0.2;
  }

  void Promise.all(pending).then(done, done);
}
