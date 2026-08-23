# Shelf placement got an interface — no gate

[#25](https://github.com/mephistopheles4/stacks/issues/25). `placeBooks` decided
where every book went and mutated the scene graph in the same loop, so the only
way to ask where a book had ended up was to render the shelf on a GPU. It is now
`placeShelf(rows) -> Placement[][]` in `packages/site/src/shelf/placement.ts`,
with `case.ts` holding the bookcase's dimensions and `buildBooks` doing the
Three.js half. [ADR-0029](../adr/0029-placement-imports-the-case.md) has the
design; `CONTEXT.md` gained **footprint**, **contact** and **run**.

**No row was added to [`gates.md`](../gates.md), on purpose.** There is no defect
here — the seventeen new tests are tests, not a scored rule. The tempting row is
"no placement breaches the case", and it was refused: that is arithmetic checking
arithmetic, written the same day by the same person, and scoring it invites
reading a green board as _books are inside the case_. G16 already claims that
rule and measures the rendered scene. The `hashUnit` duplication would have been
the other candidate; it was collapsed instead, and a row guarding against a
second FNV-1a nobody has written yet is an obligation for an unobserved failure.

The argument against all of that is **G21**, which was written for a rule two
files already claimed was true and both were false for months, with nothing red
because nobody looked. The distinction relied on: G21's rule was already broken
when its row was written, and this one becomes true by construction in the commit
that creates it. If that reads thin later, the hash row is ten lines.

**The screenshot cannot check a change like this, and that was measured.** Three
runs of _identical_ code produce three different PNG hashes. Decoded to pixels,
runs either agree exactly or differ by 20–41 of 1,296,000, always at channel
delta 1 — driver antialiasing jitter, still there with the code reverted. So
`artifacts/shelf.png` has a noise floor of ~40 pixels and the lift's diff was 23.
Anything that actually moved a book moves thousands, by much more.

What _did_ prove it: a throwaway probe dumping every book's real world transform
out of the rendered scene, before and after. Identical, with `caseOverflow`
agreeing to the last digit (`0.0012000000000000899`). Transcribing the old
arithmetic into a comparison function would only have compared the new code
against a fresh copy of the same misreading.

**Three of the seventeen tests were green under mutation on the first sweep**,
and each was a fixture that never reached the case it named:

- the clearance test asserted two books merely did not overlap — which stays true
  with the clearance deleted. It now names the amount.
- the "no gap at the start of a row" fixture repeated years on a four-cycle, and
  after the newest-first sort no row ever _began_ on a year change. Unique
  descending years fix it, plus an assertion that the fixture still has the shape
  the test needs.
- a book you are reading gets its own year (`yearOf` returns `'reading'`), so a
  face-out book always arrives behind a year gap — which stands its neighbour
  straight and removes the angle change being tested. The fixture uses an
  explicit `face_out` inside one year now.

All seventeen were then observed red by mutating the line each covers.

**Settled since, as [#36](https://github.com/mephistopheles4/stacks/issues/36):
three live answers to "how wide is a shelf", and it turned out to be five.**
`case.ts` states `USABLE_WIDTH` and `toRows` packs into it; the cursor still runs
flush from `-SHELF.width / 2`, which is where that band begins; `leanThatFits` is
deleted. See [ADR-0031](../adr/0031-one-usable-width.md) and G25.

The two answers nobody had filed were the larger ones. The packer charged
`footprint + 0.008` a book where the cursor spends `+ 0.002` shelved or `+ 0.016`
face-out — **0.162 across a twenty-seven book row**, as much as the entire
`padding * 2 + LEAN_ALLOWANCE` the issue was about. And `leanThatFits` counted
angle changes by `faceOut` transitions alone, blind to the upright book after a
year gap that the cursor pays clearance for — latent, because measured across a
120-book library it returned 0.72, 1.26, 1.12 and 1.00 radians against a
`MAX_LEAN` of 0.062. It had never once bound.

**The measurement is the part worth keeping.** A full row was leaving 0.374 of
bare wood at its right end, which decomposes as 0.17 of declared reserve, 0.162
of that charging error, ~0.10 of wrap granularity, less ~0.06 of clearance —
only the first of the four on purpose. Rows now hold 27–30 books against the ~30
`CLAUDE.md` says the case was built to, and G16 reports `case overflow 0.0012`
before and after, which is `SKIN` and not slop.

**Deleting `leanThatFits` moved its bug rather than removing it.** The packer is
now the only thing budgeting clearances, so its change count has to include
year-gap uprights or containment stops holding. That is `leansInPlace`, exported
from `placement.ts` and read by the packer instead of copied.
