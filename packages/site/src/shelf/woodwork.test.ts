import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  BACKBOARD_SHEET,
  FIBRE_PERIOD,
  FIBRE_TILES,
  SHEET_TINT,
  WOODWORK_SHEET,
  applyWoodFibre,
  bindSheet,
  fibreHeight,
  fibreHeightField,
  fibreNormals,
  fibreTiles,
  fibreTurn,
  freshWoodSeed,
  layFibre,
  varyMember,
  woodColour,
  woodKeys,
  worldSpaceUvs,
  type Axis,
  type SheetLoader,
  type WoodKeys,
} from './woodwork.ts';
import { BACKBOARD_INSET, PLANK_INSET, SHELF } from './case.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

/**
 * ⚠️ **Not one of these fetches anything.** G21 (`no-live-network`) records any
 * request the suite makes and fails the test that made it, so the sheet's bytes
 * are never the subject: what is asserted is the **resolved URL**, through the
 * loader seam `bindSheet` takes.
 */

const ROWS = 4;
const UNIT_HEIGHT = ROWS * SHELF.rowHeight;
const OUTER_WIDTH = SHELF.width + SHELF.sideThickness * 2;

/** A member's box, in the order `BoxGeometry` takes it. */
interface Size {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** The three members, sized exactly as `buildShelf` sizes them — post-inset. */
const PLANK: Size = {
  width: OUTER_WIDTH - PLANK_INSET * 2,
  height: SHELF.plankThickness,
  depth: SHELF.depth - PLANK_INSET * 2,
};
const UPRIGHT: Size = { width: SHELF.sideThickness, height: UNIT_HEIGHT, depth: SHELF.depth };
const BACKBOARD: Size = {
  width: OUTER_WIDTH - BACKBOARD_INSET * 2,
  height: UNIT_HEIGHT - BACKBOARD_INSET * 2,
  depth: SHELF.backThickness,
};

function box(size: Size): THREE.BoxGeometry {
  return new THREE.BoxGeometry(size.width, size.height, size.depth);
}

/** `BoxGeometry`'s face order: `+X, -X, +Y, -Y, +Z, -Z`, four vertices each. */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 } as const;

/**
 * How close two UV numbers may be and still count as equal, as a **relative**
 * error.
 *
 * ⚠️ **A `uv` attribute is a `Float32Array`, so every number here has been
 * through a 24-bit mantissa on the way back out.** An upright's height of 4.48
 * reads back 1.5e-7 low — perfectly correct arithmetic, and a fixed absolute
 * tolerance tight enough for a plank's 0.07 thickness would fail on it. Relative
 * is the honest comparison, and 1e-6 is two orders inside float32's own step
 * while still an order tighter than anything a wrong axis or a dropped division
 * could hide in.
 */
const UV_TOLERANCE = 1e-6;

function near(got: number, want: number): boolean {
  return Math.abs(got - want) <= Math.max(Math.abs(want), 1) * UV_TOLERANCE;
}

function expectNear(got: number, want: number, what: string): void {
  expect(near(got, want), `${what}: ${String(got)} ≠ ${String(want)}`).toBe(true);
}

/** How far a face's four corners reach in `u` and in `v`, in texture tiles. */
function faceSpan(geometry: THREE.BoxGeometry, face: number): { u: number; v: number } {
  const uv = geometry.attributes['uv'];
  if (uv === undefined) throw new Error('geometry has no uv attribute');

  const us: number[] = [];
  const vs: number[] = [];
  for (let corner = 0; corner < 4; corner += 1) {
    us.push(uv.getX(face * 4 + corner));
    vs.push(uv.getY(face * 4 + corner));
  }
  return {
    u: Math.max(...us) - Math.min(...us),
    v: Math.max(...vs) - Math.min(...vs),
  };
}

