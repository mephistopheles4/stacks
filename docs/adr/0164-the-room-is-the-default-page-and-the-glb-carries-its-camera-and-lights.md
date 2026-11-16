# ADR-0164 — The room is the default page, and the GLB carries its camera and lights

**Date:** 2026-11-16
**Status:** accepted, built in [#602](https://github.com/mephistopheles4/stacks/issues/602)
**Issue:** [#602](https://github.com/mephistopheles4/stacks/issues/602), ticket T3 of the room spec ([#593](https://github.com/mephistopheles4/stacks/issues/593), revision 3, S2, S3, S7, S8 and S14.4)
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)

## Decision

1. **The room is the default page.** `/` loads the baked room round the bookcase. `?shelf` draws the
   bookcase alone, exactly as before; `?solo` is unchanged and wins over `?shelf`. A visitor whose
   browser says `prefers-reduced-data: reduce` gets the bookcase alone. `?room=<id>` names a room,
   and only an id on the fixed list in `room-mode.ts` reaches a path: anything else is the default,
   so no query value is ever joined into a URL.
2. **The GLB carries where the camera opens and where it may go.** Named empties in the room's
   file: `view_open` (the camera and its target, with the span, height and aspect the view was
   framed for), `bounds_min` and `bounds_max` (the box the camera stays in), and `live_ambient`,
   `live_key`, `live_fill` and `live_lamp` (the lights the page adds, with their colour, intensity
   and, for the key, the shadow). No room position lives in code. The page reads them in one
   place, `room-data.ts`, and a room that lacks one is a failed room.
3. **They were written into the packed GLB, and the room was not rebaked.** The Blender inputs are
   fetched, not committed ([ADR-0161](0161-the-room-is-committed-baked-with-a-record-and-fetchable-inputs.md)),
   and a rebake could change the room's look, which only the owner's screenshot sign-off may do.
   `rooms/shared/add_room_data.mjs` adds the empties to the JSON chunk and leaves the binary chunk
   byte for byte, so every mesh and every texture is the one already approved. `build_room.py --pack`
   runs it last, so a rebake carries them.
4. **`live_lamp` is a fourth light** beside the spec's three. The prototype's look has a point light
   in the lamp, and dropping it would change the room's look. Only `live_key` casts a shadow.
5. **A failed room is the plain shelf, once.** A GLB that does not fetch or parse, a room that is
   dressed wrongly, or a load that has not settled after 60 seconds, takes the room out, lifts the
   loading screen and warns once. A texture that does not load counts as settled, so one missing
   file cannot hold the screen up. After a lost WebGL context the page rebuilds the plain shelf,
   painted, and does not fetch the room again ([ADR-0091](0091-a-lost-context-falls-back-to-painted-shadows.md)).
6. **Every check that does not need the room runs on `?shelf`.** `smoke:render` keeps one cell on the
   default page that reaches `dressed`, writes `artifacts/room.png`, picks a book up and puts it back,
   and G60 and G61 each gain the room page; the rest of the run, G59's frames included, is the
   bookcase alone, so the room adds one boot and not one per cell.

## Why

The room's look is the owner's, and it is signed off from a picture; a decision that kept every
position in the file the artist already approved moves nothing. Putting the camera and lights in the
GLB means a second room is a second folder and no code, which is what the list in `room-mode.ts`
is for. Failing to the plain shelf is the one outcome that costs the visitor nothing: the library is
the product, and the room is a setting for it.

## Consequences

- Portrait windows open on `view_open` clamped into the box, not on the shelf's back-off, so an
  upright phone sees the same corner a desktop does, nearer.
- The T3 layout is the `?shelf` layout. Moving the abandoned books off the main bookcase is T5.
- `slot_bookcase`'s position is not honoured: the bookcase stays at the origin until a second room
  needs it elsewhere.
- Following the room's camera box costs the damped orbit one clamp a frame (`keepInRoom`).

## How this was decided

No Decision Log entries exist for this record: the log was retired before it. The sources are the
owner-signed spec ([revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109):
S2, S3, S7, S8, S14.4) and two picks made while building. A failed room draws the plain shelf
**painted**, as a lost context does (S2.5, C13). The cabinet under the mantel clock is the live
abandoned bookcase T5 builds, so until then the room shows the clock shelf without it, and nothing is
deployed between T3 and T5.
