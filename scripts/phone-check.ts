/**
 * The check only a phone can run: a page on a USB-attached Android phone's own
 * Chrome, and whether its WebGL context held — with G61's counts of what read
 * the shadow map while it did.
 *
 *     pnpm exec tsx scripts/phone-check.ts                  the default page, 120 s
 *     pnpm exec tsx scripts/phone-check.ts --matrix         the default page three times,
 *                                                           ?shadows=0, then ?receivers=all
 *     pnpm exec tsx scripts/phone-check.ts --gpuinfo        chrome://gpu, in a tab of its own
 *
 *     --url <path|URL>   a path on the served build (default /), or any http(s) URL
 *     --wait <s>         seconds to watch a page that has not lost its context (120)
 *     --label <name>     names the result files (run)
 *     --serve <dir>      the build to serve (packages/site/dist)
 *     --port <n>         the port `adb reverse` maps onto the phone (8765)
 *     --adb <path>       adb itself (adb, from the PATH)
 *     --serial <id>      which device, when more than one is attached
 *     --keep             do not force-stop Chrome first
 *     --shot             save a screenshot beside the result
 *     --pickups <n>      once the page is ready, pick up and put back n books through
 *                        the shelf's loop hook, and report each held cover's upload
 *     --examine <s>      once the page is ready, hold a book, open the examining view
 *                        with a real tap, leave it with the phone's own back key, open
 *                        it again and turn the book for s seconds (#418)
 *
 * **Not a `pnpm` script, deliberately**: it needs adb and a phone with USB
 * debugging on, which no CI runner and few contributors have, and a documented
 * `pnpm` command is one G14 would pin while nothing exercised it. `gh-post.ts`
 * set the precedent. See `docs/commands.md`, which says when to run it.
 *
 * ⚠️ **What it does to the phone**: wakes the screen, dismisses a keyguard that
 * has no PIN, force-stops Chrome (the only thing that clears the block Chrome
 * puts on a page that lost its context), clears and reads the logcat, opens a
 * tab of its own, removes the shelf's lost-context record for the served
 * origin, and injects a Shift key once a second so the screen stays on. It
 * changes no setting and no flag.
 *
 * ⚠️ **A logcat can carry personal data.** The whole of it is written to
 * `artifacts/phone/`, which is ignored; a result quotes a filtered slice.
 *
 * Exits non-zero when any run but the `?receivers=all` reproduction did not
 * survive — the reproduction is expected to lose its context on the phone it
 * was measured on, and if it survives, the driver has changed: write that down.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// Pure: no three and no DOM at module scope, the way smoke-render reads it.
import { FALLBACK_KEY } from '../packages/site/src/shelf/shadow-fallback.ts';
import { replies } from './lib/cdp-replies.ts';
import {
  formatRows,
  interestingLogcat,
  parsePhoneArgs,
  phoneVerdict,
  pickDevice,
  resolveRunUrl,
  type PhoneObservation,
  type PhoneOptions,
  type PhoneRow,
  type PhoneRun,
} from './lib/phone-verdict.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { samplingHookSource } from './lib/sampling-hook.ts';
import { serveDist } from './lib/serve-dist.ts';
import { describeSampling, judgeSampling, type SamplingSnapshot } from './lib/shadow-sampling.ts';

const CHROME = 'com.android.chrome';
const DEVTOOLS = 'http://localhost:9222';
const BLANK = '/__blank';
const BLANK_PAGE = '<!doctype html><title>phone-check</title>';
const OUT = join(REPO_ROOT, 'artifacts', 'phone');

type Adb = (...args: string[]) => string;

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => {
    setTimeout(done, ms);
  });

/* -------------------------------------------------------------------------- */
/*  adb                                                                        */
/* -------------------------------------------------------------------------- */

function runAdb(path: string, serial: string | undefined, args: readonly string[]): string {
  const result = spawnSync(path, serial === undefined ? [...args] : ['-s', serial, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  });
  if (result.error !== undefined) {
    throw new Error(
      `could not run adb as "${path}" (${result.error.message}) — put adb on the PATH, or pass --adb <path>`,
    );
  }
  return `${result.stdout}${result.stderr}`;
}

