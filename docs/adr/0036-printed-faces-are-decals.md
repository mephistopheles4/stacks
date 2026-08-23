# ADR-0036 — The printed faces are decals, not floats

**Status:** accepted
**Date:** 2026-08-06

## Context

Every printed face on a book — the cover artwork and the spine with its title —
is a `UNIT_PLANE` laid over the case's boards. Two surfaces at the same depth
z-fight, so from the first version the planes floated a constant `SKIN` (0.0012
world units, 0.03cm at shelf scale) in front of the board they print on.

That number bought the right thing and charged for it somewhere else. Face-on
you cannot see 0.03cm. Edge-on you cannot miss it: at the joint, where the
printed spine at `z = D/2 + SKIN` meets the printed cover at `x = T/2 + SKIN`,
the board's own front face shows in the gap between them — a hairline in
`boards` colour, `entry.colour × 0.82`, running the full height of every book.
Measured at `?solo`'s minimum distance it is four pixels wide. The owner circled
it on a **shelf** screenshot at the shelf's own `minDistance`, which is what
settled that it reads at all, after this file's author had claimed from a render
that it did not.

The same gap exists at every corner of every book for the same reason. The joint
is where it was noticed, not where it is.

## Decision

The printed planes sit **exactly on** the case — `x = thickness / 2`,
`z = depth / 2` — and their materials carry

```ts
polygonOffset = true;
polygonOffsetFactor = -1;
polygonOffsetUnits = -2;
```

so the depth test resolves the tie in the artwork's favour without the geometry
having to move. `factor` scales with the polygon's depth slope, so the bias
grows at exactly the grazing angles where the hairline showed; `units` is the
spec's minimum resolvable step, doubled for margin on the hardware this project
has history with.

The head cap moved with them, to `z = depth / 2`. It is real volume rather than
a decal and takes no offset of its own, but its foot has to land _on_ the
printed spine's top edge — a cap left at `+ SKIN` would be a lip across the
whole head.

## Consequences

Case overflow, which `smoke:render` reports, went **0.0024 → 0.0000**: nothing
on a book now stands outside the case at all. The tolerance in that gate was
written around `SKIN` being real, and its reasoning is now history rather than
arithmetic — left in place, because a book breaking out of the case is still
what it is looking for.

⚠️ **Nothing here reaches the shadow pass, and that is checked rather than
assumed.** three's `WebGLShadowMap.getDepthMaterial` copies `side`, `alphaTest`,
`map`, displacement and clipping — not `polygonOffset`. So decal and board write
the same depth into the shadow map, which is harmless because it is the _same_
depth; and the printed planes do not cast anyway.

⚠️ **The one change that breaks this is a depth or normal prepass.** SSAO and
its relatives render the scene through an override `MeshDepthMaterial` that
ignores per-material offset. Coplanar surfaces would then fight in the depth
_texture_, and every decal on every book would speckle along its edges. ADR-0034
put bloom behind a composer through an ordinary `RenderPass`, which is fine;
the next effect may not be.

## Alternatives rejected

**Widen the planes by `SKIN` so each overhangs the gap.** Closes the joint and
opens the same hairline at the fore-edge, where the cover would then overhang
the board instead. It moves the defect rather than removing it, and it cannot
close the head and tail edges at all.

**Shrink `SKIN`.** There is no value that is both large enough to beat depth
precision at the far end of a 100-unit frustum and small enough to be invisible
at `minDistance`. That is the trade `polygonOffset` exists to dissolve: it is a
bias in depth, not in space.
