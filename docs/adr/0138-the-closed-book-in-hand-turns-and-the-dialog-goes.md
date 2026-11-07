# ADR-0138 — The closed book in your hand turns, and the examining dialog goes

**Date:** 2026-11-07
**Status:** accepted; built in [#553](https://github.com/mephistopheles4/stacks/issues/553), spec revision 2 on that issue
**Issue:** [#553](https://github.com/mephistopheles4/stacks/issues/553)
**Supersedes in part:** [ADR-0109](0109-the-held-book-is-examined-in-3d.md), its modal `<dialog>` and its closing overlay; [ADR-0137](0137-a-picked-up-book-arrives-closed.md), its X under the hint and its hint text

## Decision

**A book closed in your hand can be turned at once.** It is the same closed rest
the pickup lands on (ADR-0137), and a drag on the canvas, or the arrow keys,
turn it there, by `book-turn.ts`'s rules, unchanged from ADR-0109. A tap on
the book opens it, and a turned book eases square as it opens. Before this, a
visitor opened the book and pressed "Turn the book over" to reach a separate
view where it could be turned. The owner found that awkward and asked for it gone.

- **Closing an open book returns it to that same rest.** "Close the book" sits
  at the top left of the page that carries the title. "Turn the book over" stays
  at the foot of the right page as a second way. Both run the pickup's track
  backward and hold at the closed rest, which `pickup-track.ts` does with a
  hold mode on the stop that every other call disarms. So there is one closed
  state, not two, and a put-back after a close is the normal animated return
  rather than ADR-0109's cut.
- **The modal goes.** The view was a `<dialog>` because the platform brings
  focus, inertness, Escape and Android's back. With the book turnable in place,
  each has another home: the pickup's own history entry already answers Back,
  Escape puts the book back as it always did, and the X's description says the
  book turns. The focus trap is the one thing lost, and it is accepted: the
  closed state must leave the shelf live, so a click on another book still
  swaps.
- **The X moves to the top right**, where the dialog's back arrow sat. Under the
  logo it lay over the open book's left page. The hint is hidden while a book is
  open (#553: it was drawn across the page), reads "Drag to turn it · click to
  open" at the closed rest, and is the shelf's again when the hand empties.
- **On a phone the close control stays in view** while the Thoughts scroll,
  held at the top of the right page by `position: sticky`. A control that
  scrolled away would make the reader scroll past the Thoughts to close the
  book, which is the thing the owner asked to avoid.
- **A tap on the book while it is closing is ignored** until it lands.
- **One tap rule.** The shelf's click and the turn both use `book-turn.ts`'s
  `press()`, farthest travel under 6 px. They had disagreed (an end-point
  distance of 5 px against farthest travel of 6), so a wobble out and back
  could both turn the book and open it.

## Why not keep the dialog and only skip the step

A modal over the closed book would make the shelf behind it inert. The swap,
picking up another book while one is in hand, would need its own path through
the dialog, and so would the chat link's pickup. The surface it guarded is
now the whole canvas, which ADR-0137 already gives to the held book.
