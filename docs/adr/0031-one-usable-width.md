# One usable width, and the packer charges what the placer spends

`packages/site/src/shelf/case.ts` states `USABLE_WIDTH`, and it is the only
answer to "how wide is a shelf". `toRows` packs into it. The placement cursor
runs from `-SHELF.width / 2`, which is where that band begins — the left inner
face — and is flush on purpose. `leanThatFits` is gone.

What a book costs the shelf is stated once too, as `shelfCost` in
[`placement.ts`](../../packages/site/src/shelf/placement.ts), and the packer
reads it. So the packer depends on the placer, which looks backwards until you
see why: a row's capacity means nothing unless what it charges a book is what
the cursor will then spend on it.

## What was actually wrong

[ADR-0029](./0029-placement-imports-the-case.md) recorded three live answers and
left them, because reconciling them changes where books sit and that PR's claim
was that nothing moved. Settling it found two more, and the two it found are the
larger ones.

| where                    | what it treated as usable                     | what it charged a book                |
| ------------------------ | --------------------------------------------- | ------------------------------------- |
| `toRows`, via `scene.ts` | `width - padding * 2 - LEAN_ALLOWANCE` = 3.23 | `footprint + 0.008`                   |
| the placement cursor     | `width` = 3.4, flush from `-width / 2`        | `+ 0.002` shelved, `+ 0.016` face-out |
| `leanThatFits`           | `width` = 3.4, full                           | —                                     |

The per-book charge is the one nobody had noticed, and it dwarfed the argument.
Across a twenty-seven book row the packer over-reserved 0.006 a book — **0.162**,
as much as the entire `padding * 2 + LEAN_ALLOWANCE` the issue was about. A full
row measured 0.374 of bare wood at its right end, which decomposes as 0.17 of
declared reserve, 0.162 of that over-charge, ~0.10 of wrap granularity, less
~0.06 of clearance. Only the first of those four was on purpose.

The fifth: `leanThatFits` counted angle changes by transitions in `faceOut`
alone. The cursor also stands a book upright after a year gap and charges
clearance for it. So the cap was budgeting against a change count lower than the
real one — latent, because it never bound: measured across a 120-book library it
returned 0.72, 1.26, 1.12 and 1.00 radians against a `MAX_LEAN` of 0.062. It had
never once done anything.

## What replaces them

The packer charges the clearances itself. It knows everything they depend on
except the row index: `faceOut`, `gapBefore` and `height` are all fixed by
`toShelfBook`, so `swayOf(height, MAX_LEAN)` is an exact upper bound on what an
angle change can cost. Charged where it is incurred, that is `LEAN_ALLOWANCE`'s
job done per-change instead of as one flat 0.05 a row, and the cap has nothing
left to do.

Containment stops being something a gate checks and becomes something that
follows:

```
right edge = -W/2 + spent  ≤  -W/2 + charged  ≤  -W/2 + USABLE_WIDTH
```

Both inequalities are G25. The left one is the packer being conservative; the
right one is the packer honouring its own capacity.

## The trade-off

**It is an upper bound, not the exact spend, and it cannot be made exact.** The
real lean comes from `leanFor`, which needs the row index, which is not known
until the wrap this figure decides has happened. The packer is therefore over by
up to one maximal swing per angle change — typically one or two a row, about 0.03
each. Making it exact would mean either the cursor also reserving the maximum,
which opens a visible gap wherever the angle changes, or a two-pass packer. The
bound is named in the gate instead, so the conservatism is asserted rather than
discovered.

**Rows now hold about three more books.** A full row went from 27 to 27–30
against `CLAUDE.md`'s stated proportion of ~30, which the case was built to and
had quietly stopped meeting. That is a visible change and the reason this could
not ride along with ADR-0029.

**`toRows(books)` no longer takes a capacity**, for ADR-0029's reason. The cost
was foreseen there — "row wrap has to be provoked by _feeding more books_" — and
it arrived: `books.test.ts` had six call sites handing it a shelf of 0.5 or 10,
none of which exist, and each had to be re-expressed against the real one. The
fourth copy of the capacity formula went with it. It was in
`placement.test.ts`, under a comment claiming it made rows "wrap where they
really wrap" — a promise a copy cannot keep, in the one place that is supposed to
be watching.

**`SHELF.padding` is now `SHELF.endReserve`**, at one end rather than two. Its
docstring said "breathing room at each end" and the flush cursor had been
contradicting it for as long as both existed. It also inherits `LEAN_ALLOWANCE`'s
real job: clearance is charged to the _left_ of the book that leans, so the last
book of a row has nothing on its right to charge and its own swing is paid for by
the reserve and by nothing else. G25 holds it at or above
`swayOf(MAX_HEIGHT, MAX_LEAN)` for that reason, and it is the assertion to read
before tuning that number.

## What this does not change

**G16 is still the backstop, and it did not move.** `pnpm smoke:render` reports
`case overflow 0.0012` after this, exactly as before — which is `SKIN`, the hair
by which a printed cover floats above its board, and not slop. Everything in G25
asserts what the placements _claim_. Only the render confirms the scene agrees,
and it exists because the arithmetic was once wrong in a way that re-checking the
arithmetic could not catch: the cursor advances by a book's thickness, and a book
rotated about its centre is wider than that.

**The flush start stays flush.** The cursor begins at the left inner face and the
first book immediately pays its own swing, because the case's side is vertical
and the book's lean is not — which puts the leaning corner on the wood. A book
that leans left and starts a finger's width clear of the side is leaning on
nothing, and that is the tell that made the whole row look wrong.

It is worth writing down that this is _not_ the identity it looks like. The swept
left extent does not equal `-W/2`; it sits `(t/2)(1 - cos θ)` inside it, about
1e-4, because half the book's thickness foreshortens under the lean. The
footprint edge is the exact claim, and it is what G25 asserts.

## How this was decided

_Carried verbatim from the decision log kept while settling it._

- **2026-08-04** — **One usable width; the packer charges the placer's own
  arithmetic; `leanThatFits` deleted.** Three answers were filed; five were
  found. The two unfiled ones were larger than the three filed: a 0.006-a-book
  charging error worth 0.162 across a full row, and a cap that had never bound in
  its life while miscounting the changes it capped. Reconciling was chosen over
  characterizing because the gap was not a rounding difference — a "full" shelf
  was leaving three books' worth of wood bare and had stopped meeting the
  proportion `CLAUDE.md` states it was built to. The reserve was set to 0.06 by
  keeping the existing constant rather than by preserving the rendered density;
  the alternative, ~0.33, would have hard-coded the charging error as an
  intentional aesthetic. **The number was re-measured after the cost model
  existed rather than before**, because the estimate that justified it was taken
  under the old charging model, and face-out books get dearer under the new one
  (0.008 → 0.016). It came back at a maximum of 30 books a row, so the
  proportion argument survived; had it landed at 28 or 33 the reserve would have
  needed revisiting.
