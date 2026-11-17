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

import type { Capabilities, Point } from './browserstack-driver.ts';

/** The most a tap may land from where it was asked and still be the browser's own offset, in px. */
const MAX_TAP_SHIFT = 300;

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
 * its title (read off `library.json` by the id under that point) and the page's address. It takes the
 * tap's calibrated shift and skips a book whose shifted tap point would fall outside the viewport. Answers
 * `{ error }` with one of this file's sentences, or `{ x, y, title, href }`.
 */
export const READY_AND_FIND = `${UNTIL}
(async function () {
  var ready = await until(function () { return window.__shelf && window.__shelf.ready === true; }, ${String(WAIT_CEILING_MS)});
  if (!ready) return { error: 'the shelf never reported ready' };
  var shelf = window.__shelf;
  // The tap goes where the book is plus the calibrated shift, and that point has to be in the viewport.
  var shiftX = arguments[0];
  var shiftY = arguments[1];
  var library = await (await fetch('/library.json', { cache: 'no-store' })).json();
  // The loading screen fades out over the canvas after ready, and a tap on it picks nothing up:
  // a book counts as in view once the canvas is the element under its point.
  var scan = function () {
    for (var i = 0; i < shelf.bookCount; i += 1) {
      var at = shelf.projectBook(i);
      if (at === undefined) continue;
      if (at.x < 0 || at.y < 0 || at.x > window.innerWidth || at.y > window.innerHeight) continue;
      var tapX = at.x + shiftX;
      var tapY = at.y + shiftY;
      if (tapX < 0 || tapY < 0 || tapX >= window.innerWidth || tapY >= window.innerHeight) continue;
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
 * Arms a calibration tap: capturing listeners on the window record where the first pointer or touch
 * lands and stop it there, so the probe picks nothing up. Answers the viewport's size.
 */
export const PROBE_ARM = `
window.__probe = undefined;
window.__probeStop = [];
['pointerdown', 'touchstart', 'pointerup', 'touchend', 'click'].forEach(function (type) {
  var handler = function (event) {
    var at = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event;
    if (window.__probe === undefined) window.__probe = { x: at.clientX, y: at.clientY };
    event.stopImmediatePropagation();
  };
  window.addEventListener(type, handler, true);
  window.__probeStop.push(function () { window.removeEventListener(type, handler, true); });
});
return { width: window.innerWidth, height: window.innerHeight };
`;

/** Disarms the probe and answers where it landed, or \`null\` when nothing reached the page. */
export const PROBE_READ = `
window.__probeStop.forEach(function (stop) { stop(); });
var at = window.__probe === undefined ? null : window.__probe;
window.__probe = undefined;
return at;
`;

/** The viewport size `PROBE_ARM` answered, or `undefined` when it is not two positive numbers. */
export function readViewport(value: unknown): Point | undefined {
  if (!isRecord(value)) return undefined;
  const { width, height } = value;
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;
  return width > 0 && height > 0 ? { x: width, y: height } : undefined;
}

/**
 * How far a tap lands from where it was asked: the page asked for `asked` and a probe landed at
 * `landed`. iOS Safari takes tap coordinates from the screen and not the page, so a tap lands the
 * height of the browser's top bar above where it was asked, and the shift is the difference.
 * `{ x: 0, y: 0 }` when the probe landed nowhere, or the shift is more than a browser's bar, which
 * leaves a device that needs no correction exactly as it was.
 */
export function tapShift(asked: Point, landed: unknown): Point {
  const none = { x: 0, y: 0 };
  if (!isRecord(landed)) return none;
  const { x, y } = landed;
  if (typeof x !== 'number' || typeof y !== 'number') return none;
  const shift = { x: Math.round(asked.x - x), y: Math.round(asked.y - y) };
  const sane = (n: number): boolean => Math.abs(n) <= MAX_TAP_SHIFT;
  return sane(shift.x) && sane(shift.y) ? shift : none;
}

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

/**
 * What the shelf says about its context after the hold, and whether the address is still the
 * one the page had before the click (argument 0). Synchronous: nothing to wait for.
 */
export const READ_AFTER_HOLD = `
var h = window.__shelf && window.__shelf.held();
return {
  fallback: window.__shelf ? String(window.__shelf.fallback()) : '',
  stillHeld: h !== undefined,
  sameAddress: location.href === arguments[0],
};
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
  readonly sameAddress: boolean;
}

export function readAfterHold(value: unknown): AfterHold | undefined {
  if (!isRecord(value)) return undefined;
  const { fallback, stillHeld, sameAddress } = value;
  if (
    typeof fallback !== 'string' ||
    typeof stillHeld !== 'boolean' ||
    typeof sameAddress !== 'boolean'
  ) {
    return undefined;
  }
  return {
    fallback: /^[a-z-]{1,20}$/.test(fallback) ? fallback : 'unreadable',
    stillHeld,
    sameAddress,
  };
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
 * the hold, the address changed during it, or the console logged an error. A device with no console log is `console: not
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
    if (!measured.after.sameAddress) problems.push('the address changed during the hold');
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
