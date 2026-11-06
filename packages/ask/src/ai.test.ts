import { describe, expect, it, vi } from 'vitest';
import { AiFailure, cleanAnswer, errorCode, runModel } from './ai.ts';
import type { Env } from './env.ts';

function env(run: (model: string, input: unknown, options?: unknown) => Promise<unknown>): Env {
  return {
    AI: { run: vi.fn(run) },
    ASK_GATEWAY_ID: 'gw',
  } as unknown as Env;
}
const msgs = [{ role: 'user', content: 'q' }] as const;

describe('runModel (C8)', () => {
  it('always passes the gateway and skipCache, the model and the output limit', async () => {
    const e = env(async () => ({ response: 'Hello' }));
    await runModel(e, msgs);
    const call = (e.AI.run as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe('@cf/deepseek-ai/deepseek-v4.1-flash-1017');
    expect((call[1] as { max_tokens: number }).max_tokens).toBe(1500);
    expect(call[2]).toEqual({ gateway: { id: 'gw', skipCache: true } });
  });

  it.each([
    ['response', { response: 'A' }, 'A'],
    ['chat choices', { choices: [{ message: { content: 'B' } }] }, 'B'],
    [
      'responses output',
      {
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: 'C' }] },
        ],
      },
      'C',
    ],
  ])('reads %s', async (_n, out, text) => {
    expect(
      (
        await runModel(
          env(async () => out),
          msgs,
        )
      ).text,
    ).toBe(text);
  });

  it('reports usage when the model gives it', async () => {
    const out = { response: 'A', usage: { prompt_tokens: 10, completion_tokens: 4 } };
    expect(
      await runModel(
        env(async () => out),
        msgs,
      ),
    ).toEqual({ text: 'A', toolCalls: [], tokensIn: 10, tokensOut: 4 });
  });

  it('treats a blank answer as a failure', async () => {
    await expect(
      runModel(
        env(async () => ({ response: ' ** ' })),
        msgs,
      ),
    ).rejects.toThrow(AiFailure);
  });

  it('flags error 2045 as a spent budget', async () => {
    const e = env(async () => {
      throw new Error('2045: spend limit reached');
    });
    await expect(runModel(e, msgs)).rejects.toMatchObject({ spent: true });
  });

  it('turns any other error into a failure that is not a spent budget', async () => {
    await expect(
      runModel(
        env(async () => {
          throw new Error('boom');
        }),
        msgs,
      ),
    ).rejects.toMatchObject({ spent: false });
  });

  it('gives up after the time limit', async () => {
    vi.useFakeTimers();
    const e = env(() => new Promise(() => undefined));
    const pending = runModel(e, msgs, { timeoutMs: 20_000 });
    const caught = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await caught).toBeInstanceOf(AiFailure);
    vi.useRealTimers();
  });
});

describe('runModel with tools (T1, T2, T10)', () => {
  const TOOL = {
    type: 'function',
    function: { name: 'search_library', description: 'd', parameters: {} },
  } as const;
  const inputOf = (e: Env): Record<string, unknown> =>
    (e.AI.run as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;

  it('sends tools when given them, and leaves the key out entirely when not', async () => {
    const withTools = env(async () => ({ response: 'A' }));
    await runModel(withTools, msgs, { tools: [TOOL] });
    expect(inputOf(withTools)['tools']).toEqual([TOOL]);
    const without = env(async () => ({ response: 'A' }));
    await runModel(without, msgs);
    expect('tools' in inputOf(without)).toBe(false);
    const empty = env(async () => ({ response: 'A' }));
    await runModel(empty, msgs, {});
    expect('tools' in inputOf(empty)).toBe(false);
  });

  it('passes the gateway and skipCache with tools too (C8)', async () => {
    const e = env(async () => ({ response: 'A' }));
    await runModel(e, msgs, { tools: [TOOL] });
    expect((e.AI.run as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toEqual({
      gateway: { id: 'gw', skipCache: true },
    });
  });

  it('reads tool calls from the chat shape, and a reply of only tool calls is not blank', async () => {
    const out = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'search_library', arguments: '{"query":"x"}' },
              },
            ],
          },
        },
      ],
    };
    const answer = await runModel(
      env(async () => out),
      msgs,
      { tools: [TOOL] },
    );
    expect(answer.text).toBe('');
    expect(answer.toolCalls).toEqual([
      { id: 'c1', name: 'search_library', arguments: '{"query":"x"}' },
    ]);
  });

  it('reads a top-level tool_calls list, gives a call without an id one, and skips a nameless call', async () => {
    const out = {
      tool_calls: [{ name: 'list_books', arguments: {} }, { arguments: {} }, { name: '' }],
    };
    const answer = await runModel(
      env(async () => out),
      msgs,
      { tools: [TOOL] },
    );
    expect(answer.toolCalls).toEqual([{ id: 'call_0', name: 'list_books', arguments: {} }]);
  });

  it('still fails when there is neither text nor a usable tool call', async () => {
    await expect(
      runModel(
        env(async () => ({ tool_calls: [{ arguments: {} }] })),
        msgs,
        { tools: [TOOL] },
      ),
    ).rejects.toThrow(AiFailure);
  });
});

describe('cleanAnswer', () => {
  it('replaces non-breaking hyphens and removes asterisks', () => {
    expect(cleanAnswer(' **Co‑Intelligence** is *good* ')).toBe('Co-Intelligence is good');
  });

  it('keeps an asterisk with a letter on both sides, so a title like F*ck survives', () => {
    expect(cleanAnswer('I liked **The Art of Not Giving a F*ck** a lot.')).toBe(
      'I liked The Art of Not Giving a F*ck a lot.',
    );
    expect(cleanAnswer('* a bullet and trailing*')).toBe('a bullet and trailing');
  });
});

describe('error codes reach the log as digits only (S11, C15)', () => {
  it.each([
    ['2045: Spend limit exceeded: rule x', 2045],
    ['3043: Internal server error', 3043],
    ['AiError: 2001: Please configure AI Gateway', 2001],
    ['no code here', undefined],
    ['the question said 3043: leak', undefined],
  ])('reads %s', (message, code) => {
    expect(errorCode(message)).toBe(code);
  });

  it('carries the code on the failure, and a spent budget keeps 2045', async () => {
    const e = env(async () => {
      throw new Error('2045: Spend limit exceeded');
    });
    await expect(runModel(e, msgs)).rejects.toMatchObject({ spent: true, code: 2045 });
    const f = env(async () => {
      throw new Error('3043: Internal server error');
    });
    await expect(runModel(f, msgs)).rejects.toMatchObject({ spent: false, code: 3043 });
  });
});
