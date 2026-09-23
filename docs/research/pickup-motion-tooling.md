# Tuning the pickup animation — seven options compared, for #370

Started as a Theatre.js-only research pass and was broadened twice at the
owner's request: first into a comparison across every reasonable way to
tune a three-stage pickup move (slide out, turn, open — roughly 6-12
keyframes) that the `?debug` panel could drive (§§1-6), then into a round 2
(§7) evaluating three.js's own `AnimationMixer` — missed in round 1 — and a
GSAP + Tweakpane stack together, given the owner's GSAP fluency and
standing want for a Tweakpane-based debug panel. This file is
self-contained; there is no earlier file to cross-reference.

## 1. Verdict / recommendation

**Round 1 verdict (unchanged as a statement of pure dependency cost):**
hand-rolling a small keyframe/timeline structure inside `shelf-settings.ts`
and `debug-panel.ts` — a plain array of `{ tMs, pose }` keyframes, a lerp,
and 2-4 hardcoded cubic-bezier easing constants — is the only option with
zero new dependencies, zero licence review, and zero maintenance-status
risk. For 6-12 keyframes across three stages, no library below earns its
dependency cost **on that axis alone**.

**Round 2 changes the recommendation, because the owner supplied two facts
round 1 didn't have: GSAP fluency (so authoring speed is a real, not
theoretical, benefit) and a standing want for Tweakpane as the debug panel's
eventual UI, independent of this feature.** Weighed against those inputs,
**the recommendation is GSAP for the pickup timeline, tuned through a
Tweakpane panel loaded only under `?debug`.** GSAP costs ≈31 KB gzip to
production visitors — ≈27.3 KB for core plus ≈3.7 KB for `CustomEase`,
which ships to production because it is what applies a Tweakpane-tuned
cubic-bezier curve as an actual easing at runtime (§7.2), not just a
dev-time convenience — and zero direct dependencies (§7.1); Tweakpane
costs zero bytes to visitors because it only ever loads behind the debug
flag, the same mechanism `debug-panel.ts` already uses and this pass
confirmed with a real build (§7.2). That is a real, measured dependency
cost — not free — but it buys faster iteration for someone who already
knows the API, and it does not conflict with the owner's independent
long-standing wish for Tweakpane.

**Zero-dependency alternative, and worth naming because it is genuinely
capable, not just cheaper:** three.js's own `AnimationMixer` /
`AnimationClip` / `KeyframeTrack` system ships inside the `three` package
this site already depends on — **zero new bytes, zero new dependencies,
zero new licence surface** — and covers reverse, interrupt, and scrubbing
as well as GSAP does for this feature (§7.1, §7.4). The gap is authoring
ergonomics: driving a single book's transform means constructing
`VectorKeyframeTrack`/`QuaternionKeyframeTrack` objects bound to property
paths, versus GSAP's `gsap.to(mesh.position, {...})` on a plain object.
**If the owner is equally comfortable driving `AnimationMixer` directly,
it is the stronger choice by this repo's own stated axis (fewer
dependencies, smaller security surface); if GSAP's familiarity is worth
~27 KB gzip and a proprietary licence's fine print, GSAP is a reasonable,
informed trade — not a mistake.** Hand-rolling (round 1) and
`@tweenjs/tween.js` remain valid fallbacks if neither an animation engine
nor `AnimationMixer`'s API is wanted.

## 2. Comparison table

