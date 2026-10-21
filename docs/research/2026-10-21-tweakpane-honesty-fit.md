# Tweakpane's fit for the tuning panel's honesty behaviours

Research for [#487](https://github.com/mephistopheles4/stacks/issues/487), on the
map [#486](https://github.com/mephistopheles4/stacks/issues/486) for
[#485](https://github.com/mephistopheles4/stacks/issues/485). Nothing here is
built; this is the evidence the build tickets are cut from.

**The question:** for each behaviour `packages/site/src/shelf/debug-panel.ts`
has today, is there a Tweakpane 4.0.5 way to build it with
`@tweakpane/plugin-essentials` 0.2.1 through the public API, does it need a
custom plugin, or can it only be done by patching Tweakpane's DOM, which
ADR-0104 forbids?

**Sources.** The installed packages were read as source: `tweakpane/dist/tweakpane.js`
and `dist/types/`, and `@tweakpane/plugin-essentials/dist/`. Line numbers below
are in `tweakpane/dist/tweakpane.js` 4.0.5. Also read:

- the official docs at tweakpane.github.io: `docs/misc/`, `docs/monitor-bindings/`
  and `docs/plugins/dev/`;
- `tweakpane/plugin-template` at `main`, commit `aa2a868` (2023-08-12): `package.json`,
  `README.md`, `src/index.ts`, `src/plugin.ts` and `rollup.config.js`;
- `npm view @tweakpane/core`.

Every behaviour marked **spike** was run in headless Chrome against the installed
bundle by `spikes/487-tweakpane-honesty/spike.mjs`. That spike is on this branch
only. Nothing gates it, and it is never merged.

## The answer in one line

Every behaviour can be built on the public API. **None needs DOM patching.** A
custom plugin is needed only where the public API's answer is too weak: the lamp
as a coloured dot instead of label text, and the stray list entry greyed out.
**One finding changes the build more than the table does:** a constrained
binding silently rewrites an out-of-range or off-list value on the first
`refresh()`. That is #300's "silently defaulted", done by Tweakpane itself. The
panel has to guard against it, and how is set out below.

## The table

| Behaviour | Route | How |
| --- | --- | --- |
| **Lamp on each row** (on / off / pending) | **Public API**, through the label text. A **custom plugin** only if it must be a drawn dot | `binding.label = '🟢 intensity'` (and `🔴`, `🟠`), set again after every apply. `BindingApi.label` has a setter (l. 893–898) that re-renders the label text node (`LabelView`, l. 1199–1222). **Spike:** the label became `🟢 intensity · live`, then `🟠 intensity · rebuild`. The emoji colours are the platform's, not the panel's `#5ee08a` / `#e05a5a` / `#e8b64c`. A blade cannot sit beside a binding in one row, so a drawn dot means a custom **input** plugin per value type the panel binds: number (slider), boolean, number-as-colour and string list. Each wraps core's own controller and adds a dot element. That is four `createPlugin` registrations sharing one lamp view. Rough size: 150–250 lines plus a `.scss`, and it needs `@tweakpane/core` at runtime (see "What a custom plugin costs") |
| **Live / rebuild / reload class label** | **Public API**, label text | It goes in the same label string, e.g. `🟠 cover gloss · rebuild`. `createLabelNode` splits on `\n` into `<br>` (l. 1186–1198), so a second line also works. Today's hover help (`slot.title`) has **no public equivalent**: `BladeApi` exposes no `title` or tooltip. Hover help is also dead on touch, which is where the panel is used. So the class goes in visible text |
| **Disabled stray option** for a value the list does not offer (#300) | **Public API** for the honest part. **Custom plugin** for the greyed-out look | A plain list binding **cannot** do this, and is worse than a blank box. **Spike:** with `{ sheet: 'walnut' }` and options rosewood / sapele / flat, the select first rendered `selectedIndex -1` (blank). The first `pane.refresh()` then **rewrote the object to `rosewood` and fired the change handler with `rosewood`**. Mechanism: the `ComplexValue` constructor does not constrain (l. 160–167). `fetch()` assigns through `setRawValue`, which applies `ListConstraint.constrain`, and that returns `opts[0].value` for an unmatched value (l. 2956–2965). `InputBindingValue.onValueChange_` then `push()`es it into the bound object (l. 962–965). The public fix: `ListInputBindingApi.options` has a setter (l. 2842–2849), and the list controller shares its options `Value` with the constraint (`lc.values.value('options')`, l. 6634–6637). So `binding.options = [...WOOD_SPECIES, { text: 'walnut — not on the list', value: 'walnut' }]` makes the stray **legal and shown**. Set it before any refresh, and drop it after a real pick. **Spike:** shown as `walnut — not on the list`, the object was left as `walnut`, no change fired. After picking rosewood and resetting the options, the object was `rosewood` with 3 options. What is lost is `disabled`: `ListView` writes only `textContent` per option (l. 3021–3027), and a list item is `{ text, value }`. The stray stays selectable, but only while it is already the value, so picking it is a no-op (`setRawValue` returns on equal, l. 190–192). Greying it needs a custom string-list input plugin. Rough size: about 80 lines, the list controller plus `option.disabled` |
| **Disabled with a visible reason** (exposure, antialias) | **Public API** | `binding.disabled = true` plus `binding.label = 'exposure\npick a tone mapping first'`. **Spike:** the row gained `tp-v-disabled`, the `<input>` was disabled, and the label rendered `exposure<br>pick a tone mapping first`. Tweakpane's CSS sets `pointer-events: none` on `.tp-v-disabled` (in the default plugin CSS, l. 7838), so a hover title on a disabled row **could never show**, with or without patching. The reason has to be visible text |
| **…including the shadows group** | **Public API** | `FolderApi` is a `BladeApi`, so `folder.disabled = true` disables every child, and `folder.title` (setter, l. 2200–2205) can carry the reason. **Spike:** the child's input was disabled, its row had `tp-v-disabled`, the fold button was disabled, and the title read `shadow map — off: real-time shadows are off`. ⚠️ **The `real-time` toggle must sit outside the folder it disables**, or the panel locks itself. ⚠️ **A child's own `disabled` getter still reads `false`** when it is disabled through its parent (spike: `childDisabled: false`). A check must read the effective state, the row's `tp-v-disabled` class or the input's `disabled`, not `binding.disabled` |
| **`ApplyReport` read-back with `resolved`, written back before `pane.refresh()`** | **Public API** | Bind controls to a mutable mirror object. On a change, call `handle.applySettings`, write the **applied** settings back into the mirror, then `pane.refresh()`. **Spike:** `refresh()` after a programmatic write **fires the change handler** (`{ value: 2, last: true }`), because `fetch()` goes through `setRawValue` and `BindingApi` re-emits it (l. 919–922). So the panel needs the `reading` guard `pickup-tuner.ts` already has, or `apply` re-enters on every read-back. A second refresh with the same value fired nothing. The report's lines, `resolved` included, go to a readonly multiline string monitor (see "status lines"). The string `report.resolved` that `gates/woodwork-readback.test.ts` reads can stay in the source as it is today |
| **`resync` after a reset** | **Public API** | Reset writes `DEFAULT_SETTINGS` into the mirror and calls `pane.refresh()` once, under the same guard. That one call replaces the per-control `resync` list, since `refresh()` re-reads every binding (docs, misc: "force-update all input/monitor components"). The stray list entries are recomputed in the same pass, before the refresh |
| **Rebuild button shown only when it would do something** | **Public API** | `pane.addButton({ title: 'rebuild shelf to apply' })`, then `button.hidden = report.needsRebuild.length === 0 \|\| onRebuild === undefined`. `BladeApi.hidden` (l. 842–847) adds `tp-v-hidden`, which the CSS sets to `display: none`. **Spike:** class `tp-v-hidden` |
| **Status lines** | **Public API** | `addBinding(status, 'text', { readonly: true, multiline: true, rows: 4, interval: 0 })`, then `pane.refresh()` after each apply. A string monitor's buffer defaults to 1 (l. 7195–7196), so it shows **only the latest value**, with its own `\n`s, not a log. `interval: 0` makes a `ManualTicker` (l. 7171–7175), so it moves only on `refresh()`. **Spike:** `line one\nline two` became `line three` after a refresh. The textarea is a fixed `rows` high and scrolls past that |
| **Copy-JSON** | **Public API** | `addButton({ title: 'copy settings JSON' }).on('click', …)`, and `button.title = 'copied — paste into shelf-settings.ts'` for the 2.5 s confirmation. `ButtonApi.title` has a setter (l. 1483–1489). **Spike:** the title changed |
| **Reset** | **Public API** | A button, as above, then the resync path |
| **fps / draws / textures readout as monitor bindings** | **Public API** (essentials adds a graph if wanted) | One readonly number monitor per figure, bound to an object the 250 ms tick fills from `handle.stats()`. Either `interval: 250`, which polls the object itself, or `interval: 0` plus a `refresh()` from the existing timer. **Spike:** with `interval: 0`, the monitor read `60.00` until a refresh, then `30.00`. A number monitor formats with two decimals. It accepts `format` (`monitor-number`'s parser, l. 6997–6998), so pass `format: (v) => v.toFixed(0)` to keep today's whole numbers. Essentials' `fpsgraph` blade computes its own fps from `begin()` / `end()` calls (essentials dist l. 7845–7878). It would be a second computation that needs a hook into the shelf's frame loop, not a view of `handle.stats().fps`, so it is not the readout. `buffer WxH @ratio` is a string monitor |
| **Collapsed by default at ≤ 700 px** | **Public API** | `new Pane({ title: '…', expanded: window.innerWidth > 700, container })`. `PaneConfig.expanded` and `title` are typed (`pane-config.d.ts`). **Spike:** `pane.expanded === false`, root class `tp-rotv-cpl`. ⚠️ **A title is required**: without one the root has no fold button (`tp-rotv-not` hides `.tp-rotv_b`, l. 7838). Folders take `expanded` per folder too |
| **Woodwork sheet `choice`, compared through `speciesPending`** | **Public API**. It is plain TypeScript | The lamp's `stale(built, now)` comparison is panel logic, not view: `speciesPending(handle.mountedWith.materials.woodSpecies, settings.materials.woodSpecies)` decides `🟠` against `🟢`, then sets `binding.label`. It follows whichever lamp route wins. The list itself is the stray-option row above |

### Behaviours not on the ticket's list that the move must still carry

- **Colour controls** take `{ view: 'color' }` on a number, which hits the
  `input-color-number` plugin (l. 5639). **Spike:** `0x8a5a3c` round-tripped, and
  a refresh fired no change.
- **`base()` and URL writing** are panel logic outside any widget. Nothing in
  Tweakpane touches them.

## The finding that changes the build: constrained bindings rewrite values

The stray-option result is not special to lists. **Every binding with a
constraint does it**:

| Binding | Value held | After one `refresh()` | Change handler saw |
| --- | --- | --- | --- |
| list rosewood / sapele / flat | `walnut` | object rewritten to `rosewood` | `rosewood` |
| slider `min 0, max 8, step 0.05` | `20` | object rewritten to `8` | `8`, then `7.999999999999999` |
| slider `min 0, max 1, step 0.05` | `0.03` | unchanged | nothing |

(**spike**, `sliderConstraint` and `listStray`)

- **Out of range:** `DefiniteRangeConstraint` clamps, and `push()` writes the
  clamp back into the object. The second event, `7.999999999999999` while the
  object reads `8`, was observed and not traced.
- **Off the step grid:** this is safe. `createStepConstraint` takes the
  *initial* value as its origin (l. 782–786, `StepConstraint` l. 352–361), so an
  initial off-grid value is the grid.

A `?tune=` value outside a slider's range is reachable, not hypothetical.
`readTune` in `packages/site/src/shelf/shelf-url.ts` checks `exposure` only for
being a finite number (`tuneRenderer`), and passes `lighting`, `scene` and
`materials` through as opaque records (`tuneSections`). `resolveSettings` in
`shelf-settings.ts` spreads the patch over the base and clamps nothing. So
`?tune={"exposure":5}` reaches a slider whose range is 0.1–3. A guarded handler stops the clamp being *applied*,
but the mirror and the slider would still show `8` while the shelf runs `20`.
**That is the control lying.** The build therefore needs one of these, decided
per control:

1. A slider range that covers everything `resolveSettings` accepts.
2. Validation at parse, so an out-of-range value is refused and reported there,
   as #300 does for species.
3. A stray-style label that says the real value, e.g.
   `intensity\nset to 20 — beyond the slider`.

## What a custom plugin costs

- **It needs `@tweakpane/core` at runtime, not only for types.** `tweakpane`
  exports only `BladeApi`, `ButtonApi`, `FolderApi`, `ListBladeApi`,
  `ListInputBindingApi`, `Pane`, `Semver`, `SeparatorBladeApi`, `SliderBladeApi`,
  `SliderInputBindingApi`, `TabApi`, `TabPageApi`, `TextBladeApi`,
  `TpChangeEvent` and `VERSION` (l. 7852). `createPlugin`, `ValueMap`,
  `ViewProps`, `ClassName` and the controllers a plugin composes are not
  exported. The template imports them from `@tweakpane/core` and bundles core
  into the plugin: rollup aliases `@tweakpane/core` to
  `./node_modules/@tweakpane/core/dist/index.js`, and core is a
  `devDependency` (`^2.0.0-beta.2`). Essentials does the same; it carries
  `new Semver('2.0.0-beta.2')` (essentials dist l. 1439), against tweakpane's
  bundled `2.0.5` (l. 1619).
- **So it adds a dependency** (AGENTS.md: noted in an ADR) and **a third copy of
  core in the lazy chunk.** Vite would tree-shake that copy to what the plugin
  imports, but list and slider controllers pull in much of it. **A ceiling:**
  `tweakpane.min.js`, which is core plus the default plugins, is 30,814 bytes
  at `gzip -9`. Essentials' min file, with its own copy of core, is 30,851. The
  two together (about 62 KB) agree with ADR-0104's 63 KB. So a custom plugin
  adds **at most about 31 KB gzip** to the lazy chunk. Its tree-shaken size was
  not measured.
- **How it is typed.** Adding `@tweakpane/core` gives a plugin real types for
  `InputBindingPlugin`, `createPlugin` and the controllers. The repo's declared
  `Pane` slice in `pickup-tuner.ts` exists because `tweakpane`'s `.d.ts` imports
  `@tweakpane/core` (`dist/types/index.d.ts` l. 1–2), which pnpm's strict layout
  does not expose. With core installed, those imports *may* resolve through
  pnpm's hidden hoist (`node_modules/.pnpm/node_modules` exists in this
  checkout) and make the slice unnecessary. **Unverified.** If they do not, the
  plugin's own files type against core directly and the slice stays for the
  pane. A plugin is handed to `registerPlugin(bundle)`, which the slice already
  declares as `unknown`.
- **Its CSS needs a third placeholder.** `registerPlugin` calls
  `embedStyle(doc, 'plugin-<id>', css)` whenever the bundle has `css`
  (l. 7821–7823). `embedStyle` skips only if `style[data-tp-style=plugin-<id>]`
  already exists (l. 7766–7774). So `pages/index.astro` needs
  `<style data-tp-style="plugin-<id>">` beside the two it seats today, and
  `scripts/lib/tuner-css-plugin.ts` must extract the plugin's CSS into the lazy
  `<link>`. The alternative is a plugin with no `css`, styled through the same
  extracted file. Otherwise the hash-pinned `style-src` refuses the injected
  `<style>`, and G64's styled-pane check catches it.
- **Stability across 4.x.** Registration checks **only the core major**:
  `isCompatible` returns `ver.major === VERSION$1.major` (l. 3755–3760), called
  from `PluginPool.register` (l. 7244–7246). **Spike:** a plugin declaring core
  2.x was accepted, and 3.x threw `Not compatible with plugin …`. Nothing
  promises that core's internals (controller constructors, `ValueMap` shapes)
  stay put inside a major. The plugin-dev docs page says nothing about
  compatibility, and the template's README maps Tweakpane 4.x to its `main`
  branch and nothing finer. The practical risk is low: tweakpane's last release
  is 4.0.5 (2024-11-03) and core's last is 2.0.5 (the same day). A bump would be
  caught by G64 running the real pane, and by nothing else.
- **`instanceof` across copies.** Tweakpane's own string plugin chooses
  `ListInputBindingApi` with `instanceof ListController` (l. 6655). A
  custom-plugin controller from another core copy will not match. That is
  harmless, since a custom plugin returns its own API, but it means a custom
  list does **not** get the public `options` setter unless the plugin provides one.

## What each route leaves for the build tickets

- **All public API, lamps as emoji label text.** No new dependency, no CSS
  route change, no chunk growth. The cost is the look: platform emoji, not the
  panel's colours, and a stray entry that is labelled but not greyed.
- **Public API plus one custom plugin family** (lamped inputs, and a list with
  disabled options). This keeps today's look. The cost is `@tweakpane/core` as a
  dependency (with an ADR), a third core copy in the lazy chunk, a third style
  placeholder plus extraction, and internals that can move within core 2.x.

Neither route needs DOM patching. Choosing between them is the owner's call,
and it belongs to the decision tickets, not here.

**Checks.** The site's vitest runs with `environment: 'node'`, so a check on any
of the rows above runs either in `smoke:render`'s Chrome, as this spike did, or
against panel logic factored out of the view (the label text, the options list
and the button's `hidden` as pure functions of `settings`, `mountedWith` and the
report). Where the checks live is #488's question.

## Could not verify

- **The tree-shaken size a custom plugin adds to the lazy chunk.** Only the
  ceiling (about 31 KB gzip) was measured. The real figure needs
  `@tweakpane/core` installed and a build. It was not installed here, so no
  package was downloaded.
- **Whether installing `@tweakpane/core` makes `tweakpane`'s own `.d.ts`
  resolve** under this repo's pnpm settings, which would retire the declared
  `Pane` slice.
- **How the emoji lamps render on the Pixel.** Only headless Chrome on Windows
  was checked.
- **Whether `@tweakpane/core` 2.0.5 passes the repo's trust policy.** It clears
  the seven-day `minimumReleaseAge` by about two years. The `no-downgrade`
  provenance rule in `pnpm-workspace.yaml` was not checked.
- **API stability within core 2.x** rests on reading 2.0.5 only. No earlier 2.x
  build was diffed.
