# ADR-0192 — The room turns, pans and zooms with `OrbitControls` as it ships, about an anchor picked at the centre of the screen

**Date:** 2026-11-18
**Status:** accepted, built in [#637](https://github.com/mephistopheles4/stacks/issues/637) (and closes [#636](https://github.com/mephistopheles4/stacks/issues/636)).
**Issue:** [#637](https://github.com/mephistopheles4/stacks/issues/637), part of the room ([#593](https://github.com/mephistopheles4/stacks/issues/593))
**Spec:** [`## Spec: Anchor camera (revision 2)`](https://github.com/mephistopheles4/stacks/issues/637#issuecomment-6990624251) on #637, S4 D1, S5 and S8
**Supersedes:** [ADR-0185](0185-two-fingers-pan-the-room-and-a-pinch-or-a-pan-is-decided-once-per-touch.md) and [ADR-0188](0188-one-finger-turns-the-room-the-other-way-from-a-mouse.md), whole. **Amends** [ADR-0178](0178-the-room-is-closed-by-its-own-wall-pieces-and-the-camera-comes-in-at-the-box.md) items 5, 6 and 8: the pull-in toward the target, coming in no nearer than `minDistance`, and the head turn after a walk. **Departs from** the room spec's S8.3 on #593 ([revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)), "Zoom moves at one rate to the bound and stops there": a zoom step is now a share of the distance ahead.

## Decision

1. **`OrbitControls` drives the room as it ships.** One finger or the left button turns, two fingers pan
   and pinch at once, the right button and a modified left drag pan, damping stays on, and every
   direction is `OrbitControls`' own. The custom gesture layer goes: the two-finger split decided once per
   touch (`room-gesture.ts`), the queued and eased pan, the head turn after a walk, and the negated
   `rotateSpeed` for a finger. Only the dolly stays off in a room, because the zoom walks (item 4).
2. **The target is an anchor picked at the centre of the screen.** A raycast from the screen's centre
   finds the first visible mesh, and the anchor goes that far along the line the camera already looks
   down, so placing it never moves the view. A hit outside the room's box (with a 1-unit margin), or no
   hit, falls back to the point on the line of sight nearest the room's centre, or the hit if that is nearer; when that point is behind
   the camera the hit is kept, or 6 units ahead. The anchor stays between 0.5 and 60 units ahead.
3. **It is placed at room open, after a reframe or a held book, at the start of every pan, and at the
   first turn after a walk, a pinch or a pan.** A turn on its own never moves it, so a drag orbits what
   the visitor was looking at, and a turn after moving orbits what is in front now.
4. **A zoom walks the camera and the anchor together by a share of the distance ahead**: the existing
   step times the distance to the first mesh at the centre, clamped to 1..40, over 6 — about 8% a wheel
   notch. The wheel is eased as before; the pinch is applied as the fingers move.
5. **The pan has a rate floor**: `panSpeed` is `max(1, 2 / reach)`, so panning a surface right in front
   never crawls.
6. **The distance limits are written every step** (`minDistance` 0.05, `maxDistance` unbounded), because
   the page's framing sets `maxDistance` after the room is entered and `OrbitControls` clamps to it each
   frame.
7. **The keyboard turns and walks in a room**: W/S forward and back, A/D sideways, Space up and C down
   (not Ctrl, which closes the tab with W), Q/E orbit the anchor, Shift three times faster. Taken only in
   a room, only when the event's target is the page body or the canvas, with no dialog open, no book
   held and no Ctrl, Meta or Alt, so Space still presses a focused button; a key let go always lets go,
   and every held key is dropped on blur and when a book is picked up.

## Why

The issue named the old layer's two costs: the two-finger pan lagged because it ran through a queue
easing 25% a frame, and the one-finger turn was flipped (ADR-0188 flipped it on purpose, and on a phone
it read as wrong). A prototype behind `?cam=anchor` replaced the layer with `OrbitControls` as it ships
and added the anchor, because a fixed target far across the room swung the camera through a huge arc on
every drag and made the pan's rate depend on a point the visitor could not see. The owner tried it on a
Pixel 10 Pro XL and in desktop Edge and called it ready to ship.

**What is given up,** and was held by test before: a touch decided once as a pinch or a pan (a two-finger
touch can now do both), a pan of a fixed length a pixel, ADR-0185's refusal of Ctrl and Meta as pan keys
(`OrbitControls` takes them), and a camera that turns its head in place after a walk. ADR-0178's pull-in
along the line to the target stays only for the main bookcase's keep-out, and nearer than 1.5 a turn
turns in place, which is ADR-0178 item 6's worry met another way.

**Considered and set aside:** a fixed anchor a set distance ahead (the issue's first candidate, `?pivot=`),
which made the pan and the zoom feel the same at any depth but orbited empty air in front of a far wall;
and keeping the old layer behind a switch, which would be two cameras to keep matching.

## How this was decided

The owner opened #637 with the question and the fixed-pivot candidate. The prototype's thirteen commits
on `prototype/637-anchor-camera` moved from the fixed pivot to the auto anchor, then fixed what the phone
showed: a snap when a second finger landed, a pan that crawled near the anchor, a zoom whose speed varied
with depth. The owner accepted the anchor camera as the only room camera, the keyboard, and the removal
of the prototype's scaffolding when asking for the spec. The build reuses the prototype's code rather
than rewriting it.
