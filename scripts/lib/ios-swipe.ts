/**
 * The decisions of `scripts/ios-swipe-check.ts` that need no device: its
 * arguments, the scripts it runs in the page, and how it reads what came back
 * (#599, S3 and S8). Pure, so a test reaches all of it.
 */

import { isFixtureTitle } from './fixture-books.ts';

/** The deployed site: the default page, and the only one the premise check loads. */
export const LIVE_URL = 'https://stacks.aymandiab.com';

/** How far a page's `scrollTop` must rise under one swipe for the swipe to count as a scroll. */
export const SCROLL_MIN_PX = 100;

/** The port the fixture build is served on, and the one port the tunnel is limited to. */
export const DEFAULT_PORT = 8766;

export interface SwipeOptions {
  readonly device: string;
  readonly os: string;
  readonly browser: string;
  readonly url: string;
  readonly local: boolean;
  readonly premise: boolean;
  readonly checkServed: boolean;
  /** Serve the built fixture site on 127.0.0.1 for a tunnel, and nothing else. */
  readonly serve: boolean;
  readonly port: number;
}

const VALUE_FLAGS = ['--device', '--os', '--browser', '--url', '--port'] as const;
const SWITCHES = ['--local', '--premise', '--check-served', '--serve'] as const;

/** The arguments, or the sentence that says why they are refused. */
export function parseSwipeArgs(argv: readonly string[]): SwipeOptions | string {
  const values = new Map<string, string>();
  const on = new Set<string>();
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === undefined) continue;
    if ((SWITCHES as readonly string[]).includes(arg)) {
      on.add(arg);
    } else if ((VALUE_FLAGS as readonly string[]).includes(arg)) {
      const value = argv[at + 1];
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value`;
      values.set(arg, value);
      at += 1;
    } else {
      return `unknown argument ${arg}`;
    }
  }
  const port = Number(values.get('--port') ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return '--port is not a usable port';
  const local = on.has('--local');
  const premise = on.has('--premise');
  const serve = on.has('--serve');
  if (serve && argv.length !== (values.has('--port') ? 3 : 1)) {
    return '--serve only serves the fixture build: it takes no other argument but --port';
  }
  if (local && premise) {
    return '--premise loads the live site, which needs no tunnel: it cannot be run with --local';
  }
  if (premise && values.has('--url')) {
    return `--premise loads the live site, ${LIVE_URL}, and no other page`;
  }
  const tunnel = `http://bs-local.com:${String(port)}`;
  const url = values.get('--url') ?? (local ? `${tunnel}/` : LIVE_URL);
  if (!/^https?:\/\//.test(url)) return '--url is not an http(s) address';
  // The served-build check reads `--port`, so the page the phone loads must be that port.
  if (local && new URL(url).origin !== tunnel) {
    return `--local loads ${tunnel}, the port --check-served reads, and no other address`;
  }
  return {
    device: values.get('--device') ?? 'iPhone 16 Pro',
    os: values.get('--os') ?? '18',
    browser: values.get('--browser') ?? 'safari',
    url,
    local,
    premise,
    checkServed: on.has('--check-served'),
    serve,
    port,
  };
}

/** The address `--check-served` reads: this machine only, on the one port the tunnel is limited to. */
export function servedLibraryUrl(port: number): string {
  return `http://127.0.0.1:${String(port)}/library.json`;
}

/**
 * Whether the build about to be served through the tunnel is the fixture build
 * (S8): every title in its `library.json` is one the generator could have
 * written (`isFixtureTitle`), and there is at least one. A tunnel serves what is
 * on the port to a device cloud, so a real vault's covers and titles must never
 * be what answers. The line counts and never quotes: a title that is not a
 * fixture's may be a real one.
 */
export function judgeServed(library: unknown): { readonly ok: boolean; readonly line: string } {
  const books = (library as { books?: unknown } | null)?.books;
  if (!Array.isArray(books) || books.length === 0) {
    return { ok: false, line: 'served build refused: its library.json lists no books' };
  }
  let foreign = 0;
  for (const book of books as unknown[]) {
    const title = (book as { title?: unknown } | null)?.title;
    if (typeof title !== 'string' || !isFixtureTitle(title)) foreign += 1;
  }
  if (foreign > 0) {
    return {
      ok: false,
      line: `served build refused: ${String(foreign)} of ${String(books.length)} titles are not the fixture's`,
    };
  }
  return { ok: true, line: `served build is the fixture build: ${String(books.length)} books` };
}

/** What `FIND_AND_OPEN` answers: the book it opened, or why it could not. */
export type Opened =
  | { readonly error: string }
  | { readonly title: string; readonly chars: number; readonly paragraphs: number };

/**
 * Finds the book with the longest Thoughts, picks it up, opens it, and waits
 * for it to rest open with its Thoughts showing. It reads `library.json` and
 * each `notes/<id>.json` the way the page does, and finds the book's index by
 * asking the shelf which book stands where each index projects to, so no order
 * is assumed. Runs as an async script: its last argument is the callback.
 */
export const FIND_AND_OPEN = `
var done = arguments[arguments.length - 1];
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var until = async function (test, ms) {
  var end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await wait(100); }
  return test();
};
(async function () {
  var shelf = window.__shelf;
  if (!(await until(function () { return window.__shelf && window.__shelf.ready; }, 20000))) {
    return { error: 'the shelf never reported ready' };
  }
  shelf = window.__shelf;
  var library = await (await fetch('/library.json', { cache: 'no-store' })).json();
  var best = null;
  for (var book of library.books) {
    if (book.thoughts !== true) continue;
    try {
      var reply = await fetch('/notes/' + book.id + '.json');
      if (!reply.ok) continue;
      var paragraphs = (await reply.json()).paragraphs;
      var chars = paragraphs.join('').length;
      if (best === null || chars > best.chars) {
        best = { id: book.id, title: book.title, chars: chars, paragraphs: paragraphs.length };
      }
    } catch (e) { /* a book with no readable Thoughts is not a candidate */ }
  }
  if (best === null) return { error: 'no book carries Thoughts' };
  var index = -1;
  for (var i = 0; i < shelf.bookCount && index < 0; i += 1) {
    var at = shelf.projectBook(i);
    if (at !== undefined && shelf.bookAt(at.x, at.y) === best.id) index = i;
  }
  if (index < 0) return { error: 'the longest-Thoughts book is not under any projected point' };
  shelf.pickUp(index);
  var closed = await until(function () {
    var h = shelf.held();
    return h !== undefined && h.phase === 'held' && h.opened === false;
  }, 8000);
  if (!closed) return { error: 'the book never reached its closed rest' };
  shelf.open();
  var open = await until(function () {
    var h = shelf.held();
    return h !== undefined && h.opened === true && h.thoughts === true;
  }, 8000);
  if (!open) return { error: 'the book never rested open with its Thoughts showing' };
  var held = shelf.held();
  if (held.title !== best.title) return { error: 'picked up a different book than the one chosen' };
  await wait(600);
  return { title: best.title, chars: best.chars, paragraphs: best.paragraphs };
})().then(done, function (e) { done({ error: String(e && e.message || e) }); });
`;

/**
 * The premise (S3): deep-clones the open book's right page into a flat layer of
 * its own and hides the original. `CSS3DRenderer` re-appends the original to
 * its layer on every frame, so the original is hidden by a rule in a
 * constructed stylesheet that outranks the `visibility` the pose writes each
 * frame, and the clone is a copy. The clone sits on the original's screen
 * rectangle by a 2D `matrix(...)`, scrolls on its own, and takes the touch.
 */
export const MOVE_CLONE_TO_FLAT = `
var original = document.querySelector('.held-page-right');
var layer = document.querySelector('.held-layer');
if (!original || !layer) return { error: 'no open book to clone' };
var host = layer.parentElement;
var rect = original.getBoundingClientRect();
var hostBox = host.getBoundingClientRect();
var sheet = new CSSStyleSheet();
sheet.replaceSync('.held-page-right:not(.probe-clone) { visibility: hidden !important; }');
document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
var flat = document.createElement('div');
flat.className = 'probe-flat';
flat.style.position = 'absolute';
flat.style.inset = '0';
flat.style.pointerEvents = 'none';
flat.style.zIndex = getComputedStyle(layer).zIndex;
var clone = original.cloneNode(true);
clone.classList.add('probe-clone');
clone.style.position = 'absolute';
clone.style.left = '0';
clone.style.top = '0';
clone.style.transformOrigin = '0 0';
clone.style.overflowY = 'auto';
clone.style.visibility = 'visible';
clone.style.opacity = '1';
clone.style.pointerEvents = 'auto';
clone.style.backfaceVisibility = 'visible';
var sx = rect.width / original.offsetWidth;
var sy = rect.height / original.offsetHeight;
clone.style.transform = 'matrix(' + sx + ',0,0,' + sy + ',' + (rect.left - hostBox.left) + ',' + (rect.top - hostBox.top) + ')';
flat.appendChild(clone);
host.appendChild(flat);
return { moved: true };
`;

/** Counts `scroll` events on the page that is under the finger, and says where its box is. */
export const ARM_SCROLL_COUNT = `
var page = document.querySelector('.probe-clone') || document.querySelector('.held-page-right');
if (!page) return { error: 'no page to swipe' };
window.__swipeScrolls = 0;
page.addEventListener('scroll', function () { window.__swipeScrolls += 1; });
var r = page.getBoundingClientRect();
var top = Math.max(r.top, 0);
var bottom = Math.min(r.bottom, window.innerHeight);
return {
  left: r.left, width: r.width, top: top, bottom: bottom,
  scrollTop: page.scrollTop, scrollHeight: page.scrollHeight, clientHeight: page.clientHeight
};
`;

/** What is true once the swipe is over. */
export const READ_AFTER = `
var page = document.querySelector('.probe-clone') || document.querySelector('.held-page-right');
var shelf = window.__shelf;
var held = shelf && shelf.held();
return {
  scrollTop: page ? page.scrollTop : -1,
  events: window.__swipeScrolls,
  parent: page && page.parentElement ? page.parentElement.className : '',
  held: held === undefined ? null : { phase: held.phase, opened: held.opened, yaw: held.turn.yaw, pitch: held.turn.pitch },
  fallback: shelf ? String(shelf.fallback()) : ''
};
`;

/**
 * Puts the book back and reports the shelf's fallback once it is down, so a run
 * judges the context across an open and a close (C10). Runs as an async script.
 */
export const CLOSE_AND_READ_FALLBACK = `
var done = arguments[arguments.length - 1];
var shelf = window.__shelf;
if (!shelf) { done({ fallback: '' }); return; }
shelf.putBack();
var end = Date.now() + 8000;
(function poll() {
  if (shelf.held() === undefined || Date.now() > end) {
    done({ fallback: String(shelf.fallback()), down: shelf.held() === undefined });
  } else { setTimeout(poll, 100); }
})();
`;

/**
 * The shelf's own fallback kinds (`shadow-fallback.ts`), the only words the
 * verdict repeats from a page. `none` is the one that passes.
 */
const FALLBACKS = [
  'none',
  'remembered',
  'probe-override',
  'retired',
  'waiting',
  'restored',
  'fresh-canvas',
  'link-failed',
  'refused',
] as const;

/** The only sentences a page script answers with; any other string is the page's own text. */
const PAGE_ERRORS = [
  'the shelf never reported ready',
  'no book carries Thoughts',
  'the longest-Thoughts book is not under any projected point',
  'the book never reached its closed rest',
  'the book never rested open with its Thoughts showing',
  'picked up a different book than the one chosen',
  'no open book to clone',
  'no page to swipe',
] as const;

/** A page's `error` as one of this tool's own sentences, never the page's text. */
const knownError = (text: string): string =>
  PAGE_ERRORS.find((sentence) => sentence === text) ?? 'the page script failed';

/** The fallback a close script handed back: a kind the shelf has, or a word for any other. */
export function readClosing(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.fallback !== 'string') return undefined;
  if (value.down !== true) return 'book not put back';
  return FALLBACKS.find((kind) => kind === value.fallback) ?? 'unrecognised';
}

