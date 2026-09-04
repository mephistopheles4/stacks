# The placement arithmetic imports the case, rather than being handed one

`placeShelf(rows)` takes the rows and nothing else. The bookcase's dimensions
live in [`packages/site/src/shelf/case.ts`](../../packages/site/src/shelf/bookcase.ts)
and both halves of the shelf — the arithmetic in `placement.ts` and the scene
graph in `scene.ts` — import the same `SHELF`.

The obvious alternative, and the one the issue this came from proposed, is
`placeShelf(rows, shelf)`: inject the geometry, and a unit test can hand it a
narrow case to force a row wrap or drive a book through an upright. That is the
cheapest way to test both, and it was turned down.

## The trade-off

Against importing: a test can no longer shrink the shelf. Row wrap and case
overflow have to be provoked by *feeding more books*, which is slower to write
and reads less directly. This is a real cost and it is paid on the two most
interesting properties.

For importing: an injected case is a case that can silently stop being the one
that ships. The numbers here are load-bearing to a degree that is easy to
underestimate — G16's tolerance is 0.005 and the residual it measures is 0.0012,
which is not slop but exactly `SKIN`, the hair by which a printed cover floats
above its board. A test carrying its own `width` and `padding` would keep passing
on the day production's changed, and would report green about a shelf nobody can
see.

That is not a hypothetical risk in this file. Three different answers to "how
wide is a shelf" were already live when the lift happened:

| where | what it treats as usable |
| --- | --- |
| `toRows` (via `scene.ts`) | `SHELF.width - padding * 2 - LEAN_ALLOWANCE` |
| the placement cursor | `SHELF.width`, flush against the upright, no padding at all |
| `leanThatFits` | `SHELF.width`, full |

They disagree, deliberately or otherwise, and nothing compares them. Injection
would have made a fourth disagreement — the test's — invisible, in the one place
that is supposed to be watching. Filed separately; reconciling them is a
behaviour change and this was not one.

## What this does not change

**G16 is untouched, and this does not weaken it.** `caseOverflow` is still
`Box3.setFromObject` walked over the rendered scene, still measured by
`pnpm smoke:render`, still the only thing that can catch the defect it exists
for: the cursor advances by a book's *thickness*, and a book rotated about its
centre is wider than that, so re-checking the arithmetic only repeats its
assumption. The new unit tests assert what the placements **claim**. Only the
render confirms the scene agrees.

**`ShelfHandle` sheds nothing.** An architecture review suggested `bookCount`,
`caseOverflow` and `projectBook` could retire once placement had an interface.
Two of them cannot: `caseOverflow` *is* G16's measurement and `projectBook` needs
the camera. `bookCount` could have, and deliberately did not — see below.

## How this was decided

- **2026-08-03** — **The case is imported, not injected.** Argued above. The
  deciding consideration was that this repo's characteristic failure is the
  **vacuous pass** — a check that reports success because it examined nothing —
  and a test asserting about its own private shelf is that failure with the
  arithmetic still correct.

- **2026-08-03** — **`bookCount` stays on `ShelfHandle`, and became *more*
  valuable, not less.** Before the lift, placement and `scene.add` happened in
  one loop: a book that was placed was a book that was added, and the two could
  not disagree. Splitting them makes "the arithmetic produced 50 placements, the
  scene received 49" possible for the first time. A unit test asserting
  `placeShelf(rows).flat().length === 50` cannot see that — it would pass while
  the shelf showed 49. The live count read off the rendered page is the only
  thing watching the new seam, so the seam's own change is the argument for
  keeping it.

- **2026-08-03** — **`Placement` carries the contact rect rather than the shadow
  pass deriving it.** A book's contact is not recoverable from its position: a
  face-out book stands at `cursor + coverWidth / 2` but leaves a rect
  `coverWidth` across and only its own `thickness` deep. Taking the cover's width
  for both painted a shadow the size of the cover flat on the wood — a smudge in
  front of a book, thrown by a light in front of it. Deriving it later means
  handing the shadow pass the `ShelfBook` and re-doing the same case split, which
  is the same interface in a worse place; carrying it puts the one contact-shadow
  defect this project has actually shipped inside a unit test's reach.
  `contact.x` equals `position.x` for every book today. It is kept anyway,
  because "equal today" is precisely the class of assumption G16 exists because
  somebody made.

- **2026-08-03** — **The lift was proved inert against the scene graph, not
  against a re-reading of the code.** A throwaway probe dumped every book's real
  world transform out of the rendered shelf, before and after; the two captures
  are identical, and `caseOverflow` agrees to the last digit
  (`0.0012000000000000899`). The alternative — transcribing the old arithmetic
  into a comparison function — would have compared the new code against a fresh
  copy of the same misreading. Recorded because the probe is deleted and the
  method is the part worth keeping.

- **2026-08-03** — **The screenshot cannot be compared byte for byte, and this
  was measured rather than assumed.** Three runs of *identical* code produced
  three different PNG hashes. Decoded to pixels, runs agree exactly or differ by
  20–41 pixels out of 1,296,000, always at channel delta 1 — driver-level
  antialiasing jitter, present with the code reverted. So the noise floor is
  ~40 pixels at delta 1, and the lift's 23 sits inside it. Anything that actually
  moved a book would move thousands of pixels by much more. Worth writing down
  because "the screenshot is unchanged" is the obvious way to check a change like
  this and it does not work here.

- **2026-08-03** — **`buildBooks`, because `buildShelf` was taken.** The
  scene-graph half was going to be `buildShelf` until the compiler pointed out
  that name already belongs to the function building the case's planks and
  uprights. `buildBooks` sits beside the `buildBook` it calls and needed no
  renaming elsewhere; renaming the existing one to `buildCase` would have been
  more accurate and was rejected as churn inside a commit whose whole claim is
  that nothing changed.
