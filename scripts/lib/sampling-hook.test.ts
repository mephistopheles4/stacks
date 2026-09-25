/**
 * The page hook G60 installs, run in Node against a fake WebGL prototype.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`.
 *
 * ⚠️ **It runs the serialised source, not the function.** The page gets a
 * string, so the string is what is under test: `samplingHookSource()` is run
 * as a script with `node:vm`, the way a page runs it, in a scope that has none
 * of this module's imports. ⚠️ **What this cannot prove is the `tsx` half** — Vitest's transform
 * need not inject the `__name` helper that `tsx`'s `keepNames` does, so a stale
 * shim can pass here. The CI run of `pnpm smoke:render` proves that half: a hook
 * that throws never reports itself, and G60's first clause says so.
 */

import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { samplingHookSource } from './sampling-hook.ts';
import type { SamplingSnapshot } from './shadow-sampling.ts';

const SAMPLER_2D = 0x8b5e;
const SAMPLER_2D_SHADOW = 0x8b62;

interface FakeProgram {
  readonly linked: boolean;
  readonly uniforms: readonly { readonly name: string; readonly type: number }[];
  readonly fragment: string;
}

/** Three's prefix and the part of the body a shadow sampler lives in, cut down. */
const LIT = [
  '#version 300 es',
  '#define SHADER_TYPE MeshStandardMaterial',
  '#define USE_SHADOWMAP',
  '#ifdef USE_SHADOWMAP',
  '\tuniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];',
  '#endif',
].join('\n');

/** A painted plane: the renderer's define arrives, and no shadow chunk does. */
const BASIC = [
  '#version 300 es',
  '#define SHADER_TYPE MeshBasicMaterial',
  '#define USE_SHADOWMAP',
  'uniform sampler2D map;',
].join('\n');

/** A book part since ADR-0088: the same body, with the fetch taken out at compile time. */
const UNDEFINED = [
  '#version 300 es',
  '#define SHADER_TYPE MeshStandardMaterial',
  '#define USE_SHADOWMAP',
  '#undef USE_SHADOWMAP',
  '#ifdef USE_SHADOWMAP',
  '\tuniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];',
  '#endif',
].join('\n');

const DEPTH = ['#version 300 es', '#define SHADER_TYPE MeshDepthMaterial'].join('\n');

const program = (
  fragment: string,
  uniforms: FakeProgram['uniforms'],
  linked = true,
): FakeProgram => ({ linked, uniforms, fragment });

const sampling = (): FakeProgram =>
  program(LIT, [
    { name: 'map', type: SAMPLER_2D },
    { name: 'directionalShadowMap[0]', type: SAMPLER_2D_SHADOW },
  ]);
const basic = (): FakeProgram => program(BASIC, [{ name: 'map', type: SAMPLER_2D }]);
const undefinedFetch = (): FakeProgram => program(UNDEFINED, [{ name: 'map', type: SAMPLER_2D }]);
const depth = (): FakeProgram => program(DEPTH, []);

/** A multi-draw extension, the way a browser hands one out: an object with methods. */
class FakeMultiDraw {
  multiDrawElementsWEBGL(..._args: unknown[]): void {}
  multiDrawArraysInstancedWEBGL(..._args: unknown[]): void {}
}

/**
 * Just enough of `WebGL2RenderingContext` for the hook: it reads a program's
 * link status, active uniforms and fragment source, and draws.
 */
class FakeGl {
  lost = false;
  readonly multiDraw = new FakeMultiDraw();

  isContextLost(): boolean {
    return this.lost;
  }
  getProgramParameter(target: FakeProgram, parameter: number): unknown {
    if (this.lost) return null;
    if (parameter === 0x8b82) return target.linked;
    if (parameter === 0x8b86) return target.uniforms.length;
    return null;
  }
  getActiveUniform(target: FakeProgram, index: number): { name: string; type: number } | null {
    return target.uniforms[index] ?? null;
  }
  getAttachedShaders(target: FakeProgram): { fragment: string }[] {
    // A vertex shader first, as three attaches them, so the hook has to look.
    return [{ fragment: '' }, { fragment: target.fragment }];
  }
  getShaderParameter(shader: { fragment: string }, parameter: number): unknown {
    if (parameter !== 0x8b4f) return null;
    return shader.fragment === '' ? 0x8b31 : 0x8b30;
  }
  getShaderSource(shader: { fragment: string }): string {
    return shader.fragment;
  }
  getExtension(name: string): unknown {
    return name === 'WEBGL_multi_draw' ? this.multiDraw : null;
  }
  linkProgram(_target: FakeProgram): void {}
  useProgram(_target: FakeProgram | null): void {}
  drawArrays(..._args: unknown[]): void {}
  drawElements(..._args: unknown[]): void {}
  drawArraysInstanced(..._args: unknown[]): void {}
}

