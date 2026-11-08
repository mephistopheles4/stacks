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
import { toRows, type ShelfBook } from '../packages/site/src/shelf/books.ts';
// Value imports, and safe ones: both modules are pure data and arithmetic with
// no `three` and no DOM at module scope, so the gate reads the same key, wait
// and default the page does rather than a copy that could drift from them.
import { FALLBACK_KEY, RESTORE_WAIT_MS } from '../packages/site/src/shelf/shadow-fallback.ts';
import { DEFAULT_SETTINGS } from '../packages/site/src/shelf/shelf-settings.ts';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer-core';
import {
  foreignRequests,
  gateBuildEnv,
  judgeAnalyticsCalls,
  type Attempt,
} from './lib/analytics-gate.ts';
import { lightingOf, litFailures, type Frame, type Lighting } from './lib/large-library-lit.ts';
import {
  CLOSED_HINT,
  TEMPLATE_HINT,
  controlsFailures,
  drawerFailures,
  lostFailures,
  phoneFailures,
  pickupFailures,
  overlapFailures,
  OVERLAP_READS,
  spreadFailures,
  turnFailures,
  type ClosedFraming,
  type CloseRead,
  type DrawerCell,
  type OpenFraming,
  type OverlapRead,
  type ViewportControls,
  type ClosedRead,
  type ControlsRead,
  type LostCase,
  type PhoneRead,
  type PickupRead,
  type PutDown,
  type SpreadRead,
  CLOSED_TOLERANCE_DEG,
  type TurnRead,
  arrowFailures,
  atRestFailures,
  type ArrowPlace,
  type Box,
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

/**
 * The one way an on build reaches this gate: sets the switch to the production
 * host for the build child and nothing else (docs/spec/optional-plausible.md
 * S5, X6). Without it the variable is removed, whatever the parent holds.
 */
const ANALYTICS_ON_FLAG = '--analytics-on';
const SKIPPED_ON_PULL_REQUESTS = 'G60, G61';

function readArgs(argv: readonly string[]): { pullRequest: boolean; analyticsOn: boolean } {
  const unknown = argv.filter((arg) => arg !== PULL_REQUEST_FLAG && arg !== ANALYTICS_ON_FLAG);
  if (unknown.length > 0) {
    console.error(
      `smoke:render: unknown argument ${unknown.map((arg) => JSON.stringify(arg)).join(', ')}. ` +
        `The flags are ${PULL_REQUEST_FLAG} and ${ANALYTICS_ON_FLAG}.`,
    );
    process.exit(1);
  }
  return {
    pullRequest: argv.includes(PULL_REQUEST_FLAG),
    analyticsOn: argv.includes(ANALYTICS_ON_FLAG),
  };
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
  const { pullRequest, analyticsOn } = readArgs(process.argv.slice(2));
  mkdirSync(ARTIFACTS, { recursive: true });

  await timed('build the site (fixtures and astro)', () => buildSite(analyticsOn));
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
        // The turn's fallback probe refuses held copies on purpose; only
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
      const turn = await timed('turning the closed book', () => checkTurn(page));
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
      const controls = await timed('G35 closed book controls', () =>
        checkClosedControls(browser, origin),
      );
      const drawerCells = await timed('G35 drawer cells', () => checkDrawerCells(browser, origin));
      const overlap = await timed('G35 overlap', () => checkOverlap(browser, origin));
      const lost = await timed('G35 lost context, book held', () =>
        checkLostWithBookHeld(browser, origin),
      );
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
      const readout = await timed('black box readout', () => checkReadout(browser, origin));
      const analytics = await timed('analytics calls (C8, C11)', () =>
        checkAnalyticsCalls(browser, origin, analyticsOn),
      );
      const notices = await timed('G35 notices (#536)', () => checkNoticePages(browser, origin));
      const noticeModal = await timed('G35 notice modal (#536)', () =>
        checkNoticeModal(browser, origin, notices.types),
      );
      const noticeOver = await timed('G35 notice over the drawer (#536)', () =>
        checkNoticeOverDrawer(browser, origin),
      );

      report({
        skipped: pullRequest ? SKIPPED_ON_PULL_REQUESTS : undefined,
        bookCount: Number(bookCount),
        bookcaseOverflow: Number(bookcaseOverflow),
        stats,
        cost,
        errors,
        pickup,
        turn,
        phone,
        spread,
        atRest,
        controls,
        drawerCells,
        overlap,
        lost,
        lit,
        fallback,
        sampling,
        tuner,
        tuning,
        readout,
        analytics,
        notices,
        noticeModal,
        noticeOver,
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
 * In the hand and past the lift. A picked-up book arrives **closed** (#531), so
 * right after a pickup this is the closed rest; it is also true while the book
 * opens. `HELD_OPEN` is the visitor having opened it, at rest: a check that reads
 * the pages, the spread or the Thoughts waits on that.
 */
const HELD = `window.__shelf.held()?.phase === 'held'`;
const HELD_OPEN = `window.__shelf.held()?.phase === 'held' && window.__shelf.held()?.opened === true`;
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
/**
 * The closed book at rest, read before anything opens it (#531): the board lies
 * flat to the block in the scene, the pages are hidden from sight and from the
 * accessibility tree, the X is on screen, and the hint and the Open button say
 * what a visitor can do.
 */
const READ_CLOSED = `(() => {
  const held = window.__shelf.held();
  const pages = [...document.querySelectorAll('.held-page')];
  const x = document.querySelector('.held-controls .held-put-back');
  const open = document.querySelector('.held-controls .held-open');
  const box = x?.getBoundingClientRect();
  return {
    boardAngle: held?.boardAngle ?? 90,
    opened: held?.opened ?? true,
    pagesHidden: pages.length === 2 && pages.every((page) => page.style.visibility === 'hidden'),
    xOnScreen: Boolean(box) && !x.closest('[hidden]') && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
    hint: document.getElementById('shelf-hint')?.textContent ?? '',
    openName: open && !open.hidden ? (open.textContent ?? '').trim() : '',
    title: held?.title ?? '',
  };
})()`;

const READ_PAGE = `(() => {
  const right = document.querySelector('.held-page-right');
  const left = document.querySelector('.held-page-left');
  const pages = [...document.querySelectorAll('.held-page')];
  const links = right ? [...right.querySelectorAll('.card-links a')] : [];
  const putBack = document.querySelector('.held-controls .held-put-back');
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

/**
 * G35 (`enhanced-card`), reworded for picking a book up — the browser half.
 *
 * Clicks a real book through its projected point, as a reader would, and
 * reads what the page did: the held state and the book's pages, the
 * announcer, the history entry, and `location.href`, which must not move
 * (spec §3.9). Then a second book, then the put-back control. Every judgement
 * is `lib/pickup-gate.ts`'s, planted red in its own spec. Polls the shelf's
 * own read-back rather than sleeping: a pickup reaches the closed rest in about
 * 0.9 s and opening takes 0.6 s more, and a put back then a pickup about 2 s.
 */
async function checkPickup(page: Page): Promise<PickupRead | undefined> {
  const href = (await page.evaluate('location.href')) as string;
  const sameHref = async (): Promise<boolean> => (await page.evaluate('location.href')) === href;

  await page.evaluate(WATCH_PAGES);
  const first = await clickToPickUp(page, 'window.__shelf.held() !== undefined');
  if (first === undefined) return undefined;
  if (!(await until(page, HELD, 'the clicked book to come to rest held, closed'))) {
    return undefined;
  }
  const closed = (await page.evaluate(READ_CLOSED)) as ClosedRead;
  // A real click on the held book opens it: the closed book is framed at the
  // centre of the screen. Nothing else opens it, and the address must not move.
  const size = (await page.evaluate('({ w: innerWidth, h: innerHeight })')) as {
    w: number;
    h: number;
  };
  await page.mouse.click(size.w / 2, size.h / 2);
  if (!(await until(page, HELD_OPEN, 'a click on the held book to open it'))) return undefined;
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
    | 'closed'
    | 'hiddenBeforeFade'
    | 'hrefUnchanged'
    | 'focusUnmoved'
    | 'focusCaught'
    | 'focusCaughtOpen'
    | 'afterEscapeOpen'
    | 'thoughtsShown'
    | 'second'
    | 'afterPutBack'
    | 'afterEscape'
    | 'afterBack'
    | 'afterBackOpen'
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
    putBack: Boolean(document.querySelector('.held-controls .held-put-back')) && !document.querySelector('.held-controls')?.hidden,
    pages: document.querySelectorAll('.held-page').length,
  }))()`)) as PickupRead['second'];

  // The X, pressed with the second book closed in the hand: put back from closed.
  await page.click('.held-controls .held-put-back');
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
  // Then focus the X, as a keyboard reader would (a link on a hidden page cannot
  // take focus), and leave by Escape: the X hides under it, so focus must be
  // caught on the canvas.
  await page.evaluate(`document.querySelector('.held-controls .held-put-back')?.focus()`);
  await page.keyboard.press('Escape');
  const afterEscape = await putDown(page, sameHref);
  const focusCaught = (await page.evaluate(
    `document.activeElement === document.getElementById('shelf-canvas')`,
  )) as boolean;

  // The same from an open book, with focus on a link of its page.
  await page.evaluate(`window.__shelf.pickUp(${String(first)})`);
  if (!(await until(page, HELD, 'the book to come to rest held, before the open focus read'))) {
    return undefined;
  }
  if (!(await openBook(page, 'the book for the open focus read'))) return undefined;
  await page.evaluate(`document.querySelector('.held-page-right .card-links a')?.focus()`);
  await page.keyboard.press('Escape');
  const afterEscapeOpen = await putDown(page, sameHref);
  const focusCaughtOpen = (await page.evaluate(
    `document.activeElement === document.getElementById('shelf-canvas')`,
  )) as boolean;

  await page.evaluate(`window.__shelf.pickUp(${String(first)})`);
  if (!(await until(page, HELD, 'the book to come to rest held, before the back button'))) {
    return undefined;
  }
  await page.evaluate('history.back()');
  const afterBack = await putDown(page, sameHref);

  // And the back button from an open book.
  await page.evaluate(`window.__shelf.pickUp(${String(first)})`);
  if (!(await until(page, HELD, 'the book to come to rest held, before the open back button'))) {
    return undefined;
  }
  if (!(await openBook(page, 'the book for the open back button'))) return undefined;
  await page.evaluate('history.back()');
  const afterBackOpen = await putDown(page, sameHref);

  const thoughtsShown = await checkThoughtsShown(page);

  return {
    ...read,
    closed,
    hiddenBeforeFade,
    hrefUnchanged,
    focusUnmoved,
    focusCaught,
    focusCaughtOpen,
    afterEscapeOpen,
    thoughtsShown,
    second,
    afterPutBack,
    afterEscape,
    afterBack,
    afterBackOpen,
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
  // Opened first: a closed book's pages are hidden, and Thoughts in hidden pages
  // are not read by anyone. The page must be visible, not only filled.
  if (!(await openBook(page, 'the Thoughts book'))) {
    await putBackAndSettle(page);
    return false;
  }
  const shown = await until(
    page,
    `(() => { const right = document.querySelector('.held-page-right'); const slot = right?.querySelector('.held-thoughts'); return right?.style.visibility === 'visible' && Boolean(slot) && !slot.hidden && slot.querySelectorAll('p').length >= 2; })()`,
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

/**
 * Opens the book in hand through the shelf's hook, and waits for it to be open
 * at rest. The hook, not a click, so a check need not aim; `checkPickup` and
 * `checkClosedControls` open by a real click, which keeps the gesture covered.
 */
async function openBook(page: Page, what: string): Promise<boolean> {
  await page.evaluate('window.__shelf.open()');
  return until(page, HELD_OPEN, `${what} to open`);
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
 * The closed book in the hand, turned and closed again (#553): that it lands
 * closed, that a drag on the canvas turns it, that a tap opens it square, that the
 * open book's two controls close it back to the closed rest, that it wears the
 * held copy, and that every way out puts it back. Books are picked up through the
 * shelf's hook here; the click path is `checkPickup`'s.
 */
async function checkTurn(page: Page): Promise<TurnRead | undefined> {
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

  let withHeld: Turned | undefined;
  let withoutHeld: Turned | undefined;
  /**
   * The one turn that also went by every way out and emptied the hand. The book
   * picked for it is whichever came first, so its reading is carried through
   * rather than taken from whichever book is reported as primary.
   */
  let fullReading: Turned | undefined;
  let fellBack = false;
  let pathInPage = false;
  let coverlessArrivesClosed: boolean | undefined;
  let coverlessCloses: boolean | undefined;
  let noDialog = true;
  let xDescription: string | undefined;
  const books = Number(await page.evaluate('window.__shelf.bookCount'));
  // A presence timeout ends the loop: another 41 books at 30 s each would run the
  // job out of its time before the report prints. What it gathered is judged as
  // it stands, and anything it did not reach fails as not found.
  const timeoutsBefore = presenceTimeouts;
  for (let index = 0; index < books && presenceTimeouts === timeoutsBefore; index += 1) {
    const covered = withHeld !== undefined && withoutHeld !== undefined;
    if (covered && coverlessCloses !== undefined) break;
    await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
    if (!(await until(page, CLOSED_AT_REST, `book ${String(index)} to come to rest held`))) break;
    // The board on arrival, before anything opens it (C1, kept for a coverless book below).
    const arrivalAngle = (await page.evaluate('window.__shelf.held()?.boardAngle')) as number;
    const title = (await page.evaluate('window.__shelf.held()?.title')) as string | undefined;
    const expected = title === undefined ? undefined : coverFor.get(title);
    if (xDescription === undefined) {
      const seen = (await page.evaluate(READ_DESCRIPTION)) as { noDialog: boolean; text: string };
      noDialog = seen.noDialog;
      xDescription = seen.text;
    }
    const hasControl = (await page.evaluate(
      `document.querySelector('${CLOSE_CONTROL}') !== null`,
    )) as boolean;
    const wanted =
      title !== undefined &&
      expected !== undefined &&
      (expected.held === undefined ? withoutHeld === undefined : withHeld === undefined);
    if (
      hasControl &&
      title !== undefined &&
      coverless.has(title) &&
      coverlessCloses === undefined
    ) {
      coverlessArrivesClosed = Math.abs(arrivalAngle) <= CLOSED_TOLERANCE_DEG;
      coverlessCloses = await closesCoverless(page);
    } else if (hasControl && wanted) {
      // No attribute anywhere on the pages may carry a cover path (#416).
      pathInPage ||=
        (await page.evaluate(`[...document.querySelectorAll('.held-page, .held-page *')]
        .some((node) => [...node.attributes].some((attribute) => /covers\\//.test(attribute.value)))`)) as boolean;
      if (expected.held !== undefined) {
        await putBackAndSettle(page);
        fellBack = await wearsShelfCopyWhenRefused(page, index, title);
        await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
        await until(page, CLOSED_AT_REST, `book ${String(index)} to come to rest held, to turn`);
      }
      const checked = await turnOne(page, index, expected.held, fullReading === undefined);
      fullReading ??= checked;
      if (expected.held === undefined) withoutHeld = checked;
      else withHeld = checked;
    }
    await putBackAndSettle(page);
  }
  const primary = withHeld ?? withoutHeld;
  if (primary === undefined) return undefined;
  // The weakest close of the books turned, so one book that fails to close is not
  // hidden behind another that does.
  const weakest = (pick: (turned: Turned) => CloseRead): CloseRead => {
    const reads = [withHeld, withoutHeld].flatMap((turned) =>
      turned === undefined ? [] : [pick(turned)],
    );
    return reads.find((read) => closeFailureCount(read) > 0) ?? pick(primary);
  };
  return {
    held: primary.held,
    showedHeld: primary.showedHeld,
    fetchedNothing: primary.fetchedNothing,
    closeArrow: weakest((turned) => turned.closeArrow),
    closeFoot: weakest((turned) => turned.closeFoot),
    turned: fullReading?.turned ?? false,
    keyTurned: fullReading?.keyTurned ?? false,
    tapOpensSquare: fullReading?.tapOpensSquare ?? false,
    wobbleKeepsHold: fullReading?.wobbleKeepsHold ?? false,
    escapeFromClosed: fullReading?.escapeFromClosed ?? false,
    escapeFromOpen: fullReading?.escapeFromOpen ?? false,
    escapeMidClose: fullReading?.escapeMidClose ?? false,
    reducedCuts: fullReading?.reducedCuts ?? false,
    backMidClose: fullReading?.backMidClose ?? false,
    returned: fullReading?.returned,
    withoutHeld: withoutHeld === undefined ? undefined : { showedOwn: withoutHeld.showedOwn },
    coverlessArrivesClosed,
    coverlessCloses,
    fellBack,
    pathInPage,
    noDialog,
    xDescription: xDescription ?? '',
  };
}

/** How many ways a close read goes wrong, for picking the weakest of several. */
function closeFailureCount(read: CloseRead): number {
  return [
    read.boardAngle === undefined || Math.abs(read.boardAngle) > CLOSED_TOLERANCE_DEG,
    !read.atClosedRest,
    !read.pagesHidden,
    !read.focusOnX,
    !read.turnable,
  ].filter(Boolean).length;
}

/** One book's turn: the reading of what it did, and whether it wore its own cover. */
type Turned = Pick<
  TurnRead,
  | 'held'
  | 'showedHeld'
  | 'fetchedNothing'
  | 'closeArrow'
  | 'closeFoot'
  | 'turned'
  | 'keyTurned'
  | 'tapOpensSquare'
  | 'wobbleKeepsHold'
  | 'escapeFromClosed'
  | 'escapeFromOpen'
  | 'escapeMidClose'
  | 'reducedCuts'
  | 'backMidClose'
  | 'returned'
> & {
  readonly showedOwn: boolean;
};

const X_BUTTON = '#held-put-back';
/** The back arrow: in the left page on a wide window, sticky on the right one on a phone. */
const CLOSE_CONTROL = '.held-close';
const CLOSE_FOOT_CONTROL = '.held-page-right .held-close-foot';

/** The closed rest a pickup lands on, or a close returns to: held, not open, Open showing. */
const CLOSED_AT_REST = `window.__shelf.held()?.phase === 'held' && window.__shelf.held()?.opened === false && document.querySelector('.held-open')?.hidden === false`;

/**
 * No dialog on the page but the notice modal's, and what the X is described by. (#536: the notice
 * modal is a different thing from the closed book's modal view that #553 retired.)
 */
const READ_DESCRIPTION = `(() => {
  const buttons = [...document.querySelectorAll('button')];
  const back = buttons.some((b) => /back to the page/i.test((b.getAttribute('aria-label') ?? '') + ' ' + (b.textContent ?? '')));
  const x = document.querySelector('${X_BUTTON}');
  const described = (x?.getAttribute('aria-describedby') ?? '').split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '');
  return { noDialog: document.querySelector('dialog:not(#notice-dialog)') === null && !back, text: described.join(' ').replace(/\\s+/g, ' ').trim() };
})()`;

/**
 * Time for a wrong put-back to have registered, so that the book still being held
 * means something. An **absence** wait (K1, K2), fixed on purpose: a put-back
 * started by an exit goes through the history, a moment later.
 * ⚠️ A slower runner can only make this weaker, never flaky: a put-back that
 * arrives after the wait is missed and the check passes. That residual is
 * accepted.
 */
const PUT_BACK_CHANCE_MS = 200;

/** The book's turn in degrees, as the shelf reads it. */
async function turnOf(page: Page): Promise<{ yaw: number; pitch: number }> {
  return (await page.evaluate('window.__shelf.held()?.turn')) as { yaw: number; pitch: number };
}

/**
 * Closes the open book with one of its two controls, pressed by the keyboard
 * (a press on it lands through the click path), and reads where that left it:
 * the closed rest, the pages hidden, focus on the X, and a key that still turns it.
 */
async function closeBy(page: Page, selector: string): Promise<CloseRead> {
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.focus()`);
  await page.keyboard.press('Enter');
  const atClosedRest = await until(
    page,
    `${CLOSED_AT_REST} && Math.abs(window.__shelf.held().boardAngle) <= ${String(CLOSED_TOLERANCE_DEG)}`,
    `${selector} to close the book`,
  );
  if (!atClosedRest) {
    return {
      boardAngle: undefined,
      atClosedRest,
      pagesHidden: false,
      focusOnX: false,
      turnable: false,
    };
  }
  const boardAngle = (await page.evaluate('window.__shelf.held()?.boardAngle')) as number;
  // The pages hide with the rest or a moment after it: a short search, not a wait on a miss.
  const pagesHidden = await searchFor(
    page,
    `(() => { const pages = [...document.querySelectorAll('.held-page')]; return pages.length === 2 && pages.every((page) => page.style.visibility === 'hidden'); })()`,
    3000,
  );
  const focusOnX = (await page.evaluate(
    `document.activeElement === document.querySelector('${X_BUTTON}')`,
  )) as boolean;
  // Turnable again: an arrow key from the X, where focus now is.
  const before = await turnOf(page);
  await page.keyboard.press('ArrowRight');
  const after = await turnOf(page);
  await page.keyboard.press('Home');
  return {
    boardAngle,
    atClosedRest,
    pagesHidden,
    focusOnX,
    turnable: Math.abs(after.yaw - before.yaw) > 1,
  };
}

/** Waits for the hand to be empty and the pickup's history entry gone. */
async function awayAndSettled(page: Page, what: string): Promise<boolean> {
  return until(page, `${NOTHING_HELD} && !(history.state && history.state.pickup)`, what);
}

/**
 * Picks the book up again and waits for it at the closed rest, then opens it,
 * for a check that starts from an open book.
 */
async function pickAndOpen(page: Page, index: number, what: string): Promise<boolean> {
  await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
  // The pages are put in the document by the next frame, as `holdClosed` waits for.
  const rested = await until(
    page,
    `${CLOSED_AT_REST} && document.querySelectorAll('.held-page').length === 2`,
    `${what} to come to rest held`,
  );
  return rested && (await openBook(page, what));
}

/**
 * Turns the held book once and reads everything it must do. `full` adds the
 * checks that are about the turn and the ways out, not about the cover — the drag,
 * the keys, the tap, Escape from each state, reduced motion, the back button and
 * the return — which one book is enough to show.
 */
async function turnOne(
  page: Page,
  index: number,
  held: string | undefined,
  full: boolean,
): Promise<Turned> {
  // Turning fetches nothing new: the covers are on the book already. Counted
  // from the first drag, once the held copy has landed, to the last close.
  if (held !== undefined) {
    await until(page, 'window.__shelf.held()?.cover === "held"', 'the held copy to land');
  }
  const fetched: string[] = [];
  const onRequest = (request: HTTPRequest): void => {
    const path = new URL(request.url()).pathname;
    if (/^\/(held-)?covers\//.test(path)) fetched.push(path);
  };
  page.on('request', onRequest);
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
  let tapOpensSquare = true;
  let wobbleKeepsHold = true;
  if (full) {
    const box = (await page.evaluate(`({ w: window.innerWidth, h: window.innerHeight })`)) as {
      w: number;
      h: number;
    };
    const before = await turnOf(page);
    // A real drag on the canvas: press at the book, across, then down.
    await page.mouse.move(box.w / 2, box.h / 2);
    await page.mouse.down();
    await page.mouse.move(box.w / 2 + 200, box.h / 2, { steps: 8 });
    await page.mouse.move(box.w / 2 + 200, box.h / 2 + 120, { steps: 8 });
    await page.mouse.up();
    const dragged = await turnOf(page);
    // Across and down: yaw and pitch both move, and pitch stays within ±75°.
    turned =
      Math.abs(dragged.yaw - before.yaw) > 1 &&
      Math.abs(dragged.pitch - before.pitch) > 1 &&
      Math.abs(dragged.pitch) <= 75;
    // The owner's look at a book mid-turn; `artifacts/` is ignored.
    writeFileSync(join(ARTIFACTS, 'turning.png'), await page.screenshot({ type: 'png' }));
    // Home squares it; then one ArrowRight is 15° of yaw. Keys reach the book
    // from the canvas, the body and the held controls.
    await page.keyboard.press('Home');
    const square = await turnOf(page);
    await page.keyboard.press('ArrowRight');
    const stepped = await turnOf(page);
    keyTurned =
      Math.abs(square.yaw) < 0.5 &&
      Math.abs(square.pitch) < 0.5 &&
      Math.abs(stepped.yaw - 15) < 0.5;
    // A turned book, tapped where it stands: it opens, and it eases square doing so.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const at = await bookCentre(page);
    // C9, the canvas's half: a press that wobbles 8 px and comes back is a tap
    // in every sense but the pointer's path, and neither opens the book nor
    // empties the hand. Reaches `press()` through the Picker's own pointer
    // handlers, which book-turn.test.ts does not.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 8, at.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.up();
    await page.evaluate(TWO_FRAMES);
    // A book that has started opening still reads held and not opened, so the
    // read is the closed rest itself, with nothing easing.
    wobbleKeepsHold = (await page.evaluate(
      `${CLOSED_AT_REST} && !window.__shelf.held()?.easing`,
    )) as boolean;
    await page.mouse.click(at.x, at.y);
    const opened = await until(page, HELD_OPEN, 'a tap on the turned book to open it');
    const settled = await until(
      page,
      `window.__shelf.held()?.easing === false && Math.abs(window.__shelf.held().turn.yaw) < 0.5 && Math.abs(window.__shelf.held().turn.pitch) < 0.5`,
      'the turned book to come to rest square',
    );
    tapOpensSquare = opened && settled;
  } else {
    await openBook(page, 'the book, to turn');
  }

  // The open book's two controls, each closing it back to the closed rest.
  const closeArrow = await closeBy(page, CLOSE_CONTROL);
  await openBook(page, 'the book, to close it again');
  const closeFoot = await closeBy(page, CLOSE_FOOT_CONTROL);
  page.off('request', onRequest);

  let escapeFromClosed = true;
  let escapeFromOpen = true;
  let escapeMidClose = true;
  let reducedCuts = true;
  let backMidClose = true;
  let returned: TurnRead['returned'];
  if (full) {
    // Escape from the closed rest.
    await page.keyboard.press('Escape');
    escapeFromClosed = await awayAndSettled(page, 'Escape to put the closed book back');

    // …from the open book.
    escapeFromOpen = false;
    if (await pickAndOpen(page, index, 'the book for Escape')) {
      await page.keyboard.press('Escape');
      escapeFromOpen = await awayAndSettled(page, 'Escape from open');
    }

    // …with a close in flight. Synchronous in the page, so the Escape cannot arrive
    // after the close has finished: the close is started and read mid-way in one task.
    escapeMidClose = false;
    if (await pickAndOpen(page, index, 'the book for Escape mid-close')) {
      const closing = (await page.evaluate(`(() => {
        document.querySelector('${CLOSE_CONTROL}').click();
        const h = window.__shelf.held();
        const closing = h?.opened === false && document.querySelector('.held-open')?.hidden === true;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return closing;
      })()`)) as boolean;
      escapeMidClose = closing && (await awayAndSettled(page, 'Escape mid-close'));
    }

    // Reduced motion cuts the close: at the closed rest in the same call that asked.
    reducedCuts = false;
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
    const restedReduced = await until(
      page,
      `${CLOSED_AT_REST} && document.querySelectorAll('.held-page').length === 2`,
      'the book for the reduced-motion close to come to rest held',
    );
    // The track's own place at the closed rest it landed on, to meet again after the close.
    const landedAt = restedReduced
      ? ((await page.evaluate('window.__shelf.current()?.progress')) as number | undefined)
      : undefined;
    if (restedReduced && (await openBook(page, 'the book for the reduced-motion close'))) {
      const cut = (await page.evaluate(`(() => {
        document.querySelector('${CLOSE_CONTROL}').click();
        const h = window.__shelf.held();
        const progress = window.__shelf.current()?.progress;
        return {
          rest: h?.phase === 'held' && h.opened === false,
          still: h?.easing === false,
          openShown: document.querySelector('.held-open')?.hidden === false,
          progress,
        };
      })()`)) as {
        rest: boolean;
        still: boolean;
        openShown: boolean;
        progress: number | undefined;
      };
      // The state is the cut: at the closed rest in the call that asked, no tween in
      // flight. The scene's board follows on the next frame, so its angle is awaited
      // (a presence) and not read in the same call.
      reducedCuts =
        cut.rest &&
        cut.still &&
        cut.openShown &&
        landedAt !== undefined &&
        cut.progress !== undefined &&
        Math.abs(cut.progress - landedAt) < 0.02 &&
        (await until(
          page,
          `Math.abs(window.__shelf.held()?.boardAngle ?? 90) <= ${String(CLOSED_TOLERANCE_DEG)}`,
          'the reduced-motion close to reach the closed board',
        ));
      if (!reducedCuts) console.error(`reduced-motion close read ${JSON.stringify(cut)}`);
    }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await putBackAndSettle(page);

    // The back button with a close in flight empties the hand, and the book settles.
    backMidClose = false;
    if (await pickAndOpen(page, index, 'the book for the back button mid-close')) {
      await page.evaluate(`(() => {
        document.querySelector('${CLOSE_CONTROL}').click();
        history.back();
      })()`);
      backMidClose =
        (await awayAndSettled(page, 'the hand to empty on the back button mid-close')) &&
        (await page.evaluate('window.__shelf.current() === undefined')) === true;
    }

    // C5: a put-back right after a close plays the return. Sampled once a frame from
    // the pickup's own timeline, which outlives `held()` while the book goes back.
    // The shelf steps GSAP by `performance.now()`, so on a loaded runner one
    // stalled frame carried the whole return past in a single step and no frame
    // landed between rest and 0 (#576). The page's clock is held to one 60 Hz
    // frame per frame sampled while it reads, so the count of frames the return
    // takes no longer depends on how busy the machine is; it is put back after.
    if (await pickAndOpen(page, index, 'the book for the return')) {
      await page.evaluate(`document.querySelector('${CLOSE_CONTROL}').click()`);
      if (await until(page, CLOSED_AT_REST, 'the close before the return')) {
        const rest = (await page.evaluate('window.__shelf.held().progress')) as number;
        const frames = (await page.evaluate(`(async () => {
          const frames = [];
          const realNow = performance.now;
          const base = realNow.call(performance);
          let stepped = 0;
          // Never ahead of the real clock, so putting it back never runs time backwards.
          performance.now = () =>
            Math.min(realNow.call(performance), base + stepped * (1000 / 60));
          try {
            window.__shelf.putBack();
            for (let frame = 0; frame < 600; frame += 1) {
              const moving = window.__shelf.current();
              if (moving === undefined) break;
              frames.push(moving.progress);
              await new Promise((resolve) => requestAnimationFrame(resolve));
              stepped += 1;
            }
          } finally {
            performance.now = realNow;
          }
          return frames;
        })()`)) as number[];
        returned = { rest, frames };
      }
    }
    await putBackAndSettle(page);
  }

  return {
    held,
    showedHeld: held !== undefined && worn,
    showedOwn: held === undefined && worn,
    fetchedNothing: fetched.length === 0,
    closeArrow,
    closeFoot,
    turned,
    keyTurned,
    tapOpensSquare,
    wobbleKeepsHold,
    escapeFromClosed,
    escapeFromOpen,
    escapeMidClose,
    reducedCuts,
    backMidClose,
    returned,
  };
}

/**
 * A book with no cover, opened and closed by its control: the book lands closed,
 * opens, and the control closes it back to the closed rest. Every open book can be
 * closed, covered or not (S7).
 */
async function closesCoverless(page: Page): Promise<boolean> {
  const opened = await openBook(page, 'the coverless book');
  const closed = await closeBy(page, CLOSE_CONTROL);
  return (
    opened &&
    closed.atClosedRest &&
    closed.pagesHidden &&
    closed.boardAngle !== undefined &&
    Math.abs(closed.boardAngle) <= CLOSED_TOLERANCE_DEG
  );
}

/** Held-copy URLs the fallback probe refused on purpose, kept out of the page errors. */
const REFUSED = new Set<string>();

/**
 * Picks the book up with every request for a held copy refused, and reads
 * whether the book still opens and closes and wears the shelf copy. The copy is
 * fetched at pickup now, so the refusal is in place *before* the pickup; request
 * interception turns the page's cache off, so a copy an earlier pickup already
 * loaded cannot answer in its place. It is switched back off before the
 * ordinary turn that follows.
 */
async function wearsShelfCopyWhenRefused(
  page: Page,
  index: number,
  title: string,
): Promise<boolean> {
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
    if (!(await openBook(page, 'the book, copy refused'))) return false;
    // `shelf` is the material still carrying the shelf texture; a fallback that
    // blanked the cover reads `none`.
    const shelfCopy = (await page.evaluate(
      `window.__shelf.held()?.title === ${JSON.stringify(title)} && window.__shelf.held()?.cover === 'shelf'`,
    )) as boolean;
    const closed = await closeBy(page, CLOSE_CONTROL);
    return closed.atClosedRest && shelfCopy;
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
 * alone, with the title leading it and the put-back X on screen, with the book
 * closed and with it open (#531: the X is in the header, so a closed book's hidden
 * pages cannot hold it).
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
  // Closed first, for C8: the X is on screen, and the closed book leaves it room.
  const closed = (await page.evaluate(READ_CLOSED)) as ClosedRead;
  if (!(await openBook(page, 'book 0 at phone size'))) return undefined;
  const read = (await page.evaluate(`(() => {
    const right = document.querySelector('.held-page-right');
    const control = document.querySelector('.held-controls .held-put-back');
    const inView = (box) => box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
    return {
      pageInView: right ? inView(right.getBoundingClientRect()) : false,
      // The close control sits first on a phone's page (#553), and the title leads what follows.
      titleLeads: [...(right?.children ?? [])].find((child) => !child.classList.contains('held-close'))?.classList.contains('held-title') ?? false,
      putBackInView: control ? inView(control.getBoundingClientRect()) : false,
    };
  })()`)) as Omit<PhoneRead, 'closedXOnScreen'>;
  await putBackAndSettle(page);
  return { ...read, closedXOnScreen: closed.xOnScreen };
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
      // C1: closed, the board lies flat to the page block, on every book.
      const closedAngle = (await page.evaluate('window.__shelf.held().boardAngle')) as number;
      if (Math.abs(closedAngle) > CLOSED_TOLERANCE_DEG) {
        failures.push(
          `open spread: ${title} arrives ${closedAngle.toFixed(2)}° off closed, not within ` +
            `${String(CLOSED_TOLERANCE_DEG)}°`,
        );
      }
      if (!(await openBook(page, `book ${String(index)}, open spread`))) {
        failures.push(`open spread: book ${String(index)} never opened`);
        break;
      }
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

    if (!(await until(page, HELD, 'the long-Thoughts book to come to rest held'))) {
      return stop('the book never came to rest held');
    }
    // The opening is motion too: GSAP's ticker is read across it as well as across
    // the pickup, and the two samples are judged as one.
    await page.evaluate('window.__shelf.open()');
    const opening = (await page.evaluate(LOOPS_PER_FRAME)) as { frames: number; most: number };
    loops.frames = Math.min(loops.frames, opening.frames);
    loops.most = Math.max(loops.most, opening.most);
    if (!(await until(page, HELD_OPEN, 'the long-Thoughts book to open'))) {
      return stop('the book never opened');
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
    const asleep = loops.frames >= AT_REST_FRAMES && loops.most === 1;
    lines.push(
      `GSAP ticker      ${asleep ? 'asleep' : 'AWAKE'} (most ${String(loops.most)} loops a frame ` +
        `over ${String(loops.frames)} frames of the pickup and its opening)`,
    );
    // C4: the back arrow's place, with the planted Thoughts to scroll under it.
    const READ_ARROW = `(() => {
      const r = document.querySelector('.held-close')?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    })()`;
    const READ_PAGE = (name: string): string => `(() => {
      const r = document.querySelector('.held-page-${name}')?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    })()`;
    const desktopArrow = (await page.evaluate(READ_ARROW)) as Box | null;
    const desktopLeft = (await page.evaluate(READ_PAGE('left'))) as Box | null;
    await putBackAndSettle(page);
    // …and on the phone, where the right page carries it and it must stay in view.
    let phoneArrow: ArrowPlace['phone'];
    await page.setViewport(PHONE);
    await until(
      page,
      '(() => { const s = window.__shelf.stats(); return s.bufferWidth < s.bufferHeight * 0.9; })()',
      'the shelf to resize to the upright viewport',
    );
    await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
    if (
      (await until(page, HELD, 'the long-Thoughts book to come to rest held at phone size')) &&
      (await openBook(page, 'the long-Thoughts book at phone size')) &&
      (await until(
        page,
        `document.querySelectorAll('.held-page-right .held-thoughts p').length >= ${String(planted)}`,
        'the planted Thoughts to show at phone size',
      ))
    ) {
      const beforeScroll = (await page.evaluate(READ_ARROW)) as Box | null;
      const scrolled = (await page.evaluate(`(() => {
        const right = document.querySelector('.held-page-right');
        const tall = right.scrollHeight > right.clientHeight + 1;
        right.scrollTop = right.scrollHeight;
        return tall && right.scrollTop > 0;
      })()`)) as boolean;
      await page.evaluate(TWO_FRAMES);
      const afterScroll = (await page.evaluate(READ_ARROW)) as Box | null;
      if (beforeScroll !== null && afterScroll !== null) {
        phoneArrow = {
          innerHeight: (await page.evaluate('innerHeight')) as number,
          before: beforeScroll,
          after: afterScroll,
          scrolled,
        };
      }
      await putBackAndSettle(page);
    }
    failures.push(
      ...arrowFailures({
        desktop:
          desktopArrow !== null && desktopLeft !== null
            ? { arrow: desktopArrow, leftPage: desktopLeft }
            : undefined,
        phone: phoneArrow,
      }).map((failure) => `held at rest: ${failure}`),
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
  } finally {
    await context.close();
  }
  return { lines, failures };
}

/* -------------------------------------------------------------------------- */

/** How long a closed book is left alone to show that nothing opens it: longer than the opening takes. */
const STAYS_CLOSED_MS = 1500;

const DESKTOP = { width: 1280, height: 800, hasTouch: true } as const;
const PHONE = { width: 375, height: 812, hasTouch: true } as const;

interface LinesAndFailures {
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

/** The held book, closed at rest, picked up through the shelf's hook. */
async function holdClosed(page: Page, index: number, what: string): Promise<boolean> {
  await page.evaluate(`window.__shelf.pickUp(${String(index)})`);
  // The pages are put in the document by the next frame; a visitor cannot act in
  // under one, and a control pressed before it focuses a node that is not there.
  return until(
    page,
    `${HELD} && document.querySelectorAll('.held-page').length === 2`,
    `${what} to come to rest held, closed`,
  );
}

/** The point to aim at to click the held book: the middle of where it stands. */
async function bookCentre(page: Page): Promise<{ x: number; y: number }> {
  return (await page.evaluate(`(() => {
    const s = window.__shelf.held().screen;
    return { x: (s.left + s.right) / 2, y: (s.top + s.bottom) / 2 };
  })()`)) as { x: number; y: number };
}

async function controlCentre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`)) as { x: number; y: number };
}

/** Tab until `selector` has focus: the keyboard's way to a control, so it must be reachable. */
async function tabTo(page: Page, selector: string): Promise<boolean> {
  await page.evaluate(
    'document.activeElement instanceof HTMLElement && document.activeElement.blur()',
  );
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press('Tab');
    const there = (await page.evaluate(
      `document.activeElement?.matches(${JSON.stringify(selector)}) === true`,
    )) as boolean;
    if (there) return true;
  }
  return false;
}

type Input = 'mouse' | 'touch' | 'keyboard';

/** The hand empty and history as it was before the pickup (§3.9): the put-back left nothing behind. */
const BACK_AS_BEFORE = `${NOTHING_HELD} && !(history.state && history.state.pickup)`;

/** Presses the Open button, or the held book, with `input`. */
async function openWith(page: Page, input: Input): Promise<void> {
  if (input === 'keyboard') {
    if (await tabTo(page, '.held-open')) await page.keyboard.press('Enter');
    return;
  }
  const at = await bookCentre(page);
  if (input === 'mouse') await page.mouse.click(at.x, at.y);
  else await page.touchscreen.tap(at.x, at.y);
}

/** Presses the X with `input`. */
async function putBackWith(page: Page, input: Input): Promise<void> {
  if (input === 'keyboard') {
    if (await tabTo(page, '.held-put-back')) await page.keyboard.press('Enter');
    return;
  }
  const at = await controlCentre(page, '.held-controls .held-put-back');
  if (input === 'mouse') await page.mouse.click(at.x, at.y);
  else await page.touchscreen.tap(at.x, at.y);
}

/** Each input opens a closed book, then puts it back from open; and from closed. */
async function driveInputs(page: Page): Promise<
  | {
      opens: Record<Input, boolean>;
      putsBackClosed: Record<Input, boolean>;
      putsBackOpen: Record<Input, boolean>;
    }
  | undefined
> {
  const opens = { mouse: false, touch: false, keyboard: false };
  const putsBackClosed = { ...opens };
  const putsBackOpen = { ...opens };
  for (const input of ['mouse', 'touch', 'keyboard'] as const) {
    if (!(await holdClosed(page, 3, `the book for the ${input}`))) return undefined;
    await openWith(page, input);
    opens[input] = await searchFor(page, HELD_OPEN, 5000);
    if (!opens[input]) {
      await putBackAndSettle(page);
      continue;
    }
    await putBackWith(page, input);
    putsBackOpen[input] = await searchFor(page, BACK_AS_BEFORE, 5000);
    if (!putsBackOpen[input]) await putBackAndSettle(page);

    if (!(await holdClosed(page, 3, `the book for the ${input}, to put back closed`))) {
      return undefined;
    }
    await putBackWith(page, input);
    putsBackClosed[input] = await searchFor(page, BACK_AS_BEFORE, 5000);
    if (!putsBackClosed[input]) await putBackAndSettle(page);
  }
  return { opens, putsBackClosed, putsBackOpen };
}

/** What the X overlaps with the book closed, and whether it is the top element at its centre. */
const READ_X_PLACE = `(() => {
  const x = document.querySelector('.held-controls .held-put-back');
  const box = x.getBoundingClientRect();
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const overlaps = [];
  const brand = document.querySelector('.brand');
  const hint = document.getElementById('shelf-hint');
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize);
  const inset = {
    top: box.top,
    right: root.clientWidth - box.right,
    expected: Math.min(Math.max(0.75 * rem, 0.03 * root.clientWidth), 1.5 * rem),
  };
  if (brand && meets(box, brand.getBoundingClientRect())) overlaps.push('the brand');
  if (hint && meets(box, hint.getBoundingClientRect())) overlaps.push('the hint');
  const book = window.__shelf.held().screen;
  if (meets(box, book)) overlaps.push('the closed book');
  const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  return { width: box.width, height: box.height, overlaps, inset, onTop: Boolean(top) && x.contains(top) };
})()`;

async function readViewport(page: Page, shot: string): Promise<ViewportControls | undefined> {
  const inputs = await driveInputs(page);
  if (inputs === undefined) return undefined;
  if (!(await holdClosed(page, 3, 'the book for the placement read'))) return undefined;
  const closed = (await page.evaluate(READ_X_PLACE)) as {
    width: number;
    height: number;
    overlaps: string[];
    inset: ViewportControls['xInsetClosed'];
    onTop: boolean;
  };
  writeFileSync(join(ARTIFACTS, shot), await page.screenshot({ type: 'png' }));
  if (!(await openBook(page, 'the book for the placement read'))) return undefined;
  const open = (await page.evaluate(READ_X_PLACE)) as typeof closed;
  await putBackAndSettle(page);
  return {
    ...inputs,
    xWidth: closed.width,
    xHeight: closed.height,
    xOverlaps: closed.overlaps,
    xOnTopClosed: closed.onTop,
    xOnTopOpen: open.onTop,
    xInsetClosed: closed.inset,
    xInsetOpen: open.inset,
  };
}

const TREE_HAS_BUTTON = async (page: Page, name: string): Promise<boolean> => {
  interface Node {
    role?: string;
    name?: string;
    children?: Node[];
  }
  const tree = (await page.accessibility.snapshot({ interestingOnly: false })) as Node | null;
  const walk = (node: Node | null | undefined): boolean =>
    node != null &&
    ((node.role === 'button' && node.name === name) || (node.children ?? []).some(walk));
  return walk(tree);
};

/**
 * G35, the closed book and its controls (#531): the claims no other read makes.
 * C4 (a mouse, a touch and a keyboard each open it and each put it back, from
 * closed and from open, at both sizes), C5 (the Open button in the tree, named
 * for the book, and where focus goes), C7 (reduced motion cuts), C8 (the X's
 * size and place), C9 (the markup, and no CSP violation) and C12 (the hint and
 * the cursor). Judged by `lib/pickup-gate.ts`'s `controlsFailures`, every
 * clause planted red in its spec.
 *
 * Writes `artifacts/held-closed.png` at 1280×800 and `artifacts/held-closed-phone.png`
 * at 375×812: the owner reads how much empty space a closed book leaves round it.
 */
async function checkClosedControls(browser: Browser, origin: string): Promise<LinesAndFailures> {
  const context = await browser.createBrowserContext();
  const lines: string[] = [];
  try {
    const page = await context.newPage();
    // Violations counted from the first script, across every step below.
    await page.evaluateOnNewDocument(
      `window.__csp = []; document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(event.violatedDirective));`,
    );
    await page.setViewport(DESKTOP);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });

    const desktop = await readViewport(page, 'held-closed.png');

    // C5 and C12, at desktop size: a book closed at rest.
    if (!(await holdClosed(page, 3, 'the book for the Open button'))) return stopControls(lines);
    const title = (await page.evaluate('window.__shelf.held().title')) as string;
    const xName = (await page.evaluate(
      `(document.querySelector('.held-controls .held-put-back')?.textContent ?? '').trim()`,
    )) as string;
    const buttonInTree = await TREE_HAS_BUTTON(page, `Open ${title}`);
    const hintClosed = (await page.evaluate(
      `document.getElementById('shelf-hint').textContent === ${JSON.stringify(CLOSED_HINT)}`,
    )) as boolean;
    const at = await bookCentre(page);
    await page.mouse.move(at.x - 3, at.y);
    await page.mouse.move(at.x, at.y);
    const cursorPointer = await searchFor(
      page,
      `getComputedStyle(document.getElementById('shelf-canvas')).cursor === 'pointer'`,
      3000,
    );

    // C2: nothing opens it alone. Left a while after landing, it is still closed.
    await new Promise((resolve) => setTimeout(resolve, STAYS_CLOSED_MS));
    const staysClosed = (await page.evaluate(
      `window.__shelf.held()?.opened === false && window.__shelf.held()?.phase === 'held'`,
    )) as boolean;

    // Opening: the button is gone from the tree the moment it starts.
    const hiddenAtOnce = (await page.evaluate(`(() => {
      window.__shelf.open();
      return document.querySelector('.held-controls .held-open').hidden;
    })()`)) as boolean;
    const buttonGoneWhileOpening = hiddenAtOnce && !(await TREE_HAS_BUTTON(page, `Open ${title}`));
    await until(page, HELD_OPEN, 'the book to finish opening');
    const hintOpen = (await page.evaluate(
      `(() => { const hint = document.getElementById('shelf-hint'); return hint.hidden && hint.getClientRects().length === 0; })()`,
    )) as boolean;
    // The pointer moved over the open book: a listener left attached would set the cursor now.
    const openAt = await bookCentre(page);
    await page.mouse.move(openAt.x - 3, openAt.y);
    await page.mouse.move(openAt.x, openAt.y);
    const cursorReset = (await page.evaluate(
      `getComputedStyle(document.getElementById('shelf-canvas')).cursor !== 'pointer'`,
    )) as boolean;
    // S6: the book going back keeps the hint hidden. Read once the book is
    // actually returning: the hand is empty and the shelf has the book again.
    await page.evaluate(`window.__shelf.putBack()`);
    const returning = await until(
      page,
      `window.__shelf.held() === undefined && window.__shelf.current() !== undefined`,
      'the book to be on its way back',
    );
    const hintHiddenGoingBack =
      returning &&
      ((await page.evaluate(`(() => {
        const hint = document.getElementById('shelf-hint');
        return hint.hidden && hint.getClientRects().length === 0;
      })()`)) as boolean);
    await until(page, NOTHING_HELD, 'the book to be put back');
    // C12: the hand empty again, the hint reads the shelf's text, and shows.
    const hintReturns =
      hintHiddenGoingBack &&
      ((await page.evaluate(
        `(() => { const hint = document.getElementById('shelf-hint'); return !hint.hidden && hint.textContent === ${JSON.stringify(TEMPLATE_HINT)}; })()`,
      )) as boolean);

    // C9: the markup is what the template wrote, and the CSP saw nothing.
    const markup = (await page.evaluate(`(() => {
      const flaws = [];
      const marks = [
        ['the X', document.querySelector('.held-controls .held-put-back')],
      ];
      for (const [name, button] of marks) {
        const svg = button?.querySelector('svg');
        if (!svg) { flaws.push(name + ' has no inline SVG'); continue; }
        if (svg.getAttribute('aria-hidden') !== 'true') flaws.push(name + "'s SVG is not aria-hidden");
        if (svg.getAttribute('focusable') !== 'false') flaws.push(name + "'s SVG is focusable");
        if (button.hasAttribute('style') || [svg, ...svg.querySelectorAll('*')].some((n) => n.hasAttribute('style'))) {
          flaws.push(name + ' has a style attribute');
        }
      }
      return flaws;
    })()`)) as string[];

    // C5 at phone size: the longest title, focused, fully on screen, the X where it was.
    await page.setViewport(PHONE);
    await until(
      page,
      '(() => { const s = window.__shelf.stats(); return s.bufferWidth < s.bufferHeight * 0.9; })()',
      'the shelf to resize to the upright viewport',
    );
    const library = (await page.evaluate(
      `fetch('/library.json').then((response) => response.json())`,
    )) as { books: LibraryBook[] };
    const ordered = shelfOrder(library.books);
    let longest = 0;
    ordered.forEach((book, index) => {
      if (book.title.length > (ordered[longest]?.title.length ?? 0)) longest = index;
    });
    const phone = await readViewport(page, 'held-closed-phone.png');
    let longTitleOnScreen = false;
    let xStayedPut = false;
    if (await holdClosed(page, longest, 'the longest-titled book')) {
      const before = await controlCentre(page, '.held-controls .held-put-back');
      await page.evaluate(`document.querySelector('.held-controls .held-open').focus()`);
      const after = await controlCentre(page, '.held-controls .held-put-back');
      xStayedPut = Math.abs(before.x - after.x) < 0.5 && Math.abs(before.y - after.y) < 0.5;
      longTitleOnScreen = (await page.evaluate(`(() => {
        const r = document.querySelector('.held-controls .held-open').getBoundingClientRect();
        return r.width > 2 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
      })()`)) as boolean;
      await putBackAndSettle(page);
    }

    // Focus after Open, by the keyboard, then again under reduced motion.
    const focusAfterOpen = async (): Promise<boolean> => {
      if (!(await holdClosed(page, 3, 'the book for the focus after Open'))) return false;
      const reached = await tabTo(page, '.held-open');
      if (reached) await page.keyboard.press('Enter');
      const opened = await searchFor(page, HELD_OPEN, 5000);
      const onPage = (await page.evaluate(
        `document.activeElement === document.querySelector('.held-page-right')`,
      )) as boolean;
      await putBackAndSettle(page);
      return reached && opened && onPage;
    };
    await page.setViewport(DESKTOP);
    await until(
      page,
      '(() => { const s = window.__shelf.stats(); return s.bufferWidth > s.bufferHeight; })()',
      'the shelf to resize to the desktop viewport',
    );
    const focusToPage = await focusAfterOpen();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const focusToPageReduced = await focusAfterOpen();

    // C7: reduced motion cuts all three. Read as state at that moment, not as a wait.
    const cuts = (await page.evaluate(`(async () => {
      window.__shelf.pickUp(3);
      const picked = window.__shelf.held();
      const pickupCuts = picked?.phase === 'held' && picked.opened === false && Math.abs(picked.boardAngle) <= ${String(CLOSED_TOLERANCE_DEG)};
      window.__shelf.open();
      const openCuts = window.__shelf.held()?.opened === true;
      window.__shelf.putBack();
      // History steps back as a task of its own; a tween would take a good deal longer.
      await new Promise((resolve) => setTimeout(resolve, 300));
      // The hand is empty the moment the reverse starts; the pages only go when it has finished.
      const gone = window.__shelf.held() === undefined && document.querySelectorAll('.held-page').length === 0;
      return { pickupCuts, openCuts, putBackCuts: gone };
    })()`)) as { pickupCuts: boolean; openCuts: boolean; putBackCuts: boolean };
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await until(page, NOTHING_HELD, 'the hand to empty after the reduced-motion cuts');

    const cspViolations = ((await page.evaluate('window.__csp.length')) as number) ?? 0;

    const read: ControlsRead | undefined =
      desktop === undefined || phone === undefined
        ? undefined
        : {
            desktop,
            phone,
            xName,
            buttonInTree,
            buttonGoneWhileOpening,
            longTitleOnScreen,
            xStayedPut,
            staysClosed,
            focusToPage,
            focusToPageReduced,
            reducedPickupCuts: cuts.pickupCuts,
            reducedOpenCuts: cuts.openCuts,
            reducedPutBackCuts: cuts.putBackCuts,
            markup,
            cspViolations,
            hintClosed,
            hintOpen,
            hintReturns,
            cursorPointer,
            cursorReset,
          };
    if (read !== undefined) {
      lines.push(
        `inputs      desktop mouse/touch/keyboard open ${byInput(read.desktop.opens)}, ` +
          `phone ${byInput(read.phone.opens)}`,
        `the X       ${read.desktop.xWidth.toFixed(0)}×${read.desktop.xHeight.toFixed(0)}px, overlaps ` +
          `${read.desktop.xOverlaps.concat(read.phone.xOverlaps).join(', ') || 'nothing'}, on top ` +
          `${String(read.desktop.xOnTopOpen && read.phone.xOnTopOpen)} open`,
        `the Open button  in the tree ${String(read.buttonInTree)}, gone while opening ` +
          `${String(read.buttonGoneWhileOpening)}, focus to the page ${String(read.focusToPage)}`,
        `screenshots artifacts/held-closed.png, artifacts/held-closed-phone.png`,
      );
    }
    return { lines, failures: controlsFailures(read).map((failure) => `closed book: ${failure}`) };
  } finally {
    await context.close();
  }
}

/** mouse/touch/keyboard, as true or false each, for a report line. */
function byInput(by: ViewportControls['opens']): string {
  return [by.mouse, by.touch, by.keyboard].map(String).join('/');
}

function stopControls(lines: string[]): LinesAndFailures {
  lines.push('STOPPED          a book never came to rest held, closed');
  return { lines, failures: ['closed book: a book never came to rest held, closed'] };
}

/* -------------------------------------------------------------------------- */

/**
 * How many cells `checkDrawerCells` reads: a cell that drops out, on a failed
 * set-up or a point it could not find, is a red line and not a smaller table.
 * Two shut-drawer cells on empty space and one on the open book; eight a column
 * with the drawer open and two Open buttons on the closed one; the catch; five
 * round the close control; two of arrow keys; three with an empty hand; five of motion; and the phone's.
 */
const DRAWER_CELLS = 38;

interface DrawerChecked {
  readonly lines: readonly string[];
  readonly failures: readonly string[];
}

/** What the page shows about the drawer and the book, as one sentence. */
const READ_OUTCOME = `(() => {
  const h = window.__shelf.held();
  const drawer = document.getElementById('ask-launcher').getAttribute('aria-expanded') === 'true' ? 'drawer open' : 'drawer closed';
  // The Open button is on only while the book is closed at rest: an opening book is held and not open yet.
  const resting = document.querySelector('.held-controls .held-open')?.hidden === false;
  const book = h === undefined ? 'book away' : h.opened ? 'book open' : h.phase === 'held' ? (resting ? 'book closed' : 'book opening') : 'book moving';
  return drawer + '; ' + book;
})()`;

async function outcome(page: Page): Promise<string> {
  return (await page.evaluate(READ_OUTCOME)) as string;
}

async function openDrawer(page: Page): Promise<void> {
  await page.click('#ask-launcher');
  await searchFor(
    page,
    `document.getElementById('ask-launcher').getAttribute('aria-expanded') === 'true'`,
    3000,
  );
  // Its slide in, finished: a cell read mid-slide would find the panel not yet where it ends.
  await searchFor(
    page,
    `!document.getElementById('ask-panel').classList.contains('is-entering')`,
    3000,
  );
}

/** A point on the canvas that no book answers for, away from the panel and the held book. */
async function emptyPoint(page: Page): Promise<{ x: number; y: number } | undefined> {
  return (await page.evaluate(`(() => {
    for (let y = 30; y < innerHeight - 30; y += 40) {
      for (let x = 30; x < innerWidth - 30; x += 40) {
        if (window.__shelf.bookAt(x, y) !== undefined) continue;
        if (document.elementFromPoint(x, y) !== document.getElementById('shelf-canvas')) continue;
        return { x, y };
      }
    }
    return undefined;
  })()`)) as { x: number; y: number } | undefined;
}

/**
 * The id of a book other than the held one. Aim cannot reach one: the held book
 * stands in front of the shelf and its box covers the whole of it at 1280×800
 * (measured: every answering point is the held book's), so "a click on another
 * book" has no pointer path on this shelf. A click on another book is the same
 * click as one on the held book as far as the drawer is concerned (the mark rides
 * the event, not the target), and `pickup-state.test.ts` runs every target.
 */
async function otherBookId(page: Page): Promise<string | undefined> {
  const mine = await heldId(page);
  const library = (await page.evaluate(
    `fetch('/library.json').then((response) => response.json())`,
  )) as { books: { id: string }[] };
  return library.books.find((book) => book.id !== mine)?.id;
}

/** The shelf's id for the held book, read from where it stands. */
async function heldId(page: Page): Promise<string | undefined> {
  const at = (await page.evaluate(`(() => {
    const s = window.__shelf.held()?.screen;
    return s ? { x: (s.left + s.right) / 2, y: (s.top + s.bottom) / 2 } : null;
  })()`)) as { x: number; y: number } | null;
  if (at === null) return undefined;
  return (await page.evaluate(`window.__shelf.bookAt(${String(at.x)}, ${String(at.y)})`)) as
    string | undefined;
}

/** The result of a chat link, which names a book by id as the drawer's link does. */
function dispatchLink(page: Page, id: string): Promise<unknown> {
  return page.evaluate(
    `window.dispatchEvent(new CustomEvent('stacks:pick-up', { detail: { id: ${JSON.stringify(id)} } }))`,
  );
}

/**
 * G35, the Ask drawer over a held book (#531, `picking-up-closed.md` S3, claims C6
 * and the chat-link half of C11): every cell of both tables, a browser read for
 * each. The suite is offline and a no-key build shows no chat link, so a link is
 * reached the way the link reaches the shelf: `stacks:pick-up` on the window,
 * with focus put where a clicked link leaves it. A real link runs only on the
 * live site (S14).
 *
 * Each cell is one sentence of outcome, compared with the spec's own words by
 * `drawerFailures`, so a cell that drifts is a red line naming the cell.
 */
async function checkDrawerCells(browser: Browser, origin: string): Promise<DrawerChecked> {
  const context = await browser.createBrowserContext();
  const cells: DrawerCell[] = [];
  const lines: string[] = [];
  const record = async (name: string, expected: string, actual: Promise<string> | string) => {
    cells.push({ name, expected, actual: await actual });
  };
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });

    /** A held book, closed or open, with the drawer opened over it. */
    const setUp = async (column: 'closed' | 'open'): Promise<boolean> => {
      if (!(await holdClosed(page, 3, `the book for the ${column} drawer cells`))) return false;
      if (column === 'open' && !(await openBook(page, 'the book for the open drawer cells'))) {
        return false;
      }
      await openDrawer(page);
      return true;
    };
    const settleAfter = async (): Promise<void> => {
      // The cell's answer is read after a moment for a wrong put-back to register
      // (an absence wait, K1: it can only be weakened by a slow runner).
      await new Promise((resolve) => setTimeout(resolve, PUT_BACK_CHANCE_MS));
    };
    const reset = async (): Promise<void> => {
      await page.evaluate('window.__shelf.putBack()');
      await searchFor(page, NOTHING_HELD, 5000);
      await page.evaluate(
        `document.getElementById('ask-launcher').getAttribute('aria-expanded') === 'true' && document.getElementById('ask-launcher').click()`,
      );
    };

    for (const column of ['closed', 'open'] as const) {
      const stays = `drawer closed; book ${column}`;
      const label = (cell: string): string => `${cell}, book ${column}`;

      // The drawer shut: a click on empty space puts the book back, and a click on
      // an open book does nothing (S3's first table, which the drawer tables repeat).
      if (await holdClosed(page, 3, `the book for the shut-drawer cells, ${column}`)) {
        if (column === 'open') await openBook(page, 'the book for the shut-drawer cells');
        const gap = await emptyPoint(page);
        if (column === 'open') {
          const onBook = await bookCentre(page);
          await page.mouse.click(onBook.x, onBook.y);
          await settleAfter();
          await record(
            'drawer shut, click on the book, book open',
            'drawer closed; book open',
            outcome(page),
          );
        }
        if (gap === undefined) {
          await record(
            `drawer shut, click on empty space, book ${column}`,
            'drawer closed; book away',
            'no empty point found',
          );
        } else {
          await page.mouse.click(gap.x, gap.y);
          await searchFor(page, BACK_AS_BEFORE, 8000);
          await record(
            `drawer shut, click on empty space, book ${column}`,
            'drawer closed; book away',
            outcome(page),
          );
        }
        await reset();
      }

      if (!(await setUp(column))) break;
      const centre = await bookCentre(page);
      await page.mouse.click(centre.x, centre.y);
      await settleAfter();
      await record(label('drawer open, click on the book'), stays, outcome(page));
      await reset();

      await setUp(column);
      const empty = await emptyPoint(page);
      if (empty === undefined) {
        await record(label('drawer open, click on empty space'), stays, 'no empty point found');
      } else {
        await page.mouse.click(empty.x, empty.y);
        await settleAfter();
        await record(label('drawer open, click on empty space'), stays, outcome(page));
      }
      await reset();

      await setUp(column);
      const x = await controlCentre(page, '.held-controls .held-put-back');
      await page.mouse.click(x.x, x.y);
      await searchFor(page, NOTHING_HELD, 8000);
      await record(
        label('drawer open, the X by pointer'),
        'drawer closed; book away',
        outcome(page),
      );
      await reset();

      await setUp(column);
      await page.evaluate(`document.querySelector('.held-controls .held-put-back').focus()`);
      await page.keyboard.press('Enter');
      await searchFor(page, NOTHING_HELD, 8000);
      await record(label('drawer open, the X by key'), 'drawer open; book away', outcome(page));
      await reset();

      if (column === 'closed') {
        await setUp(column);
        await page.evaluate(`document.querySelector('.held-controls .held-open').focus()`);
        await page.keyboard.press('Enter');
        await searchFor(page, HELD_OPEN, 8000);
        await record(
          'drawer open, the Open button by key, book closed',
          'drawer open; book open',
          outcome(page),
        );
        await reset();

        await setUp(column);
        await page.evaluate(`document.querySelector('.held-controls .held-open').focus()`);
        const open = await controlCentre(page, '.held-controls .held-open');
        await page.mouse.click(open.x, open.y);
        await searchFor(page, HELD_OPEN, 8000);
        await record(
          'drawer open, the Open button by pointer, book closed',
          'drawer closed; book open',
          outcome(page),
        );
        await reset();
      }

      await setUp(column);
      await page.keyboard.press('Escape');
      await settleAfter();
      await record(label('drawer open, Escape'), stays, outcome(page));
      await reset();

      await setUp(column);
      await page.evaluate('history.back()');
      await searchFor(page, NOTHING_HELD, 8000);
      await record(label('drawer open, the back button'), 'drawer open; book away', outcome(page));
      await reset();

      // Chat links. Focus is put where a clicked link leaves it: inside the panel.
      await setUp(column);
      const id = await heldId(page);
      if (id === undefined) {
        await record(label('chat link to this book'), 'ok', 'could not name the held book');
      } else {
        await page.evaluate(`document.getElementById('ask-input').focus()`);
        await dispatchLink(page, id);
        await settleAfter();
        const where = (await page.evaluate(
          `document.activeElement?.classList.contains('held-open') ? 'focus on Open' : document.activeElement?.id === 'ask-launcher' ? 'focus on the launcher' : 'focus elsewhere'`,
        )) as string;
        await record(
          label('chat link to this book'),
          `drawer closed; book ${column}; ${column === 'closed' ? 'focus on Open' : 'focus on the launcher'}`,
          `${await outcome(page)}; ${where}`,
        );
      }
      await reset();

      await setUp(column);
      const away = await otherBookId(page);
      if (away === undefined) {
        await record(label('chat link to another book'), 'ok', 'no other book found');
      } else {
        await page.evaluate(`document.getElementById('ask-input').focus()`);
        await dispatchLink(page, away);
        // The swap: the first goes back, the second arrives closed.
        await searchFor(
          page,
          `window.__shelf.held()?.phase === 'held' && window.__shelf.held()?.opened === false && document.getElementById('ask-launcher').getAttribute('aria-expanded') === 'false'`,
          12_000,
        );
        const where = (await page.evaluate(
          `document.activeElement?.classList.contains('held-open') ? 'focus on Open' : 'focus elsewhere'`,
        )) as string;
        await record(
          label('chat link to another book'),
          'drawer closed; book closed; focus on Open',
          `${await outcome(page)}; ${where}`,
        );
      }
      await reset();
    }

    // A book caught on its way back: picked up again before it is home, it plays on
    // forward to the next rest, which from the closed rest is closed.
    if (await holdClosed(page, 3, 'the book for the catch cell')) {
      await page.evaluate('window.__shelf.putBack()');
      await searchFor(page, 'window.__shelf.held() === undefined', 8000);
      await page.evaluate('window.__shelf.pickUp(3)');
      await searchFor(page, HELD, 12_000);
      await settleAfter();
      await record(
        'a book caught on its way back, from closed',
        'drawer closed; book closed',
        outcome(page),
      );
      await reset();
    }

    // The open page's back arrow by key, with the drawer open: the book closes
    // and the drawer stays; then two Escapes, the first for the drawer and the second
    // for the book.
    if (await holdClosed(page, 3, 'the book for the close cell')) {
      await openBook(page, 'the book for the close cell');
      await openDrawer(page);
      await page.evaluate(`document.querySelector('${CLOSE_CONTROL}').focus()`);
      await page.keyboard.press('Enter');
      await searchFor(page, CLOSED_AT_REST, 8000);
      await record(
        'drawer open, the back arrow by key, book open',
        'drawer open; book closed',
        outcome(page),
      );
      const xShown = async (): Promise<string> =>
        (await page.evaluate(`document.querySelector('.held-controls')?.hidden === false`))
          ? 'X shown'
          : 'X hidden';
      await record('the X after the close', 'X shown', xShown());
      await page.keyboard.press('Escape');
      await settleAfter();
      await record(
        'drawer open, the first Escape after the close',
        'drawer closed; book closed',
        outcome(page),
      );
      await record('the X after the first Escape', 'X shown', xShown());
      await page.keyboard.press('Escape');
      await searchFor(page, NOTHING_HELD, 8000);
      await record(
        'drawer shut, the second Escape after the close',
        'drawer closed; book away',
        outcome(page),
      );
      await reset();
    }

    // C7: an arrow key typed into the Ask input, or pressed on an open page's link,
    // leaves the turn alone.
    const turnAfterArrow = async (): Promise<string> => {
      const before = (await turnOf(page)).yaw;
      await page.keyboard.press('ArrowRight');
      return (await turnOf(page)).yaw === before ? 'turn unchanged' : 'turn changed';
    };
    if (await setUp('closed')) {
      await page.evaluate(`document.getElementById('ask-input').focus()`);
      await record(
        'an arrow key in the Ask input, book closed',
        'turn unchanged',
        turnAfterArrow(),
      );
      await reset();
    }
    if (await holdClosed(page, 3, 'the book for the link cell')) {
      await openBook(page, 'the book for the link cell');
      // Guards the closed-only rule: with the book open, the keydown handler returns
      // before it reaches the link rule, so this cell is no evidence for that rule.
      await page.evaluate(`document.querySelector('.held-page-right .card-links a')?.focus()`);
      await record(
        'an arrow key on an open page link, book open',
        'turn unchanged',
        turnAfterArrow(),
      );
      await reset();
    }

    // An empty hand: a click on a book closes the drawer and picks it up.
    await openDrawer(page);
    const target = (await page.evaluate(`(() => {
      for (let i = 0; i < window.__shelf.bookCount; i += 1) {
        const p = window.__shelf.projectBook(i);
        if (p && window.__shelf.bookAt(p.x, p.y) !== undefined &&
            document.elementFromPoint(p.x, p.y) === document.getElementById('shelf-canvas')) {
          return { x: p.x, y: p.y, id: window.__shelf.bookAt(p.x, p.y) };
        }
      }
      return undefined;
    })()`)) as { x: number; y: number; id: string } | undefined;
    if (target !== undefined) {
      await page.mouse.click(target.x, target.y);
      await searchFor(page, HELD, 12_000);
      await record(
        'drawer open, empty hand, click on a book',
        'drawer closed; book closed',
        outcome(page),
      );
      await reset();
    }
    await openDrawer(page);
    const space = await emptyPoint(page);
    if (space !== undefined) {
      await page.mouse.click(space.x, space.y);
      await settleAfter();
      await record(
        'drawer open, empty hand, click on empty space',
        'drawer closed; book away',
        outcome(page),
      );
    }
    if (target !== undefined) {
      await openDrawer(page);
      await page.evaluate(`document.getElementById('ask-input').focus()`);
      await dispatchLink(page, target.id);
      await searchFor(page, HELD, 12_000);
      await settleAfter();
      const where = (await page.evaluate(
        `document.activeElement?.classList.contains('held-open') ? 'focus on Open' : 'focus elsewhere'`,
      )) as string;
      await record(
        'drawer open, empty hand, chat link',
        'drawer closed; book closed; focus on Open',
        `${await outcome(page)}; ${where}`,
      );
      await reset();
    }

    // Motion: the controls act from where the book is, and a click on the book does nothing.
    if (await holdClosed(page, 3, 'the book for the motion cells')) {
      await page.evaluate('window.__shelf.open()');
      const c = await bookCentre(page);
      await page.mouse.click(c.x, c.y);
      await settleAfter();
      await searchFor(page, HELD_OPEN, 8000);
      await record(
        'a click on the book while it opens',
        'book open',
        ((await page.evaluate(READ_OUTCOME)) as string).split('; ')[1] ?? '',
      );
      await reset();
    }
    for (const [name, act] of [
      ['the X', () => page.click('.held-controls .held-put-back')],
      ['Escape', () => page.keyboard.press('Escape')],
      ['the back button', () => page.evaluate('history.back()')],
    ] as const) {
      if (!(await holdClosed(page, 3, `the book for ${name} while it opens`))) break;
      await page.evaluate('window.__shelf.open()');
      await act();
      await record(
        `${name} while the book opens`,
        'book away',
        searchFor(page, NOTHING_HELD, 8000).then((gone) => (gone ? 'book away' : 'book held')),
      );
      await reset();
    }
    if (await holdClosed(page, 3, 'the book for the empty-space motion cell')) {
      await page.evaluate('window.__shelf.open()');
      const away = await emptyPoint(page);
      if (away !== undefined) {
        await page.mouse.click(away.x, away.y);
        await record(
          'empty space while the book opens',
          'book away',
          searchFor(page, NOTHING_HELD, 8000).then((gone) => (gone ? 'book away' : 'book held')),
        );
      }
      await reset();
    }

    // The phone: the panel covers the X, so the drawer is closed first.
    await page.setViewport({ width: 375, height: 812, hasTouch: true });
    await until(
      page,
      '(() => { const s = window.__shelf.stats(); return s.bufferWidth < s.bufferHeight * 0.9; })()',
      'the shelf to resize to the upright viewport',
    );
    if (await holdClosed(page, 3, 'the book for the phone cell')) {
      await openDrawer(page);
      const covered = (await page.evaluate(`(() => {
        const r = document.querySelector('.held-controls .held-put-back').getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return Boolean(top?.closest('#ask-panel'));
      })()`)) as boolean;
      await record(
        'drawer open, the X by pointer, phone',
        'under the panel',
        covered ? 'under the panel' : 'reachable over the panel',
      );
      await reset();
    }

    lines.push(`${String(cells.length)} cells read`);
    return {
      lines,
      failures: drawerFailures(cells, DRAWER_CELLS).map((failure) => `drawer cells: ${failure}`),
    };
  } finally {
    await context.close();
  }
}

