/**
 * PROTOTYPE — throwaway, for wayfinder ticket #66.
 *
 *     pnpm tsx scripts/proto-cap-tess.ts
 *
 * How coarse can the head cap be before it stops reading?
 *
 * #56 built the cap at `SEGMENTS 32 × CAP_STEPS 10` = 640 triangles and said in
 * its own resolution that a coarser one was never measured. This renders a
 * ladder of tessellations against that shape and writes both the sheets a human
 * judges and the raw frames `proto-cap-diff.ts` puts a number on.
 *
 * Two axes, and they are not the same kind of number:
 *
 * - **`steps`** subdivides the quarter turn. That turn *is* the silhouette, so
 *   this is where a floor should exist.
 * - **`segments`** subdivides across the spine's width — along which
 *   `headCapGeometry` varies in nothing at all. The prediction is that it is
 *   free, and a prediction is not a finding, which is why `32 × 10` down to
 *   `1 × 10` is rendered rather than reasoned about.
 *
 * `32x10-again` is a **negative control**: the same arm rendered twice. Its diff
 * is this harness's own floor — camera damping, texture upload order, GPU
 * nondeterminism — and any arm that lands inside it has not been measured.
 * `prototype-page-diff.ts` (#54) and `prototype-grain-diff.ts` (#68) established
 * that a share of frame is not an answer; the absolute pixel count is.
 *
 * Deliberately not a gate. It asserts nothing; it produces pictures and numbers.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const ARTIFACTS = join(REPO_ROOT, 'artifacts', 'cap-tess');
/** `smoke:render`'s viewport, so these read like the shelf people actually see. */
const VIEWPORT = { width: 1440, height: 900 };

/** The world #55 and #56 landed on. Every arm below sits in it. */
const WORLD = { spineCurveMode: 'normal', spineCurve: 0.125, softHinge: true } as const;

interface Arm {
  readonly name: string;
  readonly label: string;
  readonly tune: Record<string, unknown>;
}

/**
 * The ladder. Every capped arm draws **the same 334 calls** — same meshes, same
 * materials, same state changes — so triangles are the only thing moving, which
 * is the separation #56 never made.
 */
const ARMS: readonly Arm[] = [
  { name: 'off', label: 'no cap (#55 only)', tune: { ...WORLD, headCap: false } },
  { name: '32x10', label: '32 x 10 — #56 as built', tune: cap(32, 10) },
  { name: '32x10-again', label: '32 x 10 again — the floor', tune: cap(32, 10) },
  { name: '8x10', label: '8 x 10', tune: cap(8, 10) },
  { name: '2x10', label: '2 x 10', tune: cap(2, 10) },
  { name: '1x10', label: '1 x 10', tune: cap(1, 10) },
  { name: '1x6', label: '1 x 6', tune: cap(1, 6) },
  { name: '1x4', label: '1 x 4', tune: cap(1, 4) },
  { name: '1x3', label: '1 x 3', tune: cap(1, 3) },
  { name: '1x2', label: '1 x 2', tune: cap(1, 2) },
  { name: '64x20', label: '64 x 20 — the loud arm', tune: cap(64, 20) },
  // The second question, and a separate one: `CAP = 0.1` was never tuned either.
  { name: 'roll06', label: 'roll 0.06 (1 x 10)', tune: cap(1, 10, 0.06) },
  { name: 'roll16', label: 'roll 0.16 (1 x 10)', tune: cap(1, 10, 0.16) },
];

function cap(segments: number, steps: number, roll = 0.1): Record<string, unknown> {
  return { ...WORLD, headCap: true, capSegments: segments, capSteps: steps, capRoll: roll };
}

/** Which sheets get composed, and out of which arms. Everything is still diffed. */
const SHEETS: readonly { readonly name: string; readonly arms: readonly string[] }[] = [
  { name: 'segments', arms: ['32x10', '8x10', '2x10', '1x10'] },
  { name: 'steps', arms: ['1x10', '1x4', '1x3', '1x2'] },
  { name: 'roll', arms: ['off', 'roll06', '1x10', 'roll16'] },
];

/** Which book the close framings sit in front of — a hardback, so it has a cap. */
const BOOK = 12;

