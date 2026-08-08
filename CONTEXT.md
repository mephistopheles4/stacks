# Stacks — the language

A glossary, and only a glossary. Every term below is one this project uses in a
narrower sense than English does, and that **no gate pins down**.

## Why this is not the third copy [ADR-0026](docs/adr/0026-constitution-is-gated-not-duplicated.md) refused

That record turned down a `CONSTITUTION.md` on the grounds that *"a rule written
down twice is a rule that will be true in one place and false in the other"* —
the invariants already lived in [`CLAUDE.md`](CLAUDE.md) and were already scored
in [`docs/gates.md`](docs/gates.md), so a third file would have been a second
thing to keep in sync and no new enforcement.

The same argument applies here and rules most candidate entries out. **A term
whose meaning a gate already holds is linked, never restated.** The frontmatter
keys belong to G8, the invariants to G19, the commands to G14, `shelf_order` to
G12, cover paths to G10 — a definition here would be a copy that can rot, and
those five cannot.

What is left is vocabulary this project has been using precisely for a year with
nowhere saying so. Naming those costs nothing to keep true, because **nothing
below states a rule**. If an entry here ever needs a "must", it has stopped being
a glossary entry and belongs in `CLAUDE.md` with a gate.

## Language

### Books and the shelf

**Vault**:
The folder of Obsidian notes that *is* the database. Defined by
[invariant 1](CLAUDE.md); reached only through the **adapter**, by
[invariant 4](CLAUDE.md).
_Avoid_: library (that is the built index), database, store.

**Shelved**:
A book in a status that puts it on the shelf. Wishlist books are not shelved —
you do not own them — and that is a different exclusion from **private**.
_Avoid_: active, visible, owned.

**Private**:
Marked by its owner as not for publishing. It still appears on your own machine:
private means *not published*, never *hidden from you*.
_Avoid_: hidden, secret, draft.

**Pin**:
Placing a book on the shelf by hand rather than by date. Semantics are G12's.
_Avoid_: sort key, manual order, priority.

**Footprint**:
How much shelf a book eats along the row — a single number. A face-out book has
been turned side-on, so its footprint is the width of its cover rather than its
own thickness, which is why row packing counts this and not thickness.
_Avoid_: width (of what?), extent, the shape it stands on (that is **contact**).

**Contact**:
Where a book meets the plank, as a rectangle. Not the same as its **footprint**:
a face-out book's contact is its cover's width by its own *thickness*, because
what it puts on the wood is the same slab as any other book, seen end-on. The
painted shadow is drawn from these.
_Avoid_: footprint (the scalar), shadow (that is what is drawn from it), base.

**Run**:
A group of touching books sharing one slump angle, because they are resting on
each other rather than each leaning independently. Broken by a year gap or by a
face-out book, either of which gives whatever follows something upright to lean
against. Giving every book its own angle is what produced wedge-shaped gaps —
neighbours a fraction of a degree apart, touching nowhere.
_Avoid_: group, cluster, stack (a stack is horizontal), streak.

**Binding**:
Hardback or paperback. The key belongs to G8 and its rules to
[`CLAUDE.md`](CLAUDE.md); what the word means *here* is that it names a book's
construction and nothing else — not its format, not how you read it. Absent means
**nobody has said**, which is a state and not a third value.
_Avoid_: format (that is print against audiobook, which nothing reads), cover
type, hardcover (no provider has ever called a book on this shelf one).

**Square**:
The few millimetres by which a hardback's boards overhang the page block at head,
tail and fore-edge — why the top of a real book is mostly paper with a thin rim
of cover round it. A paperback has none; its cover is glued flush. The square and
the board thickness move **together**, because a case still 2.6mm thick that has
lost its rim reads as a modelling error rather than as a second format.
_Avoid_: overhang, margin, lip, bleed.

**Profile**:
A spine's cross-section, as `{ rise, roll }` in width units — how far the centre
stands proud of the chord, and how much of each half-width is spent turning into
the joint. **Shaded, never built**: it is one shared normal map per binding on
the flat plane that was already there, and real curved geometry was measured
against it as the same picture at 6.7× the triangles. A paperback's is not
`{ 0, 0 }` — perfect binding is a flat *face* with a hard turn at each edge.
_Avoid_: curve (that was `spineCurve`, superseded), round, `roundedBack` (struck),
`softHinge` (subsumed into `roll`).

**Head**:
The top edge of a book as it stands on a shelf, where the covering rolls over.
The one edge that **cannot be faked** — a shelf is looked at from above, so the
head is a silhouette, and no normal map moves a silhouette. There is no *tail*
treatment and never will be: the lowest angle the camera permits is 3.6° above
the horizon, so no tail is ever in frame.
_Avoid_: top, cap (the cap is the *geometry*; the head is the edge), spine top.