/* -------------------------------------------------------------------------- */

/** The sizes C6 is read at: the gate's two, and two between them (#553). */
const OVERLAP_SIZES = [
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
  { width: 1124, height: 772 },
  { width: 800, height: 772 },
] as const;

/** Where the hint, the X, the brand, the launcher and both pages stand, as boxes. */
const READ_BOXES = `(() => {
  const box = (selector) => {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: 0, top: 0, right: 0, bottom: 0 };
  };
  const hint = document.getElementById('shelf-hint');
  const s = window.__shelf.held().screen;
  return {
    hintHidden: hint.hidden && hint.getClientRects().length === 0,
    hint: box('#shelf-hint'),
    x: box('${X_BUTTON}'),
    xInset: (() => {
      const r = document.querySelector('${X_BUTTON}')?.getBoundingClientRect();
      const root = document.documentElement;
      const rem = parseFloat(getComputedStyle(root).fontSize);
      return {
        top: r ? r.top : 0,
        right: r ? root.clientWidth - r.right : 0,
        expected: Math.min(Math.max(0.75 * rem, 0.03 * root.clientWidth), 1.5 * rem),
      };
    })(),
    brand: box('.brand'),
    launcher: box('#ask-launcher'),
    left: box('.held-page-left'),
    right: box('.held-page-right'),
    book: { left: s.left, top: s.top, right: s.right, bottom: s.bottom },
  };
})()`;