describe('worldSpaceUvs — one map, one world-space period', () => {
  it("holds the same period on a plank's top face as on its front edge", () => {
    // The acceptance criterion, and the defect it names: `BoxGeometry` gives
    // both faces `0..1` although the top is 3.58 x 0.71 and the front edge is
    // 3.58 x 0.07, so any shared `repeat` smears the grain on one of them.
    const plank = box(PLANK);
    worldSpaceUvs(plank, WOODWORK_SHEET, 'x');

    const top = faceSpan(plank, FACE.py);
    const front = faceSpan(plank, FACE.pz);

    // A tile is `unitsPerTile` world units on every axis of every face, so
    // dividing each face's UV span by the world extent it covers gives one
    // number, six times over.
    const period = 1 / WOODWORK_SHEET.unitsPerTile;
    expectNear(top.v / PLANK.width, period, 'top face, along the plank');
    expectNear(front.v / PLANK.width, period, 'front edge, along the plank');
    expectNear(top.u / PLANK.depth, period, 'top face, across the plank');
    expectNear(front.u / PLANK.height, period, 'front edge, across the plank');

    // Which is the assertion the AC actually asks for, stated as the thing that
    // used to be false: the two faces share their long axis, so they must agree
    // on it however differently they are shaped.
    expectNear(top.v, front.v, 'top face against front edge, on the shared axis');
    // And the axis they do not share is where the ten-to-one difference lives —
    // the thing a single `repeat` cannot hold and this rewrite can.
    expect(front.u).not.toBeCloseTo(front.v, 3);
  });

  it('holds that period on every face of every member', () => {
    const members: { name: string; size: Size; grain: 'x' | 'y' }[] = [
      { name: 'plank', size: PLANK, grain: 'x' },
      { name: 'upright', size: UPRIGHT, grain: 'y' },
      { name: 'backboard', size: BACKBOARD, grain: 'y' },
    ];
    const period = 1 / WOODWORK_SHEET.unitsPerTile;

    // Per face, the pair of world extents it spans, in `BoxGeometry`'s order.
    const spans = (size: Size): [number, number][] => [
      [size.depth, size.height],
      [size.depth, size.height],
      [size.width, size.depth],
      [size.width, size.depth],
      [size.width, size.height],
      [size.width, size.height],
    ];

    const wrong: string[] = [];
    for (const { name, size, grain } of members) {
      const geometry = box(size);
      worldSpaceUvs(geometry, WOODWORK_SHEET, grain);

      for (const [face, [alongU, alongV]] of spans(size).entries()) {
        const seen = faceSpan(geometry, face);
        // The swap exchanges which world extent lands on which texture axis,
        // so the pair is compared as a set: what must be constant is the
        // period, not which axis carries which.
        const got = [seen.u, seen.v].sort((a, b) => a - b);
        const want = [alongU * period, alongV * period].sort((a, b) => a - b);
        for (const [i, value] of got.entries()) {
          if (!near(value, want[i] ?? 0)) {
            wrong.push(`${name} face ${String(face)}: ${String(value)} ≠ ${String(want[i])}`);
          }
        }
      }
    }

    expect(
      wrong,
      `faces whose world-space period is not 1/${String(WOODWORK_SHEET.unitsPerTile)}`,
    ).toEqual([]);
  });

  it("runs the grain along a plank's length, on the faces that show", () => {
    // The sheet's figure runs along its own `v`, so "the grain runs along the
    // plank" is the claim that the plank's *width* is what `v` measures — on
    // the top face and on the front edge, which are the two a visitor sees.
    const plank = box(PLANK);
    worldSpaceUvs(plank, WOODWORK_SHEET, 'x');

    for (const face of [FACE.py, FACE.ny, FACE.pz, FACE.nz]) {
      const { v } = faceSpan(plank, face);
      expectNear(v * WOODWORK_SHEET.unitsPerTile, PLANK.width, `face ${String(face)}`);
    }
  });

  it("runs the grain up an upright's height, on the faces that show", () => {
    const upright = box(UPRIGHT);
    worldSpaceUvs(upright, WOODWORK_SHEET, 'y');

    // The inner face (`±X`) and the front edge (`±Z`) are what a visitor sees
    // of an upright; both must measure its height on `v`.
    for (const face of [FACE.px, FACE.nx, FACE.pz, FACE.nz]) {
      const { v } = faceSpan(upright, face);
      expectNear(v * WOODWORK_SHEET.unitsPerTile, UPRIGHT.height, `face ${String(face)}`);
    }
  });

  it('crosses the grain when the direction is wrong, which is the control', () => {
    // Without this the two clauses above would pass on a function that always
    // swapped, or never did. A plank asked for the grain along `y` puts its
    // *thickness* on `v` — 0.07 against 3.58 — which is the smeared front edge
    // #284 named, reproduced deliberately.
    const plank = box(PLANK);
    worldSpaceUvs(plank, WOODWORK_SHEET, 'y');

    const { v } = faceSpan(plank, FACE.pz);
    expectNear(v * WOODWORK_SHEET.unitsPerTile, PLANK.height, 'front edge, grain crossed');
  });

  it('rewrites in place and tells the renderer to re-upload', () => {
    const plank = box(PLANK);
    const uv = plank.attributes['uv'];
    if (!(uv instanceof THREE.BufferAttribute)) throw new Error('uv is not a BufferAttribute');

    const before = uv.version;
    worldSpaceUvs(plank, WOODWORK_SHEET, 'x');

    expect(plank.attributes['uv']).toBe(uv);
    // `needsUpdate` is write-only on a `BufferAttribute` — it bumps `version`,
    // which is what the renderer actually reads. Asserting the flag back would
    // read `undefined` and pass on a function that never set it.
    expect(uv.version).toBe(before + 1);
    // 24 vertices, six faces of four. A rewrite that walked the wrong number
    // would leave the tail at `0..1` and smear one face in silence.
    expect(uv.count).toBe(24);
  });

  it('scales inversely with the sheet size', () => {
    // `unitsPerTile` is a property of the sheet, and halving it must double the
    // number of tiles across a member. A mutant dropping the division reads as
    // a plausible texture at the wrong scale, which nothing else here catches.
    const wide = box(PLANK);
    const tight = box(PLANK);
    worldSpaceUvs(wide, WOODWORK_SHEET, 'x');
    worldSpaceUvs(tight, { ...WOODWORK_SHEET, unitsPerTile: WOODWORK_SHEET.unitsPerTile / 2 }, 'x');

    expectNear(faceSpan(tight, FACE.py).v, faceSpan(wide, FACE.py).v * 2, 'half the sheet size');
  });

  it('leaves a geometry with no uv attribute alone rather than throwing', () => {
    const bare = new THREE.BoxGeometry(1, 1, 1);
    bare.deleteAttribute('uv');
    expect(() => {
      worldSpaceUvs(bare, WOODWORK_SHEET, 'x');
    }).not.toThrow();
  });
});

describe('woodColour — the knob is a fallback once the sheet is bound', () => {
  it('shows the knob while nothing is bound', () => {
    expect(woodColour(0x6e3412, false)).toBe(0x6e3412);
    expect(woodColour(0x123456, false)).toBe(0x123456);
  });

  it('shows white once the sheet is bound, whatever the knob says', () => {
    // A diffuse map multiplies `color`; anything but white renders the sheet
    // darker than the image that was judged.
    expect(woodColour(0x6e3412, true)).toBe(SHEET_TINT);
    expect(woodColour(0x000000, true)).toBe(SHEET_TINT);
  });

  it('is white and not merely bright', () => {
    expect(SHEET_TINT).toBe(0xffffff);
  });

  it("defaults `materials.wood` to this sheet's mean-matched hex", () => {
    // The one place the copy in `shelf-settings.ts` is held to the definition
    // here. That file has no runtime import at all and `woodwork.ts` pulls in
    // three, so the value is written out there rather than imported — this is
    // what keeps the two from drifting.
    expect(DEFAULT_SETTINGS.materials.wood).toBe(WOODWORK_SHEET.mean);

    // And it is not the old flat colour, which would render the sheet at about
    // a third of the brightness that was judged.
    expect(DEFAULT_SETTINGS.materials.wood).not.toBe(0x6b4f3a);
  });

  it("defaults `materials.woodDark` to the backboard sheet's mean-matched hex", () => {
    // The same trade, on the same terms, for the second sheet — and the only
    // thing holding the copy in `shelf-settings.ts` to this definition.
    expect(DEFAULT_SETTINGS.materials.woodDark).toBe(BACKBOARD_SHEET.mean);

    // Not the near-neutral brown it was: `dark_wood` is a saturated red-brown
    // and the backboard cannot both take a real veneer and keep the old hue.
    expect(DEFAULT_SETTINGS.materials.woodDark).not.toBe(0x4a3527);
  });

  it('leaves `backingRoughness` where it was', () => {
    // ⚠️ **Explicitly out of #304's scope, and out of #297's before it.** This
    // knob is what kills relief on this surface — the fibre reads 0.264% at
    // 0.95, 0.612% at 0.82 and 3.246% at 0.60 — so it is the value most likely
    // to be moved by somebody chasing a number that a sheet did not fix. The
    // painted shades and the whole case's read hang off it.
    expect(DEFAULT_SETTINGS.materials.backingRoughness).toBe(0.95);
  });
});

