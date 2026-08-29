/**
 * PROTOTYPE ONLY — wayfinder ticket #284, "Which channel makes the woodwork
 * read as wood — pigment, relief, or both?", under map #280. Never merged to
 * `main`.
 *
 *     pnpm tsx scripts/prototype-woodwork-arms.ts
 *
 * Renders every arm of #284 into the scene [#282](
 * https://github.com/mephistopheles4/stacks/issues/282) delivered — the **empty
 * bookcase**, at the four rungs of #54's level ladder — and reports each arm
 * against two references rather than one.
 *
 * ## The two differences, and why one reference is not enough
 *
 * A wood texture changes the average colour and adds grain at once, and no eye
 * separates the two. [#68](https://github.com/mephistopheles4/stacks/issues/68)
 * measured exactly that on the spines: its grain moved **0 px above the
 * just-noticeable threshold** while the average moved **17.836% of frame**, so
 * the whole visible effect was a constant and the texture was struck. So every
 * arm carrying a colour map is differenced twice:
 *
 * - **against the baseline** — today's flat `0x6b4f3a` — which is *colour plus
 *   grain*, the number a naive report would quote alone; and
 * - **against `flat`** — the same map's own mean colour, no map bound — which
 *   is **the grain alone**, and is the number that decides.
 *
 * `relief` and `rough` bind no colour map, so their baseline difference is
 * already grain alone and they need no twin.
 *
 * ## What the numbers cannot do
 *
 * **Decide.** #282 settled that the verdict is the owner's on a live build; the
 * over-JND count proves a texture reached the shader and states its cost, and
 * nothing here votes. #282 also settled that no framing is primary, so all four
 * rungs are reported and none is headlined.
 *
 * ⚠️ **The ladder is level and relief's best case is not.** #54 measured the
 * page block at 76 px level against 2,375 px at a ~20° orbit, because that is
 * when top faces show — and a plank's top faces are where a normal map banks
 * its whole effect. So the relief-bearing arms get an **extra orbited rung**,
 * and a weak level number for relief must not be believed without it.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';

const OUT_DIR = join(REPO_ROOT, 'artifacts', 'woodwork-arms');
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

/**
 * How many pixels of the frame are bright enough for `UnrealBloomPass` to pick
 * up at ADR-0034's threshold.
 *
 * The pass thresholds on the luminance of what the composer receives; tone
 * mapping is `none` and exposure is 1, so the framebuffer bytes *are* that
 * input. ⚠️ **This is the threshold's own arithmetic on a frame, not the pass
 * running** — bloom ships disabled (`effects.bloom.enabled: false`), so what
 * this answers is the question #284 asks: *would* a treatment cross 0.85 if
 * somebody switched it on. A count that stays at the baseline's means no.
 */
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
  const a = window.__woodArm || {};
  return {
    overBloom, brightest, total: w * h,
    textures: s.textures, programs: s.programs, calls: s.calls, triangles: s.triangles,
    resolved: [a.species, a.arm, a.resolution, 'tile ' + a.unitsPerTile,
               'normal ' + a.normalScale, 'detail ' + a.detail].join(' / '),
  };
})()`;

interface Measurement {
  overBloom: number;
  brightest: number;
  total: number;
  textures: number;
  programs: number;
  calls: number;
  triangles: number;
  /** What `prototype-wood.ts` actually resolved, read back off the page. */
  resolved: string;
}

interface Shot {
  readonly file: string;
  readonly arm: string;
  /** Extra query, for the per-channel canaries. See `relief-loud`. */
  readonly query?: string;
  readonly wheelSteps: number;
  /**
   * Pixels of vertical drag before shooting — the orbit #54 bakes into its own
   * zoomed shots and the #282 ladder deliberately does not. 50 is #54's number,
   * about 20 degrees.
   */
  readonly dragY?: number;
  readonly populated?: boolean;
}

async function shoot(browser: Browser, origin: string, shot: Shot): Promise<Measurement> {
  const page: Page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  if (shot.populated !== true) await page.evaluateOnNewDocument('window.__empty = true;');
  const query = `?wood=${shot.arm}&${BASE}${shot.query ?? ''}`;
  await page.goto(`${origin}/${query}`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction('window.__shelf?.ready === true', { timeout: 20_000 });
  // ⚠️ Load-bearing, and the reason it is a signal rather than a sleep: an arm
  // whose map had not decoded yet and an arm that bound nothing produce the
  // same screenshot. `prototype-wood.ts` sets this once every map an arm asked
  // for has decoded.
  await page.waitForFunction('window.__woodReady === true', { timeout: 20_000 });
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

  const measured = (await page.evaluate(MEASURE)) as Measurement;
  writeFileSync(join(OUT_DIR, shot.file), await page.screenshot({ type: 'png' }));
  await page.close();
  return measured;
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
    `  ${label.padEnd(38)} mean Δ ${d.mean.toFixed(3).padStart(7)}   ` +
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

/**
 * What every arm holds fixed, so the roster varies one thing at a time.
 *
 * ⚠️ **Rosewood at 1024, laid at its true 7.68 units** — the standing candidate,
 * and it is not the sheet the first run of this matrix used. Everything below
 * is therefore a *fresh* set of numbers rather than an update: the first run was
 * sapele at 512 on the geometry that still had 46 depth-buffer ties in it, and
 * none of its figures survive the change of sheet.
 *
 * ⚠️ **`woodTile` is deliberately absent, and that is a finding rather than a
 * default.** Laying the sheet smaller buys texels for free and brings the
 * repeat back; the repeat is what the owner rejected, twice, at `woodTile=2`.
 * The sheets tile near-seamlessly (measured: wrap difference 5.72 against a
 * local 3.64) so what was visible was repetition and not a seam. At true scale
 * one tile is wider than the whole bookcase and there is nothing to recur.
 */
const BASE = 'woodSpecies=rosewood&woodRes=1024';

interface Arm {
  readonly tag: string;
  readonly label: string;
  /** Extra query on top of `BASE`. */
  readonly query?: string;
  /** The reference whose difference is *grain alone*, when it is not the baseline. */
  readonly twin?: string;
  /** Relief banks on top faces, which a level camera never shows. */
  readonly orbit?: boolean;
}

/**
 * ⚠️ **`rough` is gone and its absence is on the record.** Poly Haven publishes
 * no roughness map for `rosewood_veneer1`, so the arm cannot be built on this
 * sheet at all. What the first run measured — sapele's roughness at 1.029%
 * above the threshold at zoom 10, which beat relief and inverted #284's own
 * prior — stands as sapele's number and is not re-measurable here.
 *
 * **`fibre` is new**, and it is the arm nobody planned: the drawn fibre normal
 * from `prototype-wood-detail.ts`, in place of the sheet's own. It exists
 * because the sheet's normal measured a flat zero and the slot was being spent
 * on nothing.
 */
const ARMS: readonly Arm[] = [
  { tag: 'off', label: 'baseline — today’s flat 0x6b4f3a' },
  { tag: 'flat', label: 'flat, mean-matched (0x6e3412), no map' },
  { tag: 'pigment', label: 'pigment — rosewood figure @1024', twin: 'flat', orbit: true },
  { tag: 'relief', label: 'relief — rosewood’s own normal @1024', orbit: true },
  {
    tag: 'fibre',
    label: 'relief — the drawn fibre, 0 bytes',
    query: '&woodDetail=0.5&woodNormal=0.5',
    orbit: true,
  },
  { tag: 'both', label: 'both — figure + the sheet’s normal', twin: 'flat', orbit: true },
  {
    tag: 'candidate',
    label: 'the standing candidate — figure + drawn fibre',
    query: '&woodDetail=0.5&woodNormal=0.5',
    twin: 'flat',
    orbit: true,
  },
  {
    tag: 'pigment512',
    label: 'pigment @512 — the resolution control',
    query: '&woodRes=512',
    twin: 'flat',
  },
  { tag: 'wire', label: 'wiring check — every channel past plausible' },
];

/** The arm tag is not always the `?wood=` value: two arms differ only by query. */
const woodValue = (tag: string): string =>
  tag === 'fibre' ? 'relief' : tag === 'candidate' ? 'both' : tag === 'pigment512' ? 'pigment' : tag;

function mapBytes(): string {
  return ['rosewood-diff-1024.jpg', 'rosewood-nor-1024.jpg', 'rosewood-diff-512.jpg']
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

      for (const arm of ARMS) {
        for (const rung of LADDER) {
          measured.set(
            `${arm.tag}-${rung.tag}`,
            await shoot(browser, origin, {
              file: `${arm.tag}-${rung.tag}.png`,
              arm: woodValue(arm.tag),
              ...(arm.query === undefined ? {} : { query: arm.query }),
              wheelSteps: rung.wheelSteps,
            }),
          );
        }
        if (arm.orbit === true) {
          measured.set(
            `${arm.tag}-orbit`,
            await shoot(browser, origin, {
              file: `${arm.tag}-orbit.png`,
              arm: woodValue(arm.tag),
              ...(arm.query === undefined ? {} : { query: arm.query }),
              wheelSteps: 10,
              dragY: 50,
            }),
          );
        }
      }
      // The orbited references the relief arms are differenced against. Without
      // these the orbit shots have nothing to compare to and the extra rung
      // says nothing.
      for (const tag of ['off', 'flat']) {
        measured.set(
          `${tag}-orbit`,
          await shoot(browser, origin, {
            file: `${tag}-orbit.png`,
            arm: tag,
            wheelSteps: 10,
            dragY: 50,
          }),
        );
      }

      // The painted-shadow question, and the one thing an empty case cannot
      // show: contact shadows and the recess shade are drawn as planes *over*
      // the wood, and an empty case casts none of the first kind.
      for (const tag of ['off', 'pigment', 'candidate']) {
        const arm = ARMS.find((candidate) => candidate.tag === tag);
        await shoot(browser, origin, {
          file: `books-${tag}-zoom10.png`,
          arm: woodValue(tag),
          ...(arm?.query === undefined ? {} : { query: arm.query }),
          wheelSteps: 10,
          populated: true,
        });
      }

      // A control through the identical pipe: two runs of the same arm must
      // agree, or every zero below is an instrument reading rather than a
      // finding.
      await shoot(browser, origin, { file: 'pigment-shelf-rerun.png', arm: 'pigment', wheelSteps: 0 });
      // Determinism has to be re-proved on the arm that carries a *hash* —
      // runout, the per-member scales and the tint all come off `hashUnit`, and
      // a rebuild that reshuffled the boards would be a defect nobody would see
      // in one frame.
      await shoot(browser, origin, {
        file: 'candidate-shelf-rerun.png',
        arm: 'both',
        query: '&woodDetail=0.5&woodNormal=0.5',
        wheelSteps: 0,
      });

      /**
       * The relief channel's **own** canary, and it is not the `wire` arm.
       *
       * `wire` drives colour, normal and roughness at once, so it proves *the
       * loader works* and says nothing about whether `normalMap` alone can move
       * a pixel on this geometry. If `relief` reads zero and this reads zero
       * too, the finding is about the harness. If `relief` reads zero and this
       * does not, the zero is about the surface — which is the finding #284
       * wants and the one #68 reached by a different route.
       */
      for (const [file, wheelSteps, dragY] of [
        ['relief-loud-zoom10.png', 10, undefined],
        ['relief-loud-orbit.png', 10, 50],
      ] as const) {
        await shoot(browser, origin, {
          file,
          arm: 'relief',
          query: '&woodNormal=8',
          wheelSteps,
          ...(dragY === undefined ? {} : { dragY }),
        });
      }

      /**
       * The sweep the canary forced onto the roster, and it was not in the plan.
       *
       * #284 charted `relief` as one arm at the asset's own strength, and at
       * that strength it is a measured zero at every rung. The canary above
       * then reads **2.684% level and 3.631% orbited** through the same pipe —
       * so the channel is not dead on this surface, the *veneer* is: a
       * flat-sliced sheet has almost no relief to encode, and its normal map
       * says so honestly.
       *
       * That splits the arm the ticket wrote into two questions with different
       * answers, and only one of them was asked. `normalScale` is a plain
       * material number, not a second texture — so an amplified relief costs
       * **zero extra bytes** over the arm already rendered, which is why this
       * is a sweep rather than a proposal.
       */
      for (const scale of [0.25, 1, 2, 4]) {
        for (const [suffix, wheelSteps, dragY] of [
          ['zoom10', 10, undefined],
          ['orbit', 10, 50],
        ] as const) {
          await shoot(browser, origin, {
            file: `cand-n${String(scale)}-${suffix}.png`,
            arm: 'both',
            query: `&woodDetail=0.5&woodNormal=${String(scale)}`,
            wheelSteps,
            ...(dragY === undefined ? {} : { dragY }),
          });
        }
      }

      /* --- the report ---------------------------------------------------- */

      console.log('');
      console.log(`maps on disk   ${mapBytes()}`);
      console.log('');
      console.log('what each arm actually resolved to, read back off the page:');
      for (const arm of ARMS) {
        const m = measured.get(`${arm.tag}-zoom10`);
        if (m === undefined) continue;
        console.log(`  ${arm.tag.padEnd(11)} ${m.resolved}`);
      }

      console.log('');
      console.log('cost, from renderer.info at zoom 10 — measured, not predicted:');
      const base = measured.get('off-zoom10');
      for (const arm of ARMS) {
        const m = measured.get(`${arm.tag}-zoom10`);
        if (m === undefined || base === undefined) continue;
        console.log(
          `  ${arm.tag.padEnd(11)} textures ${String(m.textures).padStart(3)} ` +
            `(${m.textures - base.textures >= 0 ? '+' : ''}${String(m.textures - base.textures)})   ` +
            `programs ${String(m.programs).padStart(3)} ` +
            `(${m.programs - base.programs >= 0 ? '+' : ''}${String(m.programs - base.programs)})   ` +
            `calls ${String(m.calls).padStart(4)} ` +
            `(${m.calls - base.calls >= 0 ? '+' : ''}${String(m.calls - base.calls)})`,
        );
      }

      console.log('');
      console.log("ADR-0034's bloom threshold (0.85 luma) — pixels over it, and the brightest:");
      for (const arm of ARMS) {
        const m = measured.get(`${arm.tag}-zoom10`);
        if (m === undefined) continue;
        console.log(
          `  ${arm.tag.padEnd(11)} over threshold ${String(m.overBloom).padStart(8)} px ` +
            `(${((m.overBloom / m.total) * 100).toFixed(4)}% of frame)   ` +
            `brightest ${m.brightest.toFixed(3)}`,
        );
      }

      console.log('');
      console.log('controls — what the differ says when the answer is already known:');
      console.log(row('pigment rendered twice (expect ~0)', await diff('pigment-shelf.png', 'pigment-shelf-rerun.png')));
      console.log(
        row(
          'the candidate twice — the hash is stable',
          await diff('candidate-shelf.png', 'candidate-shelf-rerun.png'),
        ),
      );
      console.log(
        row('normalScale 8, level (the relief canary)', await diff('off-zoom10.png', 'relief-loud-zoom10.png')),
      );
      console.log(
        row('normalScale 8, orbited (same canary)', await diff('off-orbit.png', 'relief-loud-orbit.png')),
      );

      for (const arm of ARMS) {
        if (arm.tag === 'off') continue;
        console.log('');
        console.log(`${arm.tag} — ${arm.label}`);
        for (const rung of LADDER) {
          console.log(row(`${rung.label} vs baseline`, await diff(`off-${rung.tag}.png`, `${arm.tag}-${rung.tag}.png`)));
        }
        if (arm.twin !== undefined) {
          console.log(`  ${'-'.repeat(38)} grain alone, against its own mean:`);
          for (const rung of LADDER) {
            console.log(
              row(`${rung.label} vs ${arm.twin}`, await diff(`${arm.twin}-${rung.tag}.png`, `${arm.tag}-${rung.tag}.png`)),
            );
          }
        }
        if (arm.orbit === true) {
          console.log(`  ${'-'.repeat(38)} orbited ~20°, where top faces show:`);
          console.log(row('orbit vs baseline', await diff('off-orbit.png', `${arm.tag}-orbit.png`)));
          if (arm.twin !== undefined) {
            console.log(row(`orbit vs ${arm.twin}`, await diff(`${arm.twin}-orbit.png`, `${arm.tag}-orbit.png`)));
          }
        }
      }

      console.log('');
      console.log('does either relief add anything to pigment — the question this ticket asks:');
      for (const rung of LADDER) {
        console.log(
          row(`${rung.label}, the sheet’s normal`, await diff(`pigment-${rung.tag}.png`, `both-${rung.tag}.png`)),
        );
        console.log(
          row(`${rung.label}, the drawn fibre`, await diff(`pigment-${rung.tag}.png`, `candidate-${rung.tag}.png`)),
        );
      }
      console.log(row('orbited ~20°, the sheet’s normal', await diff('pigment-orbit.png', 'both-orbit.png')));
      console.log(row('orbited ~20°, the drawn fibre', await diff('pigment-orbit.png', 'candidate-orbit.png')));

      console.log('');
      console.log('does 512 resolve this sheet — 512 against the shipped 1024:');
      for (const rung of LADDER) {
        console.log(row(`${rung.label}`, await diff(`pigment-${rung.tag}.png`, `pigment512-${rung.tag}.png`)));
      }

      console.log('');
      console.log('the drawn fibre’s strength sweep — what `normalScale` buys, for +0 bytes:');
      for (const suffix of ['zoom10', 'orbit'] as const) {
        const where = suffix === 'zoom10' ? 'level' : 'orbited';
        for (const scale of [0.25, 0.5, 1, 2, 4]) {
          const file =
            scale === 0.5 ? `candidate-${suffix}.png` : `cand-n${String(scale)}-${suffix}.png`;
          console.log(
            row(
              `normalScale ${String(scale)}, ${where}, vs pigment`,
              await diff(`pigment-${suffix}.png`, file),
            ),
          );
        }
      }

      console.log('');
      console.log('the painted shadows, on a populated case at zoom 10:');
      console.log(row('pigment vs baseline, books in', await diff('books-off-zoom10.png', 'books-pigment-zoom10.png')));
      console.log(
        row('the candidate vs baseline, books in', await diff('books-off-zoom10.png', 'books-candidate-zoom10.png')),
      );
      console.log(
        row('the candidate vs pigment, books in', await diff('books-pigment-zoom10.png', 'books-candidate-zoom10.png')),
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
