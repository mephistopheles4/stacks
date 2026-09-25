/**
 * The pure half of `scripts/phone-check.ts`: its command line, what a run on a
 * phone means, and how it is printed.
 *
 * Pure — no `fs`, no child process, no socket — so it is specced in Vitest and
 * mutated by Stryker, while the script that drives adb and Chrome's DevTools
 * protocol stays a thin shell around it that only a phone can run.
 *
 * ## What a run can mean
 *
 * Only one verdict says anything about the shelf on that phone: `survived`.
 * Every other one either says it did not (`lost`, `link-fail`, `no-context`) or
 * says the run proves nothing (`invalid-*`), and a run that proves nothing must
 * never print as a pass:
 *
 * - **hidden** — Android stops animation frames for a page that is not in
 *   front, so a page that spent any poll hidden drew nothing for a while and
 *   "survived" by not drawing;
 * - **fallback** — a device carrying a lost-context record starts painted
 *   (ADR-0091), so after one lost run every later run would survive by sampling
 *   no map at all. The script clears the record before each run; this is what
 *   refuses the run if it did not.
 */

/** Where a run's page lives. A path is served by the script; a URL is anyone's. */
export interface PhoneRun {
  readonly label: string;
  readonly url: string;
  readonly waitS: number;
}

export interface PhoneOptions {
  readonly runs: readonly PhoneRun[];
  readonly serve: string | undefined;
  readonly port: number;
  readonly adb: string;
  readonly serial: string | undefined;
  /** Skip the force-stop that clears a blocked origin — for looking at a page, not measuring it. */
  readonly keep: boolean;
  readonly shot: boolean;
  /** Read `chrome://gpu` in a tab of its own, and run nothing. */
  readonly gpuinfo: boolean;
}

const FLAGS_WITH_VALUES = ['url', 'serve', 'wait', 'label', 'serial', 'adb', 'port'] as const;
const SWITCHES = ['keep', 'shot', 'gpuinfo', 'matrix'] as const;

/** The default page three times, the painted path once, and the reproduction last. */
export function matrixRuns(waitS: number): PhoneRun[] {
  return [
    { label: 'default-1', url: '/', waitS },
    { label: 'default-2', url: '/', waitS },
    { label: 'default-3', url: '/', waitS },
    { label: 'painted', url: '/?shadows=0', waitS },
    // Last, always: it loses the context on the Pixel 10 Pro XL, which writes a
    // record and gets the origin blocked until Chrome is force-stopped.
    { label: 'receivers-all', url: '/?receivers=all', waitS },
  ];
}

/**
 * The command line, as flags only — never the environment, which G9 would
 * require `.env.example` to document for a tool most contributors never run.
 * An unknown flag or a flag with no value is refused rather than ignored: a
 * misspelt `--seriall` must not quietly drive whichever phone is plugged in.
 */
export function parsePhoneArgs(argv: readonly string[]): PhoneOptions {
  const values = new Map<string, string>();
  const switches = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const name = arg.startsWith('--') ? arg.slice(2) : undefined;
    if (name !== undefined && (SWITCHES as readonly string[]).includes(name)) {
      switches.add(name);
    } else if (name !== undefined && (FLAGS_WITH_VALUES as readonly string[]).includes(name)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
      values.set(name, value);
      index += 1;
    } else {
      throw new Error(`unknown argument "${arg}" — see the header of scripts/phone-check.ts`);
    }
  }

  const waitS = number(values.get('wait') ?? '120', '--wait');
  const port = number(values.get('port') ?? '8765', '--port');
  const url = values.get('url') ?? '/';
  if (!url.startsWith('/') && !/^https?:\/\//.test(url)) {
    throw new Error(`--url takes a path on the served build or an http(s) URL, not "${url}"`);
  }
  if (switches.has('matrix') && values.has('url')) {
    throw new Error('--matrix runs its own five pages; drop --url');
  }

  return {
    runs: switches.has('matrix')
      ? matrixRuns(waitS)
      : [{ label: values.get('label') ?? 'run', url, waitS }],
    serve: values.get('serve'),
    port,
    adb: values.get('adb') ?? 'adb',
    serial: values.get('serial'),
    keep: switches.has('keep'),
    shot: switches.has('shot'),
    gpuinfo: switches.has('gpuinfo'),
  };
}

function number(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${flag} needs a whole number, not "${raw}"`);
  return value;
}

/** A path is served by the script on the phone's `localhost`, through `adb reverse`. */
export function resolveRunUrl(url: string, port: number): string {
  return url.startsWith('/') ? `http://localhost:${String(port)}${url}` : url;
}

/** Which device to drive, out of `adb devices`, or why there is none to drive. */
export function pickDevice(listing: string, serial: string | undefined): string {
  const devices = listing
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id !== undefined && id !== '' && state === 'device')
    .map(([id]) => id ?? '');

  if (serial !== undefined) {
    if (devices.includes(serial)) return serial;
    throw new Error(
      `no device "${serial}" attached and authorised. adb devices says:\n${listing.trim()}`,
    );
  }
  const [only, ...others] = devices;
  if (only === undefined) {
    throw new Error(
      `no device attached and authorised — plug a phone in with USB debugging on. adb devices says:\n${listing.trim()}`,
    );
  }
  if (others.length > 0) {
    throw new Error(`more than one device: ${devices.join(', ')} — pass --serial <one of them>`);
  }
  return only;
}

