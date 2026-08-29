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
`?wood=rough`, `?wood=wire`, `?wood=pigment2k`, with `&woodNormal=<n>` and
`&woodTile=<units>` open to a live hand.

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
