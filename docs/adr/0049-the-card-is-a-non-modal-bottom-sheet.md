# The card is a non-modal bottom sheet below one breakpoint, and focus never moves

Below `(max-width: 700px), (max-height: 500px)` the book card is a full-bleed
bottom sheet, capped at 40vh, dismissed by a grabber pill that really drags.
Above it, the corner card, plus an `×`. **The shelf stays interactive on both.**

## Non-modal, and what that buys and costs

Tapping empty shelf dismisses; tapping **another book swaps the sheet's
contents** rather than closing it. A modal takeover was rejected: it is what the
card already is not on desktop, and a card that is modal on a phone and not on
desktop is two interaction models to reason about forever. It also kills
tap-to-swap — you would tap, dismiss, tap, dismiss.

⚠️ **The cost, accepted:** occlusion becomes a real defect rather than a moot
point. A book on the bottom row is covered by its own card, and the scene does
not move to clear it — camera motion on every tap would make the world lurch
through an ordinary browse.

## One height, not a peek/expanded pair

The sheet sizes to its content, capped, and scrolls past that. Progressive
disclosure over eight rows is machinery without a job — and the sharper reason:
**a peek state is a way to avoid deciding what matters.** If the content will not
fit the cap, the honest response is that the card is showing too much, not that
the sheet grows a second state to hold it all.

## Focus never moves, and a separate region announces

**The card has no non-pointer opening path at all**: a book is selected by a
raycaster hit on a `<canvas>` with no accessible children. A keyboard user cannot
open it; a VoiceOver-on-touch user can, without knowing which book they will get.
So the announcement is the *only* way they learn what they hit, which is why it
is short — `«Title» by «Author»` — rather than complete.

- **No `role="dialog"`.** Several screen readers announce a dialog only when
  focus enters it, so a dialog nobody focuses is silent while claiming a
  modality it does not have. A named `<aside>` — a `complementary` landmark —
  is the only deliberate way in.
- **The announcer is a permanent, visually-hidden sibling.** It cannot live
  inside the card: a `hidden` element is out of the accessibility tree, so a live
  region there could not announce the card *opening* at all.
- **On dismissal focus moves to the canvas only if it was inside the card.** One
  conditional rule for all four dismissals; moving it unconditionally would yank
  focus from wherever the user actually was.

⚠️ **This is the decision a keyboard path to the shelf would reopen**, since it
leans on there being no focus origin to return to.

## The breakpoint is a fact two languages hold

The presentation switch is CSS-only, but **the drag is not**: dragging the
desktop `×` must do nothing. The rule, stated once so it cannot be read two ways:
*the drag is inert above the breakpoint, and the breakpoint is expressed once and
read by both.* `SHEET_QUERY` is that expression; the stylesheet points at it by
comment, and a test asserts the two spellings match.

⚠️ **Do not add a third holder.** Rendering card *content* by breakpoint was
rejected for this, and the attribution surface was placed bottom-left — behind
the sheet on a phone, accepted — rather than re-homing below the breakpoint,
which would have made it three.

## How this was decided

Map [#88](https://github.com/mephistopheles4/stacks/issues/88), tickets
[#91](https://github.com/mephistopheles4/stacks/issues/91) (the interaction
model), [#101](https://github.com/mephistopheles4/stacks/issues/101) (focus,
announcement, reduced motion) and [#92](https://github.com/mephistopheles4/stacks/issues/92),
which measured three variants on the real shelf and chose the one that fits:
270px filled against a 325px cap, where a cover-led layout wanted 509px.
