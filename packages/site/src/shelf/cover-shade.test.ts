import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';

import { MAX_HEIGHT, toRows, type ShelfRow } from './books.ts';
import { bookCase } from './binding-case.ts';
import { PLANK_INSET, rowsForBookcase, SHELF } from './bookcase.ts';
import {
  applyPlacement,
  atlasLayout,
  COVER_LIFT,
  COVER_PENUMBRA,
  COVER_SHADE_ALPHA,
  coverOccluders,
  coverPoint,
  coverQuads,
  coverShadeAt,
  coverShadeGeometry,
  coverShadeMask,
  coverShadeMaterial,
  coverShadeMesh,
  inShadow,
  lightRatios,
  MAX_ATLAS_SIZE,
  paintsCoverShade,
  TILE_GUTTER,
  TILE_HEIGHT,
  TILE_WIDTH,
  tileOrigin,
  type BookcaseLight,
  type CoverOccluders,
  type CoverQuad,
} from './cover-shade.ts';
import { placeShelf, type Placement } from './placement.ts';
import { DEFAULT_SETTINGS, type KeyLightSettings } from './shelf-settings.ts';

/**
 * The cover shade asks, of every texel on a face-out cover, whether a ray from
 * it toward the key light meets the plank above, the right-hand upright or a
 * book to its right. These pin the answer's *shape* — where each edge falls and
 * which way the atlas runs — against the geometry the shelf ships, because every
 * mistake that matters here renders a plausible band in the wrong place: a
 * flipped atlas puts it at the foot of every cover, and a lean ignored narrows
 * the upright strip the wrong way. Every one of those reads as a number in range.
 */

function book(id: string, over: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id,
    title: id,
    status: 'read',
    finished: '2025-06-01',
    pages: 300,
    tags: [],
    ...over,
  };
}

function rowsOf(books: readonly LibraryBook[]): ShelfRow[] {
  return toRows(books, DEFAULT_SETTINGS.books);
}

/**
 * The key light over the live library's seven-row bookcase, where the owner saw
 * the band. The light steepens as the bookcase grows, and over the two rows a
 * small test library needs, a short cover's top can stand clear of the band
 * altogether — true of the shelf, and no use for pinning where the band's edge
 * falls. Every function here takes the light as an argument, so a test is free
 * to pick the one it is about.
 */
const LIVE_LIGHT = lightRatios(DEFAULT_SETTINGS.lighting.key, 7 * SHELF.rowHeight);

/** The shipped head cap, which sets where a hardback's page block stops at the joint. */
const HEAD_CAP = DEFAULT_SETTINGS.books.headCap;

/** A shelf as the site places it. */
function shelf(books: readonly LibraryBook[]): {
  placements: Placement[][];
  quads: CoverQuad[];
  light: BookcaseLight;
  rowCount: number;
} {
  const rows = rowsOf(books);
  const placements = placeShelf(rows);
  return {
    placements,
    quads: coverQuads(placements, HEAD_CAP),
    light: LIVE_LIGHT,
    rowCount: rowsForBookcase(rows.length),
  };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) throw new Error('empty');
  return item;
}

/** The plank's front edge, from the bookcase's own constants. */
const PLANK_FRONT = SHELF.depth / 2 - PLANK_INSET;

/**
 * The underside of the `index`th plank from the floor — the lid, for the top
 * row of a bookcase `index` rows tall. Read off how `buildShelf` places a plank,
 * centred at `index × rowHeight`, rather than off anything `cover-shade.ts`
 * computes.
 */
function plankUnderside(index: number): number {
  return index * SHELF.rowHeight - SHELF.plankThickness / 2;
}

/** Nothing shades but whatever `extra` names — the plank and upright are out of reach. */
function isolated(extra: Partial<CoverOccluders> = {}): CoverOccluders {
  return { plankUnderside: Number.POSITIVE_INFINITY, books: [], ...extra };
}

/**
 * Where the shade crosses one half going down a cover at `u`, by bisection on
 * the real pipeline — `coverPoint` then `coverShadeAt`. The shade must be
 * darker above the crossing than below it.
 */