export interface Armed {
  readonly left: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** The only parents the verdict names: a page's own class name is the page's text, not ours. */
const PARENTS = ['probe-flat', 'held-flat', 'held-layer'] as const;
export type ParentName = (typeof PARENTS)[number] | 'other';

export interface After {
  readonly scrollTop: number;
  readonly events: number;
  readonly parent: ParentName;
  readonly held: {
    readonly phase: string;
    readonly opened: boolean;
    readonly yaw: number;
    readonly pitch: number;
  } | null;
  readonly fallback: string;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a script handed back, or `undefined` for any shape this tool did not ask for. */
export function readOpened(value: unknown): Opened | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.error === 'string') return { error: knownError(value.error) };
  if (!isNumber(value.chars) || !isNumber(value.paragraphs) || typeof value.title !== 'string') {
    return undefined;
  }
  return { title: value.title, chars: value.chars, paragraphs: value.paragraphs };
}

/** The armed page's box and scroll numbers, or the script's own error. */
export function readArmed(value: unknown): Armed | { readonly error: string } | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.error === 'string') return { error: knownError(value.error) };
  const { left, width, top, bottom, scrollTop, scrollHeight, clientHeight } = value;
  if (
    !isNumber(left) ||
    !isNumber(width) ||
    !isNumber(top) ||
    !isNumber(bottom) ||
    !isNumber(scrollTop) ||
    !isNumber(scrollHeight) ||
    !isNumber(clientHeight)
  ) {
    return undefined;
  }
  return { left, width, top, bottom, scrollTop, scrollHeight, clientHeight };
}

