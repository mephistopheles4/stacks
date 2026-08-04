/**
 * The Phase 2 render gate.
 *
 * Builds the 50-book fixture, serves the site, screenshots the shelf, and
 * asserts the result is a real picture of books rather than a blank canvas.
 *
 *     pnpm smoke:render
 *
 * "Non-blank" is deliberately stronger than "not all one colour": a shelf that
 * failed to load its books would still render wood and shadow and pass a naive
 * check. So this also asserts the page reports the expected book count and that
 * the image contains a decent spread of distinct colours.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const ARTIFACTS = join(REPO_ROOT, 'artifacts');
const OUTPUT = join(ARTIFACTS, 'shelf.png');

const VIEWPORT = { width: 1440, height: 900 };

/**
 * Derived from the library rather than hardcoded, so the gate keeps checking
 * the right thing when the fixture generator changes. Wishlist books are not
 * shelved — you do not own them yet.
 */
function expectedBookCount(): number {
  const path = join(REPO_ROOT, 'packages', 'site', 'public', 'library.json');
  const library = JSON.parse(readFileSync(path, 'utf8')) as {
    books: { status: string }[];
  };
  return library.books.filter((book) => book.status !== 'wishlist').length;
}

/**
 * How Chrome is asked to get a WebGL context, which is not the same question on
 * a workstation and on a CI runner.
 *
 * `--use-gl=angle` was chosen against Windows Chrome with a real GPU, and it is
 * still the right answer there: the screenshot is reviewed by eye, so the gate
 * should render the way the shelf actually renders. A GitHub runner has no GPU
 * at all, and the same flags fail outright —
 *
 *   THREE.WebGLRenderer: A WebGL context could not be created.
 *   GL_VENDOR = Disabled, GL_RENDERER = Disabled, Sandboxed = yes
 *
 * — so the shelf never signals ready and the gate times out. SwiftShader is
 * Chrome's software rasteriser: slower, no GPU needed, and it produces a real
 * WebGL context, which is what this gate is actually asserting exists.
 *
 * Keyed off a GPU being absent rather than off `process.platform`, because a
 * Linux workstation with a GPU should still render the way its owner sees it.
 */
function glArgs(): string[] {
  const headlessRunner = process.env['CI'] === 'true';
  return headlessRunner
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--enable-gpu', '--use-gl=angle'];
}

/** System Chrome — probed at Phase 0, so no Chromium download is needed. */
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

async function main(): Promise<void> {
  mkdirSync(ARTIFACTS, { recursive: true });

  await buildSite();
  const { server, origin } = await serveDist();
  try {
    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--headless=new', '--hide-scrollbars', ...glArgs()],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);

      const errors: string[] = [];
      page.on('pageerror', (error: unknown) => {
        errors.push(error instanceof Error ? error.message : String(error));
      });
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      // A bare "404" from the console says nothing useful; name the URL.
      page.on('requestfailed', (request) => errors.push(`request failed: ${request.url()}`));
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
      });

      await page.goto(origin, { waitUntil: 'networkidle0', timeout: 30_000 });

      try {
        await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
      } catch {
        /**
         * The shelf never booted, and a bare "waiting failed: 20000ms" says
         * nothing about why. The page errors do — a value import of the core
         * package root once dragged node:fs and sharp into the browser bundle,
         * and this was the only visible symptom.
         */
        console.error('the shelf never signalled ready. Page errors:');
        for (const message of errors.length > 0 ? errors : ['(none captured)']) {
          console.error(`  ${message}`);
        }
        process.exit(1);
      }
      // Let textures land and the damped camera settle before the shutter.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const bookCount = await page.evaluate('window.__shelf.bookCount');
      const caseOverflow = await page.evaluate('window.__shelf.caseOverflow');
      const stats = (await page.evaluate(readCanvasStats)) as Stats;

      writeFileSync(OUTPUT, await page.screenshot({ type: 'png' }));

      const cardOpened = await clickABook(page);

      report({ bookCount: Number(bookCount), caseOverflow: Number(caseOverflow), stats, errors, cardOpened });
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