function crossingDown(
  quad: CoverQuad,
  u: number,
  occluders: CoverOccluders,
  light: BookcaseLight,
): THREE.Vector3 {
  const at = (v: number): number => coverShadeAt(coverPoint(quad, u, v), occluders, light);
  let lo = 0;
  let hi = 1;
  expect(at(lo)).toBeGreaterThan(0.5);
  expect(at(hi)).toBeLessThan(0.5);
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) > 0.5) lo = mid;
    else hi = mid;
  }
  return coverPoint(quad, u, (lo + hi) / 2);
}

describe('inShadow', () => {
  it('is one half on the edge, and saturates a half-penumbra either side', () => {
    expect(inShadow(0, 0.02)).toBe(0.5);
    expect(inShadow(0.01, 0.02)).toBe(1);
    expect(inShadow(-0.01, 0.02)).toBe(0);
    expect(inShadow(0.005, 0.02) + inShadow(-0.005, 0.02)).toBeCloseTo(1, 12);
    expect(inShadow(0.005, 0.02)).toBeGreaterThan(0.5);
  });
});

describe('the plank band', () => {
  it('falls exactly where a ray grazing the plank front meets the cover', () => {
    const { quads, light, rowCount } = shelf([book('cover', { faceOut: true })]);
    const quad = only(quads);
    const underside = plankUnderside(rowCount);
    expect(quad.occluders.plankUnderside).toBeCloseTo(underside, 12);

    const line = crossingDown(quad, 0.3, isolated({ plankUnderside: underside }), light);

    // y = y_u − (z_pf − z)·yPerZ: the plank's front edge, projected along the
    // light onto the cover's own depth.
    expect(line.y).toBeCloseTo(underside - (PLANK_FRONT - line.z) * light.yPerZ, 6);

    const occluders = isolated({ plankUnderside: underside });
    const above = line.clone().setY(line.y + 2 * COVER_PENUMBRA);
    const below = line.clone().setY(line.y - 2 * COVER_PENUMBRA);
    expect(coverShadeAt(above, occluders, light)).toBeGreaterThanOrEqual(0.99);
    expect(coverShadeAt(below, occluders, light)).toBeLessThanOrEqual(0.01);
  });

  it('is deeper on a wider cover, by exactly the depth it stands back', () => {
    const wide = only(shelf([book('wide', { faceOut: true, coverAspect: 0.95 })]).quads);
    const { quads, light, rowCount } = shelf([
      book('narrow', { faceOut: true, coverAspect: 0.55 }),
    ]);
    const narrow = only(quads);
    const occluders = isolated({ plankUnderside: plankUnderside(rowCount) });

    const deep = crossingDown(wide, 0.5, occluders, light);
    const shallow = crossingDown(narrow, 0.5, occluders, light);

    expect(deep.z).toBeLessThan(shallow.z);
    expect(deep.y).toBeLessThan(shallow.y);
    expect(shallow.y - deep.y).toBeCloseTo((shallow.z - deep.z) * light.yPerZ, 9);
  });

  it('never reaches a spine top, even at the 200-book size — which is why only covers are painted', () => {
    // A fifth of them face-out, which is what makes a library tall: a cover
    // eats five or six spines' worth of row.
    const library = Array.from({ length: 200 }, (_, index) =>
      book(`shelved-${String(index)}`, {
        pages: 120 + ((index * 53) % 700),
        finished: `20${String(10 + (index % 12))}-0${String((index % 9) + 1)}-01`,
        faceOut: index % 5 === 0,
      }),
    );
    const { placements, rowCount } = shelf(library);
    expect(rowCount).toBeGreaterThanOrEqual(12);
    // This bookcase's own light, the steepest any test here uses.
    const light = lightRatios(DEFAULT_SETTINGS.lighting.key, rowCount * SHELF.rowHeight);

    // The design argument, as numbers: a spine's front stands 0.016 behind the
    // plank's, so the band reaches that far times `yPerZ` down its plane, and the
    // tallest book leaves more headroom than that under the plank.
    const openHeight = SHELF.rowHeight - SHELF.plankThickness;
    const spineFront = SHELF.depth / 2 - 0.02;
    expect((PLANK_FRONT - spineFront) * light.yPerZ).toBeLessThan(openHeight - MAX_HEIGHT);

    // And against every spine actually placed: its highest corner stays below
    // where the band's edge crosses its front plane. Row 0 is the top shelf, so
    // the plank over row `r` is the `rowCount − r`th from the floor.
    let spines = 0;
    for (const [rowIndex, row] of placements.entries()) {
      const underside = plankUnderside(rowCount - rowIndex);
      for (const placement of row) {
        if (placement.entry.faceOut) continue;
        spines += 1;
        const mirror = new THREE.Object3D();
        applyPlacement(mirror, placement);
        mirror.updateMatrixWorld(true);
        const { height, thickness } = placement.entry;
        const top = Math.max(
          ...[-1, 1].map(
            (side) =>
              mirror.localToWorld(new THREE.Vector3((side * thickness) / 2, height / 2, 0)).y,
          ),
        );
        const front = placement.position.z + placement.frontZ;
        expect(top).toBeLessThan(underside - (PLANK_FRONT - front) * light.yPerZ);
      }
    }
    expect(spines).toBe(160);
  });
});