/** Animation frames, run by hand: every queued callback, with one timestamp. */
function frames(): {
  request: (callback: (time: number) => void) => number;
  run: (time: number) => void;
} {
  let queue: ((time: number) => void)[] = [];
  return {
    request: (callback) => {
      queue.push(callback);
      return queue.length;
    },
    run: (time) => {
      const due = queue;
      queue = [];
      for (const callback of due) callback(time);
    },
  };
}

interface Hook {
  read(): SamplingSnapshot;
  settledFor(): number;
}

let clock: ReturnType<typeof frames>;
/** A fresh subclass per test, so each install wraps a prototype nobody wrapped before. */
let Gl: typeof FakeGl;
const shelf = { ready: true };

function install(): Hook {
  // The string the page gets, run as a script — as `evaluateOnNewDocument`
  // runs it — where none of this file's scope reaches it.
  runInThisContext(samplingHookSource());
  return (globalThis as unknown as { __samplingHook: Hook }).__samplingHook;
}

/** Links and uses a program, the way three does before its first draw with it. */
function use(gl: FakeGl, target: FakeProgram): void {
  gl.linkProgram(target);
  gl.useProgram(target);
}

/** A render loop that keeps asking for frames, the way the shelf's does. */
function loop(gl: FakeGl, draw: (gl: FakeGl) => void): void {
  const frame = (): void => {
    draw(gl);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

beforeEach(() => {
  clock = frames();
  shelf.ready = true;
  Gl = class extends FakeGl {};
  vi.stubGlobal('WebGL2RenderingContext', Gl);
  vi.stubGlobal('WebGLRenderingContext', undefined);
  vi.stubGlobal('__shelf', shelf);
  vi.stubGlobal('requestAnimationFrame', clock.request);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__samplingHook');
});

describe('the page hook — which programs read the shadow map', () => {
  it('reads a sampler2DShadow program as sampling, by GL and by its source', () => {
    const hook = install();
    new Gl().linkProgram(sampling());

    const [verdict] = hook.read().programs;
    expect(verdict).toMatchObject({ linked: true, byGl: true, bySource: true });
    expect(verdict?.shaderType).toBe('MeshStandardMaterial');
    expect(verdict?.samplers).toEqual(['map:sampler2D', 'directionalShadowMap:sampler2DShadow']);
  });

  it('reads a painted plane as not sampling, though it carries the define', () => {
    // The MeshBasic programs get `#define USE_SHADOWMAP` from the renderer and
    // no shadow chunk. Reading the define alone would call them readers.
    const hook = install();
    new Gl().linkProgram(basic());

    expect(hook.read().programs[0]).toMatchObject({ byGl: false, bySource: false });
  });

  it('reads a program whose source undefines USE_SHADOWMAP as not sampling', () => {
    const hook = install();
    new Gl().linkProgram(undefinedFetch());

    expect(hook.read().programs[0]).toMatchObject({ byGl: false, bySource: false });
  });

  it('reads a plain sampler2D named like a shadow map as sampling, which is basic and vsm', () => {
    const hook = install();
    new Gl().linkProgram(
      program(LIT.replace('sampler2DShadow', 'sampler2D'), [
        { name: 'directionalShadowMap[0]', type: SAMPLER_2D },
      ]),
    );

    expect(hook.read().programs[0]).toMatchObject({ byGl: true, bySource: true });
  });

  it('records a disagreement rather than resolving it', () => {
    // GL says a shadow sampler is active; the source says the fetch was taken
    // out. The judge turns this red; the hook only has to report both.
    const hook = install();
    new Gl().linkProgram(
      program(UNDEFINED, [{ name: 'directionalShadowMap[0]', type: SAMPLER_2D_SHADOW }]),
    );

    expect(hook.read().programs[0]).toMatchObject({ byGl: true, bySource: false });
  });

  it('counts a link that failed, and never draws with that program', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, program(LIT, [], false));
    gl.drawArrays();

    const snapshot = hook.read();
    expect(snapshot.linkFailures).toBe(1);
    expect(snapshot.frames.at(-1)).toMatchObject({ calls: 1, samplingDraws: 0 });
  });
});

