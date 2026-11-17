# ADR-0178 — The room is closed by its own wall pieces, the camera comes in at the box instead of freezing, and the scroll walks

**Date:** 2026-11-17
**Status:** accepted, built in [#620](https://github.com/mephistopheles4/stacks/issues/620) and [#626](https://github.com/mephistopheles4/stacks/issues/626). **Amends [ADR-0164](0164-the-room-is-the-default-page-and-the-glb-carries-its-camera-and-lights.md)'s consequences on clamping**: a portrait window no longer opens on `view_open` clamped into the box (`frameRoom` comes in along the line of sight), and `keepInRoom`, the one clamp a frame the damped orbit paid, is gone (items 5 and 6).
**Issue:** [#620](https://github.com/mephistopheles4/stacks/issues/620) and [#626](https://github.com/mephistopheles4/stacks/issues/626), part of the room ([#593](https://github.com/mephistopheles4/stacks/issues/593))
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109), whose S8.2 and S8.4 clamp the camera into the box. This record departs from them on the owner's say-so in [#620](https://github.com/mephistopheles4/stacks/issues/620) ("a camera that always turns where dragged, and comes in toward its target at the box"); the spec comment itself is not revised here.

## Decision

1. **The room is closed.** The side walls run on from y -10 to y -13 (Blender's axes, z up; three's z 10
   to 13), and a front wall closes them there. The front wall is **the back wall's own pieces**, the
   painted dado, the rail with its bead and cove, the skirting and the Willow paper above, built by the
   same function (`wall_pieces` in `build_room.py`, and `lightmaps.wallpaper` with `toward=1`) with the
   room on its other side. No new texture or material comes in; its paper is the back wall's tile,
   running left to right as the room sees it, from the same row height, so the rows meet at the corners.
   The trim runs to the middle of each side wall's thickness and the paper to its inner face, so the
   corner shows neither a gap nor a sliver of the void.
2. **A closed room is rebaked, all of it.** The new walls change the bounced light everywhere, so every
   `bake/` and `light/` texture is a new file ([ADR-0161](0161-the-room-is-committed-baked-with-a-record-and-fetchable-inputs.md):
   a rebake is the same room and not the same bytes), and the front wall's paper has a lightmap of its own
   (`room_wallpaper_front`). The side walls' boxes in `layout.json` are 13.5 long, centred on y -6.25.
3. **The globe and the desk group move.** The globe stands at (8.363, -9.216), clear of the chest by about
   0.6 and of the right wall by about 0.25, to its outer ring. The desk, its chair, its lamp, everything on
   it and the map pinned above it move 0.95 toward the front (`DESK_SHIFT`), so they sit centred on the
   longer left wall. The map moves with them: it was a pick of the lead's, the owner's hand-moved try-out
   having left it where it was.
4. **The camera box's front comes in** from z 18 to z 12.452, 0.548 short of the front wall, and
   `view_open` is moved along its own line of sight to stand inside it.
5. **The camera comes in; it does not stop.** The orbit turns the camera where it is dragged, and a place
   the box cannot hold is brought in along the line to the target (`pullIn`, `room-data.ts`) instead of
   clamped onto a face. Clamping moved the camera along the face and left the line of sight, so a drag
   toward a wall undid itself and the camera looked stuck. The distance the visitor asked for is kept
   apart from the distance the camera stands at, so turning away from the wall lets it back out.
   `frameRoom` uses the same pull-in, so a narrow window opens on the owner's line of sight, closer,
   rather than on the box's face.
6. **Coming in stops at `minDistance`.** The orbit's own clamps run on the place the visitor asked for,
   and the pull-in only shortens it, so the polar limit and the far limit hold; the near limit did not,
   and the reading corner's target stood 0.535 in front of the box's old back face (z 0.8), so a view
   turned to the front wall came in to half a unit. `pullIn` takes a nearest distance (the page's `minDistance`, 1.5),
   and the box's back face moved to z -0.2 so that stand is inside it. Refusing the angle was the
   alternative and was set aside: it freezes the 138° of turn behind the target, which is the stuck look
   this record removes.
7. **The main bookcase is never shorter than its baked shadow.** The wall's shadow was baked from a
   four-row stand-in (`bookcase_proxy`), and a two-row case left that shadow empty round it. In a room
   the case has at least `ROOM_MIN_ROWS` (4) rows, the bake writes the stand-in's size onto
   `slot_bookcase` (`caster_rows`, `caster_width`, `caster_depth`, `caster_height`), and a test holds the
   page's minimum to those numbers. A live shadow in place of the baked one was looked at and set aside:
   it would be a third program reading the shadow map, which `one-shadow-reader` (G61) and
   [ADR-0088](0088-one-program-samples-the-shadow-map-in-two-draws.md) keep at one.
8. **The scroll walks; it does not dolly** ([#626](https://github.com/mephistopheles4/stacks/issues/626)).
   `OrbitControls`' dolly takes a share of what is left, so it slows near the target and stops at
   `minDistance`, and the target is a point beside the side table, so it never heads for a book. In a
   room it is off (`enableZoom`, and `enablePan`, which two fingers would otherwise drive), and a wheel
   notch or a pinch walks the camera **and its target together** along the view, a fixed distance a
   step (`walk`, `room-walk.ts`; `room-orbit.ts` queues it and takes a little each frame). The camera
   stays in the box; the target stands `minDistance` ahead of it from the first step (below), and a
   face nearer than that is walked up to and not stopped short of. Straight ahead and not toward the
   cursor, which is a later choice. A wheel in lines counts a line as a third of a notch (a click is 3
   lines), so a step is the same size in every browser. The dolly was first kept and repaired, and the reason it needed
   repairing is the reason to drop it: every `OrbitControls` handler runs `update()` itself, so a camera
   put back to its wished distance each frame (item 5) undid the dolly and the scroll did nothing.
   The plain shelf keeps the dolly. **From the first step of a walk the drag turns the view about the
   camera**, as turning a head would. With the pivot across the room (about 11 at the opening view) a
   150 px drag after a walk swung the camera over the room and not the view, and with it
   `minDistance` ahead a face nearer than that held the turn (the pivot stood outside the box, the
   pull-in fell back to clamping, and a drag at the back face turned the view 6° where it turns 67°
   elsewhere). So the camera stays where it walked and `OrbitControls`' turn is carried to the
   target, `minDistance` ahead along the turned view (`headTurn`, `room-orbit.ts`): no face can hold
   it, because the camera never leaves the box. The line of sight does not change when the target
   comes in, and the opening view keeps its own orbit until the first step.

## Why

The room was open past the walls' front edge, and turning the camera showed empty floor beyond them. The
walls had to be the room's own, because a second kind of wall would be a second thing to keep matching
as the paper, the trim or the light changed.

**Not decided here:** keeping the camera out of the furniture's boxes (the armchair, the plant) with the
same pull-in. The try-out showed it could, but the issue's done-when does not ask for it, and it needs
the boxes in the room's data. ⚠️ **The main bookcase is one of them**: the box's back face (z -0.2, item
6) lies behind the front of the books, so a walk straight at the shelves ends with the camera up to
0.56 inside the case, where it used to stop 0.44 in front of the books. The stand-in is 0.72 deep,
centred on z 0.

## How this was decided

The owner's Blender try-out with the lead of #593, 2026-11-17: the globe's and the desk group's places
were moved by hand in `room-revise-closed3.blend`, the closed walls were copies of `room_walls`,
`room_shell` and the wallpaper planes, and the camera box's front was set at 12.452. The build takes the
places from that file and makes the walls in the room's scripts, not by copying from a `.blend`.
