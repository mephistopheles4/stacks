/**
 * The judge behind G61 (`one-shadow-reader`), over hand-built snapshots.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`. The gate itself runs in
 * `pnpm smoke:render`, against a real page; this is where every configuration
 * the phone measured is planted as a snapshot and judged, so each one is
 * asserted on every run rather than observed once.
 */

import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  describeSampling,
  judgeControl,
  judgeSampling,
  MIN_STEADY_FRAMES,
  steadyFrames,
  type FrameBucket,
  type ProgramVerdict,
  type SamplingRun,
  type SamplingSnapshot,
} from './shadow-sampling.ts';

const BOOKS = 41;
const WOOD = 5;
const CALLS = 314;

/** A steady frame of the default page: the bookcase's one program, in 2 draws. */
function frame(n: number, over: Partial<FrameBucket> = {}): FrameBucket {
  return {
    frame: n,
    calls: CALLS,
    weightedDraws: CALLS,
    samplingDraws: 2,
    samplingPrograms: [WOOD],
    depthDraws: 0,
    links: 0,
    ...over,
  };
}

/** The seven programs the default page links: four book parts, wood, painted, depth. */
function roster(sampling: readonly number[] = [WOOD]): ProgramVerdict[] {
  return [1, 2, 3, 4, 5, 6, 7].map((id) => ({
    id,
    linked: true,
    byGl: sampling.includes(id),
    bySource: sampling.includes(id),
    shaderType:
      id === 7 ? 'MeshDepthMaterial' : id === 6 ? 'MeshBasicMaterial' : 'MeshStandardMaterial',
    samplers: sampling.includes(id) ? ['directionalShadowMap:sampler2DShadow'] : [],
  }));
}

/**
 * A page that settled: frame 0 is the first render and the shadow pass, where
 * every program links; the ready frame is 1; the frames after it are steady.
 */
function snapshot(over: Partial<SamplingSnapshot> = {}, steady = 40): SamplingSnapshot {
  const frames = [
    frame(0, { calls: CALLS + BOOKS + 2, depthDraws: BOOKS + 2, links: 7 }),
    ...Array.from({ length: steady }, (_, index) => frame(index + 1)),
  ];
  return {
    version: 2,
    frames,
    dropped: 0,
    maxSamplingDraws: 0,
    programs: roster(),
    readyFrame: 1,
    lastLinkFrame: 0,
    lastSetChangeFrame: null,
    linkFailures: 0,
    contextLost: false,
    contexts: 1,
    ...over,
  };
}

function run(over: Partial<SamplingSnapshot> = {}, steady = 40): SamplingRun {
  return { snapshot: snapshot(over, steady), bookCount: BOOKS, threeCalls: CALLS };
}

/** Every steady frame replaced by one shape. */
function everyFrame(over: Partial<FrameBucket>, programs = roster()): SamplingRun {
  const base = snapshot();
  return {
    snapshot: {
      ...base,
      programs,
      frames: base.frames.map((bucket) => (bucket.frame === 0 ? bucket : { ...bucket, ...over })),
    },
    bookCount: BOOKS,
    threeCalls: over.calls ?? CALLS,
  };
}

/** The clause numbers a verdict names, so a test asserts which clause fired. */
function clauses(failures: readonly string[]): string[] {
  return failures.map((failure) => failure.slice(0, 3));
}

describe('judgeSampling — the configuration that survived', () => {
  it('passes one program reading the map in two draws, which is the default page', () => {
    expect(judgeSampling(run())).toEqual([]);
  });

  it('passes a frame at the budget exactly', () => {
    expect(judgeSampling(everyFrame({ samplingDraws: BUDGET }))).toEqual([]);
  });

  it('passes two programs in an onset frame, before the program set settles', () => {
    // wf2-diff frames 14–15: the bookcase's no-map twin and its mapped program
    // both drew while a sheet decoded. That is onset, and it links; the steady
    // window starts after it.
    const base = snapshot();
    const onset = [
      ...base.frames.slice(0, 2),
      frame(2, { samplingPrograms: [WOOD, 8], samplingDraws: 2, links: 1 }),
      ...Array.from({ length: MIN_STEADY_FRAMES }, (_, index) => frame(index + 3)),
    ];
    expect(
      judgeSampling({ snapshot: { ...base, frames: onset }, bookCount: BOOKS, threeCalls: CALLS }),
    ).toEqual([]);
  });

  it('passes a second sheet that lands late, though nothing links when it does', () => {
    // #385, as measured with one sheet held back 600 ms. The first sheet links
    // the mapped program and both draw until the second sheet lands; that one
    // switches to the program that already exists, so nothing links, and a
    // cutoff on links alone judged every frame in between as steady.
    const base = snapshot();
    const frames = [
      ...base.frames.slice(0, 2),
      frame(2, { samplingPrograms: [WOOD, 8], links: 1 }),
      ...Array.from({ length: 120 }, (_, index) =>
        frame(index + 3, { samplingPrograms: [WOOD, 8] }),
      ),
      ...Array.from({ length: MIN_STEADY_FRAMES }, (_, index) => frame(index + 123)),
    ];
    expect(
      judgeSampling({ snapshot: { ...base, frames }, bookCount: BOOKS, threeCalls: CALLS }),
    ).toEqual([]);
  });
});

