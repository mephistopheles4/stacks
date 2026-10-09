/**
 * PROTOTYPE #371 — throwaway. G61's own hook and judge, with a book held.
 *
 * G61 counts the default page at rest; a pickup adds parts and render passes the
 * gate never sees. This loads `?pickup` pages on the running dev server, picks a
 * book, waits for the sampling set to settle while it is held, and judges it
 * with `judgeSampling` — plus `?receivers=all` as the control, which must be red.
 *
 *   pnpm exec tsx scripts/prototype-371-sampling.ts
 */
import puppeteer from 'puppeteer-core';
import { samplingHookSource } from './lib/sampling-hook.ts';
import {
  describeSampling,
  judgeControl,
  judgeSampling,
  MIN_STEADY_FRAMES,
  type SamplingSnapshot,
} from './lib/shadow-sampling.ts';

const origin = process.env.ORIGIN ?? 'http://localhost:4371';
const ONLY = process.env.ONLY;
const PAGES_ALL = [
  { name: 'at rest, no pickup', query: 'pickup', pick: false, control: false },
  { name: 'held, book, dim', query: 'pickup=book&rest=dim', pick: true, control: false },
  { name: 'held, book, none', query: 'pickup=book&rest=none', pick: true, control: false },
  { name: 'held, camera, fade', query: 'pickup=camera&rest=fade', pick: true, control: false },
  {
    name: 'held, book, dim, live',
    query: 'pickup=book&rest=dim&shadow=live',
    pick: true,
    control: false,
  },
  {
    name: 'control: receivers=all, held',
    query: 'pickup=book&rest=dim&receivers=all',
    pick: true,
    control: true,
  },
];
const PAGES = PAGES_ALL.filter((p) => ONLY === undefined || p.name.includes(ONLY));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
});
let red = false;
try {
  for (const p of PAGES) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument(samplingHookSource());
    await page.bringToFront();
    await page.goto(`${origin}/?${p.query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 20_000 }).catch(() => undefined);
    if (p.pick) {
      await page.evaluate('window.__pickup.pickIndex(5)');
      await page.waitForFunction(
        `window.__pickup.active.length === 1 && window.__pickup.active[0].phase === 'held'`,
        { timeout: 20_000 },
      );
    }
    await new Promise((r) => setTimeout(r, 300));
    await page
      .waitForFunction(
        `(window.__samplingHook?.settledFor() ?? 0) >= ${String(MIN_STEADY_FRAMES)}`,
        {
          timeout: 30_000,
          polling: 100,
        },
      )
      .catch(() => undefined);
    const read = (await page.evaluate(`(() => ({
      snapshot: window.__samplingHook?.read() ?? null,
      threeCalls: window.__shelf?.stats().calls ?? null,
      bookCount: window.__shelf?.bookCount ?? 0,
      active: window.__pickup?.active ?? [],
    }))()`)) as {
      snapshot: SamplingSnapshot | null;
      threeCalls: number | null;
      bookCount: number;
      active: unknown;
    };
    const run = {
      snapshot: read.snapshot ?? undefined,
      bookCount: read.bookCount,
      threeCalls: read.threeCalls ?? undefined,
    };
    const found = [...(p.control ? judgeControl(run) : judgeSampling(run)), ...errors];
    const verdict = p.control
      ? found.length === 0
        ? 'red, as it must be'
        : 'CONTROL FAILED'
      : found.length === 0
        ? 'ok'
        : 'FAILED';
    if (verdict !== 'ok' && verdict !== 'red, as it must be') red = true;
    console.log(`${p.name.padEnd(32)} ${verdict}  held=${JSON.stringify(read.active)}`);
    console.log(`  ${describeSampling(run)}`);
    for (const f of found) console.log(`  - ${f}`);
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = red ? 1 : 0;
