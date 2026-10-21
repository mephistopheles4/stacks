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
// `import type`, so nothing of three's reaches this node script — the whole
// point is that the shape cannot drift from the handle it is read off.
import type { ShelfStats } from '../packages/site/src/shelf/scene.ts';
import type { LibraryBook } from '../packages/core/src/library.ts';
import { rowsForBookcase } from '../packages/site/src/shelf/bookcase.ts';
import { toRows } from '../packages/site/src/shelf/books.ts';
// Value imports, and safe ones: both modules are pure data and arithmetic with
// no `three` and no DOM at module scope, so the gate reads the same key, wait
// and default the page does rather than a copy that could drift from them.
import { FALLBACK_KEY, RESTORE_WAIT_MS } from '../packages/site/src/shelf/shadow-fallback.ts';
import { DEFAULT_SETTINGS } from '../packages/site/src/shelf/shelf-settings.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer-core';
import { lightingOf, litFailures, type Frame, type Lighting } from './lib/large-library-lit.ts';
import {
  phoneFailures,
  pickupFailures,
  spreadFailures,
  viewerFailures,
  type PhoneRead,
  type PickupRead,
  type PutDown,
  type SpreadRead,
  CLOSED_TOLERANCE_DEG,
  type ViewerRead,
  atRestFailures,
  AT_REST_FRAMES,
} from './lib/pickup-gate.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';
import { samplingHookSource } from './lib/sampling-hook.ts';
import { serveDist } from './lib/serve-dist.ts';
import { hasSettled, RECORD_SETTLE_READINGS } from './lib/settle.ts';
import {
  BUDGET,
  describeSampling,
  judgeControl,
  judgeSampling,
  MIN_STEADY_FRAMES,
  summarise,
  type SamplingSnapshot,
} from './lib/shadow-sampling.ts';

const ARTIFACTS = join(REPO_ROOT, 'artifacts');
const OUTPUT = join(ARTIFACTS, 'shelf.png');
const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');
const LIBRARY = join(REPO_ROOT, 'packages', 'site', 'public', 'library.json');

/**
 * G59's and G61's large library: generated at gate time, staged into `artifacts/` and
 * served over the same build. Never into `packages/site/public/` — see
 * `serve-dist.ts`.
 */
const LARGE_BOOKS = 300;
/** Relative to the repo root, as the CLI's `--assets` takes it. */
const LARGE_ASSETS = `artifacts/vault-${String(LARGE_BOOKS)}-public`;
const LARGE_LIBRARY = join(REPO_ROOT, LARGE_ASSETS, 'library.json');

const VIEWPORT = { width: 1440, height: 900 };

/**
 * Derived from the library rather than hardcoded, so the gate keeps checking
 * the right thing when the fixture generator changes. Wishlist books are not
 * shelved — you do not own them yet.
 */
function expectedBookCount(path: string): number {
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

/**
 * The one flag. `--pull-request` is what `gates.yml` passes on a pull request,
 * and it skips the two checks that cost four fifths of the step on a runner with
 * no GPU (#427): G60 and G61. They still run on every push to `main` and in
 * `deploy:site`, which pass nothing. Anything else is refused before the build,
 * so a typo in the workflow cannot quietly run a different set and pass.
 */
const PULL_REQUEST_FLAG = '--pull-request';
const SKIPPED_ON_PULL_REQUESTS = 'G60, G61';

function readArgs(argv: readonly string[]): { pullRequest: boolean } {
  const unknown = argv.filter((arg) => arg !== PULL_REQUEST_FLAG);
  if (unknown.length > 0) {
    console.error(
      `smoke:render: unknown argument ${unknown.map((arg) => JSON.stringify(arg)).join(', ')}. ` +
        `The only flag is ${PULL_REQUEST_FLAG}.`,
    );
    process.exit(1);
  }
  return { pullRequest: argv.includes(PULL_REQUEST_FLAG) };
}

/**
 * Elapsed time per step, recorded as each one ends and printed with the report,
 * so the next regression is visible in the CI log without an experiment branch.
 * A label carries a gate id where the check is a gate row's own; the others are
 * named for what they drive.
 */
const TIMINGS: { label: string; seconds: number }[] = [];

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    TIMINGS.push({ label, seconds: (performance.now() - started) / 1000 });
  }
}

