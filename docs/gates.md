# Gates

**The scoreboard.** One row per rule that must never break, mapped to the named
spec that goes red when it does.

Update it in the **same commit** as the gate it describes — the same discipline
[`progress.md`](./progress.md) follows, and for the same reason.

---

## Why this file exists

Every rule below was already written down, in [`AGENTS.md`](../AGENTS.md) or the
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

### Every row has a number and a name

`G19` is a stable identifier and tells you nothing. The **Name** column carries a
kebab-case slug — `constitution-scoreboard`, `no-live-network` — and citations
elsewhere spell both: *"See docs/gates.md, row G19 (constitution-scoreboard)."*
Same convention as [`docs/adr/`](adr/), where a record is a number *and* a name
for the same reason.

**The number stays because it is the retirement mechanism.** A rule that stops
applying keeps its number and its row, and the numbering is gapless so the hole
is visible — see below. A name cannot encode absence: a deleted name leaves
nothing behind, which is the one thing a reader of this file cannot reconstruct.

**The slug is anchored, not a third name to maintain.** Where a row names
exactly one `gates/*.test.ts` and no other row names that same spec, the slug
**must equal** the file's stem, so moving a spec forces the name to move with
it. That clause covers 23 of the 29 rows and self-exempts the rest without an
allowlist: G5 (`vault-is-truth`) and G13 (`no-third-party-material`) share
`repo-hygiene.test.ts`, so neither uniquely claims it, and G16, G18, G25 and G28
name no `gates/` spec at all. Those six declare their slug.

G19 asserts all of it — every row has a well-formed slug, no two rows share one,
a derivable slug matches its stem, and every citation in the repo names a row by
its **current** slug. That last one is the point: a name written down in twenty
files and gated in none is exactly the second copy
[ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) is about.

Bare `G8` mentions in ordinary prose stay bare. This file is full of them and
forcing a slug onto each would make it worse to read while protecting nothing —
the citation idiom is what a reader actually follows.

### Retiring a row

**Mark it, do not delete it.** A rule that stops applying keeps its number and
its row; a deleted row takes with it the fact that the rule was ever considered,
which is the one thing a reader of this file cannot reconstruct. Row numbers are
therefore unique and gapless, and G19 asserts both.

The same goes for a rule that was never gated: ⬜ is an honest answer and an
absent row is not. This file is only useful if it is as easy to find what is
*not* protected as what is.

## Invariants → gates

| Row | Name | Rule | Source | Gate | Status |
| --- | --- | --- | --- | --- | --- |
| **G1** | `adapter-boundary` | All vault access goes through the adapter | invariant 4 | `gates/adapter-boundary.test.ts` — an allowlist, each entry justified, each reverse-asserted | ✅ |
| **G2** | `public-build` | Note bodies are private; a public build is coherent | invariant 2 | `gates/public-build.test.ts` — asserted against `publish()`'s output, see below | ✅ |
| **G3** | `bad-note` | Never crash on a bad note | invariant 3 | `gates/bad-note.test.ts` — 9 hostile inputs, each with a stated expected kind | ✅ |
| **G4** | `hand-edited-notes` | Hand-edited notes are first-class | invariant 5 | `gates/hand-edited-notes.test.ts` | ✅ |
| **G5** | `vault-is-truth` | The vault is the source of truth | invariant 1 | `gates/repo-hygiene.test.ts` — `library.json` untracked and gitignored | ✅ |
| **G13** | `no-third-party-material` | No third-party material is committed, ever | `fixtures/README.md`, `plan.md` §1 | `gates/repo-hygiene.test.ts` — no tracked binary outside two generated directories and four named brand files | ✅ |
| **G14** | `commands` | The documented commands are the commands that exist | AGENTS.md "Commands" | `gates/commands.test.ts` — CLI subcommands and pnpm scripts, both directions | ✅ |

## Contract seams → gates

A seam is a correspondence between two artifacts that nothing verifies. Red
means the two have drifted.

| Row | Name | Seam | Failure mode | Gate | Status |
| --- | --- | --- | --- | --- | --- |
| **G6** | `site-core-imports` | site → `@stacks/core` | a *value* import drags `node:fs` and sharp into the browser bundle and **the shelf silently never boots** | `gates/site-core-imports.test.ts` | ✅ |
| **G7** | `astro-no-logic` | logic in `.astro` | `.astro` files are not typechecked (`astro check` cannot run under TS 7), so nothing else can catch this | `gates/astro-no-logic.test.ts` | ✅ |
| **G8** | `frontmatter-contract` | frontmatter contract ↔ parser ↔ AGENTS.md | a key the parser accepts but the contract never documents | `gates/frontmatter-contract.test.ts` | ✅ |
| **G9** | `env-contract` | `.env.example` ↔ `process.env` | a variable the code needs and no one knows to set | `gates/env-contract.test.ts` | ✅ |
| **G19** | `constitution-scoreboard` | the constitution ↔ this scoreboard | an invariant nothing scores, a row naming a moved file, a gate nobody recorded | `gates/constitution-scoreboard.test.ts` | ✅ |
| **G29** | `doc-links` | a document's links ↔ the file tree | a moved or renamed file leaves every route to it a dead end, and nothing says so | `gates/doc-links.test.ts` | ✅ |
| **G30** | `library-seam` | `BookRecord` ↔ `library.json`, both ways | a field the vault holds and no `keyIfPresent` line ships: the note has it, the shelf never sees it, every other test passes | `gates/library-seam.test.ts` | ✅ |
| **G31** | `merge-precedence` | the precedence table ↔ the merge | a provider order the code implements and no document names, or the reverse — and the `; ` subjects separator, which two packages hold | `gates/merge-precedence.test.ts` | ✅ |
| **G32** | `absent-only` | a key a note already carries is never rewritten | a merge change quietly replacing values on books that were correct — the characteristic failure of this effort, and structurally prevented rather than detected | `gates/absent-only.test.ts` | ✅ |
| **G33** | `enrich-idempotence` | running `enrich` twice changes nothing the second time | the only gate that reaches the `## About` body insert, since a body section is not a `FILLABLE` key and the absent-only gate cannot see it | `gates/enrich-idempotence.test.ts` | ✅ |
| **G34** | `enrich-convergence` | a book a provider failed on is filled by the next run | the pacing answer for iTunes' ~20/min is "run it twice", and it rests entirely on an `http.ts` property nothing checked: a success is cached forever, a failure is never cached at all | `gates/enrich-convergence.test.ts` | ✅ |
| **G35** | `enhanced-card` | the card a browser builds, at both viewports | *"the card opened"* was the whole assertion, and it stays true through a card with no reading line, links with no accessible name, an announcer that never changes, a sheet that dismisses on every short drag, and one Escape that closes the enlarged cover **and** the card under it | `scripts/smoke-render.ts` — `cardFailures`, `checkCoverViewer` and `checkSheet`, against `docs/spec/enhanced-card.md` §11 | ✅ |
| **G36** | `trend-layer` | the series CI writes ↔ the `## Trends` table | a number nobody was told to read, a row promising a line that will never be drawn, or a trend named after a gate slug — which G19 structurally cannot see, because `slugByRow()` reads three hardcoded tables and the Trends table is a fourth | `gates/trend-layer.test.ts` — asserted against the rendered OpenMetrics text, not against the declaration list | ✅ |
| **G37** | `agents-import` | the rules ↔ the file Claude Code opens by name | `AGENTS.md` carries the rules and Claude Code reads only `CLAUDE.md`, so the stub's `@AGENTS.md` import is the whole mechanism — and a rule pasted into the stub is the second constitution [ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) refused, per [ADR-0056](adr/0056-the-constitution-is-agents-md.md) | `gates/agents-import.test.ts` — the import line is also the control the absences rest on | ✅ |

