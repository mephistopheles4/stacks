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

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, expectFound, imagesNamedBy, ktx2Of } from './repo.ts';

const SERVED = 'packages/site/public/rooms';

const MAX_GLB = 5_000_000;
const MAX_FETCHED = 40_000_000;
const MAX_FILE = 25 * 1024 * 1024;

/** The served room folders: what a visitor can fetch, so a folder with no record is measured too. */
function roomIds(): string[] {
  return readdirSync(join(REPO_ROOT, SERVED), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function walk(root: string, dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, `${dir}/${e.name}`, rel));
    else out.push(rel);
  }
  return out;
}

const sizeOf = (root: string, path: string): number => statSync(join(root, path)).size;

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

function measure(
  room: string,
  root = REPO_ROOT,
): { sizes: Sizes; problems: string[]; images: string[] } {
  const dir = `${SERVED}/${room}`;
  const problems: string[] = [];
  const glbs = readdirSync(join(root, dir)).filter((n) => n.endsWith('.glb'));
  if (glbs.length !== 1)
    problems.push(`${room}: expected one GLB at the top of ${dir}, found ${glbs.length}`);
  const glbName = glbs[0] ?? '';
  const glb = glbName ? sizeOf(root, `${dir}/${glbName}`) : 0;
  const images = glbName ? imagesNamedBy(readFileSync(join(root, dir, glbName))) : [];

  let webpSet = glb;
  let ktx2Set = glb;
  for (const image of images) {
    for (const [path, add] of [
      [image, (n: number) => (webpSet += n)],
      [ktx2Of(image), (n: number) => (ktx2Set += n)],
    ] as const) {
      if (existsSync(join(root, dir, path))) add(sizeOf(root, `${dir}/${path}`));
      else problems.push(`${room}: the GLB names ${image} and ${path} is not served`);
    }
  }
  const largestFile = Math.max(0, ...walk(root, dir).map((p) => sizeOf(root, `${dir}/${p}`)));
  return { sizes: { glb, webpSet, ktx2Set, largestFile }, problems, images };
}

describe('G74 — a room stays inside its budget', () => {
  const rooms = roomIds();

  it('finds at least one room', () => {
    expectFound(rooms, 'served room folders', 1);
  });

  it.each(rooms)('%s: the GLB, each texture set and every file are inside the caps', (room) => {
    const { sizes, problems, images } = measure(room);
    expect(images.length, `${room}: images the GLB names`).toBeGreaterThanOrEqual(10);
    // the totals are the GLB plus the textures: a sum that forgot to add them would pass the caps
    expect(sizes.webpSet, `${room}: the WebP set adds its textures`).toBeGreaterThan(sizes.glb);
    expect(sizes.ktx2Set, `${room}: the KTX2 set adds its textures`).toBeGreaterThan(sizes.glb);
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

  describe('measure() on a room built in a temporary folder', () => {
    function glbNaming(images: string[]): Buffer {
      const json = Buffer.from(JSON.stringify({ images: images.map((uri) => ({ uri })) }));
      const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
      const header = Buffer.alloc(20);
      header.write('glTF', 0, 'latin1');
      header.writeUInt32LE(2, 4);
      header.writeUInt32LE(20 + padded.length, 8);
      header.writeUInt32LE(padded.length, 12);
      header.write('JSON', 16, 'latin1');
      return Buffer.concat([header, padded]);
    }

    it('adds each served texture to both sets, and names one that is not served', () => {
      const root = mkdtempSync(join(tmpdir(), 'room-budget-'));
      try {
        const dir = join(root, SERVED, 'r');
        mkdirSync(join(dir, 'ktx-etc1s', 'bake'), { recursive: true });
        mkdirSync(join(dir, 'bake'), { recursive: true });
        const glb = glbNaming(['bake/a.webp', 'bake/b.webp']);
        writeFileSync(join(dir, 'room.glb'), glb);
        writeFileSync(join(dir, 'bake', 'a.webp'), Buffer.alloc(1000));
        writeFileSync(join(dir, 'ktx-etc1s', 'bake', 'a.ktx2'), Buffer.alloc(300));
        const { sizes, problems } = measure('r', root);
        expect(sizes.webpSet).toBe(glb.length + 1000);
        expect(sizes.ktx2Set).toBe(glb.length + 300);
        expect(problems.join('\n')).toMatch(/names bake\/b\.webp and bake\/b\.webp is not served/);
        expect(problems.join('\n')).toMatch(/ktx-etc1s\/bake\/b\.ktx2 is not served/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('a second GLB, and a 30 MiB file in a folder nobody recorded', () => {
      const root = mkdtempSync(join(tmpdir(), 'room-budget-'));
      try {
        const dir = join(root, SERVED, 'stray');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'a.glb'), glbNaming([]));
        writeFileSync(join(dir, 'b.glb'), glbNaming([]));
        writeFileSync(join(dir, 'big.bin'), Buffer.alloc(30 * 1024 * 1024));
        const { sizes, problems } = measure('stray', root);
        expect(problems.join('\n')).toMatch(/expected one GLB/);
        expect(budgetFaults('stray', sizes).join('\n')).toMatch(/served file/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