describe('the upright strip', () => {
  const light = lightRatios(DEFAULT_SETTINGS.lighting.key, 3 * SHELF.rowHeight);

  it('reaches in from the inner face by exactly the depth left to the front, times xPerZ', () => {
    const z = 0.1;
    const edge = SHELF.width / 2 - (SHELF.depth / 2 - z) * light.xPerZ;
    const at = (x: number): number => coverShadeAt(new THREE.Vector3(x, 0.5, z), isolated(), light);

    expect(at(edge)).toBeCloseTo(0.5, 12);
    expect(at(edge + 2 * COVER_PENUMBRA)).toBeGreaterThanOrEqual(0.99);
    expect(at(edge - 2 * COVER_PENUMBRA)).toBeLessThanOrEqual(0.01);
  });

  it('gives a cover that stands mid-shelf nothing', () => {
    const { quads } = shelf([book('cover', { faceOut: true })]);
    const quad = only(quads);
    for (const v of [0, 0.5, 1]) {
      expect(coverShadeAt(coverPoint(quad, 1, v), isolated(), light)).toBe(0);
    }
  });

  it('is wider at the top of a leaning cover than at its foot, by the lean', () => {
    const { placements } = shelf([book('cover', { faceOut: true })]);
    const placement = only(placements.flat());
    const width = placement.frontZ * 2;
    // The same book, slid along its row until it stands against the upright.
    const against: Placement = {
      ...placement,
      position: { ...placement.position, x: SHELF.width / 2 - width / 2 - 0.01 },
    };
    const quad = only(coverQuads([[against]], HEAD_CAP));

    /** How far in from the cover's right edge the strip reaches at height `v`. */
    const strip = (v: number): number => {
      let lo = 0;
      let hi = 1;
      const at = (u: number): number => coverShadeAt(coverPoint(quad, u, v), isolated(), light);
      expect(at(hi)).toBeGreaterThan(0.5);
      expect(at(lo)).toBeLessThan(0.5);
      for (let step = 0; step < 60; step += 1) {
        const mid = (lo + hi) / 2;
        if (at(mid) > 0.5) hi = mid;
        else lo = mid;
      }
      return (1 - (lo + hi) / 2) * width;
    };

    const top = coverPoint(quad, 1, 0);
    const foot = coverPoint(quad, 1, 1);
    // The lean, pinned by hand: a face-out book tips its top *back*.
    expect(foot.z - top.z).toBeCloseTo(placement.entry.height * Math.sin(0.06), 9);
    expect(strip(0)).toBeGreaterThan(strip(1));
    expect(strip(0) - strip(1)).toBeCloseTo((foot.z - top.z) * light.xPerZ, 6);
  });
});