describe('the backboard takes its own sheet', () => {
  it('is a different image from the woodwork’s, served from the same directory', () => {
    expect(BACKBOARD_SHEET.url).not.toBe(WOODWORK_SHEET.url);
    expect(BACKBOARD_SHEET.url.startsWith('/wood/')).toBe(true);
    expect(BACKBOARD_SHEET.url.endsWith('.jpg')).toBe(true);
  });

  it('lays its own world size rather than the woodwork’s', () => {
    // `dark_wood`'s published sheet is 2000 mm against rosewood's 2430, so one
    // shared constant would lay this figure — and its fibre — 20% wrong.
    expect(BACKBOARD_SHEET.unitsPerTile).not.toBe(WOODWORK_SHEET.unitsPerTile);
    expect(BACKBOARD_SHEET.unitsPerTile).toBeCloseTo(6.37, 2);
  });

  it('records a figure direction that disagrees with the woodwork’s', () => {
    // The measurement, not a convention: #297's survey read `dark_wood` at 0.08
    // and sapele at 2.67. If these two ever agree, one of them was copied.
    expect(BACKBOARD_SHEET.figure).toBe('u');
    expect(WOODWORK_SHEET.figure).toBe('v');
  });

  it('runs the grain vertically on the face that shows', () => {
    // The acceptance criterion. The backboard's front face spans world `x` on
    // `u` and world `y` on `v`; with `dark_wood`'s figure on `u`, the swap has
    // to put the board's **height** on the texture's `u` for the figure to
    // stand up. A tile of this sheet is wider than the board, so the span is
    // read as a fraction rather than as a whole number of tiles.
    const board = box(BACKBOARD);
    worldSpaceUvs(board, BACKBOARD_SHEET, 'y');

    const span = faceSpan(board, FACE.pz);
    expectNear(span.u * BACKBOARD_SHEET.unitsPerTile, BACKBOARD.height, 'front face, u');
    expectNear(span.v * BACKBOARD_SHEET.unitsPerTile, BACKBOARD.width, 'front face, v');
  });

  it('lands the grain vertical from either direction a sheet could measure', () => {
    // ⚠️ **The criterion that a hard-coded swap would also pass.** A sheet whose
    // stripe ran the other way must still stand up on this board, out of the
    // same call — which is only true while the swap is read from the sheet. The
    // two sheets are laid at one size here so the *only* difference is `figure`.
    for (const figure of ['u', 'v'] as const) {
      const board = box(BACKBOARD);
      worldSpaceUvs(board, { unitsPerTile: BACKBOARD_SHEET.unitsPerTile, figure }, 'y');

      // Whichever texture axis this sheet's figure runs down is the one the
      // board's height must land on.
      const span = faceSpan(board, FACE.pz);
      const alongFigure = figure === 'u' ? span.u : span.v;
      expectNear(
        alongFigure * BACKBOARD_SHEET.unitsPerTile,
        BACKBOARD.height,
        `front face, figure on ${figure}`,
      );
    }
  });

  it('crosses the grain when the sheet’s direction is copied from the woodwork', () => {
    // The control for the spec above, and the failure it is really watching:
    // #297 shipped a whole arm matrix with the two maps at 90° and every
    // whole-frame number it produced sat in the normal range.
    const board = box(BACKBOARD);
    worldSpaceUvs(board, { ...BACKBOARD_SHEET, figure: WOODWORK_SHEET.figure }, 'y');

    const span = faceSpan(board, FACE.pz);
    expectNear(span.u * BACKBOARD_SHEET.unitsPerTile, BACKBOARD.width, 'front face, grain crossed');
  });

  it('binds its own URL and its own fallback, through the same loader seam', () => {
    const requested: string[] = [];
    const load: SheetLoader = (url) => {
      requested.push(url);
      return new THREE.Texture();
    };
    const backing = new THREE.MeshStandardMaterial({ color: BACKBOARD_SHEET.mean });
    const bound = bindSheet(backing, BACKBOARD_SHEET, load);

    expect(requested).toEqual([BACKBOARD_SHEET.url]);
    expect(bound.url).toBe(BACKBOARD_SHEET.url);
    // Nothing has decoded, so the board is still its mean-matched flat twin.
    expect(bound.bound()).toBe(false);
    expect(backing.map).toBeNull();
    expect(backing.color.getHex()).toBe(new THREE.Color(BACKBOARD_SHEET.mean).getHex());
  });

  it('leaves the backboard at its flat twin when the sheet never arrives', () => {
    // The acceptance criterion for a failed load, on the surface that is 90.38%
    // of the near frame when the shelf is empty.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let fail: () => void = () => undefined;
    const load: SheetLoader = (_url, _onLoad, onError) => {
      fail = onError;
      return new THREE.Texture();
    };
    const backing = new THREE.MeshStandardMaterial({ color: BACKBOARD_SHEET.mean });
    const bound = bindSheet(backing, BACKBOARD_SHEET, load);

    fail();

    expect(bound.bound()).toBe(false);
    expect(backing.map).toBeNull();
    expect(backing.color.getHex()).toBe(new THREE.Color(BACKBOARD_SHEET.mean).getHex());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(BACKBOARD_SHEET.url));
    warn.mockRestore();
  });
});