type Boxes = Pick<OpenFraming, 'x' | 'xInset' | 'brand' | 'launcher' | 'left' | 'right'> & {
  hintHidden: boolean;
  hint: ClosedFraming['hint'];
  book: ClosedFraming['book'];
};

/** Two frames, so a turn or a framing change has reached the scene and the pages. */
const TWO_FRAMES =
  'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))';

/**
 * C6 (#553): at four sizes, with the tallest book of the fixture shelf and then the
 * thickest, the hint, the X and the brand stay off the book. Open: the hint is
 * hidden, and neither the X nor the brand meets a page. Closed, square and at
 * the pitch limit (ArrowDown five times): neither the hint nor the X meets the
 * book's box. In both, the X stays off the Ask launcher. Judged by
 * `overlapFailures`, every clause planted red in its spec.
 */
async function checkOverlap(browser: Browser, origin: string): Promise<LinesAndFailures> {
  const context = await browser.createBrowserContext();
  const lines: string[] = [];
  const failures: string[] = [];
  const reads: OverlapRead[] = [];
  try {
    const page = await context.newPage();
    await page.setViewport({ ...OVERLAP_SIZES[0], hasTouch: true });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    const library = (await page.evaluate(
      `fetch('/library.json').then((response) => response.json())`,
    )) as { books: LibraryBook[] };
    const shelved = toRows(library.books, DEFAULT_SETTINGS.books).flatMap((row) => row.books);
    const pick = (better: (a: ShelfBook, b: ShelfBook) => boolean): number =>
      shelved.reduce(
        (best, book, index) => (better(book, shelved[best] as ShelfBook) ? index : best),
        0,
      );
    const chosen = [
      ['the tallest book', pick((a, b) => a.height > b.height)],
      ['the thickest book', pick((a, b) => a.thickness > b.thickness)],
    ] as const;

    for (const size of OVERLAP_SIZES) {
      await page.setViewport({ ...size, hasTouch: true });
      await until(
        page,
        `(() => { const s = window.__shelf.stats(); return Math.abs(s.bufferWidth / s.bufferHeight - innerWidth / innerHeight) < 0.02; })()`,
        `the shelf to resize to ${String(size.width)}×${String(size.height)}`,
      );
      for (const [name, index] of chosen) {
        const label = `${String(size.width)}×${String(size.height)}, ${name}`;
        const expectedTitle = shelved[index]?.book.title;
        if (!(await holdClosed(page, index, label))) {
          failures.push(`${label}: the book never came to rest held`);
          continue;
        }
        if ((await page.evaluate('window.__shelf.held().title')) !== expectedTitle) {
          failures.push(`${label}: the book held is not the one chosen from the shelf's own data`);
          await putBackAndSettle(page);
          continue;
        }
        await page.evaluate(TWO_FRAMES);
        const square = (await page.evaluate(READ_BOXES)) as Boxes;
        for (let press = 0; press < 5; press += 1) await page.keyboard.press('ArrowDown');
        await page.evaluate(TWO_FRAMES);
        const pitch = (await page.evaluate('window.__shelf.held().turn.pitch')) as number;
        if (Math.abs(pitch - 75) > 0.5)
          failures.push(`${label}: the pitch limit read ${pitch.toFixed(1)}°, not 75°`);
        const tilted = (await page.evaluate(READ_BOXES)) as Boxes;
        await page.keyboard.press('Home');
        if (!(await openBook(page, label))) {
          failures.push(`${label}: the book never opened`);
          await putBackAndSettle(page);
          continue;
        }
        await page.evaluate(TWO_FRAMES);
        const open = (await page.evaluate(READ_BOXES)) as Boxes;
        reads.push({
          label,
          open: {
            hintHidden: open.hintHidden,
            x: open.x,
            xInset: open.xInset,
            brand: open.brand,
            launcher: open.launcher,
            left: open.left,
            right: open.right,
          },
          square: { hint: square.hint, x: square.x, launcher: square.launcher, book: square.book },
          tilted: { hint: tilted.hint, x: tilted.x, launcher: tilted.launcher, book: tilted.book },
        });
        await putBackAndSettle(page);
      }
    }
    lines.push(`${String(reads.length)} of ${String(OVERLAP_READS)} readings taken`);
  } finally {
    await context.close();
  }
  return {
    lines,
    failures: [...failures, ...overlapFailures(reads)].map((failure) => `overlap: ${failure}`),
  };
}

