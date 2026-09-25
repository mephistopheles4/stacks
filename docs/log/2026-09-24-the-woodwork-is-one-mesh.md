# The woodwork is one mesh

**2026-09-24** — [#381](https://github.com/mephistopheles4/stacks/issues/381),
the first of its changes: both uprights and every plank are joined into one
geometry, so the bookcase draws in two calls at every library size. The decision
is [ADR-0088](../adr/0088-one-program-samples-the-shadow-map-in-two-draws.md).

## The answer first

- **The bookcase draws twice a frame, whatever the library holds.** The main
  pass falls by exactly `rowCount + 2`: 320 → 314 draws on the 50-book fixture
  (4 rows), and 57 → 53 on the 7-book one (2 rows). Triangles do not change.
- **The join itself is clean.** Separate meshes with their positions baked in,
  against the joined mesh, differ by 0 pixels on every desktop run. At the Pixel
  viewport they differ by at most 4 pixels, all at one junction.
- ⚠️ **The pixels are not identical to before, and the criterion set before the
  run fails.** It was: no pixel moves by more than 1 level, except isolated
  pixels on an outline or a junction. Six of twelve runs break it with speckle
  inside a face: up to 348 pixels, by up to 26 levels, on faces seen at a
  grazing angle. The cause is baking each member's position into its vertices,
  and no join can avoid that.

## How it was measured

Every render uses SwiftShader, pinned at `?woodSeed=impl1`, with each library
served identically to every build. SwiftShader was chosen because it is byte
deterministic: two renders of one build differed by 0 samples in all 12 runs.

The matrix has 12 runs: two fixtures, the 50-book one (41 books after a public
build, 4 rows) and
the 7-book one (2 rows); two viewports, desktop 1440×900 and the Pixel 10 Pro XL's
527×1003 at 2.55; and three URLs, the default page, `?shadows=1`, and
`?shadows=1` with `woodSpecies: flat`. Each shot waits for `networkidle0`, at
least 120 frames, and program, texture and geometry counts steady for 2.5 s.

Builds:

- **A** is `main` at `7d572c8`.
- **B** is a throwaway: positions baked into each member, members still
  separate meshes at the origin.
- **C** is the join.

Two controls prove the differ can see a change:

- **Another seed on A** moves 389,000 to 1,600,000 samples by more than 1,
  worst 67 to 86, in every run.
- **A planted defect** gives one plank the next plank's corners in the joined
  index. It moves 6,778 pixels on the 50-book desktop page (worst 113), and
  18,819 on the 7-book one.

## The draws

At the 50-book fixture, read off `renderer.info` and a draw-counting hook:

| | A | C |
| --- | --- | --- |
| main-pass draws, default page | 320 | 314 |
| geometries | 23 | 17 |
| draws sampling the map, `?shadows=1` | 308 | 302 |
| of those, the bookcase's | 8 | 2 |
| programs sampling the map, `?shadows=1` | 5 | 5 |

The books still read the map in this change. The next change in #381 takes the
books off it, which should leave `?shadows=1` sampling in 2 draws from 1
program, or from 2 programs under `flat`.

## The pixels

Pixels that moved by more than 1 level, of 1,296,000 on desktop and 3,437,952
at the Pixel viewport. A range covers the default page and `?shadows=1`.

| run | A vs C | A vs B | B vs C | worst, A vs C | where |
| --- | --- | --- | --- | --- | --- |
| 50 books, desktop | 1 | 1 | 0 | 5 | one pixel on an edge |
| 50 books, Pixel | 321–324 | 321–324 | 0 | 26 | a band across the lid's front edge |
| 7 books, desktop | 339–348 | 339–348 | 0 | 18 | speckle across the lid's underside |
| 7 books, Pixel | 12–13 | 8–9 | 4 | 8 | two junctions |

Under `flat` the counts are within a few pixels of these.

## What causes it

Two controls on A isolate the cause, because neither moves anything:

- **The bookcase moved up by 1e-6**, a rigid shift, moves no pixel by more than
  1 on desktop, and at most 5 at the Pixel viewport, worst 4.
- **Every member moved out and back** with `translate(t).translate(-t)` changes
  each vertex's float32 rounding and keeps the old per-mesh transform. It moves
  no pixel by more than 1 anywhere.

What the join changes is **where the arithmetic happens**. Before, the GPU
multiplied each member's corners by a model-view matrix that already carried
the member's position, rounded once on the CPU. Now it multiplies corners that
carry the position by a model-view matrix that does not. The two round
differently at each corner, so a face's corners move by a few millionths of a
unit, each by a different amount.

On a face seen almost edge-on, where one pixel covers many texels, that is
enough to move texture samples. Turning the drawn fibre off (`woodFibre: 0`)
halves the speckle on the 7-book desktop run, from 348 to 150 pixels, and
leaves the Pixel band unchanged. So the fibre's screen-space tangent frame
amplifies it, but the sheet's own sampling carries it too.

Neither image is the true one: each is one rounding of the same geometry. But
the criterion was fixed before the run so as not to argue with it afterwards,
and by it the join fails in six runs. The only way to meet it is to reproduce
the old arithmetic in the shader, with a matrix per member. That would give the
woodwork a program of its own, and two sampling programs where there is one.

## Still open

- **Whether a 0.03% speckle on the lid is an acceptable price** for a draw
  count that no longer grows. That is the owner's call.
- **Frame time** was not measured, on desktop or on the phone.
