# Tuning the pickup animation — six options compared, for #370

Started as a Theatre.js-only research pass and was broadened at the owner's
request into a comparison across every reasonable way to tune a three-stage
pickup move (slide out, turn, open — roughly 6-12 keyframes) that the
`?debug` panel could drive. This file is self-contained; there is no earlier
file to cross-reference.

## 1. Verdict / recommendation

**Recommended: hand-roll a small keyframe/timeline structure inside
`shelf-settings.ts` and `debug-panel.ts`** — a plain array of
`{ tMs, pose }` keyframes, a lerp, and 2-4 hardcoded cubic-bezier easing
constants. Zero new dependencies, zero licence review, zero maintenance-status
risk, and it already follows the `ShelfSettings`/`ApplyReport` pattern this
repo uses everywhere else. For 6-12 keyframes across three stages, no library
below earns its dependency cost.

**Runner-up, if programmatic tweening ever outgrows hand-rolling:
`@tweenjs/tween.js`.** Zero dependencies, plain MIT licence, no advisories,
and it does exactly one thing (interpolate values over time) without an
opinion about a visual editor, a licence a Legal team has to read, or a
plugin ecosystem gated behind an account. GSAP is the strongest *capability*
option (free now, has a real scrubbable timeline via GSDevTools) but ships a
non-SPDX proprietary licence with a no-compete clause — worth knowing about,
not worth taking on for this feature.

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
plugin the main entry point doesn't import). Sources in §7.

| Option | Tuning capability | Visual editor? | Dev-only achievable? | Runtime bytes to visitors (min+gzip) | Direct deps | Licence | Last release | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Theatre.js** (`@theatre/core` + `@theatre/studio`) | Full timeline: props, sequences, per-segment easing | Yes — `@theatre/studio`, a real scrubbable curve editor | Studio yes (docs say exclude `studio.initialize`/`.extend` from production and pass an exported state JSON to `getProject` instead); **core no** — the exported JSON is state data, not playback code, and interpreting it (interpolating keyframes, driving properties) is `@theatre/core`'s job at runtime, so core cannot be dropped | `@theatre/core` ≈ 31.4 KB gzip | 1 (`@theatre/dataverse`) | **Split**: core Apache-2.0, studio **AGPL-3.0-only** | **0.7.2, 2024-05-19** (stale) | None found |
| **GSAP** (`gsap`) | Full timeline, easing, plugins (MorphSVG, GSDevTools scrubber) | Yes — GSDevTools, a visual scrubber/playback UI, now bundled free | GSDevTools is dev-tooling by nature (not something you'd ship to visitors) but nothing in the docs states a dev-only export path — you'd gate it behind your own `?debug` flag | ≈ 27.3 KB gzip (core import) | **0** | **Proprietary "Standard License"** (not SPDX/OSI) — free for commercial use, but a no-code-competing-tool clause and Webflow retains IP | **3.15.0, 2026-04-13** (~5 months old; releases have landed roughly every few months to a year over the past two years, not weekly) | 1 historical: prototype pollution, **CVE-2020-28478**, fixed in 3.6.0 (2021) — current versions unaffected |
| **`@tweenjs/tween.js`** | Programmatic tweening only — value interpolation + easing curves, chainable `.chain()`/`.delay()` for sequencing | **No** | N/A (no editor exists) | ≈ 3.7 KB gzip | **0** | **MIT** | 25.0.0, 2024-07-26 | None found |
| **Motion** (`motion`, formerly Framer Motion) | Vanilla `animate()`/`scroll()` API, keyframes and sequences documented | Only via a separate commercial add-on ("Motion AI Kit" — inline bezier editing); no bundled free editor | The AI Kit is a separate paid product, not part of the `motion` runtime — no dev-only export path documented | ≈ 47.7 KB gzip | **2** (`tslib`, and — surprisingly — `framer-motion` itself as a dependency) | **MIT** | 13.4.1, **2026-09-22** (released today; very active) | None found |
| **anime.js v4** (`animejs`) | `createTimeline()` — labels, relative offsets (`'<-=500'`), full rewrite in v4 | No bundled visual timeline editor; docs mention an "easing functions editor" reference page, not a shipped GUI | Timeline is a subpath import (`animejs/timeline`) — modular, but no separate dev/prod split documented beyond normal tree-shaking | ≈ 40.3 KB gzip | **0** | **MIT** | 4.5.0, 2026-06-22 (v5 beta already out, 2026-08-17 — active rewrite cadence) | None found |
| **Hand-rolled timeline** | Full — whatever you build (array of keyframes + lerp + 2-4 bezier constants), matches the 6-12 keyframe / 3-stage need exactly | No editor, but scrubbing is trivial to add to the existing `?debug` panel (a range input driving `tMs`) | Trivially — it's already inside the lazy-loaded `debug-panel.ts` | **0** (no new package) | **0** | N/A — this repo's own code | N/A | N/A |

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
the same 2025 licence change. It requires a free GSAP account per the docs;
nothing in the docs describes a dedicated "exclude from production" build
flag, so keeping it dev-only would mean the same pattern this repo already
uses for `?debug`: import it lazily, only behind the query flag.

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

1. **Hand-rolled** — zero dependencies, zero licence surface, zero advisory
   surface. Wins the axis the owner named as primary, trivially.
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
   no-compete clause and Webflow-retained IP. That's a real thing for a
   licence-conscious supply-chain policy to note even though the practical
   commercial-use risk to a reading tracker is low. One historical advisory,
   long fixed.
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

## 7. Sources

- [theatrejs.com — Getting started with Three.js](https://www.theatrejs.com/docs/0.5/getting-started/with-three-js) (production export pattern)
- [theatrejs.com — @theatre/studio API](https://www.theatrejs.com/docs/latest/api/studio)
- [theatrejs.com — @theatre/core API](https://www.theatrejs.com/docs/latest/api/core)
- [npmjs.com/package/@theatre/studio](https://www.npmjs.com/package/@theatre/studio), [npmjs.com/package/@theatre/core](https://www.npmjs.com/package/@theatre/core)
- `npm view @theatre/core dependencies license time --json`, run 2026-09-22
- [github.com/theatre-js/theatre/issues/504](https://github.com/theatre-js/theatre/issues/504)
- Bundlephobia API, `bundlephobia.com/api/size?package=@theatre/core@0.7.2`, run 2026-09-22
- [gsap.com/licensing](https://gsap.com/licensing/)
- [gsap.com/docs/v3/Plugins/GSDevTools](https://gsap.com/docs/v3/Plugins/GSDevTools/)
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
