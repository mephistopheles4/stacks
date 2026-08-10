/**
 * PROTOTYPE — THROWAWAY. Branch `prototype/enhanced-card` only. Ticket #92.
 *
 * Shoots every variant x case x viewport of the card prototype against the live
 * shelf, and prints the measurement table the reconciliation actually turns on:
 * the content height each card wants against the ~40vh cap #91 gave the sheet.
 *
 *     pnpm dev            # in another terminal
 *     pnpm tsx scripts/proto-card-shots.ts
 *
 * Reuses `smoke-render.ts`'s Chrome discovery and GL flags rather than its
 * build-and-serve: the point here is to iterate against the dev server, not to
 * gate a build.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';

const ORIGIN = process.env['PROTO_ORIGIN'] ?? 'http://localhost:4321';
const OUT = join(REPO_ROOT, 'artifacts', 'card-prototype');

const VARIANTS = ['A', 'B', 'C'] as const;
const CASES = ['today', 'filled', 'no-isbn', 'bare'] as const;
const LINK_STYLES = ['labelled', 'apple-labelled', 'bare', 'text'] as const;
/** The direction locked in #92; the links axis is only interesting on it. */
const LINKS_VARIANT = 'C';

const VIEWPORTS = {
  /** iPhone 12-ish. #91's table calls this 375x812 → 325px of sheet. */
  portrait: { width: 375, height: 812 },
  /** iPhone SE landscape. `(max-height: 500px)` → sheet at **150px**. */
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
  wanted: number;
  cap: number;
  over: number;
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
  const linkRows: string[] = [];
  try {
    if (process.env['PROTO_LINKS_ONLY'] !== '1') {
      for (const [viewName, viewport] of Object.entries(VIEWPORTS)) {
        for (const variant of VARIANTS) {
          for (const dataCase of CASES) {
            const shoot =
              viewName === 'portrait' || (dataCase === 'filled' && viewName !== 'portrait');
            const measure = await shot(browser, viewport, variant, dataCase, {
              shootAs: shoot ? viewName : undefined,
            });
            rows.push(row(viewName, variant, dataCase, measure));
          }
        }
      }
    }

    /*
     * The links axis, on the chosen direction only.
     *
     * #89 decision 7 asked for logos with tooltips; #101 struck the tooltip and
     * #103 found no uniform logo row exists. What replaces the tooltip's job is
     * a height question against #91's cap, so it gets the same instrument.
     */
    for (const [viewName, viewport] of Object.entries(VIEWPORTS)) {
      for (const links of LINK_STYLES) {
        for (const dataCase of ['filled', 'today'] as const) {
          // Named per style, or all four overwrite one file — which they did.
          const shoot = viewName !== 'landscape' && dataCase === 'filled';
          const measure = await shot(browser, viewport, LINKS_VARIANT, dataCase, {
            links,
            shootAs: shoot ? `links-${viewName}-${links}` : undefined,
          });
          linkRows.push(row(viewName, `${LINKS_VARIANT} / ${links}`, dataCase, measure));
        }
      }
    }
  } finally {
    await browser.close();
  }

  const header = '\n| viewport | variant | case | wanted | cap (40vh) | below the fold |';
  if (rows.length > 0) {
    console.log(header);
    console.log('|---|---|---|---|---|---|');
    for (const line of rows) console.log(line);
  }
  console.log(header.replace('variant', 'links style'));
  console.log('|---|---|---|---|---|---|');
  for (const line of linkRows) console.log(line);
  console.log(`\nshots in ${OUT}`);
}

function row(view: string, variant: string, dataCase: string, measure: Measure): string {
  const verdict = !measure.sheet
    ? 'n/a'
    : measure.over > 0
      ? `**+${String(measure.over)}**`
      : 'fits';
  return `| ${view} | ${variant} | ${dataCase} | ${String(measure.wanted)} | ${String(measure.cap)} | ${verdict} |`;
}

async function shot(
  browser: Browser,
  viewport: { width: number; height: number },
  variant: string,
  dataCase: string,
  options: { links?: string; shootAs?: string } = {},
): Promise<Measure> {
  const { links, shootAs } = options;
  const page = await browser.newPage();
  try {
    await page.setViewport(viewport);
    await page.goto(`${ORIGIN}/?cardproto=${variant}`, {
      waitUntil: 'networkidle0',
      timeout: 30_000,
    });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await openACard(page);
    await page.evaluate(
      `window.__cardproto.set({ variant: ${JSON.stringify(variant)}, case: ${JSON.stringify(dataCase)}${
        links === undefined ? '' : `, links: ${JSON.stringify(links)}`
      } })`,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));

    const measure = (await page.evaluate('window.__cardproto.measure()')) as Measure;

    if (shootAs !== undefined) {
      await page.evaluate('window.__cardproto.hideBar()');
      await new Promise((resolve) => setTimeout(resolve, 120));
      writeFileSync(
        join(OUT, `${shootAs}-${variant}-${dataCase}.png`),
        await page.screenshot({ type: 'png' }),
      );
    }
    return measure;
  } finally {
    await page.close();
  }
}

/**
 * Aims via the page's own projection, the way `smoke-render.ts` does, and keeps
 * trying books until one actually opens the card — a book can be occluded by a
 * neighbour, and a fixed coordinate stops hitting anything when the shelf moves.
 */
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
