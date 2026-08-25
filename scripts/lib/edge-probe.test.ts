/**
 * Asking the live origin what it is serving — the shared half of surfaces B
 * and D.
 *
 * An ordinary unit test, not a gate. It is also the first in-process oracle
 * this check has ever had: the probe lived inside `scripts/deploy.ts`, whose
 * only oracle drives it as a child process, so no test could ever watch it
 * decide *refused* rather than *stale*. That distinction is the one
 * [ADR-0027](../../docs/adr/0027-deploy-check-reports-refusal.md) exists for.
 *
 * ⚠️ **`fetch` is stubbed, never called.** G21 replaces the global with one
 * that records and refuses; `vi.stubGlobal` is its documented escape hatch, and
 * nothing here reaches the network or the filesystem.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeStaleCover,
  probeBuild,
  probeCovers,
  stampMeta,
  stampOf,
} from './edge-probe.ts';

const ORIGIN = 'https://stacks.example';
const STAMP = 'a1b2c3d4e5f6';

/**
 * A page as the origin would serve it, stamped or not.
 *
 * Built with `stampMeta` rather than by hand: the writer and the reader are two
 * halves of one contract, and a fixture that spells the tag itself would keep
 * passing while a deploy stamped something this could no longer find.
 */
function page(stamp?: string): string {
  const meta = stamp === undefined ? '' : stampMeta(stamp);
  return `<!doctype html><html><head>${meta}</head><body></body></html>`;
}

function ok(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

function refusal(status: number): Response {
  return { ok: false, status, text: async () => 'just a moment…' } as unknown as Response;
}

/** Answers each call from the list, then repeats the last one forever. */
function answering(responses: readonly (Response | Error)[]): typeof fetch {
  let at = -1;
  return vi.fn(async () => {
    at = Math.min(at + 1, responses.length - 1);
    const next = responses[at];
    if (next instanceof Error) throw next;
    return next as Response;
  });
}

const QUICK = { attempts: 3, waitMs: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stampOf', () => {
  it('reads the build a page says it is', () => {
    expect(stampOf(page(STAMP))).toBe(STAMP);
  });

  it('says nothing about a page that says nothing', () => {
    expect(stampOf(page())).toBeUndefined();
  });

  it('reads back exactly what the deploy writes', () => {
    // The round trip, held by a test rather than by two functions sitting near
    // each other. A stamp that cannot be read back makes the live check blind
    // and says so nowhere.
    expect(stampOf(`<head>${stampMeta('0123456789ab')}</head>`)).toBe('0123456789ab');
  });
});

describe('describeStaleCover', () => {
  it('names the cover, what is served, and what was built', () => {
    // One line, two readers: a deploy prints purge advice around it and a sync
    // does not. The finding itself has to say the same thing in both.
    expect(describeStaleCover({ cover: 'covers/x.png', served: 0, built: 619 })).toBe(
      'covers/x.png: serving 0B, built 619B',
    );
  });
});

