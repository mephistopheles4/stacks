# Page edges on the page block — ticket #54

**Answer: build it.** A single shared 1D striation normal map on the existing
`UNIT_BOX`, plus per-book colour and roughness jitter. Nought extra draw calls,
nought per-book textures, no geometry change.

This document records a wrong turn as well as the answer, because the wrong turn
is the more useful half.

## The wrong turn, and the correction

The first pass measured the page block's share of book pixels at the **default
framing** and swept the camera's *angle*: 0.06% level, peaking at 1.74% orbited
to ~20°. On that evidence the recommendation was to reject every approach.

That was wrong, and the owner overruled it on the strength of something the
measurement could not see: *people zoom in and explore, and multiple people said
so unprompted.*

The measurement had swept **angle** and never **distance**. `OrbitControls` here
allows roughly a 6× approach — `minDistance` is 1.5 against a framed distance
near 9 — so the shelf has a whole viewing regime the numbers never visited.

Worse, the chosen metric could not have found it. *Share of book pixels* is
scale-invariant: zooming in magnifies page edges and everything else together,
so the share stays near 1% while the **absolute** page-edge area grows 127×,
from 76 pixels to 9,678. A ratio was the wrong instrument for a question about
detail.

| camera | page-edge px | book px | share |
|---|---|---|---|
| default (level) | 76 | 130,998 | 0.06% |
| orbited up ~20° | 2,375 | 136,240 | 1.74% |
| zoomed 10 notches | 5,979 | 904,663 | 0.66% |
| **zoomed to `minDistance`** | **9,678** | 865,983 | 1.12% |

## What the effect is worth, by distance

The same build rendered with the striation and without it, compared per channel:

| camera | mean Δ | channels moved >8 |
|---|---|---|
| default framing | 0.000 | 0.000% |
| orbited up ~20° | 0.016 | 0.000% |
| zoomed 10 | 0.048 | 0.007% |
| zoomed 25 | 0.169 | 0.245% |
| **zoomed to `minDistance`** | **0.276** | **0.495%** |

Monotonic in zoom, and at the near end it changes essentially every page-edge
pixel. Judged by eye at that distance the difference is not subtle: without the
map a book's head is a flat cream slab — the *"solid of putty-coloured plastic"*
the ticket complained about — and with it the head reads as ribbed paper.

**The ticket's complaint was accurate all along.** It was only ever false at a
distance where the surface is not visible anyway.

## The design

**One 1D map is correct on every face that can show.** Page striation is a
one-dimensional pattern: leaves stack along the thickness, so it varies along
local x and is constant along the direction the cut edges run. `BoxGeometry`
maps u to local x on four of six faces — `py`/`ny` via `buildPlane('x','z','y')`
and `pz`/`nz` via `buildPlane('x','y','z')`, per three@0.185.1. The two where u
maps to z are `px`/`nx`, the faces the boards permanently occlude.

So the ticket's framing — *six faces wanting three treatments* — describes a
problem that does not exist. It is real for a general 2D texture and absent for
a 1D one. Neither a material array (+5 draw calls per book) nor custom UVs baked
into the shared geometry is needed.

**Mipmapping is the level-of-detail scheme, and it is free.** The map carries two
scales: `GATHERINGS` (14) is the coarse grouping of signatures, and
`LEAVES_PER_GATHERING` (11) is the per-leaf detail that only exists for someone
who has zoomed in. As a book recedes the GPU samples smaller mip levels, which
average the fine lines away and leave the coarse profile; up close it samples
level 0 and every leaf is there. That is what a hand-written LOD switch would
do, minus the switch, the second asset and the popping.

Anisotropic filtering matters here specifically: a book's head seen from a shelf
is about as grazing as a surface gets, which is the case trilinear filtering
blurs to mush.

The encoding scale is **derived, not tuned** — normalised against the profile's
actual steepest slope — so changing either constant cannot silently saturate the
map into hard black-and-white edges.

## Cost

| | |
|---|---|
| Draw calls | **+0** per book |
| Per-book textures | **+0** |
| Shared textures | one, 2048×8 RGB ≈ **64 KB decoded, once**, at any library size |
| Geometry | unchanged — so the page block stays the single shadow caster per book, the resource the one recorded crash actually exhausted |

Per-book colour and roughness jitter is free at runtime: the `pages` material is
already built per book.

## Still to specify before implementation

- **The knob.** `materials.pageStriation`, 0–1, driving `normalScale`; 0 is
  today's flat block. It is baked into per-book materials at `buildBook`, so it
  belongs in the **`needsRebuild`** bucket of `ApplyReport` — the `coverRoughness`
  precedent — and rides in `?tune=` rather than taking a flat spelling.
- **Bloom.** The striation is relief, not brightness, so it should not cross
  ADR-0034's threshold; worth confirming on a render with bloom enabled rather
  than asserting.
- **The values.** `GATHERINGS`, `LEAVES_PER_GATHERING`, `LEAF_DEPTH` and the
  jitter amounts are prototype numbers, accepted on the close-up screenshots.

## The lesson for the rest of the map

The map's Notes say *"Effects earn their place at shelf distance."* That rule is
what produced the wrong recommendation, and it is incomplete: this shelf has
**two viewing regimes**, the full-shelf frame and close inspection, and detail
work is judged in the second. A proposal should be measured at both, at a
distance *and* an absolute scale, before anything is concluded from a percentage.

`scripts/prototype-page-edges.ts` and `scripts/prototype-page-diff.ts` do that
measurement and are reusable for any later proposal on this map.