describe('the fibre turns to run with the sheet it sits on', () => {
  it('turns a quarter turn for a sheet whose figure runs along `u`', () => {
    // `worldSpaceUvs` puts that sheet's grain on the texture's `u`, and the
    // fibre is drawn long on `v` — so it crosses unless the map is turned.
    expect(fibreTurn(BACKBOARD_SHEET)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('leaves a sheet whose figure runs along `v` alone', () => {
    expect(fibreTurn(WOODWORK_SHEET)).toBe(0);
  });

  it('reads the turn off the sheet and not off which surface it is', () => {
    // ⚠️ The same criterion the swap has: a backboard sheet that measured `v`
    // must **not** be turned. Turning on the surface rather than on the sheet
    // is exactly the shape that hard-codes #297's defect back in.
    expect(fibreTurn({ ...BACKBOARD_SHEET, figure: 'v' })).toBe(0);
    expect(fibreTurn({ ...WOODWORK_SHEET, figure: 'u' })).toBeCloseTo(Math.PI / 2, 12);
  });

  it('turns about the tile’s centre, so a map that tiled still tiles', () => {
    // A 90° turn about (0.5, 0.5) maps the unit lattice onto itself. About a
    // corner it does not, and the seam would come back on every boundary — the
    // wrap defect this fibre's own lattice fix exists to avoid.
    const laid = layFibre(new THREE.Texture(), BACKBOARD_SHEET);

    expect(laid.center.x).toBe(0.5);
    expect(laid.center.y).toBe(0.5);
    expect(laid.rotation).toBeCloseTo(Math.PI / 2, 12);
  });

  it('lays the fibre at half a world unit on the backboard too', () => {
    // The period is a constant in **world** units, so the repeat is per sheet:
    // `worldSpaceUvs` has already divided by that sheet's own size.
    const laid = layFibre(new THREE.Texture(), BACKBOARD_SHEET);
    const tiles = BACKBOARD_SHEET.unitsPerTile / FIBRE_PERIOD;

    expect(laid.repeat.x).toBeCloseTo(tiles, 12);
    expect(laid.repeat.y).toBeCloseTo(tiles, 12);
    expect(fibreTiles(BACKBOARD_SHEET)).toBeCloseTo(tiles, 12);
    // And it is genuinely a different lay from the woodwork's, which is why the
    // backboard wears a clone rather than the shared instance.
    expect(fibreTiles(BACKBOARD_SHEET)).not.toBe(FIBRE_TILES);
  });

  it('puts one fibre tile every half world unit on the backboard’s front face', () => {
    // End to end, through both divisions: the UV rewrite by the sheet's size,
    // then the repeat back up by the fibre's. What the eye reads is this.
    const board = box(BACKBOARD);
    worldSpaceUvs(board, BACKBOARD_SHEET, 'y');

    const span = faceSpan(board, FACE.pz);
    const tiles = fibreTiles(BACKBOARD_SHEET);
    expectNear((span.u * tiles * FIBRE_PERIOD) / BACKBOARD.height, 1, 'fibre tiles per unit, u');
    expectNear((span.v * tiles * FIBRE_PERIOD) / BACKBOARD.width, 1, 'fibre tiles per unit, v');
  });
});

describe('bindSheet — the resolved URL, and the two ends of a load', () => {
  const material = (): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: WOODWORK_SHEET.mean });

  /** Records the URL and hands back the callbacks, without fetching anything. */
  function fakeLoader(): {
    load: SheetLoader;
    urls: string[];
    settle: () => void;
    fail: () => void;
  } {
    const urls: string[] = [];
    let onLoad = (): void => undefined;
    let onError = (): void => undefined;

    return {
      urls,
      load: (url, load, error) => {
        urls.push(url);
        onLoad = load;
        onError = error;
        return new THREE.Texture();
      },
      settle: () => {
        onLoad();
      },
      fail: () => {
        onError();
      },
    };
  }

  it('asks for the one sheet, once', () => {
    const loader = fakeLoader();
    bindSheet(material(), WOODWORK_SHEET, loader.load);

    expect(loader.urls).toEqual([WOODWORK_SHEET.url]);
  });

  it('names a file under the site’s public wood directory', () => {
    // The gate G52 (`sheet-size`) caps what lives in that directory; this is
    // what ties the module's URL to it, so a sheet moved out from under the cap
    // is red here rather than a 404 nobody's test sees.
    expect(WOODWORK_SHEET.url.startsWith('/wood/')).toBe(true);
    expect(WOODWORK_SHEET.url.endsWith('.jpg')).toBe(true);
  });

  it('binds no map and keeps the flat colour until the sheet decodes', () => {
    const wood = material();
    const loader = fakeLoader();
    const sheet = bindSheet(wood, WOODWORK_SHEET, loader.load);

    expect(sheet.bound()).toBe(false);
    expect(wood.map).toBeNull();
    expect(wood.color.getHex()).toBe(new THREE.Color(WOODWORK_SHEET.mean).getHex());
  });

  it('binds the map and switches to white when it decodes', () => {
    const wood = material();
    const loader = fakeLoader();
    const sheet = bindSheet(wood, WOODWORK_SHEET, loader.load);

    loader.settle();

    expect(sheet.bound()).toBe(true);
    expect(wood.map).not.toBeNull();
    expect(wood.color.getHex()).toBe(SHEET_TINT);
    // Binding a map changes the program's defines, so the material has to be
    // recompiled or the sheet is uploaded and never sampled. `needsUpdate` is
    // write-only here too; `version` is what the renderer reads.
    expect(wood.version).toBeGreaterThan(0);
  });

  it('configures the bound sheet for UVs that run past one tile', () => {
    // `worldSpaceUvs` puts every face outside `0..1`, so the default
    // `ClampToEdgeWrapping` would smear one row of texels over everything past
    // the first tile; and a diffuse map sampled as linear data renders far
    // darker than the `mean` that stands in for it.
    const wood = material();
    const loader = fakeLoader();
    bindSheet(wood, WOODWORK_SHEET, loader.load);
    loader.settle();

    expect(wood.map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(wood.map?.wrapT).toBe(THREE.RepeatWrapping);
    expect(wood.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(wood.map?.generateMipmaps).toBe(true);
    expect(wood.map?.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(wood.map?.anisotropy).toBe(16);
  });

  it('leaves a failed load showing the flat colour and no map', () => {
    // The whole reason `color` starts at the mean rather than at white: a
    // visitor whose sheet never arrives gets #284's rendered-and-accepted flat
    // arm, not a white bookcase.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wood = material();
    const loader = fakeLoader();
    const sheet = bindSheet(wood, WOODWORK_SHEET, loader.load);

    loader.fail();

    expect(sheet.bound()).toBe(false);
    expect(wood.map).toBeNull();
    expect(wood.color.getHex()).toBe(new THREE.Color(WOODWORK_SHEET.mean).getHex());
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('binds no normal map and no roughness map', () => {
    // Struck on the evidence, not deferred: rosewood's own normal map measured
    // 0.000% above the just-noticeable threshold at every rung on two sheets,
    // and Poly Haven publishes no roughness map for it at all. The relief that
    // does land is `applyWoodFibre`'s, and it is a separate call on purpose —
    // the sheet contributes nothing to the `normalMap` slot in either direction.
    const wood = material();
    const loader = fakeLoader();
    bindSheet(wood, WOODWORK_SHEET, loader.load);
    loader.settle();

    expect(wood.normalMap).toBeNull();
    expect(wood.roughnessMap).toBeNull();
  });
});

/**
 * The fibre's height field, as arithmetic.
 *
 * ⚠️ **The bake itself is not here, and cannot be.** Vitest runs under `node`
 * with no canvas, and the map is judged on renders anyway — which is exactly how
 * `page-edges.ts` and `page-edges.test.ts` already divide. What is testable, and
 * worth testing because the design argument rests on it, is the surface and the
 * way it is encoded.
 */

/** A grid coarse enough to be quick and fine enough to see the finest octave. */
const FIELD_EDGE = 64;

function at(field: Float32Array, edge: number, row: number, col: number): number {
  const wrap = (index: number): number => ((index % edge) + edge) % edge;
  return field[wrap(row) * edge + wrap(col)] ?? 0;
}

/** Mean |height difference| across each column's two neighbours, by column. */
function acrossSteps(field: Float32Array, edge: number): number[] {
  return Array.from({ length: edge }, (_, col) => {
    let total = 0;
    for (let row = 0; row < edge; row += 1) {
      total += Math.abs(at(field, edge, row, col + 1) - at(field, edge, row, col - 1));
    }
    return total / edge;
  });
}

/** The same, down the rows. */
function alongSteps(field: Float32Array, edge: number): number[] {
  return Array.from({ length: edge }, (_, row) => {
    let total = 0;
    for (let col = 0; col < edge; col += 1) {
      total += Math.abs(at(field, edge, row + 1, col) - at(field, edge, row - 1, col));
    }
    return total / edge;
  });
}

const mean = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

describe('the fibre profile', () => {
  it('is genuinely periodic on both axes, which is what the wrapping slope assumes', () => {
    // The surface this was ported from was **not**, and the defect is the same
    // one `page-edges.ts` carried in one dimension. Its lattice wrapped at
    // `round(EDGE / spacing)` cells of the spacing it was asked for, so the
    // coarsest octave closed its loop after 11 x 24 = **264** texels across a
    // **256** tile. The fix keeps the cell count exact and lets the spacing land
    // at 23.3, which is a 3% move nobody can see against a discontinuity down
    // every tile boundary that anybody could.
    for (const [u, v] of [
      [0, 0],
      [0.1, 0.25],
      [0.5, 0.5],
      [0.73, 0.07],
      [0.99, 0.99],
    ]) {
      expect(fibreHeight(u ?? 0, v ?? 0)).toBeCloseTo(fibreHeight((u ?? 0) + 1, v ?? 0), 10);
      expect(fibreHeight(u ?? 0, v ?? 0)).toBeCloseTo(fibreHeight(u ?? 0, (v ?? 0) + 1), 10);
      expect(fibreHeight(u ?? 0, v ?? 0)).toBeCloseTo(fibreHeight((u ?? 0) - 1, (v ?? 0) - 1), 10);
    }
  });

  it('has no step at either wrap that the surface does not really have', () => {
    // The consequence, stated as the number that would have gone wrong. With the
    // lattice closing on the wrong texel the seam column carries most of a full
    // noise step where its neighbours carry a fraction of one, and a normal map
    // is the *derivative* of its height field — so the seam is where a tiling
    // defect is loudest, not quietest.
    const field = fibreHeightField(FIELD_EDGE);

    const across = acrossSteps(field, FIELD_EDGE);
    expect(across[0] ?? 0).toBeLessThan(mean(across.slice(1)) * 2);

    const along = alongSteps(field, FIELD_EDGE);
    expect(along[0] ?? 0).toBeLessThan(mean(along.slice(1)) * 2);
  });

  it('is the same board on every reload', () => {
    // `Math.random()` here would give each mount a different bookcase, against
    // the rule `heightFor`'s hash exists to keep.
    const once = fibreHeightField(32);
    const again = fibreHeightField(32);
    expect([...once]).toEqual([...again]);
  });

  it('runs along the grain, which is the orientation #297 got wrong', () => {
    // A fibre is long: it varies quickly across the grain and slowly along it.
    // `worldSpaceUvs` puts every member's figure on the texture's `v`, so the
    // fibre must vary on `u` — bound the other way it sits at 90° to the sheet
    // it lies on, and #297 shipped exactly that with every whole-frame number in
    // the normal range.
    const field = fibreHeightField(FIELD_EDGE);

    expect(mean(acrossSteps(field, FIELD_EDGE))).toBeGreaterThan(
      mean(alongSteps(field, FIELD_EDGE)) * 3,
    );
  });

  it('samples the same surface at any resolution', () => {
    // The height field is in tile fractions rather than texels, which is what
    // lets a spec sample at 32 and get the surface the page bakes at 256. A
    // version that read texels would drift silently with the canvas size.
    const coarse = fibreHeightField(8);
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        // Six places, not twelve: the field is a `Float32Array`, so every value
        // has been through a 24-bit mantissa on the way back out — the same
        // reason `UV_TOLERANCE` above is relative rather than absolute.
        expect(coarse[row * 8 + col]).toBeCloseTo(
          fibreHeight((col + 0.5) / 8, 1 - (row + 0.5) / 8),
          6,
        );
      }
    }
  });
});

describe('the fibre encoding', () => {
  it('writes unit normals', () => {
    // A normal that is not unit length is a normal the shader renormalises to
    // something else, so the relief would not be the relief that was encoded.
    const normals = fibreNormals(fibreHeightField(FIELD_EDGE), FIELD_EDGE);

    let worst = 0;
    for (let texel = 0; texel < FIELD_EDGE * FIELD_EDGE; texel += 1) {
      const length = Math.hypot(
        normals[texel * 3] ?? 0,
        normals[texel * 3 + 1] ?? 0,
        normals[texel * 3 + 2] ?? 0,
      );
      worst = Math.max(worst, Math.abs(length - 1));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('pushes far harder across the grain than along it', () => {
    // Both halves compound here and both are deliberate: the lattice is eight
    // times finer across than along, and the encoding then takes a fifth of the
    // gain along. Encoding the two level would read as noise rather than grain.
    const normals = fibreNormals(fibreHeightField(FIELD_EDGE), FIELD_EDGE);

    let across = 0;
    let along = 0;
    for (let texel = 0; texel < FIELD_EDGE * FIELD_EDGE; texel += 1) {
      across += Math.abs(normals[texel * 3] ?? 0);
      along += Math.abs(normals[texel * 3 + 1] ?? 0);
    }
    expect(across).toBeGreaterThan(along * 5);
  });

  it('leaves a flat field flat rather than encoding a gain into it', () => {
    // The trap this rules out is the prototype's first draft, which multiplied
    // the slope by the texture's own edge and drove nearly every texel to the
    // rim of the hemisphere — a map of two colours, from a field of noise.
    const normals = fibreNormals(new Float32Array(16 * 16), 16);

    for (let texel = 0; texel < 16 * 16; texel += 1) {
      // `toBeCloseTo` rather than `toBe`, because a negated zero slope is `-0`
      // and `Object.is(-0, 0)` is false. It is the same normal.
      expect(normals[texel * 3] ?? 1).toBeCloseTo(0, 12);
      expect(normals[texel * 3 + 1] ?? 1).toBeCloseTo(0, 12);
      expect(normals[texel * 3 + 2] ?? 0).toBeCloseTo(1, 12);
    }
  });

  it('encodes the same slope whatever it is baked at', () => {
    // The `edge` factor cancels the per-texel difference, so the surface's
    // steepness is a property of the surface. A mutant dropping it reads as a
    // plausible map whose relief silently depends on the canvas size.
    const ramp = (edge: number): Float32Array => {
      const field = new Float32Array(edge * edge);
      // A single full-tile cosine, so both grids sample one shape.
      for (let row = 0; row < edge; row += 1) {
        for (let col = 0; col < edge; col += 1) {
          field[row * edge + col] = Math.cos(((col + 0.5) / edge) * Math.PI * 2);
        }
      }
      return field;
    };

    const steepest = (normals: Float32Array): number => {
      let worst = 0;
      for (let texel = 0; texel * 3 < normals.length; texel += 1) {
        worst = Math.max(worst, Math.abs(normals[texel * 3] ?? 0));
      }
      return worst;
    };

    const ratio = steepest(fibreNormals(ramp(32), 32)) / steepest(fibreNormals(ramp(256), 256));

    // ⚠️ **Within 5%, and the slack is not laziness.** A central difference over
    // a cosine understates its own derivative, by more at 32 samples than at
    // 256, and no two texel centres on the two grids land on the same point of
    // the curve — so a couple of percent is the discretisation and belongs here.
    // What the bound rules out is the defect: a missing or doubled `edge` factor
    // puts these **eight times** apart, not one part in a hundred.
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });
});

describe('applyWoodFibre — the knob, and what off costs', () => {
  const material = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();
  const map = (): THREE.Texture => new THREE.Texture();

  it('binds no normal map at all at zero', () => {
    // Asserted rather than assumed, `spine-profile.test.ts`'s rule: off has to
    // short-circuit to *no map*, not to a map scaled by zero. A flat map is a
    // texture unit and a `#define` on every member of the case, all to say
    // nothing.
    const wood = material();

    expect(applyWoodFibre(wood, 0, () => map())).toBe(0);
    expect(wood.normalMap).toBeNull();
    expect(wood.normalScale.x).toBe(0);
  });

  it('binds the map and takes the scale above zero', () => {
    const wood = material();
    const fibre = map();

    expect(applyWoodFibre(wood, 0.5, () => fibre)).toBe(0.5);
    expect(wood.normalMap).toBe(fibre);
    expect(wood.normalScale.x).toBe(0.5);
    expect(wood.normalScale.y).toBe(0.5);
  });

  it('takes the map off again when the knob returns to zero', () => {
    // The other direction, which is the one a live panel actually walks. Binding
    // or unbinding changes the program's defines, so without a recompile the
    // shelf keeps sampling a map the settings say is gone.
    const wood = material();
    applyWoodFibre(wood, 1.2, () => map());
    const compiled = wood.version;

    expect(applyWoodFibre(wood, 0, () => map())).toBe(0);
    expect(wood.normalMap).toBeNull();
    // `needsUpdate` is write-only on a material; `version` is what the renderer
    // reads, so asserting the flag back would pass on a function that never set
    // it.
    expect(wood.version).toBeGreaterThan(compiled);
  });

  it('does not recompile for a scale that only moves', () => {
    // A recompile per tick of a live slider is what the fog comment in
    // `scene.ts` records as the cost of doing this unconditionally.
    const wood = material();
    const fibre = map();
    applyWoodFibre(wood, 0.5, () => fibre);
    const compiled = wood.version;

    applyWoodFibre(wood, 1.5, () => fibre);

    expect(wood.normalScale.x).toBe(1.5);
    expect(wood.version).toBe(compiled);
  });

  it('reports the scale in force, not the scale it was asked for', () => {
    // A browser that will not give a 2D context has no map to bind. Returning
    // the requested number would be `applySettings` claiming a change the eye
    // cannot find — the standing rule that a control must not lie.
    //
    // A thunk yielding nothing, rather than the map itself: the default is a
    // thunk so that zero never bakes a canvas it is about to throw away, and
    // standing in for it here is what makes this branch reachable at all.
    const wood = material();

    expect(applyWoodFibre(wood, 0.5, () => null)).toBe(0);
    expect(wood.normalMap).toBeNull();
    expect(wood.normalScale.x).toBe(0);
  });

  it('never asks for the map at zero, so off does not bake one', () => {
    // The distance between "off binds no map" and "off costs nothing". The map
    // is a thunk precisely because a plain default parameter is evaluated
    // whenever the argument is omitted — so a page booted with the fibre off
    // would draw a 256-square canvas, sample it 65,536 times and discard it.
    const asked = vi.fn(() => new THREE.Texture());

    applyWoodFibre(material(), 0, asked);

    expect(asked).not.toHaveBeenCalled();
  });

  it('ships the fibre on by default', () => {
    expect(DEFAULT_SETTINGS.materials.woodFibre).toBe(0.5);
  });
});

describe('the fibre period — a constant, laid over the sheet', () => {
  it('lays one fibre tile every 0.5 world units on every face of every member', () => {
    // `worldSpaceUvs` has already divided by the *sheet's* size, so the fibre's
    // `repeat` is what converts those UVs to its own period out of one set of
    // UVs and with no second file. A wrong `repeat` here is a plausible-looking
    // grain at the wrong scale, which nothing else would catch.
    const members: { name: string; size: Size; grain: 'x' | 'y' }[] = [
      { name: 'plank', size: PLANK, grain: 'x' },
      { name: 'upright', size: UPRIGHT, grain: 'y' },
    ];

    for (const { name, size, grain } of members) {
      const geometry = box(size);
      worldSpaceUvs(geometry, WOODWORK_SHEET, grain);

      // The face a visitor sees most of: a plank's top, an upright's front edge.
      const span = faceSpan(geometry, grain === 'x' ? FACE.py : FACE.pz);
      const along = grain === 'x' ? size.width : size.height;

      expectNear((span.v * FIBRE_TILES) / along, 1 / FIBRE_PERIOD, `${name}, along the grain`);
    }
  });

  it('is half a world unit, and says so as a number rather than a repeat', () => {
    // #284's 0.3 lead was never rendered, so it is not a second value this may
    // quietly drift to. The tile count is derived from the sheet's world size —
    // a literal 15.36 here would be two copies of one fact.
    expect(FIBRE_PERIOD).toBe(0.5);
    expect(FIBRE_TILES).toBe(WOODWORK_SHEET.unitsPerTile / FIBRE_PERIOD);
  });
});

/* -------------------------------------------------------------------------- */
/*  the per-member variation                                                   */
/* -------------------------------------------------------------------------- */

/** Every UV and every colour a member ended up with, as plain numbers. */
function snapshot(geometry: THREE.BoxGeometry): { uv: number[]; colour: number[] } {
  const uv = geometry.attributes['uv'];
  const colour = geometry.attributes['color'];
  return {
    uv: uv === undefined ? [] : Array.from(uv.array as ArrayLike<number>),
    colour: colour === undefined ? [] : Array.from(colour.array as ArrayLike<number>),
  };
}

/** A varied plank, laid the way `buildShelf` lays one. */
function varied(key: string, size: Size = PLANK, grain: Axis = 'x'): THREE.BoxGeometry {
  const geometry = box(size);
  worldSpaceUvs(geometry, WOODWORK_SHEET, grain);
  varyMember(geometry, key);
  return geometry;
}

describe('varyMember', () => {
  it('gives the same key the same board twice', () => {
    // The seed is the harness's whole instrument: two frames must differ by the
    // arm under test and not by the dice. #298's canary is this assertion.
    expect(snapshot(varied('seed:plank-2'))).toEqual(snapshot(varied('seed:plank-2')));
  });

  it('gives two members of one case different boards', () => {
    expect(snapshot(varied('seed:plank-2'))).not.toEqual(snapshot(varied('seed:plank-3')));
  });

  it('moves the whole set when the root moves', () => {
    expect(snapshot(varied('one:plank-2'))).not.toEqual(snapshot(varied('two:plank-2')));
  });
});

/**
 * The five dice, read back off the geometry rather than off the module.
 *
 * ⚠️ **Recovered, not recomputed.** `varyMember` writes an affine map of the
 * UVs, and an affine map in two dimensions is fixed by where it sends three
 * non-collinear points — so the four corners of one face, before and after,
 * determine it exactly. Decoding it that way is an independent source of truth:
 * it can disagree with the code, which an assertion that re-ran the same
 * arithmetic could not.
 *
 * `A = R(runout) · diag(scaleU · mirror, scaleV)`, so its second column is
 * `scaleV · (−sin, cos)` — the turn falls straight out of it with no sign
 * ambiguity, and the mirror then falls out of the first.
 */
function readDice(before: THREE.BoxGeometry, after: THREE.BoxGeometry) {
  const from = before.attributes['uv'];
  const to = after.attributes['uv'];
  if (from === undefined || to === undefined) throw new Error('no uvs');

  // Face +Z, whose four corners span the member's own width and height.
  const corner = (n: number) => ({
    p: [from.getX(FACE.pz * 4 + n), from.getY(FACE.pz * 4 + n)] as const,
    q: [to.getX(FACE.pz * 4 + n), to.getY(FACE.pz * 4 + n)] as const,
  });
  const o = corner(0);
  const a = corner(1);
  const b = corner(2);

  // Two independent displacements, and the 2x2 they pin down.
  const d1 = [a.p[0] - o.p[0], a.p[1] - o.p[1]] as const;
  const d2 = [b.p[0] - o.p[0], b.p[1] - o.p[1]] as const;
  const e1 = [a.q[0] - o.q[0], a.q[1] - o.q[1]] as const;
  const e2 = [b.q[0] - o.q[0], b.q[1] - o.q[1]] as const;
  const det = d1[0] * d2[1] - d1[1] * d2[0];
  const solve = (y1: number, y2: number) => [
    (y1 * d2[1] - y2 * d1[1]) / det,
    (d1[0] * y2 - d2[0] * y1) / det,
  ];
  const [a00, a01] = solve(e1[0], e2[0]) as [number, number];
  const [a10, a11] = solve(e1[1], e2[1]) as [number, number];

  const runout = Math.atan2(-a01, a11);
  return {
    runout,
    mirror: Math.sign(a00 * Math.cos(runout) + a10 * Math.sin(runout)),
    scaleU: Math.hypot(a00, a10),
    scaleV: Math.hypot(a01, a11),
    offset: [o.q[0] - (a00 * o.p[0] + a01 * o.p[1]), o.q[1] - (a10 * o.p[0] + a11 * o.p[1])],
  };
}

function diceFor(key: string) {
  const before = box(PLANK);
  worldSpaceUvs(before, WOODWORK_SHEET, 'x');
  return readDice(before, varied(key));
}

/** The tint every vertex of a member carries. */
function tintOf(geometry: THREE.BoxGeometry): number[] {
  const colour = geometry.attributes['color'];
  if (colour === undefined) throw new Error('no colour attribute');
  return Array.from(colour.array as ArrayLike<number>);
}

/** Enough members to see both faces of a coin land. */
const KEYS = Array.from({ length: 40 }, (_, n) => `spread:plank-${String(n)}`);

describe('the five dice', () => {
  it('keeps every tint inside ±10%', () => {
    for (const key of KEYS) {
      for (const value of tintOf(varied(key))) {
        expect(value).toBeGreaterThanOrEqual(0.9);
        expect(value).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('tints a member evenly, so no board has a gradient across it', () => {
    const tints = new Set(tintOf(varied('spread:plank-1')));
    expect(tints.size).toBe(1);
  });

  it('reaches both sides of the tint', () => {
    const tints = KEYS.map((key) => tintOf(varied(key))[0] ?? 1);
    expect(tints.some((value) => value < 1)).toBe(true);
    expect(tints.some((value) => value > 1)).toBe(true);
  });

  it('keeps every runout inside about 3.4°', () => {
    for (const key of KEYS) {
      // 0.06 rad. A board cut slightly off true; beyond about five degrees it
      // reads as a texture pasted on crooked, which is what it exists to fix.
      expect(Math.abs(diceFor(key).runout)).toBeLessThanOrEqual(0.06);
    }
  });

  it('saws some boards each way off true', () => {
    const runouts = KEYS.map((key) => diceFor(key).runout);
    expect(runouts.some((value) => value < 0)).toBe(true);
    expect(runouts.some((value) => value > 0)).toBe(true);
  });

  it('reaches a mirrored board and an unmirrored one', () => {
    const mirrors = KEYS.map((key) => diceFor(key).mirror);
    expect(mirrors).toContain(-1);
    expect(mirrors).toContain(1);
  });

  it('scales the two axes independently, so no two members repeat in step', () => {
    for (const key of KEYS) {
      const { scaleU, scaleV } = diceFor(key);
      expect(scaleU).toBeGreaterThanOrEqual(0.91);
      expect(scaleU).toBeLessThanOrEqual(1.09);
      expect(scaleV).toBeGreaterThanOrEqual(0.91);
      expect(scaleV).toBeLessThanOrEqual(1.09);
    }
    // A shared scale would leave the lattice square and two members still
    // repeating in step; these are two draws, so they part.
    const { scaleU, scaleV } = diceFor('spread:plank-1');
    expect(scaleU).not.toBeCloseTo(scaleV, 6);
  });

  it('cuts each board from somewhere else in the sheet', () => {
    const offsets = KEYS.slice(0, 8).map((key) => String(diceFor(key).offset));
    expect(new Set(offsets).size).toBe(8);
  });
});

describe('woodKeys', () => {
  it('carries the root on the backboard', () => {
    // ⚠️ Asserted **directly**, and it is the one assertion here that exists
    // because of a defect that renders correctly. The prototype's backboard key
    // was the bare word, so a forced seed moved every plank and upright and left
    // the backboard fixed — and the backboard is 90.38% of the near frame, so a
    // differ comparing two seeds under-reported by one member and nothing looked
    // wrong.
    expect(woodKeys('abc', 4).backboard).toBe('abc:backboard');
  });

  it('carries the root on every member', () => {
    for (const key of allKeys(woodKeys('abc', 4))) expect(key.startsWith('abc:')).toBe(true);
  });

  it('names one plank per shelf plus the lid', () => {
    // `buildShelf` runs `row <= rowCount`, so the top plank is a lid that never
    // holds a book. Five planks for four rows.
    expect(woodKeys('abc', 4).planks).toHaveLength(5);
  });

  it('gives every member of one case its own key', () => {
    const keys = allKeys(woodKeys('abc', 4));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('moves every one of them when the root moves', () => {
    const before = allKeys(woodKeys('one', 4));
    const after = allKeys(woodKeys('two', 4));
    for (const [n, key] of before.entries()) expect(after[n]).not.toBe(key);
  });
});

function allKeys(keys: WoodKeys): string[] {
  return [keys.backboard, keys.uprightLeft, keys.uprightRight, ...keys.planks];
}

describe('freshWoodSeed', () => {
  it('draws a different root every time, because a member has no identity', () => {
    // #287's promise is one page load only, so two loads of the shipped shelf
    // differ. Not a length assertion: base 36 drops trailing zeros.
    expect(freshWoodSeed()).not.toBe(freshWoodSeed());
  });

  it('never draws an empty root', () => {
    for (let n = 0; n < 200; n += 1) expect(freshWoodSeed()).not.toBe('');
  });
});
