import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_FOUND, SEARCH_NONE, answerQuestion } from './answer.ts';
import type { Env } from './env.ts';
import type { CatalogueBook, LibrarySource } from './library.ts';
import { logOutcome } from './outcome.ts';
import { estimateTokens } from './prompt.ts';
import { searchLibrary } from './search.ts';

const NL = String.fromCharCode(10);

const b = (id: string, title: string, extra: Partial<CatalogueBook> = {}): CatalogueBook => ({
  id,
  title,
  status: 'read',
  thoughts: false,
  ...extra,
});

const CAT = [
  b('co', 'Co-Intelligence: Living and Working with AI', {
    author: 'Ethan Mollick',
    subjects: 'Computers',
    thoughts: true,
    rating: 5,
  }),
  b('money', 'Money Unlocked', { subjects: 'Business & Personal Finance', rating: 3 }),
  b('nexus', 'Nexus', { subjects: 'History', thoughts: true, rating: 4 }),
  b('reading', 'Staff Engineer', { status: 'reading' }),
];
const NOTES: Record<string, string[]> = {
  co: ['A teacher and a machine, working side by side.'],
  nexus: ['A long history of information networks.'],
};
const source: LibrarySource = {
  catalogue: async () => CAT,
  thoughts: async (book) => NOTES[book.id],
};

interface Step {
  readonly calls?: readonly { id?: string; name: string; args: unknown }[];
  readonly text?: string;
  readonly usage?: [number, number];
  readonly throws?: Error;
  /** Never answers, as a call that hangs. */
  readonly hang?: true;
}
interface Seen {
  readonly messages: {
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }[];
  readonly hasTools: boolean;
  readonly tools: unknown;
}

/** An AI binding that plays the given steps in order and records what it was sent. */
function scripted(steps: readonly Step[] | ((n: number) => Step)): {
  env: Env;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const env = {
    AI: {
      run: vi.fn(async (_model: string, input: Record<string, unknown>) => {
        seen.push({
          messages: JSON.parse(JSON.stringify(input['messages'])) as Seen['messages'],
          hasTools: 'tools' in input,
          tools: input['tools'],
        });
        // A loop that never ends is a failure of the test, not a hang.
        if (seen.length > 6) throw new Error('runaway');
        const step = typeof steps === 'function' ? steps(seen.length) : steps[seen.length - 1];
        if (step === undefined) throw new Error('the script ran out');
        if (step.throws) throw step.throws;
        if (step.hang) return new Promise<never>(() => undefined);
        return {
          choices: [
            {
              message: {
                content: step.text ?? null,
                ...(step.calls && {
                  tool_calls: step.calls.map((c, i) => ({
                    id: c.id ?? `id${String(i)}`,
                    type: 'function',
                    function: {
                      name: c.name,
                      arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args),
                    },
                  })),
                }),
              },
            },
          ],
          ...(step.usage && {
            usage: { prompt_tokens: step.usage[0], completion_tokens: step.usage[1] },
          }),
        };
      }),
    },
    ASK_GATEWAY_ID: 'gw',
    ASK_AI_ENABLED: 'true',
  } as unknown as Env;
  return { env, seen };
}

const search = (query: string, id?: string): NonNullable<Step['calls']>[number] => ({
  ...(id !== undefined && { id }),
  name: 'search_library',
  args: { query },
});

afterEach(() => vi.restoreAllMocks());