**Striation**:
The grain of a cut text block — leaves stacked along the thickness. A
**one-dimensional** pattern, which is the whole reason it costs nothing: one map
varying only in `u` is correct on all four faces of the page block that can show,
so it needs neither a material array nor per-face UVs.
_Avoid_: texture (says nothing), pages (that is the block), grain (that word is
taken by the *struck* roughness weave — see #68).

**Provenance**:
Which of the three providers a cover's *bytes* were downloaded from — a separate
question from which provider answered for the book's metadata. The two differ
often enough that conflating them is a licensing mistake, not a pedantic one.
_Avoid_: source (ambiguous — a record's `source` is the metadata provider).

**Candidate**:
A URL that might turn out to be a cover. A book has a list of them rather than
one, because whether a URL is a usable cover is only knowable by fetching it and
looking. Which candidate wins is G22's; the word just means "not yet decided".
_Avoid_: cover URL (that is the one that won), option, fallback.

**Spread**:
Publisher artwork carrying front, spine and back together. It arrives from the
same field a cover does and is not a cover — on a shelf it renders as a smear of
three faces — so the downloader judges by shape rather than by which field
supplied it.
_Avoid_: wide cover, jacket (a jacket *includes* the front), bad image.

**Domain name / contract name**:
The same frontmatter key has two spellings, and which one is correct depends
entirely on which side of the adapter you are on. `spineColor` is the **domain
name**, used in `BookInput` and everywhere in `packages/core`; `spine_color` is
the **contract name**, the one in the note on disk and the one G8 pins. Creating
a note speaks domain names and the adapter translates; *updating* one speaks
contract names directly.
_Avoid_: treating them as a style difference. Three commands assembled the same
three cover keys three different ways, and this split — not anything about
covers — is why.

**Removal**:
Setting a key to `undefined` when updating an existing note, which deletes it
from the file. Everywhere else in this codebase an absent value means "say
nothing" — that side is `keyIfPresent`, and G23 holds it — but here it means
"take it out". The one place where the ordinary `undefined`-is-absence reflex
writes to somebody's vault.
_Avoid_: unset, clear, blank, null.

### Building and publishing

**Public build**:
A build that assumes an audience: wishlist and private books are dropped, covers
are re-hosted same-origin, and no note body is parsed at all. The counterpart is
a **local build**, which is for you and holds everything.
_Avoid_: production build, release, deploy (a deploy *uploads* a public build).

**Staging folder**:
Where `stacks build --public` puts what the site needs — `library.json`, covers,
the share image. It is an input to the site build.
_Avoid_: output, dist, assets.

**Built folder**:
What `astro build` assembles from the staging folder plus the site's own code.
It is the thing that gets uploaded, and it is **not** the staging folder — a
whole class of this project's bugs comes from treating them as one, so the two
have separate names on purpose.
_Avoid_: build output, bundle, the build (say which one).

**Origin**:
The address the shelf will be served from. A build needs to know it, because a
relative share-image URL renders as nothing in every preview scraper.
_Avoid_: host, domain, base URL, SITE_URL (that is the variable, not the idea).

**Canary**:
A phrase planted in fixture note bodies so that a check for note-body leakage can
distinguish "found nothing" from "looked nowhere".
_Avoid_: sentinel, marker, test string.

### Checking

**Gate**:
A named spec that goes red when a rule breaks, scored in
[`docs/gates.md`](docs/gates.md). A rule with no gate is a comment.
_Avoid_: test, check, CI job.

**Rule**:
Overloaded on purpose, so say which. A **rule of the constitution** is a numbered
invariant in `CLAUDE.md`. A **rule of the inspector** is one named member of
`PUBLIC_BUILD_RULES`, tagging a problem found in a built folder. They are related
only in that some inspector rules exist to enforce some articles.
_Avoid_: using it bare where the reader cannot tell which.

**Problem**:
Something wrong with a built folder, reported with the inspector rule that found
it. Reported, never thrown and never printed by the code that finds it — the
caller decides whether a problem is fatal.
_Avoid_: error, failure, violation.

**Observation**:
What an inspection saw when nothing was wrong — counts, totals, the URLs it
matched. Returned rather than logged, because an inspection that says nothing on
success reads exactly like one that never ran.
_Avoid_: log, output, info.

**Vacuous pass**:
A check that reports success because it examined nothing: an empty list every
predicate satisfies, a regex that stopped matching, a fixture that no longer
contains what the assertion looks for. The specific failure most of this repo's
gate design is arranged against.
_Avoid_: false positive, flaky, silent pass.
