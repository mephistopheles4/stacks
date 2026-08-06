/**
 * PROTOTYPE ONLY — wayfinder ticket #68, "Does one shared grain read as cloth
 * across a 2.26× spread of spines?".
 *
 *     pnpm tsx scripts/prototype-spine-grain.ts
 *
 * #58 decided a binding-keyed grain in `roughnessMap` and never rendered it.
 * This shoots five arms at the two framings the map says count, and prints what
 * each one actually cost rather than what it was claimed to cost.
 *
 * The arms:
 *
 * - `baseline`   today's shelf — flat `roughness: 0.62`, 128×1024 canvas.
 * - `canvas`     #58's aspect-correct canvas alone, no grain. The control that
 *                stops the grain being credited with fixing letterform stretch.
 * - `shared`     two grains, one shared `repeat`, square at the median book.
 * - `strength`   ONE grain, binding scaling `roughness`. #58 rejected this
 *                without rendering it, so it is rendered.
 * - `perbook`    per-book `repeat`, square on every book, at a texture each.
 *
 * Framings are #54's exactly — `dragY: 50` and `ZOOMS = [10, 25, 60]`, 60
 * notches being `minDistance` — so these images are comparable to the ones
 * already linked from the map.
 *
 * Built on `smoke-render.ts`'s harness, like `prototype-page-edges.ts`: same
 * fixture vault, same served `dist/`, same Chrome. The 50-book fixture is
 * invented, which is what makes these images committable (`gates/repo-hygiene.test.ts`)
 * — and `make-50-book-fixture.ts:81` draws `pages: 120 + rand*640`, a 2.8×
 * thickness spread against the real library's 2.26×, so it tests the anisotropy
 * *harder* than the shelf it stands in for.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'spine-grain');
const VIEWPORT = { width: 1440, height: 900 };

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

function glArgs(): string[] {
  return process.env['CI'] === 'true'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--enable-gpu', '--use-gl=angle'];
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

async function buildSite(): Promise<void> {
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
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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

type Arm = 'baseline' | 'canvas' | 'flat' | 'shared' | 'strength' | 'perbook' | 'extreme';

/**
 * `extreme` is not a candidate — it drives roughness across its whole legal
 * range, which no cloth does. It is here because the first render came back
 * with the grain invisible, and "invisible" and "never bound" are the same
 * picture. See `EXTREME` in `spine-grain.ts`.
 */
const ARMS: readonly Arm[] = [
  'baseline',
  'canvas',
  'flat',
  'shared',
  'strength',
  'perbook',
  'extreme',
];

interface Cost {
  arm: string | null;
  sharedTextures: number;
  perBookTextures: number;
  books: number;
  sharedBytes: number;
  perBookBytes: number;
  spineCanvasBytes: number;
  typedBooks: number;
  mapsBound: number;
  sampleRoughness: number;
}

/**
 * Reads the live tally the shelf kept while it built, plus what the brightest
 * pixels are doing.
 *
 * The bloom question (ADR-0034) is *looked at*, not measured against the
 * threshold: roughness drives specular response, so a grain that lifts
 * highlights may cross it. Counting near-white pixels per arm at a fixed
 * framing is enough to say whether anything moved, and honest about being a
 * proxy rather than a reading of the threshold.
 */
