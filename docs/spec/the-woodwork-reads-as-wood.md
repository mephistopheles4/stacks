# The woodwork reads as wood — rosewood, a drawn fibre, and per-member variation

The output of [Map: the woodwork reads as wood](https://github.com/mephistopheles4/stacks/issues/280)
— nine closed decision tickets, assembled into something an implementation
session can execute **without reopening any of them**.

**This file is deliberately thin.** Every verdict below was reached on a ticket,
with its measurements, its counter-arguments and its corrections in the
resolution comment. Restating them here would put one decision in two places,
which is what [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)
exists to prevent. So §2 is a table of verdicts that **links** rather than
retells, and the rest carries the four things no single ticket holds: the build
order, the gate roster, the contract edits, and the residuals.

⚠️ **The prose spec is on the tracker, not here.** [#300](https://github.com/mephistopheles4/stacks/issues/300)
carries the problem statement, the user stories, the seams and the testing
decisions in full; the six implementation tickets are its children. This file is
the index that survives when a branch does not.

⚠️ **This map carried execution, which is an override.** Wayfinder's default is
plan-don't-do; the owner chose the shape where the map ends with the thing built.
So unlike the four specs beside it, this one is finished by a **rendered
bookcase**, not by a document.

---

## 1. What ships

| | Value | Chosen on |
| --- | --- | --- |
| **Woodwork sheet** | Poly Haven `rosewood_veneer1`, diffuse at 1024, laid at its true 7.68 world units | [#284](https://github.com/mephistopheles4/stacks/issues/284) |
| **Woodwork relief** | a procedurally **drawn** fibre normal map, period 0.5 world units, `normalScale` 0.5 | [#284](https://github.com/mephistopheles4/stacks/issues/284) |
| **Grain direction** | every member along its own long axis; the backboard vertical | [#285](https://github.com/mephistopheles4/stacks/issues/285) |
| **Per-member variation** | offset, mirror, per-axis scale, ±10% tint, ~3.4° runout, drawn fresh per load | [#287](https://github.com/mephistopheles4/stacks/issues/287) |
| **Backboard sheet** | Poly Haven `dark_wood`, diffuse at 512, the drawn fibre turned to run with its grain | [#297](https://github.com/mephistopheles4/stacks/issues/297) |
| **Forced seed** | `?woodSeed=<token>`, no default, never in `?tune=` | [#298](https://github.com/mephistopheles4/stacks/issues/298) |

**Cost, measured rather than predicted**: +3 textures, **+0 draw calls**, about
**320 KB** on the wire — rosewood's figure at 1024 is 266.5 KB, `dark_wood`'s at
512 is 53.2 KB, and both fibres are procedural and free.

⚠️ **No frame-time measurement exists for any of it.** Every figure across the
map is a *count*, and none is a demonstration that anything is slow. Nothing was
rendered on a phone, and [`docs/gates.md`](../gates.md) is explicit that the
mobile crash risk is gated by nothing.

---

## 2. The verdicts, and where each lives

| Verdict | Ticket |
| --- | --- |
| **No framing judges the woodwork** — the owner drives a live build. The baseline is the empty bookcase at four level rungs, its populated twin at identical cameras, and the differ every arm was measured with | [#282](https://github.com/mephistopheles4/stacks/issues/282) |
| **Koa's colour is reachable by pigment and its figure is not reachable at all** — anisotropic specular struck on the physics, not deferred | [#286](https://github.com/mephistopheles4/stacks/issues/286) |
| **The furniture is a bookcase**; its members are the plank, the upright and the backboard, and one level of it is a row | [#283](https://github.com/mephistopheles4/stacks/issues/283) |
| **A committed CC0 file, not a browser bake**, behind a species menu with a flat mean-matched entry. **An ADR is owed when the treatment lands** | [#281](https://github.com/mephistopheles4/stacks/issues/281) |
| **Pigment carries it**, and the only relief that works is **drawn** rather than photographed — a veneer's own normal map is a measured 0.000% at every rung, on two sheets | [#284](https://github.com/mephistopheles4/stacks/issues/284) |
| **Every member carries the grain along its own long axis**; the backboard takes an image of its own, running vertically | [#285](https://github.com/mephistopheles4/stacks/issues/285) |
| **Planks vary and a plank has no identity** — one page load only, one image re-cut, no second sheet | [#287](https://github.com/mephistopheles4/stacks/issues/287) |
| **`dark_wood` at 512** — the darkness constraint leaves one candidate of 41, and a sheet's grain direction is measured rather than stated | [#297](https://github.com/mephistopheles4/stacks/issues/297) |
| **`?woodSeed=` pins the root**, absent means fresh dice, and it is a flat spelling in `shelf-url.ts` rather than a setting | [#298](https://github.com/mephistopheles4/stacks/issues/298) |

---

## 3. Build order

**Six implementation tickets**, a linear chain — and then the map's own
destination ticket, which is why the table below has seven rows.

Each ticket blocks the next, so **exactly one is takeable at a time**. That is
not an accident of the wiring: tickets 2–6 are one feature in one module, and
every one of them edits `buildShelf`, the `materials` block and the woodwork
module. This is not a fan-out and must not be run as one.

| | Ticket | Blocked by |
| --- | --- | --- |
| 1 | [The bookcase stops flickering](https://github.com/mephistopheles4/stacks/issues/301) | — |
| 2 | [The woodwork is rosewood](https://github.com/mephistopheles4/stacks/issues/302) | 1 |
| 3 | [A drawn fibre, and a knob to dial it](https://github.com/mephistopheles4/stacks/issues/303) | 2 |
| 4 | [The backboard takes its own sheet](https://github.com/mephistopheles4/stacks/issues/304) | 3 |
| 5 | [No two members alike, and a seed the harness can force](https://github.com/mephistopheles4/stacks/issues/305) | 4 |
| 6 | [The species menu, lazy and honest](https://github.com/mephistopheles4/stacks/issues/306) | 5 |
| 7 | [The ADR, the screenshot and the merge](https://github.com/mephistopheles4/stacks/issues/299) | 1–6 |

**Ticket 1 shares no source file with the rest** and is the one slice safe to run
alongside them. It also fixes something broken on `main` today — the backboard's
flicker — so it lands as its own pull request rather than inside a long-lived
branch, which is the only shape where it is verified by real CI. ⚠️ **Tickets 2–6
must not reach a deploy ahead of it**: a texture does not cause the depth-buffer
tie, it reveals it.

**Ticket 7 is the map's own destination ticket**, and it closes when the
treatment is on `main` with its screenshot committed.

---

## 4. The gate roster

**Four rows**, numbered against [`docs/gates.md`](../gates.md)'s tip **at write
time**. ⚠️ **Never pre-allocate a number** — a row number is a fact about when
something landed, not a name, and this folder's own README records four register
corrections from a rollout that pre-allocated and was overtaken.

| Row | What it asserts | Lands with |
| --- | --- | --- |
| **coplanar faces** | The bookcase has no coplanar overlapping face pair, computed from the case's own constants: 46 before the inset, 0 after | ticket 1 |
| **sheet size** | No file under the site's public wood directory exceeds its long-edge and byte caps | ticket 2 |
| **one sheet by default** | Default settings resolve to exactly one **woodwork** sheet URL — the species menu's other entries load only on selection | ticket 6 |
| **resolved configuration** | The configuration `applySettings` reports is the one it resolved, and an unrecognised species is refused rather than silently defaulted | ticket 6 |

**Why the last row exists, in one line each.** #284's resolution control built
each URL as a base plus a per-arm tail, so `woodRes=1024&woodRes=512` arrived and
`URLSearchParams.get` returned the first — the arm meant to render 512 rendered
1024 and reported a perfect zero at every rung. #298's `woodVary` resolved an
*absent* parameter to `0` against its own documented default of `1`, having
disarmed the variation in every render its branch took. #297's fibre was bound at
90° to its figure and every whole-frame number sat in the normal range.
**A query string is an assumption until something states what came out of it**,
and unlike the aesthetics that is machine-checkable.

⚠️ **The row asserts against shipped code, not the render harness** — which is
only possible because the species knob ships. A permanent read-back convention
for the harness is a separate effort.

⚠️ **The "one sheet by default" row has teeth only because the species menu
ships.** With a single hard-coded sheet it would assert nothing.

⚠️ **It counts the woodwork's sheet, not the shelf's, and the difference is a
way to write the gate wrong.** A default page loads **two** images — the
woodwork's and the backboard's — because §5 makes the backboard's a constant
that is always fetched, so a row counting every wood asset would read 2 and go
red on a correct page. What is being asserted is that the *menu* costs a visitor
nothing: one species sheet, not four.

---

## 5. Contract edits

**Two new `ShelfSettings` knobs**, both on `materials`, both reaching
`applySettings` with an honest `ApplyReport` and `?tune=` via `shelf-url.ts` —
the map's standing rule that **a control must not lie**.

- **`materials.woodSpecies`** — the *woodwork's* sheet. Roster: `rosewood`
  (default), `sapele`, `flat`. ⚠️ **Three entries where #281 settled four**: only
  two species were ever downloaded and rendered, and a third means committing a
  sheet nobody has looked at. Going back to four is a download and a render, not
  a code change. It does **not** govern the backboard, whose sheet is a constant.
- **`materials.woodFibre`** — the drawn fibre's `normalScale`, default 0.5.
  `materials.pageStriation`'s twin: same channel, same procedural provenance,
  same reason for living in `materials`. **Zero short-circuits to no map bound**.

**Two existing knobs change meaning.** `materials.wood` and `materials.woodDark`
become **the colour their surface shows before its sheet decodes, and if it never
does** — a diffuse map multiplies `color`, so `color` switches to white inside
the load callback and starts at the sheet's mean-matched hex. On success the
frame is byte-identical to what was judged; on a failed load a visitor gets
#284's rendered-and-accepted flat arm rather than a white bookcase. Their
defaults move accordingly.

**Three numbers are constants and are not dialled**: the map's resolution (a
property of each sheet, because `resolution / unitsPerTile` is what the eye
reads and the two are coupled), the fibre's period, and each sheet's world size.

**One instrument, not a setting**: `?woodSeed=<token>`, a flat spelling beside
`?solo` and `?debug` in `shelf-url.ts`, with **no default** and **never in
`?tune=`** — see [`../shelf-inspectors.md`](../shelf-inspectors.md).

---

## 6. The refusals

Each was proposed inside this map, measured, and struck. They return only with
new evidence.

- **`woodTile`** — laying a sheet smaller than life. Rejected **by eye, twice**:
  it buys texel density by bringing the repetition back, and repetition is the
  complaint. Both sheets tile near-seamlessly, so what was visible was
  repetition and not a seam.
- **A veneer's own normal map** — 0.000% above the just-noticeable threshold at
  every rung on two different sheets, proved to be the surface rather than the
  harness by a `normalScale 8` canary at 2.684%.
- **`roughnessMap`** — sapele measured 1.029% and inverted the prior, but Poly
  Haven publishes none for the sheet that won. **A finding without a home.**
- **Anisotropic specular** — chatoyance is subsurface fibre scattering, not
  surface anisotropy; and in this scene the IBL path needs an `envMap` that is
  never set.
- **Koa as a shipped sheet** — about 500 woods across ambientCG and Poly Haven,
  and zero koa. Its figure would need a procedure.
- **A per-plank identity** — the seed read from the books dies on arithmetic:
  the top plank is a **lid** that never holds a book, and an empty vault gives
  three planks and no books at all.
- **Retuning the key light or the bloom** to flatter the grain.
  [ADR-0033](../adr/0033-painters-follow-the-light.md) ties the painted shadows
  to the key light.

---

## 7. Residuals

- **Nothing has rendered a case that grows.** Every render under #280 was of a
  four-row case. An upright's height changes with the vault while a plank's
  length does not, and the backboard is wider than tall at 2 and 3 rows and
  taller than wide from 4 on — which is why #285 **states** its grain direction
  rather than deriving it. One render at 2 rows and one at 6 belong to ticket 7.
- **The ADR is owed**, per #281, and has to carry: why sapele when the request
  was koa; **why rosewood when the choice was sapele**; that species and
  resolution are coupled; and that a photographed veneer's normal map is a
  measured zero while a drawn fibre is not.
- **Two defects sit on the prototype branches** and must not survive the
  reconciliation. ⚠️ **`prototype/297-backboard-sheet` and
  `prototype/298-wood-seed` are siblings off `284`, not a stack**, and both
  touched the same prototype file: 298's `woodVary` default fix must survive it,
  and 297's backboard seed key omits the root that every other member's key
  carries.
- **A permanent read-back convention for the render harness** — worth having,
  and it asserts against branch code that never merges, so it sits **outside
  this map**. ⚠️ **Not yet raised**, so there is no number to cite here, and
  §4's rule against citing an identifier that does not exist applies to a
  follow-up exactly as it applies to a gate row.
- **The mobile risk is gated by nothing**, and this rollout does not close that.
  The first wall is decoded texture memory, which `cover-budget.ts` already
  documents at somewhere north of eighty books.
