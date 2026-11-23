# ADR-0188 — One finger turns the room the other way from a mouse

**Date:** 2026-11-17
**Status:** accepted, built in [#635](https://github.com/mephistopheles4/stacks/issues/635). Amends the turn described in [ADR-0178](0178-the-room-is-closed-by-its-own-wall-pieces-and-the-camera-comes-in-at-the-box.md) and [ADR-0185](0185-two-fingers-pan-the-room-and-a-pinch-or-a-pan-is-decided-once-per-touch.md), which left it as `OrbitControls` has it.
**Superseded by:** [ADR-0192](0192-the-room-turns-pans-and-zooms-with-orbitcontrols-about-an-anchor-at-the-centre-of-the-screen.md)
**Issue:** [#635](https://github.com/mephistopheles4/stacks/issues/635), part of the room ([#593](https://github.com/mephistopheles4/stacks/issues/593))

## Decision

1. **A one-finger drag turns the view the opposite way from before, on both axes; a mouse drag is unchanged.** The owner, on a phone: the finger "should be inverse than it is right now".
2. **It is `OrbitControls`' `rotateSpeed`, negated.** `room-orbit.ts` keeps the speed the page set and, on each `pointerdown` in a room, sets it to its negative for a touch and back to itself for anything else. `OrbitControls` reads the speed on each move, so what went down decides the direction. Chosen over inverting the deltas ourselves because `OrbitControls` owns the touch handling and the damping, and one sign is the whole change.
3. **Two fingers are untouched**: they never turn the view, and the pan and the pinch walk (ADR-0185) do not read `rotateSpeed`. The finger left after one of two lifts turns the flipped way, as any one finger does. `leave` puts the speed back.

## Consequence

The page's mouse and finger no longer agree on a direction, which is the ask. One sign on one line moves the finger's direction back if a device says otherwise.
