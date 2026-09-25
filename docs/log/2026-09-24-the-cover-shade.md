# The cover shade

**2026-09-24** — [#381](https://github.com/mephistopheles4/stacks/issues/381)'s
third change. Under `receivers: 'bookcase'` a book's programs have no shadow
sampler, which is what keeps the Pixel 10 Pro XL alive, and it costs the one
cast shadow a visitor reads on a book: the band the plank above throws across
every face-out cover, and the wedge a taller neighbour throws beside it. This
paints both back, reading no shadow map, and fits the paint against the old
real shadows. The decision is
[ADR-0088](../adr/0088-one-program-samples-the-shadow-map-in-two-draws.md); the
change before this one is
[only the bookcase reads the shadow map](./2026-09-24-only-the-bookcase-reads-the-shadow-map.md).

## The answer first

- **The band is back, at a third of the error.** Inside the band region, the
  mean absolute difference from the old `?shadows=1` falls from 21.8 to 7.9 on
  the 50-book fixture and from 25.7 to 9.7 on the seven-book one, at the phone's
  viewport.
- **It costs one draw at every library size, and no program.** +1 draw, +1
  geometry, +1 texture, +2 triangles per face-out cover, +0 programs. The shadow
  map is still read in 2 draws from 1 program.
- **One strength, 0.28, and the fits disagree.** The 50-book fixture fits 0.233
  and the seven-book one 0.331, because a real shadow removes only the key light
  and how much of a cover's light that is depends on where it stands. 0.28 is
  the value that keeps both inside the design's target.
- **The wedge is thrown by the page block, not the case.** That is what casts
  in the shadow map, and painting from the whole case put every wedge a few
  pixels left of and above the real one.
- **The default page changes.** `paintsCoverShade` is true whenever there is
  painted shading and the books do not read the map, which includes the painted
  default today. The 50-book fixture's default page moves 55,792 pixels at the
  phone viewport by more than 1 level (1.6% of it, worst 71), all of them on
  face-out covers.

## What it paints

One quad on each face-out cover, lifted `COVER_LIFT` off it, all in one mesh
that samples one atlas of masks. A texel is dark when a ray from its point on
the printed cover toward the key light meets one of three things before it
leaves the bookcase:

- **the plank above**, whose band falls `yPerZ` per unit of depth behind the
  plank's front edge, so a wider cover, standing further back, carries a deeper
  band;
- **the right-hand upright**, reaching `xPerZ` per unit of depth in from its
  inner face;
- **every book to the right**, as its page block.

The mask is a union and never a sum, with a 0.010 penumbra. Spines get nothing:
a spine's front stands 0.016 behind the plank's, so the band reaches 0.02–0.03
down it and never its top. `cover-shade.test.ts` pins that at the 200-book size.

## The rig

- **Renderer:** SwiftShader through ANGLE, headless Chrome, at the Pixel viewport:
  527×1003 CSS at 2.55, so 1344×2558 pixels, with an Android user agent.
- **Seed:** every URL carried `?woodSeed=impl1`.
- **When to shoot:** at least 120 frames in, with the program, texture and
  geometry counts stable for 2.5 s.
- **Libraries:** the staged 50-book fixture (41 books on the shelf, 9 face-out)
  and the seven-book fixture (1 face-out, against a tall spine).
- **Scored region:** rows 250–2350 only. The page's HTML title and footer sit
  over the canvas and re-render with timing noise: 5,697 pixels differed
  between two renders that were otherwise identical.

A scratch-only build read the strength, the penumbra, the wedge term and the
older neighbour plane from an injected global, so one build served every
variant. It was never committed, and the sources were restored byte for byte
after each build.

- **R** is `?shadows=1&receivers=all`, the reference. The cover shade is not
  drawn there.
- **B** is the band at strength 0.
- **N1** is the band at strength 1.

Blending black gives `dst × (1 − α·m)`, so `N(α) = B − α·(B − N1)` per channel,
and α is fitted in closed form.

## Controls

Every one of these differed in 0 samples:

- **Repeat:** R rendered twice.
- **Reference unchanged:** R against the previous commit's
  `?shadows=1&receivers=all`, both fixtures, phone and desktop viewports.
- **Band at zero:** B against the previous commit's `?shadows=1`, and the
  painted page at strength 0 against the previous commit's default.

Two more checks:

- **Canaries:** the scorer read N := B as 1.000 and N := R as 0.000.
- **Linearity:** prediction against the real build at 0.28 differed by at most
  2 levels, in 17 samples on the 50-book fixture and 1 on the seven-book one.

## What moved the fit

- **The wedge term.** With it, T1 on the 50-book fixture was 0.332. Without it,
  T1 was 0.438, an improvement of 0.106 against the 0.05 bar, so it stays. On
  the seven-book fixture the two were 0.453 and 0.869.
- **The penumbra did not matter.** At 0.006, 0.010 and 0.020, T1 was 0.333,
  0.332 and 0.334, so 0.010 stays.
- **Strength was not the main error.** An oracle that fitted each shelf row its
  own strength reached 0.311 on the 50-book fixture and 0.458 on the seven-book
  one.
- **Shape was the main error.** A signed error map of the seven-book cover
  showed the wedge a few pixels left of and above the real one. The shadow map
  draws only the page block, which is inset from the case by a board at the
  side, the square at the head and the covering at the joint. Throwing the
  wedge from the block took the seven-book fixture's T1 from 0.453 to 0.329 at
  its own fit, and its spill from 12.7% to 1.5%. On the 50-book fixture it moved
  T1 from 0.332 to 0.330.
- **The fits then disagreed.** The 50-book fixture fitted 0.233: 0.262 on the
  top row and 0.204 on the row by the lamp. The seven-book fixture fitted 0.331.

| strength | T1, 50 books | T1, 7 books | worse |
| --- | --- | --- | --- |
| 0.25 | 0.328 | 0.444 | 0.444 |
| 0.26 | 0.335 | 0.419 | 0.419 |
| 0.27 | 0.348 | 0.396 | 0.396 |
| **0.28** | **0.364** | **0.376** | **0.376** |
| 0.29 | 0.384 | 0.355 | 0.384 |
| 0.30 | 0.405 | 0.343 | 0.405 |

0.28 minimises the worse of the two. It also sits beside the 0.275 the design
read off the live library's broad band cores.

## The result

Measured on the built site at 0.28, at the phone viewport. M is where the old
real shadows differ from no band by more than 8 levels.

| | 50 books | 7 books | target |
| --- | --- | --- | --- |
| mean abs diff in M, old vs no band | 21.78 | 25.68 | |
| mean abs diff in M, old vs band | 7.91 | 9.70 | |
| T1, residual share of the no-band error | 0.364 | 0.378 | ≤ 0.40 |
| T2, mean signed Δluma in M | +2.72 | +10.33 | within ±3 |
| T3, spill outside M | 0.006 | 0.009 | ≤ 0.10 |
| T4, misses inside M | 0.221 | 0.270 | ≤ 0.20 |
| T5, whole-frame ratio | 0.384 | 0.392 | ≤ 0.40 |
| T5, share over 8 levels | 0.51% (1.91% before) | 0.12% (0.42% before) | ≤ 2.0% |

**T4 and the seven-book T2 miss, and both misses are spines.** On the 50-book
fixture M is 30,941, 22,945 and 11,726 pixels on its three rows:

- **Misses:** 1,098, 1,650 and 11,726. The third row is spines only, so all of
  its M is missed.
- **Mean signed bias:** +0.44, −3.26 and +20.44 levels.
- **On the two rows with covers, the misses are 5.1%.**

The rest is each spine taking its neighbour's shadow, which the design leaves
unpainted. On this fixture it is 17.9% of M, against the 6.5% the design
measured on the live library. On the seven-book fixture the cover and its spines
share one row, which is why T2 there is +10.3.

**The painted fallback scores the same.** With no shadow map at all, the band
against the same reference scores T1 0.369 and 0.382. A book renders the same
either way, so one strength serves both.

## Cost

- **Draws:** +1, both fixtures and both modes. The 50-book fixture goes from
  314 to 315 draws and from 3,512 to 3,530 triangles.
- **Geometry and texture:** +1 each.
- **Programs:** +0. The first build compiled one more, because the quads had
  no normal attribute: three defines `HAS_NORMAL` from the geometry, and every
  other painted plane is a `PlaneGeometry`, which has one. Computing the quads'
  normals brought it back to 8 under `?shadows=1` and 7 painted.
- **Shadow map:** still read in 2 draws from 1 program.

## Not done

- **The owner's real vault was not fitted.** This session could not read where
  it lives.
- **The phone has not seen it.** The band is `MeshBasicMaterial` and samples
  nothing, so it should match, but no Pixel screenshot was taken. The reference
  cannot run on that phone at all.
- **Desktop was counted, not scored.** The 50-book default page moves 15,008
  pixels by more than 1 level, 1.2% of it, all on covers.
- **`makeNeighbourShadow`'s older plane stays, unmeasured.** It is drawn only
  where a spine stands flush against a face-out cover, and neither fixture has
  one. The old `?shadows=1` drew it too, so the fit includes it wherever it
  exists.
- **One strength for every cover.** If it stops being enough, the next step is
  a strength per cover derived from the lights, not per-row tuning.
- **The mesh is in world space.** A book that is picked up will have to blank
  its own quad.