async function main(): Promise<void> {
  const { pullRequest } = readArgs(process.argv.slice(2));
  mkdirSync(ARTIFACTS, { recursive: true });

  await timed('build the site (fixtures and astro)', buildSite);
  const { server, origin } = await serveDist({ root: DIST });
  const large = await serveDist({ root: DIST, overlay: join(REPO_ROOT, LARGE_ASSETS) });
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
        // The viewer's fallback probe refuses held copies on purpose; only
        // those, by URL, are not page errors.
        if (message.type() !== 'error') return;
        if (REFUSED.has(message.location().url ?? '')) return;
        errors.push(message.text());
      });
      // A bare "404" from the console says nothing useful; name the URL.
      page.on('requestfailed', (request) => {
        if (!REFUSED.has(request.url())) errors.push(`request failed: ${request.url()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
      });

      // Before the navigation, so the covers' requests are counted from the first.
      const settle = watchSettle(page);
      const bootStarted = performance.now();
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      try {
        await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
      } catch {
        /**
         * The shelf never booted, and a bare "waiting failed: 60000ms" says
         * nothing about why. The page errors do — a value import of the core
         * package root once dragged node:fs and sharp into the browser bundle,
         * and this was the only visible symptom.
         */
        failBoot('the shelf never signalled ready', errors);
      }
      // The covers are in and the damped camera is where it stays (the probe in
      // the spec found it does not move after `ready`) before the shutter.
      if (!(await settle())) failBoot('the shelf never settled', errors);

      const bookCount = await page.evaluate('window.__shelf.bookCount');
      const bookcaseOverflow = await page.evaluate('window.__shelf.bookcaseOverflow');
      const stats = (await page.evaluate(readCanvasStats)) as Stats;
      const cost = (await page.evaluate('window.__shelf.stats()')) as ShelfCost;

      writeFileSync(OUTPUT, await page.screenshot({ type: 'png' }));
      TIMINGS.push({
        label: 'boot, settle and screenshot',
        seconds: (performance.now() - bootStarted) / 1000,
      });

      const pickup = await timed('G35 pickup', () => checkPickup(page));
      const viewer = await timed('examining', () => checkViewer(page));
      const phone = await timed('page at 375x812', () => checkPhone(page));
      // The phone check is the last use of this page, so close it. An open page
      // keeps drawing the shelf, and every browser context shares one GPU process
      // (software, under SwiftShader on CI), so each later boot and frame waits
      // behind it: 13.5 s to ready per G60 boot on CI against 0.7 s with it closed
      // in a local 4-core probe (#397). A check that needs this page must come
      // above this line. Listeners go first, so a request in flight when it closes
      // cannot land in `errors` as an aborted one.
      page.removeAllListeners();
      try {
        await page.close();
      } catch (error) {
        // CI's first run of this line threw this. Why the target was already gone
        // is not known (#397), and the error alone does not prove the page closed:
        // puppeteer may hold a stale id for a page that is still open. So say so in
        // the log, where C5's reading can see it; anything else is still a failure.
        if (!/No target with given id/.test(String(error))) throw error;
        console.log('main page: close() found no target, cause not established (#397)');
      }
      const spread = await timed('open spread', () => checkSpread(browser, origin));
      const atRest = await timed('G35 held at rest', () => checkHeldAtRest(browser, origin));
      const lit = await timed('G59 large-library-lit', () =>
        checkLargeLibraryLit(browser, origin, large.origin),
      );
      // Last, and in browser contexts of their own, so the record G60 writes can
      // never reach the page every check above measured.
      const fallback: FallbackChecked = pullRequest
        ? { lines: [], failures: [] }
        : await timed('G60 context-loss-fallback', () => checkContextLossFallback(browser, origin));
      const sampling: SamplingChecked = pullRequest
        ? { lines: [], failures: [] }
        : await timed('G61 one-shadow-reader', () =>
            checkShadowReaders(browser, origin, large.origin),
          );
      const tuner = await timed('G64 tuner-split', () => checkTuner(browser, origin));
      const tuning = await timed('tuning panel', () => checkTuningPanel(browser, origin));

      report({
        skipped: pullRequest ? SKIPPED_ON_PULL_REQUESTS : undefined,
        bookCount: Number(bookCount),
        bookcaseOverflow: Number(bookcaseOverflow),
        stats,
        cost,
        errors,
        pickup,
        viewer,
        phone,
        spread,
        atRest,
        lit,
        fallback,
        sampling,
        tuner,
        tuning,
      });
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
    large.server.close();
  }
}

/**
 * G59 (`large-library-lit`) — the three pages `large-library-lit.ts` judges.
 *
 * One small viewport at a device pixel ratio of 1, so the large page is cheap on
 * a runner with no GPU and the three frames are the same size. Upright, because
 * that is how the owner was holding the phone that showed the black page.
 */
const LIT_VIEWPORT = { width: 480, height: 640, deviceScaleFactor: 1 };

/**
 * The page must be tall enough that the defect would have blacked it out.
 *
 * 15 shelves frame at 31.9, past the old fog's world-unit far edge of 30, so
 * the pre-#383 range would have painted every one of its books the room
 * colour. A smaller large library would pass under the old defect too, and this
 * check would be asserting nothing.
 */
const MIN_LARGE_ROWS = 15;

/** Pinned, so every run compares the same bookcase. See `?woodSeed=` in `shelf-url.ts`. */
const LIT_SEED = 'large-library-lit';

/**
 * The defect, planted: the fog pulled over the bookcase, which is what the old
 * world-unit range did to a tall one. In framing distances — `SceneSettings.fog`.
 */
const FOG_OVER_THE_BOOKCASE = { scene: { fog: { near: 0.1, far: 0.5 } } };

interface LitChecked {
  readonly control: Lighting;
  readonly large: Lighting;
  readonly planted: Lighting;
  readonly controlBooks: number;
  readonly largeBooks: number;
  readonly failures: readonly string[];
}

async function checkLargeLibraryLit(
  browser: Browser,
  main: string,
  large: string,
): Promise<LitChecked> {
  const failures: string[] = [];
  const seed = `woodSeed=${LIT_SEED}`;
  const plant = `debug=${encodeURIComponent(JSON.stringify(FOG_OVER_THE_BOOKCASE))}`;

  const control = await grabFrame(browser, `${main}/?${seed}`, failures);
  const largePage = await grabFrame(browser, `${large}/?${seed}`, failures);
  const planted = await grabFrame(browser, `${large}/?${seed}&${plant}`, failures);

  const library = JSON.parse(readFileSync(LARGE_LIBRARY, 'utf8')) as { books: LibraryBook[] };
  const rows = rowsForBookcase(toRows(library.books, DEFAULT_SETTINGS.books).length);
  const expected = library.books.filter((book) => book.status !== 'wishlist').length;
  if (rows < MIN_LARGE_ROWS) {
    failures.push(
      `the large library stands on ${String(rows)} shelves, under ${String(MIN_LARGE_ROWS)} — ` +
        'too short for the old fog to have blacked it out, so this check would assert nothing',
    );
  }
  if (largePage.books !== expected) {
    failures.push(
      `the large page rendered ${String(largePage.books)} books, not ${String(expected)}`,
    );
  }

  const pages = {
    control: lightingOf(control.frame),
    large: lightingOf(largePage.frame),
    planted: lightingOf(planted.frame),
  };
  return {
    ...pages,
    controlBooks: control.books,
    largeBooks: largePage.books,
    failures: [...failures, ...litFailures(pages)],
  };
}

/**
 * One page's pixels, and where its books are on them.
 *
 * The rectangle comes from the page's own projection of every book, converted
 * to buffer pixels, so the bookcase is measured where it actually is rather
 * than where a layout assumption puts it.
 */
async function grabFrame(
  browser: Browser,
  url: string,
  failures: string[],
): Promise<{ frame: Frame; books: number }> {
  const page = await browser.newPage();
  try {
    await page.setViewport(LIT_VIEWPORT);
    page.on('pageerror', (error: unknown) => {
      failures.push(
        `G59 page error at ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    const settle = watchSettle(page);
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    // The same settle the main shot takes: textures land, the damped camera stops.
    if (!(await settle())) failures.push(`G59 never settled at ${url}`);

    const grabbed = (await page.evaluate(readFrame)) as {
      width: number;
      height: number;
      pixels: string;
      box: [number, number, number, number];
      books: number;
    };
    return {
      frame: {
        width: grabbed.width,
        height: grabbed.height,
        pixels: new Uint8Array(Buffer.from(grabbed.pixels, 'base64')),
        box: grabbed.box,
      },
      books: grabbed.books,
    };
  } finally {
    await page.close();
  }
}

/**
 * `readCanvasStats`'s read, handed back whole, plus the books' rectangle.
 * The double `requestAnimationFrame` is frame sync (K5): not a wait for state.
 */
const readFrame = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const px = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const rect = canvas.getBoundingClientRect();
  const sx = width / rect.width, sy = height / rect.height;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const books = window.__shelf.bookCount;
  for (let i = 0; i < books; i += 1) {
    const p = window.__shelf.projectBook(i);
    if (!p) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const box = [(x0 - rect.left) * sx, (y0 - rect.top) * sy, (x1 - rect.left) * sx, (y1 - rect.top) * sy];

  let binary = '';
  for (let i = 0; i < px.length; i += 8192) binary += String.fromCharCode(...px.subarray(i, i + 8192));
  return { width, height, pixels: btoa(binary), box, books };
})()`;

/**
 * Reads the WebGL buffer directly — a screenshot can be blank for other reasons.
 *
 * The double `requestAnimationFrame` matters: the drawing buffer is cleared
 * after each composite, so reading outside a frame returns an empty buffer and
 * the gate reports a blank shelf that is actually rendering fine. A frame sync
 * and not a wait for state (K6), so it does not depend on the runner's speed.
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
 * What the renderer is holding, read off the live handle.
 *
 * Reported and not asserted on, deliberately. Every effect on map #50 states a
 * per-book texture and draw-call cost — "+1 texture for the whole shelf",
 * "+20 draws over 49 books", "+0 per book" — and until now the gate that renders
 * 49 books could not see any of them, so a slice that quietly cost more than its
 * ticket claimed would come back green. These four numbers are what makes a
 * prediction checkable against the shelf it was a prediction about.
 *
 * A threshold is not the right shape for it. #53's budget is an estimate, the
 * counts move legitimately with the fixture, and a gate that goes red on a number
 * nobody can interpret trains people to raise the number.
 */
type ShelfCost = Pick<ShelfStats, 'textures' | 'geometries' | 'programs' | 'calls' | 'triangles'>;

/**
 * G35 (`enhanced-card`), reworded for picking a book up — the browser half.
 *
 * Clicks a real book through its projected point, as a reader would, and
 * reads what the page did: the held state and the book's pages, the
 * announcer, the history entry, and `location.href`, which must not move
 * (spec §3.9). Then a second book, then the put-back control. Every judgement
 * is `lib/pickup-gate.ts`'s, planted red in its own spec. Polls the shelf's
 * own read-back rather than sleeping: a pickup takes about 1.3 s, and a put
 * back then a pickup about 2 s.
 */
const HELD = `window.__shelf.held()?.phase === 'held'`;
const NOTHING_HELD = `window.__shelf.held() === undefined && document.querySelectorAll('.held-page').length === 0`;

/**
 * The least any wait for a state is given, whatever its caller asked for — and
 * where the gate names its five kinds of wait, once. Each has one rule, and
 * every wait that is not a presence carries a comment naming its kind and why:
 *
 * - **Presence**: a state the check needs before it can read anything. Polled
 *   (`until`, `waitForState`, the settle helper) to this floor; a timeout prints
 *   what was awaited and what the page read.
 * - **Absence**: time for something wrong to have happened, so that its absence
 *   means something. Stays a fixed wait (K1–K4, K10, K11), the owner approves each,
 *   and a slower runner can only make it weaker, never flaky.
 * - **Search**: an attempt that may legitimately miss, such as a click between
 *   books (`searchFor`). Keeps a short deadline, because a miss is an answer.
 * - **Window**: a sample to judge, such as render-loop callbacks per frame. A
 *   fixed number of frames, never a fixed time.
 * - **Frame sync**: the drawing buffer to be readable. The double
 *   `requestAnimationFrame` stays: it is a correctness device, and speed does not
 *   touch it.
 *
 * Every presence wait is for a state the case *requires* — a rebuild, a record, a
 * cleared notice — never for an absence, so a longer deadline can only turn a
 * slow pass green, never a wrong page. The callers' numbers were fitted to this
 * machine's GPU, and the first CI run on #382 showed what that costs: on the
 * runner's software renderer four cases reached exactly the state they waited
 * for a moment after 5 s, and each was reported as a failure it was not.
 */
const STATE_WAIT_FLOOR_MS = 30_000;

/**
 * **Presence** (`until`): a state the check needs before it can read anything.
 * Polled to the 30 s floor; a timeout prints what was awaited and what the shelf
 * held, and the answer stays `false` for the judges that read it. Every
 * timeout is counted, so a loop over books can stop at the first one.
 */
let presenceTimeouts = 0;

async function noteTimeout(page: Page, what: string): Promise<void> {
  presenceTimeouts += 1;
  let held = '(unreadable)';
  try {
    held = String(await page.evaluate('JSON.stringify(window.__shelf?.held?.() ?? null)')).slice(
      0,
      300,
    );
  } catch {
    // The page is gone or not a shelf; the line below still names what was awaited.
  }
  console.error(`waited ${String(STATE_WAIT_FLOOR_MS)}ms for ${what}; the shelf holds ${held}`);
}

async function until(page: Page, condition: string, what: string): Promise<boolean> {
  try {
    await page.waitForFunction(condition, { timeout: STATE_WAIT_FLOOR_MS, polling: 50 });
    return true;
  } catch {
    await noteTimeout(page, what);
    return false;
  }
}

/**
 * **Search** (`searchFor`): an attempt that may legitimately miss, such as a
 * click between books. A miss is an answer, so the deadline stays short and a
 * timeout prints nothing.
 */
async function searchFor(page: Page, condition: string, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(condition, { timeout, polling: 50 });
    return true;
  } catch {
    return false;
  }
}

/** Frames the settle waits on, and how often the node side reads them. */
const SETTLE_POLL_MS = 50;

const SETTLERS = new WeakMap<Page, () => Promise<boolean>>();

/**
 * The settle helper: "the shelf has finished loading" is no image request in
 * flight and the renderer's texture and program counts held still for
 * `SETTLE_FRAMES` frames (`lib/settle.ts`). Returns the function the caller
 * awaits after `ready`.
 *
 * ⚠️ **Call it before `goto`.** The request listeners count from then; a
 * listener attached after would count zero and settle before the covers land.
 * Asked again for a page it already watches, it hands back the same settler.
 * A request that fails counts as finished.
 *
 * The settler resolves `false` at the 30 s floor, after printing the requests
 * still in flight and the last readings; what a `false` does is the caller's.
 */
function watchSettle(page: Page): () => Promise<boolean> {
  const known = SETTLERS.get(page);
  if (known !== undefined) return known;
  const inFlight = new Set<HTTPRequest>();
  page.on('request', (request) => {
    if (request.resourceType() === 'image') inFlight.add(request);
  });
  const done = (request: HTTPRequest): void => {
    inFlight.delete(request);
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);

  const settle = async (): Promise<boolean> => {
    await page.evaluate(RECORD_SETTLE_READINGS);
    const deadline = performance.now() + STATE_WAIT_FLOOR_MS;
    let readings: string[] = [];
    while (performance.now() < deadline) {
      readings = (await page.evaluate('window.__settleReadings ?? []')) as string[];
      // A reading that is not two numbers means the recorder reads nothing (a renamed
      // `stats()` field, say): ten frames of "undefined|undefined" are still, and
      // settling on them would leave only the image counter to wait on.
      if (inFlight.size === 0 && hasSettled(readings) && readings.every(isCountReading)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
    }
    console.error(
      `waited ${String(STATE_WAIT_FLOOR_MS)}ms for the shelf to settle; ` +
        `${String(inFlight.size)} image request(s) in flight` +
        `${[...inFlight].map((request) => `\n    ${request.url()}`).join('')}\n` +
        `  textures|programs per frame: ${readings.join(' ')}`,
    );
    return false;
  };
  SETTLERS.set(page, settle);
  return settle;
}

const isCountReading = (reading: string): boolean => /^\d+\|\d+$/.test(reading);

function failBoot(what: string, errors: readonly string[]): never {
  console.error(`${what}. Page errors:`);
  for (const message of errors.length > 0 ? errors : ['(none captured)']) {
    console.error(`  ${message}`);
  }
  process.exit(1);
}

/**
 * Clicks book after book by its projected point until `picked` holds.
 *
 * A point the held book's page covers is skipped: the click would land on the
 * page, not the shelf, and report a missing pickup as a failure of the pickup.
 *
 * The wait after a click is a **search** (K8): a click between books legitimately
 * picks nothing up, and 30 s per miss would cost minutes. It polls the pickup's
 * state machine, which holds once the click handler has started the pickup and
 * not at the end of its lift. And the walk gives up after `MAX_MISSES` clicks in
 * a row that picked nothing up, so a broken pickup costs 10 misses and not 60.
 */
const MAX_MISSES = 10;

async function clickToPickUp(
  page: Page,
  picked: string,
  skip?: number,
): Promise<number | undefined> {
  let misses = 0;
  for (let index = 0; index < 60 && misses < MAX_MISSES; index += 1) {
    if (index === skip) continue;
    const point = (await page.evaluate(`window.__shelf.projectBook(${String(index)})`)) as
      { x: number; y: number } | undefined;
    if (point === undefined) continue;
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const open = await page.evaluate(
      `document.elementFromPoint(${String(x)}, ${String(y)}) === document.getElementById('shelf-canvas')`,
    );
    if (open !== true) continue;
    await page.mouse.click(x, y);
    if (await searchFor(page, picked, 4000)) return index;
    misses += 1;
  }
  return undefined;
}

/**
 * Watches every held page from the moment it is added: each must arrive hidden
 * by `visibility`, and no page may ever be visible while its opacity is still 0,
 * which is what text showing through the closing cover looks like in the DOM.
 * Watched rather than sampled once after the click, because on a slow runner the
 * one sample could land after the fade and prove nothing.
 */
const WATCH_PAGES = `(() => {
  const seen = [];
  window.__pageVisibility = seen;
  const record = (page, event) => seen.push({ event, visibility: page.style.visibility, opacity: page.style.opacity });
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement && node.classList.contains('held-page')) record(node, 'added');
      }
      const target = mutation.target;
      if (mutation.type === 'attributes' && target instanceof HTMLElement && target.classList.contains('held-page')) record(target, 'style');
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
})()`;

const PAGES_HIDDEN = `(() => {
  const seen = window.__pageVisibility ?? [];
  const added = seen.filter((entry) => entry.event === 'added');
  return added.length >= 2 &&
    added.every((entry) => entry.visibility === 'hidden') &&
    !seen.some((entry) => entry.visibility === 'visible' && Number(entry.opacity) === 0);
})()`;
const READ_PAGE = `(() => {
  const right = document.querySelector('.held-page-right');
  const left = document.querySelector('.held-page-left');
  const pages = [...document.querySelectorAll('.held-page')];
  const links = right ? [...right.querySelectorAll('.card-links a')] : [];
  const putBack = right?.querySelector('.held-put-back');
  return {
    held: window.__shelf.held()?.title ?? '',
    pageTitle: left?.querySelector('.held-title')?.textContent ?? '',
    reading: right?.querySelector('.reading')?.textContent ?? '',
    hasObjectLine: Boolean(right?.querySelector('.object')),
    linkCount: links.length,
    links: links.map((a) => [a.target, a.rel, a.title || a.textContent || ''].join('|')),
    markCount: links.filter((a) => a.querySelector('svg path')).length,
    announced: document.getElementById('pickup-status')?.textContent ?? '',
    putBack: putBack ? { tag: putBack.tagName, name: (putBack.getAttribute('aria-label') || putBack.textContent || '').trim() } : undefined,
    visibleAtRest: pages.length === 2 && pages.every((page) => page.style.visibility === 'visible'),
    historyHeld: Boolean(history.state && history.state.pickup),
    pagesInView: pages.length === 2 && pages.every((page) => {
      const box = page.getBoundingClientRect();
      return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
    }),
  };
})()`;

async function checkPickup(page: Page): Promise<PickupRead | undefined> {
  const href = (await page.evaluate('location.href')) as string;
  const sameHref = async (): Promise<boolean> => (await page.evaluate('location.href')) === href;

  await page.evaluate(WATCH_PAGES);
  const first = await clickToPickUp(page, 'window.__shelf.held() !== undefined');
  if (first === undefined) return undefined;
  if (!(await until(page, HELD, 'the clicked book to come to rest held'))) return undefined;
  const hiddenBeforeFade = (await page.evaluate(PAGES_HIDDEN)) === true;
  // The Thoughts fetch lands after the click, but only for a book that has some:
  // `library.json` says which, by the held book's title when no other book shares
  // it. Any other book fetches nothing, so there is nothing to wait for.
  const heldTitle = (await page.evaluate('window.__shelf.held()?.title')) as string | undefined;
  const flagged = (await page.evaluate(
    `fetch('/library.json').then((response) => response.json())`,
  )) as { books: LibraryBook[] };
  const sameTitle = flagged.books.filter((book) => book.title === heldTitle);
  if (sameTitle.length === 1 && sameTitle[0]?.thoughts === true) {
    await until(page, 'window.__shelf.held()?.thoughts === true', "the held book's Thoughts");
  }
  const read = (await page.evaluate(READ_PAGE)) as Omit<
    PickupRead,
    | 'hiddenBeforeFade'
    | 'hrefUnchanged'
    | 'focusUnmoved'
    | 'focusCaught'
    | 'thoughtsShown'
    | 'second'
    | 'afterPutBack'
    | 'afterEscape'
    | 'afterBack'
  >;
  const hrefUnchanged = await sameHref();

  // The second book by the shelf's hook rather than by aiming: with a book held,
  // the open spread covers most books' aim points, and a click on the held book
  // is rightly no pickup. The click path is the first pickup's, above.
  await page.evaluate(`window.__shelf.pickUp(${String(first === 0 ? 1 : 0)})`);
  // The first title goes in as an argument, never spliced into the page's source.
  await page
    .waitForFunction(
      (firstTitle: string) => {
        const shelf = (
          window as unknown as {
            __shelf: { held(): { phase: string; title: string } | undefined };
          }
        ).__shelf;
        const held = shelf.held();
        return held?.phase === 'held' && held.title !== firstTitle;
      },
      { timeout: STATE_WAIT_FLOOR_MS, polling: 50 },
      read.held,
    )
    .catch(() => noteTimeout(page, 'the second book to come to rest held'));
  const second = (await page.evaluate(`(() => ({
    held: window.__shelf.held()?.title ?? '',
    announced: document.getElementById('pickup-status')?.textContent ?? '',
    putBack: Boolean(document.querySelector('.held-page-right .held-put-back')),
    pages: document.querySelectorAll('.held-page').length,
  }))()`)) as PickupRead['second'];

  await page.click('.held-page-right .held-put-back');
  const afterPutBack = await putDown(page, sameHref);

  // The other two ways down, each on a fresh pickup through the shelf's hook.
  // The hook, not a click, so focus is read across the pickup alone: a click on
  // the canvas moves focus by the browser's own rule, and that is not the
  // pickup's doing (spec §3.4).
  await page.evaluate('window.__focusBefore = document.activeElement');
  await page.evaluate(`window.__shelf.pickUp(${String(first)})`);
  // A timeout ends the check: the steps below press Escape and the back button,
  // and the back button with nothing held would leave the page itself.
  if (!(await until(page, HELD, 'the book to come to rest held, for the focus read'))) {
    return undefined;
  }
  const focusUnmoved = (await page.evaluate(
    'document.activeElement === window.__focusBefore',
  )) as boolean;
  // Then focus a link on the page, as a keyboard reader would, and leave by
  // Escape: the page hides under it, so focus must be caught on the canvas.
  await page.evaluate(`document.querySelector('.held-page-right .card-links a')?.focus()`);
  await page.keyboard.press('Escape');
  const afterEscape = await putDown(page, sameHref);
  const focusCaught = (await page.evaluate(
    `document.activeElement === document.getElementById('shelf-canvas')`,
  )) as boolean;

  await page.evaluate(`window.__shelf.pickUp(${String(first)})`);
  if (!(await until(page, HELD, 'the book to come to rest held, before the back button'))) {
    return undefined;
  }
  await page.evaluate('history.back()');
  const afterBack = await putDown(page, sameHref);

  const thoughtsShown = await checkThoughtsShown(page);

  return {
    ...read,
    hiddenBeforeFade,
    hrefUnchanged,
    focusUnmoved,
    focusCaught,
    thoughtsShown,
    second,
    afterPutBack,
    afterEscape,
    afterBack,
  };
}

/**
 * Picks up a book `library.json` flags with Thoughts and reads whether its page
 * showed them: the slot unhidden, holding at least one paragraph after its
 * label. Picks the first flagged book in shelf order directly, by its index.
 * `undefined` when `library.json` flags no uniquely titled book, or when the pick
 * held a different book than the one its index was computed for. Matched by
 * title, and a title two books share is skipped rather than guessed at.
 */
async function checkThoughtsShown(page: Page): Promise<boolean | undefined> {
  const library = (await page.evaluate(
    `fetch('/library.json').then((response) => response.json())`,
  )) as { books: LibraryBook[] };
  const count = new Map<string, number>();
  for (const book of library.books) count.set(book.title, (count.get(book.title) ?? 0) + 1);

  // The first flagged book in shelf order, picked up by its index: no walk, one
  // pickup. Real motion on purpose — the slot is shown by the animated path a
  // reader sees, and reduced motion takes a different one.
  const ordered = shelfOrder(library.books);
  const index = ordered.findIndex((b) => b.thoughts === true && count.get(b.title) === 1);
  if (index === -1) return undefined;

  await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
  if (!(await until(page, HELD, 'the Thoughts book to come to rest held'))) return undefined;
  const title = (await page.evaluate('window.__shelf.held()?.title')) as string | undefined;
  // Fails closed when the index did not name the book it was computed for.
  if (title !== ordered[index]?.title) {
    await putBackAndSettle(page);
    return undefined;
  }
  const shown = await until(
    page,
    `(() => { const slot = document.querySelector('.held-page-right .held-thoughts'); return Boolean(slot) && !slot.hidden && slot.querySelectorAll('p').length >= 2; })()`,
    "the held page's Thoughts to show",
  );
  await putBackAndSettle(page);
  return shown;
}

/**
 * The library's books in the order the shelf lays them out, so a book's position
 * here is the index `window.__shelf.pickUp` takes. The same `toRows` the page
 * runs, over the same `library.json` and the default settings; a caller confirms
 * the held title matches rather than trusting the arithmetic.
 */
function shelfOrder(books: readonly LibraryBook[]): LibraryBook[] {
  return toRows(books, DEFAULT_SETTINGS.books).flatMap((row) => row.books.map((b) => b.book));
}

/** Waits for the book to be back in its slot, then reads what the page says. */
async function putDown(page: Page, sameHref: () => Promise<boolean>): Promise<PutDown> {
  await until(page, NOTHING_HELD, 'the book to be back in its slot');
  const read = (await page.evaluate(`(() => ({
    held: window.__shelf.held() !== undefined,
    announced: document.getElementById('pickup-status')?.textContent ?? '',
    historyHeld: Boolean(history.state && history.state.pickup),
    pages: document.querySelectorAll('.held-page').length,
  }))()`)) as Omit<PutDown, 'hrefUnchanged'>;
  return { ...read, hrefUnchanged: await sameHref() };
}
/**
 * Examining the held book, opened from the held page — that it opens named for
 * the book, that the book closes, that it turns, that it wears the held copy,
 * and that leaving it leaves *only* it: one Escape leaves the view and the book
 * stays in hand (§3.5, check 9; #418). Books are picked up through the shelf's
 * hook here; the click path is `checkPickup`'s.
 */
async function checkViewer(page: Page): Promise<ViewerRead | undefined> {
  // It wants two books: one whose cover has a held copy, which only covers over
  // 512px get, and one whose cover has none, so both of the cover's paths are
  // seen. What each should wear is read from `library.json` by the held book's
  // title, never from the page; a title two books share is skipped rather than
  // guessed at.
  const library = (await page.evaluate(
    `fetch('/library.json').then((response) => response.json())`,
  )) as { books: { title: string; cover?: string; heldCover?: string }[] };
  const titles = new Map<string, number>();
  for (const book of library.books) titles.set(book.title, (titles.get(book.title) ?? 0) + 1);
  const unique = library.books.filter((book) => titles.get(book.title) === 1);
  const coverFor = new Map(
    unique.flatMap((book) =>
      book.cover === undefined
        ? []
        : [[book.title, { held: book.heldCover === undefined ? undefined : `/${book.heldCover}` }]],
    ),
  );
  const coverless = new Set(unique.filter((book) => book.cover === undefined).map((b) => b.title));

  let withHeld: Examined | undefined;
  let withoutHeld: Examined | undefined;
  /**
   * The one examination that also turned the book, left it by every way out and
   * emptied the hand. The book picked for it is whichever came first, so its
   * reading is carried through rather than taken from whichever book is
   * reported as primary.
   */
  let fullReading: Examined | undefined;
  let fellBack = false;
  let pathInPage = false;
  let coverlessOpens: boolean | undefined;
  const books = Number(await page.evaluate('window.__shelf.bookCount'));
  // A presence timeout ends the loop: another 41 books at 30 s each would run the
  // job out of its time before the report prints. What it gathered is judged as
  // it stands, and anything it did not reach fails as not found.
  const timeoutsBefore = presenceTimeouts;
  for (let index = 0; index < books && presenceTimeouts === timeoutsBefore; index += 1) {
    const covered = withHeld !== undefined && withoutHeld !== undefined;
    if (covered && coverlessOpens !== undefined) break;
    await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
    if (!(await until(page, HELD, `book ${String(index)} to come to rest held`))) break;
    const title = (await page.evaluate('window.__shelf.held()?.title')) as string | undefined;
    const expected = title === undefined ? undefined : coverFor.get(title);
    const hasControl = (await page.evaluate(
      `document.querySelector('.held-page-right .held-examine') !== null`,
    )) as boolean;
    const wanted =
      title !== undefined &&
      expected !== undefined &&
      (expected.held === undefined ? withoutHeld === undefined : withHeld === undefined);
    if (hasControl && title !== undefined && coverless.has(title) && coverlessOpens === undefined) {
      coverlessOpens = await examinesCoverless(page);
    } else if (hasControl && wanted) {
      // No attribute anywhere on the pages may carry a cover path (#416).
      pathInPage ||=
        (await page.evaluate(`[...document.querySelectorAll('.held-page, .held-page *')]
        .some((node) => [...node.attributes].some((attribute) => /covers\\//.test(attribute.value)))`)) as boolean;
      if (expected.held !== undefined) {
        await putBackAndSettle(page);
        fellBack = await examinesWithoutHeldCopy(page, index, title);
        await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
        await until(page, HELD, `book ${String(index)} to come to rest held, to be examined`);
      }
      const checked = await examineOne(page, title, expected.held, fullReading === undefined);
      fullReading ??= checked;
      if (expected.held === undefined) withoutHeld = checked;
      else withHeld = checked;
    }
    await putBackAndSettle(page);
  }
  const primary = withHeld ?? withoutHeld;
  return primary === undefined
    ? undefined
    : {
        ...primary,
        turned: fullReading?.turned ?? false,
        keyTurned: fullReading?.keyTurned ?? false,
        leftByTap: fullReading?.leftByTap ?? false,
        leftByButton: fullReading?.leftByButton ?? false,
        reducedCuts: fullReading?.reducedCuts ?? false,
        emptiedCloses: fullReading?.emptiedCloses ?? false,
        withoutHeld: withoutHeld === undefined ? undefined : { showedOwn: withoutHeld.showedOwn },
        coverlessOpens,
        fellBack,
        pathInPage,
      };
}

