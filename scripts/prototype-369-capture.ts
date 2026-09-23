/**
 * PROTOTYPE #369 — throwaway. Screenshots the held-book variants against a
 * running dev server (`pnpm dev`) on a desktop and a DPR-3 phone viewport.
 *
 *   pnpm exec tsx scripts/prototype-369-capture.ts <outDir> [book]
 *
 * Output goes wherever you point it — never `artifacts/` on this branch's
 * behalf, never committed (G13).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const out = process.argv[2] ?? '.';
const book = process.argv[3] ?? '34';
const origin = 'http://localhost:4321';

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

const SHOTS = [
  { name: 'A-open', query: 'held=A&t=1' },
  { name: 'A-mid', query: 'held=A&t=0.8' },
  { name: 'B-open', query: 'held=B&t=1' },
  { name: 'B-mid', query: 'held=B&t=0.8' },
  { name: 'C-open', query: 'held=C&t=1' },
  { name: 'D-cover', query: 'held=D&t=1' },
];

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
});
const metrics: Record<string, unknown> = {};
try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    for (const shot of SHOTS) {
      await page.goto(`${origin}/?${shot.query}&book=${book}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(
        () => !(document.querySelector('pre')?.textContent ?? 'not loaded').includes('not loaded'),
        { timeout: 20000 },
      );
      await new Promise((r) => setTimeout(r, 1200));
      const hud = await page.evaluate(() => document.querySelector('pre')?.textContent ?? '');
      const file = join(out, `369-${viewport.name}-${shot.name}.png`);
      await page.screenshot({ path: file });
      metrics[`${viewport.name}/${shot.name}`] = hud;
      console.log(file);
    }
    for (const v of ['A', 'B', 'C']) {
      await page.goto(`${origin}/?held=${v}&book=${book}`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 800));
      metrics[`${viewport.name}/sweep-${v}`] = await page.evaluate(() => {
        const held = (
          window as unknown as { __held: { sweep(n: number, w: number): unknown; lag: boolean } }
        ).__held;
        const clean = held.sweep(160, 12);
        held.lag = true;
        const late = held.sweep(160, 12);
        return { clean, oneStepLate: late };
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, '369-metrics.json'), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
