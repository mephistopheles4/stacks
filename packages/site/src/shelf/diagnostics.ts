import type { ShelfHandle } from './scene.ts';

/**
 * A black box, for a crash that leaves no error behind.
 *
 * When a phone kills a tab for running out of graphics memory, the renderer
 * process is destroyed outright. There is no exception, nothing reaches
 * `onerror`, and a remote debugging session disconnects at exactly the moment
 * the data would be worth having. A console — on-device or over USB — can show
 * you a clean log followed by nothing at all.
 *
 * So this does not log. It writes a snapshot to `localStorage` once a second,
 * which *survives* the tab dying, and shows it back on the next load. The one
 * signal that matters is whether the previous session ended cleanly: `pagehide`
 * fires on a normal navigation and does not fire when the process is killed, so
 * a record without `clean: true` is a record of a crash — and its numbers are
 * the last thing the page knew.
 *
 * Only ever active behind `?debug`. Nothing is written to a visitor's device
 * unless they ask for it by hand.
 */

declare global {
  interface Navigator {
    /** Chrome only; absent elsewhere. Approximate device RAM in GiB. */
    readonly deviceMemory?: number;
  }
  interface Performance {
    /** Chrome only — and the Pixel is Chrome, which is the point. */
    readonly memory?: {
      readonly usedJSHeapSize: number;
      readonly jsHeapSizeLimit: number;
    };
  }
}

/**
 * Versioned, so an old record from a different shape is ignored rather than
 * mis-read.
 *
 * **v2** since the debug panel: a snapshot now carries the settings changes made
 * during the session, and `profile` is read live rather than captured at mount.
 * A v1 record has neither, and rendering one as if it did would show an empty
 * change list for a session that had in fact been dialled — which reads as "the
 * shelf died on the defaults" and is the single most misleading thing this file
 * could say.
 */
const STORAGE_KEY = 'stacks.blackbox.v2';

const SAMPLE_MS = 1000;

/** Errors kept per session. Enough to see a pattern, bounded so a loop cannot fill the quota. */
const MAX_ERRORS = 8;

interface Snapshot {
  /** Absent on a record written by a session that was killed — the whole point. */
  clean?: true;
  seconds: number;
  books: number;
  /** Which renderer settings this run used — the bisect is meaningless without it. */
  profile: string;
  textures: number;
  geometries: number;
  programs: number;
  calls: number;
  triangles: number;
  buffer: string;
  pixelRatio: number;
  heapMb?: number;
  heapLimitMb?: number;
  deviceMemoryGb?: number;
  gpu?: string;
  screen: string;
  errors: string[];
  /**
   * What the driver said about a program that would not link.
   *
   * Kept apart from `errors`, which are thrown exceptions. A link failure throws
   * nothing and reaches no handler: three writes it to the console and carries
   * on, so before this it was visible only to somebody with a cable attached at
   * the right moment.
   */
  shaders?: string[];
  /**
   * Every setting the panel changed this session, oldest first.
   *
   * A crash after eight toggles is far more legible as a sequence than as a
   * final state — "it died when I turned shadows on" is the finding, and a
   * snapshot of where the dials ended up cannot say it.
   */
  changes?: string[];
  /**
   * The query string the session was loaded with.
   *
   * Recorded because the panel writes what you dial back into the URL, so a
   * reload of a dead session reproduces the settings that killed it. Knowing
   * *which* URL died is the difference between a record and a trap.
   */
  query?: string;
}

export interface DiagnosticsOptions {
  /** How many books were actually mounted — which `?books=N` may have cut down. */
  readonly books: number;
  /**
   * The shelf, asked for on every sample rather than handed over once.
   *
   * A function, not a value, because the debug panel can rebuild the shelf: the
   * old handle is disposed and a new one takes its place. Holding the first one
   * would mean this file reads a dead renderer for the rest of the session —
   * `profile` naming the settings of a shelf that no longer exists, and a change
   * log frozen at the moment of the rebuild. That is precisely the lie the
   * getter on `profile` was introduced to prevent, one level up.
   *
   * Returns `undefined` when the shelf failed to mount at all; the record is
   * still worth writing, and a browser that refused a context is exactly the
   * state worth having a record of.
   */
  readonly handle?: () => ShelfHandle | undefined;
}

