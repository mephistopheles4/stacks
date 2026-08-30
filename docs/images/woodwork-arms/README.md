# The woodwork channel arms

⚠️ **This directory exists on `prototype/284-woodwork-channels` only and never
reaches `main`.** G13 (`gates/repo-hygiene.test.ts`) pins `docs/images/` to
exactly `shelf.png`, so this branch is red on that row by construction — the
same correct outcome `prototype/282-woodwork-baseline` records, and for the same
reason: a `prototype/` branch's whole contract is that it never becomes a commit
on the trunk. The images live here rather than in the gitignored `artifacts/`
tree so the ticket can link them.

They answer [#284](https://github.com/mephistopheles4/stacks/issues/284) under
map [#280](https://github.com/mephistopheles4/stacks/issues/280): **which
channel makes the woodwork read as wood — pigment, relief, or both.**

The branch is cut from [`prototype/282-woodwork-baseline`](https://github.com/mephistopheles4/stacks/tree/prototype/282-woodwork-baseline)
rather than from `main`, because the judging scene, the level ladder, the
`window.__empty` patch and the differ are all that branch's delivery and this
one only adds arms to them.

Regenerate every arm and its numbers with:

```sh
pnpm tsx scripts/prototype-woodwork-arms.ts
```

Rebuild the maps and recompute the mean-matched twin's colour with:

```sh
pnpm tsx scripts/prototype-wood-maps.ts
```

Drive any arm by hand — which is how the verdict is actually reached, since
[#282](https://github.com/mephistopheles4/stacks/issues/282) settled that the
owner judges on a live local build:

```sh
pnpm dev
```

then `?wood=pigment`, `?wood=relief`, `?wood=both`, `?wood=flat`,
`?wood=rough`, `?wood=wire`, `?wood=pigment2k`, with these open to a live hand:

| Knob | What it does |
| --- | --- |
| `&woodSpecies=sapele\|rosewood` | which sheet. Default `sapele`. |
| `&woodNormal=<n>` | `normalScale`. Default 1, which for a flat-sliced veneer is a measured zero. |
| `&woodTile=<units>` | world units per tile. Defaults to the sheet's own published size. |
| `&woodVary=<0..1>` | per-member offset, mirror, scale and tint. Default 1; `0` makes every board identical again. |
| `&woodJoint=flush` | restores the coplanar geometry, so the z-fight can be seen rather than argued about. |
| `&woodSeed=<token>` | the root every member's dice are drawn off. **Absent, it is fresh on every load** — which is [#287](https://github.com/mephistopheles4/stacks/issues/287)'s decision and not an oversight. Pass one to hold a shelf still. |

Two contact sheets of what Poly Haven publishes, served by the dev server —
`/wood-grid.html` is all 135 of its woods, `/wood-short.html` is the twelve
worth a second look. Both pull thumbnails from `cdn.polyhaven.com`, so they work
under `pnpm dev` and would be blocked by the production CSP, which is
[#281](https://github.com/mephistopheles4/stacks/issues/281)'s whole point about
`img-src 'self'`.

## The standing candidate

Reached on a live build, which is how
[#282](https://github.com/mephistopheles4/stacks/issues/282) said this would be
decided:

```text
?wood=both&woodSpecies=rosewood&woodDetail=0.5&woodNormal=0.5&woodRes=1024
```

Rosewood's figure in `map` at **1024, laid at its true 7.68 units**, and the
**drawn** fibre in `normalMap` at half strength. One tile is wider than the whole
bookcase, so the figure never repeats; the fibre carries the close-up detail the
figure map no longer has to.

⚠️ **`woodTile` is struck for this sheet, and it was this file's own
suggestion.** Laying the sheet smaller buys texels for free and brings the
repeat back — and the repeat is what the owner's eye rejected twice, at
`woodTile=2`, pointing at motifs recurring up an upright. The sheets do tile
near-seamlessly, measured (wrap difference 5.72 against a local 3.64), so what
was visible was **repetition and not a seam**: the fix is not a better seam, it
is not repeating. Anything that both tiles small *and* hides the repetition
needs stochastic tiling in a shader, which is a different ticket.

**What it costs**, and the honest comparison:

| | wire | decoded | figure repeats up an upright |
| --- | --- | --- | --- |
| 512 @ true scale | 62.6 KB | 1.0 MB | never — but soft close up |
| **1024 @ true scale** | **266.5 KB** | **4.0 MB** | **never** |
| 2048 @ true scale | 1051.8 KB | 16.0 MB | never |
| 512 @ 2 units | 62.6 KB | 1.0 MB | 2.24 times — rejected |

The fibre normal is drawn in code, so it adds **nothing** to either column.
⚠️ 266.5 KB is four times what
[#281](https://github.com/mephistopheles4/stacks/issues/281) had in mind when it
settled 512 on `MAX_COVER_EDGE`'s precedent — and that precedent was about
covers, which are a few hundred pixels tall on a shelf.

## The source

**Poly Haven's `sapele_veneer`**, CC0, by Jenelle van Heerden — the species
[#281](https://github.com/mephistopheles4/stacks/issues/281) chose, and the
closest reachable stand-in for the koa the owner asked for. Published as a
500 mm square, which this scene's unit puts at about 1.6 world units, so the
veneer is laid at its true size rather than at whatever looked right.

Downloaded at 2k and resized to **512** on the long edge, #281's number:

| File | Bytes |
| --- | --- |
| `sapele-diff-512.jpg` | 34.5 KB |
| `sapele-nor-512.jpg` | 18.5 KB |
| `sapele-rough-512.jpg` | 8.0 KB |
| `sapele-diff-2k.jpg` | 2,762.9 KB — the resolution **control**, not a candidate |

## The files

Every arm is **rosewood at 1024, laid at its true 7.68 units**, on the empty
bookcase, at the four rungs of #54's level ladder.

| Prefix | What it is |
| --- | --- |
| `off-*` | **The baseline.** Today's flat `0x6b4f3a`, no map in any slot. |
| `flat-*` | The **mean-matched twin**: `0x6e3412`, the figure map's own average, no map bound. Difference a pigment arm against *this* and what is left is the grain alone. |
| `pigment-*` | Rosewood's figure in `map`. |
| `relief-*` | The sheet's **own** normal map. A measured near-zero, again. |
| `fibre-*` | The **drawn** fibre normal, no colour map — the only relief that moves a pixel. |
| `candidate-*` | Figure **and** drawn fibre: the standing candidate. |
| `cand-n2-orbit` | The same at `normalScale 2`, for the strength sweep. |
| `wire-*` | The wiring check: every channel driven past plausible. |
| `pigment-near` / `pigment512-near` | 1024 against 512 at `minDistance`. |
| `books-*` | The populated case, for the painted-shadow question an empty one cannot answer. |
| `seed-a-*` / `seed-b-*` | [#298](https://github.com/mephistopheles4/stacks/issues/298)'s pair: one forced seed reproduced, and a *different* seed against it. Read together — see below. |

## What the second run measured

⚠️ **These replace the first run's numbers rather than updating them.** That run
was *sapele at 512*, on the geometry that still carried 46 depth-buffer ties.
Nothing of its figures survives a change of sheet.

⚠️ **Every number in this section was measured with the per-member variation
OFF**, and nobody knew. `?woodVary=` absent resolved to **0** rather than to the
1 this file's own knob table promises — `last()` answers `null`, `Number(null)`
is `0`, and `0 >= 0` passed the guard. So the boards in every shot below are
identical to one another. [#298](https://github.com/mephistopheles4/stacks/issues/298)'s
seed canary found it and it is fixed on
[`prototype/298-wood-seed`](https://github.com/mephistopheles4/stacks/tree/prototype/298-wood-seed);
the run that found it reproduced these figures near-exactly first, which is what
says the section is internally honest rather than merely old. **The channel
verdicts do not rest on variation** — they are differences between arms, and
every arm was equally unvaried.

**The colour confound mostly dissolved, which was the point of changing sheet.**
Sapele's mean is far lighter than today's `0x6b4f3a` and rosewood's is not, so
at zoom 10:

| | colour + grain | grain alone | grain's share |
| --- | --- | --- | --- |
| sapele @512 | 20.53% | 1.32% | 6% |
| **rosewood @1024** | **15.60%** | **2.72%** | **17%** |

Twice the grain for less colour shift — nearly three times better on the ratio
[#68](https://github.com/mephistopheles4/stacks/issues/68) was struck by.

**The sheet's own normal map is a near-zero on a second sheet**: 0.166% at
zoom 10, and `both` differs from `pigment` by **0.000% above the threshold at
every rung, level and orbited**. Two veneers, one answer.

**The drawn fibre is the only relief that does anything.** Against pigment it
adds **0.742% level and 1.481% orbited**, where the sheet's normal adds 0.000%
— and it ships no bytes at all.

**512 against 1024 is 0.299% at zoom 10, worst delta 25.** Small, real, and the
eye is what decides it, per #282.

**ADR-0034's threshold is not crossed by anything**, the wiring arm included:
the brightest pixel any arm reaches is 0.444 against 0.85. Rosewood is *darker*
than today's shelf in places.

**Cost, measured**: pigment is +1 texture, +1 shader program, +0 draw calls; the
candidate is +2 textures and still +0 draw calls, the second being the drawn
fibre's canvas.

**The painted shadows read through it.** On a populated case the candidate
differs from pigment by 0.585% — the grain is under the shadows, not fighting
them.

⚠️ **One row of the first run is not re-measurable here.** Poly Haven publishes
no roughness map for `rosewood_veneer1`, so the fourth slot cannot be tested on
this sheet. Sapele's number stands as sapele's: **1.029% at zoom 10**, which
beat relief and inverted this ticket's own prior.

## The forced seed, and what its canary caught

[#298](https://github.com/mephistopheles4/stacks/issues/298)'s half, on
[`prototype/298-wood-seed`](https://github.com/mephistopheles4/stacks/tree/prototype/298-wood-seed).
`?woodSeed=<token>` pins the root every member's dice are drawn off, so two arms
differ by the treatment and not by the dice. There is **no default** — a page
with no seed throws fresh dice, exactly as the shipped shelf will — so the
harness is what refuses to render an unpinned frame, and every shot now prints
`vary` and `seed` beside its resolution.

Two controls, read together, because the first one alone cannot tell a working
seed from an ignored one:

| Control | Reads | What it proves |
| --- | --- | --- |
| the same forced seed twice | **0.000%, worst Δ 0** | byte identical — the seed reproduces |
| a **different** seed | **1.986%, mean Δ 0.494, worst Δ 95** | the seed reaches the dice |

⚠️ **The pair fired on its first run, and the fault was not the seed's.** Both
read 0.000%: `?woodVary=` absent resolved to 0, so there were no dice for a seed
to change and the whole variation had been off in every render this branch had
taken. Third of the false-zero family below, and the first one an instrument
found rather than a person.

**What variation being on changes, now that it is:** the candidate's grain alone
at zoom 10 goes **2.721% → 4.028%**, and its difference from the baseline nearly
doubles in mean (3.233 → 6.867) because the ±10% per-member tint moves the
average as well as the grain. The channel *verdicts* are unchanged — the sheet's
own normal is still 0.000% above the threshold at every rung, and the drawn
fibre still the only relief that moves a pixel.

⚠️ **A false zero was caught and is worth knowing about.** The resolution
control first reported **0.000% at every rung, worst delta 0** — byte-identical
frames. The arm matrix builds each URL as a fixed base plus a per-arm tail, so
512 arrived as `woodRes=1024&woodRes=512`, and `URLSearchParams.get` returns the
*first*. The arm meant to render 512 rendered 1024. Every shot now reads back
what the page actually resolved, and the report prints it above the numbers.
