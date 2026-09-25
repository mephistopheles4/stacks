# ADR-0090 — Real-time shadows are the default

**Date:** 2026-09-25
**Status:** proposed — the default is the owner's decision
([#381](https://github.com/mephistopheles4/stacks/issues/381)); the trades
under *What it costs* are theirs to accept, as ADR-0088's and ADR-0091's are
**Ticket:** [#381](https://github.com/mephistopheles4/stacks/issues/381)
**Supersedes, in part:** [ADR-0016](./0016-painted-shadows.md) — its decision
that the shelf paints its shadows *instead of* rasterising them, and its entry
"Deliberately not a *fallback*"
**Builds on:** [ADR-0088](./0088-one-program-samples-the-shadow-map-in-two-draws.md),
[ADR-0091](./0091-a-lost-context-falls-back-to-painted-shadows.md)

## Decision

One configuration, decided as a whole, the way
[ADR-0085](./0085-a-renovation-is-declared-and-the-window-may-survive.md)
records its pieces: any one of them alone would have been the wrong change.

1. **Real-time shadows are on for every visitor.**
   `DEFAULT_SETTINGS.shadows.enabled` is `true`. A bare URL gets the shadow map;
   `?shadows=0` shows the painted path on purpose.
2. **Only the bookcase reads the map, in 2 draws from 1 program at every
   library size.** Books cast and compile no shadow fetch; the woodwork is one
   mesh ([ADR-0088](./0088-one-program-samples-the-shadow-map-in-two-draws.md)).
   `?receivers=all` keeps the old path, as the upstream reproduction.
3. **What the books stopped receiving is painted back** — the plank's band
   across the covers and a neighbour's wedge — and reads no map (ADR-0088,
   decision 6).
4. **Painted is the fallback, no longer the default.** A context lost while the
   shelf samples the map rebuilds it painted, and the device starts painted for
   30 days; the page reacts to a failure it saw, never to a device it guessed
   ([ADR-0091](./0091-a-lost-context-falls-back-to-painted-shadows.md)).
5. **The painted shading stays on under the real-time path.** It is what draws
   the contact shadows, the recess and the cover shade. Where it and the shadow
   map shade the same surface they darken it twice — ADR-0016 recorded that in
   August, and every look measured since was painted plus real. Accepted for
   now, and routed to the owner's screenshot review. **The owner has judged
   it**: the painted pieces the map casts step aside beside it — see
   [The painted pieces the map casts step aside](#the-painted-pieces-the-map-casts-step-aside).
6. **No browser flag is ever part of a fix.** A setting on a visitor's browser
   is not something this site can ship, and the one flag examined — ANGLE's
   Vulkan backend on Android — was prepared on the phone and never run.
7. **G61 (`one-shadow-reader`) holds items 1 and 2 on the default page.**
   Exactly one program reads the map there, in at most 4 draws a frame, at the
   50-book fixture and at a generated 300-book one; `?receivers=all` is its
   control and must come back red.

## Context

In August every real-time configuration lost the WebGL context on the owner's
Pixel 10 Pro within a minute, down to one that drew nothing into the map, so
the shelf painted its shadows instead (ADR-0016). The owner wants real-time
shadows for everyone, so #381 measured the failure again on a Pixel 10 Pro XL
(PowerVR D-Series DXT-48-1536, driver `25.3@6908880`, Chrome 153, ANGLE on
GLES), over about 230 runs with shader hooks on the live site. It is not memory
and not time, and it depends on what reads the shadow map:

- five programs read it on the live site, and the page died at frame 8 ± 1
  after about 3,474 such draws, and at the same frame throttled to 1.9 fps;
- with only the bookcase's program reading it, the page survived every run, up
  to 300 s;
- one program sampling alone survived **12** sampling draws a frame and died
  at **13**, which was written down as the rule.

⚠️ **The rule did not survive its falsifier.** On this build, 2 programs at 53
sampling draws a frame held 120 s where the rule predicted a death, so what
kills the context is not known; ADR-0088 has the correction and the runs. The
shipped default is a configuration measured to survive, and that is all this
record claims for it.

ADR-0088 built the configuration that survived, ADR-0091 built what a device
does when it does not, and on the phone `?shadows=1` on that build held 120 s
at 60 fps with no loss. On this build the default page itself held 120 s in
four runs of four, measured by `scripts/phone-check.ts`, with G61's counts taken
on the device green there too: 1 program, 2 sampling draws a frame — while
`?receivers=all` lost its context 1.2 s in, through the same script. A Galaxy
S25 (Adreno) and the iOS simulator held `?shadows=1` fine even before any of
this.
The narrative, including what did not work, is in
[the log](../log/2026-09-25-real-time-shadows-by-default.md).

## Why a default, and not an opt-in

ADR-0016's own August entries set the rule: *"Shadows stay on by default
anyway — owner's call"*, and *"Whatever survives becomes the default for
everyone."* Painted was what survived then. With one reader in two draws,
real-time is what survives now on the one device that ever failed, so the same
rule makes it the default. Deciding by device was rejected in August — *"mobile"
is not detectable in any way that stays true* — and is rejected again: the
fallback reacts to an observed loss, the same code for every visitor.

## Why a fallback is right here, where ADR-0016 said it was not

ADR-0016 ended its log with *"Deliberately not a fallback"*. That entry was
about a **shader that will not link**: swapping silently to painted would have
turned a clean failure into one you had to dig for, and the recovery could not
be observed failing on the hardware that mattered. Neither holds for a **lost
context**. It is an event the page sees; the fallback says what it did on the
black box's `fallback` line and in the shelf's profile; and G60
(`context-loss-fallback`) drives it in a browser on every run. A link failure
keeps its halt and its sentence, as ADR-0091 leaves it.

## Why a gate, and why this one

No gate read what the renderer compiles, so a change that put the books back
on the map — five programs, 302 sampling draws a frame on the 50-book fixture —
would have been green everywhere and lost the context on the phone at frame 8.
G61 counts it on a desktop, because **three assembles every program in
JavaScript**: the prefix, the chunks, the defines and which materials share a
program are decided before the GPU sees a line, so headless desktop Chrome
compiles the programs the phone compiles. Measured: the phone's counts equalled
the desktop's in all 24 runs of the ceiling round. The one thing a driver
decides is whether a declared sampler is *active*, which is why G61 classifies
every program twice — by GL and by its source — and fails when they disagree.

**The budget is 4 sampling draws a frame.** The bookcase makes 2, the shape
measured to survive, which leaves 2 for a member that one day needs its own
mesh. It was written as a third of the measured edge; since that edge did not
generalise (ADR-0088), it is a pin on what survived and not a margin under
anything. A budget raised whenever it fails is a comment; the answer to a red
is to find which program started sampling, and then to run
`scripts/phone-check.ts`.

## What it costs

- **Every visitor holds the 2048² shadow target**: 32 MB, measured at 23.8 →
  55.8 MB in [the settings taxonomy](../research/live-settings-taxonomy.md).
  G15 counts covers only, and its own comment names the shadow map as outside
  the number; no budget moves.
- **One more program and one shadow pass.** At the 50-book fixture the default
  page goes from 7 programs and 67 textures to 8 and 69; draws a frame stay at
  315, because the map is drawn once, at first paint. Option B, below, then
  takes one texture and one draw a shelf back off: 65 and 311 there.
- **The double darkening of item 5** — judged by the owner, and resolved by
  option B below.
- **PCF only.** `?shadowtype=basic` with only the bookcase reading the map still
  died, at frame 11; `vsm` was never run.
- **One device measured.** Another GPU could have a lower edge, and nothing here
  would go red: G61 pins the configuration that survived, not survival. The
  Galaxy S25 and the iOS simulator have not been run on this build.
- **A still-broken driver loses one context a device every 30 days**, when the
  record expires and real-time is tried again (ADR-0091).
- **The README's image still shows the painted look.** Regenerating it is the
  owner's call, against a screenshot.

## The painted pieces the map casts step aside

**Date:** 2026-09-25 — the owner's decision on
[#381](https://github.com/mephistopheles4/stacks/issues/381), option B, taken
against the four-state screenshots of item 5.

Beside the shipped map, the painted shading darkened the same wood twice. So
when the shelf runs the shipped real-time configuration — shadows on, casters
on, fetch on, `receivers: 'bookcase'` — the painted pieces that imitate a shadow
the map now draws step aside, and the pieces the map does not draw stay.

| piece | beside the shipped map | why |
| --- | --- | --- |
| backboard shade | dropped | the map casts the plank and the upright on the back wall |
| upright wedge across each plank | dropped | the map casts the upright |
| soft body of each contact shadow | dropped | books cast into the map, and the planks read it |
| contact root | kept | the tight line where a book meets the wood, which the map does not draw |
| plank corner and recess | kept | ambient darkening, which a directional shadow does not model |
| cover shade and neighbour band | kept | books read no map, so these are the only bands on a cover |

Everywhere else the full painted set draws exactly as before: with shadows off —
`?shadows=0` and the painted fallback of ADR-0091 — under `?casters=0` and
`?shadowfetch=0`, where no real shadow reaches the bookcase, and under
`?receivers=all`, the upstream reproduction. The owner named three keys;
`casters` joined them because stepping aside over an empty map would leave the
bookcase with no cast shadow at all. Map size and filter are not in the test: a
512 map, or a `basic` one, still draws the shadow. The decision is one pure,
specced function, `paintedPieces` in `painted-pieces.ts`, and a live shadow
toggle behind `?debug` repaints from it, so the panel shows what a reload would.
No strength was retuned.

Measured on the 50-book fixture at `?woodSeed=review`, in headless Chrome, as
mean luma (0–255) over two fixed rectangles: the empty bottom shelf, and the
band of backboard under that shelf's plank.

| state | desktop empty shelf | desktop backboard | phone empty shelf | phone backboard |
| --- | --- | --- | --- | --- |
| no shading (`?shadows=0&painted=0`) | 55.3 | 54.2 | — | — |
| painted only (`?shadows=0`) | 49.2 | 36.3 | 47.5 | 36.1 |
| real only (`?painted=0`) | 47.9 | 33.3 | 44.9 | 33.5 |
| **default, option B** | **46.2** | **28.6** | **43.7** | **28.5** |
| default before B (both) | 43.6 | 22.3 | 40.5 | 22.3 |

The desktop is 1440×900; the phone is 527×1003 at a pixel ratio of 2.55 with
an Android user agent. B still sits below real only on the backboard, because
the recess it keeps lies over the top of every shelf. Against the build before
B, `?shadows=0`, `?casters=0` and `?shadows=1&receivers=all` rendered the same
image: at most one level apart on at most 115 pixels, the order of the headless
renderer's own run-to-run noise, which was 8 and 89 pixels between two loads of
one build. A live toggle off and back on matched a fresh load of each state to
the same level. The default page drops one texture and one draw a shelf: 69 →
65 textures and 315 → 311 draws at four shelves.

## Alternatives

- **Painted by default, real-time behind `?shadows=1`.** What shipped from
  August. The owner decided against it.
- **Deciding by device.** Rejected in August and in ADR-0091: a rule about
  visitors nothing here can test.
- **ANGLE's Vulkan backend on Android.** A browser flag, which item 6 rules out,
  and a site cannot set one anyway. Chromium widened its ANGLE-on-Vulkan field
  trial to Imagination drivers upstream on 2026-09-14, so what this phone runs
  may change with no change here — which is one more reason the gate pins a
  configuration rather than a device.
- **Waiting for a driver fix.** Android 17 QPR2 Beta 4 cites a fix for Google
  issue 541322087 on the same driver build — a different trigger, vertex colours
  in a shadow-receiving program, which does not reproduce on this device.
  Whether it touches this one is unknown.
- **`WebGPURenderer`.** A renderer migration, not a fix; see ADR-0088.
