# The probes became a tuning panel — map [#39](https://github.com/mephistopheles4/stacks/issues/39)

Ten one-shot URL probes, built to bisect the crash above, are now controls you
move while looking at the shelf — plus every light, tone mapping and exposure,
bloom, the materials and the room. Charted as a wayfinder map with eight
tickets; all eight closed. Three of them were research and their answers are in
[`docs/research/`](../research/), which is new.

**The panel's entire contract is that a control must not lie**, which is this
file's oldest rule about instruments applied to a slider. Every row carries a
class dot — live, rebuild, reload — and the panel prints what `applySettings`
_reported_ rather than what it asked for. Seven faults were caught by building
it that way, and not one by a test:

|                                                                                                          |                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| the shadow toggle enabled the shadow map over a light whose `castShadow` was latched at mount            | shelf looks identical, reported applied                                                                                                        |
| `materialNeedsLights()` excludes `MeshBasicMaterial`, so a live toggle relinked only the _lit_ materials | a **different program set than the equivalent reload** — it would have appeared to work on the Pixel while the shipped default still killed it |
| `toneMappingExposure` only exists inside `#ifdef TONE_MAPPING`, and `none` is the default                | the slider moved, the picture did not                                                                                                          |
| moving the light left the shadow frustum sized for where it used to be                                   | a hard straight line across the wood, which reads as a rendering fault                                                                         |
| _assigning_ `scene.fog` rebuilds every program even to an identical value                                | every tick of every slider was a full recompile                                                                                                |
| a refusal was computed from the transition, so nudging any later slider cleared it                       | the URL asserted a configuration the shelf was not in                                                                                          |
| `renderer.info` resets inside every `render()`, and a composer renders several times                     | the panel read `draws 1  tris 1` on a shelf drawing 331                                                                                        |

**The black box survived the change.** `profile` is a getter, not a string built
at mount, and it carries a **change sequence** — a crash after eight toggles
reads as a sequence and not as a final state. Storage key is `v2`. It follows
the live shelf through a rebuild rather than holding the disposed one, and it
records the query it died on, because the panel writes what you dial into the
URL and reloading would otherwise repeat the crash.

**The painted shadows follow the light** rather than being left describing where
it used to be ([ADR-0033](../adr/0033-painters-follow-the-light.md)) — repainted,
not remounted, because a rebuild re-pays ~24 MB of cover upload to redraw a
handful of 2D canvas fills. Measured **60 textures, flat across 500 repaints**;
a leak there would have climbed until the tab died, on a panel built to diagnose
exactly that.

**Bloom is in, ambient occlusion is refused**
([ADR-0034](../adr/0034-bloom-behind-a-composer.md)). The composer costs the
multisampling — `EffectComposer` never sets `samples` — so with bloom on the
context is made without MSAA, antialiasing moves to an SMAA pass, and `profile`
says `aa=smaa` rather than leaving `?aa` flipping an attribute no pixel reads.
AO samples a native `DepthTexture` as a plain `sampler2D`, which is what
`?shadowtype=vsm` did — the run that settled the investigation above by dying
anyway.

Measured at 1280×800 on an RTX 5090: bloom off 1281 distinct colours at 25.3%,
on 1214 at 25.4%, at strength 0.9 1329 at 28.8%, **240 fps throughout**. The drop
at defaults is SMAA against MSAA, not bloom.

`pnpm test` 392 → **421**. `smoke:render` unchanged at 49 books, 0.0012 case
overflow, 1285 distinct colours, 25.3% — the refactor moved no pixels, which is
the whole check on it. `debug-panel` splits into its own **8.8 KB** chunk whose
strings are absent from the main bundle, so an ordinary visitor downloads none
of it.

**No new gate row**, deliberately. The rule would be "every control has a real
effect", and the honest version is already structural: a control that does
nothing has to travel through `ApplyReport`, which has nowhere to put it except
a refusal the panel prints. A test asserting that is arithmetic checking
arithmetic written the same day by the same person — the `placeShelf` precedent.
If a control is ever found lying, that is the day the row is worth writing.

**`docs/plan.md`'s "wayfinder: not installed, not needed" is reversed**, and says
why. The reasoning was true of the four phases and stopped being true after
them. The entry above it, refusing `to-prd`/`to-issues`/`implement`, stands.
