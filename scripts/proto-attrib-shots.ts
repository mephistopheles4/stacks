/**
 * PROTOTYPE — THROWAWAY. Branch `prototype/enhanced-card` only. Ticket #106.
 *
 * Shoots the page-level attribution surface at every placement x content x
 * viewport, **with the card shut and with it open**, and prints the collision
 * table the placement decision turns on: how much of the surface #92's card or
 * #91's sheet covers.
 *
 *     pnpm dev            # in another terminal
 *     pnpm tsx scripts/proto-attrib-shots.ts
 *
 * Reuses `proto-card-shots.ts`'s Chrome discovery and aiming for the same reason
 * it reused `smoke-render.ts`'s: the point is to iterate against the dev server.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';

const ORIGIN = process.env['PROTO_ORIGIN'] ?? 'http://localhost:4321';
const OUT = join(REPO_ROOT, 'artifacts', 'attrib-prototype');

/*
 * Narrowed to the live question. The full 4x4 matrix is 192 shelf boots and got
 * killed at ~15 minutes; the placement table it produced is in the resolution on
 * #106 and does not need re-running. What is undecided is the owner's row at the
 * bottom-left corner and its phone fallback. `PROTO_ATTRIB_FULL=1` restores the
 * sweep.
 */
const FULL = process.env['PROTO_ATTRIB_FULL'] === '1';
const PLACES = (FULL ? ['header', 'bl', 'tr', 'auto'] : ['bl', 'auto']) as readonly string[];
const CONTENTS = (FULL ? ['google', 'apple', 'all', 'row'] : ['row']) as readonly string[];

/**
 * The assumed footprint, and a deliberately smaller one — "it can be pretty
 * small too, i dont want it to be distracting". Google's branding page states no
 * minimum size for the powered-by image (Apple states one for its badge; Google
 * does not), so the floor here is legibility rather than a published number.
 */
const GRAPHIC_HEIGHTS = [26, 18] as const;

const VIEWPORTS = {
  /** iPhone 12-ish — #91's sheet is 325px here. */
  portrait: { width: 375, height: 812 },
  /** iPhone SE landscape — `(max-height: 500px)`, sheet at 150px. */
  landscape: { width: 667, height: 375 },
  desktop: { width: 1440, height: 900 },
} as const;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

interface Measure {
  rect: { x: number; y: number; width: number; height: number };
  overlap: number;
  onHeader: number;
  clipped: boolean;
  sheet: boolean;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
  });

  const rows: string[] = [];
  try {
    for (const [viewName, viewport] of Object.entries(VIEWPORTS)) {
      for (const place of PLACES) {
        for (const content of CONTENTS) {
          for (const height of GRAPHIC_HEIGHTS) {
            for (const withCard of [false, true]) {
              /*
               * The chosen direction — the owner's row, bottom-left and its
               * phone fallback — gets a picture at both footprints in every
               * state. Everything else is the losing side of a table that is
               * already decided, and only needs its number.
               */
              const shoot =
                (content === 'row' && (place === 'bl' || place === 'auto')) ||
                (content === 'apple' && height === 26);
              const measure = await shot(browser, viewport, place, content, height, withCard, {
                shootAs: shoot
                  ? `${viewName}-${place}-${content}-${String(height)}-${withCard ? 'card' : 'shut'}`
                  : undefined,
              });
              rows.push(row(viewName, place, content, height, withCard, measure));
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    '\n| viewport | place | shows | graphic | card | surface | behind the card | on the lockup | clipped |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const line of rows) console.log(line);
  console.log(`\nshots in ${OUT}`);
}

function row(
  view: string,
  place: string,
  content: string,
  height: number,
  withCard: boolean,
  m: Measure,
): string {
  const covered = m.overlap > 0 ? `**${String(m.overlap)}px²**` : 'clear';
  const lockup = m.onHeader > 0 ? `**${String(m.onHeader)}px²**` : 'clear';
  return `| ${view} | ${place} | ${content} | ${String(height)}px | ${withCard ? 'open' : 'shut'} | ${String(m.rect.width)}×${String(m.rect.height)} | ${covered} | ${lockup} | ${m.clipped ? '**yes**' : 'no'} |`;
}

async function shot(
  browser: Browser,
  viewport: { width: number; height: number },
  place: string,
  content: string,
  height: number,
  withCard: boolean,
  options: { shootAs?: string } = {},
): Promise<Measure> {
  const page = await browser.newPage();
  try {
    await page.setViewport(viewport);
    await page.goto(`${ORIGIN}/?cardproto=C&attribproto=${place}`, {
      waitUntil: 'networkidle0',
      timeout: 30_000,
    });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await page.evaluate(
      `window.__attribproto.set({ place: ${JSON.stringify(place)}, content: ${JSON.stringify(content)}, graphicHeight: ${String(height)} })`,
    );
    if (withCard) {
      await openACard(page);
      // The card the collision is against is #92's locked one, filled.
      await page.evaluate(`window.__cardproto.set({ variant: 'C', case: 'filled' })`);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));

    const measure = (await page.evaluate('window.__attribproto.measure()')) as Measure;

    if (options.shootAs !== undefined) {
      await page.evaluate('window.__attribproto.hideBar()');
      await page.evaluate('window.__cardproto.hideBar()');
      await new Promise((resolve) => setTimeout(resolve, 120));
      writeFileSync(join(OUT, `${options.shootAs}.png`), await page.screenshot({ type: 'png' }));
    }
    return measure;
  } finally {
    await page.close();
  }
}

async function openACard(page: Page): Promise<void> {
  const count = Number(await page.evaluate('window.__shelf.bookCount'));
  for (const index of [4, 0, 1, 2, 3, 5, 6, 7]) {
    if (index >= count) continue;
    const at = (await page.evaluate(`window.__shelf.projectBook(${String(index)})`)) as {
      x: number;
      y: number;
    } | null;
    if (at === null) continue;
    await page.mouse.click(at.x, at.y);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const open = await page.evaluate('!document.getElementById("book-card").hidden');
    if (open === true) return;
  }
  throw new Error('no book opened the card');
}

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) throw new Error('no system Chrome found');
  return found;
}

await main();
