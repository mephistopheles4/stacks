# ADR-0088 — One program samples the shadow map, in two draws

**Date:** 2026-09-24
**Status:** proposed
**Ticket:** [#381](https://github.com/mephistopheles4/stacks/issues/381)

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

## Context

Real-time shadows (`?shadows=1`) lose the WebGL context on the Pixel 10 Pro XL
(PowerVR DXT-48-1536, driver 25.3@6908880, Chrome 153, ANGLE on GLES), and the
owner wants them on by default. Measured on the phone:

- **One program that samples the shadow map survives 12 sampling draws a
  frame and dies at 13.** At 12 the page ran 120 s twice and 300 s once; at 13
  it died twice, at frame 134. A second sampling program lowers the ceiling.
- **The bookcase's program made `rowCount + 4` of them**: the backboard, two
  uprights, and a plank per shelf plus the lid. `rowsForBookcase` keeps one
  empty row ahead, so that is `max(usedRows + 5, 6)`. It was 11 on the live
  library, reached 13 at about 66 books, and would be about 27 at the brief's
  200-book target.

So even with every other program kept off the map, the bookcase alone would
have crossed the line as the library filled.

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
  on its material. Under `flat`, or before a sheet decodes, it is two programs
  at one draw each.

## What it costs

- **Per-member culling and identity.** Nothing read either: the picker
  raycasts books only, the shadow camera is fitted from constants, and
  `Bookcase` hands out materials, not meshes. The woodwork now draws whenever
  any of it is in view.
- **The pixels are not identical.** The join itself moves at most 4 pixels,
  all at one junction. Baking each member's position into its vertices is what
  moves the rest: it changes the arithmetic the GPU does to place them. On faces seen at a grazing angle, that moves up to
  348 pixels by up to 26 levels, against a pass criterion of none over 1 set
  before the run. The measurements, the controls that isolate the cause, and
  why no join can meet that criterion are in
  [the log](../log/2026-09-24-the-woodwork-is-one-mesh.md).

⚠️ **Whether that shortfall is acceptable is the owner's decision, and this
record does not make it.** It stays `proposed` until it is made.

## Splitting the woodwork again

Splitting the woodwork again reopens the ceiling: every member that gets its
own mesh adds one sampling draw a frame, and one mesh per plank grows with the
library. A change that needs a member to be separate should say where its
draw comes from.

## Alternatives

- **Per-member matrices in the shader**, the way `BatchedMesh` does it. They
  could reproduce the old arithmetic exactly, which is the one way to close
  the pixel gap. But the woodwork would need a program of its own, so it could
  no longer share one with the backboard. That makes two sampling programs
  where there is one, and the phone has never been tested on that split as a
  rule.
- **Leaving the members separate and capping the rows.** This is a ceiling on
  the library, not a fix.
