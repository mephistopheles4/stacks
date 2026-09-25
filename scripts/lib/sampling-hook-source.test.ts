/**
 * The page hook as a page gets it: a string, run as a script.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`. What the hook *does* is
 * specced in `sampling-hook.test.ts`, which calls the function; this proves
 * only that the serialised source still runs where none of the module's scope
 * reaches it — so a body that quietly closed over an import passes there and
 * fails here.
 *
 * ⚠️ **It cannot run inside Stryker's sandbox, and `vitest.stryker.config.ts`
 * leaves it out.** Stryker rewrites every mutant site in the hook's body into a
 * call to a module-level `stryMutAct_*` helper, which the serialised string
 * cannot reach: measured, the dry run failed on `stryMutAct_9fa48 is not
 * defined` and took the whole mutation run with it. It is `tsx`'s `__name`
 * again, from a second tool. ⚠️ **Nor can it prove the `tsx` half** — Vitest's
 * transform need not inject `__name` — which the CI run of `pnpm smoke:render`
 * proves: a hook that throws never reports itself, and G61's first clause says
 * so.
 */

import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { samplingHookSource } from './sampling-hook.ts';
import type { SamplingSnapshot } from './shadow-sampling.ts';

/** The least of a WebGL context a draw can be counted on. */
class FakeGl {
  isContextLost(): boolean {
    return false;
  }
  drawArrays(..._args: unknown[]): void {}
}

beforeEach(() => {
  vi.stubGlobal('WebGL2RenderingContext', class extends FakeGl {});
  vi.stubGlobal('WebGLRenderingContext', undefined);
  vi.stubGlobal('requestAnimationFrame', () => 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__samplingHook');
});

describe('samplingHookSource — the string a page runs', () => {
  it('defines the helper tsx makes the body call, before the body', () => {
    expect(samplingHookSource().startsWith('{ const __name = (target) => target;')).toBe(true);
  });

  it('runs as a script, reports itself and counts a draw', () => {
    const before = '__name' in globalThis;
    runInThisContext(samplingHookSource());

    const hook = (globalThis as unknown as { __samplingHook: { read(): SamplingSnapshot } })
      .__samplingHook;
    const Gl = (globalThis as unknown as { WebGL2RenderingContext: typeof FakeGl })
      .WebGL2RenderingContext;
    new Gl().drawArrays();

    expect(hook.read().version).toBe(1);
    expect(hook.read().frames.at(-1)?.calls).toBe(1);
    // Nothing leaks into the page's globals but the hook itself.
    expect('__name' in globalThis).toBe(before);
  });
});
