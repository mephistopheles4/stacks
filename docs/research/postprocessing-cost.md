# What a postprocessing pipeline costs this shelf

Research for [#42](https://github.com/mephistopheles4/stacks/issues/42). Nothing
here is implemented. Every number was measured or read out of
`three@0.185.1`'s own source in this worktree; where something can only be
answered on a device, it says so.

**Short answer:** bloom and AO are **not one ticket**. Bloom is a bounded,
measurable change with no new failure mode. AO reintroduces the exact GPU access
pattern that killed every real-time shadow configuration on the owner's phone,
*and* it recomputes darkening the case already paints by hand. Ship the bloom
chain if it is wanted; file AO separately, behind a device probe, and expect to
abandon it.

---

## 1. Is `three/examples/jsm/...` a new dependency?

**No — and the repo has already decided this once, in code.**

`packages/site/src/shelf/scene.ts:2`:

```ts
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
```

**No ADR records a decision to depend on the addons.** Across all 31 records the
only mention of OrbitControls at all is incidental — ADR-0016's leak audit, noting
that it "uses module-scope temporaries unless `zoomToCursor` is on, which it is
not" — and nothing anywhere mentions `examples/jsm` or addons as a dependency
question. The shelf has shipped, deployed and passed every gate with that import
since Phase 2. So the repo's own practice
already treats the addons as part of the `three` package rather than as a new
dependency, and a research ticket is not the place to reverse a rule the
codebase has been living under for five phases.

The argument for that reading, rather than just the precedent:

- **The rule protects against supply-chain surface and version churn.** Its
  stated form in CLAUDE.md is "do not add dependencies without noting why in
  `docs/adr/`", and ADR-0001 gives the reasoning: R3F plus drei is "two more
  dependencies whose version churn would land on a scene that is drawn once and
  then barely changes". Addons add neither. `package.json` is unchanged,
  `pnpm-lock.yaml` is unchanged, no new publisher is trusted, and the files are
  already on disk under `three@0.185.1`'s own `files` list — `three`'s
  `package.json` exports them deliberately (`"./examples/jsm/*"` and
  `"./addons/*"`).
- **The ticket's counter-argument is real but is about something else.** Addons
  *are* less stable than core: they carry no independent semver, they break
  between three minors, and `scene.ts` already documents one such break in a
  neighbouring API (three 0.185 silently substituted `PCFShadowMap` for
  `PCFSoftShadowMap`, so `?shadowtype=soft` had not been running soft filtering
  for some time). That is an **upgrade-risk** fact, not a dependency fact. It
  argues for pinning `three` and reading the changelog on every bump, not for an
  ADR per import.

**What is worth an ADR is the pipeline, not the import.** Moving from
`renderer.render()` to an `EffectComposer` is exactly what CLAUDE.md describes as
recordable: hard to reverse, surprising without context, and a real trade-off —
it changes how every material in the scene compiles (§3), it silently discards
the antialiasing the shelf runs with today (§5), and it overlaps a subsystem the
project deliberately hand-built (§4). Record the composer. Do not record the
`import`.

There is also **no bundle-size gate** to appeal to. `docs/gates.md` scores a
texture budget (G15) and a site→core import gate (G6); nothing in this repo
asserts anything about JavaScript weight. So §2's numbers are information for a
decision, not a pass/fail.

---

## 2. Bundle weight

### Baseline — a real `pnpm build` in this worktree

```
packages/site/dist/_astro/Shelf.astro_astro_type_script_index_0_lang.Bf9RxLi2.js
  568,041 bytes minified
  143,920 bytes gzip
```

One chunk. The build already warns that it is over vite's 500 kB advisory.

### Marginal cost of the passes

Measured with vite 8.2.0 (the version Astro 7 uses here) + esbuild minify,
bundling the **real** `packages/site/src/shelf/boot.ts` as the baseline so the
deltas are against the shelf's actual tree-shaken three, not against a synthetic
one. Nothing in the repo was modified; the entry points live in the scratchpad
and import `boot.ts` by absolute path.

| chain | minified | gzip | brotli |
| --- | --- | --- | --- |
| shelf today (baseline) | 703,901 | 158,922 | 128,869 |
| `+ EffectComposer + RenderPass + OutputPass` | **+12,580** | **+2,818** | +1,891 |
| `+ UnrealBloomPass` (on top of that) | **+10,397** | **+1,907** | +1,701 |
| **bloom chain, total** | **+22,977** | **+4,725** | +3,592 |
| `+ GTAOPass` (on top of bloom) | **+40,728** | **+7,763** | +6,035 |
| **bloom + GTAO, total** | **+63,705** | **+12,488** | +9,627 |
| `SSAOPass` instead of GTAO (over scaffolding) | +26,002 | +4,944 | +3,761 |

Cross-checked against a second, independent baseline (`import * as THREE` with
tree-shaking suppressed, so the deltas are pure addon code): bloom chain +21,556
minified / +4,526 gzip; bloom+GTAO +61,400 / +12,154. The two methods agree
within 7%, so the numbers are the addons and not an artefact of how the baseline
was built.

Against the real 143,920-byte gzip payload that is **+3.3% for bloom** and
**+8.7% for bloom and GTAO**.

**GTAO's weight is mostly GLSL, and it shows.** `GTAOShader.js` (12.2 kB) +
`PoissonDenoiseShader.js` (7.1 kB) + `SimplexNoise.js` (14.9 kB) + `GTAOPass.js`
(19.9 kB) is 54.1 kB of source that minifies to 40.7 kB — a 25% reduction, where
`UnrealBloomPass` + `LuminosityHighPassShader` (16.2 kB of source) minifies to
10.4 kB, a 36% reduction. Minifiers do not touch the inside of a template-literal
shader. Gzip does, so the gap mostly closes after compression.

### The `?debug` number and the every-visitor number are the same number today

The ticket assumes the diagnostics panel is lazy-loaded behind `?debug`. **It is
not.** `boot.ts:2` imports `mountDiagnostics` statically and `boot.ts:82` gates
it at *runtime* on `params.has('debug')`. There is no `await import()` anywhere
in `packages/site/src`, and Astro emits the island as a single chunk.

So:

- **Ships to every visitor today:** the full number above, whatever gate is put
  in front of the *behaviour*.
- **Behind a real lazy load:** 0 for a visitor without the flag — but that number
  does not exist until someone introduces dynamic-import infrastructure, which
  is its own change with its own consequences (a second network round-trip
  before the effect can be constructed, and a code path that only ever runs when
  somebody types a query parameter, i.e. one that nothing gates).

That is the most useful fact in this section: **there is currently no mechanism
by which a postprocessing pass costs a visitor nothing.** Anything added is
shipped to every phone that loads the shelf, running or not.

---

## 3. The material recompile, and whether it hits the PowerVR bug

### What actually failed, stated precisely

From `docs/progress.md`: a `MeshBasicMaterial` — a painted shadow plane —
**compiled clean and would not link**, with empty link, validate and both shader
logs. Three then called `useProgram` on the invalid program every frame until the
context died. `shadows=1` recompiles every material in the scene, and three's
`meshbasic` shader includes no shadow chunk in either stage, so the only
difference in that program was **two inert `#define`s**.

The bisect's conclusion was narrower than "shadows are expensive": `shadowfetch=0`
**survived** with the 32 MB target still allocated and still drawn, `casters=0`
died, an empty case died, and VSM died. What every dying configuration had was
materials that read the shadow map at all. It was never a budget.

### Does a composer reproduce it?

**A composer forces the same class of recompile — a larger one — and this is
predictable from three's source.**

`WebGLPrograms.js:212` computes a program's `outputColorSpace` parameter as
`renderer.outputColorSpace` **only when rendering to the default framebuffer**;
into a render target it is `ColorManagement.workingColorSpace`. Line 441 puts
that value into the program cache key. `WebGLPrograms.js:176–186` does the same
for tone mapping: inside a render target, `toneMapping` is forced to
`NoToneMapping` regardless of `renderer.toneMapping`.

The shelf currently sets **neither** `toneMapping` nor `outputColorSpace`
(defaults: `NoToneMapping`, `SRGBColorSpace`), and renders to the canvas. The
moment `RenderPass` renders the same scene into `renderTarget1`, every scene
material's cache key changes and **every program in the scene is compiled and
linked again** under different defines — the `linearToOutputTexel` function
changes, the colorspace chunk changes. That is strictly more change than the two
inert `#define`s that produced an unlinkable program on this driver.

Then there are new programs. The chain adds fullscreen-quad materials that have
never been compiled on this device:

| addition | new programs (approx.) |
| --- | --- |
| `OutputPass` (`RawShaderMaterial`) + composer's internal copy pass | 2 |
| `UnrealBloomPass` — luminosity high-pass, 5 separable-blur materials each with its own `KERNEL_RADIUS`, composite | 7 |
| `GTAOPass` — `MeshNormalMaterial` scene override, GTAO, Poisson denoise, blend, copy | 5 |

The shelf runs on **3** programs today (2 with `?painted=0`). The bloom chain
roughly quadruples that; adding GTAO takes it past 15.

### Bloom versus AO: different risk, and the difference is checkable in source

This is the part worth acting on.

**Bloom introduces no depth sampling.** `EffectComposer`'s targets are
`HalfFloatType` colour targets whose depth attachment is a renderbuffer, never a
sampled texture. `UnrealBloomPass` reads colour only. Nothing in the bloom chain
binds a depth texture or reads one in a fragment shader. So the specific
mechanism the bisect closed on — materials that read a depth/shadow map — is not
reintroduced.

**AO does exactly that, and in the precise form that died.** Both AO passes
allocate a native `DepthTexture` and sample it as a plain `sampler2D`:

- `SSAOPass.js:151–153, 183` — `DepthTexture` with `DepthStencilFormat` /
  `UnsignedInt248Type`, bound to `tDepth`.
- `GTAOPass.js:314–334` — the same, plus `tNormal` from a `MeshNormalMaterial`
  prepass. `GTAOShader.js:69` declares `uniform highp sampler2D tDepth;` and
  `:297` reads it with `texture2D( tDepth, … ).x`.

**That pattern has already been run on this device, and it died.** The VSM path
allocates an RG HalfFloat colour target **plus** a native `DepthTexture` with
`compareFunction = null`, explicitly commented "For regular sampling (not shadow
comparison)" (`WebGLShadowMap.js:218–241`). Its vertical blur then binds that
depth texture straight to a plain sampler —
`shadowMaterialVertical.uniforms.shadow_pass.value = shadow.map.depthTexture`
under the comment "vertical pass - read from native depth texture"
(`WebGLShadowMap.js:399–404`) — and the shader it feeds declares `uniform
sampler2D shadow_pass` and is drawn as a fullscreen quad
(`src/renderers/shaders/ShaderLib/vsm.glsl.js`). `?shadowtype=vsm` **died**.

