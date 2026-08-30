/**
 * PROTOTYPE ONLY — wayfinder ticket #297, "Which wood is the backboard's own
 * sheet, and does its grain read behind books?", under map #280. Never merged
 * to `main`.
 *
 *     pnpm tsx scripts/prototype-backboard-arms.ts
 *
 * ## The two scenes, and why one render answers neither question
 *
 * #297's own framing: the backboard is **the largest wooden surface on screen
 * and the most occluded one at the same time**. #282 measured the near rung at
 * **90.34% backboard** on an empty case, and every one of those pixels sits
 * behind books on a populated shelf. So every arm is rendered twice:
 *
 * - **Empty**, at the four rungs of #54's level ladder — the judging scene #280
 *   settled on, where the backboard is nearly the whole frame; and
 * - **Populated**, at the identical cameras — where it is the strips between
 *   the spines and the band above them.
 *
 * ⚠️ **Every figure below states which scene it came from**, because the two
 * pull opposite ways and a number that does not say is worse than no number.
 *
 * ⚠️ **The populated case gets its own clown pass**, which nothing on this map
 * has run before. #282 measured the backboard's share of an *empty* frame; what
 * decides "does the grain read behind books" is its share of a *populated* one,
 * and that has never been counted.
 *
 * ## What every arm holds fixed
 *
 * **#284's standing candidate, on the planks and uprights.** The question is
 * what the backboard looks like behind the woodwork treatment that is going to
 * ship, not next to today's flat boards — so `?wood=both&woodSpecies=rosewood`
 * rides on every URL and the only thing varying is `?back=`.
 *
 * ## What the numbers cannot do
 *
 * **Decide.** #282 settled that the verdict is the owner's on a live build. The
 * over-JND count proves a texture reached the shader and states its cost.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'backboard-arms');
const WOOD_DIR = join(REPO_ROOT, 'packages', 'site', 'public', 'wood');
const VIEWPORT = { width: 1440, height: 900 };

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) throw new Error('no system Chrome found');
  return found;
}

function glArgs(): string[] {
  return process.env['CI'] === 'true'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--enable-gpu', '--use-gl=angle'];
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
    'stacks',
    'build',
    '--public',
    '--vault',
    'fixtures/vault-50',
    '--assets',
    'packages/site/public',
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
        reject(new Error('listening on a pipe, not a port'));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${String(address.port)}` });
    });
  });
}

/** #284's measurement, plus the backboard's own resolved configuration. */
const MEASURE = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let overBloom = 0, brightest = 0;
  for (let i = 0; i < px.length; i += 4) {
    const luma = (0.2126 * px[i] + 0.7152 * px[i+1] + 0.0722 * px[i+2]) / 255;
    if (luma > 0.85) overBloom++;
    if (luma > brightest) brightest = luma;
  }
  const s = window.__shelf.stats();
  const b = window.__backArm || {};
  const a = window.__woodArm || {};
  return {
    overBloom, brightest, total: w * h,
    textures: s.textures, programs: s.programs, calls: s.calls,
    resolved: [b.species, b.arm, b.resolution, 'tile ' + (b.unitsPerTile || 0).toFixed(2),
               'normal ' + b.normalScale, 'detail ' + b.detail,
               'rough ' + (b.roughness === undefined ? 'default' : b.roughness),
               'vary ' + b.vary, 'fibre ' + (b.fibreTurn ? 'turned' : 'crossed')].join(' / '),
    wood: [a.species, a.arm, a.resolution, 'detail ' + a.detail, 'vary ' + a.vary].join(' / '),
  };
})()`;

/** #282's composition pass, run on a populated case as well as an empty one. */
const COUNT_CASE = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.getElementById('shelf-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let woodwork = 0, backboard = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2];
    if (r > 12 && b > 12 && g * 2 < r && g * 2 < b) woodwork++;
    else if (g > 12 && r * 2 < g && b * 2 < g) backboard++;
  }
  return { woodwork, backboard, total: w * h, books: window.__shelf.bookCount };
})()`;