/** What is true after the swipe. Strings are mapped to a fixed set, never echoed. */
export function readAfter(value: unknown): After | undefined {
  if (!isRecord(value) || !isNumber(value.scrollTop) || !isNumber(value.events)) return undefined;
  const raw = value.held;
  let held: After['held'] = null;
  if (raw !== null) {
    if (
      !isRecord(raw) ||
      typeof raw.phase !== 'string' ||
      typeof raw.opened !== 'boolean' ||
      !isNumber(raw.yaw) ||
      !isNumber(raw.pitch)
    ) {
      return undefined;
    }
    held = { phase: raw.phase, opened: raw.opened, yaw: raw.yaw, pitch: raw.pitch };
  }
  const parent = PARENTS.find((name) => name === value.parent) ?? 'other';
  const fallback =
    FALLBACKS.find((kind) => kind === value.fallback) ??
    (value.fallback === '' ? '' : 'unrecognised');
  return { scrollTop: value.scrollTop, events: value.events, parent, held, fallback };
}

/** Where the finger goes: down the middle of the visible page, from low to high, so the content moves up. */
export function swipePath(box: Armed): {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
} {
  const x = box.left + box.width / 2;
  const height = box.bottom - box.top;
  return {
    from: { x, y: box.top + height * 0.8 },
    to: { x, y: box.top + height * 0.2 },
  };
}

