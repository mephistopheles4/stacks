/**
 * The judge for G60 (`one-shadow-reader`): how many programs read the real-time
 * shadow map, and in how many draws a frame.
 *
 * Pure. The page half is `sampling-hook.ts`, which counts what WebGL was asked
 * to do and hands back a `SamplingSnapshot`; `pnpm smoke:render` turns that
 * into a `SamplingRun` and asks this file for a verdict. `scripts/phone-check.ts`
 * asks the same questions of a run on a phone, so a phone report and the CI gate
 * print the same numbers.
 *
 * ## Why these numbers
 *
 * Every figure below was measured on one device: a Pixel 10 Pro XL, PowerVR
 * D-Series DXT-48-1536, driver `25.3@6908880`, Chrome 153, ANGLE on GLES
 * ([#381](https://github.com/mephistopheles4/stacks/issues/381)).
 *
 * - **The context is lost in a count of draws whose program samples the shadow
 *   map**, not in time and not in memory. The live site, with five programs
 *   reading the map, died at frame 8 ± 1 after about 3,474 such draws, and at
 *   the same frame when throttled to 1.9 fps.
 * - **One sampling program has a sharp ceiling.** 11 sampling draws a frame
 *   survived every run, 12 survived three of three (one of them 300 s), and 13
 *   died two of two at frame 134. Above that it dies sooner: 14 at frame 113,
 *   30 at frame 58, 60 at frame 30.
 * - **The edge is not a margin.** A run capped at 12 by skipping draws died
 *   twice where an uncapped 12 lived, with the same draw stream after frame 3.
 * - **A second sampling program lowers the ceiling.** A split of 6 and 5 died at
 *   frame 292; the one split that survived had the smaller program at one draw.
 *
 * So `BUDGET` is 4, a third of the measured edge: the bookcase reads the map in
 * 2 draws (ADR-0088), which leaves 2 for a future member. G15's rule applies —
 * a budget that gets raised whenever it fails is a comment. A red here is
 * answered by finding which program started sampling, and then by running
 * `scripts/phone-check.ts` on a phone.
 */

/** The most draws a frame the one sampling program may make. See the header. */
export const BUDGET = 4;

/** Frames with no program linked, after the page said it was ready, before a verdict. */
export const MIN_STEADY_FRAMES = 30;

/** How many frames from the first the shadow pass has to appear in. */
export const CAST_WITHIN = 5;

/**
 * One animation frame of draws, as the page hook closed it.
 *
 * Frames are delimited by `requestAnimationFrame` timestamps, so two callbacks
 * in one frame are one bucket. Frame 0 is everything before the first callback,
 * which is where the shelf's first render and its one shadow pass land.
 */
export interface FrameBucket {
  readonly frame: number;
  /** GL draw calls, one per call whatever it drew. */
  readonly calls: number;
  /**
   * Calls weighted by what they drew: an instanced call counts its instances,
   * a `WEBGL_multi_draw` call its sub-draws. Neither regime was ever measured
   * on the phone, so each counts at its upper bound and never as one.
   */
  readonly weightedDraws: number;
  /** Weighted draws whose current program reads a shadow map. */
  readonly samplingDraws: number;
  /** The distinct programs that made those draws, by the hook's own ids. */
  readonly samplingPrograms: readonly number[];
  /** Draws by the shadow pass's own programs: what casts into the map. */
  readonly depthDraws: number;
  /** Programs linked during this frame. A cover or a wood sheet decoding relinks. */
  readonly links: number;
}

/**
 * One linked program, classified twice.
 *
 * `byGl` is the driver's answer: an active uniform of a shadow sampler type, or
 * any active sampler named like a shadow map (`basic` and `vsm` read the map
 * through a plain `sampler2D`). `bySource` is the answer from the text three
 * handed GL: a `*ShadowMap` sampler is declared and `USE_SHADOWMAP` is still
 * defined at the end of the source, not `#undef`ined after it. The two must
 * agree: the source is what does not depend on the GPU, and GL is what keeps
 * the source reading honest.
 */