So the access pattern GTAO/SSAO require — a native depth texture, comparison
disabled, sampled as a plain `sampler2D` from a fullscreen quad — is not merely
the same family as something that failed here. It is the same thing, and it has
already been run on this phone. That is still not proof, because VSM also kept
scene materials sampling the variance map, and `shadowfetch=0` does not separate
sampling from binding. It is the strongest predictive statement the evidence
supports, and it points the wrong way.

### What is predictable and what is not

**Predictable, from source:**

- Every scene program relinks the first time a composer is introduced.
- Bloom adds ~7 new programs and no depth sampling.
- AO adds ~5 more programs, a whole-scene `MeshNormalMaterial` override pass, and
  a depth texture sampled per fragment.

**Not predictable, on this hardware:** whether any given program links.
`docs/progress.md` establishes that with a program that differed by two inert
`#define`s, compiled clean, and returned an empty log. Nothing about the shader
source predicted it and the driver would not say why. The device is the only
oracle.

**The good news is the instrument already exists.** `renderer.debug.onShaderError`
halts the loop on the first failed link, calls `gl.validateProgram` (which three
never does), reads all four logs and the limits, and lands the report in the
`?debug` black box where it survives a lost context. So a device test is one
query parameter and one reload, with no cable — which is exactly what should
gate any AO work, and what makes the sequencing in §6 cheap.

