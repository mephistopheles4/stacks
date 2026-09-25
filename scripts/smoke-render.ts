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
// Value imports, and safe ones: both modules are pure data and arithmetic with
// no `three` and no DOM at module scope, so the gate reads the same key, wait
// and default the page does rather than a copy that could drift from them.
import { FALLBACK_KEY, RESTORE_WAIT_MS } from '../packages/site/src/shelf/shadow-fallback.ts';
import { DEFAULT_SETTINGS } from '../packages/site/src/shelf/shelf-settings.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';
import { samplingHookSource } from './lib/sampling-hook.ts';
import { serveDist } from './lib/serve-dist.ts';
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
 * G60's large library: generated at gate time, staged into `artifacts/` and
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
      // Last, and in browser contexts of its own, so the record it writes can
      // never reach the page every check above measured.
      const fallback = await checkContextLossFallback(browser, origin);
      const sampling = await checkShadowReaders(browser, origin, large.origin);

      report({
        bookCount: Number(bookCount),
        bookcaseOverflow: Number(bookcaseOverflow),
        stats,
        cost,
        errors,
        cardOpened,
        viewer,
        sheet,
        fallback,
        sampling,
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

/* -------------------------------------------------------------------------- */

/**
 * G59 — a lost context falls back to painted shadows, once, and remembers it.
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
 */
const COUNT_FRAMES = `(() => {
  const original = window.requestAnimationFrame.bind(window);
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

/** The most render-loop callbacks any one frame ran, over a second of frames. */
const LOOPS_PER_FRAME = `(async () => {
  window.__callbacksPerFrame.clear();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const counts = [...window.__callbacksPerFrame.values()];
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

  // The third field is the one console error a case causes on purpose. It is
  // taken out of that case's errors only, and the case fails if it never came.
  const cases: readonly (readonly [string, FallbackCase, string?])[] = [
    ['restore', restoreThenReload],
    ['no restore', noRestore],
    ['storage refused', storageRefused],
    ['painted loss', paintedLoss],
    ['refused', refusedRedraw, REFUSED_BY_THREE],
    ['probe loss', probeLoss],
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
    const unexpected = errors.filter((error) => error !== expected);
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

  // Textures land and the ResizeObserver sizes the new element.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const stats = (await page.evaluate(readCanvasStats)) as Stats;
  must(
    stats.distinctColours >= 40 && stats.nonBackgroundPct >= 10,
    `the new canvas looks blank: ${String(stats.distinctColours)} colours, ` +
      `${stats.nonBackgroundPct.toFixed(1)}% not background`,
  );
  const loops = await oneLoop(page, 'on the new canvas');
  must(await clickAnyBook(page), 'no book on the new canvas opens the card');

  return (
    `new canvas after ${String(waited)}ms, ${stats.size}, ${String(stats.distinctColours)} ` +
    `colours, ${loops}, card opens`
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
  // Past the wait, so a rebuild that should not happen has had its chance to.
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

async function visit(page: Page, origin: string, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
  // A hidden page's loss is not the fallback's, by design — so make sure the
  // one under test is the one in front.
  await page.bringToFront();
}

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
  must(loops.frames > 0, `no frame was drawn in a second ${when}`);
  must(
    loops.most === 1,
    `${String(loops.most)} render-loop callbacks in one frame ${when} — a disposed shelf's loop ` +
      'is still running beside the live one',
  );
  return `${String(loops.frames)} frames, 1 loop`;
}

async function waitForState(
  page: Page,
  expression: string,
  timeout: number,
  what: string,
): Promise<void> {
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
 * G60 — exactly one program reads the real-time shadow map on the default
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
const MIN_LARGE_ROWS = 8;

interface SamplingPage {
  readonly name: string;
  readonly url: (main: string, large: string) => string;
  /** `gate` must pass; `control` must fail, and for the right reason. */
  readonly role: 'gate' | 'control';
  /** The library it serves, whose shelved books the page must report. */
  readonly library: string;
  readonly minRows: number;
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
    minRows: MIN_LARGE_ROWS,
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
    const { read, errors } = await measureSampling(browser, page.url(main, large));
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
    const programs =
      s === undefined
        ? '—'
        : s.fewestPrograms === s.mostPrograms
          ? String(s.mostPrograms)
          : `${String(s.fewestPrograms)}–${String(s.mostPrograms)}`;
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
    failures.push(...found.map((failure) => `G60, ${page.name}: ${failure}`));
  }

  return { lines, failures };
}

async function measureSampling(
  browser: Browser,
  url: string,
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
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
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
  fallback: FallbackChecked;
  sampling: SamplingChecked;
}): void {
  const {
    bookCount,
    bookcaseOverflow,
    stats,
    cost,
    errors,
    cardOpened,
    viewer,
    sheet,
    fallback,
    sampling,
  } = result;
  const failures: string[] = [...fallback.failures, ...sampling.failures];

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
  console.log(`context loss (G59), each case in a browser context of its own`);
  for (const line of fallback.lines) console.log(`  ${line}`);
  console.log(
    `shadow-map readers (G60), budget ${String(BUDGET)} sampling draws a frame, each page in a ` +
      'browser context of its own',
  );
  for (const line of sampling.lines) console.log(`  ${line}`);
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
  // G60's large library, staged beside the build rather than into it.
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