/**
 * C15: a context lost with a book in hand, from closed and from open, puts the
 * book back at once, hides both controls, restores the hint, resets the cursor
 * and catches focus on the canvas. Read in a context of its own at the moment the
 * hand is empty, because the fallback that follows may swap the canvas.
 */
async function checkLostWithBookHeld(browser: Browser, origin: string): Promise<string[]> {
  const read: { closed?: LostCase; open?: LostCase } = {};
  const pointerFailures: string[] = [];
  for (const state of ['closed', 'open'] as const) {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await page.setViewport(DESKTOP);
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
      if (!(await holdClosed(page, 3, `the ${state} book to lose`))) continue;
      if (state === 'open' && !(await openBook(page, 'the book to lose'))) continue;
      // Focus on the X, and the pointer over the book, so each thing to undo is set.
      await page.evaluate(`document.querySelector('.held-controls .held-put-back').focus()`);
      const at = await bookCentre(page);
      await page.mouse.move(at.x - 2, at.y);
      await page.mouse.move(at.x, at.y);
      // The cursor over a closed book is a pointer before the loss, or its reset reads nothing.
      const wasPointer =
        state === 'open' ||
        (await searchFor(
          page,
          `getComputedStyle(document.getElementById('shelf-canvas')).cursor === 'pointer'`,
          3000,
        ));
      if (!wasPointer) pointerFailures.push(state);
      // Read inside the page the moment the hand is empty: nothing runs between.
      const lostCase = (await page.evaluate(`new Promise((resolve) => {
        const started = performance.now();
        const poll = () => {
          if (window.__shelf.held() === undefined) {
            const canvas = document.getElementById('shelf-canvas');
            resolve({
              // At once: a book that tweened back would still have its pages up.
              away: document.querySelectorAll('.held-page').length === 0,
              controlsHidden: document.querySelector('.held-controls')?.hidden === true,
              hintRestored: document.getElementById('shelf-hint')?.hidden === false && document.getElementById('shelf-hint')?.textContent === ${JSON.stringify(TEMPLATE_HINT)},
              cursorReset: getComputedStyle(canvas).cursor !== 'pointer',
              focusOnCanvas: document.activeElement === canvas,
            });
          } else if (performance.now() - started > 15000) {
            resolve({ away: false, controlsHidden: false, hintRestored: false, cursorReset: false, focusOnCanvas: false });
          } else {
            setTimeout(poll, 0);
          }
        };
        poll();
        ${LOSE.replace(/\n/g, ' ')}
      })`)) as LostCase;
      read[state] = lostCase;
    } finally {
      await context.close();
    }
  }
  return [
    ...lostFailures(
      read.closed !== undefined && read.open !== undefined
        ? { closed: read.closed, open: read.open }
        : undefined,
    ),
    ...pointerFailures.map(
      (state) => `the cursor was not a pointer over the ${state} book before the loss`,
    ),
  ].map((failure) => `lost context: ${failure}`);
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
    `window.__blackbox?.text().includes('not remembered') === true`,
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
    `window.__blackbox?.text().includes('a shadow probe, not remembered') === true`,
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
   * A picked-up book arrives closed (#531), a different configuration from the
   * open one: each is read.
   */
  readonly hold?: 'closed' | 'open';
  /**
   * Opens a notice over the page before the count (#536 C4, `notice-modals.md`): the modal
   * changes nothing about rendering, so the draw count equals its twin's. The attribution
   * notice is opened from the shelf's link; the privacy notice is reached by the swap inside
   * it, so both panels are on a page that is read.
   */
  readonly notice?: 'attribution' | 'privacy';
  /** The page without the notice, whose steady draws this one must equal. */
  readonly twin?: string;
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
    name: 'a book held closed, 50 books',
    url: (main) => `${main}/`,
    role: 'gate',
    library: LIBRARY,
    minRows: 0,
    hold: 'closed',
  },
  {
    name: 'a book held open, 50 books',
    url: (main) => `${main}/`,
    role: 'gate',
    library: LIBRARY,
    minRows: 0,
    hold: 'open',
  },
  {
    name: 'a notice open, 50 books',
    url: (main) => `${main}/`,
    role: 'gate',
    library: LIBRARY,
    minRows: 0,
    notice: 'attribution',
    twin: 'default, 50 books',
  },
  {
    name: 'a notice over a held book, 50 books',
    url: (main) => `${main}/`,
    role: 'gate',
    library: LIBRARY,
    minRows: 0,
    hold: 'closed',
    notice: 'privacy',
    twin: 'a book held closed, 50 books',
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
  const steadyDraws = new Map<string, number>();

  for (const page of SAMPLING_PAGES) {
    const { read, errors, openedAt } = await measureSampling(
      browser,
      page.url(main, large),
      page.hold,
      page.notice,
    );
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
    if (s !== undefined) steadyDraws.set(page.name, s.mostSteadyDraws);
    // C4: the modal changes nothing about rendering, so every frame drawn with it open has its
    // twin's count. Only the frames after it opened are read: opening a dialog links no program,
    // so the steady window above also holds the frames from before, and the largest count in it
    // would hide a render that paused or thinned under the modal.
    if (page.twin !== undefined) {
      const twinDraws = steadyDraws.get(page.twin);
      if (twinDraws === undefined) {
        failures.push(`G61, ${page.name}: its twin "${page.twin}" has no reading to compare with`);
      } else {
        const withNotice = (run.snapshot?.frames ?? []).filter(
          (bucket) => openedAt !== undefined && bucket.frame > openedAt,
        );
        const counts = withNotice.map((bucket) => bucket.samplingDraws);
        if (withNotice.length < MIN_STEADY_FRAMES) {
          failures.push(
            `G61, ${page.name}: ${String(withNotice.length)} frames drawn with the notice open, ` +
              `fewer than the ${String(MIN_STEADY_FRAMES)} that make a reading`,
          );
        } else if (Math.min(...counts) !== twinDraws || Math.max(...counts) !== twinDraws) {
          failures.push(
            `G61, ${page.name}: ${String(Math.min(...counts))} to ${String(Math.max(...counts))} ` +
              `sampling draws a frame with the notice open, ${String(twinDraws)} without it (${page.twin})`,
          );
        }
      }
    }
  }

  return { lines, failures };
}

