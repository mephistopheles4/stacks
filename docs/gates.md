# Gates

**The scoreboard.** One row per rule that must never break, mapped to the named
spec that goes red when it does.

Update it in the **same commit** as the gate it describes — the same discipline
[`progress.md`](./progress.md) follows, and for the same reason.

---

## Why this file exists

Every rule below was already written down, in [`CLAUDE.md`](../CLAUDE.md) or the
Decision Log. A pre-publication review in July 2026 found that six of them had
quietly stopped being true, and nothing went red:

| Documented claim | Reality when checked |
| --- | --- |
| Decision Log: "only the basename of a `cover:` value is ever used … Tested" | true in `publish.ts`, false in `enrich.ts` |
| progress.md: audiobook covers carry their true aspect | true under `--public`, false under `pnpm dev` |
| `gate:public` certifies the build carries nothing private | greps text *contents*; never looks at filenames |
| CLAUDE.md: "Unset means the default order" | unreachable after one `stacks order --renumber` |
| Working rules: a Decision Log entry in the same commit | ~8 decisions unlogged across 18 commits |
| progress.md: "Ten commits of work" | 18, two of them credited from before the tag |

A rule nothing can fail on is a comment. The point of a row here is that it can
go **red**, and that it has been *observed* going red at least once — the same
standard the Phase 0 gate hardening set: *"A gate never observed failing is not
yet a gate."*

## Status key

| | |
| --- | --- |
| ✅ | gated, and proven red-capable |
| 🔴 | gate written, currently failing on a real defect |
| ⬜ | no gate yet |

## Invariants → gates

| Row | Rule | Source | Gate | Status |
| --- | --- | --- | --- | --- |
| **G1** | All vault access goes through the adapter | invariant 4 | `gates/adapter-boundary.test.ts` — 13-entry allowlist, each justified, each reverse-asserted | ✅ |
| **G2** | Note bodies are private; a public build is coherent | invariant 2 | `gates/public-build.test.ts` — four assertions, see below | ✅ |
| **G3** | Never crash on a bad note | invariant 3 | `gates/bad-note.test.ts` — 9 hostile inputs, each with a stated expected kind | ✅ |
| **G4** | Hand-edited notes are first-class | invariant 5 | `gates/hand-edited-notes.test.ts` | ✅ |
| **G5** | The vault is the source of truth | invariant 1 | `gates/repo-hygiene.test.ts` — `library.json` untracked and gitignored | ✅ |
| **G13** | No third-party material is committed, ever | `fixtures/README.md`, `plan.md` §1 | `gates/repo-hygiene.test.ts` — no tracked binary outside the generated fixture covers | ✅ |
| **G14** | The documented commands are the commands that exist | CLAUDE.md "Commands" | `gates/commands.test.ts` — CLI subcommands and pnpm scripts, both directions | ✅ |

## Contract seams → gates

A seam is a correspondence between two artifacts that nothing verifies. Red
means the two have drifted.

| Row | Seam | Failure mode | Gate | Status |
| --- | --- | --- | --- | --- |
| **G6** | site → `@stacks/core` | a *value* import drags `node:fs` and sharp into the browser bundle and **the shelf silently never boots** | `gates/site-core-imports.test.ts` | ✅ |
| **G7** | logic in `.astro` | `.astro` files are not typechecked (`astro check` cannot run under TS 7), so nothing else can catch this | `gates/astro-no-logic.test.ts` | ✅ |
| **G8** | frontmatter contract ↔ parser ↔ CLAUDE.md | a key the parser accepts but the contract never documents | `gates/frontmatter-contract.test.ts` | ✅ |
| **G9** | `.env.example` ↔ `process.env` | a variable the code needs and no one knows to set | `gates/env-contract.test.ts` | ✅ |

**G8 observed red** on `shelf_order`, which the parser read and the prose
described but the documented enumeration never listed. **G9 observed red** on
`PORT`, read by `scripts/dev-watch.ts` and documented nowhere. Both fixed in the
commit that added them.

## Defect gates

Four rows that exist because a specific defect got through. Each was written to
fail first.

| Row | Rule | Gate | Status |
| --- | --- | --- | --- |
| **G10** | one cover-path rule, one implementation | `gates/cover-path.test.ts` + `covers/cover-path.test.ts` | ✅ |
| **G11** | the two build modes differ only where documented | `gates/build-modes.test.ts` | ✅ |
| **G12** | `shelf_order` semantics | `gates/shelf-order.test.ts` | ✅ characterized |
| **G15** | what ships fits in a phone's graphics memory | `gates/cover-budget.test.ts` | ✅ |

**G10 observed red** on `enrich.ts`, which shadowed `node:path`'s `basename`
with a `/`-only split, so `..\..\x.png` traversed on Windows — the platform this
project runs on — under a comment saying it could not. The structural half then
found a *third* copy of the rule in `obsidian-adapter.ts`'s wikilink embed.

