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

/**
 * REWRITTEN for #66 — the original three arms are on `proto/soft-corners`.
 *
 * #56 turned the cap on and changed **two** things at once: +20 draw calls and
 * +12,800 triangles. It attributed the ~11% to draw calls because CPU throttling
 * is what it varied, but it never held one of the two constant, so the number
 * was an inference.
 *
 * This is a ladder instead. Every arm below carries the softened hinge, and
 * every *capped* arm draws exactly the same 334 calls — same meshes, same
 * materials, same state changes — while triangles move **640-fold**, from 4 per
 * cap to 2,560. So:
 *
 * - `no cap` → `1x10` is the draw-call step with geometry held near zero.
 * - `1x10` → `64x20` is the geometry step with draw calls held exactly equal.
 *
 * `1x10 again` is the negative control, and it is the one row to read first: two
 * arms identical in every renderer counter, so their gap is what this rig cannot
 * resolve. #56's harness already caught itself reporting 29% of pure drift.
 */
const HINGE = { spineCurveMode: 'normal', spineCurve: 0.125, softHinge: true } as const;

const MODES = [
  { label: 'no cap', tune: { ...HINGE, headCap: false } },
  { label: 'cap 1x2 (4 tri)', tune: { ...HINGE, headCap: true, capSegments: 1, capSteps: 2 } },
  { label: 'cap 1x10 (20 tri)', tune: { ...HINGE, headCap: true, capSegments: 1, capSteps: 10 } },
  { label: 'cap 1x10 again', tune: { ...HINGE, headCap: true, capSegments: 1, capSteps: 10 } },
  { label: 'cap 32x10 (640 tri)', tune: { ...HINGE, headCap: true, capSegments: 32, capSteps: 10 } },
  { label: 'cap 64x20 (2560 tri)', tune: { ...HINGE, headCap: true, capSegments: 64, capSteps: 20 } },
  {
    // Not a candidate — it renders every cap the same colour. Turning the cap on
    // adds 20 draw calls AND 20 materials, and the ladder above leaves those two
    // fused, so without this arm "the cost is the draw calls" would be a claim
    // about a pair rather than a measurement.
    label: 'cap 1x10, 1 material',
    tune: { ...HINGE, headCap: true, capSegments: 1, capSteps: 10, capShareMaterial: true },
  },
] as const;

/**
 * 6 only, where #56 ran 4 and 6.
 *
 * At 1x the shelf ran at ~1290 fps — a 0.78ms frame, which measures the rAF loop
 * rather than the books. 6x is the harsher of #56's two and the one it quoted as
 * "a phone-like main thread", and dropping 4x buys the passes below, which this
 * rig turned out to need far more than it needed a second throttle.
 */
const THROTTLES = [6] as const;

/**
 * 50 only, where #56 ran 50 and 200.
 *
 * The 191-book shelf is an amplifier and #50's fog explicitly reserves "what the
 * shelf costs at four times its size" as somebody else's question. Spending its
 * minutes on passes instead is what makes the 49-book answer trustworthy.
 */
const LIBRARIES = [50] as const;

/** How many 500ms fps windows to take, after discarding the warm-up. */
const SAMPLES = 6;

/**
 * Seven passes, alternating direction, where #56 ran two — and **every reading
 * is kept**, where #56 kept the best.
 *
 * #56 already knew this rig drifts: its first version reported the *hinge only*
 * arm, provably identical to the baseline in every renderer counter, as 29%
 * slower. Reversing the order and taking the best of two was the fix, and #66's
 * own first attempt showed it is not enough — `cap 1x10` and `cap 1x10 again`,
 * the same configuration twice, came back **132.4 and 184.5 fps in one pass**.
 * Best-of-two over noise that large reports whichever arm happened to get a
 * quiet moment.
 *
 * So: more passes, and a distribution rather than a number. The spread across
 * identical arms is printed beside every result, because a delta smaller than it
 * has not been measured — and stating the estimator is the point, since swapping
 * it silently and then comparing to #56's 11% would be an apples-and-oranges
 * result that reads like a finding.
 */
const PASSES = 7;

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
  /** #66: the axis #56 never held constant. Reported beside the draws, always. */
  readonly triangles: number;
  readonly fps: number;
}

