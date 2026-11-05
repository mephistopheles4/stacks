import { describe, expect, it } from 'vitest';
import { readRequest } from './request.ts';

const ORIGIN = 'https://stacks.example';

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/chat`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body,
  });
}
const json = (value: unknown): string => JSON.stringify(value);

describe('readRequest (S5 step 2)', () => {
  it('accepts a well-formed question and trims it', async () => {
    const r = await readRequest(post(json({ question: '  hi  ', token: 't' })), ORIGIN);
    expect(r).toEqual({ ok: true, question: 'hi', token: 't' });
  });

  it.each([
    ['a GET', new Request(`${ORIGIN}/api/chat`, { headers: { origin: ORIGIN } })],
    [
      'another origin',
      post(json({ question: 'q', token: 't' }), { origin: 'https://evil.example' }),
    ],
    ['no origin', post(json({ question: 'q', token: 't' }), { origin: '' })],
    [
      'a text content type',
      post(json({ question: 'q', token: 't' }), { 'content-type': 'text/plain' }),
    ],
    ['invalid JSON', post('{nope')],
    ['a JSON array', post('[]')],
    ['a missing token', post(json({ question: 'q' }))],
    ['an empty question', post(json({ question: '   ', token: 't' }))],
    ['a 1501-character question', post(json({ question: 'x'.repeat(1501), token: 't' }))],
    ['a non-string question', post(json({ question: 4, token: 't' }))],
    ['a huge token', post(json({ question: 'q', token: 't'.repeat(3000) }))],
  ])('refuses %s', async (_name, request) => {
    expect(await readRequest(request, ORIGIN)).toEqual({ ok: false });
  });

  it('accepts exactly 1500 characters', async () => {
    const r = await readRequest(post(json({ question: 'x'.repeat(1500), token: 't' })), ORIGIN);
    expect(r.ok).toBe(true);
  });

  it('refuses a 9 KB body that declares nothing, by counting what it reads', async () => {
    const big = json({ question: 'q', token: 't', pad: 'x'.repeat(9 * 1024) });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const request = new Request(`${ORIGIN}/api/chat`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(await readRequest(request, ORIGIN)).toEqual({ ok: false });
  });

  it('refuses on a declared Content-Length over the cap without reading', async () => {
    const request = post(json({ question: 'q', token: 't' }), { 'content-length': '9000' });
    expect(await readRequest(request, ORIGIN)).toEqual({ ok: false });
  });
});