describe('judgeSampling — what the phone measured dying', () => {
  it('fails the live site as it was: five programs and 386 sampling draws a frame', () => {
    const failures = judgeSampling(
      everyFrame(
        { samplingPrograms: [1, 2, 3, 4, WOOD], samplingDraws: 386, calls: 411 },
        roster([1, 2, 3, 4, WOOD]),
      ),
    );
    expect(clauses(failures)).toEqual(['(3)', '(4)']);
    expect(failures[0]).toContain('up to 5 programs');
    expect(failures[1]).toContain('up to 386 sampling draws');
  });

  it('fails the unmerged bookcase alone, at 11 draws, on the budget', () => {
    // One program — and eleven draws, which survived on the phone and is still
    // nearly three times the budget. The budget pins the shape that survived,
    // not a margin under an edge: where the edge lies is not known.
    expect(clauses(judgeSampling(everyFrame({ samplingDraws: 11 })))).toEqual(['(4)']);
  });

  it.each([12, 13])('fails %i draws a frame, where one program held and died', (draws) => {
    expect(clauses(judgeSampling(everyFrame({ samplingDraws: draws })))).toEqual(['(4)']);
  });

  it('fails one over the budget, so the constant is the line', () => {
    expect(clauses(judgeSampling(everyFrame({ samplingDraws: BUDGET + 1 })))).toEqual(['(4)']);
  });

  it('fails a frame weighed at 6 by one instanced call', () => {
    // The hook weighs an instanced call by its instances; the judge sees a 6.
    expect(clauses(judgeSampling(everyFrame({ calls: 1, samplingDraws: 6 })))).toEqual(['(4)']);
  });

  it('fails an onset frame over the budget, though the steady frames are fine', () => {
    const base = snapshot();
    const frames = base.frames.map((bucket) =>
      bucket.frame === 0 ? { ...bucket, samplingDraws: 9 } : bucket,
    );
    expect(
      clauses(
        judgeSampling({ snapshot: { ...base, frames }, bookCount: BOOKS, threeCalls: CALLS }),
      ),
    ).toEqual(['(4)']);
  });

  it('fails a frame the hook already dropped, through the running maximum', () => {
    expect(clauses(judgeSampling(run({ maxSamplingDraws: 13, dropped: 100 })))).toEqual(['(4)']);
  });

  it('fails two programs in a steady frame, which is not the shape that survived', () => {
    const failures = judgeSampling(everyFrame({ samplingPrograms: [WOOD, 8] }));
    expect(clauses(failures)).toEqual(['(3)']);
    expect(failures[0]).toContain('only one may read it');
  });

  it('fails a second member that reads the map from a program of its own, once the sheets land', () => {
    // The standing defect the settle must not excuse: the set changes when the
    // sheets land, as it does on every page, and then holds two programs.
    const base = snapshot();
    const frames = [
      ...base.frames.slice(0, 2),
      frame(2, { samplingPrograms: [8, 9], links: 1 }),
      ...Array.from({ length: 40 }, (_, index) =>
        frame(index + 3, { samplingPrograms: [WOOD, 9] }),
      ),
    ];
    const failures = judgeSampling({
      snapshot: { ...base, frames },
      bookCount: BOOKS,
      threeCalls: CALLS,
    });
    expect(clauses(failures)).toEqual(['(3)']);
    expect(failures[0]).toContain('40 of 40 steady frame(s)');
  });

  it('fails a set of readers that never stops changing, as unsettled', () => {
    // A book program that reads the map every other frame never settles, so it
    // is red on the settle rather than excused as onset.
    const base = snapshot();
    const frames = base.frames.map((bucket) =>
      bucket.frame % 2 === 1 && bucket.frame < 40
        ? { ...bucket, samplingPrograms: [WOOD, 8] }
        : bucket,
    );
    expect(
      clauses(
        judgeSampling({ snapshot: { ...base, frames }, bookCount: BOOKS, threeCalls: CALLS }),
      ),
    ).toEqual(['(2)']);
  });
});

