# Spec — the enhanced book detail card

**Status:** locked. Assembled from closed decisions; nothing here is open.
**Sources:** [#89](https://github.com/mephistopheles4/stacks/issues/89) (fact set
and hierarchy), [#91](https://github.com/mephistopheles4/stacks/issues/91)
(mobile presentation and dismissal),
[#92](https://github.com/mephistopheles4/stacks/issues/92) (visual design,
measured), [#98](https://github.com/mephistopheles4/stacks/issues/98) (link
destinations), [#101](https://github.com/mephistopheles4/stacks/issues/101)
(focus, announcement, reduced motion),
[#102](https://github.com/mephistopheles4/stacks/issues/102) (the merge's three
new fields on the card), [#105](https://github.com/mephistopheles4/stacks/issues/105)
(search fallback target).

**Where a resolution and a later amendment disagree, this file carries the later
one.** Every such supersession is footnoted at [§13](#13-supersessions-the-order-the-decisions-actually-landed-in),
because reading the closed tickets in issue order gives the wrong answer three
times.

---

## 1. What this changes

Today's card is `showCard` at [`packages/site/src/shelf/boot.ts:301`](../../packages/site/src/shelf/boot.ts)
plus the styles in [`packages/site/src/components/Shelf.astro`](../../packages/site/src/components/Shelf.astro).
It renders cover, title, author, one `·`-joined meta line and tags into an
`<aside id="book-card">` via `replaceChildren`.

The enhanced card:

- splits the one meta line into a **reading** group and an **object** group;
- adds an object line, a subjects line and a provider links row;
- stops suppressing `status` when it is `read` (`boot.ts:330`);
- becomes a **bottom sheet** below a breakpoint, with a real drag-to-dismiss;
- gains a close control, a live-region announcer and a focus rule.

The palette does not change: `#f2e8dc` on `rgba(26,22,19,.86)` with a 14px blur.

---

## 2. Content, in order

Eight blocks, top to bottom. The order is [#89](https://github.com/mephistopheles4/stacks/issues/89)
decision 4 — *what you brought to the book, then what the book is, then the exit*
— with [#102](https://github.com/mephistopheles4/stacks/issues/102)'s subjects
line inserted before the links row.

| # | Block | Content | Presence |
|---|---|---|---|
| 1 | Cover | `<img>`, alt `Cover of «title»` | when `cover` is present |
| 2 | Title | `<h2>`, `book.title` | always |
| 3 | Author | `book.author` | when present |
| 4 | Reading line | status word, then `finished «date»` **or** `started «date»`, then `★`×`rating`, `·`-joined | **always** |
| 5 | Tags | `book.tags`, `·`-joined | when non-empty |
| 6 | Object line | `publisher · published · pages · binding · isbn` | drops **whole** when all five are absent |
| 7 | Subjects | `book.subjects`, **`; `-joined and capped at 5 by the merge** — split on `;` and trim, then render | when present |
| 8 | Links row | see [§8](#8-the-provider-links-row) | **always** |

Blocks 1–2 are a **header row**; 3–8 are full-width below it. See [§4](#4-layout).

Blocks 6–8 are one region — [#89](https://github.com/mephistopheles4/stacks/issues/89)'s
"about the book" block, which **never vanishes**. The *object line* drops when
empty; the region does not, because the links row always renders.

### Why the reading line always renders

19 of the 41 real books are `read` with no dates and no rating. Under today's
`describe()` those render nothing at all. Once the line is *about* reading, an
empty group on 46% of the library is the defect — so the status word leads every
card, `read` included. Consequence: `wishlist` and `abandoned` surface as words
on local builds (wishlist books never reach a public build).

### Formatting rules

- **Status** is the raw `book.status` string (`read` / `reading` / `abandoned` /
  `wishlist`).
- **Dates** are `finished` if present, else `started` if present, else nothing.
  Both are opaque strings, rendered as stored (`types.ts:68` — unvalidated by
  design).
- **Rating** is `'★'.repeat(rating)`, no denominator. Unchanged from today, and
  ⚠️ **never rendered by anything**: `rating` is on 0 of 41 real books and no
  prototype case set one, so this is the one segment with no picture behind it.
- **`published` is rendered as its first four-digit run** — `2019-03-05T07:00:00Z`
  → `2019`. **A string with no four-digit run renders verbatim**, so a
  hand-editor who wrote `forthcoming` sees `forthcoming`. The note keeps the
  provider's string exactly as given; tidiness is a display need
  ([#102](https://github.com/mephistopheles4/stacks/issues/102) §4).
- **`subjects` is `; `-separated, never comma-separated**, because provider
  category values contain commas natively — Apple's `"Health, Mind & Body"` is in
  this repo's own G26 corpus. **The site splits on `;` and trims**, which makes
  the separator a fact two packages hold; see
  [`metadata-merge.md`](metadata-merge.md) §4.
- **`binding`** is shown only when declared. It is never inferred from the
  shelf's per-book hash — the card must not present a guess as a fact.
- **The ISBN renders as a visible string** at footnote rank, independent of any
  link it produces ([#89](https://github.com/mephistopheles4/stacks/issues/89)
  decision 2, taken against the recommendation).

### Field presence in the real vault, for anyone sizing this

| key | seed (12) | fixture-50 | real vault (41) |
|---|---|---|---|
| `cover` | 6 | 44 | 41 |
| `author` | 12 | 50 | 41 |
| `isbn` | 6 | 0 | 35 |
| `pages` | 6 | 50 | 35 |
| `publisher` | — | — | 17 (hand-added) |
| `rating` | 5 | 22 | **0** |
| `binding` | 0 | 0 | **0** |
| `published`, `subjects`, all four id keys | 0 | 0 | **0** |

The last row is why `stacks enrich` ([`metadata-merge.md`](metadata-merge.md) §6)
must run before the card is judged against real data: five of its eight rows are
empty on every note that exists today.

---

## 3. How missing fields collapse

Every rule below was exercised by a prototype shot, not asserted.

| Absent | Result |
|---|---|
| `cover` | header row is the title column alone — one row shorter, **no placeholder** |
| `author` | dropped; title alone in the header |
| reading facts | line still renders, carrying the status word alone |
| `tags` | dropped |
| all of `publisher`/`published`/`pages`/`binding`/`isbn` | object line dropped whole (5 of 41) |
| `subjects` | dropped |
| every identifier | links row renders one text search link — see [§8](#8-the-provider-links-row) |

Two card shapes (cover / no cover) is deliberate: it extends the card's existing
"drop the empty node rather than leave a gap" property to the anchor rather than
inventing a placeholder that reads as a loading state. At a 2.75rem cover the two
shapes read as one card.

---

## 4. Layout

**Variant C, the editorial card.** Chosen by measurement: filled, it is **270px
against a 325px portrait cap**, where cover-as-anchor wanted **509px** and
overflowed by 146px even in today's sparse state.

**Header row** — `display: flex`, `gap: 0.7rem`, `align-items: flex-start`: the
cover, then a column holding title and author. Everything else full-width below.

| element | size | colour | margin-top |
|---|---|---|---|
| cover | `2.75rem` wide, auto height, `border-radius: 0.2rem` | — | — |
| title `<h2>` | `1rem` / 1.3, weight 600, `-0.01em`, `overflow-wrap: anywhere` | `#f2e8dc` | 0 |
| author | `0.9rem` | `#c9b8a4` | `0.2rem` |
| reading line | `0.8rem` | `#a89684` | `0.5rem` |
| tags | `0.72rem` | `#857361` | `0.35rem` |
| object line | `0.72rem` | `#857361` | `0.6rem` |
| subjects | `0.72rem` | `#6f6051` | `0.25rem` |
| links row | `0.75rem`, `flex-wrap`, `gap: 0.5rem 0.85rem`, `min-height: 2.75rem` per link | `#c9b8a4` | `0.7rem` |

**One cover size, `2.75rem`, at every viewport.** Desktop has 145px of headroom
and a larger cover there was never put to the owner; [#91](https://github.com/mephistopheles4/stacks/issues/91)'s
"one card, responsive presentation" is why it was not invented.

Measured heights, for regression reference:

| viewport | cap | filled | today (pre-`enrich`) |
|---|---|---|---|
| portrait 375×812 | 325px | **270** | 233 |
| landscape 667×375 | 150px | **253 (+103)** | — |
| desktop (own 448 max) | — | **303** | — |

**Landscape overflows by 103px and that is accepted.** [#91](https://github.com/mephistopheles4/stacks/issues/91)
already decided the sheet scrolls past the cap and that past it is "found by
scrolling". Confirmed from `artifacts/card-prototype/landscape-C-filled.png`:
cover, title on one line, author, the status word and the tags line are above the
fold at 150px; object line, subjects and links fall below.

---

## 5. Presentation: sheet below the breakpoint, corner card above

**The breakpoint is `(max-width: 700px), (max-height: 500px)`.** Width alone is a
bad proxy — a landscape phone at 812×375 gets a 320×343 corner card, 91% of the
viewport height, which is the exact defect this work opened against. 700 reuses
the threshold already in `debug-panel.ts:81`; 500 clears every landscape phone
and leaves real desktop windows alone. A short desktop window (1200×450) getting
the sheet is **intended**.

**Sheet** (below the breakpoint):

- full-bleed to the bottom and side edges, **no scrim**;
- `border-top` only, `border-radius: 0.9rem 0.9rem 0 0`;
- `padding: 1.4rem 1.1rem 1rem`;
- height driven by content, `max-height: 40vh`, `overflow-y: auto`;
- **one height** — no peek/expanded pair, and no second state to overflow into;
- grabber: a `2.25rem × 0.25rem` pill at `rgba(242,232,220,.32)`, centred in a
  full-width `1.6rem` button with `touch-action: none`.

**Desktop card** (above the breakpoint): today's corner card unchanged, plus an
`×` in a `2rem` hit area at top right. The grabber pill deliberately does **not**
cross over — a grabber means "drag me toward the edge I am anchored to", and a
floating corner card has no such edge.

**Modality: non-modal, on both.** The shelf stays interactive behind the sheet.
Tapping empty shelf dismisses; **tapping another book swaps the sheet's contents**
rather than closing it. The scene does not move on select — a book on the bottom
row is occluded by its own card, accepted.

⚠️ **The presentation switch is CSS-only; the drag is not.** Dragging the desktop
`×` must do nothing, so the drag code needs to know which side of the breakpoint
it is on — which makes the breakpoint **a fact two languages hold**. The rule,
stated once so it cannot be read two ways: *the drag is inert above the
breakpoint, and the breakpoint is expressed once and read by both.* The mechanism
is the implementer's call; the two candidates on the record are a named query
constant in a `.ts` module that the CSS points at by comment (plus a cheap test
asserting the two spellings match), or a CSS custom property the stylesheet
consumes only inside the media query. **Do not add a third holder** — this is why
[#102](https://github.com/mephistopheles4/stacks/issues/102) refused to make card
*content* differ by breakpoint and why [#106](https://github.com/mephistopheles4/stacks/issues/106)
rejected re-homing the attribution surface below it.

---

## 6. Dismissal, drag and motion

Four dismissals: the close control, Escape, tap-outside, and — not a dismissal —
tapping another book, which swaps.

**One control, two skins, one `hideCard` call**: the grabber pill below the
breakpoint, the `×` above it. It is a real `<button>` with an accessible name,
not a decorative `<div>` — a grabber only a gesture can reach is invisible to a
keyboard and a screen reader.

**The drag starts on the pill only.** The sheet body scrolls, always, with no
arbitration. The conventional "dismiss only when scrolled to top" rule
reintroduces ambiguity *intermittently* — with a content-capped sheet most books
do not scroll at all, so the same gesture would mean different things on
different books. Cost, accepted: swiping the sheet body does nothing.

**Dismiss threshold: 30% of the sheet's height, capped at 80px** — 48px on a
`bare` sheet, 45px in landscape, 80px on a full portrait one. Below it, snap
back. A flat 64px was rejected: on a 150px landscape sheet that is 43% of the
whole thing.

**Motion: 220ms in, 180ms out**, both on the same `transform`, so the pair is one
transition and not two mechanisms. Exit faster than entry — arriving wants to be
seen, leaving wants to be out of the way. The sheet slides up on open, **slides
down on dismiss**, follows the finger while dragged, and snaps back below the
threshold. The desktop card has no animation at all.

⚠️ **The slide-down on dismiss is decided and was never implemented, anywhere.**
The prototype hid the sheet outright, so the defaulted number is also the one
nothing has drawn.

**`prefers-reduced-motion`** — one rule covering all three motions:

| motion | reduced |
|---|---|
| slide on open | **off** — appears instantly |
| slide on dismiss | **off** — disappears instantly |
| snap-back | **off** — instant |
| follow-the-finger | **kept** |

The rule and the mechanism are the same thing, which is what makes it cheap: a
scoped `@media (prefers-reduced-motion: reduce) { /* the sheet */ transition: none; }`
removes exactly the three unattended motions and **cannot** touch the attended
one, because follow-the-finger is JS writing `transform` directly and was never a
transition. **Scoped to the sheet, not global** — this is the repo's first
reduced-motion rule and a blanket `*{transition:none}` would be a repo-wide motion
policy nobody has decided. `OrbitControls` damping (`scene.ts:328`,
`book-inspector.ts:115`) is left alone; there is no `autoRotate` anywhere.

---

## 7. Accessibility

**Focus never moves. A separate live region announces. The sheet moves only under
the finger.**

The fact that shapes all of it: **the card has no non-pointer opening path at
all.** A book is selected by a raycaster hit on a `<canvas>` with no accessible
children. A keyboard user cannot open the card; a VoiceOver-on-touch user can, by
double-tapping, without knowing which book they will get. So the announcement is
the *only* way they learn what they hit, which is why it is short rather than
complete.

| Concern | Decision |
|---|---|
| Focus on open | **Does not move.** The card is non-modal; a canvas click leaves focus on `<body>`, so there is no origin to restore. The `<aside>` follows the canvas in DOM order, so one Tab from `<body>` reaches the close control. |
| Focus on close | **Move focus to the `<canvas>` only if focus is currently inside the card**; otherwise leave it alone. One conditional rule covering all four dismissals. |
| `<canvas>` | gains **`tabindex="-1"`** — programmatically focusable, never a tab stop, so nobody who never opens a card gains one. |
| Role | Stays `<aside id="book-card">` with a **static** `aria-label` ("Book details"). It is a direct child of `.shelf`, so a name makes it a `complementary` landmark — the only deliberate way to reach the card. |
| `role="dialog"` | **Struck.** Several screen readers announce a dialog only when focus enters it, so a dialog nobody focuses is silent while claiming a modality it does not have. A control that lies. |
| Announcement | A **separate, permanently-present, visually-hidden `role="status"`** element, a **sibling** of the card, never `hidden`, carrying only `«Title» by «Author»`. |
| Swap | **Re-announces**, by the same mechanism — the status text changes. Tapping the *same* book twice announces nothing. |
| Close | **Clears the status silently.** Clearing a live region produces no announcement. |

**Why the announcer cannot be the card itself**, in ascending order of force:
`replaceChildren` would re-read all seven-plus chunks; tap-to-swap is the primary
mobile browse gesture, so that is an announcement users switch off; and a
`hidden` element is out of the accessibility tree, so a live region inside the
card cannot announce the card *opening* at all.

⚠️ **The close control must not be part of the replaced content.** `showCard`
calls `card.replaceChildren(...)` (`boot.ts:305`); a close control inside that
subtree is destroyed and recreated on **every tap-to-swap**, dropping focus to
`<body>` mid-browse on the primary mobile gesture. The fix is structural, not
care: `showCard` replaces an inner container, or the control is a sibling of the
replaced content.

**Cost accepted:** two places hold the book's identity — the card's `<h2>` and
the status string. Both derive from the same `LibraryBook` in the same function,
so the drift is cheap to gate.

**Keyboard reachability of the shelf is out of scope** and is on the map's *Out
of scope* with a revisit condition: the "focus does not move on open" decision
leans on there being no focus origin, and the moment the shelf gains a keyboard
path that reason evaporates.

---

## 8. The provider links row

**Marks are identifier-built links only; a book with no identifier gets one text
search link instead.** The distinction rides in the *form* rather than in a
tooltip, because a tooltip never fires on touch and touch is the primary case.

### Destinations

| | |
|---|---|
| **Which marks** | Every linkable contributor, **max 3** — Open Library, Google, Apple |
| **Order** | [`metadata-merge.md`](metadata-merge.md)'s default provider order with O'Reilly skipped → **Open Library, Google, Apple** |
| **Open Library** | `https://openlibrary.org/isbn/{isbn}` when an ISBN exists, `https://openlibrary.org/books/{OLID}` otherwise |
| **Google** | `https://books.google.com/books?id={volumeId}` |
| **Apple** | **Region-free** `https://books.apple.com/book/id{trackId}` |
| **O'Reilly** | **Recorded and never rendered.** Its `archive_id` 307s to a **403** whether the book exists or not — provenance without a link. |
| **No identifier at all** | One **text** link: `https://openlibrary.org/search?q=<title + author, encodeURIComponent>`, labelled **"Search Open Library"** |
| **Navigation** | `target="_blank"`, `rel="noopener noreferrer"` |

**Open Library's mark prefers the ISBN over the OLID** because all three id URLs
**hard-404 on a stale id** while the ISBN form returns 200 with a graceful page
even for an ISBN it does not know. That puts the soft landing on the path 35 of
41 books take — and it means `enrich` **adds** marks rather than rewriting one.

**Apple is region-free** because the site does not know a visitor's storefront
and `/us/` asserts one on their behalf; both forms were verified to resolve.

**The fallback is card-level, not per-provider**, so a row is never a mix of
marks and text: a book either has identifier links or it has the text link.

**The links row always renders** — every book has a title, so every book has at
least the search link. Real population of the fallback: **6 books**, the ones
with no ISBN. All 41 have an author, so the title-only search the contract
permits has a population of zero.

### Naming — `title`, and no `aria-label`

Row-wide: **`title` is both the tooltip and the accessible name; no `aria-label`
anywhere in the row; mark SVGs are `aria-hidden="true" focusable="false"`.**

| link | visible | `title` |
|---|---|---|
| Open Library | mark | `Open Library` |
| Google | the button's own words | `Google Preview` |
| Apple | icon | `Apple Books` |
| search fallback | the text "Search Open Library" | — (visible text *is* the name) |

- **Dropping `aria-label` is what makes `title` legal again.** The double-announce
  this repo already documents (`index.astro:64-68`) needs *both* attributes
  present; with `aria-label` gone the accessible-name computation falls back to
  `title`.
- ⚠️ **`title`-as-accessible-name is the weakest naming mechanism in the accname
  computation** — the last fallback, and a WCAG technique of last resort. It
  works in the major screen readers. This sentence is in the spec deliberately
  rather than left silent.
- ⚠️ **`title` never fires on touch**, so on the primary device Apple's icon is
  unlabelled for anyone who can see it. Accepted as a cost, not answered. It is
  **one control**: Google's licensed artwork carries its own words, Open
  Library's mark is the third, and the fallback is text.
- **Google's name is `Google Preview`, not "Google Books".** Google's grant is a
  *button whose artwork is an image of those words*; naming it for the
  destination would be a **WCAG 2.5.3 (Label in Name)** mismatch. This is the one
  departure from the bare-destination rule, and it exists because that rule
  predates the mark research.
- **The search fallback link carries neither `title` nor `aria-label`** —
  overriding a text link's visible name risks 2.5.3 from the other direction.

⚠️ **The prototype renders Open Library's mark as a text span placeholder**, so
its verified table shows no `title` on that row. That is the placeholder, not the
decision: when the real mark lands it carries `title="Open Library"` like the
other two.

### Where the URL builders live

Pure functions of `LibraryBook` fields, in a **pure site module** — the site may
only `import type` from `@stacks/core`. No vault string ever reaches an `href`
un-built: the card constructs each URL from an id it has shape-checked at parse
time (see [`provider-provenance.md`](provider-provenance.md) §4).

### The marks themselves

⚠️ **No provider logo asset exists in the repo today; all three would be new
files.** Nothing is forbidden — Apple publishes the closest thing to a grant for
exactly this shape, Google grants the "Google Preview" button, Open Library
publishes no guideline at all — but **vendoring the SVGs is a redistribution
question no source read settles**, and it is accepted as ordinary risk rather
than resolved. Conditions worth honouring cheaply: use Apple's approved SVG
unmodified rather than a redrawn one, keep the marks small, and give each an
accessible name.

Apple's mark shipping is what makes Apple's credit line owed — see
[`attribution-surface.md`](attribution-surface.md).

---

## 9. DOM structure and where things live

```
<div class="shelf">
  <canvas id="shelf-canvas" tabindex="-1"></canvas>
  <aside id="book-card" class="card" aria-label="Book details" hidden>
    <button class="card-dismiss">…</button>   <!-- NOT inside the replaced subtree -->
    <div class="card-body">…</div>            <!-- replaceChildren target -->
  </aside>
  <p class="visually-hidden" role="status"></p>  <!-- sibling; never hidden -->
</div>
```

- **`.astro` files hold markup, styles and a `<script>` that imports and calls a
  `.ts` module — nothing more.** `.astro` is not typechecked, so anything with a
  type lives in a `.ts` file.
- **Styles stay in `Shelf.astro`'s `<style>` block**, extending the existing
  `:global()` idiom. Astro scopes component styles by stamping an attribute on
  elements *in the template*; nothing built with `createElement` carries it, so
  every rule reaching card content must be `:global()` — the comment at
  `Shelf.astro:35-44` records what happened the one time it was not. A dedicated
  stylesheet was not chosen: it would split one element's styles across two files
  for no benefit the `:global` prefix does not already buy.
- **Card content is built with `textContent` / `replaceChildren`, never
  `innerHTML`** — every value comes from the vault and must render as text.
- **The elements the template must carry** (because they must survive
  `replaceChildren`, or must exist before the first card opens): the `<aside>`
  and its `aria-label`, the close control, the replaced inner container, the
  status region, and `tabindex="-1"` on the canvas.

---

## 10. Data this card reads

Every field is already in `library.json` in **both** builds. Existing:
`id`, `title`, `author?`, `isbn?`, `status`, `started?`, `finished?`, `rating?`,
`cover?`, `pages?`, `binding?`, `tags`. New, from this effort:

| field | source |
|---|---|
| `publisher?`, `published?`, `subjects?` | [`metadata-merge.md`](metadata-merge.md) → [`provider-provenance.md`](provider-provenance.md) §6 |
| `googleVolumeId?`, `appleTrackId?`, `openlibraryOlid?`, `oreillyOurn?` | [`provider-provenance.md`](provider-provenance.md) |

The card needs **no** publisher or core change beyond those fields reaching
`LibraryBook`. `description` is written to the note body and is **not** a
`BookRecord` field, so no build can carry it and no path exists from a note body
to this DOM.

⚠️ **`pages` must move out of `describe()`.** The five-part object line assumes
it; `describe()` still pushes `pages` into the single meta line at `boot.ts:325`.
Taking the object line literally against today's code renders `pages` twice.

---

## 11. Acceptance

**Phase 2's puppeteer click test extends rather than forks.** The existing gate
clicks a book and asserts the card opens; against the enhanced card it should
assert:

1. **Every block that must render, renders** — on a filled book: title, the
   reading line leading with the status word, the object line, subjects and a
   links row with three marks.
2. **`read` is not suppressed** — a book with `status: read`, no dates and no
   rating still renders a reading line whose text is `read`.
3. **The collapse rules** — a book with no cover starts at the title; a book with
   none of the five object facts renders no object line but **does** render the
   links row.
4. **The fallback** — a book with no ISBN and no ids renders exactly one link,
   text, pointing at `openlibrary.org/search?q=`.
5. **Link shape** — every `<a>` in the row has `target="_blank"`,
   `rel="noopener noreferrer"`, and a non-empty accessible name.
6. **The announcer** — the `role="status"` sibling carries `«Title» by «Author»`
   after a click, changes on a second book, and is empty after dismissal.
7. **The close control survives a swap** — click book A, focus the close control,
   click book B; the same element is still there and still focused.
8. **`published` rendering** — `2019-03-05T07:00:00Z` renders `2019`;
   `forthcoming` renders `forthcoming`.

Assertion 7 is the one that catches the structural defect
[#101](https://github.com/mephistopheles4/stacks/issues/101) flagged, and it is
the one nothing else would notice.

⚠️ **G35 has since grown a ninth check this list does not contain**, and the list
is left as it was rather than backfilled: it is what map #88 accepted, and a spec
that quietly acquires requirements after the fact stops being a record of
anything. The enlarged cover — `checkCoverViewer` in `scripts/smoke-render.ts`,
[ADR-0052](../adr/0052-the-enlarged-cover-is-a-real-dialog.md) — came from a
later request. [`docs/gates.md`](../gates.md)'s G35 row is the live description
of what that gate checks; this section is the historical one.

**Existing gates that move:** none of the card work touches G8, G19 or
`build-modes` directly — but the three new `LibraryBook` fields do, and that is
[`provider-provenance.md`](provider-provenance.md) §6's gate. See
[`README.md`](README.md#gate-roster) for the whole roster.

**Two viewports, not one.** The sheet and the corner card are different
presentations of one element and the breakpoint is a fact held in two languages;
a test that only ever runs at desktop width proves nothing about the half of this
spec that only exists below 700px.

---

## 12. Residuals — carried, not smoothed

1. **`'★'.repeat(rating)` has never been rendered by anything.** 0 of 41 real
   books carry a rating and no prototype case added one.
2. **Apple's icon is unlabelled for a sighted touch user.** Accepted; see §8.
3. **`title`-as-accessible-name is the weakest mechanism available.** Stated in
   §8 rather than left silent, per [#92](https://github.com/mephistopheles4/stacks/issues/92)'s
   own instruction to the spec.
4. **Vendoring the three provider SVGs is an open redistribution question**,
   judged ordinary risk and accepted.
5. **`trackId` stability across an edition change is inference, not
   measurement** — and every id URL hard-404s on a stale value, so a re-issued
   edition is a dead mark rather than a soft landing.
6. **Landscape phones overflow the cap by 103px.** Accepted.
7. **The transition durations were judged from a live tuner, not a still.** The
   prototype bar tunes them (`?cardproto=C`); confirming costs one page load and
   should happen before implementation rather than after.
8. **The slide-down on dismiss exists in no code.** See §6.

The prototype these numbers came from is branch
[`prototype/enhanced-card`](https://github.com/mephistopheles4/stacks/tree/prototype/enhanced-card)
(`1dd6c86`), with shots in `artifacts/card-prototype/`. It is **throwaway**:
no tests, CSS built as a string, and it patches `boot.ts` behind `?cardproto=`.
Nothing on it is promotable as written.

---

## 13. Supersessions — the order the decisions actually landed in

Three closed tickets say something this file contradicts, because a later ticket
moved it. Recorded so a reader who opens the tickets in number order does not
implement the earlier answer.

| Earlier | Later, and what this file carries |
|---|---|
| [#101](https://github.com/mephistopheles4/stacks/issues/101): links named by `aria-label`, `title` struck row-wide | [#92](https://github.com/mephistopheles4/stacks/issues/92): **`title` as tooltip and accessible name, no `aria-label`.** Dropping the pair defeats the double-announce reason cleanly; the touch reason is accepted as a cost. |
| [#98](https://github.com/mephistopheles4/stacks/issues/98) + [#101](https://github.com/mephistopheles4/stacks/issues/101): Google's name is "Google Books" | [#92](https://github.com/mephistopheles4/stacks/issues/92): **"Google Preview"**, fixed by the licensed artwork, on WCAG 2.5.3 grounds. |
| [#98](https://github.com/mephistopheles4/stacks/issues/98): fallback is "Search Google Books" | [#105](https://github.com/mephistopheles4/stacks/issues/105): **Open Library**. `books.google.com/books?q=` 302s to general Google Search, and a book Google does not hold returns ten confident wrong results with no notice. |
| [#89](https://github.com/mephistopheles4/stacks/issues/89): object line is `pages · binding · isbn` | [#102](https://github.com/mephistopheles4/stacks/issues/102): **catalogue order**, `publisher · published · pages · binding · isbn` — the ISBN moves back to the end. |
| [#101](https://github.com/mephistopheles4/stacks/issues/101)'s post-#103 amendment: the row is "mixed", O'Reilly and Open Library as text | [#98](https://github.com/mephistopheles4/stacks/issues/98): **three marks.** O'Reilly is never rendered at all; Open Library is a mark. |
| [#97](https://github.com/mephistopheles4/stacks/issues/97): `published` is `YYYY` or `YYYY-MM-DD`, **never a timestamp** | [#102](https://github.com/mephistopheles4/stacks/issues/102): **stored verbatim**, rendered as its first four-digit run. Normalising at write time was rejected as the one irreversible option. **Do not write a normaliser.** |
