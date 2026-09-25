import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserStore,
  describeFallback,
  FALLBACK_KEY,
  FALLBACK_TTL_MS,
  forgetRecord,
  gpuChanged,
  initialState,
  PAINTED_BASE,
  readRecord,
  samplesShadowMap,
  startingBase,
  writeRecord,
  type DrawMode,
  type FallbackRecord,
  type FallbackState,
  type StoreLike,
} from './shadow-fallback.ts';
import { DEFAULT_SETTINGS, resolveSettings } from './shelf-settings.ts';
import { readSettings } from './shelf-url.ts';

/**
 * The lost-context record, pinned without a browser.
 *
 * Every rule here decides what a device draws for up to 30 days after one bad
 * frame, and each one is a line somebody could delete with the desktop shelf
 * still looking right: a record that never expires, one that is refreshed on
 * every load, a store that throws through boot, or a probe that stops beating
 * the record.
 */

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
// The string Chrome 153 reports on the Pixel 10 Pro XL, measured: no driver build in it.
const GPU = 'ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES 3.2)';

/** A `Map` behind the three calls, recording what was asked of it. */
function memoryStore(initial: Record<string, string> = {}): StoreLike & {
  readonly data: Map<string, string>;
  readonly removed: string[];
} {
  const data = new Map(Object.entries(initial));
  const removed: string[] = [];
  return {
    data,
    removed,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      removed.push(key);
      data.delete(key);
    },
  };
}

