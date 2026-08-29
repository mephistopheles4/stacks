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

| Prefix | What it is |
| --- | --- |
| `off-*` | **The baseline.** Today's flat `0x6b4f3a`, no map in any slot. |
| `flat-*` | The **mean-matched twin**: `0xc68159`, the diffuse map's own average, no map bound. Difference a pigment arm against *this* and what is left is the grain alone. |
| `pigment-*` | The sapele diffuse in `map`. |
| `both-*` | Diffuse **and** normal, at the normal map's own strength. |
| `both-n3-*`, `both-n5-*` | The same, with `normalScale` at 3 and 5. |
| `relief-loud-orbit` | The relief channel's **own canary** — `normalScale 8`, no colour map. Not a candidate; it exists to prove a zero. |
| `rough-*` | The fourth slot, on the record. |
| `wire-*` | The wiring check: every channel driven past plausible. |
| `pigment-near` / `pigment2k-near` | 512 against 2048 at `minDistance`, the one rung where the difference is not a rounding error. |
| `books-*` | The populated case, for the painted-shadow question an empty one cannot answer. |

⚠️ **`relief-*` at the map's own strength is not here as a picture**, because at
that strength it is byte-identical to the baseline to within the differ's
threshold — which is the finding, and a screenshot of it would only show today's
shelf.
