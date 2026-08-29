/**
 * PROTOTYPE ONLY — wayfinder ticket #282, under map #280. Never merged.
 *
 *     pnpm tsx scripts/prototype-woodwork-diff.ts <a.png> <b.png> [more pairs...]
 *
 * The instrument #284 differences a treatment against the baseline with: mean
 * absolute channel difference, and the share of channels that moved by more
 * than a just-noticeable amount. Paths are taken as given, or resolved inside
 * `artifacts/woodwork/` when they are bare filenames, so
 *
 *     pnpm tsx scripts/prototype-woodwork-diff.ts empty-shelf.png sapele-shelf.png
 *
 * works straight after `prototype-woodwork.ts` has written the baseline.
 *
 * ⚠️ **It reports and it does not decide** — #282's method table is explicit
 * about that, and #68 is why. #68's grain moved **0 px above this threshold**
 * while its average moved 17.836% of frame, so a large number here can be
 * entirely the new average colour and none of the grain. That is what the
 * mean-matched flat twin is for: difference the treatment against *its own*
 * flat average as well as against today's shelf, and the two numbers separate
 * what one number cannot.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const DIR = join(REPO_ROOT, 'artifacts', 'woodwork');

/** Below this, a channel shift is invisible on a normal display. */
const NOTICEABLE = 8;

function resolve(path: string): string {
  const direct = isAbsolute(path) ? path : join(process.cwd(), path);
  if (existsSync(direct)) return direct;
  const inDir = join(DIR, path);
  if (existsSync(inDir)) return inDir;
  throw new Error(`missing ${path} — looked in ${process.cwd()} and ${DIR}`);
}

async function compare(a: string, b: string): Promise<void> {
  const [left, right] = await Promise.all([
    sharp(resolve(a)).raw().toBuffer(),
    sharp(resolve(b)).raw().toBuffer(),
  ]);
  if (left.length !== right.length) throw new Error(`${a} and ${b} differ in size`);

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
    `${`${a} → ${b}`.padEnd(46)} mean Δ ${mean.toFixed(3).padStart(7)}   ` +
      `channels moved >${String(NOTICEABLE)}: ${movedPct.toFixed(3).padStart(7)}%   worst Δ ${String(worst)}`,
  );
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error('usage: pnpm tsx scripts/prototype-woodwork-diff.ts <a.png> <b.png> [more pairs...]');
  process.exit(1);
}

for (let i = 0; i < args.length; i += 2) {
  await compare(args[i] ?? '', args[i + 1] ?? '');
}
