# ADR-0092 — The fog range is measured in framing distances, not world units

**Date:** 2026-09-25
**Status:** accepted
**Ticket:** [#383](https://github.com/mephistopheles4/stacks/issues/383)

## Decision

`scene.fog.near` and `scene.fog.far` are multiples of the distance
`frameBookcase` stands the camera back from the bookcase. They were world units.
The shipped values are `1.55` and `3.32`. Those are the old `14` and `30`
divided by `9.03`, the distance today's four-shelf bookcase frames at on a
desktop.

The framing arithmetic moves out of `mountShelf` into a pure
`packages/site/src/shelf/framing.ts`, so a spec can reach it. `frameCamera` sets
the fog each time it frames, and the panel's fog sliders move the multiple.

## Why

**A 273-book library rendered as a black page.** The fog's range was set against
the scaffold's fixed four-row bookcase. The bookcase has grown with the library
since then, and `frameCamera` backs the camera off to fit it. A 17-shelf
bookcase frames at 36, past the fog's far edge of 30. Every fragment of it drew
as the fog colour, which is the background colour by design. The bookcase region
measured 22.6, the luma of `0x1a1613` exactly, against 69.5 with the fog off.

**Proportional is the rule that keeps the picture the same at every size.**
The camera's distance scales with the framing, so a fog that scales with it too
stands the same way behind every bookcase. Dollying out to the orbit's limit of
2.4 framings fades the bookcase by the same 48% on four shelves as on
seventeen. Any fixed offset or fixed range reaches a tall enough bookcase in the
end.

## What changes, measured

A pinned `?woodSeed=` render of the 50-book fixture, before and after, diffed
pixel by pixel. An after-against-after pair is the noise floor, and a fog pulled
onto the bookcase through `?tune=` is the positive control.

| Viewport | Before vs after | Noise floor | Positive control |
| --- | --- | --- | --- |
| 1440×900 | 11 px differ, max delta 1 | 5 px, max delta 1 | 330,062 px, max delta 51 |
| 412×915 | 110,144 px differ, max delta 5 | 0 px | 113,117 px, max delta 53 |

**The desktop shelf is unchanged, within the renderer's own noise.** At 16:9 and
16:10 the four shelves are height-bound and frame at 9.03, so the fog is where it
was, to within 0.03 of a world unit.

⚠️ **An upright phone does change, by at most 5 of 255, and that is the fix
reaching it.** A phone frames the same four shelves at 15.5, because the width
binds there. The old `near: 14` therefore reached the front of the bookcase: the
same defect, on four shelves. With 49 books of the generated library at 412×915,
fog on read 85.6 in the bookcase region against 86.6 with it off. Now the fog
clears it, as it does on a desktop.

## Rejected

- **A floor on the old range: scale only past a reference distance.** This keeps
  the phone at today's size exactly as it was. But it needs a reference distance
  of at least 15.5, which is today's library on the narrowest phone. That number
  would move whenever the library or the phone did, and below it the phone would
  keep the fog that this ADR removes everywhere else.
- **A fixed offset behind the framed bookcase.** It clears the bookcase at its
  framed distance, but the fade on dolly-out would no longer match across sizes.
  On a tall bookcase the 16-unit band is a small fraction of the framing, so
  dollying out takes it from clear to black long before the orbit's limit.
- **Keeping world units and adding a hidden scale.** The panel slider would read
  `14` while the fog began at 56 on 17 shelves. That is a control that lies, which
  [`docs/shelf-inspectors.md`](../shelf-inspectors.md) rules out.

## Consequences

- **Old `?tune=` links change meaning.** A link carrying `"fog":{"near":20}`
  now asks for twenty framings, which is no fog. `shelf-url.ts` records that
  fog has no historic spelling, so no compatibility is owed. It is named here so
  the silence is not mistaken for an oversight.
- **Other constants still assume a short bookcase, and this ADR fixes none of
  them.** The camera's far plane is `100`, and the orbit's dolly-out limit of
  2.4 framings passes it at 20 shelves, about 320 books. The lamp is a point
  light with `distance: 14`, and 273 books with the fog off read 69.5 in the
  bookcase region against 85 for 49. The lamp is the likely reason, and that has
  not been measured. Both are listed on #383.
- **G59 (`large-library-lit`) holds the outcome in a browser**, and
  `framing.test.ts` holds the arithmetic. It checks every shelf count from 2 to
  40 at seven aspects, and a planted world-unit range fails it.
