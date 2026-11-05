import { describe, expect, it } from 'vitest';
import {
  type CounterState,
  type CounterStorage,
  VisitorCounter,
  nextMidnight,
  normaliseAddress,
  utcDay,
  visitorKey,
} from './visitor.ts';

describe('normaliseAddress (C6)', () => {
  it.each([
    ['203.0.113.9', '203.0.113.9'],
    ['2001:db8:1:2:3:4:5:6', '2001:0db8:0001:0002'],
    ['2001:DB8:1:2::1', '2001:0db8:0001:0002'],
    ['2001:db8::1', '2001:0db8:0000:0000'],
    ['::1', '0000:0000:0000:0000'],
    ['::ffff:203.0.113.9', '203.0.113.9'],
    ['::ffff:cb00:7109', '203.0.113.9'],
  ])('%s maps to %s', (input, expected) => {
    expect(normaliseAddress(input)).toBe(expected);
  });

  it('puts a compressed and an expanded form of one /64 on one key', () => {
    expect(normaliseAddress('2001:db8:0:0:aaaa::1')).toBe(
      normaliseAddress('2001:0db8:0000:0000:bbbb:0:0:2'),
    );
  });

  it.each([null, undefined, '', 'nope', '999.1.1.1', '1:2:3', '1::2::3', 'g::1'])(
    'refuses %s',
    (input) => {
      expect(normaliseAddress(input)).toBeUndefined();
    },
  );
});

describe('visitorKey', () => {
  it('is stable, keyed and changes with the day and secret', async () => {
    const a = await visitorKey('203.0.113.9', '2026-11-05', 'k');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await visitorKey('203.0.113.9', '2026-11-05', 'k')).toBe(a);
    expect(await visitorKey('203.0.113.9', '2026-11-06', 'k')).not.toBe(a);
    expect(await visitorKey('203.0.113.9', '2026-11-05', 'other')).not.toBe(a);
    expect(a).not.toContain('203');
  });

  it('formats the UTC day', () => {
    expect(utcDay(new Date('2026-11-05T23:59:59Z'))).toBe('2026-11-05');
  });
});

function memoryState(): { state: CounterState; store: Map<string, unknown>; alarms: number[] } {
  const store = new Map<string, unknown>();
  const alarms: number[] = [];
  const storage: CounterStorage = {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    put: async (key, value) => {
      await Promise.resolve();
      store.set(key, value);
    },
    deleteAll: async () => store.clear(),
    getAlarm: async () => alarms.at(-1) ?? null,
    setAlarm: async (time) => {
      alarms.push(time);
    },
  };
  return {
    state: { storage, blockConcurrencyWhile: (cb) => cb() },
    store,
    alarms,
  };
}

describe('VisitorCounter (C6)', () => {
  const now = () => new Date('2026-11-05T10:00:00Z');

  it('allows 30 and refuses the 31st', async () => {
    const { state } = memoryState();
    const counter = new VisitorCounter(state, {}, now);
    const results: boolean[] = [];
    for (let i = 0; i < 31; i += 1) {
      results.push(
        ((await (await counter.fetch(new Request('https://x/'))).json()) as { allowed: boolean })
          .allowed,
      );
    }
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(results[30]).toBe(false);
  });

  it('cannot be passed by 100 parallel requests', async () => {
    const { state } = memoryState();
    const counter = new VisitorCounter(state, {}, now);
    const all = await Promise.all(
      Array.from({ length: 100 }, () => counter.fetch(new Request('https://x/'))),
    );
    const allowed = (
      await Promise.all(all.map((r) => r.json() as Promise<{ allowed: boolean }>))
    ).filter((r) => r.allowed);
    expect(allowed).toHaveLength(30);
  });

  it('sets an alarm for the next UTC midnight and deletes the record when it fires', async () => {
    const { state, store, alarms } = memoryState();
    const counter = new VisitorCounter(state, {}, now);
    await counter.fetch(new Request('https://x/'));
    expect(alarms).toEqual([Date.UTC(2026, 10, 6)]);
    expect(store.get('count')).toBe(1);
    await counter.alarm();
    expect(store.size).toBe(0);
    const again = (await (await counter.fetch(new Request('https://x/'))).json()) as {
      count: number;
    };
    expect(again.count).toBe(1);
  });

  it('resumes from storage after eviction', async () => {
    const { state, store } = memoryState();
    store.set('count', 30);
    const counter = new VisitorCounter(state, {}, now);
    await Promise.resolve();
    const reply = (await (await counter.fetch(new Request('https://x/'))).json()) as {
      allowed: boolean;
    };
    expect(reply.allowed).toBe(false);
  });

  it('computes midnight across a month end', () => {
    expect(nextMidnight(new Date('2026-12-31T23:00:00Z'))).toBe(Date.UTC(2027, 0, 1));
  });
});
