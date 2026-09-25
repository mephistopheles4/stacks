# A large library renders black

**2026-09-25** — [#383](https://github.com/mephistopheles4/stacks/issues/383).
Found while checking [#381](https://github.com/mephistopheles4/stacks/issues/381)
on a Pixel 10: a 273-book generated library drew an almost black page. The live
site did the same, and so did `?shadows=0`, so #381 did not cause it.

## The answer first

- **The fog painted the whole bookcase the room colour.** The fog's range was
  `near: 14, far: 30` in world units. `frameCamera` backs the camera off as the
  bookcase grows, and 17 shelves frame at 36, past the far edge. The bookcase
  region measured **22.6**, which is exactly the luma of `0x1a1613`. With the
  fog off it measured 69.5.
- **The fix makes the range a multiple of the framing distance**, `1.55` and
  `3.32`. Those are the old constants over 9.03, where today's four shelves
  frame on a desktop. See
  [ADR-0092](../adr/0092-the-fog-range-is-measured-in-framing-distances.md).
- **The desktop shelf did not change.** A pinned `?woodSeed=` diff of the
  50-book fixture showed 11 pixels at delta 1, against a noise floor of 5 pixels
  at delta 1.
- ⚠️ **An upright phone did change, by at most 5 of 255.** The fog had been
  reaching the front of today's shelf there, which is the same defect on four
  shelves. It no longer does.
- **G59 (`large-library-lit`) now reads the picture.** It went red with the old
  fog: *the large library renders dark: its bookcase stands -0.0 above the room,
  against 68.1*. With the fix it is green at 47.6 against 68.1.

## Reproducing it

`pnpm fixtures:50 --books 300` now writes `fixtures/vault-300/`. Its public
build keeps 273 books. `?books=N` renders the first N of them over one build.
Brightness is the mean Rec. 709 luma over the rectangle the books project into,
read at a device pixel ratio of 1. The whole-canvas mean does not tell a black
page from a lit one: 22.6 against 25.3 at 1440×900, because most of the canvas
is room either way.

The bookcase region at 480×640, before the fix:

| Books | Fog on | Fog off |
| --- | --- | --- |
| 49 | 86.2 | 86.2 |
| 200 | 76.6 | 82.2 |
| 240 | 33.0 | 74.7 |
| 260 | 22.6 | 69.2 |
| 273 | 22.6 | 70.0 |

After the fix, fog on and fog off read the same at every size measured — 49,
200, 240 and 273 books — at 1440×900, 480×640 and 412×915.

## Why nothing caught it

`pnpm smoke:render` renders the 50-book fixture at 1440×900, where the fog
never reached the bookcase: at 49 books there, fog on and fog off both measure
85.2. The gate counted books and distinct colours, and both are properties of
what was drawn rather than of what could be seen. #381's branch renders a large library
for G60, and it renders black there too, but that gate counts shadow-map
readers and never looks at the picture.

## What is still sized for a short bookcase

These are listed on #383 and not fixed here.

- **The camera's far plane is 100.** The orbit's dolly-out limit is 2.4
  framings, which passes it at 20 shelves, about 320 books.
- **The lamp is a point light with `distance: 14`.** 273 books with the fog off
  read 69.5 against 85 for 49 books. The lamp is the likely reason, and that has
  not been measured.
