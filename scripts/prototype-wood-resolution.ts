/**
 * PROTOTYPE ONLY — wayfinder ticket #284, under map #280. Never merged to
 * `main`.
 *
 *     pnpm tsx scripts/prototype-wood-resolution.ts
 *
 * The owner's report: **rosewood is low resolution when zoomed in.** This walks
 * the two levers that answer it and reports what each costs, at the rung where
 * the complaint lives — `minDistance`, plus zoom 25 so the trade can be seen at
 * a normal distance too.
 *
 * ## The number the eye reads is texels per world unit
 *
 * Not texels. It is `resolution / unitsPerTile`, so the same 512 is sharp on one
 * sheet and soft on the other:
 *
 * | | 512 | 1024 | 2048 |
 * | --- | --- | --- | --- |
 * | sapele, 1.6 units per tile | 320 | 640 | 1280 |
 * | rosewood, 7.68 units per tile | **67** | 133 | 267 |
 *
 * ⚠️ **Rosewood's 67 is the price of the thing that made it win.** Its sheet is
 * 2430 mm against sapele's 500, so one tile is wider than the whole bookcase
 * and the pattern never repeats — which is why it does not read as one board
 * photocopied. A bigger sheet at a fixed size is a coarser sheet, and the two
 * cannot both come out of one file.
 *
 * ## The two levers, and only one of them costs bytes
 *
 * - **`woodTile`** lays the sheet smaller than life. Free — no file changes —
 *   and it buys density by bringing the repeat back. On figure this busy a
 *   repeat is far harder to catch than it is on a stripe, so this is the lever
 *   to walk first.
 * - **`woodRes`** ships more texels. It costs download and, far more
 *   importantly, **decode**: `edge² × 4` bytes of RGBA, which is 1.0 MB at 512,
 *   4.0 MB at 1024 and 16.0 MB at 2048, per map. That is the number the mobile
 *   risk hangs on, and **G15 counts cover bytes and would see none of it** —
 *   `docs/gates.md` is blunt that a green G15 does not mean phones are fine.
 *
 * Every arm is differenced against **2048 at true scale**, the sharpest thing
 * reachable, so each row reads as *how far short of the best case this is*.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'woodwork-resolution');
const WOOD_DIR = join(REPO_ROOT, 'packages', 'site', 'public', 'wood');
const VIEWPORT = { width: 1440, height: 900 };

/** Rosewood's own published size, in world units. See `prototype-wood.ts`. */
const TRUE_SCALE = 7.68;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) throw new Error('no system Chrome found');
  return found;
}

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(shellCommand(command, args), {
      cwd: REPO_ROOT,
      shell: true,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${String(code)}`)),
    );
  });
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function serveDist(): Promise<{ server: Server; origin: string }> {
  const root = join(REPO_ROOT, 'packages', 'site', 'dist');
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('listening on a pipe, not a port'));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${String(address.port)}` });
    });
  });
}

interface Arm {
  readonly tag: string;
  readonly resolution: number;
  readonly tile: number;
}

const ARMS: readonly Arm[] = [
  { tag: 'r512-true', resolution: 512, tile: TRUE_SCALE },
  { tag: 'r512-half', resolution: 512, tile: TRUE_SCALE / 2 },
  { tag: 'r512-quarter', resolution: 512, tile: TRUE_SCALE / 4 },
  { tag: 'r1024-true', resolution: 1024, tile: TRUE_SCALE },
  { tag: 'r1024-half', resolution: 1024, tile: TRUE_SCALE / 2 },
  { tag: 'r2048-true', resolution: 2048, tile: TRUE_SCALE },
];

const RUNGS = [
  { tag: 'zoom25', wheelSteps: 25, label: 'zoom 25' },
  { tag: 'near', wheelSteps: 60, label: 'minDistance' },
] as const;

