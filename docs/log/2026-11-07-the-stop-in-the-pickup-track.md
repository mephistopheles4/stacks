# The stop in the pickup track

**Date:** 2026-11-07. **Issue:** [#531](https://github.com/mephistopheles4/stacks/issues/531).
**Where it lives:** `packages/site/src/shelf/pickup-track.ts` and its test.

A picked-up book now stops closed, and the visitor opens it. The spec
(`docs/spec/picking-up-closed.md`, S4) named the one thing to prove first: that
a GSAP timeline can stop once going forward and pass the same point going
backward, "which nobody has run".

## What was measured

Against `gsap@3.15.0`, stepped by hand as the shelf steps it, with the timeline's
two ends at 0 and 2 s and the stop at 1 s.

| Mechanism | Forward onto the stop | A large step across it | Backward through it | Played on from the stop |
| --- | --- | --- | --- | --- |
| `addPause(1, cb)` | pauses at exactly 1.000, however far the step overshot | pauses at 1.000 | **pauses there too** | passes, no second pause |
| `call(cb, undefined, 1)` with `pause()` inside | pauses at 1.100: overshoots | pauses at 1.100 | passes (a `reversed()` guard skips it) | |
| `call` with `pause(1, true)` inside | pauses at 1.000 | pauses at 1.000 | passes | **fires again from the stop** and pauses again |

So `addPause` is the only one that both snaps and does not fire again when played
on, and it also stops a reverse. The track
uses it and resumes the reverse from inside the callback (`tl.resume()`), which
measured as continuous: playhead 0.8 after 1.2 s of reverse from the end at 2.0, with no frame lost.

## What the real-library test then found

The first draft jumped to the closed rest with `tl.pause(closed, true)`. Played
on from there, the book **stopped again where it stood and never opened**: a
pause placed exactly on an `addPause` fires it again. `finish()` now lands
0.1 ms past the stop (`REST_PAST_STOP`), far below a frame and an opening angle
far below the gate's 0.5°. The test that found it is "plays on from a jump to
the rest without stopping there again".

## Where it matters

`retime()` (the tuner), `finish()` (reduced motion) and any put-back followed by
a catch all pass through a jump or a pause at the stop. Each has a unit test in
`pickup-state.test.ts` against a fake track, and the real library is exercised by
`pickup-track.test.ts` alone: a fake could not have said any of this.