export interface ProgramVerdict {
  readonly id: number;
  readonly linked: boolean;
  readonly byGl: boolean;
  readonly bySource: boolean;
  /** Three's `SHADER_TYPE` define, e.g. `MeshStandardMaterial`, when present. */
  readonly shaderType: string | null;
  /** Every active sampler, as `name:type`. */
  readonly samplers: readonly string[];
}

/** What the page hook hands back. See `sampling-hook.ts`. */
export interface SamplingSnapshot {
  readonly version: number;
  /** Closed frames, oldest first. The last is the frame the page was read in. */
  readonly frames: readonly FrameBucket[];
  /** Frames dropped from the front of `frames` once the hook's cap was reached. */
  readonly dropped: number;
  /** The most sampling draws in any frame since the hook was installed, dropped or not. */
  readonly maxSamplingDraws: number;
  readonly programs: readonly ProgramVerdict[];
  /** The first frame to start after `window.__shelf.ready` was true. */
  readonly readyFrame: number | null;
  readonly linkFailures: number;
  readonly contextLost: boolean;
  /** WebGL contexts that drew or linked anything. */
  readonly contexts: number;
}

/** One measured page, as the judge reads it. */
export interface SamplingRun {
  /** The hook's snapshot, or `undefined` when the page never reported one. */
  readonly snapshot: SamplingSnapshot | undefined;
  /** Books on the shelf. Each casts into the map through its page block. */
  readonly bookCount: number;
  /** `renderer.info.render.calls` for the frame the snapshot's last bucket is. */
  readonly threeCalls: number | undefined;
}

export interface JudgeOptions {
  readonly budget: number;
  readonly minSteadyFrames: number;
}

export const DEFAULT_JUDGE: JudgeOptions = { budget: BUDGET, minSteadyFrames: MIN_STEADY_FRAMES };

/**
 * The frames after the program set settled: from the page's ready frame, and
 * after the last frame in which anything linked.
 *
 * ⚠️ **Not from frame 0**, which is the point: while a woodwork sheet or a
 * cover decodes, the bookcase's no-map twin and its mapped program both draw,
 * so two programs sample the map for a frame or two. That is onset, and the
 * budget still applies to it; "exactly one" applies once it is over.
 */
export function steadyFrames(snapshot: SamplingSnapshot): readonly FrameBucket[] {
  if (snapshot.readyFrame === null) return [];
  const ready = snapshot.readyFrame;
  const lastLink = snapshot.frames.reduce(
    (latest, bucket) => (bucket.links > 0 ? Math.max(latest, bucket.frame) : latest),
    -1,
  );
  // A link in a frame the hook already dropped is older than every frame kept.
  return snapshot.frames.filter((bucket) => bucket.frame >= ready && bucket.frame > lastLink);
}

/** The numbers a report prints, and the ones the control is held to. */
export interface SamplingSummary {
  readonly steady: number;
  /** Fewest and most distinct sampling programs in any steady frame. */
  readonly fewestPrograms: number;
  readonly mostPrograms: number;
  /** Most sampling draws in any frame, onset included. */
  readonly mostDraws: number;
  /** Most sampling draws in any steady frame. */
  readonly mostSteadyDraws: number;
  /** Draws by the shadow pass's programs over the first `CAST_WITHIN` frames. */
  readonly depthDraws: number;
  readonly programs: number;
}