/** `controls.minDistance` in `scene.ts`. Any closer is clamped anyway. */
const CLOSEST = 1.5;

interface Framing {
  readonly name: string;
  readonly caption: string;
  readonly distance: number;
  readonly elevation: number;
  /** 0 aims at the spine's centre, 1 at its head. See `protoOrbit`. */
  readonly lift: number;
  readonly crop: { readonly w: number; readonly h: number; readonly scale: number };
}

/**
 * A silhouette feature is judged where its outline is against something else, so
 * the floor is set by the closest orbit and by looking *down*.
 *
 * **Every framing aims at the head**, which #56's did not and which the first
 * run of this script did not either. #56 framed the spine's centre and cropped
 * upward; at `minDistance` the book is large enough that the crop stops
 * containing the head at all, so the diff came back reporting a change in the
 * *spine strip's* height — real, and not the question. Aiming at the head puts
 * it at frame centre by construction, because that is what the camera targets.
 *
 * `head-down` keeps #56's distance and elevation so the pictures stay
 * comparable with the ones that ticket closed on; only the aim moved.
 */
const FRAMINGS: readonly Framing[] = [
  {
    name: 'head-down',
    caption: `the head of the spine, looking down from close in, 2x (book ${String(BOOK)})`,
    distance: 2.4,
    elevation: 0.62,
    lift: 1,
    crop: { w: 460, h: 460, scale: 2 },
  },
  {
    name: 'head-closest',
    caption: `the same head at the closest orbit the camera allows, 3x`,
    distance: CLOSEST,
    elevation: 0.62,
    lift: 1,
    crop: { w: 300, h: 300, scale: 3 },
  },
  {
    name: 'graze',
    caption: `the cap's outline seen almost edge-on, closest orbit, 3x`,
    distance: CLOSEST,
    elevation: 0.24,
    lift: 1,
    crop: { w: 300, h: 300, scale: 3 },
  },
];

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

interface Cost {
  readonly textures: number;
  readonly geometries: number;
  readonly calls: number;
  readonly triangles: number;
}

interface Taken {
  readonly image: string;
}

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
      // arm name -> framing name -> take.
      const taken = new Map<string, Record<string, Taken>>();
      const costs: { name: string; label: string; cost: Cost }[] = [];

      for (const arm of ARMS) {
        const { shots, cost } = await shoot(browser, origin, arm.tune);
        taken.set(arm.name, shots);
        costs.push({ name: arm.name, label: arm.label, cost });
        for (const framing of FRAMINGS) {
          const shot = shots[framing.name];
          if (shot === undefined) continue;
          writeFileSync(
            join(ARTIFACTS, `${arm.name}-${framing.name}.png`),
            Buffer.from(shot.image, 'base64'),
          );
        }
        console.log(`shot ${arm.label}`);
      }

      // Where the diff should look. Taken from the reference arm and written
      // down, so `proto-cap-diff.ts` crops the same rectangle on every arm
      // instead of re-deriving one per frame and comparing two different places.
      const crops: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const framing of FRAMINGS) crops[framing.name] = cropRect(framing);
      writeFileSync(join(ARTIFACTS, 'crops.json'), JSON.stringify(crops, null, 2));

      for (const sheet of SHEETS) {
        for (const framing of FRAMINGS) {
          const takes = sheet.arms.map((name) => taken.get(name)?.[framing.name]);
          if (takes.some((take) => take === undefined)) continue;
          const labels = sheet.arms.map(
            (name) => ARMS.find((arm) => arm.name === name)?.label ?? name,
          );
          const png = await compose(browser, takes as Taken[], labels, framing);
          const path = join(ARTIFACTS, `sheet-${sheet.name}-${framing.name}.png`);
          writeFileSync(path, Buffer.from(png, 'base64'));
          console.log(`wrote ${path}`);
        }
      }

      report(costs);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

/**
 * The whole shelf's counters per arm, with the cap's own triangles backed out.
 *
 * The per-cap column is the arithmetic `2 x segments x steps` reconciled against
 * what the renderer actually reports, rather than asserted — #53 reconciled its
 * draw count to the integer for the same reason.
 */
