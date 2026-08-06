/**
 * PROTOTYPE — throwaway, for wayfinder ticket #66.
 *
 *     pnpm tsx scripts/proto-cap-diff.ts
 *
 * Puts a number on "does the coarse cap still read", because the sheets from
 * `proto-cap-tess.ts` are supposed to look the same and squinting is not a
 * finding. Follows `prototype-page-diff.ts` (#54) and `prototype-grain-diff.ts`
 * (#68), which established the method on this map.
 *
 * Two things it does differently, both because the cap is a *silhouette*:
 *
 * - **Cropped to the head**, using the rectangle `proto-cap-tess.ts` wrote down
 *   from the reference arm. A whole-frame diff of an edge feature reports a
 *   fraction of a percent that means nothing; the map's own rule is that share
 *   of screen is scale-invariant and cannot answer a question about detail.
 * - **Reported in absolute pixels first.** The share follows in brackets.
 *
 * `32x10-again` is the negative control and is printed at the top of every
 * table. It is the same arm rendered twice, so whatever it reports is what this
 * harness cannot tell apart — an arm inside it has not been measured.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const DIR = join(REPO_ROOT, 'artifacts', 'cap-tess');

/** Just noticeable difference for a flat patch is around 1% of range. */
const JND = 2.5;

/** The reference every arm is differenced against: #56's cap, as built. */
const REFERENCE = '32x10';

/** In the order they should be read: the control, then coarser and coarser. */
const ARMS = [
  '32x10-again',
  '64x20',
  '8x10',
  '2x10',
  '1x10',
  '1x6',
  '1x4',
  '1x3',
  '1x2',
  'roll06',
  'roll16',
  'off',
] as const;

const FRAMINGS = ['head-down', 'head-closest', 'graze'] as const;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

async function luma(file: string, rect: Rect): Promise<Float32Array> {
  const { data, info } = await sharp(join(DIR, file))
    .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = new Float32Array(info.width * info.height);
  for (let i = 0; i < out.length; i += 1) {
    const r = data[i * 3] ?? 0;
    const g = data[i * 3 + 1] ?? 0;
    const b = data[i * 3 + 2] ?? 0;
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return out;
}

interface Diff {
  readonly mean: number;
  readonly p99: number;
  readonly max: number;
  readonly overJnd: number;
}

function compare(a: Float32Array, b: Float32Array): Diff {
  const deltas: number[] = [];
  let total = 0;
  let max = 0;
  let overJnd = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    total += delta;
    if (delta > max) max = delta;
    if (delta > JND) overJnd += 1;
    // Over the pixels that moved at all — a percentile across the whole crop
    // would just measure how much of it is background.
    if (delta > 0.5) deltas.push(delta);
  }
  deltas.sort((x, y) => x - y);
  return {
    mean: total / a.length,
    p99: deltas[Math.floor(deltas.length * 0.99)] ?? 0,
    max,
    overJnd,
  };
}

async function main(): Promise<void> {
  const crops = JSON.parse(readFileSync(join(DIR, 'crops.json'), 'utf8')) as Record<string, Rect>;

  for (const framing of FRAMINGS) {
    const rect = crops[framing];
    if (rect === undefined) continue;
    const reference = `${REFERENCE}-${framing}.png`;
    if (!existsSync(join(DIR, reference))) continue;
    const base = await luma(reference, rect);
    const pixels = rect.w * rect.h;

    console.log(
      `\nagainst ${reference}, cropped to the head ` +
        `(${String(rect.w)}x${String(rect.h)} = ${String(pixels)} px) — luma out of 255, JND ${String(JND)}\n`,
    );

    /**
     * The honest denominator: **the pixels the cap's presence affects**, from
     * the `off` arm. A share of the crop answers "how much of this picture",
     * which the map's scale-invariance fact says is the wrong question; this
     * answers "how much of the thing being judged".
     *
     * Deliberately not called the cap's footprint. Removing the cap also gives
     * the spine strip its `cap` of height back and moves it `cap/2`, so this
     * number is the roll *plus* that shift — an upper bound on the cap's own
     * pixels, which is the safe direction for a denominator.
     */
    const footprint = compare(base, await luma(`off-${framing}.png`, rect)).overJnd;

    for (const arm of ARMS) {
      const file = `${arm}-${framing}.png`;
      if (!existsSync(join(DIR, file))) continue;
      const other = await luma(file, rect);
      const diff = compare(base, other);
      const share = footprint === 0 ? 0 : (diff.overJnd / footprint) * 100;
      console.log(
        `${arm.padEnd(12)} over-JND ${String(diff.overJnd).padStart(6)} px ` +
          `= ${share.toFixed(2).padStart(6)}% of the cap's ${String(footprint)} px  ` +
          `mean ${diff.mean.toFixed(3)}  p99 ${diff.p99.toFixed(1)}  max ${diff.max.toFixed(1)}`,
      );
    }
  }
  console.log(
    '\nRead the first row before any other. It is the reference arm against\n' +
      'itself, so it is this rig\'s floor; a row inside it says nothing.\n',
  );
}

await main();
