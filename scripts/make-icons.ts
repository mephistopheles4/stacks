/**
 * Rasterises the brand mark into the icon PNGs a browser still needs.
 *
 *   pnpm tsx scripts/make-icons.ts
 *
 * Not a pnpm script, for the same reason `make-readme-image.ts` isn't: it
 * regenerates a committed asset once in a while, and every name in CLAUDE.md's
 * Commands block is a name `gates/commands.test.ts` has to keep honest.
 *
 * **The output is committed**, alongside the SVGs it reads. G13
 * (`gates/repo-hygiene.test.ts`) allows it by name — the mark was drawn for
 * this app, so the provenance claim that allowlist exists to make is as clean
 * here as it gets. Run this after touching `favicon.svg` or
 * `stacks-mark.svg`, and commit what changes.
 *
 * `density` is the part that is easy to get wrong. sharp hands an SVG to
 * librsvg at 72 DPI by default, so a 64-unit viewBox rasterises to 64px and
 * `.resize(180)` then *upscales* a 64px bitmap — a blurry touch icon that is
 * the right number of bytes and passes every check you would think to write.
 * Scaling the density instead renders at the target size natively.
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import sharp from "sharp";
import { REPO_ROOT } from "./lib/repo-root.ts";

const PUBLIC_DIR = join(REPO_ROOT, "packages", "site", "public");
const ASSETS_DIR = join(REPO_ROOT, "packages", "site", "src", "assets");

/** The mark's viewBox, and the basis for every density calculation below. */
const VIEWBOX = 64;
const BASE_DPI = 72;

/** Paper, from the brand palette — the tile behind the mark. */
const PAPER = "#FBF6EC";

interface Icon {
  /** The committed SVG this is rendered from. */
  readonly source: string;
  readonly out: string;
  readonly size: number;
  /**
   * Composited onto an opaque square instead of keeping the source's alpha.
   *
   * iOS masks `apple-touch-icon` itself and renders whatever transparency it is
   * given as black, so the touch icon takes the bare mark over paper rather
   * than `favicon.svg` — whose `rx="12"` tile would come out rounded twice,
   * once by the artwork and once by the mask.
   */
  readonly flattenTo?: string;
}

const ICONS: readonly Icon[] = [
  { source: join(PUBLIC_DIR, "favicon.svg"), out: "favicon-16.png", size: 16 },
  { source: join(PUBLIC_DIR, "favicon.svg"), out: "favicon-32.png", size: 32 },
  {
    source: join(ASSETS_DIR, "stacks-mark.svg"),
    out: "apple-touch-icon.png",
    size: 180,
    flattenTo: PAPER,
  },
];

/**
 * Renders one icon, and refuses to write anything it cannot vouch for.
 *
 * The checks are the point rather than ceremony. This script's whole failure
 * mode — see the header — is output that is the right size on disk and wrong in
 * the only way that matters, so "it produced a file" proves nothing and the
 * dimensions have to be read back off the bytes actually written.
 *
 * `flattenTo` additionally has to *remove* the alpha channel, not merely paint
 * behind it, because iOS renders a transparent touch icon's background black.
 */
async function render(icon: Icon): Promise<string | undefined> {
  const density = (BASE_DPI * icon.size) / VIEWBOX;

  let pipeline = sharp(icon.source, { density }).resize(icon.size, icon.size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  if (icon.flattenTo !== undefined)
    pipeline = pipeline.flatten({ background: icon.flattenTo });

  const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  const { width, height, channels, hasAlpha } = await sharp(png).metadata();

  if (width !== icon.size || height !== icon.size) {
    return `${icon.out}: rendered ${String(width)}x${String(height)}, expected ${String(icon.size)} square`;
  }

  if (icon.flattenTo !== undefined && hasAlpha === true) {
    return `${icon.out}: still carries an alpha channel — iOS would render it black`;
  }

  await writeFile(join(PUBLIC_DIR, icon.out), png);
  console.log(
    `packages/site/public/${icon.out}  ${String(width)}x${String(height)}  ` +
      `${String(channels)}ch  ${String(png.length)} bytes`,
  );
  return undefined;
}

async function main(): Promise<void> {
  // Named literally in ICONS, so a missing one means the artwork moved or was
  // deleted — not something to rasterise around. sharp's own error for this is
  // about an input buffer and does not name the file.
  for (const icon of new Set(ICONS.map((entry) => entry.source))) {
    try {
      await access(icon);
    } catch {
      console.error(
        `no ${relative(REPO_ROOT, icon).split("\\").join("/")}\n\n` +
          "The committed SVGs are the source for every icon here; one of them has moved " +
          "or been deleted.",
      );
      process.exitCode = 1;
      return;
    }
  }

  await mkdir(PUBLIC_DIR, { recursive: true });

  const problems: string[] = [];
  for (const icon of ICONS) {
    const problem = await render(icon);
    if (problem !== undefined) problems.push(problem);
  }

  if (problems.length > 0) {
    console.error(`\nFAILED\n- ${problems.join("\n- ")}`);
    process.exitCode = 1;
  }
}

await main();
