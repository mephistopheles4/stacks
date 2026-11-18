# The anchor camera prototype (#637)

**Date:** 2026-11-18. **Issue:** [#637](https://github.com/mephistopheles4/stacks/issues/637), which also closes [#636](https://github.com/mephistopheles4/stacks/issues/636). **Records:** [ADR-0192](../adr/0192-the-room-turns-pans-and-zooms-with-orbitcontrols-about-an-anchor-at-the-centre-of-the-screen.md) and [ADR-0193](../adr/0193-the-room-is-a-cutaway-the-camera-may-stand-outside-it-and-its-walls-are-drawn-from-the-inside.md). **Spec:** [revision 2](https://github.com/mephistopheles4/stacks/issues/637#issuecomment-6990624251).

## The question

Does the room feel better on a phone with `OrbitControls` as it ships than with the custom gesture layer that [ADR-0185](../adr/0185-two-fingers-pan-the-room-and-a-pinch-or-a-pan-is-decided-once-per-touch.md) and [ADR-0188](../adr/0188-one-finger-turns-the-room-the-other-way-from-a-mouse.md) record? The two costs the issue named: the two-finger pan lagged, because it ran through a queue that eased 25% a frame, and the one-finger turn was flipped.

## The run

The prototype lived on `prototype/637-anchor-camera`, thirteen commits on `main` plus the drafted ADRs, behind `?cam=anchor`. It was tried on a Pixel 10 Pro XL and in desktop Edge, and each commit below answered something the phone showed. It was never merged; the build re-committed what it kept.

1. `4c82fe6` put `OrbitControls` in the room as it ships, its target held a fixed distance ahead, with a pill to flip the camera and the distance. Scroll and pinch carried the camera and the target forward together.
2. `2801a20` added `?pivot=auto`, which puts the anchor on the first surface at the centre of the screen. A turn now keeps the anchor and the camera comes in toward it at a wall. Finding: a fixed pivot spun on the spot at any distance, because the anchor slid with the camera.
3. `d00b5d2` made a turn come in along the line to the anchor to the farthest free place, and below 1.5 units turn in place, so a wall never holds a drag still. Finding: a camera inside the bookcase was pushed out through its nearest face, which undid the turn.
4. `dcd5979` let the camera go up to 10 units past the walls behind `?walls=cutaway`, with a clipping plane cutting the near wall.
5. `68f0328` dropped the clipping plane for the real thing: the faces of the walls, panelling, trim and ceiling that point out of the room are removed at load, so every wall is drawn from the inside only.
6. `eb4af43` widened the range to 50 units. Finding: at the outer limit a turn pulled the camera in toward the anchor, and a new touch put the anchor far across the room, so zooming out dragged the camera back inside. At the limit the camera now slides along it.
7. `8551608` anchored on the point of the line of sight nearest the room's centre when the pick lands outside the room. Finding: from outside, a pick could land 40 units away, and a turn about it swung the camera through a huge arc. It also added the on-screen readout the later fixes were read from.
8. `e28556f` set the distance limits every frame, and placed the anchor less often. Finding: the page's framing sets `maxDistance` after the room is entered and `OrbitControls` clamps to it each frame, so a pan, which nothing puts back, snapped the camera in to about 17 units. It read as a zoom when a second finger landed.
9. `1fb7db3` moved the fog and the far plane out with the camera. Finding: the fog's range is a multiple of the opening framing distance, so a camera tens of units out faded the room into the dark background.
10. `b7f91d5` counted a pick within a one-unit margin of the room's box as the room's, and kept the hit when the room's centre is behind the camera. Finding: the phone's readout showed `anchor off-room 7.0 -> -0.6` and then `d=0.50`; a pick on the floor or on a wall-backed bookcase landed on the box's face, the fallback lay behind the camera and was clamped to half a unit, and every pan until the next anchor crawled.
11. `e5c46a5` added the keyboard: W, A, S, D, Space, C, Q and E, Shift for three times faster, read on the window, ignored while typing and dropped on blur.
12. `221fd15` placed the anchor at the start of every pan and floored the pan's rate. Finding: `OrbitControls` pans in proportion to the anchor's distance and a walk carries the anchor along, so after walking up close a pan still ran at the rate of something far ahead.
13. `6f66bd5` made a zoom step a share of the distance ahead, with the raycast behind it at most once every 100 ms. Finding: a fixed step lunged at a book up close and barely moved across the room.

The ADR drafts are `1a20edd`, the fourteenth commit on that branch.

## What the build changed on the way

Everything above ships as the prototype left it, except where the spec says otherwise: the keys are taken only in a room, only from the page or the canvas, and never with a dialog open or a book held (the prototype took Space from a focused button, so Space stopped pressing it); leaving a room puts back all seven `OrbitControls` fields the room changes, where the prototype put back four; and the cutaway runs when the room's group is added, before any frame can draw an outer face. The solid-walls branch, the fixed pivot, the mode pill, the readout and the three globals are not carried.

## Not run

The hand check on real phones (spec C14) and the device check after merge (C15) are the owner's.