/** One book's examination: the view's reading, and whether it wore its own cover. */
type Examined = Omit<ViewerRead, 'fellBack' | 'pathInPage' | 'withoutHeld' | 'coverlessOpens'> & {
  readonly showedOwn: boolean;
};

const DIALOG = `document.getElementById('book-viewer')`;
const EXAMINE_CONTROL = '.held-page-right .held-examine';
const PAGE_SHOWN = `document.querySelector('.held-page-right')?.style.visibility === 'visible'`;

/** Opens the view from the page's control. */
async function opensView(page: Page): Promise<boolean> {
  await page.click(EXAMINE_CONTROL);
  return until(page, `${DIALOG}?.open === true`, 'the view to open');
}

/**
 * Time for a wrong put-back to have registered, so that the book still being held
 * means something. An **absence** wait (K1, K2), fixed on purpose: a put-back
 * started by an exit goes through the history, a moment later, and a poll for
 * the view closing returns before that and would let the defect through.
 * ⚠️ A slower runner can only make this weaker, never flaky: a put-back that
 * arrives after the wait is missed and the check passes. That residual is
 * accepted.
 */
const PUT_BACK_CHANCE_MS = 200;

/**
 * Leaves the open view by `how` and reads that it closed, that the book is
 * still held and that the page showed again. The view closing is a presence,
 * polled; the book *still* held is an absence, read after the fixed wait above.
 */
async function leavesBy(page: Page, how: () => Promise<void>): Promise<boolean> {
  await how();
  await until(page, `!${DIALOG}?.open`, 'the view to close');
  await new Promise((resolve) => setTimeout(resolve, PUT_BACK_CHANCE_MS));
  const read = (await page.evaluate(`({
    open: Boolean(${DIALOG}?.open),
    held: window.__shelf.held() !== undefined,
  })`)) as { open: boolean; held: boolean };
  return !read.open && read.held && (await until(page, PAGE_SHOWN, 'the held page to show again'));
}

/**
 * Examines the held book once and reads everything the view must do. `full`
 * adds the checks that are about the view and not about the cover — turning,
 * every way out, reduced motion, and what emptying the hand does — which one
 * book is enough to show.
 */
async function examineOne(
  page: Page,
  title: string,
  held: string | undefined,
  full: boolean,
): Promise<Examined> {
  // Examining fetches nothing new: the covers are on the book already. Counted
  // from the click, once the held copy has landed, to the first exit.
  if (held !== undefined) {
    await until(page, 'window.__shelf.held()?.cover === "held"', 'the held copy to land');
  }
  const fetched: string[] = [];
  const onRequest = (request: HTTPRequest): void => {
    const path = new URL(request.url()).pathname;
    if (/^\/(held-)?covers\//.test(path)) fetched.push(path);
  };
  page.on('request', onRequest);
  const opened = await opensView(page);
  if (!opened) {
    // The view never opened, so every wait below would run out its own floor: about
    // a dozen of them in a row, which a red run cannot afford. Everything not read
    // is reported as it failed, and the printed timeout names the cause.
    page.off('request', onRequest);
    return {
      opened,
      namedForBook: false,
      closedAngle: undefined,
      escapeClosedViewer: false,
      heldAfterEscape: false,
      pageVisibleAfterEscape: false,
      held,
      showedHeld: false,
      showedOwn: false,
      fetchedNothing: fetched.length === 0,
      turned: false,
      keyTurned: false,
      focusInside: false,
      focusReturned: false,
      leftByTap: false,
      leftByButton: false,
      reducedCuts: false,
      emptiedCloses: false,
    };
  }
  const named = (await page.evaluate(
    `(${DIALOG}?.getAttribute('aria-label') ?? '').includes(${JSON.stringify(title)})`,
  )) as boolean;
  const focusInside = (await page.evaluate(
    `${DIALOG}?.contains(document.activeElement) === true`,
  )) as boolean;
  // At rest: the book has finished closing. Polled, not slept on.
  await until(
    page,
    `Math.abs(window.__shelf.held()?.boardAngle ?? 90) <= ${String(CLOSED_TOLERANCE_DEG)}`,
    'the book to finish closing',
  );
  const closedAngle = (await page.evaluate('window.__shelf.held()?.boardAngle')) as
    number | undefined;
  // The cover it wears: the held copy once the swap lands, which is
  // asynchronous, else the shelf copy — read off the material's texture, so a
  // book with no texture at all is not the shelf copy.
  const wears = held === undefined ? 'shelf' : 'held';
  const worn = await until(
    page,
    `window.__shelf.held()?.cover === ${JSON.stringify(wears)}`,
    `the ${wears} cover to be worn`,
  );

  let turned = true;
  let keyTurned = true;
  if (full) {
    const box = (await page.evaluate(`({ w: window.innerWidth, h: window.innerHeight })`)) as {
      w: number;
      h: number;
    };
    const turn = async (): Promise<{ yaw: number; pitch: number }> =>
      (await page.evaluate('window.__shelf.held()?.turn')) as { yaw: number; pitch: number };
    const before = await turn();
    await page.mouse.move(box.w / 2, box.h / 2);
    await page.mouse.down();
    await page.mouse.move(box.w / 2 + 200, box.h / 2, { steps: 8 });
    await page.mouse.move(box.w / 2 + 200, box.h / 2 + 120, { steps: 8 });
    await page.mouse.up();
    const dragged = await turn();
    // Across and down: yaw and pitch both move, and pitch stays within ±75°.
    turned =
      Math.abs(dragged.yaw - before.yaw) > 1 &&
      Math.abs(dragged.pitch - before.pitch) > 1 &&
      Math.abs(dragged.pitch) <= 75;
    // The owner's look at a book mid-turn (spec S12); `artifacts/` is ignored.
    writeFileSync(join(ARTIFACTS, 'examining.png'), await page.screenshot({ type: 'png' }));
    // Home squares it; then one ArrowRight is 15° of yaw. Keys reach the dialog
    // from whatever inside it has focus.
    await page.keyboard.press('Home');
    const square = await turn();
    await page.keyboard.press('ArrowRight');
    const stepped = await turn();
    keyTurned =
      Math.abs(square.yaw) < 0.5 &&
      Math.abs(square.pitch) < 0.5 &&
      Math.abs(stepped.yaw - 15) < 0.5;
  }

  // Escape: the view leaves, and *only* the view.
  await page.keyboard.press('Escape');
  await until(page, `!${DIALOG}?.open`, 'the view to close on Escape');
  await new Promise((resolve) => setTimeout(resolve, PUT_BACK_CHANCE_MS));
  const after = (await page.evaluate(`(() => ({
    viewerOpen: Boolean(${DIALOG}?.open),
    held: window.__shelf.held() !== undefined,
  }))()`)) as { viewerOpen: boolean; held: boolean };
  page.off('request', onRequest);
  // The book opens again, and then the page shows and takes focus back.
  const pageVisible = await until(page, PAGE_SHOWN, 'the held page to show after Escape');
  const focusReturned = await until(
    page,
    `document.activeElement === document.querySelector(${JSON.stringify(EXAMINE_CONTROL)})`,
    'focus to return to the examine control',
  );

  let leftByTap = true;
  let leftByButton = true;
  let reducedCuts = true;
  let emptiedCloses = true;
  if (full && after.held) {
    // Every other way out: a tap anywhere on the view, and "Back to the page" by
    // the keyboard (a press on it lands through the tap path, pointer captured).
    await opensView(page);
    const box = (await page.evaluate(`({ w: window.innerWidth, h: window.innerHeight })`)) as {
      w: number;
      h: number;
    };
    leftByTap = await leavesBy(page, () => page.mouse.click(box.w / 2, box.h / 2));
    await opensView(page);
    leftByButton = await leavesBy(page, () => page.keyboard.press('Enter'));

    // Reduced motion cuts: no tween is in flight at the moment the view's state
    // changes, where a tween would run for over half a second. Read as state at
    // that moment, not as a frame count or a wait, so a slow runner cannot tell
    // the two apart.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.click(EXAMINE_CONTROL);
    const closedAtOnce = await noTweenWhenExamining(page, true);
    await page.keyboard.press('Escape');
    const openedAtOnce = await noTweenWhenExamining(page, false);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    reducedCuts = closedAtOnce && openedAtOnce;

    // The hand empties while examining, by the back button: the view goes with it.
    await until(page, PAGE_SHOWN, 'the held page to show, before the back button');
    await opensView(page);
    await page.evaluate('history.back()');
    const emptied = await until(page, NOTHING_HELD, 'the hand to empty on the back button');
    emptiedCloses = emptied && !((await page.evaluate(`Boolean(${DIALOG}?.open)`)) as boolean);
  }

  return {
    opened,
    namedForBook: named,
    closedAngle,
    escapeClosedViewer: !after.viewerOpen,
    heldAfterEscape: after.held,
    pageVisibleAfterEscape: pageVisible,
    held,
    showedHeld: held !== undefined && worn,
    showedOwn: held === undefined && worn,
    fetchedNothing: fetched.length === 0,
    turned,
    keyTurned,
    focusInside,
    focusReturned,
    leftByTap,
    leftByButton,
    reducedCuts,
    emptiedCloses,
  };
}

/**
 * Waits, inside the page, for the view's state to become `examining`, then
 * reports whether no tween was in flight at that moment. The pickup sets its
 * tween flag in the same call as the state, so under reduced motion the two
 * agree at once, and with a tween the flag stays up for its 0.6 s.
 */
async function noTweenWhenExamining(page: Page, examining: boolean): Promise<boolean> {
  // A presence poll with the floor as its deadline; `'timeout'` is told apart from
  // a tween in flight so the timeout can be counted and named.
  const read = (await page.evaluate(`new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      const h = window.__shelf.held();
      if (h && h.examining === ${String(examining)}) resolve(h.easing === false);
      else if (performance.now() - started > ${String(STATE_WAIT_FLOOR_MS)}) resolve('timeout');
      else setTimeout(tick, 0);
    };
    tick();
  })`)) as boolean | 'timeout';
  if (read === 'timeout') {
    await noteTimeout(
      page,
      `the view to be ${examining ? 'examining' : 'left'} under reduced motion`,
    );
    return false;
  }
  return read;
}

/**
 * A book with no cover, examined: the control is on its page, the book closes
 * and the view leaves. What is examined is the book, and a coverless one still
 * has a binding and a spine colour (S7).
 */
async function examinesCoverless(page: Page): Promise<boolean> {
  const opened = await opensView(page);
  const closed = await until(
    page,
    `Math.abs(window.__shelf.held()?.boardAngle ?? 90) <= ${String(CLOSED_TOLERANCE_DEG)}`,
    'the coverless book to finish closing',
  );
  const left = await leavesBy(page, () => page.keyboard.press('Escape'));
  return opened && closed && left;
}

/** Held-copy URLs the fallback probe refused on purpose, kept out of the page errors. */
const REFUSED = new Set<string>();

/**
 * Picks the book up with every request for a held copy refused, and reads
 * whether examining still opens and the book wears the shelf copy. The copy is
 * fetched at pickup now, so the refusal is in place *before* the pickup; request
 * interception turns the page's cache off, so a copy an earlier pickup already
 * loaded cannot answer in its place. It is switched back off before the
 * ordinary examination that follows.
 */
async function examinesWithoutHeldCopy(page: Page, index: number, title: string): Promise<boolean> {
  const refuse = (request: HTTPRequest): void => {
    if (new URL(request.url()).pathname.startsWith('/held-covers/')) {
      REFUSED.add(request.url());
      void request.abort();
    } else {
      void request.continue();
    }
  };
  await page.setRequestInterception(true);
  page.on('request', refuse);
  // Armed before the pickup, because the refusal happens inside it. The caller
  // only reaches this for a book `library.json` gives a held copy, so the request
  // always comes.
  let refusalFailed: () => void = () => undefined;
  const failedRefusal = new Promise<void>((resolve) => {
    refusalFailed = resolve;
  });
  const onFailed = (request: HTTPRequest): void => {
    if (new URL(request.url()).pathname.startsWith('/held-covers/')) refusalFailed();
  };
  page.on('requestfailed', onFailed);
  try {
    await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
    if (!(await until(page, HELD, `book ${String(index)} to come to rest held, copy refused`))) {
      return false;
    }
    // The refused fetch fails asynchronously: wait for it to have failed (a
    // presence), not for a time.
    let timer: NodeJS.Timeout | undefined;
    const arrived = await Promise.race([
      failedRefusal.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), STATE_WAIT_FLOOR_MS);
      }),
    ]);
    clearTimeout(timer);
    if (!arrived) {
      await noteTimeout(page, 'the refused held-copy request to fail');
      return false;
    }
    // K11, an absence: the swap, were it going to happen, runs in the loader's
    // error callback, which the page has run by the next frame, so two frames let
    // a wrong swap reach the material before it is read. ⚠️ If that swap is ever
    // deferred further this can miss it: weaker, never flaky.
    await page.evaluate(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    const opened = await opensView(page);
    // `shelf` is the material still carrying the shelf texture; a fallback that
    // blanked the cover reads `none`.
    const shelfCopy = (await page.evaluate(
      `window.__shelf.held()?.title === ${JSON.stringify(title)} && window.__shelf.held()?.cover === 'shelf'`,
    )) as boolean;
    await page.keyboard.press('Escape');
    // Search, used as cleanup (K9): its answer is ignored; it only lets the view
    // close before the put-back that follows.
    await searchFor(page, `!${DIALOG}?.open`, 1000);
    return opened && shelfCopy;
  } finally {
    page.off('request', refuse);
    page.off('requestfailed', onFailed);
    await page.setRequestInterception(false);
    await putBackAndSettle(page);
  }
}