/** Wakes the screen and dismisses a keyguard without a PIN. False if it stays locked. */
async function wake(adb: Adb): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'wm', 'dismiss-keyguard');
    const state = adb(
      'shell',
      'dumpsys power | grep mWakefulness=; dumpsys window | grep -E "isKeyguardShowing|mShowingDream"',
    );
    if (
      /mWakefulness=Awake/.test(state) &&
      /isKeyguardShowing=false/.test(state) &&
      /mShowingDream=false/.test(state)
    ) {
      return true;
    }
    await sleep(700);
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Chrome's DevTools protocol, the little of it this needs                    */
/* -------------------------------------------------------------------------- */

interface Target {
  readonly id: string;
  readonly type: string;
  readonly url: string;
  readonly webSocketDebuggerUrl?: string;
}

interface Message {
  readonly id?: number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly message?: string };
}

interface Cdp {
  send(method: string, params?: Record<string, unknown>): Promise<Message>;
  /** The expression's value, or `undefined` when it threw or the call failed. */
  evaluate(expression: string): Promise<unknown>;
  readonly events: Message[];
  close(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

async function targets(): Promise<Target[]> {
  try {
    const listed: unknown = await (await fetch(`${DEVTOOLS}/json/list`)).json();
    if (!Array.isArray(listed)) return [];
    return listed.filter(
      (entry): entry is Target =>
        isRecord(entry) && typeof entry['id'] === 'string' && typeof entry['url'] === 'string',
    );
  } catch {
    return []; // Chrome is not running yet, or not forwarded.
  }
}

/** The page that appeared since `before` and matches, polled for fifteen seconds. */
async function newTarget(
  before: ReadonlySet<string>,
  matches: (url: string) => boolean,
): Promise<Target> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = (await targets()).find(
      (target) => target.type === 'page' && !before.has(target.id) && matches(target.url),
    );
    if (found?.webSocketDebuggerUrl !== undefined) return found;
    await sleep(500);
  }
  throw new Error('Chrome on the phone never opened the tab this asked for');
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url);
  // Matched by comparing ids, never by looking one up — see `cdp-replies.ts`.
  const pending = replies<Message>();
  const events: Message[] = [];
  let next = 0;

  socket.addEventListener('message', (event) => {
    const parsed: unknown = JSON.parse(String(event.data));
    if (!isRecord(parsed)) return;
    const message = parsed as Message;
    if (typeof message.id === 'number') {
      pending.settle(message);
    } else if (typeof message.method === 'string') {
      events.push(message);
    }
  });

  await new Promise<void>((opened, failed) => {
    const timer = setTimeout(() => failed(new Error('the DevTools socket did not open')), 10_000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      opened();
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      failed(new Error('the DevTools socket failed to open'));
    });
  });

  const send = (method: string, params: Record<string, unknown> = {}): Promise<Message> =>
    new Promise((answered) => {
      next += 1;
      const id = next;
      pending.track(id, answered);
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.abandon(id)) answered({ id, error: { message: `timed out: ${method}` } });
      }, 10_000);
    });

  return {
    send,
    evaluate: async (expression) => {
      const reply = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: 8000,
      });
      const inner = reply.result?.['result'];
      return isRecord(inner) ? inner['value'] : undefined;
    },
    events,
    close: () => {
      socket.close();
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  one run                                                                    */
/* -------------------------------------------------------------------------- */

/** Polled once a second; small, so the poll itself costs the page nothing. */
const POLL = `JSON.stringify({
  visible: document.visibilityState === 'visible',
  status: window.__samplingHook?.status() ?? null,
  ready: window.__shelf?.ready === true,
  fallback: window.__shelf?.fallback?.() ?? null,
})`;

/** Everything G61 reads, in one evaluate so the frame and three's counter agree. */
const READ = `JSON.stringify({
  snapshot: window.__samplingHook?.read() ?? null,
  threeCalls: (() => { try { return window.__shelf?.stats().calls ?? null; } catch { return null; } })(),
  bookCount: window.__shelf?.bookCount ?? 0,
  profile: window.__shelf?.profile ?? null,
  pickups: window.__pickups ?? null,
  // Sizes and times only: the figures go on a public ticket, and a local build
  // serves private books, so no title leaves the page (#413, data-lens F2).
  swaps: (() => { try { return window.__shelf?.swaps?.()?.map(({ title, ...figures }) => figures) ?? null; } catch { return null; } })(),
})`;

/**
 * Starts the shelf's pickup loop once the page is ready, without waiting for it:
 * the run watches the context while books are picked up. A function on
 * `window.__shelf`, not an address switch, so no link can start it (spec §4).
 */
function startPickups(rounds: number): string {
  // `void`, so the evaluate that sends this resolves at once rather than
  // awaiting the whole loop: the evaluate awaits a returned promise.
  return `void (async () => {
    while (window.__shelf?.ready !== true) await new Promise((r) => setTimeout(r, 200));
    window.__pickups = { asked: ${String(rounds)}, held: await window.__shelf.pickupLoop(${String(rounds)}) };
  })()`;
}

/** What the examining drive saw on the phone, kept apart from the context's own verdict. */
interface ExamineReading {
  readonly held: boolean;
  /** A real tap on the page's control opened the view. */
  readonly opened: boolean;
  /** The phone's back key left the view with the book still held. */
  readonly backLeftBookHeld: boolean;
  /** …or emptied the hand instead (a back that went to history, not to the dialog). */
  readonly backEmptiedHand: boolean;
  /** Seconds spent turning, and how many drags were sent. */
  readonly turnedForS: number;
  readonly drags: number;
  /** The turn at the end, in degrees: it moved if the drags reached the book. */
  readonly yaw: number | undefined;
  readonly notes: readonly string[];
}

const HELD_NOW = `(() => {
  const h = window.__shelf?.held?.();
  return JSON.stringify(h === undefined ? null : { examining: h.examining, phase: h.phase, yaw: h.turn.yaw });
})()`;

/**
 * The examining view on the phone itself (#418, spec S12): a held book, a tap
 * that is a real user activation, the phone's back key, and a minute of
 * dragging — with the context watched beside it by `watch`. Everything read
 * comes off `window.__shelf`; nothing is written to the page.
 */
async function examineOnPhone(adb: Adb, cdp: Cdp, seconds: number): Promise<ExamineReading> {
  const notes: string[] = [];
  const read = async (): Promise<{ examining: boolean; phase: string; yaw: number } | null> =>
    parse<{ examining: boolean; phase: string; yaw: number } | null>(
      await cdp.evaluate(HELD_NOW),
    ) ?? null;
  const tap = async (x: number, y: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const control = async (): Promise<{ x: number; y: number } | undefined> => {
    const value = await cdp.evaluate(`(() => {
      const el = document.querySelector('.held-page-right .held-examine');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`);
    return parse<{ x: number; y: number }>(value);
  };

  const waitingFrom = Date.now();
  while ((await cdp.evaluate('window.__shelf?.ready === true')) !== true) {
    // A shelf that never boots (a refused or lost context) must not hold the run
    // open: `runOne` awaits this after the watch, and would never write its result.
    if (Date.now() - waitingFrom > 60_000) {
      return {
        held: false,
        opened: false,
        backLeftBookHeld: false,
        backEmptiedHand: false,
        turnedForS: 0,
        drags: 0,
        yaw: undefined,
        notes: ['the shelf never said it was ready'],
      };
    }
    await sleep(500);
  }
  await cdp.evaluate('window.__shelf.pickUp(3)');
  const heldAt = Date.now();
  while ((await read())?.phase !== 'held') {
    if (Date.now() - heldAt > 15_000) {
      return {
        held: false,
        opened: false,
        backLeftBookHeld: false,
        backEmptiedHand: false,
        turnedForS: 0,
        drags: 0,
        yaw: undefined,
        notes: ['the book never reached the held state'],
      };
    }
    await sleep(250);
  }
  await sleep(1500);

  const at = await control();
  if (at === undefined) notes.push('the page had no examine control');
  else await tap(at.x, at.y);
  await sleep(1500);
  const opened = (await read())?.examining === true;

  // The phone's own back key: Chrome routes it to a modal dialog's close watcher.
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await sleep(1500);
  const afterBack = await read();
  const backLeftBookHeld = afterBack !== null && !afterBack.examining;
  const backEmptiedHand = afterBack === null;
  if (backEmptiedHand) notes.push('back emptied the hand: it was taken as history, not as a close');

  let drags = 0;
  let yaw: number | undefined;
  const startedTurning = Date.now();
  if (!backEmptiedHand) {
    await sleep(800);
    const again = await control();
    if (again !== undefined) await tap(again.x, again.y);
    await sleep(1200);
    const size = parse<{ w: number; h: number }>(
      await cdp.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight })'),
    );
    const w = size?.w ?? 400;
    const h = size?.h ?? 800;
    let direction = 1;
    while (Date.now() - startedTurning < seconds * 1000) {
      const x0 = w / 2 - 80 * direction;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: x0, y: h / 2 }],
      });
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x0 + (160 * direction * step) / 8, y: h / 2 + 10 * step }],
        });
        await sleep(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      drags += 1;
      direction = -direction;
      await sleep(120);
    }
    yaw = (await read())?.yaw;
    // One level out, then put the book back, so the page is as it was.
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(1200);
    await cdp.evaluate('window.__shelf.putBack()');
  }
  return {
    held: true,
    opened,
    backLeftBookHeld,
    backEmptiedHand,
    turnedForS: Math.round((Date.now() - startedTurning) / 1000),
    drags,
    yaw,
    notes,
  };
}

