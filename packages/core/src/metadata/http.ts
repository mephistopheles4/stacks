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
 *
 * ⚠️ **`unknown`, not `unknown | undefined`.** `unknown` already admits
 * `undefined`, so the union constrained nothing and read as though it did — the
 * "or `undefined`" above is the whole contract, and it lives in this sentence
 * because there is no type that can carry it.
 */
export type HttpGet = (url: string) => Promise<unknown>;

const USER_AGENT = 'stacks/0.0 (personal reading tracker)';

/**
 * Statuses worth trying again.
 *
 * Observed for real: Google Books answered 503 for two of three queries and
 * then answered both on retry. Without this, a blip is indistinguishable from
 * "no such book" — the tool reports nothing found and you conclude the book is
 * not in the catalogue. A 404 or a 403 means what it says, so those are final.
 */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;
const BACKOFF_MS = 1200;

async function getWithRetry(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

      if (response.ok) return await response.json();
      if (!TRANSIENT.has(response.status) || attempt === ATTEMPTS) return undefined;
    } catch {
      // A dropped connection is transient too; fall through to the wait.
      if (attempt === ATTEMPTS) return undefined;
    }

    await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * attempt));
  }
  return undefined;
}

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

    const body = await getWithRetry(url);
    if (body === undefined) return undefined;

    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(path, JSON.stringify(body), 'utf8');
    } catch {
      // A cache we cannot write is a slower tool, not a broken one.
    }

    return body;
  };
}
