/**
 * A provider that refuses us is reported, not read as "no such book" (#394).
 *
 * O'Reilly's search began answering 401 to every unauthenticated request, and
 * `getWithRetry` returned `undefined` for it exactly as it does for a 404 — so
 * the fourth provider answered nothing and nothing said so. A refusal still
 * yields no data, but it now warns, naming the provider.
 *
 * `vi.stubGlobal` is G21's named escape hatch: no request leaves the machine.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { createCachedHttpGet } from './http.ts';

describe('a provider refusing the request', () => {
  let cache: string;
  let warn: WarnSpy;
  let asked: number;

  function answer(status: number): void {
    asked = 0;
    vi.stubGlobal('fetch', async () => {
      asked += 1;
      return new Response('{"detail":"Authentication credentials were not provided."}', {
        status,
        headers: { 'content-type': 'application/json' },
      });
    });
  }

  beforeEach(async () => {
    cache = await mkdtemp(join(tmpdir(), 'stacks-http-'));
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    vi.unstubAllGlobals();
    await rm(cache, { recursive: true, force: true });
  });

  it.each([401, 403])(
    'warns naming the provider on a %i, and still returns nothing',
    async (status) => {
      answer(status);
      const get = createCachedHttpGet(cache);

      expect(
        await get('https://learning.oreilly.com/api/v2/search/?query=9798341674738&field=isbn'),
      ).toBeUndefined();

      expect(warn.lines).toHaveLength(1);
      expect(warn.lines[0]).toContain("O'Reilly");
      expect(warn.lines[0]).toContain(String(status));
      expect(asked, 'a refusal is final; retrying it only adds backoff').toBe(1);
      expect(await readdir(cache), 'a refusal was cached').toEqual([]);
    },
  );

  it('stays silent on a 404, which is an ordinary miss', async () => {
    answer(404);
    const get = createCachedHttpGet(cache);

    expect(await get('https://openlibrary.org/isbn/9780000000000.json')).toBeUndefined();
    expect(warn.lines).toEqual([]);
  });

  it('never prints the URL, which can carry an API key', async () => {
    answer(401);
    const get = createCachedHttpGet(cache);

    await get('https://www.googleapis.com/books/v1/volumes?q=isbn:9780000000000&key=CANARY_KEY');

    expect(warn.lines).toHaveLength(1);
    expect(warn.lines[0]).toContain('Google Books');
    expect(warn.lines[0]).not.toContain('CANARY');
    expect(warn.lines[0]).not.toContain('googleapis');
  });

  it('warns once per provider for a whole pass, not once per book', async () => {
    answer(401);
    const get = createCachedHttpGet(cache);

    await get('https://learning.oreilly.com/api/v2/search/?query=a&field=title');
    await get('https://learning.oreilly.com/api/v2/search/?query=b&field=title');
    await get('https://itunes.apple.com/search?term=c');

    expect(warn.lines).toHaveLength(2);
    expect(warn.lines[1]).toContain('Apple Books');
  });

  it('names an unknown host by its hostname alone', async () => {
    answer(403);
    const get = createCachedHttpGet(cache);

    await get('https://example.invalid/path?token=CANARY_TOKEN');

    expect(warn.lines[0]).toContain('example.invalid');
    expect(warn.lines[0]).not.toContain('CANARY');
  });
});