async function putBackAndSettle(page: Page): Promise<void> {
  await page.evaluate('window.__shelf.putBack()');
  await until(page, NOTHING_HELD, 'the book to be put back');
}

/**
 * The held page at 375×812, the presentation a phone sees: the right-hand page
 * alone, with the title leading it and the put-back control on screen, since
 * the page fills the screen and leaves no empty space to tap.
 */
async function checkPhone(page: Page): Promise<PhoneRead | undefined> {
  await page.setViewport({ width: 375, height: 812 });
  // The pickup frames for the camera it finds, so wait until the shelf has
  // resized to the upright viewport: a slow runner had not after a fixed 400 ms.
  await until(
    page,
    '(() => { const s = window.__shelf.stats(); return s.bufferWidth < s.bufferHeight * 0.9; })()',
    'the shelf to resize to the upright viewport',
  );
  await page.evaluate('window.__shelf.pickUp(0)');
  if (!(await until(page, HELD, 'book 0 to come to rest held at phone size'))) return undefined;
  const read = (await page.evaluate(`(() => {
    const right = document.querySelector('.held-page-right');
    const control = right?.querySelector('.held-put-back');
    const inView = (box) => box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
    return {
      pageInView: right ? inView(right.getBoundingClientRect()) : false,
      titleLeads: right?.firstElementChild?.classList.contains('held-title') ?? false,
      putBackInView: control ? inView(control.getBoundingClientRect()) : false,
    };
  })()`)) as PhoneRead;
  await putBackAndSettle(page);
  return read;
}

/**
 * §3.6, the open spread at rest — computed from the scene through
 * `window.__shelf.spread()`, never from pixels, at the 1280×800 desktop
 * viewport (owner decision, from chat, 2026-10-09). Several books, so a
 * hardback's case and a paperback's card are both measured.
 */
const SPREAD_VIEWPORT = { width: 1280, height: 800 };
const SPREAD_BOOKS = [0, 6, 12, 18, 24, 30];

interface SpreadChecked {
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

async function checkSpread(browser: Browser, origin: string): Promise<SpreadChecked> {
  const context = await browser.createBrowserContext();
  const lines: string[] = [];
  const failures: string[] = [];
  try {
    const page = await context.newPage();
    await page.setViewport(SPREAD_VIEWPORT);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    for (const index of SPREAD_BOOKS) {
      await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
      if (!(await until(page, HELD, `book ${String(index)} to come to rest held, open spread`))) {
        // A timeout ends the loop: the rest would each wait out the floor too.
        failures.push(`open spread: book ${String(index)} never came to rest`);
        break;
      }
      const title = (await page.evaluate('window.__shelf.held().title')) as string;
      const read = (await page.evaluate('window.__shelf.spread() ?? null')) as SpreadRead | null;
      const found = spreadFailures(read ?? undefined, title);
      failures.push(...found.map((failure) => `open spread: ${failure}`));
      lines.push(
        read === null
          ? `${title.padEnd(34)} NOT MEASURED`
          : `${title.slice(0, 33).padEnd(34)} board ${read.boardAngle.toFixed(2)}°  left ` +
              `${read.left.width.toFixed(1)}×${read.left.height.toFixed(1)} against ` +
              `${read.block.width.toFixed(1)}×${read.block.height.toFixed(1)}  gutter ` +
              `${read.gutterGap.toFixed(2)}px  ${found.length === 0 ? 'ok' : 'FAILED'}`,
      );
      await putBackAndSettle(page);
    }
  } finally {
    await context.close();
  }
  return { lines, failures };
}

/**
 * G35, the held page at rest (#426): long Thoughts scroll once the book has
 * landed and the links row comes into reach, and GSAP's own ticker stays asleep
 * through the pickup (ADR-0103, commit `019add5`).
 *
 * The Thoughts are planted by request interception rather than a fixture, so
 * no vault carries them: every `notes/<id>.json` the page asks for answers with
 * `LONG_THOUGHTS`, invented prose far taller than the page. The page fetches
 * exactly what it would have; only the answer differs.
 *
 * The ticker is read as `COUNT_FRAMES` reads G60's loops: GSAP's ticker is a
 * `requestAnimationFrame` loop of its own, so awake it shows as a second
 * callback in a frame the shelf draws. Sampled as a **window** from the moment
 * of the pickup, while the motion runs and before GSAP would auto-sleep, so a
 * slow runner only stretches the sample in time, never shortens it.
 */
const LONG_THOUGHTS = {
  paragraphs: Array.from(
    { length: 14 },
    (_, index) =>
      `Paragraph ${String(index + 1)} of a note planted by the gate. The lamp was low and the ` +
      'margins filled with small arrows pointing nowhere in particular, which is how a reader ' +
      'marks a page they mean to come back to and never does. Nothing here is quoted; the gate ' +
      'wrote every word so the page has something tall enough to scroll.',
  ),
};

interface AtRestChecked {
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

async function checkHeldAtRest(browser: Browser, origin: string): Promise<AtRestChecked> {
  const context = await browser.createBrowserContext();
  const lines: string[] = [];
  const failures: string[] = [];
  try {
    const page = await context.newPage();
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument(COUNT_FRAMES);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/notes/')) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(LONG_THOUGHTS),
        });
      } else {
        void request.continue();
      }
    });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });

    const library = (await page.evaluate(
      `fetch('/library.json').then((response) => response.json())`,
    )) as { books: LibraryBook[] };
    const count = new Map<string, number>();
    for (const book of library.books) count.set(book.title, (count.get(book.title) ?? 0) + 1);
    const ordered = shelfOrder(library.books);
    const index = ordered.findIndex((b) => b.thoughts === true && count.get(b.title) === 1);
    // An early stop says why under the check's own heading, not only in the closing list.
    const stop = (why: string): AtRestChecked => {
      lines.push(`STOPPED          ${why}`);
      failures.push(`held at rest: ${why}`);
      return { lines, failures };
    };
    if (index === -1) {
      return stop('library.json flags no uniquely titled book with Thoughts');
    }

    await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
    const loops = (await page.evaluate(LOOPS_PER_FRAME)) as { frames: number; most: number };
    const asleep = loops.frames >= AT_REST_FRAMES && loops.most === 1;
    lines.push(
      `GSAP ticker      ${asleep ? 'asleep' : 'AWAKE'} (most ${String(loops.most)} loops a frame ` +
        `over ${String(loops.frames)} frames of the pickup)`,
    );

    if (!(await until(page, HELD, 'the long-Thoughts book to come to rest held'))) {
      return stop('the book never came to rest held');
    }
    const planted = LONG_THOUGHTS.paragraphs.length;
    if (
      !(await until(
        page,
        `document.querySelectorAll('.held-page-right .held-thoughts p').length >= ${String(planted)}`,
        'the planted Thoughts to show',
      ))
    ) {
      return stop('the planted Thoughts never showed');
    }

    const READ_REACH = `(() => {
      const right = document.querySelector('.held-page-right');
      const links = right?.querySelector('.card-links');
      if (!right || !links) return null;
      const page = right.getBoundingClientRect(), row = links.getBoundingClientRect();
      return {
        overflow: getComputedStyle(right).overflowY,
        tall: right.scrollHeight > right.clientHeight + 1,
        inReach: row.top >= page.top - 1 && row.bottom <= page.bottom + 1 &&
          row.top >= -1 && row.left >= -1 && row.right <= innerWidth + 1 && row.bottom <= innerHeight + 1,
        centre: { x: (page.left + page.right) / 2, y: (page.top + page.bottom) / 2 },
      };
    })()`;
    type Reach = {
      overflow: string;
      tall: boolean;
      inReach: boolean;
      centre: { x: number; y: number };
    } | null;
    const before = (await page.evaluate(READ_REACH)) as Reach;
    if (before === null) {
      return stop('the right-hand page or its links row is missing');
    }
    // Scrolled the way a reader does, by the wheel over the page. Each wheel is a
    // **search**, like `searchFor`'s other callers: a step that has not yet reached the row is an answer.
    let after: Reach = before;
    for (let step = 0; step < 20 && after !== null && !after.inReach; step += 1) {
      await page.mouse.move(before.centre.x, before.centre.y);
      await page.mouse.wheel({ deltaY: 400 });
      await searchFor(page, `${READ_REACH}?.inReach === true`, 500);
      after = (await page.evaluate(READ_REACH)) as Reach;
    }
    const scrolls = before.overflow === 'auto' && before.tall;
    const reached = !before.inReach && after?.inReach === true;
    lines.push(
      `long Thoughts     ${scrolls ? 'scroll at rest' : `DO NOT SCROLL (overflow ${before.overflow}, ${before.tall ? 'tall' : 'NOT TALL'})`}   ` +
        `links ${reached ? 'come into reach' : before.inReach ? 'IN REACH UNSCROLLED, the plant is too short' : 'OUT OF REACH'}`,
    );
    // Judged by `lib/pickup-gate.ts`, every clause planted red in its spec.
    const judged = atRestFailures({
      frames: loops.frames,
      mostLoops: loops.most,
      overflow: before.overflow,
      tall: before.tall,
      inReachUnscrolled: before.inReach,
      inReachScrolled: after?.inReach === true,
    });
    failures.push(...judged.map((failure) => `held at rest: ${failure}`));
    await putBackAndSettle(page);
  } finally {
    await context.close();
  }
  return { lines, failures };
}

/* -------------------------------------------------------------------------- */

/**
 * G60 — a lost context falls back to painted shadows, once, and remembers it.
 *
 * On the Pixel 10 Pro XL a context lost while the shelf samples the shadow map
 * came back after about 1.15 s and died again after the same count of sampling
 * draws, because the old restore path resumed the same programs. So a loss now
 * rebuilds the shelf painted — on the restored canvas, or on a new one when no
 * restore arrives — and writes a record the next load starts painted from.
 * Every one of those is a line whose removal still draws a shelf on a desktop,
 * which is why a browser has to drive them.
 *
 * ⚠️ **A synthetic loss is not the phone's loss.** `WEBGL_lose_context` never
 * restores on its own, never takes the GPU process down and never gets an
 * origin blocked, so this proves the page's side and nothing about what Chrome
 * does after a real driver loss. That half is the phone's, recorded in the log.
 *
 * The one part of it a page can be made to meet is the refusal: after every
 * real loss on the Pixel the new canvas was denied a context, and the page ended
 * on its failure sentence. The `refused` case stages that by making `getContext`
 * answer `null` for any canvas but the lost one, and holds the page to hiding
 * the dead canvas, which Chrome on the phone painted white over the whole page.
 * The white itself never appears here, because a staged loss is not blocked, so
 * the case reads whether the canvas is shown and not what colour it is.
 *
 * The `probe loss` case holds the one line that decides whether a loss is
 * written down at all: a page running `?receivers=all`, the reproduction that
 * dies on the Pixel where the shipped shelf survives, falls back the same way
 * and writes nothing, so that device's plain page stays real-time.
 *
 * The `redraw halts` case breaks every program the painted redraw compiles, by
 * appending a compile error to its source (`BREAK_PROGRAMS`), and holds the page
 * to keeping the shader's sentence up over a shelf that will never draw. The
 * `link failure` case breaks only the programs compiled with the shadow map on,
 * from the first frame, and holds the page to falling back painted and writing
 * the record — a link failure on the shipped shelf is taken as a loss is.
 *
 * Each case runs in a browser context of its own, so a record one writes
 * cannot leak into the next — or into the page every check above measured.
 */
