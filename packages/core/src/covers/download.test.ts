import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { download, looksLikeImage } from './cache-cover.ts';

/**
 * G18 — hostile bytes from a metadata provider.
 *
 * `download` fetches a URL that came out of a third-party API response and
 * hands the result to `sharp`, a native decoder. Until this existed there was
 * no timeout, no size limit and no check that the bytes were an image at all:
 * `arrayBuffer()` buffered whatever arrived, however much of it arrived, and
 * passed it straight in. SECURITY.md listed that as a known gap.
 *
 * Every case here is a way the response can be wrong while still being a
 * perfectly ordinary HTTP 200 — which is the only interesting kind, since a
 * 404 was already handled.
 *
 * No test makes a live call: `fetch` is stubbed, and each stub is the shape of
 * a real answer rather than a convenient one.
 */

const URL_UNDER_TEST = 'https://covers.example.test/the-tidal-engine.jpg';

/** A response with a body stream, as `fetch` actually returns one. */
function respondWith(
  body: Uint8Array | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  const stream =
    body instanceof ReadableStream
      ? body
      : new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(body);
            controller.close();
          },
        });

  return new Response(stream, { status, headers });
}

function stubFetch(response: Response | (() => Promise<Response>)): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(typeof response === 'function' ? response : async () => response),
  );
}

/** A real cover: big enough to clear the placeholder floor, and truly a JPEG. */
async function realCover(): Promise<Buffer> {
  return await sharp({
    create: { width: 400, height: 600, channels: 3, background: '#2f6d7a' },
  })
    .jpeg()
    .toBuffer();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('G18 — download refuses what it should not decode', () => {
  it('accepts an ordinary cover', async () => {
    const cover = await realCover();
    stubFetch(respondWith(cover, { 'content-type': 'image/jpeg' }));

    const bytes = await download(URL_UNDER_TEST);

    // Without this the whole suite could pass by refusing everything.
    expect(bytes).toBeDefined();
    expect(bytes?.length).toBe(cover.length);
  });

  it('accepts a cover whose server sent no content-type at all', async () => {
    // Some CDNs omit it. The magic-byte check is what decides, so an absent
    // header must not cost a legitimate cover.
    stubFetch(respondWith(await realCover()));

    expect(await download(URL_UNDER_TEST)).toBeDefined();
  });

  it('refuses an error page served with HTTP 200', async () => {
    const html = Buffer.from(`<!doctype html><title>Not found</title>${'x'.repeat(2000)}`);
    stubFetch(respondWith(html, { 'content-type': 'text/html; charset=utf-8' }));

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
  });

  it('refuses non-image bytes even when the header claims an image', async () => {
    // The header is the server's claim; the bytes are the thing sharp parses.
    const html = Buffer.from(`<!doctype html><title>Nope</title>${'x'.repeat(2000)}`);
    stubFetch(respondWith(html, { 'content-type': 'image/jpeg' }));

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
  });

  it('refuses an SVG, which sharp would otherwise happily rasterise', async () => {
    // Not an image but a document, with its own parser and its own rules about
    // external references. It is the reason the check is an allowlist.
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">${'<!-- pad -->'.repeat(200)}</svg>`,
    );
    stubFetch(respondWith(svg, { 'content-type': 'image/svg+xml' }));

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
  });

  it('refuses a declared length over the cap without reading the body', async () => {
    let bodyWasRead = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyWasRead = true;
          controller.close();
        },
      },
      // A default stream pulls once the moment it is constructed, to fill a
      // queue of one — which would make this flag measure the test's own
      // scaffolding rather than `download`. At zero, nothing is pulled until
      // something actually reads.
      { highWaterMark: 0 },
    );
    stubFetch(
      respondWith(stream, {
        'content-type': 'image/jpeg',
        'content-length': String(64 * 1024 * 1024),
      }),
    );

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
    expect(bodyWasRead, 'body should not be transferred once the header disqualifies it').toBe(
      false,
    );
  });

  it('stops a response that runs past the cap while claiming to be small', async () => {
    // Content-Length is a claim: absent under chunked encoding, and free to
    // lie. The stream is what makes the cap a limit rather than a request.
    const megabyte = new Uint8Array(1024 * 1024);
    megabyte.set([0xff, 0xd8, 0xff]); // a plausible JPEG opening, so only size decides
    let chunksServed = 0;

    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksServed += 1;
        controller.enqueue(megabyte);
      },
    });
    stubFetch(respondWith(endless, { 'content-type': 'image/jpeg', 'content-length': '4096' }));

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
    // Bounded, and bounded near the cap rather than at some accidental point.
    expect(chunksServed).toBeLessThanOrEqual(25);
    expect(chunksServed).toBeGreaterThan(15);
  });

  it('gives up on a socket that opens and then says nothing', async () => {
    vi.useFakeTimers();
    stubFetch(
      async (...args: unknown[]) =>
        await new Promise<Response>((_resolve, reject) => {
          const init = args[1] as { signal: AbortSignal };
          init.signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    const pending = download(URL_UNDER_TEST);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await pending).toBeUndefined();
  });

  it('still refuses the tiny placeholder Open Library serves for "no cover"', async () => {
    const tiny = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(500)]);
    stubFetch(respondWith(tiny, { 'content-type': 'image/jpeg' }));

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
  });

  it('refuses a non-2xx response', async () => {
    stubFetch(respondWith(await realCover(), { 'content-type': 'image/jpeg' }, 404));

    expect(await download(URL_UNDER_TEST)).toBeUndefined();
  });

  it('passes an abort signal to fetch, so the timeout is wired to the request', async () => {
    const cover = await realCover();
    stubFetch(respondWith(cover, { 'content-type': 'image/jpeg' }));

    await download(URL_UNDER_TEST);

    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('looksLikeImage', () => {
  it('recognises the three formats a cover arrives as', async () => {
    const base = sharp({
      create: { width: 40, height: 60, channels: 3, background: '#804020' },
    });

    expect(looksLikeImage(await base.clone().jpeg().toBuffer())).toBe(true);
    expect(looksLikeImage(await base.clone().png().toBuffer())).toBe(true);
    expect(looksLikeImage(await base.clone().webp().toBuffer())).toBe(true);
  });

  it('refuses anything shorter than a signature', async () => {
    expect(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(looksLikeImage(Buffer.alloc(0))).toBe(false);
  });

  it('refuses a RIFF container that is not WebP', async () => {
    // A .wav is RIFF too; only the second tag separates them.
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);

    expect(looksLikeImage(wav)).toBe(false);
  });
});
