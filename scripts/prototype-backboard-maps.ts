/**
 * PROTOTYPE ONLY — wayfinder ticket #297, under map #280. Never merged to
 * `main`.
 *
 *     pnpm tsx scripts/prototype-backboard-maps.ts
 *
 * Fetches the backboard candidates the survey shortlisted, writes them at the
 * three sizes the arms bind, and computes each one's **mean-matched flat
 * twin** — the standing rule on #280, and the one that matters most here: a
 * darker sheet changes the average colour of 90% of the near frame, and a
 * whole-frame number would report that as grain.
 *
 * ⚠️ **Deliberately separate from `prototype-wood-maps.ts`**, which resizes
 * *every* `*-2k.jpg` in the folder. Re-encoding the woodwork's own sheets would
 * rewrite files #284's numbers were measured from, for no reason.
 *
 * The mean is computed the way that file computes it and for the same reason:
 * shading multiplies a **linear** albedo, so the flat colour that renders to
 * the same average as the map is `linearToSRGB(mean(sRGBToLinear))`, and it is
 * computed **per resolution**, because a resize is a blur and a blur moves an
 * average.
 */
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const WOOD_DIR = join(REPO_ROOT, 'packages', 'site', 'public', 'wood');
const EDGES = [512, 1024, 2048] as const;

/**
 * The shortlist, and what each one is doing on it.
 *
 * `dark_wood` is the **only** sheet in Poly Haven's 41-veneer branch whose mean
 * lands anywhere near `woodDark` while carrying grain worth reading — the
 * survey's finding, not a hunch: the next darkest with any contrast is +24.8
 * luma away, which is half the distance from the backboard to the planks.
 *
 * ⚠️ **`rosewood` is already on disk and is not re-fetched.** It is the
 * separation control: the woodwork's own sheet, put on the backboard, so the
 * thing #297 says must not happen can be looked at rather than asserted.
 */
const CANDIDATES = [{ slug: 'dark_wood', prefix: 'darkwood' }] as const;

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

const decodedMb = (edge: number): string => ((edge * edge * 4) / 1024 / 1024).toFixed(1);

async function meanColour(file: string): Promise<string> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const totals = [0, 0, 0];
  let pixels = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    for (let c = 0; c < 3; c += 1) {
      totals[c] = (totals[c] ?? 0) + srgbToLinear((data[i + c] ?? 0) / 255);
    }
    pixels += 1;
  }
  const rgb = totals.map((total) => Math.round(linearToSrgb(total / pixels) * 255));
  return `0x${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Poly Haven's own file index — the same one `#281`'s survey read. */
async function download(slug: string, map: 'Diffuse' | 'nor_gl', to: string): Promise<void> {
  if (existsSync(to)) return;
  const response = await fetch(`https://api.polyhaven.com/files/${slug}`);
  const files = (await response.json()) as Record<
    string,
    Record<string, { jpg?: { url: string } }> | undefined
  >;
  const url = files[map]?.['2k']?.jpg?.url;
  if (url === undefined) throw new Error(`${slug} publishes no 2k ${map} jpg`);
  const image = await fetch(url);
  writeFileSync(to, Buffer.from(await image.arrayBuffer()));
}

async function main(): Promise<void> {
  for (const candidate of CANDIDATES) {
    for (const [map, suffix] of [
      ['Diffuse', 'diff'],
      ['nor_gl', 'nor'],
    ] as const) {
      const source = join(WOOD_DIR, `${candidate.prefix}-${suffix}-2k.jpg`);
      await download(candidate.slug, map, source);
      for (const edge of EDGES) {
        const to = join(WOOD_DIR, `${candidate.prefix}-${suffix}-${String(edge)}.jpg`);
        await sharp(source).resize(edge, edge, { fit: 'inside' }).jpeg({ quality: 88 }).toFile(to);
        console.log(
          `${(to.split(/[\\/]/).pop() ?? '').padEnd(26)} ` +
            `${String(statSync(to).size).padStart(8)} B on the wire   ` +
            `${decodedMb(edge).padStart(5)} MB decoded`,
        );
      }
    }
  }

  console.log('');
  console.log('mean-matched flat twins, per resolution — computed in linear light:');
  for (const candidate of CANDIDATES) {
    for (const edge of EDGES) {
      const file = join(WOOD_DIR, `${candidate.prefix}-diff-${String(edge)}.jpg`);
      console.log(`  ${candidate.prefix} @${String(edge).padEnd(6)} ${await meanColour(file)}`);
    }
  }
  console.log('  woodDark        0x4a3527   ← the flat backboard on main');
}

await main();
