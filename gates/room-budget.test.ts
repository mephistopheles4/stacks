/**
 * G74 — a room stays inside its download budget.
 *
 * Three caps from the room spec (#593, S14), read from the committed files and
 * never from a bake:
 *
 * - the packed GLB is at most **5 MB**;
 * - the files a room fetches, **the GLB with either texture set**, are at most
 *   **40 MB each**, so the cap holds whichever set is the default (the default
 *   is a constant that moves from WebP to KTX2 when the owner flips it);
 * - no served file is over **25 MiB**, Cloudflare Pages' per-file limit.
 *
 * The files a room fetches are the GLB plus every image its extras name: the
 * WebP set as named, and the KTX2 set at `ktx-etc1s/<same path>.ktx2`.
 *
 * ⚠️ **MB is decimal here and MiB is binary**, as the spec writes them.
 *
 * ## The vacuous green
 *
 * A budget is satisfied by a room with nothing in it. So each room must have a
 * GLB, name at least ten images, and have every one of them on disk in both
 * sets; a missing file is red instead of counted as zero bytes. The three
 * judgements are planted red on numbers in the same file.
 *
 * See docs/gates.md, row G74 (room-budget).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, expectFound } from './repo.ts';

const SERVED = 'packages/site/public/rooms';
const ROOMS = 'packages/site/rooms';

const MAX_GLB = 5_000_000;
const MAX_FETCHED = 40_000_000;
const MAX_FILE = 25 * 1024 * 1024;

function roomIds(): string[] {
  return readdirSync(join(REPO_ROOT, ROOMS), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, ROOMS, e.name, 'build.json')))
    .map((e) => e.name)
    .sort();
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(`${dir}/${e.name}`, rel));
    else out.push(rel);
  }
  return out;
}

const sizeOf = (path: string): number => statSync(join(REPO_ROOT, path)).size;

/** Every image path the GLB's JSON chunk names, anywhere in it. */
function imagesNamedBy(glb: Buffer): string[] {
  const jsonLength = glb.readUInt32LE(12);
  const json: unknown = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const found = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === 'string' && /\.(webp|jpg|png)$/i.test(v)) found.add(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(json);
  return [...found].sort();
}

const ktx2Of = (webp: string): string => `ktx-etc1s/${webp.replace(/\.webp$/i, '.ktx2')}`;

interface Sizes {
  glb: number;
  webpSet: number;
  ktx2Set: number;
  largestFile: number;
}

function budgetFaults(room: string, s: Sizes): string[] {
  const faults: string[] = [];
  if (s.glb > MAX_GLB) faults.push(`${room}: the packed GLB is ${s.glb} bytes, over ${MAX_GLB}`);
  if (s.webpSet > MAX_FETCHED)
    faults.push(`${room}: the GLB with the WebP set is ${s.webpSet} bytes, over ${MAX_FETCHED}`);
  if (s.ktx2Set > MAX_FETCHED)
    faults.push(`${room}: the GLB with the KTX2 set is ${s.ktx2Set} bytes, over ${MAX_FETCHED}`);
  if (s.largestFile > MAX_FILE)
    faults.push(`${room}: a served file is ${s.largestFile} bytes, over ${MAX_FILE}`);
  return faults;
}

function measure(room: string): { sizes: Sizes; problems: string[]; images: string[] } {
  const dir = `${SERVED}/${room}`;
  const problems: string[] = [];
  const glbs = readdirSync(join(REPO_ROOT, dir)).filter((n) => n.endsWith('.glb'));
  if (glbs.length !== 1)
    problems.push(`${room}: expected one GLB at the top of ${dir}, found ${glbs.length}`);
  const glbName = glbs[0] ?? '';
  const glb = glbName ? sizeOf(`${dir}/${glbName}`) : 0;
  const images = glbName ? imagesNamedBy(readFileSync(join(REPO_ROOT, dir, glbName))) : [];

  let webpSet = glb;
  let ktx2Set = glb;
  for (const image of images) {
    for (const [path, add] of [
      [image, (n: number) => (webpSet += n)],
      [ktx2Of(image), (n: number) => (ktx2Set += n)],
    ] as const) {
      if (existsSync(join(REPO_ROOT, dir, path))) add(sizeOf(`${dir}/${path}`));
      else problems.push(`${room}: the GLB names ${image} and ${path} is not served`);
    }
  }
  const largestFile = Math.max(0, ...walk(dir).map((p) => sizeOf(`${dir}/${p}`)));
  return { sizes: { glb, webpSet, ktx2Set, largestFile }, problems, images };
}

describe('G74 — a room stays inside its budget', () => {
  const rooms = roomIds();

  it('finds at least one room', () => {
    expectFound(rooms, 'rooms with a build.json', 1);
  });

  it.each(rooms)('%s: the GLB, each texture set and every file are inside the caps', (room) => {
    const { sizes, problems, images } = measure(room);
    expect(images.length, `${room}: images the GLB names`).toBeGreaterThanOrEqual(10);
    expect(problems).toEqual([]);
    expect(budgetFaults(room, sizes)).toEqual([]);
  });

  describe('is shown red on numbers', () => {
    const inside: Sizes = {
      glb: 3_000_000,
      webpSet: 27_000_000,
      ktx2Set: 35_000_000,
      largestFile: 2_500_000,
    };

    it('passes the measured room', () => {
      expect(budgetFaults('r', inside)).toEqual([]);
    });

    it('a GLB over 5 MB', () => {
      expect(budgetFaults('r', { ...inside, glb: MAX_GLB + 1 }).join()).toMatch(/packed GLB/);
    });

    it('either texture set over 40 MB, whichever is the default', () => {
      expect(budgetFaults('r', { ...inside, webpSet: MAX_FETCHED + 1 }).join()).toMatch(/WebP set/);
      expect(budgetFaults('r', { ...inside, ktx2Set: MAX_FETCHED + 1 }).join()).toMatch(/KTX2 set/);
    });

    it('a file over 25 MiB', () => {
      expect(budgetFaults('r', { ...inside, largestFile: MAX_FILE + 1 }).join()).toMatch(
        /served file/,
      );
    });
  });
});
