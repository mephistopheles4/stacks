/**
 * PROTOTYPE — throwaway, for wayfinder ticket #56.
 *
 *     pnpm tsx scripts/proto-corners-stress.ts
 *
 * What do 20 more draw calls actually cost?
 *
 * `ShelfStats.fps` exists because that question has no answer in a draw count,
 * and `scene.ts` says why in its own words: *"the shelf drew the same 302 calls
 * with shadows on and off, and one of those configurations killed a phone."* So
 * this measures frames, not calls.
 *
 * Two axes, each chosen because it loads the thing the cap actually spends:
 *
 * - **CPU throttle.** A draw call is CPU-side state setup, so a slow main thread
 *   is where 20 more of them would show. A desktop GPU at 1x would report 60
 *   either way and prove nothing.
 * - **Library size.** The cap's cost is *per book*, so it multiplies. 49 books is
 *   the shelf that exists; the larger runs ask what happens to somebody whose
 *   vault grew.
 *
 * Vsync is off, so the unthrottled number is a real ceiling rather than 60.
 *
 * Deliberately not a gate. It asserts nothing; it produces numbers.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const VIEWPORT = { width: 1440, height: 900 };

/** The three candidates, matching `proto-corners.ts`. */
const MODES = [
  {
    label: 'today — #55 as decided',
    tune: { spineCurveMode: 'normal', spineCurve: 0.125, softHinge: false, headCap: false },
  },
  {
    label: 'softened hinge only',
    tune: { spineCurveMode: 'normal', spineCurve: 0.125, softHinge: true, headCap: false },
  },
  {
    label: 'hinge + head cap',
    tune: { spineCurveMode: 'normal', spineCurve: 0.125, softHinge: true, headCap: true },
  },
] as const;

/**
 * 4 and 6 only. At 1x the shelf ran at ~1290 fps — a 0.78ms frame, which
 * measures the rAF loop rather than the books, and where 20 draw calls could
 * not show even if they mattered.
 */
const THROTTLES = [4, 6] as const;

/** Book counts to build a vault for. 50 is the shelf the gates already use. */
const LIBRARIES = [50, 200] as const;

/** How many 500ms fps windows to take, after discarding the warm-up. */
const SAMPLES = 6;

/**
 * Two passes, the second with the modes reversed.
 *
 * The first version of this ran the three arms back to back in one browser and
 * reported them in order — and the *hinge only* arm, which has provably
 * identical draws, geometries and triangles to the baseline, came back 29%
 * slower. That is drift, not effect: whatever runs later runs worse. Reversing
 * the order and keeping the best of the two cancels a monotonic drift, and a
 * fresh browser per arm stops one arm inheriting another's state.
 */
const PASSES = 2;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

interface Reading {
  readonly books: number;
  readonly throttle: number;
  readonly label: string;
  readonly calls: number;
  readonly fps: number;
}

async function main(): Promise<void> {
  const readings: Reading[] = [];

  for (const books of LIBRARIES) {
    await buildSite(books);
    const { server, origin } = await serveDist();

    try {
      // best fps seen for one (throttle, mode), across passes.
      const best = new Map<string, Reading>();

      for (let pass = 0; pass < PASSES; pass += 1) {
        const order = pass % 2 === 0 ? MODES : [...MODES].reverse();
        for (const throttle of THROTTLES) {
          for (const mode of order) {
            // A browser per arm. Sharing one let the arm that ran last inherit
            // whatever the previous had warmed or fragmented, which is exactly
            // the drift this harness first reported as a result.
            const browser = await puppeteer.launch({
              executablePath: findChrome(),
              headless: true,
              protocolTimeout: 300_000,
              args: [
                '--headless=new',
                '--hide-scrollbars',
                '--enable-gpu',
                '--use-gl=angle',
                // Without these the ceiling is vsync at 60 and every arm ties.
                '--disable-gpu-vsync',
                '--disable-frame-rate-limit',
              ],
            });

            try {
              const { calls, fps, actualBooks } = await measure(
                browser,
                origin,
                mode.tune,
                throttle,
              );
              const key = `${String(throttle)}|${mode.label}`;
              const previous = best.get(key);
              if (previous === undefined || fps > previous.fps) {
                best.set(key, { books: actualBooks, throttle, label: mode.label, calls, fps });
              }
              console.log(
                `pass ${String(pass + 1)}  ${String(actualBooks).padStart(3)} books  ` +
                  `${String(throttle)}x cpu  ${mode.label.padEnd(24)} ` +
                  `${String(calls).padStart(4)} draws  ${fps.toFixed(1)} fps`,
              );
            } finally {
              await browser.close();
            }
          }
        }
      }

      readings.push(...best.values());
    } finally {
      server.close();
    }
  }

  report(readings);
}

