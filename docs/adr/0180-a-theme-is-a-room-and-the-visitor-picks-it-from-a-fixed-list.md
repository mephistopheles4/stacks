# ADR-0180 — A theme is a room, and the visitor picks it from a fixed list

**Date:** 2026-11-17
**Status:** accepted, built in [#606](https://github.com/mephistopheles4/stacks/issues/606)
**Issue:** [#606](https://github.com/mephistopheles4/stacks/issues/606), ticket T7 of the room spec ([#593](https://github.com/mephistopheles4/stacks/issues/593), revision 3, S15)
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)

## Decision

1. **A theme is a room.** Its GLB (with its slots, light empties, view and bounds), its textures, its
   background colour, and so its defaults for the panel's lighting and scene groups all live in one
   room. Every other panel group stays global. Adding a theme is one entry in `ROOMS`
   (`room-mode.ts`) and one folder under `public/rooms/`; nothing else names a room.
2. **A room id is checked against `ROOMS` before it is used**, wherever it came from: `?room=<id>`,
   the `room` a `?debug=<json>` link carries, and `localStorage`. An id not on the list is ignored,
   the default room loads, and nothing is written. The type system holds it: `roomFolder` and the
   loader take a `RoomId`, which only `isRoomId` can make from a string, so a value from the address
   or from storage cannot reach a path without the check. **The first source that says anything
   decides**: `?room=attic` is the default room, not whatever the browser remembers.
3. **The choice is remembered in `localStorage`**, under one key (`stacks.room`) holding the id and
   nothing else, read and written inside `try`/`catch`. A pick writes it; opening a `?room=` link
   does not. A blocked or full store means the pick lasts for the load it was made on. The stored
   value never leaves the browser; the address a pick opens carries the id to the host, as the room's
   file addresses do, and it is an id from a public list.
4. **The picker is a labelled `<select>` over the bottom edge of the page** and is **not built while
   `ROOMS` holds one room**: the page then has no picker, hidden or otherwise. A pick opens the page
   again at the address that asks for it, as a mode switch does, so the room not chosen is never
   fetched and a reload keeps the choice. Labels are set as text.
5. **A `?debug` link records its room and the differences from that room's defaults.** The room's
   lighting and scene come from its GLB's empties and its entry, and are what the panel shows, what
   "reset to shipped defaults" returns to, and what the written `lighting` and `scene` are a
   difference from. A link that names a room lays its differences over the room once it is dressed.
   **A link that does not name this room** (no room id, so made before themes; another room's id; or
   one not on the list) was made against other defaults: the room keeps its own lighting and scene
   and the pane says so in one line. `?shelf` and the plain shelf a failed room
   ends on read such a link as they always did. The pane also reaches every room, a button each.
6. **The machinery is proved with a test room that is never on the list.** `ROOMS` is the page's own
   catalogue; the functions take a `Catalogue`, and the tests hand in one with a second room. A test
   holds that the shipped list is the one room, each with its GLB under `public/rooms/`, and
   `room-build-record` already refuses a served room folder with no `build.json`.

## Why

- **A fixed list, not a lookup from the file system.** The id reaches a URL path. The list is the
  allowlist, in the bundle, and an id that is not on it never becomes a path: the same shape as
  `private:` failing closed, an allowlist and never a denylist.
- **A page load per room, not a swap in place.** A swap would hold two rooms' textures, shadows and
  live things at once on the device that loses its WebGL context for less. Reloading costs the
  visitor one more load once, and it makes "only the chosen room's files are fetched" true by
  construction. C16 (the second room swaps in with its own lights) is T8's to prove.
- **Storage holds the pick and the URL beats it.** A shared `?room=` link must show the room it was
  made in whatever the viewer last picked, and a bare address must remember the visitor.

## Trade-offs

- **Convenience against surprise.** A remembered room means the bare address no longer always shows
  the default room; the picker is the visible control that says why. Driver: the visitor's choice
  should survive a reload (C15).
- **Old links.** A pre-theme `?debug` link loses its lighting and scene in a room, with a notice;
  keeping them would paint the room with the shelf's lights. Driver: a link must not look
  deliberate when it has been read wrongly.

## Claim the S15.4 tests back

The spec's C15 covers the pick, the fetch and the reload. The tests for the `?debug` link, the panel
and the pane back this one, added here and not an edit to the spec comment, which is the owner's:

**C15a. A `?debug` link records its room and only the differences from that room's defaults, and
opens to the same state in that room; a link not made in the loaded room never lays its lighting or
scene over it and the pane says so; the pane offers a button per room once there are two.**
Quality: functional suitability. Measure: `shelf-url.test.ts`, `panel-model.test.ts` and
`mode-switch.test.ts`, each against the test room.

## Not decided here

What the second room is (T8). Where the picker sits at a phone's width beside the Attribution link and
the Ask button, which needs a second room on the list to see and so waits for the owner's look at T8.