describe('judgeSampling — a page that reads nothing is not a pass', () => {
  it('fails a page where no program samples the map: shadows are off, or it fell back', () => {
    const failures = judgeSampling(
      everyFrame({ samplingDraws: 0, samplingPrograms: [] }, roster([])),
    );
    expect(clauses(failures)).toEqual(['(3)']);
    expect(failures[0]).toContain('real-time shadows are off on this page');
  });

  it('fails a page with no hook at all', () => {
    expect(judgeSampling({ snapshot: undefined, bookCount: BOOKS, threeCalls: CALLS })).toEqual([
      '(1) the page hook never reported itself, so nothing on this page was counted',
    ]);
  });

  it('fails a hook that is installed and sees no context', () => {
    expect(clauses(judgeSampling(run({ contexts: 0 })))).toContain('(1)');
  });

  it('fails a shadow pass with fewer draws than books, since every book casts', () => {
    const base = snapshot();
    const frames = base.frames.map((bucket) =>
      bucket.frame === 0 ? { ...bucket, depthDraws: 2 } : bucket,
    );
    const failures = judgeSampling({
      snapshot: { ...base, frames },
      bookCount: BOOKS,
      threeCalls: CALLS,
    });
    expect(clauses(failures)).toEqual(['(1)']);
    expect(failures[0]).toContain('books stopped casting');
  });

  it('fails a lost context and a failed link', () => {
    expect(clauses(judgeSampling(run({ contextLost: true })))).toEqual(['(1)']);
    expect(clauses(judgeSampling(run({ linkFailures: 1 })))).toEqual(['(1)']);
  });

  it('fails no steady frames as vacuous, rather than passing every frame of none', () => {
    const failures = judgeSampling(run({}, 0));
    expect(
      failures.some((failure) => failure.startsWith('(2) the program set never settled')),
    ).toBe(true);
  });

  it('fails a page that never said it was ready', () => {
    expect(clauses(judgeSampling(run({ readyFrame: null })))).toContain('(2)');
  });

  it('fails a window one frame short of the settle', () => {
    expect(clauses(judgeSampling(run({}, MIN_STEADY_FRAMES - 1)))).toEqual(['(2)']);
    expect(judgeSampling(run({}, MIN_STEADY_FRAMES))).toEqual([]);
  });
});

describe('judgeSampling — the instrument checks itself', () => {
  it('fails a program the two classifiers disagree about', () => {
    const programs = roster().map((program) =>
      program.id === 2
        ? { ...program, byGl: true, samplers: ['directionalShadowMap:sampler2DShadow'] }
        : program,
    );
    const failures = judgeSampling(run({ programs }));
    expect(clauses(failures)).toEqual(['(5)']);
    expect(failures[0]).toContain(
      '#2 MeshStandardMaterial — GL says samples, the source says does not',
    );
  });

  it('ignores a disagreement on a program that never linked, which a lost context reads as nothing', () => {
    const programs = roster().map((program) =>
      program.id === 2 ? { ...program, linked: false, byGl: true } : program,
    );
    expect(judgeSampling(run({ programs }))).toEqual([]);
  });

  it("fails a hook whose draw count is not three's", () => {
    const failures = judgeSampling({
      snapshot: snapshot(),
      bookCount: BOOKS,
      threeCalls: CALLS + 1,
    });
    expect(clauses(failures)).toEqual(['(6)']);
    expect(failures[0]).toContain('the hook is not seeing what the renderer draws');
  });

  it('fails when there is no three count to hold the hook to', () => {
    expect(
      clauses(judgeSampling({ snapshot: snapshot(), bookCount: BOOKS, threeCalls: undefined })),
    ).toEqual(['(6)']);
  });
});