---

## 4. AO against the painted shading

`contact-shadow.ts` paints four things, all computed once from the layout:

| painter | what it darkens |
| --- | --- |
| `makeContactShadow` | a soft body and a tighter root where each book meets the plank |
| `makeRecessShade` | the corner light does not reach — under each plank, at both uprights |
| `makeBackboardShade` | the plank above and the right upright, cast on the back wall |
| upright wedge | the right upright's real shadow across the plank |
| `makeNeighbourShadow` | the band a shelved book throws down one side of a face-out cover |

Screen-space AO darkens **creases and contacts**: exactly the book/plank contact
line, exactly the plank/upright/backboard corners. Two of the four painters
compute the same darkening from geometry that AO would compute from depth.

**They double-darken.** The project has run this experiment already, in the other
direction: `?shadows=1` and the painted shading are independent systems, so
asking for real shadows "has always drawn them on top of the painted ones and
double-darkened everything the two agree about" — which is why `?painted=0`
exists, and why every screenshot taken with `?shadows=1` before that flag has to
be read with that in mind. AO is the same shape of collision with the same two
painters, and it would need the same escape hatch.

So the overlapping components are **replace-or-nothing**:

- `makeRecessShade` — replaced outright by AO, or kept and AO attenuated to
  nothing at the corners. There is no compose.
