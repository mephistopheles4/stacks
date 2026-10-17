# 2026-10-17 — `smoke:render` waits for state, not for time

[#436](https://github.com/mephistopheles4/stacks/issues/436), built from
[`docs/spec/smoke-render-waits.md`](../spec/smoke-render-waits.md). Every wait in
`scripts/smoke-render.ts` is now one of five kinds, named once at
`STATE_WAIT_FLOOR_MS`: a presence is polled to a 30 s floor, an absence stays a
fixed wait with its reason beside it, a search keeps a short deadline, a window
is a number of frames, and a frame sync stays a double
`requestAnimationFrame`. No gate row's assertion changed, so `docs/gates.md`
needed no edit; G60's loop count now prints `30 frames, 1 loop`.

## What the build added

- `scripts/lib/settle.ts`, with its spec: the pure count of how many frames the
  renderer's `textures|programs` reading has held still, and the page-side
  recorder that feeds it. The settle helper in the gate pairs it with a count of
  image requests in flight, attached before `goto`.
- The main shot, G59, G60's `visit` and G61 settle through that helper. The two
  fixed 1.5 s sleeps (D1, D2) are gone.
- A presence timeout prints what was awaited and what the shelf holds, and a
  loop over books stops at the first one.

## A trap the build met

The recorder runs on every frame, and G60 counts `requestAnimationFrame`
callbacks per frame to find a second render loop. A callback of the recorder's
own would read there as a second loop on every case. `COUNT_FRAMES` keeps the
unwrapped function as `window.__rawRaf` and the recorder uses it. The recorder
also catches a throw from `stats()`, because G60 loses contexts on purpose and
a throw in a frame callback is a page error.

## The throttle findings (spec S6.1)

Two throwaway draft pull requests, one cut from `main` and one from the build,
each carried the temporary empty `SMOKE_ARGS` commit and a probe commit that
set the CPU throttling rate and added network latency on every page the gate
opens through CDP. Both were closed unmerged and their branches deleted.

- **A CPU throttle barely bites here.** At 4x, the first frame took about 2.3
  times longer to arrive, but the first non-zero fps fell only to 0.61 of the
  unthrottled reading on `main` and 0.68 on the build, short of the half the
  spec asks. SwiftShader rasterises outside the throttled main thread, as the
  spec warned. `main` stayed green at 4x.
- **CPU 6x plus 400 ms latency turned `main` red at one wait** (G61's held-book
  page) and left the build green. One wait is not the two the spec asks of a
  control, and the owner's decision was one stronger try and then no more, so
  the eight green samples and the planted breaks are the proof.
- **The planted breaks all ended red with the report printed**: a no-op
  `pickUp` in 3.7 minutes, a cover that never answers in 42 seconds, a second
  render callback per frame in 89 seconds. The first of them crashed the run
  before its report, because `history.back()` with nothing held left the page.
  The two later pickups in G35 now end the check on a timeout.
- **K8's margin held**: the longest click-to-pickup under the 4x throttle was
  21 ms against its 4 s deadline.
- **The settle costs time on a runner with no GPU.** Unthrottled, G60 took
  390.5 s on the build against 272.6 s on `main`, because each of its twelve
  boots now waits for 10 still frames.

## What the proof rests on, and the owner's calls

- **The CI proof is eight green samples plus the planted breaks**, not a control
  that bit. The control did not meet the spec's own test, so the case went to the
  owner, who chose one stronger throttle and then, whatever it showed, to accept
  the samples. The samples are the eight attempts of run 39036079082, `suite
  (node 24)`, all green, with G60 and G61 running on the pull request through the
  temporary empty `SMOKE_ARGS`, since reverted.
- **The wall time is under the spec's limit by 1.6 s.** The build's median over
  the eight samples is 692.7 s against 694.3 s (`main`'s last three push runs'
  median of 578.6 s, plus 20%). That is +19.7%, and four of the eight samples
  are individually over. Nearly all of it is G60, which waits for 10 still frames
  at each of its twelve boots. Winning that time back is
  [#397](https://github.com/mephistopheles4/stacks/issues/397)'s work.
- **The owner accepted the before-and-after screenshot as unchanged**, so D1's
  settle stands and no fixed 1.5 s was put back. The two pictures differ in the
  bookcase's wood figure only, which is expected: `main` takes the shot with no
  `woodSeed` and the scene draws a fresh seed when none is given.
- **ADR-0108's words about these waits no longer hold.** It said the two 1.5 s
  settles stand for textures landing and a damped camera stopping, that the shelf
  exposes no state for either, and so a poll would be only a shorter guess, and
  that the 300 ms Thoughts wait has no state either. The spec's probe overturned
  that: the counts `window.__shelf.stats()` already returns, with the image
  requests in flight, are the state for the first, the camera does not move after
  `ready`, and `held().thoughts` is the state for the second. ADR-0108's decision
  to keep G60 and G61 off pull requests is untouched.

## A full-path local run, before the proof on CI

`pnpm smoke:render` with no flag, on the workstation (GPU), green:

| Step | Seconds |
| --- | --- |
| build the site (fixtures and astro) | 15.5 |
| boot, settle and screenshot | 1.4 |
| G35 pickup | 11.2 |
| examining | 22.1 |
| page at 375x812 | 2.2 |
| open spread | 14.0 |
| G59 large-library-lit | 4.5 |
| G60 context-loss-fallback | 22.9 |
| G61 one-shadow-reader | 5.8 |
| G64 tuner-split | 2.9 |