/** The GPU as the page is told it, read on the blank page before the run. */
const RENDERER = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
})()`;

interface Polled {
  readonly visible: boolean;
  readonly status: {
    contextLost: boolean;
    lostAt: number | null;
    linkFailures: number;
    contexts: number;
  } | null;
  readonly ready: boolean;
  readonly fallback: string | null;
}

interface Read {
  readonly snapshot: SamplingSnapshot | null;
  readonly threeCalls: number | null;
  readonly bookCount: number;
  readonly profile: string | null;
  readonly pickups: { readonly asked: number; readonly held: number } | null;
  readonly swaps: readonly unknown[] | null;
}

function parse<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

interface RunResult {
  readonly row: PhoneRow;
  /** Chrome's own version string, which ties the result to a build. */
  readonly chrome: string;
}

async function runOne(
  adb: Adb,
  options: PhoneOptions,
  run: PhoneRun,
  serial: string,
): Promise<RunResult> {
  const url = resolveRunUrl(run.url, options.port);
  if (!(await wake(adb))) {
    throw new Error('the phone is locked or dreaming and would not wake — unlock it and run again');
  }
  if (!options.keep) {
    adb('shell', 'am', 'force-stop', CHROME);
    await sleep(800);
  }
  adb('logcat', '-c');

  adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
  const before = new Set((await targets()).map((target) => target.id));
  adb(
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `http://localhost:${String(options.port)}${BLANK}`,
    CHROME,
  );
  adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
  const target = await newTarget(before, (candidate) => candidate.includes(BLANK));
  const cdp = await connect(target.webSocketDebuggerUrl ?? '');

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    // Same origin as the served page, so this reaches its record. A record left
    // by an earlier run would start this one painted — see `phoneVerdict`.
    await cdp.evaluate(`localStorage.removeItem(${JSON.stringify(FALLBACK_KEY)})`);
    const gpu = await cdp.evaluate(RENDERER);
    const chrome = await chromeVersion();

    const installed = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: samplingHookSource(),
    });
    if (installed.error !== undefined) {
      throw new Error(`the counting hook would not install: ${installed.error.message ?? '?'}`);
    }
    await fetch(`${DEVTOOLS}/json/activate/${target.id}`).catch(() => undefined);
    await cdp.send('Page.bringToFront');
    await wake(adb);

    const started = Date.now();
    await cdp.send('Page.navigate', { url });
    if (options.pickups !== undefined) await cdp.evaluate(startPickups(options.pickups));
    const driving =
      options.examine === undefined
        ? undefined
        : examineOnPhone(adb, cdp, options.examine).catch((error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
          }));
    const waitS =
      options.examine === undefined ? run.waitS : Math.max(run.waitS, options.examine + 45);
    const observation = await watch(adb, cdp, waitS, started);
    const examined = await driving;
    const read = parse<Read>(await cdp.evaluate(READ));
    const elapsedS = (Date.now() - started) / 1000;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = join(OUT, `${stamp}-${run.label}`);
    mkdirSync(OUT, { recursive: true });
    if (options.shot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const data = shot.result?.['data'];
      if (typeof data === 'string') writeFileSync(`${base}.png`, Buffer.from(data, 'base64'));
    }
    await cdp.send('Page.navigate', { url: `http://localhost:${String(options.port)}${BLANK}` });

    const logcat = adb('logcat', '-d', '-v', 'time');
    writeFileSync(`${base}.logcat.txt`, logcat);

    const sampled = {
      snapshot: read?.snapshot ?? undefined,
      bookCount: read?.bookCount ?? 0,
      threeCalls: read?.threeCalls ?? undefined,
    };
    const failures = judgeSampling(sampled);
    const verdict = phoneVerdict(observation);
    const row: PhoneRow = {
      label: run.label,
      verdict,
      elapsedS,
      sampling: describeSampling(sampled),
      judged: failures.length === 0 ? 'ok' : `red: ${failures.map((f) => f.slice(0, 3)).join(' ')}`,
    };

    writeFileSync(
      `${base}.json`,
      `${JSON.stringify(
        {
          label: run.label,
          url,
          waitS: run.waitS,
          device: serial,
          chrome,
          gpu: typeof gpu === 'string' ? gpu : null,
          verdict,
          observation,
          elapsedS,
          profile: read?.profile ?? null,
          pickups: read?.pickups ?? null,
          examine: examined ?? null,
          swaps: read?.swaps ?? null,
          sampling: { line: row.sampling, failures },
          console: consoleLines(cdp.events).slice(-60),
          logcat: interestingLogcat(logcat),
          logcatFile: `${base}.logcat.txt`,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `${run.label}: ${verdict.kind} — ${verdict.reason}\n  ${row.sampling}\n  ${base}.json`,
    );
    if (examined !== undefined) console.log(`  examining: ${JSON.stringify(examined)}`);
    const pickups = read?.pickups;
    if (pickups !== null && pickups !== undefined) {
      console.log(
        `  pickups: ${String(pickups.held)} of ${String(pickups.asked)} reached the held state; ` +
          `held cover uploads: ${JSON.stringify(read?.swaps ?? [])}`,
      );
    }
    return { row, chrome };
  } finally {
    cdp.close();
    await fetch(`${DEVTOOLS}/json/close/${target.id}`).catch(() => undefined);
  }
}

/** Polls once a second until the wait runs out or the context is lost, then three seconds more. */
async function watch(
  adb: Adb,
  cdp: Cdp,
  waitS: number,
  started: number,
): Promise<PhoneObservation> {
  let polls = 0;
  let visiblePolls = 0;
  let ready = false;
  let fallback: string | undefined;
  let linkFailures = 0;
  let contexts = 0;
  let lostAtS: number | undefined;

  while ((Date.now() - started) / 1000 < waitS) {
    await sleep(1000);
    // User activity, so the screen does not time out mid-run.
    adb('shell', 'input', 'keyevent', 'KEYCODE_SHIFT_LEFT');
    const polled = parse<Polled>(await cdp.evaluate(POLL));
    polls += 1;
    if (polled === undefined) continue;
    if (polled.visible) visiblePolls += 1;
    ready ||= polled.ready;
    fallback = polled.fallback ?? undefined;
    linkFailures = polled.status?.linkFailures ?? linkFailures;
    contexts = polled.status?.contexts ?? contexts;
    if (polled.status?.contextLost === true) {
      lostAtS = (polled.status.lostAt ?? Date.now() - started) / 1000;
      await sleep(3000);
      break;
    }
  }

  return { polls, visiblePolls, lostAtS, linkFailures, contexts, ready, fallback };
}

/** A console argument as text: a primitive as itself, anything else as JSON. */
function printable(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function consoleLines(events: readonly Message[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    const params = event.params ?? {};
    if (event.method === 'Runtime.consoleAPICalled') {
      const args = Array.isArray(params['args']) ? (params['args'] as unknown[]) : [];
      const text = args
        .map((arg) => (isRecord(arg) ? printable(arg['value'] ?? arg['description']) : ''))
        .join(' ');
      lines.push(`${String(params['type'])}: ${text}`.slice(0, 2000));
    } else if (event.method === 'Runtime.exceptionThrown') {
      lines.push(`exception: ${JSON.stringify(params['exceptionDetails']).slice(0, 2000)}`);
    } else if (event.method === 'Log.entryAdded' && isRecord(params['entry'])) {
      const entry = params['entry'];
      lines.push(`log ${String(entry['level'])}: ${String(entry['text'])}`.slice(0, 2000));
    }
  }
  return lines;
}

/* -------------------------------------------------------------------------- */
/*  chrome://gpu, in a tab of its own                                          */
/* -------------------------------------------------------------------------- */

/**
 * Opens a blank tab by intent, reads `chrome://gpu` in that tab and closes it.
 * Never attaches to a tab it did not open: the first tab listed can be one of
 * the owner's. Android's Chrome answers `PUT /json/new` with a 500, so the
 * intent is the way in.
 */
async function gpuinfo(adb: Adb): Promise<void> {
  if (!(await wake(adb))) throw new Error('the phone is locked and would not wake — unlock it');
  adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
  const before = new Set((await targets()).map((target) => target.id));
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', CHROME);
  adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
  const target = await newTarget(before, (url) => url === 'about:blank');
  const cdp = await connect(target.webSocketDebuggerUrl ?? '');
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: 'chrome://gpu' });
    await sleep(4000);
    const text = await cdp.evaluate(
      `(() => { const view = document.querySelector('info-view'); const root = view && view.shadowRoot; return (root ? root.textContent : document.body.innerText); })()`,
    );
    const page = typeof text === 'string' ? text.replace(/\s+\n/g, '\n') : '';
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-')}-gpuinfo.txt`);
    writeFileSync(file, page);
    // The page's text runs its fields together with no line breaks, so each
    // value is read up to the label that follows it.
    const fields: readonly (readonly [string, RegExp])[] = [
      ['backend', /GL implementation parts\s*:\s*(\([^)]*\))/],
      ['renderer', /GL_RENDERER\s*:\s*(.*?)\s*GL_VERSION/],
      ['user flags', /Command Line\s*:\s*(--flag-switches-begin.*?--flag-switches-end)/],
      ['WebGL', /WebGL:\s*([^*\n]*)/],
    ];
    for (const [name, pattern] of fields) {
      console.log(`${name.padEnd(12)}${pattern.exec(page)?.[1]?.trim() ?? '(not found)'}`);
    }
    console.log(file);
  } finally {
    cdp.close();
    await fetch(`${DEVTOOLS}/json/close/${target.id}`).catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const options = parsePhoneArgs(process.argv.slice(2));
  const serial = pickDevice(runAdb(options.adb, undefined, ['devices']), options.serial);
  const adb: Adb = (...args) => runAdb(options.adb, serial, args);

  if (options.gpuinfo) {
    await gpuinfo(adb);
    return;
  }

  const root = resolve(REPO_ROOT, options.serve ?? join('packages', 'site', 'dist'));
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(
      `nothing built at ${root} — run pnpm build, or pnpm smoke:render for the 50-book fixture`,
    );
  }
  const served = await serveDist({
    root,
    port: options.port,
    pages: { [BLANK]: BLANK_PAGE },
    headers: { 'Cache-Control': 'no-store' },
  });
  adb('reverse', `tcp:${String(options.port)}`, `tcp:${String(options.port)}`);

  const rows: PhoneRow[] = [];
  let chrome = '?';
  try {
    for (const run of options.runs) {
      const result = await runOne(adb, options, run, serial);
      rows.push(result.row);
      chrome = result.chrome;
    }
  } finally {
    served.server.closeAllConnections();
    served.server.close();
    adb('reverse', '--remove', `tcp:${String(options.port)}`);
  }

  for (const line of formatRows(`${serial} · ${chrome}`, rows)) console.log(line);
  const failed = rows.filter(
    (row, index) =>
      row.verdict.kind !== 'survived' &&
      !(options.runs[index]?.url ?? '').includes('receivers=all'),
  );
  if (failed.length > 0) process.exitCode = 1;
}

/** Chrome's own version, as its DevTools endpoint reports it, once it is running. */
async function chromeVersion(): Promise<string> {
  try {
    const version: unknown = await (await fetch(`${DEVTOOLS}/json/version`)).json();
    return isRecord(version) && typeof version['Browser'] === 'string' ? version['Browser'] : '?';
  } catch {
    return '?';
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
