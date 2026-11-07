# ADR-0137 — A picked-up book arrives closed, and the visitor opens it

**Date:** 2026-11-07
**Status:** accepted; built in [#531](https://github.com/mephistopheles4/stacks/issues/531) — [`docs/spec/picking-up-closed.md`](../spec/picking-up-closed.md)
**Issue:** [#531](https://github.com/mephistopheles4/stacks/issues/531)
**Supersedes in part:** [ADR-0102](0102-pickup-replaces-the-card.md) — its "turns, and opens" and its put-back line

## Decision

Clicking a book still picks it up: it slides out of the shelf, comes to the
camera and turns. **It then stops closed and cover-on, and the visitor opens
it.** The owner's reason is that the pickup is more fun when the visitor opens
the book; the cost, which they accepted by asking, is that reading a book's
Thoughts takes a second action.

- **`held` keeps its meaning: at rest in the hand.** It now covers a closed book
  too, and whether the book is open is a reading of its own (`opened`). Every
  put-back and swap rule that reads `held` is unchanged.
- **One timeline, which stops at closed.** The slide and the turn run, the track
  rests, and opening plays the rest from there (`pickup-track.ts`). Going
  backward it passes the stop without resting, so a put-back from either state
  is one reversed motion. Cuts are only under reduced motion, on a lost context,
  and ADR-0109's cut for a book that was closed for examining.
- **Mouse and touch: a click or tap on the held book opens it.** The pointer is
  a pointer over the book while it is closed, and the header's hint reads
  "Click the book to open it".
- **Keyboard and screen reader: a real button, "Open «Title»"**, visually hidden
  until it has focus. The canvas is not a tab stop and a key handler on the
  document is not reachable by a screen reader, so without it there is no way
  to the Thoughts for everyone but a pointer user.
- **The put-back control leaves the page.** The pages are hidden until the cover
  passes 95°, so a closed book has no visible or focusable way to put it back.
  It is now an X, a hard-coded inline SVG in a real `<button>` in the header,
  under the hint, on screen while the book is closed and while it is open, and
  hidden while the examining view holds the page.
- **Focus.** It still does not move on a shelf pickup, for ADR-0049's reason. A
  chat link is a keyboard path to the shelf, which that reason leaned on there
  not being: after one, with focus on the launcher, focus moves to Open when the
  book lands. After Open is pressed, focus lands on the right-hand page.
- **The viewer's close mark** is a back arrow, an inline SVG, so the two marks at
  the corner mean different things and look different.

## The stop was measured

`addPause` snaps the playhead to the stop in either direction, and it pauses a
timeline playing backward as well, so its callback resumes a reverse. A plain
callback overshoots on a large step, and a pause called from it fires again from
the stop. A jump to the closed rest lands 0.1 ms past the stop for the same
reason: a pause placed exactly on an `addPause` fires it again when played on.
The first test of the build runs the real library through the stop and the jump
to the rest, and takes a large time step across the stop in each direction, because the track is stepped from the
shelf's frame and a stalled tab jumps.

## Consequences

- G35 reads a closed book first (the board at 0° ±0.5° to the page block, the
  pages hidden, the X on screen, the hint, the Open button) and opens it by a
  real click, then runs today's reads. G61 reads the book held closed and held
  open: a closed book is a different configuration from the one measured to
  survive on the Pixel (ADR-0088).
- `overlapTurnOpen` retires from the motion, the tuner and its export: nothing
  can overlap a rest.
- The put-back control no longer sits on the page, so the page's block list loses
  `put-back`.
- A sighted visitor who misses the hint and never clicks the book sees no
  Thoughts. A book with no cover art arrives as a plain coloured board. Both are
  residuals the owner accepted (spec S12).

## Alternatives rejected

- **A new phase for opened.** Every rule that reads `held` would change, to say
  what `opened` already says.
- **Closing before returning, as two motions.** One reversed motion is what a
  book does today, and it needs no new case.
- **An Open button that is always visible.** The owner chose a clean closed
  book; the hint and the cursor carry the invitation to a pointer user.
