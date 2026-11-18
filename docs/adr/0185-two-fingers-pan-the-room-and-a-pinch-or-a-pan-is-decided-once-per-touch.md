# ADR-0185 — Two fingers pan the room, and a touch is a pinch or a pan, decided once

**Date:** 2026-11-17
**Status:** accepted, built in [#632](https://github.com/mephistopheles4/stacks/issues/632). **Amends [ADR-0178](0178-the-room-is-closed-by-its-own-wall-pieces-and-the-camera-comes-in-at-the-box.md) item 8**, which switched pan off in a room and left two-finger pan out on purpose; the owner has now asked for it.
**Issue:** [#632](https://github.com/mephistopheles4/stacks/issues/632), part of the room ([#593](https://github.com/mephistopheles4/stacks/issues/593))

## Decision

1. **Two fingers moving together pan the camera; two fingers spreading or closing still walk it.** A pan
   moves the camera **and its target together** along the screen's right and up (`pan`,
   `room-walk.ts`), so the view keeps its direction and its distance. The room follows the fingers:
   right and down on the glass is the camera left and up. A step is a fixed `PAN_PER_PIXEL` (0.01
   world units a pixel), the same at any distance from the target, as the walk's is.
2. **The same bounds as the walk, with one difference.** The camera stays in the box and out of the main
   bookcase's keep-out, and a camera already inside the case is not held there. **A pan slides along a
   face of the box** and goes on in the other axes, where a walk stops, because a walk has one line to go
   along and a pan has a plane; a pan that would enter the case stops at its face, and one along its face
   goes on, so the visitor can pan along the shelves at the standoff. **The walk and the pan share one
   face and one "inside" test** (`keepOutReach`, the keep-out drawn in by 1e-10): a camera on that face
   counts as outside, and both stop at it. Were they to differ, a pan that parked the camera a hair inside
   the real face would leave a walk reading it as already inside the case, which it does not hold, and take
   it through; a test pans into the case's side, turns to face it and walks. The target goes exactly as far as the camera went and may leave the
   box, as the walk's does.
3. **A touch is decided once** (`room-gesture.ts`). The spread and the midpoint are summed from the
   start of the touch and the touch is decided the first time either has gone `GESTURE_SLOP` (10 px)
   **net**: a pinch when the spread has gone at least as far as the midpoint, a pan when the midpoint has
   gone further. The decision holds until a finger lifts, and what went before it is given back in the
   sample that makes it. Chosen over deciding each sample because no hand keeps two fingers a fixed
   distance apart: a pan that could also walk drifts forward and back as it goes, and "pans without
   walking" is the issue's done-when. The cost is that one touch cannot walk and pan; lift a finger and
   put it down. 10 px is about a thumb's width of rest on a phone; it is a constant to tune on a device,
   not a measured figure. Net travel and not path length, so two fingers resting and jittering never
   decide. Fingers that move together move the midpoint by their travel and the spread by none; fingers
   that spread move the spread by their travel and the midpoint by none; one finger drawn away from a
   held one moves the spread by its travel and the midpoint by half, which reads as a pinch.
4. **The samples are taken a frame apart, in `step`, not in the pointer handlers.** A handler hears one
   finger at a time, and a fast two-finger pan is, between the first finger's event and the second's,
   half a pinch (one finger moved, the other not). A frame is when both have reported. This changes the
   pinch's timing by up to a frame and nothing else.
5. **While two fingers are down `OrbitControls` does not turn the view** (`enableRotate` is off from
   the second finger down until fewer than two are down). Its touch rotate follows the midpoint of two
   fingers, so a pan would have turned the head by as much as it moved the camera; the walk's pinch bent
   its line a little for the same reason and no longer does. **One finger turns the view, as it always
   did**: the finger left after one of two lifts turns it again as soon as only one is down, and so does
   a new touch once both have lifted (the owner's word in the lead's chat: turning the view with one
   finger is the default behaviour for one finger anyway). Both are held by tests in `room-orbit.test.ts`.
6. **A mouse pans too, on a right-button drag and on a shift-drag**, the same `pan` and the same
   constant, the room following the pointer. They are the gestures `OrbitControls` already assigned to
   pan, and with pan off in a room they did nothing; the left button alone still turns the view. Ctrl and
   meta are not added: on a Mac a control-click is a right-click and a second spelling of the same pan is
   one more thing to keep. The plain shelf, outside a room, keeps `OrbitControls`' own pan.
7. **The first pan starts the walk's pivot**, as the first step of a walk does (ADR-0178 item 8): the
   target comes in to `minDistance` ahead of the camera and a drag turns the view about where the
   visitor stands. A pan moves the camera, and a camera that has moved is the camera that was walked.
   The queued pan eases a share a frame as the walk does and is forgotten when a held book takes the
   camera.

## Why

On a phone one finger turns the head and a pinch walks, and there was no way to go sideways or to the
height of a shelf without turning and walking round. The camera box and the bookcase keep-out were already
the walk's; the pan reuses them, and its one new rule is the slide.

**Not decided here:** panning toward the cursor or the fingers' midpoint (the walk goes straight ahead and
so does this), a pan's inertia, and a two-finger twist.

## How this was decided

The owner's ask in the lead's chat of #593, 2026-11-17: "camera navigation on mobile need to pan with 2
fingers", and then "start them and add them to the goal then deploy please". The questions the issue left
open were answered by the session that built it: the split is by net travel with a one-time decision
(item 3), the desktop gestures are right-drag and shift-drag (item 6), and the pan slides along the box
(item 2). None of them was put to the owner; each is a constant or a rule a later look at the device can
change with a new record.
