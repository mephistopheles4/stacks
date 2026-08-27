# Koa, chatoyance, and whether the figure is reachable

Research for [#286](https://github.com/mephistopheles4/stacks/issues/286), which
blocks the channel decision on
[#284](https://github.com/mephistopheles4/stacks/issues/284). Nothing here is
implemented and nothing here chooses a species — this is the evidence the
channel ticket should fix its arm list from.

Everything about three is measured against **0.185.1** — the version in
`node_modules/.pnpm/three@0.185.1`, confirmed against `pnpm-lock.yaml:2839` —
by reading `src/`, not remembered API and not the live docs, which describe a
later release. Everything about the scene is read from
`packages/site/src/shelf/`. Everything about the wood is cited below; where a
source is a trade supplier rather than a primary one it is labelled as such.

## The short answer

**Curly koa's signature is not reachable by any channel three.js 0.185.1
offers, and `anisotropy` is not the missing arm the ticket hoped for.** The
reason is not cost and not lighting. It is that the published measurement of
figured wood says the effect is *not* anisotropic surface reflection, and
anisotropic surface reflection is exactly and only what three implements.

| Channel | For koa | Why |
| --- | --- | --- |
| `map` (pigment) | **Candidate, and the strongest one** | Koa's colour banding and ribbon streaking are pigment, and they are what a non-specialist recognises. Survives the flat front edge |
| `normalMap` (relief) | **Candidate** | Reads on the near-grazing plank tops. Cannot produce curl's band inversion, but koa's *pores* are real relief |
| `roughnessMap` | **Ruled out** | #68's diagnosis carries: no `metalness`, ~4% F0, soft light. The wood is rougher than the spines were, which makes it worse, not better |
| `anisotropy` (`MeshPhysicalMaterial`) | **Ruled out, on the physics before the cost** | Models the wrong phenomenon (see §2); capped at a 1.49:1 lobe by the wood's own roughness (§3); and has no environment map to act on in this scene (§3) |

**`MeshPhysicalMaterial` is not on the table** — but the mobile history is the
second reason, not the first. Even granting a free material swap, the effect
would not appear.

## 1. Koa as an optical subject

**Colour.** The Wood Database gives the heartwood as *"medium golden or reddish
brown, similar to Mahogany"*, with *"contrasting bands of color in the growth
rings"* and boards showing *"ribbon-like streaks of color"* [1]. The USDA
Forest Service's silvics volume agrees on the range and adds the sapwood: a
narrow creamy-white band, with heartwood through *"many rich shades of red,
golden brown, or brown"* [2].

**Figure.** Grain is *"usually slightly interlocked, and sometimes wavy"*, with
a *"uniform medium to coarse texture"* [1]. The trade recognises a dozen-plus
grades; the named categories that recur are blister figure, curl with colour
banding, dark/light curl, and plain with light flame [2, 3].

**Board-to-board variation is extreme, and it is the commercial point.** Koa is
graded and priced on figure precisely because two boards from one log differ.
This matters for the renderer: **one shared wood texture cannot be
representative of koa the way one shared texture can be representative of, say,
maple.** Whatever ships would be one board's worth of koa, repeated.

**Plain koa exists and is common.** Straight-grained, warm gold to red-brown,
no shimmer. Marschner et al. note that in straight-grained wood *"the same kind
of reflection occurs, but with subtler spatial variation"* [4 §1] — the
mechanism is present, the visible drama is not.

## 2. What produces the chatoyance — and why it is not surface anisotropy

This is the load-bearing finding, and it is from the primary source.

Marschner, Westin, Arbree and Moon measured spatially-varying BRDFs of finished
hardwoods, including **curly (fiddleback) maple — the same figure class as
curly koa** — and padauk. Their abstract [4]:

> "With new, high resolution measurements of spatially varying BRDFs, we show
> that this distinctive appearance is due to light scattering that does not
> conform to the usual notion of anisotropic surface reflection. The behavior
> can be explained by scattering from the matrix of wood fibers below the
> surface, resulting in a subsurface highlight that occurs on a cone with an
> out-of-plane axis."

The caption of their Figure 1 is the sentence that settles this ticket:

> "The basic shape of the subsurface reflection from fibers inclined downward,
> parallel to the surface, and inclined upward. **Models for anisotropic
> surface reflection produce results similar to the center drawing.**"

That is: a surface-anisotropy model reproduces the one case where the fibres
happen to lie *in* the surface, and none of the cases where they tilt into or
out of it. The tilting is the effect. From §1 [4]:

> "But the basic result of this paper is that the axis of the cone for this
> subsurface highlight is not constrained to lie in the surface, as it
> generally is for surface reflection... It is the variation in fiber
> inclination across the surface that gives wood—especially figured wood—its
> distinctive appearance."

And from §3, on what the measurements showed:

> "However, this subsurface highlight does not lie on a cone with the same
> inclination to the surface tangent as the incident direction, as the highlight
> from an anisotropic surface reflection must do. Instead, it lies on a
> different cone, and the cone varies across the surface even for a single
> illumination direction."

**They tested the closest available surface-anisotropic model and reported what
it misses.** Ward's model [1992] is the one they compare against — the same
family three.js implements. §5 [4]:

> "Ward's model captures only the changes in appearance due to in-plane fiber
> direction. For example, the padauk and maple appear much more uniform in the
> top row, and the contrast reversal around the knot in the walnut sample is
> completely missed."

That **contrast reversal** is the thing. Curl reads as alternating light and
dark bands that *swap* as the viewer moves — a band that was bright becomes
dark. Their §2 explains why a surface model cannot do it: for long parallel
surface features, *"light will reflect into a cone at the specular angle, and
this is the basic prediction of all the aforementioned models"* — Poulin and
Fournier, Ashikhmin and Shirley, He et al., Kajiya, Ward, Lu et al. are the
models named.

**Their own model is a new BRDF component** — a fibre-reflection term with a
3D fibre axis `u`, fitted per-pixel to measured data, combined with diffuse and
specular. It was rendered in RenderMan, offline. It is not a real-time
technique and three.js does not implement anything like it.

⚠️ **One correction to the ticket's framing.** #286 says none of #284's arms is
view-dependent. A `normalMap`'s specular response *is* view-dependent — the
highlight moves as the camera moves. What a normal map cannot produce is
**band inversion**: perturbing the surface normal tilts the specular cone in
the surface, which is the centre drawing again. So the distinction is not
"static versus view-dependent"; it is that curl's signature needs a highlight
axis that leaves the surface, and neither a normal map nor `anisotropy` has one.

## 3. What three.js 0.185.1 actually gives you

The three properties exist. Verbatim from
`src/materials/MeshPhysicalMaterial.js`:

| Property | Source | What it is |
| --- | --- | --- |
| `anisotropy` | line 353 (`_anisotropy = 0`), getter 370 | *"The anisotropy strength, from `0.0` to `1.0`"* (line 365) |
| `anisotropyRotation` | line 73 (`= 0`) | *"The rotation of the anisotropy in tangent, bitangent space, measured in radians counter-clockwise from the tangent"* (line 66) |
| `anisotropyMap` | line 86 (`= null`) | *"Red and green channels represent the anisotropy direction in `[-1, 1]` tangent, bitangent space... The blue channel contains strength as `[0, 1]`"* (lines 76–78). Must be `NoColorSpace` (line 81) |

three's own one-line description of the feature, at `MeshPhysicalMaterial.js:10`:
*"Anisotropy: Ability to represent the anisotropic property of materials as
observable with **brushed metals**."* Filament, which three's shader cites by
URL, says the same: *"Many real-world materials, such as brushed metal, can,
however, only be replicated using an anisotropic model"* [5]. Neither names
wood.

### What it requires

- **No tangent attribute needed.** `normal_fragment_begin.glsl.js` takes
  `USE_ANISOTROPY` into the same branch as normal mapping: with `USE_TANGENT`
  it builds the frame from `vTangent`/`vBitangent`; without it, it calls
  `getTangentFrame( -vViewPosition, normal, vUv )`. So the derivative fallback
  applies. (Filament states the frame is required [5]; three supplies it either
  way.)
- **A `uv` attribute is required.** With no normal map the fallback passes
  `vUv`, and `getTangentFrame` differentiates it
  (`normalmap_pars_fragment.glsl.js:20`). `BoxGeometry` has UVs, so the planks
  qualify — but the tangent then follows the box's per-face UV layout, meaning
  **the grain direction is uniform per face unless an `anisotropyMap` varies
  it.** Curl needs the map, i.e. +1 texture and a UV channel.
- **One extra program permutation.** `WebGLPrograms.js:140` sets
  `HAS_ANISOTROPY = material.anisotropy > 0`; `:527` enables program-layer bit
  16; `WebGLProgram.js:504` and `:703` emit `#define USE_ANISOTROPY` in both
  stages. The setter at `MeshPhysicalMaterial.js:378` bumps `version` only when
  the value crosses zero — so toggling it on or off is a recompile, and
  changing its magnitude is free.

### Where it applies — and this scene loses half of it

Anisotropy has two consumers in the shader:

1. **Direct punctual lights**, via `BRDF_GGX`
   (`lights_physical_pars_fragment.glsl.js:176–187`), which swaps `D_GGX`/
   `V_GGX_SmithCorrelated` for their `_Anisotropic` variants.
2. **Image-based lighting**, via `getIBLAnisotropyRadiance`
   (`envmap_physical_pars_fragment.glsl.js:47`), which bends the normal and
   re-samples the environment.

**The second is unavailable here.** That whole function sits inside
`#ifdef USE_ENVMAP` (`envmap_physical_pars_fragment.glsl.js:2`), and inside it
the anisotropic path `return vec3( 0.0 )` unless `ENVMAP_TYPE_CUBE_UV`
(`:58–60`). The shelf sets no `scene.environment` and no PMREM — a deliberate
prior decision, recorded with its cost in
[`fidelity-knobs.md`](fidelity-knobs.md). So the only route left is the shape
of three direct-light highlights, and **the stretched environment reflection
that is what anisotropy visibly looks like in every demo of it is simply not
in this scene.**

### The ceiling, in numbers

three's formula, at `lights_physical_fragment.glsl.js`:

```glsl
material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
```

and `alphaB` is the plain `alpha = pow2( roughness )`
(`lights_physical_pars_fragment.glsl.js:159`). Note this differs from
Filament's `αt = α(1+aniso)`, `αb = α(1−aniso)` [5]: **three holds the
bitangent roughness fixed and pushes the tangent roughness toward 1.0.**
Anisotropy here can only ever make the lobe *broader* along the grain — never
tighter across it.

That gives a hard ceiling. The maximum achievable elongation is
`1 / pow2(roughness)`, reached at `anisotropy = 1`:

| Surface | `roughness` | `alphaB` | `alphaT` at max | Max elongation |
| --- | --- | --- | --- | --- |
| Shelf wood (`woodRoughness: 0.82`) | 0.82 | 0.6724 | 1.0 | **1.49 : 1** |
| Shelf backing (`backingRoughness: 0.95`) | 0.95 | 0.9025 | 1.0 | 1.11 : 1 |
| Brushed metal, typical | 0.20 | 0.04 | 1.0 | 25 : 1 |
| Brushed metal, satin | 0.30 | 0.09 | 1.0 | 11.1 : 1 |

Values from `shelf-settings.ts:429–430`. **At the wood's shipped roughness,
driving `anisotropy` to its maximum legal value buys a 1.49:1 lobe** — and
does so by blurring, on a dielectric whose F0 is `vec3( 0.04 )`
(`lights_physical_fragment.glsl.js`, the `#else` branch taken when no `IOR`/
`USE_SPECULAR` is set), under an ambient-plus-two-directionals rig.

⚠️ **The knob that would make anisotropy visible is the knob that makes the
wood look plastic.** To get a brushed-metal-like ratio you must drop
`woodRoughness` toward 0.2–0.3, which turns the matte carcass glossy — which is
closer to, not further from, the "plastic" complaint in
[#279](https://github.com/mephistopheles4/stacks/issues/279).

## 4. Does it survive this scene? #68's argument, re-run

[#68](https://github.com/mephistopheles4/stacks/issues/68) measured a
`roughnessMap` grain on spines at **0 pixels above JND**. Its diagnosis is
recorded verbatim in `shelf-settings.ts:255–260`:

> "The spine sets no `metalness`, so it is a dielectric at ~4% specular
> reflectance under soft light, and roughness modulates a lobe that is barely
> there — a *pattern* in it cannot read, while its *average* plainly does."

**That diagnosis threatens chatoyance directly, and more than it threatened the
spines.** Chatoyance is entirely a specular phenomenon; it has no diffuse
component to fall back on the way a colour map does. Three specifics:

- **The wood material sets no `metalness` either** (`scene.ts:1531–1542`
  constructs it with `color` and `roughness` only), so F0 is 4%, same as the
  spines.
- **The wood is rougher than the spines were.** `woodRoughness: 0.82` against
  `spineRoughness` of 0.67 and 0.43. A rougher dielectric has a *flatter*
  specular lobe, so there is even less lobe for anisotropy to reshape.
- **#68's escape hatch does not exist here.** #68's fix was to move the effect
  into the *average* — two constants beat the texture. Anisotropy has no
  average to move into: at fixed `roughness` it only redistributes energy
  directionally.

**The counterweight #284 offers is real but does not rescue this arm.** Plank
tops sit near-grazing to the key light, where Fresnel lifts specular toward
`specularF90 = 1.0`. That is a genuine reason relief may read on the tops where
it failed on vertical spines. It does not help anisotropy, because the ceiling
in §3 is set by roughness, not by incident angle — grazing light makes the
whole lobe brighter, and both axes of it equally.

### ⚠️ The measurement problem, and this one is my inference, not a source

**Chatoyance is defined by change between viewpoints, and this project's entire
evidence protocol is single static screenshots.** `pnpm smoke:render` writes one
PNG; #68's "pixels above JND" statistic compares two images from *the same*
camera. A single frame cannot show band inversion by construction — the two
frames it lives between do not exist.

So any follow-up render ticket that puts chatoyance on trial needs a different
protocol than #54/#55/#56/#68 used: **N frames along a camera arc, with the
statistic being how far the highlight travels and whether bands swap sign**,
not how far one frame sits from a baseline. On today's protocol, a real
chatoyance win and a total no-op produce the same screenshot. I have not found
any existing tooling in this repo for that; there is no JND script, only the
two prose records of #68's ad-hoc measurement.

## 5. Is "reads as koa" separable from "is figured"?

**Yes, and this is the most useful finding for the channel ticket.**

The reporter asked for koa. What a non-luthier recognises as koa is the
*colour*: warm gold through red-brown, with contrasting growth-ring banding and
ribbon streaking [1, 2]. Those are pigment facts, and pigment is `map` — the
one channel with no specular dependency and therefore no #68 exposure.

Chatoyance is what separates *expensive* koa from *ordinary* koa. It is a
connoisseur's axis. Trade sources describe it as giving a *"three dimensional
quality to finished wood surfaces"* [3] — which is exactly the register in
which it is sold, and exactly the register in which its absence is not noticed
by someone who did not come looking.

**Two further reasons the figure is the wrong thing to chase here.** First,
scale: the carcass is planks seen mostly at shelf distance, and curl's band
period on a real board is a few millimetres — at the framings this shelf
renders, the bands would be at or below a pixel. Second, finish: Marschner
notes the subsurface highlight is *"much more prominent in finished wood"* and
that applying a clear finish is partly why [4 §2]. A bookcase is not a
high-gloss guitar top.

I could not find a source that quantifies recognisability — no study asks
viewers to name a species from an image. **The claim that colour alone reads as
koa is my inference from the colour descriptions, not a measured result**, and
the honest test is the render #284 already plans.

## 6. What this means for #284's arm list

- **The arm list does not need `anisotropy` added.** #286 was right that the
  list had no view-dependent-in-the-required-way candidate, and right that
  `anisotropy` was the obvious nominee. It is the wrong nominee: it models
  brushed metal, it is capped at 1.49:1 by this wood's roughness, it has no
  environment map to bend, and the primary measurement of figured wood says
  surface anisotropy is the wrong model regardless.
- **Pigment (`map`) is the strongest koa arm** and #284's existing
  recommendation stands unchanged.
- **Relief (`normalMap`) stays a candidate on its own merits** — koa's coarse
  pores are real geometry — but should not be sold as a chatoyance
  approximation. It cannot invert bands.
- **`roughnessMap` should be ruled out on the record**, as #284 proposed, and
  this ticket strengthens that: the wood is rougher than the spines where the
  channel already measured zero.
- **`MeshPhysicalMaterial` should stay off the table.** The physics rules it out
  first. The cost record rules it out second, and it is already written down:
  [`fidelity-knobs.md`](fidelity-knobs.md) rates the class swap *"No. On the
  device whose failure was a program that would not link, this is the wrong
  direction. Defer"*, at *"Standard 22 uniforms → physical 29–31"*.
- **A note on G15.** #286 cites G15 as the phone-crash gate. The row in
  `docs/gates.md` reads *"`cover-budget` | what ships fits in a phone's graphics
  memory"* — it caps cover bytes. **Nothing gates shader program count or link
  success.** The Pixel 10 linking failure is recorded in prose
  (`scene.ts:1758–1759`, `docs/progress.md`) and protected by no gate. That
  makes the material-class risk *less* covered than the ticket implies, not
  more.

## What could not be established

- **No measurement of koa specifically.** Marschner et al. measured walnut,
  curly maple and padauk. Curly maple is the same figure class (fiddleback) and
  the mechanism is anatomical rather than species-specific, so the finding
  transfers — but **no source I found measured *Acacia koa*'s BRDF.**
- **No real-time chatoyance technique found in a primary source.** I looked for
  a shipped game/engine approach to figured wood and found none in first-party
  documentation. Filament, three.js and the glTF anisotropy model all frame
  anisotropy as brushed metal, hair and fabric. **Absence of a found technique
  is not proof none exists**; it does mean I cannot cite one.
- **The Khronos `KHR_materials_anisotropy` spec page returned HTTP 403** and I
  could not read it directly. Its model is nonetheless what three implements —
  the `[-1,1]` RG direction plus `[0,1]` B strength packing at
  `MeshPhysicalMaterial.js:76–78` is that extension's packing — but I am citing
  three's source for it, not the spec.
- **Nothing here is rendered.** Every number above is read from source or
  arithmetic on it. The 1.49:1 ceiling is exact; whether 1.49:1 is visible is a
  render question, and my expectation that it is not is an inference from #68.
- ⚠️ **Upstream doc bug, noted in passing.** `MeshPhysicalMaterial.js:71` tags
  `anisotropyRotation` `@default 1` while line 73 assigns `0`. The code is the
  truth; anyone reading generated docs would be misled.

## Sources

1. [Koa | The Wood Database](https://www.wood-database.com/koa/) — trade
   reference, not primary. Colour, grain and texture descriptions.
2. [Acacia koa, Silvics of North America, USDA Forest Service Southern Research
   Station](https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/acacia/koa.htm)
   — heartwood/sapwood colour, figure grades.
3. [Review of wood properties of Acacia koa A. Gray, Hawaii Forest
   Industry](https://hawaiiforest.org/wp-content/uploads/Review_of_wood_properties_of_Acacia_koa_A._Gray_2014.pdf)
   — figure and colour categories, chatoyance in trade terms.
4. Marschner, S. R., Westin, S. H., Arbree, A., and Moon, J. T. **"Measuring and
   Modeling the Appearance of Finished Wood."** *ACM Transactions on Graphics
   (Proc. SIGGRAPH)* 24(3):727–734, 2005.
   [PDF](https://www.cs.cornell.edu/~srm/publications/SG05-wood-lr.pdf) ·
   [ACM DL](https://dl.acm.org/doi/10.1145/1073204.1073254). **The primary
   source for §2.**
5. [Filament: Materials — anisotropic
   model](https://google.github.io/filament/Filament.md.html) — cited by URL
   inside three's own shader chunks
   (`lights_physical_pars_fragment.glsl.js:99`,
   `envmap_physical_pars_fragment.glsl.js:51`).
6. three.js **0.185.1** source, `node_modules/.pnpm/three@0.185.1`. Files read:
   `src/materials/MeshPhysicalMaterial.js`,
   `src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js`,
   `.../lights_physical_pars_fragment.glsl.js`,
   `.../envmap_physical_pars_fragment.glsl.js`,
   `.../normal_fragment_begin.glsl.js`, `.../normalmap_pars_fragment.glsl.js`,
   `src/renderers/webgl/WebGLPrograms.js`, `src/renderers/webgl/WebGLProgram.js`.