interface FallbackChecked {
  /** One line per case, printed whether or not it passed. */
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

/**
 * A page that samples the shadow map: the plain page, since real-time shadows
 * are the default (ADR-0090), and `?shadows=1` were that ever reversed. Read
 * off the same constant the page reads, so a case cannot quietly go on testing
 * a painted page.
 */
const REAL_TIME_PATH = DEFAULT_SETTINGS.shadows.enabled ? '/' : '/?shadows=1';

/**
 * Counts `requestAnimationFrame` callbacks per frame, installed before any page
 * script runs. Callbacks that run in one frame share its timestamp, so a
 * disposed shelf's render loop still running beside the new one shows as 2.
 * The unwrapped function is kept for the gate's own settle recorder, which must
 * not read as a loop (`lib/settle.ts`).
 */
const COUNT_FRAMES = `(() => {
  const original = window.requestAnimationFrame.bind(window);
  window.__rawRaf = original;
  const perFrame = new Map();
  window.__callbacksPerFrame = perFrame;
  window.requestAnimationFrame = (callback) =>
    original((time) => {
      perFrame.set(time, (perFrame.get(time) ?? 0) + 1);
      callback(time);
    });
})()`;

/** Every `setItem` refuses, the way it does with site data blocked or the quota full. */
const REFUSE_STORAGE = `Storage.prototype.setItem = function () {
  throw new DOMException('refused by the gate', 'QuotaExceededError');
};`;

/** The console one-liner the inspectors doc gives, word for word. */
const LOSE = `(() => {
  const gl = document.getElementById('shelf-canvas').getContext('webgl2');
  window.__lc = gl.getExtension('WEBGL_lose_context');
  window.__lc.loseContext();
})()`;

const RESTORE = 'window.__lc.restoreContext()';

/**
 * Every canvas but the one on the page is refused a WebGL context — the page's
 * side of Chrome's `Web page caused context loss and was blocked`. Installed
 * after the shelf has its context, so the only canvas that meets it is the new
 * one the fallback asks for.
 */
const REFUSE_NEW_CONTEXTS = `(() => {
  const live = document.getElementById('shelf-canvas');
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (this !== live && String(type).startsWith('webgl')) return null;
    return getContext.call(this, type, ...rest);
  };
})()`;

/**
 * What three logs when it is refused a context, the one console error the
 * `refused` case causes on purpose. Consumed there and required there, so the
 * case cannot go green refused for some other reason.
 */
const REFUSED_BY_THREE = 'THREE.WebGLRenderer: THREE.WebGLRenderer: Error creating WebGL context.';

/**
 * Breaks programs the way a driver that will not link them does, installed
 * before any page script runs. `window.__breakPrograms` says which: `'shadow'`
 * breaks every program three compiles with the shadow map on — its prefix
 * carries `#define USE_SHADOWMAP` exactly then, and a painted page's never
 * does — and `'all'` breaks every one.
 *
 * A real compile error appended to the source rather than a faked
 * `LINK_STATUS`, so the driver refuses the program and three calls
 * `onShaderError` from the same place it does on the phone. What it does not
 * stage is the phone's cause, which is not known.
 */
const BREAK_PROGRAMS = `(() => {
  const shaderSource = WebGL2RenderingContext.prototype.shaderSource;
  WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
    const mode = window.__breakPrograms;
    const broken = mode === 'all' || (mode === 'shadow' && source.includes('#define USE_SHADOWMAP'));
    return shaderSource.call(this, shader, broken ? source + '\\n#error staged by G60\\n' : source);
  };
})()`;

/**
 * How `scene.ts` begins the console line for a program that would not link —
 * one line per program, and the rest of it names the material and the driver's
 * limits, so the cases that break programs on purpose match it as a prefix.
 */
const LINK_FAILED = 'THREE program would not link:';

/**
 * A **window**: the most render-loop callbacks any one frame ran, over the first
 * `LOOP_SAMPLE_FRAMES` frames after the record is cleared. A fixed number of
 * frames and never a fixed time, so the sample no longer shrinks on a slow
 * runner. Polling for them is a presence wait, with the floor as its deadline;
 * short of the count, `frames` says how many arrived.
 */
const LOOP_SAMPLE_FRAMES = 30;

const LOOPS_PER_FRAME = `(async () => {
  const perFrame = window.__callbacksPerFrame;
  perFrame.clear();
  const deadline = performance.now() + ${String(STATE_WAIT_FLOOR_MS)};
  while (perFrame.size < ${String(LOOP_SAMPLE_FRAMES)} && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const counts = [...perFrame.values()].slice(0, ${String(LOOP_SAMPLE_FRAMES)});
  return { frames: counts.length, most: counts.length === 0 ? 0 : Math.max(...counts) };
})()`;

interface PageState {
  readonly fallback: string | undefined;
  readonly profile: string;
  readonly canvases: number;
  readonly record: string | null;
  readonly notice: string;
  readonly visibility: string;
  /**
   * Whether the shelf's canvas is rendered at all: not `display: none`, not
   * `visibility: hidden`, not transparent, on it or on any ancestor. A lost
   * canvas must not be — Chrome paints one it will not restore white — and a
   * live one must be.
   */
  readonly canvasShown: boolean;
}

const READ_STATE = `(() => ({
  fallback: window.__shelf?.fallback(),
  profile: window.__shelf?.profile ?? '',
  canvases: document.querySelectorAll('canvas').length,
  record: localStorage.getItem(${JSON.stringify(FALLBACK_KEY)}),
  notice: document.querySelector('.shelf-notice')?.textContent ?? '',
  visibility: document.visibilityState,
  canvasShown:
    document
      .getElementById('shelf-canvas')
      ?.checkVisibility({ visibilityProperty: true, opacityProperty: true }) ?? false,
}))()`;

async function checkContextLossFallback(
  browser: Browser,
  origin: string,
): Promise<FallbackChecked> {
  const lines: string[] = [];
  const failures: string[] = [];

  // The third field begins the one kind of console error a case causes on
  // purpose. It is taken out of that case's errors only, and the case fails if
  // it never came.
  const cases: readonly (readonly [string, FallbackCase, string?])[] = [
    ['restore', restoreThenReload],
    ['no restore', noRestore],
    ['storage refused', storageRefused],
    ['painted loss', paintedLoss],
    ['refused', refusedRedraw, REFUSED_BY_THREE],
    ['probe loss', probeLoss],
    ['redraw halts', redrawHalts, LINK_FAILED],
    ['link failure', linkFailure, LINK_FAILED],
  ];

  for (const [name, run, expected] of cases) {
    const context = await browser.createBrowserContext();
    const errors: string[] = [];
    try {
      const page = await context.newPage();
      await page.setViewport(VIEWPORT);
      page.on('pageerror', (error: unknown) => {
        errors.push(error instanceof Error ? error.message : String(error));
      });
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.evaluateOnNewDocument(COUNT_FRAMES);
      lines.push(`${name.padEnd(16)}${await run(page, origin)}`);
    } catch (error) {
      lines.push(`${name.padEnd(16)}FAILED`);
      failures.push(
        `context loss, ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await context.close();
    }
    // Whole string for three's refusal, as the register states; by prefix only for the
    // link failure, whose message carries the driver's log after its colon.
    const isExpected = (error: string): boolean =>
      expected === LINK_FAILED ? error.startsWith(expected) : error === expected;
    const unexpected =
      expected === undefined ? errors : errors.filter((error) => !isExpected(error));
    if (expected !== undefined && unexpected.length === errors.length) {
      failures.push(
        `context loss, ${name}: three never logged "${expected}", so the page was not refused ` +
          'the way this case stages it',
      );
    }
    if (unexpected.length > 0) {
      failures.push(`context loss, ${name}: page errors:\n    ${unexpected.join('\n    ')}`);
    }
  }

  return { lines, failures };
}

type FallbackCase = (page: Page, origin: string) => Promise<string>;

/**
 * (A) a restore rebuilds painted on the same canvas, with one render loop;
 * (B) a reload starts painted from the record; (C) `?shadows=1` still wins.
 */
async function restoreThenReload(page: Page, origin: string): Promise<string> {
  await visit(page, origin, REAL_TIME_PATH);
  await mustSample(page);

  await page.evaluate(LOSE);
  await waitForState(
    page,
    `localStorage.getItem(${JSON.stringify(FALLBACK_KEY)}) !== null`,
    5000,
    'record written by the lost handler',
  );
  await page.evaluate(RESTORE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'restored'`,
    5000,
    'painted rebuild on restore',
  );

  const restored = await readState(page);
  must(
    restored.profile.includes('shadows=off'),
    `the restored shelf still samples the map: ${restored.profile}`,
  );
  must(restored.canvases === 1, `${String(restored.canvases)} canvases after a restore, not 1`);
  must(restored.notice === '', `a notice stayed over the redrawn shelf: "${restored.notice}"`);
  must(restored.canvasShown, 'the shelf was redrawn on a canvas that is still hidden');
  const loops = await oneLoop(page, 'after the restore');

  await visit(page, origin, '/');
  const reloaded = await readState(page);
  must(
    reloaded.fallback === 'remembered' && reloaded.profile.includes('shadows=off'),
    `a reload did not start painted from the record: ${JSON.stringify(reloaded)}`,
  );

  await visit(page, origin, '/?shadows=1');
  const probed = await readState(page);
  must(
    probed.fallback === 'probe-override' && !probed.profile.includes('shadows=off'),
    `?shadows=1 did not beat the record: ${JSON.stringify(probed)}`,
  );

  return `restored painted (${loops}), reload remembered, ?shadows=1 probe-override`;
}

/** (D) no restore: a new canvas, drawn, clickable, and the old one gone. */
async function noRestore(page: Page, origin: string): Promise<string> {
  await visit(page, origin, REAL_TIME_PATH);
  await mustSample(page);
  await page.evaluate(`window.__oldCanvas = document.getElementById('shelf-canvas')`);

  const lostAt = Date.now();
  await page.evaluate(LOSE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'fresh-canvas'`,
    RESTORE_WAIT_MS + 3000,
    'painted rebuild on a new canvas',
  );
  const waited = Date.now() - lostAt;

  const state = await readState(page);
  must(state.canvases === 1, `${String(state.canvases)} canvases after the swap, not 1`);
  must(
    (await page.evaluate(`document.getElementById('shelf-canvas') !== window.__oldCanvas`)) ===
      true,
    'the shelf is still on the lost canvas',
  );
  must(state.profile.includes('shadows=off'), `the new shelf samples the map: ${state.profile}`);
  must(state.notice === '', `a notice stayed over the redrawn shelf: "${state.notice}"`);
  // The new element is a clone of one hidden while the notice was up.
  must(state.canvasShown, 'the new canvas is drawn and still hidden');

  // Textures land and the ResizeObserver sizes the new element: the settle helper
  // for the first, counted afresh from the new shelf's frames, and the buffer
  // matching the canvas's CSS size times the pixel ratio (both in device pixels)
  // for the second.
  await page.evaluate('window.__settleReadings.length = 0');
  must(await watchSettle(page)(), 'the new canvas never settled');
  await waitForState(
    page,
    `(() => {
      const s = window.__shelf.stats();
      const canvas = document.getElementById('shelf-canvas');
      return s.bufferWidth === Math.round(canvas.clientWidth * s.pixelRatio);
    })()`,
    5000,
    "the new canvas's buffer to match its size",
  );
  const stats = (await page.evaluate(readCanvasStats)) as Stats;
  must(
    stats.distinctColours >= 40 && stats.nonBackgroundPct >= 10,
    `the new canvas looks blank: ${String(stats.distinctColours)} colours, ` +
      `${stats.nonBackgroundPct.toFixed(1)}% not background`,
  );
  const loops = await oneLoop(page, 'on the new canvas');
  must(
    (await clickToPickUp(page, 'window.__shelf.held() !== undefined')) !== undefined,
    'no book on the new canvas can be picked up',
  );

  return (
    `new canvas after ${String(waited)}ms, ${stats.size}, ${String(stats.distinctColours)} ` +
    `colours, ${loops}, a book picks up`
  );
}

/** (E) storage refusing every write still falls back, says so, and throws nothing. */
async function storageRefused(page: Page, origin: string): Promise<string> {
  await page.evaluateOnNewDocument(REFUSE_STORAGE);
  await visit(page, origin, `${REAL_TIME_PATH}${REAL_TIME_PATH.includes('?') ? '&' : '?'}debug`);
  await mustSample(page);

  await page.evaluate(LOSE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'waiting'`,
    5000,
    "loss taken as the fallback's",
  );
  await page.evaluate(RESTORE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'restored'`,
    5000,
    'painted rebuild on restore',
  );

  const state = await readState(page);
  must(
    state.record === null,
    `a record reached storage that refuses writes: ${String(state.record)}`,
  );
  must(
    state.profile.includes('shadows=off'),
    `the restored shelf samples the map: ${state.profile}`,
  );
  await waitForState(
    page,
    `document.querySelector('.shelf-diagnostics')?.textContent.includes('not remembered') === true`,
    3000,
    'black-box line saying the fallback is not remembered',
  );

  return 'restored painted, not remembered, no page errors';
}

/** (F) a painted shelf's loss writes nothing, rebuilds nothing, and resumes in place. */
async function paintedLoss(page: Page, origin: string): Promise<string> {
  await visit(page, origin, '/?shadows=0');

  await page.evaluate(LOSE);
  await waitForState(page, `document.querySelector('.shelf-notice') !== null`, 5000, 'lost notice');
  // An **absence** wait (K3), fixed on purpose: past the page's own restore
  // window, so a rebuild that should not happen has had its chance to. ⚠️ A slower
  // runner can only make this weaker, never flaky: a rebuild arriving after it is
  // missed and the check passes — the residual #397's cause 2 left, accepted.
  await new Promise((resolve) => setTimeout(resolve, RESTORE_WAIT_MS + 500));

  const lost = await readState(page);
  must(
    lost.record === null && lost.fallback === 'none' && lost.canvases === 1,
    `a painted loss was taken as the fallback's: ${JSON.stringify(lost)}`,
  );
  must(!lost.canvasShown, 'the lost canvas is still shown under the notice');

  await page.evaluate(RESTORE);
  await waitForState(
    page,
    `document.querySelector('.shelf-notice') === null`,
    5000,
    'cleared notice after the resume',
  );
  must((await readState(page)).canvasShown, 'the shelf resumed on a canvas that is still hidden');
  const loops = await oneLoop(page, 'after an in-place resume');

  return `notice, canvas hidden, no record, no rebuild, resumed in place and shown (${loops})`;
}

/**
 * (G) no restore, and the new canvas refused a context — every real loss on the
 * Pixel. The failure sentence, the record written, and the lost canvas hidden:
 * left shown, Chrome painted it white over the whole page.
 */
async function refusedRedraw(page: Page, origin: string): Promise<string> {
  await visit(page, origin, REAL_TIME_PATH);
  await mustSample(page);
  await page.evaluate(REFUSE_NEW_CONTEXTS);

  await page.evaluate(LOSE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'refused'`,
    RESTORE_WAIT_MS + 3000,
    'refused redraw',
  );

  const state = await readState(page);
  must(state.canvases === 1, `${String(state.canvases)} canvases after a refusal, not 1`);
  must(state.record !== null, 'a refused redraw wrote no record, so the next load samples again');
  must(
    state.notice.includes('would not give it another'),
    `the page does not say it was refused: "${state.notice}"`,
  );
  must(
    !state.canvasShown,
    'the lost canvas is still shown — on the phone Chrome paints it white over the whole page',
  );

  return 'refused, failure sentence, record written, lost canvas hidden';
}

/**
 * (H) a shadow probe's loss falls back the same way and writes nothing.
 *
 * `?receivers=all` is the probe that matters: the upstream reproduction, re-run
 * by hand on the phone after a driver update, which loses its context there
 * while the shipped shelf does not. Written down, that loss would start the
 * device's plain page painted for 30 days.
 */
async function probeLoss(page: Page, origin: string): Promise<string> {
  const joiner = REAL_TIME_PATH.includes('?') ? '&' : '?';
  await visit(page, origin, `${REAL_TIME_PATH}${joiner}receivers=all&debug`);
  await mustSample(page);

  await page.evaluate(LOSE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'waiting'`,
    5000,
    "the probe's loss taken as the fallback's",
  );
  await page.evaluate(RESTORE);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'restored'`,
    5000,
    'painted rebuild on restore',
  );

  const restored = await readState(page);
  must(
    restored.record === null,
    `a probe's loss wrote a record, so the plain page would start painted: ${String(restored.record)}`,
  );
  must(
    restored.profile.includes('shadows=off'),
    `the restored probe still samples the map: ${restored.profile}`,
  );
  await waitForState(
    page,
    `document.querySelector('.shelf-diagnostics')?.textContent.includes('a shadow probe, not remembered') === true`,
    3000,
    "black-box line saying the probe's loss is not remembered",
  );

  await visit(page, origin, '/');
  const plain = await readState(page);
  must(
    plain.fallback === 'none' &&
      plain.profile.includes('shadows=off') !== DEFAULT_SETTINGS.shadows.enabled,
    `the plain page after a probe's loss is not the shipped one: ${JSON.stringify(plain)}`,
  );

  return 'restored painted, no record, the plain page shipped';
}

/**
 * (I) a painted redraw that will not link keeps the shader's sentence, and its
 * canvas hidden.
 *
 * The new shelf's first frame is drawn inside `mountShelf`, so its link failure
 * has put the sentence up before the page adopts it — and adopting used to
 * clear every notice, which left a frozen, half-drawn shelf with nothing saying
 * why. The recovery still counts the redraw `fresh-canvas`; what this holds is
 * what the page shows.
 */
async function redrawHalts(page: Page, origin: string): Promise<string> {
  await page.evaluateOnNewDocument(BREAK_PROGRAMS);
  await visit(page, origin, REAL_TIME_PATH);
  await mustSample(page);

  // In the same task as the loss, so the lost shelf compiles nothing under it.
  await page.evaluate(`window.__breakPrograms = 'all'; ${LOSE}`);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'fresh-canvas'`,
    RESTORE_WAIT_MS + 3000,
    'painted redraw on a new canvas',
  );

  const state = await readState(page);
  must(
    state.notice.includes('would not compile'),
    `the halted redraw lost the shader's sentence: "${state.notice}"`,
  );
  must(!state.canvasShown, "the halted redraw's frozen canvas is shown");

  return 'redraw halted, shader sentence kept, canvas hidden';
}

/**
 * (J) a program that will not link while the shelf samples the map falls back
 * painted at once, on the same canvas, and remembers.
 *
 * The default page links the bookcase's PCF program, and on 1 August a painted
 * plane on the Pixel "compiles clean and will not link" under `?shadows=1`.
 * Halting there wrote nothing, so a device whose driver will not link the
 * shadow program got a dead shelf on every load. The break is on from the first
 * frame, so the page this case reaches is the redraw: that the real-time shelf
 * sampled is read off the fallback's own state, which only a sampling shelf's
 * failure can reach.
 */
async function linkFailure(page: Page, origin: string): Promise<string> {
  await page.evaluateOnNewDocument(`window.__breakPrograms = 'shadow';`);
  await page.evaluateOnNewDocument(BREAK_PROGRAMS);
  await visit(page, origin, REAL_TIME_PATH);
  await waitForState(
    page,
    `window.__shelf.fallback() === 'link-failed'`,
    5000,
    'painted redraw after the link failure',
  );

  const state = await readState(page);
  must(
    state.record !== null,
    'a link failure on the shipped shelf wrote no record, so every load halts the same way',
  );
  must(state.profile.includes('shadows=off'), `the redraw samples the map: ${state.profile}`);
  must(state.canvases === 1, `${String(state.canvases)} canvases after the redraw, not 1`);
  must(state.notice === '', `a notice stayed over the redrawn shelf: "${state.notice}"`);
  must(state.canvasShown, 'the shelf was redrawn on a canvas that is still hidden');
  must(
    (await page.evaluate('window.__shelf.shaderErrors.length')) === 0,
    'the painted redraw failed to link too',
  );
  const loops = await oneLoop(page, 'after the painted redraw');

  await visit(page, origin, '/');
  const reloaded = await readState(page);
  must(
    reloaded.fallback === 'remembered' && reloaded.profile.includes('shadows=off'),
    `a reload did not start painted from the record: ${JSON.stringify(reloaded)}`,
  );
  must(
    (await page.evaluate('window.__shelf.shaderErrors.length')) === 0,
    'the remembered load failed to link',
  );

  return `redrawn painted in place (${loops}), record written, reload remembered`;
}

async function visit(page: Page, origin: string, path: string): Promise<void> {
  // Ready is the state every case needs, and then the settle helper: the covers
  // in, the counts still. On the runner's software renderer `networkidle0` inside
  // 30 s failed one case of eight on one Node version of two, with the shelf
  // itself fine, which is why the settle reads state and not a quiet network. A
  // shelf that never settles is this case's failure, which the loop records.
  const settle = watchSettle(page);
  const started = performance.now();
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
  const ready = performance.now();
  must(await settle(), `${path} never settled`);
  // A hidden page's loss is not the fallback's, by design — so make sure the
  // one under test is the one in front.
  await page.bringToFront();
  VISITS.count += 1;
  VISITS.toReady += (ready - started) / 1000;
  VISITS.toSettled += (performance.now() - ready) / 1000;
}

/**
 * What `visit()`'s cold boots cost in total, printed under the step times: the
 * share of G60 that is booting rather than testing (#397).
 */
const VISITS = { count: 0, toReady: 0, toSettled: 0 };

/**
 * The same two times for G61's boots, which `measureSampling` makes without
 * `visit()`. Its wait for steady sampling frames comes after and is not counted.
 */
const SAMPLING_BOOTS = { count: 0, toReady: 0, toSettled: 0 };

async function readState(page: Page): Promise<PageState> {
  return (await page.evaluate(READ_STATE)) as PageState;
}

/** Refuses to test the fallback on a page that is not sampling the map, or cannot be seen. */
async function mustSample(page: Page): Promise<void> {
  const state = await readState(page);
  must(
    !state.profile.includes('shadows=off'),
    `${REAL_TIME_PATH} does not sample the shadow map, so nothing here tests the fallback: ${state.profile}`,
  );
  must(
    state.visibility === 'visible',
    `the page is ${state.visibility}, and a hidden page's loss is deliberately not the fallback's`,
  );
}

async function oneLoop(page: Page, when: string): Promise<string> {
  const loops = (await page.evaluate(LOOPS_PER_FRAME)) as { frames: number; most: number };
  must(
    loops.frames === LOOP_SAMPLE_FRAMES,
    `${String(loops.frames)} of ${String(LOOP_SAMPLE_FRAMES)} frames were drawn in ` +
      `${String(STATE_WAIT_FLOOR_MS)}ms ${when}`,
  );
  must(
    loops.most === 1,
    `${String(loops.most)} render-loop callbacks in one frame ${when} — a disposed shelf's loop ` +
      'is still running beside the live one',
  );
  return `${String(LOOP_SAMPLE_FRAMES)} frames, 1 loop`;
}

async function waitForState(
  page: Page,
  expression: string,
  asked: number,
  what: string,
): Promise<void> {
  const timeout = Math.max(asked, STATE_WAIT_FLOOR_MS);
  try {
    await page.waitForFunction(expression, { timeout, polling: 50 });
  } catch {
    throw new Error(
      `no ${what} within ${String(timeout)}ms. The page reads ${JSON.stringify(await readState(page))}`,
    );
  }
}

function must(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/* -------------------------------------------------------------------------- */

/**
 * G61 — exactly one program reads the real-time shadow map on the default
 * page, in a constant number of draws a frame at any library size.
 *
 * On the Pixel 10 Pro XL five programs sampling the shadow map lost the WebGL
 * context at frame 8, and the bookcase's alone, in 2 draws, survives. What
 * kills it is not known: a count of sampling draws was the model, and a
 * re-check with 2 programs at 53 draws a frame that survived refuted it
 * (ADR-0088). So the books compile no shadow fetch and the bookcase reads the
 * map in 2 draws, and this is what holds that: a book program that starts
 * reading the map again, or a bookcase that splits back into a draw per
 * member, is red here on a desktop, before a phone ever loads it. The numbers
 * and the judge are `lib/shadow-sampling.ts`; the counting is
 * `lib/sampling-hook.ts`.
 *
 * ⚠️ **Why a desktop sees the phone's programs.** three assembles every
 * program's source in JavaScript — prefix, chunks, defines, which materials
 * share a program — so the GPU only compiles what it is handed. The one fact a
 * driver decides is whether a declared sampler is *active*, which is why every
 * program is classified by GL and by its source and the two must agree.
 *
 * ⚠️ **It pins the configuration that survived, not survival.** The budget is
 * the shape one phone survived on one driver, with room for one more member;
 * where that phone's edge lies is not known, another GPU could have a lower
 * one, and nothing here would go red. `scripts/phone-check.ts` is the check a
 * phone runs.
 */
interface SamplingChecked {
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

/** Small, so SwiftShader is cheap: the counts do not depend on the viewport. */
const SAMPLING_VIEWPORT = { width: 480, height: 640, deviceScaleFactor: 1 };

/** How long a page gets to stop linking programs before it is judged unsettled. */
const SETTLE_TIMEOUT_MS = 30_000;

/** Wide enough for the longest page name and its shelf count. */
const PAGE_COLUMN = 34;

/**
 * A tall enough case: the unjoined bookcase drew `rows + 4` — 12 at 8 rows,
 * the most one program sampling alone was seen to hold on the phone.
 */
const MIN_SAMPLING_ROWS = 8;

interface SamplingPage {
  readonly name: string;
  readonly url: (main: string, large: string) => string;
  /** `gate` must pass; `control` must fail, and for the right reason. */
  readonly role: 'gate' | 'control';
  /** The library it serves, whose shelved books the page must report. */
  readonly library: string;
  readonly minRows: number;
  /**
   * Picks a book up and holds it before the count: the held book's new parts
   * are lit materials, and every one must compile with no shadow fetch (spec §5,
   * "held reader"). #371 measured 1 program and 2 draws a frame with a book held.
   */
  readonly hold?: boolean;
}

const SAMPLING_PAGES: readonly SamplingPage[] = [
  {
    name: 'default, 50 books',
    url: (main) => `${main}/`,
    role: 'gate',
    library: LIBRARY,
    minRows: 0,
  },
  {
    name: `default, ${String(LARGE_BOOKS)} books`,
    url: (_main, large) => `${large}/`,
    role: 'gate',
    library: LARGE_LIBRARY,
    minRows: MIN_SAMPLING_ROWS,
  },
  {
    name: 'a book held, 50 books',
    url: (main) => `${main}/`,
    role: 'gate',
    library: LIBRARY,
    minRows: 0,
    hold: true,
  },
  {
    // The permanent planted defect: every book reads the map again, through
    // the product's own switch. It measured 5 programs and 302 sampling draws
    // a frame on the 50-book fixture when this gate was written.
    name: '?receivers=all (control)',
    url: (main) => `${main}/?receivers=all`,
    role: 'control',
    library: LIBRARY,
    minRows: 0,
  },
];

interface SamplingRead {
  readonly snapshot: SamplingSnapshot | null;
  readonly threeCalls: number | null;
  readonly bookCount: number;
  readonly rowCount: number;
}

/** One evaluate, so the hook's last frame and three's counter are the same frame. */
const READ_SAMPLING = `(() => ({
  snapshot: window.__samplingHook?.read() ?? null,
  threeCalls: window.__shelf?.stats().calls ?? null,
  bookCount: window.__shelf?.bookCount ?? 0,
  rowCount: window.__shelf?.rowCount ?? 0,
}))()`;

async function checkShadowReaders(
  browser: Browser,
  main: string,
  large: string,
): Promise<SamplingChecked> {
  const lines = [
    `${'page'.padEnd(PAGE_COLUMN)}${'steady'.padStart(7)}${'programs'.padStart(10)}` +
      `${'draws/frame'.padStart(13)}   verdict`,
  ];
  const failures: string[] = [];

  for (const page of SAMPLING_PAGES) {
    const { read, errors } = await measureSampling(browser, page.url(main, large), page.hold);
    const run = {
      snapshot: read.snapshot ?? undefined,
      bookCount: read.bookCount,
      threeCalls: read.threeCalls ?? undefined,
    };
    const found: string[] =
      page.role === 'gate' ? judgeSampling(run) : [...judgeControl(run), ...errors];
    if (page.role === 'gate') {
      found.push(...errors);
      const expected = expectedBookCount(page.library);
      if (read.bookCount !== expected) {
        found.push(
          `(7) ${String(read.bookCount)} books on the shelf, where the library has ${String(expected)}`,
        );
      }
      if (read.rowCount < page.minRows) {
        found.push(
          `(7) ${String(read.rowCount)} shelves, fewer than the ${String(page.minRows)} that make ` +
            'this page large enough to tell a joined bookcase from a short library',
        );
      }
    }

    const s = run.snapshot === undefined ? undefined : summarise(run.snapshot);
    const programs = s === undefined ? '—' : String(s.mostPrograms);
    const verdict =
      page.role === 'control'
        ? found.length === 0
          ? 'red, as it must be'
          : 'FAILED'
        : found.length === 0
          ? 'ok'
          : 'FAILED';
    const rows = page.minRows > 0 ? ` (${String(read.rowCount)} shelves)` : '';
    lines.push(
      `${`${page.name}${rows}`.padEnd(PAGE_COLUMN)}${String(s?.steady ?? 0).padStart(7)}` +
        `${programs.padStart(10)}${String(s?.mostSteadyDraws ?? 0).padStart(13)}   ${verdict}`,
    );
    lines.push(`${''.padEnd(PAGE_COLUMN)}${describeSampling(run)}`);
    failures.push(...found.map((failure) => `G61, ${page.name}: ${failure}`));
  }

  return { lines, failures };
}

async function measureSampling(
  browser: Browser,
  url: string,
  hold = false,
): Promise<{ read: SamplingRead; errors: string[] }> {
  const context = await browser.createBrowserContext();
  const errors: string[] = [];
  try {
    const page = await context.newPage();
    await page.setViewport(SAMPLING_VIEWPORT);
    page.on('pageerror', (error: unknown) => {
      errors.push(`page error: ${error instanceof Error ? error.message : String(error)}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console error: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        errors.push(`HTTP ${String(response.status())}: ${response.url()}`);
      }
    });
    // A string, never the function: see `lib/sampling-hook.ts` on `__name`.
    await page.evaluateOnNewDocument(samplingHookSource());
    // A hidden page gets no animation frames, and a page with no frames settles
    // into a vacuous verdict — so the page under measurement is the one in front.
    await page.bringToFront();
    const settle = watchSettle(page);
    const started = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    const ready = performance.now();
    // The woodwork's sheets arrive after `ready`, and the bookcase changes program as
    // each one lands. The sampling settle below counts from the last change it has
    // seen, so it cannot wait out a sheet still in flight: until the second one
    // lands, the old program and the new one both draw, and a verdict read then is
    // red (#385). The settle helper is what waits for that now: no image request in
    // flight, the counts still. `networkidle0` inside `goto` once did, and it
    // stalled on this machine's GPU for a reason never isolated. A page that never
    // settles is recorded among the page's errors, and still judged on the frames
    // the sampling settle requires.
    if (!(await settle())) errors.push('the page never settled: textures or image requests moved');
    SAMPLING_BOOTS.count += 1;
    SAMPLING_BOOTS.toReady += (ready - started) / 1000;
    SAMPLING_BOOTS.toSettled += (performance.now() - ready) / 1000;
    if (hold) {
      await page.evaluate('window.__shelf.pickUp(3)');
      if (!(await until(page, HELD, 'the book held for this page to come to rest'))) {
        errors.push('the book held for this page never came to rest');
      }
    }
    try {
      await page.waitForFunction(
        `(window.__samplingHook?.settledFor() ?? 0) >= ${String(MIN_STEADY_FRAMES)}`,
        { timeout: SETTLE_TIMEOUT_MS, polling: 100 },
      );
    } catch {
      // Judged below: clause 2 says the program set never settled, with numbers.
    }
    return { read: (await page.evaluate(READ_SAMPLING)) as SamplingRead, errors };
  } finally {
    await context.close();
  }
}

/* -------------------------------------------------------------------------- */

/**
 * The pickup tuner's two rows: **tuner split** and **styled pane**.
 *
 * Both failures were measured silent on #376. A plain CSS import in the lazy
 * module was hoisted onto every page, 5.2 KB gzip for every visitor, and a pane
 * whose injected `<style>` the CSP refused drew unstyled and threw nothing. So
 * each is read off a real page of the built site, under the CSP it ships with:
 *
 * - **split**: a page without `?debug` fetches no script and no stylesheet that
 *   carries the tuner's root rule, and the same page with `?debug` fetches both
 *   — the control, without which "nothing found" could mean a detector that sees
 *   nothing.
 * - **styled**: on the `?debug` page the root pane is drawn with Tweakpane's own
 *   background, not a browser default; no `securitypolicyviolation` fired; and
 *   `style-src` carries the empty string's hash, which the two placeholders in
 *   `index.astro` depend on (spec §3.7).
 * - **pane**: the debug pane's own rows, read off the rendered page, one per
 *   field the view writes, because a check that only mounts the pane cannot
 *   fail when the view stops copying one (ADR-0119): its title; that it starts
 *   expanded at 1440px and collapsed at 700px; the tuner's scrub, which reads
 *   0 with nothing held and the timeline's own progress once a book is held,
 *   and its `held` line; and the export, which writes the constant into its
 *   read-only text. None of these exists on a page without `?debug`.
 */
interface TunerChecked {
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

/**
 * Tweakpane's root-pane class. It is in the library's JavaScript, as part of
 * the stylesheet literal it carries, and in the stylesheet extracted from it,
 * so one string finds both halves of the tuner.
 */
const TUNER_MARKER = '.tp-rotv';

/** SHA-256 of the empty string, the hash the empty placeholders need. */
const EMPTY_STRING_HASH = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";

/** Recorded from before the page's first script, so no violation is missed. */
const RECORD_VIOLATIONS = `(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__cspViolations.push(event.violatedDirective + ' ' + (event.blockedURI || 'inline'));
  });
})()`;

interface Fetched {
  readonly url: string;
  readonly kind: 'script' | 'stylesheet';
  readonly tuner: boolean;
}

async function checkTuner(browser: Browser, origin: string): Promise<TunerChecked> {
  const lines: string[] = [];
  const failures: string[] = [];

  const plain = await visitForTuner(browser, `${origin}/`);
  const debug = await visitForTuner(browser, `${origin}/?debug`);
  const narrow = await visitForTuner(browser, `${origin}/?debug`, PANE_NARROW_VIEWPORT);

  const tunerOn = (page: TunerVisit, kind: Fetched['kind']): number =>
    page.fetched.filter((asset) => asset.kind === kind && asset.tuner).length;

  // Split: the plain page carries none of it.
  const leaked = plain.fetched.filter((asset) => asset.tuner);
  lines.push(
    `tuner split    / fetched ${String(plain.fetched.length)} scripts and stylesheets, ` +
      `${String(leaked.length)} carrying the tuner   ?debug fetched the tuner in ` +
      `${String(tunerOn(debug, 'script'))} script(s) and ${String(tunerOn(debug, 'stylesheet'))} stylesheet(s)`,
  );
  if (plain.fetched.length === 0) {
    failures.push('tuner split: the plain page fetched no scripts or stylesheets at all');
  }
  for (const asset of leaked) {
    failures.push(
      `tuner split: a page without ?debug fetched tuner bytes, ${asset.kind} ${asset.url}`,
    );
  }
  if (tunerOn(debug, 'script') === 0 || tunerOn(debug, 'stylesheet') === 0) {
    failures.push(
      'tuner split (control): the ?debug page did not fetch the tuner as both a script and a ' +
        'stylesheet, so "none on the plain page" proves nothing',
    );
  }

  // Styled: the ?debug page's pane, under the shipped CSP.
  const styled = debug.styled;
  lines.push(
    `styled pane    pane ${styled.found ? `background ${styled.background}` : 'NOT FOUND'}   ` +
      `violations ${String(styled.violations.length)}   empty-string hash ${
        styled.emptyHash ? 'in style-src' : 'MISSING'
      }`,
  );
  if (!styled.found) failures.push('styled pane: no pane rendered on the ?debug page');
  else if (styled.background === 'rgba(0, 0, 0, 0)') {
    failures.push('styled pane: the pane has a browser-default background, so it drew unstyled');
  }
  for (const violation of styled.violations) {
    failures.push(`styled pane: the ?debug page broke its CSP, ${violation}`);
  }
  if (!styled.emptyHash) {
    failures.push(
      "styled pane: the built style-src lacks the empty string's hash, which the two " +
        'empty placeholders need',
    );
  }
  for (const error of [...plain.errors, ...debug.errors, ...narrow.errors]) {
    failures.push(`tuner: ${error}`);
  }

  const reading = debug.pane;
  lines.push(
    `debug pane     title "${reading.title}"   expanded at ${String(VIEWPORT.width)}px ${String(reading.expanded)}, ` +
      `at ${String(PANE_NARROW_VIEWPORT.width)}px ${String(narrow.pane.expanded)}   scrub ` +
      `${reading.scrubBefore} nothing held, ${reading.scrubAfter} held   held line "${reading.heldAfter}"   ` +
      `export ${String(reading.exportText.length)} chars`,
  );
  failures.push(...judgePane(reading, narrow.pane));

  return { lines, failures };
}

/** At this width or less the debug pane starts collapsed (`pane-slots.ts`). */
const PANE_NARROW_VIEWPORT = { width: 700, height: 900 };

interface PaneReading {
  readonly title: string;
  /** Tweakpane's own `tp-rotv-expanded` on the root, the rendered state. */
  readonly expanded: boolean;
  readonly scrubBefore: string;
  readonly heldBefore: string;
  readonly scrubAfter: string;
  readonly heldAfter: string;
  readonly exportText: string;
}

/** What the pane shows, against what the view is meant to copy onto it. */
function judgePane(wide: PaneReading, narrow: PaneReading): string[] {
  const failures: string[] = [];
  if (wide.title !== 'Debug pane') {
    failures.push(`debug pane: titled "${wide.title}", not "Debug pane"`);
  }
  if (!wide.expanded) failures.push('debug pane: collapsed at 1440px, where it starts expanded');
  if (narrow.expanded) failures.push('debug pane: expanded at 700px, where it starts collapsed');
  if (Number(wide.scrubBefore) !== 0 || wide.heldBefore !== 'nothing held') {
    failures.push(
      `debug pane: with nothing held the scrub reads ${wide.scrubBefore} and the held line "${wide.heldBefore}"`,
    );
  }
  if (!(Number(wide.scrubAfter) > 0) || !wide.heldAfter.includes(' · ')) {
    failures.push(
      `debug pane: with a book held the scrub reads ${wide.scrubAfter} and the held line ` +
        `"${wide.heldAfter}", so the timeline's progress is not read back`,
    );
  }
  if (!wide.exportText.includes('export const PICKUP_MOTION')) {
    failures.push('debug pane: the export button did not write the constant into its text');
  }
  return failures;
}

/** Only the rest state: title and expanded, for a visit that asks about nothing else. */
async function readPaneAtRest(page: Page): Promise<PaneReading> {
  const now = (await page.evaluate(READ_PANE)) as PaneNow | null;
  return now === null ? NO_PANE : { ...NO_PANE, title: now.title, expanded: now.expanded };
}

interface PaneNow {
  readonly title: string;
  readonly expanded: boolean;
  readonly scrub: string;
  readonly held: string;
  readonly exportText: string;
}

/**
 * The whole reading: the rows with nothing held, then with a book picked up, then
 * after the export button is pressed. Each step waits on the page's own state
 * rather than a sleep, and a timeout leaves the reading it has, for the judge.
 */
async function readPane(page: Page): Promise<PaneReading> {
  const before = (await page.evaluate(READ_PANE)) as PaneNow | null;
  if (before === null) return NO_PANE;
  await page.evaluate('window.__shelf.pickUp(0)');
  await until(page, HELD, 'the pane read-back: a book held');
  await until(
    page,
    `(() => { const i = (${TUNER_FOLDER})?.querySelector('input.tp-txtv_i'); return i !== undefined && i !== null && Number(i.value) > 0; })()`,
    'the pane read-back: the scrub following the timeline',
  );
  const after = (await page.evaluate(READ_PANE)) as PaneNow | null;
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('.tp-rotv .tp-btnv_b')].find((b) => b.textContent === 'Export PICKUP_MOTION');
    button?.click();
  })()`);
  await until(
    page,
    `((${TUNER_FOLDER})?.querySelector('textarea')?.value ?? '').includes('PICKUP_MOTION')`,
    'the pane export text',
  );
  const exported = (await page.evaluate(READ_PANE)) as PaneNow | null;
  return {
    title: before.title,
    expanded: before.expanded,
    scrubBefore: before.scrub,
    heldBefore: before.held,
    scrubAfter: after?.scrub ?? '',
    heldAfter: after?.held ?? '',
    exportText: exported?.exportText ?? '',
  };
}

interface TunerVisit {
  readonly fetched: readonly Fetched[];
  readonly styled: {
    readonly found: boolean;
    readonly background: string;
    readonly violations: readonly string[];
    readonly emptyHash: boolean;
  };
  readonly pane: PaneReading;
  readonly errors: readonly string[];
}

const NO_PANE: PaneReading = {
  title: '',
  expanded: false,
  scrubBefore: '',
  heldBefore: '',
  scrubAfter: '',
  heldAfter: '',
  exportText: '',
};

/**
 * The Pickup tuner's folder, found by its title and not by its place: the pane
 * holds other instruments, and the first text input or textarea on it is theirs
 * as soon as one is added above or beside the tuner.
 */
const TUNER_FOLDER = `[...document.querySelectorAll('.tp-rotv .tp-fldv')].find((f) => f.querySelector('.tp-fldv_t')?.textContent === 'Pickup tuner') ?? null`;

/**
 * The pane's rows as the page renders them: the root's `tp-rotv_t` title and
 * its `tp-rotv-expanded` class, and, inside the Pickup tuner's folder, the scrub
 * (its first text input), the `held` line (its first single-line monitor) and
 * the read-only export text.
 */
const READ_PANE = `(() => {
  const root = document.querySelector('.tp-rotv');
  if (root === null) return null;
  const tuner = ${TUNER_FOLDER};
  return {
    title: root.querySelector('.tp-rotv_t')?.textContent ?? '',
    expanded: root.classList.contains('tp-rotv-expanded'),
    scrub: tuner?.querySelector('input.tp-txtv_i')?.value ?? '',
    held: tuner?.querySelector('input.tp-sglv_i')?.value ?? '',
    exportText: tuner?.querySelector('textarea')?.value ?? '',
  };
})()`;

async function visitForTuner(
  browser: Browser,
  url: string,
  viewport: { readonly width: number; readonly height: number } = VIEWPORT,
): Promise<TunerVisit> {
  const context = await browser.createBrowserContext();
  const errors: string[] = [];
  const reads: Promise<Fetched | undefined>[] = [];
  try {
    const page = await context.newPage();
    await page.setViewport(viewport);
    page.on('pageerror', (error: unknown) => {
      errors.push(
        `page error at ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    page.on('response', (response) => {
      const kind = response.request().resourceType();
      if (kind !== 'script' && kind !== 'stylesheet') return;
      reads.push(
        response.text().then(
          (body) => ({ url: response.url(), kind, tuner: body.includes(TUNER_MARKER) }),
          () => undefined,
        ),
      );
    });
    await page.evaluateOnNewDocument(RECORD_VIOLATIONS);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    // An **absence** of further fetches (K4): what this row judges is what the
    // network carried, so "the network went quiet" is the state it needs. Bounded
    // and never fatal: a slow runner can only weaken the check, never flake it.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 20_000 }).catch(() => undefined);
    // The pane exists only behind ?debug. On the plain page this times out by
    // design, and that is the check itself (K10, an **absence**). On the ?debug page
    // it is a **presence** wait: the floor, and a timeout prints what was awaited
    // and leaves the reading to the judges, which find the pane missing or unstyled.
    const debug = url.includes('debug');
    const paneStyled = `(() => { const pane = document.querySelector('${TUNER_MARKER}');
          return pane !== null && getComputedStyle(pane).backgroundColor !== 'rgba(0, 0, 0, 0)'; })()`;
    if (debug) {
      await until(page, paneStyled, 'the tuner pane to be drawn with its own background');
    } else {
      await page.waitForFunction(paneStyled, { timeout: 1 }).catch(() => undefined);
    }

    const styled = (await page.evaluate(`(() => {
      const pane = document.querySelector('${TUNER_MARKER}');
      const meta = document.querySelector('meta[http-equiv="content-security-policy" i]');
      const styleSrc = (meta?.getAttribute('content') ?? '').split(';').find((d) => d.trim().startsWith('style-src')) ?? '';
      return {
        found: pane !== null,
        background: pane === null ? '' : getComputedStyle(pane).backgroundColor,
        violations: window.__cspViolations ?? [],
        emptyHash: styleSrc.includes(${JSON.stringify(EMPTY_STRING_HASH)}),
      };
    })()`)) as TunerVisit['styled'];

    const pane = !debug
      ? NO_PANE
      : viewport === VIEWPORT
        ? await readPane(page)
        : await readPaneAtRest(page);

    const fetched = (await Promise.all(reads)).filter((asset) => asset !== undefined);
    return { fetched, styled, pane, errors };
  } finally {
    await context.close();
  }
}

