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
import { DEFAULT_SETTINGS } from '../packages/site/src/shelf/shelf-settings.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { lightingOf, litFailures, type Frame, type Lighting } from './lib/large-library-lit.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';
import { serveDist } from './lib/serve-dist.ts';

const ARTIFACTS = join(REPO_ROOT, 'artifacts');
const OUTPUT = join(ARTIFACTS, 'shelf.png');
const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');

/**
 * G59's large library: generated at gate time, staged into `artifacts/` and
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
      const bookcaseOverflow = await page.evaluate('window.__shelf.bookcaseOverflow');
      const stats = (await page.evaluate(readCanvasStats)) as Stats;
      const cost = (await page.evaluate('window.__shelf.stats()')) as ShelfCost;

      writeFileSync(OUTPUT, await page.screenshot({ type: 'png' }));

      const cardOpened = await clickABook(page);
      const viewer = await checkCoverViewer(page);
      const sheet = await checkSheet(page);
      const lit = await checkLargeLibraryLit(browser, origin, large.origin);

      report({
        bookCount: Number(bookCount),
        bookcaseOverflow: Number(bookcaseOverflow),
        stats,
        cost,
        errors,
        cardOpened,
        viewer,
        sheet,
        lit,
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
  const plant = `tune=${encodeURIComponent(JSON.stringify(FOG_OVER_THE_BOOKCASE))}`;

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
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    // The same settle the main shot takes: textures land, the damped camera stops.
    await new Promise((resolve) => setTimeout(resolve, 1500));

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

/** `readCanvasStats`'s read, handed back whole, plus the books' rectangle. */
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
  /**
   * G35 — what the enhanced card actually put on the page.
   *
   * *"The card opened"* was the whole assertion for the life of this gate, and
   * it stayed true through a card that renders no reading line, links with no
   * accessible name and an announcer that never changes. Every field below is
   * one of the eight acceptance assertions in
   * `docs/spec/enhanced-card.md` §11, checked against the DOM a browser
   * actually built rather than against a model in a unit test.
   */
  readonly card: CardContents;
}

interface CardContents {
  /** Renders on every card, and leads with the status word — even for `read`. */
  readonly reading: string;
  /** Absent on the 5-of-41 books with none of the five object facts. */
  readonly hasObjectLine: boolean;
  /** Never absent: every book has a title, so every book has a search link. */
  readonly linkCount: number;
  /** Every `<a>` in the row, as `target|rel|name`. */
  readonly links: readonly string[];
  /**
   * How many of those links drew an actual mark.
   *
   * ⚠️ Until the fixture books were given contributor ids, this was **always
   * zero** and nothing noticed: every fixture book fell back to the one text
   * search link, so the row's normal state — three provider marks — had never
   * been rendered by a browser in this project's life. The artwork can now
   * regress to nothing and be caught.
   */
  readonly markCount: number;
  /** `«Title» by «Author»`, from the live region outside the card. */
  readonly announced: string;
  /**
   * Whether the close control survived a tap-to-swap.
   *
   * The one assertion the spec calls *"the one nothing else would notice"*: a
   * control inside the replaced subtree is destroyed and recreated on every
   * swap, dropping focus to `<body>` mid-browse.
   */
  readonly closeSurvivedSwap: boolean;
  /** The announcement after swapping to a second book — must have changed. */
  readonly announcedAfterSwap: string;
}

/**
 * §11's *"Two viewports, not one"*.
 *
 * The sheet and the corner card are one element with two presentations, and the
 * breakpoint is a fact two languages hold — so a gate that only ever runs at
 * 1440×900 proves nothing about the half of the spec that exists below 700px,
 * on the device the interaction model was designed for.
 */
interface SheetChecked {
  readonly fullBleed: boolean;
  readonly withinCap: boolean;
  readonly grabberVisible: boolean;
  /** A drag shorter than the dismiss threshold must snap back, not dismiss. */
  readonly survivedShortDrag: boolean;
}

