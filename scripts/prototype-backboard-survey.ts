/**
 * PROTOTYPE ONLY — wayfinder ticket #297, "Which wood is the backboard's own
 * sheet, and does its grain read behind books?", under map #280. Never merged
 * to `main`.
 *
 *     pnpm tsx scripts/prototype-backboard-survey.ts
 *
 * Ranks every veneer Poly Haven publishes against the three things #297 says
 * the backboard's sheet has to satisfy, **measured off the pixels rather than
 * judged off a thumbnail**.
 *
 * ## Why a survey and not a shortlist
 *
 * [#281](https://github.com/mephistopheles4/stacks/issues/281) surveyed for the
 * *woodwork* and produced a four-species menu; the backboard was never in its
 * scope, and the constraint that decides here — **darker than the planks, so
 * the books still read against it** — was not one of #281's at all. Picking
 * four dark-sounding names off the contact sheet would re-run #281's method on
 * a question it did not ask. So every asset in Poly Haven's `Wood/Veneer/`
 * branch is downloaded at 1k and measured, the light ones included: they are
 * the control that says the darkness filter is doing something.
 *
 * ## The three numbers, and what each decides
 *
 * 1. **Mean luma, in linear light.** `woodDark` is `0x4a3527` and the wood is
 *    `0x6b4f3a` — the backboard is darker on purpose, and a sheet whose mean
 *    lands near the woodwork's defeats the separation the second material
 *    exists for. ⚠️ Computed the way `prototype-wood-maps.ts` computes a
 *    mean-matched twin — `linearToSRGB(mean(sRGBToLinear))` — because shading
 *    multiplies a *linear* albedo, and the naive sRGB average lands a visibly
 *    different brown.
 * 2. **Contrast** — the standard deviation of luma across the sheet. A sheet
 *    with no contrast has no grain to read at any distance, which is the
 *    failure mode [#68](https://github.com/mephistopheles4/stacks/issues/68)
 *    and #284's `relief` arm both landed in.
 * 3. **Grain direction**, from the ratio of the column-mean spread to the
 *    row-mean spread. Stripes running down the image make its **columns**
 *    differ from one another and its rows alike, so `colSpread > rowSpread`
 *    means the grain runs down `v` — which is what decides `worldSpaceUvs`'s
 *    `swapAxes` for a member. ⚠️ **This is a fact about the downloaded image,
 *    not a convention**, and `prototype-wood.ts` states it for sapele in prose;
 *    here it is measured, so the sheet chosen cannot be laid the wrong way by
 *    an assumption nobody re-checked.
 *
 * Nothing here votes. The verdict is the owner's on a live build, which
 * [#282](https://github.com/mephistopheles4/stacks/issues/282) settled; this
 * narrows 41 sheets to the handful worth rendering.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'backboard-survey');

/** Today's two flat colours, and the only reference points this has. */
const WOOD = 0x6b4f3a;
const WOOD_DARK = 0x4a3527;
/** The standing woodwork treatment's own mean, from `prototype-wood.ts`. */
const ROSEWOOD_MEAN = 0x6e3412;

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

