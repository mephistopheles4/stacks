# The woodwork is rosewood, and the UVs are rewritten to world space

**2026-08-30** — [#302](https://github.com/mephistopheles4/stacks/issues/302).
The second of the six implementation tickets under
[`docs/spec/the-woodwork-reads-as-wood.md`](../spec/the-woodwork-reads-as-wood.md),
landing on the bookcase [#301](https://github.com/mephistopheles4/stacks/issues/301)
had just stopped flickering.

## What was wrong

The furniture holding the library read as tinted plastic. Every plank, upright
and backboard was one flat `MeshStandardMaterial` — `0x6b4f3a` at roughness
`0.82`, **no map in any slot** — and the owner reported it in as many words on
[#279](https://github.com/mephistopheles4/stacks/issues/279): *"The planks of the
shelves doesn't have proper wooden textures."*

That state was designed rather than broken, which is why this is a look change
and not a bug fix.

## What was done

One committed sheet — Poly Haven's `rosewood_veneer1`, **CC0**, diffuse at 1024
— bound to the material the planks and uprights share, laid at its true **7.68
world units**. That configuration is not this session's: it is what
[#284](https://github.com/mephistopheles4/stacks/issues/284) chose on a live
build across a map's worth of renders, at **+1 texture and +0 draw calls** —
re-measured here rather than inherited, by pointing `WOODWORK_SHEET.url` at a
file that does not exist and re-running `pnpm smoke:render`: **63 textures and
320 draws without the sheet, 64 and 320 with**. The draw count is flat because
planks and uprights share one material, which is the whole reason the UVs carry
the per-member scale instead of a cloned texture's `repeat`.

That run is also how the failed-load path was checked end to end: it renders a
plausible flat brown bookcase, and the 404 turns `smoke:render` red rather than
passing quietly.

The arithmetic lives in `packages/site/src/shelf/woodwork.ts` and `scene.ts`
calls it, for the reason `scene.ts`'s own comment gives: `buildShelf` needs a
WebGL context and is not a test seam. The module is inside the
`packages/site/src/shelf` mutation scope by construction, so it needs specs
whether or not anybody writes them, and it has 21.

## Three things that had to be got right, and one that had to be left alone

### The UVs are rewritten to world space, per box face

`BoxGeometry` gives every face `0..1` whatever its size, so **one shared
`texture.repeat` cannot be right for two faces of different sizes**. A plank's
top face is `3.58 × 0.71` and its front edge is `3.58 × 0.07` — a ten-to-one
difference on the axis they do not share — so a repeat that suits the top smears
the grain vertically on the edge. That edge is the surface #284 names as the
most plastic-looking one on the shelf today, which is the whole point: shipping
the sheet without this would have put the worst artefact on the surface the
report was about.

Rewritten, one map holds a constant world-space period on every face of every
member: a tile is 7.68 units wide wherever it lands.

⚠️ **The size comes off `geometry.parameters`, and that is structural rather
than tidy.** #301 shrank every plank in `x` and `z` and the backboard in `x` and
`y` off the planes the uprights own, so a member's world size is its
**post-inset** size. Handing that size in as an argument would be a second copy
of `buildShelf`'s arithmetic — and a copy that drifted would leave the grain's
period subtly wrong on every member, with nothing able to notice.

### The grain is stated per member, never inferred

The sheet's figure runs along its own `v` axis, which is a fact about the
downloaded image rather than a convention. So a face whose long axis lands on
`u` exchanges its two axes before scaling, and a face whose long axis is already
on `v` does not. Naming the member's grain axis and letting each face decide is
what puts the figure along a plank's length **and** up an upright's height out
of one call: a plank swaps its top and front faces, an upright swaps nothing.

⚠️ **A rule that took the longest side would have been wrong on a case that
grows.** `rowsForCase` keeps one empty shelf ahead, so an upright's height
changes with the vault while a plank's length does not — and the backboard is
wider than tall at two and three rows and taller than wide from four on. Its
grain would have turned sideways the day a book was added. This is why
[#285](https://github.com/mephistopheles4/stacks/issues/285) *states* each
member's direction, and it is stated here too.

### `materials.wood` changed meaning, and `applySettings` had to change with it

A diffuse map **multiplies** `color`. Left at `0x6b4f3a` the sheet would render
at about a third of its brightness; set to white up front, a failed load would
give a **white bookcase**. So `color` starts at the sheet's mean-matched hex and
switches to white inside the load callback — byte-identical on success, and
#284's rendered-and-accepted flat arm on failure.

⚠️ **The mean hex was taken from `prototype/284-woodwork-channels` rather than
recomputed.** It is `linearToSRGB(mean(sRGBToLinear))`, because shading
multiplies a linear albedo by a linear radiance; the naive sRGB-byte average
lands a step off in green. It is also **per resolution** — a resize is a blur and
a blur moves an average — so `0x6e3412` is the twin for the 1024 map that ships
and not for the 512 beside it on that branch.

⚠️ **The trap is one file over.** `applySettings` repaints the material on any
change to `materials.wood`, so unrouted, one tick of the debug panel or one
`?tune=` would put a dark colour back under a decoded sheet. It now routes
through `woodColour`, and its report says *fallback only — the sheet has
decoded* rather than claiming a change the eye cannot find.

⚠️ **The map is assigned inside the load callback rather than on the way out**,
which is the one place this differs from the prototype. `TextureLoader.load`
returns a `Texture` whose image is filled in later, so a material holding it
through a *failed* load carries a map with no pixels — and what a visitor gets
then is whatever the renderer substitutes, not the flat brown the ticket
promises. One shader recompile at boot buys a promise that is literal.

### The sheet's own normal map is not bound, and must not be

A flat-sliced veneer is peeled off a log and has almost no relief to encode.
#284 measured rosewood's normal map at **0.000% above the just-noticeable
threshold at every rung, on two different sheets**, and proved that was the
surface rather than the harness by driving the same pipe at `normalScale 8` for
2.684%. Relief arrives in [#303](https://github.com/mephistopheles4/stacks/issues/303),
**drawn rather than photographed**. `roughnessMap` is struck outright: Poly Haven
publishes none for this sheet.

## The gate: G52 (`sheet-size`)

⚠️ **A whole asset class sat outside every counter.** G15 (`cover-budget`) stages
the fixture vault through `publish()` and measures what lands in `covers/`; a
file committed straight into `packages/site/public/` passes through none of
that. So from the moment the furniture stopped being flat colour, the largest
images the shelf uploads would have been the ones nothing measured — on exactly
the axis whose arithmetic G15's own row records reaching the live site and
killing a phone. **The cost is decode, not download**: `edge² × 4` bytes of RGBA,
4.0 MB at 1024 and 16.0 MB at 2048, uploaded before the first frame beside every
cover. `smoke:render` screenshots a desktop context with gigabytes of headroom
and would see none of it.

Two caps, because two different things go wrong: the **long edge**, which is what
reaches graphics memory, and the **byte size**, which notices a sheet re-encoded
at a quality nobody asked for and dimensionally innocent.

⚠️ **Neither cap is derived from what is in the directory today**, which would be
a floor equal to a population. Both are set against the sheets #304 and #306 will
add — `dark_wood` at 512 is 54.5 KB and sapele at 1024 is 170.8 KB, measured on
the prototype branches that hold them — so a later ticket lands its own sheet
without relitigating this number, and a 2048 is refused whichever ticket brings
it.

⚠️ **A directory sweep passes perfectly when the directory is empty, renamed or
misspelled**, which is *a malformed identifier reads as no findings*. Three
clauses close it: the sweep is floored, **a file `sharp` cannot open is a red
naming it** rather than a silent skip, and the URL `woodwork.ts` resolves must
name a file the sweep actually found — which is also what points the caps at the
sheet that ships rather than at whatever is lying beside it.

**Observed red four ways**, each on its own terms: `rosewood-diff-2048.jpg`
restored from the prototype branch reddens both caps at 2048x2048 and 1027.1 KB;
a `README.md` in the directory reddens the measurability clause naming the file;
renaming the sheet to `rosewood-diff-1023.jpg` reddens the URL clause naming both
sides. 5 of 5 green immediately before and after each.

## What this ticket does not do

- **The backboard keeps its flat `woodDark`.** Its own sheet is
  [#304](https://github.com/mephistopheles4/stacks/issues/304)'s, and it is a
  different image — the darkness constraint left one candidate of 41.
- **No per-member variation.** Every plank shows the sheet at the same phase,
  which is [#305](https://github.com/mephistopheles4/stacks/issues/305)'s.
- **No species menu and no `?woodSeed=`.** Those are #306 and #305, and this
  ticket ships the chosen configuration wired the way the standing rules require
  rather than the prototype's `?wood=` arm switch.
- **No ADR.** [#281](https://github.com/mephistopheles4/stacks/issues/281) owes
  one and the spec puts it on ticket 7, with the whole treatment on `main`.

## What is still unmeasured

**No frame-time measurement exists for any of this**, here or anywhere under
#280. Every figure across the map is a *count* — textures, draw calls, bytes —
and none is a demonstration that anything is slow. Nothing has been rendered on
a phone, and [`docs/gates.md`](../gates.md) is explicit that the mobile crash
risk is gated by nothing. G52 caps one file's decode; it says nothing about the
sum of everything the page uploads, which is G15's question about a population
G15 does not read.
