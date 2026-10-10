# ADR-0102 — Pickup replaces the card for every book

**Date:** 2026-10-09
**Status:** accepted; built in [#413](https://github.com/mephistopheles4/stacks/issues/413) — [`docs/spec/picking-a-book-up.md`](../spec/picking-a-book-up.md)
**Issue:** [#366](https://github.com/mephistopheles4/stacks/issues/366), [#369](https://github.com/mephistopheles4/stacks/issues/369), [#371](https://github.com/mephistopheles4/stacks/issues/371)
**Supersedes in part:** [ADR-0049](0049-the-card-is-a-non-modal-bottom-sheet.md)

## Decision

Clicking a book picks it up: it slides out of the shelf, comes to the camera,
turns, and opens. **This happens for every book**, whether or not it has
Thoughts. The card overlay retires.

- **A book with Thoughts** opens to them on the right-hand page.
- **A book without** opens to the card's own lines laid out on that page, so
  the shelf degrades to what it showed before.
- **The card's content moves onto the pages.** Title and author on the left
  page; the reading line, object line, subjects and links on the right, below
  the Thoughts when there are any. On a phone, which frames the right-hand page
  alone, the title and author lead that page too.
- **A put-back control replaces the close control.** Escape, a click on empty
  space and the back button put the book back too. On a phone the page fills
  the screen, so the control is how a touch reader puts it down.
- **The enlarged cover ([ADR-0052](0052-the-enlarged-cover-is-a-real-dialog.md))
  stays**, opened from the page, showing the held copy when one exists.
- **Focus still never moves on pickup**, for ADR-0049's reason: there is no
  keyboard path to the shelf, so there is no origin to return focus to.

## What it supersedes

ADR-0049's bottom sheet and its drag-to-dismiss retire with the card.
Its rule that focus never moves, and its reason, carry over unchanged. Its
breakpoint no longer decides a layout; the phone's framing does.

## Why every book

Two interactions, one for books with Thoughts and one without, would make a
visitor learn which kind of book they had clicked before they knew what a
click does. #369's prototype showed that a book with no Thoughts, its card's
lines on the open page, reads as the same interaction.

## Alternatives rejected

- **Pickup for books with Thoughts, the card for the rest.** Two interactions.
- **Keep the card beside a held book.** Two surfaces showing one book's
  metadata.
- **The camera moves to the book.** Measured on #371: a swap then jumps,
  because the camera flies from wherever it was.

## Consequences

- AGENTS.md's Phase 2 gate changes from "clicking a book opens the card" to
  "picks it up", and its tech-decisions line about the card overlay changes
  with it, in the commit that builds the page.
- G35 (`enhanced-card`) keeps its number. Its checks move onto the page, its
  close-control check becomes a put-back-control check, and the sheet check
  retires. The spec's §3.5 lists each one.
