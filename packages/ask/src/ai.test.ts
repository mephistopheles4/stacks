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
    expect(call[0]).toBe('@cf/openai/gpt-oss-20b');
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
    ).toEqual({ text: 'A', tokensIn: 10, tokensOut: 4 });
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
    const pending = runModel(e, msgs, 20_000);
    const caught = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await caught).toBeInstanceOf(AiFailure);
    vi.useRealTimers();
  });
});

describe('cleanAnswer', () => {
  it('replaces non-breaking hyphens and removes asterisks', () => {
    expect(cleanAnswer(' **Co‑Intelligence** is *good* ')).toBe('Co-Intelligence is good');
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