/* -------------------------------------------------------------------------- */

export type PhoneVerdictKind =
  'lost' | 'link-fail' | 'no-context' | 'invalid-hidden' | 'invalid-fallback' | 'survived';

/** What the script saw of one run. */
export interface PhoneObservation {
  /** Once-a-second polls of the page, and how many of them found it in front. */
  readonly polls: number;
  readonly visiblePolls: number;
  /** Seconds after navigation the loss was first seen, if it was. */
  readonly lostAtS: number | undefined;
  readonly linkFailures: number;
  /** WebGL contexts the page hook saw draw or link. */
  readonly contexts: number;
  /** Whether `window.__shelf.ready` was ever true. */
  readonly ready: boolean;
  /** `window.__shelf.fallback()` at the last poll: `none` unless a record or a loss moved it. */
  readonly fallback: string | undefined;
}

export interface PhoneVerdict {
  readonly kind: PhoneVerdictKind;
  readonly reason: string;
}

/**
 * The verdict, most specific first. A loss wins over everything, because it is
 * the thing being measured; a link failure is its own failure; a page that
 * never drew is neither a loss nor a survival. Only then is a run that held
 * asked whether it proves anything.
 */
export function phoneVerdict(o: PhoneObservation): PhoneVerdict {
  if (o.lostAtS !== undefined) {
    return {
      kind: 'lost',
      reason: `the WebGL context was lost ${o.lostAtS.toFixed(1)} s after navigation`,
    };
  }
  if (o.linkFailures > 0) {
    return { kind: 'link-fail', reason: `${String(o.linkFailures)} program(s) failed to link` };
  }
  if (!o.ready || o.contexts === 0) {
    return {
      kind: 'no-context',
      reason: o.ready
        ? 'the shelf said it was ready and the hook saw no WebGL context'
        : 'the shelf never said it was ready — refused a context, or failed before drawing',
    };
  }
  if (o.polls === 0 || o.visiblePolls < o.polls) {
    return {
      kind: 'invalid-hidden',
      reason:
        o.polls === 0
          ? 'the page was never polled'
          : `the page was in front for ${String(o.visiblePolls)} of ${String(o.polls)} polls, ` +
            'and a hidden page draws nothing',
    };
  }
  if (o.fallback !== 'none') {
    return {
      kind: 'invalid-fallback',
      reason:
        `the shelf's fallback read "${String(o.fallback)}", not "none" — it may have run ` +
        'painted from a lost-context record, which proves nothing about the shadow map',
    };
  }
  return {
    kind: 'survived',
    reason: `held for ${String(o.polls)} one-second polls, in front throughout`,
  };
}

/** One printed line per run, the same shape a matrix row takes. */
export interface PhoneRow {
  readonly label: string;
  readonly verdict: PhoneVerdict;
  readonly elapsedS: number;
  /** `describeSampling`'s line, or why there is none. */
  readonly sampling: string;
  /** G61's judgement of the same run: `ok`, or how many clauses failed. */
  readonly g60: string;
}

export function formatRows(header: string, rows: readonly PhoneRow[]): string[] {
  const width = Math.max(5, ...rows.map((row) => row.label.length)) + 2;
  return [
    header,
    `${'run'.padEnd(width)}${'verdict'.padEnd(18)}${'time'.padStart(7)}   G61`,
    ...rows.map(
      (row) =>
        `${row.label.padEnd(width)}${row.verdict.kind.padEnd(18)}` +
        `${`${row.elapsedS.toFixed(0)} s`.padStart(7)}   ${row.g60}\n` +
        `${''.padEnd(width)}${row.verdict.reason}\n${''.padEnd(width)}${row.sampling}`,
    ),
  ];
}

/**
 * The logcat lines worth keeping beside a result: the GPU driver, the GPU
 * process and Chrome's own, and nothing about windows or wallpapers.
 *
 * ⚠️ **A logcat can carry personal data** — notifications, account names, other
 * apps' chatter. The whole of it stays in `artifacts/phone/`, which is ignored,
 * and never goes into an issue raw; this filtered slice is what a result quotes.
 */
export function interestingLogcat(logcat: string, keep = 80): string[] {
  // `JobInfo` and the freezer name Chrome's own packages on every line and say
  // nothing about the GPU — measured on the first run of this script.
  const noise =
    /WindowManager|Wallpaper|InputDispatcher|ActivityTaskManager: +Displayed|JobInfo|freezing|unfroze/;
  const signal =
    /PVR|IMGSRV|powervr|libEGL|vulkan|context lost|CONTEXT_LOST|GL_OUT_OF_MEMORY|gpu hang|HWR|SIGSEGV|SIGBUS|SIGABRT|tombstone|chromium|GpuProcess|Fatal/i;
  return logcat
    .split(/\r?\n/)
    .filter((line) => !noise.test(line) && signal.test(line))
    .slice(-keep);
}
