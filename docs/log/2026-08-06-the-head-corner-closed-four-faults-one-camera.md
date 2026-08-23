# The head corner, closed — four faults, one camera

The owner circled the head of a hardback five times across two sessions. Each
round moved one surface and opened the next, because each was judged from a
hand-dragged orbit — so no two before-and-afters were the same picture, and "it
looks better" was never checkable. **The first thing built this round was the
instrument, not a fix**: `window.__solo`, the turntable drivable by number, the
sibling of `window.__shelf` that `smoke:render` already reads. Every finding
below is a scan across the same frame.

**A `cap`-wide band of board colour down the whole joint.** The covering rolls
over a corner, so only the corner needed clearing for it — but the boards were
pulled back by `cap` over their whole _height_, which over-clears by `height /
cap`, about sixty times. The full-thickness strip that then had to fill the front
of the case put its own dark sides where the printed cover belonged. Fixed by
making each board two boxes, an L in the YZ plane: full depth below the roll,
pulled back inside it. **+2 draws on a hardback, +0 on a paperback.**

**A flat facet on the corner, standing outside the case.** The roll's ends are
flat quarter discs and have to be — nothing beside a book is there for the
covering to turn down onto. What made one read as a _thumbprint stuck on_ was
never the silhouette but the shading: a true `(±1, 0, 0)` normal catches light as
a surface of its own, discontinuous with the roll it closes, and the eye reads a
discontinuity in shading as a separate object. **Leaning the end normals 45° into
the roll fixed it for +0 of everything** — the geometry does not move by a
micron. Ranked above the quarter-torus corner patch that was the alternative,
which shrinks the facet without removing it and re-exposes the board while doing
it.

**A four-pixel lit sliver of board past the roll.** `capScale` had been
`thickness + SKIN * 4` (proud, hence the highlight along the step) and then
`thickness - SKIN * 2` (inset, hence the sliver). Neither is right, because the
covering is not floating above the case — it _is_ the outside of the case, which
is `thickness` wide. What made an offset look necessary was the tuck's end fans
lying in the boards' own plane; **the tuck is no longer fanned**, so nothing is
coplanar and `capScale` is `thickness` exactly. Nothing shows through the opening:
it lies in the boards' plane, behind their front face.

**The hairline down every joint**, which is the one the owner circled on the
shelf rather than in `?solo`. It was `SKIN` itself. See
[ADR-0036](../adr/0036-printed-faces-are-decals.md) — the printed faces are decals
now, coplanar and depth-biased, and **case overflow went 0.0024 → 0.0000**.

Cost, against the fixture: **draws 334 → 374, triangles 3708 → 4068** (+480 for
the boards, −120 for the cap ends no longer fanned), and textures, geometries and
programs unchanged at 71 / 23 / 5. Every one of those numbers is the prediction.

⚠️ **None of the four moved a counter before it was fixed** — same draws, same
triangles, same textures — which is now the fifth time that sentence has been
written on this map. A cost-reporting gate cannot see shape. Only a picture of
one book can, and only a _reproducible_ one can be compared to the last.
