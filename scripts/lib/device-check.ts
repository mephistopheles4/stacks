/**
 * The decisions of `scripts/check-devices.ts`, the three-device check (#618): which devices, the
 * scripts it runs in the page, how it reads what came back, and the line it prints for each device.
 * Pure of the network and the file system, so a test can reach all of it.
 *
 * It imports a type and nothing else: the key step runs under Node's own type stripping with no
 * installed package, and `scripts/lib/key-job.test.ts` walks what the entry imports.
 *
 * **A page's own text is never printed.** Every answer is read for the shape asked for, a title is
 * compared inside the page and never echoed, and a verdict line is one of this file's sentences
 * with a number or a fixed word in it.
 */

import type { Capabilities } from './browserstack-driver.ts';

export interface Device {
  /** The file name its screenshot takes, and the name of its session. */
  readonly slug: 'pixel' | 'iphone' | 'desktop';
  readonly label: string;
  /** Phones tap; a desktop clicks. */
  readonly pointer: 'touch' | 'mouse';
  readonly caps: Pick<Capabilities, 'deviceName' | 'os' | 'osVersion' | 'browserName'>;
}

/** A recent Pixel in Chrome, a recent iPhone in Safari, and Chrome on Windows. */
export const DEVICES: readonly Device[] = [
  {
    slug: 'pixel',
    label: 'Pixel, Chrome',
    pointer: 'touch',
    caps: { deviceName: 'Google Pixel 9', osVersion: '15.0', browserName: 'chrome' },
  },
  {
    slug: 'iphone',
    label: 'iPhone, Safari',
    pointer: 'touch',
    caps: { deviceName: 'iPhone 16 Pro', osVersion: '18', browserName: 'safari' },
  },
  {
    slug: 'desktop',
    label: 'Windows, Chrome',
    pointer: 'mouse',
    caps: { os: 'Windows', osVersion: '11', browserName: 'chrome' },
  },
];

/** The ceiling of every wait on a shelf state flag, in ms. */
export const WAIT_CEILING_MS = 60_000;

/** The one thing measured with a clock: how long the book is held before the context is read. */
export const HOLD_MS = 10_000;

/** An async script outlasts WebDriver's 30 s default by this much. */
export const SCRIPT_TIMEOUT_MS = WAIT_CEILING_MS + 30_000;

/** Both async scripts open with this: wait on a state flag, never a sleep. */
const UNTIL = `
var done = arguments[arguments.length - 1];
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var until = async function (test, ms) {
  var end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await wait(100); }
  return test();
};
`;

/**
 * Waits for the shelf to report ready, then finds a book standing in view: its projected point,
 * its title (read off `library.json` by the id under that point) and the page's address. Answers
 * `{ error }` with one of this file's sentences, or `{ x, y, title, href }`.
 */
export const READY_AND_FIND = `${UNTIL}
(async function () {
  var ready = await until(function () { return window.__shelf && window.__shelf.ready === true; }, ${String(WAIT_CEILING_MS)});
  if (!ready) return { error: 'the shelf never reported ready' };
  var shelf = window.__shelf;
  var library = await (await fetch('/library.json', { cache: 'no-store' })).json();
  // The loading screen fades out over the canvas after ready, and a tap on it picks nothing up:
  // a book counts as in view once the canvas is the element under its point.
  var scan = function () {
    for (var i = 0; i < shelf.bookCount; i += 1) {
      var at = shelf.projectBook(i);
      if (at === undefined) continue;
      if (at.x < 0 || at.y < 0 || at.x > window.innerWidth || at.y > window.innerHeight) continue;
      if (document.elementFromPoint(at.x, at.y) !== document.getElementById('shelf-canvas')) continue;
      var id = shelf.bookAt(at.x, at.y);
      if (id === undefined) continue;
      var book = library.books.find(function (b) { return b.id === id; });
      if (book === undefined) continue;
      return { x: at.x, y: at.y, title: book.title, href: location.href };
    }
    return undefined;
  };
  var found;
  var inView = await until(function () { found = scan(); return found !== undefined; }, ${String(WAIT_CEILING_MS)});
  return inView ? found : { error: 'no book stands in view' };
})().then(done, function () { done({ error: 'the page script failed' }); });
`;

/**
 * Waits for the shelf to name the clicked book as held, closed and at rest. Takes the title and the
 * address the page had before the click; answers `{ held, sameAddress }`.
 */
export const WAIT_HELD = `${UNTIL}
var title = arguments[0];
var before = arguments[1];
(async function () {
  var held = await until(function () {
    var h = window.__shelf && window.__shelf.held();
    return h !== undefined && h.title === title && h.phase === 'held' && h.opened === false;
  }, ${String(WAIT_CEILING_MS)});
  return { held: held, sameAddress: location.href === before };
})().then(done, function () { done({ error: 'the page script failed' }); });
`;

