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

### Retiring a row

**Mark it, do not delete it.** A rule that stops applying keeps its number and
its row; a deleted row takes with it the fact that the rule was ever considered,
which is the one thing a reader of this file cannot reconstruct. Row numbers are
therefore unique and gapless, and G19 asserts both.

The same goes for a rule that was never gated: ⬜ is an honest answer and an
absent row is not. This file is only useful if it is as easy to find what is
*not* protected as what is.

## Invariants → gates

| Row | Rule | Source | Gate | Status |
| --- | --- | --- | --- | --- |
| **G1** | All vault access goes through the adapter | invariant 4 | `gates/adapter-boundary.test.ts` — an allowlist, each entry justified, each reverse-asserted | ✅ |
| **G2** | Note bodies are private; a public build is coherent | invariant 2 | `gates/public-build.test.ts` — asserted against `publish()`'s output, see below | ✅ |
| **G3** | Never crash on a bad note | invariant 3 | `gates/bad-note.test.ts` — 9 hostile inputs, each with a stated expected kind | ✅ |
| **G4** | Hand-edited notes are first-class | invariant 5 | `gates/hand-edited-notes.test.ts` | ✅ |
| **G5** | The vault is the source of truth | invariant 1 | `gates/repo-hygiene.test.ts` — `library.json` untracked and gitignored | ✅ |
| **G13** | No third-party material is committed, ever | `fixtures/README.md`, `plan.md` §1 | `gates/repo-hygiene.test.ts` — no tracked binary outside two generated directories | ✅ |
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
| **G19** | the constitution ↔ this scoreboard | an invariant nothing scores, a row naming a moved file, a gate nobody recorded | `gates/constitution-scoreboard.test.ts` | ✅ |

**G13 grew a second allowlisted directory when the README got a screenshot**,
and that is the most dangerous kind of entry in this file: a *directory* is a
standing permission, where every other line here names a file. Nothing in a test
can look at a PNG and tell an invented shelf from a real one — and a picture of
a real shelf publishes real titles and real cover art, which is the whole thing
G13 exists to stop.

So the filename is pinned instead: `docs/images/` must track exactly
`shelf.png`. Dropping another picture in beside it goes red, while *replacing*
that one stays possible and shows up in review as a changed binary rather than
as a new file nobody opens. It is a weaker guarantee than the covers row, stated
as such rather than dressed up: the image is safe because
`scripts/make-readme-image.ts` crops what `pnpm smoke:render` renders, and that
gate renders the fixture vault. **Observed red** by copying the screenshot to a
second name.

**G8 observed red** on `shelf_order`, which the parser read and the prose
described but the documented enumeration never listed. **G9 observed red** on
`PORT`, read by `scripts/dev-watch.ts` and documented nowhere. Both fixed in the
commit that added them.

**G19 gates this file, which until it existed was the only unenforced thing in
the repo.** Every gate here *mentioned* `docs/gates.md` — in a comment. Nothing
read it. So the document whose entire job is to record which rules are
mechanically enforced was itself a documented claim resting on somebody
remembering, which is the exact failure the table at the top of this file lists
six instances of.

It asserts in both directions and in three dimensions: every numbered invariant
in `CLAUDE.md` is cited by some row (⬜ is an acceptable and honest answer);
no row cites an invariant that no longer exists; every spec path named here
resolves to a real file; every `gates/*.test.ts` appears somewhere here, so a
gate cannot be written and left unrecorded; every row carries a status drawn
from this file's **own key** rather than a list hardcoded in the test; row
numbers are unique and gapless, so retiring a rule means marking it rather than
deleting the evidence it was ever considered.

**It caught itself on its first run** — `constitution-scoreboard.test.ts`
existed and no row scored it — which is the shortest possible demonstration of
the gap it closes. **Observed red eight ways**: a sixth invariant added with no
row; a row citing `invariant 9`; a renamed spec path; an unscored gate file; a
status symbol outside the key; a duplicated row number; a deleted row leaving a
gap; and the heading `## Invariants` renamed, which throws rather than passing
over an empty set.