/** Opens the notice a sampling page asks for, and waits for the panel it names to be shown. */
async function openNoticeForSampling(
  page: Page,
  notice: 'attribution' | 'privacy',
): Promise<boolean> {
  await page.click('.pattr-link[href="/attribution"]');
  if (!(await searchFor(page, `document.getElementById('notice-dialog').open`, 3000))) return false;
  if (notice === 'attribution') return true;
  await page.click('#notice-attribution a[href="/privacy"]');
  return searchFor(page, `document.getElementById('notice-privacy').hidden === false`, 3000);
}

async function measureSampling(
  browser: Browser,
  url: string,
  hold?: 'closed' | 'open',
  notice?: 'attribution' | 'privacy',
): Promise<{ read: SamplingRead; errors: string[]; openedAt?: number }> {
  const context = await browser.createBrowserContext();
  const errors: string[] = [];
  let openedAt: number | undefined;
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
    if (hold !== undefined) {
      await page.evaluate('window.__shelf.pickUp(3)');
      if (!(await until(page, HELD, 'the book held for this page to come to rest'))) {
        errors.push('the book held for this page never came to rest');
      } else if (hold === 'open' && !(await openBook(page, 'the book held for this page'))) {
        errors.push('the book held for this page never opened');
      }
    }
    if (notice !== undefined) {
      if (await openNoticeForSampling(page, notice)) {
        // The frame it opened on: the count is read from the frames after it.
        openedAt = (await page.evaluate('window.__samplingHook.status().frame')) as number;
        try {
          await page.waitForFunction(
            `window.__samplingHook.status().frame >= ${String(openedAt + MIN_STEADY_FRAMES + 1)}`,
            { timeout: SETTLE_TIMEOUT_MS, polling: 100 },
          );
        } catch {
          // Judged below: too few frames with the notice open is this page's failure.
        }
      } else {
        errors.push('the notice for this page never opened');
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
    const read = (await page.evaluate(READ_SAMPLING)) as SamplingRead;
    return openedAt === undefined ? { read, errors } : { read, errors, openedAt };
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
 *   background, not a browser default, and no `securitypolicyviolation` fired
 *   (spec §3.7).
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
      `violations ${String(styled.violations.length)}`,
  );
  if (!styled.found) failures.push('styled pane: no pane rendered on the ?debug page');
  else if (styled.background === 'rgba(0, 0, 0, 0)') {
    failures.push('styled pane: the pane has a browser-default background, so it drew unstyled');
  }
  for (const violation of styled.violations) {
    failures.push(`styled pane: the ?debug page broke its CSP, ${violation}`);
  }
  for (const error of [...plain.errors, ...debug.errors, ...narrow.errors]) {
    failures.push(`tuner: ${error}`);
  }
  if (plain.hookPublished) {
    failures.push('black box hook: window.__blackbox is published on a page without ?debug');
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
  };
  readonly pane: PaneReading;
  /** Whether `window.__blackbox` was published: behind `?debug` only. */
  readonly hookPublished: boolean;
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
      return {
        found: pane !== null,
        background: pane === null ? '' : getComputedStyle(pane).backgroundColor,
        violations: window.__cspViolations ?? [],
      };
    })()`)) as TunerVisit['styled'];

    const pane = !debug
      ? NO_PANE
      : viewport === VIEWPORT
        ? await readPane(page)
        : await readPaneAtRest(page);

    const fetched = (await Promise.all(reads)).filter((asset) => asset !== undefined);
    const hookPublished = (await page.evaluate('window.__blackbox !== undefined')) as boolean;
    return { fetched, styled, pane, hookPublished, errors };
  } finally {
    await context.close();
  }
}

/* -------------------------------------------------------------------------- */

/**
 * The black box's readout — the display check #488 left to #489, placed here.
 *
 * Outside G60 on purpose: G60 is skipped on pull requests (ADR-0108), and this
 * is cheap, so it runs on every one. Three pages, each in a context of its own:
 *
 * - **no pane**: the pane's chunk is aborted at the network, as a slow or
 *   refused chunk would be. The plain readout must be showing, and carry the
 *   hook's text.
 * - **pane**: once it loads, the readout monitor's textarea `.value` equals
 *   `window.__blackbox.text()` and the plain element has stepped aside. A
 *   textarea, not `textContent`, because that is what a Tweakpane read-only
 *   multiline monitor draws.
 * - **death**: a record with no clean exit is seeded before the page's first
 *   script, at 700px where the pane starts collapsed; the pane and the readout
 *   folder must both be open, and show the death line.
 *
 * It fails if any of the three is dropped: no hook, no claim, no monitor, or no
 * opening rule each reds a different page.
 */
const BLACKBOX_KEY = 'stacks.blackbox.v2';

/**
 * The chunk `debug-pane.ts` becomes. Vite names it after the entry module and a
 * hash; the dot keeps `debug-panel`, the tuning panel's chunk, from matching.
 */
const PANE_CHUNK = /debug-pane\.[\w-]+\.js/;

/** A previous session's record that never reached `pagehide`: no `clean` flag. */
const DEAD_RECORD = {
  seconds: 42,
  books: 7,
  profile: 'staged death',
  textures: 1,
  geometries: 1,
  programs: 1,
  calls: 1,
  triangles: 1,
  buffer: '1x1',
  pixelRatio: 1,
  screen: '1x1 @1',
  errors: [] as string[],
};

interface ReadoutReading {
  /** `window.__blackbox.text()`, or null when the hook is absent. */
  readonly hook: string | null;
  /** The plain element: whether it is drawn, and its text. */
  readonly plainShown: boolean;
  readonly plainText: string;
  readonly pane: boolean;
  readonly paneExpanded: boolean;
  /** The folder titled `Black box`, if the pane has one. */
  readonly folder: boolean;
  readonly folderExpanded: boolean;
  readonly monitor: string | null;
  /** The folder's `forget` button: found, and under a hidden blade. */
  readonly forgetFound: boolean;
  readonly forgetHidden: boolean;
  /**
   * Whether the monitor was seen equal to the hook. A moment, not a state: the
   * monitor reads the port on its own tick, so it trails the hook by up to one
   * tick and a later read can differ with nothing wrong.
   */
  readonly matched: boolean;
  readonly aborted: number;
  readonly errors: readonly string[];
}

/** The folder titled `Black box`, found by its title the way a reader would. */
const FIND_FOLDER = `(() => {
  const root = document.querySelector('${TUNER_MARKER}');
  return root === null ? undefined : [...root.querySelectorAll('.tp-fldv')]
    .find((f) => f.querySelector('.tp-fldv_t')?.textContent === 'Black box');
})()`;

const READ_READOUT = `(() => {
  const plain = document.querySelector('.shelf-diagnostics');
  const folder = ${FIND_FOLDER};
  const forget = folder === undefined ? undefined : [...folder.querySelectorAll('.tp-btnv_b')]
    .find((b) => b.textContent === 'forget');
  return {
    hook: window.__blackbox === undefined ? null : window.__blackbox.text(),
    plainShown: plain !== null && plain.checkVisibility(),
    plainText: plain?.textContent ?? '',
    pane: document.querySelector('${TUNER_MARKER}') !== null,
    paneExpanded: document.querySelector('${TUNER_MARKER}')?.classList.contains('tp-rotv-expanded') === true,
    folder: folder !== undefined,
    folderExpanded: folder?.classList.contains('tp-fldv-expanded') === true,
    monitor: folder?.querySelector('textarea')?.value ?? null,
    forgetFound: forget !== undefined,
    forgetHidden: forget?.closest('.tp-v-hidden') != null,
  };
})()`;

/** The monitor shows exactly what the hook returns. */
const MONITOR_MATCHES_HOOK = `(() => {
  const area = (${FIND_FOLDER})?.querySelector('textarea');
  return area !== undefined && area !== null && window.__blackbox !== undefined &&
    area.value === window.__blackbox.text();
})()`;

interface ReadoutVisit {
  readonly viewport: { readonly width: number; readonly height: number };
  /** Abort the pane's chunk, so the pane never arrives. */
  readonly blockPane?: boolean;
  /** Seed the record of a session that died, before any script runs. */
  readonly seedDeath?: boolean;
  /** Seed the record of a session that ended cleanly: it must not open anything. */
  readonly seedClean?: boolean;
  /** The pane is expected: wait for it and for the monitor to catch up. */
  readonly awaitPane: boolean;
}

async function visitReadout(
  browser: Browser,
  origin: string,
  how: ReadoutVisit,
): Promise<ReadoutReading> {
  const context = await browser.createBrowserContext();
  const errors: string[] = [];
  let aborted = 0;
  let matched = false;
  try {
    const page = await context.newPage();
    await page.setViewport(how.viewport);
    page.on('pageerror', (error: unknown) => {
      errors.push(error instanceof Error ? error.message : String(error));
    });
    if (how.blockPane === true) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.resourceType() === 'script' && PANE_CHUNK.test(request.url())) {
          aborted += 1;
          void request.abort();
        } else {
          void request.continue();
        }
      });
    }
    if (how.seedDeath === true || how.seedClean === true) {
      const record = how.seedClean === true ? { ...DEAD_RECORD, clean: true } : DEAD_RECORD;
      await page.evaluateOnNewDocument(
        `localStorage.setItem(${JSON.stringify(BLACKBOX_KEY)}, ${JSON.stringify(
          JSON.stringify(record),
        )})`,
      );
    }
    await page.goto(`${origin}/?debug`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    if (how.awaitPane) {
      await until(page, `document.querySelector('${TUNER_MARKER}') !== null`, 'the pane to load');
      matched = await until(
        page,
        MONITOR_MATCHES_HOOK,
        "the readout monitor to equal the hook's text",
      );
    } else {
      // The absence of a pane has no event to wait on: give the aborted import
      // time to reject and the plain readout its first tick, then read.
      await until(page, 'window.__blackbox !== undefined', 'the black box hook');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const now = (await page.evaluate(READ_READOUT)) as Omit<
      ReadoutReading,
      'matched' | 'aborted' | 'errors'
    >;
    return { ...now, matched, aborted, errors };
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
    if (after.titles.join('|') !== `Pickup tuner|Black box|${TUNING_TITLE}`) {
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

async function checkReadout(browser: Browser, origin: string): Promise<TunerChecked> {
  const none = await visitReadout(browser, origin, {
    viewport: VIEWPORT,
    blockPane: true,
    awaitPane: false,
  });
  // Narrow and after a clean exit: the previous session is in the text, and nothing
  // may open on its account.
  const loaded = await visitReadout(browser, origin, {
    viewport: PANE_NARROW_VIEWPORT,
    seedClean: true,
    awaitPane: true,
  });
  const died = await visitReadout(browser, origin, {
    viewport: PANE_NARROW_VIEWPORT,
    seedDeath: true,
    awaitPane: true,
  });

  const lines = [
    `no pane      chunk aborted ${String(none.aborted)}x   plain readout ${none.plainShown ? 'shown' : 'NOT SHOWN'}   ` +
      `hook ${none.hook === null ? 'ABSENT' : `${String(none.hook.length)} chars`}`,
    `pane loaded after a clean exit at ${String(PANE_NARROW_VIEWPORT.width)}px   pane ${loaded.paneExpanded ? 'OPEN' : 'collapsed'}   forget ${
      loaded.forgetFound ? (loaded.forgetHidden ? 'hidden' : 'SHOWN') : 'NOT FOUND'
    }   monitor ${loaded.monitor === null ? 'NOT FOUND' : `${String(loaded.monitor.length)} chars`}   ` +
      `${loaded.matched ? 'equals' : 'DIFFERS FROM'} the hook   ` +
      `plain readout ${loaded.plainShown ? 'STILL SHOWN' : 'stepped aside'}`,
    `staged death at ${String(PANE_NARROW_VIEWPORT.width)}px   pane ${died.paneExpanded ? 'open' : 'CLOSED'}   ` +
      `folder ${died.folderExpanded ? 'open' : 'CLOSED'}   death line ${
        died.monitor?.includes('PREVIOUS SESSION DIED') === true ? 'shown' : 'MISSING'
      }`,
  ];
  return { lines, failures: judgeReadout(none, loaded, died) };
}

/** The three pages against the three claims; each failure names the dropped part. */
function judgeReadout(
  none: ReadoutReading,
  loaded: ReadoutReading,
  died: ReadoutReading,
): string[] {
  const failures: string[] = [];
  for (const [name, page] of [
    ['no pane', none],
    ['pane loaded', loaded],
    ['staged death', died],
  ] as const) {
    for (const error of page.errors) failures.push(`readout (${name}): page error, ${error}`);
    if (page.hook === null) {
      failures.push(`readout (${name}): window.__blackbox.text() is not published behind ?debug`);
    }
  }

  // No pane: the plain readout carries it, so the control must really have blocked.
  if (none.aborted === 0) {
    failures.push(
      'readout (no pane, control): the pane chunk was never requested and aborted, so "the plain ' +
        `readout shows with no pane" proves nothing (chunk pattern ${String(PANE_CHUNK)})`,
    );
  }
  if (none.pane) failures.push('readout (no pane): a pane drew although its chunk was aborted');
  if (!none.plainShown) {
    failures.push(
      'readout (no pane): the plain readout is not showing, so a pane that never loads hides the record',
    );
  } else if (none.hook !== null && !none.plainText.includes(none.hook)) {
    failures.push("readout (no pane): the plain readout does not hold the hook's text");
  }

  // Pane: the folder holds the same text, and the plain element has stepped aside.
  if (!loaded.pane || !loaded.folder) {
    failures.push('readout (pane loaded): the pane has no "Black box" folder');
  } else if (!loaded.matched) {
    failures.push(
      'readout (pane loaded): the monitor textarea .value never equalled window.__blackbox.text(): ' +
        `${JSON.stringify(loaded.monitor)} against ${JSON.stringify(loaded.hook)}`,
    );
  }
  if (loaded.plainShown) {
    failures.push(
      'readout (pane loaded): the plain readout still shows beside the folder, so nothing claimed it',
    );
  }
  if (loaded.paneExpanded) {
    failures.push('readout (pane loaded): a clean exit opened the pane at 700px');
  }
  if (!loaded.folderExpanded) {
    failures.push(
      'readout (pane loaded): the Black box folder starts closed, where it starts open',
    );
  }
  if (!loaded.forgetFound || !loaded.forgetHidden) {
    failures.push(
      'readout (pane loaded): the forget button is missing or shown with no lost-context record to forget',
    );
  }

  // A death opens the pane and the folder at a width where the pane starts closed.
  if (!died.paneExpanded) failures.push('readout (staged death): the pane is collapsed at 700px');
  if (!died.folderExpanded) failures.push('readout (staged death): the Black box folder is closed');
  if (died.monitor?.includes('PREVIOUS SESSION DIED') !== true) {
    failures.push('readout (staged death): the folder does not show the death line');
  }
  if (!died.matched) {
    failures.push(
      'readout (staged death): the monitor never equalled window.__blackbox.text() with a record part in it',
    );
  }
  return failures;
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
  turn: TurnRead | undefined;
  phone: PhoneRead | undefined;
  spread: SpreadChecked;
  atRest: AtRestChecked;
  controls: LinesAndFailures;
  drawerCells: DrawerChecked;
  overlap: LinesAndFailures;
  lost: readonly string[];
  lit: LitChecked;
  fallback: FallbackChecked;
  sampling: SamplingChecked;
  tuner: TunerChecked;
  tuning: TunerChecked;
  readout: TunerChecked;
  analytics: TunerChecked;
  notices: LinesAndFailures;
  noticeModal: LinesAndFailures;
  noticeOver: LinesAndFailures;
}): void {
  const {
    skipped,
    bookCount,
    bookcaseOverflow,
    stats,
    cost,
    errors,
    pickup,
    turn,
    phone,
    spread,
    atRest,
    controls,
    drawerCells,
    overlap,
    lost,
    lit,
    fallback,
    sampling,
    tuner,
    tuning,
    readout,
    analytics,
    notices,
    noticeModal,
    noticeOver,
  } = result;
  const failures: string[] = [
    ...fallback.failures,
    ...sampling.failures,
    ...tuner.failures,
    ...tuning.failures,
    ...readout.failures,
    ...analytics.failures,
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
    console.log(
      `arrives closed    board ${pickup.closed.boardAngle.toFixed(2)}°   pages ${
        pickup.closed.pagesHidden ? 'hidden' : 'SHOWING'
      }   X ${pickup.closed.xOnScreen ? 'on screen' : 'OFF SCREEN'}   hint "${pickup.closed.hint}"`,
    );
    console.log(`page announced    ${pickup.announced || 'NOTHING'}`);
    console.log(`second book       ${pickup.second.announced || 'NOTHING'}`);
    console.log(
      `address           ${pickup.hrefUnchanged && pickup.afterPutBack.hrefUnchanged ? 'unchanged' : 'CHANGED'}   ` +
        `put back ${pickup.afterPutBack.held ? 'LEFT IT HELD' : 'yes'}`,
    );
  }
  console.log(
    `turning           ${
      turn === undefined
        ? 'NOT CHECKED'
        : `drag ${turn.turned ? 'turns' : 'DOES NOT TURN'}   arrow ${
            turn.keyTurned ? '15°' : 'NOT 15°'
          }   tap ${turn.tapOpensSquare ? 'opens square' : 'DOES NOT OPEN SQUARE'}   close ${
            turn.closeArrow.atClosedRest && turn.closeFoot.atClosedRest
              ? 'returns to the closed rest'
              : 'DOES NOT RETURN'
          }   focus ${
            turn.closeArrow.focusOnX && turn.closeFoot.focusOnX ? 'on the X' : 'LOST'
          }   escape ${
            turn.escapeFromClosed && turn.escapeFromOpen && turn.escapeMidClose
              ? 'puts it back'
              : 'DOES NOT PUT IT BACK'
          }   reduced motion ${turn.reducedCuts ? 'cuts' : 'TWEENS'}   return ${
            turn.returned === undefined
              ? 'NOT SAMPLED'
              : `${String(turn.returned.frames.length)} frames`
          }   held copy ${
            turn.held === undefined ? 'none named' : turn.showedHeld ? 'worn' : 'NOT WORN'
          }   without one ${
            turn.withoutHeld === undefined
              ? 'NOT FOUND'
              : turn.withoutHeld.showedOwn
                ? 'wears its own'
                : 'DOES NOT WEAR ITS OWN'
          }   no cover ${
            turn.coverlessCloses === undefined
              ? 'NOT FOUND'
              : turn.coverlessCloses
                ? 'closes'
                : 'DOES NOT'
          }   failed copy ${turn.fellBack ? 'falls back' : 'DOES NOT FALL BACK'}   fetched ${
            turn.fetchedNothing ? 'nothing new' : 'SOMETHING'
          }   paths ${
            turn.pathInPage ? 'WRITTEN INTO THE PAGE' : 'kept off the page'
          }   back mid-close ${turn.backMidClose ? 'empties the hand' : 'LEAVES IT HELD'}`
    }`,
  );
  console.log(
    `page at 375x812   ${
      phone === undefined
        ? 'NOT CHECKED'
        : `in view ${phone.pageInView ? 'yes' : 'NO'}   title leads ${
            phone.titleLeads ? 'yes' : 'NO'
          }   put-back on screen ${phone.putBackInView ? 'yes' : 'NO'} open, ${
            phone.closedXOnScreen ? 'yes' : 'NO'
          } closed`
    }`,
  );
  console.log('open spread at rest, 1280x800 (§3.6)');
  for (const line of spread.lines) console.log(`  ${line}`);
  console.log('held page at rest, long Thoughts planted (#426)');
  for (const line of atRest.lines) console.log(`  ${line}`);
  console.log('the closed book and its controls (#531)');
  for (const line of controls.lines) console.log(`  ${line}`);
  console.log('the Ask drawer over a held book (#531)');
  for (const line of drawerCells.lines) console.log(`  ${line}`);
  console.log('the attribution and privacy notices (#536)');
  for (const line of notices.lines) console.log(`  ${line}`);
  console.log('the notice modal over the shelf (#536)');
  for (const line of noticeModal.lines) console.log(`  ${line}`);
  console.log('a notice over the Ask drawer and a held book (#536)');
  for (const line of noticeOver.lines) console.log(`  ${line}`);
  console.log('the hint, the X and the brand off the book (#553)');
  for (const line of overlap.lines) console.log(`  ${line}`);
  console.log(
    `  lost context, book held  ${lost.length === 0 ? 'put away, controls hidden, focus caught' : 'FAILED'}`,
  );
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
  console.log('black box readout, each page in a browser context of its own');
  for (const line of readout.lines) console.log(`  ${line}`);
  console.log('analytics calls and outside requests (C8, C11)');
  for (const line of analytics.lines) console.log(`  ${line}`);
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
    ...turnFailures(turn),
    ...phoneFailures(phone),
    ...spread.failures,
    ...atRest.failures,
    ...controls.failures,
    ...drawerCells.failures,
    ...notices.failures,
    ...noticeModal.failures,
    ...noticeOver.failures,
    ...overlap.failures,
    ...lost,
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
function run(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = gateBuildEnv(process.env),
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // `shellCommand`, not an args array: this spawns `pnpm`, which needs a shell
    // on Windows, and an array alongside one is DEP0190.
    const child = spawn(shellCommand(command, args), {
      cwd: REPO_ROOT,
      shell: true,
      stdio: 'inherit',
      // The switch is removed unless this run was asked for `--analytics-on`.
      env,
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
async function buildSite(analyticsOn: boolean): Promise<void> {
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
  await run(
    'pnpm',
    ['--filter', '@stacks/site', 'run', 'build'],
    gateBuildEnv(process.env, analyticsOn),
  );
}

/**
 * C8 and C11: the shelf asks for each analytics event as S6 says, and an on build
 * makes no request to another host.
 *
 * It serves from localhost, so the tracker never starts: `attempted()` records
 * what the call sites asked for either way, which is what this reads. A pickup
 * sends no page view, because the tracker never starts here; `tracker.test.ts`
 * holds that count against the real tracker. Every request to a host other than
 * the page itself is counted over the whole walk, and a CSP violation is a
 * console error. The gzip of the site scripts is printed so the pull request
 * can record what an on build adds over an off one.
 */
async function checkAnalyticsCalls(
  browser: Browser,
  origin: string,
  analyticsOn: boolean,
): Promise<TunerChecked> {
  const failures: string[] = [];
  const requested: string[] = [];
  const consoleErrors: string[] = [];
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport(VIEWPORT);
    page.on('request', (request) => requested.push(request.url()));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    const settle = watchSettle(page);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    if (!(await settle())) failures.push('analytics: the shelf never settled');

    const attempted = async (): Promise<Attempt[]> =>
      (await page.evaluate('window.__shelf.attempted().slice()')) as Attempt[];
    const toggle = async (expanded: boolean): Promise<void> => {
      // Open with the launcher, shut with the panel's own button: an open panel covers
      // the launcher. Each waits for the slide to end, because a button mid-slide has
      // no clickable point.
      await page.click(expanded ? '#ask-launcher' : '#ask-close');
      await until(
        page,
        `document.getElementById('ask-launcher').getAttribute('aria-expanded') === '${String(expanded)}'`,
        `the drawer to be ${expanded ? 'open' : 'shut'}`,
      );
      await until(
        page,
        `(() => { const panel = document.getElementById('ask-panel'); return !panel.classList.contains('is-entering') && !panel.classList.contains('is-leaving'); })()`,
        'the drawer to finish sliding',
      );
    };

    // The drawer, from shut, twice, with nothing held.
    await toggle(true);
    await toggle(false);
    await toggle(true);
    await toggle(false);
    const drawer = await attempted();

    // A real click lands a book.
    const first = await clickToPickUp(page, HELD);
    if (first === undefined) {
      failures.push('analytics: a click never picked a book up');
      return { lines: [], failures };
    }
    await until(page, HELD, 'the clicked book to come to rest held');
    const clicked = await attempted();

    // A chat link to another book, then to the book already in the hand.
    const heldTitle = (await page.evaluate('window.__shelf.held()?.title')) as string;
    const library = (await page.evaluate(
      `fetch('/library.json').then((response) => response.json())`,
    )) as { books: { id: string; title: string }[] };
    const other = library.books.find(
      (book) =>
        book.title !== heldTitle &&
        library.books.filter((candidate) => candidate.title === book.title).length === 1,
    );
    if (other === undefined) {
      failures.push('analytics: no second book to link to');
      return { lines: [], failures };
    }
    const link = `window.dispatchEvent(new CustomEvent('stacks:pick-up', { detail: { id: ${JSON.stringify(other.id)} } }))`;
    await page.evaluate(link);
    await until(
      page,
      `window.__shelf.held()?.phase === 'held' && window.__shelf.held()?.title === ${JSON.stringify(other.title)}`,
      'the chat-linked book to come to rest held',
    );
    const chat = await attempted();
    await page.evaluate(link);
    // Absence (K1): time for a wrong second count to have happened. A slower
    // runner can only make this weaker, never flaky.
    await new Promise((resolve) => setTimeout(resolve, PUT_BACK_CHANCE_MS));
    const chatAgain = await attempted();

    if (!(await openBook(page, 'the held book for the analytics check'))) {
      failures.push('analytics: the held book never opened');
      return { lines: [], failures };
    }
    const opened = await attempted();

    failures.push(
      ...judgeAnalyticsCalls({ drawer, clicked, chat, chatId: other.id, chatAgain, opened }),
    );

    const foreign = foreignRequests(requested, origin);
    if (foreign.length > 0) {
      failures.push(
        `analytics: ${String(foreign.length)} request(s) to another host, the first ${foreign[0] ?? ''}`,
      );
    }
    const csp = consoleErrors.filter((text) => /content security policy/i.test(text));
    if (csp.length > 0) {
      failures.push(`analytics: ${String(csp.length)} CSP violation(s): ${csp[0] ?? ''}`);
    }

    return {
      lines: [
        `build               analytics ${analyticsOn ? 'on' : 'off'}`,
        `events asked for    ${opened.map((entry) => entry.name).join(', ')}`,
        `other-host requests ${String(foreign.length)}   CSP violations ${String(csp.length)}`,
        `site script gzip    ${String(scriptGzipBytes())} bytes`,
      ],
      failures,
    };
  } finally {
    await context.close();
  }
}

/* -------------------------------------------------------------------------- */

/**
 * G35, the notices (#536, `notice-modals.md` C5 and C6): the type a notice is read in,
 * on the two direct pages, with JavaScript off. The modal's cells read the same
 * properties through the same function, so "equal on the page and in the modal"
 * is a comparison of two readings and not of two assertions.
 */
const NOTICE_MIN_PX = 18;
const NOTICE_MIN_CONTRAST = 7;
/** Line-height as a multiple of the font size, at least. */
const NOTICE_MIN_LEADING = 1.5;
const NOTICE_VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'phone 375x812', width: 375, height: 812 },
] as const;

/** One element's type, as the browser computes it. */
interface TypeRead {
  readonly size: number;
  readonly leading: number;
  readonly weight: string;
  readonly family: string;
  readonly color: string;
  /** The first opaque background up the tree, which is what the text is read against. */
  readonly background: string;
}

interface NoticeType {
  readonly p: TypeRead;
  readonly h1: TypeRead;
  /** Absent on a notice with no sub-headings, which the privacy notice is. */
  readonly h2: TypeRead | null;
  /** Absent in a notice with no link, which the modal's privacy panel is: the page's way back is a link. */
  readonly a: TypeRead | null;
}

/** The type of the first `p`, `h1`, `h2` and `a` under `root`, as one expression for the page. */
function readNoticeType(root: string): string {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(root)});
    if (root === null) return null;
    const read = (selector) => {
      const element = root.querySelector(selector);
      if (element === null) return null;
      const style = getComputedStyle(element);
      let background = 'rgba(0, 0, 0, 0)';
      for (let node = element; node !== null; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor;
        if (!/rgba\\(.*, 0\\)$/.test(value) && value !== 'transparent') { background = value; break; }
      }
      return {
        size: parseFloat(style.fontSize),
        leading: parseFloat(style.lineHeight),
        weight: style.fontWeight,
        family: style.fontFamily,
        color: style.color,
        background,
      };
    };
    const found = { p: read('p'), h1: read('h1'), h2: read('h2'), a: read('a') };
    return found.p === null || found.h1 === null ? null : found;
  })()`;
}

function channels(colour: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = (colour.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b];
}

function luminance(colour: string): number {
  const [r, g, b] = channels(colour).map((value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two computed colours. */
function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** What is wrong with a notice's type, one sentence each; empty when it reads well. */
function noticeTypeFailures(where: string, type: NoticeType | null): string[] {
  if (type === null) return [`${where}: no paragraph or heading to read`];
  const failures: string[] = [];
  const { p } = type;
  if (p.size < NOTICE_MIN_PX) {
    failures.push(`${where}: body text is ${String(p.size)}px, under ${String(NOTICE_MIN_PX)}px`);
  }
  const ratio = contrastRatio(p.color, p.background);
  if (ratio < NOTICE_MIN_CONTRAST) {
    failures.push(
      `${where}: body text is ${ratio.toFixed(2)}:1 on its background, under ${String(NOTICE_MIN_CONTRAST)}:1`,
    );
  }
  if (p.leading < p.size * NOTICE_MIN_LEADING) {
    failures.push(
      `${where}: line-height ${String(p.leading)}px is under ${String(NOTICE_MIN_LEADING)} times the size`,
    );
  }
  return failures;
}

/** What each direct page must say, so a page that lost its text is not read as well-typed. */
const NOTICE_PAGES = [
  { path: '/attribution', says: 'Apple Books is a service mark of Apple Inc.' },
  { path: '/privacy', says: 'Questions pass through Cloudflare' },
] as const;

/**
 * C5 on the pages, and C6: both direct pages, at both widths, with JavaScript
 * off — the type, the text, the way back and `noindex`.
 */
async function checkNoticePages(
  browser: Browser,
  origin: string,
): Promise<LinesAndFailures & { readonly types: ReadonlyMap<string, NoticeType | null> }> {
  const failures: string[] = [];
  const lines: string[] = [];
  const types = new Map<string, NoticeType | null>();
  const context = await browser.createBrowserContext();
  try {
    for (const { path, says } of NOTICE_PAGES) {
      for (const viewport of NOTICE_VIEWPORTS) {
        const where = `notice ${path}, ${viewport.name}`;
        const page = await context.newPage();
        try {
          await page.setJavaScriptEnabled(false);
          await page.setViewport({ width: viewport.width, height: viewport.height });
          // A trailing slash: the static server resolves a folder's index only for one.
          await page.goto(`${origin}${path}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          const type = (await page.evaluate(readNoticeType('main'))) as NoticeType | null;
          failures.push(...noticeTypeFailures(where, type));
          types.set(`${path} ${viewport.name}`, type);
          const read = (await page.evaluate(`(() => ({
            text: document.querySelector('main')?.textContent ?? '',
            back: document.querySelector('main a[href="/"]') !== null,
            robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
            sideways: document.documentElement.scrollWidth > innerWidth,
          }))()`)) as { text: string; back: boolean; robots: string; sideways: boolean };
          if (!read.text.includes(says)) failures.push(`${where}: the notice text is not there`);
          if (!read.back) failures.push(`${where}: no way back to the shelf`);
          if (!/noindex/.test(read.robots)) failures.push(`${where}: no noindex`);
          if (read.sideways) failures.push(`${where}: the page scrolls sideways`);
          if (type !== null) {
            const ratio = contrastRatio(type.p.color, type.p.background).toFixed(2);
            lines.push(
              `${path.padEnd(13)} ${viewport.name.padEnd(17)} body ${String(type.p.size)}px, ${ratio}:1, ` +
                `line ${String(type.p.leading)}px   text ${read.text.includes(says) ? 'there' : 'MISSING'}   ` +
                `${/noindex/.test(read.robots) ? 'noindex' : 'INDEXABLE'}`,
            );
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { lines, failures, types };
}