export interface Verdict {
  readonly scrolled: boolean;
  readonly line: string;
}

/**
 * One line, and whether the swipe scrolled. It reports the clone's parent for
 * the premise (so a run that scrolled a node still in the 3D layer says so),
 * and for the build it also holds the book to be still held, open and unturned.
 * No account name, no session address.
 */
export function judge(
  before: Armed,
  after: After,
  premise: boolean,
  closing: string = '',
): Verdict {
  const rose = after.scrollTop - before.scrollTop;
  const held = after.held;
  const stayed =
    held !== null &&
    held.phase === 'held' &&
    held.opened &&
    Math.abs(held.yaw) < 0.5 &&
    Math.abs(held.pitch) < 0.5;
  // A build run also holds the shelf to no fallback across the open and the close (C10).
  const kept = after.fallback === 'none' && closing === 'none';
  const scrolled = rose >= SCROLL_MIN_PX && (premise || (after.events > 0 && stayed && kept));
  const parts = [
    scrolled ? 'scrolled: yes' : 'scrolled: no',
    `scrollTop ${String(Math.round(before.scrollTop))} -> ${String(Math.round(after.scrollTop))}`,
    `scroll events ${String(after.events)}`,
    `box ${String(Math.round(before.scrollHeight))}/${String(Math.round(before.clientHeight))}`,
    `parent .${after.parent}`,
  ];
  if (!premise) parts.push(stayed ? 'held, open, unturned' : 'NOT held open and unturned');
  if (after.fallback !== '') parts.push(`fallback ${after.fallback}`);
  if (!premise) parts.push(`after the close, fallback ${closing === '' ? 'unread' : closing}`);
  return { scrolled, line: parts.join('; ') };
}