**G15 is the first defect found by a user rather than by a gate**, and it is the
one that took the site down. The shelf loaded on a phone, drew, and then the tab
died; reloading gave a blank page. Thirty-one covers shipped at whatever size the
provider supplied — 8.4 MB on the wire, which looks entirely reasonable, and
**314 MB once decoded into GPU textures**, which is not. Every one is uploaded
before the first frame.

Nothing in the suite could have seen it. `gate:public` reads the *contents* of
*text* files, so it opens no JPEG; `smoke:render` screenshots a desktop GL
context with gigabytes of headroom, which is exactly why the bug was invisible
here and fatal on a phone. The size of what shipped was measured by nothing.

**G15 is green and the crash is not fixed.** The owner has since reproduced it on
multiple phones in private tabs, with the compressed covers confirmed arriving.
That does not make the gate wrong — shipping 314 MB of texture was a real defect
and this holds it fixed — but it does mean the row protects *a* property of the
build rather than *the* cause of the crash, and reading a green G15 as "phones
are fine" is exactly the mistake this scoreboard exists to prevent. The cause is
still unmeasured; see `docs/progress.md`. G15 also counts only cover files, so
the ~22 MB of per-book spine `CanvasTexture`s is outside every budget here.

**And the bisect has since put it further out of reach.** The shelf loses its
context on the owner's phone with *five* books — 632 triangles, 11 textures — so
the cost that matters is fixed and paid before a book is drawn. No budget over
what ships can see that, because it is a property of the renderer's own setup:
the multisampled framebuffer, the shadow map, the pixel ratio. G15 remains worth
having and remains unable to catch this. **The rule protected by nothing here is
"the shelf survives on a real phone"**, and nothing in this repo can assert it —
`smoke:render` screenshots a desktop GL context with gigabytes of headroom, which
is the same blindness that let G15's defect ship. The current substitute is a
person with a phone and four query parameters, which is honest rather than good.

The probes found it: **the shadow pass**, with antialiasing and pixel ratio 2
both left on. Shadows now default to off. That closes the bug and does not close
the hole — nothing here can still tell whether the shelf survives on a phone, and
the next renderer change could reopen it with every gate green.

The gate asserts two different things, because two different things go wrong: no
single cover exceeds `MAX_COVER_EDGE` (a property of the staging code), and the
whole shelf fits `TEXTURE_BUDGET_BYTES` (a property of the *library*, which grows
as books are added). The second is expected to go red one day on a build that
changed nothing — on a machine, rather than on someone's phone. **When it does,
the answer is to stop uploading every cover at once, not to raise the number.** A
budget that gets raised whenever it fails is a comment.

**G11 was reframed after checking its premise.** A review read the missing
`coverAspect` on a local build as a rendering bug; tracing `dev-watch.ts` shows
the dev flow runs `--public`, so nothing renders a local build and nothing was
broken. What was missing is that the difference between the two modes was never
written down or checked. The gate now pins exactly which keys may differ, and was
observed red by removing one entry from that list.

**G12's design question was resolved by the owner: a book you are reading wins.**
Two documented rules collided — a numbered book beat an unnumbered one before
status was considered, and `--renumber` numbers *every* shelved book, so after
one run "unset means reading first" described a state the vault could no longer
be in and the next book picked up sorted behind all thirty-one. Status now sorts
ahead of `shelf_order`. `--renumber` keeps its purpose: the pins still order
themselves among the finished books.

**G4 was red on arrival**, on a defect nothing had reported. `updateBook`'s
"scalars only" rule recognised a block list (`tags:` then indented `- ` lines)
but not a flow collection on one line, so `author: [Marisol Vane, Tomas Ek]` was
replaced wholesale. Reachable, not theoretical: `asString` returns undefined for
an array, so a two-author note parses as *authorless*, which is exactly what
sends `stacks enrich` to look an author up and overwrite the list — silent data
loss in a hand-edited note, which is the thing invariant 5 exists to prevent.

**G2 was red on the orphan-cover assertion**, which is the one that mattered:
the staging folder was additive, so a real-vault build followed by either gate —
both stage the *fixture* vault into the same folder — left every real cover in
place under a filename slugged from a real book title, while `gate:public`
reported the build clean. It reads text-file contents; these are JPEGs. Proven
by disabling the prune and watching the gate fail. Two further leaks closed with
it: wishlist books shipped in `library.json` though nothing displayed them, and
a `cover:` could be protocol-relative or absolute `http`, so a hand-edited note
could have a visitor's browser fetch from a third party.

**G1, G3, G6 and G7 were green on arrival** and were each proven red-capable by
perturbation: an `fs` import added to `scene.ts`, a stale entry added to the
allowlist, the missing-title branch downgraded to `not-a-book`, an inline
`import { type X }`, and an arrow function in an `.astro` script.

## G2 in full — the public build gate

The existing `gate:public` is a good gate that cannot see three things. It greps
the *contents* of *text* files for three known-bad patterns. So a private value
in a permitted field passes by construction, and a filename is never read at all.