Every check passed the day it was written, and that is the point. The cost is
nearly zero now and all of it is paid the first time somebody adds an invariant,
moves a spec, or writes a gate and forgets to come back here.

**And it shipped with three holes of its own, all found by review before merge.**
This is the entry worth reading, because the gate written to stop documented
claims from quietly becoming false was itself making three:

- **A spec path was only checked if it began with `gates/`, `packages/` or
  `scripts/`.** Every other root was invisible — including G10's
  `covers/cover-path.test.ts`, the repo's *one real instance* of a row naming a
  file that does not exist. That row was corrected by hand in the same commit,
  so the gate's first act was to not catch the only thing it was there for. An
  allowlist of directory names was the wrong shape for "does this resolve"; the
  filesystem already answers that, and the check now asks it about any path.
- **A gate counted as scored if its filename appeared anywhere in this file**,
  paragraphs included. Deleting G19's own row and leaving its filename in a
  sentence kept the suite green.
- **A citation counted if the words "invariant N" appeared in any cell of any
  row**, so an incidental mention in an unrelated gate's Failure-mode cell
  satisfied "invariant 6 is protected". This one is verbatim the defect logged
  above for G14 — *a gate that matches prose matches anything* — repeated inside
  a file whose comments congratulate themselves on avoiding it.

All three were **verified by mutation, not by reading**: each was reproduced
green before the fix and red after. The shared lesson is one line — *anchor an
assertion to the cell that carries the claim, not to the row and never to the
document* — and the constitution's article numbers are now held to the same
uniqueness-and-no-gaps rule as these row numbers, which they were not before.

## Defect gates

Rows that exist because a specific defect got through — except **G17, G18 and
G22**, written for defects that had not happened (G17 because the change it
shipped with made one reachable, G18 because somebody outside the project
looked, G22 because a rule was copied a third time), and G20, which exists
because two implementations of one rule had drifted. Each was written to fail
first.

(That sentence read "except the last" until G21 was appended, which would have
made it name the wrong row. It had already been wrong once: "the last" meant G17
when it was written, and G18 and G20 arrived after it. A positional reference to
a table that grows is the same species as the count in the next paragraph.)

(It said "four" for a while after there were five: the kind of thing this file is
otherwise about, counted in prose so nothing could go red. Naming the rows at
least breaks loudly when one is renumbered — which has now happened twice, to the
same row. The cover-preference row was written as G20, became G21 when the
public-build inspector took that number first, and became G22 when the
no-live-network guard took *that* one. Three branches, three sessions, and each
time the next free number was free right up until somebody else merged: what
number a row will carry is not knowable until it lands. Loud is the most a
paragraph can be; nothing here goes red on it.)

| Row | Rule | Gate | Status |
| --- | --- | --- | --- |
| **G10** | one cover-path rule, one implementation | `gates/cover-path.test.ts` + `packages/core/src/covers/cover-path.test.ts` | ✅ |
| **G11** | the two build modes differ only where documented | `gates/build-modes.test.ts` | ✅ |
| **G12** | `shelf_order` semantics | `gates/shelf-order.test.ts` | ✅ characterized |
| **G15** | what ships fits in a phone's graphics memory | `gates/cover-budget.test.ts` | ✅ |
| **G16** | every book stays inside its own case | `pnpm smoke:render` | ✅ |
| **G17** | a deploy publishes `main`, or says why not | `gates/deploy-branch.test.ts` | ✅ |
| **G18** | a provider's bytes are bounded and are an image | `packages/core/src/covers/download.test.ts` | ✅ |
| **G20** | one inspection of the folder about to be published | `gates/public-build-artifact.test.ts` | ✅ |
| **G21** | no test makes a live network call | `gates/no-live-network.ts` + `gates/no-live-network.setup.ts`, specced by `gates/no-live-network.test.ts` | ✅ |
| **G22** | one cover-preference rule, one implementation, right way round | `gates/cover-candidates.test.ts` + `packages/core/src/covers/cache-cover.test.ts` | ✅ |