**G13 now allows one file this project did not make**: Google's *powered by
Google* graphic, which the API terms require displayed and forbid altering — so
unlike the card's three provider marks, which are redrawn
([ADR-0050](adr/0050-provider-marks-are-redrawn-monotone.md)), it cannot be
redrawn or replaced with text. It is named as a **file**, for the reason the
paragraph below gives about directories.

⚠️ It also caught something worth recording about how this row is *run*: a local
`pnpm test` before `git add` passes over an untracked binary, because G13 reads
what git tracks. The commit that added the PNG claimed a green suite truthfully
and CI went red on the same code seconds later. Stage, then run.

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

**The brand art went in as four filenames, not a directory**, and the reason is
the same rule read the other way round. Its provenance is the cleanest this list
holds — the mark and the share card were drawn for this app, so there is no
third party anywhere near them, and that is exactly the claim an entry here is
*for*. But they live in `packages/site/public/`, which is where
`stacks build --public` stages a real vault's covers. A prefix entry there would
have permitted the thing G13 exists to stop, in the one directory where a real
cover is already on disk.

The row checks the other direction too: an allowlisted file that stops being
tracked goes red, because the page links all four and nothing else here would
notice a 404 on every visit. `og.png` is why that half is worth having.
`publish()` wrote one on every build until the designed card replaced it, so the
way this breaks is a build quietly rendering over the committed art, or somebody
deleting it as stale output — and a 1200×630 PNG at the expected path passes the
size check either way. G5 pins the same seam from the other side, asserting that
no ignore rule names `og.png` while everything else `publish()` stages is
ignored.

**Observed red three ways**: an unlisted PNG copied in beside the icons;
`git rm --cached` on `og.png`; and the old `packages/site/public/og.png` line
restored to `.gitignore`. The third is why that assertion reads the ignore
*rule* rather than asking whether the file is ignored. `git check-ignore`
consults the index and never reports a tracked file as ignored — correct, since
tracking wins — so the obvious spelling passed green with the rule sitting right
there in `.gitignore`, which is the exact state it exists to catch. `--no-index`
reads the rules instead of the outcome.

**G8 observed red** on `shelf_order`, which the parser read and the prose
described but the documented enumeration never listed. **G9 observed red** on
`PORT`, read by `scripts/dev-watch.ts` and documented nowhere. Both fixed in the
commit that added them.

**The Name column arrived after the positional read had already been wrong
once.** `invariantSourceCells` reached for `tableCells(line)[2]` — fine while
the Invariants table had Source third, and quietly wrong the moment a column was
inserted before it, because `[2]` on a shifted table returns a real string from
the *Gate* cell rather than nothing. The citation check would then have asked
the wrong column whether it mentions an invariant and kept passing. Columns are
now found by reading the header row, and a missing header **throws naming the
column** rather than returning `-1` and reporting "no invariant is cited" — the
`markdownSection` argument one level further in. **Observed red both ways**, and
the message names `Source` and `Name` respectively rather than the symptom.

**G19 gates this file, which until it existed was the only unenforced thing in
the repo.** Every gate here *mentioned* `docs/gates.md` — in a comment. Nothing
read it. So the document whose entire job is to record which rules are
mechanically enforced was itself a documented claim resting on somebody
remembering, which is the exact failure the table at the top of this file lists
six instances of.

It asserts in both directions and in three dimensions: every numbered invariant
in `AGENTS.md` is cited by some row (⬜ is an acceptable and honest answer);
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

