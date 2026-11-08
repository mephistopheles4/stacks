# Spec — the attribution and privacy notices open in a modal

**Status:** revision 3, after spec rounds 1 and 2 (`executability-lens` and `unstated-lens`; round 2 declared final). **Proceed: lead decision 312** (Head chef handoff, under the owner's level-3 goal). The decisions log is §11.
**Source:** [#536](https://github.com/mephistopheles4/stacks/issues/536). Its order
dependency, [#534](https://github.com/mephistopheles4/stacks/pull/534), merged on 2026-11-05.
**Tier:** Standard (owner, 2026-11-08). Not on the sensitive list: no auth, crypto or
data migration.

## 1. Objective

The shelf's **Attribution** link and the drawer's **Privacy** link open their notice in a
modal over the shelf. Closing it puts the visitor back where they were: the Ask conversation,
an open drawer and a held book all intact. `/attribution` and `/privacy` stay as real pages,
and the notice text is easier to read on both.

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
| N2 | **The text exists once in source**: `AttributionNotice.astro` and `PrivacyNotice.astro`, used by `attribution.astro`, `privacy.astro` and the modal. `PrivacyNotice.astro` carries the build switch with it: `{analyticsOn && <PlausibleNotice />}`, as `privacy.astro` has today. The page's "Back to the shelf" line stays in the page. | The issue's "one copy", and a modal that states less (or more) about what is counted than the page does would be wrong. A build switch is not logic G7 counts; it is in `privacy.astro` now. |
| N3 | **The modal's copy is rendered into `index.html`**, not fetched when opened. | A fetch is a request, can fail offline, and would need markup parsed from a response. Cost: the text sits in two documents, see N14. |
| N4 | **A plain left-click on a link whose `getAttribute('href')` is exactly `/attribution` or `/privacy`** opens the modal. A modified or non-primary click (ctrl, shift, meta, alt, middle) is left alone and opens the page in a new tab. One delegated listener; the decision is a pure function of the attribute and the event. **`preventDefault` runs only after `showModal()` has succeeded**, so a throw, or a missing dialog, lets the link navigate as a plain link does. | "The links stay plain links". Catches the in-notice link from Attribution to Privacy too. The failure case is the Safety quality: the safe state is the page. |
| N5 | **That in-notice link swaps the panel; it does not stack a second modal.** `aria-labelledby` follows the panel shown, and focus moves to the shown panel's heading (`tabindex="-1"`), since the link that held it is now hidden. Closing returns focus to the link that opened the modal first. | One modal, one opener to remember, one accessible name that is true, and no focus left on a hidden element. |
| N6 | **The drawer's Privacy link keeps `target="_blank" rel="noopener"` as its failure fallback and loses only its "(opens in a new tab)" text.** Both opening links, this one and the shelf's Attribution link, gain `aria-haspopup="dialog"`. A successful open calls `preventDefault`, so the new tab never fires. | The memory lives in the page, so a fallback that navigates in place would end the chat, which is the loss this issue exists to stop. With the attribute kept, a failure opens the page in a new tab and the chat stays. The pickup gate already requires `rel` on a `_blank` link. |
| N7 | **Focus is wrapped by us**: Tab on the last control goes to the first, Shift+Tab the reverse. Focus starts on the close button. **The restore of focus to the opener, and the reset of which opener and panel are remembered, run on the dialog's `close` event**; Escape keeps its explicit `close()`. | Native modal dialogs let Tab leave for the browser chrome, which does not meet C2's "stays there". Cleanup on `close` covers a close the modal did not start, such as the Android close watcher (R2). |
| N8 | **Keys while a notice is open belong to the modal.** Its window-capture keydown listener handles Escape with `preventDefault()` and then calls `dialog.close()` itself, never leaving the close to the browser's default. The drawer's Escape listener stands down when `noticeIsOpen()` **or** `event.defaultPrevented`, so it holds in either listener order. The shelf's whole keydown handler, not only its Escape branch, returns early on the same two tests, so arrow and Home keys cannot turn a held book behind the modal. **The browser's Back is not handled** (R4). | The drawer listens for Escape first, on the window, and reads only its own state; the shelf's Escape is `putBack()`; and the shelf turns a held book from `document.body` on the arrows, which is where focus lands after a click on plain text. |
| N9 | **A click on the backdrop closes the modal**, on the `click` event and only when the press began on the backdrop too, so a text selection that ends outside does not. The drawer's outside-click rule, which closes on a document-capture `pointerup`, ignores any pointer event while the modal is open, and a click on a notice link counts as inside the drawer. | C3, and "where they were": opening Attribution from the shelf with the drawer open must not close the drawer. The modal closes on `click`, which follows `pointerup`, so the drawer always sees the modal still open and needs no second guard. |
| N10 | **The modal changes nothing about rendering**: no `backdrop-filter`, no blur, no animation on the backdrop, no pause or change to the render loop, no new light or shadow. | C4. A blur over a WebGL canvas is the likeliest way to make the phone worse, and G61's configuration is the only one measured to survive. |
| N11 | **No history entry, no URL change, no analytics event.** | C1. A new event would make the privacy notice's statement about what is counted wrong. |
| N12 | **Type: 1.125rem, line-height 1.6, body colour at least 7:1 on its background, about 65 characters a line.** Owner: "18px at 7:1 or better stands" (2026-11-08). Step 0 records the baseline and does not reopen the numbers. The type lives in one `NoticeBody.astro` that both notice components wrap their text in. A scoped style cannot reach text passed in through a slot, so it styles through `:global()` under its own class (`.notice-body :global(p, h1, h2, a)`) and declares every property the host pages' global `h1` and `p` rules also set (`index.astro` sets a global `h1`). **`NoticePage.astro` gives up its `body.notice` text rules** (colour, `h1`, `h2`, `p`, `a`) and keeps layout only, since at specificity 0,1,2 they would beat the new rules. The heading stays an `h1` in the modal, named by `aria-labelledby`. | C5. Today's body is the browser default 1rem in `#a89684`, about 6.3:1. |
| N13 | **The dialog has a capped height, `calc(100dvh - 2rem)`, and scrolls inside itself.** The shelf page is `overflow: hidden`, so without it a long notice at 375x812 would be cut off. | C5, C2: the end of the privacy notice must be reachable by keyboard from the close button. |
| N14 | **Apple's credit line stays in both the modal and `/attribution`**, shown once at a time, from the one source. Lead's decision 284 (2026-11-08); the owner can override. | Apple asks for the line "only once in your communication or website" (attribution-surface §3). Displayed, it is once; in the HTML it is two documents. Not legal advice. **An override at any step is a stop: the build stops and the spec returns to Design**, because a fetch is no revert (it goes against N3's reasons, and parsing fetched markup needs `innerHTML`, which §8 forbids). |

## 3. Acceptance claims

Each is a check that can fail. Measures use the pact's table. Every browser check is a cell in
`scripts/smoke-render.ts`, landing in the build step that §6 names.

| # | Claim | Measure | Proved by |
| --- | --- | --- | --- |
| C1 | Opening and closing either notice, from the shelf link or the drawer link, keeps the conversation, an open drawer and a held book, with no navigation. | Functional | Browser. Set-up in G35's order: hold a book, then open the drawer, then send a question; the offline build has no Turnstile key, so the thread holds the **unavailable reply**, which is enough to read. Open and close each notice from each opener. Reads the thread text, the held id, `aria-expanded`, and **a `window` sentinel set before opening, read after closing**, plus the count of main-frame `framenavigated` events. Planted breaks: remove the click handler, and the sentinel and count go red; remove the dialog from the markup, and a click on the drawer's Privacy link opens a new tab while the thread stays in the original one (N6). |
| C2 | Focus moves into the modal, cycles inside it (Tab and Shift+Tab, both ends), returns to the opener; **one Escape** closes the modal alone, leaving the drawer (`aria-expanded` still `true`) and a held book as they were; the dialog's computed accessible name is the shown panel's, **before and after a swap**, and after a swap `document.activeElement` is the shown panel's heading; the end of each notice is reachable by keyboard from the close button at 375x812. | Interaction | Browser, keyboard only, from both openers, with and without a held book and an open drawer. Planted break: remove **both** of the drawer's Escape tests (`noticeIsOpen()` and `defaultPrevented`), and the one-Escape step goes red with `aria-expanded` reading `false`. |
| C3 | A click or an arrow key behind the modal reaches nothing: no pickup, no put-back, no drawer close, **no turn of a held book**. | Functional | Browser: click a spine, the empty shelf, the drawer's outside area and plain notice text, press the arrows with focus on `body`, all with a book held; the held state, turn and `aria-expanded` are unchanged. A backdrop click, run with the drawer open, closes the modal and nothing else: `aria-expanded` still reads `true`. |
| C4 | No third-party request, the CSP gate passes, and the render is no worse with the modal open. | Performance, Compatibility | CSP: G20 over the new `index.html`; no inline `style=""` attribute in the markup. Requests: the log from C1. Render: with the modal open, the shadow-sampling draw count equals the same page without it, on the default page and with a book held (G61's reading). **The phone is the owner's run**, since CI has no GPU: `scripts/phone-check.ts --notice attribution` and `--notice privacy`, a new flag that opens the notice before the watched window, so the same run reads with and without it. The figure is the script's own: the `phoneVerdict` kind (`survived` or not, which is the WebGL context held or lost) and the sampling row it prints. See §7. |
| C5 | The text is comfortable at 1440x900 and 375x812, in the modal and on both direct pages, **and the last line of each notice can be scrolled into view in the modal at both widths**. | Interaction | Browser reads of computed font size (at least 18px), contrast (at least 7:1) and heading style, **equal on the page and in the modal**; six screenshots (two notices, three places) go to the owner. |
| C6 | `/attribution` and `/privacy` show the notice with JavaScript disabled and keep `noindex`. | Compatibility | Browser with JavaScript off reads both built pages; `gate:public`'s robots rule already reads every built page. |
| C7 | The links stay plain links: `href` unchanged, a modified click still opens the page. | Compatibility | Unit tests of the decision function, fed the attribute form; one browser ctrl-click. |
| C8 | The modal's privacy panel states what the page states, in a build with analytics off and one with it on. | Functional | The existing `privacy` rule in `scripts/lib/public-build.ts` (it reads `privacy/index.html` for the Cloudflare and Plausible statements) also reads the panel in `index.html`. The panel has the id `notice-privacy`, and the rule slices `index.html` to that element before it matches, so text elsewhere on the shelf page cannot satisfy it. Planted case: a panel that omits the Plausible paragraph while the rest of `index.html` names it turns the rule red. |

**Tests that back no claim are not added** (the pact's "Tests added" limit is 0). Every unit
test names its claim; none restates a browser cell.

## 4. Where it goes

```text
packages/site/src/notice/
  Notices.astro        the <dialog> and the two panels: markup, styles, and the one <script> that
                       imports start.ts and calls it (G7 allows exactly that)
  start.ts             finds the elements, mounts the modal (the shelf's and drawer's pattern)
  modal.ts             open, swap, close, focus wrap, backdrop click, Escape
  links.ts             pure: which notice, if any, a click should open       (C7)
  open.ts              noticeIsOpen(document) and the ids the other two modules read
packages/site/src/components/
  NoticeBody.astro                               the type (N12), wrapped by both below
  NoticePage.astro                               keeps layout only; its text rules move to NoticeBody
  AttributionNotice.astro, PrivacyNotice.astro   the one copy of each text (N2)
packages/site/src/ask/Ask.astro                  the Privacy link (N6)
packages/site/src/components/Attribution.astro   aria-haspopup on the Attribution link (N6)
packages/site/src/ask/drawer.ts                  stands down while a notice is open (N8, N9)
packages/site/src/shelf/pickup.ts                the whole keydown handler stands down (N8)
packages/site/src/pages/{attribution,privacy,index}.astro   use the shared text; index mounts <Notices />
scripts/smoke-render.ts                          the notice cells (C1 to C6)
scripts/lib/public-build.ts                      the privacy rule reads the panel (C8)
scripts/phone-check.ts, docs/commands.md         the --notice flag (C4), and its documentation
```

The seam follows `ask/bridge.ts`: a constant and a one-line check, not an import of the modal's
logic. Logic is in `.ts` and G7 (`astro-no-logic`) holds it there.

## 5. Docs the change must also move

- `docs/spec/attribution-surface.md` §2, "A route, not a modal": the route stays, the modal is added on top, and the paragraph says so. §4's basis ("occluded by a dismissible, **non-modal** overlay") gets a line for the modal case (R6). New ADR (a number with room above 0139, its row in `docs/adr/README.md` for G58, checked again before merge) records both and N14.
- `docs/spec/ask-the-library.md` S7 (lines 458 to 468), C9 and line 1204: the Privacy link opens the modal and falls back to a new tab.
- `docs/commands.md`: the `--notice` flag, beside the other `phone-check.ts` options.
- `docs/gates.md` and `docs/progress.md` in the commit that adds each gate cell, so step 1's commit already moves them; `AGENTS.md` only if a rule changes (none expected). The `privacy` rule (C8) also covers the panel, which the gates doc says.
- `docs/spec/README.md` build-order row.

## 6. Build order

Each step lands the checks for the claims it cites, and is done when its line says so.

0. **Baseline.** A throwaway script in the scratch folder (not committed) screenshots both direct pages at 1440x900 and 375x812 into `artifacts/`, prints computed font size, colour and contrast, and saves each page's `main` text content. **Done when** the four screenshots and the two text files exist and the numbers are in the commit message of step 1.
1. **Shared text and type** (N2, N12). Extract the components and `NoticeBody.astro`. **Done when:** the built text of `/attribution` and `/privacy` is identical to step 0's, apart from the type; a new `smoke-render` cell reads both pages with JavaScript off at both widths (C5 on the pages, C6); `docs/gates.md` and `docs/progress.md` carry the cell. The four page screenshots go to the owner here (not a stop).
2. **The pure parts, test first.** `links.ts`. **Done when** its unit tests were red for the right reason and are green (C7).
3. **The modal and the Attribution link** (N1, N4, N5, N7, N13). **Done when** the C1 and C2 cells pass from the shelf link with no drawer and no held book, the C5 modal cell (computed type equal to the pages', and the last line reachable) passes at both widths, and the planted break (handler removed) turns C1 red.
4. **The drawer and the shelf stand down; the drawer link** (N6, N8, N9). **Done when** C1 to C3 pass from both openers with the drawer open and a book held, removing both of the drawer's Escape tests turns C2 red, and removing the dialog sends the drawer link to a new tab with the thread intact.
5. **Render, privacy rule, phone flag, docs** (C4, C8, §5). **Done when** every cell is green under `pnpm smoke:render` on the host, `pnpm gate:public` is green, `phone-check.ts --notice` parses its arguments in a unit test, the docs have moved, and the six screenshots and the host draw-count output are ready for the lead.

## 7. Where it runs

- **Browsers.** Desktop Chrome through puppeteer, for every cell. Android Chrome on the owner's Pixel, through `scripts/phone-check.ts`. Firefox and Safari are not checked (R5).
- **Commands.** `athanor run test`, `typecheck`, `lint` and `build`; on the host `pnpm lint:md`, `pnpm format:check`, `pnpm gate:public` and `pnpm smoke:render`.
- **Which run proves what.** `athanor run smoke` is a pass or a fail and keeps its screenshots in the container, so the screenshots and step 0 come from the host `pnpm smoke:render`. G60 and G61 skip pull requests (`SKIPPED_ON_PULL_REQUESTS`), so C4's draw-count reading runs on the host and on `main`'s push run; the owner watches that run after merge, as `picking-up-closed.md` S14 asks.
- **Not run:** `pnpm deploy:site --dry-run`, which builds from the real vault and is the owner's.
- **The owner's two steps, confirmed by the lead (decision 302).** The phone run, `phone-check.ts --notice attribution` and `--notice privacy`, happens **before merge**, and fails on a lost WebGL context, or a verdict or sampling row worse than the same run without the flag. The six screenshots are reviewed **before merge**. Both come to the lead.

## 8. Boundaries, rollback, stop

- **Always:** text through `textContent` or the shared components, never `innerHTML`; `athanor run` for the suite; the screenshot to `artifacts/`.
- **Ask first:** any new dependency (none planned), any change to the Google graphic or the Attribution link's look, any change to the notice wording.
- **Never:** blur or animate the backdrop, pause the render loop, add a third-party request, write the chat to storage, drop `noindex` from the pages.
- **Rollback** is a revert of the merge and a redeploy; nothing is stored or migrated.
- **Stop and ask the owner** if the draw count differs with the modal open, if the phone loses its context with it open, or if the Escape interplay does not hold after two approaches.

## 9. Trade-offs and residuals

**Trade-off points.** Robustness against size: manual Tab wrap, an explicit close and an explicit
focus restore add about 40 lines over bare `showModal()`, taken for C2. Reach against requests: the
text is in the shelf's HTML twice rather than fetched, taken for the driver.

**Qualities touched:** functional suitability, interaction capability, compatibility,
performance efficiency, safety (N4). Security only through the CSP gate.

- **R2. The back gesture** on Android may close a modal through the browser's close watcher and may not; only the phone says. Not claimed; if it does close the dialog, N7's cleanup on the `close` event still restores focus.
- **R3. The drawer's notice has no deep link.** `/#privacy` is not added: that would be a URL change (N11).
- **R4. The browser's Back with a notice open** acts as it does with no modal: with a book held it puts the book back under the modal; with none it leaves the site and the conversation goes. That is today's behaviour on the shelf, not a new loss, but it is the issue's problem arriving by another door. The alternative is the shelf's `popstate` closing the modal first, which leaves the history one entry short of the held book; not taken.
- **R5. Firefox and Safari are not checked.** `<dialog>` and `showModal()` are in all current browsers; N4's fallback makes a failure a plain navigation.
- **R6. The modal covers the "powered by Google" graphic while it is open, at every width.** `attribution-surface.md` §4 accepted the phone occlusion because the overlay was "dismissible, non-modal"; this one is dismissible and modal, and the shelf behind it keeps drawing Google-derived geometry. The graphic is in the DOM and displayed on load, and it returns on close, and the visitor opens the modal themself. **Accepted: lead decision 302.** The owner can override; not legal advice.
- **R7. A reply that arrives while a notice is open is not announced.** The drawer is inert under a modal, so its live region is out of the accessibility tree, and the answer is in the thread when the notice closes. Accepted; no test.

## 10. Still with the owner

Nothing blocks the build. The owner can override, at any point, the lead's picks recorded in §11 (Apple, R6, R4, the two before-merge steps). Merging is the owner's.

## 11. Decisions log

Taken by the lead (Head chef handoff) under the owner's level-3 goal for #536, not by the owner in chat; each can be overridden.

| Decision | What | Where |
| --- | --- | --- |
| 284 | Apple's credit line stays in the modal and on `/attribution`, from one source | N14 |
| 298 | Spend round 2 and declare it final | the round 2 comment on #536 |
| 302 | R6 accepted (the Google graphic returns on close); the phone run and the screenshot review stay before merge; R4 accepted | R6, R4, §7 |
| 312 | Fold the three round 2 trade-offs and the ten lows into revision 3, include the `--notice` flag, and proceed | this revision |
