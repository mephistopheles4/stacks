# Picking a book up — the split gate, the Thoughts extractor, and the motion

The output of [Map: picking a book up](https://github.com/mephistopheles4/stacks/issues/366)
— eight closed tickets, assembled into something an implementation session can
build **without reopening any of them**. Click a book: it slides out of the
shelf, turns in your hand, and opens to its `## Thoughts` section.

**This file is deliberately thin.** Every verdict below was reached on a ticket,
with its measurements and its corrections in the resolution comment. Restating
them here would put one decision in two places, which is what
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) exists to
prevent. So §2 links rather than retells. What this file adds is what no single
ticket holds: the decisions the map left to the spec (§3), the build order (§4),
the gate roster (§5), the contract edits (§6), the records (§7), what needs a
human (§8), and the residuals (§9).

⚠️ **The risk floor holds for every build step.** Step 2 publishes note-body
text and sanitises it by hand; step 3 publishes a larger copy of every cover.
Both are input validation and "anything published". Step 1 is the gate that
guards step 2. Step 4 changes what the page's Content Security Policy admits
and puts the published text on screen. So each runs on the **security route**:
the security pair on its diff, whatever tier its ticket carries.

⚠️ **Nothing here is built.** [`docs/notes-on-the-shelf.md`](../notes-on-the-shelf.md)
is the design this finishes; it now points here.

---

## 1. What ships

