/**
 * G21 — no test makes a live network call.
 *
 * `AGENTS.md`'s Phase 1 gate says "use cached API fixtures, no live calls in
 * tests", and `packages/core/src/covers/download.test.ts` opens by stating "No
 * test makes a live call". Both were prose, and both were false: for months
 * `packages/core/src/enrich.test.ts` downloaded a real cover from
 * `covers.openlibrary.org` on every run. It went unnoticed because it still
 * *passed* — the assertions never look at the cover — so the only symptom was
 * ~1.3s where its siblings cost 5ms, which read as an outlier rather than as a
 * network call, until a loaded CI runner turned it into an intermittent timeout.
 *
 * The seam that let it happen is worth naming. The metadata layer takes an
 * injected `HttpGet` precisely so tests stay off the network — but the
 * injection stops short of the bytes: `covers/cache-cover.ts`'s `download`
 * reaches for the global `fetch`, so a caller passing a fake `get` still makes a
 * real request. `enrich.ts`, `add-book.ts` and `import/index.ts` all reach it.
 *
 * **Recording the attempt is the whole design, and the throwing is not.** A
 * guard that only throws does not go red here: `download` wraps its fetch in
 * `catch { return undefined }` because a missing cover must not stop a book
 * being logged, so the refusal is swallowed, the cover is quietly dropped, and
 * every assertion still passes. That was measured, not assumed — against the
 * pre-fix `enrich.test.ts` a throw-only guard reported **7 passed**, having
 * silently converted a live network call into no evidence at all. It would have
 * made the symptom disappear and the defect permanent.
 *
 * So each attempt is recorded and asserted in an `afterEach`, where no
 * `try/catch` in the code under test can reach it. The throw stays, because it
 * keeps the call from actually leaving the machine and makes the failure land
 * near its cause; it is just not what makes the gate red.
 *
 * **What it covers is `fetch`, in this process** — which is every request this
 * repo makes, since nothing here uses `node:http` directly. Two things are
 * therefore outside it: a test that shells out to a script making its own
 * requests (`gates/deploy-branch.test.ts` really does spawn one, driven onto
 * paths that upload nothing — but that is the script's own guard, not this one),
 * and any future code that reaches the network by some other API.
 */

import { afterEach, expect } from "vitest";

/** Every URL a test tried to reach, since the last test ended. */
const attempts: string[] = [];

/** The URL, whichever of `fetch`'s three input shapes it arrived as. */
export function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Named rather than inlined so the spec can assert the advice survives, and so
 * it points at the escape hatch by name: a test that genuinely needs a response
 * stubs one, exactly as `download.test.ts` does.
 */
export function refusalMessage(url: string): string {
  return (
    `Live network call to ${url}\n` +
    "Tests must not touch the network — see docs/gates.md, row G21 (no-live-network). Stub it:\n" +
    "  vi.stubGlobal('fetch', vi.fn(async () => new Response(…)))\n" +
    "packages/core/src/covers/download.test.ts is the worked example."
  );
}

export function attemptedRequests(): readonly string[] {
  return [...attempts];
}

export function forgetAttempts(): void {
  attempts.length = 0;
}

/**
 * Records, then refuses. The recording is what the gate reads; see the note on
 * the swallowing `catch` above for why the throw cannot be trusted to surface.
 */
export const guardedFetch = ((input: unknown): Promise<Response> => {
  const url = urlOf(input);
  attempts.push(url);
  return Promise.reject(new Error(refusalMessage(url)));
}) as unknown as typeof fetch;

/**
 * Installs the guard. Called from `no-live-network.setup.ts`, which is what
 * `vitest.config.ts` lists — and **importing this module must not install
 * anything**, which is the entire reason the two are separate files.
 *
 * They were one file first, and the spec's "is the guard installed?" check was
 * vacuous because of it: the spec imports this module to compare against
 * `guardedFetch`, so a top-level `globalThis.fetch = …` here meant the import
 * did the installing and the assertion passed with `setupFiles` deleted from
 * the config. Found by running that exact mutation. With the side effect moved
 * out, `globalThis.fetch === guardedFetch` is true only if the setup file ran,
 * which is the thing worth asserting.
 */
export function installNetworkGuard(): void {
  globalThis.fetch = guardedFetch;

  afterEach(() => {
    const made = attemptedRequests();
    // Cleared before the assertion, or one live call fails every test after it.
    forgetAttempts();

    expect(
      made,
      "this test made a live network call, which is what docs/gates.md row G21 " +
        `forbids:\n${made.map((url) => refusalMessage(url)).join("\n\n")}`,
    ).toEqual([]);
  });
}