/** Two readings of the same notice, in two places, must agree on every property (C5). */
function noticeTypeDifferences(a: NoticeType, b: NoticeType): string[] {
  const differences: string[] = [];
  for (const part of ['p', 'h1', 'h2', 'a'] as const) {
    const [left, right] = [a[part], b[part]];
    if (left === null || right === null) {
      // A link is the page's own way back; the modal's privacy panel has none to compare.
      if (left !== right && part !== 'a') differences.push(`${part}: present in one reading only`);
      continue;
    }
    for (const key of Object.keys(left) as (keyof TypeRead)[]) {
      if (left[key] !== right[key]) {
        differences.push(`${part} ${key}: ${String(left[key])} against ${String(right[key])}`);
      }
    }
  }
  return differences;
}

/** The modal's state, as one sentence's worth of facts. */
const READ_MODAL = `(() => {
  const d = document.getElementById('notice-dialog');
  const a = document.activeElement;
  return {
    open: d !== null && d.open,
    labelledby: d?.getAttribute('aria-labelledby') ?? '',
    shown: d === null ? [] : [...d.querySelectorAll('section')].filter((s) => !s.hidden).map((s) => s.id),
    active: a === null ? '' : a.id || a.tagName,
    activeInDialog: d !== null && d.contains(a),
    activeIsOpener: a?.getAttribute('href') === '/attribution' && !d?.contains(a),
  };
})()`;