1. **No note bodies.** The existing canary, plus a second one planted as a
   frontmatter *value*. The gate fails if either canary is missing from the
   fixture vault, so it still cannot pass vacuously.
2. **Provenance — no orphan covers.** Every file in `<assets>/covers/` must be
   referenced by a book in the `library.json` shipped beside it. `copyCovers`
   never prunes, so a real-vault build followed by a fixture-vault gate run
   leaves real covers behind, each filename a slug of a real title, while the
   gate reports green. This assertion is also what makes cover filenames safe in
   general: a cover named after a book already in the index reveals nothing. It
   only leaked because it was an orphan.
3. **Only books you own, and only books you meant to publish.** Wishlist books
   were filtered at render but serialised into `library.json` — the page said
   you owned them and the data disagreed. `private: true` books are held back
   too, for a different reason: the shelf is published by a pipeline that never
   asks again, so this is the per-book way to say no. The fixture vault carries
   one of each and the gate asserts that it does, because an assertion about a
   property no fixture exhibits passes however the code behaves.
4. **Same-origin covers.** A `cover:` value may currently be protocol-relative
   or absolute `http`, so a hand-edited or imported note can make a visitor's
   browser hit a third-party host.
5. **The link preview works.** `og:image` and `twitter:image` must be absolute
   against `SITE_URL`. They were relative for the project's whole life, which
   means the OG image — generated, size-checked by this same gate, rendered at
   1200×630 — would have shown nothing to anyone the shelf was sent to. That is
   the brief's success metric, so the gate now builds with an origin and checks
   what a scraper would fetch. Observed red by restoring the relative URL.

## Where cover art may go

| Surface | Rule |
| --- | --- |
| The repo | **Never.** `fixtures/` is wholly invented; see `fixtures/README.md`. |
| A public build | Open Library art, re-hosted, with a courtesy link back. |

Copyright is the lesser constraint here; the providers' own terms are stricter
and are what this follows. Open Library's docs contemplate download and
public-facing display, ask that you not crawl, and appreciate a link back.
Google's API terms bar permanent copies and public display of API content and
require "powered by Google" plus a prominent link per result. Apple conditions
all promotional content on placement beside a store badge linking to a purchase
page — and book covers are not among the content types its terms enumerate at
all. So Google and Apple stay as metadata and lookup fallbacks; their art is
hotlinked or omitted from a public build rather than re-hosted.

**Provenance is now recorded** — `cover_source` in the frontmatter contract,
derived from the URL that was actually downloaded rather than from whichever
provider answered the metadata lookup, because those routinely differ and it is
the bytes whose terms apply.

**The backfill is done and the policy is decided.** `stacks covers --backfill`
recorded provenance on all 31 books in the owner's vault, inferred from image
dimensions rather than re-fetched — Open Library's `-L.jpg` caps at 500px, which
is an unmistakable signature, and the Apple rewrite produces 778–2400px.

The measurement decided the policy: **25 Apple, 6 Open Library, 0 Google.**
Re-hosting Open Library art only would have meant six covers and twenty-five
generated spines — trading away precisely the cover quality Apple was added for.
So a public build ships every cover it has, knowingly, and honours takedown
requests. That is a decision rather than an oversight, and it is written down in
CLAUDE.md's Decision Log with the reasoning and with the alternative that would
satisfy Apple's terms if it ever matters.

What the gate still enforces regardless: no orphans, no wishlist books, and
same-origin covers only.

## CI-only gates

Not every gate can be a spec. These run in the workflow and have no local
equivalent, so they are listed here rather than in the tables above.

| Gate | What it protects | Where |
| --- | --- | --- |
| `pnpm audit --audit-level=high` | a dependency with a known high or critical advisory reaching `main` | `audit` job in `gates.yml` |

The audit is the one gate whose result changes without the code changing: an
advisory published tomorrow turns yesterday's green commit red. That is correct
— a vulnerability is news about code already shipped — but it also means a
transitive dependency nobody can fix will block unrelated work. The escape hatch
is `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`, which takes the GHSA id,
a date and a reason, and appears as a one-line reviewable diff. Same shape as
the allowlists in `gates/`, and the same rule applies: an entry that outlives
its reason is a permission nobody revisits.

Separately, and not a gate: **Dependabot alerts** and **security updates** are
enabled on the repository, so a vulnerable dependency also arrives as a pull
request — which then has to pass everything above like any other change.

## Not gated, deliberately

| | Why |
| --- | --- |
| Coverage percentage | Coverage measures execution, not detection. An AI asked to raise it produces exactly the gap it is asked to close. No ticket should ever exist to raise it. |
| Changed-lines floor (diff-cover) | One contributor; it would be noise. |
| Mutation testing (Stryker) | Genuinely cheap here — 133 tests in ~2s — and the real measure of whether these gates have teeth. Parked only because it is second-order to having CI at all. Revisit once the rows above are green. |
| Article XI-style residency rules | No infrastructure; nothing to pin. |