/** What the shelf says about its context after the hold. Synchronous: nothing to wait for. */
export const READ_AFTER_HOLD = `
var h = window.__shelf && window.__shelf.held();
return { fallback: window.__shelf ? String(window.__shelf.fallback()) : '', stillHeld: h !== undefined };
`;

/** What `READY_AND_FIND` answered, checked for the shape asked for. */
export type Found =
  | { readonly error: string }
  | { readonly x: number; readonly y: number; readonly title: string; readonly href: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The sentences a page script may answer with. Anything else is this check's own. */
const PAGE_ERRORS: readonly string[] = [
  'the shelf never reported ready',
  'no book stands in view',
  'the page script failed',
];

export const UNEXPECTED = 'the page returned an answer of a shape this check did not ask for';

/** `undefined` for an answer of the wrong shape. A page's own error text is never passed on. */
export function readFound(value: unknown): Found | undefined {
  if (!isRecord(value)) return undefined;
  const { error, x, y, title, href } = value;
  if (typeof error === 'string') {
    return { error: PAGE_ERRORS.includes(error) ? error : 'the page script failed' };
  }
  if (typeof x !== 'number' || typeof y !== 'number') return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (typeof title !== 'string' || typeof href !== 'string') return undefined;
  return { x, y, title, href };
}

export interface HeldAnswer {
  readonly held: boolean;
  readonly sameAddress: boolean;
}

export function readHeld(value: unknown): HeldAnswer | undefined {
  if (!isRecord(value)) return undefined;
  const { held, sameAddress } = value;
  if (typeof held !== 'boolean' || typeof sameAddress !== 'boolean') return undefined;
  return { held, sameAddress };
}

export interface AfterHold {
  /** The fallback kind, when it is a plain lower-case word; `unreadable` otherwise. */
  readonly fallback: string;
  readonly stillHeld: boolean;
}

export function readAfterHold(value: unknown): AfterHold | undefined {
  if (!isRecord(value)) return undefined;
  const { fallback, stillHeld } = value;
  if (typeof fallback !== 'string' || typeof stillHeld !== 'boolean') return undefined;
  return { fallback: /^[a-z-]{1,20}$/.test(fallback) ? fallback : 'unreadable', stillHeld };
}

/** One device's result: the line printed for it, and whether it passed. */
export interface Verdict {
  readonly ok: boolean;
  readonly line: string;
}

/** `undefined` while a step has not run. Counts and fixed words only. */
export interface Measured {
  readonly held?: HeldAnswer;
  readonly after?: AfterHold;
  /** `undefined` when the device returned no console log. */
  readonly consoleErrors?: number | undefined;
  readonly screenshot?: boolean;
}

/**
 * The verdict for one device. It fails when the click did not hold the book, the address changed,
 * the context was lost (the fallback is anything but `none`), the book was not still held after
 * the hold, or the console logged an error. A device with no console log is `console: not
 * reported`, and that never fails it.
 */
export function judgeDevice(device: Device, measured: Measured): Verdict {
  const problems: string[] = [];
  if (measured.held === undefined || !measured.held.held) problems.push('the book was never held');
  else if (!measured.held.sameAddress) problems.push('the address changed');
  if (measured.after === undefined) problems.push('the hold was never read');
  else {
    if (measured.after.fallback !== 'none') {
      problems.push(`the shelf fell back (${measured.after.fallback})`);
    }
    if (!measured.after.stillHeld) problems.push('the book was not still held');
  }
  if (measured.consoleErrors !== undefined && measured.consoleErrors > 0) {
    problems.push(`${String(measured.consoleErrors)} console error(s)`);
  }
  const consoleNote =
    measured.consoleErrors === undefined
      ? 'console: not reported'
      : `console errors: ${String(measured.consoleErrors)}`;
  if (problems.length > 0) {
    return { ok: false, line: `FAIL ${device.label}: ${problems.join('; ')}; ${consoleNote}` };
  }
  return { ok: true, line: `PASS ${device.label}: ready, held, context kept; ${consoleNote}` };
}

/**
 * The numeric run id: the workflow's `GITHUB_RUN_ID`, or a local run's own number. Never branch,
 * commit or any text a contributor writes, because it names a build and a tunnel on the vendor's
 * dashboard.
 */
export function runId(env: Readonly<Record<string, string | undefined>>, now: number): string {
  const given = env['GITHUB_RUN_ID'];
  return given !== undefined && /^\d{1,20}$/.test(given) ? given : String(now);
}

/** The build's name and the tunnel's identifier for one run: constant words and the run id. */
export function runNames(id: string): { readonly build: string; readonly identifier: string } {
  return { build: `device-check ${id}`, identifier: `device-check-${id}` };
}