/**
 * The tuning panel, read off the real pane — one check for each field its view
 * writes (#496, #489).
 *
 * `panel-model.test.ts` holds what the model *says*; `tuning-panel.test.ts` holds
 * the order the view writes in, against a fake of Tweakpane. Neither can see
 * whether the view copied a field at all, or whether Tweakpane drew it, so this
 * does: every check below **changes something after the page is up and reads it
 * again**, because a reading at rest passes whether or not the view copies the
 * field a second time. A field is read as the page renders it: a label's text, a
 * row's `tp-v-disabled` class or its input's `disabled` (never `binding.disabled`,
 * which reads `false` under a disabled folder), a button's `tp-v-hidden`, a
 * select's options, a monitor's text.
 *
 * Presence waits throughout (`until`): each is for a state the check requires,
 * and a view that stops copying a field leaves it unreached, which is the failure.
 *
 * Outside G60 and G61, so it runs on pull requests (ADR-0108).
 */
const TUNING_TITLE = 'Tuning panel';
const SHADOWS_OFF_TITLE = 'real-time shadows are off — nothing here has an effect';
const SHADOWS_ON_TITLE = 'real-time shadow controls';

/** Injected into the page: reads and drives the tuning folder as a visitor would. */
const TUNING_HELPERS = `(() => {
  const folder = (title) => [...document.querySelectorAll('.tp-rotv .tp-fldv')].find((f) => f.querySelector('.tp-fldv_t')?.textContent === title) ?? null;
  const inside = () => folder(${JSON.stringify(TUNING_TITLE)});
  const row = (name) => [...(inside()?.querySelectorAll('.tp-lblv') ?? [])].find((r) => {
    const text = r.querySelector('.tp-lblv_l')?.textContent ?? '';
    return text === name || text.includes(' ' + name + ' · ');
  }) ?? null;
  const read = (name) => {
    const r = row(name);
    if (r === null) return null;
    const input = r.querySelector('select, textarea, input');
    return {
      label: r.querySelector('.tp-lblv_l')?.textContent ?? '',
      disabled: r.classList.contains('tp-v-disabled') || input?.disabled === true,
      value: input?.value ?? '',
      knob: r.querySelector('.tp-sldv_k')?.style.width ?? '',
      options: r.querySelector('select') === null ? [] : [...r.querySelector('select').options].map((o) => o.textContent),
    };
  };
  const button = (title) => [...(inside()?.querySelectorAll('.tp-btnv') ?? [])].find((b) => b.textContent === title) ?? null;
  const fire = (input) => input.dispatchEvent(new Event('change', { bubbles: true }));
  window.__t = {
    folder, row, read, button,
    folderState: (title) => { const f = folder(title); return f === null ? null : { disabled: f.classList.contains('tp-v-disabled') }; },
    hidden: (title) => button(title)?.classList.contains('tp-v-hidden') ?? null,
    buttonText: (title) => button(title)?.textContent ?? null,
    folderTitles: () => [...document.querySelectorAll('.tp-rotv > .tp-rotv_c > .tp-fldv')].map((f) => f.querySelector('.tp-fldv_t')?.textContent ?? ''),
    setNumber: (name, value) => { const i = row(name).querySelector('input'); i.value = String(value); fire(i); },
    choose: (name, value) => { const s = row(name).querySelector('select'); s.value = value; fire(s); },
    toggle: (name) => { row(name).querySelector('input').click(); },
    press: (title) => { button(title).querySelector('button').click(); },
  };
  return folder(${JSON.stringify(TUNING_TITLE)}) !== null;
})()`;

