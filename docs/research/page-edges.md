## Answer: nothing. The page block gets no page-edge treatment.

Measured rather than argued. At the default framing the page block is **0.06% of
book pixels** — 76 of 130,998. Orbited to the angle that flatters it most it
peaks at **1.74%**, then falls again as the shelf's own planks occlude it.

There is no surface here to spend anything on, so all four approaches this
ticket listed are rejected — including the two that are nearly free.

### The measurement

A *clown pass*: `window.__clown` makes `buildBook` paint the page block flat
magenta and every other part of the case flat green, all of it unlit, unfogged
and untone-mapped so the two classes can be counted straight out of the
framebuffer with no lighting to blur the boundary. `scripts/prototype-page-edges.ts`,
built on the `smoke:render` harness — 50-book fixture, 1440×900, real GPU.

Camera angles are a synthetic drag on the canvas, so this measures the same
`OrbitControls` a visitor has rather than a camera the prototype moved itself.

| camera | page-edge px | book px | page share of book |
|---|---|---|---|
| default (level) | 76 | 130,998 | **0.06%** |
| orbited up ~10° | 1,143 | 136,778 | 0.84% |
| orbited up ~20° | 2,375 | 136,240 | **1.74%** ← peak |
| orbited up ~30° | 2,201 | 128,099 | 1.72% |
| orbited up ~40° | 1,824 | 113,373 | 1.61% |

### Why the premise was wrong

The ticket calls the page block *"the largest pale surface on any book"*. That
is true of **mesh** area and false of **visible** area, and `buildBook`'s own
arithmetic says why:

- the block's `+Z` face lands at `depth/2 − board`, and the spine strip spans
  `z ∈ [depth/2 − board, depth/2]` — so the block's front is exactly flush
  behind the spine strip, touching but never showing;
- its `±X` faces sit against the boards;
- its fore-edge (`−Z`) faces the backboard;
- which leaves the **head** (and the tail, from below) as the only page surface
  that can ever show — recessed `SQUARE` ≈ 3 mm inside a cover-coloured rim, and
  at shelf level projecting to nothing.

Every row is roofed by a plank too, so orbiting up buys head visibility and
spends it on occlusion. That is the plateau in the table. Past ~40° the case's
own top fills the frame: measured at ~104°, the count returns **zero** books.

### The proposal was built and rendered, not argued about

Rather than reason about whether the striation would read, it was implemented —
one shared 1D normal map plus per-book colour and roughness jitter — and the
same build was rendered with it and without it at both angles. Differences
between each pair, per channel:

| camera | mean Δ | channels moved >8 | worst Δ |
|---|---|---|---|
| **default framing** | **0.000** | **0.000%** | 9 |
| orbited up ~20° | 0.041 | 0.155% | 45 |

**At the default framing the two images are identical.** Not "similar" — one
channel in 3.9 million moved at all, which is noise. The effect delivers
precisely nothing in the view the shelf actually presents.

At ~20° it *is* visible: on the head slivers the banding reads as paper, and
that is a real difference, worth saying plainly. It is also 0.155% of the
channels in the frame, confined to the ~2,000 pixels the clown pass already
counted.

### What is rejected

All four approaches, on evidence rather than on cost:

- **A material array on the box** — +5 draw calls per book.
- **Custom UV-rotated geometry** — and it would have to thread the geometry
  identity check in `dispose()`, which skips the two shared unit shapes.
- **A shared striation normal map** — 0 extra draw calls, ~16 KB for the whole
  shelf, and the mean Δ 0.000 above.
- **Per-book colour and roughness jitter** — free at runtime, since the `pages`
  material is already built per book.

The last two cost nothing measurable *at runtime*, and are still rejected —
because runtime is not the only ledger. Either one still buys a `ShelfSettings`
knob, its `applySettings` branch and honest `ApplyReport` bucket, its `?tune=`
spelling, panel wiring and a module to maintain, and it buys them for a surface
that is pixel-identical in the view the destination names: *"convincingly
bookish objects at **normal viewing distance**"*. Cheap is not the bar. Visible
at shelf distance is, and 0.06% is not visible.

### One finding worth keeping

**The "six faces want three treatments" problem does not exist.** Page striation
is a *one-dimensional* pattern — leaves stack along the thickness, so it varies
along local x and is constant along the direction the cut edges run. That is
exactly what a texture varying only in u gives, and `BoxGeometry` maps u to
local x on four of six faces: `py`/`ny` (head, tail) via `buildPlane('x','z','y')`
and `pz`/`nz` (spine side, fore-edge) via `buildPlane('x','y','z')`, per
three@0.185.1. The two faces where u maps to z instead are `px`/`nx` — the ones
the boards permanently occlude.

So a single shared 1D map on the stock `UNIT_BOX` would have been correct on
every face that can ever show, at **0 extra draw calls, 0 per-book bytes and no
geometry change** — leaving the page block as the single shadow caster per book,
which is the resource the one recorded crash actually exhausted.

Worth recording because it makes the *next* page-edge question cheap instead of
expensive. It is written up, with the working, in `packages/site/src/shelf/page-edges.ts`
on the `prototype/page-edges` branch — dead code kept as a note, not a proposal.

### Where the page edges actually are

Not on a shelved book. The measurement points at two places instead, and both
are already on the map rather than being smuggled in here:

- **The face-out book**, already in *Not yet specified*. It is the one book whose
  page edges are chunky rather than a few pixels of dash — visible in
  `clown-50.png` along the tops of the top row.
- **Picking a book up**, which is out of scope — `docs/notes-on-the-shelf.md`'s
  separate design.

If page edges are ever wanted on a *shelved* book, the honest lever is not a
texture at all: it is `SQUARE`, the binder's square, which decides how much
paper the boards leave showing. That is a change to what a book *is* on this
shelf, and it would need its own ticket.