interface Measurement {
  overBloom: number;
  brightest: number;
  total: number;
  textures: number;
  programs: number;
  calls: number;
  /** What `prototype-backboard.ts` actually resolved, read back off the page. */
  resolved: string;
  /** And what the woodwork underneath resolved to, so the base cannot drift silently. */
  wood: string;
}

interface Counts {
  woodwork: number;
  backboard: number;
  total: number;
  books: number;
}

interface Shot {
  readonly file: string;
  readonly back: string;
  readonly query?: string;
  readonly wheelSteps: number;
  readonly dragY?: number;
  readonly populated?: boolean;
  readonly clown?: boolean;
}

/**
 * #284's standing candidate on the planks and uprights, unchanged on every URL.
 *
 * ⚠️ **Read back off the page, not trusted.** `MEASURE` reports what `?wood=`
 * resolved to alongside what `?back=` did, because a base that silently stopped
 * applying would make every backboard arm look better than it is.
 */
const WOOD_BASE = 'wood=both&woodSpecies=rosewood&woodRes=1024&woodDetail=0.5&woodNormal=0.5';

/**
 * ⚠️ **The per-member variation is turned off for the measurement arms, and
 * that is a control rather than a default.**
 *
 * [#287](https://github.com/mephistopheles4/stacks/issues/287)'s five
 * differences include a **±10% tint**, applied per member through a vertex
 * colour. On the woodwork that is one draw among six boards; on the backboard
 * it is one draw covering **90% of the near frame**, so it moves that board's
 * whole average — and the mean-matched twin then matches nothing, which is the
 * exact confound the twin exists to remove.
 *
 * So every number below is unvaried on both materials, and the shipping
 * configuration is rendered separately, at the end, and differenced against its
 * own arm to state what the variation costs in pixels.
 */
const UNVARIED = '&woodVary=0&backVary=0';

