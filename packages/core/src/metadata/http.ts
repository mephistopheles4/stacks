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
 * not in the catalogue. A 404 means what it says, so it is final.
 */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;
const BACKOFF_MS = 1200;

/**
 * Statuses that mean the provider refused us, not that it lacks the book.
 *
 * Final like a 404, and still no data — but **reported**, because nothing else
 * tells the two apart. Observed for real (#394): O'Reilly's search began
 * answering 401 to every unauthenticated request, and for weeks the fourth
 * provider answered nothing while every lookup read as a miss.
 */
const REFUSED = new Set([401, 403]);

/**
 * Who to name in a refusal warning, by host.
 *
 * ⚠️ **A name, never the URL.** Google Books requests carry the owner's
 * `GOOGLE_BOOKS_API_KEY` in the query string, so echoing the URL would print
 * the key into every terminal. An unlisted host is named by its hostname alone.
 */
const PROVIDERS: Readonly<Record<string, string>> = {
  'openlibrary.org': 'Open Library',
  'covers.openlibrary.org': 'Open Library',
  'www.googleapis.com': 'Google Books',
  'itunes.apple.com': 'Apple Books',
  'learning.oreilly.com': "O'Reilly",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'a provider';
  }
}

async function getWithRetry(url: string, onRefused: (status: number) => void): Promise<unknown> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

      if (response.ok) return await response.json();
      if (REFUSED.has(response.status)) {
        onRefused(response.status);
        return undefined;
      }
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
 *
 * A refusal warns once per host for the life of the reader, so a whole-vault
 * `enrich` says it once rather than once per book.
 */
export function createCachedHttpGet(cacheDir: string): HttpGet {
  const warned = new Set<string>();

  const refused = (url: string, status: number): void => {
    const host = hostOf(url);
    if (warned.has(host)) return;
    warned.add(host);
    console.warn(
      `stacks: ${PROVIDERS[host] ?? host} refused the request (HTTP ${String(status)}) — ` +
        'its lookups return nothing until that changes, and that is not "no such book"',
    );
  };

  return async (url) => {
    const key = createHash('sha256').update(url).digest('hex').slice(0, 32);
    const path = join(cacheDir, `${key}.json`);

    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      // Cache miss — fall through to the network.
    }

    const body = await getWithRetry(url, (status) => {
      refused(url, status);
    });
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
