# Pick-up motion tooling — an independent evaluation

Research for [#370](https://github.com/mephistopheles4/stacks/issues/370). One
arm of a blind comparison: written without reading the issue's comments, the
`research/370-theatre-js` branch or any other `pickup-motion-tooling*` file.
Nothing here is implemented. Every package, source file and web page was checked
on **2026-09-22**.

**Evidence labels.** **[M]** measured here (a build, a script, a grep of an
installed package). **[S]** sourced from a primary document, linked. **[I]**
inferred — reasoned, not run.

## Verdict

**Recommendation: a hand-rolled timeline module, tuned with Tweakpane and its
essentials plugin loaded only in development.** The move is three sequential
stages on one object, reversed along its own path. That is a small utility, and
`AGENTS.md` already says to prefer a zero-dependency one. It ships about 0.4 KB
gzip [M], adds no dependency and no licence, and lives in a `.ts` file the
mutation scopes and vitest can reach, which no library's internals ever will.
Tweakpane's cubic-bezier blade feeds it four numbers. Gated on
`import.meta.env.DEV`, the production build contains **zero bytes** of the tuner
[M]. Tuned values end as plain constants in `shelf-settings.ts`.

**Runner-up: GSAP core (`gsap/gsap-core`), with the same dev-only Tweakpane
tuner.** Choose it instead if the choreography grows past sequential stages —
overlapping stages, retargeting a put-back to a slot that moved, several books
in flight — or if the owner judges GSAP fluency worth the cost. The cost is
**+19.6 KB gzip** on the shelf chunk [M], and a licence that is **not OSI open
source** and that Webflow may revoke on non-compliance [S].

**Why not the zero-dependency built-in, three's `AnimationMixer`?** It is the
closest third. It costs about +5 KB gzip [M] and no new dependency, and since
r183 it can play a CSS-style cubic-bezier exactly [M]. But it scrubs wrongly
after a clamped finish unless you know the fix [M], and a keyframe clip is a
clumsier authoring surface than either a tween list or a stage table.

**Theatre.js is not needed.** Playback always needs `@theatre/core` at runtime
(35 KB gzip) [M], the studio is AGPL-3.0 at 249 KB gzip [M][S], and the public
repository has been quiet since 2024 while development moved private [S].

## Comparison table

Sizes are minified then gzipped at level 9. "Shelf delta" is the marginal cost
on the site's main chunk, which is **158,176 B gzip** in a real `pnpm build` of
`1cd94aa` [M]. Deltas were measured in a scratch app built with the site's own
Vite 8.3.0, or with esbuild where marked; see "Method".

| Option | Shelf delta (gzip) | New deps (transitive) | Licence | Reverse | Interrupt mid-move | Scrub | Drives Three.js props | Latest release | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Hand-rolled** | ~0.4 KB (esbuild) [M] | 0 | the repo's MIT | you write it (flip direction) | you write it (reverse from current progress) | `seek(t)` | any setter | n/a | n/a |
| **GSAP 3.15.0 core** | **+19.6 KB** (Vite) [M]; +27.6 KB via `'gsap'` with CSSPlugin (esbuild) [M] | 1 (0) [M] | GSAP Standard "no charge" — **not OSI** [S] | `tl.reverse()` from any time [M] | `kill()`/`overwrite`, then tween back from current value [M] | `tl.progress(p)` [M] | any numeric property, incl. `Object3D.rotation` [M] | 2026-04-13 [S] | GHSA-6g8v-hpgw-h2v7, `< 3.6.0` only [S] |
| **three `AnimationMixer`** | **+5.0 KB** (Vite) [M] | 0 — already a dependency | MIT | `action.timeScale = -1` [M] | flip `timeScale` from current time [M]; `crossFadeTo` for a different clip [S] | `mixer.setTime(t)`, **but see the clamp trap** [M] | named-path tracks only (`.rotation[y]`, `hinge.rotation[y]`) [M] | 0.186.0, 2026-09-08 [S] | two, both `< 0.137.0` [S] |
| **Theatre.js 0.7.2 core** | +35.3 KB (esbuild) [M] | 2 (`@theatre/dataverse` → `lodash-es`) [M] | core Apache-2.0; **studio AGPL-3.0-only** [S] | `play({ direction: 'reverse' })` [S] | `pause()` then play reversed [I] | `sequence.position` [S] | via `onValuesChange` callback [M] | 2024-05-19 [S] | none on Theatre; `lodash-es` has several, the range `^4.17.21` admits vulnerable 4.17.21–4.17.23 [S] |
| **@tweenjs/tween.js 25.0.0** | +3.7 KB (esbuild) [M] | 1 (0) [M] | MIT [M] | **none** — no `reverse` method; `yoyo` only repeats [M] | `stop()` and start a new tween [M] | no timeline seek [M] | any property [I] | 2024-07-26 [S] | none [S] |
| **Motion 13.3.0 `animate`** | +20.4 KB (esbuild) [M] | 4 (`framer-motion`, `motion-dom`, `motion-utils`, `tslib`) [M] | MIT [S] | `speed = -1` [M, source] | `stop()`, animate from current [I] | `controls.time = t` [M, types] | JS objects via sequences [M, bundle] | 13.4.1, 2026-09-22 — **inside pnpm's 7-day quarantine** [S] | none [S] |
| **anime.js 4.5.0 timeline** | +13.8 KB (esbuild) [M] | 1 (0; `three` optional peer) [M] | MIT [M] | `reverse()` [M] | `pause()`/`cancel()` [M, types] | `seek(ms)` [M] | plain objects [M]; a new `threeAdapter` maps `x`, `y`, `opacity`… on `Object3D` [M, source] | 2026-06-22 [S] | none [S] |

**Dev tooling**, none of it in the visitor's bundle when gated on
`import.meta.env.DEV` [M]:

| Tool | Size if it did ship (gzip) | Licence | Last release | Worth having here |
| --- | --- | --- | --- | --- |
| **Tweakpane 4.0.5** | 31.2 KB (esbuild) [M] | MIT [S] | 2024-11-03 [S] | **Yes** — progress slider, bindings, button to copy constants |
| **@tweakpane/plugin-essentials 0.2.1** | +31.6 KB on top — **it bundles its own copy of `@tweakpane/core`** [M] | MIT [S] | 2023-12-17 [S] | **Yes, for the `cubicbezier` blade alone** |
| Tweakpane + essentials + GSAP `CustomEase` as one lazy chunk | 64.1 KB (Vite) [M] | — | — | the runner-up's whole tuner |
| **lil-gui 0.21.0** | 8.0 KB (esbuild) [M] | MIT [S] | 2025-10-12 [S] | lighter, but **no curve editor** — you would hand-roll one [I] |
| **GSDevTools** (ships in `gsap`) | +22.1 KB over GSAP (esbuild) [M] | GSAP Standard [S] | with GSAP | Only with GSAP; overlaps the progress slider, adds nothing for export [I] |
| **Theatre studio 0.7.2** | 249.0 KB (esbuild) [M] | **AGPL-3.0-only** [S] | 2024-05-19 [S] | No — heaviest, stalest, and it forces `@theatre/core` into production |
| **Motion Studio** | "Production builds exclude Studio" [S] | Apply-to-code needs a paid subscription [S] | — | No — a Vite plugin tied to Motion as the runtime |
| **Blender → glTF → `AnimationMixer`** | +21.4 KB for `GLTFLoader` (esbuild) [M] plus the `.glb` | MIT | — | No — see below |

## What the move actually asks of a tool

Five requirements, from the issue and `docs/notes-on-the-shelf.md` §2.

1. **Three stages in sequence** — slide out, turn, open (a cover hinge).
2. **Put back** on Escape, click-away or the back button: the same path,
   backwards, from wherever the book is now.
3. **Interrupt**: a click on another book mid-move. The first book goes back
   from its current pose while the second comes out.
4. **Reduced motion**: jump to the end state.
5. **Tuning** that ends as constants, with tools dev-only by default.

Requirements 2 and 3 collapse into one if put-back always retraces the path.
Reversing a timeline from its current time is then enough, and every option
except tween.js does that natively. **Only retargeting** — returning to a
different place than it came from — needs a tween that starts from the current
value, which is where GSAP's `overwrite` and `kill()` earn their bytes [I].

The shelf already renders every frame (`scene.ts:498`, a `requestAnimationFrame`
loop) [M]. Any of these tools can simply write properties and let that loop draw
them. None needs its own renderer hook.

## 1. Runtime options

### Hand-rolled timeline

A stage table and one pure function: time in, pose out. Measured in a scratch
bundle [M]: three stages, a Newton-iteration cubic-bezier solver, `seek`,
`tick`, `reverse` — **658 B minified, 390 B gzip**.

- **Reverse and interrupt**: store a direction and a time; flip the direction.
  Interrupt is the same flip from the current time [I].
- **Scrub**: `seek(t)` is the whole API, which is also what a slider needs.
- **Reduced motion**: `seek(total)` [I].
- **Three.js properties**: it calls setters you write, so `rotation.y` and a
  hinge child's rotation are ordinary assignments.
- **Repo fit**: a `.ts` module under `packages/site/src/shelf/` is inside the
  site's mutation scope and vitest's reach, so "does a reversed move retrace its
  path" is a unit test [I]. A library's easing and scheduling are not counted
  by anything here.
- **Cost**: roughly a hundred lines plus tests that somebody owns, and the
  interrupt semantics are yours to design rather than inherited [I].

### GSAP 3.15.0

- **Behaviour** [M, `behaviour.mjs`]: a paused timeline on a real
  `THREE.Object3D`. `tl.progress(0.5)` set `rotation.y` to 1.169 and the
  quaternion followed (0.552). `tl.reverse()` from 0.6 s reported
  `reversed() === true` and stepped back correctly. `kill()` then
  `gsap.to(book.rotation, { y: 0 })` resumed from the interrupted value (1.401).
- **Size**: importing from `'gsap'` pulls CSSPlugin, which the shelf would never
  use. **Import from `'gsap/gsap-core'`**: +19.6 KB gzip in Vite [M], about
  **12 %** on the 158 KB chunk.
- **Easing**: CustomEase takes cubic-bezier numbers. `CustomEase.create('p',
  '0.3,0,0.2,1')` matched a bisection-solved reference within **4.3 × 10⁻⁴** over
  101 samples [M]. GSAP also accepts a plain function as `ease`, so shipping
  **without** CustomEase is possible by passing the hand-rolled solver [I].
- **Licence** [S]: the package carries no `LICENSE` file. `package.json` and
  every file header point to the Standard "no charge" licence, effective
  2025-04-30. It is **not an OSI open-source licence**. The restrictions that
  could matter here: no use in "tools that allow users to build visual
  animations without code" competing with Webflow; no reverse engineering to
  build competing products; no removal of notices; and Webflow "may terminate
  this GSAP License" on non-compliance. A private `?debug` tuner for one site is
  not a product offered to users [I], but the licence is revocable and
  controlled by a vendor, unlike every other licence in this table.
- **Maintenance** [S]: npm releases 3.14.0 (2025-12-08) to 3.15.0 (2026-04-13).
  The GitHub mirror carries no Releases, and its last push was 2026-04-13. The
  README states all former Club plugins, including CustomEase and GSDevTools,
  are free; both were in the installed package [M].
- **Dependencies**: zero [M]. One advisory ever, fixed in 3.6.0 [S].

### three.js `AnimationMixer` (built in)

- **Easing — changed in r183.** `InterpolateBezier` and `BezierInterpolant` were
  added in [three.js #32829](https://github.com/mrdoob/three.js/pull/32829),
  milestone r183 [S]. A `NumberKeyframeTrack` with per-key `(time, value)`
  tangents set on `track.settings` reproduces cubic-bezier(0.3, 0, 0.2, 1) to
  **3.7 × 10⁻⁸** [M]. So the Tweakpane blade *can* feed the mixer directly: four
  numbers become two tangent points per segment.
- **But not on quaternions.** `QuaternionKeyframeTrack` has linear slerp only,
  and its Smooth factory is set to `undefined` [M, source]. Eased turns must bind
  an Euler component, `.rotation[y]`, which works: the quaternion followed in the
  probe [M]. A turn about one axis loses nothing by that [I].
- **Targets are name paths.** `PropertyBinding` resolves
  `nodeName.property[index]` [M, source]. The hinge must be a **named child
  `Object3D`** (`hinge.rotation[y]`), not an arbitrary field. `buildBook` would
  have to produce that node [I].
- **⚠️ The clamp trap** [M, `mixer-probe.mjs`]. With `LoopOnce` and
  `clampWhenFinished`, reaching the end sets `action.paused = true`. A later
  `mixer.setTime(0.7)` then leaves the action at time 0 and the book **at the
  start pose** — not at 0.7, not at the end. Set `action.paused = false` first
  and it lands at 0.7 correctly. A progress slider wired naïvely to `setTime`
  would be exactly the control this repo's `debug-panel.ts` says must not lie.
- **Reverse**: `timeScale = -1` from 0.7 s, then `update(0.3)`, landed at
  0.4 s [M]. Running past zero re-pauses it at the start pose [M].
- **Size**: +5.0 KB gzip in Vite [M], an upper bound, because the real shelf may
  already pull some of the same modules [I]. No new dependency and no ADR.

### Theatre.js 0.7.2

- **Runtime**: `getProject(id, { state })` loads the exported JSON [S], and
  **`@theatre/core` must be present to play it** — the state is keyframes that
  the core's sequence evaluates [S][I]. Measured cost: 35.3 KB gzip [M]. Avoiding
  it means writing your own interpreter for Theatre's state format, which is a
  hand-rolled timeline with a foreign schema [I].
- **Studio dev-only**: a dynamic import would split it exactly as the Tweakpane
  test below did [I]. The documentation pages checked do not address it [S].
- **Licences** [S]: core Apache-2.0; studio AGPL-3.0-only, its `LICENSE` file is
  the AGPL text [M]. Dev-only use keeps AGPL code out of the published site [I].
- **Maintenance** [S]: last npm release 0.7.2 on 2024-05-19. The public repo's
  README says development "temporarily" moved to a private repo for 1.0; the
  last commit is 2024-04-11 and the last push 2024-08-14, with 141 open issues.
  Sixteen months without a release.
- **Transitive**: `@theatre/dataverse` → `lodash-es ^4.17.21` [M]. The range
  admits 4.17.21–4.17.23, which carry a high advisory (GHSA-r5fr-rjxr-66jc); a
  fresh install resolved 4.18.1 and `npm audit` reported 0 [M].

### @tweenjs/tween.js 25.0.0

Small (3.7 KB gzip) and MIT, but the declared API has **no `reverse` and no
timeline seek** [M, `tween.d.ts`]. `chain()` sequences tweens forward only. Put
back would be a second hand-built chain, which is the hand-rolled option with a
dependency added. The repo is active (commits 2026-09-22) but the last release
is 2024-07-26 [S].

### Motion 13 (`animate`)

Vanilla `animate()` takes sequences of JS objects and returns controls with
writable `time` and `speed` [M, `motion-dom` types]. The JS animation source
comments "-1 reverse" and branches on `speed < 0` [M]. It builds without React;
React is an *optional* peer [S]. Costs: 20.4 KB gzip [M] and **four transitive
packages** [M]. It releases every few days: 13.4.0 and 13.4.1 are both inside
pnpm's seven-day `minimumReleaseAge`, so a fresh `pnpm add` today resolves
13.3.0 [S][I]. Nothing here that GSAP or the mixer does not already do.

### anime.js 4.5.0

Tree-shakeable, 13.8 KB gzip for a timeline [M], MIT, zero required deps. The
timeline has `seek`, `reverse`, `alternate`, `pause`, `cancel` [M, types].
`seek(600)` on plain `Object3D` fields worked in Node [M]. New in 4.x: a
`threeAdapter` that detects `isObject3D`, `isMaterial`, `isColor`, `isVector3`
targets and registers shorthand properties such as `x` and `y` [M, source].
**A credible smaller alternative to GSAP** if a library is wanted and the
licence matters, but the owner's fluency is with GSAP, not anime [I].

## 2. Dev tooling

### Tweakpane under a dev-only flag — verified

I could not add dependencies to the worktree's `package.json`: the permission
was refused. So the test ran in a scratch app built with **the same Vite 8.3.0
(rolldown)** the site uses, shaped like `boot.ts`: a static three scene, a
static motion module, and a tuner behind a dynamic import [M].

| Variant | Chunks and gzip bytes | Tweakpane in main? |
| --- | --- | --- |
| Shelf only | index 127,120 | no |
| + GSAP core motion | index 146,704 | no |
| + tuner behind `?debug` | index 1,123 + motion 146,257 + **tuner 64,054** | **no** — only in the lazy chunk |
| + tuner behind `import.meta.env.DEV && ?debug` | index 146,704, **no tuner chunk at all** | no |
| Mixer instead of GSAP | index 132,145 | no |

The detection regex was proved against a positive control: it matched the
tuner chunk and nothing else [M].

**What that means.**

- **Behind `?debug` alone**, as `debug-panel.ts` loads today, a 64 KB chunk is
  in `dist/` and deployed, though only fetched on request. That is "shipped to
  visitors" in the sense that any visitor can load it.
- **Behind `import.meta.env.DEV`**, the chunk is not emitted at all. This
  matches the owner's default. The cost: you tune under `pnpm dev`. A phone can
  still reach it with `astro dev --host` on the LAN [I].

### The tuner itself

- **Progress slider**: `addBinding(state, 'progress', { min: 0, max: 1 })`
  driving `seek` (hand-rolled), `tl.progress` (GSAP), or `action.time` plus
  `mixer.update(0)` with `paused` cleared (mixer).
- **Easing**: the essentials `cubicbezier` blade yields a `CubicBezier` whose
  `toObject()` is `[x1, y1, x2, y2]` [M, types]. All three runtimes can consume
  those four numbers exactly [M].
- **Export**: a button that writes the stage durations and curves as a
  TypeScript object literal to the clipboard, pasted into `shelf-settings.ts`.
  Tweakpane also has `exportState()`/`importState()` [M, source], but that is
  panel state, not the constants you want in the file [I].

### GSDevTools, Theatre studio, Motion Studio, Blender

- **GSDevTools** [M][S]: now free and in the `gsap` package; +22.1 KB. It is a
  scrubber and play controls for a GSAP timeline, which the Tweakpane slider
  already is. It has no bezier editor and no export. Worth a one-line dev import
  if GSAP is chosen; not worth building around.
- **Theatre studio** [M][S]: a real keyframe editor with curve handles, the one
  thing here that lets you *draw* a multi-stage move rather than type it. For
  three stages and perhaps a dozen numbers, that is more tool than the problem.
  It also forces `@theatre/core` into production, and it is AGPL and stale.
- **Motion Studio** [S]: a free Vite plugin that puts a timeline on the page;
  it excludes itself from production builds. Writing edits back to code needs a
  paid subscription or a connected agent. It only edits Motion animations.
- **Blender → glTF → `AnimationMixer`** [M][I]: the most expressive authoring,
  and the worst fit. The shelf builds books procedurally (`buildBook`), so a
  clip authored against a Blender rig must match node names the code creates.
  `GLTFLoader` costs 21.4 KB gzip plus the asset. Every retune is a round trip
  out of the browser.

## 3. Tweakpane against `AnimationMixer`, and what GSAP buys

The same tuner against the built-in system [M unless marked]:

| Need | `AnimationMixer` | GSAP core |
| --- | --- | --- |
| Scrub with a slider | `action.paused = false; action.time = t; mixer.update(0)` — **the clamp trap if you skip the first step** | `tl.progress(p)` |
| Feed the bezier blade | rebuild two tangent points per segment on `track.settings`, then re-create the action, since tangents are read when the interpolant is made [M, source] [I] | `ease: fn` or `CustomEase`, then `tl.invalidate()` |
| Eased turn | Euler component track `.rotation[y]`; quaternion tracks cannot be eased | any property |
| The hinge | must be a named child node | any object and field |
| Reverse from mid-move | `timeScale = -1` | `tl.reverse()` |
| Put back to a *different* place | new clip starting at current values, or cross-fade | `gsap.to(target, …)` from current values |
| Change one stage's duration live | rebuild the keyframe times of every later track [I] | edit that tween's duration; the timeline re-lays the rest out [I] |
| Cost | +5.0 KB, no new dependency | +19.6 KB, one dependency, non-OSI licence |

**What GSAP buys over the mixer** is authoring by **relative** sequencing and
retargeting from current values, plus a scrub API with no hidden state. **What
the mixer buys over GSAP** is no dependency and a smaller bundle. **The
hand-rolled module takes the useful half of each**: relative stages (a table of
durations) and a plain `seek`, with no dependency [I].

## What the panel decision would want to know

Whether the whole `?debug` panel migrates to Tweakpane is decided elsewhere.
These are the facts that decision would want.

- **The lazy boundary holds.** `debug-panel.ts:25-29` gives three reasons for
  plain DOM; the second is that a UI library in the graph "makes the lazy-load
  boundary pointless". **Measured, it does not** — Tweakpane stayed entirely in
  the lazy chunk and the main chunk did not move [M]. The cost moves *inside*
  the lazy chunk: today's panel is 4,244 B gzip [M]; Tweakpane alone is
  31.2 KB, and with essentials 62.8 KB [M].
- **Essentials duplicates the core.** Its dist file has no `import` statements
  and carries its own `@tweakpane/core` [M]. That is why it doubles the size.
- **Maintenance cadence** [S]: Tweakpane's last release was 2024-11-03 and the
  repo's last push 2026-03-15 (sponsors and a TypeScript upgrade). Essentials
  was last released 2023-12-17. Stable, not abandoned, but slow.
- **The repo's "a control must not lie" rule.** The current panel renders what
  `ApplyReport` says was applied, not what was requested. Tweakpane binds to an
  object and redraws from it, so a migration would need the shelf's reported
  values written back and `pane.refresh()` called [I].
- **Shipping.** The current panel is in `dist/`, behind `?debug`. If the whole
  panel moved to Tweakpane under the same flag, a third-party UI library would
  be in the production artifact for the first time [M, by the variant table].
  A pick-up tuner gated on `import.meta.env.DEV` avoids that question entirely.
- **lil-gui** is 8.0 KB gzip [M] with no curve editor; it would need a
  hand-rolled bezier control for this job [I].

## Supply chain, against `docs/spec/supply-chain.md`

- **Audit threshold**: CI fails on `high`. Of everything above, only
  `@theatre/core`'s transitive `lodash-es` range can resolve into a live high
  advisory [S]. A fresh resolution picks the fixed 4.18.1 [M], but nothing in
  the graph says it must, the same situation the `fast-uri` override in
  `pnpm-workspace.yaml` records.
- **Quarantine**: pnpm's seven-day `minimumReleaseAge` would resolve Motion to
  13.3.0 today [S][I]. GSAP 3.15.0, anime 4.5.0 and Tweakpane 4.0.5 are all far
  outside the window [S].
- **Dependency surface**: the site's runtime dependencies today are `astro`,
  `three` and `@stacks/core` [M]. The recommendation keeps that list unchanged.
  Tweakpane and essentials become **dev** dependencies, which still need an ADR
  under `AGENTS.md`'s rule [S].

## Method

Scratch folder, outside the repo: `npm install --ignore-scripts` of gsap 3.15.0,
three 0.185.1 (the site's version), @theatre/core and studio 0.7.2,
@tweenjs/tween.js 25.0.0, motion 13.3.0, animejs 4.5.0, tweakpane 4.0.5,
@tweakpane/plugin-essentials 0.2.1, lil-gui 0.21.0, then esbuild 0.25.10 and
Vite 8.3.0.

- **esbuild sizes**: one entry per library playing the same three-stage move on
  an `Object3D`-shaped object, with reverse and seek, so tree-shaking keeps what
  that use needs. `three` external except for the mixer baselines.
  Minified, ESM, gzip level 9.
- **Vite sizes**: five variants of a `boot.ts`-shaped app, as in the table.
- **Behaviour**: Node scripts against real `THREE.Object3D` instances for GSAP,
  the mixer and anime; no DOM needed for any of them.
- **Baseline**: `pnpm build` at `1cd94aa`, exit 0 in 13.5 s; chunk sizes gzip
  "Optimal" via .NET `GZipStream`, so the 158,176 B baseline is a slightly
  different compressor from the level-9 deltas [M].
- **Not verified**: a real `pnpm build` of the site with Tweakpane added (the
  dependency add was refused); Theatre's studio behind a dynamic import; Motion's
  reverse at runtime (source and types only); the tuner running in a browser.

## Sources

Checked 2026-09-22.

- npm registry metadata: `npm view <pkg> version license dependencies peerDependencies peerDependenciesMeta time dist-tags` for every package above.
- GitHub advisories: `gh api /advisories?ecosystem=npm&affects=<pkg>` for each package and its transitive dependencies.
- GitHub repositories: `gh api repos/<owner>/<repo>` for [greensock/GSAP](https://github.com/greensock/GSAP), [theatre-js/theatre](https://github.com/theatre-js/theatre), [tweenjs/tween.js](https://github.com/tweenjs/tween.js), [motiondivision/motion](https://github.com/motiondivision/motion), [juliangarnier/anime](https://github.com/juliangarnier/anime), [cocopon/tweakpane](https://github.com/cocopon/tweakpane), [georgealways/lil-gui](https://github.com/georgealways/lil-gui), [mrdoob/three.js](https://github.com/mrdoob/three.js).
- [GSAP Standard License](https://gsap.com/standard-license), effective 2025-04-30.
- [three.js #32829, "Animation: Add BezierInterpolant"](https://github.com/mrdoob/three.js/pull/32829), milestone r183.
- [Theatre.js README](https://github.com/theatre-js/theatre#readme) (the 1.0 notice and the licence split) and [Theatre.js projects manual](https://www.theatrejs.com/docs/latest/manual/projects).
- [Motion Studio documentation](https://motion.dev/docs/studio).
- Installed sources read directly: `three/src/animation/KeyframeTrack.js`, `PropertyBinding.js`, `AnimationAction.js`, `tracks/QuaternionKeyframeTrack.js`, `math/interpolants/BezierInterpolant.js`; `@tweenjs/tween.js/dist/tween.d.ts`; `motion-dom/dist/index.d.ts` and `JSAnimation.mjs`; `animejs/dist/modules/**`; `@theatre/core/dist/index.d.ts`; `@tweakpane/plugin-essentials/dist/**`.
