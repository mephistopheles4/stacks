/**
 * G15 — the shelf fits in a phone.
 *
 * The defect this exists for reached the live site and crashed it. Thirty-one
 * covers went out at whatever size the provider supplied — Apple's artwork runs
 * to 2400px — which is 8.4 MB on the wire and looks entirely reasonable. But the
 * shelf is WebGL, so every cover is decoded into an *uncompressed* GPU texture
 * and all of them are uploaded before the first frame: **314 MB**. Desktop
 * absorbed it. On a phone the renderer was killed, the tab went blank, and
 * reloading hit a browser that then refused to hand out a context at all.
 *
 * Nothing could have gone red. `gate:public` reads the contents of text files,
 * so it opens no JPEG; `smoke:render` screenshots a desktop GL context with
 * gigabytes of headroom. The size of what ships was measured by nothing.
 *
 * Two assertions, because two different things go wrong:
 *
 *  - no single cover is huge, which is a property of the staging code; and
 *  - the whole shelf fits a budget, which is a property of the *library* and is
 *    the thing that actually crashes. It grows as books are added, so this one
 *    is expected to go red one day on a build that changed nothing. That is the
 *    point: it goes red on a machine instead of on someone's phone.
 *
 * See docs/gates.md, row G15 (cover-budget).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import {
  MAX_COVER_EDGE,
  TEXTURE_BUDGET_BYTES,
  decodedTextureBytes,
  measureCover,
} from '../packages/core/src/covers/cover-budget.ts';
import { publish } from '../packages/core/src/publish.ts';
import { REPO_ROOT, expectFound } from './repo.ts';

const FIXTURE_VAULT = join(REPO_ROOT, 'fixtures', 'vault');

let assets: string;

beforeEach(async () => {
  assets = await mkdtemp(join(tmpdir(), 'stacks-cover-budget-'));
});

afterEach(async () => {
  await rm(assets, { recursive: true, force: true });
});

interface Staged {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

async function stagedCovers(): Promise<Staged[]> {
  const vault = new ObsidianAdapter(FIXTURE_VAULT);
  await publish(await vault.listBooks(), vault, assets, { isPublic: true });

  const dir = join(assets, 'covers');
  const names = await readdir(dir);

  return Promise.all(
    names.map(async (name) => {
      const size = await measureCover(join(dir, name));
      return { name, width: size?.width ?? 0, height: size?.height ?? 0 };
    }),
  );
}

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

describe('G15 — staged covers fit in graphics memory', () => {
  it('has a cover in the fixture vault that is over the cap to begin with', async () => {
    // Without an oversized source this gate would pass over covers that never
    // needed resizing, which is the same vacuous-green trap the canary check in
    // G2 closes. `the-tidal-engine.png` is generated at 1400x2100 by
    // scripts/make-fixture-covers.ts precisely because real covers are that big.
    const dir = join(FIXTURE_VAULT, 'Library', 'covers');
    const names = await readdir(dir);

    const sizes = await Promise.all(
      names.map(async (name) => {
        const size = await measureCover(join(dir, name));
        return Math.max(size?.width ?? 0, size?.height ?? 0);
      }),
    );

    const oversized = sizes.filter((edge) => edge > MAX_COVER_EDGE);
    expectFound(oversized, `fixture cover(s) larger than ${MAX_COVER_EDGE}px`);
  });

  it('caps every staged cover on its long edge', async () => {
    const covers = expectFound(await stagedCovers(), 'staged cover(s)');

    const tooBig = covers.filter((cover) => Math.max(cover.width, cover.height) > MAX_COVER_EDGE);
    expect(
      tooBig.map((cover) => `${cover.name} ${String(cover.width)}x${String(cover.height)}`),
      `covers over ${String(MAX_COVER_EDGE)}px: each one is tens of MB of GPU texture`,
    ).toEqual([]);
  });

  it('keeps the whole shelf inside the texture budget', async () => {
    const covers = expectFound(await stagedCovers(), 'staged cover(s)');
    const total = covers.reduce(
      (sum, cover) => sum + decodedTextureBytes(cover.width, cover.height),
      0,
    );

    expect(
      total,
      `${String(covers.length)} covers decode to ${mb(total)} of GPU texture, over the ` +
        `${mb(TEXTURE_BUDGET_BYTES)} budget. Do not raise the budget — stop uploading every ` +
        'cover at once.',
    ).toBeLessThanOrEqual(TEXTURE_BUDGET_BYTES);
  });

  it('does not stretch a cover it resizes', async () => {
    // `withCoverAspects` measures the staged file and the shelf draws the cover
    // at that ratio, so a resize that changed the proportions would not look
    // wrong here — it would look wrong on the shelf, at the true aspect of the
    // squashed image.
    const dir = join(FIXTURE_VAULT, 'Library', 'covers');
    const source = await measureCover(join(dir, 'the-tidal-engine.png'));
    const covers = await stagedCovers();
    const staged = covers.find((cover) => cover.name === 'the-tidal-engine.png');

    expect(staged).toBeDefined();
    expect(source).toBeDefined();

    const before = (source?.width ?? 1) / (source?.height ?? 1);
    const after = (staged?.width ?? 1) / (staged?.height ?? 1);
    // Within a pixel of rounding at this size.
    expect(Math.abs(before - after)).toBeLessThan(0.01);
  });

  it('leaves a cover that is already small alone, byte for byte', async () => {
    // Re-encoding an image that did not need it is a quiet quality loss, and the
    // fixture vault is mostly 200x300 thumbnails. Compared as bytes rather than
    // as dimensions: a re-encode preserves the dimensions exactly, so measuring
    // those would pass whether or not the file was touched.
    const sourceDir = join(FIXTURE_VAULT, 'Library', 'covers');
    const covers = await stagedCovers();

    // Bucketed by the size of the *source*, not of the staged file. A cover that
    // was correctly resized ends up within the cap too, so filtering on the
    // staged size would put it here and compare 512px of output against 1400px
    // of input — a failure that means the resize worked.
    const untouched: string[] = [];
    for (const cover of covers) {
      const source = await measureCover(join(sourceDir, cover.name));
      if (source === undefined) continue;
      if (Math.max(source.width, source.height) <= MAX_COVER_EDGE) untouched.push(cover.name);
    }

    expectFound(untouched, 'staged cover(s) whose source was already within the cap');

    for (const name of untouched) {
      const source = await readFile(join(sourceDir, name));
      const staged = await readFile(join(assets, 'covers', name));
      expect(staged.equals(source), `${name} was re-encoded when it did not need to be`).toBe(true);
    }
  });
});
