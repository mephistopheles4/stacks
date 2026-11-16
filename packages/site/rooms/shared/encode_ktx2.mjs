// #593: every room texture as KTX2 (ETC1S), beside the WebPs it is made from (spec S4.9). The one encoder.
//
//   node packages/site/rooms/shared/encode_ktx2.mjs <room> <path to ktx>
//
// `ktx` is KTX-Software 4.4.2's command-line tool (github.com/KhronosGroup/KTX-Software, release
// v4.4.2). Each WebP goes to PNG through sharp (core's own dependency), then `ktx create` encodes it
// as ETC1S with mipmaps into public/rooms/<room>/ktx-etc1s/, at the same relative path.
//
// Block compression needs both sides a multiple of 4, so a size that is not is resampled up to the
// next one: the Willow wallpaper (768x1203) drew black until it was encoded at 768x1204.
//
// Measured on bake 10 (49 textures): WebP 23.7 MB to download and about 1.5 GB of GPU memory
// unpacked with mipmaps; ETC1S 31.7 MB and about 190 MB. UASTC was 157 MB and was not taken.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [room, ktx] = process.argv.slice(2);
if (!room || !ktx) throw new Error('usage: node encode_ktx2.mjs <room> <path to ktx>');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(room)) throw new Error(`not a room id: ${room}`);
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', '..');
const src = path.join(site, 'public', 'rooms', room);
const out = path.join(src, 'ktx-etc1s');
const sharp = createRequire(path.resolve(site, '../core/package.json'))('sharp');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'room-ktx2-'));
const up4 = (n) => Math.ceil(n / 4) * 4;

let webp = 0;
let packed = 0;
for (const dir of ['bake', 'light', 'tex']) {
  for (const name of fs.readdirSync(path.join(src, dir)).filter((f) => f.endsWith('.webp'))) {
    const input = path.join(src, dir, name);
    const png = path.join(tmp, `${dir}-${name}.png`);
    const { width, height } = await sharp(input).metadata();
    await sharp(input).removeAlpha().png().toFile(png);
    // the rug's pile grain is an occlusion map, read as data rather than as colour
    const linear = name.startsWith('rug-pile');
    const dst = path.join(out, dir, name.replace(/\.webp$/, '.ktx2'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    execFileSync(ktx, [
      'create',
      '--format',
      linear ? 'R8G8B8_UNORM' : 'R8G8B8_SRGB',
      '--assign-tf',
      linear ? 'linear' : 'srgb',
      '--width',
      String(up4(width)),
      '--height',
      String(up4(height)),
      '--generate-mipmap',
      '--encode',
      'basis-lz',
      '--clevel',
      '4',
      '--qlevel',
      '255',
      png,
      dst,
    ]);
    webp += fs.statSync(input).size;
    packed += fs.statSync(dst).size;
    console.log(`${dir}/${name}: ${width}x${height} -> ${path.relative(src, dst)}`);
  }
}
fs.rmSync(tmp, { recursive: true });
console.log(
  `[room] KTX2: ${(webp / 1e6).toFixed(1)} MB of WebP -> ${(packed / 1e6).toFixed(1)} MB of ETC1S`,
);