/**
 * The enlarged cover — that it opens, that it is actually bigger, and that
 * leaving it leaves *only* it.
 *
 * The last one is the reason this is a browser check rather than a unit test.
 * The viewer is a modal `<dialog>`, so Escape is the platform's, and the page's
 * own Escape handler — which dismisses the card — is still listening on the
 * document. One keystroke closing both surfaces is invisible to every other
 * kind of test and immediately obvious here.
 */
interface CoverViewerChecked {
  readonly opened: boolean;
  /** Enlarged width ÷ thumbnail width. Under 2 is not "seeing it closer". */
  readonly enlargedBy: number;
  readonly escapeClosedViewer: boolean;
  /** ⚠️ The card must survive that same Escape. */
  readonly cardSurvivedEscape: boolean;
}

async function checkCoverViewer(page: Page): Promise<CoverViewerChecked | undefined> {
  // Walks the shelf for a book with a cover, since only some fixture books have
  // one and the card left open by the swap above may not be one of them.
  for (let index = 0; index < 60; index += 1) {
    const point = (await page.evaluate(`window.__shelf.projectBook(${index})`)) as
      { x: number; y: number } | undefined;
    if (point === undefined) continue;

    await page.mouse.click(Math.round(point.x), Math.round(point.y));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const thumbnail = (await page.evaluate(`(() => {
      const button = document.querySelector('#book-card-body .card-cover');
      if (!button) return undefined;
      const box = button.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2), width: box.width };
    })()`)) as { x: number; y: number; width: number } | undefined;
    if (thumbnail === undefined) continue;

    await page.mouse.click(thumbnail.x, thumbnail.y);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const open = (await page.evaluate(`(() => {
      const dialog = document.getElementById('cover-viewer');
      const image = document.getElementById('cover-viewer-image');
      return { open: Boolean(dialog?.open), width: image ? image.getBoundingClientRect().width : 0 };
    })()`)) as { open: boolean; width: number };

    await page.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 150));

    const after = (await page.evaluate(`(() => {
      const dialog = document.getElementById('cover-viewer');
      const card = document.getElementById('book-card');
      return { viewerOpen: Boolean(dialog?.open), cardOpen: Boolean(card) && !card.hidden };
    })()`)) as { viewerOpen: boolean; cardOpen: boolean };

    return {
      opened: open.open,
      enlargedBy: thumbnail.width === 0 ? 0 : open.width / thumbnail.width,
      escapeClosedViewer: !after.viewerOpen,
      cardSurvivedEscape: after.cardOpen,
    };
  }
  return undefined;
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
    const point = (await page.evaluate(`window.__shelf.projectBook(${index})`)) as
      { x: number; y: number } | undefined;
    if (point === undefined) continue;

    await page.mouse.click(Math.round(point.x), Math.round(point.y));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const opened = (await page.evaluate(`(() => {
      const card = document.getElementById('book-card');
      if (!card || card.hidden) return undefined;
      const box = card.getBoundingClientRect();
      const img = card.querySelector('img');
      const imgBox = img ? img.getBoundingClientRect() : null;
      const status = document.getElementById('book-card-status');
      const dismiss = document.getElementById('book-card-dismiss');
      const links = [...card.querySelectorAll('.card-links a')];
      return {
        title: card.querySelector('h2')?.textContent ?? '',
        // A thumbnail-sized cover fits the card even completely unstyled, so
        // only a full-resolution one actually exercises the overflow check.
        hasImage: Boolean(img) && img.naturalWidth >= 800,
        overflow: {
          card: Math.round(Math.max(0, box.right - innerWidth, box.bottom - innerHeight, -box.left, -box.top)),
          image: imgBox ? Math.round(Math.max(0, imgBox.right - box.right, imgBox.bottom - box.bottom)) : 0,
        },
        card: {
          reading: card.querySelector('.reading')?.textContent ?? '',
          hasObjectLine: Boolean(card.querySelector('.object')),
          linkCount: links.length,
          links: links.map((a) => [a.target, a.rel, a.title || a.textContent || ''].join('|')),
          markCount: links.filter((a) => a.querySelector('svg path')).length,
          announced: status ? status.textContent : '',
          // Filled in by the swap below; the shape has to exist here so one
          // evaluate can build the whole record.
          closeSurvivedSwap: Boolean(dismiss) && !document.getElementById('book-card-body').contains(dismiss),
          announcedAfterSwap: '',
        },
      };
    })()`)) as CardOpened | undefined;

    if (opened === undefined || opened.title.length === 0) continue;
    const withSwap = { ...opened, card: { ...opened.card, ...(await swapToAnother(page, index)) } };
    if (withSwap.hasImage) return withSwap;
    fallback ??= withSwap;
  }
  return fallback;
}