describe('the wedge a neighbour throws', () => {
  /** A face-out cover with a shelved book against its right-hand edge. */
  function coverThenSpine(spineId: string): ReturnType<typeof shelf> & { spine: Placement } {
    const built = shelf([
      book('cover', { faceOut: true, shelfOrder: 1 }),
      book(spineId, { shelfOrder: 2 }),
    ]);
    const row = only(built.placements);
    const spine = row[1];
    if (spine === undefined) throw new Error('no spine');
    expect(spine.entry.faceOut).toBe(false);
    return { ...built, spine };
  }

  it('darkens the right edge low down', () => {
    const { quads, light } = coverThenSpine('beside');
    const quad = only(quads);
    const occluders = isolated({ books: quad.occluders.books });
    expect(coverShadeAt(coverPoint(quad, 1, 0.9), occluders, light)).toBeGreaterThanOrEqual(0.99);
  });

  it('is thrown by the page block, which is what casts, not by the case', () => {
    const { quads, spine } = coverThenSpine('beside');
    const [neighbour] = only(quads).occluders.books;
    if (neighbour === undefined) throw new Error('no neighbour');
    const { board, square, frontDepth } = bookCase(spine.entry, spine.frontZ * 2, HEAD_CAP);
    expect(board).toBeGreaterThan(0);

    // Its front is the block's, a covering's depth behind the spine.
    expect(neighbour.front).toBeCloseTo(spine.position.z + spine.frontZ - frontDepth, 9);
    expect(neighbour.frontSlope).toBe(0);

    // Its top-left corner is the block's: a board in from the side and the
    // square down from the head, then leaned with the book.
    const mirror = new THREE.Object3D();
    applyPlacement(mirror, spine);
    mirror.updateMatrixWorld(true);
    const corner = mirror.localToWorld(
      new THREE.Vector3(-spine.entry.thickness / 2 + board, spine.entry.height / 2 - square, 0),
    );
    expect(neighbour.top).toBeCloseTo(corner.y, 9);
    expect(neighbour.a + neighbour.b * corner.y).toBeCloseTo(corner.x, 9);
    expect(neighbour.b).toBeCloseTo(-Math.tan(spine.rotationZ), 9);
  });

  it('is bounded above by the line through the neighbour top-left corner, at the light slope', () => {
    const { quads, light, spine } = coverThenSpine('beside');
    const quad = only(quads);
    const occluders = isolated({ books: quad.occluders.books });

    // The corner of the page block, from the neighbour's own transform and the
    // case's own numbers rather than from anything the occluder stores.
    const { board, square } = bookCase(spine.entry, spine.frontZ * 2, HEAD_CAP);
    const mirror = new THREE.Object3D();
    applyPlacement(mirror, spine);
    mirror.updateMatrixWorld(true);
    const corner = mirror.localToWorld(
      new THREE.Vector3(-spine.entry.thickness / 2 + board, spine.entry.height / 2 - square, 0),
    );

    const crossings = ACROSS_THE_EDGE.flatMap((u) => wedgeTop(quad, u, occluders, light) ?? []);
    expect(crossings.length).toBeGreaterThanOrEqual(2);
    for (const point of crossings) {
      expect(point.y - corner.y).toBeCloseTo(((point.x - corner.x) * light.yPerZ) / light.xPerZ, 6);
    }
  });

  it('comes down the cover with a shorter neighbour', () => {
    const { quads, light } = coverThenSpine('beside');
    const quad = only(quads);
    const [neighbour] = quad.occluders.books;
    if (neighbour === undefined) throw new Error('no neighbour');
    const shorter = isolated({ books: [{ ...neighbour, top: neighbour.top - 0.1 }] });
    const taller = isolated({ books: [neighbour] });

    const pairs = ACROSS_THE_EDGE.flatMap((u) => {
      const tall = wedgeTop(quad, u, taller, light);
      const short = wedgeTop(quad, u, shorter, light);
      return tall === undefined || short === undefined ? [] : [{ tall, short }];
    });
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    for (const { tall, short } of pairs) expect(short.y).toBeLessThan(tall.y - 0.05);
  });

  it('comes from nothing when the book beside is a face-out one standing further back', () => {
    const { quads, light } = shelf([
      book('narrow', { faceOut: true, coverAspect: 0.5, shelfOrder: 1 }),
      book('wide', { faceOut: true, coverAspect: 0.95, shelfOrder: 2 }),
    ]);
    const [narrow, wide] = quads;
    if (narrow === undefined || wide === undefined) throw new Error('two covers expected');
    expect(narrow.occluders.books).toHaveLength(1);
    expect(wide.placement.position.z).toBeLessThan(narrow.placement.position.z);

    const occluders = isolated({ books: narrow.occluders.books });
    for (const u of GRID) {
      for (const v of GRID)
        expect(coverShadeAt(coverPoint(narrow, u, v), occluders, light)).toBe(0);
    }
  });

  it('comes from nothing on the left, however tall', () => {
    const { placements, quads, light } = shelf([
      book('left', { shelfOrder: 1 }),
      book('cover', { faceOut: true, shelfOrder: 2 }),
    ]);
    const row = only(placements);
    const [left, cover] = row;
    if (left === undefined || cover === undefined) throw new Error('two books expected');
    expect(left.entry.faceOut).toBe(false);
    expect(cover.entry.faceOut).toBe(true);

    // Not offered as an occluder at all…
    expect(coverOccluders(row, 1, HEAD_CAP).books).toHaveLength(0);

    // …and inert even if it were: the ray toward the light leaves it behind.
    const offered = isolated({ books: coverOccluders([cover, left], 0, HEAD_CAP).books });
    const quad = only(quads);
    for (const u of GRID) {
      for (const v of GRID) expect(coverShadeAt(coverPoint(quad, u, v), offered, light)).toBe(0);
    }
  });
});