describe('probeBuild', () => {
  it('reports current the moment the origin agrees', async () => {
    const fetcher = answering([ok(page(STAMP))]);
    vi.stubGlobal('fetch', fetcher);

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({ kind: 'current', serving: STAMP });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('waits out the edge before calling a different build stale', async () => {
    // A deploy is not live the instant wrangler returns. Reporting on the
    // first look would cry wolf on every deploy, which is the fastest way to
    // make a check ignored.
    vi.stubGlobal('fetch', answering([ok(page('9f9f9f9f9f9f')), ok(page(STAMP))]));

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({ kind: 'current', serving: STAMP });
  });

  it('reports stale when it never agrees', async () => {
    vi.stubGlobal('fetch', answering([ok(page('9f9f9f9f9f9f'))]));

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({
      kind: 'stale',
      serving: '9f9f9f9f9f9f',
    });
  });

  it('reports stale with no build name when the page carries no stamp', async () => {
    vi.stubGlobal('fetch', answering([ok(page())]));

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({ kind: 'stale', serving: undefined });
  });

  it('reports refused only after every retry, never on the first', async () => {
    // Watched through the owner allowing "definitely automated" traffic,
    // identical requests disagreed — 403 about one time in six for a few
    // minutes. A single refusal is not evidence of a standing one.
    const fetcher = answering([refusal(403)]);
    vi.stubGlobal('fetch', fetcher);

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({ kind: 'refused', status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('takes a later answer over an earlier refusal', async () => {
    vi.stubGlobal('fetch', answering([refusal(403), ok(page(STAMP))]));

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({ kind: 'current', serving: STAMP });
  });

  it('reports unreachable at once when the request cannot be made', async () => {
    // Not a refusal: nothing answered at all. Retrying a DNS failure six more
    // times only delays the same nothing.
    const fetcher = answering([new TypeError('fetch failed')]);
    vi.stubGlobal('fetch', fetcher);

    expect(await probeBuild(ORIGIN, STAMP, QUICK)).toEqual({ kind: 'unreachable' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('tells the caller about each retry, so a long wait is not a silent one', async () => {
    const said: string[] = [];
    vi.stubGlobal('fetch', answering([refusal(403)]));

    await probeBuild(ORIGIN, STAMP, { ...QUICK, onRetry: (message) => said.push(message) });

    expect(said).toHaveLength(2);
    expect(said[0]).toContain('403');
  });
});

describe('probeCovers', () => {
  function head(sizes: Record<string, number | 'refused' | 'gone'>): typeof fetch {
    return vi.fn(async (url: string | URL) => {
      const cover = String(url).slice(`${ORIGIN}/`.length);
      const answer = sizes[cover];
      if (answer === 'gone') throw new TypeError('fetch failed');
      if (answer === 'refused' || answer === undefined) {
        return { ok: false, status: 403 } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': String(answer) }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it('names every cover served at a size the build did not produce', async () => {
    // Every cover, not a sample: most are byte-identical between builds, so a
    // sample of five is very likely to land entirely on files that match
    // either way and report a clean site that is not.
    vi.stubGlobal('fetch', head({ 'covers/one.jpg': 100, 'covers/two.jpg': 99 }));

    expect(
      await probeCovers(
        ORIGIN,
        new Map([
          ['covers/one.jpg', 100],
          ['covers/two.jpg', 100],
        ]),
      ),
    ).toEqual({
      kind: 'checked',
      checked: 2,
      stale: [{ cover: 'covers/two.jpg', served: 99, built: 100 }],
      uncomparable: [],
    });
  });

  it('counts an answer with no content-length as uncomparable, never as 0 bytes', async () => {
    // Measured against the live origin: a HEAD for a path this build does not
    // have answers **200 with no content-length**, and reading that as zero
    // reported six of six covers stale when none of them exists there at all.
    // Dropping them instead would be the opposite error — a genuinely missing
    // cover would pass — so they are counted and named.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, headers: new Headers() }) as unknown as Response),
    );

    expect(await probeCovers(ORIGIN, new Map([['covers/one.jpg', 619]]))).toEqual({
      kind: 'checked',
      checked: 1,
      stale: [],
      uncomparable: ['covers/one.jpg'],
    });
  });

  it('reports a refusal rather than reading a challenge page as a byte mismatch', async () => {
    // A challenge page has a content-length like anything else, and comparing
    // it against the cover's size reports a stale cache — which sends you to
    // purge a zone that was never the problem.
    vi.stubGlobal('fetch', head({ 'covers/one.jpg': 'refused' }));

    expect(await probeCovers(ORIGIN, new Map([['covers/one.jpg', 100]]))).toEqual({
      kind: 'refused',
      status: 403,
    });
  });

  it('reports unreachable when the origin answers nothing', async () => {
    vi.stubGlobal('fetch', head({ 'covers/one.jpg': 'gone' }));

    expect(await probeCovers(ORIGIN, new Map([['covers/one.jpg', 100]]))).toEqual({
      kind: 'unreachable',
    });
  });

  it('checks nothing when there is nothing to check', async () => {
    vi.stubGlobal('fetch', head({}));

    expect(await probeCovers(ORIGIN, new Map())).toEqual({
      kind: 'checked',
      checked: 0,
      stale: [],
      uncomparable: [],
    });
  });
});
