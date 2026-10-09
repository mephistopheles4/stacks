/**
 * PROTOTYPE #371 — throwaway. Clicks a book on the running dev server's
 * `?pickup` shelf and screenshots the pickup at set moments, on a desktop and a
 * DPR-3 phone viewport. Reports every console error and page error it saw.
 *
 *   pnpm exec tsx scripts/prototype-371-capture.ts <outDir> [query] [book] [ms,ms,...]
 *
 * Output goes wherever you point it — never committed (G13).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const out = process.argv[2] ?? '.';
const query = process.env.QUERY ?? process.argv[3] ?? 'pickup=book';
const book = Number(process.argv[4] ?? '5');
const moments = (process.argv[5] ?? '0,250,600,1000,1800').split(',').map(Number);
const origin = process.env.ORIGIN ?? 'http://localhost:4371';
const only = process.env.VIEWPORT;

const VIEWPORTS = [
  {
    name: 'desktop',
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
] as const;

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
});
const report: Record<string, unknown> = {};
try {
  for (const viewport of VIEWPORTS) {
    if (only !== undefined && only !== viewport.name) continue;
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
    await page.setViewport(viewport);
    await page.goto(`${origin}/?${query}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__shelf?.ready === true, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    const at = await page.evaluate((i) => window.__shelf?.projectBook(i), book);
    if (at === undefined) throw new Error(`no book ${String(book)}`);
    await page.screenshot({ path: join(out, `371-${viewport.name}-shelf.png`) });
    const started = Date.now();
    await page.mouse.click(at.x, at.y);
    for (const ms of moments) {
      const wait = ms - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const file = join(out, `371-${viewport.name}-${String(ms).padStart(4, '0')}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    report[viewport.name] = {
      clickedAt: at,
      state: await page.evaluate(
        () => (window as unknown as { __pickup?: { active: unknown } }).__pickup?.active,
      ),
      errors,
    };
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, '371-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
