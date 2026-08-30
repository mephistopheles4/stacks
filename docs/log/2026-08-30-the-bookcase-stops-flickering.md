# The bookcase stops flickering, and the fix is applied to the class

**2026-08-30** — [#301](https://github.com/mephistopheles4/stacks/issues/301),
closing [#296](https://github.com/mephistopheles4/stacks/issues/296). The first
of the six implementation tickets under
[`docs/spec/the-woodwork-reads-as-wood.md`](../spec/the-woodwork-reads-as-wood.md),
and the only one that shares no source file with the other five.

## What was wrong

Every member of the bookcase is a box, and **46 pairs of their faces shared a
plane while overlapping in the other two axes** on the fixture's four-row case.
That is exactly the condition for two fragments to arrive at the same depth and
let floating-point precision decide which one wins, so the two surfaces trade
places frame by frame while the camera moves and settle into whichever won when
it stops. The camera's near and far are 0.1 and 100, which leaves the depth
buffer nothing to separate them with.

The arithmetic is not subtle. A plank is `SHELF.width + SHELF.sideThickness * 2`
wide, an upright stands at `±(SHELF.width + SHELF.sideThickness) / 2` with a
half-thickness of `SHELF.sideThickness / 2`, and both land on `±1.79` exactly.

⚠️ **Almost all of it had been invisible since the case was built**, because the
planks and the uprights share one material in one flat colour and a tie between
two identical colours resolves to the same pixel either way. The backboard's
pairs were the exception and flickered on `main`: it is a second material in
`woodDark`, so its ties resolve to two different colours. It was reported by the
owner as a pre-existing artefact while looking at something else.

## What was done

The uprights keep every plane they own. Every other member is shrunk off those
planes, unconditionally — no query parameter, no setting, no texture required.

- **Planks** shrink by `PLANK_INSET` in `x` and in `z`. ⚠️ **The depth matters as
  much as the width**: once a plank's end sits inside an upright, the two still
  share an overlapping band on the front and back faces at `z = ±0.36`, which is
  20 of the 46.
- **The backboard** shrinks by **twice** that, in `x` and in `y`. ⚠️ **Not
  tidiness** — shrunk equally, the backboard's sides and the plank ends land on
  one *new* shared plane at `±1.786`, a tie the uprights happen to hide, which is
  a worse thing to rely on than not creating. Measured: 10 pairs at four rows.

0.004 world units is about 1.2 mm at this scene's scale against an upright 0.09
thick, so every shortened face sits well inside a neighbour's volume. The
silhouette does not move, and `smoke:render` reports the same 0.0000 case
overflow either side.

## The trap, and why the gate enumerates

⚠️ **Fixing the pair somebody points at leaves 36 of them.** That is not
hypothetical: on [#284](https://github.com/mephistopheles4/stacks/issues/284) a
first pass shortened the planks in `x`, cleared 10, and left every backboard pair
*and* the plank front and back faces — which nobody had pointed at and nobody had
looked for. The second report arrived a few minutes later.

So **G51 (`coplanar-faces`)** enumerates the whole class from the case's own
dimension constants at five row counts, and derives the expected pre-fix count as
`8 × (rows + 1) + 6` rather than writing 46 down. ⚠️ **The un-inset count is
asserted first, as the positive control** — an enumerator that has stopped
matching reports zero ties on a geometry riddled with them, and *zero* is the
pass this gate is otherwise looking for.

⚠️ **A third clause reads `buildShelf`.** Everything else is arithmetic on
`case.ts` and would stay green if the renderer never imported either constant,
which is the vacuous green that matters here. So the three `BoxGeometry` calls
are read: exactly one sized off `PLANK_INSET`, exactly one off `BACKBOARD_INSET`,
three in total.

## Two things found while doing it

⚠️ **#296's own pair table sums to 48 against the 46 it states everywhere else.**
It gives *backboard side / upright outer face* as 4; the enumeration finds 2, one
per upright. The 46 is right — it is what the arithmetic produces — and the
table's fourth row is not. Recorded in the gate and in the register rather than
edited on the issue, because an issue records what was believed when it was
written.

⚠️ **The screenshots could not be committed, and that is G13 working.**
`docs/images/` is pinned by filename to exactly the generated README shelf, and
no other binary may be tracked. The before/after crops live in the pull request
body and in ignored `artifacts/`, not in the tree.

## Observed red

`PLANK_INSET` set to `0` and the suite re-run: the second and third clauses fail,
naming **246** surviving pairs across the five row counts and **46** on the
four-row case, against 4 of 4 passing on the shipped value immediately before and
after. The same edit, rebuilt and rendered, is the *before* half of the pull
request's screenshot — one perturbation serving both the gate's red and the
picture.