- `makeContactShadow`'s **root** — same. Its soft **body** is a *cast* shadow,
  directional, derived from the key light's real position; AO cannot produce it
  and would not remove the need for it.
- `makeBackboardShade` and the **upright wedge** are cast shadows from a specific
  light. AO does not compute them and does not replace them. They stay.

**What AO adds that the painters cannot** is exactly the honest limit
`docs/progress.md` records against itself: books do not shade each other beyond
the one band a shelved book throws down a face-out cover, and that band "is
straight where the real one is *shaped* — the occluder is a taller neighbour, so
its top corner throws a diagonal. Reproducing that needs each book to know how
tall the one beside it is." AO gets that for free, and it gets the darkening
between adjacent spines that nothing paints today.

That is the entire value case. Everything else AO would compute is already in the
texture, computed once, at no per-fragment cost, on hardware that can hold it.
And the alternative to AO for the one thing it adds is not nothing: a painter
that reads its neighbour's height is a bounded change to code that already runs
everywhere.

**Whichever way it goes is an aesthetics decision, and by the precedent set when
shadows were kept on by default, that belongs to the owner and not to a pass
chain.**

---

## 5. Order of operations

```
EffectComposer
  1. RenderPass(scene, camera)          // scene → rt, linear-sRGB, HalfFloat
  2. GTAOPass(scene, camera, w, h)      // if AO ships at all; blends AO onto the beauty
  3. UnrealBloomPass(resolution, strength, radius, threshold)
  4. SMAAPass()                         // replaces the MSAA the composer discards
  5. OutputPass()                       // tone mapping + sRGB transfer, last
```

Why that order, each verified against 0.185's source rather than recalled:

- **AO before bloom.** AO multiplies scene luminance *down* at contacts. Run
  bloom first and a contact blooms and is then darkened, leaving a halo brighter
  than the thing that cast it. `GTAOPass` composites through `blendMaterial` onto
  the read buffer (`GTAOPass.js:571–578`), so downstream passes see an already
  darkened image, which is what the bloom threshold should be reading.
- **Bloom before output.** `EffectComposer` allocates its buffers as
  `HalfFloatType` (`EffectComposer.js:67`), and materials rendering into a target
  write `ColorManagement.workingColorSpace` (`WebGLPrograms.js:212`). The whole
  chain is therefore linear light until the end, which is where a luminance
  threshold and an additive composite belong.
- **`OutputPass` last, and it is not optional.** It reads `renderer.toneMapping`
  and `renderer.outputColorSpace` every frame and rebuilds its defines when they
  change (`OutputPass.js:96–116`), applying the sRGB transfer that scene
  materials stopped applying the moment they started rendering into a target.
  Without it the shelf renders visibly wrong — dark and desaturated. Anything
  placed after it operates on display-referred values.
