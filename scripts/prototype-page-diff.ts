/**
 * PROTOTYPE ONLY — wayfinder ticket #54.
 *
 *     pnpm tsx scripts/prototype-page-diff.ts
 *
 * How much does the striation actually change the picture? Eyeballing a pair of
 * screenshots is exactly the kind of argument this map's rules push back on, so
 * this measures it: mean absolute difference per channel, and the count of
 * pixels that moved by more than a just-noticeable amount.
 *
 * Run after `scripts/prototype-page-edges.ts` has written the pairs.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const DIR = join(REPO_ROOT, 'artifacts', 'page-edges');

/** Below this, a channel shift is invisible on a normal display. */
const NOTICEABLE = 8;

async function pixels(file: string): Promise<Buffer> {
  const path = join(DIR, file);
  if (!existsSync(path)) throw new Error(`missing ${path} — run prototype-page-edges.ts first`);
  return sharp(path).raw().toBuffer();
}

async function compare(label: string, a: string, b: string): Promise<void> {
  const [left, right] = await Promise.all([pixels(a), pixels(b)]);
  if (left.length !== right.length) throw new Error('images differ in size');

  let total = 0;
  let moved = 0;
  let worst = 0;
  for (let i = 0; i < left.length; i++) {
    const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
    total += delta;
    if (delta > NOTICEABLE) moved++;
    if (delta > worst) worst = delta;
  }

  const mean = total / left.length;
  const movedPct = (moved / left.length) * 100;
  console.log(
    `${label.padEnd(20)} mean Δ ${mean.toFixed(3).padStart(7)}   ` +
      `channels moved >${String(NOTICEABLE)}: ${movedPct.toFixed(3).padStart(6)}%   worst Δ ${String(worst)}`,
  );
}

await compare('default framing', 'before-default.png', 'after-default.png');
await compare('orbited up ~20°', 'before-50.png', 'after-50.png');
// The distance axis, which the first pass missed entirely.
await compare('zoomed 10', 'before-zoom10.png', 'after-zoom10.png');
await compare('zoomed 25', 'before-zoom25.png', 'after-zoom25.png');
await compare('zoomed 60 (max)', 'before-zoom60.png', 'after-zoom60.png');
