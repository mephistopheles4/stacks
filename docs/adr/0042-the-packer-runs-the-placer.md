# ADR-0042 — the packer runs the placer

<!-- Written as 0040 and renumbered on rebase: main had taken 0040 and 0041 while
     this sat on a branch. The number is the only thing that changed. -->


`toRows` decides whether a book fits by **placing the row with the book on the
end and reading where it ends**. It does not estimate. Nothing outside the tests
*calls* `shelfCost` or `rowCost` any more; both moved into
`shelf-width.test.ts` — which is itself under `packages/site/src`, so "they no
longer exist there", as an earlier draft of this line had it, was wrong in a way
worth keeping visible: the distinction is between deciding and bounding, not
between directories.

This supersedes the "it is an upper bound, not the exact spend" half of
[ADR-0031](0031-one-usable-width.md). Everything else in ADR-0031 stands, and is
strengthened: there is now one function answering "how wide is a shelf", not two
sums held to each other.

## What was wrong

A row of the live shelf ended 0.29 short of the band and turned away the next
book. Measured, per row, on the real vault:

| row | n | charged | spent | overcharge | next book charged / actual / room |
| --- | --- | --- | --- | --- | --- |
| 0 | 5 | 3.0322 | 3.0322 | 0.0000 | 0.5418 / 0.5418 / 0.2478 — no |
| 1 | 10 | 3.1191 | 2.9948 | 0.1243 | 0.6839 / 0.6576 / 0.2852 — no |
| 2 | 11 | 3.1480 | 3.0623 | 0.0857 | 0.6705 / 0.6705 / 0.2177 — no |
| 3 | 10 | 3.2424 | 3.1100 | 0.1324 | 0.1905 / 0.1632 / **0.1700 — fits** |

Row 3 rejected a 0.0712 spine carrying a 0.09 year gap — 0.1632 all in — from a
row with 0.1700 of real room. It was rejected because the row had already been
over-charged by 0.1324, leaving a *charged* slack of 0.0376.

The over-charge is `shelfCost` pricing every lean at the steepest angle any book
may reach: `MAX_LEAN` for a swing, `MAX_PROP_LEAN` for the parallel push, and a
year gap in full where a propped book hands `propShiftOf` of it back. The live
shelf leans at about 3°, against a 14° ceiling.

## Why the bound was thought unavoidable, and was not

`placement.ts` said so, in as many words:

> The swing is charged at `MAX_LEAN` because the real lean comes from `leanFor`,
> which needs the row index, which is not known until the wrap this figure
> decides has happened.

That is true of the book's *other* possible home — the head of the next row — and
false of the row being offered it, which is the only place the fit test is
asking about. `leanFor(rowIndex, position, id)` is determined by its arguments,
and inside `toRows` all three are known:

- `rowIndex` is `rows.length`. Rows are finalised in order and never revisited.
- `position` is `current.length`.
- `id` is the candidate's own.

Two supporting facts, both checked rather than assumed:

- `rowsForCase` feeds only `shelfY`, which is Y. No X arithmetic reads the total
  row count or any later row. That is what let `placeRow` take `shelfY` as a
  parameter and the packer pass 0.
- **Appending is monotonic.** A book's position in the row, and its run's lean
  seed, are fixed by what comes *before* it — so nothing already placed moves
  when one more book is offered. Without this, greedy packing against a trial
  placement would be unsound.

So the estimate was never necessary, and the sentence explaining it outlived the
thing it explained.

## What it costs

`toRows` places the trial row for every candidate — O(n²) placements a row,
n ≤ ~30, on a pure-arithmetic function with no allocation beyond the placements
themselves. Unmeasurable against a scene build.

The trailing `TOUCHING` / `bookGap * 2` after a row's *last* book is no longer
charged. Nothing follows it, so nothing needs it.

`SHELF.endReserve` starts being genuinely consumed, where before the over-charge
kept rows clear of it. It is pinned at or above `swayOf(MAX_HEIGHT,
MAX_PROP_LEAN)`, which bounds everything that can reach right of a footprint, so
containment is unchanged — and G16 confirms it on a rendered scene rather than
on this paragraph.

## Where the cost model went, and why it did not die

Nothing in `packages/site/src` calls `shelfCost` now. The tempting move is to
delete it and the group that exercises it — [`gates.md`](../gates.md), row G25
(`one-usable-width`) — on the grounds that a cost model only its own gate reads
is that file's "defendant sitting as judge".