export function summarise(snapshot: SamplingSnapshot): SamplingSummary {
  const steady = steadyFrames(snapshot);
  const counts = steady.map((bucket) => bucket.samplingPrograms.length);
  return {
    steady: steady.length,
    fewestPrograms: counts.length === 0 ? 0 : Math.min(...counts),
    mostPrograms: counts.length === 0 ? 0 : Math.max(...counts),
    mostDraws: Math.max(
      snapshot.maxSamplingDraws,
      ...snapshot.frames.map((bucket) => bucket.samplingDraws),
    ),
    mostSteadyDraws: Math.max(0, ...steady.map((bucket) => bucket.samplingDraws)),
    depthDraws: snapshot.frames
      .filter((bucket) => bucket.frame < CAST_WITHIN)
      .reduce((sum, bucket) => sum + bucket.depthDraws, 0),
    programs: snapshot.programs.length,
  };
}

/**
 * Every reason this page fails G60, or none.
 *
 * The clauses are numbered as `docs/gates.md` numbers them, so a red names the
 * clause a reader will look up.
 */
export function judgeSampling(run: SamplingRun, options: JudgeOptions = DEFAULT_JUDGE): string[] {
  const snapshot = run.snapshot;

  // (1) The instrument is live. Without this, every clause below is satisfied
  // by a page the hook never saw.
  if (snapshot === undefined) {
    return ['(1) the page hook never reported itself, so nothing on this page was counted'];
  }

  const failures: string[] = [];
  const summary = summarise(snapshot);
  const steady = steadyFrames(snapshot);

  if (snapshot.contexts === 0 || snapshot.programs.length === 0) {
    failures.push(
      `(1) the hook saw ${String(snapshot.contexts)} WebGL context(s) and ` +
        `${String(snapshot.programs.length)} program(s) — it is installed but not seeing the shelf`,
    );
  }
  if (snapshot.contextLost) {
    failures.push('(1) the WebGL context was lost while the page was measured');
  }
  if (snapshot.linkFailures > 0) {
    failures.push(`(1) ${String(snapshot.linkFailures)} program(s) failed to link`);
  }
  if (summary.depthDraws < run.bookCount) {
    failures.push(
      `(1) the shadow pass drew ${String(summary.depthDraws)} time(s) in the first ` +
        `${String(CAST_WITHIN)} frames for ${String(run.bookCount)} books — every book casts ` +
        'through its page block, so fewer means books stopped casting or the pass never ran',
    );
  }

  // (2) The program set settled. A verdict over onset frames would be a verdict
  // about texture decode.
  if (snapshot.readyFrame === null) {
    failures.push('(2) the page never said it was ready while the hook was counting');
  } else if (steady.length < options.minSteadyFrames) {
    failures.push(
      `(2) the program set never settled: ${String(steady.length)} frame(s) after the last ` +
        `link, where ${String(options.minSteadyFrames)} are needed for a verdict`,
    );
  }

  // (3) Exactly one program samples the map in every steady frame.
  const off = steady.filter((bucket) => bucket.samplingPrograms.length === 0);
  if (off.length > 0) {
    failures.push(
      `(3) ${String(off.length)} of ${String(steady.length)} steady frame(s) sample the shadow ` +
        'map from no program — real-time shadows are off on this page, or it fell back to painted',
    );
  }
  const crowded = steady.filter((bucket) => bucket.samplingPrograms.length > 1);
  if (crowded.length > 0) {
    failures.push(
      `(3) ${String(crowded.length)} of ${String(steady.length)} steady frame(s) sample the ` +
        `shadow map from up to ${String(summary.mostPrograms)} programs — only one may read it: ` +
        describePrograms(snapshot, crowded),
    );
  }

  // (4) The budget, in every frame the hook kept, onset included.
  if (summary.mostDraws > options.budget) {
    const over = snapshot.frames.filter((bucket) => bucket.samplingDraws > options.budget);
    failures.push(
      `(4) up to ${String(summary.mostDraws)} sampling draws in one frame, over the budget of ` +
        `${String(options.budget)} — ${String(over.length)} frame(s) over it` +
        (over.length === 0 ? ' (in a frame the hook no longer keeps)' : ''),
    );
  }

  // (5) The two classifiers agree about every program.
  const disputed = snapshot.programs.filter(
    (program) => program.linked && program.byGl !== program.bySource,
  );
  if (disputed.length > 0) {
    failures.push(
      `(5) GL and the shader source disagree about ${String(disputed.length)} program(s): ` +
        disputed
          .map(
            (program) =>
              `#${String(program.id)} ${program.shaderType ?? '?'} — GL says ` +
              `${program.byGl ? 'samples' : 'does not'}, the source says ` +
              `${program.bySource ? 'samples' : 'does not'} [${program.samplers.join(', ')}]`,
          )
          .join('; '),
    );
  }

  // (6) The hook sees the renderer's draws: same count as three's own, for the
  // frame the page was read in.
  const last = snapshot.frames.at(-1);
  if (last === undefined || run.threeCalls === undefined) {
    failures.push('(6) no frame to hold the hook against three.js');
  } else if (last.calls !== run.threeCalls) {
    failures.push(
      `(6) the hook counted ${String(last.calls)} draw call(s) in the last frame and three.js ` +
        `counted ${String(run.threeCalls)} — the hook is not seeing what the renderer draws`,
    );
  }

  return failures;
}