describe('steadyFrames', () => {
  it('starts at the ready frame and after the last link', () => {
    const base = snapshot({ readyFrame: 3 }, 10);
    const frames = base.frames.map((bucket) =>
      bucket.frame === 6 ? { ...bucket, links: 1 } : bucket,
    );
    expect(steadyFrames({ ...base, frames }).map((bucket) => bucket.frame)).toEqual([7, 8, 9, 10]);
  });

  it('is empty for a page that was never ready', () => {
    expect(steadyFrames(snapshot({ readyFrame: null }))).toEqual([]);
  });

  it('starts at the last frame whose readers changed, though nothing linked in it', () => {
    // That frame is the first of the set that stayed, so it is steady itself;
    // a link frame is not, because the link may have happened between draws.
    const base = snapshot({}, 10);
    const frames = base.frames.map((bucket) =>
      bucket.frame >= 2 && bucket.frame <= 5 ? { ...bucket, samplingPrograms: [WOOD, 8] } : bucket,
    );
    expect(steadyFrames({ ...base, frames }).map((bucket) => bucket.frame)).toEqual([
      6, 7, 8, 9, 10,
    ]);
  });

  it('starts at a change of readers the hook recorded in a frame it has since dropped', () => {
    const base = snapshot();
    const frames = base.frames.filter((bucket) => bucket.frame <= 10 || bucket.frame >= 30);
    const steady = steadyFrames({ ...base, frames, lastSetChangeFrame: 33, dropped: 19 });
    expect(steady.map((bucket) => bucket.frame)).toEqual([33, 34, 35, 36, 37, 38, 39, 40]);
  });

  it('starts after a link the hook recorded in a frame it has since dropped', () => {
    // Frames 1–10 kept from the start, the link in a dropped frame 20, and the
    // kept tail from 30: only the tail is steady, though no kept frame linked.
    const base = snapshot();
    const frames = base.frames.filter((bucket) => bucket.frame <= 10 || bucket.frame >= 30);
    const steady = steadyFrames({ ...base, frames, lastLinkFrame: 20, dropped: 19 });
    expect(steady.map((bucket) => bucket.frame)).toEqual([
      30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ]);
  });
});

describe('judgeSampling — the shadow pass has to be readable', () => {
  it('fails a snapshot that lost frame 0, rather than reading it as no casting', () => {
    const base = snapshot();
    const failures = judgeSampling({
      snapshot: { ...base, frames: base.frames.slice(1) },
      bookCount: BOOKS,
      threeCalls: CALLS,
    });
    expect(failures).toContain(
      '(1) frame 0 is missing from the snapshot, so the shadow pass cannot be read',
    );
  });
});

describe('judgeControl — ?receivers=all must come back red, for the right reason', () => {
  const control = (): SamplingRun =>
    everyFrame(
      { samplingPrograms: [1, 2, 3, 4, WOOD], samplingDraws: 302 },
      roster([1, 2, 3, 4, WOOD]),
    );

  it('accepts a control red on both counts', () => {
    expect(judgeControl(control())).toEqual([]);
  });

  it('fails the gate when the control is judged green: the instrument cannot see a book program', () => {
    const failures = judgeControl(run());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('the instrument cannot see a book program');
  });

  it('fails the gate when the control is red only because nothing was counted', () => {
    expect(judgeControl({ snapshot: undefined, bookCount: BOOKS, threeCalls: CALLS })[0]).toContain(
      'never reported the hook',
    );
    const blind = everyFrame({ samplingDraws: 0, samplingPrograms: [] }, roster([]));
    expect(clauses(judgeControl(blind))).toEqual(['(8)', '(8)']);
  });

  it('fails the gate when the control is red on a budget but reads one program', () => {
    const failures = judgeControl(everyFrame({ samplingDraws: 40 }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('a book program should be reading it');
  });

  it('fails the gate when the control never settled', () => {
    const unsettled = {
      ...control(),
      snapshot: { ...snapshot({}, 3), programs: roster([1, WOOD]) },
    };
    expect(judgeControl(unsettled).some((failure) => failure.includes('never settled'))).toBe(true);
  });
});

describe('describeSampling', () => {
  it('prints the numbers a report and a phone check share', () => {
    expect(describeSampling(run())).toBe(
      '40 steady frames, 1 sampling program(s), 2 sampling draws a steady frame (2 at most), ' +
        '43 casting draws, 7 programs linked',
    );
  });

  it('prints one count of programs, since a change of readers ends the steady window', () => {
    // Steady frames disagreed once — 1–2 programs — and that was the #385 flake:
    // the frames before a late sheet landed. A change now restarts the window,
    // so a settled page holds one set; a range needs a snapshot whose change
    // record was lost, and the hook no longer produces one.
    const base = snapshot();
    const frames = base.frames.map((bucket) =>
      bucket.frame === 5 ? { ...bucket, samplingPrograms: [WOOD, 8] } : bucket,
    );
    expect(
      describeSampling({ snapshot: { ...base, frames }, bookCount: BOOKS, threeCalls: CALLS }),
    ).toContain('35 steady frames, 1 sampling program(s)');
  });

  it('says there was no hook', () => {
    expect(describeSampling({ snapshot: undefined, bookCount: BOOKS, threeCalls: CALLS })).toBe(
      'no hook',
    );
  });
});
