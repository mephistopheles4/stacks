# ADR-0033: The painted shadows are repainted when the light moves

**Status:** accepted
**Context:** [#45](https://github.com/mephistopheles4/stacks/issues/45), under
map [#39](https://github.com/mephistopheles4/stacks/issues/39)

## The problem

The debug panel can move the key light. The painted shadows were computed from
where it used to be.

This is not an incidental coupling — it is a promise the code makes twice, in
prose, in two files. `scene.ts`:

> A pair of functions rather than two lines inside `addLighting`, because the
> shadows painted into the wood are computed from this light — and a painted
> shadow whose light has quietly moved is worse than no shadow at all.

And `docs/progress.md` records that the two cast shadows are *deliberately*
derived from the light's real position "rather than tuned, so moving the light
cannot leave them describing where it used to be". A live light control is
exactly that failure, reintroduced through a UI.

## The three options

1. **Recompute the painters** on every light change.
2. **Rebuild the scene** on every light change.
3. **Let it drift**, and label the panel so the user knows the shading is stale.

## Decision: recompute the painters

**Option 3 is out on principle.** The panel exists to show you what the shelf
looks like. A panel that lies about that while you are dialling it is worse than
no panel, and it is the same failure class as a probe that silently does nothing
— which this project has already decided is worse than no probe.

**Option 2 is correct but expensive for the wrong reason.** `TextureCache` is
per-mount and `dispose()` frees it, so a remount re-pays roughly **24 MB of cover
upload** on the owner's real vault — measured while resolving
[#41](https://github.com/mephistopheles4/stacks/issues/41). Paying that to
redraw a shadow is paying for the books to be reloaded because the lamp moved.

**Option 1 is what the shading actually is.** The painters are 2D canvas fills —
`makeContactShadow` and `makeBackboardShade` draw into a `<canvas>` and hand back
a `CanvasTexture`. Nothing about a book changes when the light moves, so nothing
about a book needs rebuilding. `Painters` in `scene.ts` holds the contacts, and
`paint(settings)` disposes the previous planes and draws new ones from the
light's new position.

## Two details that are part of the decision

**The recess shading is not repainted, because it is not derived from the
light.** `makeRecessShade` is the corner where a shelf meets its backboard: dark
on both sides whichever way the light points. `docs/progress.md` is explicit that
this one is deliberately *not* derived — "a cast shadow from an upright would
fall on one side only and would barely touch a book, while the corner is dark on
both sides whatever the light does". So it is painted once at mount and left
alone. Repainting it would be harmless and would also quietly assert something
untrue about what it depends on.

**The contacts are held, not recomputed.** They are a function of the *layout* —
where the books were actually put — and not of the light. Re-deriving them on
each repaint would be a second chance to disagree with `placeShelf`, which is the
exact drift [ADR-0029](0029-placement-imports-the-case.md) and G25 exist to stop.

## Consequences

- Every repaint disposes its predecessor's `CanvasTexture`. They are not shared
  and not cached, so skipping that would leak one texture per shelf per repaint
  — and dragging a light slider would climb the texture count until the tab died,
  on a panel built to diagnose exactly that.
- The shadow camera's frustum is refitted in the same operation, for the same
  reason: `far` is measured from the light to its target, so moving the light
  left it sized for the old position.
- `smoke:render` is unchanged — 49 books, 0.0012 case overflow, 1285 distinct
  colours at 25.3%. The extraction moved no pixels.
