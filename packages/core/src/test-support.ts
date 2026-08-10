import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HttpGet } from './metadata/http.ts';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURE_VAULT = join(REPO_ROOT, 'fixtures', 'vault');
const API_DIR = join(REPO_ROOT, 'fixtures', 'api');

export function readApiFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(API_DIR, name), 'utf8')) as unknown;
}

/**
 * An `HttpGet` backed entirely by captured responses.
 *
 * Tests must never make a live call (CLAUDE.md, phase 1 gate). This throws on
 * an unmapped URL rather than returning `undefined`, so a test that
 * accidentally reaches for the network fails loudly instead of quietly
 * exercising the not-found path and passing for the wrong reason.
 */
export function fixtureHttpGet(routes: Readonly<Record<string, string>>): HttpGet {
  return async (url: string) => {
    for (const [pattern, fixture] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return fixture === '' ? undefined : readApiFixture(fixture);
      }
    }
    throw new Error(`no fixture mapped for ${url} — tests must not hit the network`);
  };
}

/** The real ISBN whose Open Library response is captured in fixtures/api. */
export const CAPTURED_ISBN = '9781603580557';

/**
 * Whether a URL is *at* a host, rather than merely mentioning one.
 *
 * A substring test answers "does this string contain those characters", which is
 * not the question any stub or assertion here is asking —
 * `evil.com/?x=googleapis.com` satisfies it, and so does
 * `googleapis.com.example.net`. CodeQL flags it as
 * `js/incomplete-url-substring-sanitization`, eleven times and counting.
 *
 * **Not a security fix**: nothing malicious turns up in a fixture map. It is a
 * routing rule that says what it means — a stub claiming "this is the Google
 * request" should not answer one that went somewhere else whose URL happens to
 * mention Google.
 *
 * Lives here rather than in one test file because six of them had written it
 * out, which is the shape a helper is supposed to prevent.
 */
export function isHost(url: string, host: string): boolean {
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}