/** A page planted with a number beyond its slider and a name its list does not offer. */
const TUNING_PLANT = { exposure: 5, materials: { woodSpecies: 'walnut' } };

interface TuningRead {
  readonly label: string;
  readonly disabled: boolean;
  readonly value: string;
  /** A slider's knob, as a share of its track: the rendered range. */
  readonly knob: string;
  readonly options: readonly string[];
}

async function checkTuningPanel(browser: Browser, origin: string): Promise<TunerChecked> {
  const lines: string[] = [];
  const failures: string[] = [];
  const fail = (what: string): void => {
    failures.push(`tuning panel: ${what}`);
  };

  const read = async (page: Page, name: string): Promise<TuningRead | null> =>
    (await page.evaluate(`window.__t.read(${JSON.stringify(name)})`)) as TuningRead | null;
  const call = async (page: Page, expression: string): Promise<unknown> =>
    await page.evaluate(`window.__t.${expression}`);
  const wait = async (page: Page, condition: string, what: string): Promise<void> => {
    if (!(await until(page, condition, `the tuning panel: ${what}`))) {
      fail(`never reached: ${what}`);
    }
  };

  const visitPane = async (query: string, run: (page: Page) => Promise<void>): Promise<void> => {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await page.setViewport(VIEWPORT);
      page.on('pageerror', (error: unknown) => {
        fail(`page error at ${query}: ${error instanceof Error ? error.message : String(error)}`);
      });
      await page.goto(`${origin}/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
      // The pane is drawn by a lazy chunk, after the shelf is ready.
      await wait(page, TUNING_HELPERS, 'the folder to be drawn');
      await run(page);
    } finally {
      await context.close();
    }
  };

  /* --- planted: out of range, off the list, and under no tone mapping --------- */

  await visitPane(`?debug=${encodeURIComponent(JSON.stringify(TUNING_PLANT))}`, async (page) => {
    // Label text, value and disabled, at rest.
    const exposure = await read(page, 'exposure');
    if (exposure === null) return fail('no exposure row');
    if (!exposure.label.includes('5 is beyond the usual 0.1–3')) {
      fail(`exposure 5 is not named in its label: "${exposure.label}"`);
    }
    if (!exposure.label.includes('· live') || !exposure.label.includes('🔴')) {
      fail(`exposure under no tone mapping is not a red live row: "${exposure.label}"`);
    }
    if (!exposure.label.includes('pick a tone mapping first')) {
      fail(`exposure's disabled reason is not in its label: "${exposure.label}"`);
    }
    if (Number(exposure.value) !== 5) {
      fail(`exposure 5 shows ${exposure.value}: the slider clamped it`);
    }
    if (!exposure.disabled) fail('exposure is enabled under no tone mapping');

    // List options: the stray value is offered, labelled, and selected.
    const sheet = await read(page, 'woodwork sheet');
    if (
      sheet === null ||
      !sheet.options.includes('walnut — not on the list') ||
      sheet.value !== 'walnut — not on the list'
    ) {
      fail(`the woodwork sheet list does not hold walnut: ${JSON.stringify(sheet)}`);
    }

    // The rebuild button is hidden while nothing waits on a rebuild.
    if ((await call(page, `hidden('rebuild shelf to apply')`)) !== true) {
      fail('the rebuild button is not hidden at rest');
    }

    // A live change: label, disabled, status text.
    await call(page, `choose('tone mapping', 'aces')`);
    await wait(
      page,
      `(() => { const r = window.__t.read('exposure'); return r !== null && !r.disabled && !r.label.includes('pick a tone mapping first'); })()`,
      'exposure enabled once a tone mapping is picked',
    );
    const enabled = await read(page, 'exposure');
    if (enabled !== null && (!enabled.label.includes('🟢') || !enabled.label.includes('beyond'))) {
      fail(`exposure under aces is not a green row still naming 5: "${enabled.label}"`);
    }
    await wait(
      page,
      `(() => { const t = window.__t.read('status')?.value ?? ''; return t.includes('✓') && t.includes('= '); })()`,
      'the status text to report what was applied and what is running',
    );

    // A list drops the stray once a real value is picked.
    await call(page, `choose('woodwork sheet', 'sapele')`);
    await wait(
      page,
      `(() => { const r = window.__t.read('woodwork sheet'); return r !== null && r.value === 'sapele' && !r.options.some((o) => o.includes('not on the list')); })()`,
      'the stray option to leave the list',
    );

    // Monitors: each figure is the shelf's own, read again.
    await wait(
      page,
      `(() => {
        const s = window.__shelf.stats();
        const v = (n) => window.__t.read(n)?.value;
        const fps = v('fps') ?? '';
        return v('draws') === String(s.calls) && v('textures') === String(s.textures)
          && v('tris') === String(s.triangles)
          && v('buffer') === s.bufferWidth + 'x' + s.bufferHeight + ' @' + s.pixelRatio.toFixed(2)
          && (fps === '—' || /^[0-9]+$/.test(fps));
      })()`,
      'the draws, textures, tris, buffer and fps monitors to read the shelf',
    );

    // A rebuild-class change lights the row, shows the button and the status.
    await call(page, `setNumber('cover gloss', 0.5)`);
    await wait(
      page,
      `window.__t.hidden('rebuild shelf to apply') === false && window.__t.read('cover gloss').label.includes('🟡')`,
      'the rebuild button shown and cover gloss pending',
    );
    await wait(
      page,
      `(window.__t.read('status')?.value ?? '').includes('not applied yet')`,
      'the status text to say a rebuild is waiting',
    );

    // A rebuild replaces only the tuning folder, at its index.
    await page.evaluate(`(() => {
      window.__t.folder('Pickup tuner').__kept = true;
      window.__t.folder(${JSON.stringify(TUNING_TITLE)}).__old = true;
      window.__shelf.__old = true;
    })()`);
    await call(page, `press('rebuild shelf to apply')`);
    await wait(
      page,
      `window.__shelf?.ready === true && window.__shelf.__old !== true && window.__t.read('cover gloss')?.label.includes('🟢')`,
      'the rebuilt shelf, and cover gloss caught up',
    );
    const after = (await page.evaluate(`(() => ({
      titles: window.__t.folderTitles(),
      tunerKept: window.__t.folder('Pickup tuner')?.__kept === true,
      tuningNew: window.__t.folder(${JSON.stringify(TUNING_TITLE)})?.__old !== true,
      hidden: window.__t.hidden('rebuild shelf to apply'),
      gloss: window.__t.read('cover gloss')?.value,
      exposure: window.__t.read('exposure')?.value,
    }))()`)) as {
      titles: string[];
      tunerKept: boolean;
      tuningNew: boolean;
      hidden: boolean | null;
      gloss: string | undefined;
      exposure: string | undefined;
    };
    if (after.titles.join('|') !== `Pickup tuner|${TUNING_TITLE}`) {
      fail(`after a rebuild the pane holds ${after.titles.join(' | ')}`);
    }
    if (!after.tunerKept) fail("a rebuild replaced the pickup tuner's folder");
    if (!after.tuningNew) fail('a rebuild kept the old tuning folder');
    if (after.hidden !== true) fail('the rebuild button is still shown after the rebuild');
    if (Number(after.gloss) !== 0.5)
      fail(`cover gloss reads ${String(after.gloss)} after a rebuild`);
    if (Number(after.exposure) !== 5)
      fail(`exposure reads ${String(after.exposure)} after a rebuild`);

    // Copy settings: the button says so, then goes back.
    await call(page, `press('copy settings JSON')`);
    await wait(
      page,
      `window.__t.buttonText('copied — paste into shelf-settings.ts') !== null`,
      'the copy button to say copied',
    );
    await wait(
      page,
      `window.__t.buttonText('copy settings JSON') !== null`,
      'the copy button to go back',
    );

    // Reset: every control resynced, the shrunk range's float step ignored, and
    // the address back to bare `?debug` — an echo applied as an edit would leave
    // a diff in it.
    await call(page, `press('reset to shipped defaults')`);
    await wait(
      page,
      `(() => { const r = window.__t.read('exposure'); return r !== null && Number(r.value) === 1 && r.disabled && r.label.includes('pick a tone mapping first'); })()`,
      'exposure back to 1 and disabled after a reset',
    );
    // The stretched range is gone: a 1 on a 0.1–3 track sits a third of the way
    // along, where on the 0.1–5 track it was planted on it sits a fifth.
    const reset = await read(page, 'exposure');
    if (reset === null || Math.abs(parseFloat(reset.knob) - ((1 - 0.1) / (3 - 0.1)) * 100) > 1) {
      fail(
        `after a reset exposure's knob is at ${reset?.knob ?? '(no row)'}, so its range did not shrink back`,
      );
    }
    const url = decodeURIComponent((await page.evaluate('location.search')) as string);
    if (url !== '?debug') fail(`after a reset the address is "${url}", not "?debug"`);
    lines.push(
      'tuning panel   exposure 5 and walnut planted: label, value, disabled, options, status, monitors, rebuild, copy, reset',
    );
  });

  /* --- the shadows folder: its title, its disabled state, and the way back ---- */

  await visitPane('?debug&shadows=0', async (page) => {
    const folderOff = (await call(page, `folderState(${JSON.stringify(SHADOWS_OFF_TITLE)})`)) as {
      disabled: boolean;
    } | null;
    if (folderOff === null) return fail('no shadows folder titled with the reason it is off');
    if (!folderOff.disabled) fail('the shadows folder is enabled while real-time shadows are off');
    const filter = await read(page, 'filter');
    if (
      filter === null ||
      !filter.disabled ||
      !filter.label.includes('real-time shadows are off')
    ) {
      fail(`a row in the off folder is not disabled with its reason: ${JSON.stringify(filter)}`);
    }
    const realTime = await read(page, 'real-time');
    if (realTime === null || realTime.disabled) {
      fail('the real-time switch is disabled with the folder it re-enables');
    }

    await call(page, `toggle('real-time')`);
    await wait(
      page,
      `window.__t.folderState(${JSON.stringify(SHADOWS_ON_TITLE)})?.disabled === false`,
      'the shadows folder retitled and enabled',
    );
    await wait(
      page,
      `window.__t.read('filter') !== null && !window.__t.read('filter').disabled`,
      'a row in the shadows folder enabled',
    );
    lines.push('tuning panel   shadows=0: folder title, folder and row disabled, the way back');
  });

  return { lines, failures };
}