describe('the tool loop (T1, T2, T7)', () => {
  it('answers after a search: the catalogue is not in the prompt, the counts are, and the result goes back as a tool message', async () => {
    const { env, seen } = scripted([
      { calls: [search('Co-Intelligence', 'abc')], usage: [1000, 20] },
      {
        text:
          'I loved Co-Intelligence.' + NL + 'FOLLOW-UPS:' + NL + '- What did you think of Nexus?',
        usage: [1500, 40],
      },
    ]);
    const answered = await answerQuestion(env, source, 'What did you think of Co-Intelligence?');
    expect(answered.reply.mode).toBe('ai');
    expect(answered.reply.answer).toBe('I loved Co-Intelligence.');
    expect(answered.reply.followUps).toEqual(['What did you think of Nexus?']);
    expect(answered.reply.books.map((x) => x.id)).toEqual(['co']);
    expect(seen).toHaveLength(2);
    const system = seen[0]!.messages[0]!.content;
    expect(system.endsWith('Your library holds 4 books: 3 read, 1 reading.')).toBe(true);
    expect(system).not.toContain('Money Unlocked');
    expect(seen[0]!.hasTools).toBe(true);
    const second = seen[1]!.messages;
    expect(second.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(second[3]!.tool_call_id).toBe('abc');
    expect(second[3]!.content).toContain(
      'Your Thoughts on "Co-Intelligence: Living and Working with AI"',
    );
    expect(second[2]!.tool_calls).toEqual([
      {
        id: 'abc',
        type: 'function',
        function: { name: 'search_library', arguments: '{"query":"Co-Intelligence"}' },
      },
    ]);
  });

  it('sums tokens across calls and counts the searches (T13)', async () => {
    const { env } = scripted([
      { calls: [search('nexus')], usage: [1000, 20] },
      { text: 'Nexus.', usage: [1500, 40] },
    ]);
    const { detail } = await answerQuestion(env, source, 'q');
    expect(detail).toMatchObject({ searches: 1, tokensIn: 2500, tokensOut: 60 });
  });

  it('answers with no tool at all when the model needs none', async () => {
    const { env, seen } = scripted([{ text: 'I am an AI answering from the notes.' }]);
    const answered = await answerQuestion(env, source, 'Are you an AI?');
    expect(answered.reply.mode).toBe('ai');
    expect(seen).toHaveLength(1);
    expect(answered.detail.searches).toBe(0);
  });

  it("reads list_books, then a title search still returns that title's Thoughts (T6, T14)", async () => {
    const { env, seen } = scripted([
      { calls: [{ id: 'a', name: 'list_books', args: {} }] },
      { calls: [search('Nexus', 'b')] },
      { text: 'I wrote about Nexus.' },
    ]);
    const answered = await answerQuestion(env, source, 'What is your favourite?');
    expect(answered.reply.mode).toBe('ai');
    const list = seen[1]!.messages.at(-1)!.content;
    expect(list.split(NL)[0]).toBe(
      '"Co-Intelligence: Living and Working with AI" | 5/5 | has written Thoughts',
    );
    const found = seen[2]!.messages.at(-1)!.content;
    expect(found).toContain('Your Thoughts on "Nexus": A long history of information networks.');
  });

  it('a second search returns no book the first already returned (T6)', async () => {
    const { env, seen } = scripted([
      { calls: [search('Nexus')] },
      { calls: [search('history')] },
      { text: 'ok' },
    ]);
    await answerQuestion(env, source, 'q');
    expect(seen[2]!.messages.at(-1)!.content).toBe('No other books matched.');
  });
});

describe('at most 2 tool calls, then a call with no tools (T2, C26)', () => {
  it('a stub that always asks for a tool gets 2, a third call with no tools key, and plain results', async () => {
    const { env, seen } = scripted(() => ({ calls: [search('nexus')] }));
    const answered = await answerQuestion(env, source, 'nexus');
    expect(seen).toHaveLength(3);
    expect(seen.map((s) => s.hasTools)).toEqual([true, true, false]);
    expect(answered.outcome).toBe('search-ai-failed');
    expect(answered.detail).toMatchObject({ reason: 'blank', searches: 2 });
    expect(answered.reply.mode).toBe('search');
    expect(answered.reply.books.map((x) => x.id)).toEqual(['nexus']);
  });

  it('trims a message that asks for more calls than are left, answering only those it runs', async () => {
    const { env, seen } = scripted([
      { calls: [search('nexus', 'a'), search('money', 'b'), search('co', 'c')] },
      { text: 'Done.' },
    ]);
    const answered = await answerQuestion(env, source, 'q');
    expect(answered.reply.mode).toBe('ai');
    const second = seen[1]!.messages;
    const assistant = second.find((m) => m.role === 'assistant')!;
    const toolIds = second.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
    expect((assistant.tool_calls as { id: string }[]).map((c) => c.id)).toEqual(['a', 'b']);
    expect(toolIds).toEqual(['a', 'b']);
    // Both calls ran, so the next call has no tools left.
    expect(seen[1]!.hasTools).toBe(false);
    expect(answered.detail.searches).toBe(2);
  });
});

describe('any failed step gives plain results (T10, T12, C29)', () => {
  const nap = SEARCH_FOUND;

  it.each([
    [
      'arguments that are not JSON',
      [{ calls: [{ name: 'search_library', args: '{nope' }] }],
      'tool',
    ],
    ['a query that is missing', [{ calls: [{ name: 'search_library', args: {} }] }], 'tool'],
    ['an unknown tool', [{ calls: [{ name: 'drop_table', args: {} }] }], 'tool'],
    ['a blank final answer', [{ calls: [search('nexus')] }, { text: '  **  ' }], 'blank'],
    [
      'an answer that was only a block',
      [{ text: 'FOLLOW-UPS:' + NL + '- What about Nexus?' }],
      'blank',
    ],
    ['an error from the model', [{ throws: new Error('boom') }], 'error'],
  ] as const)('%s', async (_name, steps, reason) => {
    const { env } = scripted(steps);
    const answered = await answerQuestion(env, source, 'nexus');
    expect(answered.outcome).toBe('search-ai-failed');
    expect(answered.detail.reason).toBe(reason);
    expect(answered.reply.mode).toBe('search');
    expect(answered.reply.answer).toBe(nap);
    expect(answered.reply.books.map((x) => x.id)).toEqual(['nexus']);
    expect(answered.ai).toBe('failed');
  });

  it("says so with the owner's second wording when no book matches", async () => {
    const { env } = scripted([{ throws: new Error('boom') }]);
    const answered = await answerQuestion(env, source, 'zymurgy');
    expect(answered.reply.answer).toBe(SEARCH_NONE);
    expect(SEARCH_NONE).toBe(
      'The bot has worked too hard today and went to take a nap, and no book matches your words. Try a title, author or subject.',
    );
    expect(SEARCH_FOUND).toBe(
      'The bot has worked too hard today and went to take a nap. These books match your words.',
    );
  });

  it('a spent budget on any call is reported as spent, not failed', async () => {
    const { env } = scripted([
      { calls: [search('nexus')] },
      { throws: new Error('2045: Spend limit exceeded') },
    ]);
    const answered = await answerQuestion(env, source, 'nexus');
    expect(answered.ai).toBe('spent');
    expect(answered.detail).toMatchObject({ reason: 'budget', code: 2045, searches: 1 });
  });

  it("gives up when the question's one deadline has passed, whatever the calls took each (T11)", async () => {
    const { env, seen } = scripted([{ calls: [search('nexus')] }, { text: 'late' }]);
    let now = 0;
    // Each clock read is 20 s later: the first call is in time, the second is not.
    const clock = (): number => {
      now += 16_000;
      return now;
    };
    const answered = await answerQuestion(env, source, 'nexus', clock);
    expect(seen).toHaveLength(1);
    expect(answered.detail.reason).toBe('timeout');
    expect(answered.reply.mode).toBe('search');
  });

  it('a call that hangs is cut off at 30 seconds, not 20', async () => {
    vi.useFakeTimers();
    const hung = scripted(() => ({ hang: true }));
    let settled = false;
    const pending = answerQuestion(hung.env, source, 'nexus').finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    const answered = await pending;
    expect(answered.detail.reason).toBe('timeout');
    vi.useRealTimers();
  });
});

describe('no query reaches a log (T13, C32)', () => {
  it('a canary in a query, valid or bad, appears in no log line', async () => {
    const canary = 'CANARY-QUERY-71ab';
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    for (const args of [{ query: canary }, '{"query": "' + canary, { other: canary }]) {
      const { env } = scripted([{ calls: [{ name: 'search_library', args }] }, { text: 'ok' }]);
      const answered = await answerQuestion(env, source, canary);
      logOutcome(answered.outcome, answered.detail);
    }
    const logged = spies
      .flatMap((s) => s.mock.calls.map((call) => call.map(String).join(' ')))
      .join(NL);
    expect(logged).toContain('"searches"');
    expect(logged).not.toContain(canary);
  });
});

describe('follow-ups must be about the shelf (T9, C31)', () => {
  const answerWith = async (followUps: string[]): Promise<string[]> => {
    const text = ['Fine.', 'FOLLOW-UPS:', ...followUps.map((f) => `- ${f}`)].join(NL);
    const { env } = scripted([{ text }]);
    return (await answerQuestion(env, source, 'q')).reply.followUps as string[];
  };

  it('drops a follow-up naming a book that is not on the shelf', async () => {
    expect(await answerWith(['Have you written about The Great Gatsby?'])).toEqual([]);
  });

  it('keeps one that names a title or a subject word', async () => {
    expect(
      await answerWith(['What did you think of Nexus?', 'Which finance book would you recommend?']),
    ).toEqual(['What did you think of Nexus?', 'Which finance book would you recommend?']);
  });

  it('keeps the good one when the other is dropped', async () => {
    expect(
      await answerWith([
        'Have you written about The Great Gatsby?',
        'What did you think of Nexus?',
      ]),
    ).toEqual(['What did you think of Nexus?']);
  });
});

describe("plain results are the tool's search (T3, C27)", () => {
  it("with the model off, the books are what the tool's search returns for the question, in order", async () => {
    const env = { ASK_AI_ENABLED: 'false' } as unknown as Env;
    const question = 'computers history';
    const plain = await answerQuestion(env, source, question);
    const direct = await searchLibrary(CAT, source, question);
    expect(plain.outcome).toBe('search-off');
    expect(plain.reply.books.map((x) => x.id)).toEqual(direct.map((h) => h.book.id));
    expect(plain.reply.books.length).toBeGreaterThan(1);
  });
});

describe('the input stays within 6,000 before every call (T8, C28)', () => {
  // A library as big as the real one, with Thoughts as long as the real ones.
  const big = Array.from({ length: 61 }, (_, i) =>
    b(`b${String(i)}`, `A Fairly Long Book Title Number ${String(i)} In The Library`, {
      author: 'Some Author',
      subjects: 'Business & Economics; Leadership',
      finished: '2026-01-01',
      rating: (i % 5) + 1,
      thoughts: i % 5 === 0,
    }),
  );
  const longNote = ['I thought about leadership and teams. '.repeat(40)];
  const bigSource: LibrarySource = {
    catalogue: async () => big,
    thoughts: async (book) => (book.thoughts ? longNote : undefined),
  };
  const biggest = { question: 'q'.repeat(300), answer: 'a'.repeat(600) };

  it('with the largest memory and a question at the limit, two full results fit, memory stays and no book repeats', async () => {
    const { env, seen } = scripted([
      { calls: [search('leadership'), { id: 'l', name: 'list_books', args: {} }] },
      { text: 'Done.' },
    ]);
    const question = 'z'.repeat(1_500);
    await answerQuestion(env, bigSource, question, Date.now, [biggest, biggest]);
    for (const call of seen) {
      const tokens = call.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
      expect(tokens).toBeLessThanOrEqual(6_000);
    }
    const user = seen[0]!.messages[1]!.content;
    expect(user).toContain('a'.repeat(600));
    expect(user).toContain(question);
  });

  it('two searches on different words never send one book twice', async () => {
    const { env, seen } = scripted([
      { calls: [search('leadership')] },
      { calls: [search('economics')] },
      { text: 'Done.' },
    ]);
    await answerQuestion(env, bigSource, 'q');
    const lineIds = (text: string): string[] =>
      text
        .split(NL)
        .filter((l) => l.startsWith('"A Fairly'))
        .map((l) => l.split('"')[1]!);
    const first = lineIds(seen[1]!.messages.at(-1)!.content);
    const second = lineIds(seen[2]!.messages.at(-1)!.content);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(second.filter((t) => first.includes(t))).toEqual([]);
  });

  it('drops Thoughts before memory when a result will not fit, and the whole result last', async () => {
    // 110 books make a list of about 2,900 estimated tokens: too little room is left for a full search.
    const hundred = Array.from({ length: 110 }, (_, i) =>
      b(`h${String(i)}`, `A Fairly Long Book Title Number ${String(i)} In The Library`, {
        subjects: 'Leadership',
        rating: (i % 5) + 1,
        thoughts: i % 5 === 0,
      }),
    );
    const hundredSource: LibrarySource = {
      catalogue: async () => hundred,
      thoughts: async (book) => (book.thoughts ? longNote : undefined),
    };
    const { env, seen } = scripted([
      { calls: [{ id: 'l', name: 'list_books', args: {} }, search('leadership')] },
      { text: 'Done.' },
    ]);
    const question = 'z'.repeat(1_500);
    await answerQuestion(env, hundredSource, question, Date.now, [biggest, biggest]);
    const after = seen[1]!.messages;
    expect(after[1]!.content).toContain('a'.repeat(600));
    const tokens = after.reduce((n, m) => n + estimateTokens(m.content), 0);
    expect(tokens).toBeLessThanOrEqual(6_000);
    const found = after.at(-1)!.content;
    expect(found.split('Your Thoughts on').length - 1).toBe(1);
    expect(found).toContain('"A Fairly Long Book Title Number');
  });

  it('leaves out a list that cannot fit, and still answers', async () => {
    const three = Array.from({ length: 300 }, (_, i) =>
      b(`k${String(i)}`, `A Fairly Long Book Title Number ${String(i)} In The Library`),
    );
    const { env, seen } = scripted([
      { calls: [{ id: 'l', name: 'list_books', args: {} }] },
      { text: 'Done.' },
    ]);
    const answered = await answerQuestion(
      env,
      { catalogue: async () => three, thoughts: async () => undefined },
      'z'.repeat(1_500),
      Date.now,
      [biggest, biggest],
    );
    expect(seen[1]!.messages.at(-1)!.content).toBe('No result could be returned.');
    expect(answered.reply.mode).toBe('ai');
  });
});