/** Columns across the right-hand half of a cover, where a neighbour's wedge falls. */
const ACROSS_THE_EDGE = [0.6, 0.7, 0.8, 0.9, 1];

/** Points across a whole cover, edges included. */
const GRID = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/**
 * Where a wedge's upper edge crosses the column at `u`, when it does: lit at
 * the cover's top, dark at its foot. `undefined` where the wedge covers the
 * whole column or misses it.
 */
function wedgeTop(
  quad: CoverQuad,
  u: number,
  occluders: CoverOccluders,
  light: BookcaseLight,
): THREE.Vector3 | undefined {
  const at = (v: number): number => coverShadeAt(coverPoint(quad, u, v), occluders, light);
  if (!(at(0) < 0.5 && at(1) > 0.5)) return undefined;
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) < 0.5) lo = mid;
    else hi = mid;
  }
  return coverPoint(quad, u, (lo + hi) / 2);
}

describe('the union', () => {
  it('never goes past one, and is exactly one where all three overlap', () => {
    const light = lightRatios(DEFAULT_SETTINGS.lighting.key, 3 * SHELF.rowHeight);
    const point = new THREE.Vector3(SHELF.width / 2 - 0.02, 1, 0.1);
    const deep = 4 * COVER_PENUMBRA;
    const occluders: CoverOccluders = {
      // Each term a clear four penumbras inside its own shadow.
      plankUnderside: point.y + (PLANK_FRONT - point.z) * light.yPerZ - deep,
      books: [
        {
          a: point.x + 0.001,
          b: 0,
          top: point.y + 1,
          front: 0.34,
          frontSlope: 0,
          nearest: point.x,
        },
      ],
    };
    expect(point.x - SHELF.width / 2 + (SHELF.depth / 2 - point.z) * light.xPerZ).toBeGreaterThan(
      deep,
    );
    expect(coverShadeAt(point, occluders, light)).toBe(1);

    // And on two edges at once it is as dark as either edge, not twice: the
    // corner where the band meets the strip is one shadow, not two.
    const corner = new THREE.Vector3(
      SHELF.width / 2 - (SHELF.depth / 2 - 0.1) * light.xPerZ,
      1,
      0.1,
    );
    const edges: CoverOccluders = {
      plankUnderside: corner.y + (PLANK_FRONT - corner.z) * light.yPerZ,
      books: [],
    };
    expect(coverShadeAt(corner, edges, light)).toBeCloseTo(0.5, 12);

    const { quads, light: shelfLight } = shelf([
      book('a', { faceOut: true }),
      book('b'),
      book('c', { faceOut: true, coverAspect: 0.5 }),
      book('d'),
      book('e'),
    ]);
    const layout = atlasLayout(quads.length);
    if (layout === undefined) throw new Error('no layout');
    const mask = coverShadeMask(quads, layout, shelfLight);
    expect(Math.max(...mask)).toBeLessThanOrEqual(1);
    expect(Math.min(...mask)).toBeGreaterThanOrEqual(0);
  });
});

