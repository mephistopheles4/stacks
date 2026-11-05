import { describe, expect, it, vi } from 'vitest';
import { UNAVAILABLE, answerWith, askLibrary, readReply, unavailable } from './client.ts';

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const html = (status: number): Response =>
  new Response('<html>blocked</html>', { status, headers: { 'content-type': 'text/html' } });
const via = (response: () => Response | Promise<Response>): typeof fetch =>
  vi.fn(async () => response());

describe('askLibrary (C4: the drawer text for every row)', () => {
  it('posts the question and token as JSON to /api/chat, with no credentials or referrer', async () => {
    const spy = vi.fn(async () => json({ mode: 'ai', answer: 'Hi', books: [] }));
    await askLibrary('q?', 'tok', [], spy);
    const call = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('/api/chat');
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toBe(JSON.stringify({ question: 'q?', token: 'tok' }));
    expect(call[1].credentials).toBe('omit');
    expect(call[1].referrerPolicy).toBe('no-referrer');
  });

  it('sends earlier exchanges as history, and omits the key when there are none', async () => {
    const spy = vi.fn(async () => json({ mode: 'ai', answer: 'Hi', books: [] }));
    const earlier = [{ question: 'What about Nexus?', answer: 'I liked it.' }];
    await askLibrary('and?', 'tok', earlier, spy);
    const call = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toEqual({
      question: 'and?',
      token: 'tok',
      history: earlier,
    });
  });

  const sent = {
    ai: 'I read it.',
    search: 'These match.',
    limited: "That's the limit.",
    error: 'Reload.',
  } as const;

  it.each([
    ['an AI answer', json({ mode: 'ai', answer: 'I read it.', books: [] }), 'ai'],
    ['a search answer', json({ mode: 'search', answer: 'These match.', books: [] }), 'search'],
    [
      'the limit',
      json({ mode: 'limited', answer: "That's the limit.", books: [] }, 429),
      'limited',
    ],
    ['an error', json({ mode: 'error', answer: 'Reload.', books: [] }, 403), 'error'],
  ])("shows the Worker's own words for %s", async (_n, response, mode) => {
    const result = await askLibrary(
      'q',
      't',
      [],
      via(() => response),
    );
    expect(result.mode).toBe(mode);
    expect(result.answer).toBe(sent[mode as 'ai' | 'search' | 'limited' | 'error']);
    expect(result.answer).not.toBe(UNAVAILABLE);
  });

  it.each([
    ['a WAF block page', () => html(403)],
    ['a non-JSON 429', () => html(429)],
    ['error 1027 as plain text', () => new Response('error code: 1027', { status: 429 })],
    ['a 404 with no route', () => html(404)],
    ['a network failure', () => Promise.reject(new Error('offline'))],
    ["JSON that is not the Worker's shape", () => json({ hello: 'world' })],
    ['a JSON reply that is not an object', () => json('text')],
    ['an unknown mode', () => json({ mode: 'weird', answer: 'x', books: [] })],
    ['an empty answer', () => json({ mode: 'ai', answer: '', books: [] })],
    [
      'a body that is not valid JSON',
      () => new Response('{bad', { headers: { 'content-type': 'application/json' } }),
    ],
  ])('turns %s into the one unavailable message', async (_n, response) => {
    const result = await askLibrary('q', 't', [], via(response));
    expect(result).toEqual({ mode: 'unavailable', answer: UNAVAILABLE, books: [], followUps: [] });
  });
});

describe('readReply', () => {
  it("keeps only S6's fields and well-formed books, at most 6", () => {
    const books = Array.from({ length: 9 }, (_, i) => ({
      id: `b-${String(i)}`,
      title: `T${String(i)}`,
      author: 'A',
      hasThoughts: i === 0,
      extra: '<script>',
    }));
    const result = readReply({ mode: 'ai', answer: 'x', books, secret: 'no', usage: 1 });
    expect(Object.keys(result).sort()).toEqual(['answer', 'books', 'followUps', 'mode']);
    expect(result.books).toHaveLength(6);
    expect(Object.keys(result.books[0]!).sort()).toEqual(['author', 'hasThoughts', 'id', 'title']);
  });

  it('drops a book with an id that is not a slug, so no link can carry markup', () => {
    const result = readReply({
      mode: 'ai',
      answer: 'x',
      books: [{ id: '"><img src=x>', title: 'Evil' }, { id: 'ok', title: 'Fine' }, null, 'str'],
    });
    expect(result.books.map((b) => b.id)).toEqual(['ok']);
  });

  it('carries markup in an answer through unchanged, for textContent to show as text', () => {
    const result = readReply({ mode: 'ai', answer: '<b>bold</b> & <script>x</script>', books: [] });
    expect(result.answer).toBe('<b>bold</b> & <script>x</script>');
  });
});

describe('follow-ups in a reply (S6, C4, C15)', () => {
  const reply = (followUps: unknown) =>
    readReply({ mode: 'ai', answer: 'x', books: [], followUps });

  it('keeps plain short questions, at most 2', () => {
    expect(
      reply([
        'What did you think of Nexus?',
        'What did you think of Sapiens?',
        'What did you think of Homo Deus?',
      ]).followUps,
    ).toEqual(['What did you think of Nexus?', 'What did you think of Sapiens?']);
  });

  it.each([
    ['missing', undefined],
    ['not a list', 'What about Nexus?'],
    ['non-strings', [1, null, {}]],
  ])('gives none when it is %s, and keeps the answer', (_n, value) => {
    const r = reply(value);
    expect(r.followUps).toEqual([]);
    expect(r.answer).toBe('x');
  });

  it('drops a URL, markup, a missing question mark and an oversized line, keeping the rest', () => {
    const r = reply([
      'See https://evil.example now?',
      'What about <b>Nexus</b>?',
      'Tell me about Nexus.',
      `${'x'.repeat(130)}?`,
      'What did you think of Nexus?',
    ]);
    expect(r.followUps).toEqual(['What did you think of Nexus?']);
  });

  it('is empty for every non-AI shape and for the unavailable message', () => {
    expect(unavailable.followUps).toEqual([]);
    expect(readReply({ mode: 'search', answer: 'x', books: [] }).followUps).toEqual([]);
  });
});

describe('answerWith: a step that throws is the unavailable reply (CodeRabbit)', () => {
  const ok = { mode: 'ai', answer: 'Hi', books: [], followUps: [] } as const;

  it('sends with the token when there is one', async () => {
    const send = vi.fn(async () => ok);
    expect(await answerWith(async () => 'tok', send)).toBe(ok);
    expect(send).toHaveBeenCalledWith('tok');
  });

  it('is unavailable, and sends nothing, when there is no token', async () => {
    const send = vi.fn(async () => ok);
    expect(await answerWith(async () => undefined, send)).toBe(unavailable);
    expect(send).not.toHaveBeenCalled();
  });

  it('is unavailable when getting the token rejects, as the Turnstile script can make it', async () => {
    const send = vi.fn(async () => ok);
    const rejects = async (): Promise<string | undefined> => {
      throw new Error('script threw');
    };
    expect(await answerWith(rejects, send)).toBe(unavailable);
    expect(send).not.toHaveBeenCalled();
  });

  it('is unavailable when the send rejects', async () => {
    const boom = async (): Promise<typeof ok> => {
      throw new Error('boom');
    };
    expect(await answerWith(async () => 'tok', boom)).toBe(unavailable);
  });
});
