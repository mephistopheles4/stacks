/**
 * PROTOTYPE — throwaway, for wayfinder ticket #55.
 *
 *     pnpm tsx scripts/proto-spine-curve.ts
 *
 * Renders the same shelf three times — today's flat spine, the shared normal
 * map, and real curved geometry — and lays the three side by side so the
 * difference can be judged rather than argued about.
 *
 * Three framings, chosen to test different claims:
 *
 * - `wide`       — normal shelf distance. Does the effect read at all from here?
 * - `close-face` — the closest orbit the camera allows, head on. Tests shading.
 * - `close-rim`  — the same distance looking down at the head of the spine. The
 *                  only framing where an *outline* can differ, and the one that
 *                  would show a bowed plane delaminating from a flat covering.
 *
 * Deliberately not a gate. It asserts nothing; it produces pictures.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const ARTIFACTS = join(REPO_ROOT, 'artifacts');
/** `smoke:render`'s viewport, so these read like the shelf people actually see. */
const VIEWPORT = { width: 1440, height: 900 };

/** The three candidates, in the order they appear across each sheet. */
const MODES = [
  { mode: 'off', label: 'flat — today' },
  { mode: 'normal', label: 'normal map' },
  { mode: 'geometry', label: 'curved geometry' },
] as const;

/** Which book the close framings sit in front of. Edit while looking. */
const BOOK = 12;

/** `controls.minDistance` in `scene.ts`. Any closer is clamped anyway. */
const CLOSEST = 1.5;

interface Framing {
  readonly name: string;
  readonly caption: string;
  /** `undefined` leaves the shelf framed as it opens. */
  readonly orbit?: { readonly distance: number; readonly elevation: number };
  /** A region of each shot to blow up, so a small difference can be judged. */
  readonly crop?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly scale: number };
}

const FRAMINGS: readonly Framing[] = [
  { name: 'wide', caption: 'the whole case, as the shelf opens' },
  {
    name: 'shelf-distance',
    caption: `normal shelf distance — an arm's length from the spines (book ${String(BOOK)})`,
    orbit: { distance: 4, elevation: 0.14 },
  },
  {
    name: 'close-face',
    caption: `closest orbit, head on (book ${String(BOOK)})`,
    orbit: { distance: CLOSEST, elevation: 0.06 },
  },
  {
    name: 'close-rim',
    caption: `closest orbit, looking down at the head of the spine (book ${String(BOOK)})`,
    orbit: { distance: CLOSEST, elevation: 0.5 },
  },
  {
    name: 'zoom',
    caption: 'one spine, 3× — the shading across its width',
    orbit: { distance: CLOSEST, elevation: 0.06 },
    crop: { x: 600, y: 250, w: 300, h: 420, scale: 3 },
  },
];

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