describe('the quads', () => {
  const library = [
    book('first', { faceOut: true }),
    book('second'),
    book('third', { faceOut: true, coverAspect: 1 }),
    book('fourth'),
    book('fifth', { faceOut: true, coverAspect: 0.6 }),
  ];

  it('are laid exactly where buildBook lays a plane on the cover', () => {
    const { quads } = shelf(library);
    expect(quads.length).toBeGreaterThan(0);

    for (const quad of quads) {
      const { height, thickness } = quad.placement.entry;
      const width = quad.placement.frontZ * 2;

      const group = new THREE.Group();
      applyPlacement(group, quad.placement);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height));
      plane.rotation.y = Math.PI / 2;
      plane.position.set(thickness / 2 + COVER_LIFT, 0, 0);
      group.add(plane);
      group.updateMatrixWorld(true);

      // `PlaneGeometry` stores its corners as float32, which is what the GPU is
      // handed, so they agree to float32's precision and no closer.
      const vertices = plane.geometry.getAttribute('position');
      quad.corners.forEach((corner, index) => {
        const expected = plane.localToWorld(
          new THREE.Vector3().fromBufferAttribute(vertices, index),
        );
        expect(corner.distanceTo(expected)).toBeLessThan(1e-6);
      });
    }
  });

  it('lean back, and run left to right as seen from the room', () => {
    const { quads } = shelf(library);
    const quad = quads[0];
    if (quad === undefined) throw new Error('no quad');
    const [topLeft, topRight, footLeft] = quad.corners;
    const { position, rotationZ } = quad.placement;
    const { height } = quad.placement.entry;
    const width = quad.placement.frontZ * 2;

    expect(rotationZ).toBe(0.06);
    // The top stands further from the room than the foot, by the lean.
    expect(footLeft.z - topLeft.z).toBeCloseTo(height * Math.sin(0.06), 9);
    expect(topLeft.x).toBeCloseTo(position.x - width / 2, 9);
    expect(topRight.x).toBeCloseTo(position.x + width / 2, 9);
    expect(topLeft.y).toBeGreaterThan(footLeft.y);
  });

  it('face the room', () => {
    const { quads } = shelf(library);
    const layout = atlasLayout(quads.length);
    if (layout === undefined) throw new Error('no layout');
    // Its own normals, which it must carry: without them three compiles the
    // quads a program of their own (`HAS_NORMAL`), where every other painted
    // plane shares one.
    const geometry = coverShadeGeometry(quads, layout);
    const normals = geometry.getAttribute('normal');
    expect(normals.count).toBe(geometry.getAttribute('position').count);
    for (let index = 0; index < normals.count; index += 1) {
      expect(normals.getZ(index)).toBeGreaterThan(0.99);
    }
  });

  it('cover every face-out book and nothing else', () => {
    const { placements, quads } = shelf(library);
    const faceOut = placements.flat().filter((placement) => placement.entry.faceOut);
    expect(quads.map((quad) => quad.placement)).toEqual(faceOut);

    const layout = atlasLayout(quads.length);
    if (layout === undefined) throw new Error('no layout');
    const geometry = coverShadeGeometry(quads, layout);
    expect(geometry.getAttribute('position').count).toBe(4 * faceOut.length);
    expect(geometry.getIndex()?.count).toBe(6 * faceOut.length);

    const none = shelf([book('a'), book('b')]);
    expect(none.quads).toEqual([]);
    expect(atlasLayout(none.quads.length)).toBeUndefined();
  });
});

