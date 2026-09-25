import {
  DEFAULT_SETTINGS,
  resolveSettings,
  type ShadowSettings,
  type ShelfSettings,
} from './shelf-settings.ts';

/**
 * The lost-context record: what a device remembers after real-time shadows
 * lost its WebGL context once.
 *
 * The Pixel 10 Pro XL loses the context when too much of the scene samples the
 * shadow map, and what kills it is not known (ADR-0088). The shelf now ships
 * the one configuration measured to survive there, but a driver that loses it
 * anyway must not lose it on every page load. So when a context is lost while the shelf samples the map,
 * the page redraws with painted shadows and writes **one small record**, and
 * later loads read it and start painted. A page running a shadow probe redraws
 * the same way and writes nothing (`runsShippedShadows`).
 *
 * It reacts to a failure this device showed, never to a guess about the device:
 * no user agent, GPU name or memory figure decides anything here. The GPU string
 * is compared only with **itself**, to retire a record when the driver changes.
 *
 * No `three` import and no DOM at module scope, so vitest's node environment
 * runs every rule in this file. `boot.ts` does the wiring; `context-recovery.ts`
 * decides what a loss does inside one page.
 *
 * See [ADR-0091](../../../../docs/adr/0091-a-lost-context-falls-back-to-painted-shadows.md).
 */

/**
 * Versioned in the key, so a record of a different shape is a different key and
 * is never misread. The value carries `v` as well, so a hand-edit that keeps the
 * key and changes the shape is refused too.
 */
export const FALLBACK_KEY = 'stacks.shadows.fallback.v1';

/**
 * How long a record holds before the device tries real-time shadows again.
 *
 * ⚠️ **Never refreshed by a later load.** Refreshing it would make the record
 * permanent on a device that stays painted, and the point of an expiry is that a
 * fixed driver gets real-time shadows back. So a still-broken device costs at
 * most one lost context every 30 days.
 */
export const FALLBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a lost page waits for the browser to restore its context before it
 * builds on a new canvas instead.
 *
 * About twice the two restores ever observed on the Pixel, 1,147 and 1,159 ms.
 * A restore that lands later is ignored: the shelf has already been redrawn.
 */
export const RESTORE_WAIT_MS = 2500;

/** Just the three calls this file makes, so a test can hand in a store that throws. */
export interface StoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The whole record. Nothing else goes in it: no URL, no settings, no id.
 *
 * `gpu` is the unmasked renderer string when the browser gives one. ⚠️ **On the
 * Pixel 10 Pro XL it does not carry the driver build**: Chrome 153 reports
 * `ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES
 * 3.2)`, measured on the device, where `chrome://gpu` shows `build
 * 25.3@6908880`. So a changed string means a different GPU or a different
 * ANGLE backend, and a driver update alone retires nothing — the expiry is
 * what gives an updated driver its retry.
 */
export interface FallbackRecord {
  readonly v: 1;
  /** When the context was lost, in epoch milliseconds. */
  readonly at: number;
  readonly gpu?: string;
}

/**
 * `window.localStorage`, or `undefined` when the page may not have it.
 *
 * ⚠️ **The accessor itself throws** — `SecurityError` when site data is blocked
 * — so merely reading the property is inside the `try`. Under node there is no
 * `window` at all, which lands in the same `catch`.
 */
export function browserStore(): StoreLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The record, if there is a usable one.
 *
 * Anything else reads as no record: missing, not JSON, the wrong shape, a
 * timestamp that is not a number or lies in the future, or one that has
 * expired. A record that was present and unusable is removed on the way out,
 * best effort, so it is not re-read on every load.
 */