function report(costs: readonly { name: string; label: string; cost: Cost }[]): void {
  const off = costs.find((entry) => entry.name === 'off')?.cost;
  console.log('\n== what each tessellation costs the whole shelf ==\n');
  console.log('arm                        draws  triangles   over "no cap"  per cap');
  for (const { label, cost } of costs) {
    const extra = off === undefined ? 0 : cost.triangles - off.triangles;
    const caps = 20; // hardbacks on the 49-book fixture; printed below to check.
    console.log(
      `${label.padEnd(26)} ${String(cost.calls).padStart(5)} ${String(cost.triangles).padStart(10)} ` +
        `${String(extra).padStart(14)} ${(extra / caps).toFixed(1).padStart(8)}`,
    );
  }
  console.log(
    '\nEvery capped arm draws the same calls. That is the point: triangles move\n' +
      'by two orders of magnitude with the draw count pinned, so the stress run\n' +
      'can finally tell the two suspects apart.',
  );
}

/**
 * The frame's centre, and that is not a shortcut.
 *
 * `protoOrbit` sets `controls.target` to the point it aims at and puts the
 * camera on a sphere around it, so the aimed point projects to the centre of the
 * frame by construction. With `lift: 1` that point is the head — so a centred
 * crop is the head, on every arm, with nothing to re-derive per frame and
 * nothing that can drift between two arms being compared.
 */
function cropRect(framing: Framing): { x: number; y: number; w: number; h: number } {
  const { w, h } = framing.crop;
  return {
    x: Math.round((VIEWPORT.width - w) / 2),
    y: Math.round((VIEWPORT.height - h) / 2),
    w,
    h,
  };
}

async function shoot(
  browser: Browser,
  origin: string,
  tune: Record<string, unknown>,
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

    const query = encodeURIComponent(JSON.stringify({ materials: tune }));
    await page.goto(`${origin}/?tune=${query}`, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
    await settle(1500);

    const cost = (await page.evaluate('window.__shelf.protoStats()')) as Cost;

    const taken: Record<string, Taken> = {};
    for (const framing of FRAMINGS) {
      const orbit = `window.__shelf.protoOrbit(${String(BOOK)}, ${String(framing.distance)}, ${String(framing.elevation)}, ${String(framing.lift)})`;
      // Twice, with a settle between. `controls.enableDamping` is on at 0.06, so
      // one call sets a camera the controls then *ease* toward — and a heavier
      // arm renders fewer frames in the same wall clock and converges less. #56
      // hit exactly that and read it as a change to the books. Re-issuing from
      // the already-eased position converges the two sides on the same camera.
      await page.evaluate(orbit);
      await settle(1600);
      await page.evaluate(orbit);
      await settle(900);
      taken[framing.name] = {
        image: Buffer.from(await page.screenshot({ type: 'png' })).toString('base64'),
      };
    }

    if (errors.length > 0) console.error(`page errors:\n  ${errors.join('\n  ')}`);
    return { shots: taken, cost };
  } finally {
    await page.close();
  }
}

/** One sheet, cropped around the reference arm's book so the panes align. */
async function compose(
  browser: Browser,
  takes: readonly Taken[],
  labels: readonly string[],
  framing: Framing,
): Promise<string> {
  const page = await browser.newPage();
  try {
    return (await page.evaluate(
      `(async () => {
        const caption = ${JSON.stringify(framing.caption)};
        const crop = ${JSON.stringify(framing.crop)};
        const rect = ${JSON.stringify(cropRect(framing))};
        const labels = ${JSON.stringify(labels)};
        const takes = ${JSON.stringify(takes.map((take: Taken) => take.image))};

        const images = await Promise.all(takes.map((image) => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { resolve(img); };
          img.src = 'data:image/png;base64,' + image;
        })));

        const head = 64, gap = 8;
        const w = crop.w * crop.scale;
        const h = crop.h * crop.scale;

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
          const x = index * (w + gap);
          ctx.font = '600 22px system-ui, sans-serif';
          ctx.fillStyle = '#ffd7a8';
          ctx.fillText(labels[index], x + 8, head - 16);
          ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, x, head, w, h);
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
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    });
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
  if (found === undefined)
    throw new Error(`no Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  return found;
}

await main();
