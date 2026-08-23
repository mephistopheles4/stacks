# The enlarged cover is a real `<dialog>`, and the card is still not one

Clicking the cover on the detail card opens it larger, in a native `<dialog>`
opened with `showModal()`. The card beside it remains deliberately **not** a
dialog ([ADR-0049](0049-the-card-is-a-non-modal-bottom-sheet.md)).

## Two surfaces, two roles, and the difference is behaviour

ADR-0049 refused `role="dialog"` on the card because focus never moves there:
several screen readers announce a dialog only when focus enters it, so the role
would claim a modality the surface does not have and then say nothing.

The enlarged cover is the other case. A full-viewport scrim that swallows every
click **is** modal however it is labelled, so the honest thing is to say so — and
saying so with the platform's own element buys the four things a hand-rolled
lightbox gets wrong, for nothing: focus moves in, the rest of the page goes
inert, Escape closes it, and focus returns to the control that opened it. All
four were verified in a browser.

So the two surfaces do not follow one rule about dialogs. They follow one rule
about _not lying_, which produces opposite answers because they behave
differently.

## ⚠️ One Escape, two listeners

The page's own `keydown` handler dismisses the card, and it listens on the
document — where the dialog's Escape also arrives. Left alone, one keypress
closed the viewer _and_ the card underneath it: the user asked to leave one
surface and was returned two levels.

`boot.ts` skips its handler while the viewer is open. This is the one part of
the feature no unit test could see, so it is `checkCoverViewer` in
`scripts/smoke-render.ts` (**G35**), observed red against a build with the guard
removed.

## The cover is a `<button>`, and the click is delegated

A bare `<img>` with a click handler is a control only a mouse can find. The
button carries the role, the keyboard, and the focus ring; its accessible name is
still the image's `alt`, so nothing is announced twice.

The listener is on the card **body**, not on the button: `showCard` calls
`replaceChildren` on that subtree, so a button-bound listener would survive
exactly one book. Same fact that put the close control outside it.

## ⚠️ 512px is the ceiling, and it is the publisher's, not the card's

The viewer shows the same file the card does, so `MAX_COVER_EDGE` bounds it:
about **7× the 4.5rem thumbnail**, and full-bleed on a phone. It is never scaled
_past_ native size — a blurry big cover is a worse answer than an honest small
one.

Going beyond that is a publish decision, not a card one: it needs a second,
larger staged copy. The texture budget would not notice, since a DOM image is
never a GPU texture — but `stageCover` and the covers folder would both grow, and
nobody has asked for that.

## How this was decided

The owner, from a shelf screenshot: _"i want that when we click on the image in
the book details we open a bigger version of the cover so the user can see it
closer"_.