describe('the atlas', () => {
  it('maps each corner to the texel whose point on the cover is that corner', () => {
    const { quads } = shelf([
      book('one', { faceOut: true }),
      book('two', { faceOut: true, coverAspect: 1 }),
      book('three', { faceOut: true, coverAspect: 0.5 }),
    ]);
    const layout = atlasLayout(quads.length);
    if (layout === undefined) throw new Error('no layout');
    const uvs = coverShadeGeometry(quads, layout).getAttribute('uv');

    quads.forEach((quad, index) => {
      const origin = tileOrigin(layout, index);
      const inverse = quad.matrix.clone().invert();
      const width = quad.placement.frontZ * 2;
      const { height } = quad.placement.entry;

      const texels = quad.corners.map((corner, k) => {
        const u = uvs.getX(index * 4 + k);
        const v = uvs.getY(index * 4 + k);
        // `flipY`: canvas row 0 is the top of the texture.
        // On a texel's centre, to float32's precision — a thousandth of a texel.
        const column = u * layout.width - 0.5;
        const row = (1 - v) * layout.height - 0.5;
        expect(Math.abs(column - Math.round(column))).toBeLessThan(1e-3);
        expect(Math.abs(row - Math.round(row))).toBeLessThan(1e-3);

        const c = Math.round(column) - origin.x;
        const r = Math.round(row) - origin.y;
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(TILE_WIDTH);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(TILE_HEIGHT);

        // In the book's own frame, where the lift is only local x.
        const texel = coverPoint(quad, c / (TILE_WIDTH - 1), r / (TILE_HEIGHT - 1)).applyMatrix4(
          inverse,
        );
        const local = corner.clone().applyMatrix4(inverse);
        expect(Math.abs(texel.y - local.y)).toBeLessThan(height / (TILE_HEIGHT - 1) / 2);
        expect(Math.abs(texel.z - local.z)).toBeLessThan(width / (TILE_WIDTH - 1) / 2);
        return { v, row: Math.round(row), y: corner.y };
      });

      // Both links in the chain, so a consistently flipped build cannot pass:
      // the highest corner has the larger v, and that v is in the tile's top half.
      const highest = texels.reduce((best, texel) => (texel.y > best.y ? texel : best));
      const lowest = texels.reduce((best, texel) => (texel.y < best.y ? texel : best));
      expect(highest.v).toBeGreaterThan(lowest.v);
      expect(highest.row).toBeLessThan(origin.y + TILE_HEIGHT / 2);
    });
  });

  it('puts the band at the top of the tile, where the cover top reads', () => {
    const { quads, light } = shelf([book('cover', { faceOut: true })]);
    const layout = atlasLayout(quads.length);
    if (layout === undefined) throw new Error('no layout');
    const mask = coverShadeMask(quads, layout, light);
    const { x, y } = tileOrigin(layout, 0);
    const middle = x + TILE_WIDTH / 2;

    expect(mask[y * layout.width + middle]).toBe(1);
    expect(mask[(y + TILE_HEIGHT - 1) * layout.width + middle]).toBe(0);
    // The gutter copies its edge.
    expect(mask[(y - TILE_GUTTER) * layout.width + middle]).toBe(mask[y * layout.width + middle]);
  });

  it.each([1, 21, 250, 1000])(
    'lays %i tiles apart, within a texture every device takes',
    (count) => {
      const layout = atlasLayout(count);
      if (layout === undefined) throw new Error('no layout');
      expect(layout.width).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
      expect(layout.height).toBeLessThanOrEqual(MAX_ATLAS_SIZE);

      const rects = Array.from({ length: count }, (_, index) => {
        const { x, y } = tileOrigin(layout, index);
        return {
          x0: x - TILE_GUTTER,
          y0: y - TILE_GUTTER,
          x1: x + TILE_WIDTH + TILE_GUTTER,
          y1: y + TILE_HEIGHT + TILE_GUTTER,
        };
      });
      for (const rect of rects) {
        expect(rect.x0).toBeGreaterThanOrEqual(0);
        expect(rect.y0).toBeGreaterThanOrEqual(0);
        expect(rect.x1).toBeLessThanOrEqual(layout.width);
        expect(rect.y1).toBeLessThanOrEqual(layout.height);
      }
      // Gutter to gutter, no two tiles share a texel.
      const cells = new Set(rects.map((rect) => `${String(rect.x0)},${String(rect.y0)}`));
      expect(cells.size).toBe(count);
      for (const [index, rect] of rects.entries()) {
        const next = rects[index + 1];
        if (next !== undefined && next.y0 === rect.y0)
          expect(next.x0).toBeGreaterThanOrEqual(rect.x1);
      }
      expect(TILE_GUTTER).toBeGreaterThanOrEqual(2);
    },
  );

  it('refuses a library too large for one texture rather than asking for one', () => {
    expect(() => atlasLayout(5000)).toThrow(/atlas/);
  });
});

describe('the material and the mesh', () => {
  it('are black over the cover, unlit, never casting and never in the map', () => {
    const atlas = new THREE.Texture();
    const material = coverShadeMaterial(atlas);
    const mesh = coverShadeMesh(new THREE.BufferGeometry(), material);

    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.opacity).toBe(COVER_SHADE_ALPHA);
    expect(material.map).toBe(atlas);
    expect(atlas.generateMipmaps).toBe(false);
    expect(atlas.minFilter).toBe(THREE.LinearFilter);
    expect(atlas.magFilter).toBe(THREE.LinearFilter);
    expect(atlas.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(atlas.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(atlas.flipY).toBe(true);

    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.renderOrder).toBe(1);
    expect(mesh.name).toBe('cover-shade');
  });
});

