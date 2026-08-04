# The zero-dependency fidelity knobs

Research for [#43](https://github.com/mephistopheles4/stacks/issues/43), a
sub-issue of [#39](https://github.com/mephistopheles4/stacks/issues/39) (the live
tuning panel). Nothing here is implemented; this is the evidence a panel ticket
should be written from.

Everything below was measured against three **0.185.1** — the version in
`packages/site/node_modules/three` — reading `src/`, not remembered API. Every
render number comes from the 50-book fixture shelf at 1440×900 through the same
`readPixels` path `pnpm smoke:render` uses, on this workstation (Chrome
headless, `--enable-gpu --use-gl=angle`, real GPU). Source edits made to take
the measurements were reverted; `pnpm smoke:render` is green on the reverted
tree at the same numbers it started from.

## The table

| Knob | How it is set | Live, or recompile | Phone cost | Expose? |
| --- | --- | --- | --- | --- |
| `renderer.toneMapping` | Renderer property, one of seven constants | **Live, and three recompiles for you.** It is in the program cache key (`WebGLPrograms.js:484`) *and* in the `needsProgramChange` chain (`WebGLRenderer.js:2482`), so no `material.needsUpdate` is needed — measured below | +1 uniform, +100 shader lines per program. Free per fragment. **But every distinct value permanently adds one program per material class** — see "programs accumulate" | **Yes.** The largest single lever here |
| `renderer.toneMappingExposure` | Renderer property, a float | Live, pure uniform, no recompile | Nil | **Yes — but it must be disabled when tone mapping is `None`.** The `toneMappingExposure` uniform only exists inside `#ifdef TONE_MAPPING` (`WebGLProgram.js:771–773`), so an exposure slider under the shipped `NoToneMapping` is exactly the "probe that silently did nothing" failure #39 names |
| `renderer.outputColorSpace` | Renderer property | — | — | **No.** It is already correct and there is no second correct value. See "colour space is already right" |
| `scene.fog.near` / `.far` / `.color` | **Mutate the existing object in place** | Live, pure uniforms, no recompile — measured | Nil | **Yes** |
| `Fog` ↔ `FogExp2` | Assign a new `scene.fog` | Recompile, automatic (`FOG_EXP2` define; `WebGLRenderer.js:2452`) | 3 programs, once per direction, then cached | Yes, but as a mode switch, not a slider. Exp2 at any useful density flattens the shelf hard (see numbers) |
| fog off entirely | `scene.fog = null` | Recompile, automatic | Saves 3 uniforms and 1 shader line. Nothing | Yes — it costs nothing to offer and it is the honest "is the fog doing anything?" control |
| `material.roughness` | Per material | Live, pure uniform | Nil | **Yes**, as one slider per surface class (wood, backing, spine, boards, pages, cover) |
| `material.metalness` | Per material | Live, pure uniform | Nil | Yes, same slider group. Visibly wrong above ~0.3 on wood, which is itself worth being able to see |
| `MeshPhysicalMaterial` (clearcoat, sheen) | Replace the material object | Recompile, and a *different material class* — not a toggle | Standard 22 uniforms → physical 29–31. More varyings, bigger link | **No.** On the device whose failure was a program that **would not link**, this is the wrong direction. Defer |
| `scene.environment` (PMREM from a gradient) | Assign a texture | Recompile, automatic (`WebGLRenderer.js:2448`) | 360 ms to build the PMREM here, +3 textures, +5 programs, +5 uniforms per standard material, **and a cubeUV texture fetch per lit fragment forever** | **No, not by default.** See "the environment objection" |
| `RoomEnvironment` | Addon import | As above | As above, plus a bundle import | No. Same objection, and it buys nothing a gradient PMREM does not |

## What each tone mapping does to *this* scene

Measured, 50-book fixture, exposure 1.0 unless stated. `distinct` is
`smoke:render`'s distinct-colour count (5 bits per channel), which
`docs/progress.md` already treats as a measure of tonal detail.

The spine columns come from a 7×7 patch at each book's projected spine face,
**restricted to the 8 books below `MIN_LEGIBLE_THICKNESS` (0.075)**. Those are
the only clean samples: a book at or above it gets a generated spine texture
with its title printed on it, so a patch aimed at the middle of the spine
averages type into the reading. The 41 thick books are reported separately
below; the split changes the answer, and mixing them was the first mistake this
measurement made. Authored median saturation over the same 8 books is 0.411 and
authored median luma is 98.6.

| | distinct | non-bg | clipped px | mean luma | spine sat | spine luma | median ‖rendered − authored‖ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`NoToneMapping` (shipped)** | **1285** | 25.3% | 0.13% | 36.1 | 0.323 | 99.2 | **15.4** |
| `LinearToneMapping` @ 1.0 | 1285 | 25.3% | 0.13% | 36.1 | 0.323 | 99.2 | 15.4 |
| `ACESFilmicToneMapping` | 1579 | 23.6% | 0.00% | 35.0 | 0.430 | 101.0 | 20.1 |
| `AgXToneMapping` | 914 | 25.5% | 0.00% | 37.7 | 0.265 | 112.2 | 25.8 |
| `NeutralToneMapping` | 1642 | 25.5% | 0.00% | 32.6 | 0.544 | 82.1 | 41.8 |
| `ReinhardToneMapping` | 797 | 25.2% | 0.00% | 34.9 | 0.309 | 93.5 | 17.7 |
| `CineonToneMapping` | 1512 | 25.4% | 0.00% | 36.2 | **0.411** | 108.2 | 22.1 |
| *authored `spine_color`* | — | — | — | — | *0.411* | *98.6* | *0* |

Read across, not down:

- **`LinearToneMapping` at exposure 1.0 is bit-identical to today.** Its whole
  body is `saturate(exposure * color)`. Every one of the 49 spine samples came
  back at distance 0.0 from the baseline. So it is not a look — it is the
  exposure knob with no curve attached, and it is the one operator that can be
  offered as "brightness" without changing the shelf's character at all.
- **ACES and Neutral gain tonal detail; AgX and Reinhard lose it.** Neutral
  +28% distinct colours, ACES +23%, Cineon +18%, against AgX −29% and Reinhard
  −38%. Reinhard's `c/(1+c)` compresses the entire range toward the middle and
  AgX desaturates hard by design; both flatten a scene that is already mostly
  mid-tone wood.
- **AgX and Reinhard are the two that hurt spine colour**, and they are visibly
  milky: AgX drops median spine saturation from 0.323 to 0.265 against an
  authored 0.411, and the wood goes grey.
- **The shelf clips today.** 0.13% of pixels sit at ≥254 in some channel under
  `NoToneMapping` — ambient 0.75 + key 2.7 + fill 0.75 + a point light at 14
  puts a lot of the scene above unit irradiance, and the sRGB write clamps it.
  Every tone mapper takes that to 0.00%.

## The warning in the ticket, answered

Measure the 8 books whose spines carry no printed title, where the rendered
pixel is the authored hex under the lighting rig and nothing else:

- **The shipped render already desaturates a spine by about a fifth** — median
  saturation 0.323 against the authored 0.411 — while getting its *brightness*
  essentially exact (99.2 against 98.6). Median RGB distance 15.4.
- **On that distance the shipped render is the most faithful thing measured**,
  and every operator moves spines away from their authored hex: Reinhard 17.7,
  ACES 20.1, Cineon 22.1, AgX 25.8, Neutral 41.8. If "the spine matches the
  book" means the smallest colour distance, tone mapping costs 2 to 26 units of
  it.
- **On saturation alone, two operators fix what the shipped render breaks.**
  Cineon lands on 0.411, exactly the authored median; ACES on 0.430, a 5%
  overshoot against the shipped render's 21% undershoot. Neutral over-corrects
  hard (0.544, +32%) and AgX and Reinhard make it worse (0.265, 0.309). So a
  spine under ACES or Cineon reads *more* like a real binding and measures
  slightly further from its hex, because the error moves from "washed out" to
  "shifted".

Both of those are true at once, and which one matters is an aesthetics call —
which in this project belongs to the owner. The panel's job is to make the
comparison visible, and the numbers above are the reason it is worth making.

Two more things the owner should know before touching the dropdown:

- **Exposure dominates the operator.** ACES at 1.6 takes median distance to
  63.9 and at 0.6 to 57.3, against 20.1 at 1.0 — several times the spread
  between operators. The operator is a look; the exposure is whether the colour
  survives at all. Keep its range narrow.
- **Nothing gates any of this.** No test compares a rendered spine against its
  `spine_color`. If spine fidelity is meant to be a property rather than a hope,
  that is a new gate — the sampling harness used for the numbers above is about
  fifteen lines on top of `projectBook`, and it must exclude books at or above
  `MIN_LEGIBLE_THICKNESS` or it measures typography. It is a separate ticket
  from the panel.

For completeness, the 41 books that *do* carry a printed title, sampled the same
way: shipped median distance 39.0, saturation 0.290, luma 105.5 against an
authored 91.9. Those numbers are what a viewer sees, but they are not a
measurement of `spine_color` — the white type in the patch is most of the extra
distance, and it is the reason the first pass of this research reported the
shelf as brighter than authored when the clean subset says it is not.

**`smoke:render`'s non-blankness signal is not at risk, and its history is.**
The gate wants ≥40 distinct colours and ≥10% non-background. Across every
configuration tried — six operators, exposures from 0.15 to 3.0, fog swaps —
distinct colours ranged **268 to 1888** and non-background **18.7% to 25.5%**.
The floor is 6.7× the threshold and 1.9× the threshold respectively. No plausible
setting trips the gate.

The non-background floor is worth understanding rather than trusting: the test
is `|pixel − background| > 12` per channel, in *either* direction, so the
measure is U-shaped in exposure. It falls as the scene darkens toward
`#1a1613` — ACES at 0.6 is the measured minimum at 18.7%, reproduced exactly on
a second run — and then rises again as the scene darkens *past* the background
and starts counting as non-background from below (ACES at 0.3 is back up to
23.9%). No setting found the bottom of that curve anywhere near 10%.

What a *default* change would do is break comparability:
`docs/progress.md` records 1165 → 1285 → 1305 → 1318 as evidence about shadows
and painted shading, and a tone mapping default would move that number by
±25–40% for reasons that have nothing to do with what those entries measured.

**The background and the fog endpoint are pinned, which is not obvious.** A
`Color` background is set through `gl.clearColor` (`WebGLBackground.setClear`),
and `fogColor` is converted through `getUnlitUniformColorSpace(renderer)` →
`outputColorSpace` (`WebGLMaterials.js:27`) — and `fog_fragment` is included
*after* `tonemapping_fragment` and `colorspace_fragment`
(`meshphysical.glsl.js:217–219`, `meshbasic.glsl.js:109–111`). So neither the
clear colour nor a fully-fogged pixel is tone mapped: the corner pixel measured
exactly `#1a1613` under every operator. `nonBackgroundPct`'s reference colour
stays valid whatever is done here. Scope the claim, though — at *partial* fog
the mix is between a tone-mapped fragment and a pinned background, so
mid-distance books do change, and fog cannot be used to compensate for a tone
mapping choice.

## Fog

`Fog(background, 14, 30)` today.

| Change | Result | Programs |
| --- | --- | --- |
| `near`/`far` → 6/18, mutated in place | distinct 1285 → 1001 | unchanged |
| `color` → `#402010`, mutated in place | distinct → 1012 | unchanged |
| replaced with `FogExp2(0.09)` | distinct → **373**, non-bg 21.8% | +3 |
| back to the shipped `Fog` | distinct → 1285 | reused from cache |

Two notes for whoever builds the panel:

1. **Mutate, do not reassign.** `scene.fog = new Fog(...)` with identical values
   still trips `materialProperties.fog !== fog` (`WebGLRenderer.js:2452`) and
   rebuilds every program. Only reassign when switching linear ↔ exp2.
2. Fog is the cheapest thing on this list to *remove*: 3 uniforms and one line
   of shader. It is also, at a wrong setting, by far the most destructive to the
   image — `FogExp2` at 0.09 costs more tonal detail than every tone mapping
   operator put together.

## Materials

Roughness and metalness are plain uniforms and take effect on the next frame
with no `needsUpdate` — verified by mutating them on the seven wood meshes with
nothing else touched: distinct 1285 → 1294 (roughness 0.82 → 0.2), → 1301 and
non-background 25.3% → 23.7% (metalness 0 → 0.6), and the program count did not
move. They are free and they should be sliders.

`MeshPhysicalMaterial` is not a knob. It is a different class, so exposing it
means constructing replacement materials and disposing the old ones — and the
programs it builds carry 29–31 active uniforms against the standard material's
22. The repo's own `describeLinkFailure` prints `MAX_VARYING_VECTORS` and
`MAX_FRAGMENT_UNIFORM_VECTORS` precisely because a program that compiled would
not *link* on the device this project cares about. A glossy dust jacket is not
worth spending that budget blind. If it is ever wanted, `MeshStandardMaterial`
already has `envMapIntensity` and a roughness slider, which is most of the
apparent gloss for none of the link.

## The environment objection

A `PMREMGenerator` fed from a 64×256 canvas gradient does work, and it applies
automatically — forcing `needsUpdate` on every material afterwards changed
nothing, confirming `materialProperties.envMap !== envMap`
(`WebGLRenderer.js:2448`) does the job. Measured effect: distinct 1285 → 1375,
mean luma 36.1 → 38.7 at default intensity; at `environmentIntensity = 4`,
1512 and 44.7. (Take that magnitude loosely: an earlier probe in the same
session reported *no* change at all from the same operation, for reasons never
established. The structural costs below reproduced across all four probes and
are what the recommendation rests on.) It does not fight the three hand-placed
lights so much as sit
under them — it reads as a lift in the ambient rather than as reflections,
because nothing in this scene is smooth (roughness 0.55–0.95).

The cost, measured: 360 ms to build the PMREM, +3 textures, +5 programs (three
material variants plus `EquirectangularToCubeUV` and `PMREMGGXConvolution`,
which stay resident), and +5 active uniforms on every standard material.

**And it puts a cubeUV texture fetch in every lit fragment, forever.** That is
the same class of operation as the one `?shadowfetch=0` already identified as
what takes the context away on a Pixel 10 Pro — a per-fragment sampled texture
attachment, every frame. This project has already paid to learn that, and the
conclusion there was to stop sampling. Adding a new per-fragment sampler for a
lift in ambient that an `AmbientLight` intensity slider gives for free is the
worst trade on this list.

If the owner wants it anyway, it belongs behind an explicit, off-by-default
switch that says what it is, alongside the existing crash probes — not on a
slider next to roughness.

## Programs accumulate, and that is the real phone cost of a live panel

The shipped shelf runs **3 programs**: `MeshStandardMaterial` without a map (22
active uniforms, 1897 fragment lines), the same with a map (24, 1898), and the
`MeshBasicMaterial` the painted shadows use (9, 447). Measured limits on this
workstation: 30 varyings, 1024 fragment uniform vectors, 16 texture units.

Walking a panel through ACES, AgX, Neutral, fog off, fog on, environment on,
environment off and physical materials took the renderer from **3 programs to
24**, monotonically. Three caches programs by cache key and releases one only
when its `usedTimes` reaches zero (`WebGLPrograms.js:641–643`), which happens
only from `releaseMaterialProgramReferences` on material dispose
(`WebGLRenderer.js:1153`). Nothing in a panel disposes a material, so every
configuration it visits is a compile and a link that stays in the context for
the life of the page. Flipping *back* is free — the cached program is reused — but the first
visit to each combination is not.

On this desktop that is invisible: median render time stayed at 0.4–0.6 ms
across every configuration, including at 4× pixel ratio, which is CPU submit
time for 314 draw calls and not a GPU measurement — `gl.finish()` under ANGLE
did not give a fragment-bound number, so **no claim here rests on desktop
timing**. On the device that lost its context to a program that would not link,
a panel that recompiles on every flip is a different proposition, and it is the
one thing about this panel that should be measured on the phone before it
ships. A "reload to apply" mode for the operator dropdown — as against the
exposure slider, which is a pure uniform and can always be live — is a cheap
hedge.

## Colour space is already right

`renderer.outputColorSpace` is never assigned; three's default is
`SRGBColorSpace` (`WebGLRenderer.js:304`). Cover textures set
`colorSpace = SRGBColorSpace` on load (`scene.ts`, `TextureCache.load`), and so
do both generated canvas textures — the spine title (`spine-texture.ts:74`) and
the painted shadows (`contact-shadow.ts:430`). That is the complete set of
textures in the scene and every one of them is tagged. There is nothing to fix
and nothing worth making adjustable: the only other value is wrong, and a panel
control whose second position is "incorrect" is a trap, not a knob.

## Recommendation

Expose, in this order:

1. **`toneMapping`** — the largest lever, live, automatic, structurally almost
   free per fragment. Ship all six operators; the interesting ones for this
   scene are ACES and Cineon (more tonal detail, and the only two that restore
   the spine saturation the shipped render loses), Neutral (the most tonal
   detail of any, but it over-saturates spines and darkens the case), and
   Linear (a pure exposure knob, bit-identical to today at 1.0). AgX and
   Reinhard both measurably flatten this scene and are worth shipping mainly so
   the owner can see that for themselves.
2. **`toneMappingExposure`** — live and free, disabled while tone mapping is
   `None`, and kept to a narrow range: it moves spine colour further than the
   choice of operator does.
3. **Fog near / far / colour**, mutated in place, plus an off switch and a
   linear/exp2 mode.
4. **Roughness and metalness**, one pair per surface class.

Do not expose `outputColorSpace` (already correct, no second correct value),
`MeshPhysicalMaterial` (a material swap, and more link budget on a device that
failed to link), or `scene.environment` by default (a per-fragment sampler, the
operation this project has already been bitten by).

Two things the panel ticket needs to carry that are not knobs:

- The **default must not change silently.** Every `smoke:render` distinct-colour
  number in `docs/progress.md` is comparable only against the same tone mapping.
  If a default changes, that history needs a line saying so.
- **Recompile-on-flip is the phone risk**, not fragment cost. Nothing measurable
  here says a tone mapping curve is expensive to *run*; what is measurable is
  that each new configuration is a permanent compile and link.
