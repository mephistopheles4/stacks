# Spec — the attribution and privacy notices open in a modal

**Status:** draft, waiting for the owner's proceed.
**Source:** [#536](https://github.com/mephistopheles4/stacks/issues/536). Its order
dependency, [#534](https://github.com/mephistopheles4/stacks/pull/534), merged on 2026-11-05.
**Tier:** Standard (owner, 2026-11-08). Not on the sensitive list: no auth, crypto or
data migration.

## 1. Objective

The shelf's **Attribution** link and the drawer's **Privacy** link open their notice in a
modal over the shelf. Closing it puts the visitor back exactly where they were: the Ask
conversation, an open drawer and a held book all intact. `/attribution` and `/privacy` stay as
real pages, and the notice text is easier to read on both.

Today the first link reloads the site and ends the conversation, because memory is a page
variable ([ask-the-library.md](ask-the-library.md) D2); the second opens a new tab, which takes
the visitor off the shelf. The owner prefers a modal to saving the chat across a navigation, and
keeping memory in the page is what the Ask spec's "not stored" statement promises.

**Business driver** (from the issue; AGENTS.md names none): *the Ask the library "not stored"
promise stays true.* It decides every trade-off below.

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| N1 | **One native `<dialog>`, opened with `showModal()`, holding both notices as two panels**; one panel shown at a time. The drawer's notice does not live inside the drawer. | Answers both of the issue's open questions. The platform gives the top layer, an inert background and Escape. A panel inside the drawer would need a second mechanism for the shelf's link, and could not cover a held book. |
| N2 | **The text exists once in source**: `AttributionNotice.astro` and `PrivacyNotice.astro` (markup only), used by `attribution.astro`, `privacy.astro` and the modal. The page's "Back to the shelf" line stays in the page, not the component. | The issue's "one copy". |
| N3 | **The modal's copy is rendered into `index.html`**, not fetched when opened. | A fetch is a request, can fail offline, and would need markup parsed from a response. Cost: the text sits in two documents, see residual R1. |
| N4 | **A plain left-click on a link whose `href` is exactly `/attribution` or `/privacy`** opens the modal and is `preventDefault`ed. A modified or non-primary click (ctrl, shift, meta, alt, middle) is left alone and opens the page in a new tab. One delegated listener; the decision is a pure function. | "The links stay plain links". Also catches the in-notice link from Attribution to Privacy. |
| N5 | **That in-notice link swaps the panel; it does not stack a second modal.** Closing returns to the link that opened the modal first. | One modal, one opener to remember. |
| N6 | **The drawer's Privacy link loses `target="_blank"` and its "(opens in a new tab)" text.** It gains `aria-haspopup="dialog"`. | The modal replaces the new tab. If the handler were ever missing, the link would navigate in place; accepted, since the drawer itself is script. |
| N7 | **Focus is wrapped by us**: Tab on the last control goes to the first, Shift+Tab the reverse. Focus starts on the close button. Close restores focus to the opener explicitly. | Native modal dialogs let Tab leave for the browser chrome, which does not meet C2's "stays there". Explicit restore does not lean on browsers that skip it. |
| N8 | **Escape and the back gesture close the modal alone.** The modal marks the Escape handled on a window capture listener; the drawer and the shelf each check a shared `noticeIsOpen()` and stand down. The `<dialog>`'s `close` event is the one place cleanup runs. | The drawer listens for Escape first, on the window, and the shelf's Escape is `putBack()`. Without the check one Escape closes all three. |
| N9 | **A click on the backdrop closes the modal** (pressed and released on the backdrop itself, so a text selection that ends outside does not). The drawer's outside-click rule ignores any click while the modal is open, and a click on a notice link counts as inside the drawer. | C3, and "returns to exactly where they were": opening Attribution from the shelf with the drawer open must not close the drawer. |
| N10 | **The modal changes nothing about rendering**: no `backdrop-filter`, no blur, no animation on the backdrop, no pause or change to the render loop, no new light or shadow. | C4. A blur over a WebGL canvas is the likeliest way to make the phone worse, and G61's configuration is the only one measured to survive. |
| N11 | **No history entry, no URL change, no analytics event.** | C1. A new event would make the privacy notice's statement about what is counted wrong. |
| N12 | **Type.** The shared notice text is `1.125rem` on the page and in the modal, line-height 1.6, body colour at least 7:1 on its background, line length capped near 65 characters. | C5. Today's body is the browser default 1rem in `#a89684`, about 6.3:1. The step 0 screenshots decide whether this goes further. |

## 3. Acceptance claims

Each is a test that can fail. Measures use the pact's table.

| # | Claim | Measure | Proved by |
| --- | --- | --- | --- |
| C1 | Opening and closing either notice, from the shelf link or the drawer link, keeps the conversation and a held book, with no navigation request and an unchanged `location.href`. | Functional | Browser: ask a question (a stubbed `/api/chat` reply), open the drawer, hold a book, open and close each notice. Reads the thread text, the held book id, `performance.getEntriesByType('navigation').length` and the request log. |
| C2 | Focus moves into the modal, cycles inside it (Tab and Shift+Tab, both ends), and returns to the opener; Escape closes the modal alone, leaving the drawer and a held book as they were; the modal has an accessible name and `aria-modal`. | Interaction | Browser, keyboard only, from both openers, with and without a held book and an open drawer. |
| C3 | A click behind the modal reaches nothing: no pickup, no put-back, no drawer close. | Functional | Browser: click a spine, the empty shelf and the drawer's outside area while the modal is open; the held state and `aria-expanded` are unchanged. Backdrop click closes the modal and nothing else. |
| C4 | No third-party request, the CSP gate passes, and the render is no worse with the modal open. | Performance, Compatibility | CSP: G20 over the new `index.html`, no inline `style=""` attribute in the markup. Requests: the log from C1. Render: with the modal open, the shadow-sampling draw count equals the same page without it, on the default page and with a book held (G61's reading). **The phone is the owner's run**: `scripts/phone-check.ts` with the modal open, since CI has no GPU. |
| C5 | The text is comfortable at 1440x900 and 375x812, in the modal and on both direct pages. | Interaction | Computed font size and contrast asserted in the browser run; the six screenshots (two notices, three places) go to the owner. |
| C6 | `/attribution` and `/privacy` show the notice with JavaScript disabled and keep `noindex`. | Compatibility | Browser with JavaScript off reads both built pages; `gate:public`'s robots rule already reads every built page. |
| C7 | The links stay plain links: `href` unchanged, a modified click still opens the page. | Compatibility | Unit tests of the decision function; browser check of one ctrl-click. |

**Tests that back no claim are not added** (the pact's "Tests added" limit is 0). The unit tests
below each name their claim; none is a restatement of a browser test.

## 4. Where it goes

```text
packages/site/src/notice/
  Notices.astro        the <dialog> and the two panels: markup and styles only
  start.ts             finds the elements, mounts the modal (the shelf's and drawer's pattern)
  modal.ts             open, swap, close, focus wrap, backdrop click, Escape
  links.ts             pure: which notice, if any, a click should open       (C7)
  open.ts              noticeIsOpen(document) and the ids the other two modules read
packages/site/src/components/
  AttributionNotice.astro, PrivacyNotice.astro   the one copy of each text (N2)
packages/site/src/ask/drawer.ts                  stands down while a notice is open (N8, N9)
packages/site/src/shelf/pickup.ts                Escape check (N8)
packages/site/src/pages/{attribution,privacy,index}.astro   use the shared text; index mounts <Notices />
```

The seam follows `ask/bridge.ts`: a constant and a one-line check, not an import of the modal's
logic. Logic is in `.ts` and G7 (`astro-no-logic`) holds it there.

## 5. Docs the change must also move

- `docs/spec/attribution-surface.md` §2, "A route, not a modal": the route stays; the modal is added on top and the
  paragraph says so. New ADR (number left with room, checked again before merge) records
  the reversal and the Apple "once" reading (R1).
- `docs/spec/ask-the-library.md` S7 (lines 458 to 468), C9 and line 1204: the Privacy link opens the modal, not a new tab.
- `docs/gates.md` and `docs/progress.md` in the commit that adds the browser gate; `AGENTS.md` only if a rule changes (none expected).
- `docs/spec/README.md` build-order row.

## 6. Build order (thin slices, each green on its own)

0. **Baseline**: screenshot both direct pages at both widths and read the computed font size, so C5 starts from a number.
1. **Shared text and type** (N2, N12): extract the two components; both pages render unchanged but for the type. C5 and C6 on the pages.
2. **The pure parts, test first**: `links.ts` (C7).
3. **The modal**: `Notices.astro`, `modal.ts`, `start.ts`; Attribution link opens it; focus and Escape (C1, C2 from the shelf).
4. **The drawer and the shelf stand down**; drawer link opens it (C1 to C3 from the drawer, with a held book).
5. **The browser gate** in `smoke-render` (C1 to C6) and the doc moves in §5; the owner's phone check (C4).

## 7. Boundaries

- **Always:** text through `textContent` or the shared components, never `innerHTML`; `athanor run` for the suite; the screenshot to `artifacts/`.
- **Ask first:** any new dependency (none planned), any change to the Google graphic or the Attribution link's look, any change to the notice wording.
- **Never:** blur or animate the backdrop, pause the render loop, add a third-party request, write the chat to storage, drop `noindex` from the pages.

## 8. Trade-offs and residuals

**Trade-off points.** Robustness against size: manual Tab wrap and an explicit focus restore
add about 30 lines over bare `showModal()`, taken for C2. Reach against requests: the
text is in the shelf's HTML twice rather than fetched, taken for the driver.

**Qualities touched:** functional suitability, interaction capability, compatibility,
performance efficiency. Security is touched only through the CSP gate.

- **R1. Apple asks for its credit line "only once in your communication or website"**
  (attribution-surface §3). Displayed, it is still once at a time; in the HTML it is now in
  `index.html` and `/attribution`. Not legal advice, and a judgement for the owner.
- **R2. The back gesture** on Android may close a modal through the browser's close
  watcher and may not; only the phone says. Not claimed.
- **R3. The drawer's notice has no deep link.** `/#privacy` is not added: that would be a URL change (N11).

## 9. Open for the owner

1. **Proceed, change or kill** this spec. Defaults above stand if you only say proceed.
2. **N12's numbers** (18px, 7:1) are my pick; the step 0 screenshots may move them. Say if you want a larger step.
3. **R1** needs your reading, not mine.
