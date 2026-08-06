/**
 * PROTOTYPE ONLY — wayfinder ticket #54, "Page edges on a box whose six faces
 * want three treatments".
 *
 *     pnpm tsx scripts/prototype-page-edges.ts
 *
 * Answers one question before any striation code is written: **how much of a
 * book is page edge at the default framing?** The ticket calls the page block
 * "the largest pale surface on any book", which is true of mesh area. Whether
 * it is true of *visible* area is what decides between a striation map and
 * doing nothing but jitter — so it is measured rather than assumed.
 *
 * The measurement is a clown pass: `window.__clown` makes `buildBook` paint the
 * page block flat magenta and every other part of the case flat green, both
 * unlit and untone-mapped. Counting those two classes in the framebuffer gives
 * the page's exact share of book pixels, with no lighting to blur the boundary.
 *
 * Built on `smoke-render.ts`'s harness — same fixture vault, same served
 * `dist/`, same Chrome. The 50-book fixture is invented, which is what makes
 * the images committable under `docs/images/` (see `gates/repo-hygiene.test.ts`).
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'page-edges');
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

/**
 * Counts the two clown classes in the drawing buffer.
 *
 * The double `requestAnimationFrame` is load-bearing for the same reason it is
 * in `smoke-render.ts`: the buffer is cleared after each composite, so reading
 * outside a frame returns nothing at all.
 */
const COUNT_CLOWN = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let pages = 0, kase = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2];
    if (r > 200 && b > 200 && g < 80) pages++;
    else if (g > 200 && r < 80 && b < 80) kase++;
  }
  return { pages, case: kase, total: w * h, size: w + 'x' + h };
})()`;

interface Counts {
  pages: number;
  case: number;
  total: number;
  size: string;
}

interface Shot {
  readonly file: string;
  readonly clown?: boolean;
  /**
   * Pixels to drag downward on the canvas before shooting.
   *
   * `OrbitControls.rotateUp` subtracts from the polar angle, so a downward drag
   * lifts the camera — which is the only way to see a book's head at all. Done
   * with synthetic mouse events rather than by exposing the camera, so the
   * prototype measures the same controls a visitor has.
   */
  readonly dragY?: number;
  /**
   * Wheel notches to dolly in before shooting.
   *
   * The axis the first sweep missed. `OrbitControls` allows roughly a 6×
   * approach here — `minDistance` is 1.5 against a framed distance near 9 — and
   * the shelf is meant to be explored close up, which is the case that decides
   * whether page-edge detail is worth having.
   */
  readonly wheelSteps?: number;
  /** Turn the striation map and per-book jitter on for this shot. */
  readonly striation?: boolean;
}

async function shoot(browser: Browser, origin: string, shot: Shot): Promise<Counts | undefined> {
  const page: Page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  if (shot.clown === true) {
    await page.evaluateOnNewDocument('window.__clown = true;');
  }
  if (shot.striation === true) {
    await page.evaluateOnNewDocument('window.__striation = true;');
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
    // In steps: OrbitControls integrates per move, and one giant jump is not
    // the same gesture as a drag.
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(x, y + (shot.dragY * step) / 10);
    }
    await page.mouse.up();
    // Damping settles over several frames.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const counts = shot.clown === true ? ((await page.evaluate(COUNT_CLOWN)) as Counts) : undefined;
  writeFileSync(join(OUT_DIR, shot.file), await page.screenshot({ type: 'png' }));
  await page.close();
  return counts;
}

function report(label: string, counts: Counts): void {
  const book = counts.pages + counts.case;
  const share = book === 0 ? 0 : (counts.pages / book) * 100;
  console.log(
    `${label.padEnd(22)} page ${String(counts.pages).padStart(7)} / book ${String(book).padStart(7)}` +
      ` = ${share.toFixed(2)}%`,
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
      await shoot(browser, origin, { file: 'before-default.png' });

      /**
       * A sweep, not one raised shot.
       *
       * `OrbitControls` turns a drag of `dy` into `2π·dy/height` radians, so on
       * a 900px canvas these are roughly 0°, 10°, 20°, 30° and 40° above the
       * default, which is itself level with the shelf. Beyond that the case's
       * own top plank fills the frame — measured at 260px, which returned no
       * books at all.
       */
      const SWEEP = [0, 25, 50, 75, 100];
      const results: { drag: number; counts: Counts }[] = [];

      for (const drag of SWEEP) {
        const counts = await shoot(browser, origin, {
          file: `clown-${String(drag)}.png`,
          clown: true,
          ...(drag === 0 ? {} : { dragY: drag }),
        });
        if (counts === undefined) throw new Error('the clown pass returned no counts');
        results.push({ drag, counts });
      }

      // The same angles unpainted, so the numbers can be checked against a
      // picture of the actual shelf.
      for (const drag of SWEEP) {
        if (drag === 0) continue;
        await shoot(browser, origin, { file: `before-${String(drag)}.png`, dragY: drag });
      }

      /**
       * The effect itself, at the default framing and at the angle that
       * flatters it most (~20°, where page edges peak).
       *
       * Rendered so the decision rests on a picture of the proposal rather than
       * on an argument about the proposal — and deliberately paired with an
       * identical shot without it.
       */
      await shoot(browser, origin, { file: 'after-default.png', striation: true });
      await shoot(browser, origin, { file: 'after-50.png', dragY: 50, striation: true });

      /**
       * Zoomed in and exploring — the axis the sweep above missed entirely.
       *
       * The shelf is built to be approached and looked at closely, so a surface
       * that is nothing at full-shelf framing can still be the surface someone
       * is actually looking at. Each level is measured *and* rendered both
       * ways, because up close the question stops being "can you see it" and
       * becomes "does it hold up".
       */
      // The last of these runs the camera into `minDistance`, which is as close
      // as the controls let anyone get — a single book, near enough.
      const ZOOMS = [10, 25, 60];
      console.log('');
      for (const wheelSteps of ZOOMS) {
        const tag = `zoom${String(wheelSteps)}`;
        const counts = await shoot(browser, origin, {
          file: `clown-${tag}.png`,
          clown: true,
          wheelSteps,
          dragY: 50,
        });
        if (counts === undefined) throw new Error('the clown pass returned no counts');
        results.push({ drag: wheelSteps, counts });
        report(`zoomed ${String(wheelSteps)} notches`, counts);

        await shoot(browser, origin, { file: `before-${tag}.png`, wheelSteps, dragY: 50 });
        await shoot(browser, origin, {
          file: `after-${tag}.png`,
          wheelSteps,
          dragY: 50,
          striation: true,
        });
      }

      console.log(`\ncanvas ${results[0]?.counts.size ?? '?'}\n`);
      for (const { drag, counts } of results) {
        const degrees = Math.round((360 * drag) / VIEWPORT.height);
        report(drag === 0 ? 'default (level)' : `orbited up ~${String(degrees)}°`, counts);
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