/**
 * Taps a *different* book and reports what survived.
 *
 * Two of §11's assertions only exist across a swap, which is the primary mobile
 * browse gesture and the one nothing else exercises: the announcement must
 * change, and the close control must still be the same element — it lives
 * outside the subtree `showCard` replaces precisely so that focus is not dropped
 * to `<body>` mid-browse.
 */
async function swapToAnother(
  page: Page,
  openedIndex: number,
): Promise<Pick<CardContents, 'closeSurvivedSwap' | 'announcedAfterSwap'>> {
  await page.evaluate(`window.__smokeCloseControl = document.getElementById('book-card-dismiss')`);

  for (let index = 0; index < 60; index += 1) {
    if (index === openedIndex) continue;
    const point = (await page.evaluate(`window.__shelf.projectBook(${index})`)) as
      { x: number; y: number } | undefined;
    if (point === undefined) continue;

    await page.mouse.click(Math.round(point.x), Math.round(point.y));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const result = (await page.evaluate(`(() => {
      const card = document.getElementById('book-card');
      if (!card || card.hidden) return undefined;
      const dismiss = document.getElementById('book-card-dismiss');
      return {
        closeSurvivedSwap: dismiss !== null && dismiss === window.__smokeCloseControl,
        announcedAfterSwap: document.getElementById('book-card-status')?.textContent ?? '',
      };
    })()`)) as Pick<CardContents, 'closeSurvivedSwap' | 'announcedAfterSwap'> | undefined;

    if (result !== undefined) return result;
  }

  // No second book was reachable from this angle. Reported as unswapped rather
  // than as a pass: the assertions above have not run.
  return { closeSurvivedSwap: false, announcedAfterSwap: '' };
}

/**
 * The same card at 375×812, which is the presentation the interaction model was
 * designed for.
 *
 * Runs after the desktop pass so the screenshot and every renderer counter above
 * still describe the shelf at its documented size. The card is opened by calling
 * the page's own handler rather than by aiming at a book: the shelf re-lays out
 * at this width and a raycast that misses would report a missing sheet as a
 * failure of the sheet.
 */
async function checkSheet(page: Page): Promise<SheetChecked | undefined> {
  await page.setViewport({ width: 375, height: 812 });
  await new Promise((resolve) => setTimeout(resolve, 400));

  const opened = await clickAnyBook(page);
  if (!opened) return undefined;

  return (await page.evaluate(`(() => {
    const card = document.getElementById('book-card');
    const grab = document.querySelector('.card-grabber');
    const box = card.getBoundingClientRect();
    const threshold = Math.min(box.height * 0.3, 80);

    /**
     * A drag shorter than the threshold must snap back.
     *
     * This is the assertion that would have caught the sheet dismissing on every
     * short drag: \`pointerup\` correctly declined, then reset the distance, and
     * the synthesised \`click\` read that as a tap and dismissed anyway. A tap
     * was unaffected, so nothing else noticed.
     */
    const control = document.getElementById('book-card-dismiss');
    const at = (type, y) => control.dispatchEvent(new PointerEvent(type, {
      clientY: y, bubbles: true, pointerId: 7, isPrimary: true, button: 0,
    }));
    const short = Math.max(2, Math.round(threshold / 3));
    at('pointerdown', 100);
    at('pointermove', 100 + short);
    at('pointerup', 100 + short);
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    return {
      fullBleed: Math.round(box.left) === 0 && Math.round(box.width) === innerWidth,
      withinCap: box.height <= innerHeight * 0.4 + 1,
      grabberVisible: Boolean(grab) && getComputedStyle(grab).display !== 'none',
      survivedShortDrag: !card.hidden,
    };
  })()`)) as SheetChecked;
}

