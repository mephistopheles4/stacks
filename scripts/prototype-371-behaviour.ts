/**
 * PROTOTYPE #371 — throwaway. Drives each put-back and interrupt path on the
 * running dev server and prints what state the pickup reached, so the variants
 * the owner plays with are known to do what their names say.
 *
 *   pnpm exec tsx scripts/prototype-371-behaviour.ts
 */
import puppeteer, { type Page } from 'puppeteer-core';

const origin = process.env.ORIGIN ?? 'http://localhost:4371';
type Active = { id: string; phase: string; progress: number }[];

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
});

const open = async (query: string): Promise<Page> => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${origin}/?${query}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 800));
  return page;
};
const active = (page: Page): Promise<Active> =>
  page.evaluate('window.__pickup.active') as Promise<Active>;
const pick = (page: Page, i: number): Promise<unknown> =>
  page.evaluate(`window.__pickup.pickIndex(${String(i)})`);
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const brief = (a: Active): string =>
  a.length === 0
    ? 'none'
    : a.map((h) => `${h.id.slice(0, 14)}:${h.phase}@${h.progress.toFixed(2)}`).join(' + ');
const results: [string, string][] = [];
const log = (name: string, what: string): void => {
  results.push([name, what]);
  console.log(`${name.padEnd(46)} ${what}`);
};

try {
  {
    const page = await open('pickup');
    const before = await page.evaluate('history.length');
    await pick(page, 5);
    await wait(2200);
    log(
      'pick → held, history entry pushed',
      `${brief(await active(page))}; history ${String(before)} → ${String(await page.evaluate('history.length'))}`,
    );
    await page.keyboard.press('Escape');
    await wait(150);
    log('Escape, 150 ms later', brief(await active(page)));
    await wait(1800);
    log(
      'Escape, settled',
      `${brief(await active(page))}; state ${JSON.stringify(await page.evaluate('history.state'))}`,
    );
    await pick(page, 5);
    await wait(2200);
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await wait(1800);
    log(
      'back button while held, settled',
      `${brief(await active(page))}; url ${page.url().replace(origin, '')}`,
    );
    await pick(page, 5);
    await wait(2200);
    await page.mouse.click(1270, 790);
    await wait(1800);
    log('click on empty space, settled', brief(await active(page)));
    await pick(page, 5);
    await wait(2200);
    await page.evaluate('window.__pickup.putBack()');
    await wait(250);
    await pick(page, 5);
    await wait(100);
    log('same book clicked while going back', brief(await active(page)));
    await page.close();
  }
  for (const interrupt of ['putback', 'swap', 'ignore']) {
    const page = await open(`pickup&interrupt=${interrupt}`);
    await pick(page, 5);
    await wait(2200);
    await pick(page, 12);
    await wait(200);
    const mid = brief(await active(page));
    await wait(3000);
    log(`interrupt=${interrupt}: 200 ms / settled`, `${mid}  →  ${brief(await active(page))}`);
    await page.close();
  }
  for (const returning of ['allow', 'wait']) {
    const page = await open(`pickup&returning=${returning}`);
    await pick(page, 5);
    await wait(2200);
    await page.evaluate('window.__pickup.putBack()');
    await wait(150);
    await pick(page, 12);
    await wait(150);
    const mid = brief(await active(page));
    await wait(3000);
    log(`returning=${returning}: pick during return`, `${mid}  →  ${brief(await active(page))}`);
    await page.close();
  }
  {
    const page = await open('pickup&motion=reduce');
    await pick(page, 5);
    await wait(50);
    const held = brief(await active(page));
    await page.keyboard.press('Escape');
    await wait(80);
    log(
      'motion=reduce: 50 ms after pick / after Escape',
      `${held}  →  ${brief(await active(page))}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
