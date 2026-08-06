/**
 * PROTOTYPE — throwaway, for wayfinder ticket #56.
 *
 *     pnpm tsx scripts/proto-corners.ts
 *
 * Answers the ticket's own precondition before any candidate is built: *at what
 * camera distance does a sharp corner actually read as wrong?* So this renders
 * today's shelf only — no bevel, no rim, no new normal map — in the world #55
 * decided (`spineCurveMode: 'normal'`, rise 0.125), and blows up the three edges
 * the ticket names at two distances.
 *
 * Crops are centred on a real book via `projectBook`, not on a hardcoded
 * coordinate, so a layout change moves the crop instead of silently pointing at
 * a plank.
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

/**
 * Both sides of the comparison, in the order they appear across each sheet.
 *
 * The baseline is not today's *default* shelf but the world #55 landed on —
 * judging a softened hinge against a flat spine would be judging a world nobody
 * chose, and would flatter this ticket by handing it #55's win as well.
 */
const MODES = [
  {
    label: 'today — #55 as decided',
    tune: { materials: { spineCurveMode: 'normal', spineCurve: 0.125, softCorners: false } },
  },
  {
    label: 'softened hinge + head cap',
    tune: { materials: { spineCurveMode: 'normal', spineCurve: 0.125, softCorners: true } },
  },
] as const;

/** Which book the close framings sit in front of. Edit while looking. */
const BOOK = 12;

/** `controls.minDistance` in `scene.ts`. Any closer is clamped anyway. */
const CLOSEST = 1.5;

/** Arm's length from the spines — how the shelf is actually looked at. */
const SHELF_DISTANCE = 4;

interface Shot {
  readonly name: string;
  readonly caption: string;
  readonly distance: number;
  readonly elevation: number;
  /** Blown up around the book's own screen position. Omitted keeps the full frame. */
  readonly crop?: { readonly w: number; readonly h: number; readonly scale: number };
}