async function main(): Promise<void> {
  const readings: Reading[] = [];

  for (const books of LIBRARIES) {
    await buildSite(books);
    const { server, origin } = await serveDist();

    try {
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
              const { calls, triangles, fps, actualBooks } = await measure(
                browser,
                origin,
                mode.tune,
                throttle,
              );
              readings.push({
                books: actualBooks,
                throttle,
                label: mode.label,
                calls,
                triangles,
                fps,
              });
              console.log(
                `pass ${String(pass + 1)}  ${String(actualBooks).padStart(3)} books  ` +
                  `${String(throttle)}x cpu  ${mode.label.padEnd(21)} ` +
                  `${String(calls).padStart(4)} draws  ${String(triangles).padStart(6)} tri  ` +
                  `${fps.toFixed(1)} fps`,
              );
            } finally {
              await browser.close();
            }
          }
        }
      }

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
): Promise<{ calls: number; triangles: number; fps: number; actualBooks: number }> {
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

    const stats = (await page.evaluate('window.__shelf.protoStats()')) as {
      calls: number;
      triangles: number;
    };
    const books = (await page.evaluate('window.__shelf.bookCount')) as number;
    return {
      calls: stats.calls,
      triangles: stats.triangles,
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
interface Summary {
  readonly label: string;
  readonly books: number;
  readonly calls: number;
  readonly triangles: number;
  /** #56's estimator, kept so its 11% stays comparable. */
  readonly best: number;
  readonly median: number;
  readonly worst: number;
  readonly passes: number;
}

function summarise(readings: readonly Reading[]): Summary | undefined {
  if (readings.length === 0) return undefined;
  const first = readings[0];
  if (first === undefined) return undefined;
  const fps = readings.map((r) => r.fps).sort((a, b) => a - b);
  return {
    label: first.label,
    books: first.books,
    calls: first.calls,
    triangles: first.triangles,
    best: fps[fps.length - 1] ?? 0,
    median: fps[Math.floor(fps.length / 2)] ?? 0,
    worst: fps[0] ?? 0,
    passes: fps.length,
  };
}

function report(readings: readonly Reading[]): void {
  const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

  // Nearest-library match, not `>=`. A vault of 200 notes yields 191 shelved
  // books (wishlist and private are dropped), so an exact test never hits — and
  // a `>=` one matched the 49-book rows for BOTH libraries and printed the small
  // shelf twice while silently dropping the large one.
  const at = (books: number, throttle: number, label: string): Summary | undefined =>
    summarise(
      readings.filter(
        (r) =>
          r.throttle === throttle &&
          r.label === label &&
          Math.abs(r.books - books) <= books * 0.15,
      ),
    );

  for (const books of LIBRARIES) {
    for (const throttle of THROTTLES) {
      console.log(`\n== every arm at ${String(throttle)}x cpu, across ${String(PASSES)} passes ==\n`);
      console.log(
        'arm                     draws  triangles     worst    median      best   spread   ' +
          'best vs no cap',
      );
      const off = at(books, throttle, 'no cap');
      for (const mode of MODES) {
        const row = at(books, throttle, mode.label);
        if (row === undefined) continue;
        const spread = ((row.best - row.worst) / row.worst) * 100;
        const delta = off === undefined ? 0 : ((row.best - off.best) / off.best) * 100;
        console.log(
          `${mode.label.padEnd(22)} ${String(row.calls).padStart(5)} ` +
            `${String(row.triangles).padStart(10)} ${row.worst.toFixed(1).padStart(9)} ` +
            `${row.median.toFixed(1).padStart(9)} ${row.best.toFixed(1).padStart(9)} ` +
            `${signed(spread).padStart(8)} ${signed(delta).padStart(16)}`,
        );
      }

      const lean = at(books, throttle, 'cap 1x10 (20 tri)');
      const twin = at(books, throttle, 'cap 1x10 again');
      const built = at(books, throttle, 'cap 32x10 (640 tri)');
      const loud = at(books, throttle, 'cap 64x20 (2560 tri)');
      const one = at(books, throttle, 'cap 1x10, 1 material');
      if (
        off === undefined ||
        lean === undefined ||
        twin === undefined ||
        built === undefined ||
        loud === undefined ||
        one === undefined
      )
        continue;

      const gap = (a: Summary, b: Summary): string => signed(((b.best - a.best) / a.best) * 100);
      console.log(`\n-- ${String(lean.books)} books, ${String(throttle)}x cpu --\n`);
      console.log(`floor, twin arms 1x10 v 1x10 again ....... ${gap(lean, twin)}`);
      console.log(`worst spread within one arm ............. ${signed(
        Math.max(...MODES.map((m) => {
          const row = at(books, throttle, m.label);
          return row === undefined ? 0 : ((row.best - row.worst) / row.worst) * 100;
        })),
      )}`);
      console.log(`geometry, 1x10 -> 64x20 (128x triangles)  ${gap(lean, loud)}`);
      console.log(`materials, 20 of them -> 1 .............. ${gap(lean, one)}`);
      console.log(`the cap's presence, no cap -> 1x10 ...... ${gap(off, lean)}`);
      console.log(`#56 as built, no cap -> 32x10 ........... ${gap(off, built)}`);
    }
  }

  console.log(
    '\nRead the two floor lines before any other. The twin arms are identical in\n' +
      'every renderer counter, so their gap is what this rig cannot tell apart —\n' +
      'and the worst within-arm spread is the honest bound, since the twins can\n' +
      'agree by luck. Any line inside them has not been measured.\n\n' +
      'The `geometry` line moves triangles 128-fold with the draw count pinned at\n' +
      'exactly 334; the `materials` line moves 20 materials to 1 with the draw\n' +
      'count pinned too. #56 changed draws, triangles and materials in one step\n' +
      'and read the sum as the first of the three.',
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
