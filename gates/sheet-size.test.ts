/**
 * G52 — no woodwork sheet is bigger than the shelf can afford to decode.
 *
 * ## What this catches that G15 cannot
 *
 * ⚠️ **G15 (`cover-budget`) counts cover bytes only, and would not notice an
 * 8192-square veneer.** It stages the fixture vault through the publisher and
 * measures what lands in `covers/`; a file committed straight into
 * `packages/site/public/` never passes through any of that. So the shelf's
 * *furniture* has been unmeasured since the day it stopped being flat colour,
 * on exactly the axis that once killed a phone.
 *
 * **The cost that matters is decode, not download.** A JPEG is a few hundred
 * kilobytes on the wire and `edge² × 4` bytes of RGBA once it reaches the GPU —
 * 4.0 MB at 1024 and **16.0 MB at 2048**, per map, uploaded before the first
 * frame beside every cover. G15's own docblock records what that arithmetic did
 * the last time nobody was doing it: 8.4 MB of covers decoded to 314 MB, the
 * renderer was killed on a phone, and the reload hit a browser that then refused
 * to hand out a context at all. `smoke:render` screenshots a desktop context
 * with gigabytes of headroom and would see none of it.
 *
 * ## Two caps, because two different things go wrong
 *
 * - **The long edge** is the one that reaches graphics memory, and it is capped
 *   an order of magnitude below where a JPEG stops looking reasonable on disk.
 * - **The byte size** is what a visitor waits for, and it is the cap that
 *   notices a sheet re-encoded at quality 100 — dimensionally innocent, three
 *   times the bytes.
 *
 * ⚠️ **Neither is derived from what is in the directory today**, which would be
 * a floor equal to a population — the shape `docs/spec/supply-chain.md` records
 * going wrong. Both are set against what the rollout's remaining tickets will
 * add, measured on their prototype branches rather than guessed: sapele's 1024
 * diffuse at 170.8 KB ([#306](https://github.com/mephistopheles4/stacks/issues/306))
 * and `dark_wood`'s 512 at 54.5 KB
 * ([#304](https://github.com/mephistopheles4/stacks/issues/304)). So a later
 * ticket does not have to relitigate this number to land its own sheet, and
 * a 2048 is refused whichever ticket brings it.
 *
 * ## The vacuous green, and what closes it
 *
 * A gate that sweeps a directory passes perfectly when the directory is empty,
 * renamed or misspelled — the failure `docs/gates.md` records under *a
 * malformed identifier reads as no findings*. Three things close it: the sweep
 * is floored, **every entry must be an image this gate can actually measure**
 * (a file `sharp` cannot open is a red naming it, never a silent skip), and the
 * URL `woodwork.ts` resolves must name a file that is really there — which is
 * also what makes the caps apply to the sheet that ships rather than to whatever
 * happens to be lying beside it.
 *
 * See docs/gates.md, row G52 (sheet-size), and
 * [#302](https://github.com/mephistopheles4/stacks/issues/302).
 */

import { describe, expect, it } from 'vitest';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { measureCover } from '../packages/core/src/covers/cover-budget.ts';
import { WOODWORK_SHEET } from '../packages/site/src/shelf/woodwork.ts';
import { REPO_ROOT, expectFound } from './repo.ts';

/** Where a committed sheet lives. The URL path is this directory, served. */
const WOOD_DIR = join(REPO_ROOT, 'packages', 'site', 'public', 'wood');

/**
 * The long-edge cap, in texels.
 *
 * 1024 decodes to 4.0 MB; the next rung up is 16.0 MB, which is a sixth of
 * G15's whole `TEXTURE_BUDGET_BYTES` spent on one plank's figure.
 */
const MAX_SHEET_EDGE = 1024;

/**
 * The per-file byte cap.
 *
 * The largest sheet this rollout ships is rosewood's 1024 diffuse at 266.5 KB,
 * and the headroom above it is for a re-encode rather than for a bigger sheet —
 * the edge cap is what decides how big a sheet may be.
 */
