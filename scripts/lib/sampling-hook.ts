/**
 * The page half of G61 (`one-shadow-reader`): a WebGL counting hook, installed
 * before any page script runs.
 *
 * It wraps the WebGL prototypes and `requestAnimationFrame` and counts, per
 * animation frame, the draws whose current program reads a shadow map. It
 * changes no argument and no return value, so the page draws exactly what it
 * would draw without it. The judge is `shadow-sampling.ts`; this file only
 * counts.
 *
 * ## One implementation, two callers
 *
 * `pnpm smoke:render` installs it with `page.evaluateOnNewDocument` and
 * `scripts/phone-check.ts` with CDP's `Page.addScriptToEvaluateOnNewDocument`.
 * Both take a **string**, `samplingHookSource()`, never the function itself.
 *
 * ⚠️ **So `samplingHook` must close over nothing.** It is serialised with
 * `toString()` and evaluated in a page that has none of this module's scope:
 * every constant, regex and helper it needs lives inside its body. Nor may it
 * declare `top`, `window`, `document` or `location` at a script's top level —
 * in a page, a top-level `const top` is a `SyntaxError` that discards the
 * whole script, and Node, which has no `top`, never shows it. The source is a
 * block for that reason too: nothing in it is declared at the top level.
 *
 * ⚠️ **Why the source carries a `__name` shim.** `tsx` compiles with esbuild's
 * `keepNames`, which rewrites every named function inside this body into a
 * call to a module-level `__name(...)` helper. Serialised, the body still calls
 * it and the page has none: `__name is not defined`, measured under tsx 4.23.13.
 * `samplingHookSource()` defines it for the body's scope alone, as an identity.
 * If the helper is ever renamed, the hook throws before it reports itself, and
 * G61's first clause goes red saying the hook never reported.
 *
 * ⚠️ **Stryker rewrites the body too**, into calls to module-level
 * `stryMutAct_*` helpers no shim can name. So `sampling-hook.test.ts` specs the
 * behaviour by calling `samplingHook()`, which Stryker can mutate, and
 * `sampling-hook-source.test.ts` specs the string — and is left out of the
 * mutation run by `vitest.stryker.config.ts`, since it cannot pass in there.
 */

/**
 * The hook. Installs `globalThis.__samplingHook` and the wrappers, once.
 *
 * Written against `globalThis` rather than `window` so a unit test can run it
 * in Node against a fake GL; in a page the two are the same object.
 */
