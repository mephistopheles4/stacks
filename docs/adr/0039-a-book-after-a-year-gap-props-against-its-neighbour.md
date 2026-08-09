# A book after a year gap leans across it, rather than standing to attention beside it

A year change opens `YEAR_GAP` — 0.09, about a finger's width — where a bookend
would sit. The book on the far side of it used to stand perfectly upright, on
this reasoning, which was in `placement.ts` from the day the gap was:

> A run is broken by a year gap: the book after one has open shelf on its left
> and nothing to rest against, so it stands up straight and becomes the support
> for the books after it.

The second half of that is what was wrong. There *is* something to rest against;
it is one gap away. A book with 9cm of air beside it does not stand square on a
real shelf, it topples until it meets its neighbour — and the owner had noticed
these gaps for months before asking what caused them, which is the tell that they
were reading as a defect rather than as a separator.

So the book leans until its top corner reaches the neighbour's board, at whatever
angle that takes: about 6° for a gap this wide, and the run behind it inherits
that angle the way a run always inherits the lean of whatever holds up its left
end. `MAX_LEAN` — the 3.5° ceiling on an ordinary slump, "beyond that it looks
knocked over" — does not apply, because a book that has *been* knocked over is
what this is. It gets its own ceiling, `MAX_PROP_LEAN`.

## The gap does not close. It tilts.

This is the part worth writing down, because the obvious implementation gets it
backwards and looks worse than doing nothing.

Every other book on the shelf is placed by its footprint and rotated about its
**centre**, which swings its top-left corner out by `sway` and its bottom-right
corner in by exactly the same amount. Symmetric. Under that pivot, closing a gap
`g` at the top needs `sin θ = 2g/h` — twice the angle you would expect — and it
opens `2g` at the bottom. The gap does not close; it doubles and moves down.

A propped book pivots on its **bottom-left corner** instead. Then `sin θ = g/h`,
the foot stays exactly where it was, and what is left is a wedge of air at the
plank instead of a slab of it at eye level. The renderer still rotates about the
centre — that is one `book.rotation.z` for every book on the shelf and it stays
that way — so the cursor solves for the centre that puts that corner where it
belongs, and shifts the book left by `propShiftOf`.

Two contacts, depending on how tall the neighbour is:

| | contact | angle |
| --- | --- | --- |
| neighbour tall enough to be met | this book's top corner, on its board | `θ = leftLean + asin(reach · cos leftLean / height)` |
| neighbour shorter | the neighbour's top corner, on this book's board | `tan θ = (gap + recede) / cornerHeight` |

They agree at the boundary (this book's contact height equals the neighbour's
corner height), so a neighbour a millimetre shorter does not change the answer by
a degree. Both cases occur on the real shelf today; assuming the first gives a
book resting on thin air above a shorter neighbour.

⚠️ **The neighbour's footprint is not the neighbour**, and the first version of
this measured to the footprint. A leaning book's low corner bulges `sway` right
of it and its top corner recedes `sway` left of it, so the real distance to cross
is not the one the cursor is holding — and the error is an *over*-lean, which
means one board driven through another rather than a gap left open. It came to
8mm at one place on the live shelf and 18mm at another, both plainly visible in a
close-up, and it survived a green test suite and a green G16.

Only the board case adds the neighbour's own lean, and that asymmetry is the
thing to keep straight: a book resting on a sloped *face* lies parallel to it, so
the slope is part of the angle. A book resting on a *corner* does not — the slope
is already accounted for in where that corner is, and adding it again is exactly
the over-lean above.

## What it costs

**It moves a wedge to the right end of the run**, and there is no arithmetic that
avoids that. A leaning book beside an upright one always leaves a triangle; a
steeper lean leaves a bigger one. Closing 9cm of daylight on the left opens
roughly 9cm at the top right, where the run meets the next face-out book. The
render is why this shipped anyway: a slab of empty shelf at eye level reads as a
missing book, and a wedge above a slumped run reads as a shelf somebody uses.
`docs/progress.md` describes the two crops that were compared; the images
themselves are not in the repo, `artifacts/` being gitignored.

**A face-out book now ends the run behind it**, which it did not before. The
slump used to carry straight through one, so every shelved book between two year
gaps shared an angle however many broad flat supports stood between them. That
was harmless while every angle came from the same 3.5° wave. It is not harmless
now: one propped book would hand its 9° to the whole rest of the row, and a shelf
where everything past the first gap has fallen over is not what propping one book
was meant to buy.

**`MAX_PROP_LEAN` is a backstop that nothing reaches.** Crossing one gap takes
about 6°; the live shelf's steepest is 9.8°, and a fixture with a year change at
every one of sixty books tops out at 12.7°. The ceiling is 14.3°.