| | Value | Chosen on |
| --- | --- | --- |
| **The published section** | `## Thoughts`, exact, case-sensitive, trailing whitespace ignored | the map |
| **What reaches the site** | `notes/<id>.json`, `{ "paragraphs": string[] }`, plain text, one per book with a publishable section | §3.1, [#368](https://github.com/mephistopheles4/stacks/issues/368) |
| **Who reads the vault for it** | one new `VaultAdapter` method, called by the publisher only | the map, [ADR-0100](../adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md) |
| **What a click does** | picks the book up, for every book; the card overlay retires | the map, §3.4, [ADR-0102](../adr/0102-pickup-replaces-the-card.md) |
| **The motion** | the book comes to the camera in overlapping stages, about 1.3 s, played by GSAP from `gsap/gsap-core` | [#371](https://github.com/mephistopheles4/stacks/issues/371), [ADR-0103](../adr/0103-gsap-plays-the-pickup-motion.md) |
| **The text on the page** | a DOM element placed by three's `CSS3DRenderer`, updated in the same frame as the render | [#369](https://github.com/mephistopheles4/stacks/issues/369) |
| **The held cover** | a 1200 px copy of the vault cover, staged beside the 512 px one, named by `heldCover` in `library.json` | [#377](https://github.com/mephistopheles4/stacks/issues/377), §3.3, [ADR-0105](../adr/0105-a-cover-has-a-shelf-tier-and-a-held-tier.md) |
| **The tuner** | Tweakpane + `@tweakpane/plugin-essentials`, lazy, behind `?debug` on the live site | [#375](https://github.com/mephistopheles4/stacks/issues/375), [ADR-0104](../adr/0104-tweakpane-tunes-the-pickup-behind-debug.md) |

**Two new runtime dependencies reach a visitor or a `?debug` page**, and each
has a record: GSAP to every visitor (about 19.6 KB gzip, measured on #370), and
Tweakpane with essentials only to a page that asked for `?debug` (about 63 KB
gzip, lazy). `CSS3DRenderer` and `ImageBitmapLoader` come from three, which is
already here.

---

## 2. The verdicts, and where each lives

| Verdict | Ticket |
| --- | --- |
| **The split gate lands first and arms itself**: G2 (`public-build`) gains the presence half as a vitest `test.fails`, which goes red by itself once the extractor makes it pass. No new row, no disarmed flag. A vacuity guard, an `orphan-note` inspector rule, planted cases in existing fixtures | [#367](https://github.com/mephistopheles4/stacks/issues/367) |
| **Plain text, stripped by hand** the way `remove-markdown` does; paragraphs as a list; `%%`, `<!--` or more than about 8,000 characters withholds the whole section; no rendering, ever | [#368](https://github.com/mephistopheles4/stacks/issues/368) |
| **Page-mapped DOM text**, same-frame updates (0.3 px against 17 px one step late), fading in past about 95° of cover swing; the book settles square to the camera; a phone frames the right-hand page alone; pickup animates the shelf's own `THREE.Group` and reuses `?solo`'s build path | [#369](https://github.com/mephistopheles4/stacks/issues/369) |
| **GSAP plays, Tweakpane tunes, Theatre.js is out**; GSAP for the owner's fluency over a zero-byte option, with its licence a known trade | [#370](https://github.com/mephistopheles4/stacks/issues/370) |
| **The choreography, accepted as prototyped**: book to camera, a 55% veil over the shelf, reverse at 1.6× to put back, put-back-then-pick-up on a second click, a hard cut under reduced motion, the shadow map redrawn on leave and land. The open spread's alignment was left as polish; §3.6 promotes it to a done-criterion | [#371](https://github.com/mephistopheles4/stacks/issues/371) |
| **The pickup tuner moves to Tweakpane first**, behind `?debug` on the live site; the rest of the `?debug` page moves later. The spec locks the library, the CSS route, two gates and the honesty floor; the tuner's layout is shaped in use | [#375](https://github.com/mephistopheles4/stacks/issues/375) |
| **Tweakpane is blocked by the CSP as shipped and fixable without loosening it**: empty `<style data-tp-style>` placeholders, the CSS through a lazy `<link>` | [#376](https://github.com/mephistopheles4/stacks/issues/376) |
| **A 1200 px held copy from the vault only**, swapped in once decoded off the main thread, freed on put-down, staged by both builds through the shelf stage's own filter; no release of other covers until G15 (`cover-budget`) goes red; `gate:public` extended first | [#377](https://github.com/mephistopheles4/stacks/issues/377) |

**Settled while charting**, with no ticket, and carried as they stand on the
map: one extractor for both builds; the heading locked as `## Thoughts`, with
`stacks add` writing it above `## Notes`; the section boundary and its
fail-closed cases; embeds withhold the section and links flatten to their
text; the adapter method; pickup replacing the card; Escape, an empty-space
click and the back button putting a book back; reduced motion jumping straight
to open; tuned values as plain constants in `shelf-settings.ts`. The wording
lives in the map's [Notes](https://github.com/mephistopheles4/stacks/issues/366).

---

## 3. Decided in this spec

The map left these to the spec, as fog or as a choice a ticket handed on. Each
carries a recommendation the owner confirms at sign-off (§8).

### 3.1 The `notes/<id>.json` schema

```json
{ "paragraphs": ["First paragraph.", "Second paragraph,\nwith a kept line break."] }
```

- **One key, `paragraphs`, a non-empty array of non-empty strings.** Nothing
  else: no version field (#368: the page and the JSON ship in one deploy), no
  book id (the file name carries it, and `orphan-note` holds the name to
  `library.json`), no title (that is `library.json`'s).
- **`<id>` is the book's `LibraryBook.id`**, the slug-and-hash `idFor` already
  derives. It is never a vault path.
- **A withheld section emits no file**, exactly as a book with no section does.
  The page therefore never shows part of a section; it shows the book without
  Thoughts. The warning names the note and **never quotes the section**, so the
  owner finds out locally and the terminal holds no Thoughts text.
- **A named-keys inspector rule holds it**, in the published folder: a file
  under `notes/` must parse as exactly this shape, stay under a byte cap, and
  contain no URL scheme (§5, `notes-shape`). #367 deferred this rule until the
  schema existed; it now does.
- **The folder is pruned on every build** to exactly the files this build
  wrote, under `pruneCovers`'s rule: files only, and only where a previous
  `library.json` marks the folder as one this tool stages into. Without it, a
  section the owner deleted or that became withheld would ship again from the
  last build: `idFor` is stable, so the stale file still names a listed book and
  passes `orphan-note`. `publish.ts` records the same leak, for covers, above
  `copyCovers`.

**The boundary and the withhold list, as the security review tightened them.**
#368's rules and the map's boundary stand; these close the shapes they did not
name. Each withholds the whole section, with the warning above, and each gets
an extractor unit test with the canary placed where it would leak.

| Shape | Why it withholds |
| --- | --- |
| a code fence opened in the section and not closed before the next heading or the end of the file | an unclosed fence makes every later `## Notes` read as fenced, and the section runs into the private remainder |
| a setext heading (a line of only `=` or `-` under a non-blank line) | Obsidian renders it as a heading the boundary does not know |
| a `%%` or `<!--` comment still open where `## Thoughts` starts, or a `-->` inside the section | comment state is computed **from the start of the body**, as fence state is; a heading inside an open comment is no heading |
| any HTML tag-shaped sequence | raw HTML can hide text in reading view; this **replaces #368's rule 5** (strip tags, keep the text) with withholding, at no cost today: #368 counted no HTML in the real vault |
| a link reference definition line | Obsidian hides it, and it carries a URL |
| any URL scheme left after links flatten (`://`, `file:`, `obsidian:`, `mailto:`) | a bare address or an autolink is not a link the flattening sees; `file:` and `obsidian:` carry a user or vault name |

**A heading is recognised as broadly as CommonMark's ATX rule allows**: 0 to 3
spaces of indent, a space or tab after the hashes, optional closing hashes. The
scan starts below the frontmatter block. Matching wider can only end the
section earlier, which publishes less.

### 3.2 Which books get a notes file

**Only a book a public build would publish, in both builds.** The notes stage
asks the predicate the public shelf filter asks today (shelved status, not
`private: true`), lifted out of `publish.ts` into one named function both
callers share, and asks it **whatever the build mode**.

So a local build carries a private book on the shelf, as it does today, and
picking it up shows the card's lines, not its Thoughts. That is #367's planted
case read as written ("a `private: true` book with Thoughts and a wishlist book
with Thoughts, for neither of which any `notes/<id>.json` may exist", asserted
in both modes) and the map's "you see what a visitor sees". The cost is that a
private book's Thoughts are visible to nobody, the owner included, outside
Obsidian. The alternative (a local build emits them too) makes G2's local half
assert the opposite of its public half, and a local staging folder then holds
the one kind of file the inspector cannot tell apart from a leak.

**Held copies follow the shelf covers, not the notes.** #377 has them staged
through the shelf stage's own filter, which keeps every book in a local build.
A larger copy of a cover a local shelf already shows exposes nothing new.

### 3.3 The held copy's field and path

- **Field:** `heldCover` on `LibraryBook`, present only when a held copy was
  staged, for example `"held-covers/<name>"`. Absent means the shelf texture
  stays (#377).
- **Path:** a **sibling** folder, `held-covers/`, beside `covers/`, never a
  subfolder of it. Four things read `covers/` and each would have to learn
  about a subfolder: G15 (`cover-budget`) measures what lands there and would
  count a 1200 px file against the shelf's budget; `pruneCovers` removes files
  only and would leave a stale subfolder forever; `withLocalCovers` rewrites
  `cover:` to `covers/<name>`; and `orphan-cover` reads that folder's listing.
  A sibling touches none of them.
- **Its own prune**, under `pruneCovers`'s rule: files only, and only where a
  previous `library.json` marks the folder as one this tool stages into.
- **The file name is `coverFileName`'s**, the basename rule G10
  (`cover-path`) already holds, so a vault path never decides where a held
  copy lands.
- **Every held copy is re-encoded through sharp, never copied byte for byte.**
  This **replaces #377's "copied byte for byte when already inside" the cap**.
  A cover the owner photographed can carry camera metadata, location included,
  and sharp drops it by default; a byte copy would ship it. The held-tier check
  in `gate:public` adds: no held file carries EXIF or XMP.
- **The inspector learns `heldCover` four ways:** `unknown-key` admits it;
  `foreign-cover` holds it to a one-segment same-origin `held-covers/<name>`
  shape, as it holds `cover`; `orphan-held`, `orphan-cover`'s twin, fails on a
  file under `held-covers/` that no book names; and the `headers` rule requires
  a `/held-covers/*` block in `_headers` that revalidates, so a cover taken down
  does not linger in browsers for the image cache's four hours. `_headers` is
  the fifth reader of the covers path, after the four above.
- **`notes/` gets the same revalidating `_headers` block**, for the same
  reason: a withdrawn section must not live on in a browser cache.

### 3.4 What replaces the card

**The card overlay retires, and its content moves onto the held book's pages.**
Pickup replaces the card for every book (the map); this says where each part
of the card goes.

| Part of the card | Where it goes |
| --- | --- |
| Title and author | the left-hand page, as prototyped ([#371](https://github.com/mephistopheles4/stacks/issues/371)'s screenshot). **On a phone**, which frames the right-hand page alone, they lead the right-hand page too |
| Reading line, object line, subjects, links row (`cardModel`) | the right-hand page: on their own for a book with no Thoughts (#369's C, as is); **below the Thoughts**, after a rule, for a book with them, so the links stay reachable for every book |
| The close control | a **put-back control** on the right-hand page. A phone fills the screen with the page, so there is no empty space to tap; this is how a touch reader without a back gesture puts the book down |
| The enlarged cover (`cover-viewer.ts`, [ADR-0052](../adr/0052-the-enlarged-cover-is-a-real-dialog.md)) | **kept**, opened from a control among the card's lines, showing the held copy when one exists (#377) |
| The announcer (`role="status"`) | **kept**: «Title» by «Author» on pickup, changed on a second book, empty after put-back |
| The bottom sheet and its drag ([ADR-0049](../adr/0049-the-card-is-a-non-modal-bottom-sheet.md)) | **retired**. Focus still never moves on pickup, for that record's reason: there is still no keyboard path to the shelf |

Long Thoughts scroll only at rest (#369). Every text node is set through
`textContent`; nothing on the page is built from HTML (#368, rule 8).

### 3.5 The Phase 2 click gate, and G35

The Phase 2 gate in `AGENTS.md` says "clicking a book … opens the card". It
becomes **clicking a book picks it up**: the shelf reports the held state for
the clicked book, and the page layer carries that book's title.

G35 (`enhanced-card`) checks nine things; each is kept, moved or retired.

| G35 check | Fate |
| --- | --- |
| 1. every block renders | **moves** to the page |
| 2. `read` is not suppressed | **moves** |
| 3. the collapse rules | **moves**; "no cover starts at the title" no longer applies, since the page shows no thumbnail |
| 4. the fallback link | **moves** |
| 5. link shape and accessible names | **moves** |
| 6. the announcer | **moves**, with put-back as the dismissal |
| 7. the close control survives a swap | **becomes** the put-back control surviving a pickup of a second book |
| 8. `published` rendering | **moves** |
| 9. the enlarged cover (`checkCoverViewer`) | **moves** to the new entry; its Escape-layering clause now reads "one Escape closes the viewer and leaves the book held" |
| `checkSheet` | **retires** with the sheet |

The row keeps its number and slug, and its wording changes in the step that
lands the page (§4, step 4).

### 3.6 The open spread at rest

**A done-criterion the owner set after playing with
[#371](https://github.com/mephistopheles4/stacks/issues/371)'s prototype**,
relayed to this spec by the map's lead session and confirmed at sign-off. At
rest, both pages of the open spread lie in one plane square to the camera, with
matching page heights, and the hinge meets the spine. In the prototype the
cover rested near 165°, drawn in perspective, while the Thoughts page was flat,
so the two did not line up. #371 named three causes; each becomes a check:

| Cause in the prototype | At rest, measured in the page's own pose |
| --- | --- |
| The cover rests at about 165° and leans toward the camera | the front board lies at **180°** to the page block, ±0.5° |
| The left page is drawn at 97% of the cover's height; the right page is the inset page block | the left page is a sheet the **page block's** height and width, ±1 px projected |
| The cover hinges at the spine's outside corner, so spine and head cap show between the pages | the left page's inner edge and the right page's inner edge meet at the gutter: **no gap wider than 1 px** projected, and no spine or head-cap pixel between them |

Measured with #369's projected-corner sweep, at the 1280×800 desktop viewport.
**Desktop only**: a phone frames the right page alone, so there is no spread to
align there. Part of the pickup row (§5).

### 3.7 The empty-string hash, pinned on purpose

#376's placeholders stay quiet only because the built `style-src` already
carries the hash of an empty string, `'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='`.
It is in the built page today (checked in a September build) and nothing says
why. So:

- **The placeholders go in the page template**, empty, so Astro hashes their
  content itself and the hash is there by construction, not by accident.
- **The styled-pane gate asserts it**: the built page's `style-src` carries the
  empty-string hash, a `?debug` page records zero `securitypolicyviolation`
  events, and a pane element's computed style is not the browser default.
- **No `'unsafe-inline'` and no Tweakpane content hashes**, for #376's reasons.

### 3.8 Types for the two libraries

**Declare the slice used, in the repo; add no package for types.** #371 found
that the type-aware lint cannot resolve the timeline type `gsap/gsap-core`
returns, and that Tweakpane's `Pane` extends a class from `@tweakpane/core`,
which pnpm's strict layout does not expose. A local declaration of the methods
called keeps the dependency count where #370 and #375 left it. The cost is that
a library upgrade can drift from the declaration silently; the type-checked
calls are few, and the split and styled-pane gates run the real code.

### 3.9 Who owns `history.state`

**Pickup owns its history entry.** It pushes one entry with its own state;
Escape and an empty-space click go through `history.back()` (#371). The `?debug`
panel's `replaceState(null, …)` changes to pass the current `history.state`
through, so it rewrites the URL without erasing a held book's entry.

**The pushed entry keeps the current URL**: no path, query or hash names the
book. The edge injects a Cloudflare analytics beacon on every page, and
[ADR-0065](../adr/0065-the-csp-is-generated-not-written.md) admits it only as
carrying nothing derived from the shelf's reading; a book id in the address
would hand it which books visitors open. The pickup gate asserts `location.href`
is unchanged after a pickup. The book id lives in `history.state`, and is looked
up in `library.json`, never used to build a fetch path.

### 3.10 The painted pieces

**Repaint without the held book**, at the same two moments the shadow map is
redrawn: when the book leaves and when it lands. #371 found that a lifted book
leaves its painted contact root in the slot, and a face-out book its cover-shade
band. Repainting keeps one rule for every painted piece; hiding parts would need
a per-piece list.

### 3.11 Deferred, each with its trigger

- **Deep link** (`/#<book-id>` opening a held book). Deferred: nice, not needed
  to reach the destination (the map). **Trigger:** the owner wants to share one
  book. The history entry of §3.9 is where it would attach, and the work starts
  by re-reading ADR-0065, because a book in the address is the flow §3.9 keeps
  away from the beacon. An id read from the address is looked up in
  `library.json`, never used to build a fetch path.
- **Touch turn** (dragging a held book, `?solo`-style). Deferred: a tap picks
  up and the scripted turn plays. **Trigger:** the phone check in §8 finds the
  scripted turn unsatisfying on a touch screen.
- **The rest of the `?debug` page to Tweakpane.** A later ticket (#375).
  **Trigger:** tuning the motion is done.
- **Releasing the other covers on pickup.** **Trigger:** G15 (`cover-budget`)
  goes red (#377).

---

## 4. Build order

**Four steps, a chain.** The map fixed the first three in this order (the split
gate, then the extractor, then the motion); #377's held tier sits between the
extractor and the motion, because the motion swaps its texture in.

| | Step | Route | Blocked by |
| --- | --- | --- | --- |
| 1 | **The split gate.** The **ship phrase** (#367's must-ship marker: a literal planted inside a fixture's `## Thoughts` that a check requires to be present, the canary's opposite) as a constant beside `NOTE_BODY_CANARY`; `## Thoughts` sections added to existing fixtures; G2's vacuity guard and absence assertions armed; G2's presence assertions as `test.fails`, public and local; the `orphan-note` and `notes-shape` inspector rules with their G20 plants | security | — |
| 2 | **The extractor.** The adapter method, with §3.1's boundary and withhold list; the hand strip; `notes/<id>.json` staged by both builds under §3.2's predicate, and the folder's prune; `stacks add` writing `## Thoughts` above `## Notes`; the `## About` writer disarming heading-shaped lines (below); `packages/site/public/notes/` in `.gitignore` and in G5's build-output assertion; the `/notes/*` revalidate block; G2's `test.fails` flipped to `test`; `gate:public`'s presence and vacuity checks; G2's row text rewritten to the split | security | 1 |
| 3 | **The held tier.** `gate:public` extended first and proven red: no held file for a private or wishlist book, none above 1200 px, none carrying EXIF or XMP, `orphan-held`, `heldCover` in `unknown-key` and `foreign-cover`, the `/held-covers/*` block required by `headers`. Then the staging: the held stage re-encoding through sharp, its prune, `heldCover` in `library.json`, `packages/site/public/held-covers/` in `.gitignore` and G5, the card's cover viewer reading it | security | 2 |
| 4 | **The motion.** Pickup replacing the card (§3.4); GSAP stepped from the render loop; the CSS3D page; the held texture's off-thread decode and swap; the three-pass dim; the painted repaint; the pickup tuner on Tweakpane with its CSS route, the CSS extracted by reading the package file **as text**, never importing or evaluating it, and failing when the expected CSS is absent; the Phase 2 click gate and G35 moved (§3.5), with `location.href` unchanged after a pickup; G61 extended; the open spread (§3.6); the phone loop as a hook (below) | security | 3 |

**Step 4 is the largest**, and the tuner gates the motion only (the map). If
step 4 is cut into tickets, cut the tuner's two gates and its CSS route first,
since tuning the motion needs them, then the pickup itself.

**What #367 put in steps 1 and 2 is carried as it stands.** Every other
boundary and sanitising case is an extractor unit test, listed on
[#367](https://github.com/mephistopheles4/stacks/issues/367) and
[#368](https://github.com/mephistopheles4/stacks/issues/368). One more joins
them here: **a note whose `## About` the merge inserted after the Thoughts**
must ship none of `## About`. `insertBodySection` places `## About` above
`## Notes`, so it lands between the two, and a `##` heading ends the section;
the test proves it, because invariant 2's warning says no allowlist may ever
pick `## About` up.

**The `## About` text is a provider's, and it must not be able to open a
section of its own.** `toPlainText` keeps a description's line breaks and
`insertBodySection` writes it verbatim, so a listing line reading `## Thoughts`
would land at column 0. On a note with no Thoughts it would ship a stranger's
words as the owner's; on one with Thoughts the duplicate would withhold the
owner's real section; followed by an unclosed fence it would carry `## Notes`
out. So step 2 makes the `## About` write path **disarm every heading-shaped
line and every fence opener** in provider text (an escaping prefix, so it can
read as neither), and the test above gains a description carrying a
`## Thoughts` line and an unclosed fence: it must ship nothing. The `## About`
sections already in the vault were written before this rule; step 2 searches
them once for heading-shaped lines before the first real public build (§8).

**The phone loop is a hook, not an address switch.** #371's prototype looped
pickups with `?autoplay=5`. The build gives `scripts/phone-check.ts` a function
on `window.__shelf` to call instead, so no link a visitor is sent can start a
loop on their device.

---

## 5. The gate roster

Numbered against [`docs/gates.md`](../gates.md)'s tip **when each lands**, never
here. ⚠️ **Never pre-allocate a number**: this folder's README records four
corrections from a rollout that did. The labels below are this spec's names
until then.

| Label | What it asserts | Lands with | Row |
| --- | --- | --- | --- |
| **split** | The Thoughts text is present in its book's `notes/<id>.json` and the canary is present nowhere, in public and local builds; a private book, a wishlist book, an embed and **an unclosed fence with the canary in `## Notes` below it** emit no file; **a build after the section is withheld, and again after it is removed, leaves no file for that book** | steps 1–2 | G2 (`public-build`), extended |
| **orphan-note** | Every `notes/<id>.json` names a book in the `library.json` beside it | step 1 | an inspector rule, planted red under G20 (`public-build-artifact`) |
| **notes-shape** | Every file under `notes/` is exactly `{ "paragraphs": string[] }`, non-empty, under a byte cap, and free of any URL scheme | step 1 | an inspector rule, planted red under G20 |
| **presence in `dist/`** | `gate:public` finds the ship phrase in `dist/notes/` and refuses to run without its fixture | step 2 | `gate:public`, extended |
| **build output out of git** | `packages/site/public/notes/` and `held-covers/` are ignored | steps 2–3 | G5 (`vault-is-truth`), extended |
| **held tier** | No held file for a private or wishlist book; none above 1200 px on its long edge; none carrying EXIF or XMP; no file in `held-covers/` that no book names; `heldCover` same-origin and one segment; a revalidating `/held-covers/*` block | step 3, **before** the staging | `gate:public` and inspector rules under G20 |
| **pickup** | Clicking a book reaches the held state with its page, and `location.href` is unchanged; the moved G35 checks; the open spread of §3.6 | step 4 | G35 (`enhanced-card`), reworded |
| **held reader** | With a book held, one program reads the shadow map in at most `BUDGET` draws | step 4 | G61 (`one-shadow-reader`), extended to a second page |
| **tuner split** | A page without `?debug` loads zero tuner bytes, JS or CSS | step 4 | a new row |
| **styled pane** | Under the built site's CSP, a `?debug` page's pane is styled, with zero violations and the empty-string hash in `style-src` | step 4 | a new row |

**Two new rows, the rest extensions.** #367 chose to extend G2 rather than mint
a row, and the inspector rules ride G20's existing plants. The two tuner rows
are new because nothing watches a lazy split or a CSS route today: #376
measured both failures as silent.

**Existing gates that move or must be honoured:** G5 (`vault-is-truth`), whose
build-output assertion learns the two folders; G1 (`adapter-boundary`), since
the new method lives under `adapters/`; G8 (`frontmatter-contract`) is
untouched, because the section is a body heading, not a key; G10 (`cover-path`)
holds the held file's name; G15 (`cover-budget`) must not see the held folder;
G13 (`no-third-party-material`) forbids committing screenshots; G21
(`no-live-network`); G19 (`constitution-scoreboard`) for the two new rows; G14
(`commands`) if a script is added for the CSS extraction.

---

## 6. Contract edits

Each lands **in the same commit as the code it describes**, never before it.
G8 already shows why: a contract edited ahead of the parser is a red build.

- **`AGENTS.md`, invariant 2.** "Nothing implements that yet" and "nothing below
  the frontmatter block is parsed or shipped at all" become the split as built:
  the adapter reads one section, the publisher ships it as `notes/<id>.json`,
  and `library.json` still carries none of it. The `## About` warning stays
  word for word. Step 2.
- **`AGENTS.md`, vault adapter contract.** A seventh method, shaped like
  `readPublicSection(sourcePath): Promise<readonly string[] | undefined>`. It is
  **the only method that reads below the frontmatter**, as `insertBodySection` is
  the only one that writes there, and it returns paragraphs, never the body.
  The block's `insertBodySection` line says `Promise<void>`; the code says
  `Promise<boolean>`, and the edit fixes that too. Its paragraph gains that the
  text it writes has every heading-shaped line and fence opener disarmed
  (§4). Step 2.
- **`.gitignore`.** `packages/site/public/notes/` (step 2) and
  `packages/site/public/held-covers/` (step 3), beside the `covers/` and
  `library.json` lines already there. A broad add after a real build would
  otherwise put the owner's Thoughts into public history, beyond retraction.
- **`_headers`.** Revalidating `/notes/*` (step 2) and `/held-covers/*` (step 3)
  blocks, with the `headers` inspector rule requiring both.
- **`AGENTS.md`, Phase 2 gate.** "Clicking a book … opens the card" becomes
  "picks it up" (§3.5). Step 4.
- **`AGENTS.md`, tech decisions.** "Book detail card = plain DOM overlay
  positioned from raycaster hits" becomes the held book's page, placed by
  `CSS3DRenderer`. Step 4.
- **`docs/gates.md`.** Two new rows (§5), and the rewording of G2, G35 and G61.
  G19 holds the rows.
- **`docs/progress.md`**, in the same commit as each gate.
- **`debug-panel.ts`, lines 25–29.** The rationale comment: "no React" is moot
  and "makes the lazy-load boundary pointless" is disproved; only "removable in
  one file" stands (#375). Step 4.
- **`stryker.scopes.json`.** If a new module joins a declared scope, or
  `debug-panel.ts` is renamed or split, run `pnpm mutation:stamp` (G56,
  `config-hash`).

---

## 7. The records

Written with this spec, because the map's decisions were made here and the
records carry their reasoning. Each says it is not built yet. The numbers leave
room, per [`docs/adr/README.md`](../adr/README.md).

| Record | Decision |
| --- | --- |
| [ADR-0100](../adr/0100-the-thoughts-section-is-read-by-one-adapter-method.md) | The Thoughts section is read by one adapter method, called only by the publisher, and both builds ship the same notes |
| [ADR-0101](../adr/0101-thoughts-ship-as-plain-text-and-withhold-whole.md) | Thoughts ship as plain paragraphs stripped by hand, and anything hidden withholds the whole section |
| [ADR-0102](../adr/0102-pickup-replaces-the-card.md) | Pickup replaces the card for every book |
| [ADR-0103](../adr/0103-gsap-plays-the-pickup-motion.md) | GSAP plays the pickup motion, for fluency over a zero-byte option |
| [ADR-0104](../adr/0104-tweakpane-tunes-the-pickup-behind-debug.md) | Tweakpane with essentials tunes the pickup, behind `?debug`, styled through placeholders and a lazy link |
| [ADR-0105](../adr/0105-a-cover-has-a-shelf-tier-and-a-held-tier.md) | A cover has a shelf tier and a held tier; amends ADR-0015 |

No other decision on the map meets AGENTS.md's bar of hard to reverse,
surprising and a real trade-off. The choreography's numbers live in
`PICKUP_MOTION` and are tuned in use; the boundary rules are the map's and are
unit-tested.

---

## 8. Needs a human

| What | When | How |
| --- | --- | --- |
| Confirm §3's decisions: the schema, which books get notes, the held path, what replaces the card, the G35 fates, the open-spread criterion, the type slices, history, the repaint, and the four deferrals. **Two of them replace a ticket's rule**, from the security review: any HTML tag withholds the section (#368's rule 5 stripped tags and kept the text), and every held copy is re-encoded (#377 copied one already inside the cap byte for byte) | **at sign-off** | the owner reads §3 and says proceed, fix or kill on the whole spec |
| The open spread of §3.6 looks right | **during the build**, step 4 | the session posts desktop screenshots at rest on the step's ticket (never committed, G13); the owner judges. The numbers in §3.6 are necessary, not sufficient |
| **The Pixel check**, deferred from #371 and #375 | **during the build**, step 4, while polishing | the owner connects the Pixel 10 Pro XL; the session drives it through `scripts/phone-check.ts`, which calls the shelf's loop hook to pick up and put back books (§4); there is no address switch for it |
| **The existing `## About` sections**, searched once for heading-shaped lines and fence openers | **during the build**, step 2, before the first real public build | the session runs the search against the owner's vault and reports counts only; the owner decides what to do with any hit, because those notes are the owner's to edit |
| **The swap frame on a phone**, from #377 | **during the build**, step 4, in the same phone session | the held texture's `initTexture` upload is timed on the device; nobody has measured it |
| The tuner's layout | **during the build**, step 4 | shaped by the owner in use (#375); the spec locks only the floor |
| Accept each step | **at the end of each step** | move 4 of the owner's playbook; the security pair on steps 1–3 |

---

## 9. Residuals and follow-ups

- **A private book's Thoughts are visible to nobody outside Obsidian**, the
  owner included (§3.2). Accepted for a check that reads the same in both
  builds.
- **The type slices of §3.8 can drift from the libraries silently.**
- **Shelf-tier covers of 512 px or less are still copied byte for byte**, so
  they keep any camera metadata. That predates this map; the held tier no longer
  shares it (§3.3). Worth a follow-up that sends them through sharp too.
- **A withdrawn section can outlive the prune** in third-party caches and web
  archives. The prune and the revalidate block cover this site and browsers,
  nothing beyond.
- **GSAP's licence is not OSI open source** and can be terminated by Webflow for
  non-compliance (#370). Accepted; it does not bite a personal shelf.
- **The swap frame's cost on a phone is unmeasured** (#377); §8 measures it.
- **One G61 flake is unexplained**: the `rest=none` page failed clause 1 once,
  at load, before any pickup, then passed twice (#371).
- **The `dist/` size the held tier adds is an estimate**, about 10 MB, not
  measured (#377).
- **Follow-ups:** the 16 small covers, [#408](https://github.com/mephistopheles4/stacks/issues/408);
  realism beyond the cover (finish maps, a Blender model), a future map that
  would reopen #369's reuse of `buildBook`; the rest of the `?debug` page
  (§3.11).

## 10. Out of scope

- **Highlights.** Imported highlights are someone else's text; whether they may
  be republished is a different question (the design's own list).
- **A draft state for a public section.** Presence is the signal; an override
  comes only if its absence bites.