/**
 * Reads the WebGL buffer directly — a screenshot can be blank for other reasons.
 *
 * The double `requestAnimationFrame` matters: the drawing buffer is cleared
 * after each composite, so reading outside a frame returns an empty buffer and
 * the gate reports a blank shelf that is actually rendering fine.
 */
const readCanvasStats = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const seen = new Set();
  let lit = 0;
  for (let i = 0; i < px.length; i += 4) {
    seen.add((px[i] >> 3) + ',' + (px[i+1] >> 3) + ',' + (px[i+2] >> 3));
    if (Math.abs(px[i] - 0x1a) > 12 || Math.abs(px[i+1] - 0x16) > 12 || Math.abs(px[i+2] - 0x13) > 12) lit++;
  }
  return { distinctColours: seen.size, nonBackgroundPct: (lit / (w * h)) * 100, size: w + 'x' + h };
})()`;

interface Stats {
  distinctColours: number;
  nonBackgroundPct: number;
  size: string;
}

/**
 * Clicks a real book and checks the detail card opens with its title.
 *
 * Aims via the page's own projection of a book rather than a fixed coordinate,
 * so the test keeps hitting a book when the shelf layout changes. Tries several
 * books because any one of them may be occluded from the current angle.
 */
interface CardOpened {
  readonly title: string;
  readonly hasImage: boolean;
  /** Pixels by which the card escapes the viewport, and the image its card. */
  readonly overflow: { readonly card: number; readonly image: number };
}

async function clickABook(page: Page): Promise<CardOpened | undefined> {
  // Keep looking until a card with a *cover* turns up. Some fixture books have
  // none, and a card with no image cannot exercise the image-overflow check —
  // which is the check that would have caught the cover spilling across the
  // viewport in the first place.
  let fallback: CardOpened | undefined;

  // Covers are assigned to fixture books at random and only some are
  // full-resolution, so this walks the whole shelf rather than the first few.
  for (let index = 0; index < 60; index += 1) {
    const point = (await page.evaluate(
      `window.__shelf.projectBook(${index})`,
    )) as { x: number; y: number } | undefined;
    if (point === undefined) continue;

    await page.mouse.click(Math.round(point.x), Math.round(point.y));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const opened = (await page.evaluate(`(() => {
      const card = document.getElementById('book-card');
      if (!card || card.hidden) return undefined;
      const box = card.getBoundingClientRect();
      const img = card.querySelector('img');
      const imgBox = img ? img.getBoundingClientRect() : null;
      return {
        title: card.querySelector('h2')?.textContent ?? '',
        // A thumbnail-sized cover fits the card even completely unstyled, so
        // only a full-resolution one actually exercises the overflow check.
        hasImage: Boolean(img) && img.naturalWidth >= 800,
        overflow: {
          card: Math.round(Math.max(0, box.right - innerWidth, box.bottom - innerHeight, -box.left, -box.top)),
          image: imgBox ? Math.round(Math.max(0, imgBox.right - box.right, imgBox.bottom - box.bottom)) : 0,
        },
      };
    })()`)) as CardOpened | undefined;

    if (opened === undefined || opened.title.length === 0) continue;
    if (opened.hasImage) return opened;
    fallback ??= opened;
  }
  return fallback;
}

function report(result: {
  bookCount: number;
  caseOverflow: number;
  stats: Stats;
  errors: string[];
  cardOpened: CardOpened | undefined;
}): void {
  const { bookCount, caseOverflow, stats, errors, cardOpened } = result;
  const failures: string[] = [];

  console.log(`canvas            ${stats.size}`);
  console.log(`books rendered    ${bookCount}`);
  console.log(`case overflow     ${caseOverflow.toFixed(4)}`);
  console.log(`distinct colours  ${stats.distinctColours}`);
  console.log(`non-background    ${stats.nonBackgroundPct.toFixed(1)}%`);
  console.log(`click opens card  ${cardOpened?.title ?? 'NO'}`);
  console.log(`screenshot        ${OUTPUT}`);

  if (cardOpened === undefined) {
    failures.push('clicking a book did not open the detail card');
  } else {
    // "The card opened" is not the same as "the card is usable". A cover
    // rendering at its natural size opened a perfectly valid card that spilled
    // across the whole viewport, and this gate happily passed it.
    if (cardOpened.overflow.card > 2) {
      failures.push(`the detail card escapes the viewport by ${cardOpened.overflow.card}px`);
    }
    if (cardOpened.overflow.image > 2) {
      failures.push(`the cover image overflows its card by ${cardOpened.overflow.image}px`);
    }
  }

  // Books inside their own case.
  //
  // The owner found this twice by eye on a phone: a leaning book's bottom corner
  // driven into the face-out book beside it, and a row's first book driven into
  // the case's own side. The layout cursor advances by a book's *thickness*, and
  // a book rotated about its centre is wider than that, so nothing in the
  // arithmetic could notice. This measures the real world bounds instead.
  //
  // Tolerance, and where it comes from. A book's printed cover and spine float
  // `SKIN` (0.0012) above their boards, so every book's true bounds exceed the
  // thickness the layout advances by, by exactly that — 0.03cm at shelf scale,
  // and not a collision. The bar sits above that and far below a real breach:
  // removing the lean clearance was measured at 0.0203, and the theoretical
  // worst is 0.03, a whole thin book.
  if (caseOverflow > 0.005) {
    failures.push(
      `a book breaks out through the side of the case by ${caseOverflow.toFixed(4)} ` +
        '(about ' + (caseOverflow * 24).toFixed(1) + 'cm at shelf scale)',
    );
  }

  const expected = expectedBookCount();
  if (bookCount !== expected) {
    failures.push(`expected ${expected} books on the shelf, got ${bookCount}`);
  }
  if (stats.nonBackgroundPct < 10) {
    failures.push(`only ${stats.nonBackgroundPct.toFixed(1)}% of the canvas is not background`);
  }
  if (stats.distinctColours < 40) {
    failures.push(`only ${stats.distinctColours} distinct colours — the shelf looks blank`);
  }
  if (errors.length > 0) {
    failures.push(`page errors:\n  ${errors.join('\n  ')}`);
  }

  if (failures.length > 0) {
    console.error(`\nFAILED\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nOK');
}

