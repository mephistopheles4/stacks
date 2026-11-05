import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './env.ts';
import { handleChat } from './handler.ts';
import { createLibrarySource } from './library.ts';
import { VisitorCounter, type CounterStorage } from './visitor.ts';

const ORIGIN = 'https://stacks.example';
const CANARY_Q = 'CANARY-QUESTION-7f3a';
const CANARY_IP = '198.51.100.77';

const LIBRARY = {
  books: [
    {
      id: 'co-int',
      title: 'Co-Intelligence',
      author: 'Ethan Mollick',
      status: 'read',
      thoughts: true,
      rating: 5,
      subjects: 'Computers',
    },
    { id: 'money', title: 'Money Unlocked', author: 'Jo', status: 'read', subjects: 'Business' },
    {
      id: 'private-note',
      title: 'Quiet',
      status: 'read',
      body: 'CANARY-BODY',
      secretField: 'CANARY-SECRET',
    },
  ],
};
const NOTE = { paragraphs: ['A teacher and a machine, working side by side.'] };

interface Rig {
  env: Env;
  aiCalls: { input: { messages: { content: string }[] }; options: unknown }[];
  turnstileCalls: number;
  libraryFetches: number;
  fetchImpl: typeof fetch;
}

function rig(
  options: {
    ai?: () => Promise<unknown>;
    turnstile?: unknown;
    rate?: () => Promise<{ success: boolean }>;
    libraryDown?: boolean;
    aiEnabled?: string;
    secrets?: boolean | 'no-turnstile' | 'no-visitor';
    library?: unknown;
    counter?: () => Promise<Response>;
  } = {},
): Rig {
  const state: Rig = { aiCalls: [], turnstileCalls: 0, libraryFetches: 0 } as unknown as Rig;
  // One storage per counter, as Cloudflare keeps one per object: a test that
  // shares one cannot tell a /64 key from a raw-address key (integrity lens).
  const storageFor = (): CounterStorage => {
    const store = new Map<string, unknown>();
    let alarm: number | null = null;
    return {
      get: async <T>(k: string) => store.get(k) as T | undefined,
      put: async (k, v) => void store.set(k, v),
      deleteAll: async () => store.clear(),
      getAlarm: async () => alarm,
      setAlarm: async (t) => {
        alarm = t;
      },
    };
  };
  const counters = new Map<string, VisitorCounter>();
  state.fetchImpl = async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url).hostname === 'challenges.cloudflare.com') {
      state.turnstileCalls += 1;
      return Response.json(
        options.turnstile ?? { success: true, hostname: 'stacks.example', action: 'ask' },
      );
    }
    if (url.endsWith('/library.json')) {
      state.libraryFetches += 1;
      if (options.libraryDown) throw new Error('down');
      return Response.json(options.library ?? LIBRARY);
    }
    if (url.endsWith('/notes/co-int.json')) return Response.json(NOTE);
    return new Response('<html>', { headers: { 'content-type': 'text/html' } });
  };
  state.env = {
    AI: {
      run: vi.fn(async (_m: string, input: unknown, opts?: unknown) => {
        state.aiCalls.push({ input: input as never, options: opts });
        return options.ai ? options.ai() : { response: 'I rated Co-Intelligence 5 out of 5.' };
      }),
    },
    RATE: { limit: options.rate ?? (async () => ({ success: true })) },
    VISITORS: {
      idFromName: (n: string) => n,
      get: (id: unknown) => ({
        fetch: async (u: string, init?: RequestInit) => {
          if (options.counter) return options.counter();
          let c = counters.get(id as string);
          if (!c) {
            c = new VisitorCounter(
              { storage: storageFor(), blockConcurrencyWhile: (cb) => cb() },
              {},
            );
            counters.set(id as string, c);
          }
          return c.fetch(new Request(u, init));
        },
      }),
    },
    HEALTH: {
      idFromName: (n: string) => n,
      get: () => ({ fetch: async () => new Response(null) }),
    },
    SITE_ORIGIN: ORIGIN,
    ASK_GATEWAY_ID: 'gw',
    ASK_AI_ENABLED: options.aiEnabled ?? 'true',
    ...(options.secrets === false || options.secrets === 'no-turnstile'
      ? {}
      : { TURNSTILE_SECRET: 's' }),
    ...(options.secrets === false || options.secrets === 'no-visitor' ? {} : { VISITOR_KEY: 'k' }),
  };
  return state;
}

