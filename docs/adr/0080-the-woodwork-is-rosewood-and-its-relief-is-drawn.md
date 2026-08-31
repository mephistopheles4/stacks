# ADR-0080 — The woodwork is rosewood, its relief is drawn, and species and resolution are one choice

**Date:** 2026-08-31
**Status:** accepted
**Ticket:** [#299](https://github.com/mephistopheles4/stacks/issues/299), under map [#280](https://github.com/mephistopheles4/stacks/issues/280)

## Decision

The bookcase's woodwork is **Poly Haven `rosewood_veneer1`, CC0, diffuse only,
at 1024**, laid at its true **7.68 world units**. Its relief is a
**procedurally drawn fibre** in `normalMap` at `normalScale` 0.5, period 0.5
world units, baked once at module level. The backboard is a second sheet,
**`dark_wood` at 512**, its grain stated vertical, with the same drawn fibre
turned a quarter turn to run with it.

Four things are **struck** rather than deferred, and the rest of this record is
why:

- **Koa**, as a shipped sheet.
- **Anisotropic specular**, on the physics.
- **Both sheets' own normal maps**, on a measurement.
- **`roughnessMap`**, on availability.

And one thing is recorded as a **coupling** rather than a value: the map's
resolution is not a choice independent of the species, **so the resolution
cannot be a knob**. ⚠️ The *species* is a different question and this record does
not answer it — see below.

## Context

[#279](https://github.com/mephistopheles4/stacks/issues/279) is the owner's
report, in as many words: *"The planks of the shelves doesn't have proper wooden
textures. It threw me off."* Every plank, upright and backboard was one flat
`MeshStandardMaterial` — `0x6b4f3a` at roughness `0.82`, with no map in any slot
— so the furniture holding the library read as tinted plastic. The request named
a species: **koa**.

What follows was decided across nine tickets under map #280, every number of it
on a live build or on screenshots, per
[#282](https://github.com/mephistopheles4/stacks/issues/282)'s rule that *the
verdict is the owner's, never a number*. This record exists because the
prototype branches never merge and will go stale, and it is then the only thing
still readable.

## Why sapele, when the request was koa

**There is no koa.** [#281](https://github.com/mephistopheles4/stacks/issues/281)
checked ambientCG and Poly Haven — about 500 woods between them — and found
zero. Koa's figure would need a *procedure*, and nothing shows code can draw its
banding.

[#286](https://github.com/mephistopheles4/stacks/issues/286) then separated two
things the request had joined. **"Reads as koa" is separable from "is
figured."** Koa's recognisable signature to a viewer who is not a luthier is
colour banding and ribbon streaking — **pigment**, the one channel carrying no
specular dependency — and its *curl* is chatoyance, which is a different
problem answered below. So the species question became: which reachable sheet
carries koa's pigment signature?

Sapele was that answer. It is koa's closest reachable relative on colour and on
interlocked-grain ribbon stripe, and #281 chose it on sound reasoning from a
contact sheet.

⚠️ **The owner's own photograph of what he wanted turned out to be *pommele*
sapele** — the same species carrying the figure, where the plain sheet is the
species without it. Which is the half that was actually being asked for, and
nobody could have known that from the name.

## Why rosewood, when the choice was sapele

**Sapele was the right reasoning and the wrong outcome, and only a render could
say so.** [#284](https://github.com/mephistopheles4/stacks/issues/284) bound it
and measured it against its own **mean-matched flat twin** — a flat colour
computed in linear light to render to the same average as the sheet, whose whole
job is to separate *the grain arrived* from *the average colour moved*:

| | colour + grain | grain alone | grain's share |
| --- | --- | --- | --- |
| sapele @512 | 20.53% | 1.32% | **6%** |
| **rosewood @1024** | **15.60%** | **2.72%** | **17%** |

**94% of what sapele moved was the average colour rather than the grain.** That
is a committed file, a lazy load and a menu to achieve what one hex value
already does — very nearly
[#68](https://github.com/mephistopheles4/stacks/issues/68) a second time, which
is this repository's standing lesson that *invisible* and *never bound* are the
same screenshot.

The owner picked `rosewood_veneer1` off a contact sheet of all 135 woods Poly
Haven publishes: **twice the grain for less colour shift**, with a mean of
`0x6e3412` sitting next to the outgoing `0x6b4f3a` rather than three shades off
it. ⚠️ **It is the only asset either library holds with busy figure** — the same
sweep for *figured* wood of any species returns exactly one.

**The species choice moved the headline number further than the channel choice
did**, which is not what the roster expected.

⚠️ **The twin is the reason this was catchable at all**, which is the argument
for keeping it reachable rather than throwing it away with the harness. A sheet
that moves the average colour and calls it grain is indistinguishable from a
sheet that moves the grain, on every number except that one — so whatever ships
a species choice should ship its flat twin beside it.

## Species and resolution are one choice, not two

⚠️ **This is the clause most likely to be undone by somebody being helpful**, so
it is stated as a coupling rather than as two values.

What the eye reads is **`resolution / unitsPerTile`** — texels per world unit.
The sheets are not the same size, so the same resolution is sharp on one and
soft on another:

| | 512 | 1024 | 2048 |
| --- | --- | --- | --- |
| sapele, 1.6 units per tile | 320 | 640 | 1280 |
| rosewood, 7.68 units per tile | **67** | 133 | 267 |

Rosewood's published sheet is 2430 mm against sapele's 500. **That is exactly
what buys away the repetition** — one tile is wider than the whole bookcase, so
the figure never recurs on this case at all — **and it is exactly what costs the
texels. A bigger sheet at a fixed file size is a coarser sheet, and the two
cannot both come out of one file.**

So a resolution knob would let a visitor make a choice whose meaning changed
under whatever species control sat beside it — and would be meaningless without
one, since a resolution alone says nothing about texel density. There is no such
knob, and the resolutions are constants on the sheet table: 1024 for the
woodwork, 512 for the backboard.

⚠️ **512 came from a precedent that does not transfer.** `MAX_COVER_EDGE` holds
a cover to 512 because a cover is a few hundred pixels tall on a shelf. **A
bookcase upright at `minDistance` fills the frame.** The precedent's arithmetic
still applies — a decode is `edge² × 4` bytes, which is the number the mobile
risk hangs on — but its reason does not.

⚠️ **Laying a sheet smaller than life was proposed by this map and rejected by
eye, twice.** It buys texel density by bringing the repeat back, and the repeat
is the complaint. Measured: rosewood's wrap difference is 5.72 against a local
adjacent-row difference of 3.64, so what was visible was **repetition and not a
seam**.

⚠️ **The mean-matched hex is per resolution, not per species** — a resize is a
blur and a blur moves an average. Rosewood's twin is `0x6e3311` at 512 and
`0x6e3412` at 1024.

## A photographed veneer's normal map is a measured zero; a drawn fibre is not

**A flat-sliced veneer is a sheet peeled off a log. It has almost no relief to
encode, and its normal map says so honestly.**

Measured on two different sheets, at every rung of the distance ladder, level
and orbited: sapele's normal map moved **0.000%** above the just-noticeable
threshold; rosewood's `both` arm differs from its `pigment` arm by **0.000%** at
every rung. The `normalMap` slot was holding a texture and doing nothing.

⚠️ **The zero is about the surface and not about the harness, and that is proved
rather than assumed.** The identical pipe driven at `normalScale 8` moves
**2.684% level and 3.631% orbited**. That canary was not on the roster and it is
the reason this finding can be trusted; #68 established that *invisible* and
*never bound* are the same screenshot, and a zero with no control through the
same pipe cannot tell them apart.

**Relief that is drawn is the only relief that does anything.** Against pigment
alone the procedural fibre adds **0.742% level and 1.481% orbited**, and it
ships **no bytes at all** — a 256-square `CanvasTexture` baked once at module
level, `page-edges.ts`'s pattern for `page-edges.ts`'s reason.

**The two problems are at different frequencies**, which is why one file cannot
serve both. The photograph carries the low-frequency *figure*, and it has to be
laid huge for that figure not to repeat — which is what caps it at 133 texels
per world unit. Close-up crispness is high-frequency *fibre*, which is the same
everywhere on a board and may therefore repeat every few centimetres without
anybody seeing it. Laid at 0.5 world units from a 256 canvas it supplies **512
texels per world unit**, and no file size fixes the figure's ceiling, because
you cannot invent detail that was never captured.

⚠️ **`roughnessMap` is struck on availability rather than on a verdict**, and
its number is sapele's alone. It measured **1.029% at zoom 10**, which beat
relief and *inverted* the prior that roughness was the least promising slot.
Poly Haven publishes none for the sheet that won, so it could not be
re-measured. **The inversion stands as a finding with no home**, and is recorded
here so that a future sheet shipping one is known to be worth measuring rather
than assumed dead.

## Anisotropic specular is struck on the physics, not deferred

The map was charted believing curly koa's chatoyance needed **anisotropic
specular**, and that the channel render was therefore missing a candidate.
[#286](https://github.com/mephistopheles4/stacks/issues/286) was opened to add
that arm. **It removed one instead**, before any argument about cost or
lighting.

**Chatoyance in figured hardwood is subsurface fibre scattering, not surface
anisotropy** — a different phenomenon, which the model family three.js
implements does not represent. Marschner et al., *"Measuring and Modeling the
Appearance of Finished Wood"* (SIGGRAPH 2005), measured this on curly maple, the
same figure class as curly koa: the appearance *"does not conform to the usual
notion of anisotropic surface reflection"*, and their test of the Ward model —
the family three's implementation belongs to — *"completely missed"* the
contrast reversal that is curl's signature.

Three version-pinned facts, read from the installed `three@0.185.1`:

- **The IBL half cannot run in this scene.** `getIBLAnisotropyRadiance` is
  guarded by `USE_ANISOTROPY` **and** `ENVMAP_TYPE_CUBE_UV`. `scene.ts` sets no
  `envMap`, no `environment` and no PMREM — so the stretched environment
  reflection that anisotropy visibly *is* cannot occur. Only direct punctual
  lights remain.
- **The elongation ceiling is arithmetic, and low.**
  `alphaT = mix(pow2(roughness), 1.0, pow2(anisotropy))` while `alphaB` stays
  `pow2(roughness)`, so the ratio caps at `1/pow2(roughness)` — at the shipped
  `woodRoughness: 0.82` that is **1.49:1**, against roughly 25:1 for brushed
  metal at 0.2.
- **The only knob that lifts the ceiling makes the complaint worse.** Reaching a
  visible ratio means dropping roughness toward 0.2–0.3 — toward glossy plastic,
  which is the direction #279 was filed about.

⚠️ **This is struck rather than deferred on purpose.** A deferred item invites a
future session to try it with better lighting or a bigger budget; the ceiling
above is a property of the shader and the scene, and no amount of either moves
it. Reopening it means an `envMap` and a different reflectance model, which is a
larger change than the one being justified.

⚠️ **A second finding fell out of it, and it outlives this record.** This
repository **cannot measure a view-dependent effect at all**: chatoyance is
*defined* by change between viewpoints, `smoke:render` writes one PNG, and #68's
statistic differences two frames from the same camera. **A real win and a no-op
produce identical output.** Anything future that depends on view-dependence
needs an instrument that does not exist yet.

## What this record does not decide

⚠️ **Whether the species is a knob is [#306](https://github.com/mephistopheles4/stacks/issues/306)'s
decision, not this one**, and the distinction is easy to lose because the
coupling above rules the *resolution* out. It does not rule the species out. The
two are asymmetric for a reason worth stating: a resolution control would mean
something different under each species beside it, where a species control means
one thing and simply carries its own resolution with it.

So this record fixes **what the woodwork is** — rosewood at 1024, `dark_wood` at
512, the drawn fibre — and is silent on **whether that choice stays revisitable
from a menu**, what belongs in such a menu, how it is fetched, and what it
reports. That ticket owns those, and owes whatever record they need.

⚠️ **This is written to be true whichever of the two lands first.** Nothing above
asserts that a species menu exists, and nothing above forbids one.

## What the case growing has not been measured against

Every render on map #280 was of a **four-row** case, and the case grows with the
library: `rowsForCase` keeps one empty row ahead, so an upright's height changes
while a plank's length never does.

**Two rows is rendered and correct.** At `MIN_ROWS` the backboard is **wider
than tall**, and its grain still runs **vertically** — which is the whole reason
[#285](https://github.com/mephistopheles4/stacks/issues/285) *states* each
member's grain direction rather than deriving it from its long axis. ⚠️ **A
long-axis rule would turn the backboard's figure 90° the day the library filled
its third row**, because the board is wider than tall at 2 and 3 rows and taller
than wide from 4 on. The world-space UV rewrite reads each member's size back
off `geometry.parameters`, so the period stays constant across members of any
size without anything being told what size they are.

⚠️ **Six rows is not rendered, and cannot be from what this repository holds.**
The 50-book fixture vault yields 41 shelved books and a four-row case, and
`?books=N` only *limits*. Reaching six rows needs a larger fixture, which is a
fixture change rather than a render. What is argued rather than measured there:
the direction is stated and so is invariant under growth by construction, and
the period is read off the geometry and so is too. **What nobody has looked at
is how the figure reads on an upright half again as tall** — a taller board
shows more of one tile, and one tile is already wider than the whole bookcase.

## Consequences

- **`materials.wood` and `materials.woodDark` change meaning.** A diffuse map
  *multiplies* `color`, so they become the colour each surface shows **before
  its sheet decodes, and if it never does** — starting at the mean-matched hex
  and switching to white inside the load callback. On success the final frame is
  byte-identical to what was judged; on a failed or slow load the visitor gets
  the flat arm the owner accepted rather than a white bookcase.
- **The depth-buffer tie had to be fixed in the same band.** The bookcase had
  **46 coplanar overlapping face pairs**, and only the backboard's flickered on
  `main` because every other woodwork face carried the identical flat colour. **A
  texture does not cause that, it reveals it** — all 46 become visible the moment
  one lands. Fixed to the class and enumerated from the case's own constants by
  G51 ([#296](https://github.com/mephistopheles4/stacks/issues/296),
  [#301](https://github.com/mephistopheles4/stacks/issues/301)).
- **A whole asset class was outside every counter.** G15 counts cover bytes and
  a file committed straight into `packages/site/public/` passes through none of
  that, so G52 (`sheet-size`) caps every sheet's long edge and byte size. The
  cost that matters is **decode**, at `edge² × 4` bytes.
- **Neither `cover_source` nor anything else gates re-hosting these sheets.**
  Both are Poly Haven, CC0.
- **The mobile risk is not closed by any of this.** Every cost figure across the
  map is a **count**, and none is a demonstration that anything is slow. No
  frame-time measurement exists for the treatment, and `smoke:render` is a
  desktop context with gigabytes of headroom.

## Alternatives considered

- **Koa as a shipped sheet.** No asset exists in either library; its figure
  would need a procedure and nothing shows code can draw its banding.
- **A procedural figure rather than a photograph.** Set aside for the *figure*
  and adopted for the *fibre* alone, which is the half a procedure demonstrably
  does well.
- **`woodTile`, laying a sheet smaller than life.** This map's own proposal,
  struck by eye twice with the arithmetic recorded above.
- **A resolution knob.** Struck by the coupling; what it meant would depend on
  whichever species control sat beside it.
- **The fibre's period as a knob.** 0.3 is recorded on #284 as *"a lead rather
  than a recommendation"* and was never rendered after the noise fix. **A number
  nobody has looked at does not become a control.**
- **Dialling the uprights separately (#285), or individual planks (#287).** Both
  declined; what survives is the per-member variation, which is not a control.
- **Retuning the key light or the bloom to flatter the grain.**
  [ADR-0033](./0033-painters-follow-the-light.md) ties the painted shadows to
  the key light, so moving it drags four things nobody asked about. Measured and
  not needed: the brightest pixel any arm reaches is **0.444 against
  ADR-0034's bloom threshold of 0.85** — rosewood is *darker* than the outgoing
  shelf in places.

## The habit that produced all of this

Two premises on this map were plausible and wrong under a render — sapele's
choice, and a seed read from the books. **Three defects produced a confident
zero by three different mechanisms**: a duplicated query parameter where
`URLSearchParams.get` returns the first; a guard where `Number(null)` is `0`
rather than `NaN`; and a fibre bound at 90° to its figure that passed every
whole-frame count and took a 3× crop to see.

The habit that caught all five was **building the arm nobody planned and
measuring before concluding**, and its sharpest form is #284's `normalScale 8`
canary: **a zero needs a control through the identical pipe.**
