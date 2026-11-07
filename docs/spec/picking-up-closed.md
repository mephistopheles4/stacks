# A picked-up book arrives closed, and the visitor opens it

The spec for [#531](https://github.com/mephistopheles4/stacks/issues/531). Tier:
standard, one build session. It matches nothing on the sensitive list: no auth,
crypto or data migration, no CSP change, and no new data leaves the site. Written
on 2026-11-04 from a grilling through an eagle-eye box, whose accepted set is S2.
**Nothing here is built.** **Signed off by the owner on 2026-11-04 ("Yes, sign off and push").**
No lens has read the fixes from the final review round.

**Do not start the build until #532's shelf changes exist.** Its base is O4. This spec
reads
[#532's spec](https://github.com/mephistopheles4/stacks/blob/docs/532-ask-the-library/docs/spec/ask-the-library.md),
S7 and S8, and that branch's code at e0bc3c9. It amends
[`picking-a-book-up.md`](picking-a-book-up.md) §1, §2, §3.1, §3.4, §3.5, §3.6 and §3.11,
and does not reopen anything else there. For §3.1: Thoughts that arrive while the book is
closed appear with no fade, and they fade in only while the page shows.

## S1. Objective

> A book picked up off the shelf arrives closed, and the visitor opens it themselves
> to look inside. Today it arrives open.
>
> The "put the book back" button becomes an X icon, using a hard-coded inline SVG.

Relayed from the owner, with the reason that the pickup would be more fun. The
accepted cost: reading a book's Thoughts takes a second action.

The two belong together. The put-back button is on the right-hand page, and the
pages stay hidden until the cover passes 95° (`textOpacity`). A closed book would
have no way to be put back, so the X must leave the page.

## S2. The owner's decisions

Accepted on 2026-11-04. Each row was a choice in the box.

| Decision | Choice |
| --- | --- |
| Which pickups arrive closed | Every pickup, from the shelf or from a chat link |
| What `held` means | At rest in the hand, now closed. `opened` is a separate reading |
| Where the opening motion lives | One timeline that stops at closed. Opening plays the rest |
| What opens it for a pointer | A click or tap on the held book |
| The Open button | A real button, "Open «Title»", visually hidden until it has focus |
| Telling a sighted visitor | While closed, the header hint says a click opens it, and the cursor is a pointer over the book. No motion cue |
| Closing without putting back | None. The X and Escape put the book back |
| Escape, drawer shut | Puts the book back, from closed and from open |
| Turning the book | "Turn the book over" stays on the open page |
| Where the X sits | Fixed at the top left, directly under the header block, on its left edge |
| The viewer's close mark | A back arrow, as an inline SVG, staying at the top right |
| How a book goes back | One reversed motion, from closed or from open. Cuts only under reduced motion and on a lost context, plus ADR-0109's cut for an examined book |
| One click with the drawer open | With a book in hand, the canvas ignores the click that closes the drawer. With an empty hand, a shelf click still picks up |
| A chat link to the book in hand | The drawer closes, and the book stays as it is |
| The X and the open drawer | The X stays under the panel, at the launcher's layer |
| Pressing the X by pointer with the drawer open | The drawer closes and the book goes back. By key, the book goes back and the drawer stays |

The owner first picked "No button", then took "visually hidden until focus". The
canvas has `tabindex="-1"`, so Tab cannot reach it, and a screen reader cannot
activate a key handler on the document. The hidden button looks the same to a mouse
or touch visitor and keeps a way to the Thoughts for everyone else.

## S3. What each input does

Each cell has one result. "Back" means the reversed motion and one history entry
removed (§3.9). "Swap" puts the first book back and picks the second up, replacing the
entry's state, so history does not change. The X and the Open button sit outside the
pages (S5).

**With the drawer shut:**

| Input | Book closed | Book open |
| --- | --- | --- |
| Click or tap on the book | Opens | Nothing |
| Click on empty space | Back | Back |
| Click on another book | Swap; the new book arrives closed | Swap; the new book arrives closed |
| The X | Back | Back |
| The Open button | Opens | Not present |
| Escape | Back | Back |
| The back button | Back | Back |

**With the drawer open over a held book:**

| Input | Book closed | Book open |
| --- | --- | --- |
| Click or tap on the book | Drawer closes; book stays closed | Drawer closes; book stays open |
| Click on empty space | Drawer closes; book stays | Drawer closes; book stays |
| Click on another book | Drawer closes; no swap | Drawer closes; no swap |
| The X by pointer, desktop | Drawer closes; back | Drawer closes; back |
| The X by key | Back; drawer stays | Back; drawer stays |
| The X by pointer, phone | Under the panel: close the drawer first | The same |
| The Open button, by key | Opens; drawer stays | Not present |
| The Open button, by pointer | Opens; drawer closes | Not present |
| Escape | Drawer closes; book stays | Drawer closes; book stays |
| The back button | Back; drawer stays | Back; drawer stays |
| Chat link to this book | Drawer closes; book stays closed; focus moves to Open | Drawer closes; book stays open; focus stays on the launcher |
| Chat link to another book | Swap; the new book arrives closed, and the drawer closes when its pickup starts | The same |
| "Turn the book over" by key | Not present | The view opens; the drawer stays, inert, behind it. The first Escape closes the drawer and the second leaves the view |

**With an empty hand,** the drawer open: a click on a book closes the drawer and picks
it up, as #532's S7 says, and a click on empty space closes the drawer. A chat link
picks the book up, and it arrives closed.

**In motion:**

- A click on the book while it lifts or opens does nothing.
- The X, Escape, empty space and the back button reverse it from where it is.
- A book caught on its way back plays forward to the next rest: to open if it was
  caught inside the opening stage, otherwise to closed.

**While examining,** the modal holds everything, as ADR-0109 says. The X is hidden, so
no inert control shows behind a transparent dialog. It comes back when the view closes.

## S4. The state and the motion

`pickup-state.ts`:

- `Phase` keeps its three values. `held` means at rest in the hand, closed or open.
- `Active` gains `opened`, false on `pick`. `holding()` reports it.
- `Active` gains `opening`, true from `open()` until the `opened` event. **"Closed at
  rest" means `held`, not `opened` and not `opening`,** and it is the one condition for
  the Open button, the hint, the cursor and a click that opens.
- **`sendBack` clears `opened` and `opening`,** so a book caught on its way back and landing
  closed can open again, whether the reverse began open or during the opening.
- **`select` does not change.** It stays "pick this book up", and its early return for
  the book in hand stays. `pickUp` and `pickUpById` keep calling it, so neither can
  open a book.
- `open()` is new. It acts only when the book is closed at rest and not examining, and
  it plays on. The `opened` event sets `opened`, clears `opening` and sets `held`, because
  a book caught inside the opening stage never crosses the stop and so never fires
  `landed`. Under reduced motion it calls the new `Track.finishOpen`, then runs the `opened`
  effects itself, as `pick` does for `landed`.
- `clicked(book, takenByDrawer)` is new, and the canvas calls it in place of `select`.
  With a book in hand and `takenByDrawer` true, it returns. If `book` is the one in
  hand, it calls `open()`. Otherwise it calls `select(book)`.
- `examine()` also requires `opened`.
- `Track` runs from the shelf (0) to open (1), and stops at closed going forward. It
  passes that stop going backward. `landed` fires at the stop going forward only, because
  it sets `held`, and a returning book must not read as closed at rest. A new `opened` event
  fires at the end. `finish` goes to closed, and `finishOpen` goes to open.

`pickup-motion.ts` and `shelf-settings.ts`:

- `schedule` gains `closed`, the later of the slide's and the turn's ends. `open` starts
  there, because nothing can overlap a rest.
- `overlapTurnOpen` goes from `PickupMotion`, the tuner and the export. No URL reads it:
  the tuner holds the motion in memory and exports a constant.
- The tuner's scrub still reads the one timeline and drives no state. `retime` keeps a
  book's stage, not its fraction of the track: a book at the stop stays at the stop, and a
  book still opening resumes. So a timing change cannot move a closed book off closed.

`pickup.ts`:

- `landed` keeps `redrawShadows`. `setScrollable(true)` moves to the `opened` effect, which
  also redraws, because a book caught inside the opening stage never fires `landed`.
- The Thoughts fetch still starts on the click, and the held copy still swaps in at lift.
- `catchFocus` also covers the new controls, which sit outside `.held-layer`.
- `drop` and `attach` also hide both controls, restore the hint and remove the cursor's
  `pointermove` listener, because `attach` replaces the canvas it was on.
- `measureSpread` returns nothing until `opened`, since its contract is the spread at
  rest. `loopPickups`, in this file, opens each book, so `Pickup` gains `open()`.

**The stop is the one thing to prove first.** `addPause` in `gsap-core` may also stop a
timeline playing backward; nobody has run it. `trackOf` and the timeline's stop move into a
new `pickup-track.ts`, with no `three` and no DOM, and the local `Timeline` slice gains what
the stop needs. The build's first test, `pickup-track.test.ts`, runs the real library: it
plays forward to the stop, plays on to open, then reverses through the stop to the shelf, and
counts zero `landed` calls on the reverse. It also takes one large time step across the stop in
each direction, because the track is stepped from the shelf's frame, and a stalled tab jumps.
The builder picks the mechanism that passes.

## S5. The controls

Markup and styles in `.astro`, logic in `.ts`, per `AGENTS.md`. The header element
reaches the code through `boot`, as the other page pieces do.

- **`index.astro`** gains `<div class="held-controls" hidden>` as the last child of
  `<header>`, so it flows under the hint with no arithmetic. The header has
  `pointer-events: none`, so the controls set it back to `auto`. They are `position:
  relative; z-index: 5`: the header has no `z-index` of its own, and `.held-layer` is 5, so
  later DOM order puts the controls above the pages and under the panel, which is 20.
  `index.astro` owns a visually hidden class for them, because the one in `Shelf.astro` is
  scoped to that component.
- **The X** is `<button class="held-put-back">` holding an inline `<svg>` with
  `aria-hidden="true"` and `focusable="false"`, and a visually hidden "Put the book
  back", as `#book-viewer-close` holds its name. The SVG is hard-coded in the template,
  so nothing builds markup and no `style` attribute reaches the CSP. It shows whenever a
  book is announced, on a lift or a catch, until the hand empties, and hides while examining. Its target is at
  least 2.75rem.
- **The Open button** is `<button class="held-open">`, with its text set through
  `textContent`. It shows only while the book is closed at rest, visually hidden until it
  has focus. See O1.
- **After a press on Open,** the button hides, so focus is held on the canvas, as `leave`
  does. The `opened` effect calls `pose()` first, because a hidden page cannot take focus.
  If focus is still on the canvas or `<body>`, it moves to the right-hand page, which gains
  `tabindex="-1"`, with `focus({ preventScroll: true })`, so a screen reader reads the
  Thoughts next and the pages stay on their sheets. A pointer open moves no focus.
- **Focus does not move on a shelf pickup** (ADR-0102). **After a chat link's pickup,** with
  focus on the launcher, it moves to Open at landing. A chat link to the book in hand moves it
  to Open at once if the book is closed at rest, and otherwise leaves it on the launcher (O2).
- **`held-page.ts`** drops the put-back block. `.held-put-back` leaves the page styles.
- **The hint** is the header's `<p>`. While the book is closed at rest, `.ts` sets it to
  "Click the book to open it" through `textContent`. Otherwise it holds its text from
  the template, read once, so that string has one home.
- **The cursor** is a pointer over the held book while it is closed at rest, from a
  raycast against that book's group on `pointermove`, attached only for that time. When
  that time ends, the cursor goes back to the canvas's own.
- **The viewer's close button** in `Shelf.astro` swaps its `::before` glyph for an inline
  SVG arrow. Its name, "Back to the page", and its place stay.

## S6. The drawer's code

Both of S3's drawer results are built on #532's branch at e0bc3c9 (O3). This build keeps them.

**The click.** In `drawer.ts`, the document's capturing `pointerup` handler calls
`event.preventDefault()` when it closes the drawer for an outside click, as it already marks
Escape. `Picker.#handleUp` in `scene.ts` passes `event.defaultPrevented` as `onSelect`'s second
argument. `boot.ts` then skips `select` when it is true and a book is in hand. **This build
replaces that check:** `onSelect` calls `clicked(book, prevented)`, which holds the rule. Button
clicks are a separate event, so the X and the Open button still act.

**The link.** `pickUpById` sends `announceHeld` for the book in hand, and the drawer closes.

## S7. Tests

**The Phase 2 gate in `AGENTS.md` becomes:**

> clicking a book (integration test via puppeteer) picks it up: the shelf reports the
> held state for the clicked book, closed, with the page layer carrying that book's
> title and its pages hidden; a click on the held book opens it, and the pages show;
> `location.href` is unchanged across both.

**`window.__shelf.held()`** gains `opened`. It already reports `boardAngle`.
**`window.__shelf.open()`** is new, beside `pickUp`, so a gate can open a book without
aiming at it. One check uses the real click, so the gesture stays covered.

**G35 (`enhanced-card`), `scripts/smoke-render.ts`.** `HELD` stays, and now means closed.
A new `HELD_OPEN` adds `opened`. One row per wait on `HELD`:

| Where | Change |
| --- | --- |
| `checkPickup`, the first wait | Reads closed first (`boardAngle`, pages hidden, X on screen), then opens by a real click, then runs today's reads. The `.held-page-right .held-put-back` reads become `.held-controls .held-put-back`, and the swap's read becomes "the X is still there" |
| `checkPickup`, the focus read | From closed it focuses the X, because a link on a hidden page cannot take focus. From open it runs as today |
| `checkPickup`, the back button | Runs from closed and from open |
| `checkThoughtsShown` | Opens first, and also reads that the page is visible, so it fails on a closed book. Today it reads only the slot and a count |
| `checkViewer`, both waits | Opens before it clicks `.held-examine` |
| `examinesWithoutHeldCopy` | Opens first |
| `checkPhone` | Reads closed for C8, then opens. Its `.held-page-right .held-put-back` read moves too |
| `checkSpread` | Reads the closed angle for C1, then opens for the spread, on every book it loops over |
| `checkHeldAtRest` | Reads the ticker when closed and when open. Opens first for the long-Thoughts scroll reach |
| `measureSampling` (G61) | See below |
| `readPane` | Unchanged: it reads the tuner, and a closed book is at rest |

No `.held-page-right .held-put-back` remains in `smoke-render.ts`. The G35 row in
`docs/gates.md` changes its wording, not its number or slug.

**G61 (`one-shadow-reader`)** reads the held page closed and open. ⚠️ A closed book is a
different configuration from the one measured to survive on the Pixel (ADR-0088), and
G60 and G61 skip pull requests. **So a green pull request does not cover this: the
build watches `main`'s push run after merge.**

**`scripts/lib/pickup-gate.ts`** and its test change "the page's control", and "the second
book's page carries a put-back control of its own" becomes "the X survives a swap".
**`scripts/phone-check.ts`:** `examineOnPhone` opens after its existing wait, so the book rests
closed first. `loopPickups` in `pickup.ts` holds each book closed for `LOOP_HOLD_MS`, opens it,
and holds it again, so a pass has tested a closed book and its memory figure still measures an
open one. Its report states closed and open reached for each round. `ExamineReading.opened`
means the view opened, so it becomes `viewOpened`, beside the new `held().opened`. The commands,
and when the owner runs them, are in S14.

**Claims with no G35 read** get a new check in `smoke-render.ts`, inside the G35 row:
`checkClosedControls` for C4, C5, C7, C8, C9, C11 and C12, and `checkDrawerCells` for C6 and the
chat-link half of C11, with the motion and drawer-shut cells and the X hidden while examining.
`examinesCoverless` also reads C1's closed angle. `checkClosedControls` writes
`artifacts/held-closed.png` at 1280×800 and `artifacts/held-closed-phone.png` at 375×812. Touch
uses puppeteer's touch emulation. A build with no Turnstile key shows no chat link, and the suite is
offline, so `checkDrawerCells` reaches each link cell by dispatching `stacks:pick-up` on the
window, as the link does, with focus put on the launcher first, because a dispatched event leaves
focus where it is. **A real link can run only on the live site,** which is S14.
`checkContextLossFallback` gains C15.

**Unit tests,** written first, in `pickup-state.test.ts`, `pickup-motion.test.ts` and
`held-page.test.ts`, and the first test of S4. Each backs a claim in S8. `pickup-state.test.ts`
holds three catches: a reverse from open, past the stop, then catch, land, click, and read
`opened`; a reverse begun during the opening, then the same steps; and a catch inside the opening
stage, which lands `held` and `opened`. "Cuts straight to open under reduced
motion" becomes "cuts to closed, then cuts to open".

## S8. Acceptance claims

| Claim | Holds when | Quality |
| --- | --- | --- |
| C1 | After a pickup at rest, the front board lies at 0° ±0.5° to the page block, read from the scene, on every book `checkSpread` loops over, and on a coverless book | Functional |
| C2 | Pages stay hidden from sight and the accessibility tree until the visitor opens the book. Nothing opens it alone, and `location.href` is unchanged throughout | Functional |
| C3 | Opening reaches §3.6's spread: 180° ±0.5°, both pages square, no gutter gap over 1 px | Functional |
| C4 | Mouse, touch and keyboard can each open the book and put it back, from closed and from open, at 1280×800 and 375×812 | Interaction |
| C5 | A screen reader's tree holds a button named "Open «Title»" while closed at rest, and not during the opening. Focused, it is fully on screen with the longest fixture title at 375×812, and the X does not move. Focus lands on the right-hand page after it is pressed, also under reduced motion | Interaction |
| C6 | Every cell of S3's tables that a pointer, a key or a link can reach gives its stated result in a browser, the motion cases included. **Two cells have no browser read, by the owner's decision on 2026-11-07**: a click on another book while one is held (the held book stands in front of the whole shelf at 1280×800, so nothing aims at another) and a click while the book lifts (a race). `pickup-state.test.ts` holds both | Functional |
| C7 | Under reduced motion, pickup cuts to closed, opening cuts to open, and put-back cuts | Interaction |
| C8 | The X is a `<button>` with a non-empty name and a target of at least 2.75rem, on screen while closed and while open. At 1280×800 and 375×812 it overlaps neither `.brand`, the hint nor the closed book, and it is the top element at its centre, also over an open page | Interaction |
| C9 | The X and the arrow are inline SVGs with `aria-hidden` and `focusable="false"`. The page's CSP is unchanged, with zero violations on a built page | Compatibility |
| C10 | Each way of putting a book back leaves history as it was before the pickup (§3.9), from closed and from open | Functional |
| C11 | After a shelf pickup, focus has not moved. After a chat link's pickup, with focus on the launcher, focus is on Open at landing. A chat link to the book in hand gives S3's result. Focus is caught on the canvas when the control holding it hides | Interaction |
| C12 | While closed the hint reads "Click the book to open it" and the cursor is a pointer over the book. Otherwise the hint is the template's and the cursor is the canvas's own | Interaction |
| C13 | G61 is green on `main` with the book closed and open, and S14's phone commands survive, with each book held closed and then open, as their report states | Reliability |
| C14 | `athanor run`, `athanor run lint`, `athanor run build`, `athanor run smoke`, `pnpm lint:md`, `pnpm format:check` and `pnpm gate:public` are green, and both closed-book screenshots are in `artifacts/` | Maintainability |
| C15 | A lost context, from closed and from open, puts the book back at once, hides both controls, restores the hint, removes the cursor's listener, and catches focus on the canvas | Reliability |

## S9. Records, in the build's commit

- A new ADR, at the next free number when it lands, superseding ADR-0102's "turns, and
  opens" and its put-back line.
- `AGENTS.md`: the Phase 2 gate, and the "A click picks the book up" line.
- `CONTEXT.md`: **Pick up**, **Held** and **Put back**.
- `docs/gates.md`: the G35 row, and G61 if its wording changes. `docs/progress.md` in the same
  commit.
- The header of `pickup.ts`, and the header and `Track`'s contract in `pickup-state.ts`. The
  comments in `held-page.ts` and `publish.ts` that describe the book opening on pickup.
- ADR-0102's focus line and the "Out of scope" note in `docs/spec/README.md`, for O2.
- `docs/commands.md`: the `--pickups` and `--examine` text, which describes a book arriving open.
- `docs/spec/README.md`: this row's state. `picking-a-book-up.md` is kept as written, with
  one line pointing here.
- [ADR-0103](../adr/0103-gsap-plays-the-pickup-motion.md) stands: GSAP still plays it, from
  the same frame.

## S10. Boundaries for the build session

- **Always:** run the suite through `athanor run`. Run `pnpm smoke:render` on the host and
  save the screenshot. Keep every text node on
  `textContent`, and put no logic in `.astro` files. Write the tests first.
- **Ask first:** a new dependency, any change to S2, any change to the CSP, and a change to
  #532's code beyond S6 and O2.
- **Never:** move focus on pickup except as C11 says, show page text before the cover has
  passed `textFadeFrom`, or build markup from a string.

## S11. Trade-offs

The repo names no business driver, so the owner's stated reason decides the first row.

| Pull | Side taken | Driver |
| --- | --- | --- |
| Fun against one click to the Thoughts | Fun | The owner's ask |
| A clean closed book against a visible Open button | Clean, for a pointer. Sighted visitors get the hint and the cursor | The owner's choice in S2 |
| Compatibility of `phase === 'held'` against a gate failing loudly | `held` keeps its name and the rules that read it. A gate that waits for it and reads the pages now reads a closed book, so S7 lists each one | Fewer rules to change |
| One press, one result, against reachability | The X by pointer does both beside an open drawer, and the canvas does one | The X is a deliberate press, and a click on the canvas is not |

## S12. Residuals

- A sighted visitor who misses the hint and never clicks the book sees no Thoughts.
- A book with no cover art arrives as a plain coloured board. A sighted visitor sees no title
  until they open it, a cost of the hidden button.
- A near miss on a closed book puts it back, or swaps it for the book behind, because a closed
  book covers less of the shelf than an open spread. How much space it leaves at 375×812 is not
  measured, and the owner sees it in `held-closed-phone.png`.
- The X by key, with the drawer open, leaves the drawer open, as the Open button by key does.
  Closing it would need a new seam for one case.
- "Turn the book over" by key, with the drawer open, takes two Escapes to leave the view, and
  the panel shows, inert, behind the transparent dialog.
- A double press on the viewer's arrow leaves one level only. That depends on the X staying at
  the top left.
- On a phone, or under the panel on desktop, a keyboard reader can land on a control the panel
  covers. The launcher already can on #532's branch.
- With the drawer open on a held book, the back button leaves the drawer open. #532's S7 does
  not say otherwise.

- **Accepted by the owner:** a held cover that loads late now swaps in plain view, on a closed
  book facing the visitor. A book with no held copy shows the 512 px shelf copy at full size.

## S13. The questions raised at review

**Answered on 2026-11-04: the owner took every pick from O1 to O6** ("Take all six"), and every
pick from the final review round, listed after them ("Take all my picks"). The questions stay as
the record.

**O1. Where the Open button shows when it has focus.** No row decided this. My pick: to the
right of the X, under the header, and wrapping under it on a long title at 375 px. The X comes
first in the DOM, so it never moves. The Tab order is then the X, Open, the attribution links,
the launcher. The other choice is under the book, which would take a position per viewport.

**O2. Focus after a chat link.** [`README.md`](README.md), under "Out of scope", records that
"focus does not move" leans on
there being no keyboard path to the shelf, and that a keyboard path is the time to reopen it.
**#532's book link is that path.** Today focus returns to the launcher, so a keyboard reader
must Shift+Tab past the attribution links to reach Open. My pick: when the pickup came from a
chat link and focus is on the launcher, move focus to Open at landing. A click on the shelf
still moves nothing. The chat link reaches the shelf through `onPickUpRequest` in `boot.ts`, so
the change stays on the shelf's side.

**O3. Which build changes the drawer's code (S6).** My pick: #532's build, now, because the
behaviour is on its branch whatever happens to #531. If not, this build does, and until then a
click beside the drawer can put a book down.

**O4. The build's base and the merge order.** My pick: wait for #532 to merge, then cut from
`main`, so #531 merges second. A pull request stacked on #532's branch can close when its base
merges, and C13 needs `main` anyway.

**O5. When the phone check and the screenshot happen.** My pick: the owner reads the screenshot on
the pull request, before merging. The phone check runs after merge, on `main`, once G61's push run
is green and before the deploy, because a visitor sees nothing until `pnpm deploy:site`.

**O6. What happens if G61 goes red on `main`, or the closed book loses its context on the phone.**
My pick: no deploy, and the owner decides between a fix and reverting the merge. A closed book
that fails on the Pixel is answered on a phone, not by arithmetic (ADR-0088).

**From the final review round.** A red G60 on `main` is handled as O6 says, and `pnpm deploy:site`
refuses on it anyway. If the live chat-link walk fails after a deploy, the owner decides between a
fix and redeploying the previous commit. The owner also took the `preventScroll` guard in S5,
accepted the late cover in S12, and accepted that the X by key leaves the drawer open, as S2 says.

## S14. Needs a human

| Action | When |
| --- | --- |
| Sign this spec off | Done, 2026-11-04 |
| Confirm a new dependency, a change to S2 or the CSP, or a change to #532's code beyond S6 and O2 | When the build meets one |
| Read `artifacts/shelf.png`, `held-closed.png` and `held-closed-phone.png`, locally or attached to the pull request, never committed (G13) | Before merging, as O5 says |
| Merge the pull request | After the Test lenses |
| Run `pnpm exec tsx scripts/phone-check.ts --pickups 5` and `--examine 60` on the Pixel (C13) | As O5 says |
| Answer a red G60 or G61, or a failed phone check | As O6 says |
| Run `pnpm deploy:site`, then on the live site ask a question, click a chat link, and walk S3's chat-link cells | After the phone check |
| Answer a failed live walk | As S13 says |