async function shoot(
  browser: Browser,
  origin: string,
  arm: Arm,
  wheelSteps: number,
  file: string,
): Promise<void> {
  const page: Page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument('window.__empty = true;');
  const query =
    `?wood=both&woodSpecies=rosewood&woodNormal=3` +
    `&woodRes=${String(arm.resolution)}&woodTile=${String(arm.tile)}`;
  await page.goto(`${origin}/${query}`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
  await page.waitForFunction('window.__woodReady === true', { timeout: 20_000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));

  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  for (let step = 0; step < wheelSteps; step += 1) await page.mouse.wheel({ deltaY: -120 });
  await new Promise((resolve) => setTimeout(resolve, 1200));

  writeFileSync(join(OUT_DIR, file), await page.screenshot({ type: 'png' }));
  await page.close();
}

const NOTICEABLE = 8;

async function diff(a: string, b: string): Promise<{ movedPct: number; worst: number }> {
  const sharp = (await import('sharp')).default;
  const [left, right] = await Promise.all([
    sharp(join(OUT_DIR, a)).raw().toBuffer(),
    sharp(join(OUT_DIR, b)).raw().toBuffer(),
  ]);
  let moved = 0;
  let worst = 0;
  for (let i = 0; i < left.length; i += 1) {
    const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
    if (delta > NOTICEABLE) moved += 1;
    if (delta > worst) worst = delta;
  }
  return { movedPct: (moved / left.length) * 100, worst };
}

/**
 * How much fine detail a frame actually carries.
 *
 * A difference against the sharpest arm says how *far off* it is; it does not
 * say whether the frame is soft. This does: the mean absolute Laplacian over
 * the luma channel, which is the standard blur measure. A blurred frame has
 * less of it, whatever it is being compared against.
 */
async function acutance(file: string): Promise<number> {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(join(OUT_DIR, file))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let total = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (dx: number, dy: number): number => data[(y + dy) * width + (x + dx)] ?? 0;
      total += Math.abs(4 * at(0, 0) - at(-1, 0) - at(1, 0) - at(0, -1) - at(0, 1));
    }
  }
  return total / ((width - 2) * (height - 2));
}

function bytes(resolution: number): string {
  const files = [`rosewood-diff-${String(resolution)}.jpg`, `rosewood-nor-${String(resolution)}.jpg`];
  const total = files
    .filter((file) => existsSync(join(WOOD_DIR, file)))
    .reduce((sum, file) => sum + statSync(join(WOOD_DIR, file)).size, 0);
  const decoded = (resolution * resolution * 4 * 2) / 1024 / 1024;
  return `${(total / 1024).toFixed(1).padStart(7)} KB wire, ${decoded.toFixed(1).padStart(5)} MB decoded`;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await run('pnpm', ['fixtures:50']);
  await run('pnpm', [
    'stacks',
    'build',
    '--public',
    '--vault',
    'fixtures/vault-50',
    '--assets',
    'packages/site/public',
  ]);
  await run('pnpm', ['--filter', '@stacks/site', 'run', 'build']);

  const { server, origin } = await serveDist();
  try {
    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
    });
    try {
      for (const arm of ARMS) {
        for (const rung of RUNGS) {
          await shoot(browser, origin, arm, rung.wheelSteps, `${arm.tag}-${rung.tag}.png`);
        }
      }

      console.log('');
      console.log('rosewood, both channels, normalScale 3 — the two levers:');
      console.log('');
      for (const rung of RUNGS) {
        console.log(`  at ${rung.label}:`);
        const reference = `r2048-true-${rung.tag}.png`;
        const referenceAcutance = await acutance(reference);
        for (const arm of ARMS) {
          const file = `${arm.tag}-${rung.tag}.png`;
          const density = arm.resolution / arm.tile;
          const sharpness = await acutance(file);
          const gap =
            file === reference
              ? '   — the reference'
              : await diff(reference, file).then(
                  (d) => `   vs 2048@true: >JND ${d.movedPct.toFixed(3).padStart(6)}%`,
                );
          console.log(
            `    ${arm.tag.padEnd(14)} ${String(arm.resolution).padStart(4)} texels / ` +
              `${arm.tile.toFixed(2)} units = ${density.toFixed(0).padStart(4)} per unit   ` +
              `detail ${sharpness.toFixed(2).padStart(5)} ` +
              `(${((sharpness / referenceAcutance) * 100).toFixed(0).padStart(3)}% of best)${gap}`,
          );
        }
        console.log('');
      }

      console.log('what each resolution costs, diffuse + normal:');
      for (const resolution of [512, 1024, 2048]) {
        console.log(`  ${String(resolution).padStart(4)}   ${bytes(resolution)}`);
      }
      console.log(`\nimages ${OUT_DIR}`);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

await main();
