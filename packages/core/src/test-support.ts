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