⚠️ **It was 9.2° and it *bound*, and that was wrong.** The second book of a chain
stopped 4.7° short of its neighbour — a book resting on air, in the one case the
owner can actually see — and the owner had said *"even if there is a gap with a
bigger angle"*, which is permission for whatever angle it takes. The ceiling was
declining the spec's own escape clause without asking.

It was there to stop compounding, and compounding turned out not to compound. A
propped book inherits its neighbour's angle only when it lands on the neighbour's
**board**; the chain case lands on its **corner**, where the neighbour's slope is
already accounted for in where that corner is. So a chain converges instead of
running away, and the ceiling can sit above everything rather than inside it.

It stays a module constant rather than joining `ShelfSettings`. The panel is for
numbers that are "pure look, unknowable without seeing it" — this is a limit
nothing reaches, and a slider for it would dial nothing.

## `SHELF.endReserve` was sized for an angle that stopped being the steepest

Clearance for a lean is charged to the *left* of the book that leans; the last
book of a row has nothing on its right, so its swing is paid for by `endReserve`
and by nothing else. G25 pins that: `endReserve ≥ swayOf(MAX_HEIGHT, …)`.

Against `MAX_LEAN`, which is the steepest a book slumps *of its own accord*. A
propped book leans four times further and a run inherits the angle, so the last
spine of a row can carry 0.117 of swing into a reserve sized for 0.03 — and the
gate that exists to catch exactly that was comparing against a constant that had
stopped bounding anything, and stayed green. It is `MAX_PROP_LEAN` and `0.12` now,
bounded above as well as below so the reserve cannot grow to paper over a defect
instead of exposing one.

Neither review axis caught this; it fell out of asking what the ceiling would cost
if it were raised. **A scoreboard row does not protect an invariant — the
assertion does, and only while it still names the right number.**

**The packer got looser, in the safe direction.** `shelfCost` charges a year gap
in full while the cursor hands `propShiftOf` of it straight back, because the
prop angle depends on which neighbour the book lands beside and that is the very
thing the wrap has not decided yet. So G25's named excess grows a second term —
one maximal prop per gap, on top of one maximal swing per angle change. Charging
more than you spend is the direction that keeps books inside the case; the ceiling
on it is what stops "conservative" from meaning "unchecked".

## "A run packs flush" was false the whole time

The comment said neighbours at the same angle stay parallel and never collide,
which is true of the *boards* and false of the books. A book tilted about its
middle stands on a base swung `sway` right of its footprint, and `sway` is half
its **height** times the angle — so at one angle, from footprints `t` apart, a
tall book and a short one do not have bases `t` apart. A tall book followed by a
short one has its low corner inside its neighbour: 2.3mm on the live shelf at an
ordinary 3.2° slump, four times that at a propped angle. It predates this work by
as long as there have been runs.

`parallelPushOf` is the whole difference in closed form, and it comes to nothing
when two neighbours are the same height and thickness — which is why a fixture of
uniform books could never have shown it, and none of the five fixtures G25 packs
has both varied heights and long runs.

**It is signed, and applied both ways.** The mirror case is a short book followed
by a taller one, which opens 7mm of daylight instead of closing 7mm too much —
the same error with the other sign, and the one that clamping the push at zero
left in place while calling the collision fixed. Half an error is not a fix, and
"no worse than before in one direction" is not a bound.

The packer charges it at `MAX_PROP_LEAN`, per book rather than per angle change,
which is the part that had no precedent: every clearance before this was charged
where the angle *changed*, on the belief that nothing was owed where it did not.

## Two things that were quietly wrong, and only showed up at this angle

Both were invisible at 3.5° and are not at 9°, which is the ordinary way a
tolerable approximation becomes a defect:

- The lift that keeps a tilted book's low corner on the plank dropped its cosine.
  That is 0.0008 of a unit at the steepest ordinary slump and 0.004 at a propped
  one — a hairline of daylight under the book. The exact form costs one cosine.
- The painted contact shadow was drawn under the book's *middle*, and a leaning
  book's foot is not under its middle: the bottom edge swings out by `sway`.
  Worth 2cm on an ordinary slump and 5cm on a propped book, which is half a spine
  of daylight between a book and its own shadow.

## What was not done

The wedge where a leaning run meets a face-out book is geometrically forced and
is left alone. A face-out book is turned a quarter turn and its 0.06 tilt swings
in Y and Z, not along the row — it cannot lean back to meet the run, and making
it lean along the row would mean a cover that is not facing the room.