/** Opens whichever book this viewport can actually hit. */
async function clickAnyBook(page: Page): Promise<boolean> {
  for (let index = 0; index < 60; index += 1) {
    const point = (await page.evaluate(`window.__shelf.projectBook(${index})`)) as
      { x: number; y: number } | undefined;
    if (point === undefined) continue;

    await page.mouse.click(Math.round(point.x), Math.round(point.y));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const open = await page.evaluate(`!document.getElementById('book-card').hidden`);
    if (open === true) return true;
  }
  return false;
}

/**
 * G35 — the enhanced card, against `docs/spec/enhanced-card.md` §11.
 *
 * Six of the eight acceptance assertions live here because they need a real
 * browser: the other two (`published` rendering, the collapse rules) are pure
 * functions and are asserted in `packages/site/src/shelf/card.test.ts`, where
 * they cost nothing.
 *
 * See docs/gates.md, row G35 (enhanced-card).
 */
function cardFailures(card: CardContents): string[] {
  const failures: string[] = [];

  // §11.1 and §11.2. Every book renders this line, and `read` is no longer
  // suppressed as the default — 19 of 41 real books are read with no dates and
  // no rating, and would otherwise render an empty group.
  if (card.reading.length === 0) {
    failures.push('the card renders no reading line — it must render on every book');
  }

  // §11.3 and the fallback in §11.4: the row never vanishes, because every book
  // has a title and therefore at least a search link.
  if (card.linkCount === 0) {
    failures.push('the card renders no provider links at all — the row always renders');
  }

  // §11.5. Named, and safe to open.
  for (const link of card.links) {
    const [target, rel, name] = link.split('|');
    if (target !== '_blank' || rel !== 'noopener noreferrer') {
      failures.push(`a card link opens unsafely: target="${target ?? ''}" rel="${rel ?? ''}"`);
    }
    if ((name ?? '').length === 0) {
      failures.push('a card link has no accessible name — an icon-only link with none is unusable');
    }
  }

  // The row's normal state. A book with identifiers renders marks, and a mark
  // that fails to draw leaves an icon-only link with nothing in it.
  if (card.linkCount > 1 && card.markCount === 0) {
    failures.push(
      `${String(card.linkCount)} provider links and not one drew a mark — the artwork is ` +
        'missing or failed to parse, which leaves an icon-only link with no icon',
    );
  }

  // §11.6. The announcer is the *only* way a touch screen-reader user learns
  // which book they hit, since the canvas has no accessible children.
  if (card.announced.length === 0) {
    failures.push('the live region announced nothing when the card opened');
  }
  if (card.announcedAfterSwap.length === 0) {
    failures.push('tapping another book announced nothing — a swap must re-announce');
  } else if (card.announcedAfterSwap === card.announced) {
    failures.push(`the announcement did not change on swap (still "${card.announced}")`);
  }

  // §11.7 — "the one nothing else would notice".
  if (!card.closeSurvivedSwap) {
    failures.push(
      'the close control did not survive a tap-to-swap. It must sit outside the subtree ' +
        '`showCard` replaces, or focus drops to <body> mid-browse on the primary mobile gesture',
    );
  }

  return failures;
}

