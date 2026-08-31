# ADR-0081 — The woodwork sheet is a menu, and the shelf states what it resolved

**Date:** 2026-08-31
**Status:** accepted
**Ticket:** [#306](https://github.com/mephistopheles4/stacks/issues/306), under [#300](https://github.com/mephistopheles4/stacks/issues/300) and map [#280](https://github.com/mephistopheles4/stacks/issues/280)

## Decision

This record answers the four questions
[ADR-0080](./0080-the-woodwork-is-rosewood-and-its-relief-is-drawn.md) explicitly
left open under *What this record does not decide* — whether the species stays
revisitable from a menu, what belongs in it, how it is fetched, and what it
reports.

1. **The species is a knob and the resolution is not.** `materials.woodSpecies`
   is a named choice, default `rosewood`. There is no resolution knob, ever.
2. **The roster is three: `rosewood`, `sapele`, `flat`** — every sheet that has
   actually been rendered and measured, plus the flat comparison entry.
3. **It is lazy.** A page fetches the sheet it resolved to and no other.
4. **It is rebuild-class**, which is structural rather than chosen.
5. **`ApplyReport` gains a fifth category, `resolved`**, which *states* the
   configuration rather than diffing it, and an unrecognised species is **refused
   in the report** rather than silently defaulted.

## Context

ADR-0080 fixes *what the woodwork is* and is deliberately silent on whether that
choice stays revisitable. Its reasoning rules the **resolution** out as a knob —
what the eye reads is `resolution / unitsPerTile`, so a resolution control would
mean something different under each species beside it — and it names the
asymmetry that leaves the species question open: **a species control means one
thing and carries its own resolution with it.**

That asymmetry is this record's whole foundation, so it is worth stating as a
rule rather than as an observation: **a control may be exposed when its meaning
is independent of the controls beside it, and not otherwise.**

## The knob, and why the resolution rides inside it

Each roster entry carries its own resolution as a property of the sheet, not as a
second dial:

| entry | sheet | resolution | world units | texels per world unit |
| --- | --- | --- | --- | --- |
| `rosewood` | `rosewood_veneer1` | 1024 | 7.68 | 133 |
| `sapele` | `sapele_veneer` | 512 | 1.6 | 320 |
| `flat` | none | — | laid by the default | — |

⚠️ **The coupling reaches further than the sheet's own pixels, and that was
nearly missed.** The drawn fibre rides the same UVs the figure does —
`worldSpaceUvs` divides every face's UVs by the sheet's world size and
`fibreTiles` multiplies them back up by it — so a fibre laid by a single module
constant is **4.8× wrong** under sapele, with every whole-frame number still in
the normal range. That is [#297](https://github.com/mephistopheles4/stacks/issues/297)'s
crossed-fibre defect one surface over. The resolution therefore returns the lay
as a field rather than letting a call site read a constant.

## Three entries, where #281 settled four

[#281](https://github.com/mephistopheles4/stacks/issues/281) settled a
four-species menu. **Only two species were ever downloaded and rendered.** A
third or fourth entry means committing a sheet nobody has looked at, which is the
shape of decision this map refused four times.

⚠️ **Restoring the fourth is a download and a render, not a code change.** The
roster is walked rather than hard-coded — the panel's options, both gate rows and
every spec iterate `WOOD_SPECIES` — so growing it costs one table entry and one
committed file, and the gates below hold that growth to costing a visitor
nothing.

**The knob governs the woodwork only, and the control says so.** The backboard's
sheet is a constant: #297 measured all 41 veneers Poly Haven publishes and the
darkness constraint leaves exactly one candidate, third-nearest 24.8 luma away.
So the panel's control is labelled **woodwork sheet** rather than *wood species*,
because a control named for the material would read as governing both surfaces
and half of that would be false.

### `flat`, and where this diverges from the ticket

`flat` binds no map at all and shows `materials.wood`, which already defaults to
rosewood-at-1024's mean-matched twin — the *fallback arm made permanent*, out of
machinery that had to exist anyway for a sheet that never arrives. It is laid by
the default sheet, so it differs from `rosewood` in the diffuse map and in
nothing else, which is the only way it can separate *a sheet that moved the
grain* from *a sheet that moved the average colour*.

⚠️ **#306 asks for "the **selected sheet's** mean-matched hex", and that phrase
lost its referent.** On the prototype `flat` was an arm *orthogonal* to the
species, so `?woodSpecies=sapele&wood=flat` was a reachable pair and "the
selected sheet" named one. The shipped roster makes `flat` a **peer** of the two
species instead, and a peer has no selected sheet to take a hex from.

The consequence is recorded rather than glossed: **the isolation that originally
caught sapele is not reachable from the shipped menu.** `flat` against `rosewood`
isolates rosewood's grain — the comparison the shipped treatment is judged on.
`flat` against `sapele` moves the average colour *and* the grain together, which
is the confound the entry exists to remove. Separating those two for sapele needs
`?woodSpecies=sapele` beside a `flat` **toggle**, which is the prototype's
two-control shape and not the roster this ticket specified. `SAPELE_SHEET.mean`
is therefore recorded and not read at runtime, so restoring that pairing is a
control change rather than a re-measurement.

## Lazy, and rebuild-class — one fact, not two

**Selecting a species is rebuild-class because `worldSpaceUvs` writes each
member's world-space period into its UVs in place.** The original `0..1` values
are gone, so re-laying for a different `unitsPerTile` means new geometry rather
than a new texture. There is no live path to offer, and `applySettings` says
`needsRebuild` rather than moving a menu over an unchanged bookcase.

⚠️ **That is the same fact as the laziness.** The sheet is bound inside
`buildShelf`, where the material is made — so an entry nobody selects is never
requested, and a roster of any size costs a default page exactly one woodwork
sheet. Laziness here is not an optimisation bolted on; it falls out of where the
bind has to happen.

## The read-back, and a fifth report category

⚠️ **All four existing `ApplyReport` categories are transitions**, and a
transition cannot describe a configuration that was wrong from the first frame.
`applied`, `needsRebuild`, `needsReload` and `refused` each answer *what
changed* — and not one of the three defects that earned this was ever a change:

- **[#284](https://github.com/mephistopheles4/stacks/issues/284)** built every
  arm URL as a fixed base plus a per-arm tail, so `woodRes=1024&woodRes=512`
  arrived and `URLSearchParams.get` returns the **first**. The arm meant to
  render 512 rendered 1024 and differenced to **0.000% at every rung**.
- **[#298](https://github.com/mephistopheles4/stacks/issues/298)** resolved an
  *absent* `woodVary` to `0` against its own documented default of `1`, because
  `Number(null)` is `0` rather than `NaN`. Every render that branch took was
  unvaried.
- **[#297](https://github.com/mephistopheles4/stacks/issues/297)** bound the
  fibre at 90° to its own figure, and every whole-frame number sat in range.

**A query string is an assumption until something states what came out of it.**
So `resolved` names the species, its sheet or *no map*, the world size it was
laid at, and the fibre scale **in force** rather than the one asked for — on
every apply, whether or not anything moved.

⚠️ **An unrecognised species is refused and reported, never dropped at parse.**
This is where `cover_source`'s drop-on-mismatch rule stops transferring: a note
nobody is watching may drop a bad value; a control somebody just moved may not,
because a dropped value looks exactly like a value that was applied. Nothing
upstream would catch it either — `readTune` validates `toneMapping` against its
name list but passes `materials` through as an opaque record, and `woodSpecies`
is the **first string-valued key in there**.

The words live in `describeWoodwork`, in the module with no Three.js in it, so
the gate asserting on them needs no WebGL context.

## Consequences

- **Two gate rows land with this.** **G53** (`one-sheet`) holds a default page to
  exactly one woodwork sheet; ⚠️ **it would have asserted nothing before the menu
  existed**, because one hard-coded sheet made the guarantee a tautology.
  **G54** (`woodwork-readback`) holds the report to the configuration, and closes
  the vacuous green a pure function nothing calls would have by reading
  `applyLive` as text.
- ⚠️ **Both assert on pure functions and never on the network.** G21 records any
  request the suite makes. The laziness was *separately* measured on a live dev
  server, and the limit that leaves is stated: the gate asserts what
  `resolveWoodwork` returns, and the claim that a page fetches exactly what it
  resolved rests on `buildShelf` having one `bindSheet` call for the woodwork and
  on nothing else.
- **G52 (`sheet-size`) widened from `SHIPPED_SHEETS` to `ALL_SHEETS`.** The two
  are now different sets — what a default page fetches against what the module
  can name — and ⚠️ **a menu is exactly the way a committed file stops being
  pointed at.**
- **G13's CC0 allowlist gains sapele's sheet by filename**, the first entry on
  that list a default page never fetches.
- **`materials.wood` becomes load-bearing in a second way.** It was the colour
  shown before a sheet decodes; it is now also the colour `flat` *is*.
- **An off-roster value renders as a disabled menu option carrying its own
  name.** ⚠️ **Blank is a third state that reads as a bug** — an empty box is what
  a visitor sees when a menu failed to populate — and selecting the default
  instead would be the control claiming a setting the object does not hold.
- ⚠️ **Nothing here is a frame-time measurement.** Every cost figure on this map
  is a count. The mobile risk is gated by nothing and this does not close it.

## How this was decided

[#306](https://github.com/mephistopheles4/stacks/issues/306) is the sixth and
last implementation ticket under
[`docs/spec/the-woodwork-reads-as-wood.md`](../spec/the-woodwork-reads-as-wood.md),
whose decisions come from nine tickets under map
[#280](https://github.com/mephistopheles4/stacks/issues/280).

⚠️ **One lesson from building it is worth keeping, because it recurred inside the
gate meant to end it.** G54 exists because three defects each produced a
confident number about a configuration never in force. Its own first draft
asserted the species name with a bare substring match — and `rosewood` and
`sapele` each appear inside their own sheet **URL**, while `flat` appears inside
`flat`'s own description. Deleting the species from the read-back entirely left
**all twelve clauses green**. It was found by running the deletion rather than by
reading the assertions, which is the same habit that caught the two premises
ADR-0080 records as having failed under a render.