/** Every call throws, the way `localStorage` does when a browser refuses site data. */
function throwingStore(): StoreLike {
  const refuse = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

const stored = (value: unknown): ReturnType<typeof memoryStore> =>
  memoryStore({ [FALLBACK_KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readRecord', () => {
  it('returns the record a write left behind', () => {
    const store = memoryStore();
    expect(writeRecord(store, NOW, GPU)).toBe(true);
    expect(readRecord(store, NOW + 1000)).toEqual({ v: 1, at: NOW, gpu: GPU });
  });

  it.each([
    ['not JSON', 'not json {'],
    ['not an object', '1'],
    ['null', 'null'],
    ['an array', '[1]'],
    ['v: 2', { v: 2, at: NOW }],
    ['no v', { at: NOW }],
    ['a string at', { v: 1, at: String(NOW) }],
    ['a non-finite at', '{"v":1,"at":1e999}'],
    ['a future at', { v: 1, at: NOW + 1 }],
  ])('reads %s as no record, and removes it', (_, value) => {
    const store = stored(value);
    expect(readRecord(store, NOW)).toBeUndefined();
    expect(store.removed).toEqual([FALLBACK_KEY]);
  });

  it('reads a missing key as no record and removes nothing', () => {
    const store = memoryStore();
    expect(readRecord(store, NOW)).toBeUndefined();
    expect(store.removed).toEqual([]);
  });

  it('holds a record for one millisecond short of the expiry', () => {
    const store = stored({ v: 1, at: NOW });
    expect(readRecord(store, NOW + FALLBACK_TTL_MS - 1)).toEqual({ v: 1, at: NOW });
    expect(store.removed).toEqual([]);
  });

  it('expires a record at exactly the TTL, and removes it', () => {
    const store = stored({ v: 1, at: NOW });
    expect(readRecord(store, NOW + FALLBACK_TTL_MS)).toBeUndefined();
    expect(store.removed).toEqual([FALLBACK_KEY]);
  });

  it('is thirty days', () => {
    expect(FALLBACK_TTL_MS).toBe(30 * 86_400_000);
  });

  it('drops a gpu that is not a string, and keeps the record', () => {
    expect(readRecord(stored({ v: 1, at: NOW, gpu: 7 }), NOW)).toEqual({ v: 1, at: NOW });
  });

  it('never refreshes the timestamp by reading it', () => {
    // A record re-read on every load must still expire on the day it was
    // written for, or a device that stays painted stays painted for ever.
    const store = stored({ v: 1, at: NOW });
    readRecord(store, NOW + 1000);
    readRecord(store, NOW + 2000);
    expect(store.data.get(FALLBACK_KEY)).toBe(JSON.stringify({ v: 1, at: NOW }));
  });
});

describe('storage that refuses', () => {
  it('reads, writes and forgets without throwing', () => {
    const store = throwingStore();
    expect(readRecord(store, NOW)).toBeUndefined();
    expect(writeRecord(store, NOW, GPU)).toBe(false);
    expect(forgetRecord(store)).toBe(false);
  });

  it('accepts no store at all', () => {
    expect(readRecord(undefined, NOW)).toBeUndefined();
    expect(writeRecord(undefined, NOW, GPU)).toBe(false);
    expect(forgetRecord(undefined)).toBe(false);
  });

  it('reads an unusable record through a store that refuses to remove it', () => {
    const store: StoreLike = {
      getItem: () => 'not json',
      setItem: () => undefined,
      removeItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    expect(readRecord(store, NOW)).toBeUndefined();
  });

  it('returns no store when the accessor itself throws', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(browserStore()).toBeUndefined();
  });

  it('returns no store where there is no window', () => {
    expect(browserStore()).toBeUndefined();
  });

  it('returns the store when the page has one', () => {
    const store = memoryStore();
    vi.stubGlobal('window', { localStorage: store });
    expect(browserStore()).toBe(store);
  });
});

describe('writeRecord', () => {
  it('writes exactly v, at and gpu, and nothing else', () => {
    const store = memoryStore();
    writeRecord(store, NOW, GPU);
    const written = JSON.parse(store.data.get(FALLBACK_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['at', 'gpu', 'v']);
    expect(written).toEqual({ v: 1, at: NOW, gpu: GPU });
  });

  it('leaves gpu out when the browser would not name it', () => {
    const store = memoryStore();
    writeRecord(store, NOW, undefined);
    expect(store.data.get(FALLBACK_KEY)).toBe(JSON.stringify({ v: 1, at: NOW }));
  });

  it('is forgotten by forgetRecord', () => {
    const store = memoryStore();
    writeRecord(store, NOW, GPU);
    expect(forgetRecord(store)).toBe(true);
    expect(readRecord(store, NOW)).toBeUndefined();
  });
});

describe('what the URL and the record resolve to', () => {
  const record: FallbackRecord = { v: 1, at: NOW, gpu: GPU };
  const running = (query: string, from: FallbackRecord | undefined): boolean =>
    resolveSettings(readSettings(new URLSearchParams(query)), startingBase(from)).shadows.enabled;

  it('lets ?shadows=1 beat a record', () => {
    expect(running('shadows=1', record)).toBe(true);
  });

  it('lets ?shadows=0 force painted without a record', () => {
    expect(running('shadows=0', undefined)).toBe(false);
  });

  it('starts painted from a record when the URL says nothing', () => {
    expect(running('', record)).toBe(false);
  });

  it('runs the shipped default when there is no record and the URL says nothing', () => {
    expect(running('', undefined)).toBe(DEFAULT_SETTINGS.shadows.enabled);
  });

  it('starts from the defaults themselves when there is no record', () => {
    expect(startingBase(undefined)).toBe(DEFAULT_SETTINGS);
  });

  it('changes only shadows.enabled in the painted base', () => {
    // Every other dial must be what a device without a record gets, or a
    // record would quietly change the look beyond the one thing it is for.
    expect(startingBase(record)).toBe(PAINTED_BASE);
    expect(PAINTED_BASE.shadows.enabled).toBe(false);
    expect({ ...PAINTED_BASE, shadows: { ...PAINTED_BASE.shadows, enabled: true } }).toEqual({
      ...DEFAULT_SETTINGS,
      shadows: { ...DEFAULT_SETTINGS.shadows, enabled: true },
    });
  });
});

describe('gpuChanged', () => {
  const record = (gpu?: string): FallbackRecord =>
    gpu === undefined ? { v: 1, at: NOW } : { v: 1, at: NOW, gpu };

  it('is true only when both strings are known and differ', () => {
    expect(gpuChanged(record(GPU), `${GPU} `)).toBe(true);
    expect(gpuChanged(record(GPU), GPU)).toBe(false);
    expect(gpuChanged(record(GPU), undefined)).toBe(false);
    expect(gpuChanged(record(), GPU)).toBe(false);
    expect(gpuChanged(record(), undefined)).toBe(false);
  });
});

describe('initialState', () => {
  const record: FallbackRecord = { v: 1, at: NOW, gpu: GPU };

  it('is none without a record, whatever the URL says', () => {
    expect(initialState(undefined, true, GPU)).toEqual({ kind: 'none' });
    expect(initialState(undefined, undefined, GPU)).toEqual({ kind: 'none' });
  });

  it('is remembered when the URL does not ask for shadows', () => {
    expect(initialState(record, undefined, GPU)).toEqual({ kind: 'remembered', at: NOW });
    expect(initialState(record, false, GPU)).toEqual({ kind: 'remembered', at: NOW });
  });

  it('is a probe override when the URL asks for shadows', () => {
    expect(initialState(record, true, GPU)).toEqual({ kind: 'probe-override', at: NOW });
  });

  it('retires a record whose GPU string moved, probe or not', () => {
    expect(initialState(record, undefined, 'another')).toEqual({ kind: 'retired', at: NOW });
    expect(initialState(record, true, 'another')).toEqual({ kind: 'retired', at: NOW });
  });
});

describe('samplesShadowMap', () => {
  it('follows the live shadows switch', () => {
    expect(samplesShadowMap(resolveSettings({ shadows: { enabled: true } }))).toBe(true);
    expect(samplesShadowMap(resolveSettings({ shadows: { enabled: false } }))).toBe(false);
  });
});

describe('describeFallback', () => {
  const cases: readonly [FallbackState, DrawMode, string][] = [
    [{ kind: 'none' }, 'real-time', 'real-time'],
    [{ kind: 'none' }, 'painted', 'painted'],
    [
      { kind: 'remembered', at: NOW },
      'painted',
      'painted — remembered from a lost context on 2026-09-24, retries after 2026-10-24',
    ],
    [
      { kind: 'probe-override', at: NOW },
      'real-time',
      'real-time — ?shadows=1 overrides a record from 2026-09-24',
    ],
    [
      { kind: 'retired', at: NOW },
      'painted',
      'painted — record from 2026-09-24 retired, GPU string changed',
    ],
    [
      { kind: 'waiting', lostAt: 12_000, remembered: true },
      'real-time',
      'lost at 12.0s, waiting for a restore',
    ],
    [
      { kind: 'restored', lostAt: 12_000, restoredAfter: 1147, remembered: true },
      'painted',
      'painted — lost at 12.0s, restored in 1.1s, redrawn painted',
    ],
    [
      { kind: 'fresh-canvas', lostAt: 12_000, waited: 2500, remembered: true },
      'painted',
      'painted — lost at 12.0s, no restore in 2.5s, redrawn on a new canvas',
    ],
    [
      { kind: 'refused', via: 'fresh', lostAt: 12_000, remembered: true },
      'painted',
      'lost — no restore and no new canvas; reload comes back painted',
    ],
    [
      { kind: 'refused', via: 'same', lostAt: 12_000, remembered: false },
      'painted',
      'lost — restored, and the redraw failed; reload to retry; storage refused, not remembered',
    ],
    [
      { kind: 'fresh-canvas', lostAt: 12_000, waited: 2500, remembered: false },
      'painted',
      'painted — lost at 12.0s, no restore in 2.5s, redrawn on a new canvas; storage refused, not remembered',
    ],
  ];

  it.each(cases)('describes %j', (state, mode, line) => {
    expect(describeFallback(state, mode)).toBe(line);
  });

  it('says there is no shelf rather than naming a mode nothing is drawn in', () => {
    // A browser that refused the first context, on a device with a record: the
    // page draws nothing, and `painted` would name a picture that is not there.
    expect(describeFallback({ kind: 'remembered', at: NOW }, 'no shelf')).toBe(
      'no shelf — remembered from a lost context on 2026-09-24, retries after 2026-10-24',
    );
    expect(describeFallback({ kind: 'none' }, 'no shelf')).toBe('no shelf');
  });
});