/**
 * One arm: load, settle, then take the median of several fps windows.
 *
 * The median and not the mean, because a single long frame — a texture upload
 * finishing, the compositor waking — drags a mean and says nothing about what
 * the shelf costs to draw.
 */
async function measure(
  browser: Browser,
  origin: string,
  tune: unknown,
  throttle: number,
): Promise<{ calls: number; fps: number; actualBooks: number }> {
  const page = await browser.newPage();
  try {
    await page.setViewport(VIEWPORT);
    const session = await page.createCDPSession();
    await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    const query = encodeURIComponent(JSON.stringify({ materials: tune }));
    // `domcontentloaded`, not `networkidle0`: with vsync off the shelf renders
    // flat out and the idle heuristic never fires. The shelf's own readiness
    // flag is the signal that actually means the books are up.
    await page.goto(`${origin}/?tune=${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('window.__shelf?.ready === true', { timeout: 60_000 });

    // Long enough that every cover has uploaded and the first-frame shader
    // compiles are behind us — otherwise the arm measured first pays for work
    // it would otherwise inherit warm.
    await settle(3000 + 1500 * throttle);

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      await settle(600);
      const stats = (await page.evaluate('window.__shelf.protoStats()')) as {
        calls: number;
        fps: number;
      };
      samples.push(stats.fps);
    }
    samples.sort((a, b) => a - b);

    const stats = (await page.evaluate('window.__shelf.protoStats()')) as { calls: number };
    const books = (await page.evaluate('window.__shelf.bookCount')) as number;
    return {
      calls: stats.calls,
      fps: samples[Math.floor(samples.length / 2)] ?? 0,
      actualBooks: books,
    };
  } finally {
    await page.close();
  }
}

/**
 * What the cap costs, against what the rig can actually resolve.
 *
 * `noise` is the *hinge only* arm against the baseline. Those two draw the same
 * 314 calls, the same geometries and the same triangles — the only difference
 * between them is which 2 KB normal map a material points at. So their measured
 * gap is not a cost; it is this rig's noise floor, and a cap delta smaller than
 * it has not been measured at all.
 */
function report(readings: readonly Reading[]): void {
  console.log('\n== what the head cap costs, against what this rig can resolve ==\n');
  console.log('books  cpu   baseline      hinge only    hinge + cap    cap cost   noise floor');
  for (const books of LIBRARIES) {
    for (const throttle of THROTTLES) {
      // Nearest-library match, not `>=`. A vault of 200 notes yields 191 shelved
      // books (wishlist and private are dropped), so an exact test never hits —
      // and a `>=` one matched the 49-book rows for BOTH libraries and printed
      // the small shelf twice while silently dropping the large one.
      const at = (label: string): Reading | undefined =>
        readings.find(
          (r) =>
            r.throttle === throttle &&
            r.label.includes(label) &&
            Math.abs(r.books - books) <= books * 0.15,
        );
      const base = at('#55 as decided');
      const hinge = at('hinge only');
      const cap = at('head cap');
      if (base === undefined || hinge === undefined || cap === undefined) continue;

      const cost = ((cap.fps - hinge.fps) / hinge.fps) * 100;
      const noise = ((hinge.fps - base.fps) / base.fps) * 100;
      const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
      console.log(
        `${String(hinge.books).padStart(5)}  ${String(throttle)}x   ` +
          `${base.fps.toFixed(1).padStart(7)} fps ${hinge.fps.toFixed(1).padStart(8)} fps ` +
          `${cap.fps.toFixed(1).padStart(9)} fps ${signed(cost).padStart(10)} ` +
          `${signed(noise).padStart(10)}`,
      );
    }
  }
  console.log(
    '\nRead the last two columns together. The noise floor is two arms that are\n' +
      'identical in every renderer counter, so it is what this rig cannot tell\n' +
      'apart. A cap cost inside it is a cost that has not been measured.',
  );
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(shellCommand(command, args), {
      cwd: REPO_ROOT,
      shell: true,
      stdio: 'inherit',
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${String(code)}`)),
    );
  });
}

async function buildSite(books: number): Promise<void> {
  console.log(`\n--- building a ${String(books)}-book vault ---`);
  await run('pnpm', ['fixtures:50'], { STACKS_FIXTURE_BOOKS: String(books) });
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