/**
 * Builds the site, then serves `dist/` from this process.
 *
 * Deliberately not the dev server: waiting for a subprocess to announce itself
 * on stdout is a race that hangs rather than fails, and a gate that can hang is
 * worse than one that can fail. Building first also means the gate screenshots
 * what actually ships.
 */
function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // `shellCommand`, not an args array: this spawns `pnpm`, which needs a shell
    // on Windows, and an array alongside one is DEP0190.
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

/**
 * Stages its own input before building.
 *
 * Both gates write `packages/site/public/library.json`, so a gate that assumed
 * someone else had put the right library there would pass or fail depending on
 * which gate ran last. Each one regenerates what it needs.
 */
async function buildSite(): Promise<void> {
  await run('pnpm', ['fixtures:50']);
  // --public stages library.json *and* the covers it references, so the render
  // never depends on someone having copied cover files in by hand.
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

/**
 * Serves `dist/` on a port the operating system picks.
 *
 * It used to be 4331, which was fine while one checkout existed. Worktrees make
 * two gates racing normal, and a fixed port turns that into one of two bad
 * outcomes: `EADDRINUSE` and a gate that fails for a reason unconnected to the
 * shelf, or — if the other server is still up and serving *its* `dist/` — a
 * screenshot of the wrong branch, scored and reported as this one's. The second
 * is the dangerous one, and it is not hypothetical: a stray server on a fixed
 * port outlived its session in this project already.
 *
 * Nothing outside this file needs the number, so nothing outside this file has
 * to agree on it.
 */
function serveDist(): Promise<{ server: Server; origin: string }> {
  const root = join(REPO_ROOT, 'packages', 'site', 'dist');

  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const file = join(root, path === '/' ? 'index.html' : path);

    // Never serve outside dist/, even for a gate.
    if (!file.startsWith(root) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }

    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });

  return new Promise((resolve, reject) => {
    // Port 0 asks the OS for a free one; `address()` is only meaningful once
    // listening has actually happened, which is why the origin is built here
    // rather than at module scope.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('the gate server is listening on a pipe, not a port'));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${String(address.port)}` });
    });
    server.on('error', reject);
  });
}

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) {
    throw new Error(`no Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  }
  return found;
}

await main();
