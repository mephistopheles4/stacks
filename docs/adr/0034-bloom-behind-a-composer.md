# ADR-0034: Bloom, behind a composer that costs the multisampling

**Status:** accepted
**Context:** [#42](https://github.com/mephistopheles4/stacks/issues/42), under
map [#39](https://github.com/mephistopheles4/stacks/issues/39)

## What was decided

The shelf can render bloom, off by default, through an `EffectComposer` built
only when it is asked for and imported dynamically. Ambient occlusion is **not**
built — see the end.

## The addons are not a new dependency

`three/examples/jsm/postprocessing/*` ships inside the `three` package already
installed, and `scene.ts` has imported `OrbitControls` from exactly that place
since the shelf existed. Nothing is added to `package.json`, there is no new
publisher, and the files are already on disk under three's own `exports`.
CLAUDE.md's rule is about dependencies; this is not one.

What _does_ deserve a decision is the composer, because it changes how every
frame is produced and it takes something away.

## It costs the multisampling, and that had to be said out loud

**`EffectComposer` never sets `samples` on its render targets.** Its passes draw
into offscreen buffers, and those are not the multisampled drawing buffer the
context was created with. So the moment a composer is in the chain, the shelf's
MSAA silently stops applying — on a scene which is almost entirely thin vertical
spines, which is the worst possible geometry to lose it on.

The second-order problem is worse than the aliasing. `?aa` is a documented probe
with measured results attached in `docs/progress.md`, and under a composer it
would flip a context attribute that no pixel reads. That is a probe that
silently does nothing — the failure this project has already named as worse than
having no probe at all, and which has already happened once here (`SHADOW_TYPES`,
where `?shadowtype=soft` had quietly been `pcf`).

So when bloom is on:

- the context is created **without** `antialias`, rather than allocating a
  multisampled buffer nothing draws into;
- antialiasing moves to an **SMAA pass** inside the chain;
- `profile` reports **`aa=smaa`**, not `on` or `off`.

The setting keeps meaning something. It means a different implementation of the
same thing, and the instrument says so.

## Two things that would have been silent bugs

**`OutputPass` is not optional.** Everything inside a composer runs in linear
space; `OutputPass` converts back to sRGB and applies tone mapping at the end.
Leaving it out does not produce "no post-processing" — it produces a visibly
washed-out shelf and silently disables the tone mapping control that
[#43](https://github.com/mephistopheles4/stacks/issues/43) was about.

**`renderer.info` had to stop resetting itself.** `info.render` is cleared inside
every `render()` call, which is right for one call a frame and wrong under a
composer: the scene is drawn, then several fullscreen quads, so the numbers that
survive describe the last quad. The panel read **`draws 1  tris 1`** on a shelf
drawing 331. A readout that under-reports by two orders of magnitude on exactly
the configuration you enabled in order to measure is the instrument failing at
its one job. `info.autoReset = false` with a manual `reset()` at the top of the
frame fixes it.

## Measured

On the 49-book fixture, at 1280×800 on an RTX 5090:

|                             | distinct colours | non-background | fps |
| --------------------------- | ---------------- | -------------- | --- |
| bloom off                   | 1281             | 25.3%          | 240 |
| bloom on (shipped defaults) | 1214             | 25.4%          | 240 |
| bloom on, strength 0.9      | 1329             | 28.8%          | 240 |

Free on this hardware, and it visibly changes the image in both directions —
checked, because a new effect gets the same treatment every original probe got.
The drop to 1214 at defaults is SMAA against MSAA, not bloom; both are far above
`smoke:render`'s threshold of 40.

Bundle: the bloom chain measured **+4,725 bytes gzipped** (+3.3%) under #42, and
it is behind a dynamic `import()`, so a visitor who does not ask for it pays
nothing.

## Ambient occlusion is not built

Three reasons, and the first is on its own sufficient:

1. **It reintroduces the access pattern that closed the mobile-crash
   investigation.** GTAO samples a native `DepthTexture` as a plain `sampler2D`.
   That is what `?shadowtype=vsm` did, and vsm died on the Pixel 10 — the run
   that settled the whole investigation, because it was the one configuration
   that avoided the hardware comparison sampler and failed anyway.
2. **It double-darkens the painted shading.** `contact-shadow.ts` already paints
   contact shadows, recess darkening and a backboard shade, computed once from
   the layout. AO would compute overlapping darkening per fragment — the same
   collision `?painted=0` exists to let you see between `?shadows=1` and the
   painted planes. It is replace-or-nothing, and replacing is undoing
   [ADR-0016](0016-painted-shadows.md).
3. **Its one unique contribution is cheaper elsewhere.** What AO would add that
   the painters do not is inter-book occlusion — the _shaped_ diagonal a taller
   neighbour throws, which `docs/progress.md` already names as the honest limit
   of the painted version. Teaching `makeNeighbourShadow` its neighbour's height
   buys most of that for no frames at all.

Recorded as out of scope on the map rather than filed as work, because the
decision is "not this", not "not yet". If it is ever revisited it starts as a
`?ao=1` probe on the owner's phone, and is expected to close in one line.
