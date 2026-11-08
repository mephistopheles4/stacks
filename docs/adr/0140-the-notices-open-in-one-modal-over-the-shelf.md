# ADR-0140 — The notices open in one modal over the shelf

**Date:** 2026-11-08
**Status:** accepted. The lead decided under the owner's level-3 goal (decisions 284, 298, 302,
312 and 327), and the owner settled the type on 2026-11-08 ("18px at 7:1 or better stands").
The spec is `docs/spec/notice-modals.md`, revision 3,
[#536](https://github.com/mephistopheles4/stacks/issues/536). Amends
[ADR-0138](./0138-the-closed-book-in-hand-turns-and-the-dialog-goes.md)'s "no `<dialog>` on the
page" in one respect, and
[ADR-0139](./0139-optional-plausible-direct-to-plausible-io.md)'s count of nine mutation scopes,
which is ten.

## Decision

The shelf's Attribution link and the Ask drawer's Privacy link open their notice in one native
`<dialog>`, `showModal()`, that holds both notices as two panels. `/attribution` and `/privacy`
stay as pages, `noindex` and working with no script. The reason is the page variable: the Ask
chat's memory is a page variable ("not stored", D2 of the Ask spec,
[`ask-the-library.md`](../spec/ask-the-library.md)), so leaving the page loses the conversation and a held book. A modal over the shelf
keeps both.

- **The text exists once**, in `AttributionNotice.astro` and `PrivacyNotice.astro`, used by the
  two pages and the modal alike; `PrivacyNotice` carries the analytics paragraphs with it. The
  type is one component, `NoticeBody.astro`, at 1.125rem and a line-height of 1.6, 9.31:1 against
  the page, where the pages were 16px at 6.30:1.
- **The modal's copy is rendered into `index.html`**, not fetched when opened. A fetch is a
  request, can fail offline, and would parse markup from a response, which needs `innerHTML`.
  The cost is that the text sits in two documents, which the public-build `privacy` rule reads
  as it reads `/privacy` (the panel `notice-privacy`).
- **The links stay plain links.** A plain left-click on `/attribution` or `/privacy` opens the
  modal and `preventDefault` runs only after `showModal()` has succeeded; a modified click opens
  the page in a new tab as before, and a failure leaves the link to navigate.
- **The drawer's Privacy link keeps `target="_blank" rel="noopener"`** as its failure fallback,
  because a fallback that navigated in place would end the chat, which is the loss this exists
  to stop. With the dialog removed, the drawer link opens a new tab and the thread stays in the
  original one, and the shelf link navigates; G35 reads both.
- **Keys and clicks behind it reach nothing.** The drawer's Escape listener and the shelf's whole
  keydown handler return when a notice is open or the key was already handled, and the drawer's
  outside-click rule ignores a press while one is open and counts a notice link as inside.
- **No change to rendering:** no blur, no animation on the backdrop, no pause of the render
  loop, no new light. G61 reads the draw count with a notice open, alone and over a held book,
  and it equals the same page without one. The phone is the owner's run,
  `scripts/phone-check.ts --notice attribution|privacy`.
- **Apple's credit line stays in both places**, shown once at a time, from the one source (the
  lead's decision 284). Apple asks for it "only once in your communication or website"; it is
  displayed once and sits in two documents. The owner can override, and an override is a return
  to design: a fetch does not revert this.

## Two checks loosened, on purpose

- **G35's "no `<dialog>` on the page"** now excludes `#notice-dialog`. It guarded the retired
  examining dialog of the closed book ([ADR-0138](./0138-the-closed-book-in-hand-turns-and-the-dialog-goes.md)),
  and a notice modal is a different thing; any other `<dialog>` still fails it.
- **Three files in `packages/site/src/notice/` are excluded from mutation**, `modal.ts`,
  `start.ts` and `open.ts`, with a mechanism each: browser-only glue that no in-process spec
  has. The decisions in it live in `links.ts` and `focus.ts`, which are measured, and the glue is
  held by G35's notice cells, planted red. The directory is the tenth mutation scope.

## Not decided here

The browser's Back button while a notice is open is not handled (spec residual R4): the modal
makes no history entry, and a Back leaves the shelf as it does with the drawer open. The Google
"powered by" graphic stays under the modal's backdrop while it is open (R6), accepted by the
lead; it is displayed on load and the modal is one gesture from dismissal.