export function readRecord(store: StoreLike | undefined, now: number): FallbackRecord | undefined {
  if (store === undefined) return undefined;

  let raw: string | null;
  try {
    raw = store.getItem(FALLBACK_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  const record = parseRecord(raw, now);
  if (record === undefined) forgetRecord(store);
  return record;
}

function parseRecord(raw: string, now: number): FallbackRecord | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const { v, at, gpu } = parsed as { v?: unknown; at?: unknown; gpu?: unknown };
  if (v !== 1 || typeof at !== 'number' || !Number.isFinite(at)) return undefined;
  if (at > now || now - at >= FALLBACK_TTL_MS) return undefined;
  return typeof gpu === 'string' ? { v: 1, at, gpu } : { v: 1, at };
}

/** Writes the record. `false` when there is no store or it refused; never throws. */
export function writeRecord(
  store: StoreLike | undefined,
  now: number,
  gpu: string | undefined,
): boolean {
  if (store === undefined) return false;
  const record: FallbackRecord = gpu === undefined ? { v: 1, at: now } : { v: 1, at: now, gpu };
  try {
    store.setItem(FALLBACK_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Removes the record. `false` when there is no store or it refused; never throws. */
export function forgetRecord(store: StoreLike | undefined): boolean {
  if (store === undefined) return false;
  try {
    store.removeItem(FALLBACK_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The defaults with real-time shadows off, and nothing else changed.
 *
 * What a device with a record starts from. A URL is still folded on top of it,
 * so `?shadows=1` beats the record with no code of its own, and every other
 * setting is exactly what a device without a record would get.
 */
export const PAINTED_BASE: ShelfSettings = resolveSettings({ shadows: { enabled: false } });

/** What the URL's settings are folded onto: painted after a record, the defaults otherwise. */
export function startingBase(record: FallbackRecord | undefined): ShelfSettings {
  return record === undefined ? DEFAULT_SETTINGS : PAINTED_BASE;
}

/**
 * Whether this device's GPU string moved since the record was written.
 *
 * True only when both are known and differ. A browser that redacts the string
 * never retires a record this way, and the expiry still applies to it.
 */
export function gpuChanged(record: FallbackRecord, gpu: string | undefined): boolean {
  return record.gpu !== undefined && gpu !== undefined && record.gpu !== gpu;
}

/**
 * Whether a shelf running these settings reads the shadow map.
 *
 * Read off the **live** settings, because the panel turns shadows on and off
 * without a rebuild. A loss while this is false says nothing about sampling, so
 * the fallback does not take it: no record, **no painted rebuild**, and a
 * restore resumes in place (`context-recovery.ts`). Whether a loss is written
 * down is a separate question, `runsShippedShadows`'s.
 *
 * ⚠️ **`?shadowfetch=0` draws the map and does not read it.** The shelf stops
 * every material sampling it after the first frame (`stopSamplingShadows` in
 * `scene.ts`), which is the whole point of that probe: it separates holding a
 * depth attachment from sampling one. So resuming it in place resumes nothing
 * that reads the map.
 *
 * ⚠️ **`receivers` is not a factor, and must not become one.** `?receivers=all`
 * reads the map from every book, which is what died on the Pixel; false here
 * would route its loss to the in-place resume, and three relinks the same
 * programs on a restore — the path that died again 3,088 and 3,474 draws later.
 */
export function samplesShadowMap(running: ShelfSettings): boolean {
  return running.shadows.enabled && running.shadows.fetch;
}

/**
 * Whether every shadow setting but the on/off switch is the one that ships.
 *
 * A lost context writes the record only when this holds. The record's one
 * effect is to turn the **shipped** real-time shadows off on later loads, and
 * what kills a context is not known (ADR-0088), so only a loss of that
 * configuration says anything about it. A loss under a shadow probe —
 * `?receivers=all`, the upstream reproduction, which dies on the Pixel where the
 * shipped shelf survives, or `?shadowtype=`, `?shadowmap=`, `?casters=`,
 * `?shadowfetch=`, `?painted=` — is that probe's answer. The page still redraws
 * painted; it just does not paint the device for 30 days.
 *
 * Not writing is the cheap mistake: a device whose shipped shelf fails too
 * loses one more context on its next plain load, and that loss writes. Writing
 * wrongly takes real-time shadows from a device that can run them, for weeks.
 *
 * The switch is left out because the panel and `?shadows=1` both turn the
 * shipped shadows on over a record, and a loss there is the re-test the record
 * expects. Every other key is compared, so a shadow setting added later is a
 * probe with no line of its own. ⚠️ **By value**, which holds while every shadow
 * setting is a scalar; one that is not would make every loss a probe's, and
 * G60's `restore` case, which requires the record, would go red.
 */
export function runsShippedShadows(running: ShelfSettings): boolean {
  const shipped = DEFAULT_SETTINGS.shadows;
  return (Object.keys(shipped) as (keyof ShadowSettings)[]).every(
    (key) => key === 'enabled' || running.shadows[key] === shipped[key],
  );
}

/**
 * Whether a loss was written down, and if not, why.
 *
 * - `yes` — the record is in storage, and the next plain load starts painted.
 * - `refused` — storage would not take it, so the next load will not know.
 * - `probe` — the page was running a shadow probe (`runsShippedShadows`), so
 *   nothing was asked of storage, and the next plain load starts wherever it
 *   would have: real-time, or painted from a record an earlier loss wrote.
 *
 * Three values rather than a boolean because the two ways of not writing lead
 * the black box to say different things, and one of them is a fault.
 */
export type Remembered = 'yes' | 'refused' | 'probe';

/**
 * Where one page stands, from its first mount to however a loss settled.
 *
 * The first four are decided at load. The last four happen to one page after a
 * loss, and each says whether the record was written — see `Remembered`.
 *
 * `lostAt` and `restoredAfter` are milliseconds since the page started, as
 * `performance.now()` reads them.
 */
export type FallbackState =
  | { readonly kind: 'none' }
  | { readonly kind: 'remembered'; readonly at: number }
  | { readonly kind: 'probe-override'; readonly at: number }
  | { readonly kind: 'retired'; readonly at: number }
  | { readonly kind: 'waiting'; readonly lostAt: number; readonly remembered: Remembered }
  | {
      readonly kind: 'restored';
      readonly lostAt: number;
      readonly restoredAfter: number;
      readonly remembered: Remembered;
    }
  | {
      readonly kind: 'fresh-canvas';
      readonly lostAt: number;
      readonly waited: number;
      readonly remembered: Remembered;
    }
  | {
      readonly kind: 'refused';
      /** Which rebuild the browser would not give a context to. */
      readonly via: 'same' | 'fresh';
      readonly lostAt: number;
      readonly remembered: Remembered;
    };

export type FallbackKind = FallbackState['kind'];

/**
 * The state a page starts in.
 *
 * `askedForShadows` is the URL's own `?shadows=`, before any base is applied.
 * A record whose GPU string no longer matches is **retired**: this load was
 * already mounted painted and stays so, and the next load tries real-time again.
 */
export function initialState(
  record: FallbackRecord | undefined,
  askedForShadows: boolean | undefined,
  gpu: string | undefined,
): FallbackState {
  if (record === undefined) return { kind: 'none' };
  if (gpuChanged(record, gpu)) return { kind: 'retired', at: record.at };
  return askedForShadows === true
    ? { kind: 'probe-override', at: record.at }
    : { kind: 'remembered', at: record.at };
}

/**
 * What the page is drawing **now**: the live shelf's mode, or no shelf at all.
 *
 * `no shelf` is its own word because a browser that refused the first context
 * has a record and draws nothing, and a line calling that `painted` would name
 * a picture that is not there.
 */
export type DrawMode = 'real-time' | 'painted' | 'no shelf';

/**
 * The `fallback` line the black box shows under `?debug`.
 *
 * `mode` is read off the live shelf rather than the state, so the line never
 * names a mode the page is not in — the panel can turn shadows on over a
 * remembered record, and the line then says so.
 *
 * `addressAsksForShadows` is whether the address a reload would load carries
 * `?shadows=1`. The record chooses only the base and the URL is folded on top
 * (ADR-0091 item 3), so such a reload samples the map whatever was remembered,
 * and "reload comes back painted" would send a tester straight back into the
 * configuration that just lost its context.
 */
export function describeFallback(
  state: FallbackState,
  mode: DrawMode,
  addressAsksForShadows = false,
): string {
  switch (state.kind) {
    case 'none':
      return mode;
    case 'remembered':
      return (
        `${mode} — remembered from a lost context on ${day(state.at)}, ` +
        `retries after ${day(state.at + FALLBACK_TTL_MS)}`
      );
    case 'probe-override':
      return `${mode} — ?shadows=1 overrides a record from ${day(state.at)}`;
    case 'retired':
      return `${mode} — record from ${day(state.at)} retired, GPU string changed`;
    case 'waiting':
      return `lost at ${seconds(state.lostAt)}, waiting for a restore${unremembered(state)}`;
    case 'restored':
      return (
        `${mode} — lost at ${seconds(state.lostAt)}, restored in ` +
        `${seconds(state.restoredAfter)}, redrawn painted${unremembered(state)}`
      );
    case 'fresh-canvas':
      return (
        `${mode} — lost at ${seconds(state.lostAt)}, no restore in ${seconds(state.waited)}, ` +
        `redrawn on a new canvas${unremembered(state)}`
      );
    case 'refused':
      return (
        `lost — ${state.via === 'fresh' ? 'no restore and no new canvas' : 'restored, and the redraw failed'}; ` +
        `${reloadAfter(state.remembered, addressAsksForShadows)}${unremembered(state)}`
      );
  }
}

/** What a reload does after a refused redraw — see `describeFallback`. */
function reloadAfter(remembered: Remembered, addressAsksForShadows: boolean): string {
  if (remembered !== 'yes') return 'reload to retry';
  return addressAsksForShadows
    ? 'remembered, but ?shadows=1 beats the record: reload without it for painted'
    : 'reload comes back painted';
}

function day(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function unremembered(state: { readonly remembered: Remembered }): string {
  switch (state.remembered) {
    case 'yes':
      return '';
    case 'refused':
      return '; storage refused, not remembered';
    case 'probe':
      return '; a shadow probe, not remembered';
  }
}
