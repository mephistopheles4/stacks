import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * One GET, returning parsed JSON, or `undefined` when the response is unusable
 * for any reason — network failure, non-2xx, unparseable body.
 *
 * Everything that talks to an API takes this as an argument rather than calling
 * `fetch` itself. That is the seam the tests use: they pass a reader backed by
 * captured fixtures, so no test ever makes a live call.
 */
export type HttpGet = (url: string) => Promise<unknown | undefined>;

const USER_AGENT = 'stacks/0.0 (personal reading tracker)';

/**
 * A reader that caches every response on disk under `.cache/`.
 *
 * Rebuilds and repeated `stacks add` runs must not re-hit the APIs — Open
 * Library is a volunteer-run service and Google Books rate-limits hard.
 */
export function createCachedHttpGet(cacheDir: string): HttpGet {
  return async (url) => {
    const key = createHash('sha256').update(url).digest('hex').slice(0, 32);
    const path = join(cacheDir, `${key}.json`);

    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      // Cache miss — fall through to the network.
    }

    let body: unknown;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) return undefined;
      body = await response.json();
    } catch {
      return undefined;
    }

    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(path, JSON.stringify(body), 'utf8');
    } catch {
      // A cache we cannot write is a slower tool, not a broken one.
    }

    return body;
  };
}