function report(result: {
  /** Which checks this run left out, and so what its `OK` does not cover. */
  skipped: string | undefined;
  bookCount: number;
  bookcaseOverflow: number;
  stats: Stats;
  cost: ShelfCost;
  errors: string[];
  pickup: PickupRead | undefined;
  viewer: ViewerRead | undefined;
  phone: PhoneRead | undefined;
  spread: SpreadChecked;
  atRest: AtRestChecked;
  lit: LitChecked;
  fallback: FallbackChecked;
  sampling: SamplingChecked;
  tuner: TunerChecked;
  tuning: TunerChecked;
}): void {
  const {
    skipped,
    bookCount,
    bookcaseOverflow,
    stats,
    cost,
    errors,
    pickup,
    viewer,
    phone,
    spread,
    atRest,
    lit,
    fallback,
    sampling,
    tuner,
    tuning,
  } = result;
  const failures: string[] = [
    ...fallback.failures,
    ...sampling.failures,
    ...tuner.failures,
    ...tuning.failures,
  ];
  // Fails closed: a run that skipped nothing must have run both, so a flagless
  // run that left them out cannot print `OK` on the strength of empty results.
  if (skipped === undefined) {
    if (fallback.lines.length === 0) failures.push('G60 ran no cases');
    if (sampling.lines.length === 0) failures.push('G61 ran no pages');
  }

  const per = (total: number): string => (bookCount === 0 ? '—' : (total / bookCount).toFixed(2));

  console.log(`canvas            ${stats.size}`);
  console.log(`books rendered    ${bookCount}`);
  console.log(`bookcase overflow ${bookcaseOverflow.toFixed(4)}`);
  console.log(`distinct colours  ${stats.distinctColours}`);
  console.log(`non-background    ${stats.nonBackgroundPct.toFixed(1)}%`);
  console.log(
    `textures          ${cost.textures}   geometries ${cost.geometries}   programs ${cost.programs}`,
  );
  console.log(`draws             ${cost.calls} (${per(cost.calls)}/book)   tris ${cost.triangles}`);
  console.log(`book picked up    ${pickup?.held ?? 'NO'}`);
  if (pickup !== undefined) {
    console.log(`page reading line ${pickup.reading || 'NONE'}`);
    console.log(
      `page links        ${String(pickup.linkCount)} (${String(pickup.markCount)} marks)   object line ${
        pickup.hasObjectLine ? 'yes' : 'no'
      }`,
    );
    console.log(`page announced    ${pickup.announced || 'NOTHING'}`);
    console.log(`second book       ${pickup.second.announced || 'NOTHING'}`);
    console.log(
      `address           ${pickup.hrefUnchanged && pickup.afterPutBack.hrefUnchanged ? 'unchanged' : 'CHANGED'}   ` +
        `put back ${pickup.afterPutBack.held ? 'LEFT IT HELD' : 'yes'}`,
    );
  }
  console.log(
    `examining         ${
      viewer === undefined
        ? 'NOT CHECKED'
        : `${viewer.opened ? 'opens' : 'DOES NOT OPEN'}   board ${
            viewer.closedAngle === undefined
              ? 'NOT READ'
              : `${viewer.closedAngle.toFixed(1)}° from closed`
          }   drag ${viewer.turned ? 'turns' : 'DOES NOT TURN'}   arrow ${
            viewer.keyTurned ? '15°' : 'NOT 15°'
          }   escape ${viewer.escapeClosedViewer ? 'leaves it' : 'DOES NOT LEAVE IT'}${
            viewer.heldAfterEscape ? ', book still held' : '   AND PUT THE BOOK BACK'
          }   tap ${viewer.leftByTap ? 'leaves' : 'DOES NOT LEAVE'}   button ${
            viewer.leftByButton ? 'leaves' : 'DOES NOT LEAVE'
          }   focus ${viewer.focusReturned ? 'returns' : 'LOST'}   reduced motion ${
            viewer.reducedCuts ? 'cuts' : 'TWEENS'
          }   held copy ${
            viewer.held === undefined ? 'none named' : viewer.showedHeld ? 'worn' : 'NOT WORN'
          }   without one ${
            viewer.withoutHeld === undefined
              ? 'NOT FOUND'
              : viewer.withoutHeld.showedOwn
                ? 'wears its own'
                : 'DOES NOT WEAR ITS OWN'
          }   no cover ${
            viewer.coverlessOpens === undefined
              ? 'NOT FOUND'
              : viewer.coverlessOpens
                ? 'examines'
                : 'DOES NOT'
          }   failed copy ${viewer.fellBack ? 'falls back' : 'DOES NOT FALL BACK'}   fetched ${
            viewer.fetchedNothing ? 'nothing new' : 'SOMETHING'
          }   paths ${
            viewer.pathInPage ? 'WRITTEN INTO THE PAGE' : 'kept off the page'
          }   emptied hand ${viewer.emptiedCloses ? 'closes it' : 'LEAVES IT OPEN'}`
    }`,
  );
  console.log(
    `page at 375x812   ${
      phone === undefined
        ? 'NOT CHECKED'
        : `in view ${phone.pageInView ? 'yes' : 'NO'}   title leads ${
            phone.titleLeads ? 'yes' : 'NO'
          }   put-back on screen ${phone.putBackInView ? 'yes' : 'NO'}`
    }`,
  );
  console.log('open spread at rest, 1280x800 (§3.6)');
  for (const line of spread.lines) console.log(`  ${line}`);
  console.log('held page at rest, long Thoughts planted (#426)');
  for (const line of atRest.lines) console.log(`  ${line}`);
  const above = (page: Lighting): string => {
    const standing = page.bookcase - page.room;
    // -0.004 is no contrast at all; `-0.0` would read as a sign.
    const shown = (Math.abs(standing) < 0.05 ? 0 : standing).toFixed(1);
    return `${shown} above the room (${page.bookcase.toFixed(1)} on ${page.room.toFixed(1)})`;
  };
  const books = (count: number): string => `${String(count)} books`.padEnd(10);
  console.log(`lit (G59)         control   ${books(lit.controlBooks)} ${above(lit.control)}`);
  console.log(`                  large     ${books(lit.largeBooks)} ${above(lit.large)}`);
  console.log(
    `                  planted   ${books(lit.largeBooks)} ${above(lit.planted)}   (the fog pulled over it)`,
  );
  if (skipped === undefined) {
    console.log(`context loss (G60), each case in a browser context of its own`);
    for (const line of fallback.lines) console.log(`  ${line}`);
    console.log(
      `shadow-map readers (G61), budget ${String(BUDGET)} sampling draws a frame, each page in a ` +
        'browser context of its own',
    );
    for (const line of sampling.lines) console.log(`  ${line}`);
  } else {
    // Said where the lines would be, so a reader of a pull request's log cannot
    // take a green run for one that observed them.
    console.log(`skipped on pull requests: ${skipped} (run after merge and at deploy)`);
  }
  console.log('pickup tuner, each page in a browser context of its own');
  for (const line of tuner.lines) console.log(`  ${line}`);
  console.log('tuning panel, each page in a browser context of its own');
  for (const line of tuning.lines) console.log(`  ${line}`);
  console.log('step times');
  for (const { label, seconds } of TIMINGS) {
    console.log(`  ${label.padEnd(40)} ${seconds.toFixed(1).padStart(6)} s`);
  }
  if (VISITS.count > 0) {
    console.log(
      `  of which visit() boots: ${String(VISITS.count)}, ` +
        `${VISITS.toReady.toFixed(1)} s to ready + ${VISITS.toSettled.toFixed(1)} s to settled`,
    );
  }
  if (SAMPLING_BOOTS.count > 0) {
    console.log(
      `  of which G61 boots: ${String(SAMPLING_BOOTS.count)}, ` +
        `${SAMPLING_BOOTS.toReady.toFixed(1)} s to ready + ` +
        `${SAMPLING_BOOTS.toSettled.toFixed(1)} s to settled`,
    );
  }
  console.log(`screenshot        ${OUTPUT}`);

  // G35 (`enhanced-card`), reworded: see `lib/pickup-gate.ts`.
  if (pickup === undefined) {
    failures.push('clicking a book did not pick it up');
  } else {
    failures.push(...pickupFailures(pickup));
  }
  failures.push(
    ...viewerFailures(viewer),
    ...phoneFailures(phone),
    ...spread.failures,
    ...atRest.failures,
  );
  // Books inside their own bookcase.
  //
  // The owner found this twice by eye on a phone: a leaning book's bottom corner
  // driven into the face-out book beside it, and a row's first book driven into
  // the bookcase's own side. The layout cursor advances by a book's *thickness*, and
  // a book rotated about its centre is wider than that, so nothing in the
  // arithmetic could notice. This measures the real world bounds instead.
  //
  // Tolerance, and where it comes from. A book's printed cover and spine float
  // `SKIN` (0.0012) above their boards, so every book's true bounds exceed the
  // thickness the layout advances by, by exactly that — 0.03cm at shelf scale,
  // and not a collision. The bar sits above that and far below a real breach:
  // removing the lean clearance was measured at 0.0203, and the theoretical
  // worst is 0.03, a whole thin book.
  if (bookcaseOverflow > 0.005) {
    failures.push(
      `a book breaks out through the side of the bookcase by ${bookcaseOverflow.toFixed(4)} ` +
        '(about ' +
        (bookcaseOverflow * 24).toFixed(1) +
        'cm at shelf scale)',
    );
  }

  const expected = expectedBookCount(LIBRARY);
  if (bookCount !== expected) {
    failures.push(`expected ${expected} books on the shelf, got ${bookCount}`);
  }
  if (stats.nonBackgroundPct < 10) {
    failures.push(`only ${stats.nonBackgroundPct.toFixed(1)}% of the canvas is not background`);
  }
  if (stats.distinctColours < 40) {
    failures.push(`only ${stats.distinctColours} distinct colours — the shelf looks blank`);
  }
  // G59 (`large-library-lit`). See `lib/large-library-lit.ts`.
  failures.push(...lit.failures.map((failure) => `G59: ${failure}`));
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
 * Builds the site; `serveDist` then serves `dist/` from this process, so the
 * gate screenshots what actually ships.
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
  // G59's and G61's large library, staged beside the build rather than into it.
  await run('pnpm', ['fixtures:50', '--books', String(LARGE_BOOKS)]);
  await run('pnpm', [
    'stacks',
    'build',
    '--public',
    '--vault',
    `fixtures/vault-${String(LARGE_BOOKS)}`,
    '--assets',
    LARGE_ASSETS,
  ]);
  await run('pnpm', ['--filter', '@stacks/site', 'run', 'build']);
}

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) {
    throw new Error(`no Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  }
  return found;
}

await main();
