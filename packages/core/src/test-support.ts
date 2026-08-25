import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
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

/** A silenced `console.warn`, and what was said to it. */
export interface WarnSpy {
  /** One entry per call, arguments joined with a space — the shape assertions want. */
  readonly lines: readonly string[];
  /** Puts the real `console.warn` back. Call it in `afterEach`. */
  restore(): void;
}

/**
 * Silence `console.warn` and record what it was told.
 *
 * Invariant 3 makes a warning the *product* of a bad note rather than noise, so
 * four specs spy on `console.warn` — to keep a deliberate warning out of the
 * test output, and in one case to assert which files it named.
 *
 * ⚠️ **This exists because the obvious annotation is untypeable.** All four
 * wrote `let warn: ReturnType<typeof vi.spyOn>`, which resolves to
 * `MockInstance<any>`, so `warn.mockRestore()` is an unsafe call on an unsafe
 * member access — eight lint findings, one idiom, four files. A parameterised
 * annotation is clean and so is a shared helper; the helper was chosen because
 * it is the one that every future spec inherits. See ADR-0076.
 *
 * It returns `lines` rather than the spy because the spy is not what any caller
 * wanted: three of the four ignore it entirely, and the fourth was pushing
 * `args.join(' ')` into a local array of its own.
 *
 * ⚠️ **This is the first `vitest` import in a file here that is not a `.test.ts`,
 * and it must stay unreachable from `index.ts`.** `@stacks/core`'s root export is
 * what the site imports from, and a value path from there to `vitest` would put
 * the test framework in the browser bundle — the same failure mode as the
 * `node:fs` and sharp one that "the site may only `import type`" exists for. The
 * protection today is that nothing re-exports this file and only specs import it.
 * Keep it that way.
 */
export function spyOnWarn(): WarnSpy {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });

  return {
    lines,
    restore: () => {
      spy.mockRestore();
    },
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