/**
 * What the gate fails on when the control does **not** fail.
 *
 * The control is `?receivers=all`: every book reads the map again, which is
 * the configuration that died on the phone. It has to come back red, and red
 * for the reason that matters — more than one program and more than the budget
 * — not red because the hook saw nothing. A control that passes, or that fails
 * vacuously, means the instrument cannot see a book program, and then a green
 * on the default page means nothing either.
 */
export function judgeControl(run: SamplingRun, options: JudgeOptions = DEFAULT_JUDGE): string[] {
  const snapshot = run.snapshot;
  if (snapshot === undefined) {
    return ['(8) the control page never reported the hook, so it proves nothing'];
  }
  if (judgeSampling(run, options).length === 0) {
    return [
      '(8) the control, where every book reads the map, was judged green — the instrument ' +
        `cannot see a book program (${describeSampling(run)})`,
    ];
  }

  const summary = summarise(snapshot);
  const failures: string[] = [];
  if (summary.steady < options.minSteadyFrames) {
    failures.push(
      `(8) the control never settled (${String(summary.steady)} steady frames), so its red is ` +
        'about onset and not about the programs',
    );
  }
  if (summary.mostPrograms < 2) {
    failures.push(
      `(8) the control sampled the map from at most ${String(summary.mostPrograms)} program(s) ` +
        'in a steady frame — a book program should be reading it',
    );
  }
  if (summary.mostSteadyDraws <= options.budget) {
    failures.push(
      `(8) the control made at most ${String(summary.mostSteadyDraws)} sampling draw(s) in a ` +
        `steady frame, within the budget of ${String(options.budget)} — every book should be one`,
    );
  }
  return failures;
}

/** One line of numbers for a report. */
export function describeSampling(run: SamplingRun): string {
  if (run.snapshot === undefined) return 'no hook';
  const s = summarise(run.snapshot);
  const programs =
    s.fewestPrograms === s.mostPrograms
      ? String(s.mostPrograms)
      : `${String(s.fewestPrograms)}–${String(s.mostPrograms)}`;
  return (
    `${String(s.steady)} steady frames, ${programs} sampling program(s), ` +
    `${String(s.mostSteadyDraws)} sampling draws a steady frame (${String(s.mostDraws)} at most), ` +
    `${String(s.depthDraws)} casting draws, ${String(s.programs)} programs linked`
  );
}

function describePrograms(snapshot: SamplingSnapshot, frames: readonly FrameBucket[]): string {
  const ids = new Set(frames.flatMap((bucket) => bucket.samplingPrograms));
  return snapshot.programs
    .filter((program) => ids.has(program.id))
    .map((program) => `#${String(program.id)} ${program.shaderType ?? '?'}`)
    .join(', ');
}