interface ModalRead {
  readonly open: boolean;
  readonly labelledby: string;
  readonly shown: readonly string[];
  readonly active: string;
  readonly activeInDialog: boolean;
  readonly activeIsOpener: boolean;
}

/** The accessible name the browser computes for the dialog, from its accessibility tree. */
async function dialogName(page: Page): Promise<string> {
  const dialog = await page.$('#notice-dialog');
  if (dialog === null) return '(no dialog)';
  const tree = await page.accessibility.snapshot({ root: dialog, interestingOnly: false });
  return tree?.name ?? '(no name)';
}

/**
 * Whether the last paragraph of the shown panel scrolls into the dialog's box: the key moves the
 * dialog by a smooth scroll, so this waits for it to land and a miss is the answer.
 */
async function lastLineScrolledIn(page: Page): Promise<boolean> {
  return searchFor(page, LAST_LINE_IN_VIEW, 2500);
}

/** Whether the last paragraph of the shown panel is inside the dialog's visible box. */
const LAST_LINE_IN_VIEW = `(() => {
  const d = document.getElementById('notice-dialog');
  const panel = [...d.querySelectorAll('section')].find((s) => !s.hidden);
  const last = [...panel.querySelectorAll('p')].at(-1);
  const box = d.getBoundingClientRect();
  const line = last.getBoundingClientRect();
  // Inside the dialog's box and on the screen: a dialog taller than the screen holds its own
  // last line in its own box and shows none of it (notice-modals.md N13).
  return line.bottom <= box.bottom + 1 && line.top >= box.top && line.bottom <= window.innerHeight && line.top >= 0;
})()`;

