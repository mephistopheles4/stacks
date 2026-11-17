# ADR-0178 — The room is closed by its own wall pieces, and the camera comes in at the box instead of freezing

**Date:** 2026-11-17
**Status:** accepted, built in [#620](https://github.com/mephistopheles4/stacks/issues/620)
**Issue:** [#620](https://github.com/mephistopheles4/stacks/issues/620), part of the room ([#593](https://github.com/mephistopheles4/stacks/issues/593))

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
   apart from the distance the camera stands at, so turning away from the wall lets it back out; a zoom
   works from what is on screen. `frameRoom` uses the same pull-in, so a narrow window opens on the
   owner's line of sight, closer, rather than on the box's face.
6. **Coming in stops at `minDistance`.** The orbit's own clamps run on the place the visitor asked for,
   and the pull-in only shortens it, so the polar limit and the far limit hold; the near limit did not,
   and the reading corner's target stands 0.535 in front of the box's back face, so a view turned to the
   front wall came in to half a unit. `pullIn` takes a nearest distance (the page's `minDistance`, 1.5),
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

## Why

The room was open past the walls' front edge, and turning the camera showed empty floor beyond them. The
walls had to be the room's own, because a second kind of wall would be a second thing to keep matching
as the paper, the trim or the light changed.

**Not decided here:** keeping the camera out of the furniture's boxes (the armchair, the plant) with the
same pull-in. The try-out showed it could, but the issue's done-when does not ask for it, and it needs
the boxes in the room's data.

## How this was decided

The owner's Blender try-out with the lead of #593, 2026-11-17: the globe's and the desk group's places
were moved by hand in `room-revise-closed3.blend`, the closed walls were copies of `room_walls`,
`room_shell` and the wallpaper planes, and the camera box's front was set at 12.452. The build takes the
places from that file and makes the walls in the room's scripts, not by copying from a `.blend`.
