# The ceiling trim on the walls that closed the room (#631)

**Date:** 2026-11-17. **Issue:** [#631](https://github.com/mephistopheles4/stacks/issues/631), after [#620](https://github.com/mephistopheles4/stacks/issues/620) and [ADR-0178](../adr/0178-the-room-is-closed-by-its-own-wall-pieces-and-the-camera-comes-in-at-the-box.md).

## What was wrong

The owner saw, on the live site on a phone, the ceiling meet the wall with no crown trim where #620 closed the
room. The cornice is not part of the wall pieces #620 copied: `dress_ceiling` (`packages/site/rooms/shared/dress/ceiling.py`)
builds it, and it ran `back_y - walls_front` along each side wall with `walls_front=-10.0`, the side walls' old
end. The side walls now run to y -13, so the trim stopped 3 units short of the front wall, and nothing ran
along the front wall at all.

## What changed

`walls_front` is -13.0, the front wall's face, so both side runs reach it, and a fourth run goes along the
front wall, in the same profile (`PROFILE`) and the same material (`ceiling_cornice`). The runs overlap in the
corners as the back wall's do. The room was rebaked with bake 11's command and encoded; `build.json` is bake 12.

## Seen after the bake

Dev server, `window.__shelf` camera placed by a throwaway hook that is not in the tree. The cornice runs
unbroken along the right wall, the front wall and the left wall, and turns both front corners. Shots are in the
worktree's `artifacts/631/` (not committed): `owner-corner-after.png`, `front-wall-top.png`,
`front-left-corner.png`.

## The white shape beside the globe

Not a missing texture. It is a candle's flame: the side table's candles stand beside the chest and the globe
from the owner's camera, and a flame is a flat, emissive mesh, so at the screen's edge and close to the lens it
becomes one large unshaded shape. The wax and the brass round it are textured. Every `.ktx2` the live site
should serve answers 200 on it. **What was not reproduced** is why the owner's flame was white and the one here
is amber (`white-shape-candle.png`, `white-shape-candle-near.png`), in desktop Chrome with the KTX2 set and
the WebP one. A phone's own tone mapping or its colour space is the guess, and a Pixel is the only thing that
answers it.