/**
 * G35, the notice modal opened from the shelf's Attribution link (#536, `notice-modals.md` C1,
 * C2, C5 and the browser half of C7), with no drawer and no held book (`checkNoticeOverDrawer`
 * reads the drawer and a held book). At both widths: focus goes in, cycles at both ends, the dialog is
 * named by the panel shown before and after the swap to the privacy panel, the type is the
 * pages' type, the last line of each notice scrolls into view, one Escape closes it and returns
 * focus to the link, a click on the backdrop closes it, a ctrl-click opens the page and not the
 * modal, and through all of it nothing navigated and a sentinel set on `window` survived.
 */
async function checkNoticeModal(
  browser: Browser,
  origin: string,
  pageTypes: ReadonlyMap<string, NoticeType | null>,
): Promise<LinesAndFailures> {
  const failures: string[] = [];
  const lines: string[] = [];
  for (const viewport of NOTICE_VIEWPORTS) {
    const where = `notice modal, ${viewport.name}`;
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
      await page.evaluate('window.__noticeSentinel = 7');
      let navigations = 0;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1;
      });
      const read = async (): Promise<ModalRead> => (await page.evaluate(READ_MODAL)) as ModalRead;
      const say = (what: string, ok: boolean): void => {
        if (!ok) failures.push(`${where}: ${what}`);
      };
      const link = '.pattr-link[href="/attribution"]';

      // Opening: a plain click on the shelf's link.
      await page.click(link);
      let state = await read();
      say('a click on Attribution did not open the modal', state.open);
      // Nothing below reads a modal that never opened, and the rest would only throw.
      if (!state.open) continue;
      say(
        `the first panel shown is ${state.shown.join()}, not the attribution notice`,
        state.shown.join() === 'notice-attribution',
      );
      say(`focus starts on ${state.active}, not the close button`, state.active === 'notice-close');
      say(
        `the dialog is named by ${state.labelledby}`,
        state.labelledby === 'notice-attribution-title',
      );
      const name = await dialogName(page);
      say(`the dialog's accessible name is "${name}", not "Attribution"`, name === 'Attribution');

      // The type, equal to the direct page's (C5), and the end of the notice reachable (C2).
      const modalType = (await page.evaluate(
        readNoticeType('#notice-attribution'),
      )) as NoticeType | null;
      failures.push(...noticeTypeFailures(`${where}, attribution`, modalType));
      const pageType = pageTypes.get(`/attribution ${viewport.name}`) ?? null;
      if (modalType !== null && pageType !== null) {
        for (const difference of noticeTypeDifferences(pageType, modalType)) {
          failures.push(`${where}: the type differs from the page's: ${difference}`);
        }
      }
      await page.keyboard.press('End');
      say(
        'the last line of the attribution notice cannot be scrolled into view',
        await lastLineScrolledIn(page),
      );
      await page.evaluate('document.getElementById("notice-close").focus()');

      // Tab cycles inside: forward round the whole ring, then back from the first.
      const ring = (await page.evaluate(
        `[...document.querySelectorAll('#notice-dialog button, #notice-dialog a[href]')].filter((e) => !e.closest('[hidden]')).length`,
      )) as number;
      let escaped = false;
      for (let step = 0; step < ring; step += 1) {
        await page.keyboard.press('Tab');
        if (!(await read()).activeInDialog) escaped = true;
      }
      say('Tab left the modal', !escaped);
      say(
        'Tab round the ring did not come back to the close button',
        (await read()).active === 'notice-close',
      );
      await page.keyboard.down('Shift');
      await page.keyboard.press('Tab');
      await page.keyboard.up('Shift');
      state = await read();
      say('Shift+Tab from the close button left the modal', state.activeInDialog);

      // The in-notice link swaps the panel: name follows, focus lands on the heading.
      await page.click('#notice-attribution a[href="/privacy"]');
      state = await read();
      say('the privacy link closed the modal instead of swapping the panel', state.open);
      say(
        `the panel shown after the swap is ${state.shown.join()}`,
        state.shown.join() === 'notice-privacy',
      );
      say(
        `the dialog is named by ${state.labelledby} after the swap`,
        state.labelledby === 'notice-privacy-title',
      );
      say(
        `focus is on ${state.active} after the swap, not the privacy heading`,
        state.active === 'notice-privacy-title',
      );
      const swapped = await dialogName(page);
      say(
        `the accessible name after the swap is "${swapped}", not "Privacy"`,
        swapped === 'Privacy',
      );
      const privacyType = (await page.evaluate(
        readNoticeType('#notice-privacy'),
      )) as NoticeType | null;
      failures.push(...noticeTypeFailures(`${where}, privacy`, privacyType));
      const privacyPage = pageTypes.get(`/privacy ${viewport.name}`) ?? null;
      if (privacyType !== null && privacyPage !== null) {
        for (const difference of noticeTypeDifferences(privacyPage, privacyType)) {
          failures.push(`${where}: the privacy type differs from the page's: ${difference}`);
        }
      }
      await page.evaluate('document.getElementById("notice-close").focus()');
      await page.keyboard.press('End');
      say(
        'the last line of the privacy notice cannot be scrolled into view',
        await lastLineScrolledIn(page),
      );

      // One Escape closes it, and focus goes back to the link that opened it first.
      await page.keyboard.press('Escape');
      state = await read();
      say('Escape did not close the modal', !state.open);
      say(
        `focus is on ${state.active} after the close, not the Attribution link`,
        state.activeIsOpener,
      );

      // The backdrop closes it too.
      await page.click(link);
      say('the modal did not open a second time', (await read()).open);
      await page.mouse.click(2, 2);
      say('a click on the backdrop did not close the modal', !(await read()).open);

      // A modified click is the browser's: a new tab, and no modal.
      const before = (await browser.pages()).length;
      await page.keyboard.down('Control');
      await page.click(link);
      await page.keyboard.up('Control');
      await new Promise((resolve) => setTimeout(resolve, 400));
      say('a ctrl-click opened the modal', !(await read()).open);
      const tabs = await browser.pages();
      say('a ctrl-click did not open the page in a new tab', tabs.length > before);
      for (const extra of tabs.slice(before)) await extra.close();

      say(`the page navigated ${String(navigations)} time(s)`, navigations === 0);
      say(
        'the window sentinel did not survive',
        (await page.evaluate('window.__noticeSentinel')) === 7,
      );
      lines.push(
        `${viewport.name.padEnd(17)} opens, Tab ring of ${String(ring)}, swap names "${swapped}", ` +
          `Escape and backdrop close, ctrl-click is the page's, ${String(navigations)} navigations`,
      );
    } finally {
      await context.close();
    }
  }
  return { lines, failures };
}

/** What C1 to C3 say must not change behind the modal, as one comparable string. */
const READ_BEHIND = `(() => {
  const h = window.__shelf.held();
  return JSON.stringify({
    drawer: document.getElementById('ask-launcher').getAttribute('aria-expanded'),
    title: h?.title ?? null,
    phase: h?.phase ?? null,
    opened: h?.opened ?? null,
    yaw: h?.turn.yaw ?? null,
    pitch: h?.turn.pitch ?? null,
    thread: document.getElementById('ask-thread').textContent,
  });
})()`;

const NOTICE_OPEN = `document.getElementById('notice-dialog').open`;

/** The two links that open a notice, and which panel each shows. */
const NOTICE_OPENERS = [
  {
    name: 'the shelf link',
    selector: '.pattr-link[href="/attribution"]',
    panel: 'notice-attribution',
    title: 'Attribution',
  },
  {
    name: 'the drawer link',
    selector: '#ask-panel a[href="/privacy"]',
    panel: 'notice-privacy',
    title: 'Privacy',
  },
] as const;

/**
 * G35, a notice opened over a held book and an open drawer (#536, `notice-modals.md` C1, C2 and
 * C3), from each of the two links, at 1280x800: the conversation, the drawer, the held book and
 * its turn survive the open and the close; the dialog's name, the focus at the open and the
 * focus back on the opener are read from each link; a click on the shelf beside the notice, on
 * the corner by the brand and on the drawer panel beside it reaches nothing (the backdrop closes
 * the modal and that is all it does); a click on the notice's own text does nothing; the arrows with focus on `body` turn no book; one
 * Escape closes the modal alone, leaving the drawer open and the book held, and the next one is
 * the drawer's; the drawer link opens no new tab; and nothing navigated.
 */
async function checkNoticeOverDrawer(browser: Browser, origin: string): Promise<LinesAndFailures> {
  const failures: string[] = [];
  const lines: string[] = [];
  for (const opener of NOTICE_OPENERS) {
    const where = `notice over the drawer, from ${opener.name}`;
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
      const say = (what: string, ok: boolean): void => {
        if (!ok) failures.push(`${where}: ${what}`);
      };

      // G35's order: hold a book, open the drawer over it, ask. The offline build has no
      // Turnstile key, so the thread ends on the unavailable reply, which is enough to read.
      if (!(await holdClosed(page, 3, `the book for ${where}`))) {
        failures.push(`${where}: no book came to rest held`);
        continue;
      }
      await openDrawer(page);
      await page.type('#ask-input', 'What is on the shelf?');
      await page.click('#ask-send');
      const answered = await searchFor(
        page,
        `(() => { const t = document.getElementById('ask-thread').textContent ?? ''; return t.includes('What is on the shelf?') && !t.includes('Looking through the shelf') && t.length > 40; })()`,
        8000,
      );
      say('the question never got a reply in the thread', answered);

      await page.evaluate('window.__noticeSentinel = 11');
      let navigations = 0;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1;
      });
      const tabsBefore = (await browser.pages()).length;
      const before = (await page.evaluate(READ_BEHIND)) as string;
      const reopen = async (): Promise<boolean> => {
        try {
          await page.click(opener.selector);
        } catch {
          // The link is not there to click: a drawer that closed took its own link with it.
          return false;
        }
        return searchFor(page, NOTICE_OPEN, 2000);
      };
      const unchanged = async (what: string): Promise<void> => {
        say(
          `${what} changed the drawer, the book, its turn or the thread`,
          (await page.evaluate(READ_BEHIND)) === before,
        );
      };

      // C1: open, close by the X, and everything is as it was.
      const firstOpen = await reopen();
      say(`a click on ${opener.name} did not open the modal`, firstOpen);
      if (!firstOpen) {
        // The link did what a plain link does: a new tab, or a navigation that ended this page.
        const tabs = (await browser.pages()).length;
        say(`the link opened ${String(tabs - tabsBefore)} new tab(s) instead`, tabs === tabsBefore);
        say(`the page navigated ${String(navigations)} time(s) instead`, navigations === 0);
        continue;
      }
      say(
        'the wrong panel is shown',
        (await page.evaluate(
          `[...document.querySelectorAll('#notice-dialog section')].filter((s) => !s.hidden).map((s) => s.id).join()`,
        )) === opener.panel,
      );
      // C2 from this opener: the name is the shown panel's, focus starts on Close, and the close
      // puts focus back on this opener and no other.
      const opened = await dialogName(page);
      say(
        `the dialog's accessible name is "${opened}", not "${opener.title}"`,
        opened === opener.title,
      );
      say(
        'focus did not start on the close button',
        (await page.evaluate(`document.activeElement?.id`)) === 'notice-close',
      );
      await unchanged('opening the notice');
      await page.click('#notice-close');
      say('the Close button did not close the modal', !(await page.evaluate(NOTICE_OPEN)));
      say(
        `focus did not return to ${opener.name}`,
        (await page.evaluate(
          `document.activeElement === document.querySelector(${JSON.stringify(opener.selector)})`,
        )) === true,
      );
      await unchanged('closing the notice');

      // C3: clicks behind the modal. Each lands on the backdrop, which closes the modal and
      // does nothing else; the notice's own text does not close it.
      // The notice is centred and 42rem wide, so the margins left and right of it are backdrop:
      // the shelf's bookcase on the left, the drawer's panel on the right, and the corner by the
      // brand. A held book stands behind the notice itself, which its own text answers below.
      const targets = [
        { name: 'a click on the shelf beside the notice', at: { x: 100, y: 400 } },
        { name: 'a click on the corner by the brand', at: { x: 60, y: 60 } },
        { name: 'a click on the drawer panel beside the notice', at: { x: 1150, y: 400 } },
      ];
      for (const target of targets) {
        if (!(await reopen())) {
          failures.push(`${where}: the modal did not reopen before ${target.name}`);
          continue;
        }
        await page.mouse.click(target.at.x, target.at.y);
        say(
          `${target.name} on the backdrop did not close the modal`,
          !(await page.evaluate(NOTICE_OPEN)),
        );
        await unchanged(target.name);
      }

      // C3, the notice's own text: a click does nothing.
      if (await reopen()) {
        await page.click(`#${opener.panel} p`);
        say(
          'a click on the notice text closed the modal',
          (await page.evaluate(NOTICE_OPEN)) === true,
        );
        await unchanged('a click on the notice text');

        // C3, the arrows with focus on `body`: no turn of the closed book behind the modal.
        await page.evaluate('document.activeElement?.blur()');
        for (const key of ['Home', 'ArrowRight', 'ArrowDown'] as const) {
          await page.keyboard.press(key);
        }
        await unchanged('the arrow keys');
        say('the arrows closed the modal', (await page.evaluate(NOTICE_OPEN)) === true);

        // C2: one Escape closes the modal alone.
        await page.keyboard.press('Escape');
        say('Escape did not close the modal', !(await page.evaluate(NOTICE_OPEN)));
        await unchanged('the one Escape');
      } else {
        failures.push(`${where}: the modal did not reopen for the text and key cells`);
      }

      // And the next Escape is the drawer's, with the book still held.
      await page.keyboard.press('Escape');
      await settleAfterEscape(page);
      const after = JSON.parse((await page.evaluate(READ_BEHIND)) as string) as {
        drawer: string;
        phase: string;
      };
      say(`the second Escape left the drawer ${after.drawer}`, after.drawer === 'false');
      say('the second Escape put the book back', after.phase === 'held');

      say(`the page navigated ${String(navigations)} time(s)`, navigations === 0);
      say(
        'the window sentinel did not survive',
        (await page.evaluate('window.__noticeSentinel')) === 11,
      );
      say('a new tab opened', (await browser.pages()).length === tabsBefore);
      lines.push(
        `${opener.name.padEnd(15)} opens over the drawer and a held book; conversation, drawer, book and turn unchanged by open, close, 3 backdrop clicks, text click, arrows, Escape; ${String(navigations)} navigations`,
      );
    } finally {
      await context.close();
    }
  }
  return { lines, failures };
}

/** A beat for a wrong second reaction to an Escape to register (an absence wait, K1). */
async function settleAfterEscape(page: Page): Promise<void> {
  await page.evaluate(
    `new Promise((resolve) => setTimeout(resolve, ${String(PUT_BACK_CHANCE_MS)}))`,
  );
}

/** Total gzip size of the built site scripts, for the pull request record of on versus off. */
function scriptGzipBytes(): number {
  const dir = join(DIST, '_astro');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .reduce((sum, file) => sum + gzipSync(readFileSync(join(dir, file))).length, 0);
}

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) {
    throw new Error(`no Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  }
  return found;
}

await main();