- **AA is not free any more, and this is the trap.** `EffectComposer` never sets
  `samples` on its render targets. The shelf's `new THREE.WebGLRenderer({ canvas,
  antialias: true })` multisamples the *default framebuffer*, into which the
  composer only ever draws one fullscreen quad — no geometry edges, nothing to
  resolve. So adopting a composer **silently throws away the antialiasing the
  shelf runs with today**, on a scene made almost entirely of thin vertical book
  spines, which is where it is most visible. Two consequences: set
  `antialias: false` when compositing (otherwise you allocate ~62 MiB of MSAA
  buffer for no effect), and add an AA pass.
  `SMAAPass`'s own doc comment says it "operates in `linear-srgb` so this pass
  must be executed **before** `OutputPass`" — but it is 50 kB of source, larger
  than the entire bloom chain. `FXAAPass` is ~7 kB and is luma-based, so it goes
  *after* tone mapping; three's source documents SMAA's position and is silent on
  FXAA's, so treat that placement as convention and check it on screen.

### And it makes `?aa` a lie, which this repo has a rule about

`?aa=0` was shipped only after it was verified to flip
`gl.getContextAttributes().antialias`, because "a probe that silently did nothing
would be worse than no probe — the owner would run it, see no change, and rule
out the actual cause." Under a composer, `?aa` toggles a property of a
framebuffer that receives one fullscreen quad and nothing else. It would become
exactly the inert probe that rule exists to prevent — and the probes are being
kept deliberately, so `?shadows=1` can be re-tested after a driver update.

So a composer has to do one of two things: make `?aa` switch between MSAA on the
canvas and an SMAA/FXAA pass in the chain, or retire `?aa` honestly — the way
`?shadowtype=soft` was *mapped* rather than dropped once 0.185 made it a lie, so
an old URL still works and says what it actually got. Either is fine. Silently
leaving it in place is not, and it is a third reason the composer is the thing
that wants an ADR.

### Render-target allocation, at the size that matters

At the Pixel 10 Pro's measured drawing buffer — 1054×1926 at dpr 2, i.e.
2,030,004 px — with RGBA16F at 8 B/px and depth at 4 B/px:

| allocation | MiB |
| --- | --- |
| composer `rt1` + `rt2` (colour + depth each) | 46.5 |
| `UnrealBloomPass` (bright target + 5 mip levels × 2, all half-res and down) | 14.2 |
| `GTAOPass` (normal RT + its depth **texture**, GTAO RT, denoise RT) | 54.2 |
| **bloom chain total** | **60.7** |
| **with GTAO** | **114.9** |
| *(memo)* 4× MSAA the composer makes useless, and you would stop paying | ~62 |
| *(memo)* the 2048² shadow map that killed the context | 16 |

So bloom is roughly a **wash on allocation** if `antialias` is turned off with it,
which it should be anyway. AO adds 54 MiB against nothing.

**Do not read those numbers as a crash prediction.** `docs/progress.md` is
explicit that sizing an allocation predicted the wrong answer once already:
antialiasing was ranked first at ~65 MB, the largest allocation in the scene, and
the shelf runs with it on; the 16 MB shadow map, ranked third, is what killed the
context — and even that turned out not to be a budget at all but a program that
would not link. These are costs. They are not evidence about this driver.

---

## 6. Recommendation

**Not one ticket. Two, and the second one is a probe before it is a feature.**

### Ticket A — bloom, behind a flag

Bounded and measurable: +22,977 bytes minified / **+4,725 gzip** (+3.3%),
+60.7 MiB of render targets offset by the ~62 MiB of MSAA it makes pointless, ~9
new programs, and one relink of the 3 programs the scene already has. No depth
texture, no depth sampling, no `MeshNormalMaterial`, and therefore no
reintroduction of the mechanism that closed the mobile-crash investigation.

Minimum viable chain:

```ts
const composer = new EffectComposer(renderer);          // rt1/rt2, HalfFloat
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(size, strength, radius, threshold));
composer.addPass(new SMAAPass());                        // or FXAAPass, after OutputPass
composer.addPass(new OutputPass());
// renderLoop: composer.render() instead of renderer.render(scene, camera)
// and construct the renderer with antialias: false whenever the composer is on
```

Ship it behind a query parameter first, exactly as `?shadows=1` was kept — the
existing probe vocabulary already reads that way, and it makes a phone test one
reload. Note that behind a flag it still ships to everyone (§2); the flag buys a
safe default, not a smaller bundle. `pnpm smoke:render` will report the change in
distinct colours, which is how every previous shading change here was judged
rather than eyeballed. Whether the shelf should bloom at all is an aesthetics
call and belongs to the owner.

The composer itself — not the addon import — is the thing that deserves an ADR:
tone mapping and colour space move out of the materials, MSAA stops working, and
the frame is produced somewhere other than `renderer.render`.

### Ticket B — AO, and it starts as a probe

Do not implement AO. **Ask the device first**, because the answer is cheap and
probably negative:

1. Add a throwaway `?ao=1` that mounts `GTAOPass` in the chain from Ticket A.
2. Load it on the Pixel 10 Pro with `?debug&ao=1`.
3. `onShaderError` either halts with a link report or it does not.

If it fails, the ticket closes with a one-line answer and a row in the bisect
table, and nothing has been built. If it survives, AO is then a *design*
question, not an engineering one — because §4 says it collides with two of the
four painters and only adds one thing they cannot do (inter-book occlusion and
the shaped diagonal a taller neighbour throws). At that point compare it against
the cheaper alternative: teach `makeNeighbourShadow` the height of the book
beside it. That runs on every device, costs no bytes and no render targets, and
buys most of the same picture.

**Expect to abandon AO on current hardware.** The one access pattern it requires
is the one this driver has already refused, and the thing it uniquely adds is
reachable by a painter.
