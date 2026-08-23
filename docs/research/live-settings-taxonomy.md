# Which shelf settings can change live, and what changing them costs

Research for [#41](https://github.com/mephistopheles4/stacks/issues/41), under the
[#39](https://github.com/mephistopheles4/stacks/issues/39) map. This is the table the panel's
UI is built from, and the list of controls that must say **reload to apply**.

Every claim below is either read out of three.js **0.185.1** source
(`packages/site/node_modules/three/src/…`, cited by file and line) or **measured** on a live
scene. Where it is neither, it says so. Given that this repo has a documented case of sizing an
allocation predicting exactly the wrong answer ([the mobile crash](../log/2026-08-01-the-mobile-crash-g15.md), "The ranking was wrong"),
every row carries its provenance.

## How the settings were counted

`rendererOverrides()` in `packages/site/src/shelf/boot.ts` parses **nine** settings —
`shadowfetch`, `painted`, `casters`, `aa`, `shadows`, `guard`, `dpr`, `shadowmap`, `shadowtype`.
`?books=N` is parsed separately in `limitBooks()`. Nine plus one is the **ten probes**. Issue
#39's "ten of the eleven knobs" is consistent with that: the eleventh knob is the lighting,
which was never a probe. `?debug` is not a setting; it is what mounts the panel.

## The classes

The ticket's four classes are close, and wrong in one structural way: **a class is a property of
a _transition_, not of a setting.** Several settings are asymmetric — `shadows` off→on allocates
a 32 MB render target and relinks the material that kills the Pixel 10, while on→off relinks the
same materials and frees nothing. The panel's UI has to hold the transition, not just the switch.

Seven classes, replacing the ticket's four:

| class       | meaning                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CONTEXT** | only a new `WebGLRenderer`, and so a new GL context, can change it                                                                                   |
| **REBUILD** | the value is baked into geometry, placement or a canvas texture; needs `dispose()` + `mountShelf()`                                                  |
| **RELINK**  | live, but every affected material must be recompiled and re-linked on the GPU                                                                        |
| **REALLOC** | live, no recompile, but a GPU allocation is thrown away and remade                                                                                   |
| **SCENE**   | live, no recompile and no reallocation — but it means walking the scene graph and mutating or disposing objects, so it needs to know _which_ objects |
| **UNIFORM** | live: a property assignment and the next frame                                                                                                       |
| **DESYNC**  | live for the real lighting, and it silently falsifies the painted shading                                                                            |

`DESYNC` is the class the ticket does not contain, and it matters most — see the key light row.
`SCENE` looks like `UNIFORM` and is not: an assignment is reversible from the value alone, a
scene walk is not. Both remaining traps in this document live there.

## The table

Provenance: **M** measured here, **S** read from three.js source, **U** unmeasurable on this
hardware.

### The ten probes

| #   | setting                        | transition | class       | what it costs                                                                                                                                                                 | what it needs to take effect                                                                                                                                                                                                                                          | prov. |
| --- | ------------------------------ | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `antialias` (`?aa`)            | either     | **CONTEXT** | a whole new context: ~24 MB of cover re-upload, 3 program links, ~200 ms                                                                                                      | `dispose()` + `new WebGLRenderer({ antialias })`. `renderer.antialias = x` is an inert own-property assignment — the context attribute stayed `true` after it                                                                                                         | M, S  |
| 2   | `maxPixelRatio` (`?dpr`)       | either     | **REALLOC** | the multisampled colour+depth buffer is discarded and remade — the single largest allocation in the scene (~65 MB at 1054×1926×4×MSAA). **Not trivial**                       | `renderer.setPixelRatio(n)` alone; it calls `setSize(_width,_height,false)` internally (`WebGLRenderer.js:628`). No recompile, no texture loss                                                                                                                        | M, S  |
| 3   | `shadows` (`?shadows`)         | **off→on** | **RELINK**  | +32 MB render target (measured: 23.8 → 55.8 MB), +1 program for the depth material, **+1 relink of the `MeshBasicMaterial`** — the program that will not link on the Pixel 10 | `shadowMap.enabled = true`, `key.castShadow = true`, `shadowMap.needsUpdate = true`, **and `material.needsUpdate = true` on every material** — see "the asymmetry" below                                                                                              | M, S  |
| 3   | `shadows`                      | **on→off** | **RELINK**  | relinks the same materials and **frees nothing**: `renderer.info.memory.textures` did not drop. three has no path that releases the shadow target                             | same, minus the allocation. `scene.ts:611-618` already says this                                                                                                                                                                                                      | M, S  |
| 4   | `shadowMapSize` (`?shadowmap`) | either     | **REALLOC** | discards and remakes the depth target (16 MB at 2048²)                                                                                                                        | `key.shadow.mapSize.set(n,n)` **is not enough** — it silently corrupts the shadow. You must also `shadow.map.depthTexture.dispose(); shadow.map.dispose(); shadow.map = null`, then `shadowMap.needsUpdate = true`. See "the trap" below                              | M, S  |
| 5   | `shadowType` (`?shadowtype`)   | either     | **RELINK**  | every material in the scene, including the basic ones; VSM additionally allocates (+4 programs, +1 texture)                                                                   | `shadowMap.type = T` **plus `shadowMap.needsUpdate = true`**. three dirties every material itself (`WebGLShadowMap.js:130-152`) — but only inside `render()`, which this shelf early-returns from because `autoUpdate = false` (`:95`). Type alone did nothing at all | M, S  |
| 6   | `shadowCasters` (`?casters`)   | either     | **SCENE**   | nothing. 0 new programs, the target stays allocated                                                                                                                           | `mesh.castShadow` on the caster meshes, then `shadowMap.needsUpdate = true`. **Not a blanket `traverse`** — see "the casters trap" below. Without `needsUpdate` the image does not move                                                                               | M     |
| 7   | `guardResize` (`?guard`)       | either     | _(neither)_ | nothing — it is not a renderer setting at all, but a branch in the shelf's own `resize()`                                                                                     | assign the boolean; it takes effect on the next resize event                                                                                                                                                                                                          | S     |
| 8   | `painted` (`?painted`)         | **on→off** | **SCENE**   | dispose 12 canvas textures and drop one cached program. **No relink**: removing the last `MeshBasicMaterial` changes no cache key for the lit materials                       | remove and dispose the painted meshes. Doable live                                                                                                                                                                                                                    | S     |
| 8   | `painted`                      | **off→on** | **REBUILD** | full remount                                                                                                                                                                  | the per-book neighbour band is welded into `buildBook()` via `shadedFromRight` (`scene.ts:730-740`), so re-adding painted shading is not a scene-graph add — it is a book rebuild                                                                                     | S     |
| 9   | `shadowFetch` (`?shadowfetch`) | on→off     | **RELINK**  | relinks every material; frees nothing                                                                                                                                         | exactly what `stopSamplingShadows()` does. Only meaningful while `shadows` is on, and as written it is a one-way door                                                                                                                                                 | S     |
| 10  | `books` (`?books=N`)           | either     | **REBUILD** | full remount: ~24 MB of cover re-upload, ~200 ms                                                                                                                              | `placeShelf`, `rowsForCase`, the case geometry, the camera framing and the shadow frustum radius are all functions of the book count, computed at mount                                                                                                               | S     |

### Lighting, fog and colour

| setting                                                              | class                           | what it costs                                                                                                          | what it needs                                                                                                                                                                    | prov. |
| -------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| ambient intensity / colour                                           | **UNIFORM**                     | nothing                                                                                                                | assign; `WebGLLights.setup()` runs every render                                                                                                                                  | M     |
| key light **intensity**                                              | **UNIFORM**                     | nothing                                                                                                                | assign                                                                                                                                                                           | M     |
| key light **colour** (`COLOURS.key`)                                 | **UNIFORM**                     | nothing                                                                                                                | `key.color.set(…)`                                                                                                                                                               | M     |
| key light **position** (`keyLightPosition()`)                        | **DESYNC**                      | the real lighting moves instantly; the **painted shading does not**, and the shadow camera's far plane does not either | see below                                                                                                                                                                        | M, S  |
| key `castShadow`                                                     | **RELINK** (lit materials only) | +1 program                                                                                                             | assign; `WebGLLights` bumps `state.version` (`:485`) and `WebGLRenderer.js:2392` catches it — **for lit materials only**                                                         | M     |
| shadow camera frustum (`left/right/top/bottom/near/far`)             | **UNIFORM**                     | nothing                                                                                                                | **must call `shadowCamera.updateProjectionMatrix()`** and then `shadowMap.needsUpdate = true`. With `needsUpdate` but no `updateProjectionMatrix()` the image was byte-identical | M     |
| fill light colour / intensity / position                             | **UNIFORM**                     | nothing                                                                                                                | assign                                                                                                                                                                           | M     |
| lamp (`PointLight`) colour / intensity / distance / decay / position | **UNIFORM**                     | nothing                                                                                                                | assign                                                                                                                                                                           | M     |
| `scene.background` (`COLOURS.background`)                            | **UNIFORM**                     | nothing                                                                                                                | `scene.background.set(…)`. **Also the fog colour** — change one and not the other and the horizon stops matching the wall                                                        | M     |
| fog `near` / `far`                                                   | **UNIFORM**                     | nothing                                                                                                                | assign; read into uniforms every frame (`WebGLMaterials.js:27-32`)                                                                                                               | M     |
| fog **present or absent** (`scene.fog = null`)                       | **RELINK**                      | +2 programs                                                                                                            | assign only — three detects it (`WebGLRenderer.js:2452`)                                                                                                                         | M     |
| `COLOURS.wood` / `woodDark`                                          | **UNIFORM**                     | nothing                                                                                                                | `material.color.set(…)`                                                                                                                                                          | M     |

## The three things the source says that the ticket does not assume

### 1. `shadowMap.enabled` is compile-latched, and nothing in three notices it change

`renderer.shadowMap.enabled` is read in exactly **two** places: `WebGLRenderer.js:1708`, where
it gates the shadow pass, and `WebGLPrograms.js:359`, where it is baked into the program cache
key as `USE_SHADOWMAP`. It appears nowhere in the ~30-branch `needsProgramChange` test at
`WebGLRenderer.js:2388-2501`.

Measured: setting `shadowMap.enabled = false` and rendering three frames produced **a
byte-identical image, zero new programs and zero rebound materials**. The shadows only
disappeared once every material was explicitly dirtied. `stopSamplingShadows()` in `scene.ts` is
right, and it is right for this reason.

### 2. The asymmetry that makes a live `shadows` toggle dangerous _and_ misleading

`materialNeedsLights()` (`WebGLRenderer.js:2811`) returns false for `MeshBasicMaterial`. So the
lights-version bump that a `castShadow` change triggers recompiles the lit materials and **never
touches the painted shadow planes**.

Measured, starting from the shipped default (shadows off) and enabling them live:

```
naive enable (shadowMap.enabled, key.castShadow, shadowMap.needsUpdate)
  → 2 new programs, rebound: wood + all 8 books        ← the MeshBasicMaterial is NOT rebuilt
then material.needsUpdate = true on everything
  → 1 further program, rebound: both painted planes    ← this is the program that will not link
```

That is the whole finding. **A naive live toggle produces a different set of GPU programs than
`?shadows=1` on a reload does.** On the Pixel 10 it would very likely appear to work — the
painted planes keep running the program they linked at mount — while the same setting baked as a
default still kills the device. That is the repo's own "a probe that silently did nothing would
be worse than no probe", in a new costume.

So the panel's `shadows` control **must** dirty every material, which is precisely the thing that
relinks the killer program. There is no safe version of this toggle; there is only an honest one.

### 3. `autoUpdate = false` is load-bearing far beyond the shadow pass

`WebGLShadowMap.render()` early-returns at `:94-95` when `enabled` is false _or_ when
`autoUpdate === false && needsUpdate === false`. Everything the shadow system does on a change —
the type-change traverse that dirties all materials (`:130-152`), the target reallocation
(`:203`), the `_previousType` latch (`:367`) — lives **after** that return.

The shelf sets `autoUpdate = false` (`scene.ts:344`). So on this shelf, `shadowType`,
`shadowMapSize`, `castShadow` and `casters` **all silently do nothing** until
`renderer.shadowMap.needsUpdate = true` is also set. Measured: `shadowMap.type = BasicShadowMap`
alone gave a byte-identical image, no reallocation and no recompile; adding `needsUpdate` then
produced 2 new programs and a visibly different image.

### The `shadowMapSize` trap

Changing `key.shadow.mapSize` and asking for a shadow update **corrupts the shadow silently**.
`WebGLShadowMap.js:203` only allocates when `shadow.map === null || typeChanged`, so the depth
map stays 2048² while the pass renders into a 512×512 viewport of it. Measured, the image became
mean 29.368 / 383 distinct colours — _the identical fingerprint as shadows switched off
entirely_. The shadow does not get coarser; it disappears. Disposing the target and nulling it
first gave a real 512² map and a real shadow (29.139 / 510).

### The casters trap: the off direction is safe, the on direction is not

`castShadow` is not in any program cache key, so flipping it is free — measured: 0 new programs,
the target stayed allocated, and the image only moved once `shadowMap.needsUpdate = true` was
also set. But **the shelf's casters are a specific, deliberately small set**, and a blanket
scene walk does not restore it.

`buildBook`'s `solid()` sets `castShadow = false` on all four parts and then turns it on for the
page block alone (`scene.ts:904`, `:927`); the printed cover and spine planes never cast.
`buildShelf` casts on the uprights and the planks but **not** the backboard (`:986`, `:997`).
That is one caster per book, two uprights and `rowCount + 1` planks — the whole point of the
optimisation [the mobile crash](../log/2026-08-01-the-mobile-crash-g15.md) records ("One caster per book instead of four", ~196 shadow draws
for 49 silhouettes removed).

So `traverse(o => { if (o.isMesh) o.castShadow = true })` would turn on roughly seven casters per
book plus the backboard and the painted planes: it re-introduces the regression that was fixed,
_and_ draws a different silhouette, since the boards and spine stand outside the block by the
binder's square. The panel must either remember the meshes it switched off, or `mountShelf` must
hand out the caster set. **My measurement used a blanket walk on a synthetic scene where every
mesh was a caster, so it measured the mechanism and not this distinction.**

### The key light is live and the painted shading is not

`caseLight()` (`scene.ts:1029`) derives `xPerZ`/`yPerZ` from `keyLightPosition()`, and those feed
`makeContactShadow`, `makeBackboardShade` and the neighbour band, each of which **bakes its
result into a `<canvas>` and uploads it as a `CanvasTexture`** (`contact-shadow.ts:139-187`,
`:308-315`, `:428`).

Moving the light live is a uniform write — measured, instant, no recompile. It also leaves every
painted shadow describing a light that is no longer there. `scene.ts:1016-1018` states the rule
already: _a painted shadow whose light has quietly moved is worse than no shadow at all._

There is a second stale consequence in the same move: `shadowCamera.far` is derived from the
light's position (`key.position.distanceTo(target.position) + radius`, `scene.ts:1109`). Move the
light and the far plane still describes where it used to be, which clips the real shadow — so a
panel that moves the light must recompute the frustum and call `updateProjectionMatrix()`
whether or not it repaints the canvases.

Two honest options, and the panel must pick one:

- **repaint on change** — regenerate 3 canvases per shelf row plus the neighbour bands and
  re-upload them. On the 49-book fixture that is 12 canvas textures out of ~2.3 MB of the 23.8 MB
  total; not free, not a remount, and plausibly fast enough to drag a slider against — **not
  measured here.**
- **mark it reload-to-apply**, which is the safe answer and the weaker product.

Light **colour** and **intensity** carry no such coupling and are pure `UNIFORM`.

## The three sub-questions

### What should the panel do when a toggle kills the WebGL context?

The machinery exists — `renderer.debug.onShaderError` halts the loop and fires `onShaderFailure`
(`scene.ts:390-413`). Four requirements, in the order they bite:

1. **Record the pending change before applying it.** The black box writes to `localStorage` once
   a second (`diagnostics.ts`); a context death between the click and the next tick loses the one
   fact that matters — which setting did it. Write intent first, apply second.
2. **`profile` becomes a lie the moment settings mutate.** `diagnostics.ts:119` reads
   `handle.profile`, captured at mount (`scene.ts:471`). The snapshot must carry the _current_
   settings, or the black box stops being a bisect and becomes an anecdote — the exact failure
   issue #39 names.
3. **Revert the killer in the persisted state.** Otherwise the reload that is supposed to recover
   re-applies the setting and reproduces the crash. This is the non-obvious one, and it is the
   difference between a panel you can get out of and a bricked URL.
4. **Distinguish the two deaths.** A shader link failure is caught and halts cleanly; a context
   loss is `webglcontextlost`, already handled. Both already have distinct messages
   (`boot.ts:212-221`). The panel should attribute both to the last applied change.

### What does a dispose-and-remount actually cost?

**Measured — it works, and it is fast, and it is not free.**

- On a synthetic scene, `dispose()` + `new WebGLRenderer` **on the same canvas element** succeeded
  every time: 17–24 ms total, `isContextLost() === false`, across four consecutive remounts. No
  fresh canvas element is needed.
- `dispose()` itself is ~0.4 ms. Essentially all the cost is the remount.
- On the **real shelf**, 49 fixture books: 67 texture allocations, **~23.8 MB of pixel data**,
  3 program links, and **237 ms** from navigation to `window.__shelf.ready` with a warm HTTP
  cache (626 ms cold). A remount inside a live page skips the JS parse and the `library.json`
  fetch, so the true figure is below 237 ms and above the ~20 ms the renderer half costs — **not
  separately measured**, because `ShelfHandle` is not reachable from the page.

**And it is not correct mid-session as the code stands.** `TextureCache` is constructed
per-mount (`scene.ts:347`) and `dispose()` disposes every cached cover (`:514`). The cover cache
does **not** survive a remount: all ~24 MB is re-decoded and re-uploaded. On the device this
whole investigation is about, that is the same class of allocation churn as the original 314 MB
bug. If remount becomes a panel operation, the cover cache should be lifted out of `mountShelf`
and handed in. `UNIT_BOX`/`UNIT_PLANE` are already correctly spared (`:533-535`).

So: fast enough to feel live at desktop scale, and the thing to fix first if it becomes routine.

### Is `dpr` really trivial?

**No, and the repo's own reasoning for `?guard=1` is half right.**

`setPixelRatio` calls `setSize(_width, _height, false)` (`WebGLRenderer.js:628-636`), and
`setSize` assigns `canvas.width`/`canvas.height` **unconditionally** (`:672-673`). A `dpr` change
necessarily changes those values, so it does throw away and remake the multisampled colour and
depth buffers — the largest allocation in the scene. Measured: no recompile, no texture loss,
buffer 1440×900 ↔ 720×450 immediately. It belongs in `REALLOC`, not in "trivial".

**But the specific claim behind `?guard=1` did not reproduce.** `scene.ts:184-190` says assigning
`canvas.width` reallocates the drawing buffer _even when the value is identical_. Measured on
Chrome 150.0.7871.187 / ANGLE with a real GPU:

```
render, read back                     29.138
setSize(720,450) — identical size     29.138   ← contents survived
setSize(721,450) — one pixel wider     0.000   ← contents gone, buffer really was remade
canvas.width = canvas.width           29.138   ← survived, three.js not involved
```

Surviving contents is strong evidence no reallocation happened: a real resize provably loses
them. So on this browser and driver the same-size assignment is optimised away, and an unguarded
`ResizeObserver` is not churning the framebuffer.

**This does not clear `?guard=1`, and nothing here can.** The device the guard exists for is a
PowerVR D-Series on Imagination driver v24.3, and the whole lesson of `docs/progress.md` is that
this hardware does not behave like the hardware you can measure on. Class it **UNIFORM**, keep
the switch, and record that its rationale is unconfirmed rather than disproven. **U.**

## What could not be measured

- **Whether any live toggle kills the Pixel 10's context.** Requires the phone. What can be said
  with a named mechanism: a faithful live `shadows` toggle relinks the `MeshBasicMaterial`
  painted planes, and that is exactly the program `docs/progress.md` records failing to link
  there. The prediction is "the same failure, now reachable from a click" — a prediction, not a
  measurement, and this repo has been wrong at exactly this step before.
- **The cost of repainting the contact shadows when the key light moves.** Not built, so not
  measurable; it is 12 canvas redraws and re-uploads on the 49-book fixture.
- **Remount time for the real shelf in isolation.** `ShelfHandle` is not exposed on `window`;
  237 ms is a warm full page load and therefore an upper bound.
- **Whether `guardResize` matters on the failing device.** See above.
- **Whether `ResizeObserver` even fires when the observed box has not changed.** That is the
  other half of the guard's premise and it was not tested; the guard only ever skips work on a
  callback that reports an unchanged size, so if the observer does not fire in that case the
  switch is inert on every device rather than just this one.
- **The live `painted` on→off path.** The 3 → 2 programs and 23.8 → 22.3 MB figures come from
  comparing two _mounts_ (`?painted=0` as its own page load). The live removal was not exercised;
  that it needs no relink is read from the cache key, not measured.

## Method

Two throwaway rigs, both driven by `puppeteer-core` against system Chrome 150.0.7871.187 with
`--enable-gpu --use-gl=angle`, the same flags `pnpm smoke:render` uses on a workstation.

1. A synthetic scene mirroring the shelf — `MeshStandardMaterial` books, `MeshBasicMaterial`
   painted planes, the same four lights, `shadowMap.autoUpdate = false` — with `gl.createProgram`,
   `gl.linkProgram`, `gl.texImage2D` and `gl.texStorage2D` wrapped to count, and
   `renderer.properties.get(material).currentProgram.id` read per material to detect exactly
   which materials rebound. One setting mutated per step.
2. The real built `packages/site/dist`, with `HTMLCanvasElement.prototype.getContext` wrapped
   before any page script ran, loaded once per probe combination.

Two measurement traps worth recording, since both produced confident wrong answers first:

- **`readPixels` outside a frame returns zeros.** The drawing buffer is cleared after each
  composite, so the first run reported every single change as "image identical". Draw and read in
  the same task. `smoke:render` already knows this and says so.
- **An MSAA resolve is not bit-deterministic between reads.** An FNV hash of the pixels reported
  every step as changed, including provably identical ones. Mean brightness to 3 dp plus the
  distinct-colour count is stable across repeated reads and still moves on any visible change —
  the same measure `smoke:render` scores the shelf with.
