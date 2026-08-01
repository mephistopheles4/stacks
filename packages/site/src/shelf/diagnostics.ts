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

/** Versioned, so an old record from a different shape is ignored rather than mis-read. */
const STORAGE_KEY = 'stacks.blackbox.v1';

const SAMPLE_MS = 1000;

/** Errors kept per session. Enough to see a pattern, bounded so a loop cannot fill the quota. */
const MAX_ERRORS = 8;

interface Snapshot {
  /** Absent on a record written by a session that was killed — the whole point. */
  clean?: true;
  seconds: number;
  books: number;
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
}

export interface DiagnosticsOptions {
  /** How many books were actually mounted — which `?books=N` may have cut down. */
  readonly books: number;
  /** Absent when the shelf failed to mount at all; the record is still worth writing. */
  readonly handle?: ShelfHandle;
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
    const stats = options.handle?.stats();
    const heap = performance.memory;

    return {
      seconds: Math.round((Date.now() - started) / 1000),
      books: options.books,
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
      ...(options.handle?.gpu === undefined ? {} : { gpu: options.handle.gpu }),
      screen: `${String(window.innerWidth)}x${String(window.innerHeight)} @${String(window.devicePixelRatio)}`,
      errors: [...errors],
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
      `  textures ${String(previous.textures)}  draws ${String(previous.calls)}`,
      `  buffer ${previous.buffer}  dpr ${previous.pixelRatio.toFixed(2)}`,
      previous.heapMb === undefined ? '  heap n/a' : `  heap ${String(previous.heapMb)} MB`,
      ...previous.errors.map((error) => `  ! ${error}`),
    );
  }

  return lines.join('\n');
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
