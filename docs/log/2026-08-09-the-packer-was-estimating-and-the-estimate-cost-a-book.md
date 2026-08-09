# 2026-08-09 — the packer was estimating, and the estimate cost a book a row

Charted as [#78](https://github.com/mephistopheles4/stacks/issues/78) — four
decisions, all closed. Owner's report: *"the padding on the right seems too big
and sometimes it leaves a big empty space on the right when a book can fit"*.

**Two claims, and measuring separated them.** Per row, on the real vault, what
the packer charged against what the cursor actually spent:

| row | n | charged | spent | overcharge | next book charged / actual / room |
| --- | --- | --- | --- | --- | --- |
| 0 | 5 | 3.0322 | 3.0322 | 0.0000 | 0.5418 / 0.5418 / 0.2478 — no |
| 1 | 10 | 3.1191 | 2.9948 | 0.1243 | 0.6839 / 0.6576 / 0.2852 — no |
| 2 | 11 | 3.1480 | 3.0623 | 0.0857 | 0.6705 / 0.6705 / 0.2177 — no |
| 3 | 10 | 3.2424 | 3.1100 | 0.1324 | 0.1905 / 0.1632 / **0.1700 — fits** |

- **"A book can fit" was real, on one row of four.** `shelfCost` prices every
  lean at the steepest angle any book may reach; the live shelf leans at about a
  quarter of that. Row 3 turned away a book needing 0.1632 from 0.1700 of room.
- **"The padding is too big" was mostly not.** Row 0 has an overcharge of *zero*
  and still shows 0.368 of bare wood, because its next book is a face-out cover
  0.542 wide. Rows 0–2 take their next book at no padding and no reserve. Owner
  chose to leave that gap, and to leave `endReserve` at 0.12.

**The bound was documented as unavoidable and was not** — see
[ADR-0042](../adr/0042-the-packer-runs-the-placer.md). `leanFor` needs the row
index; the row index *is* known while packing the row being offered the book. The
circularity was real only for the next row, which is not what the fit test asks.
`toRows` places a trial row and reads where it ends.

**Reading the screenshot for pixel widths was the wrong first move** and produced
a wrong answer — the vault had changed since the image, so the row the owner's
arrow pointed at no longer existed in that form. The dump settled in one run what
the pixels could not settle at all.

**Four read-only reviews, and every one of them found something the green suite
did not.** Two before the code was written: deleting `shelfCost` with the
estimate would leave nothing bounding what the *cursor* spends; and the
replacement claim then *overclaimed* — it does not catch a hair. Two after: the
new outcome assertion compared room against a **floor** on the next book's cost
where soundness needs a **ceiling**, so a book rejected because of clearance
would have turned a correct packer red — the error [`gates.md`](../gates.md),
row G25 (`one-usable-width`), already records twice, committed a third time in
the same file, one commit later. It was green on all six fixtures, as its two
predecessors had been.

**Three numbers, three corrections, none from running the suite.** The claimed
detection floor went 0.0003 → withdrawn → 0.0055, the last one bisected after the
assertion became sound; making it sound cost the sharpness, and the honest floor
is now the cost model's. And "0.1815 from the upright instead of 0.2900" measured
its two halves under different conventions — footprint edge against cursor edge,
one separator apart. It is 0.1815 against **0.3060** now, both as
`SHELF.width / 2 - rowExtent(...)`. A before-and-after is one measurement taken
twice or it is not a comparison.

Result: row 3 holds an eleventh book. Rows 0–2 are byte-identical — deep equality
of the rows *and* their placements, not inferred from the renders — and the
flattened book order is unchanged across the real vault and all five G25
fixtures. The `placeRow` extraction was checked arithmetic-neutral over 3410
placement fields, worst delta 0.

Gates after: `pnpm test` 515 green, `pnpm typecheck` clean, `pnpm gate:public` OK,
G16 case overflow 0.0000 with draws/tris/textures unchanged at 374/4068/71.
Renders in `artifacts/shelf-packing-{before,after}.png`.
