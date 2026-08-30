import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  SHEET_TINT,
  WOODWORK_SHEET,
  bindWoodSheet,
  woodColour,
  worldSpaceUvs,
  type SheetLoader,
} from './woodwork.ts';
import { BACKBOARD_INSET, PLANK_INSET, SHELF } from './case.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

/**
 * ⚠️ **Not one of these fetches anything.** G21 (`no-live-network`) records any
 * request the suite makes and fails the test that made it, so the sheet's bytes
 * are never the subject: what is asserted is the **resolved URL**, through the
 * loader seam `bindWoodSheet` takes.
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
    worldSpaceUvs(plank, WOODWORK_SHEET.unitsPerTile, 'x');

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
      worldSpaceUvs(geometry, WOODWORK_SHEET.unitsPerTile, grain);

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
    worldSpaceUvs(plank, WOODWORK_SHEET.unitsPerTile, 'x');

    for (const face of [FACE.py, FACE.ny, FACE.pz, FACE.nz]) {
      const { v } = faceSpan(plank, face);
      expectNear(v * WOODWORK_SHEET.unitsPerTile, PLANK.width, `face ${String(face)}`);
    }
  });

  it("runs the grain up an upright's height, on the faces that show", () => {
    const upright = box(UPRIGHT);
    worldSpaceUvs(upright, WOODWORK_SHEET.unitsPerTile, 'y');

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
    worldSpaceUvs(plank, WOODWORK_SHEET.unitsPerTile, 'y');

    const { v } = faceSpan(plank, FACE.pz);
    expectNear(v * WOODWORK_SHEET.unitsPerTile, PLANK.height, 'front edge, grain crossed');
  });

  it('rewrites in place and tells the renderer to re-upload', () => {
    const plank = box(PLANK);
    const uv = plank.attributes['uv'];
    if (!(uv instanceof THREE.BufferAttribute)) throw new Error('uv is not a BufferAttribute');

    const before = uv.version;
    worldSpaceUvs(plank, WOODWORK_SHEET.unitsPerTile, 'x');

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
    worldSpaceUvs(wide, WOODWORK_SHEET.unitsPerTile, 'x');
    worldSpaceUvs(tight, WOODWORK_SHEET.unitsPerTile / 2, 'x');

    expectNear(faceSpan(tight, FACE.py).v, faceSpan(wide, FACE.py).v * 2, 'half the sheet size');
  });

  it('leaves a geometry with no uv attribute alone rather than throwing', () => {
    const bare = new THREE.BoxGeometry(1, 1, 1);
    bare.deleteAttribute('uv');
    expect(() => {
      worldSpaceUvs(bare, WOODWORK_SHEET.unitsPerTile, 'x');
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
});

describe('bindWoodSheet — the resolved URL, and the two ends of a load', () => {
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
    bindWoodSheet(material(), loader.load);

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
    const sheet = bindWoodSheet(wood, loader.load);

    expect(sheet.bound()).toBe(false);
    expect(wood.map).toBeNull();
    expect(wood.color.getHex()).toBe(new THREE.Color(WOODWORK_SHEET.mean).getHex());
  });

  it('binds the map and switches to white when it decodes', () => {
    const wood = material();
    const loader = fakeLoader();
    const sheet = bindWoodSheet(wood, loader.load);

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
    bindWoodSheet(wood, loader.load);
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
    const sheet = bindWoodSheet(wood, loader.load);

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
    // and Poly Haven publishes no roughness map for it at all.
    const wood = material();
    const loader = fakeLoader();
    bindWoodSheet(wood, loader.load);
    loader.settle();

    expect(wood.normalMap).toBeNull();
    expect(wood.roughnessMap).toBeNull();
  });
});