describe('the page hook — frames', () => {
  it('buckets draws by animation frame, with frame 0 before the first callback', () => {
    const hook = install();
    const gl = new Gl();
    const reader = sampling();
    const painted = basic();

    // Frame 0: the first render happens at mount, outside any callback.
    use(gl, reader);
    gl.drawElements();
    gl.drawElements();
    use(gl, painted);
    gl.drawArrays();
    loop(gl, (context) => {
      context.useProgram(reader);
      context.drawElements();
    });

    clock.run(16);
    clock.run(32);

    const snapshot = hook.read();
    expect(snapshot.frames.map((bucket) => bucket.frame)).toEqual([0, 1, 2]);
    expect(snapshot.frames[0]).toMatchObject({
      calls: 3,
      samplingDraws: 2,
      samplingPrograms: [1],
      links: 2,
    });
    expect(snapshot.frames[1]).toMatchObject({ calls: 1, samplingDraws: 1, links: 0 });
    // The frame the page is read in comes last, and is complete: a read never
    // lands between two callbacks of one frame.
    expect(snapshot.frames[2]).toMatchObject({ calls: 1, samplingDraws: 1 });
  });

  it('makes one frame of two callbacks that share a timestamp', () => {
    // A page with a second animation loop — a card, a counter — must not read
    // as one full frame and one empty one, or every other frame samples nothing.
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    loop(gl, (context) => context.drawElements());
    loop(gl, () => undefined);

    clock.run(16);
    clock.run(32);

    expect(hook.read().frames.map((bucket) => bucket.calls)).toEqual([0, 1, 1]);
  });

  it('counts the shadow pass apart, by the depth material three names', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, depth());
    gl.drawElements();
    gl.drawElements();

    expect(hook.read().frames[0]).toMatchObject({ depthDraws: 2, samplingDraws: 0 });
  });

  it('marks the first frame to start once the page is ready', () => {
    shelf.ready = false;
    const hook = install();
    loop(new Gl(), (context) => context.drawArrays());

    clock.run(16);
    clock.run(32);
    shelf.ready = true;
    clock.run(48);
    clock.run(64);

    expect(hook.read().readyFrame).toBe(3);
  });

  it('counts the frames since the program set last changed, from the ready frame', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    loop(gl, (context) => context.drawElements());

    clock.run(16);
    clock.run(32);
    gl.linkProgram(basic());
    clock.run(48);
    clock.run(64);
    clock.run(80);

    // Frame 1 is quiet, frame 2 holds the link (it was open when it happened),
    // 3 and 4 are quiet — and the open frame 5 is not counted until it closes.
    expect(hook.settledFor()).toBe(2);
  });

  it('keeps frame 0 and the settle count past its cap, where it drops the middle', () => {
    // A headless desktop with a GPU runs far past 60 fps and filled the cap
    // before a 300-book page was read. Dropping from the front took frame 0 —
    // the shadow pass — with it, and read as books that stopped casting.
    const hook = install();
    const gl = new Gl();
    use(gl, depth());
    gl.drawElements();
    loop(gl, (context) => context.drawArrays());

    for (let time = 1; time <= 4100; time += 1) clock.run(time);

    const snapshot = hook.read();
    expect(snapshot.frames[0]).toMatchObject({ frame: 0, depthDraws: 1, links: 1 });
    expect(snapshot.dropped).toBe(100);
    expect(snapshot.frames).toHaveLength(4001);
    expect(snapshot.lastLinkFrame).toBe(0);
    expect(hook.settledFor()).toBe(4099);
  });

  it('stops counting on a lost context, and says it was lost', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    gl.lost = true;
    gl.drawElements();

    const snapshot = hook.read();
    expect(snapshot.contextLost).toBe(true);
    expect(snapshot.frames[0]?.calls).toBe(0);
  });
});

describe('the page hook — what one call weighs', () => {
  it('counts an instanced call as its instances, never as one', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    gl.drawArraysInstanced(4, 0, 36, 6);

    expect(hook.read().frames[0]).toMatchObject({ calls: 1, weightedDraws: 6, samplingDraws: 6 });
  });

  it('counts a multi-draw call as its sub-draws, through the extension it came from', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    const extension = gl.getExtension('WEBGL_multi_draw') as FakeMultiDraw;
    extension.multiDrawElementsWEBGL(4, [3, 3, 3], 0, 5123, [0, 6, 12], 0, 5);
    extension.multiDrawArraysInstancedWEBGL(4, [0, 0, 0], 0, [3, 3, 3], 0, [2, 3, 4], 1, 2);

    // 5 sub-draws, then the instances of 2 sub-draws from offset 1: 3 + 4.
    expect(hook.read().frames[0]).toMatchObject({ calls: 2, samplingDraws: 12 });
  });

  it('wraps an extension once, however often the page asks for it', () => {
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    gl.getExtension('WEBGL_multi_draw');
    const extension = gl.getExtension('WEBGL_multi_draw') as FakeMultiDraw;
    extension.multiDrawElementsWEBGL(4, [3], 0, 5123, [0], 0, 1);

    expect(hook.read().frames[0]?.calls).toBe(1);
  });
});

describe('the page hook — installing', () => {
  it('reports itself, as the gate reads it', () => {
    expect(install().read().version).toBe(1);
  });

  it('installs once, so a second install does not count every draw twice', () => {
    install();
    const hook = install();
    const gl = new Gl();
    use(gl, sampling());
    gl.drawElements();

    expect(hook.read().frames[0]?.calls).toBe(1);
  });

  it('defines the helper tsx makes the body call, in a scope of its own', () => {
    const before = '__name' in globalThis;
    expect(samplingHookSource().startsWith('{ const __name = (target) => target;')).toBe(true);

    install();

    // Nothing leaks into the page's globals but the hook itself.
    expect('__name' in globalThis).toBe(before);
  });
});
