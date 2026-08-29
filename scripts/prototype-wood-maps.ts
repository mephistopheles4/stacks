/**
 * PROTOTYPE ONLY — wayfinder ticket #284, "Which channel makes the woodwork
 * read as wood — pigment, relief, or both?", under map #280. Never merged to
 * `main`.
 *
 *     pnpm tsx scripts/prototype-wood-maps.ts
 *
 * Turns the downloaded Poly Haven sapele veneer into the files the arms bind,
 * and computes the one number the **mean-matched flat twin** needs.
 *
 * Two things it states about itself:
 *
 * 1. **512 is the shipping size and 2k is the control.** #281 settled 512 on
 *    the long edge, on `MAX_COVER_EDGE`'s precedent, and left "does 512 resolve
 *    a plank's grain at `minDistance`" explicitly unmeasured. Both sizes are
 *    written so the render can answer it instead of assuming it.
 * 2. **The flat twin's colour is computed in linear light, not in sRGB.**
 *    Shading multiplies a linear albedo by a linear radiance, so the flat
 *    colour that renders to the same average as the map is
 *    `linearToSRGB(mean(sRGBToLinear(texel)))`. Averaging the sRGB bytes
 *    directly — the obvious version — lands a visibly different brown, and the
 *    whole point of the twin is that it differs from the map by grain alone.
 *    ⚠️ **Only the diffuse map is a colour**; the normal and roughness maps are
 *    data and are resized with no colour reasoning at all.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/repo-root.ts';

const WOOD_DIR = join(REPO_ROOT, 'packages', 'site', 'public', 'wood');

/** #281's number, from `MAX_COVER_EDGE`'s precedent. */
const SHIPPING_EDGE = 512;

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

/**
 * The average colour of a decoded map, in the space a `MeshStandardMaterial`
 * colour is written in.
 *
 * Computed from the **512** map rather than the 2k one, because 512 is what a
 * pigment arm actually binds and a resize is a blur: the two means are close
 * but they are not identical, and the twin has to match the arm it partners.
 */
async function meanColour(file: string): Promise<{ hex: string; rgb: [number, number, number] }> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const totals = [0, 0, 0];
  let pixels = 0;
  for (let i = 0; i < data.length; i += channels) {
    for (let c = 0; c < 3; c += 1) {
      totals[c] = (totals[c] ?? 0) + srgbToLinear((data[i + c] ?? 0) / 255);
    }
    pixels += 1;
  }
  const rgb = totals.map((total) => Math.round(linearToSrgb(total / pixels) * 255)) as [
    number,
    number,
    number,
  ];
  return {
    hex: `0x${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
    rgb,
  };
}

/** The naive version, printed only so the difference is on the record. */
async function naiveMeanColour(file: string): Promise<string> {
  const { channels } = await sharp(file).stats();
  const rgb = channels.slice(0, 3).map((channel) => Math.round(channel.mean));
  return `0x${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

async function main(): Promise<void> {
  const sources = readdirSync(WOOD_DIR).filter((name) => name.endsWith('-2k.jpg'));
  if (sources.length === 0) throw new Error(`no *-2k.jpg source maps in ${WOOD_DIR}`);

  for (const source of sources) {
    const from = join(WOOD_DIR, source);
    const to = join(WOOD_DIR, source.replace('-2k.jpg', '-512.jpg'));
    await sharp(from)
      .resize(SHIPPING_EDGE, SHIPPING_EDGE, { fit: 'inside' })
      .jpeg({ quality: 88 })
      .toFile(to);
    const meta = await sharp(to).metadata();
    console.log(
      `${source.padEnd(22)} ${String(statSync(from).size).padStart(8)} B  →  ` +
        `${to.split(/[\\/]/).pop()?.padEnd(22) ?? ''} ${String(statSync(to).size).padStart(7)} B  ` +
        `${String(meta.width)}x${String(meta.height)}`,
    );
  }

  const diffuse512 = join(WOOD_DIR, 'sapele-diff-512.jpg');
  const linear = await meanColour(diffuse512);
  const naive = await naiveMeanColour(diffuse512);
  console.log('');
  console.log(`mean-matched flat twin   ${linear.hex}   rgb(${linear.rgb.join(', ')})`);
  console.log(`the naive sRGB average   ${naive}   ← not this one; see the header`);
  console.log(`today's flat wood        0x6b4f3a`);
}

await main();
