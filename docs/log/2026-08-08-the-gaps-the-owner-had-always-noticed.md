# 2026-08-08 — the gaps the owner had always noticed

Three different things were making holes in the rows, and only one of them was
the one being asked about. Measured off `placeShelf` against the live library
rather than off the picture:

| what it looks like       | how wide      | what it is                                                   |
| ------------------------ | ------------- | ------------------------------------------------------------ |
| a hair                   | 0.002         | `TOUCHING`, inside a run — invisible, and meant to be        |
| a finger                 | 0.016         | `bookGap * 2`, either side of a face-out book                |
| a wedge, widening upward | 0.02–0.05     | a leaning run meeting a square book: geometrically forced    |
| **a slab, full height**  | **0.09–0.12** | **`YEAR_GAP`, and the book beside it standing bolt upright** |
| a slot, full height      | up to 0.007   | a short book followed by a taller one in a run — see below   |

⚠️ **The last row was missing from this table when it was written**, which is the
same omission the table is about. It is the mirror of the collision in the next
entry — the same arithmetic, the other sign — and the first version of the fix
clamped it away in one direction and left it in the other.

The slab is the one the arrows were pointing at, and it was two decisions
compounding: the gap itself, which is deliberate and stays, and the rule that
stood the book on the far side of it perfectly straight, which was wrong. It
leans across the gap now, pivoting on its base — see
[ADR-0039](../adr/0039-a-book-after-a-year-gap-props-against-its-neighbour.md) for
why the pivot is the whole trick and why the wedge it opens on the _right_ is a
price rather than a bug.

What was compared, row 4 of the live shelf: _The Power of Now_ and _Practical AI
Governance_, each behind its own year gap, sitting between the face-out _Learning
Systems Thinking_ and the face-out _Charisma Myth_. Before, they stand dead
vertical in the middle of the row with a slab of bare wood on each side and read
as two books somebody forgot to push in. After, they lean into the kingfisher
cover with _Staff Engineer_ following them over, and the bare wood is a wedge
under their feet.

⚠️ **The crops themselves are not in the repo** — `artifacts/` is gitignored, and
they were shot from the dev server at `deviceScaleFactor: 2`. Re-shooting them is
a dozen lines of puppeteer against `pnpm dev`, and the numbers in the table above
are the durable part.

**What the render decided that the arithmetic could not.** Closing 9cm on the
left opens roughly 9cm at the top right of the run — that is conserved, and no
choice of pivot avoids it. Whether the trade is worth taking is a question about
what a slab of empty shelf reads as versus what a wedge over a slumped run reads
as, and the only instrument for that is the two pictures side by side.

**Two approximations went from tolerable to visible at the new angle**, which is
the ordinary way one becomes a defect. The lift that keeps a tilted book's low
corner on the plank had dropped its cosine — 0.0008 at 3.5°, 0.004 at 9°, a
hairline of daylight under the book. And the painted contact shadow was drawn
under the book's _middle_ rather than under its foot, which a leaning book's foot
is not: 2cm out at an ordinary slump, 5cm at a propped one. Both are exact now.

Gates: `pnpm test` green, `pnpm typecheck` clean, and **G16 `smoke:render`
case overflow 0.0000** on the 50-book fixture — 49 books, draws 374, triangles
4068, textures/geometries/programs 71/23/5, all unchanged. G25's named excess
grew a second term (one maximal prop per gap); `shelf-width.test.ts` carries it.