**G21 is the first row here written for a rule that two files already claimed
was true.** `CLAUDE.md`'s Phase 1 gate says "use cached API fixtures, no live
calls in tests"; `packages/core/src/covers/download.test.ts` opens by stating
"No test makes a live call". Both were prose, and for months both were false —
`packages/core/src/enrich.test.ts` downloaded a real cover from
`covers.openlibrary.org` on every run. That is the table at the top of this file
acquiring a seventh entry, found the way the other six were: by somebody
looking, not by anything going red.

**Nothing could have gone red, because the test passed.** Its assertions never
look at the cover, so offline it filled `isbn` and `pages` and passed, and
online it filled the cover too and passed. The only symptom was ~1.3s against
5ms for its siblings, which reads as an outlier rather than as a network call —
until a loaded CI runner turned it into an intermittent timeout at a quarter of
vitest's 5s cap, which is how it was finally noticed.

The seam is worth naming, because the gate does not close it. The metadata layer
takes an injected `HttpGet` precisely so tests stay off the network, but the
injection stops short of the bytes: `covers/cache-cover.ts`'s `download` reaches
for the global `fetch`. A caller passing a fake `get` still makes a real
request, and `enrich.ts`, `add-book.ts` and `import/index.ts` all reach it.

**Recording the attempt is the whole design, and the throwing is not.** The
obvious guard — replace `fetch` with one that throws — does not work here, and
it does not fail loudly enough to tell you so. `download` wraps its fetch in
`catch { return undefined }`, deliberately, because a missing cover must not
stop a book being logged; so the refusal is swallowed, the cover is dropped, and
every assertion still passes. Measured against the pre-fix `enrich.test.ts`: a
throw-only guard reported **7 passed** in 51ms. It would have removed the
symptom, left the test still calling the network, and made the defect
permanently invisible. So the guard records each attempt and asserts in an
`afterEach`, where no `try/catch` in the code under test can reach it. The throw
stays — it keeps the call off the wire and lands the error near its cause — but
it is not what makes this gate red.

**Observed red** by restoring the pre-fix `enrich.test.ts`: one test fails,
naming the URL and the stub that fixes it, and only that test, because the
record is cleared per test rather than accumulating into every test after it.

**And its own spec was vacuous first, found by mutation rather than by reading.**
The guard and its installation were one file, so the spec — which must import
the module to compare against `guardedFetch` — installed the guard by importing
it. Deleting `setupFiles` from `vitest.config.ts` left all seven checks green:
the assertion that the gate was wired up was satisfied by the act of asking.
Splitting installation into `no-live-network.setup.ts` makes
`globalThis.fetch === guardedFetch` true only if the setup file ran; the same
mutation now fails four of seven, and one of the four spends 1.2s fetching a
real cover from `archive.org`, which is the absence demonstrating itself. This
is the same lesson as G19's three holes — *anchor the assertion to the thing
that carries the claim* — arrived at from the opposite direction, and it is the
reason a gate is not finished when it passes.