const PROBE = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let hot = 0, lit = 0;
  for (let i = 0; i < px.length; i += 4) {
    const luma = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
    if (luma > 240) hot++;
    if (luma > 24) lit++;
  }
  return { cost: window.__grainCost ?? null, hot, lit, size: w + 'x' + h };
})()`;

interface Probe {
  cost: Cost | null;
  hot: number;
  lit: number;
  size: string;
}

interface Shot {
  readonly file: string;
  readonly arm: Arm;
  readonly dragY?: number;
  readonly wheelSteps?: number;
  readonly probe?: boolean;
}

async function shoot(browser: Browser, origin: string, shot: Shot): Promise<Probe | undefined> {
  const page: Page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  if (shot.arm !== 'baseline') {
    await page.evaluateOnNewDocument(`window.__grain = ${JSON.stringify(shot.arm)};`);
  }
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
  // Let textures land and the damped camera settle, as the render gate does.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (shot.wheelSteps !== undefined) {
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (let step = 0; step < shot.wheelSteps; step++) {
      await page.mouse.wheel({ deltaY: -120 });
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  if (shot.dragY !== undefined) {
    const x = VIEWPORT.width / 2;
    const y = VIEWPORT.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(x, y + (shot.dragY * step) / 10);
    }
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const probe = shot.probe === true ? ((await page.evaluate(PROBE)) as Probe) : undefined;
  writeFileSync(join(OUT_DIR, shot.file), await page.screenshot({ type: 'png' }));
  await page.close();
  return probe;
}

const MIB = 1024 * 1024;

function reportCost(arm: Arm, probe: Probe): void {
  const cost = probe.cost;
  if (cost === null) {
    console.log(`${arm.padEnd(9)} no tally — the grain module never loaded`);
    return;
  }
  // `books` counts what `applyGrain` saw and is 0 on the baseline arm, where the
  // grain module is inert but still tallies the type canvas every book gets.
  const perBook = cost.books === 0 ? 0 : cost.perBookBytes / cost.books;
  const canvasPerBook = cost.typedBooks === 0 ? 0 : cost.spineCanvasBytes / cost.typedBooks;
  console.log(
    `${arm.padEnd(9)} shared ${String(cost.sharedTextures)} tex ` +
      `${(cost.sharedBytes / MIB).toFixed(3)} MiB | ` +
      `per-book ${String(cost.perBookTextures)} tex ` +
      `${(perBook / MIB).toFixed(3)} MiB | ` +
      `type canvas ${(cost.spineCanvasBytes / MIB).toFixed(3)} MiB ` +
      `(${String(cost.typedBooks)} typed, ${(canvasPerBook / MIB).toFixed(3)} MiB/book)` +
      ` | maps bound ${String(cost.mapsBound)} @ roughness ${cost.sampleRoughness.toFixed(2)}`,
  );
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await buildSite();
  const { server, origin } = await serveDist();
  try {
    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--headless=new', '--hide-scrollbars', ...glArgs()],
    });
    try {
      const costs: { arm: Arm; probe: Probe }[] = [];
      const bloom: { arm: Arm; probe: Probe }[] = [];

      for (const arm of ARMS) {
        // Full-shelf framing: spines are 6–22 px wide here. If the grain shows
        // at all it shows as tone, not as weave.
        const wide = await shoot(browser, origin, {
          file: `${arm}-shelf.png`,
          arm,
          probe: true,
        });
        if (wide === undefined) throw new Error('the probe returned nothing');
        costs.push({ arm, probe: wide });

        // The near framing, which is where the map says detail work is judged.
        // 60 notches runs the camera into `minDistance`; spines are 45–103 px.
        const near = await shoot(browser, origin, {
          file: `${arm}-near.png`,
          arm,
          wheelSteps: 60,
          dragY: 50,
          probe: true,
        });
        if (near === undefined) throw new Error('the probe returned nothing');
        bloom.push({ arm, probe: near });

        // The two intermediate approaches, for the same reason #54 shot them:
        // an effect can appear on the way in and vanish at the end of the dolly.
        for (const wheelSteps of [10, 25]) {
          await shoot(browser, origin, {
            file: `${arm}-zoom${String(wheelSteps)}.png`,
            arm,
            wheelSteps,
            dragY: 50,
          });
        }
      }

      console.log(`\ncanvas ${costs[0]?.probe.size ?? '?'}\n`);
      console.log('cost, as tallied while the shelf built:\n');
      for (const { arm, probe } of costs) reportCost(arm, probe);

      console.log('\nbright pixels at minDistance — a proxy for bloom, not a threshold reading:\n');
      for (const { arm, probe } of bloom) {
        const share = probe.lit === 0 ? 0 : (probe.hot / probe.lit) * 100;
        console.log(
          `${arm.padEnd(9)} hot ${String(probe.hot).padStart(7)} / lit ${String(probe.lit).padStart(7)}` +
            ` = ${share.toFixed(3)}%`,
        );
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