Dependency/licence/release figures measured 2026-09-22 via `npm view <pkg>
dependencies license time --json`. "Runtime bytes to visitors" is
Bundlephobia's measured minified+gzipped size for the package's main entry
point (`bundlephobia.com/api/size?package=<pkg>@<version>`), which is what a
bundler would actually ship — not npm's unpacked size, which counts every
file in the published tarball (source maps, multiple build targets, docs)
and overstates real bundle cost by an inconsistent amount: about 3x for
`tweakpane` (447 KB unpacked vs 148 KB min), about 17x for
`@tweenjs/tween.js` (224 KB vs 12.8 KB min), and about 89x for `gsap`
(6.26 MB vs 70.6 KB min, because the unpacked figure counts every bundled
plugin the main entry point doesn't import). Sources in §8.

| Option | Tuning capability | Visual editor? | Dev-only achievable? | Runtime bytes to visitors (min+gzip) | Direct deps | Licence | Last release | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Theatre.js** (`@theatre/core` + `@theatre/studio`) | Full timeline: props, sequences, per-segment easing | Yes — `@theatre/studio`, a real scrubbable curve editor | Studio yes (docs say exclude `studio.initialize`/`.extend` from production and pass an exported state JSON to `getProject` instead); **core no** — the exported JSON is state data, not playback code, and interpreting it (interpolating keyframes, driving properties) is `@theatre/core`'s job at runtime, so core cannot be dropped | `@theatre/core` ≈ 31.4 KB gzip | 1 (`@theatre/dataverse`) | **Split**: core Apache-2.0, studio **AGPL-3.0-only** | **0.7.2, 2024-05-19** (stale) | None found |
| **GSAP** (`gsap`) | Full timeline, easing, plugins (MorphSVG, GSDevTools scrubber) | Yes — GSDevTools, a visual scrubber/playback UI, now bundled free | GSDevTools is dev-tooling by nature (not something you'd ship to visitors) but nothing in the docs states a dev-only export path — you'd gate it behind your own `?debug` flag | ≈ 27.3 KB gzip (core import) | **0** | **Proprietary "Standard License"** (not SPDX/OSI) — free for commercial use, but a no-code-competing-tool clause and Webflow retains IP | **3.15.0, 2026-04-13** (~5 months old; releases have landed roughly every few months to a year over the past two years, not weekly) | 1 historical: prototype pollution, **CVE-2020-28478**, fixed in 3.6.0 (2021) — current versions unaffected |
| **`@tweenjs/tween.js`** | Programmatic tweening only — value interpolation + easing curves, chainable `.chain()`/`.delay()` for sequencing | **No** | N/A (no editor exists) | ≈ 3.7 KB gzip | **0** | **MIT** | 25.0.0, 2024-07-26 | None found |
| **Motion** (`motion`, formerly Framer Motion) | Vanilla `animate()`/`scroll()` API, keyframes and sequences documented | Only via a separate commercial add-on ("Motion AI Kit" — inline bezier editing); no bundled free editor | The AI Kit is a separate paid product, not part of the `motion` runtime — no dev-only export path documented | ≈ 47.7 KB gzip | **2** (`tslib`, and — surprisingly — `framer-motion` itself as a dependency) | **MIT** | 13.4.1, **2026-09-22** (released today; very active) | None found |
| **anime.js v4** (`animejs`) | `createTimeline()` — labels, relative offsets (`'<-=500'`), full rewrite in v4 | No bundled visual timeline editor; docs mention an "easing functions editor" reference page, not a shipped GUI | Timeline is a subpath import (`animejs/timeline`) — modular, but no separate dev/prod split documented beyond normal tree-shaking | ≈ 40.3 KB gzip | **0** | **MIT** | 4.5.0, 2026-06-22 (v5 beta already out, 2026-08-17 — active rewrite cadence) | None found |
| **Hand-rolled timeline** | Full — whatever you build (array of keyframes + lerp + 2-4 bezier constants), matches the 6-12 keyframe / 3-stage need exactly | No editor, but scrubbing is trivial to add to the existing `?debug` panel (a range input driving `tMs`) | Trivially — it's already inside the lazy-loaded `debug-panel.ts` | **0** (no new package) | **0** | N/A — this repo's own code | N/A | N/A |
| **three.js `AnimationMixer`** (added in round 2, §7) | `AnimationClip`/`KeyframeTrack` sequencing, played through an `AnimationMixer` — full keyframe capability, more authoring boilerplate than a tween call (§7.1) | No editor of any kind | Trivially — no new package to gate, it's already inside `three` | **0** (no new package; `three` is already a dependency) | **0** | **MIT** (inherited from `three`) | Tied to whatever `three` version ships (`0.185.1`, pinned in `packages/site/package.json` — not npm's current `0.186.0`) | 2 historical against `three` itself (§7.1), unrelated to this feature |

## 3. Per-option detail

### Theatre.js

`@theatre/core` and `@theatre/studio` are both at **0.7.2**, released
**2024-05-19** — over two years stale as of today (2026-09-22), and
[github.com/theatre-js/theatre/issues/504](https://github.com/theatre-js/theatre/issues/504)
("This wonderful project will not continue?") is open and unanswered. Licence
split: `@theatre/core` is Apache-2.0, `@theatre/studio` is **AGPL-3.0-only**
([npmjs.com/package/@theatre/studio](https://www.npmjs.com/package/@theatre/studio)).

**The studio/core split is real, and the docs describe exactly how to keep
studio dev-only.** Theatre.js's own guide on going to production says to
call `studio.initialize()`/`studio.extend()` only in development, export the
project's state as a JSON file from inside studio (or build that JSON object
programmatically), and in production pass that state straight into
`getProject(name, { state })` from `@theatre/core` alone
([theatrejs.com — Getting started with Three.js](https://www.theatrejs.com/docs/0.5/getting-started/with-three-js),
[theatrejs.com — @theatre/studio API](https://www.theatrejs.com/docs/latest/api/studio)).
So studio genuinely never has to reach a visitor.

**Core does, and there's no path around that.** The exported JSON is state
data — keyframe positions, easing curves, sheet/sequence structure — not
compiled playback code. Turning that data into an animated object on screen
(interpolating between keyframes, applying easing, driving the object's
properties frame by frame) is `@theatre/core`'s job, performed at runtime via
`getProject`/`sheet`/`sequence.play()`. There is no documented "bake the
sequence to a plain array of numbers and drop `@theatre/core` entirely"
export — the state JSON is meant to be re-interpreted by core, not consumed
standalone. So **playback needs `@theatre/core` in the production bundle**,
even though studio does not.

### GSAP

**Licence, verified on the primary source, not from memory.** `npm view gsap
license` returns the literal string `"Standard 'no charge' license:
https://gsap.com/standard-license."` — this is **not MIT** and has no SPDX
identifier. Reading
[gsap.com/licensing](https://gsap.com/licensing/) directly: Webflow (which
acquired GSAP) states commercial use is free, and every formerly
paid "Club GreenSock" plugin (SplitText, MorphSVG, etc.) is now included at
no charge, effective **2025-04-30**. The one restriction worth flagging: the
licence forbids using GSAP inside "tools that allow users to build visual
animations without code" that would compete with Webflow's own product —
irrelevant to a reading-tracker bookshelf, but it is a real, negotiated
restriction, not open source in the OSI sense, and "IP remains Webflow's
property."

**Maintenance is active but not weekly.** Latest is **3.15.0**, published
**2026-04-13** (`npm view gsap version time --json`) — about five months
before this research date. Looking at the last two years of releases on the
same package, the cadence runs every few months to about a year apart
(3.12.5 → 3.12.6 was a year; 3.14.2 → 3.15.0 was four months), not the
weekly cadence an earlier draft of this file wrongly attributed to it by
copying a version string from the Motion row. Still healthier than
Theatre.js or `@tweenjs/tween.js`, just not exceptional.

**GSDevTools** ([gsap.com/docs/v3/Plugins/GSDevTools](https://gsap.com/docs/v3/Plugins/GSDevTools/))
is GSAP's own visual scrubber/playback UI for a `Timeline` — closest thing in
this whole comparison to what Theatre.js's studio offers, and now free under
the same 2025 licence change. **Correction from round 1:** the GSDevTools
docs page itself is silent on any account or licence requirement — it says
nothing either way — and the "free for commercial use" claim traces to
`gsap.com/licensing`'s 2025 announcement covering every formerly-paid
plugin, not to anything on the GSDevTools page specifically. It ships as a
plain subpath of the `gsap` npm package itself (`gsap/GSDevTools`, confirmed
by unpacking the published tarball, see §7.3), not a separate install.
Nothing in the docs describes a dedicated "exclude from production" build
flag, so keeping
it dev-only would mean the same pattern this repo already uses for
`?debug`: import it lazily, only behind the query flag.

**Advisory:** one historical GHSA,
[GHSA-6g8v-hpgw-h2v7](https://github.com/advisories/GHSA-6g8v-hpgw-h2v7)
/ CVE-2020-28478, prototype pollution via `gsap.config()`'s deep-merge —
fixed in 3.6.0 (2021). Current 3.x/13.x lines are unaffected.

**Direct dependencies: zero** (`npm view gsap dependencies` returns empty).

### `@tweenjs/tween.js`

The plainest option. **Zero dependencies, MIT licence**
([npmjs.com/package/@tweenjs/tween.js](https://www.npmjs.com/package/@tweenjs/tween.js)),
commonly paired with Three.js in its own examples. It has no visual/timeline
editor of any kind — confirmed by its own docs and README, which describe
only a programmatic `Tween`/`.chain()`/`.easing()` API. Latest release
**2024-07-26** (version jumped to 25.0.0 as part of a deliberate
semver-major renumbering the maintainers did that year, not 25 major
rewrites) — over two years old as of today but the package is feature-stable
rather than abandoned (a tweening primitive has a small, finished API
surface). No GitHub advisories.

### Motion (`motion`, formerly Framer Motion)

Confirmed vanilla JS API: `import { animate, scroll } from "motion"`
([motion.dev/docs/quick-start](https://motion.dev/docs/quick-start)) — no
React required for this entry point. **Surprising dependency finding:** `npm
view motion dependencies` shows the vanilla package itself depends on
`framer-motion@^13.4.1` as a **direct runtime dependency**, alongside
`tslib`. That means choosing "Motion" for a no-React site still pulls the
React-oriented `framer-motion` package into `node_modules` and, depending on
how tree-shaking resolves it, potentially into the bundle graph — worth
flagging given this repo's explicit "no React on the page" constraint; it
would need verification with an actual bundle build, not just npm metadata,
before treating it as bundle-inert. MIT licence, extremely active (latest
version published *today*, 2026-09-22). No bundled free visual editor — the
only visual/scrubbing tool is the "Motion AI Kit," a separate commercial
product with inline bezier editing, not part of the open-source runtime. No
advisories found.

### anime.js v4

Full rewrite from v3, confirmed current on the v4 line: latest stable
**4.5.0** (2026-06-22), with a **v5 beta** already published
(5.0.0-beta.2, 2026-08-17) — an actively evolving project. `createTimeline()`
gives label-based, relative-offset sequencing
([animejs.com/documentation/timeline](https://animejs.com/documentation/timeline))
which maps well onto a 3-stage move. **No bundled visual timeline editor** —
the docs reference an easing-function reference page, not a GUI. MIT
licence, zero direct dependencies, no advisories found. Timeline is
available as a subpath import (`animejs/timeline`), so it is at least
tree-shakeable, but there's no documented "dev-only" split beyond ordinary
bundler tree-shaking.

### Hand-rolled timeline

A plain array of
`{ tMs, values: Partial<PickupPose> }` keyframes, a `lerp`, and 2-4
hardcoded cubic-bezier constants (ease-in-out, ease-out — the same handful
any animation needs), estimated at 100-200 lines inside
`packages/site/src/shelf/`. This is honestly assessed as **lower authoring
ergonomics than any library above** — no drag-to-reorder, no curve-dragging,
just typed numbers and a "record keyframe" button pushing the current pose —
but for 6-12 keyframes across three stages that ergonomic gap is small, and
it is the only option that adds nothing to the dependency tree, the licence
surface, or the security-advisory surface. It also composes for free with
the existing `?debug` panel's `ApplyReport` pattern (`applied`/
`needsRebuild`/`needsReload`/`refused`), which none of the libraries above
know anything about.

## 4. Tuning-UI note — Tweakpane full evaluation, and lil-gui (future option, not now)

Surfaced only as **a possible future dev-only control surface for the
`?debug` panel** — not a proposal to migrate `debug-panel.ts`'s existing
plain-DOM widgets today. The owner has expressed a preference for Tweakpane
specifically, so it gets a fuller look here; **whether to actually move the
whole panel to Tweakpane (vs. lil-gui, vs. staying plain DOM) is explicitly
a separate map**, per the task that requested this section. What follows is
what that future map would want on hand.

**Core package.** `tweakpane` — MIT licence, **zero direct dependencies**,
≈ 30.4 KB gzip, latest **4.0.5** (2024-11-03)
([npmjs.com/package/tweakpane](https://www.npmjs.com/package/tweakpane)).
Over 18 months since its last release as of today (2026-09-22), but the
core API (panes, folders, bindings, blades) is a finished surface rather
than one showing abandonment signals — no open "is this dead?" issue found,
unlike Theatre.js's #504.

**Plugin that matters for motion: `@tweakpane/plugin-essentials`.** This is
the plugin the owner would actually want for keyframe/easing tuning — it
ships a `cubicbezier` blade: a draggable four-handle bezier-curve editor for
picking an easing curve visually
([github.com/tweakpane/plugin-essentials](https://github.com/tweakpane/plugin-essentials)).
MIT licence, latest **0.2.1** (2023-12-17), ≈ 30.5 KB gzip. Measured
directly (`npm view @tweakpane/plugin-essentials peerDependencies
dependencies --json`): it declares **no runtime `dependencies`**, only a
`peerDependencies` entry of `"tweakpane": "^4.0.0"` — it does not stand
alone, it extends a `Pane` instance supplied by the host app, so adopting it
means both packages ship together, but the relationship is a peer
dependency, not a bundled one. It also provides an
interval slider, an FPS graph, a radio grid, and a button grid — none of
which are needed for this feature, so only the bezier blade would be used
if adopted.

⚠️ **The predecessor plugin is a dead end, and worth naming so nobody reaches
for it first.** `@tweakpane/plugin-cubic-bezier` — the original standalone
bezier-curve plugin — is **archived** (GitHub archived it 2021-06-16,
read-only) with its own README pointing at `plugin-essentials` as the
replacement
([github.com/tweakpane/plugin-cubic-bezier](https://github.com/tweakpane/plugin-cubic-bezier)).
A future map should adopt `plugin-essentials`, never this one.

**No timeline/sequencing blade exists in either package.** The bezier blade
edits one easing curve at a time — it is a curve picker, not a scrubbable
multi-keyframe timeline like GSAP's GSDevTools or Theatre.js's studio. Tuning
a three-stage move with Tweakpane would mean one bezier blade per stage
(three blades, or three curves inside one blade group) plus the existing
plain-number inputs for keyframe values and timing — closer in spirit to
today's `debug-panel.ts` sliders than to a scrubbable timeline, just with a
visual curve instead of a number.

**Dev-only, zero bytes to visitors: yes, and by the same mechanism the panel
already uses.** Tweakpane and its plugins ship as standard ES modules
(`import { Pane } from 'tweakpane'`), with no framework dependency
([tweakpane.github.io/docs/getting-started](https://tweakpane.github.io/docs/getting-started/)).
That means they load with a plain `await import('tweakpane')` behind the
existing `?debug` check — the identical lazy-load pattern
`docs/shelf-inspectors.md` already documents for `debug-panel.ts`'s current
8.8 KB. A production build that never evaluates that `import()` (because the
query flag check short-circuits first) ships neither package to a visitor
who does not ask — same guarantee the panel already gives, just a larger
payload (≈61 KB gzip combined for `tweakpane` + `plugin-essentials`, vs the
panel's current 8.8 KB) behind the same gate.

**What the "migrate the panel" map would want to know, gathered here so it
doesn't have to re-derive it:**

- Use `@tweakpane/plugin-essentials`'s `cubicbezier` blade, not the archived
  `@tweakpane/plugin-cubic-bezier`.
- Neither package gives a multi-keyframe scrubbable timeline — that part of
  the pickup-motion problem (sequencing 6-12 keyframes across three stages)
  is unaffected by which debug-UI library is chosen, and still needs the
  hand-rolled timeline data structure from §1 regardless of the UI layer on
  top of it.
- `plugin-essentials`'s last release is 2023-12-17 — check its issue tracker
  again at adoption time rather than trusting this snapshot.
- Adopting Tweakpane is a **new dependency for a debug-only surface**; it
  changes nothing about the production bundle if the lazy-load discipline
  `debug-panel.ts` already follows is preserved, but it is still weight this
  repo's supply-chain gate (`pnpm audit`) will now track.

**lil-gui**, for comparison — MIT licence, **zero direct dependencies**,
≈ 8.1 KB gzip, latest **0.21.0** (2025-10-12, more recently released than
Tweakpane). Smaller and simpler; commonly paired with Three.js examples. No
bundled bezier/easing-curve blade of any kind — that capability is
Tweakpane-plugin-essentials' distinguishing feature over lil-gui for this
specific use case. No advisories found for either package.

## 5. Supply-chain read

`docs/spec/supply-chain.md`'s stated posture is few dependencies, small
security surface, and — from `pnpm audit --audit-level=high` plus the
`ignoreGhsas` hatch — a willingness to accept a dependency only when its risk
is well-understood and reachable. Ranked primarily on dependency-count/
security-surface, capability second:

1. **Hand-rolled** and **three.js `AnimationMixer`** (round 2, §7) — tied
   for first. Both are zero new dependencies, zero new licence surface, and
   zero new advisory surface: `AnimationMixer` ships inside `three`, already
   a dependency this repo tracks and audits regardless of which animation
   tool tunes the pickup move. Wins the axis the owner named as primary,
   trivially, and — unlike hand-rolling — with a full keyframe/timeline API
   already written and tested upstream.
2. **`@tweenjs/tween.js`** — zero dependencies, MIT, no advisories, tiny
   (≈3.7 KB gzip). The cheapest real dependency on this list if
   programmatic tweening is ever wanted without hand-rolling easing math.
3. **`@tweenjs/tween.js`-tier siblings for the debug UI**: Tweakpane and
   lil-gui, both zero-dependency, MIT, no advisories — safe *if and when* a
   visual control surface is wanted, per §4.
4. **anime.js v4** — zero direct dependencies, MIT, no advisories, but a
   library entirely: ≈40.3 KB gzip and a full animation engine for a
   3-stage move that doesn't need one.
5. **GSAP** — zero direct dependencies and the most capable/actively-released
   option, but its licence is **not SPDX/OSI** — a proprietary grant with a
   field-of-use restriction (barring no-code animation-builder competitors
   to Webflow, §7.1) and a reverse-engineering ban. That's a real thing for a
   licence-conscious supply-chain policy to note even though the practical
   commercial-use risk to a reading tracker is low. One historical advisory,
   long fixed. Round 2's recommended integration (§1, §7) accepts this
   trade-off deliberately, for authoring speed and the owner's GSAP fluency
   — not because the trade-off disappears.
6. **Motion** — MIT, but its **vanilla entry point pulls in `framer-motion`
   as a direct dependency**, which is the opposite direction from "few
   dependencies" and sits oddly next to this repo's "no React on the page"
   rule even though the vanilla API itself avoids React.
7. **Theatre.js** — a real AGPL-3.0/Apache-2.0 licence split between studio
   and core, a runtime (`@theatre/core`) that cannot be avoided in
   production regardless of how dev-only studio is kept, and the worst
   maintenance signal of any option here (over two years stale, an
   unanswered "will this continue?" issue).

## 6. What "not needed" rests on

The narrowest, most load-bearing claim in this file is that Theatre.js's
studio/core split does not get you out of shipping `@theatre/core` to
visitors. That rests on §3's reading of Theatre's own production guide
(export state as JSON, keep studio dev-only, pass the state into
`getProject` from `@theatre/core`) — there is no documented path that lets
the exported JSON be consumed without `@theatre/core` at runtime. Everything
else in the comparison (licence split, staleness, issue #504) is corroborating
context, not the deciding fact.

## 7. Round 2 — three.js + GSAP + Tweakpane as one stack

Requested by the owner after reading round 1: evaluate the three named
tools together as a stack, given two facts round 1 didn't have — the owner
knows GSAP well, and has wanted a standardised Tweakpane-based debug panel
"since the start" (a goal in its own right, not a side option weighed only
against this feature). This section does **not** decide whether the whole
`?debug` panel moves to Tweakpane — that is explicitly a separate map — but
records what that map would want to know.

### 7.1 Runtime: GSAP vs three.js's own `AnimationMixer`

Round 1 missed that three.js ships its own keyframe animation system
(`AnimationClip`, `KeyframeTrack`, `AnimationMixer`, `AnimationAction`) as a
core module — `import { AnimationMixer } from 'three'`
([threejs.org — AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html),
[threejs.org — AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)) —
already loaded because this site depends on `three` regardless of which
animation tool tunes the pickup move. That makes it the only *animation
engine* in this comparison (as opposed to the hand-rolled option) that adds
literally nothing to the dependency graph.

| | GSAP (`gsap.timeline()`) | three.js `AnimationMixer` / `AnimationAction` |
| --- | --- | --- |
| **Reverse** (put a book back) | `timeline.reverse()` — one call, re-orients easing too ([gsap.com/docs/v3/GSAP/Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)) | `action.timeScale = -1` — one call; the docs state "negative values cause the animation to play backwards" |
| **Interrupt mid-move** (click another book) | Manual by default: GSAP's own docs say tween `overwrite` defaults to `false` — "no overwriting strategies will be employed" — so a second `gsap.to()` on the same properties runs alongside the first unless you set `overwrite: 'auto'` (kill only the conflicting props) or `overwrite: true` (kill all tweens of that target) ([gsap.com/docs/v3/GSAP/gsap.to()](https://gsap.com/docs/v3/GSAP/gsap.to%28%29/)) | `action.crossFadeTo(otherAction, duration, warp)` is built specifically for this — its own docs describe it as causing "this action to fade out and the given action to fade in, within the passed time interval" — or a hard cut via `action.stop()`/`.play()` |
| **Scrubbing** | `timeline.seek(time)` or `timeline.progress(0-1)`, either works mid-playback ([gsap.com/docs/v3/GSAP/Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)) | `mixer.setTime(t)` — also one call, confirmed on the mixer itself: "sets the global mixer to a specific time and updates the animation accordingly." (An earlier draft of this section claimed this needed two calls — `action.time = t; mixer.update(0)` — which is a real, lower-level path, but `setTime()` is the one-call equivalent and the fairer comparison.) |
| **Driving Three.js object properties** | Trivial: `gsap.to(mesh.position, { x, y, z, duration, ease })` tweens plain object properties directly, no clip authoring | Requires constructing `VectorKeyframeTrack`/`QuaternionKeyframeTrack` objects bound to the target's UUID and a property path string, wrapped in an `AnimationClip` — more boilerplate for a hand-authored, one-off move like this. This is the one real, remaining ergonomic gap in `AnimationMixer`'s favour of GSAP: authoring, not playback control |
| **Bytes to visitors (gzip)** | ≈27.3 KB core (Bundlephobia, §2) + ≈3.7 KB `CustomEase` if a Tweakpane-tuned bezier curve is applied as a runtime ease (§7.2) — **≈31 KB total for the recommended integration**, not core alone | **0 KB** — `AnimationMixer` ships inside `three`, already a dependency |
| **Transitive deps** | 0 | 0 (uses the existing `three` dependency; no new package) |
| **Advisories** | 1 historical, fixed (§3) | `three` itself carries 2 historical GHSA entries — [GHSA-fq6p-x6j3-cmmq](https://github.com/advisories/GHSA-fq6p-x6j3-cmmq) (DoS, 2021) and a since-withdrawn XSS advisory, GHSA-7vvq-7r29-5vg3 — both against 0.x-era releases long superseded by the `0.185.1` this repo pins (`packages/site/package.json`); irrelevant to *this decision* either way since `three` is depended on regardless of which animation tool is chosen |
| **Licence** | Proprietary "Standard No-Charge License" — see the quoted clauses below; not OSI-approved | MIT (inherited from the existing `three` dependency, no new licence surface) |

**GSAP's licence, in its own words** (from the licence text itself,
[gsap.com/standard-license](https://gsap.com/standard-license), the URL
`npm view gsap license` names as the licence source): "Competitive
Products" are defined as software "that enables users to create, edit, or
manage animations through a visual interface or builder similar to
Webflow," and "Prohibited Uses" bars "any implementation and/or use of GSAP
Products in tools that allow users to build visual animations without
code." Separately, the licence forbids removing "proprietary notices or
branding from GSAP Products" and reverse-engineering "for the purpose of
creating Competitive Products." None of this is a non-compete on the
business as a whole — it is a field-of-use restriction aimed specifically
at no-code animation-builder competitors to Webflow, irrelevant to a
reading-tracker bookshelf — but it is a real, negotiated restriction, and
**this is plainly not an OSI-approved open-source licence**: the "Prohibited
Uses" clause quoted above discriminates against a specific field of
endeavour (no-code animation builders), which the Open Source Definition's
own field-of-use clause forbids, and the reverse-engineering ban is a
further restriction no OSI-approved licence carries.

**Reading the capability comparison plainly, now that `setTime()` closes
the scrubbing gap:** GSAP's real, durable ergonomic edge is in *authoring* —
`gsap.to(mesh.position, {...})` tweens a plain object directly, where
`AnimationMixer` wants keyframe-track objects built up front. For
*playback control* (reverse, interrupt, scrub) the two are close to parity:
`AnimationAction.crossFadeTo` is arguably a cleaner purpose-built primitive
for interrupting one book's move to attend to another than GSAP's
opt-in `overwrite` flag. Neither is a capability gap that forces a choice —
this is authoring speed and familiarity versus dependency minimalism, which
is exactly the trade-off §1's revised verdict names.

### 7.2 Dev tooling: Tweakpane driving a GSAP timeline under `?debug`

**Scrubbing.** Yes — trivially. Tweakpane's binding API fires a plain
`onChange` callback with the new value; wiring that to
`timeline.progress(value)` (or `.seek()`) is a few lines of glue code, no
dedicated Tweakpane–GSAP integration exists or is needed because both
expose a plain synchronous method call
([gsap.com/docs/v3/GSAP/Timeline](https://gsap.com/docs/v3/GSAP/Timeline/),
[tweakpane.github.io/docs/getting-started](https://tweakpane.github.io/docs/getting-started/)).
A web search for a purpose-built integration between the two turned up
nothing beyond GSAP's own generic "attach a slider to progress()" guidance
— which is the same generic pattern Tweakpane's `binding.on('change', …)`
satisfies.

**Feeding the `cubicbezier` blade into GSAP's easing.** Yes, directly.
GSAP's `CustomEase` plugin (bundled in the `gsap` package, ships in
`gsap/CustomEase`, measured at **≈3.7 KB gzip** by unpacking the published
tarball) explicitly accepts a standard cubic-bezier control-point string:
`CustomEase.create("easeName", ".17,.67,.83,.67")`
([gsap.com/docs/v3/Eases/CustomEase](https://gsap.com/docs/v3/Eases/CustomEase/)).
Tweakpane's `@tweakpane/plugin-essentials` `cubicbezier` blade's value is
exactly that shape — four control-point numbers
([github.com/tweakpane/plugin-essentials](https://github.com/tweakpane/plugin-essentials),
§4) — so the blade's live value can be joined with commas and fed straight
into `CustomEase.create()` on every change, then applied as
`ease: "easeName"` on the tween. No adapter code beyond string formatting.

**Exporting tuned values as plain constants.** The same pattern this repo
already uses for `ShelfSettings`: read the current bound values back out of
the Tweakpane panel's state (or keep your own plain object as the single
source of truth and let Tweakpane bind to it, which is Tweakpane's normal
usage pattern) and `JSON.stringify` it, exactly as `debug-panel.ts` already
does for `ShelfSettings` today (`docs/shelf-inspectors.md`: "the panel
exports it as JSON you paste back into `DEFAULT_SETTINGS`"). Keyframe times,
positions, and the cubic-bezier control points would all be plain numbers,
copy-pasteable into `shelf-settings.ts` the same way.

**Dev-only, zero production bytes: verified with a real build, not just
reasoned by analogy.** Uncommitted working-tree changes on this research
branch (never staged or pushed) added `gsap` and `tweakpane` as temporary
`devDependencies` of `@stacks/site`, a scratch module that imports both and
calls one function from each, and wired it into `boot.ts` behind the
existing `if (debug && canvas.parentElement !== null)` gate with a dynamic
`await import('./scratch-gsap-tweakpane.ts')` — the identical pattern
`debug-panel.ts` already uses. Running `pnpm build` in `packages/site` and
inspecting the emitted `dist/_astro/*.js` chunks confirmed the scratch
module's code landed in its own 213.30 KiB (218,419-byte) chunk, separate
from the page's main entry chunk. That figure matches the two libraries'
own measured Bundlephobia sizes almost exactly: `gsap`'s min bundle is
70,605 bytes and `tweakpane`'s is 148,378 bytes (§2), summing to 218,983
bytes — a 564-byte difference from the observed chunk, accounted for by the
scratch module's own few lines of glue code and Vite's chunk wrapper. That
match confirms both libraries' actual code is what landed in that chunk,
not merely the import wiring. The only trace of the two package names in
the main entry
chunk was the *string* naming the chunk file inside the `import(...)` call
itself. This is the same mechanism `boot.ts`'s own comment already
documents for `debug-panel.ts` — "A dynamic import so Vite splits it into
its own chunk: an ordinary visitor downloads neither the panel nor anything
it drags in" — now confirmed to hold for GSAP and Tweakpane specifically,
in this exact build pipeline (Astro + Vite), not merely asserted by
analogy. All of the experiment's changes (the two added dependencies, the
scratch module, and the `boot.ts` edit) were reverted with `git checkout`
and `pnpm remove` immediately after the build; `git status` confirmed a
clean tree before this research file's own changes were committed. Nothing
from this experiment is part of this research file's deliverable or
committed anywhere.

### 7.3 GSDevTools vs Tweakpane as the timeline scrubber

**Real overlap, not full duplication.** GSDevTools is GSAP-specific: it
reads a `Timeline`'s own internal state and gives play/pause/scrub/speed
controls, keyboard shortcuts, and labelled markers, ships inside the `gsap`
package itself (`gsap/GSDevTools` — confirmed present in the unpacked
`gsap@3.15.0` tarball, no separate install), and measures at **≈22.7 KB
gzip** (measured the same way as CustomEase above, from the same tarball).
Tweakpane is general-purpose: it can drive *anything* bindable to a plain
object, including a GSAP timeline's `progress`, but also every other knob
`shelf-settings.ts` exposes (colours, lighting, wood species, and — per the
owner's standing goal — eventually the whole `?debug` panel).

**Both would genuinely be worth having if GSAP is adopted, for different
jobs**: GSDevTools as the timeline scrubber (it already knows about labels,
markers, and keyboard shortcuts a hand-wired Tweakpane slider would have to
reinvent), Tweakpane as the surface for everything that is *not* the
timeline transport — the `cubicbezier` easing blades feeding `CustomEase`
(§7.2), and, per the owner's separate long-standing goal, eventually every
other shelf setting. Using both is not redundant the way two timeline
scrubbers side-by-side would be; it is GSAP's own dev tool for GSAP-specific
transport controls, plus a general control surface for everything else,
including feeding GSAP.

**If the goal were purely "the smallest surface", GSDevTools alone would
be enough for the timeline transport** (no Tweakpane needed for scrubbing
specifically) — but the owner's standing want for a standardised
Tweakpane-based panel is an independent goal this map does not own the
decision on, and both instruments compose without conflict if GSAP is
adopted.

### 7.4 Tweakpane driving `AnimationMixer` instead of GSAP

The same Tweakpane integration pattern from §7.2 applies unchanged: a
slider bound to the mixer, with an `onChange` callback that calls
`mixer.setTime(value)` — confirmed as a single method that "sets the global
mixer to a specific time and updates the animation accordingly" (§7.1,
[threejs.org — AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)).
This is exactly as simple to wire as `timeline.progress(value)` — one call
either way, once `setTime()` rather than the lower-level
`action.time`/`mixer.update()` pair is used.

**What this shows the owner directly**: GSAP does not buy anything
`AnimationMixer` cannot do for scrubbing or reverse (§7.1) — the
Tweakpane-plus-slider experience is functionally identical either way. The
difference GSAP buys is entirely in *authoring* the keyframes in the first
place (`gsap.to(mesh.position, {...})` vs constructing keyframe-track
objects, §7.1) and in the free GSDevTools transport UI (§7.3), not in what
a Tweakpane dev panel can expose once the animation exists.

### 7.5 What the panel-migration map would want to know

- Neither GSAP nor `AnimationMixer` forces a Tweakpane decision — both wire
  into a Tweakpane slider identically (§7.2, §7.4), so adopting GSAP does
  not make the eventual Tweakpane migration any easier or harder than
  adopting `AnimationMixer` would.
- The `@tweakpane/plugin-essentials` `cubicbezier` blade (§4) is the one
  piece of Tweakpane's ecosystem this feature specifically wants, whichever
  animation engine is chosen, because it is the only visual easing-curve
  editor in the Tweakpane plugin ecosystem found in this research.
- The dev-only, zero-production-bytes mechanism is proven for `gsap` +
  `tweakpane` together in this exact build pipeline (§7.2) — the panel
  migration map can treat that as settled rather than re-verifying it,
  provided the same `import()`-behind-`?debug` pattern is kept.
- If GSAP is adopted for this feature, `gsap/GSDevTools` is effectively
  "free" to add alongside Tweakpane (it ships in the same package already
  paid for in bytes, §7.3) and covers timeline transport Tweakpane would
  otherwise have to reinvent.

## 8. Sources

- [threejs.org — AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html) (`.setTime()`)
- [threejs.org — AnimationAction](https://threejs.org/docs/pages/AnimationAction.html) (`.time`, `.timeScale`, `.crossFadeTo()`, `.stop()`, `.play()`)
- [gsap.com/docs/v3/GSAP/Timeline](https://gsap.com/docs/v3/GSAP/Timeline/) (reverse, seek, progress)
- [gsap.com/docs/v3/GSAP/gsap.to()](https://gsap.com/docs/v3/GSAP/gsap.to%28%29/) (default `overwrite: false`)
- [gsap.com/docs/v3/Eases/CustomEase](https://gsap.com/docs/v3/Eases/CustomEase/) (cubic-bezier control-point strings)
- [gsap.com/docs/v3/Plugins/GSDevTools](https://gsap.com/docs/v3/Plugins/GSDevTools/)
- [gsap.com/standard-license](https://gsap.com/standard-license) (the licence text itself — "Competitive Products", "Prohibited Uses", proprietary-notices and reverse-engineering clauses)
- `npm pack gsap@3.15.0` unpacked and measured directly (`gzip -c` on
  `dist/CustomEase.min.js` and `dist/GSDevTools.min.js`), run 2026-09-22
- [github.com/advisories?query=three.js](https://github.com/advisories?query=three.js) ([GHSA-fq6p-x6j3-cmmq](https://github.com/advisories/GHSA-fq6p-x6j3-cmmq), and a withdrawn GHSA-7vvq-7r29-5vg3)
- Uncommitted, fully-reverted working-tree changes on this research branch
  (temporary `gsap`/`tweakpane` devDependencies, a scratch dynamic-import
  module wired into `packages/site/src/shelf/boot.ts`'s existing `?debug`
  gate), built with `pnpm build` on 2026-09-22 — inspected
  `packages/site/dist/_astro/*.js` chunk contents directly
- `packages/site/src/shelf/boot.ts` (this repo — the existing dynamic-import
  pattern for `debug-panel.ts`, and its own comment on why: "A dynamic
  import so Vite splits it into its own chunk")
- [theatrejs.com — Getting started with Three.js](https://www.theatrejs.com/docs/0.5/getting-started/with-three-js) (production export pattern)
- [theatrejs.com — @theatre/studio API](https://www.theatrejs.com/docs/latest/api/studio)
- [theatrejs.com — @theatre/core API](https://www.theatrejs.com/docs/latest/api/core)
- [npmjs.com/package/@theatre/studio](https://www.npmjs.com/package/@theatre/studio), [npmjs.com/package/@theatre/core](https://www.npmjs.com/package/@theatre/core)
- `npm view @theatre/core dependencies license time --json`, run 2026-09-22
- [github.com/theatre-js/theatre/issues/504](https://github.com/theatre-js/theatre/issues/504)
- Bundlephobia API, `bundlephobia.com/api/size?package=@theatre/core@0.7.2`, run 2026-09-22
- [gsap.com/licensing](https://gsap.com/licensing/)
- `npm view gsap dependencies license version time --json`, run 2026-09-22
- Bundlephobia API, `bundlephobia.com/api/size?package=gsap@3.15.0`, run 2026-09-22
- [github.com/advisories/GHSA-6g8v-hpgw-h2v7](https://github.com/advisories/GHSA-6g8v-hpgw-h2v7) (CVE-2020-28478, gsap prototype pollution, fixed 3.6.0)
- [github.com/advisories?query=gsap](https://github.com/advisories?query=gsap)
- [npmjs.com/package/@tweenjs/tween.js](https://www.npmjs.com/package/@tweenjs/tween.js)
- `npm view @tweenjs/tween.js dependencies license time --json`, run 2026-09-22
- Bundlephobia API, `bundlephobia.com/api/size?package=@tweenjs/tween.js@25.0.0`, run 2026-09-22
- [github.com/advisories?query=tween.js](https://github.com/advisories?query=tween.js)
- [motion.dev/docs/quick-start](https://motion.dev/docs/quick-start)
- `npm view motion dependencies license time --json`, run 2026-09-22
- `npm view motion@13.4.1 dependencies --json`, run 2026-09-22 (shows `framer-motion` as a direct dependency)
- Bundlephobia API, `bundlephobia.com/api/size?package=motion@13.4.1`, run 2026-09-22
- [github.com/advisories?query=framer-motion](https://github.com/advisories?query=framer-motion)
- [animejs.com/documentation/timeline](https://animejs.com/documentation/timeline)
- `npm view animejs dependencies license time --json`, run 2026-09-22
- Bundlephobia API, `bundlephobia.com/api/size?package=animejs@4.5.0`, run 2026-09-22
- [github.com/advisories?query=animejs](https://github.com/advisories?query=animejs)
- [npmjs.com/package/tweakpane](https://www.npmjs.com/package/tweakpane), `npm view tweakpane dependencies license time --json`, run 2026-09-22
- Bundlephobia API, `bundlephobia.com/api/size?package=tweakpane@4.0.5`, run 2026-09-22
- [tweakpane.github.io/docs/getting-started](https://tweakpane.github.io/docs/getting-started/) (ES module format, no framework dependency)
- [github.com/tweakpane/plugin-essentials](https://github.com/tweakpane/plugin-essentials), `npm view @tweakpane/plugin-essentials peerDependencies dependencies license time --json`, run 2026-09-22 (cubicbezier blade)
- Bundlephobia API, `bundlephobia.com/api/size?package=@tweakpane/plugin-essentials@0.2.1`, run 2026-09-22
- [github.com/tweakpane/plugin-cubic-bezier](https://github.com/tweakpane/plugin-cubic-bezier) (archived 2021-06-16, superseded by plugin-essentials)
- [npmjs.com/package/lil-gui](https://www.npmjs.com/package/lil-gui), `npm view lil-gui dependencies license time --json`, run 2026-09-22
- Bundlephobia API, `bundlephobia.com/api/size?package=lil-gui@0.21.0`, run 2026-09-22
- [github.com/advisories?query=tweakpane](https://github.com/advisories?query=tweakpane)
- `docs/spec/supply-chain.md` (this repo)
- `docs/shelf-inspectors.md` (this repo)
