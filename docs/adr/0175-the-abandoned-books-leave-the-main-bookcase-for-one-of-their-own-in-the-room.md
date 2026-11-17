# ADR-0175 — The abandoned books leave the main bookcase for one of their own in the room

**Date:** 2026-11-17
**Status:** accepted, built in [#604](https://github.com/mephistopheles4/stacks/issues/604)
**Issue:** [#604](https://github.com/mephistopheles4/stacks/issues/604), ticket T5 of the room spec ([#593](https://github.com/mephistopheles4/stacks/issues/593), revision 3, S12 and S11)
**Spec:** [revision 3](https://github.com/mephistopheles4/stacks/issues/593#issuecomment-6904699109)

## Decision

1. **In a room the abandoned books stand on a second bookcase**, a live copy built by the same
   `buildShelf` as the main one, at the room's `slot_abandoned` and turned as that slot is, so its
   front faces the room. It is locked at two rows whatever it holds. Outside a room, which is `?shelf`
   and the plain shelf a failed room or a lost context ends on, the abandoned books are on the main
   bookcase as ever: `abandoned` is still a shelved status in core, `shelf_order` and
   `stacks order --renumber` still number it, and only the room's layout moves them.
2. **The room is asked for at mount, so the main bookcase is laid out without the abandoned books from
   the start.** The alternative was to lay everything out and take them off when the room dressed,
   which would rebuild a bookcase that is already drawn and has already placed its rows. A room that
   fails ends in a rebuilt plain shelf (the page already does this for every failed room), and that
   one has them. A room with no `slot_abandoned` is a failed room, because the abandoned books would
   otherwise stand on no bookcase at all.
3. **Spine out, and the most recent kept.** `face_out: true` on an abandoned book is ignored there
   and still honoured by `?shelf`: a cover-forward book takes a cover's width of a row, and two rows
   are few. The books are offered by `finished`, then `started`, newest first, a missing date after
   every date, then title, then id; they are kept while the shelf's own packer still fits them in two
   rows, and the first that does not fit ends it, so an older, thinner book never takes the place of
   a more recent one. The rest are not drawn and stay in `library.json`: the cap is display only.
4. **It reads no shadow map and casts none.** Its woodwork and every book on it compile with no
   shadow fetch, so the main bookcase's woodwork stays the one program reading the map, in 2 draws
   (G61, [ADR-0088](0088-one-program-samples-the-shadow-map-in-two-draws.md)); the map is fitted to the
   main bookcase alone, so a caster elsewhere would add draws to the shadow pass for nothing. A book
   that reads the map again, or a woodwork member of its own, leaves the one configuration measured to
   survive on the Pixel and is answered on a phone, as ADR-0088 says.
5. **Its books are scene children with homes of their own**, as the shelf's are, though they stand in
   a bookcase that is turned: a pickup reads a book's home from its group and lifts it from there, so
   each book is attached to the scene at its world pose and the bookcase keeps the woodwork and its
   painted shading. They join the click lookup, the picker and the pickup's staged list after the
   floor stacks' books. A pickup slides a book out along its bookcase's front, so a book on this
   bookcase leaves along the room's -x and not along +z, into the next book (`slideOffset`).
6. **Its wood is cut from a root of its own**, so the two bookcases are not one board stamped twice,
   and the panel's wood colour, roughness and fibre dial both. Its painted shading, where the panel
   or a lost context asks for it, follows the key light by magnitude as the main bookcase's does
   (`BookcaseLight`'s recorded assumption); it is not turned into the second bookcase's own frame.

7. **G35 holds its layout in a browser** (`checkAbandoned`, judged by `scripts/lib/abandoned-gate.ts`,
   every clause planted red in its spec), on the page's own `library.json` answered by one with a
   hundred more abandoned books, the most recent marked `face_out`. It holds two rows of the newest
   by date, spine out, the `face_out` book included; none of them is on the room's main bookcase and
   every one is on `?shelf`'s. The order the gate expects comes from the dates it gave the books,
   never from the page. **A pickup from this bookcase has no cell of its own**: the owner dropped it,
   and a book on it is picked up by the same code as every other.

## Why

The room's layout is the owner's: a bookcase of parked books against the right wall, the clock and the
encyclopedias baked on its top. Two rows is what the baked top leaves room for, and a third would pass
through them. Moving the abandoned books out of the main bookcase keeps the main one a record of
reading and puts the books the owner stopped reading where a room puts such things.

Offering the books newest first and stopping at the first that does not fit is the rule that is
easiest to say and to test: the bookcase shows the most recently abandoned, and nothing older ever
stands where a newer one does not. The alternative, filling the gaps with whatever is thin enough,
reads as a shelf whose arrangement has no reason.

## Costs

- The main bookcase differs between the room and `?shelf`, so a count of the books on it does too.
  `window.__shelf.bookCount` is the main bookcase's, and `abandoned` carries the other.
- A second bookcase is two more draws, a mesh for the backboard and one for the woodwork. None of it
  reads the shadow map.
- The painted shading on this bookcase is approximate by the same assumption as the main one's.
