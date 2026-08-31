# The species menu, lazy and honest — and the read-back this map earned three times

**2026-08-30** — [#306](https://github.com/mephistopheles4/stacks/issues/306),
the last of six implementation tickets under
[`docs/spec/the-woodwork-reads-as-wood.md`](../spec/the-woodwork-reads-as-wood.md).
Two gate rows: **G53** (`one-sheet`) and **G54** (`woodwork-readback`).

## What landed

`materials.woodSpecies` names the woodwork's sheet. The roster is **every sheet
that has actually been rendered and measured**, plus the comparison entry —
`rosewood`, `sapele`, `flat` — where
[#281](https://github.com/mephistopheles4/stacks/issues/281) settled four. Only
two species were ever downloaded and rendered, so a third or fourth would mean
committing a sheet nobody has looked at, which is the shape of decision this map
refused four times. Going back to four is a download and a render, not a code
change.

One image file was added: sapele's diffuse at 512, taken from
`prototype/284-woodwork-channels` at the blob it was measured on, `297b1a6`.

## Three findings worth carrying forward

**The knob governs the woodwork and cannot move the backboard, so the control is
named for the surface rather than for the material.** The backboard's sheet is a
constant — [#297](https://github.com/mephistopheles4/stacks/issues/297) measured
all 41 veneers Poly Haven publishes and the darkness constraint leaves exactly
one candidate, third-nearest 24.8 luma away. A control labelled *wood species*
would read as governing both surfaces, and half of what it claimed would be
false. It is labelled **woodwork sheet**.

**Species and resolution are coupled, and the coupling reaches further than the
sheet's own pixels.** What the eye reads is `resolution / unitsPerTile`:
rosewood at 1024 over 7.68 world units is 133 texels per world unit, sapele at
512 over 1.6 is 320. That is why there is no resolution knob beside the species
one — it would let a visitor make a choice whose meaning changed under the menu
next to it. ⚠️ **What was nearly missed is that the drawn fibre rides the same
UVs.** `worldSpaceUvs` divides every face's UVs by the sheet's world size and
`fibreTiles` multiplies them back up by it, so a fibre laid by the module's
default constant would have been **4.8× wrong** under sapele — with every
whole-frame number still in the normal range. That is #297's defect exactly, one
surface over, and the thing that caught it was writing the lay down as a field
on the resolution rather than reading it off a constant.

**`flat` is laid by the default sheet, which is what makes it a control rather
than a fourth look.** Its whole job is to separate *a sheet that moved the
grain* from *a sheet that moved the average colour* — sapele's 20.53% of frame
was only 1.32% grain, 94% average colour — and it can only do that with
everything except the diffuse map held constant. It binds no map at all and
shows `materials.wood`, which already defaults to rosewood-at-1024's
mean-matched twin: the fallback arm made permanent, out of machinery that had to
exist anyway for a sheet that never arrives. A second hex would have been a copy
of the knob, and the copy that drifted would be a control that lies.

## The read-back, and why the report grew a fifth category

⚠️ **All four of `ApplyReport`'s categories were transitions, and a transition
cannot describe a configuration that was wrong from the first frame.** `applied`,
`needsRebuild`, `needsReload` and `refused` each answer *what changed* — and not
one of the three defects this row was earned for was ever a change:

- **#284's resolution control.** Every URL was a fixed base plus a per-arm tail,
  so `woodRes=1024&woodRes=512` arrived and `URLSearchParams.get` returns the
  **first**. The arm meant to render 512 rendered 1024 and the pair differenced
  to **0.000% at every rung, worst delta 0** — a perfect zero from an instrument
  nobody had proved.
- **#298's `woodVary`.** `last()` returns `null` for an absent key and
  `Number(null)` is `0` rather than `NaN`, so a `Number.isFinite(raw) && raw >= 0`
  guard **passed on a missing parameter** and resolved to off, against a default
  the same file documented as `1`. Every render that branch took was unvaried.
- **#297's fibre**, bound at 90° to its own figure, passing every whole-frame
  count until somebody took a 3× crop.

So `resolved` answers *what is running*, on every apply, whether or not anything
moved: the species, its sheet or *no map*, **the world size it was laid at**, and
the fibre scale **in force** rather than the one asked for. An unrecognised
species is refused in the report and **not dropped at parse** — which is where
`cover_source`'s drop-on-mismatch rule stops transferring. A note nobody is
watching may drop a bad value; a control somebody just moved may not, because a
dropped value looks exactly like a value that was applied.

The words live in `describeWoodwork`, in the module with no Three.js in it, so
G54 needs no WebGL context. ⚠️ **That is also how the row could have gone
vacuous** — a correct read-back nothing calls reports nothing — so two clauses
read `applyLive` and the panel as text and refuse a body that does not call it
and spread both lists. G51's closing move, on the same file.

## Measured on a live server, not inferred

The laziness claim is asserted in the suite on the pure resolution function,
because G21 (`no-live-network`) records any request the suite makes. It was
**separately** confirmed against a running dev server, since the gate
deliberately cannot:

| Page | `/wood/` requests |
| --- | --- |
| default | `rosewood-diff-1024.jpg`, `darkwood-diff-512.jpg` |
| `?tune=` sapele | `sapele-diff-512.jpg`, `darkwood-diff-512.jpg` |
| `?tune=` flat | `darkwood-diff-512.jpg` |
| panel: select sapele, before rebuild | nothing new |
| panel: after pressing rebuild | `sapele-diff-512.jpg` |

⚠️ **The gate asserts what `resolveWoodwork` returns; that a page fetches
exactly what it resolved is carried by `buildShelf` having one `bindSheet` call
for the woodwork and by nothing else.** A second call added beside it would leave
every clause green. Recorded rather than solved — closing it means a gate that
makes requests, and G21 refuses those.

## One thing left as it is, deliberately

With `?tune={"materials":{"woodSpecies":"walnut"}}` the panel's select renders
**blank**. `walnut` is genuinely the setting, and it is not an option; showing
`rosewood` would be the control claiming a value the settings object does not
hold. The refusal line above it says what happened in full. Left blank as the
honest reading, and named here so the next session finds a decision rather than
an accident.

## Gate rows

- **G53 (`one-sheet`)** — a default page resolves to exactly one woodwork sheet.
  ⚠️ **It asserts nothing without the menu**, which is why it lands with one
  rather than before: with a single hard-coded sheet the guarantee was a
  tautology, and a tautology in that table reads as cover. Observed red by adding
  `SAPELE_SHEET` to `SHIPPED_SHEETS` — the menu's entry wired eagerly, which is
  the change the row exists to refuse.
- **G54 (`woodwork-readback`)** — the resolved configuration is the reported
  configuration. Observed red by replacing the read-back's spread with a
  hard-coded plausible constant.
- **G52 (`sheet-size`) was widened in the same commit.** Its existence clause
  moved from `SHIPPED_SHEETS` to `ALL_SHEETS`: the two are now different sets —
  what a default page fetches against what the module can name — and against the
  first the clause would have stopped covering sapele the moment sapele was
  committed. ⚠️ **A menu is exactly the way a committed file stops being pointed
  at.** Observed red by removing the committed sheet, which the un-widened clause
  would have passed.
