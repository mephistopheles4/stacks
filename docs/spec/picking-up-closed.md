# A picked-up book arrives closed, and the visitor opens it

The spec for [#531](https://github.com/mephistopheles4/stacks/issues/531). Tier:
standard, one build session. It matches nothing on the sensitive list: no auth,
crypto or data migration, no CSP change, and no new data leaves the site. Written
on 2026-11-04 from a grilling through an eagle-eye box, whose accepted set is S2.
**Nothing here is built, and the owner has not signed it off.**

**Do not start the build until #532's shelf changes exist,** on
`claude/532-ask-the-library-8e3b9c` or on `main` once it merges, unless the owner
decides otherwise. This spec reads
[#532's spec](https://github.com/mephistopheles4/stacks/blob/docs/532-ask-the-library/docs/spec/ask-the-library.md),
S7 and S8, and that branch's code. It amends
[`picking-a-book-up.md`](picking-a-book-up.md) §1, §2, §3.4, §3.5, §3.6 and §3.11,
and does not reopen anything else there.

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
| Pressing the X with the drawer open | The drawer closes and the book goes back |

The owner first picked "No button", then took "visually hidden until focus". The
canvas has `tabindex="-1"`, so Tab cannot reach it, and a screen reader cannot
activate a key handler on the document. The hidden button looks the same to a mouse
or touch visitor and keeps a way to the Thoughts for everyone else.

## S3. What each input does

Each cell has one result. "Back" means the reversed motion and one history entry
removed (§3.9). The X and the Open button sit outside the pages (S5).

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
| The X, desktop | Drawer closes; back | Drawer closes; back |
| The X, phone | Under the panel: close the drawer first | The same |
| The Open button, by key | Opens; drawer stays | Not present |
| The Open button, by pointer | Opens; drawer closes | Not present |
| Escape | Drawer closes; book stays | Drawer closes; book stays |
| The back button | Back; drawer stays | Back; drawer stays |
| Chat link to this book | Drawer closes; book stays closed | Drawer closes; book stays open |
| Chat link to another book | Back, then the new book arrives closed; the drawer closes when its pickup starts | The same |

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
- **`select` does not change.** It stays "pick this book up", and its early return for
  the book in hand stays. `pickUp` and `pickUpById` keep calling it, so neither can
  open a book.
- `open()` is new. It acts only when the book is `held`, not `opened` and not examining,
  plays on, and sets `opened` at the end. Under reduced motion it cuts.
- `clicked(book, takenByDrawer)` is new, and the canvas calls it in place of `select`.
  With a book in hand and `takenByDrawer` true, it returns. If `book` is the one in
  hand, it calls `open()`. Otherwise it calls `select(book)`.
- `examine()` also requires `opened`.
- `Track` runs from the shelf (0) to open (1), and stops at closed going forward. It
  passes that stop going backward. `landed` fires at the stop, and a new `opened` event
  fires at the end. `finish` under reduced motion goes to closed.

`pickup-motion.ts` and `shelf-settings.ts`:

- `schedule` gains `closed`, the later of the slide's and the turn's ends. `open` starts
  there, because nothing can overlap a rest.
- `overlapTurnOpen` goes from `PickupMotion`, the tuner and the export. No URL reads it:
  the tuner holds the motion in memory and exports a constant.
- The tuner's scrub still reads the one timeline, so what it shows stays true.

`pickup.ts`:

- `landed` keeps `redrawShadows`. `setScrollable(true)` moves to the `opened` effect.
- The Thoughts fetch still starts on the click, and the held copy still swaps in at lift.
- `catchFocus` also covers the new controls, which sit outside `.held-layer`.

**The stop is the one thing to prove first.** `addPause` in `gsap-core` also stops a
timeline playing backward, so the build's first test plays forward to the stop, then
reverses through it from open. The builder picks the mechanism that passes.

## S5. The controls

Markup and styles in `.astro`, logic in `.ts`, per `AGENTS.md`. The header element
reaches the code through `boot`, as the other page pieces do.

- **`index.astro`** gains `<div class="held-controls" hidden>` as the last child of
  `<header>`, so it flows under the hint with no arithmetic. The header has
  `pointer-events: none`, so the controls set it back to `auto`.
- **The X** is `<button class="held-put-back">` holding an inline `<svg>` with
  `aria-hidden="true"` and `focusable="false"`, and a visually hidden "Put the book
  back", as `#book-viewer-close` holds its name. The SVG is hard-coded in the template,
  so nothing builds markup and no `style` attribute reaches the CSP. It shows from the
  start of the lift until the hand empties, and hides while examining. Its target is at
  least 2.75rem.
- **The Open button** is `<button class="held-open">`, before the X in the DOM, with its
  text set through `textContent`. It shows only while the book is `held` and not
  `opened`, visually hidden until it has focus. See O1.
- **After a press on Open,** the button hides, so focus is held on the canvas until the
  page shows, as `leave` does. It then moves to the right-hand page, which gains
  `tabindex="-1"`, so a screen reader reads the Thoughts next. A pointer open moves no
  focus.
- **Focus still does not move on pickup** (ADR-0102), with the one possible exception
  of O2.
- **`held-page.ts`** drops the put-back block. `.held-put-back` leaves the page styles.
- **The hint** is the header's `<p>`. While the book is closed at rest, `.ts` sets it to
  "Click the book to open it" through `textContent`. Otherwise it holds its text from
  the template, read once, so that string has one home.
- **The cursor** is a pointer over the held book while it is closed at rest, from a
  raycast against that book's group on `pointermove`, attached only for that time.
- **The viewer's close button** in `Shelf.astro` swaps its `::before` glyph for an inline
  SVG arrow. Its name, "Back to the page", and its place stay.

## S6. The drawer's code

Two results in S3 differ from #532's branch today, with or without this spec:

| On the branch today | S3 says |
| --- | --- |
| A click outside the panel also reaches the canvas, so with a book held a click on empty space closes the drawer and puts the book back | The canvas ignores it |
| A chat link to the book in hand does nothing, and the drawer stays open, because no pickup signal goes out | The drawer closes |

**The seams:**

- **The click.** In `drawer.ts`, the document's capturing `pointerup` handler calls
  `event.preventDefault()` when it closes the drawer for an outside click. This is how
  it already marks Escape. `Picker.#handleUp` in `scene.ts` passes
  `event.defaultPrevented` through `onSelect`, and `boot.ts` hands it to `clicked`.
  Button clicks are a separate event, so the X and the Open button still act.
- **The link.** `pickUpById` calls `announceHeld` when the book is already in hand and
  not returning, then returns true.

Which build makes these two changes is O3.

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
A new `HELD_OPEN` adds `opened`. Each wait that reads the pages moves to it, after an
open step:

| Check | Change |
| --- | --- |
| `checkPickup` | Reads closed first (`boardAngle`, pages hidden, X on screen), then opens by a real click, then runs today's reads. The four `.held-page-right .held-put-back` reads become `.held-controls .held-put-back` |
| `checkViewer` | Opens before it clicks `.held-examine` |
| `checkHeldAtRest` | Reads the shadows and the spread when open, and the closed angle when closed |
| `checkPhone`, `checkSpread` | Open first |
| The back button and focus reads | Run from closed and from open |

The G35 row in `docs/gates.md` changes its wording, not its number or slug.

**G61 (`one-shadow-reader`)** reads the held page closed and open. ⚠️ A closed book is a
different configuration from the one measured to survive on the Pixel (ADR-0088), and
G60 and G61 skip pull requests. **So a green pull request does not cover this: the
build watches `main`'s push run after merge.**

**`scripts/lib/pickup-gate.ts`** and its test change the wording "the page's control".
**`scripts/phone-check.ts`:** `examineOnPhone` opens first, and `loopPickups` opens each
book before its memory figure, so that figure still measures an open book. The owner
runs this on the phone.

**Unit tests,** written first, in `pickup-state.test.ts`, `pickup-motion.test.ts` and
`held-page.test.ts`. Each backs a claim in S8. "Cuts straight to open under reduced
motion" becomes "cuts to closed, then cuts to open".

## S8. Acceptance claims

| Claim | Holds when | Quality |
| --- | --- | --- |
| C1 | After a pickup at rest, the front board lies at 0° ±0.5° to the page block, read from the scene, on a book with Thoughts and one without | Functional |
| C2 | Pages stay hidden from sight and the accessibility tree until the visitor opens the book. Nothing opens it alone, and `location.href` is unchanged throughout | Functional |
| C3 | Opening reaches §3.6's spread: 180° ±0.5°, both pages square, no gutter gap over 1 px | Functional |
| C4 | Mouse, touch and keyboard can each open the book and put it back, from closed and from open, at 1280×800 and 375×812 | Interaction |
| C5 | A screen reader's tree holds a button named "Open «Title»" while closed, and focus lands on the right-hand page after it is pressed | Interaction |
| C6 | Every cell of S3's tables gives its stated result in a browser, the motion cases included | Functional |
| C7 | Under reduced motion, pickup cuts to closed, opening cuts to open, and put-back cuts | Interaction |
| C8 | The X is a `<button>` with a non-empty name and a target of at least 2.75rem, on screen while closed and while open, and it touches neither the header nor the closed book at 1280×800 and 375×812 | Interaction |
| C9 | The X and the arrow are inline SVGs with `aria-hidden` and `focusable="false"`. The page's CSP is unchanged, with zero violations on a built page | Compatibility |
| C10 | Each way of putting a book back leaves history as it was before the pickup (§3.9), from closed and from open | Functional |
| C11 | Focus does not move on pickup, except as O2 decides, and it is caught on the canvas when the control holding it hides | Interaction |
| C12 | While closed the hint reads "Click the book to open it" and the cursor is a pointer over the book. Otherwise the hint is the template's | Interaction |
| C13 | G61 is green on `main` with the book closed and open, and the owner's phone check survives both | Reliability |
| C14 | `athanor run`, `athanor run lint`, `athanor run build`, `athanor run smoke` and `pnpm gate:public` are green, and a screenshot of the closed book is in `artifacts/` | Maintainability |

## S9. Records, in the build's commit

- A new ADR, at the next free number when it lands, superseding ADR-0102's "turns, and
  opens" and its put-back line.
- `AGENTS.md`: the Phase 2 gate, and the "A click picks the book up" line.
- `CONTEXT.md`: **Pick up**, **Held** and **Put back**.
- `docs/gates.md`: the G35 row, and G61 if its wording changes.
- The header of `pickup.ts`, and `Track`'s contract in `pickup-state.ts`.
- `docs/spec/README.md`: this row's state. `picking-a-book-up.md` is kept as written, with
  one line pointing here.
- [ADR-0103](../adr/0103-gsap-plays-the-pickup-motion.md) stands: GSAP still plays it, from
  the same frame.

## S10. Boundaries for the build session

- **Always:** run the suite through `athanor run`. Run `pnpm smoke:render` on the host and
  save the screenshot. Keep every text node on
  `textContent`, and put no logic in `.astro` files. Write the tests first.
- **Ask first:** a new dependency, any change to S2, any change to the CSP, and a change to
  #532's code beyond S6.
- **Never:** move focus on pickup except as O2 decides, show page text before the cover has
  passed `textFadeFrom`, or build markup from a string.

## S11. Trade-offs

The repo names no business driver, so the owner's stated reason decides the first row.

| Pull | Side taken | Driver |
| --- | --- | --- |
| Fun against one click to the Thoughts | Fun | The owner's ask |
| A clean closed book against a visible Open button | Clean, for a pointer. Sighted visitors get the hint and the cursor | The owner's choice in S2 |
| Compatibility of `phase === 'held'` against a gate failing loudly | `held` keeps its name and the rules that read it. A gate that waits for it and reads the pages now reads a closed book, so S7 lists each one | Fewer rules to change |
| One press, one result, against reachability | The X does both beside an open drawer, and the canvas does one | The X is a deliberate press, and a click on the canvas is not |

## S12. Residuals

- A sighted visitor who misses the hint and never clicks the book sees no Thoughts.
- A near miss on a closed book puts it back. How much empty space a closed book leaves at
  375×812 is not measured. C4 and C8 will show it.
- A double press on the viewer's arrow leaves one level only. That depends on the X staying at
  the top left.
- On a phone, or under the panel on desktop, a keyboard reader can land on a control the panel
  covers. The launcher already can on #532's branch.
- With the drawer open on a held book, the back button leaves the drawer open. #532's S7 does
  not say otherwise.

## S13. Open questions for sign-off

**O1. Where the Open button shows when it has focus.** No row decided this. My pick: beside the
X, under the header, with Open first. The Tab order is then Open, the X, the attribution links,
the launcher. The other choice is under the book, which would take a position per viewport.

**O2. Focus after a chat link.** [`README.md`](README.md), under "Out of scope", records that
"focus does not move" leans on
there being no keyboard path to the shelf, and that a keyboard path is the time to reopen it.
**#532's book link is that path.** Today focus returns to the launcher, so a keyboard reader
must Shift+Tab past the attribution links to reach Open. My pick: when the pickup came from a
chat link and focus is on the launcher, move focus to Open at landing. A click on the shelf
still moves nothing.

**O3. Which build changes the drawer's code (S6).** My pick: #532's build, now, because both
behaviours are on its branch whatever happens to #531. If not, this build does, and until then
a click beside the drawer can put a book down.
