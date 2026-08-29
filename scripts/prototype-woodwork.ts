/**
 * PROTOTYPE ONLY — wayfinder ticket #282, "Render the empty bookcase as the
 * woodwork baseline", under map #280. Never merged to `main`.
 *
 *     pnpm tsx scripts/prototype-woodwork.ts
 *
 * Renders the **empty bookcase** at the four rungs of #54's distance ladder —
 * full shelf, zoom 10, zoom 25, `minDistance` — and its **populated twin** at
 * the same four cameras. That pair is the baseline every wood treatment on
 * [#284] is differenced against, and it is measured rather than argued.
 *
 * Three things this states about itself, because #282's method table says the
 * numbers report and never decide:
 *
 * 1. **The ladder is level.** #54's own script bakes `dragY: 50` — a ~20° orbit
 *    — into every zoomed shot. Copying that loop would have made "level ladder"
 *    false in the one place nobody would check. There is no drag here at all.
 *    Relief banks its effect on the plank *top* faces, which a level camera
 *    never shows, so #284 must add the angle before believing a weak relief
 *    number. That is a finding to carry forward, not a defect here.
 * 2. **The empty case is the full case with the books removed**, not a smaller
 *    case. `window.__empty` (a prototype-only patch in `scene.ts` on this
 *    branch) skips book placement and leaves the row count alone, so the empty
 *    and populated frames share one `frameCamera` and differ by exactly the
 *    books.
 * 3. **Every check has a control through the identical pipe.** A rerun proves
 *    the renders are deterministic, a 90-notch shot proves the 60-notch rung is
 *    really clamped at `minDistance`, and empty-vs-populated proves the differ
 *    reports a large number when the picture genuinely changed. A zero from an
 *    instrument nobody proved is indistinguishable from a broken instrument.
 *
 * Built on `smoke-render.ts`'s and `prototype-page-edges.ts`'s harness — same
 * fixture vault, same served `dist/`, same Chrome. The 50-book fixture is
 * invented, which is what makes these images shareable.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'woodwork');
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
 * How much of the frame is woodwork, how much is backboard, how much is room.
 *
 * The denominator #284 needs to read a whole-frame JND percentage. A treatment
 * that moves 2% of the frame has moved most of a rung where the woodwork is 3%
 * of it and almost none of a rung where the woodwork is 60%.
 *
 * The split matters and eyeballing it would have got it wrong: the two members
 * a treatment lands on are **planks and uprights**, and the big flat surface
 * behind them is the **backboard**, a second material in `woodDark` that #285
 * has not yet decided carries any grain at all. `window.__clownCase` paints the
 * first magenta and the second green through `emissive`, so the count is exact
 * rather than thresholded.
 *
 * The double `requestAnimationFrame` is load-bearing for the same reason it is
 * in `smoke-render.ts`: the buffer is cleared after each composite, so reading
 * outside a frame returns nothing at all.
 */