That is backwards. The group defends two things, and only one of them became
trivial. `spent === charged` is indeed vacuous now. But `spent ≤ charged` is the
only assertion bounding what the **cursor** spends against numbers the cursor
cannot move, and restating capacity in terms of `rowExtent` — the code under
test — is the defendant-as-judge defect itself, committed a third time in the
same file.

So the model moved to `shelf-width.test.ts`, beside `THICKEST_SPINE` and
`WORST_PARALLEL_PUSH`, which are already restated there for exactly this reason.
It decides nothing and bounds everything. Its conservatism, which was a defect
while it steered the packer, is free now that no row wraps on it.

**Its detection floor is measured and written into G25**, because the first draft
of this decision claimed it caught a hair-sized cursor over-spend and that was
false. Bisected on `cursor += entry.thickness + TOUCHING + δ`: green at 0.005,
red at 0.0055. The face-out branch catches any δ at all.

## The gate this added, and the defect in it

Beyond what the plan asked for, this adds a third assertion to G25 —
`leaves a row no slack a book could have used`. The plan asked only for a
*comment* saying the tight assertion is not vacuous. The extra assertion earns
its place: it is the only one in the file with a cursor-free number on one side,
so it is the only one that can see a cursor which over-spends. Recording the
deviation rather than letting the diff imply it was asked for.

⚠️ **It shipped wrong, and two independent reviews caught it from opposite
sides.** Its comparand started as a *floor* on what the next book would cost —
footprint plus gap plus separator, with every clearance deliberately left out on
the reasoning that a smaller number was a safer claim. It is the reverse. The
assertion is `room < need`; a need stated too small turns a **correct** packer
red, because a book rejected precisely *because of* the clearance it would have
paid leaves room above such a floor. That is the error G25 already records twice,
committed a third time in the same file one commit later, and green on all six
fixtures — which is how the other two looked too. The second review found the
opposite skew in the same expression: charging `YEAR_GAP` in full overstated the
need by up to 0.088 at a propped boundary, where the cursor hands `propShiftOf`
back. And the separator was keyed on the *next* book rather than the one the
cursor is leaving, understating by 0.014 at every face-out-then-spine boundary.

It is a ceiling now — `separator(last) + gap + footprint + WORST_CLEARANCE`,
every term at its worst, derived from the geometry rather than read off the
cursor.

**Making it sound cost the sharpness, and that is the honest trade.** The floor
version detected a δ = 0.0003 cursor over-spend; the ceiling version needs one
big enough to move a book between rows, so G25's floor is now the cost model's
0.0055. Sharpness bought with unsoundness is a gate that goes red on a day
nobody changed anything.

## What this deliberately does not change

- **`SHELF.endReserve` stays 0.12.** Sizing it to the last book's actual lean
  would recover about 0.09 a row, but it is the only thing between the last spine
  and the upright, it touches `USABLE_WIDTH`, and `case.ts` records that this
  exact constant was once pinned to the wrong angle and stayed green throughout.
  Separate change, own gate work. Owner's call.
- **Rows still trail off at the right.** Shelves 0–2 above are not packing
  misses — their next book is a face-out cover 0.54–0.68 wide against 0.29–0.41
  of wood, and no packing change reaches them. Books stand against the left
  upright and run right, as a shelf fills. No justification, no slack
  distribution. Owner's call.
- **No reordering.** "A book could fit there" reads as an invitation to bring a
  later, thinner book forward. Packing stays greedy and order-preserving;
  `gates/shelf-order.test.ts` pins the order.

## Result

Row 3 holds its eleventh book and its last footprint ends **0.1815** from the
upright instead of **0.3060** — both measured the same way, as
`SHELF.width / 2 - rowExtent(row.books, 3)`.

⚠️ **That pair read 0.1815 against 0.2900 first, and the two halves were measured
under different conventions**: the new figure from the last book's footprint edge
and the old one from where the cursor stopped, one trailing separator further
right. Each reproduced exactly on its own, which is why nothing caught it — the
pair understated the improvement by 0.016. A before-and-after is one measurement
taken twice or it is not a comparison.

Rows 0–2 are byte-identical — verified as deep equality of both the rows and
their `placeShelf` placements, not inferred from the screenshots. The flattened
book order is unchanged across the real vault and all five G25 fixtures: no book
lost, gained, duplicated or reordered. The extraction of `placeRow` was checked
to be arithmetic-neutral over 3410 placement fields, worst delta 0. Before and
after renders are in `artifacts/shelf-packing-{before,after}.png`.

Rows 0–2 being untouched was predicted before the change was written, which is
the useful part of having measured first.

Charted as [issue #78](https://github.com/mephistopheles4/stacks/issues/78).
