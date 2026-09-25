# ADR-0091 — A lost context falls back to painted shadows, and the device remembers

**Date:** 2026-09-25
**Status:** proposed
**Ticket:** [#381](https://github.com/mephistopheles4/stacks/issues/381)
**Builds on:** [ADR-0088](./0088-one-program-samples-the-shadow-map-in-two-draws.md)

## Decision

1. **A context lost while the shelf samples the shadow map ends real-time
   shadows for that page.** The page writes one small record first, then
   redraws the shelf painted: on the same canvas if the browser restores the
   context within 2.5 s, on a new `<canvas>` if it does not, and with a
   sentence if neither is given a context. One attempt a page; a second loss
   only says so. See
   [`context-recovery.ts`](../../packages/site/src/shelf/context-recovery.ts).
2. **Later loads read the record and start painted.** The record is
   `{ v: 1, at, gpu? }` under `stacks.shadows.fallback.v1` in `localStorage`,
   and nothing else. It holds for 30 days from the loss and is never refreshed
   by a load. A record whose GPU string differs from this device's is retired.
   See [`shadow-fallback.ts`](../../packages/site/src/shelf/shadow-fallback.ts).
3. **The URL beats the record, in both directions.** The record chooses only
   the base the URL is folded onto: `PAINTED_BASE`, which is the defaults with
   `shadows.enabled` false and nothing else changed. So `?shadows=1` turns
   real-time shadows on over a record, `?shadows=0` forces painted with or
   without one, and a URL that says nothing follows the record. The precedence,
   highest first: the URL's `?shadows=`, then the record, then
   `DEFAULT_SETTINGS`.
4. **Only an observed failure writes.** A loss writes a record only when the
   live settings sample the map, the page is visible and no program failed to
   link. A painted page, a hidden page and a shader-link failure write nothing
   and keep the behaviour a loss had before this record: a notice, and a resume
   in place, or the link failure's halt.
5. **Nothing decides by device.** No user agent, GPU name, memory figure or
   platform check chooses a path. The GPU string is compared only with itself,
   to retire a record on the same device.
6. **A restore never resumes real-time shadows.** The restored-context handler
   may dispose the shelf, and a disposed shelf never draws again: both
   `handleContextRestored` and `renderLoop` check `disposed`.
7. **The debug panel writes the URL as a difference from the page's base.** A
   remembered device's `?shadows=0` never reaches a link somebody shares.
8. **`?debug` shows it and can undo it.** The black box gains a `fallback` line
   and a `forget` button, shown only while a record exists.

## Context

Real-time shadows become the default for every visitor (#381). On the Pixel 10
Pro XL a context is lost in a count of draws that sample the shadow map, and
ADR-0088 keeps that count far below the ceiling measured on the device. A driver
that loses a context anyway must not lose it on every load, and the owner ruled
out deciding by device in August: *"mobile" is not detectable in any way that
stays true*
([the mobile crash](../log/2026-08-01-the-mobile-crash-g15.md)). So the page
reacts to a loss it saw, the same code for every visitor.

**The old restore path reproduced the crash.** `scene.ts` resumed its render
loop on the same renderer, and three's restore handler re-runs
`initGLContext()` and keeps `shadowMap.enabled` (`WebGLRenderer.js:1111-1131`),
so the same sampling programs linked again. Measured on the device in
September: in two runs the context came back about 1.15 s after the loss and
died again after 3,088 and 3,474 more sampling draws.

## What the phone showed

Measured on 2026-09-25 against a build of this change, over USB. The log has
the runs: [a lost context falls back to painted](../log/2026-09-25-a-lost-context-falls-back-to-painted.md).

- **A real driver loss reached neither rebuild.** Four losses under
  `?shadows=1&receivers=all`, four the same: the GPU process exited
  (`GPU process exited unexpectedly: exit_code=0`), no restore arrived, and the
  new canvas at 2.5 s was refused with `Web page caused context loss and was
  blocked`. A probe asking for a context every 4 s in the same page was
  refused to +24 s. The page ended on the failure sentence, with the record
  written.
- **The record is what worked.** A reload came back remembered, painted and at
  60 fps: at about 17 s and 73 s after the loss. At about 9 s it was refused,
  and the page said so. That is two points either side of the edge, and no
  claim about where the edge is.
- **Both rebuilds work on the device when a context is handed out.** A
  synthetic loss restored after 0.5 s rebuilt painted on the same canvas; one
  left unrestored rebuilt on a new canvas at 2.5 s. Both then ran at 60 fps.
- **The GPU string carries no driver build.** Chrome 153 reports
  `ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES
  3.2)`. The design assumed the build was in it. So a driver update alone
  retires nothing, and the expiry is what gives an updated driver its retry.
- **`?shadows=1` itself held.** With only the bookcase reading the map
  (ADR-0088), the page ran 120 s at 60 fps and wrote no record. It is the first
  run of the site-side change on the phone.

## What it costs

- **One loss a device, every 30 days, while the fault lasts.** The first load
  after a record expires samples the map again, and a still-broken driver loses
  one more context. The retry is the point: a fixed driver gets real-time
  shadows back with nobody touching anything.
- **False positives fall toward painted.** `exit_on_context_lost` takes every
  context in the browser down, so another tab's crash can mark a visible,
  sampling page. It then stays painted for up to 30 days, which is the look
  that shipped for months, never a loss.
- **Storage that refuses still falls back, and remembers nothing.** A
  still-broken device then loses one context a load. There is no second store
  to fall back to.
- **A shader-link failure is not covered.** It keeps its halt and its own
  sentence and writes nothing. Whether it should also fall back is open.
- **The black box's promise narrows.** `diagnostics.ts` said nothing is written
  to a visitor's device unless they ask. That stays true of the black box; the
  shelf now writes this one record, after an observed failure, and says so
  there.
- **A same-canvas rebuild warns.** Disposing the restored shelf deletes handles
  from the lost context on the restored one, and Chrome logs a burst of
  `INVALID_OPERATION: delete: object does not belong to this context`. They
  are warnings; the page ran on at 60 fps.

## Alternatives

- **Deciding by device.** Rejected by the owner in August, and it is the rule
  this record exists to keep: a device check is a rule about visitors that
  nothing here can test.
- **A `pagehide` canary** — mark the session on load, clear it on `pagehide`,
  and treat a leftover mark as a crash. The OS kills background tabs without
  firing `pagehide`, so it reads ordinary tab eviction as a GPU failure.
- **Keying the record to the deploy's build id.** Every content deploy would
  cost a broken device one more loss.
- **A hand-bumped epoch constant.** Nothing checks that anybody bumps it.
- **Turning shadows off in place on a restore.** A second route to the painted
  look, built from a scene that was mounted for real-time shadows. A rebuild
  from `PAINTED_BASE` is the same code a remembered load runs.
- **`location.reload()` after a loss.** A navigation the visitor did not ask
  for, and on this device a reload inside the block is refused anyway.
- **Refreshing `at` on every painted load.** It would make the record
  permanent, and a fixed driver would never be tried again.
- **Clearing the record once real-time shadows have survived a while.** The
  fault is a count of draws, not a time, so a long survival proves nothing
  about the next frame.
