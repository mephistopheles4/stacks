# ADR-0109 — The held book is examined in 3D, in the dialog's place

**Date:** 2026-10-10
**Status:** accepted, built in [#418](https://github.com/mephistopheles4/stacks/issues/418) — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md) §3.4
**Issue:** [#418](https://github.com/mephistopheles4/stacks/issues/418)
**Supersedes in part:** [ADR-0052](0052-the-enlarged-cover-is-a-real-dialog.md)

## Decision

The control on a held book's page now **closes the book in your hand and lets
you turn it**, instead of showing a flat picture of the cover. The mode is
called **examining** ([`CONTEXT.md`](../../CONTEXT.md)).

**What survives from ADR-0052.** The shell is still a native `<dialog>` opened
with `showModal()`, and for the same four reasons: focus moves in, the rest of
the page goes inert, Escape closes it, and Android's back gesture closes it.
"One surface, one role, and the difference is behaviour" holds. So does "one
Escape, two listeners": the pickup's own handler skips an Escape while the view
is up, and now also while the book is still easing open again.

**What is superseded.**

- **The flat `<img>`.** The dialog carries no picture. It is a transparent
  surface over the shelf's canvas, where the closed book is drawn and turned.
- **The 512 px ceiling and "never scaled past native size".** The cover is
  whatever texture the held book already wears: the held copy once it has been
  swapped in, the shelf copy for a book with none or one whose copy failed.
  At the closed framing a 512 px shelf copy is drawn somewhat larger than native,
  which is what the pickup already drew while the book turned in.
- **The path hand-off.** `offerCover`'s in-memory map is gone: nothing offers a
  path to the DOM any more, which makes the surface #416 guards smaller.
- **A control only for a book with a cover.** Every held book gets it. What is
  examined is the book, and a book with no cover still has its binding and its
  spine colour.

## How it turns

- **The held group turns; the camera does not.** A yaw and a pitch, about the
  camera's own axes, are composed after the pose that squares the book to the
  camera, about the book's own centre. `?solo`'s `mountBookInspector` is **not**
  reused: it brings a second `WebGLRenderer` (ADR-0088, ADR-0091), a second
  animation loop (what G60 reads as a shelf still drawing) and an orbit that
  would swing the dimmed shelf behind the book.
- **The rules are a pure module**, `book-turn.ts`: yaw free and wrapped, pitch
  clamped to ±75°, a drag measured against the viewport's short side, arrow
  keys 15° a press, Home squares it, and a press that moves under 6 CSS px is a
  tap.
- **Closing is its own tween.** The pickup's turn and open stages overlap, so
  seeking the shared track to close the book would also un-turn it. The pose
  reads the opening as `o × (1 − c)`.
- **Every way out is the dialog's `close` event**: Escape, "Back to the page",
  a tap anywhere, Android back. It eases square, then opens again at the page,
  and the book stays held.

## Every way the hand empties closes the view

History is untouched: the pickup still owns exactly one entry (§3.9). The
desktop back button, a put-back and a lost context all put the book back **as a
cut**, because reversing the shared track from its end would draw the book open
before it went. `pickup-state.ts` calls `cutExamining` whenever an entry that
was examined is sent back, which also removes a defect the old viewer had: a
`popstate` with the enlarged cover open could leave the dialog open over an
empty hand.

## Accepted, and why

- **Off Chrome on Android a back gesture empties the hand** (iOS Safari's edge
  swipe, Firefox on Android) rather than returning to the page, because there it
  is history navigation, not a close request. A history entry for examining would
  cost the guards §3.9 built; its trigger is recorded on #418 (S13): the Pixel check finds Android back does not leave the view, the owner wants the desktop back button to leave one level, or the off-Chrome cut proves wrong on a real device.
- **Turning is visual-only for a screen-reader user.** Browse and quick-nav
  modes may keep the arrow keys, and a turn is not announced. The dialog's
  name, description and exits stay fully reachable, and the book has no text
  that a turn would reveal.
- **A drag turns the book only inside examining.** §3.11's touch turn for the
  open book stays deferred; its trigger has not fired.

## How this was decided

The owner, filing the idea: close the book in your hand and let the reader
inspect it in 3D, turning it the way `?solo` does, instead of showing a picture
of the cover. The plan session's spec settled the shell, the turn, the exits and
the gate; its `unstated-lens` report raised the Chrome-only back gesture, the
screen-reader turn and the overloaded word "inspection", each answered above.
