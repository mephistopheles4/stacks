# ADR-0193 — The room is a cutaway: the camera may stand outside it, and its walls are drawn from the inside

**Date:** 2026-11-18
**Status:** accepted, built in [#637](https://github.com/mephistopheles4/stacks/issues/637) (and closes [#636](https://github.com/mephistopheles4/stacks/issues/636)).
**Issue:** [#637](https://github.com/mephistopheles4/stacks/issues/637), part of the room ([#593](https://github.com/mephistopheles4/stacks/issues/593))
**Spec:** [`## Spec: Anchor camera (revision 2)`](https://github.com/mephistopheles4/stacks/issues/637#issuecomment-6990624251) on #637, S4 D2, S6 and S7
**Amends** [ADR-0178](0178-the-room-is-closed-by-its-own-wall-pieces-and-the-camera-comes-in-at-the-box.md) items 4 and 5 (the camera box, and the camera coming in at it). **Departs from** the room spec's S8.2 on #593 ([revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)), "never behind a wall, the floor or the ceiling".

## Decision

1. **The camera may stand up to 50 units (about 20 m) outside the room's box**, past every wall, the
   ceiling and the floor. It is still kept out of the main bookcase. A turn that would take it past that
   limit slides along the limit; it is never pulled in toward the anchor.
2. **Every wall is drawn from the inside only.** When a room loads, the faces of its walls, panelling,
   trim, ceiling and floor that point away from the room's centre are dropped from their geometry, so a
   camera outside sees through the walls between it and the room. The meshes cut are the ones named
   `room_shell*`, `room_walls*`, `room_ceiling*`, `room_wallpaper*` or `room_floor`; a theme room must use
   those names to be cut away. The geometry it replaces is disposed.
3. **It changes geometry and nothing else.** No mesh is added, no material changes, and the room's
   meshes still neither cast nor read shadows, so the main bookcase's woodwork stays the one program
   reading the shadow map ([ADR-0088](0088-one-program-samples-the-shadow-map-in-two-draws.md)).
4. **The fog and the far plane follow the camera out.** Each frame in a room, the fog's near and far are
   the panel's range plus the camera's distance outside the box, and the far plane is
   `max(100, fog far + outside + 10)`. Inside the box both are what they were, and the panel's fog
   sliders still move what they say.
5. **It is the only wall mode.** The prototype's solid walls (`?walls=solid`) are deleted, not kept
   behind a flag.

## Why

Inside a closed room the camera could only ever see part of it, and a wall at the camera's back held
every turn (ADR-0178 spent items 5, 6 and 8 on that). Standing outside with the near walls cut away, like
a doll's house, the visitor sees the whole room and the bookcase in it, and no wall ever holds the camera.
The faces are dropped rather than the walls hidden, because a wall the camera stands inside of must still
be drawn from the room's side.

**What is given up:** a room that is always a room. Backing out shows the void past the walls, which the
room spec's S8.2 kept out of view. Without item 4 the room faded into the background colour as the camera
backed out, because the fog is measured from the opening view.

**Considered and set aside:** a solid-walls mode kept beside the cutaway (two camera boxes to keep
matching, and a mode no visitor would find), and hiding whichever whole wall stands between the camera
and the room (the wall the camera is inside of would vanish from the room's side too).

## How this was decided

The prototype on `prototype/637-anchor-camera` added the cutaway behind `?walls=cutaway`, then fixed the
anchor landing beyond the walls, zooming out pulling the camera back in, and the room fading when the
camera stood far outside it. The owner tried it on a Pixel 10 Pro XL and desktop Edge and accepted the
cutaway as the default when asking for the spec.
