/**
 * G21's own spec — proof that the guard is installed and that it records.
 *
 * A guard that was never wired up records nothing, and a suite that makes no
 * network calls also records nothing. Those two look identical from the outside,
 * which is the vacuous green this repo has been caught by before, so the checks
 * below assert against the **global** `fetch` rather than against the exported
 * helper: calling the helper directly would prove the bookkeeping works while
 * saying nothing about whether anything uses it.
 *
 * Each test that provokes the guard clears the record before it ends, otherwise
 * the `afterEach` in `no-live-network.ts` fails the very test demonstrating it.
 * That hook runs after this file's own hooks and after every test body, so
 * clearing inside the test is enough.
 *
 * See docs/gates.md, row G21 (no-live-network).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attemptedRequests,
  forgetAttempts,
  guardedFetch,
  refusalMessage,
  urlOf,
} from './no-live-network.ts';

const SOMEWHERE = 'https://covers.openlibrary.org/b/isbn/9781603580557-L.jpg';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('G21 — the guard is actually installed', () => {
  it('has replaced the global fetch, not merely defined a replacement', () => {
    // The check that fails if `setupFiles` is dropped from vitest.config.ts,
    // which is the one mutation that makes every other assertion here vacuous.
    expect(
      globalThis.fetch,
      'globalThis.fetch is not the guard — is gates/no-live-network.setup.ts ' +
        "still in vitest.config.ts's setupFiles?",
    ).toBe(guardedFetch);
  });

  it('records the URL a test tried to reach, and refuses it', async () => {
    await expect(globalThis.fetch(SOMEWHERE)).rejects.toThrow(SOMEWHERE);

    expect(attemptedRequests()).toEqual([SOMEWHERE]);
    forgetAttempts();
  });

  it('records an attempt even when the code under test swallows the refusal', async () => {
    // The reason the record exists at all. `covers/cache-cover.ts`'s `download`
    // is exactly this shape — every failure is "no cover" by design — so a
    // guard that only threw would leave a live call invisible and the test
    // green. Measured against the pre-fix enrich.test.ts: 7 passed.
    const swallowing = async (): Promise<undefined> => {
      try {
        await globalThis.fetch(SOMEWHERE);
        return undefined;
      } catch {
        return undefined;
      }
    };

    await expect(swallowing()).resolves.toBeUndefined();

    expect(
      attemptedRequests(),
      'the attempt must survive a catch in the code under test — that is the ' +
        'whole difference between this gate and one that only throws',
    ).toEqual([SOMEWHERE]);
    forgetAttempts();
  });

  it('leaves a stubbed fetch alone, which is the documented escape hatch', async () => {
    // A test that genuinely needs a response stubs one. The guard must not see
    // those calls, or every legitimate stub would report itself as a live call.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok')),
    );

    expect(await (await globalThis.fetch(SOMEWHERE)).text()).toBe('ok');
    expect(attemptedRequests()).toEqual([]);
  });

  it('comes back after vi.unstubAllGlobals, so the next test is guarded again', () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(globalThis.fetch).not.toBe(guardedFetch);

    vi.unstubAllGlobals();
    expect(globalThis.fetch).toBe(guardedFetch);
  });
});

describe('G21 — what the failure tells you', () => {
  it('names the URL and the escape hatch, since the message is the whole fix', () => {
    const message = refusalMessage(SOMEWHERE);

    expect(message).toContain(SOMEWHERE);
    expect(message).toContain('vi.stubGlobal');
    expect(message).toContain('G21');
  });

  it('reads the URL out of every shape fetch accepts', () => {
    // A Request or a URL stringifies to something unhelpful ("[object Request]")
    // if nobody unwraps it, and an unnamed URL is a failure nobody can act on.
    expect(urlOf(SOMEWHERE)).toBe(SOMEWHERE);
    expect(urlOf(new URL(SOMEWHERE))).toBe(SOMEWHERE);
    expect(urlOf(new Request(SOMEWHERE))).toBe(SOMEWHERE);
  });
});