**What it covers is `fetch`, in this process** — every request this repo makes,
since nothing here uses `node:http` directly. Two things sit outside it, stated
rather than implied: a test that shells out to a script making its own requests
(`gates/deploy-branch.test.ts` really does spawn one, driven onto paths that
upload nothing, but that is the script's own guard), and any future code that
reaches the network by some other API. The escape hatch for a test that
genuinely needs a response is `vi.stubGlobal`, named in the failure message
rather than only here, since the message is where somebody will meet this rule.

**G17 is the first row here written for a defect that has not happened**, because
the change that would cause it is the change that shipped with it. Until
worktrees there was one checkout, so "am I on the right branch" answered itself
by standing somewhere. Now there can be four, on four branches, and all of them
read the same `.env` — so all of them hold SITE_URL and can publish to the live
domain with a command that looks identical from every one.

**Both directions are asserted unconditionally**, which took a second attempt.
The first version read the branch the suite happened to be on and returned
early when it was `main` — so CI, which runs on `pull_request` and is therefore
never on `main`, would only ever exercise the refusal, while the owner, who
mostly is, would run a gate that quietly asserted nothing. Strongest where it
never runs, inert where it matters. Now `GIT_DIR` points the child's git at a
scratch repository sitting on a known branch: the script is real, the guard is
real, git really resolves the branch, and only *which checkout is being asked
about* is controlled. One test deliberately omits that redirection, so
something still proves the guard is wired to the actual repository.

Two mutations, because a positive check cannot detect a missing guard on its
own. Deleting the guard fails four of seven. Inverting the comparison — refuse
`main`, allow everything else — fails six, including "lets main through", which
is what proves that one is not vacuous. Among the casualties either way is the
check that `--any`, `--branch`, `--anybranch` and `--any_branch` do *not* work
as the override: an escape hatch you can stumble into is not one.

**G18 is the second row written for a defect that has not happened**, and the
first written because somebody outside the project looked. A pre-publication
review — an external assistant asked whether the repo was ready to go public —
named the cover download as the clearest remaining technical gap. It was right,
and it was reading [`SECURITY.md`](../SECURITY.md), which had disclosed the same
thing by name for weeks. Disclosing a gap is not the same as gating it, and a
threat model that lists a hole indefinitely is a comment, exactly like an
ungated rule.

`download` fetched a URL that came out of a third-party API response and handed
the bytes to `sharp`, a native decoder, with no timeout, no size limit, and no
check that they were an image at all — `arrayBuffer()` buffers whatever arrives,
however much of it arrives. Now: a 15s abort, a 20 MB cap counted **as the body
streams** rather than believed from `Content-Length`, and a magic-byte allowlist
of JPEG, PNG and WebP. The allowlist matters more than the cap. `sharp` also
decodes SVG, which is not an image but a document with its own parser and its
own rules about external references, and nothing here has any reason to hand a
provider's response to that.

**Observed red at six of fourteen** by restoring the old four-line `download`
and re-running. The streaming case is the one to note: it did not merely fail,
it ran for **31 seconds** first, consuming a response that advertised 4 KB and
never ended. That is the defect demonstrating itself — the cap is a limit only
because something counts, and `Content-Length` is a claim like any other.

One test failed on arrival for the opposite reason, and it was the instrument
rather than the code: a default `ReadableStream` pulls once the moment it is
constructed, so "the body was never read" was measuring the test's own
scaffolding. At `highWaterMark: 0` nothing is pulled until something reads.

**Every case here stubs `fetch`, so the checks were also run once against the
live providers** — which is the failure mode a gate made of stubs cannot see. A
tightened `Content-Type` check refuses covers *silently*, because `cacheCover`
treats every failure as "no cover" by design, so a provider answering
`application/octet-stream` would have meant books quietly logged bare with
nothing going red. All three answer properly: Open Library `image/jpeg`
(40 KB, `ffd8ffe0`), Google Books `image/png` (`89504e47` — note the endpoint
serves PNG whatever the URL suggests), Apple `image/jpeg` (171 KB, `ffd8ffe0`).
Largest is 0.8% of the cap. This is a measurement with a shelf life: it says
what the three providers did on 1 August 2026, not what they must do.

**G22 is the third row written for a defect that has not happened**, and the one
whose first draft was wrong in a way worth recording, because the mistake is the
one this file exists to catch.

Which cover URL to try first — `coverUrlLarge` before `coverUrl` — was written
out three times, in `add-book.ts`, `enrich.ts` and the importer. All three
agreed, which is exactly where G10 started: one rule, two implementations,
agreeing until one didn't. The difference is what failure looks like. G10's
second copy crashed a path on Windows; this one is **silent**. Reverse the pair
and a cover still downloads, `cover_source` is still correct for the bytes kept,
and the shelf is quietly worse.

So the row was written structural: `coverUrlLarge` may be named only inside
`packages/core/src/metadata/`, where the field is produced and where
`coverUrls()` ranks it, and every module calling `cacheCover` must get its list
from there. **Observed red** by adding a fourth module naming the pair, and again
in reverse by the `routes every cover download` assertion, which is what stops
the first half being satisfied by a caller that simply stops downloading covers.
Both directions matter for the reason G17 records: a positive check cannot detect
a missing one.

**And that gated the wrong half.** The row claimed "one cover-preference rule,
one implementation" while asserting only the second clause. Reversing
`coverUrls` — the exact defect described two paragraphs up — left all 290 tests
green, because no structural check can see which way round two elements of a
tuple are. The prose had even argued the point away: *nothing about it is wrong
except the choice, so nothing but a structural check can catch it.* That was true
of three scattered copies and false the moment they became one function.
Consolidating the rule is what made it cheaply assertable, and the draft carried
over a justification from before the consolidation it was shipping with.

Caught by review, then confirmed by mutation rather than by reading. The
preference is now pinned in `covers/cache-cover.test.ts`, asserted **through the
downloader** — that the large URL is the one actually fetched first — rather than
on the tuple, because what is worth protecting is which bytes reach the shelf.
Reversing `coverUrls` now fails one test, by name.

The lesson generalises past this row: **a structural gate proves there is one
implementation and says nothing about whether it is right.** Any row here
promising "one rule, one implementation" needs the first clause asserted
somewhere too. G10's does — `covers/cover-path.test.ts` is exactly that half,
which is why that row names two files. G22's row named two files while one of
them tested something adjacent.

That adjacent thing was worth having anyway, and is the rest of
`cache-cover.test.ts`. `blank.test.ts` and `download.test.ts` each proved one
step of `cacheCover` in isolation; nothing proved the *order* they run in — which
candidate wins, what happens when none is cover-shaped, and which URL the
recorded `source` is taken from. That was exercised only incidentally, through
`add-book.test.ts` and `enrich.test.ts`, where a change in preference would still
leave a cover on disk and every assertion green.

Three further weaknesses in the first draft, from the same review, each an
instance of a failure mode already logged in this file:

- the exemption list for the caller check had **no stale-entry assertion**, which
  ADR-0022 requires and G10 has. A file on it was exempt permanently, so
  `index.ts` growing a real `cacheCover` call would never have been noticed. The
  first fix for this did not work either, and the reason is worth keeping: it
  asked whether each exempt file still *defines or re-exports* `cacheCover`,
  which `index.ts` does forever — so a file could re-export it **and** call it
  and still sail through both checks, which is precisely the case the exemption
  exists to make impossible. The mutation that found it is the one the first
  round did not run: not "a file that stopped needing its exemption" but "a file
  that still qualifies for it and calls anyway". The check now strips the one
  `cacheCover(` that is a definition and asserts no call site remains;
- the `coverUrlLarge` sweep had **nothing anchoring the symbol**. `expectFound`
  guarded the file walk, not the string — so renaming the field would have left
  the assertion sweeping for something that no longer existed and passing over an
  empty set;
- both halves matched **raw file text, comments included**. A caller that
  hand-ordered its candidates needed only to mention `coverUrls()` in a comment
  to look compliant. Verbatim the G14 and G19 defect — *a gate that matches prose
  matches anything* — for the third time, in a file whose commentary on the first
  two is directly above. Blanking comments then reintroduced the same shape one
  level down: `//` inside `https://covers.openlibrary.org/…` is not a comment,
  and treating it as one would have hidden real code from the sweep. The
  stripper skips `//` preceded by a colon and says in its own docstring that it
  is not a parser and does not know a `//` inside a string literal from one
  starting a comment.

**What this row does not gate**: that `cover`, `cover_source` and `spine_color`
are written together. That rule — *a note's `cover_source` describes the bytes of
that note's `cover`* — has four writers, and one of them, `stacks covers
--backfill`, never downloads anything at all: it infers provenance from the shape
of a cover already on disk and upholds the rule by a different route. So no
structural check can demand the three appear together, and `covers/cover-keys.ts`
makes the pairing unconstructible on the *creation* path only. Stated here
because that is a narrower guarantee than the section heading suggests.

**G16 observed red at 0.0203** — about 0.5cm at shelf scale — by deleting the
clearance and re-running. It exists because the owner found the same defect twice
by eye, on a phone: a leaning book's bottom corner driven into the face-out book
beside it, and a row's first book driven into the case's own side.

Nothing in the layout could have caught it. The cursor advances by a book's
*thickness*, and a book rotated about its centre is wider than that — so
re-checking the arithmetic would only have repeated its assumption. G16 measures
`Box3.setFromObject` against the case's real inner faces instead, which is the
same argument that put `gate:public` on the built folder rather than on
`library.json`: measure the artifact, not the code that produced it.

Its tolerance is 0.005 and the residual is 0.0012, which is not slop — it is
exactly `SKIN`, the hair by which a book's printed cover and spine float above
their boards. Named in the gate, so the next person does not read it as a
coincidence.

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
both left on — and then found that *every* real-time configuration fails, down to
one where nothing is drawn into the map. The shelf now paints its shadows instead
of rasterising them, which removes the dependency rather than tuning it.

Note what none of that was: a gate. Five rounds of diagnosis happened on a phone,
by hand, because `smoke:render` screenshots a desktop GL context with gigabytes of
headroom and cannot fail the way a phone does. **"The shelf survives on real
hardware" is still protected by nothing**, and the substitute is still a person
with a device — now with `?debug`, `?books=N` and the renderer switches to make
that person's time cheap, which is the most this repo can honestly offer.

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

**G20 exists because two implementations of one rule drifted, and the drift ran
the wrong way.** "Is this folder safe to publish?" had been answered twice
against the same `dist/` — once by `gate:public` and once by `deploy:site`'s
pre-flight — and neither was a superset of the other. The gate checked that
`_headers` makes `/covers/*` revalidate; the deploy checked only that the file
existed, which is the precise gap that let the fix for the mobile crash reach an
origin nobody could see. The gate checked that every `og:image` *and*
`twitter:image` is absolute; the deploy checked for one substring, so a page
having lost its `og:image` entirely would have passed. **The weaker half was on
the only one of the two that publishes anything.** Neither script knew the other
existed, which is why nothing went red for however long that was true.

`scripts/lib/public-build.ts` is now the one implementation and both are
callers, which changes nothing about the deliberate separation: the gates still
stage fixtures and still run first, the real build still runs last, and
`gate:public` still says nothing about the folder about to go on the internet.
Two calls, not two implementations.

**It is the first gate here cheap enough to observe every rule go red.** The
module builds nothing — it is handed a directory — so the gate assembles a
synthetic `dist/` in a temp folder, plants one defect, and asserts that defect
fires that rule *and no other*. No build, no network, milliseconds. A final
assertion holds the rule list to the defects: a twelfth rule with nothing that
produces it fails the build, so this gate cannot quietly come to cover ten of
all but one. That is the thing the seven text-matching gates here cannot do.

Mutations, each observed. Restoring the deploy's weak `_headers` check fails
exactly one test — the one that names that divergence. Adding a rule with no
planted defect fails the completeness assertion by name. Making the reporter a
no-op fails all but the two clean-baseline tests, which is what proves the
baseline is not itself doing the work.

**And then review found the gate was watching the wrong shape, which is the
entry worth reading here.** The `_headers` rule had been carried over verbatim
as *find `/covers/*`, then look ahead for a `Cache-Control` with `max-age=0`* —
a lazy scan that does not stop at the end of a block. The real `_headers` has an
`/og.png` block directly after `/covers/*` carrying exactly that directive, so
deleting the covers block's own `Cache-Control` line left the rule green.
G20 had observed it red, but against a `_headers` containing nothing *but* the
covers block: a shape this repo has never had, and the one shape in which the
bug is invisible. **A defect the gate plants must be a defect the file could
actually have.** The file is now parsed into blocks and the covers block is read
by name; planting the realistic shape against the old scan reports *no problems
at all*, which is how it was confirmed.

Two more the same review found, both the same species — one rule that two
implementations had each kept half of, and neither half noticed:

- **The share image.** `gate:public` required the URL absolute against the
  origin; `deploy:site` required the literal `<origin>/og.png`. The merged rule
  had kept only the first, so `<origin>/hero.png` passed — a file no build ever
  wrote. It is now the whole URL, and it is *two* rules rather than one, because
  `--check-only` has to excuse a SITE_URL mismatch without also excusing a page
  that lost its share tag altogether.
- **The canary.** Owned by the module now, where it was an independent literal
  in the gate script and in G2 — a canary that drifts between where it is
  planted and where it is looked for leaves both halves passing.

**One check deliberately stayed in `deploy.ts`**: that no fixture book is in the
build. `gate:public` requires those titles *present* in the folder it inspects
and the deploy requires them *absent* — the same strings with opposite verdicts
— so a module that cannot know which vault produced a folder is the wrong owner.
It also asserts build *ordering* rather than publishability.

That check was two hardcoded titles, and **one of the two had never matched
anything**: `Compilers for the Impatient` carries a subtitle in its frontmatter,
so only `The Tidal Engine` was ever really compared. It now reads the fixture
vault through `ObsidianAdapter` — the same parser the build uses, which is both
invariant 4 and the only way to get it right, since a note's filename is not its
title for five of the twelve fixtures. An empty list refuses the deploy outright
rather than passing over nothing.

**G1, G3, G6 and G7 were green on arrival** and were each proven red-capable by
perturbation: an `fs` import added to `scene.ts`, a stale entry added to the
allowlist, the missing-title branch downgraded to `not-a-book`, an inline
`import { type X }`, and an arrow function in an `.astro` script.

## G2 in full — the public build gate

The five below are what G2 added to `gate:public`. Since G20 they are no longer
*in* `gate:public`: rules 2–5 apply to any built folder, so they live in
`scripts/lib/public-build.ts` and `deploy:site` applies the same ones to the
real build. What stays in the script is the half that is about the *source* —
planting the canary in a fixture vault and refusing to run without it — plus
building from it. G2 itself is unchanged and still asserts against `publish()`'s
output, which is a different claim: G2 proves the filter *works*, the artifact
rules prove it *ran*.

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
[`docs/adr/`](./adr/) with the reasoning and with the alternative
that would satisfy Apple's terms if it ever matters.

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

## What building these gates taught

Carried over from the Decision Log when the decisions themselves moved to
[`docs/adr/`](./adr/). These are not decisions — they are what went wrong while
writing the things above, which is the part most likely to go wrong again.

- **2026-07-31** — **The render gate builds and serves `dist/` itself** rather than driving the dev server. Waiting on a subprocess to announce itself on stdout is a race that hangs instead of failing, and a gate that can hang is worse than one that can fail. It also means the gate screenshots what actually ships.

- **2026-07-31** — The gate's pixel probe waits two `requestAnimationFrame`s before `readPixels`. Without it the drawing buffer has already been cleared, and the gate reports a blank shelf that is in fact rendering correctly — it did exactly that once.

- **2026-08-01** — **G14 had a false negative, found by the next command added.** It searched CLAUDE.md's Commands section for `\bname\b`, so a new `covers` command passed as documented because `status`'s description reads "covers still missing". Now anchored to the start of a line, where the block actually puts a command name. A gate that matches prose matches anything — and this one was written *in* the phase about documented claims quietly ceasing to be true.

- **2026-08-01** — **G1 caught both halves of this change without being asked**, which is what the reverse-assert is for: `scripts/worktree.ts` arrived importing `fs` with no allowlist entry, and `scripts/dev-watch.ts` stopped importing it, making its standing exception spent. One line added, one removed. A list that only grew would have kept the second.

- **2026-08-01** — **G17's first version was strongest where it never ran and inert where it mattered.** It read whichever branch the suite happened to be on and returned early when that was `main` — so CI, which runs on `pull_request` and is therefore never on `main`, exercised only the refusal, while the owner, who mostly is on `main`, ran a gate that quietly asserted nothing. A silent `return` that reads as coverage is the vacuous-green trap `expectFound` exists for, written into a gate in the phase about exactly that. Fixed with `GIT_DIR`, which points the child's git at a scratch repository on a known branch: the script is real, the guard is real, git really resolves the branch, and the only thing controlled is *which checkout is being asked about*. One test omits the redirection on purpose, so something still proves the guard is wired to the real repository. Two mutations rather than one, because a positive check cannot detect a missing guard: deleting the guard fails four of seven, inverting it fails six — including "lets main through", which is what makes that direction non-vacuous.

- **2026-08-01** — **The `.env` probe file is named per process, because the test writes into the *main* checkout.** That is the point of the fallback and it makes the file a shared resource the moment two worktrees run `pnpm test` at once: one suite's `afterEach` deletes the file the other is mid-way through reading, and it presents as a flaky assertion rather than as a collision. Exactly the render gate's fixed-port defect one layer down, and worth stating twice because the first instance was found by reasoning and this one by being asked the same question again.

- **2026-08-01** — **README's status line was wrong for months and nothing could go red.** It said "Phase 0 (scaffold). The shelf renders, and it is empty" while all five phases were tagged, the tool ran against a real vault and the site was deployed — the same defect class G14 gates one file over, and the first thing a visitor would have read. `docs/progress.md`'s "Current state" table was stale the same way, saying the last green gate was G15 and that the mobile crash was unfixed, fifty lines above a narrative recording it closed; that one is worse, because CLAUDE.md sends every reader there first. **G14 covers CLAUDE.md's command lists, not README's**, and README's table had drifted to missing four scripts and five CLI commands. Filled in and pointed at the gated list rather than gated itself — a second gated copy of the same lists is a thing to keep in sync, and the owner should decide whether that trade is worth it.

- **2026-08-01** — **The README fix introduced the defect the README fix was about, and it was caught in review.** The new status section claimed "269 tests across 34 files" — a hardcoded count, in the one file with no gate, inside the commit whose other half is about documented claims quietly ceasing to be true. The next test anyone adds makes it false and nothing goes red. Identical in shape to the "It said 'four' for a while after there were five" note already sitting in `gates.md`. Removed rather than gated: pointing at the scoreboard says the same thing and cannot rot. Worth logging because the mistake was made *while writing about the mistake*, which is the strongest argument in this repo for why review is not optional and why numbers belong in gate output rather than in prose.

- **2026-08-02** — **G1 caught the new script before any of this was committed**, which is the second time the reverse-assert has earned its keep on a change nobody thought was about the adapter: `scripts/make-readme-image.ts` arrived importing `node:fs/promises` with no allowlist entry, exactly as `scripts/worktree.ts` did. One line added, with the justification that matters — its only input is `artifacts/shelf.png` and it never learns what a book is.