function ask(
  question = 'What did you think of Co-Intelligence?',
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}/api/chat`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'cf-connecting-ip': CANARY_IP,
      ...headers,
    },
    body: JSON.stringify({ question, token: 'tok' }),
  });
}

async function run(r: Rig, request: Request) {
  const source = createLibrarySource(ORIGIN, r.fetchImpl);
  const response = await handleChat(request, r.env, { source, fetch: r.fetchImpl });
  return {
    status: response.status,
    body: (await response.json()) as { mode: string; answer: string; books: unknown[] },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('the AI path (C1 in miniature, C3)', () => {
  it('returns an AI answer naming library books, with only S6 fields', async () => {
    const r = rig();
    const { status, body } = await run(r, ask());
    expect(status).toBe(200);
    expect(body.mode).toBe('ai');
    expect(Object.keys(body).sort()).toEqual(['answer', 'books', 'followUps', 'mode']);
    expect(body.books).toEqual([
      { id: 'co-int', title: 'Co-Intelligence', author: 'Ethan Mollick', hasThoughts: true },
    ]);
  });

  it('C3: a canary in a non-public field never reaches the model; Thoughts do', async () => {
    const r = rig();
    await run(r, ask());
    const sent = JSON.stringify(r.aiCalls[0]!.input);
    expect(sent).not.toContain('CANARY-BODY');
    expect(sent).not.toContain('Library/Quiet.md');
    expect(sent).toContain('A teacher and a machine');
  });

  it('passes the gateway and skipCache', async () => {
    const r = rig();
    await run(r, ask());
    expect(r.aiCalls[0]!.options).toEqual({ gateway: { id: 'gw', skipCache: true } });
  });
});

describe('the failure table (C4)', () => {
  it.each([
    [
      'AI throws',
      {
        ai: async () => {
          throw new Error('boom');
        },
      },
    ],
    [
      'error 2045',
      {
        ai: async () => {
          throw new Error('2045');
        },
      },
    ],
    ['a blank answer', { ai: async () => ({ response: '  ' }) }],
    ['the switch off', { aiEnabled: 'false' }],
    ['the switch unset to nothing', { aiEnabled: 'TRUE' }],
  ])('%s gives 200 search with the stated text', async (_n, options) => {
    const { status, body } = await run(rig(options), ask('Tell me about Money Unlocked'));
    expect(status).toBe(200);
    expect(body.mode).toBe('search');
    expect(body.answer).toBe('AI answers are unavailable right now. These books match your words.');
    expect(body.books).toHaveLength(1);
  });

  it('search with no match says so', async () => {
    const { body } = await run(rig({ aiEnabled: 'false' }), ask('zebra'));
    expect(body.answer).toBe(
      'AI answers are unavailable right now, and no book matches your words. Try a title, author or subject.',
    );
  });

  it('a failed Turnstile is 403 error', async () => {
    const { status, body } = await run(rig({ turnstile: { success: false } }), ask());
    expect(status).toBe(403);
    expect(body).toEqual({
      mode: 'error',
      answer: "Couldn't confirm this request. Reload the page and ask again.",
      books: [],
      followUps: [],
    });
  });

  it('a rate limit is 429 limited', async () => {
    const { status, body } = await run(rig({ rate: async () => ({ success: false }) }), ask());
    expect(status).toBe(429);
    expect(body).toEqual({
      mode: 'limited',
      answer: "That's the limit for now. Try again later.",
      books: [],
      followUps: [],
    });
  });

  it('a bad request is 400 error', async () => {
    const { status, body } = await run(rig(), ask('x'.repeat(1600)));
    expect(status).toBe(400);
    expect(body.answer).toBe("That question couldn't be sent. Shorten it and try again.");
  });

  it('a failed data load is 503 error', async () => {
    const { status, body } = await run(rig({ libraryDown: true }), ask());
    expect(status).toBe(503);
    expect(body.answer).toBe("The library couldn't be read just now. Try again shortly.");
  });
});

describe('refusals never call AI (C5)', () => {
  const cases: [string, Parameters<typeof rig>[0], (() => Request) | undefined][] = [
    ['another origin', {}, () => ask('q', { origin: 'https://evil.example' })],
    [
      'a 9 KB body',
      {},
      () =>
        new Request(`${ORIGIN}/api/chat`, {
          method: 'POST',
          headers: {
            origin: ORIGIN,
            'content-type': 'application/json',
            'cf-connecting-ip': CANARY_IP,
          },
          body: JSON.stringify({ question: 'q', token: 't', pad: 'x'.repeat(9000) }),
        }),
    ],
    ['a failed Turnstile', { turnstile: { success: false } }, undefined],
    ['a missing address', {}, () => ask('q', { 'cf-connecting-ip': '' })],
    ['a missing Turnstile secret', { secrets: 'no-turnstile' }, undefined],
    ['a missing visitor key', { secrets: 'no-visitor' }, undefined],
    ['the per-minute limit', { rate: async () => ({ success: false }) }, undefined],
    [
      'a rate limiter that throws',
      {
        rate: async () => {
          throw new Error('x');
        },
      },
      undefined,
    ],
    [
      'a counter that throws',
      {
        counter: async () => {
          throw new Error('x');
        },
      },
      undefined,
    ],
    ['a counter that returns junk', { counter: async () => new Response('nope') }, undefined],
    ['a library that is down', { libraryDown: true }, undefined],
  ];
  it.each(cases)('%s', async (_n, options, make) => {
    const r = rig(options);
    const { status } = await run(r, make ? make() : ask());
    // The refusal the row names, not just any refusal.
    const named: Record<string, number> = {
      'another origin': 400,
      'a 9 KB body': 400,
      'a failed Turnstile': 403,
      'a missing address': 403,
      'a missing Turnstile secret': 403,
      'a missing visitor key': 403,
      'the per-minute limit': 429,
      'a library that is down': 503,
    };
    expect(status).toBe(named[_n] ?? 429);
    expect(r.aiCalls).toHaveLength(0);
  });

  it('a request refused on shape makes no Turnstile call either', async () => {
    const r = rig();
    await run(r, ask('q', { origin: 'https://evil.example' }));
    expect(r.turnstileCalls).toBe(0);
  });

  it('the 31st question from one address in a day is refused without AI', async () => {
    const r = rig();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await run(r, ask())).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses[30]).toBe(429);
    expect(r.aiCalls).toHaveLength(30);
  });

  it('one /64 shares one allowance across compressed and expanded forms', async () => {
    const r = rig({ aiEnabled: 'false' });
    const a = await run(r, ask('q', { 'cf-connecting-ip': '2001:db8:0:0:1::1' }));
    expect(a.status).toBe(200);
    for (let i = 0; i < 29; i += 1)
      await run(r, ask('q', { 'cf-connecting-ip': '2001:db8::2:0:0:1' }));
    const over = await run(r, ask('q', { 'cf-connecting-ip': '2001:0db8:0000:0000:ffff:0:0:3' }));
    expect(over.status).toBe(429);
  });
});

describe('logging (C15)', () => {
  it('logs fixed outcome codes and never the question or the address', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const bad = new Request(`${ORIGIN}/api/chat`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        'cf-connecting-ip': CANARY_IP,
      },
      body: `{"question":"${CANARY_Q}",`,
    });
    await run(rig(), ask(CANARY_Q));
    await run(
      rig({
        ai: async () => {
          throw new Error(`leak ${CANARY_Q}`);
        },
      }),
      ask(CANARY_Q),
    );
    await run(rig(), bad);
    await run(rig({ turnstile: { success: false } }), ask(CANARY_Q));
    const logged = spies
      .flatMap((s) => s.mock.calls.map((call) => call.map(String).join(' ')))
      .join('\n');
    expect(logged).toContain('"outcome"');
    expect(logged).not.toContain(CANARY_Q);
    expect(logged).not.toContain(CANARY_IP);
  });
});

describe('Thoughts sent (C3)', () => {
  const many = {
    books: Array.from({ length: 6 }, (_, i) => ({
      id: `t${String(i)}`,
      title: `Thought Book ${String(i)}`,
      status: 'read',
      thoughts: true,
      rating: 3,
    })),
  };

  it('sends at most 3 sets of Thoughts, and the same ones for a broad question every time', async () => {
    const sent: string[] = [];
    for (let round = 0; round < 2; round += 1) {
      const r = rig({ library: many });
      const noted: string[] = [];
      const inner = r.fetchImpl;
      r.fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/notes/')) {
          noted.push(url);
          return Response.json({ paragraphs: ['note ' + url] });
        }
        return inner(input, init);
      };
      await run(r, ask('What kind of books have you read?'));
      expect(noted.length).toBeLessThanOrEqual(3);
      sent.push(JSON.stringify(r.aiCalls[0]!.input));
    }
    expect(sent[0]).toBe(sent[1]);
    expect(sent[0]).toContain('note ');
  });
});

describe('a local build is refused whole', () => {
  it('turns a library carrying a private flag or a source path into a data failure, with no AI call', async () => {
    const local = {
      books: [{ id: 'x', title: 'X', status: 'read', private: true, sourcePath: 'Library/X.md' }],
    };
    const r = rig({ library: local });
    const { status } = await run(r, ask());
    expect(status).toBe(503);
    expect(r.aiCalls).toHaveLength(0);
  });

  it('refuses a wishlist book too', async () => {
    const r = rig({ library: { books: [{ id: 'w', title: 'W', status: 'wishlist' }] } });
    expect((await run(r, ask())).status).toBe(503);
  });
});

describe('outcome codes', () => {
  it('names a missing secret apart from a missing address, and a spent budget apart from a failure', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void lines.push(String(line)));
    await run(rig({ secrets: 'no-visitor' }), ask());
    await run(rig(), ask('q', { 'cf-connecting-ip': '' }));
    await run(
      rig({
        ai: async () => {
          throw new Error('2045 spend');
        },
      }),
      ask(),
    );
    await run(
      rig({
        ai: async () => {
          throw new Error('boom');
        },
      }),
      ask(),
    );
    expect(lines.join('\n')).toContain('"refused-secret"');
    expect(lines.join('\n')).toContain('"refused-address"');
    expect(lines.join('\n')).toContain('"reason":"budget"');
    expect(lines.join('\n')).toContain('"reason":"error"');
  });
});

describe('why AI did not answer, in the log (S11)', () => {
  const logged = async (ai: () => Promise<unknown>): Promise<string> => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void lines.push(String(line)));
    await run(rig({ ai }), ask(CANARY_Q));
    return lines.join('\n');
  };

  it('a spent budget logs reason budget with 2045, a fault logs its own code, and neither logs the question', async () => {
    const spent = await logged(async () => {
      throw new Error('2045: Spend limit exceeded ' + CANARY_Q);
    });
    expect(spent).toContain('"reason":"budget"');
    expect(spent).toContain('"code":2045');
    const fault = await logged(async () => {
      throw new Error('3043: Internal server error');
    });
    expect(fault).toContain('"reason":"error"');
    expect(fault).toContain('"code":3043');
    expect(spent + fault).not.toContain(CANARY_Q);
  });

  it('a blank answer and a timeout log their own reasons with no code', async () => {
    expect(await logged(async () => ({ response: ' ' }))).toContain('"reason":"blank"');
    expect(
      await logged(async () => {
        throw new Error('plain failure');
      }),
    ).not.toContain('"code"');
  });
});

describe('follow-ups (S6, C4, C15)', () => {
  const NL = String.fromCharCode(10);
  const reply = (text: string) => async () => ({ response: text });
  const answered = (text: string) => run(rig({ ai: reply(text) }), ask());

  it('splits the follow-ups off the answer, in the same one call', async () => {
    const r = rig({
      ai: reply(
        [
          'I rated Co-Intelligence 5.',
          'FOLLOW-UPS:',
          '- What did you think of Co-Intelligence?',
        ].join(NL),
      ),
    });
    const { body } = await run(r, ask());
    expect(r.aiCalls).toHaveLength(1);
    expect(body).toMatchObject({ mode: 'ai', answer: 'I rated Co-Intelligence 5.' });
    expect((body as { followUps?: string[] }).followUps).toEqual([
      'What did you think of Co-Intelligence?',
    ]);
  });

  it.each([
    ['no marker', 'Just an answer about Co-Intelligence.'],
    ['a marker with none', ['An answer.', 'FOLLOW-UPS: none'].join(NL)],
    [
      'only malformed lines',
      ['An answer.', 'FOLLOW-UPS:', '- see https://evil.example?', '- <b>x</b> what?'].join(NL),
    ],
  ])('still gives the answer, with no follow-ups, for %s', async (_n, text) => {
    const { status, body } = await answered(text);
    expect(status).toBe(200);
    expect(body).toMatchObject({ mode: 'ai' });
    expect((body as { followUps?: string[] }).followUps).toEqual([]);
    expect(body.answer).not.toContain('FOLLOW-UPS');
  });

  it('drops an oversized follow-up and keeps no more than 2', async () => {
    const q = (n: number) => `- What did you think of Book ${String(n)}?`;
    const big = `- ${'X'.repeat(200)}?`;
    const { body } = await answered(['A.', 'FOLLOW-UPS:', big, q(1), q(2), q(3)].join(NL));
    expect((body as { followUps?: string[] }).followUps).toEqual([
      'What did you think of Book 1?',
      'What did you think of Book 2?',
    ]);
  });

  it('falls back to search when the reply was only a block', async () => {
    const { body } = await answered(
      ['FOLLOW-UPS:', '- What did you think of Co-Intelligence?'].join(NL),
    );
    expect(body.mode).toBe('search');
    expect((body as { followUps?: string[] }).followUps).toEqual([]);
  });

  it('a search fallback and every refusal carry an empty follow-up list', async () => {
    const search = await run(rig({ aiEnabled: 'false' }), ask('money'));
    expect((search.body as { followUps?: string[] }).followUps).toEqual([]);
    const refused = await run(rig({ turnstile: { success: false } }), ask());
    expect((refused.body as { followUps?: string[] }).followUps).toEqual([]);
  });
});