const SHOTS: readonly Shot[] = [
  {
    name: 'context',
    caption: `normal shelf distance, full frame — a spine is ~18px wide here`,
    distance: SHELF_DISTANCE,
    elevation: 0.14,
  },
  {
    name: 'hinge-far',
    caption: `the spine-to-board hinge at normal shelf distance, 3x (book ${String(BOOK)})`,
    distance: SHELF_DISTANCE,
    elevation: 0.14,
    crop: { w: 300, h: 400, scale: 3 },
  },
  {
    name: 'hinge-near',
    caption: `the same hinge at the closest orbit the camera allows, 2x`,
    distance: CLOSEST,
    elevation: 0.06,
    crop: { w: 460, h: 560, scale: 2 },
  },
  {
    name: 'head-far',
    caption: `the head of the spine at normal shelf distance, 3x — where a rolled cap goes`,
    distance: SHELF_DISTANCE,
    elevation: 0.42,
    crop: { w: 300, h: 400, scale: 3 },
  },
  {
    name: 'head-near',
    caption: `the head of the spine, looking down from close in, 2x`,
    distance: 2.4,
    elevation: 0.62,
    crop: { w: 460, h: 560, scale: 2 },
  },
  {
    // Not a candidate shot. The cap's cost halves if there is no tail cap, and
    // that claim is only worth making if the tail is genuinely never on screen.
    name: 'tail-check',
    caption: `looking UP from below the row — is a book's tail ever visible?`,
    distance: 2.4,
    elevation: -0.55,
    crop: { w: 460, h: 560, scale: 2 },
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
      // shot name -> one take per mode, in MODES order.
      const sheets = new Map<string, Taken[]>();
      for (const shot of SHOTS) sheets.set(shot.name, []);

      const costs: { label: string; cost: Cost }[] = [];
      for (const mode of MODES) {
        const { shots, cost } = await shoot(browser, origin, mode.tune);
        costs.push({ label: mode.label, cost });
        for (const shot of SHOTS) {
          const taken = shots[shot.name];
          if (taken !== undefined) sheets.get(shot.name)?.push(taken);
        }
      }

      for (const shot of SHOTS) {
        const takes = sheets.get(shot.name) ?? [];
        if (takes.length === 0) continue;
        const png = await compose(browser, takes, shot);
        const path = join(ARTIFACTS, `proto-corners-${shot.name}.png`);
        writeFileSync(path, Buffer.from(png, 'base64'));
        console.log(`wrote ${path}`);
      }

      // The whole shelf, not one book: divide by the book count for the per-book
      // figures the map's budget is written in.
      console.log('\nmode                        textures  geometries  draw calls  triangles');
      for (const { label, cost } of costs) {
        console.log(
          `${label.padEnd(27)} ${String(cost.textures).padStart(8)} ${String(cost.geometries).padStart(11)} ` +
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

interface Taken {
  readonly image: string;
  /** Where the book's spine front sits on screen, for centring the crop. */
  readonly at: { x: number; y: number } | undefined;
}

interface Cost {
  readonly textures: number;
  readonly geometries: number;
  readonly calls: number;
  readonly triangles: number;
}

async function shoot(
  browser: Browser,
  origin: string,
  tune: unknown,
): Promise<{ shots: Record<string, Taken>; cost: Cost }> {
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

    const query = encodeURIComponent(JSON.stringify(tune));
    await page.goto(`${origin}/?tune=${query}`, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
    await settle(1500);

    // Read while the whole case is on screen, so nothing is frustum-culled and
    // the counts describe the shelf rather than the crop.
    const cost = (await page.evaluate('window.__shelf.protoStats()')) as Cost;

    const taken: Record<string, Taken> = {};
    for (const shot of SHOTS) {
      await page.evaluate(
        `window.__shelf.protoOrbit(${String(BOOK)}, ${String(shot.distance)}, ${String(shot.elevation)})`,
      );
      // Long, and not arbitrarily: `controls.enableDamping` is on at 0.06, so
      // `protoOrbit` sets a camera the controls then *ease* toward over dozens
      // of frames. At 400ms the two sides came back framed differently — the
      // heavier candidate renders fewer frames in the same wall-clock, so it
      // converged less, and the difference read as a change to the books.
      await settle(1600);
      const at = (await page.evaluate(`window.__shelf.projectBook(${String(BOOK)})`)) as
        | { x: number; y: number }
        | undefined;
      taken[shot.name] = {
        image: Buffer.from(await page.screenshot({ type: 'png' })).toString('base64'),
        at,
      };
    }

    if (errors.length > 0) console.error(`page errors:\n  ${errors.join('\n  ')}`);
    return { shots: taken, cost };
  } finally {
    await page.close();
  }
}

/**
 * One shot, captioned, cropped around the book if the shot asked for it.
 *
 * In the browser rather than with an image library because one is already open
 * and this is throwaway — `CLAUDE.md`'s rule about dependencies applies hardest
 * to code that gets deleted.
 */
async function compose(browser: Browser, takes: readonly Taken[], shot: Shot): Promise<string> {
  const page = await browser.newPage();
  try {
    return (await page.evaluate(
      `(async () => {
        const caption = ${JSON.stringify(shot.caption)};
        const crop = ${JSON.stringify(shot.crop ?? null)};
        const labels = ${JSON.stringify(MODES.map((mode) => mode.label))};
        const takes = ${JSON.stringify(takes.map((take) => ({ image: take.image, at: take.at ?? null })))};

        const images = await Promise.all(takes.map((take) => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { resolve(img); };
          img.src = 'data:image/png;base64,' + take.image;
        })));

        const head = 64, gap = 8;
        const w = crop ? crop.w * crop.scale : images[0].width;
        const h = crop ? crop.h * crop.scale : images[0].height;

        const canvas = document.createElement('canvas');
        canvas.width = w * images.length + gap * (images.length - 1);
        canvas.height = h + head;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#f5efe6';
        ctx.font = '600 24px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(caption, 8, 20);

        images.forEach((image, index) => {
          // Every side is cropped around the FIRST take's book position, so the
          // two frames are pixel-aligned and a difference in the picture is a
          // difference in the books rather than in where the crop landed.
          const at = takes[0].at;
          const x = index * (w + gap);
          ctx.font = '600 22px system-ui, sans-serif';
          ctx.fillStyle = '#ffd7a8';
          ctx.fillText(labels[index], x + 8, head - 16);
          if (crop) {
            const sx = Math.max(0, Math.min(image.width - crop.w, (at ? at.x : image.width / 2) - crop.w / 2));
            const sy = Math.max(0, Math.min(image.height - crop.h, (at ? at.y : image.height / 2) - crop.h / 2));
            ctx.drawImage(image, sx, sy, crop.w, crop.h, x, head, w, h);
          } else {
            ctx.drawImage(image, x, head);
          }
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
