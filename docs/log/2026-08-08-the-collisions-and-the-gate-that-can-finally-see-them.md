# 2026-08-08 — the collisions, and the gate that can finally see them

The owner looked at the propped books in a close-up and marked two places where
one board was plainly *inside* another. Both were real, and neither moved any
number this project had:

| where | how deep | cause |
| --- | --- | --- |
| a propped book against a leaning one | 8mm | the prop measured its reach to the neighbour's **footprint** |
| the same, where the neighbour is shorter | 18mm | the same, plus the neighbour's lean added to a *corner* contact |
| any tall book followed by a short one in a run | 2.3mm | "a run packs flush" — false since runs existed |

The first two are [ADR-0039](../adr/0039-a-book-after-a-year-gap-props-against-its-neighbour.md)'s;
the third predates all of this. A leaning book's low corner bulges `sway` right
of its footprint and its top corner recedes `sway` left of it, so a footprint is
not a book, and `sway` scales with *height* — which is why two books at the same
angle and different heights do not sit where the cursor thinks they do.

**No gate could see any of it, and that is the finding.** G16 measures the case's
inner faces and two books can intersect each other happily inside those; every
width assertion in `shelf-width.test.ts` works in footprints, which is what the
cursor budgets in and exactly the wrong coordinate for this question; and
`placement.test.ts` asserted flushness between two books of *identical* height,
where the defect is identically zero. 509 tests, four of them about this file's
spacing, and the render is what caught it — again.

So there is now one that walks the actual boards, and it is scored: **G28**, in
[`docs/gates.md`](../gates.md), where the lessons it taught live — including the one
about how it was wrong first, in the way that flatters the code it tests.

**Two more things fell out of the review of that fix**, neither of which either
review axis was looking for:

- **`SHELF.endReserve` was sized against `MAX_LEAN`** — the steepest a book
  slumps of its own accord, 3.5° — while books had been leaning at up to 9.2° for
  a whole change. The last book of a row pays its swing out of that reserve and
  nothing else, so it was sized for 0.03 against an actual worst of 0.117, and
  **G25 stayed green throughout, comparing against a constant that had stopped
  bounding anything.** It is `MAX_PROP_LEAN` and 0.12 now.
- **`MAX_PROP_LEAN` was 9.2° and it bound**, which meant the second book of a
  chain stopped short of its neighbour — a book resting on air, in a request whose
  words were "even if there is a gap with a bigger angle". The compounding it
  guarded against does not compound: the chain case contacts a *corner*, where the
  neighbour's slope is already accounted for, so it converges at 12.7° on the
  worst fixture and 9.8° on the real shelf. The ceiling is 14.3° and nothing
  reaches it.

Gates after: `pnpm test` green, `pnpm typecheck` clean, **G16 case overflow
0.0000**, draws/tris/textures unchanged at 374 / 4068 / 71. G25's named excess now
carries three terms — a maximal swing per angle change, a maximal prop per gap,
and a maximal parallel push per book.