/** Rec. 709, the same weights the arm matrix's bloom count uses. */
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const lumaOfHex = (hex: number): number =>
  luma((hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff);

interface Sheet {
  readonly slug: string;
  readonly category: string;
  /** The sheet's real-world size in millimetres, which sets `unitsPerTile`. */
  readonly mm: number;
  readonly author: string;
}

interface Measured extends Sheet {
  readonly hex: string;
  readonly meanLuma: number;
  readonly contrast: number;
  readonly colSpread: number;
  readonly rowSpread: number;
}

async function listVeneers(): Promise<Sheet[]> {
  const response = await fetch('https://api.polyhaven.com/assets?t=textures&c=wood');
  const assets = (await response.json()) as Record<
    string,
    { category: string; dimensions: [number, number]; authors: Record<string, string> }
  >;
  return Object.entries(assets)
    .filter(([, asset]) => asset.category.startsWith('Wood/Veneer/'))
    .map(([slug, asset]) => ({
      slug,
      category: asset.category.replace('Wood/Veneer/', ''),
      mm: Math.round(asset.dimensions[0]),
      author: Object.keys(asset.authors).join(', '),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function fetchDiffuse(slug: string): Promise<string> {
  const file = join(OUT_DIR, `${slug}.jpg`);
  if (existsSync(file)) return file;
  const response = await fetch(`https://api.polyhaven.com/files/${slug}`);
  const files = (await response.json()) as {
    Diffuse?: Record<string, { jpg?: { url: string } }>;
  };
  const url = files.Diffuse?.['1k']?.jpg?.url;
  if (url === undefined) throw new Error(`${slug} publishes no 1k diffuse jpg`);
  const image = await fetch(url);
  writeFileSync(file, Buffer.from(await image.arrayBuffer()));
  return file;
}

/**
 * Mean colour in linear light, luma contrast, and which axis the stripe runs
 * down — all off one decode.
 */
async function measure(file: string): Promise<Omit<Measured, keyof Sheet>> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const totals = [0, 0, 0];
  let lumaTotal = 0;
  let lumaSquares = 0;
  const columnTotals = new Float64Array(width);
  const rowTotals = new Float64Array(height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      totals[0] = (totals[0] ?? 0) + srgbToLinear(r / 255);
      totals[1] = (totals[1] ?? 0) + srgbToLinear(g / 255);
      totals[2] = (totals[2] ?? 0) + srgbToLinear(b / 255);
      const l = luma(r, g, b);
      lumaTotal += l;
      lumaSquares += l * l;
      columnTotals[x] = (columnTotals[x] ?? 0) + l;
      rowTotals[y] = (rowTotals[y] ?? 0) + l;
    }
  }

  const pixels = width * height;
  const rgb = totals.map((total) => Math.round(linearToSrgb(total / pixels) * 255));
  const mean = lumaTotal / pixels;

  const spread = (sums: Float64Array, per: number): number => {
    const means = Array.from(sums, (sum) => sum / per);
    const average = means.reduce((a, b) => a + b, 0) / means.length;
    return Math.sqrt(means.reduce((a, m) => a + (m - average) ** 2, 0) / means.length);
  };

  return {
    hex: `0x${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
    meanLuma: mean,
    contrast: Math.sqrt(lumaSquares / pixels - mean * mean),
    colSpread: spread(columnTotals, height),
    rowSpread: spread(rowTotals, width),
  };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const sheets = await listVeneers();
  console.log(`${String(sheets.length)} veneers in Poly Haven's Wood/Veneer/ branch\n`);

  const measured: Measured[] = [];
  for (const sheet of sheets) {
    const file = await fetchDiffuse(sheet.slug);
    measured.push({ ...sheet, ...(await measure(file)) });
    process.stdout.write('.');
  }
  console.log('\n');

  console.log('the two flat colours this is measured against:');
  console.log(`  wood      0x6b4f3a   luma ${lumaOfHex(WOOD).toFixed(1)}`);
  console.log(`  woodDark  0x4a3527   luma ${lumaOfHex(WOOD_DARK).toFixed(1)}   ← the backboard today`);
  console.log(
    `  rosewood  0x6e3412   luma ${lumaOfHex(ROSEWOOD_MEAN).toFixed(1)}   ← #284's standing woodwork sheet\n`,
  );

  const target = lumaOfHex(WOOD_DARK);
  const ranked = [...measured].sort(
    (a, b) => Math.abs(a.meanLuma - target) - Math.abs(b.meanLuma - target),
  );

  console.log("every veneer, nearest `woodDark`'s luma first:");
  console.log(
    `  ${'slug'.padEnd(26)}${'category'.padEnd(24)}${'mm'.padStart(5)}  ` +
      `${'mean'.padEnd(9)}${'luma'.padStart(6)}${'Δdark'.padStart(7)}` +
      `${'contrast'.padStart(10)}${'col/row'.padStart(9)}  grain`,
  );
  for (const sheet of ranked) {
    const ratio = sheet.colSpread / (sheet.rowSpread === 0 ? 1e-6 : sheet.rowSpread);
    const delta = sheet.meanLuma - target;
    const signed = (delta >= 0 ? '+' : '') + delta.toFixed(1);
    console.log(
      `  ${sheet.slug.padEnd(26)}${sheet.category.padEnd(24)}${String(sheet.mm).padStart(5)}  ` +
        `${sheet.hex.padEnd(9)}${sheet.meanLuma.toFixed(1).padStart(6)}${signed.padStart(7)}` +
        `${sheet.contrast.toFixed(2).padStart(10)}${ratio.toFixed(2).padStart(9)}  ` +
        `${ratio > 1 ? 'down v' : 'across u'}`,
    );
  }

  console.log(`\nsheets in ${OUT_DIR}`);
}

await main();
