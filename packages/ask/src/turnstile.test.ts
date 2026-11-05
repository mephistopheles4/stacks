import { describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile.ts';

const input = {
  secret: 's3cret',
  token: 'tok',
  remoteIp: '203.0.113.9',
  siteOrigin: 'https://stacks.example',
};
const reply = (body: unknown): typeof fetch => vi.fn(async () => Response.json(body));

describe('verifyTurnstile (S5 step 3)', () => {
  const good = { success: true, hostname: 'stacks.example', action: 'ask' };

  it('accepts success with the right hostname and action', async () => {
    expect(await verifyTurnstile(input, reply(good))).toBe(true);
  });

  it('sends the secret, token and remoteip', async () => {
    const spy = vi.fn(async (_url: string, _init: RequestInit) => Response.json(good));
    await verifyTurnstile(input, spy as unknown as typeof fetch);
    const body = spy.mock.calls[0]![1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      secret: 's3cret',
      response: 'tok',
      remoteip: '203.0.113.9',
    });
  });

  it.each([
    ['a failed check', { ...good, success: false }],
    ['another hostname', { ...good, hostname: 'evil.example' }],
    ['another action', { ...good, action: 'login' }],
    ['no action', { success: true, hostname: 'stacks.example' }],
  ])('refuses %s', async (_name, body) => {
    expect(await verifyTurnstile(input, reply(body))).toBe(false);
  });

  it('checks the verdict alone when its own origin is localhost, for the test secret', async () => {
    const local = { ...input, siteOrigin: 'http://localhost:4321' };
    const testAnswer = { success: true, hostname: 'example.com', action: '' };
    expect(await verifyTurnstile(local, reply(testAnswer))).toBe(true);
    expect(await verifyTurnstile(local, reply({ success: false }))).toBe(false);
  });

  it('never relaxes for a production origin, whatever the hostname looks like', async () => {
    const testAnswer = { success: true, hostname: 'localhost', action: '' };
    expect(await verifyTurnstile(input, reply(testAnswer))).toBe(false);
  });

  it('refuses when the check cannot run', async () => {
    const boom = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile(input, boom)).toBe(false);
  });

  it('refuses a non-JSON reply', async () => {
    const html = (async () => new Response('<html>')) as unknown as typeof fetch;
    expect(await verifyTurnstile(input, html)).toBe(false);
  });
});