const COUNT_CASE = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let woodwork = 0, backboard = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2];
    // Classified by which channels dominate, not by absolute brightness: the
    // recess shading is a dark plane drawn *over* the wood, so it multiplies an
    // emissive colour down without changing its hue. Fixed thresholds counted
    // every shaded compartment as empty room.
    if (r > 12 && b > 12 && g * 2 < r && g * 2 < b) woodwork++;
    else if (g > 12 && r * 2 < g && b * 2 < g) backboard++;
  }
  return {
    woodwork, backboard, total: w * h, size: w + 'x' + h,
    books: window.__shelf.bookCount,
  };
})()`;

interface Counts {
  woodwork: number;
  backboard: number;
  total: number;
  size: string;
  books: number;
}

interface Shot {
  readonly file: string;
  /** Empty the bookcase without shrinking it. See the header. */
  readonly empty: boolean;
  /**
   * Wheel notches to dolly in before shooting, and the whole of the camera
   * work — **no drag**. `OrbitControls` multiplies the distance by 0.95 per
   * notch and clamps at `minDistance`, so 60 notches from the framed ~7 units
   * lands on the clamp; the 90-notch shot below proves it rather than assuming.
   */
  readonly wheelSteps: number;
  /**
   * Paint the two case materials flat and count them.
   *
   * A separate shot from the picture it describes, never the same one: the
   * baseline images have to be the bookcase as it renders, and a clowned frame
   * is an instrument reading, not a render anybody judges.
   */
  readonly clown?: boolean;
}

async function shoot(browser: Browser, origin: string, shot: Shot): Promise<Counts | undefined> {
  const page: Page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  if (shot.empty) await page.evaluateOnNewDocument('window.__empty = true;');
  if (shot.clown === true) await page.evaluateOnNewDocument('window.__clownCase = true;');
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
  // Let textures land and the damped camera settle, as the render gate does.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (shot.wheelSteps > 0) {
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (let step = 0; step < shot.wheelSteps; step++) {
      await page.mouse.wheel({ deltaY: -120 });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const counts = shot.clown === true ? ((await page.evaluate(COUNT_CASE)) as Counts) : undefined;
  writeFileSync(join(OUT_DIR, shot.file), await page.screenshot({ type: 'png' }));
  await page.close();
  return counts;
}

/* --- the differ, the same one `prototype-woodwork-diff.ts` exposes ---------- */

/** Below this, a channel shift is invisible on a normal display. */
const NOTICEABLE = 8;

interface Diff {
  readonly mean: number;
  readonly movedPct: number;
  readonly worst: number;
}

async function diff(a: string, b: string): Promise<Diff> {
  const sharp = (await import('sharp')).default;
  const [left, right] = await Promise.all([
    sharp(join(OUT_DIR, a)).raw().toBuffer(),
    sharp(join(OUT_DIR, b)).raw().toBuffer(),
  ]);
  if (left.length !== right.length) throw new Error('images differ in size');

  let total = 0;
  let moved = 0;
  let worst = 0;
  for (let i = 0; i < left.length; i++) {
    const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
    total += delta;
    if (delta > NOTICEABLE) moved++;
    if (delta > worst) worst = delta;
  }
  return {
    mean: total / left.length,
    movedPct: (moved / left.length) * 100,
    worst,
  };
}

function reportDiff(label: string, d: Diff): void {
  console.log(
    `${label.padEnd(34)} mean Δ ${d.mean.toFixed(3).padStart(7)}   ` +
      `channels moved >${String(NOTICEABLE)}: ${d.movedPct.toFixed(3).padStart(7)}%   ` +
      `worst Δ ${String(d.worst)}`,
  );
}

/**
 * How many books the populated build actually shows.
 *
 * Read from the file the page fetches rather than from the page, because the
 * fixture vault is 50 notes and the public build ships fewer — private and
 * wishlist books are excluded, and the malformed one is skipped. Quoting the
 * fixture's own headline number would have been wrong by nine.
 */
function publishedBooks(): number {
  const path = join(REPO_ROOT, 'packages', 'site', 'public', 'library.json');
  const { books } = JSON.parse(readFileSync(path, 'utf8')) as { books: unknown[] };
  return books.length;
}

/* --- the ladder ------------------------------------------------------------ */

/**
 * #54's distance ladder, level.
 *
 * `near` is the `minDistance` rung: `OrbitControls.minDistance` is 1.5 against
 * a framed distance near 7, which 60 notches of 0.95 overshoots by a wide
 * margin — so the camera sits on the clamp and the rung is reproducible without
 * anybody having to hit an exact number.
 */
const LADDER = [
  { tag: 'shelf', wheelSteps: 0, label: 'full shelf' },
  { tag: 'zoom10', wheelSteps: 10, label: 'zoom 10' },
  { tag: 'zoom25', wheelSteps: 25, label: 'zoom 25' },
  { tag: 'near', wheelSteps: 60, label: 'minDistance' },
] as const;

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
      const composition: { label: string; counts: Counts }[] = [];

      // The baseline itself: the empty bookcase, four rungs, level. Each rung
      // is shot twice — once as the picture, once clowned as the measurement.
      for (const rung of LADDER) {
        await shoot(browser, origin, {
          file: `empty-${rung.tag}.png`,
          empty: true,
          wheelSteps: rung.wheelSteps,
        });
        const counts = await shoot(browser, origin, {
          file: `clown-${rung.tag}.png`,
          empty: true,
          wheelSteps: rung.wheelSteps,
          clown: true,
        });
        if (counts === undefined) throw new Error('the composition pass returned no counts');
        composition.push({ label: rung.label, counts });
      }

      // Its populated twin, at the same four cameras. #284 needs one of these
      // for the painted-shadow question; rendering all four costs one loop and
      // gives it the pair at whichever rung it wants.
      for (const rung of LADDER) {
        await shoot(browser, origin, {
          file: `books-${rung.tag}.png`,
          empty: false,
          wheelSteps: rung.wheelSteps,
        });
      }

      // Controls. Each one runs through the byte-identical invocation as the
      // thing it is a control for.
      await shoot(browser, origin, { file: 'empty-shelf-rerun.png', empty: true, wheelSteps: 0 });
      await shoot(browser, origin, { file: 'empty-near-90.png', empty: true, wheelSteps: 90 });

      console.log('');
      console.log(`canvas ${composition[0]?.counts.size ?? '?'}`);
      console.log(
        `books  ${String(publishedBooks())} in the populated build, ` +
          `${String(composition[0]?.counts.books ?? '?')} in the empty one — ` +
          'the case keeps its row count either way',
      );
      console.log('');
      console.log('frame composition, empty bookcase:');
      for (const { label, counts } of composition) {
        const wood = (counts.woodwork / counts.total) * 100;
        const back = (counts.backboard / counts.total) * 100;
        console.log(
          `  ${label.padEnd(14)} woodwork ${wood.toFixed(2).padStart(6)}%   ` +
            `backboard ${back.toFixed(2).padStart(6)}%   ` +
            `room ${(100 - wood - back).toFixed(2).padStart(6)}%`,
        );
      }

      console.log('');
      console.log('controls — what the differ says when the answer is already known:');
      reportDiff('rerun, same scene (expect ~0)', await diff('empty-shelf.png', 'empty-shelf-rerun.png'));
      reportDiff('60 vs 90 notches (expect 0)', await diff('empty-near.png', 'empty-near-90.png'));
      reportDiff('empty vs populated (expect large)', await diff('empty-shelf.png', 'books-shelf.png'));

      console.log('');
      console.log('the ladder, empty vs populated at each rung:');
      for (const rung of LADDER) {
        reportDiff(`${rung.label} — books added`, await diff(`empty-${rung.tag}.png`, `books-${rung.tag}.png`));
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