async function shoot(
  browser: Browser,
  origin: string,
  shot: Shot,
): Promise<{ measured: Measurement | undefined; counts: Counts | undefined }> {
  const page: Page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  if (shot.populated !== true) await page.evaluateOnNewDocument('window.__empty = true;');
  if (shot.clown === true) await page.evaluateOnNewDocument('window.__clownCase = true;');
  // The per-arm tail comes last, so an arm that wants the variation back can
  // simply append `&backVary=1` — `readBackArm` takes the **last** occurrence.
  const query = `?back=${shot.back}&${WOOD_BASE}${UNVARIED}${shot.query ?? ''}`;
  await page.goto(`${origin}/${query}`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
  // Both signals, because both materials load files and either one arriving
  // late produces the screenshot that says "the arm did nothing".
  await page.waitForFunction('window.__woodReady === true', { timeout: 20_000 });
  await page.waitForFunction('window.__backReady === true', { timeout: 20_000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));

  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  if (shot.wheelSteps > 0) {
    for (let step = 0; step < shot.wheelSteps; step++) {
      await page.mouse.wheel({ deltaY: -120 });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  if (shot.dragY !== undefined) {
    await page.mouse.down();
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2 + shot.dragY, { steps: 12 });
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const counts = shot.clown === true ? ((await page.evaluate(COUNT_CASE)) as Counts) : undefined;
  const measured =
    shot.clown === true ? undefined : ((await page.evaluate(MEASURE)) as Measurement);
  writeFileSync(join(OUT_DIR, shot.file), await page.screenshot({ type: 'png' }));
  await page.close();
  return { measured, counts };
}

/* --- the differ, #282's, unchanged ----------------------------------------- */

const NOTICEABLE = 8;

interface Diff {
  readonly mean: number;
  readonly movedPct: number;
  readonly worst: number;
}

async function diff(a: string, b: string): Promise<Diff> {
  const sharp = (await import('sharp')).default;
  const [left, right] = await Promise.all([
    sharp(join(OUT_DIR, a)).raw().toBuffer(),
    sharp(join(OUT_DIR, b)).raw().toBuffer(),
  ]);
  if (left.length !== right.length) throw new Error(`${a} and ${b} differ in size`);

  let total = 0;
  let moved = 0;
  let worst = 0;
  for (let i = 0; i < left.length; i++) {
    const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
    total += delta;
    if (delta > NOTICEABLE) moved++;
    if (delta > worst) worst = delta;
  }
  return { mean: total / left.length, movedPct: (moved / left.length) * 100, worst };
}

function row(label: string, d: Diff): string {
  return (
    `  ${label.padEnd(40)} mean Δ ${d.mean.toFixed(3).padStart(7)}   ` +
    `>JND ${d.movedPct.toFixed(3).padStart(7)}%   worst ${String(d.worst).padStart(3)}`
  );
}

/* --- the roster ------------------------------------------------------------ */

const LADDER = [
  { tag: 'shelf', wheelSteps: 0, label: 'full shelf' },
  { tag: 'zoom10', wheelSteps: 10, label: 'zoom 10' },
  { tag: 'zoom25', wheelSteps: 25, label: 'zoom 25' },
  { tag: 'near', wheelSteps: 60, label: 'minDistance' },
] as const;

interface Arm {
  readonly tag: string;
  readonly label: string;
  readonly back: string;
  readonly query?: string;
  /** The reference whose difference is *grain alone*, when it is not the baseline. */
  readonly twin?: string;
  readonly orbit?: boolean;
  /** Also rendered on a populated case at every rung. */
  readonly populated?: boolean;
}

/**
 * ⚠️ **`darkwood` is one candidate rather than a menu, and that is the
 * survey's finding.** `scripts/prototype-backboard-survey.ts` measured all 41
 * of Poly Haven's veneers in linear light: only `dark_wood` and
 * `rosewood_veneer1` land within 5 luma of `woodDark`, and the next nearest is
 * +24.8 away. #281's four-species menu was for a surface with no darkness
 * constraint on it; this one has the constraint that the books read against it.
 *
 * **`rosewood` is the separation control** — the woodwork's own sheet, put on
 * the backboard, so "a sheet whose mean lands near the woodwork's defeats the
 * separation the second material exists for" is something to look at rather
 * than something asserted.
 */
const ARMS: readonly Arm[] = [
  { tag: 'off', label: 'baseline — today’s flat woodDark', back: 'off', populated: true },
  {
    tag: 'flat',
    label: 'flat, mean-matched (0x5f2c19), no map',
    back: 'flat',
    populated: true,
  },
  {
    tag: 'pigment',
    label: 'pigment — dark_wood figure @512',
    back: 'pigment',
    twin: 'flat',
    orbit: true,
    populated: true,
  },
  {
    tag: 'pigment1024',
    label: 'pigment @1024 — the resolution control',
    back: 'pigment',
    query: '&backRes=1024',
    twin: 'flat',
  },
  {
    tag: 'relief',
    label: 'relief — dark_wood’s own normal @512',
    back: 'relief',
    orbit: true,
  },
  {
    tag: 'fibre',
    label: 'relief — the drawn fibre, 0 bytes',
    back: 'relief',
    query: '&backDetail=0.5&backNormal=0.5',
    orbit: true,
  },
  {
    tag: 'candidate',
    label: 'the candidate — figure + drawn fibre',
    back: 'both',
    query: '&backDetail=0.5&backNormal=0.5',
    twin: 'flat',
    orbit: true,
    populated: true,
  },
  {
    /**
     * The candidate with the fibre left **crossing** the figure — what the
     * first run rendered before a 3x crop of the bare backboard showed ruled
     * horizontal lines over a vertical grain. It stays on the roster as the
     * comparison: the fibre's own direction is a decision, and a decision needs
     * both sides rendered.
     */
    tag: 'crossed',
    label: 'the candidate with the fibre crossing the figure',
    back: 'both',
    query: '&backDetail=0.5&backNormal=0.5&backFibreTurn=0',
    twin: 'flat',
    orbit: true,
  },
  {
    tag: 'rosewood',
    label: 'the separation control — the woodwork’s own sheet',
    back: 'pigment',
    query: '&backSpecies=rosewood&backRes=1024',
    populated: true,
  },
  { tag: 'wire', label: 'wiring check — every channel past plausible', back: 'wire' },
];

function mapBytes(): string {
  return ['darkwood-diff-512.jpg', 'darkwood-diff-1024.jpg', 'darkwood-nor-512.jpg']
    .filter((file) => existsSync(join(WOOD_DIR, file)))
    .map((file) => `${file} ${(statSync(join(WOOD_DIR, file)).size / 1024).toFixed(1)} KB`)
    .join('   ');
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await buildSite();
  const { server, origin } = await serveDist();
  try {
    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--headless=new', '--hide-scrollbars', ...glArgs()],
    });
    try {
      const measured = new Map<string, Measurement>();
      const record = async (key: string, shot: Shot): Promise<void> => {
        const result = await shoot(browser, origin, shot);
        if (result.measured !== undefined) measured.set(key, result.measured);
      };

      for (const arm of ARMS) {
        for (const rung of LADDER) {
          await record(`${arm.tag}-${rung.tag}`, {
            file: `${arm.tag}-${rung.tag}.png`,
            back: arm.back,
            ...(arm.query === undefined ? {} : { query: arm.query }),
            wheelSteps: rung.wheelSteps,
          });
        }
        if (arm.orbit === true) {
          await record(`${arm.tag}-orbit`, {
            file: `${arm.tag}-orbit.png`,
            back: arm.back,
            ...(arm.query === undefined ? {} : { query: arm.query }),
            wheelSteps: 10,
            dragY: 50,
          });
        }
        // The half an empty case cannot answer. Same cameras, books in.
        if (arm.populated === true) {
          for (const rung of LADDER) {
            await record(`books-${arm.tag}-${rung.tag}`, {
              file: `books-${arm.tag}-${rung.tag}.png`,
              back: arm.back,
              ...(arm.query === undefined ? {} : { query: arm.query }),
              wheelSteps: rung.wheelSteps,
              populated: true,
            });
          }
        }
      }

      // The orbited references the relief arms are differenced against.
      for (const tag of ['off', 'flat'] as const) {
        const arm = ARMS.find((candidate) => candidate.tag === tag);
        await record(`${tag}-orbit`, {
          file: `${tag}-orbit.png`,
          back: arm?.back ?? 'off',
          wheelSteps: 10,
          dragY: 50,
        });
      }

      /**
       * The roughness sweep, and it is the arm #297 asked for by name.
       *
       * `backingRoughness` is 0.95 against the wood's 0.82, and #68's diagnosis
       * — a dielectric under soft light has almost no specular lobe for a
       * normal map to modulate — gets *stronger* as roughness climbs. Without
       * this sweep a relief zero means either "this surface" or "this
       * roughness" and there is no way to tell which.
       */
      for (const rough of [0.6, 0.82]) {
        await record(`fibre-r${String(rough)}`, {
          file: `fibre-r${String(rough)}-orbit.png`,
          back: 'relief',
          query: `&backDetail=0.5&backNormal=0.5&backRough=${String(rough)}`,
          wheelSteps: 10,
          dragY: 50,
        });
        await record(`off-r${String(rough)}`, {
          file: `off-r${String(rough)}-orbit.png`,
          back: 'off',
          query: `&backRough=${String(rough)}`,
          wheelSteps: 10,
          dragY: 50,
        });
      }

      // A control through the identical pipe: two runs of one arm must agree,
      // or every zero below is an instrument reading rather than a finding.
      await record('rerun', {
        file: 'candidate-shelf-rerun.png',
        back: 'both',
        query: '&backDetail=0.5&backNormal=0.5',
        wheelSteps: 0,
      });

      /**
       * The shipping configuration: #287's variation back on, both materials.
       *
       * Not a measurement arm — see `UNVARIED` — but the frame the owner will
       * actually be looking at, and the one number that says how far the
       * measured arms sit from it.
       */
      for (const [tag, populated] of [
        ['vary-zoom10', false],
        ['books-vary-zoom10', true],
      ] as const) {
        await record(tag, {
          file: `${tag}.png`,
          back: 'both',
          query: '&backDetail=0.5&backNormal=0.5&woodVary=1&backVary=1',
          wheelSteps: 10,
          ...(populated ? { populated: true } : {}),
        });
      }

      /**
       * The composition pass, on **both** scenes.
       *
       * #282 counted the backboard's share of an empty frame — 90.34% at
       * `minDistance`. What #297 needs, and what nothing has counted, is its
       * share of a *populated* one: that number is the ceiling on how much of
       * this decision a visitor ever sees.
       */
      const composition: { rung: string; empty: Counts; books: Counts }[] = [];
      for (const rung of LADDER) {
        const empty = await shoot(browser, origin, {
          file: `clown-empty-${rung.tag}.png`,
          back: 'off',
          wheelSteps: rung.wheelSteps,
          clown: true,
        });
        const books = await shoot(browser, origin, {
          file: `clown-books-${rung.tag}.png`,
          back: 'off',
          wheelSteps: rung.wheelSteps,
          populated: true,
          clown: true,
        });
        if (empty.counts === undefined || books.counts === undefined) {
          throw new Error('the composition pass returned no counts');
        }
        composition.push({ rung: rung.label, empty: empty.counts, books: books.counts });
      }

      /* --- the report ---------------------------------------------------- */

      console.log('');
      console.log(`maps on disk   ${mapBytes()}`);

      console.log('');
      console.log('what each arm resolved to, read back off the page:');
      for (const arm of ARMS) {
        const m = measured.get(`${arm.tag}-zoom10`);
        if (m === undefined) continue;
        console.log(`  ${arm.tag.padEnd(12)} ${m.resolved}`);
      }
      const anyArm = measured.get('off-zoom10');
      console.log(`  woodwork under every one of them: ${anyArm?.wood ?? 'unknown'}`);

      console.log('');
      console.log('how much of the frame the backboard is — empty against populated:');
      for (const entry of composition) {
        const pct = (c: Counts): string => ((c.backboard / c.total) * 100).toFixed(2);
        const wood = (c: Counts): string => ((c.woodwork / c.total) * 100).toFixed(2);
        console.log(
          `  ${entry.rung.padEnd(13)} empty ${pct(entry.empty).padStart(6)}% backboard, ` +
            `${wood(entry.empty).padStart(5)}% woodwork   |   ` +
            `books in ${pct(entry.books).padStart(6)}% backboard, ` +
            `${wood(entry.books).padStart(5)}% woodwork   ` +
            `(${String(entry.books.books)} books)`,
        );
      }

      console.log('');
      console.log('cost, from renderer.info at zoom 10 — measured, not predicted:');
      const base = measured.get('off-zoom10');
      for (const arm of ARMS) {
        const m = measured.get(`${arm.tag}-zoom10`);
        if (m === undefined || base === undefined) continue;
        const delta = (now: number, then: number): string =>
          `${now - then >= 0 ? '+' : ''}${String(now - then)}`;
        console.log(
          `  ${arm.tag.padEnd(12)} textures ${String(m.textures).padStart(3)} ` +
            `(${delta(m.textures, base.textures)})   ` +
            `programs ${String(m.programs).padStart(3)} (${delta(m.programs, base.programs)})   ` +
            `calls ${String(m.calls).padStart(4)} (${delta(m.calls, base.calls)})`,
        );
      }

      console.log('');
      console.log("ADR-0034's bloom threshold (0.85 luma) — pixels over it, and the brightest:");
      for (const arm of ARMS) {
        const m = measured.get(`${arm.tag}-zoom10`);
        if (m === undefined) continue;
        console.log(
          `  ${arm.tag.padEnd(12)} over threshold ${String(m.overBloom).padStart(8)} px ` +
            `(${((m.overBloom / m.total) * 100).toFixed(4)}% of frame)   ` +
            `brightest ${m.brightest.toFixed(3)}`,
        );
      }

      console.log('');
      console.log('controls — what the differ says when the answer is already known:');
      console.log(
        row('the candidate twice (expect ~0)', await diff('candidate-shelf.png', 'candidate-shelf-rerun.png')),
      );

      for (const arm of ARMS) {
        if (arm.tag === 'off') continue;
        console.log('');
        console.log(`${arm.tag} — ${arm.label}`);
        console.log('  empty case:');
        for (const rung of LADDER) {
          console.log(
            row(`${rung.label} vs baseline`, await diff(`off-${rung.tag}.png`, `${arm.tag}-${rung.tag}.png`)),
          );
        }
        if (arm.twin !== undefined) {
          console.log(`  ${'-'.repeat(40)} grain alone, against its own mean:`);
          for (const rung of LADDER) {
            console.log(
              row(
                `${rung.label} vs ${arm.twin}`,
                await diff(`${arm.twin}-${rung.tag}.png`, `${arm.tag}-${rung.tag}.png`),
              ),
            );
          }
        }
        if (arm.orbit === true) {
          console.log(`  ${'-'.repeat(40)} orbited ~20°:`);
          console.log(row('orbit vs baseline', await diff('off-orbit.png', `${arm.tag}-orbit.png`)));
          if (arm.twin !== undefined) {
            console.log(row(`orbit vs ${arm.twin}`, await diff(`${arm.twin}-orbit.png`, `${arm.tag}-orbit.png`)));
          }
        }
        if (arm.populated === true) {
          console.log('  books in, the same cameras:');
          for (const rung of LADDER) {
            console.log(
              row(
                `${rung.label} vs baseline`,
                await diff(`books-off-${rung.tag}.png`, `books-${arm.tag}-${rung.tag}.png`),
              ),
            );
          }
          if (arm.twin !== undefined) {
            for (const rung of LADDER) {
              console.log(
                row(
                  `${rung.label} vs ${arm.twin}, books in`,
                  await diff(`books-${arm.twin}-${rung.tag}.png`, `books-${arm.tag}-${rung.tag}.png`),
                ),
              );
            }
          }
        }
      }

      console.log('');
      console.log('does the relief survive `backingRoughness` — 0.95 shipped, against two lower:');
      console.log(row('0.95 (shipped), orbited', await diff('off-orbit.png', 'fibre-orbit.png')));
      for (const rough of [0.82, 0.6]) {
        console.log(
          row(
            `${String(rough)}, orbited`,
            await diff(`off-r${String(rough)}-orbit.png`, `fibre-r${String(rough)}-orbit.png`),
          ),
        );
      }

      console.log('');
      console.log('does the fibre add anything to pigment:');
      for (const rung of LADDER) {
        console.log(
          row(`${rung.label}, empty`, await diff(`pigment-${rung.tag}.png`, `candidate-${rung.tag}.png`)),
        );
      }
      console.log(row('orbited ~20°, empty', await diff('pigment-orbit.png', 'candidate-orbit.png')));
      for (const rung of LADDER) {
        console.log(
          row(
            `${rung.label}, books in`,
            await diff(`books-pigment-${rung.tag}.png`, `books-candidate-${rung.tag}.png`),
          ),
        );
      }

      console.log('');
      console.log('does 512 resolve this sheet — 512 against 1024, empty:');
      for (const rung of LADDER) {
        console.log(row(rung.label, await diff(`pigment-${rung.tag}.png`, `pigment1024-${rung.tag}.png`)));
      }

      console.log('');
      console.log('the fibre turned to run with the figure, against it crossing:');
      for (const rung of LADDER) {
        console.log(row(rung.label, await diff(`crossed-${rung.tag}.png`, `candidate-${rung.tag}.png`)));
      }
      console.log(row('orbited ~20°', await diff('crossed-orbit.png', 'candidate-orbit.png')));

      console.log('');
      console.log("#287's variation, back on — the shipping frame against the measured one:");
      console.log(row('zoom 10, empty', await diff('candidate-zoom10.png', 'vary-zoom10.png')));
      console.log(
        row('zoom 10, books in', await diff('books-candidate-zoom10.png', 'books-vary-zoom10.png')),
      );

      console.log(`\nimages ${OUT_DIR}`);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

await main();