/**
 * Starts recording, and shows the previous session's last known state.
 *
 * Returns a teardown for symmetry with the rest of the shelf; the page normally
 * lives until it is navigated away from, so nothing calls it today.
 */
export function mountDiagnostics(
  host: HTMLElement,
  options: DiagnosticsOptions,
): () => void {
  // Read before the first write, or this session overwrites the record it is
  // being mounted to show.
  const previous = readPrevious();

  const started = Date.now();
  const errors: string[] = [];

  const panel = document.createElement('pre');
  panel.className = 'shelf-diagnostics';
  applyPanelStyle(panel);

  const copy = document.createElement('button');
  copy.textContent = 'copy';
  applyButtonStyle(copy);

  const body = document.createElement('span');
  panel.append(copy, body);
  host.append(panel);

  const sample = (): Snapshot => {
    const shelf = options.handle?.();
    const stats = shelf?.stats();
    const heap = performance.memory;

    return {
      seconds: Math.round((Date.now() - started) / 1000),
      books: options.books,
      profile: shelf?.profile ?? 'no shelf',
      textures: stats?.textures ?? 0,
      geometries: stats?.geometries ?? 0,
      programs: stats?.programs ?? 0,
      calls: stats?.calls ?? 0,
      triangles: stats?.triangles ?? 0,
      buffer: stats === undefined ? 'none' : `${String(stats.bufferWidth)}x${String(stats.bufferHeight)}`,
      pixelRatio: stats?.pixelRatio ?? window.devicePixelRatio,
      ...(heap === undefined
        ? {}
        : {
            heapMb: Math.round(heap.usedJSHeapSize / 1024 / 1024),
            heapLimitMb: Math.round(heap.jsHeapSizeLimit / 1024 / 1024),
          }),
      ...(navigator.deviceMemory === undefined ? {} : { deviceMemoryGb: navigator.deviceMemory }),
      ...(shelf?.gpu === undefined ? {} : { gpu: shelf.gpu }),
      screen: `${String(window.innerWidth)}x${String(window.innerHeight)} @${String(window.devicePixelRatio)}`,
      errors: [...errors],
      ...(shelf === undefined || shelf.shaderErrors.length === 0
        ? {}
        : { shaders: [...shelf.shaderErrors] }),
      ...(shelf === undefined || shelf.changeLog.length === 0
        ? {}
        : { changes: [...shelf.changeLog] }),
      ...(window.location.search === '' ? {} : { query: window.location.search }),
    };
  };

  const tick = (): void => {
    const current = sample();
    write(current);
    body.textContent = render(current, previous);
  };

  const recordError = (message: string): void => {
    if (errors.length >= MAX_ERRORS) return;
    errors.push(message);
  };

  const onError = (event: ErrorEvent): void => {
    recordError(`${event.message} @ ${event.filename}:${String(event.lineno)}`);
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    recordError(`unhandled rejection: ${String(event.reason)}`);
  };

  // Fires on an ordinary navigation and does NOT fire when the process is
  // killed. That asymmetry is the whole diagnosis: a stored record with no
  // `clean` flag is a record of a tab that died.
  const onPageHide = (): void => {
    write({ ...sample(), clean: true });
  };

  const onCopy = (): void => {
    void navigator.clipboard.writeText(JSON.stringify({ previous, current: sample() }, null, 2));
    copy.textContent = 'copied';
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', onPageHide);
  copy.addEventListener('click', onCopy);

  tick();
  const timer = window.setInterval(tick, SAMPLE_MS);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', onPageHide);
    copy.removeEventListener('click', onCopy);
    panel.remove();
  };
}

/* -------------------------------------------------------------------------- */