**G29 exists because the documentation is a graph and nothing checked its
edges.** `AGENTS.md` routes a cold session to five files by link, every ADR
links back here, and this file links out to the specs it scores — several
hundred local links across the tracked Markdown, a corpus that has since roughly
tripled. (This sentence carried the two exact figures until they were both
false, which is the same defect the paragraphs below log against this row twice
over. The count lives in the gate's vacuity floor, where it can go red.) Until
G29, the *only* link-shaped claim in the repo that could go red was G19's check
that spec paths named in scoreboard rows resolve. Everything else was a route
that worked because nobody had moved anything yet.

It was written for the split of `docs/progress.md` into `docs/log/`, which is
precisely the change that breaks routes: 17 files' worth of narrative leaving
one document. Writing the gate **first**, running it green against the un-split
tree, and only then splitting is what makes the split reviewable — anything red
afterwards is something the split broke, rather than something that may have
been broken for months.

**No network, by construction.** `http(s):` and `mailto:` targets are skipped
rather than fetched. Fetching would violate G21 and be flaky, and the failure
this gate is for — a moved file — is entirely local. An external link checker is
a different tool with a different failure mode and does not belong in `pnpm test`.

**Observed red both ways, and one of them found a real design fault.** The
file-existence half went red on its own accord: `docs/research/splitting-the-long-docs.md`
describes the extraction this gate performs as `` `](./x.md)` ``, in inline
code, and the first version read that as a route to a file that does not exist.
Correct by the gate's own rules and wrong in substance — prose *quoting* a path
is not a link to it, and a gate that cannot tell the difference makes
documenting the gate an error. Fenced blocks were already blanked; inline spans
now are too. The fragment half went red on a one-character typo planted in
`docs/plan.md`'s link to `agents/issue-tracker.md#wayfinding-operations`, then
reverted.

**What the blanking costs was measured, not assumed.** Blanking inline code can
in principle hide a *real* link — a line with mismatched backticks pairs the
wrong two and swallows whatever sits between them, which would be a false green
of exactly the kind this row exists to prevent. Measured across the tracked
corpus by extracting with and without the pass and diffing: **the only links it
hides are the `x.md` syntax examples in this file and in
[`docs/research/splitting-the-long-docs.md`](research/splitting-the-long-docs.md)** —
prose about the gate, in inline code, which is what the pass is for. No real
link is hidden.

Deliberately stated without totals. The first draft of this paragraph carried
three exact counts and **two of them were false one edit later**, because the
commentary above added another `x.md` example and moved the numbers it was
describing. That is the defect this file already logs against itself — *"It said
'four' for a while after there were five"* — reproduced inside the paragraph
congratulating the gate on measuring rather than assuming. The count belongs in
the gate's own vacuity floor, where it can go red, and that floor is set just
under the real number rather than at a round order-of-magnitude guess — left far
below, most of the corpus could stop being checked in silence. Which means the
floor is raised as the corpus grows, and was not: it sat at 180 against a corpus
nearly three times that, a floor no longer doing the job this sentence claims.

**That fragment link was the only one in the repo when this row was written, and
it stopped being so the next day.** The claim landed in `390bb65`; `1d0548f`
added `docs/spec/` the following morning, cross-referencing its own sections by
anchor throughout, and the line here went on saying *only one* for the nine days
after that — a documented claim that had quietly become false, which is the
failure this file opens by cataloguing, sitting in the row written to catch it.
**A prose claim about a corpus is stale one commit later, not one release
later**, which is the argument for the floor and against this sentence ever
carrying a number again. The fragment half is now
exercised by a real corpus as well as by mutation, and its size is asserted by
its own vacuity floor in `gates/doc-links.test.ts` rather than counted here: an
exact number in this paragraph is precisely what the paragraph above rules
against. The slug rule approximates GitHub's, and it approximates it
in the safe direction — this repo's headings carry backticks, arrows and inline
links, so a heading it slugifies differently produces a *false red*, never a
false green.

## Defect gates

Rows that exist because a specific defect got through — except **G17, G18 and
G22**, written for defects that had not happened (G17 because the change it
shipped with made one reachable, G18 because somebody outside the project
looked, G22 because a rule was copied a third time), and G20, G23, G24 and G25,
which exist because one rule had several implementations. Each was written to
fail first.

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

| Row | Name | Rule | Gate | Status |
| --- | --- | --- | --- | --- |
| **G10** | `cover-path` | one cover-path rule, one implementation | `gates/cover-path.test.ts` + `packages/core/src/covers/cover-path.test.ts` | ✅ |
| **G11** | `build-modes` | the two build modes differ only where documented | `gates/build-modes.test.ts` | ✅ |
| **G12** | `shelf-order` | `shelf_order` semantics | `gates/shelf-order.test.ts` | ✅ characterized |
| **G15** | `cover-budget` | what ships fits in a phone's graphics memory | `gates/cover-budget.test.ts` | ✅ |
| **G16** | `books-in-case` | every book stays inside its own case | `pnpm smoke:render` | ✅ |
| **G17** | `deploy-branch` | a deploy publishes `main`, or says why not | `gates/deploy-branch.test.ts` | ✅ |
| **G18** | `bounded-cover-bytes` | a provider's bytes are bounded and are an image | `packages/core/src/covers/download.test.ts` | ✅ |
| **G20** | `public-build-artifact` | one inspection of the folder about to be published | `gates/public-build-artifact.test.ts` | ✅ |
| **G21** | `no-live-network` | no test makes a live network call | `gates/no-live-network.ts` + `gates/no-live-network.setup.ts`, specced by `gates/no-live-network.test.ts` | ✅ |
| **G22** | `cover-candidates` | one cover-preference rule, one implementation, right way round | `gates/cover-candidates.test.ts` + `packages/core/src/covers/cache-cover.test.ts` | ✅ |
| **G23** | `key-if-present` | one absent-key helper, one implementation, under any name | `gates/key-if-present.test.ts` + `packages/core/src/key-if-present.test.ts` | ✅ |
| **G24** | `repo-root` | one repo root, one derivation | `gates/repo-root.test.ts` | ✅ |
| **G25** | `one-usable-width` | the packer's capacity and the placer's consumption are one number | `packages/site/src/shelf/shelf-width.test.ts` + `packages/site/src/shelf/books.test.ts` | ✅ |
| **G26** | `lookup-recall` | a lookup finds books the providers demonstrably have — and still refuses the ones they do not | `gates/lookup-recall.test.ts` + `gates/recall-corpus.ts`, replayed from `fixtures/api/lookup-recall.json` | ✅ |
| **G27** | `enrich-report` | a command's report accounts for every book it counted | `gates/enrich-report.test.ts`, over `packages/cli/src/enrich-report.ts` | ✅ |
| **G28** | `no-board-collisions` | no book's board passes through its neighbour's | `packages/site/src/shelf/placement.test.ts` | ✅ |

**G21 is the first row here written for a rule that two files already claimed
was true.** `AGENTS.md`'s Phase 1 gate says "use cached API fixtures, no live
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
assertion holds the rule list to the defects: a rule with nothing that
produces it fails the build, so this gate cannot quietly come to cover
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

**G23 is the first row here that was red against the defect itself**, with no
mutation involved. Every other row was written after its defect had been fixed,
or for one that had not happened, so each had to be perturbed to be believed.
This one named all six offending files on its first run — a stronger form of
"written to fail first" than the phrase usually gets to mean, and available only
because the gate was written before the consolidation rather than beside it.

The defect: `keyIfPresent` existed **six times under three names** — `maybe` in
four files, `optional` in `frontmatter.ts`, `pick` in `library.ts` — with
byte-identical bodies. This is G10's shape again, with one aggravation that is
the actual lesson. **The copies were not discoverable from each other.** Each
author checked for an existing helper, searched the name they had in mind, found
nothing, and wrote it. Grepping `maybe` returns four of six and reads like a
small local habit rather than a repo-wide rule with two aliases; the
architecture review that catalogued this codebase's duplication and produced six
candidates did not list this one, for exactly that reason.

**So the gate matches what the body returns and never what the function is
called.** An identifier check is the obvious construction and would have been
satisfied by all six on the day it was written — three times over, once per
name. The anchor is `return <ident> === undefined ? {}`: absent in, nothing out,
which is what makes this helper itself.

**Its limit is the shape rather than the behaviour, and that is a choice with a
name on it.** Two rewrites return `{}` for an absent value and escape — an early
return, and an expression-bodied arrow — both checked rather than assumed.
Widening to catch the early return would flag `covers/cover-keys.ts:31`, which is
that line exactly and is not a copy of anything. So the options were a narrow
anchor with a stated gap or a broad one carrying a standing exemption for a file
that has done nothing wrong, and ADR-0022's maintenance cost falls on the second.
The gap is stated here instead: the anchor catches the shape all six copies took,
which is the shape copy-paste produces.

Two things that fell out of choosing the return statement as the anchor, both
better than the alternatives they replaced:

- **The seventeen inline `...(x === undefined ? {} : { k: x })` spreads need no
  exemption.** They contain the same text and are not copies of anything — each
  is one decision at one call site. A spread has no `return`, so the anchor
  separates them by construction. That means no allowlist, and therefore no
  allowlist entry that can go stale, which is the maintenance ADR-0022 requires
  of every structural gate that does have one.
- **`packages/site/` is not exempt either**, though the site cannot value-import
  `@stacks/core` (G6). A copy appearing there goes red, and the fix is to
  promote the owner to a pure subpath beside `@stacks/core/shelf-order`. An
  actionable red beats a blind spot, and this is the first structural gate here
  to have no exempt list at all.

**The vacuity anchor is the assertion this row needs most**, for a reason worth
stating generally: *every clause of this gate is phrased as an absence*, and an
absence is satisfied for free the moment the pattern stops matching anything. So
the gate asserts the owner still matches before asserting nothing else does.
**Observed red** by changing the owner to return `Object.create(null)` instead
of `{}` — the body stops being the thing described, and the clause says so by
name rather than quietly greening the other three.

The reformatting case turned out not to be the threat it looked like. `\s`
matches newlines, so a ternary split across three lines is still matched, and
**a copy that arrives reformatted is still caught** — verified by mutation, not
by reading the regex. That is a happier result than the one first written here,
and the correction is worth keeping: the anchor is robust to layout and brittle
only to the behaviour changing, which is the right way round.

The permissive half is asserted too, for G17's reason: *a positive check cannot
detect a missing one*. "No file defines its own" is satisfied perfectly by a
repo where every caller has gone back to writing the key unconditionally, so the
gate also requires the helper to have seven callers. That is the same clause G22
needed and for the same reason, arrived at independently both times, which
suggests it belongs in any row promising "one rule, one implementation".

**And that clause first passed the mutation it was written to fail**, which is
the entry here worth reading. The floor was set to six — the number of files
that had carried a copy — and reverting one caller left six still calling it, so
the gate stayed green through exactly the regression it describes. The cause was
an overcount rather than a wrong constant: the sweep counted
`key-if-present.test.ts`, which names the helper on every line and *uses* it for
nothing. A spec is not a caller. **An inflated floor is slack, and slack in a
floor is indistinguishable from the defect it is meant to stop** — the general
form of a rule this file already has for allowlists, applied to a number.

**Observed red**, the rest by mutation: a seventh copy under a seventh name
(`perhaps`); the same copy with its ternary split across lines, confirming the
anchor is layout-proof; a copy in `packages/site/`, confirming the no-exemption
choice produces the actionable red it was chosen for; a caller reverting to a
bare `{ key: value }`; and that same revert with `keyIfPresent(` left behind in
a comment, which does not rescue it, because the shared `codeOf` blanks comments
before anything is counted. That last one is the defect this file has now logged
under G14, G19 and G22 — and is why `codeOf` moved into `gates/repo.ts` rather
than being written a second time inside a change about not writing things a
second time.

**What this row does not gate.** `FrontmatterChanges` inverts the rule this
helper embodies: near `updateBook`, `undefined` *removes* a key from a note in
the owner's vault, so the ordinary absent-is-harmless reflex writes to somebody's
files. That is real and stated in `CONTEXT.md` under **Removal** — but it has no
gate here, because it has no live instance either: all three `updateBook`
callers build their changes from literals or guarded assignment, and none of the
27 spreads is anywhere near one. `enrich.ts` additionally cannot express a
removal at all, since its accumulator is typed `Record<string, string | number>`
and needs a cast to widen. Gating a hazard nothing can currently reach would be
a rule nothing can fail on, which is what this file is against.

**G24 is the fourth "one rule, one implementation" row**, after G10, G22 and
G23, and the first whose *stated benefit turned out to be false*. That is the
part worth keeping.

The issue that produced it argued two things. The first was real: eight scripts
each worked out where the repo starts, in four spellings, and the `.cmd`-shim /
DEP0190 comment had been written three times. The second was that a shared
harness would shrink the surface G1's allowlist has to cover — offered as "the
second-order benefit and probably the more durable one".

**It is not a benefit at all, and this file had already recorded the
experiment.** G1 allowlists files that import `fs`. Of the three things proposed
for the harness, only `walk` touched `fs` — and `walk` had already been
extracted, which *grew* the allowlist by one: `scripts/lib/walk.ts` earned an
entry while `check-public-build.ts` kept its own, still needing `readFileSync`.
`REPO_ROOT` is `node:path` and `run` is `node:child_process`; neither can ever
appear on that list. The consolidation shipped here changes G1's allowlist by
exactly nothing.

The general form: **a duplication argument that reaches for a second, indirect
benefit is usually reaching because the first one felt too small.** The first
one was enough. What the sweep did find is better than the claim it replaced —
`dev-watch.ts` and `smoke-render.ts` were both passing an args array alongside
`shell: true`, the exact shape the two scripts with the comment wrote a
paragraph each about avoiding. So the platform knowledge was not duplicated and
agreeing; it was written in three places and *absent from the two that also
needed it*, which is the strongest available argument for one home and is not
the argument the issue made.

**The gate can anchor on a name where G23 could not**, and the reason is
structural rather than lucky: a module cannot reach its own location without
`import.meta`, so `import.meta.(url|dirname|filename)` catches every spelling
including the `new URL('..', import.meta.url)` form nobody here has written yet.
G23 had to match a returned *shape* because its helper had three names; this one
has no name to hide behind.

**One owner rather than a directory**, on G1's own argument against
directory-level permissions: `scripts/lib/` holds three other shared files and
none of them has any business deriving a root either. A permission granted to a
folder collects whatever later lands in it.

**Observed red** on the sweep by restoring `join(dirname(fileURLToPath(
import.meta.url)), '..')` in `smoke-render.ts`, and on the control by pointing
`OWNER` at a file that derives nothing. **And G19 caught the missing scoreboard
row before any of it was committed** — the new gate file existed, no row named
it, and the build went red on the row above this one. That is the third time a
gate has caught the paperwork for a change that was not about it.

## G25 — one usable width

**The most-copied rule in this file's history had five copies, not three.** The
issue that produced this row named three answers to "how wide is a shelf":
`toRows` packed into `SHELF.width - padding * 2 - LEAN_ALLOWANCE`, the placement
cursor ran flush from `-SHELF.width / 2`, and `leanThatFits` measured slack
against the full width. Settling it found two more, and both were bigger than
the argument:

- **the packer charged `footprint + 0.008` a book** where the cursor spends
  `+ 0.002` shelved or `+ 0.016` face-out. Across a twenty-seven book row that
  is **0.162** — as much as the whole `padding * 2 + LEAN_ALLOWANCE` reserve the
  issue was about, and nobody had noticed it at all.
- **`leanThatFits` counted angle changes by `faceOut` alone**, blind to the
  upright book after a year gap that the cursor pays clearance for. Latent,
  because it never bound: measured across a 120-book library it returned 0.72,
  1.26, 1.12 and 1.00 radians against a `MAX_LEAN` of 0.062. It had never done
  anything in its life, which is exactly why nothing noticed it was wrong.

A full row was leaving 0.374 of bare wood at its right end. That decomposes as
0.17 of declared reserve, 0.162 of the charging error, ~0.10 of wrap
granularity, less ~0.06 of clearance — one of the four on purpose. See
[ADR-0031](adr/0031-one-usable-width.md).

**The row asserts an inequality, not an equality, and that is the interesting
part.** The packer must charge `swayOf(height, MAX_LEAN)` because the real lean
comes from `leanFor`, which needs the row index, which is not known until the
wrap this figure decides has happened. So it is conservative by construction:

```
right edge = -W/2 + spent  ≤  -W/2 + charged  ≤  -W/2 + USABLE_WIDTH
```

Asserting only the left half passes on a packer that charges the whole shelf for
every book, so the excess is bounded too. Naming the slop is what stops the row
from recording the disagreement instead of closing it.

**The bound has three terms now, and the third one is charged where the earlier
two said nothing was owed.** It was one maximal swing per angle change; propping
a book across a year gap added a maximal prop per gap, and then the parallel
push added one per *book*:

| term | charged where | because |
| --- | --- | --- |
| one maximal swing | the angle changes | the real lean needs the row index, which the wrap has not decided |
| one maximal prop | a book props across a gap | the prop angle needs the neighbour, which the wrap has not chosen |
| one maximal parallel push | every pair of spines in a run | two parallel books of different heights do not stand where their footprints say |

The third is the one that had no precedent, and it is a correction to a belief
this row was built on: *"neighbours at the same angle stay parallel and never
collide"*. True of the boards, false of the books — a book tilted about its middle
stands on a base swung `sway` off its footprint, and `sway` scales with height, so
a tall book followed by a short one had its low corner 2.3mm inside its
neighbour's board on the live shelf. Every clearance before it was charged where
the angle *changed*, on the belief that nothing was owed where it did not.

⚠️ **The bound for it was written wrong first, in the way this row exists to
catch.** The first version *called* `parallelPushOf` — the function it was
bounding — with the same arguments and the same trailing term, so that part of the
excess assertion could not fail for any value of the charge. Same defect as the
`toRows`-asks-`toRows` version below, in the same file, three years of lessons
later. It is `WORST_PARALLEL_PUSH` now: re-derived from the geometry against
`THICKEST_SPINE` and the height band, constants the charge cannot move.

**The row names two files, and the second one nearly re-introduced the defect.**
`books.test.ts` asserts the capacity rule from the packer's side and wrote the
fold over `shelfCost` out by hand to do it — a second copy of the sum, inside
the commit whose entire subject is that this sum had five copies. It became
`rowCost`, stated once and called from both.

⚠️ **`books.test.ts` no longer makes that claim, and the paragraph above stopped
describing it before this line was added.** Its assertion asks `rowExtent`, which
is the packer's own predicate — so it catches a packer that stops wrapping and
nothing finer, and it says so in place. `rowCost` came here with `shelfCost` and
is called from one file now, not two. Naming both
files here is the other half: an assertion this row depends on, sitting in a
file the scoreboard did not point at, is one that can be weakened without
anything noticing — which is the failure mode at the top of this file, not a
tidiness complaint.

**One assertion here was wrong twice, in opposite directions, and the second
version passed everything.** "One more book would not have fitted" first priced
the candidate *without* its year gap — but `toRows` turned that book away
carrying `YEAR_GAP` and the clearance an upright book pays, so the assertion was
stronger than anything the packer promises. It passed by 0.02 where the
guarantee allows 0.09: green today, red on a correct packer the day a book gets
thinner.

The fix for that was worse. Handing the row's books back to `toRows` with one
more appended, and requiring two rows, prices the candidate perfectly — because
it asks the same function that made the decision. **It passed with the packer
mutated to wrap at nine tenths of the shelf.** A deterministic function always
agrees with itself, so the assertion could not fail for any packing rule
whatever, and nothing about it looked vacuous: it named a real invariant, ran on
every fixture, and reported green.

What works is pricing the candidate from the packer's own exported rules —
`yearOf`, `YEAR_GAP`, `shelfCost` — and comparing against `USABLE_WIDTH`, which
the packer does not get a vote on. That catches a wrap 0.15 early, where the
first version would have been caught by nothing and the second by less.

The lesson is the one this file keeps relearning from a new angle: **a gate must
compare against something the code under test cannot move.** G21's version was a
guard whose throw got swallowed by a `catch`; this one was an assertion whose
judge was the defendant.

**Observed red, eight ways**, each a mutation of the line it covers: dropping
the clearance charge, inflating it forty-fold, adding a hair to every book's
cost, packing past `USABLE_WIDTH`, wrapping early, starting the cursor clear of
the upright, folding the reserve into the usable width, and tuning the reserve
below the swing it has to absorb. The third one matters more than it looks —
it is the only mutation caught by the row that asserts exactness on a row which
changes angle nowhere, and without that case a constant over-charge hides inside
the bound.

**It does not replace G16, and the two failed differently here.** Everything in
this row asserts what the placements *claim*; G16 measures `Box3.setFromObject`
against the case's real inner faces on a rendered scene. It reported
`case overflow 0.0012` before this change and after it — which is `SKIN`, the
hair by which a printed cover floats above its board, not slop — so the density
moved by three books a row while the containment residual did not move at all.
That is the shape of evidence a unit test cannot produce.

### The estimate is gone; the model stayed and changed sides

⚠️ **Everything above this heading describes a packer that no longer exists.**
`toRows` used to charge `shelfCost` and wrap on the estimate. It runs the cursor
and wraps on the answer — [ADR-0042](adr/0042-the-packer-runs-the-placer.md).
The conservatism the inequality above *bounds* was, all along, shelf left empty:
**0.09 to 0.13 a row on the live shelf**, and on one row it turned away a book
that needed 0.163 from 0.170 of real room.

**The bound was documented as unavoidable and was not.** The reason given —
"the real lean comes from `leanFor`, which needs the row index, which is not
known until the wrap this figure decides has happened" — is true of the book's
*other* possible home, the head of the next row, and false of the row being
offered it. `leanFor(rowIndex, position, id)` is determined by its arguments,
and both indices are fixed at pack time: rows finalise in order, so the row being
filled is `rows.length` and the candidate's place in it is `current.length`. The
circularity was in the sentence, not in the code, and it survived two rewrites of
this row because the row asserted the bound was *sound* and never asked whether
it was *needed*.

**`shelfCost` and `rowCost` moved into `shelf-width.test.ts` rather than dying
with the estimate**, and the direction of the inequality is why. Deleting them
would have left nothing bounding what the *cursor* spends against numbers the
cursor cannot move, and the obvious replacement — restating capacity as
`rowExtent` — is the defendant-as-judge defect three paragraphs up, committed a
third time. So the model changed standing: it decides nothing and bounds
everything, and being loose costs nothing now that no row wraps on it.

**A third group asks what the first two cannot.** "Packs no row past the band"
and "packs every row tight" are both about the *decision*, and both read
`rowExtent` on the left — which is what `fitsRow` wraps, so a cursor that
over-spends moves the wrap and the measurement together and neither notices.
`leaves a row no slack a book could have used` is about the outcome: the wood
left at a row's end, against a cursor-free number.

⚠️ **That number was a floor, and it had to become a ceiling.** It began as the
next book's footprint plus its gap plus a separator — "an absolute minimum",
written on the reasoning that leaving out every clearance made the claim safer.
It does the opposite. The assertion is `room < need`, so a need stated too small
turns a *correct* packer red: a book rejected **because of** the clearance it
would have paid leaves room above such a floor. That is the same error this row
already records twice, committed a third time, in the same file, one commit
later — and it was green on all six fixtures, which is exactly how the other two
looked. Two independent read-only reviews found it from opposite sides: one that
the floor was too small to be sound, one that charging `YEAR_GAP` in full made it
too large by up to 0.088 at a propped boundary. It is `separator + gap +
footprint + WORST_CLEARANCE` now, every term at its worst, and the separator is
taken from the book the cursor is *leaving* rather than the one it is arriving
at — reading it off `next` understated the cost by 0.014 for every face-out book
followed by a spine.

⚠️⚠️ **And then `WORST_CLEARANCE` itself was `MAX_LEAN` where it had to be
`MAX_PROP_LEAN` — this row's own oldest mistake, made a fourth time, three
paragraphs after writing it down.** The angle-change branch spends
`Math.max(sway, left.sway)`, and `left.lean` is a *run* lean: a run that begins
on a book propped across a year gap hands that angle to every spine behind it. So
the swing reachable there is `swayOf(MAX_HEIGHT, MAX_PROP_LEAN)` = 0.1175 against
the 0.0263 `MAX_LEAN` allows, and the ceiling was under half the real worst case.

**It was green on all five fixtures, and on the owner's own shelf by 0.0023.**
An independent verifier swept cover aspect, page count and face-out position
against the shipped `paperbackRatio` — 5,940 configurations — and found 375 that
fail. The margin, `min(ceiling − trueNeed)` over every boundary:

| library | `MAX_LEAN` | `MAX_PROP_LEAN` |
| --- | --- | --- |
| `mixed` | +0.0518 | +0.1399 |
| `alternating` | +0.0347 | +0.1227 |
| the owner's real vault | **+0.0023** | +0.0904 |
| `squareCoverAfterProp` | **−0.0388** | +0.0493 |

`squareCoverAfterProp` is a fixture now — every book its own year so every run
inherits a prop angle, and one face-out book with an audiobook's square cover
landing against it at 11.9°. **The packer is correct on it**: it turned the next
book away by 0.00023, both decision assertions pass, and only the outcome one
went red. That is what makes this an unsoundness rather than a caught defect.
Observed red with `MAX_LEAN` restored and green with `MAX_PROP_LEAN`, so the
constant cannot quietly go back.

The detection floor is unchanged at 0.005 green / 0.0055 red — it belongs to the
cost model, which does not read `WORST_CLEARANCE`.

**Observed red, and the detection floors are measured, not assumed.** Bisected on
`cursor += entry.thickness + TOUCHING + δ`, the shelved branch:

| δ | verdict | caught by |
| --- | --- | --- |
| 0.005 | green | — |
| **0.0055** | **red** | `never spends more than the model allows` (`mixed`) |

The face-out branch catches **any** over-spend — δ = 0.00001 is red on the
exactness case, which is exact to the bit. Also red: the angle-change clearance
doubled (×2 is enough), and the packer wrapping at nine tenths of the band, which
turns `packs every row tight` red — the mutation the vacuous version survived.
Control green throughout.

⚠️ **This row said 0.0003 first, and buying that number was the defect above.**
The sharp floor belonged to the outcome assertion while it was unsound; making it
sound cost the sharpness, and the honest floor is now the cost model's 0.0055.
Before that, the row claimed the moved model caught a hair-sized cursor
over-spend — a misreading of "adding a hair to every book's cost" further up,
which is a hair added to the *charge*, not to the *spend*. Three numbers, three
corrections, none of them from running the suite: the suite was green for all
three. **A detection floor that is written down is a gate; one that is assumed is
what this row exists to prevent.** Do not restate these in either direction
without re-running the bisection.

**The one thing this row now carries alone.** Clearance is charged to the *left*
of the book that leans, where the angle changes, so the last book of a row has
nothing on its right to charge and its swing is paid for by `SHELF.endReserve`
and by nothing else. That was `LEAN_ALLOWANCE`'s job before it was folded in.
The assertion `endReserve ≥ swayOf(MAX_HEIGHT, MAX_PROP_LEAN)` is the one to read
before tuning that number, and it is why the reserve is not merely aesthetic.

⚠️ **It said `MAX_LEAN` there, and stayed green for a whole change after that
stopped bounding anything.** `MAX_LEAN` is the steepest a book slumps *of its own
accord* — 3.5°. A book propped across a year gap leans four times further, and a
run inherits the prop angle, so the last book of a row can carry it. The reserve
was sized for a swing of 0.03 against an actual worst of 0.117, and the gate that
exists to notice compared it against the constant that had stopped applying. **A
scoreboard row does not protect an invariant; the assertion does, and only while
it still names the right number.** The row is `endReserve = 0.12` now, bounded
above as well as below so the reserve cannot quietly grow to paper over a defect
instead.

## G28 — no book's board passes through its neighbour's

**Three gates were watching this file and none of them could see a book inside
another book.** G16 measures `Box3.setFromObject` against the case's real inner
faces — two books can intersect each other happily well inside those. G25 works
in *footprints*, the untilted slab a book would occupy, which is the right
coordinate for the cursor's budget and precisely the wrong one for this question:
two neighbours can have disjoint footprints and still intersect, and overlapping
footprints and not, which is why a run packs flush. And `placement.test.ts`'s own
flushness assertion used three books of *identical height*, where the defect is
identically zero.

So 509 tests, four of them about this file's spacing, a render gate, and the
thing that found it was the owner looking at a close-up. Three collisions, all
real: 8mm and 18mm where a propped book measured its reach to its neighbour's
*footprint* rather than to its corners, and 2.3mm between any tall book and a
shorter one in the same run, which predates propping by as long as there have
been runs.

The row walks the actual boards — the minimum horizontal air between every
neighbouring pair over the heights they share, across a ninety-book fixture with
dense year changes and mixed face-out books. Both edges are straight lines, so
the minimum sits at an end of the shared range and there is no step size to be
wrong about.

**Bounded above as well as below, and the first version was not.** Asserting only
`gap ≥ 0` pins the direction that reads as one book inside another and leaves the
mirror direction — a slot of missing book — entirely free. They are one error with
two signs: a tall book followed by a short one closes too much, a short one
followed by a tall one opens too much, and the same correction fixes both. Clamped
at zero, it fixed half an error and called the collision closed. Two spines of one
run owe each other `TOUCHING` and nothing else, so that is what the row asserts.

⚠️ **It was wrong first, in the way that flatters the code it tests.** Its corner
heights used `height / 2` for the centre, which is true only of a book that is not
leaning — the real centre is `(h/2)cos θ + (t/2)sin θ`. For two parallel books the
gap is the same at every height, so the wrong height still reads a plausible gap:
off by `(δ_left − δ_right)·tan θ`, or 0.26mm, which looks exactly like a placer
that is nearly right. The placer was exact to 1e-17. An independent re-derivation
of the same quantity is what settled it, and the moral is this file's own, from
the other side: **a check that disagrees with the code is not automatically the
one that is right.** G25's version of the lesson is a judge who was the defendant;
this is a judge who was simply wrong, and reached for the same gavel.

**Observed red, four ways**: measuring the prop's reach to the footprint rather
than the corners, adding the neighbour's lean in the corner case as well as the
board case, clamping the parallel push at zero, and dropping it altogether.

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

   ⚠️ **True here and false one caller along.** Since G20 this rule is shared
   with `deploy:site`, which runs it over the **real** `dist/` — where the
   canary is a `fixtures/vault` literal that cannot be present, so the rule
   structurally cannot fire. It is load-bearing in `gate:public`, where the
   canary is planted, and vacuous on the folder that actually goes to the
   internet. Accepted rather than repaired
   ([`docs/spec/trend-layer.md`](spec/trend-layer.md) §5, response (i)): the
   real-build protection is structural — no `BookRecord` field carries a body —
   and the `unknown-key` rule asserts that structure on the artifact instead of
   assuming it, which is G30's seam check applied to real bytes. ⚠️ **Key
   names, never values**: body text in a named field passes both.
   *The lesson is the transferable half — a check that is honest against
   fixtures can be vacuous against production, and moving it to the production
   artifact does not move its meaning with it.*
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
   means the share card — size-checked by this same gate, 1200×630 — would have
   shown nothing to anyone the shelf was sent to. That is
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

The audit is one of two gates whose result changes without the code changing —
CodeQL, below, is the other: an advisory published tomorrow turns yesterday's
green commit red. That is correct
— a vulnerability is news about code already shipped — but it also means a
transitive dependency nobody can fix will block unrelated work. The escape hatch
is `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`, which takes the GHSA id,
a date and a reason, and appears as a one-line reviewable diff. Same shape as
the allowlists in `gates/`, and the same rule applies: an entry that outlives
its reason is a permission nobody revisits.

**Reach for that hatch second, and only after checking whether a fix exists.**
The gate failed on 2026-08-08 for two advisories that both *had* patches, and
one of them still would not install: pnpm 11 quarantines newly published
versions for seven days (`minimumReleaseAge`), so `pnpm update nanoid` reported
success and left the tree on the vulnerable version. A silent decline is the
dangerous shape here — the command that looks like it remediated the advisory is
the one that did nothing. An explicit `overrides` entry is honoured where
auto-resolution is not, so the fix was to name the version, not to ignore the
GHSA. An `ignoreGhsas` entry there would have suppressed a solvable problem for
seven days and outlived its reason, which is exactly what the rule above warns
about.

Separately, and not a gate: **Dependabot alerts** and **security updates** are
enabled on the repository, so a vulnerable dependency also arrives as a pull
request — which then has to pass everything above like any other change.

## Trends

**A check is a gate if its red has a named, reachable remedy and its verdict does
not depend on how much test code exists. Otherwise it is a trend.** The taxonomy
is binary — there is no third column — and the rule is
[`docs/spec/gate-or-trend.md`](spec/gate-or-trend.md), which decides where any
*future* check lands too. See also
[ADR-0054](adr/0054-a-check-is-a-gate-or-a-trend.md).

**A trend takes no row number and carries no status.** ✅ 🔴 ⬜ stay the whole
vocabulary above, and this table joins none of it: a numbered row in a fourth
table would collect uniqueness, gapless and status checks from G19 and no slug
checks at all, which is scored-looking and half-checked. **G19 is not edited.**
What is numbered is the ordinary gate that watches this table.

**The series is never red; its absence is.** Nothing here acts on a movement —
there is no threshold anywhere for one to breach — because *"write better tests"*
is not a diff and a mutation score of 71.4% has no named remedy. What is watched
is whether a number arrived at all, which is a question about the pipe rather
than a judgment about the code. A trend that reaches nobody and a deleted one
are the same artifact.

| Trend | Measures | Cadence | Reader | Silence watched by |
| --- | --- | --- | --- | --- |
| `mutation-score` | killed ÷ total, per declared scope | nightly | maintainer, at `pnpm deploy:site` | `metrics-freshness` |
| `gate-suite-runtime` | wall-clock of `pnpm test` | nightly | ” | ” |
| `mutation-run-runtime` | wall-clock of the Stryker run | nightly | ” | ” |
| `live-exclusions` | declared exclusions that produced ≥1 **executed** mutant, of N declared | nightly | ” | ” |

⚠️ **`mutation-score` is spelled *killed ÷ total* on purpose.** The score is
gameable by adding trivially-killable code, which dilutes the denominator upward
— not the coverage failure mode, and closed by neither clause of the rule above.
It sits in the Measures column so a reader meets it, rather than in a closed
ticket.

⚠️ **`live-exclusions` cannot move yet, and that is written here rather than
discovered from a flat line.** An exclusion is negated out of Stryker's `mutate`,
so an excluded file is never mutated and never reaches a report — which means the
run that produces this record reports **0 by construction**, not 0 as a finding.
The measurement the row describes needs a deliberately wider run that nothing
builds today. What ships is a config-drift tripwire under the right name. Carried
as an open weakness on **G36 (`trend-layer`)** in
[`gate-register.md`](gate-register.md), because *a series incapable of movement is
a flat line*, and a flat line arriving on time is the shape this layer exists to
refuse.

⚠️ **`metrics-freshness` is named without a row number, and that is deliberate.**
The gate does not exist yet; it is the deploy-side refusal that lands later in
this rollout. Row numbers are derived from landing order — the Nth new row to
land is G(35+N) — so writing one here would be a pre-allocation, and every
pre-allocated number on this rollout's source map was wrong, including one
allocated twice five seconds apart by two sessions. **The number goes in when the
row does.** Until then the column names the mechanism, which is the part that is
already decided.

**Where the numbers come from.** `.github/workflows/metrics.yml` writes one
`metrics/<timestamp>-<sha>.prom` per run to the orphan `metrics` branch, in the
OpenMetrics text `promtool` ingests. `pnpm trend:sync` — **not built yet** — will
pull it into a local Prometheus. No secret exists anywhere in that design — job-level `contents:
write` on the built-in token at one end, an anonymous fetch at the other. See
[ADR-0055](adr/0055-ci-writes-a-durable-record.md) and
[`docs/spec/trend-layer.md`](spec/trend-layer.md).

**A row is written unconditionally, red `main` included.** A crashed run writes
`run_ok 0` **plus whatever computed** and still exits red, so *never ran* — a gap
in the branch — stays distinguishable from *ran and broke*, an explicit zero.
`run_ok` is not a trend and takes no row here: it lives under a different metric
prefix, which is what makes its exclusion structural rather than a list G36 would
have to maintain.

## Triaging a CodeQL finding

**CodeQL blocks a merge.** `main`'s ruleset carries a `code_scanning` rule
alongside the required `gates` check: no new security alert at **high or above**,
and no new alert at error level. Its output is still evidence rather than a
verdict — this section is what decides what to do with an alert, and a reasoned
dismissal is a first-class outcome — but the decision has to be made before the
pull request can land, not after. The first batch was 12 alerts, all rated
**high**, of which one was a real bug — a ratio worth expecting rather than
being surprised by.

⚠️ **This paragraph said the opposite for two days, and nothing could go red.**
It read *"CodeQL reports alongside the gates rather than blocking a merge"* —
made false by `6cbb380`, the commit titled *"CodeQL becomes a second required
gate, and the five claims that made false"*. That commit went looking for
exactly this, corrected five claims elsewhere, and never touched the one file
whose job is recording what is enforced. **Nothing in a clone can check it**:
the ruleset lives outside the tree, and a gate that asked GitHub would need the
network, which G21 (`no-live-network`) forbids for the whole suite. So this
claim belongs to the last row of *"Not gated, deliberately"* — relied upon and
unverifiable — and the only available mitigation is that it now says so instead
of stating it flatly.

**Read what the rule is for before reading its severity.** Most of CodeQL's
JavaScript rules assume a server handling untrusted input. This is a local CLI
and a static site: the severity is calibrated for someone else's threat model,
and `SECURITY.md` states this one.

Three questions, in order:

1. **Is the flagged code a security boundary here?** `js/insufficient-password-hash`
   fired on the SHA-256 that names a cache file after a URL. There is no
   account, no database and no authentication anywhere in this project, so
   there is no credential for a password-hashing rule to apply to. Dismissed as
   a false positive.
2. **If it is in a gate, is the real question vacuity?** A rule complaining that
   an extractor's regex is approximate is asking "what if it matches nothing" —
   which this repo already answers with `expectFound`. `js/bad-tag-filter` fired
   on `SCRIPT_BLOCK` in `gates/astro-no-logic.test.ts`; the miss it warns about
   throws at line 135, whose comment named that exact scenario years before
   CodeQL saw it. Fixing it properly means an HTML parser dependency, in the
   gates layer, for a file format that is not HTML, to protect against a
   first-party commit. Dismissed as used-in-tests. **The tempting half-fix —
   tweaking the regex until the alert clears while it stays just as
   approximate — is the worst outcome available**, because it buys the
   appearance of a fix.
3. **Is it worth fixing anyway, for a reason that is not security?** Usually
   yes, and this is where the value has actually been. `js/polynomial-redos` on
   `safeFilename` was real: bounding the input fixed the backtracking *and* a
   truncation bug nobody had noticed, where the 120-character cap ran after the
   trailing-dot strip and could put a dot back on the end of a Windows filename.
   The nine `js/incomplete-url-substring-sanitization` hits were test-only and
   still worth fixing, because `url.includes('googleapis.com')` does not assert
   what the test claims to assert.

**A dismissal carries its reasoning in the dismissal comment**, not only here —
the next person meets the alert, not this file. And a fix earns a test that goes
red against the old code like any other: both `safeFilename` tests were observed
red, and the ReDoS one was **green on its first draft** at 60k dots, because the
cost is quadratic and that size lands under its own threshold. It was measured
and raised to 200k. A test written against a defect it cannot reproduce is the
oldest failure in this file.

## Not gated, deliberately

| | Why |
| --- | --- |
| Coverage percentage | Coverage measures execution, not detection. An AI asked to raise it produces exactly the gap it is asked to close. No ticket should ever exist to raise it. |
| Changed-lines floor (diff-cover) | One contributor; it would be noise. |
| **Mutation testing (Stryker)** | *Genuinely cheap here — 133 tests in ~2s — and the real measure of whether these gates have teeth. Parked only because it is second-order to having CI at all. Revisit once the rows above are green.* ⚠️ **Revisited 2026-08-11: condition met, and the cost estimate in this cell was wrong — 636 tests / 5.52s, not 133 / ~2s. Now a trend; see [Trends](#trends). Still not gated: the number never goes red.** |
| Article XI-style residency rules | No infrastructure; nothing to pin. |
| **A link is about what it claims to be about** | G29 checks that a link *resolves*, which is not the same question. #166 moved the invariants to `AGENTS.md` and left `CLAUDE.md` as a stub, so eight links reading `[invariant 1](CLAUDE.md)` across five files still resolved perfectly — at a file with no invariants in it, and G29 stayed green throughout. They were repointed by hand. Not gated because "this link is about what it says" is a judgement, and a gate that made it would be a gate that matches prose, which `docs/gates.md` has twice learned matches anything. |
| GitHub repository settings | Dependabot alerts, malware alerts, grouped security updates, branch protection. They live outside the tree, so nothing in a clone can read them — and a gate that asked GitHub would need the network, which **G21 (`no-live-network`) forbids for the whole suite**. Listed in `SECURITY.md` as relied upon and unverifiable, which is the most this repo can honestly say about them. |
| **A branch name or a commit subject follows the convention** ([ADR-0057](adr/0057-the-pull-request-title-is-the-commit-subject.md)) | Commit-lint is available and it is the wrong instrument. Put [`gate-or-trend.md`](spec/gate-or-trend.md)'s **Clause A** to it — *does its red have a named, reachable remedy?* — and the answer depends on who hit it: for the maintainer, rename the pull request; for a stranger, the build is red for something that is not a defect in their change, and `CONTRIBUTING.md` promises that a contributor with no agent skills installed passes every gate. **That is the disposal [`trend-layer.md`](spec/trend-layer.md) §4 already made of a staleness spec** — *"That fails Clause A **for the person who hit it**. A stranger paying for your dead pipe is not a gate; it is a tax"* — reached a second time, for a convention rather than a pipe, which makes it precedent rather than a fresh judgement. **The surface would be defensible even though the check is not**: the repository squash-merges with `squash_merge_commit_title: PR_TITLE`, so the only string worth checking is the pull request title on `pull_request` — never `commit-msg`, which lints a message the squash throws away. That door is documented here rather than left to be rediscovered. ⚠️ **The branch half is disqualified by coverage, and the first draft of this row said something else and was wrong.** It claimed CI cannot see a branch name at all; `gates.yml` runs on `pull_request`, so `github.head_ref` carries it, exactly as the same event carries the title conceded one clause earlier — the two halves of one sentence disagreed, and a review caught it. What actually disqualifies it: `head_ref` exists **only on a pull request**, so a branch that never opens one is never checked, and the branches a harness names are deleted by the squash that merges them. A check firing on some branches and reading as covering all of them is the shape this file's [*Why this file exists*](#why-this-file-exists) is a list of. |
| **Claiming an issue before working it** (the rule in `AGENTS.md`'s *Working rules for agents*) | A claim is a property of the tracker and of wall-clock time, not of the tree: a spec asserting it would go red for a contributor who never touched an issue, which is the metrics-freshness rejection in [`docs/spec/trend-layer.md`](spec/trend-layer.md) §4 — *a stranger paying for your dead pipe is not a gate; it is a tax*. Reading it in CI needs the network anyway, and **G21 forbids that for the whole suite**. **The mechanism is the assignee plus a one-hour window, and both halves were chosen knowing the assignee is not a lock** — every session here authenticates as the same account, so a ticket was once claimed twice five seconds apart, and no check on the tracker could have told those two apart. It was kept because it is the only signal that renders in GitHub's own UI and that the frontier query already reads; a claim *comment* or a `claimed` label buy filterability and add a second thing to remove on abandonment, which is the state nobody cleans up. The window is the reading half and needs no cleanup: an assignment older than an hour stops being presumed live on its own. So this is an advisory recorded where a person will see it, not a lock — and the real protection remains naming the issue when a session is launched. |

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

- **2026-08-06** — **Twenty-five gates, and not one of them asked whether the thing worked.** Every row above checks a *contract*: which frontmatter keys exist, what the public build ships, that the packer and the placer agree, that no test touches the network. Issue #63 was none of those. The metadata lookup refused five books in the real vault as "not the same book" while Google was holding three of them, and the whole scoreboard stayed green, because **recall is not a contract and nothing was watching it**. The gap is a category, not an oversight: contracts are cheap to gate because both sides are in the repo, and recall is not, because the right answer lives at a provider. That is exactly why it went unwatched for so long, and it is not a reason to leave it unwatched. G26 is the first row here whose expected answers — 255, 368, 262 — are facts about the world rather than about this code.

- **2026-08-06** — **The corpus pins the refusals as hard as the finds, and that is not symmetry for its own sake.** The bug immediately before this one went the other way: a matcher accepting *Emotional Intelligence 2.0* for *The New Emotional Intelligence*, recorded in #62 with the instruction *"do not loosen it"*. A recall gate that only asserted positives would be passed by a matcher that says yes to everything — so the cheapest way to make G26 green would have been to reintroduce the defect it sits next to. Two of the five corpus entries exist to make that route red.

- **2026-08-06** — **The issue's own root-cause list was 3 for 4, and the trace is what separated them.** Two causes were real and provable from source. A third — a filter or a `undefined` return reordering candidates — was written up as needing investigation, and did not exist: Google simply ranks the wrong book first, and the one filter that fired removed a genuine study guide. The issue reached that hypothesis by probing the API with a *shorter query than the code sends*, which returns different rankings. Worth logging because the wrong lead was the most specific-sounding item in the report, and a session that trusted it would have gone hunting through `looksDerivative` for a bug that was never there.

- **2026-08-06** — **One `break` did two jobs badly, and the shape of the code is what hid it.** `stacks enrich` printed `6 with gaps` and then `would fill 3, 2 left alone` — five books out of six — because `enrichBook` returned `complete` for two situations that are not the same thing (*nothing was missing*, and *something was missing and none of it could be filled*), and a `case 'complete': break;` that did neither looked exactly like one that did both. G27 asserts the claim rather than the branch: every book the header counted appears in one line and one total, and no book with a gap comes back "nothing was missing". **The fix is structural rather than careful** — `reportEntry` returns a book's line *and* its total together, so there is no longer a way to write one without the other, and the compiler refuses a missing kind. Only the fold back into `complete` needs a gate, and that is what the second test is. Observed red by making exactly that mutation: two of five fixture books turn "complete" and the assertion names why.

- **2026-08-06** — **A report is an instrument, and this one had already misled a decision.** Issue #62 read *"7 with gaps, would fill 1, 5 left alone"* off the output above and concluded a seventh book had fallen through the lookup. Nothing had; the arithmetic was the defect. Worth logging beside G26 because the two rows were found in the same investigation and are opposite failures: G26 is a tool that returned the wrong answer, G27 is a tool that returned a *true* answer about a smaller set than it claimed. The second is the harder one to notice, because every line it prints is correct. `docs/progress.md`'s oldest rule about instruments — *a probe that silently did nothing would be worse than no probe* — applied to a summary line.

- **2026-08-02** — **G1 caught the new script before any of this was committed**, which is the second time the reverse-assert has earned its keep on a change nobody thought was about the adapter: `scripts/make-readme-image.ts` arrived importing `node:fs/promises` with no allowlist entry, exactly as `scripts/worktree.ts` did. One line added, with the justification that matters — its only input is `artifacts/shelf.png` and it never learns what a book is.

- **2026-08-08** — **G26 was replaying refusals as answers, because its corpus had been captured without a Google API key.** `scripts/capture-lookup-recall.ts` read `process.env.GOOGLE_BOOKS_API_KEY` directly and never called `loadEnv()`, unlike the CLI and the deploy — so the invocation printed in its own header, with the key sitting in `.env` where every other command finds it, tripped the script's own *"the corpus will be wrong"* warning and recorded a corpus in which Google 429s. The gate then went green against it for two days. **A quota error is not a negative result**, and one had already been written down as fact: *From Zero to Profit with AI* was pinned `no-match` — "genuinely absent from both providers" — while Google held it all along at 172 pages. That is the confusion [ADR-0005](adr/0005-three-metadata-providers.md) exists to prevent, arriving through the fixture rather than through the code. The lesson is narrower than "load your env": **a gate whose fixtures are captured by a script is only as true as that script's environment, and nothing was checking it.** The warning existed and was printed to a terminal nobody was reading. Fixed in `0092de0`; the corrected expectation is the only one of five that moved, which is why it went unnoticed.
