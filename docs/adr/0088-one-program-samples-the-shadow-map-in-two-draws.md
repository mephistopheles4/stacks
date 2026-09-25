# ADR-0088 — One program samples the shadow map, in two draws

**Date:** 2026-09-24
**Status:** proposed
**Ticket:** [#381](https://github.com/mephistopheles4/stacks/issues/381)
**Supersedes, in part:** [ADR-0016](./0016-painted-shadows.md)'s finding that
nothing reading a shadow map survives on the Pixel 10 Pro

## Decision

1. **The woodwork is one mesh.** Both uprights and every plank are built at the
   origin, moved into place, and joined by `joinWoodwork` into one geometry
   under the existing `wood` material. The backboard stays a mesh of its own.
   The bookcase draws in **2 calls at every library size**, where it drew
   `rowCount + 4`. See
   [`woodwork.ts`](../../packages/site/src/shelf/woodwork.ts).
2. **The join throws; it never falls back to one mesh per member.** An empty
   list, or members that disagree about their attributes, is an error. A
   fallback would render correctly on every desktop and quietly bring back the
   draw count this record exists to remove.
3. **Under the real-time path, a book casts and does not receive.** Every lit
   part of a book is compiled with no shadow sampler: its material's
   `onBeforeCompile` puts `#undef USE_SHADOWMAP` at the top of the fragment
   body, under a constant `customProgramCacheKey`. The page block still draws
   into the map. The bookcase's program is the only one that reads it. See
   [`shadow-receivers.ts`](../../packages/site/src/shelf/shadow-receivers.ts).
4. **It is a setting, `shadows.receivers`, and not a constant.** `bookcase` is
   the default. `all` is what `?shadows=1` drew until today, reached by the flat
   probe `?receivers=all`. It is rebuild-class, like `casters`.
5. **The default page does not change here.** `shadows.enabled` stays `false`
   in this change, so a visitor still gets the painted shading and no shadow
   map. The owner has decided that real-time shadows become the default
   (#381); that lands separately, with the fallback for a lost context.
6. **What the books stopped receiving is painted back as the cover shade.** One
   mesh lays a quad on every face-out cover and samples one atlas of masks. A
   mask is the union of three cast shadows: the plank above, the right-hand
   upright, and every book to the right, taken as its page block. The strength
   is one `opacity`, fitted against `?receivers=all`. It is drawn whenever there
   is painted shading and the books do not read the map, which includes today's
   painted default. It is not drawn under `?receivers=all`, which stays the
   reference. See [`cover-shade.ts`](../../packages/site/src/shelf/cover-shade.ts).

Together, `?shadows=1` samples the map in **2 draws from 1 program** under the
default species, at every library size. Under `flat`, or before a sheet
decodes, it is 2 programs at 1 draw each.

## Context

Real-time shadows (`?shadows=1`) lose the WebGL context on the Pixel 10 Pro XL
(PowerVR DXT-48-1536, driver 25.3@6908880, Chrome 153, ANGLE on GLES), and the
owner wants them on by default. It dies at frame 8 ± 1, after about 3,474 draws
that sample the map. It counts draws, not time: throttled to 1.9 fps, it died at
the same frame with the same count. Flushing after every draw did not move it.

What separates the survivors from the deaths is how many **programs** sample the
map. The site had five that did: spines, pages and head caps, boards, covers,
and the bookcase's one wood-and-backing program. Hooks that edited the shaders
on the live site, 120 s a run:

| what samples the map | result |
| --- | --- |
| the bookcase's program only | survived 3/3, then 300 s, then 120 s of orbiting |
| the four book programs only | lost 2/2, frame 8 |
| all five, with `receiveShadow` sent as `0` | lost 2/2, frames 8 and 9 |
| nothing, map still drawn | survived 2/2 |

And the one surviving program has a ceiling:

- **One program that samples the shadow map survives 12 sampling draws a
  frame and dies at 13.** At 12 the page ran 120 s twice and 300 s once; at 13
  it died twice, at frame 134. A second sampling program lowers the ceiling.
- **The bookcase's program made `rowCount + 4` of them**: the backboard, two
  uprights, and a plank per shelf plus the lid. `rowsForBookcase` keeps one
  empty row ahead, so that is `max(usedRows + 5, 6)`. It was 11 on the live
  library, reached 13 at about 66 books, and would be about 27 at the brief's
  200-book target.

So taking the books off the map was not enough on its own: the bookcase alone
would have crossed the line as the library filled. The mechanism below the
driver is not known and nothing here claims one. What is known is which
configuration holds.

## Why the backboard stays a second draw

- **One draw carries one `map` and one `normalMap`.** The backboard wears
  `dark_wood` at 512, a fibre turned a quarter turn, and its own roughness and
  colour knobs, all live on the panel.
- **An atlas is out.** Both sheets rely on `RepeatWrapping` far past `0..1`,
  and a sub-rectangle cannot wrap without `fract()`, which breaks mip selection
  at the seams.
- **A texture array is out.** Its layers must be one size, 1024 against 512, so
  one sheet would be resampled.
- **Under the default species both still compile to one program** once both
  sheets have decoded, because three keys a program on its defines rather than
  on its material.

## Why `receiveShadow = false` is not the fix

It is the obvious change, and ADR-0016 already ruled it out in August, for the
right reason. three keys `USE_SHADOWMAP` on the renderer alone
(`WebGLPrograms.js:359`) and sends `receiveShadow` only as a uniform
(`WebGLRenderer.js:2690`). The program still declares the sampler, still binds
the map, and the ternary around the fetch is a decision the driver's compiler
gets to make. The third row of the table is exactly that configuration, and it
died like the unmodified page. `receiveShadows` does set the flag, so the scene
graph says what the programs do, but the flag is the label and the `#undef` is
the mechanism.

## What it costs

- **Per-member culling and identity.** Nothing read either: the picker
  raycasts books only, the shadow camera is fitted from constants, and
  `Bookcase` hands out materials, not meshes. The woodwork now draws whenever
  any of it is in view.
- **The join's pixels are not identical.** The join itself moves at most 4
  pixels, all at one junction. Baking each member's position into its vertices
  is what moves the rest: it changes the arithmetic the GPU does to place them.
  On faces seen at a grazing angle, that moves up to 348 pixels by up to 26
  levels, against a pass criterion of none over 1 set before the run. The
  measurements, the controls that isolate the cause, and why no join can meet
  that criterion are in [the log](../log/2026-09-24-the-woodwork-is-one-mesh.md).
- **Books lose the shadows they received, and that is visible.** The plank
  throws a band across the top of every face-out cover, and a taller book
  throws a wedge on its neighbour; under `bookcase` both are gone. On the
  50-book fixture that moves 1.6% of a desktop frame by more than 1 level,
  worst 71; on the live library, 5.4% of the page moved by more than 8 levels.
  The bookcase keeps its real shadows. The cover shade (decision 6) paints the
  band and the wedge back; what it leaves is below.
- **PCF only.** `?shadowtype=basic` with only the bookcase receiving still died,
  at frame 11 after 132 sampling draws, which is a trigger of its own. `vsm` was
  not run. Under it, this change also takes the books' non-casting parts out of
  the map, since three draws every VSM receiver into it
  (`WebGLShadowMap.js:515`).
- **It rests on three's prefix and body split.** `shadow-receivers.test.ts` pins
  the half a unit test can reach: that the sampler is declared in the body the
  hook edits. The prefix half needs a context, and nothing pins it yet.

⚠️ **Two trades here are the owner's to accept, and this record does not accept
them**: the join's pixel shortfall, and what the cover shade does not give back
of the band the books lose. The record stays `proposed` until both are settled.

`?receivers=all` is the old `?shadows=1`, byte for byte under SwiftShader, so
every earlier measurement and the painted shading's differenced strengths keep
a reference.

## The cover shade

A face-out book stands a quarter of a unit behind the spines, deep enough under
the plank to take a hard band across its cover. That band and a neighbour's
wedge are what a visitor reads as the books taking a shadow. Putting them back
by receiving again would add a sampling program, which is the one thing this
record forbids. So they are computed, from the same key-light ratios the
backboard's painted shade uses, and drawn as a mask.

- **One mesh for the whole shelf.** It costs 1 draw, 1 texture, 1 geometry and
  0 programs at every library size, and it reads no shadow map. A plane per book
  would cost a draw and a texture per face-out book, and as a child of a book it
  would take clicks the picker cannot map to that book. A plane per row cannot
  register: a cover's depth varies with its width by up to 0.1, which moves the
  band's edge by about 30 pixels.
- **The wedge is thrown by the page block**, because that is the one part of a
  book that draws into the shadow map. Painted from the whole case, every wedge
  landed a few pixels left of and above the real one. On the seven-book fixture,
  where the wedge is most of the shade, that was most of the error. The block's
  size comes from [`binding-case.ts`](../../packages/site/src/shelf/binding-case.ts),
  which `buildBook` now builds from too.
- **One strength, 0.28, where the fits disagree.** The 50-book fixture fits 0.233
  (0.262 on the top row, 0.204 by the lamp) and the seven-book one 0.331. A real
  shadow removes only the key light, and how much of a cover's light that is
  depends on where it stands. 0.28 keeps both fixtures inside the design's
  target: the error inside the band region falls to 0.364 and 0.378 of what it
  was with no band painted.
- **What it leaves:**
  - **Spines are not painted.** Each spine takes its neighbour's shadow under
    `?receivers=all`, and nothing paints that. It is 17.9% of the changed
    pixels on the 50-book fixture and 6.5% on the live library.
  - **The strength does not follow the lamp.** A strength per cover derived
    from the lights is the next step if one number stops being enough. Tuning
    per row is not.
  - **`makeNeighbourShadow`'s older plane stays, unmeasured.** No fixture puts
    a spine flush against a face-out cover.
- **The mesh is in world space.** A book that moves has to blank its own quad.

The measurements are in
[the log](../log/2026-09-24-the-cover-shade.md).

## Splitting the woodwork again

Splitting the woodwork again reopens the ceiling: every member that gets its
own mesh adds one sampling draw a frame, and one mesh per plank grows with the
library. A change that needs a member to be separate should say where its draw
comes from. The same goes for any new surface that reads the map.

## Alternatives

- **Per-member matrices in the shader**, the way `BatchedMesh` does it. They
  could reproduce the old arithmetic exactly, which is the one way to close
  the pixel gap. But the woodwork would need a program of its own, so it could
  no longer share one with the backboard. That makes two sampling programs
  where there is one, and the phone has never been tested on that split as a
  rule.
- **Leaving the members separate and capping the rows.** This is a ceiling on
  the library, not a fix.
- **`material.defines`** cannot undo the flag. Custom defines are emitted
  *before* the prefix's `#define USE_SHADOWMAP` (`WebGLProgram.js:679` against
  `:752`).
- **Toggling `shadowMap.enabled` around the books' draws.** three recompiles
  nothing on that toggle, which is why `stopSamplingShadows` has to dirty every
  material. Per frame, it would be global renderer state flipped mid-render.
- **`gl.flush()` after every sampling draw** was measured and refuted on the
  device: frames 7–8 like everything else, at 240 → 35 fps on desktop.
- **`WebGPURenderer`** keys its render objects on `receiveShadow`
  (`RenderObject.js:843`), so there the flag *may* be enough. That was read off
  the cache key, not the shader it builds, and is unverified. Either way it is
  a renderer migration, not a fix.
