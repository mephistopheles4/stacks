# Spec — the page-level attribution surface and the `/attribution` route

**Status:** locked.
**Sources:** [#103](https://github.com/mephistopheles4/stacks/issues/103) (what
each provider's guidelines say), [#104](https://github.com/mephistopheles4/stacks/issues/104)
(that the obligation binds, and where it lives),
[#106](https://github.com/mephistopheles4/stacks/issues/106) (what the surface
carries and how it is drawn).

⚠️ **Not legal advice.** Nobody involved is a lawyer and no lawyer reviewed any
of this, exactly as [`provider-mark-usage.md`](https://github.com/mephistopheles4/stacks/blob/64f861c/docs/research/provider-mark-usage.md)
says of itself — that document is on branch `research/provider-marks` (`64f861c`)
and is not in this checkout. What follows is a reading of what Google and Apple say they
require, and a decision made in light of it.

---

## 1. Why this exists at all

Google's obligation is a **live ToS clause pointing at a stale page**, not a
stale page asserting on its own authority. The Books API's own Terms of Service
carry **no attribution clause** — they cover fees, content removal and privacy —
but they bind you to the Google APIs Terms of Service, **§6**:

> You agree to display any attribution(s) required by Google **as described in
> the documentation for the API**.

The Books branding page *is* that documentation, and this project holds a
`GOOGLE_BOOKS_API_KEY` obtained under those terms. Two limbs:

| Limb | Clause | Status |
| --- | --- | --- |
| **§2 per-result link** | *"Every book result displayed in your application must have a prominent link to … the Google Books page for that book."* | **Already discharged** by the card's Google mark |
| **§4 the graphic** | *"the 'powered by Google' logo must appear adjacent to these results."* | **This surface** |

**The link limb needed no new work, and the populations match by construction.**
The contributor set *is* the set of id keys present, so "book with Google-derived
data" and "book that renders a Google mark" are the same set, filled from one
`enrich` pass. Nothing was added to make the obligation and the affordance line
up.

⚠️ **The two limbs are separate and must not be conflated.** A published claim on
this map — that an open card discharges the corner's obligation because it
carries the Google mark — is **wrong**: the mark is the *link* limb and the
occluded graphic is the *graphic* limb. The card cannot stand in for the corner.
See §4.

**Two strains recorded rather than smoothed:** "prominent" is read generously
(the mark is an icon at the terminal end of an eight-row card that only exists
after a click), and a *text* link would also have discharged §2 — not taken, but
it remains the cheap escape if the mark's redistribution residual ever bites.

**It binds although the data reaches the vault first.** §6 attaches to
*displaying* the data; if inserting a hop between fetch and display discharged
it, every API attribution requirement would be one cache away from nothing, and
this project caches every response in `.cache/` already. Smallness, `noindex` and
non-commercial use did **not** decide it, for the same reason the mark research
refused to let the Internet Archive's non-profit status stand in for a licence.

**And the repo decided the "always displayed" reading, not taste.** `pages`
drives spine thickness (`packages/site/src/shelf/books.ts:198,240-248`), so the
shelf renders Google-derived **geometry** continuously with no card open. A
card-conditional graphic would be absent for the entire time the obligation is
live.

---

## 2. What ships

### On the shelf — the surface

- **A vendored `powered by Google` graphic**, and the single word **Attribution**
  as a link. Nothing else.
- **Bottom-left**, at the header's own `clamp(1rem, 4vw, 2.5rem)` offset — the
  same arithmetic the lockup uses rather than a second set of numbers. Graphic
  first, link beside it, one row, left-aligned.
- **Small**: **165×44** at an 18px graphic; 209×44 at 26px. **The height does not
  move**, because it is set by the link's 44px touch target (WCAG 2.5.5) and not
  by the graphic — so shrinking the graphic buys width and nothing else. Google
  publishes **no minimum size** for the powered-by image (Apple publishes one for
  its badge; Google does not), so the floor is legibility.
- **One placement, one set of offsets, no media query.** It does not move or
  re-home below the breakpoint. See §4.

⚠️ **It is the first page chrome on this site that is not inert.** The surface
sets itself `pointer-events: none` so drag-to-look-around passes through it, and
**the anchor opts back out** with `pointer-events: auto`. The `<canvas>` fills
the viewport with `touch-action: none`, so this was worth checking rather than
inferring — and it was: at 375×812 with the shelf live,
`elementFromPoint(link centre)` returns the anchor, not the canvas, with the
surface at `z-index: 5` against a `.shelf` carrying none.

⚠️ **The reason is *not* that `header` is `pointer-events: none`.** That
justification belonged to a placement that was rejected (into the header lockup);
in the locked design the surface is a `<body>` child and the header is not
involved.

### On the route — `/attribution`

A new Astro page carrying:

1. **Apple's credit line** (§3);
2. **a four-provider credits line** — Open Library, Google Books, Apple Books,
   O'Reilly — **manners, not compliance**. Neither Open Library nor O'Reilly
   requires attribution any source read has found. O'Reilly is named although its
   mark is never rendered: it is a contributor the vault records, and the credits
   line is prose, not a link, so its 403 does not reach it.
3. room for whatever later work owes.

Plus, decided explicitly rather than left to the assembly:

- **A plain text link back to `/`.** The site has no navigation, no header link
  and nothing that has ever gone anywhere; a browser back button is not a way
  back for someone who arrived on the route directly.
- **No canvas.** The route does not mount the shelf. It is a page of legal text,
  and a WebGL scene behind it would be the most prominent element on a page whose
  entire purpose is a notice Google says must not be outshone.
- **The same `noindex` posture as `index.astro`** — see §6.

**The split is what reconciles the two content answers.** Inline, the
four-provider credits line wraps to two rows and lands on the lit bookcase at
375px, unreadable — the measured case against carrying it on the shelf. On a page
of its own it costs nothing.

**A route, not a modal**: `index.astro` is `overflow: hidden`, `height: 100%`, no
footer and no scroll, so a modal is in-page machinery on a page whose chrome is
otherwise inert, and a new Astro page is the shape the constraint already names.

---

## 3. Apple's credit line — and why it is one sentence, not two

> **Apple Books is a service mark of Apple Inc.**

Apple's §7.1 governing sentence is *"listing all the Apple trademarks used in
your communication. **List only the trademarks actually used in your
materials.**"* It then gives three variants, **all scoped to the badge**, and the
card locked the **icon**, for which Apple publishes **no variant at all**. Read
against the governing sentence rather than the nearest example, the badge
variant's *"The Apple logo is a trademark of Apple Inc., registered in the U.S.
and other countries"* sentence is **dropped, because the Apple logo is not
used**.

⚠️ **If the vendored icon artwork turns out to carry the Apple logo, that
sentence returns.** That is a check on the asset, not a reopened decision.

Apple explicitly permits this placement — *"Follow standard practices for the
placement of legal copy, such as creating additional screens or providing
interactive links"* — and requires it *"only once in your communication or
website"*, which one route satisfies for the whole site.

**The line is owed only if the Apple mark ships.** It rides on the same surface
because one element discharging two obligations is what makes the surface
affordable.

---

## 4. Placement: measured, and the phone occlusion accepted

The page has four corners and three are spoken for — the header owns top-left,
the desktop card owns bottom-right, and on a phone the full-bleed sheet owns the
entire bottom edge whenever a card is open. `?attribproto=` mounted the surface
on the real page so this is a number rather than an argument:

| place | desktop | portrait 375×812 | landscape 667×375 |
| --- | --- | --- | --- |
| **bottom-left** *(chosen)* | clear | **100% behind the sheet** with a card open | **100% behind the sheet** |
| top-right | clear | **3211px² on the header caption** | clear |
| under the header | clear | clear | clear |

⚠️ **The instrument was wrong before the placements were.** The first pass
measured overlap against the *card* only and reported top-right as clear in every
state — while at 375px its text lands directly on *"Drag to look around · click a
book"*. **The page has two things to collide with and the rig was watching one.**
`measure()` now reports `onHeader` too. This is CLAUDE.md's `?solo` lesson
repeating itself.

**7251px² of a 7260px surface** sits behind the sheet on both phone viewports
with a card open — the whole of it. **Accepted by the owner, deliberately, after
the measurement and the objection were both put.**

**The objection, on the record:** a card-*conditional* graphic was rejected
because it would be absent exactly when the obligation is live. Occluded by an
overlay is not the same as conditionally rendered, but the visible result on a
phone is the same — and an occluded *paragraph* is hidden text where an occluded
*anchor* is a control nobody can reach.

**The basis that holds:** *occluded by a dismissible, non-modal overlay is not
the same as conditionally rendered.* The element is in the DOM and displayed on
load; the sheet is one gesture from dismissal and swaps rather than stacks.

⚠️ **The residual, stated rather than smoothed:** while a card is open on a
phone, **no Google attribution is on screen at all**. The graphic is occluded and
the card's mark is the other limb. That is the honest position.

**The rejected alternative, measured and not overlooked:** bottom-left above the
breakpoint and into the header lockup below it is clear in every state on all
three viewports. Rejected for the complexity it carries — a **DOM re-home rather
than a media query**, since a corner element cannot become a flow child of the
header in CSS alone, which would make `(max-width: 700px), (max-height: 500px)` a
fact **three** places hold when it is already flagged as one that must not drift
at two.

---

## 5. The asset: vendored, not hotlinked

**Vendored**, against the ticket's own stated constraint *and* against a
mid-session recommendation. Google serves
`books.google.com/googlebooks/images/poweredby.png` from its own host with no
registration, so hotlinking would make the redistribution question vanish
outright. Three reasons it is not taken:

- **The page makes zero third-party requests today.** The webfont was rejected at
  "one more request and ~30 KB for six letters"; the site's own mark is inlined
  `?raw`. A hotlinked PNG would be the first external request this page has ever
  made, disclosing every visitor's IP and referer to Google on every load — on a
  site carrying `noindex` precisely because a reading list is a strange thing to
  have turn up beside your name. **A privacy regression accepted to satisfy an
  obligation that has nothing to do with privacy is a bad trade.**
- **An attribution you do not host can fail silently.** The URL is advertised by
  a page more than a decade stale, and a broken image is a *failed* obligation
  that looks exactly like a met one.
- **The redistribution residual is weaker here than for the card's bare marks.**
  Every grant found is permission to *use* artwork and silent about
  redistribution; this one image is different in kind — Google **requires** its
  display and serves it unconditionally.

**A text-only "Powered by Google" was not an option** — the clause says
*graphic*, and *"Do not change any of the Google marks in any way."*

⚠️ **The graphic's real footprint is unmeasured.** Every width in §2 inherits an
**assumed 144×26**; `poweredby.png` has not been fetched, only confirmed to
return 200. The heights do not inherit it, being set by the touch target.

⚠️ **A deploy-time check that the graphic is still served was offered and
declined** — recorded as declined rather than overlooked, because in a gate-heavy
repo a missing gate otherwise reads as an oversight. The obligation is met by a
**committed file**, not by a checked property. The route makes the failure mode
slightly worse (a second file that can go missing) and still does not reopen it.

**Google's "no competing search services" clause was read narrowly and the card's
mark row is not reopened.**

> The Google logo may never appear next to or on the same page with the logos of
> competing web or other search services. There are no exceptions to this rule.

The reading: **Google means search engines.** Apple Books is a bookshop and Open
Library is a library catalogue. ⚠️ **The counter-argument is on the record rather
than left to be rediscovered:** Open Library genuinely runs a search over a book
catalogue, *"or other search services"* is broader than "search engines", and
*"there are no exceptions"* is the identical phrasing this map read as absolute
when O'Reilly used it. This is a judgement, not a certainty — a made decision
rather than a future surprise.

---

## 6. The second page: what it touches

`/attribution` is **the second page this site has ever had**, and two tools have
never had one to think about.

- **`pnpm gate:public`** — its text-file scan walks the whole `dist/`, so the
  `note-body` and `vault-path` rules already cover a new page for free. ⚠️ **The
  `robots` rule does not**: it reads `join(dir, 'index.html')` only
  (`scripts/lib/public-build.ts:238`), so a second page missing `noindex` passes
  today. **The route carries `<meta name="robots" content="noindex, nofollow">`,
  and the rule must read every `*.html` in the build rather than only the
  index.** The share-image and `og-image` rules stay index-only: a legal-notice
  page needs no share card.
- **`pnpm deploy:site`** — the build stamp is a hash of `index.html` injected
  into `index.html` (`scripts/deploy.ts:369`). ⚠️ **A change confined to
  `/attribution` moves no stamp**, so the live build check would not notice it
  had shipped. Stated as an accepted limitation rather than fixed: the stamp
  exists to prove *the bundle* changed, and the route is static text that shares
  the bundle.

Nothing here changes what `deploy:site` uploads — wrangler publishes `dist/`.

---

## 7. Residuals

1. **While a phone card is open, no Google graphic is on screen.** §4.
2. **A book with no `google_volume_id` renders no Google mark**, so on a phone
   with that book's card open there is no Google attribution at all. That
   population is every book Google cannot match after `enrich`.
3. **35 of 41 real books carry `pages` with no recoverable provenance.** A book
   whose Google data predates ids and which Google can no longer match is
   unattributable *in principle*, because a note records an answer and never who
   gave it. **Its size is unknowable by construction.** The page-level graphic
   reduces its practical weight to nothing — it covers every book on the page
   whether or not it carries an id — and post-`enrich`, `google_volume_id`
   **over-attributes** rather than under-attributes, which is the safe direction.
4. **The graphic's footprint is assumed, not measured.** §5.
5. **Vendoring is open exactly as the card left it** — the graphic and Apple's
   icon.
6. **No gate protects the graphic being served.** Declined deliberately. §5.
7. **The "no competing search services" reading is a judgement.** §5.
