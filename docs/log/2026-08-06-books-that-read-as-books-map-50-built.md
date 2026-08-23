# Books that read as books — map [#50](https://github.com/mephistopheles4/stacks/issues/50) built

Fifteen closed tickets, implemented as seven commits. The map is plan-only by its
own rule; this is the ordinary phase work that followed it. Every ticket stated a
per-book texture and draw-call cost, so **`smoke:render` now reports what the
renderer is holding** — the one gate that draws 49 books could not see any of
those numbers, so a slice costing more than its ticket claimed came back green.
Reported and not asserted: #53's budget is an estimate, the counts move with the
fixture, and a gate that reddens on a number nobody can interpret trains people
to raise the number.

|                                                                                                                       | what shipped                                                        | measured                                      | its ticket said   |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| [#57](https://github.com/mephistopheles4/stacks/issues/57)                                                            | binding: hashed, `binding:` overrides; board + square + height band | +0 draws, +0 bytes                            | +0, +0            |
| [#65](https://github.com/mephistopheles4/stacks/issues/65)                                                            | `materials.spineProfile` `{ rise, roll }` per binding               | **+2** textures shelf-wide, +0 draws, +0 tris | +2 shared, +0, +0 |
| [#56](https://github.com/mephistopheles4/stacks/issues/56)/[#66](https://github.com/mephistopheles4/stacks/issues/66) | head cap, `1 × 10`, `CAP` 0.16, hardbacks only                      | **+20** draws over 49 books (+0.41 each)      | +20, +0.41        |
| [#54](https://github.com/mephistopheles4/stacks/issues/54)                                                            | one 2048×8 striation map + per-book jitter                          | **+1** texture shelf-wide, +0 draws           | one shared, +0    |
| [#58](https://github.com/mephistopheles4/stacks/issues/58)/[#68](https://github.com/mephistopheles4/stacks/issues/68) | binding roughness _constants_; aspect-correct canvas                | **+8** textures (the newly typed books)       | 41 → 49 typed     |
| [#60](https://github.com/mephistopheles4/stacks/issues/60)                                                            | three length bands, subtitle-driven layout                          | every counter unchanged                       | costs nothing     |
| [#62](https://github.com/mephistopheles4/stacks/issues/62)                                                            | hashed thickness for a book with no page count                      | unchanged on fixtures                         | free              |

`pnpm test` **421 → 475**. `smoke:render`: 49 books, case overflow **0.0012**
before and after — unchanged through all seven — distinct colours 1285 → **1493**
at 25.3% non-background. All four gates green.

**Two predictions were wrong and both are recorded where they were made.**
`USE_NORMALMAP` splits the spine materials into their own program variants —
programs 3 → 5, a cost no ticket named, and the number the Pixel 10 investigation
turned on. I then predicted retiring `MIN_LEGIBLE_THICKNESS` would fold one back
and it did not.

**Two latent defects came out of implementing decided work.**

- **#54's striation profile did not tile.** Gathering 14 drew different noise
  from gathering 0, so the height field stepped by 0.025 at `u = 1` and the
  wrapping central difference reported a ~25 slope across a smooth surface. That
  reaches past one texel, because the encoding scale normalises the whole map
  against its steepest slope — a spike at the seam quietly compresses every real
  leaf. It had not, because the leaves reach ~155; it would have sprung the moment
  anyone lowered `LEAVES_PER_GATHERING`, which its own comment invites.
- **The binding hash had to be salted.** Sharing `hashUnit(id)` with `heightFor`
  would make every paperback exactly the shorter 60% of the shelf — and since
  binding then _biases_ the height band, the two compound into a monotonic
  silhouette that every other test passes. Observed red without the salt.

⚠️ **One decided number does not reach the outcome it was sold on, and it is left
as decided rather than changed on the way past.** #58's spine canvas clamp is
`32..128`, and `128` is a claim about how many pixels type _needs_ while aspect is
what the function is for. A book wants `1024 × thickness / height` texels — **111
to 252** on the owner's library — so everything past 128 saturates:

|                            | fixed 128   | clamped 32..128 |
| -------------------------- | ----------- | --------------- |
| the owner's 27 typed books | 0.87×–1.97× | **1.00×–1.97×** |
| the 50-book fixture        | 0.46×–1.64× | **1.00×–1.64×** |

The squeeze is gone completely and the worst stretch is untouched. Raising
`SPINE_CANVAS_MAX` to 256 covers the real top aspect of 0.246 and makes the whole
range exact, at up to double the canvas on the thickest books — which are also
the ones with the most spine on screen. Bytes against letterforms, so it is the
owner's call: one named constant, and a test that goes red when it moves.

**No new gate row**, on the `placeShelf` precedent. Every cost claim these
tickets make is now _reported by `smoke:render`_ rather than asserted, which is
the honest shape for a number that legitimately moves; and the two rules worth
pinning — that the striation profile is periodic, and that binding and height
draw off independent hashes — are unit tests over pure functions, both observed
red. A scoreboard row implies a rule that can go red for a reason a reader can
act on, and "textures went up by three" is not that.

### The review caught a bug no counter could

**The head cap was ~6× too narrow, and every number said it was fine.**
`headCapGeometry` spanned one _width_ unit along `x` while rolling at radius 1 —
two unit systems in one geometry — and the call site scaled uniformly by
`headCap × thickness`. So the cap came out `0.16 × thickness` wide on a spine
`thickness` wide: a narrow tab centred on the head rather than a covering.

**Nothing it cost changed.** Same draw call, same twenty triangles, same shared
geometry, same texture — so `smoke:render`'s new cost line, the +20 draws that
matched #56 exactly, and the unit tests all passed over it. The tests passed
because they pinned the geometry under the _correct_ assumption and nothing
tested the call site; the spine strip's height loss was right by coincidence,
since radius and width scaled by the same wrong factor and only the height wanted
`0.16 × thickness`.

The roll is baked into the arc now and the scale is `thickness`. The test that
would have caught it asserts the two spans are **different** — they were equal
when both were 1, which is exactly what made scaling by either look plausible.

Two smaller things the review found, both real:

- **A panel lamp that could lie.** The head-cap control read red when
  `paperbackRatio` was 1, on the reasoning that there would be no hardbacks to
  cap. False: a note declaring `binding: hardback` ignores the ratio, because a
  declaration is not a vote — so that book is still capped and the lamp would
  have denied it. The lamp answers the question it can see instead.
- **Two unbounded caches.** The shared normal maps and cap geometries were
  documented as "bounded by the number of bindings", which is true of the shipped
  shelf and false of the panel: every drag of a rebuild-class slider mints
  another key, and nothing freed them. `shared-cache.ts` keeps the most recent
  few. A leak on a debug surface built to diagnose leaks is the one failure this
  project has already measured itself avoiding.

### The head of a hardback was wrong twice, and `?solo` is what found it

Reported from a screenshot, after the reviews above and with the whole suite
green. **Both faults moved not one renderer counter** — same draws, same
triangles, same textures, same geometries — and neither is visible on a shelf,
where the neighbours hide the head.

- **Boards at full depth and full height** put their front-top corners `cap`
  proud of the surface rolling over them: two small square towers at the head of
  every hardback, `board` wide and `cap` deep, one either side of the spine.
- **Pulling the boards back without widening the piece in front of them** traded
  that for a worse one: a void at the board's own x, and a diagonal view looked
  straight through the hair between the printed spine and the cover into the page
  block's side — a cream seam the full height of the joint. Rendered both ways to
  be sure it was the trim that opened it.
- **The cap was an awning, not a fillet** — a one-sided arc with a wedge of
  nothing under it, open along its back edge over the page block's width. Look
  down at the head from in front and you saw into the case. This one had been
  there since the cap shipped and had nothing to do with the boards; it took a
  third look with `?solo` to see it.
- **Closing it with _squares_ was the next fault, and it was worse.** A square end
  puts its outer corner `roll × √2` from the arc's centre against the arc's
  `roll`, so each end of the covering grew a block sticking out past the roll it
  was there to close. Reported from three angles — as an empty corner from the
  cover side, as a dark notch at the joint, and as a square step from behind —
  before it was recognised as one thing. The ends are quarter-disc **fans** now,
  which cannot overhang whatever the sweep, and there is a test that says so:
  every vertex on or inside the arc.
- **Two hairlines with the same cause.** The cap was scaled to the _board_
  thickness and parked `SKIN` proud of the spine, so it stopped a hair short of
  the printed faces on both sides (a notch at the top corner from the cover side)
  and its back edge stood a hair in front of the boards (a slot across the head,
  reading as a square step with the curve hidden behind it). It is scaled to the
  printed faces now, and the turn keeps going **past 90°** so it tucks down into
  the boards rather than stopping dead on them — which is also what a real turn-in
  does. The quarter is still stepped exactly as #66 tessellated it; the tuck is
  its own three steps, so a vertex still lands precisely on the crest.

Cost of all of it: 20 triangles a cap became 52, so **3068 → 3708 over 49 books**,
and **draws are unchanged at 334**. #66's finding is untouched — the cap's ~11% was
never its triangles.

The case is two pieces now. The front `cap` of it is full width and `cap`
shorter; the boards, the page block and the printed cover all stop where the roll
begins. A paperback rolls nothing, so every number is what it was.

**Rounding the boards' own corners is the tempting fix and #56 already struck
it**: a radius on a box scaled `(board, height, depth)` smears, those axes
differing by two orders of magnitude, and doing it honestly costs a geometry per
book.

**The instrument is `?solo=N`** — one book, no case, no neighbours, no polar
clamp — built through the shelf's own `toRows` / `placeShelf` / `buildBook` /
`addLighting`, so what it shows is what ships. See `CLAUDE.md`. It is the third
instrument this project has built rather than guessed with, after the black box
and the panel, and it was earned the same way: something was wrong, everything
said it was fine.

### The bloom question is answered, and the page block does not cross

#54 left this open — _"a brighter or striated page block may cross the bloom
threshold"_ — and it was the half of the map's fog #68 could not close.

Measured at the **near** framing, because the block is 0.06% of a book's pixels
at the full one and a reading there is a measurement of the wood:

|           | bright pixels     | striation moves             |
| --------- | ----------------- | --------------------------- |
| bloom off | 1.925% either way | 13,606 px over JND (1.050%) |
| bloom on  | 2.856% either way | 14,655 px over JND (1.131%) |

**The striation is plainly visible and moves the bright-pixel share not at all** —
identical to three decimals with the effect on and off, under bloom and without
it. The control says the framing resolves change: bloom itself moves 85.6% of
frame. So this is a null with an instrument, not a null from a bad framing.

Same shape as #68's answer for the spine, and the fog patch closes with it. What
remains open there is only the contact shadow.

**Aesthetics are the owner's, and there are three images to look at.**
`artifacts/shelf.png` is the full shelf, which is #60's acceptance framing — the
question it asks is whether the range reads as one publisher's imprint or as
noise. `artifacts/shelf-close.png` and `artifacts/shelf-head.png` are near
renders, because the cap, the profile and the striation are all approach effects
and #54 established that share-of-screen cannot judge them. All three are
fixture, and per the map's caveat that is the right test here: none of these is a
question about the real books' _colours_.

**#66's thing to look at, looked at.** It flagged that the cap occludes the front
of the page block's top face, that #54's striation map lands _on_ that face, and
that it had taken the roll from 0.1 to 0.16 — so the cap would eat more striated
head than any screenshot on either ticket had shown. On one shelf with both
landed: it reads as a covering with a sliver of block behind it, which is what a
hardback's head looks like. Nothing to do.

**#66's other lead is deferred, deliberately.** _"Whoever implements the cap
should try [one shared material] before accepting the 11%"_ — and the only
version that could ship is not that one: the covering takes the book's own
colour, so twenty caps in one colour is the wrong picture, and #66 says so
itself. The candidate that would actually work is an `InstancedMesh` with
per-instance colour, sharing the material _and_ collapsing 20 draws to 1. Neither
#56 nor #66 rendered it and #66 deliberately did not ticket it. Recorded beside
the mesh in `scene.ts`.
