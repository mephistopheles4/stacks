import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './env.ts';
import { DAILY_QUESTION, HealthState, handleHealth, runDailyTest } from './health.ts';
import { createLibrarySource } from './library.ts';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 5, 12);

/** A real HealthState behind a namespace-shaped fake. */
function envWith(
  ai: () => Promise<unknown>,
  extra: Partial<Env> = {},
): { env: Env; store: Map<string, unknown>; aiCalls: () => number } {
  const store = new Map<string, unknown>();
  const object = new HealthState({
    storage: {
      get: async <T>(k: string) => store.get(k) as T | undefined,
      put: async (k, v) => void store.set(k, v),
    },
  });
  let calls = 0;
  const env = {
    AI: {
      run: async () => {
        calls += 1;
        return ai();
      },
    },
    HEALTH: {
      idFromName: (n: string) => n,
      get: () => ({ fetch: (u: string, init?: RequestInit) => object.fetch(new Request(u, init)) }),
    },
    SITE_ORIGIN: 'https://s.example',
    ASK_GATEWAY_ID: 'gw',
    ASK_AI_ENABLED: 'true',
    ...extra,
  } as unknown as Env;
  return { env, store, aiCalls: () => calls };
}

const library = (down = false) =>
  createLibrarySource('https://s.example', async () => {
    if (down) throw new Error('down');
    return Response.json({ books: [{ id: 'a', title: 'Alpha', status: 'read' }] });
  });

const get = (method = 'GET') => new Request('https://s.example/api/chat/health', { method });

describe('the daily test and the health address (C19)', () => {
  it('asks one fixed question and saves only pass or fail and the time', async () => {
    const { env, store } = envWith(async () => ({ response: 'I have read Alpha.' }));
    expect(await runDailyTest(env, library(), () => NOW)).toBe(true);
    expect(store.get('result')).toEqual({ ok: true, at: NOW });
    expect(JSON.stringify([...store])).not.toContain('Alpha');
    expect(DAILY_QUESTION).toBe('What have you read about finance?');
  });

  it('a failed AI call fails the test and the health address returns 503', async () => {
    const { env } = envWith(async () => {
      throw new Error('boom');
    });
    expect(await runDailyTest(env, library(), () => NOW)).toBe(false);
    expect((await handleHealth(get(), env, () => NOW + HOUR)).status).toBe(503);
  });

  it('a library that cannot be read fails the test', async () => {
    const { env } = envWith(async () => ({ response: 'x' }));
    expect(await runDailyTest(env, library(true), () => NOW)).toBe(false);
  });

  it('a spent budget passes, and the health address stays 200', async () => {
    const { env } = envWith(async () => {
      throw new Error('2045 spend limit');
    });
    expect(await runDailyTest(env, library(), () => NOW)).toBe(true);
    expect((await handleHealth(get(), env, () => NOW + HOUR)).status).toBe(200);
  });

  it('AI switched off on purpose passes', async () => {
    const { env } = envWith(async () => ({ response: 'x' }), { ASK_AI_ENABLED: 'false' });
    expect(await runDailyTest(env, library(), () => NOW)).toBe(true);
  });

  it('a passing result older than 36 hours is 503, and exactly 36 hours is 200', async () => {
    const { env } = envWith(async () => ({ response: 'I have read Alpha.' }));
    await runDailyTest(env, library(), () => NOW);
    expect((await handleHealth(get(), env, () => NOW + 36 * HOUR)).status).toBe(200);
    expect((await handleHealth(get(), env, () => NOW + 36 * HOUR + 1)).status).toBe(503);
  });

  it('no result yet is 200, and the health address makes no AI call', async () => {
    const { env, aiCalls } = envWith(async () => ({ response: 'x' }));
    const response = await handleHealth(get(), env, () => NOW);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('stacks-ask: up');
    expect(aiCalls()).toBe(0);
  });

  it('refuses a method other than GET and HEAD, and HEAD has no body', async () => {
    const { env } = envWith(async () => ({ response: 'x' }));
    expect((await handleHealth(get('POST'), env)).status).toBe(405);
    const head = await handleHealth(get('HEAD'), env);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('reveals only up or down when the store cannot be read', async () => {
    const { env } = envWith(async () => ({ response: 'x' }));
    const broken = {
      ...env,
      HEALTH: {
        idFromName: () => 'x',
        get: () => ({
          fetch: async () => {
            throw new Error('x');
          },
        }),
      },
    } as unknown as Env;
    const response = await handleHealth(get(), broken);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('stacks-ask: down');
  });
});

describe("the daily test's spend, in the log (observability C2)", () => {
  const logged = async (ai: () => Promise<unknown>, down = false): Promise<unknown[]> => {
    const out: unknown[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      out.push(JSON.parse(String(line)));
    });
    await runDailyTest(envWith(ai).env, library(down), () => NOW);
    return out;
  };
  const usage = {
    prompt_tokens: 50,
    completion_tokens: 5,
    neurons: 56,
    prompt_tokens_details: { cached_tokens: 40 },
  };

  it('a pass carries the Neurons, cached tokens and tokens it spent, and nothing else', async () => {
    expect(await logged(async () => ({ response: 'I have read Alpha.', usage }))).toEqual([
      { outcome: 'daily-pass', neurons: 56, tokensCached: 40, tokensIn: 50, tokensOut: 5 },
    ]);
  });

  it('a fail after a blank call carries what that call spent', async () => {
    expect(await logged(async () => ({ response: ' ', usage }))).toEqual([
      { outcome: 'daily-fail', neurons: 56, tokensCached: 40, tokensIn: 50, tokensOut: 5 },
    ]);
  });

  it('a fail before any call carries nothing', async () => {
    expect(await logged(async () => ({ response: 'x', usage }), true)).toEqual([
      { outcome: 'daily-fail' },
    ]);
  });
});