function report(result: {
  bookCount: number;
  bookcaseOverflow: number;
  stats: Stats;
  cost: ShelfCost;
  errors: string[];
  cardOpened: CardOpened | undefined;
  viewer: CoverViewerChecked | undefined;
  sheet: SheetChecked | undefined;
  lit: LitChecked;
}): void {
  const { bookCount, bookcaseOverflow, stats, cost, errors, cardOpened, viewer, sheet, lit } =
    result;
  const failures: string[] = [];

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
  console.log(`click opens card  ${cardOpened?.title ?? 'NO'}`);
  if (cardOpened !== undefined) {
    const c = cardOpened.card;
    console.log(`card reading line ${c.reading || 'NONE'}`);
    console.log(
      `card links        ${String(c.linkCount)} (${String(c.markCount)} marks)   object line ${
        c.hasObjectLine ? 'yes' : 'no'
      }`,
    );
    console.log(`card announced    ${c.announced || 'NOTHING'}`);
    console.log(`card after swap   ${c.announcedAfterSwap || 'NOTHING'}`);
  }
  console.log(
    `cover viewer      ${
      viewer === undefined
        ? 'NOT CHECKED'
        : `${viewer.opened ? 'opens' : 'DOES NOT OPEN'}   ${viewer.enlargedBy.toFixed(
            1,
          )}x thumbnail   escape ${viewer.escapeClosedViewer ? 'closes it' : 'DOES NOT CLOSE IT'}${
            viewer.cardSurvivedEscape ? '' : '   AND TOOK THE CARD'
          }`
    }`,
  );
  console.log(
    `sheet at 375x812  ${
      sheet === undefined
        ? 'NOT CHECKED'
        : `full-bleed ${sheet.fullBleed ? 'yes' : 'NO'}   within cap ${
            sheet.withinCap ? 'yes' : 'NO'
          }   grabber ${sheet.grabberVisible ? 'yes' : 'NO'}   short drag ${
            sheet.survivedShortDrag ? 'snaps back' : 'DISMISSES'
          }`
    }`,
  );
  const above = (page: Lighting): string =>
    `${(page.bookcase - page.room).toFixed(1)} above the room (${page.bookcase.toFixed(1)} on ${page.room.toFixed(1)})`;
  const books = (count: number): string => `${String(count)} books`.padEnd(10);
  console.log(`lit (G59)         control   ${books(lit.controlBooks)} ${above(lit.control)}`);
  console.log(`                  large     ${books(lit.largeBooks)} ${above(lit.large)}`);
  console.log(
    `                  planted   ${books(lit.largeBooks)} ${above(lit.planted)}   (the fog pulled over it)`,
  );
  console.log(`screenshot        ${OUTPUT}`);

  if (viewer === undefined) {
    failures.push('no card with a cover could be opened, so the enlarged view was never checked');
  } else {
    if (!viewer.opened) {
      failures.push('clicking the card cover did not open the enlarged view');
    }
    // The card renders the cover at 4.5rem. Anything under 2x is not the
    // "see it closer" this exists for — and it is what a viewer that opened
    // but failed to load or size its image would measure.
    if (viewer.enlargedBy < 2) {
      failures.push(
        `the enlarged cover is only ${viewer.enlargedBy.toFixed(1)}x the thumbnail — it must ` +
          'actually be bigger than the picture it was opened from',
      );
    }
    if (!viewer.escapeClosedViewer) {
      failures.push('Escape did not close the enlarged cover');
    }
    if (!viewer.cardSurvivedEscape) {
      failures.push(
        'Escape closed the enlarged cover *and* the card underneath it. Both listen on the ' +
          'document, so leaving one surface must not return the user two levels',
      );
    }
  }

  if (sheet === undefined) {
    failures.push('no book could be opened at 375x812, so the sheet was never checked');
  } else {
    if (!sheet.fullBleed) failures.push('the sheet is not full-bleed at 375x812');
    if (!sheet.withinCap) failures.push('the sheet exceeds its 40vh cap at 375x812');
    if (!sheet.grabberVisible) failures.push('the grabber pill is not shown below the breakpoint');
    if (!sheet.survivedShortDrag) {
      failures.push(
        'a drag shorter than the dismiss threshold closed the sheet. Below the threshold it ' +
          'must snap back — otherwise every hesitant touch of the pill dismisses the card',
      );
    }
  }

  if (cardOpened === undefined) {
    failures.push('clicking a book did not open the detail card');
  } else {
    failures.push(...cardFailures(cardOpened.card));
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
  // G59's large library, staged beside the build rather than into it.
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
