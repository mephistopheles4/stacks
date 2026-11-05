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
    expect(r).toEqual({ ok: true, question: 'hi', token: 't', history: [] });
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

describe('readRequest: history (memory spec D4, C22)', () => {
  const ex = (q = 'What did you think of Nexus?', a = 'I liked it.') => ({
    question: q,
    answer: a,
  });
  const withHistory = (history: unknown): Request =>
    post(json({ question: 'and the other one?', token: 't', history }));

  it('accepts none, an empty list, one and two exchanges, keeping only the two fields', async () => {
    expect((await readRequest(withHistory(undefined), ORIGIN)).ok).toBe(true);
    const two = await readRequest(
      withHistory([ex(), { ...ex('Why?', 'Because.'), extra: 'x' }]),
      ORIGIN,
    );
    expect(two).toEqual({
      ok: true,
      question: 'and the other one?',
      token: 't',
      history: [ex(), ex('Why?', 'Because.')],
    });
    expect((await readRequest(withHistory([]), ORIGIN)).ok).toBe(true);
  });

  it('accepts exactly 300 and 600 characters', async () => {
    const r = await readRequest(withHistory([ex('q'.repeat(300), 'a'.repeat(600))]), ORIGIN);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['three exchanges', [ex(), ex(), ex()]],
    ['a 301-character question', [ex('q'.repeat(301))]],
    ['a 601-character answer', [ex('q', 'a'.repeat(601))]],
    ['an empty answer', [ex('q', '  ')]],
    ['an empty question', [ex('', 'a')]],
    ['a missing answer', [{ question: 'q' }]],
    ['a non-string answer', [{ question: 'q', answer: 4 }]],
    ['a string instead of a list', 'earlier'],
    ['null', null],
    ['an object instead of a list', { question: 'q', answer: 'a' }],
    ['a list of strings', ['q', 'a']],
    ['a null entry', [null]],
  ])('refuses %s', async (_name, history) => {
    expect(await readRequest(withHistory(history), ORIGIN)).toEqual({ ok: false });
  });
});