export function samplingHook(): void {
  /** 2 since `lastSetChangeFrame` (#385). */
  const VERSION = 2;
  /** Frames kept; older ones are dropped, and `maxSamplingDraws` still covers them. */
  const MAX_FRAMES = 4000;
  /**
   * The first frames are never dropped: frame 0 holds the first render and the
   * one shadow pass, which is where the judge reads that the books cast. A
   * headless desktop with a GPU runs far past 60 fps and filled the cap before
   * a 300-book page was read, which dropped frame 0 and read as no casting.
   */
  const KEPT_FROM_START = 10;

  // WebGL enums, as the specification fixes them. Read as literals rather than
  // off a context so a hook installed before any context exists can use them.
  const LINK_STATUS = 0x8b82;
  const ACTIVE_UNIFORMS = 0x8b86;
  const SHADER_TYPE = 0x8b4f;
  const FRAGMENT_SHADER = 0x8b30;
  const SHADOW_SAMPLERS = new Map([
    [0x8b62, 'sampler2DShadow'],
    [0x8dc4, 'sampler2DArrayShadow'],
    [0x8dc5, 'samplerCubeShadow'],
  ]);
  const SAMPLERS = new Map([
    [0x8b5e, 'sampler2D'],
    [0x8b5f, 'sampler3D'],
    [0x8b60, 'samplerCube'],
    [0x8dc1, 'sampler2DArray'],
    [0x8dca, 'isampler2D'],
    [0x8dcb, 'isampler3D'],
    [0x8dcc, 'isamplerCube'],
    [0x8dcf, 'isampler2DArray'],
    [0x8dd2, 'usampler2D'],
    [0x8dd3, 'usampler3D'],
    [0x8dd4, 'usamplerCube'],
    [0x8dd7, 'usampler2DArray'],
    [0x8d66, 'samplerExternalOES'],
  ]);

  // `basic` and `vsm` read the map through a plain `sampler2D`, so a type check
  // alone would miss them; three names every shadow sampler `*ShadowMap`.
  const SHADOW_NAME = /shadowmap/i;
  const DECLARES_SHADOW_SAMPLER =
    /^[ \t]*uniform[ \t]+(?:(?:lowp|mediump|highp)[ \t]+)?[iu]?sampler\w*[ \t]+\w*ShadowMap\b/m;
  const SHADOWMAP_DIRECTIVE = /^[ \t]*#[ \t]*(define|undef)[ \t]+USE_SHADOWMAP\b/gm;
  const SHADER_TYPE_DEFINE = /^[ \t]*#define[ \t]+SHADER_TYPE[ \t]+(\S+)/m;
  const DEPTH_TYPES = new Set(['MeshDepthMaterial', 'MeshDistanceMaterial']);

  type Fn = (...args: unknown[]) => unknown;
  type Gl = WebGL2RenderingContext;

  interface Program {
    readonly id: number;
    readonly linked: boolean;
    readonly byGl: boolean;
    readonly bySource: boolean;
    readonly shaderType: string | null;
    readonly samplers: readonly string[];
    readonly depth: boolean;
  }

  interface Bucket {
    frame: number;
    calls: number;
    weightedDraws: number;
    samplingDraws: number;
    readonly sampling: Set<number>;
    depthDraws: number;
    links: number;
  }

  const root = globalThis as unknown as Record<string, unknown>;
  if (root['__samplingHook'] !== undefined) return;

  const wrapped = new WeakSet<object>();
  /** A program object to what it last linked as. */
  const programs = new WeakMap<object, Program>();
  /** A context to the program object it is drawing with. */
  const current = new WeakMap<object, object | null>();
  /** An extension object to the context that handed it out. */
  const owners = new WeakMap<object, object>();
  const contexts = new WeakSet<object>();
  const verdicts: Program[] = [];
  const closed: {
    frame: number;
    calls: number;
    weightedDraws: number;
    samplingDraws: number;
    samplingPrograms: number[];
    depthDraws: number;
    links: number;
  }[] = [];

  const state = {
    dropped: 0,
    maxSamplingDraws: 0,
    readyFrame: null as number | null,
    /** The last frame anything linked in, kept even when that frame is dropped. */
    lastLinkFrame: null as number | null,
    /**
     * The last frame whose sampling programs differ from the frame before it,
     * kept the same way. A material can switch to a program another material
     * already linked, so a change of readers need not link at all (#385).
     */
    lastSetChangeFrame: null as number | null,
    /** The previous closed frame's sampling programs, as a key. */
    lastSet: null as string | null,
    linkFailures: 0,
    contextLost: false,
    /** `performance.now()` when a loss was first seen, by event or by a draw. */
    lostAt: null as number | null,
    contexts: 0,
    nextId: 0,
    openTs: undefined as number | undefined,
  };

  const bucket = (frame: number): Bucket => ({
    frame,
    calls: 0,
    weightedDraws: 0,
    samplingDraws: 0,
    sampling: new Set<number>(),
    depthDraws: 0,
    links: 0,
  });
  let open = bucket(0);

  const freeze = (b: Bucket): (typeof closed)[number] => ({
    frame: b.frame,
    calls: b.calls,
    weightedDraws: b.weightedDraws,
    samplingDraws: b.samplingDraws,
    samplingPrograms: [...b.sampling].sort((a, z) => a - z),
    depthDraws: b.depthDraws,
    links: b.links,
  });

  const see = (gl: object): void => {
    if (contexts.has(gl)) return;
    contexts.add(gl);
    state.contexts += 1;
  };

  const markLost = (): void => {
    state.contextLost = true;
    state.lostAt ??= performance.now();
  };

  const lost = (gl: object): boolean => {
    try {
      const answer = (gl as Gl).isContextLost();
      if (answer) markLost();
      return answer;
    } catch {
      return false;
    }
  };

  // A lost context may never be drawn to again — the shelf stops its loop —
  // so the event is what tells a phone run when it died. Captured on the
  // window, since the event does not bubble up from the canvas.
  const listen = root['addEventListener'];
  if (typeof listen === 'function') {
    Reflect.apply(listen, globalThis, ['webglcontextlost', markLost, true]);
  }

  const classify = (gl: Gl, program: WebGLProgram): Program => {
    const samplers: string[] = [];
    let linked = false;
    let byGl = false;
    let bySource = false;
    let shaderType: string | null = null;
    try {
      linked = gl.getProgramParameter(program, LINK_STATUS) === true;
      const count = Number(gl.getProgramParameter(program, ACTIVE_UNIFORMS)) || 0;
      for (let index = 0; index < count; index += 1) {
        const uniform = gl.getActiveUniform(program, index);
        if (uniform === null) continue;
        const shadowType = SHADOW_SAMPLERS.get(uniform.type);
        const type = shadowType ?? SAMPLERS.get(uniform.type);
        if (type === undefined) continue;
        samplers.push(`${uniform.name.replace(/\[0\]$/, '')}:${type}`);
        if (shadowType !== undefined || SHADOW_NAME.test(uniform.name)) byGl = true;
      }
    } catch {
      // A lost context answers null to everything; the program is unlinked.
    }
    try {
      for (const shader of gl.getAttachedShaders(program) ?? []) {
        if (gl.getShaderParameter(shader, SHADER_TYPE) !== FRAGMENT_SHADER) continue;
        const source = gl.getShaderSource(shader) ?? '';
        shaderType = SHADER_TYPE_DEFINE.exec(source)?.[1] ?? null;
        const directives = [...source.matchAll(SHADOWMAP_DIRECTIVE)];
        const stillDefined = directives.at(-1)?.[1] === 'define';
        bySource = stillDefined && DECLARES_SHADOW_SAMPLER.test(source);
      }
    } catch {
      // Same: nothing to read off a lost context.
    }
    state.nextId += 1;
    const verdict: Program = {
      id: state.nextId,
      linked,
      byGl,
      bySource,
      shaderType,
      samplers,
      depth: shaderType !== null && DEPTH_TYPES.has(shaderType),
    };
    if (!linked && !lost(gl)) state.linkFailures += 1;
    return verdict;
  };

  const count = (gl: object | undefined, weight: number): void => {
    if (gl === undefined) return;
    see(gl);
    if (lost(gl)) return;
    open.calls += 1;
    open.weightedDraws += weight;
    const object = current.get(gl) ?? null;
    const program = object === null ? undefined : programs.get(object);
    if (program === undefined) return;
    if (program.depth) open.depthDraws += 1;
    // Either classifier: an upper bound. Where they disagree, clause 5 is red.
    if (program.byGl || program.bySource) {
      open.samplingDraws += weight;
      open.sampling.add(program.id);
    }
  };

  const at = (args: readonly unknown[], index: number): number => Number(args[index]) || 0;

  /** Instances drawn by one entry per sub-draw, from a list and an offset. */
  const summed = (args: readonly unknown[], list: number, offset: number, n: number): number => {
    const values = args[list] as ArrayLike<number> | undefined;
    const from = at(args, offset);
    let total = 0;
    for (let index = 0; index < at(args, n); index += 1) {
      total += Number(values?.[from + index]) || 0;
    }
    return total;
  };

  /**
   * What one call weighs. An instanced call counts its instances and a
   * multi-draw call its sub-draws — both at their upper bound, because neither
   * was measured on the phone and a merge built with either must not read as
   * one draw.
   */
  const WEIGHTS: Record<string, (args: readonly unknown[]) => number> = {
    drawArrays: () => 1,
    drawElements: () => 1,
    drawRangeElements: () => 1,
    drawArraysInstanced: (args) => at(args, 3),
    drawElementsInstanced: (args) => at(args, 4),
    drawArraysInstancedANGLE: (args) => at(args, 3),
    drawElementsInstancedANGLE: (args) => at(args, 4),
    multiDrawArraysWEBGL: (args) => at(args, 5),
    multiDrawElementsWEBGL: (args) => at(args, 6),
    multiDrawArraysInstancedWEBGL: (args) => summed(args, 5, 6, 7),
    multiDrawElementsInstancedWEBGL: (args) => summed(args, 6, 7, 8),
  };

  const EXTENSIONS: Record<string, readonly string[]> = {
    WEBGL_multi_draw: [
      'multiDrawArraysWEBGL',
      'multiDrawElementsWEBGL',
      'multiDrawArraysInstancedWEBGL',
      'multiDrawElementsInstancedWEBGL',
    ],
    ANGLE_instanced_arrays: ['drawArraysInstancedANGLE', 'drawElementsInstancedANGLE'],
  };

  const wrap = (target: object, name: string, make: (original: Fn) => Fn): void => {
    const original: unknown = Reflect.get(target, name);
    if (typeof original !== 'function' || wrapped.has(original)) return;
    const replacement = make(original as Fn);
    wrapped.add(replacement);
    Reflect.set(target, name, replacement);
  };

  const drawing =
    (name: string, owner: (self: object) => object | undefined) =>
    (original: Fn): Fn =>
      function (this: object, ...args: unknown[]): unknown {
        const result: unknown = Reflect.apply(original, this, args);
        try {
          count(owner(this), WEIGHTS[name]?.(args) ?? 1);
        } catch {
          // Counting must never break the page.
        }
        return result;
      };

  const constructors = [root['WebGL2RenderingContext'], root['WebGLRenderingContext']];
  for (const constructor of constructors) {
    if (typeof constructor !== 'function') continue;
    const prototype = (constructor as { prototype?: object }).prototype;
    if (prototype === undefined) continue;

    for (const name of [
      'drawArrays',
      'drawElements',
      'drawRangeElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ]) {
      wrap(
        prototype,
        name,
        drawing(name, (self) => self),
      );
    }

    wrap(
      prototype,
      'useProgram',
      (original) =>
        function (this: Gl, ...args: unknown[]): unknown {
          const result: unknown = Reflect.apply(original, this, args);
          try {
            see(this);
            const program = args[0] as WebGLProgram | null | undefined;
            if (program === null || program === undefined) {
              current.set(this, null);
            } else {
              let known = programs.get(program);
              if (known === undefined) {
                known = classify(this, program);
                programs.set(program, known);
                verdicts.push(known);
              }
              // A program that failed to link cannot be made current.
              if (known.linked) current.set(this, program);
            }
          } catch {
            // As above.
          }
          return result;
        },
    );

    wrap(
      prototype,
      'linkProgram',
      (original) =>
        function (this: Gl, ...args: unknown[]): unknown {
          const result: unknown = Reflect.apply(original, this, args);
          try {
            see(this);
            const program = args[0] as WebGLProgram | null | undefined;
            if (program !== null && program !== undefined) {
              const verdict = classify(this, program);
              verdicts.push(verdict);
              open.links += 1;
              state.lastLinkFrame = open.frame;
              // A failed relink leaves the old executable in place, so the old
              // verdict still describes what a draw with it runs.
              if (verdict.linked || !programs.has(program)) programs.set(program, verdict);
            }
          } catch {
            // As above.
          }
          return result;
        },
    );

    wrap(
      prototype,
      'getExtension',
      (original) =>
        function (this: Gl, ...args: unknown[]): unknown {
          const extension: unknown = Reflect.apply(original, this, args);
          try {
            const methods = EXTENSIONS[String(args[0])];
            if (methods !== undefined && typeof extension === 'object' && extension !== null) {
              owners.set(extension, this);
              for (const name of methods) {
                wrap(
                  extension,
                  name,
                  drawing(name, (self) => owners.get(self)),
                );
              }
            }
          } catch {
            // As above.
          }
          return extension;
        },
    );
  }

  const close = (): void => {
    const frozen = freeze(open);
    closed.push(frozen);
    state.maxSamplingDraws = Math.max(state.maxSamplingDraws, frozen.samplingDraws);
    const set = frozen.samplingPrograms.join(',');
    if (state.lastSet !== null && set !== state.lastSet) state.lastSetChangeFrame = frozen.frame;
    state.lastSet = set;
    if (closed.length > MAX_FRAMES) {
      closed.splice(KEPT_FROM_START, 1);
      state.dropped += 1;
    }
    open = bucket(open.frame + 1);
  };

  /**
   * Frames by timestamp: every callback of one frame shares it, so a page with
   * two animation loops still reads as one frame, not as one full and one empty.
   */
  const frameStarts = (time: number): void => {
    if (state.openTs === time) return;
    state.openTs = time;
    close();
    const shelf = root['__shelf'] as { ready?: unknown } | undefined;
    if (state.readyFrame === null && shelf?.ready === true) state.readyFrame = open.frame;
  };

  const request = root['requestAnimationFrame'];
  if (typeof request === 'function') {
    const original = request as (callback: (time: number) => void) => number;
    root['requestAnimationFrame'] = (callback: (time: number) => void): number =>
      Reflect.apply(original, globalThis, [
        (time: number): void => {
          try {
            frameStarts(time);
          } catch {
            // As above.
          }
          callback(time);
        },
      ]);
  }

  root['__samplingHook'] = {
    version: VERSION,
    /**
     * Closed frames since the program set last changed, counted from the ready
     * frame: after the last link, and from the last change of readers, which is
     * the first frame of the set that stayed. Frames are numbered without gaps,
     * so this is arithmetic on frame numbers and holds whether or not the frames
     * themselves were dropped. `steadyFrames` in `shadow-sampling.ts` is the
     * same rule over a snapshot, and the two must move together: the gate waits
     * on this one and judges by that one.
     */
    settledFor: (): number => {
      if (state.readyFrame === null) return 0;
      const from = Math.max(
        state.readyFrame,
        (state.lastLinkFrame ?? -1) + 1,
        state.lastSetChangeFrame ?? -1,
      );
      return Math.max(0, open.frame - from);
    },
    /** A few numbers, cheap enough to poll once a second from a phone. */
    status: () => ({
      frame: open.frame,
      contextLost: state.contextLost,
      lostAt: state.lostAt,
      linkFailures: state.linkFailures,
      contexts: state.contexts,
    }),
    /** Everything, as plain data; the open frame last, since a read never lands mid-frame. */
    read: () => {
      const frames = [...closed, freeze(open)];
      return {
        version: VERSION,
        frames,
        dropped: state.dropped,
        maxSamplingDraws: Math.max(state.maxSamplingDraws, open.samplingDraws),
        programs: verdicts.map((verdict) => ({
          id: verdict.id,
          linked: verdict.linked,
          byGl: verdict.byGl,
          bySource: verdict.bySource,
          shaderType: verdict.shaderType,
          samplers: verdict.samplers,
        })),
        readyFrame: state.readyFrame,
        lastLinkFrame: state.lastLinkFrame,
        lastSetChangeFrame: state.lastSetChangeFrame,
        linkFailures: state.linkFailures,
        contextLost: state.contextLost,
        contexts: state.contexts,
      };
    },
  };
}

/**
 * The hook as a script a page can run: the function, called, inside a scope
 * that defines the `__name` helper `tsx`'s `keepNames` makes it call.
 *
 * A block scope rather than a global, so the page's own globals are untouched.
 */
export function samplingHookSource(): string {
  return `{ const __name = (target) => target;\n(${samplingHook.toString()})(); }`;
}
