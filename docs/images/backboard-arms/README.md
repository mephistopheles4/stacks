# The backboard's arms

⚠️ **This directory exists on `prototype/297-backboard-sheet` only and never
reaches `main`.** G13 (`gates/repo-hygiene.test.ts`) pins `docs/images/` to
exactly `shelf.png`, so this branch is red on that row by construction — the
same correct outcome `prototype/282-woodwork-baseline` and
`prototype/284-woodwork-channels` both record, and for the same reason: a
`prototype/` branch's whole contract is that it never becomes a commit on the
trunk.

They answer [#297](https://github.com/mephistopheles4/stacks/issues/297) under
map [#280](https://github.com/mephistopheles4/stacks/issues/280): **which wood
is the backboard's own sheet, and does its grain read behind books.**

The branch is cut from [`prototype/284-woodwork-channels`](https://github.com/mephistopheles4/stacks/tree/prototype/284-woodwork-channels),
not from `main`, because the question is what the backboard looks like **behind
#284's standing candidate** rather than next to today's flat planks. That arm
rides on every URL below, and the report reads it back off the page rather than
trusting it.

Regenerate every arm and its numbers with:

```sh
pnpm tsx scripts/prototype-backboard-arms.ts
```

Re-run the species survey — all 41 veneers Poly Haven publishes, measured — with:

```sh
pnpm tsx scripts/prototype-backboard-survey.ts
```

Fetch and size the candidate's maps, and recompute its mean-matched twin:

```sh
pnpm tsx scripts/prototype-backboard-maps.ts
```

Drive any arm by hand, which is how the verdict is actually reached, since
[#282](https://github.com/mephistopheles4/stacks/issues/282) settled that the
owner judges on a live local build:

```sh
pnpm dev
```

then `?back=pigment`, `?back=relief`, `?back=both`, `?back=flat`, `?back=wire`,
on top of whatever `?wood=` the woodwork is wearing:

| Knob | What it does |
| --- | --- |
| `&backSpecies=darkwood\|rosewood` | which sheet. Default `darkwood`. |
| `&backRes=512\|1024\|2048` | the map edge in texels. Default 512. |
| `&backNormal=<n>` | `normalScale`. Default 1. |
| `&backDetail=<n>` | the drawn fibre's period, in tiles; `0` uses the sheet's own normal. |
| `&backTile=<units>` | world units per tile. Defaults to the sheet's own published size. |
| `&backVary=<0..1>` | #287's per-member difference. Default 1; `0` makes it identical again. |
| `&backRough=<n>` | overrides `backingRoughness`, which ships at 0.95. |

## The standing candidate

```text
?back=both&backRes=512&backDetail=0.5&backNormal=0.5&wood=both&woodSpecies=rosewood&woodRes=1024&woodDetail=0.5&woodNormal=0.5
```

Poly Haven's **`dark_wood`**, CC0, laid at its true 6.37 units, at **512** on
the long edge — `map` carrying the figure and the **drawn** fibre in `normalMap`
at half strength, the shape #284 landed on for the woodwork.

**What it costs, measured off `renderer.info`**: **+1 texture, +0 draw calls,
and −1 shader program.** The last one is not a typo and it is not free money: a
backing material carrying `map` *and* `normalMap` compiles to the same program
the woodwork already uses, so the two merge. ⚠️ **Reproduced across two full
runs of the matrix** — the rerun control proves pixel determinism and says
nothing about `renderer.info`, so the program count is quoted from two
independent runs rather than from one. `darkwood-diff-512.jpg` is **53.2 KB** on
the wire and 1.0 MB decoded.

⚠️ **The drawn fibre is +0 textures, and that is measured too.** It is a clone
of the woodwork's own canvas, so the two share one GPU upload through three.js's
`Source` — the sentence `prototype-backboard.ts` writes down, and the reason the
cost table is read off the page rather than reasoned about.

## The source

**Poly Haven's `dark_wood`**, CC0, 2000 mm square, published in
`Wood/Veneer/Dark & Exotic Veneer`.

⚠️ **It is not a shortlist of four, and that is the survey's finding rather than
a preference.** `scripts/prototype-backboard-survey.ts` downloads all **41**
veneers in Poly Haven's `Wood/Veneer/` branch and measures each one's mean in
linear light. Against `woodDark`'s luma of 56.5:

| sheet | mean | luma | Δ vs `woodDark` | contrast | grain runs |
| --- | --- | --- | --- | --- | --- |
| `rosewood_veneer1` | `0x6e3411` | 60.3 | +3.9 | 11.21 | ambiguous (0.69) |
| **`dark_wood`** | **`0x5f2c18`** | **51.8** | **−4.6** | **12.74** | **across `u` (0.08)** |
| `flamed_black_veneer` | `0x56504d` | 81.2 | +24.8 | 2.68 | across `u` |
| …37 more, all further still | | | | | |

Two sheets land within 5 luma of the backboard's colour. One of them is the
woodwork's own sheet. The third-nearest is **+24.8 away**, which is most of the
distance from the backboard to the planks — so the pool #297 asks about is one
candidate and one control, and #281's four-species menu shape does not transfer
to a surface that carries a darkness constraint.

## The files

Every arm is on the empty bookcase unless its name says `books-`, at the rungs
of #54's level ladder, with #284's standing candidate on the woodwork.

| File | What it is |
| --- | --- |
| `off-*` | **The baseline.** Today's flat `woodDark`, planks already treated. |
| `flat-zoom25` | The **mean-matched twin**: `0x5f2c19`, the sheet's own average, no map. |
| `pigment-zoom10` | `dark_wood`'s figure in `map` @512. |
| `candidate-*` | Figure **and** drawn fibre — the standing candidate. |
| `rosewood-*` | **The separation control**: the woodwork's own sheet on the backboard. |
| `books-*` | The same arms with the books back in, at identical cameras. |
| `vary-zoom10`, `books-vary-zoom10` | **The shipping frame** — #287's variation on, both materials. |
| `clown-empty-near`, `clown-books-near` | The composition pass, both scenes. |

## What was measured

**The instrument reproduces a number nobody re-derived for it.** #282 recorded
the empty case at `minDistance` as 90.34% backboard and 9.57% woodwork; this
run's own clown pass says **90.38% and 9.51%**. Two sessions, two scripts, one
frame.

### The backboard is 90% of the near frame and 15% of it

The half nothing had counted. Same cameras, books in against books out:

| rung | empty | books in |
| --- | --- | --- |
| full shelf | 18.15% | **7.49%** |
| zoom 10 | 47.28% | **16.98%** |
| zoom 25 | 93.45% | **11.51%** |
| `minDistance` | 90.38% | **14.99%** |

⚠️ **A populated shelf hides five sixths of the surface this ticket is about**,
and the empty case — #280's judging scene — is where the whole decision is
visible. Both are reported below and every figure says which.

### The grain reads, and it reads best against its own average

Grain alone, differenced against the mean-matched twin rather than against
today's shelf:

| | empty | books in |
| --- | --- | --- |
| full shelf | 3.300% | 1.238% |
| zoom 10 | **8.892%** | **2.686%** |
| zoom 25 | 17.523% | 1.420% |
| `minDistance` | 16.244% | 1.835% |

**And the colour confound is the smallest this map has measured.** Like for
like — the **pigment** arm at zoom 10 on the empty case, which is the arm #284
and #68 both quote — it moves **4.755%** of the frame against today's flat
backboard and **2.257%** against its own mean, so the **grain is 47% of the
whole effect**:

| | colour + grain | grain alone | grain's share |
| --- | --- | --- | --- |
| #68, spine grain | 17.836% | 0.000% | **6%** |
| #284, rosewood on the woodwork | 15.60% | 2.72% | **17%** |
| **#297, `dark_wood` on the backboard** | **4.755%** | **2.257%** | **47%** |

The candidate arm, which adds the drawn fibre, sits at 8.892% against 22.907%
— **39%** — and the difference between the two rows is the fibre, not the sheet.
The reason either is so high is the sheet: `dark_wood`'s mean is 4.6 luma
*below* `woodDark`, so almost nothing moves before the grain does.

### The sheet's own normal map is a zero on a third sheet

`dark_wood`'s `nor_gl` is **0.000% above the threshold at every rung, level and
orbited**, worst delta 2. Sapele and rosewood both measured the same on #284, so
that is three flat-sliced veneers and one answer.

### `backingRoughness` is what kills the relief, and this is the measurement

#297 asked whether a grain reads at all at 0.95, and #68's diagnosis says a
dielectric under soft light has almost no specular lobe for a normal map to
modulate. The drawn fibre, orbited, against its own baseline at each roughness:

| `backingRoughness` | fibre >JND |
| --- | --- |
| **0.95 — shipped** | **0.264%** |
| 0.82 — the woodwork's | 0.612% |
| 0.60 | 3.246% |

⚠️ **The relief is not weak on this surface; it is weak at this roughness** —
0.6 buys twelve times what 0.95 does. Nothing here proposes changing
`backingRoughness`: that is a `ShelfSettings` knob with the painted shades and
the whole case's read hanging off it. What the sweep buys is that a near-zero
can be attributed instead of reported.

### 512 resolves this sheet

512 against 1024, empty: 0.368% at zoom 10 and 0.527% at `minDistance`, worst
delta 28. `dark_wood`'s tile is 6.37 units — wider than the bookcase, so it
never repeats — and unlike the woodwork's rosewood at 1024 it does not need the
extra step.

### ADR-0034 is uncrossed by every arm

The brightest pixel any arm reaches is **0.423** against the 0.85 threshold —
identical to the baseline's, on every arm but the wiring check, which reaches
0.780 and still does not cross.

## Two things this run turned up that it was not looking for

### `woodVary` has defaulted to 0 since #284, against its own documentation

`Number(null)` is `0`, not `NaN`. `readWoodArm` reads
`Number(last('woodVary'))`, and `last` returns `null` when the key is absent —
so the finite-and-non-negative check passes on a **missing** parameter and every
URL without an explicit `&woodVary=` resolved to **0**, every member identical,
while `prototype-wood.ts` and `docs/images/woodwork-arms/README.md` both said
the default was 1.

**Every arm #284 rendered was unvaried.** That does not touch its channel
verdict — the variation is UV phase and vertex tint, not a channel — but
[#287](https://github.com/mephistopheles4/stacks/issues/287)'s five differences
have been judged on a live build and have never been in the matrix. Found
because the backboard's copy of the same three lines printed `vary 0` in a
read-back line #284's matrix did not have, which is the second defect this map's
read-back rule has caught.

### The variation moves more of the frame than the treatment does

With #287's differences on, both materials, the shipping frame differs from the
measured one by **20.394% at zoom 10 empty** and **9.213% books in** — against
the candidate's own grain-alone 8.892% and 2.686%.

⚠️ **That is why the measurement arms are pinned to `&backVary=0&woodVary=0`**
and the shipping configuration is rendered separately. The ±10% tint is applied
per member through a vertex colour; on the backboard that is one draw covering
90% of the near frame, so it moves that board's whole average and the
mean-matched twin then matches nothing.