describe('when it is drawn', () => {
  const shadows = DEFAULT_SETTINGS.shadows;

  it('is drawn over painted shading whenever the books do not read the map', () => {
    expect(
      paintsCoverShade({ ...shadows, painted: true, receivers: 'bookcase', enabled: true }),
    ).toBe(true);
    expect(
      paintsCoverShade({ ...shadows, painted: true, receivers: 'bookcase', enabled: false }),
    ).toBe(true);
  });

  it('is not drawn when the books receive the real shadow, or with no painted shading', () => {
    expect(paintsCoverShade({ ...shadows, painted: true, receivers: 'all', enabled: true })).toBe(
      false,
    );
    expect(paintsCoverShade({ ...shadows, painted: false, receivers: 'bookcase' })).toBe(false);
    expect(paintsCoverShade({ ...shadows, painted: false, receivers: 'all', enabled: false })).toBe(
      false,
    );
  });

  it('is drawn on the painted fallback of a ?receivers=all page, where no book reads a map', () => {
    // The fallback flips `enabled` and keeps every other dial, `receivers`
    // included. Reading `receivers` alone left that page with no band at all.
    expect(paintsCoverShade({ ...shadows, painted: true, receivers: 'all', enabled: false })).toBe(
      true,
    );
  });
});

describe('the light', () => {
  it('reduces to the ratios of the vector from the key light to its aim', () => {
    const unitHeight = 7 * SHELF.rowHeight;
    const keys: KeyLightSettings[] = [
      DEFAULT_SETTINGS.lighting.key,
      {
        ...DEFAULT_SETTINGS.lighting.key,
        position: { x: -3, y: { ofHeight: 0.4, plus: 1 }, z: 2 },
      },
      { ...DEFAULT_SETTINGS.lighting.key, aimHeight: 0.8 },
    ];
    for (const key of keys) {
      const from = new THREE.Vector3(
        key.position.x,
        unitHeight * key.position.y.ofHeight + key.position.y.plus,
        key.position.z,
      );
      const toward = new THREE.Vector3(0, unitHeight * key.aimHeight, 0).sub(from);
      const light = lightRatios(key, unitHeight);
      expect(light.xPerZ).toBeCloseTo(Math.abs(toward.x / toward.z), 12);
      expect(light.yPerZ).toBeCloseTo(Math.abs(toward.y / toward.z), 12);
    }

    // The shipped key, by hand: 5 right and 5.6 out, 3.4 over the top.
    const shipped = lightRatios(DEFAULT_SETTINGS.lighting.key, unitHeight);
    expect(shipped.xPerZ).toBeCloseTo(5 / 5.6, 12);
    expect(shipped.yPerZ).toBeCloseTo((unitHeight / 2 + 3.4) / 5.6, 12);
  });

  it('moves the band when it moves, so a repaint is never stale', () => {
    const { quads, rowCount } = shelf([book('cover', { faceOut: true })]);
    const quad = only(quads);
    const unitHeight = rowCount * SHELF.rowHeight;
    const underside = plankUnderside(rowCount);
    const occluders = isolated({ plankUnderside: underside });

    const low = lightRatios(DEFAULT_SETTINGS.lighting.key, unitHeight);
    const key = DEFAULT_SETTINGS.lighting.key;
    const high = lightRatios(
      {
        ...key,
        position: { ...key.position, y: { ...key.position.y, plus: key.position.y.plus + 1 } },
      },
      unitHeight,
    );
    expect(high.yPerZ - low.yPerZ).toBeCloseTo(1 / 5.6, 12);

    const before = crossingDown(quad, 0.4, occluders, low);
    const after = crossingDown(quad, 0.4, occluders, high);
    expect(after.y).toBeLessThan(before.y);
    for (const [line, light] of [
      [before, low],
      [after, high],
    ] as const) {
      expect(line.y).toBeCloseTo(underside - (PLANK_FRONT - line.z) * light.yPerZ, 6);
    }
  });
});