const MAX_SHEET_BYTES = 320 * 1024;

interface Sheet {
  readonly name: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

async function sheets(): Promise<Sheet[]> {
  const names = await readdir(WOOD_DIR);

  return Promise.all(
    names.map(async (name) => {
      const path = join(WOOD_DIR, name);
      const size = await measureCover(path);
      return {
        name,
        bytes: (await stat(path)).size,
        width: size?.width ?? 0,
        height: size?.height ?? 0,
      };
    }),
  );
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

describe('G52 — the woodwork directory is read, and the read is not empty', () => {
  it('finds sheets to measure', async () => {
    // Floored, because every clause below is satisfied by an empty list. A
    // directory renamed or a path misspelled reads as *no oversized files*,
    // which is indistinguishable from a pass.
    expectFound(await sheets(), `image(s) under ${WOOD_DIR}`);
  });

  it('holds nothing it cannot measure', async () => {
    // A file `sharp` will not open is not a sheet, and skipping it quietly is
    // how a cap stops applying to something. Anything that belongs in this
    // directory is an image; anything else belongs somewhere the caps mean
    // something.
    const unreadable = (await sheets())
      .filter((sheet) => sheet.width === 0 || sheet.height === 0)
      .map((sheet) => sheet.name);

    expect(
      unreadable,
      'files under the site’s public wood directory that are not images this gate can ' +
        'measure. Every cap here is a cap on a decoded image, so a file it cannot open is ' +
        `a file no cap applies to: ${unreadable.join(', ')}`,
    ).toEqual([]);
  });

  it('serves the sheet `woodwork.ts` actually asks for', async () => {
    // What binds the caps to the shipped configuration rather than to whatever
    // is lying beside it — and, in the other direction, the only thing here that
    // would notice the module pointing at a file that is not committed. The URL
    // is compared, never fetched: G21 records any request the suite makes.
    const names = (await sheets()).map((sheet) => sheet.name);
    const served = names.map((name) => `/wood/${name}`);

    expect(
      served,
      `\`WOODWORK_SHEET.url\` is ${WOODWORK_SHEET.url}, and nothing under ${WOOD_DIR} is ` +
        'served at that path. On a live build that is a 404 and a bookcase left at its ' +
        'fallback colour, which looks like a texture nobody bound',
    ).toContain(WOODWORK_SHEET.url);
  });
});

describe('G52 — every sheet fits both caps', () => {
  it('caps every sheet on its long edge', async () => {
    const found = expectFound(await sheets(), 'woodwork sheet(s)');

    const tooBig = found
      .filter((sheet) => Math.max(sheet.width, sheet.height) > MAX_SHEET_EDGE)
      .map(
        (sheet) =>
          `${sheet.name} ${String(sheet.width)}x${String(sheet.height)} ` +
          `(${mb(sheet.width * sheet.height * 4)} decoded)`,
      );

    expect(
      tooBig,
      `woodwork sheets over ${String(MAX_SHEET_EDGE)}px on the long edge. The cost is ` +
        'decode, at `edge² × 4` bytes of RGBA uploaded before the first frame beside every ' +
        'cover — G15 counts covers and sees none of this. Re-export the sheet smaller; do ' +
        `not raise the cap: ${tooBig.join('; ')}`,
    ).toEqual([]);
  });

  it('caps every sheet on its byte size', async () => {
    const found = expectFound(await sheets(), 'woodwork sheet(s)');

    const heavy = found
      .filter((sheet) => sheet.bytes > MAX_SHEET_BYTES)
      .map((sheet) => `${sheet.name} ${kb(sheet.bytes)}`);

    expect(
      heavy,
      `woodwork sheets over ${kb(MAX_SHEET_BYTES)}. Dimensions alone would pass a sheet ` +
        're-encoded at a quality nobody asked for, which costs a visitor the wait and buys ' +
        `nothing the eye can find: ${heavy.join('; ')}`,
    ).toEqual([]);
  });
});