async function main(): Promise<void> {
  mkdirSync(ARTIFACTS, { recursive: true });

  await buildSite();
  const { server, origin } = await serveDist();

  try {
    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--headless=new', '--hide-scrollbars', '--enable-gpu', '--use-gl=angle'],
    });

    try {
      // framing name -> one PNG per mode, in MODES order.
      const sheets = new Map<string, string[]>();
      for (const framing of FRAMINGS) sheets.set(framing.name, []);

      const costs: { mode: string; cost: Cost }[] = [];
      for (const candidate of MODES) {
        const { shots, cost } = await shootMode(browser, origin, candidate.mode);
        costs.push({ mode: candidate.mode, cost });
        for (const framing of FRAMINGS) {
          sheets.get(framing.name)?.push(shots[framing.name] ?? '');
        }
      }

      for (const framing of FRAMINGS) {
        const shots = sheets.get(framing.name) ?? [];
        const png = await compose(browser, shots, framing);
        const path = join(ARTIFACTS, `proto-spine-curve-${framing.name}.png`);
        writeFileSync(path, Buffer.from(png, 'base64'));
        console.log(`wrote ${path}`);
      }

      // The whole shelf, not one book: divide by the book count for the per-book
      // figures the ticket's budget is written in.
      console.log('\nmode        textures  geometries  draw calls  triangles');
      for (const { mode, cost } of costs) {
        console.log(
          `${mode.padEnd(11)} ${String(cost.textures).padStart(8)} ${String(cost.geometries).padStart(11)} ` +
            `${String(cost.calls).padStart(11)} ${String(cost.triangles).padStart(10)}`,
        );
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

/** Every framing, for one candidate, as base64 PNGs keyed by framing name. */
interface Cost {
  readonly textures: number;
  readonly geometries: number;
  readonly calls: number;
  readonly triangles: number;
}

async function shootMode(
  browser: Browser,
  origin: string,
  mode: string,
): Promise<{ shots: Record<string, string>; cost: Cost }> {
  const page = await browser.newPage();
  try {
    await page.setViewport(VIEWPORT);

    const errors: string[] = [];
    page.on('pageerror', (error: unknown) => {
      errors.push(error instanceof Error ? error.message : String(error));
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const tune = encodeURIComponent(JSON.stringify({ materials: { spineCurveMode: mode } }));
    await page.goto(`${origin}/?tune=${tune}`, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
    await settle(1500);

    // Read while the whole case is on screen, so nothing is frustum-culled and
    // the counts describe the shelf rather than the crop.
    const cost = (await page.evaluate('window.__shelf.protoStats()')) as Cost;

    const shots: Record<string, string> = {};
    for (const framing of FRAMINGS) {
      if (framing.orbit !== undefined) {
        await page.evaluate(
          `window.__shelf.protoOrbit(${String(BOOK)}, ${String(framing.orbit.distance)}, ${String(framing.orbit.elevation)})`,
        );
        await settle(400);
      }
      shots[framing.name] = Buffer.from(await page.screenshot({ type: 'png' })).toString('base64');
    }

    if (errors.length > 0) console.error(`[${mode}] page errors:\n  ${errors.join('\n  ')}`);
    return { shots, cost };
  } finally {
    await page.close();
  }
}

/**
 * Lays the three candidates side by side, labelled, in a blank page's canvas.
 *
 * In the browser rather than with an image library because one is already open
 * and this is throwaway — adding a dependency to a prototype that gets deleted
 * would be the wrong trade even before `CLAUDE.md`'s rule about it.
 */
async function compose(browser: Browser, shots: readonly string[], framing: Framing): Promise<string> {
  const page = await browser.newPage();
  try {
    const labels = MODES.map((candidate) => candidate.label);
    return (await page.evaluate(
      `(async () => {
        const shots = ${JSON.stringify(shots)};
        const labels = ${JSON.stringify(labels)};
        const caption = ${JSON.stringify(framing.caption)};
        const crop = ${JSON.stringify(framing.crop ?? null)};
        const images = await Promise.all(shots.map((data) => new Promise((resolve) => {
          const image = new Image();
          image.onload = () => { resolve(image); };
          image.src = 'data:image/png;base64,' + data;
        })));

        const head = 64, foot = 34, gap = 8;
        const w = crop ? crop.w * crop.scale : images[0].width;
        const h = crop ? crop.h * crop.scale : images[0].height;

        const canvas = document.createElement('canvas');
        canvas.width = w * images.length + gap * (images.length - 1);
        canvas.height = h + head + foot;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#f5efe6';
        ctx.font = '600 26px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(caption, 8, 22);

        images.forEach((image, index) => {
          const x = index * (w + gap);
          ctx.font = '600 22px system-ui, sans-serif';
          ctx.fillStyle = '#ffd7a8';
          ctx.fillText(labels[index], x + 8, head - 16);
          if (crop) ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, x, head, w, h);
          else ctx.drawImage(image, x, head);
        });

        return canvas.toDataURL('image/png').split(',')[1];
      })()`,
    )) as string;
  } finally {
    await page.close();
  }
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(shellCommand(command, args), { cwd: REPO_ROOT, shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${String(code)}`)),
    );
  });
}

async function buildSite(): Promise<void> {
  await run('pnpm', ['fixtures:50']);
  await run('pnpm', [
    'stacks', 'build', '--public',
    '--vault', 'fixtures/vault-50',
    '--assets', 'packages/site/public',
  ]);
  await run('pnpm', ['--filter', '@stacks/site', 'run', 'build']);
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function serveDist(): Promise<{ server: Server; origin: string }> {
  const root = join(REPO_ROOT, 'packages', 'site', 'dist');

  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('the prototype server is listening on a pipe, not a port'));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${String(address.port)}` });
    });
    server.on('error', reject);
  });
}

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) throw new Error(`no Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  return found;
}

await main();