function render(current: Snapshot, previous: Snapshot | undefined): string {
  const lines = [
    `books    ${String(current.books)}`,
    `profile  ${current.profile}`,
    `textures ${String(current.textures)}  geom ${String(current.geometries)}  prog ${String(current.programs)}`,
    `draws    ${String(current.calls)}  tris ${String(current.triangles)}`,
    `buffer   ${current.buffer}  dpr ${current.pixelRatio.toFixed(2)}`,
    `screen   ${current.screen}`,
    current.heapMb === undefined
      ? 'heap     n/a'
      : `heap     ${String(current.heapMb)} / ${String(current.heapLimitMb ?? 0)} MB`,
    current.deviceMemoryGb === undefined ? 'ram      n/a' : `ram      ${String(current.deviceMemoryGb)} GB`,
    `gpu      ${current.gpu ?? 'n/a'}`,
    `uptime   ${String(current.seconds)}s`,
  ];

  if (current.shaders !== undefined) {
    lines.push('', 'SHADER WOULD NOT LINK — drawing stopped', ...current.shaders.map((line) => `  ${line}`));
  }

  if (current.changes !== undefined) {
    lines.push('', 'changed this session', ...current.changes.map((change) => `  ${change}`));
  }

  if (current.errors.length > 0) {
    lines.push('', 'errors', ...current.errors.map((error) => `  ${error}`));
  }

  if (previous !== undefined) {
    lines.push(
      '',
      previous.clean === true
        ? '— previous session ended cleanly —'
        : '— PREVIOUS SESSION DIED (no clean exit) —',
      `  after ${String(previous.seconds)}s with ${String(previous.books)} books`,
      `  profile ${previous.profile ?? 'unknown'}`,
      `  textures ${String(previous.textures)}  draws ${String(previous.calls)}`,
      `  buffer ${previous.buffer}  dpr ${previous.pixelRatio.toFixed(2)}`,
      previous.heapMb === undefined ? '  heap n/a' : `  heap ${String(previous.heapMb)} MB`,
      ...(previous.changes ?? []).map((change) => `  · ${change}`),
      ...(previous.shaders ?? []).map((line) => `  ! ${line}`),
      ...previous.errors.map((error) => `  ! ${error}`),
    );

    /**
     * The URL that died is the URL you are on, and it will do it again.
     *
     * The panel writes what you dial back into the query string so a
     * configuration stays shareable. The cost of that is a loop: reload after a
     * crash and the settings that caused it are applied again, on a device that
     * has just proved it cannot hold them. Nothing here can know *which* setting
     * did it — that is what the change list above is for — so it says the thing
     * it does know and names the way out.
     */
    if (previous.clean !== true && carriesSettings(previous.query ?? window.location.search)) {
      lines.push(
        '',
        '  ⚠ that URL still carries those settings — reloading repeats it.',
        '    load the page with no query but ?debug to get back to the defaults.',
      );
    }
  }

  return lines.join('\n');
}

/**
 * Whether a query string asks for anything beyond turning the instruments on.
 *
 * `?debug` alone is the safe address: it mounts the black box and the panel and
 * changes no renderer setting. Anything else is a configuration, and a
 * configuration is what a crash record implicates.
 */
function carriesSettings(query: string): boolean {
  const params = new URLSearchParams(query);
  params.delete('debug');
  return [...params.keys()].length > 0;
}

/**
 * Storage is best-effort throughout.
 *
 * A diagnostic that can itself throw would take down the page it is diagnosing,
 * and `localStorage` genuinely does throw — quota, or a browser configured to
 * refuse it. Failing silently is correct here in a way it rarely is.
 */
function write(snapshot: Snapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* nothing to do, and nothing worth breaking the page over */
  }
}

function readPrevious(): Snapshot | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    // Shape-checked rather than trusted: this is data the user could have edited,
    // and a stale record from an older build would otherwise render as undefined.
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const snapshot = parsed as Snapshot;
    return typeof snapshot.seconds === 'number' ? snapshot : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Styled from here rather than from Shelf.astro.
 *
 * The component's stylesheet is for the shelf; this is a temporary instrument
 * that should be removable in one file. Note the `:global` gymnastics the notice
 * element needs for the opposite choice — that is the cost being avoided.
 */
function applyPanelStyle(panel: HTMLElement): void {
  Object.assign(panel.style, {
    position: 'absolute',
    top: '0.5rem',
    left: '0.5rem',
    zIndex: '10',
    margin: '0',
    padding: '0.5rem 0.6rem',
    maxWidth: 'calc(100vw - 1rem)',
    overflowX: 'auto',
    borderRadius: '0.4rem',
    background: 'rgba(10, 8, 7, 0.82)',
    color: '#9ff0b4',
    font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);
}

function applyButtonStyle(button: HTMLElement): void {
  Object.assign(button.style, {
    float: 'right',
    marginLeft: '0.75rem',
    padding: '0.15rem 0.5rem',
    border: '1px solid rgba(159, 240, 180, 0.4)',
    borderRadius: '0.25rem',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
  } satisfies Partial<CSSStyleDeclaration>);
}
