/**
 * PROTOTYPE ONLY — wayfinder ticket #68.
 *
 *     pnpm tsx scripts/prototype-grain-diff.ts
 *
 * Puts a number on "can you see it", because the screenshots from
 * `prototype-spine-grain.ts` mostly look the same and squinting is not a
 * finding. Each grain arm is differenced against the **`canvas`** arm, not
 * against `baseline` — both carry #58's aspect-correct type, so what is left in
 * the difference is the grain and nothing else.
 *
 * Follows `prototype-page-diff.ts` on `prototype/page-edges`, which #54
 * established for the same reason.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const DIR = join(REPO_ROOT, 'artifacts', 'spine-grain');

/** Just noticeable difference for a flat patch is around 1% of range. */
const JND = 2.5;

async function luma(file: string): Promise<{ data: Float32Array; width: number; height: number }> {
  const image = sharp(join(DIR, file)).removeAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const out = new Float32Array(info.width * info.height);
  for (let i = 0; i < out.length; i += 1) {
    const r = data[i * 3] ?? 0;
    const g = data[i * 3 + 1] ?? 0;
    const b = data[i * 3 + 2] ?? 0;
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { data: out, width: info.width, height: info.height };
}

interface Diff {
  readonly mean: number;
  readonly p99: number;
  readonly max: number;
  readonly overJnd: number;
  readonly changed: number;
}

function compare(a: Float32Array, b: Float32Array): Diff {
  const deltas: number[] = [];
  let total = 0;
  let max = 0;
  let overJnd = 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    total += delta;
    if (delta > max) max = delta;
    if (delta > JND) overJnd += 1;
    if (delta > 0.5) {
      changed += 1;
      deltas.push(delta);
    }
  }
  deltas.sort((x, y) => x - y);
  return {
    mean: total / a.length,
    // Over the pixels that moved at all — a whole-frame percentile would just
    // measure how much of the frame is shelf.
    p99: deltas[Math.floor(deltas.length * 0.99)] ?? 0,
    max,
    overJnd,
    changed,
  };
}

async function main(): Promise<void> {
  const files = new Set(readdirSync(DIR));
  const framings = ['near', 'shelf'] as const;
  const arms = ['baseline', 'flat', 'shared', 'strength', 'perbook', 'extreme'] as const;

  /**
   * Two controls, because the arms change two things at once.
   *
   * `canvas` is today's spine with #58's type fix, so a difference against it is
   * *everything* a grain arm does — the tone shift and the weave together.
   * `flat` already carries the tone shift and no map, so a difference against it
   * is the weave alone. The gap between the two columns is the whole question.
   */
  const controls = ['canvas', 'flat'] as const;

  for (const framing of framings) {
    for (const controlArm of controls) {
    const control = `${controlArm}-${framing}.png`;
    if (!files.has(control)) throw new Error(`missing control ${control}`);
    const base = await luma(control);

    console.log(`\nagainst ${control} — luma units out of 255, JND ≈ ${String(JND)}\n`);
    for (const arm of arms) {
      if (arm === controlArm) continue;
      const file = `${arm}-${framing}.png`;
      if (!files.has(file)) continue;
      const other = await luma(file);
      if (other.data.length !== base.data.length) throw new Error(`${file} is a different size`);
      const diff = compare(base.data, other.data);
      const sharePixels = (diff.overJnd / base.data.length) * 100;
      console.log(
        `${arm.padEnd(9)} mean ${diff.mean.toFixed(3)}  p99 ${diff.p99.toFixed(1)}` +
          `  max ${diff.max.toFixed(1)}  over-JND ${String(diff.overJnd).padStart(7)}` +
          ` (${sharePixels.toFixed(3)}% of frame)`,
      );
    }
    }
  }
  console.log('');
}

await main();
