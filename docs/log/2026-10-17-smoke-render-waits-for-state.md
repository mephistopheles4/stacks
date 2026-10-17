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
