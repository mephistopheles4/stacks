/**
 * Crops the render gate's screenshot into the README's hero image.
 *
 * Run after `pnpm smoke:render`:
 *
 *   pnpm smoke:render && pnpm tsx scripts/make-readme-image.ts
 *
 * Not a pnpm script, for the same reason `make-fixture-covers.ts` isn't: it
 * regenerates a committed asset once in a while, and every name in the Commands
 * block is a name `gates/commands.test.ts` has to keep honest.
 *
 * **The source is the 50-book fixture vault, never a real one.** Every title on
 * these spines is invented (`fixtures/README.md`), which is the only reason
 * this image may be committed at all — G13 tracks no binary outside a short
 * allowlist because a real cover is somebody else's copyrighted image. Point
 * this at a real vault's render and you have published your reading list.
 *
 * The crop keeps the title overlay on the left, so the image reads as the
 * running app rather than as a product shot of a bookcase. The numbers are the
 * gate's 1440x900 viewport, trimmed to the case plus that text; they are here
 * rather than in a comment somewhere because re-deriving them by eye is the
 * annoying part.
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const REPO_ROOT = join(import.meta.dirname, '..');
const SOURCE = join(REPO_ROOT, 'artifacts', 'shelf.png');
const TARGET = join(REPO_ROOT, 'docs', 'images', 'shelf.png');

/** Left edge to just past the case; top of the title to just under the plinth. */
const CROP = { left: 0, top: 15, width: 1050, height: 810 } as const;

async function main(): Promise<void> {
  try {
    await access(SOURCE);
  } catch {
    console.error(`no ${SOURCE}\n\nRun \`pnpm smoke:render\` first — it renders the fixture shelf.`);
    process.exitCode = 1;
    return;
  }

  const { width, height } = await sharp(SOURCE).metadata();
  if (width === undefined || height === undefined) {
    console.error('could not read the screenshot dimensions');
    process.exitCode = 1;
    return;
  }

  // A viewport change upstream would otherwise crop to somewhere arbitrary and
  // commit it, which is the kind of thing nobody notices until it is on GitHub.
  if (CROP.left + CROP.width > width || CROP.top + CROP.height > height) {
    console.error(
      `screenshot is ${width}x${height}, too small for the crop ` +
        `(${CROP.left + CROP.width}x${CROP.top + CROP.height}). ` +
        `Re-derive CROP against the render gate's viewport.`,
    );
    process.exitCode = 1;
    return;
  }

  await sharp(SOURCE).extract({ ...CROP }).png({ compressionLevel: 9 }).toFile(TARGET);

  const out = await sharp(TARGET).metadata();
  console.log(`docs/images/shelf.png  ${out.width}x${out.height}`);
}

await main();
