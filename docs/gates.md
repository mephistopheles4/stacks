# Gates

**The scoreboard.** One row per rule that must never break, mapped to the named
spec that goes red when it does.

Update it in the **same commit** as the gate it describes, the same discipline
[`progress.md`](./progress.md) follows.

---

## Why this file exists

A rule written down and checked by nothing is a comment: it can stop being true
and nothing goes red. A row here exists so the rule **can go red**, and it has
been *observed* going red at least once. *A gate never observed failing is not
yet a gate.*

## Status key

| | |
| --- | --- |
| ✅ | gated, and proven red-capable |
| 🔴 | gate written, currently failing on a real defect |
| ⬜ | no gate yet |

### Every row has a number and a name

`G19` is a stable identifier and tells you nothing. The **Name** column carries a
kebab-case slug (`constitution-scoreboard`, `no-live-network`) and citations
elsewhere spell both: *"See docs/gates.md, row G19 (constitution-scoreboard)."*
Same convention as [`docs/adr/`](adr/), where a record is a number *and* a name.

**The number stays because it is the retirement mechanism.** A rule that stops
applying keeps its number and its row, and the numbering is gapless so the hole
is visible; see below. A name cannot encode absence: a deleted name leaves
nothing behind.

**The slug is anchored, not a third name to maintain.** Where a row names
exactly one `gates/*.test.ts` and no other row names that same spec, the slug
**must equal** the file's stem, so moving a spec forces the name to move with
it. The clause self-exempts the rest without an allowlist: G5 (`vault-is-truth`)
and G13 (`no-third-party-material`) share `repo-hygiene.test.ts`, so neither
uniquely claims it, and G16, G18, G25 and G28 name no `gates/` spec at all.
Those six declare their slug.

G19 asserts all of it: every row has a well-formed slug, no two rows share one,
a derivable slug matches its stem, and every citation in the repo names a row by
its **current** slug. A name written down in twenty files and gated in none is
the second copy [ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) is
about.

Bare `G8` mentions in ordinary prose stay bare; the citation idiom is what a
reader follows.

### Retiring a row

**Mark it, do not delete it.** A rule that stops applying keeps its number and
its row; a deleted row takes with it the fact that the rule was ever considered.
Row numbers are therefore unique and gapless, and G19 asserts both.

The same goes for a rule that was never gated: ⬜ is an honest answer and an
absent row is not. This file is only useful if it is as easy to find what is
*not* protected as what is.

## Invariants → gates

| Row | Name | Rule | Source | Gate | Status |
| --- | --- | --- | --- | --- | --- |
| **G1** | `adapter-boundary` | All vault access goes through the adapter | invariant 4 | `gates/adapter-boundary.test.ts` — an allowlist, each entry justified, each reverse-asserted | ✅ |
| **G2** | `public-build` | Note bodies are private except the `## Thoughts` split, which ships as `notes/<id>.json` and carries nothing else; a public build is coherent | invariant 2 | `gates/public-build.test.ts` — asserted against `publish()`'s output in both build modes, see below | ✅ |
| **G3** | `bad-note` | Never crash on a bad note | invariant 3 | `gates/bad-note.test.ts` — 9 hostile inputs, each with a stated expected kind | ✅ |
| **G4** | `hand-edited-notes` | Hand-edited notes are first-class | invariant 5 | `gates/hand-edited-notes.test.ts` | ✅ |
| **G5** | `vault-is-truth` | The vault is the source of truth | invariant 1 | `gates/repo-hygiene.test.ts` — `library.json` untracked and gitignored, and the staged `covers/`, `notes/` and `held-covers/` with it | ✅ |
| **G13** | `no-third-party-material` | No third-party material is committed, ever | `fixtures/README.md`, `plan.md` §1 | `gates/repo-hygiene.test.ts` — no tracked binary outside two generated directories and four named brand files | ✅ |
| **G14** | `commands` | The documented commands are the commands that exist | AGENTS.md "Commands" | `gates/commands.test.ts` — CLI subcommands and pnpm scripts, both directions. The subcommand pattern reads either quote form, planted both ways | ✅ |

## Contract seams → gates

A seam is a correspondence between two artifacts that nothing verifies. Red
means the two have drifted.

| Row | Name | Seam | Failure mode | Gate | Status |
| --- | --- | --- | --- | --- | --- |
| **G6** | `site-core-imports` | site → `@stacks/core` | a *value* import drags `node:fs` and sharp into the browser bundle and **the shelf silently never boots** | `gates/site-core-imports.test.ts`. ⚠️ **Two lint rules reproduce this gate, and both checks are kept on purpose**. `@typescript-eslint/no-restricted-imports` on `@stacks/core` with `allowTypeImports`, and `@typescript-eslint/no-import-type-side-effects`, both scoped to `packages/site/**/*.ts` in `eslint.lint.config.mjs` and run by G46 (`lint`), agree with this gate on all four documented cases. **Both are load-bearing**: the first *admits* `import { type X }`, the case this gate exists for, and the second is what catches it, with a `--fix`. **They fail independently, which is the argument**: this gate reads source as text, needs no TypeScript program and survives an edit to a lint config nothing gates; the pair needs type information, names the file, line and rule, and survives a regex a Prettier run breaks. ⚠️ **This gate reaches further**: a dynamic `import('@stacks/core')` passes the pair and fails here, and the pair matches a subpath by name where this gate measures that it imports nothing. Removing either check is a separate change owing its own reason | ✅ |
| **G7** | `astro-no-logic` | logic in `.astro` | ⚠️ **This row's warrant is not that `.astro` goes untypechecked**: `astro check` runs inside `pnpm build` (G50). What holds is that `.astro` sits outside **one** scope list, which both counters read. All ten globs in `stryker.scopes.json` end `*.ts`, and `scripts/lib/complexity.ts`'s `populationOf` takes its population from those same globs — so logic in an `.astro` file is **counted by nothing**, by neither mutation score nor complexity series, and the text scan is what stands in for that | `gates/astro-no-logic.test.ts` | ✅ |
| **G8** | `frontmatter-contract` | frontmatter contract ↔ parser ↔ AGENTS.md | a key the parser accepts but the contract never documents | `gates/frontmatter-contract.test.ts` | ✅ |
| **G9** | `env-contract` | `.env.example` ↔ `process.env` (`PUBLIC_PLAUSIBLE_DOMAIN` is held through `scripts/deploy.ts`, which reads it literally; the config and `vite.define` are invisible to this gate, #562) | a variable the code needs and no one knows to set | `gates/env-contract.test.ts` | ✅ |
| **G19** | `constitution-scoreboard` | the constitution ↔ this scoreboard | an invariant nothing scores, a row naming a moved file, a gate nobody recorded | `gates/constitution-scoreboard.test.ts` | ✅ |
| **G29** | `doc-links` | a document's links ↔ the file tree | a moved or renamed file leaves every route to it a dead end, and nothing says so | `gates/doc-links.test.ts` | ✅ |
| **G30** | `library-seam` | `BookRecord` ↔ `library.json`, both ways | a field the vault holds and no `keyIfPresent` line ships: the note has it, the shelf never sees it, every other test passes | `gates/library-seam.test.ts` | ✅ |
| **G31** | `merge-precedence` | the precedence table ↔ the merge | a provider order the code implements and no document names, or the reverse — and the `; ` subjects separator, which two packages hold | `gates/merge-precedence.test.ts` | ✅ |
| **G32** | `absent-only` | a key a note already carries is never rewritten | a merge change quietly replacing values on books that were correct — the characteristic failure of this effort, and structurally prevented rather than detected | `gates/absent-only.test.ts` | ✅ |
| **G33** | `enrich-idempotence` | running `enrich` twice changes nothing the second time | the only gate that reaches the `## About` body insert, since a body section is not a `FILLABLE` key and the absent-only gate cannot see it | `gates/enrich-idempotence.test.ts` | ✅ |
| **G34** | `enrich-convergence` | a book a provider failed on is filled by the next run | the pacing answer for iTunes' ~20/min is "run it twice", and it rests entirely on an `http.ts` property nothing checked: a success is cached forever, a failure is never cached at all | `gates/enrich-convergence.test.ts` | ✅ |
| **G35** | `enhanced-card` | picking a book up, as a browser does it, at both viewports (spec §3.5) | A real click on a book reaches the held state with that book's title on its page and **`location.href` unchanged**, **and the book arrives closed**: the front board at 0° ±0.5° to the page block read from the scene, the pages hidden by `visibility` until the visitor opens it by a real click on the held book, the X on screen, the header's hint saying a click opens it and the Open button named for the book. Then, open: every block and link check, the announcer changing for a second book and emptied by put-back, the put-back X a named `<button>` outside the pages, on screen closed and open, **turning the closed book**: a real drag on the canvas and one arrow key turning the closed book without opening it, a press that wobbles 8 px out and back neither opening it nor putting it back, a tap opening it square, both close controls (the back arrow by the title and "Close the book" at the foot, selected by class) returning it to the closed rest with focus on the X, a put-back right after a close playing the return (sampled per frame, strictly between the rest and home and never rising), Escape putting it back from closed, open and mid-close and the back button from mid-close, the held copy worn when the book has one and the shelf copy when it has none or the held copy fails, no `<dialog>` on the page but `#notice-dialog` (`turnFailures`); the back arrow inside the left page's top-left quarter at 1280×800 and in the top half of the viewport before and after the right page scrolls to its end at 375×812 and at least 40 px wide on the phone (`arrowFailures`); the X inset to `clamp(0.75rem, 3vw, 1.5rem)` read at every size the gate visits, 800 wide included (`insetFailures`), the hint hidden over an open book and, read once the book is on its way back, while it returns, and reading the shelf's words again once the hand empties (`controlsFailures`); and the hint, the brand and the X meeting no page and no closed book at four sizes, each with the fixture's tallest and its thickest book (`overlapFailures`), and at 375×812 the right-hand page alone, led by the title, with the X on screen closed and open. **And the closed book's controls** (`checkClosedControls`, judged by `controlsFailures`): a mouse, a touch and a keyboard each open it and each put it back, from closed and from open, at 1280×800 and 375×812; the X at least 2.75rem, overlapping neither the brand, the hint nor the closed book, and the top element at its centre also over an open page; the Open button in the accessibility tree while closed and gone the moment it opens; the longest title, focused at 375×812, fully on screen with the X where it was; focus on the right-hand page after Open, also under reduced motion; reduced motion cutting the pickup, the opening and the put-back; the X's markup, and no CSP violation; the hint and the cursor. It writes `artifacts/held-closed.png` and `artifacts/held-closed-phone.png` for the owner. **And every cell of the Ask drawer's tables over a held book** (`checkDrawerCells`, `drawerFailures`), a chat link reached by dispatching `stacks:pick-up`, and **a context lost with a book held**, closed and open (`checkLostWithBookHeld`, `lostFailures`). ⚠️ **No pointer path reaches another book with one held**: the held book stands in front of the shelf and covers all of it at 1280×800, so "a click on another book" has no browser cell, nor has a click while the book lifts, which is a race (the rule is `pickup-state.test.ts`'s). **And the open spread at rest (§3.6)**, computed from the scene through `window.__shelf.spread()` at 1280×800, never from pixels: the front board at 180° to the page block and both pages square to the camera, ±0.5°; the left page the page block's height and width, ±1 px projected; no gap wider than 1 px at the gutter. **And the held page at rest**, in a browser context of its own with every `notes/<id>.json` answered by intercepted, invented Thoughts far taller than the page: they scroll once the book has landed and the wheel brings the links row into reach, and GSAP's own ticker stays asleep, read as at most one `requestAnimationFrame` callback a frame over 30 frames of the pickup and of its opening. Those three are judged by `atRestFailures`, each planted red in the spec. **And the two notice pages** (`checkNoticePages`), with JavaScript off at 1440×900 and 375×812: `/attribution` and `/privacy` each carry their text, a way back to the shelf and `noindex`, set in body text of at least 18 px at 7:1 against its background and 1.5 times the size in line-height, and neither scrolls sideways. The modal's cells read the same properties through the same function. **And the notice modal opened from the shelf's Attribution link** (`checkNoticeModal`; the drawer and a held book are `checkNoticeOverDrawer`'s), at both widths: a plain click opens it with focus on the close button and the dialog named "Attribution"; Tab cycles inside it at both ends; the in-notice link to the privacy notice swaps the panel, the name becomes "Privacy" and focus lands on its heading; the type equals the direct page's property for property; the last line of each notice scrolls into view by keyboard; one Escape closes it and focus returns to the link; a click on the backdrop closes it; a ctrl-click opens the page in a new tab and not the modal; and nothing navigated while a `window` sentinel survived. **And a notice over the Ask drawer and a held book** (`checkNoticeOverDrawer`), from each of its two links, at 1280×800: a book held, the drawer opened over it, a question sent and answered (the offline build's unavailable reply), then open and close the notice, reading from each link the dialog's accessible name, the focus at the open and the focus back on that link, three clicks on the backdrop (the shelf, the corner by the brand, the drawer panel beside the notice), a click on the notice text, `Home`, an arrow and a down arrow with focus on `body`, and one Escape. Each step leaves the drawer's `aria-expanded`, the held title, phase, opened state, turn and the thread text exactly as they were; the second Escape is the drawer's; no new tab opens, nothing navigates and a `window` sentinel survives. The no-dialog fallback, where the shelf link navigates and the drawer link opens a new tab, is not a standing cell: `notice-modals.md` N6 states it. | `scripts/smoke-render.ts` — `checkPickup`, `checkTurn`, `checkOverlap`, `checkPhone`, `checkSpread`, `checkHeldAtRest`, `checkClosedControls`, `checkDrawerCells`, `checkLostWithBookHeld`, judged by `scripts/lib/pickup-gate.ts`, every clause planted red in `scripts/lib/pickup-gate.test.ts`; and `checkNoticePages`, `checkNoticeModal` and `checkNoticeOverDrawer`, which judge themselves inside `scripts/smoke-render.ts` | ✅ |
| **G36** | `trend-layer` | the series CI writes ↔ the `## Trends` table | a number nobody was told to read, a row promising a line that will never be drawn, or a trend named after a gate slug — which G19 structurally cannot see, because `slugByRow()` reads three hardcoded tables and the Trends table is a fourth | `gates/trend-layer.test.ts` — asserted against the rendered OpenMetrics text, not against the declaration list | ✅ |
| **G37** | `agents-import` | the rules ↔ the file Claude Code opens by name | `AGENTS.md` carries the rules and Claude Code reads only `CLAUDE.md`, so the stub's `@AGENTS.md` import is the whole mechanism — and a rule pasted into the stub is the second constitution [ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) refused, per [ADR-0056](adr/0056-the-constitution-is-agents-md.md) | `gates/agents-import.test.ts` — the import line is also the control the absences rest on | ✅ |
| **G38** | `mutation-scope` | the declared mutation scopes ↔ the tree they claim to score | excluding a directory takes it out of numerator and denominator together, so the score does not move — it stops covering that code, and the change is invisible in the instrument built to catch changes. `git mv packages/core/src/covers packages/core/src/cover` resets a floor and reads as a refactor in review | `gates/mutation-scope.test.ts` — **and `scripts/deploy.ts`; this row runs on two surfaces**, see below | ✅ |
| **G40** | `action-pins` | `gates.yml`'s pinning argument ↔ every `uses:` line under `.github/` | a tag or a branch where a SHA is claimed, or a SHA whose version comment was deleted to satisfy the pin — and the file argues the case carefully while nothing holds it to its own argument. ⚠️ **It proves the shape of the reference, never the truth of the comment**: a hand-edit swapping in a different valid SHA under `# v7.0.1` passes cleanly, because that fact lives at GitHub and G21 forbids the suite from asking — `cover_source`'s failure verbatim, and there is no offline route because actions have no lockfile | `gates/action-pins.test.ts` — sweeping `.github/**/*.yml\|yaml`, not `.github/workflows/`, because a composite action is the cheap way past a narrow glob. It also holds the required check to every other job in `gates.yml`: each must be in the aggregator's `needs:` and compared against `success`, a list derived from the file rather than written down | ✅ |
| **G41** | `gate-register` | `docs/gates.md`'s numbered rows ↔ `docs/log/2026-08-20-gate-register.md`'s row sections | a row whose five questions nobody asked, or an entry for a row that never landed — and **membership is not enough**: a file with two `## G26` sections satisfies *"each row has an entry"*, and one merged verdict bullet names all five category words while a count keyed on one of them reports a total silently short. Cardinality, in both directions | `gates/gate-register.test.ts` — row-side floor at 42, safe only under mark-never-delete plus gapless making the count non-decreasing | ✅ |
| **G43** | `ignored-mutants` | `stryker.floors.json`'s `ignored` counter ↔ a real sweep of the mutated source | a disable directive takes a mutant out of the denominator from inside a source file, nowhere near the Stryker config and nowhere near the floors file — of the three routes down it is the only one leaving no trace in either file a deploy reads. Caught at merge rather than at deploy, which is what matters where `required_approving_review_count: 0` leaves the gate suite and CodeQL the only two things that can stop one | `gates/ignored-mutants.test.ts` — the judgement is planted in `scripts/lib/floors.test.ts`; this asserts only what the disk says | ✅ |
| **G47** | `ignored-clones` | `jscpd.floors.json`'s `ignoredLines` counters ↔ a real sweep of the tree, and its `duplicationHash` ↔ the installed jscpd | a suppression block takes its lines out of the clone count and out of the total-line denominator **together** — so the percentage does not move, the count falls, and the change lives in a source file nowhere near any file a deploy reads. G43's shape applied to a second tool, at merge for G43's reason. ⚠️ **The counter records what the source *declares*, not what jscpd removed**: jscpd honours a block only when no code follows it, so one in the middle of a file does nothing, silently. ⚠️ The hash half does **nothing** for `stryker.floors.json`: that file's `configHash` is **G56**'s, and its `fixtureHash` is watched by nothing at merge, deliberately — and that stamp digests the two counter **inventories** rather than the installed tool versions, so a behaviour change reddens `complexity.test.ts` or `cognitive.test.ts` instead ([ADR-0084](adr/0084-the-counting-stamp-is-behaviour-not-a-version.md)) | `gates/ignored-clones.test.ts` — the judgement is planted in `scripts/lib/duplication.test.ts`; this asserts only what the disk says. ⚠️ **It cannot run inside Stryker's dry run, and is excluded in `vitest.stryker.config.ts`**: the sandbox is a copy of the tree with every mutant site rewritten, so a gate that reads the real tree would assert against instrumented files. **Every gate not excluded there runs in the dry run.** | ✅ |
| **G56** | `config-hash` | `stryker.floors.json`'s `configHash` ↔ `configHashOf(strykerConfig)` | scoring configuration changed without its stamp, or a stamp without its configuration, and the change reaches `main` with every check green. ⚠️ **The drift is never silent, and *not caught* and *not noticed* are different sentences**: `floorRefusals` reads a run stamped with a different hash as evidence and refuses **whatever is armed**, because the `armed` predicate guards only the absent-hash branch — so the cost of a stale stamp is that `pnpm deploy:site` stops with a release in hand. ⚠️ **`fixtureHash`'s *value* is deliberately not watched here and the gate says so**, G47's convention: re-deriving `fixtureHash` needs a full counting run, which a merge check will not do, so the value stays unwatched at merge on cost ([ADR-0079](adr/0079-the-floors-stamp-is-compared-at-merge.md)). The stamp no longer digests the installed tool versions, so a dependency bump reddens nothing here. **G57 watches its *reason* instead** | `gates/config-hash.test.ts` — the judgement is planted in `scripts/lib/floors.test.ts`; this asserts only what the disk says. It needs no armed scope and no metrics record, which is what lets it run at merge rather than at deploy. ⚠️ **The red names `pnpm mutation:stamp`, the command that writes the stamp**, and a clause reads `package.json` so the message cannot outlive it. ⚠️ **It runs inside Stryker's dry run and G47 does not**, which is a difference of fact rather than of care: both files it reads are matched by no `mutate` glob, so the sandbox holds them uninstrumented. ⚠️ It compares two stamps and says **nothing about the floors between them** — restamping makes the file self-consistent, not correct | ✅ |
| **G57** | `renovation-markers` | every stamp in a floors file ↔ an entry in `renovations.json` explaining it | a stamp says *these two numbers are not comparable* and never *why*, so a reader of the trend page meets a step change and supplies their own story — and calibration-window restarts, each justified only in prose inside `stryker.floors.json`, are never summed. ⚠️ **This is a merge check and not a deploy refusal**: a refusal a written sentence clears is an override wearing a reason, and [ADR-0061](adr/0061-the-mutation-floor-refuses-deploy.md) and [ADR-0068](adr/0068-the-complexity-cap-only-falls.md) provide none on purpose. It reads the disk and needs no metrics record, which is what lets it run at merge — G56's footing. ⚠️ What is watched here is the **reason**, never the value: a bot cannot re-derive a stamp, and nothing here asks it to ([ADR-0079](adr/0079-the-floors-stamp-is-compared-at-merge.md)) | `gates/renovation-markers.test.ts` — three stamps, keyed on the stamp and never on the file, because `duplicationHash` lives in `jscpd.floors.json` and a fix landing on one instance leaves its siblings alive. ⚠️ **Observed red three ways**, recorded in [the gates history log](log/2026-11-12-gates-history.md). A typo'd stamp name is a **parse error** by design — `parseCaps`' rule, so `"fixturehash"` cannot land as a free entry and leave the real stamp unmarked. ⚠️ **A change that moves no stamp is uncheckable here by construction**: `renovations.json` accepts a free entry for one, and nothing can force it, because forcing means a comparison and there is no stamp to compare against | ✅ |
| **G58** | `adr-index` | `docs/adr/`'s record files ↔ `docs/adr/README.md`'s index table, keyed by the number | an ADR number carried by two records, which **merges silently** in a corpus whose records cite each other by number. ⚠️ **Uniqueness and never contiguity**: a number abandoned on a dead branch leaves a hole that filling would let a stale reference on that branch misread. **A gap is free and a duplicate is silent**. ⚠️ **It is not coordination between sessions**: a collision lives on an unmerged branch and a merge-time check sees only the second to merge, so it turns a silent landed collision into a late red. The row-to-file direction stays with G29 (`doc-links`) | `gates/adr-index.test.ts` — uniqueness is asserted **twice**, among the files and among the rows, because two files under one row fails only the first and two rows over one file fails only the second. Each row's number column is held to its link's number. A record filename or index row in a shape the sweep cannot read is refused rather than skipped. A duplicate-numbered file with its row, a record with no row, and a second row for one number are each kept permanently as a synthetic case in the same file | ✅ |

**G13 allows one file this project did not make**: Google's *powered by
Google* graphic, which the API terms require displayed and forbid altering — so
unlike the card's three provider marks, which are redrawn
([ADR-0050](adr/0050-provider-marks-are-redrawn-monotone.md)), it cannot be
redrawn or replaced with text. It is named as a **file**, for the reason the
paragraph below gives about directories.

⚠️ G13 reads what git tracks, so a local `pnpm test` before `git add` passes
over an untracked binary, and CI goes red on the same code. Stage, then run.

**G13 allowlists a directory for the README's screenshot**,
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
gate renders the fixture vault.

**The brand art is four filenames, not a directory**, and the reason is
the same rule read the other way round. Its provenance is the cleanest this list
holds — the mark and the share card were drawn for this app, so there is no
third party anywhere near them, and that is exactly the claim an entry here is
*for*. But they live in `packages/site/public/`, which is where
`stacks build --public` stages a real vault's covers. A prefix entry there would
have permitted the thing G13 exists to stop, in the one directory where a real
cover is already on disk.

The row checks the other direction too: an allowlisted file that stops being
tracked goes red, because the page links all four and nothing else here would
notice a 404 on every visit. `og.png` is why that half is worth having: the
way it breaks is a build quietly rendering over the committed art, or somebody
deleting it as stale output — and a 1200×630 PNG at the expected path passes the
size check either way. G5 pins the same seam from the other side, asserting that
no ignore rule names `og.png` while everything else `publish()` stages is
ignored.

The assertion that no ignore rule names `og.png` reads the ignore
*rule* rather than asking whether the file is ignored. `git check-ignore`
consults the index and never reports a tracked file as ignored — correct, since
tracking wins — so the obvious spelling passes green with the rule sitting right
there in `.gitignore`, which is the exact state it exists to catch. `--no-index`
reads the rules instead of the outcome.

**Columns are found by reading the header row, never by position.** `[2]` on a
table with a column inserted before it returns a real string from the wrong
cell rather than nothing, so the citation check would ask the wrong column
whether it mentions an invariant and keep passing. A missing header **throws
naming the column** rather than returning `-1` and reporting "no invariant is
cited" — the `markdownSection` argument one level further in — and the message
names `Source` or `Name` rather than the symptom.

**G19 gates this file**, so the document whose entire job is to record which
rules are mechanically enforced is not itself a documented claim resting on
somebody remembering.

It asserts in both directions: every numbered invariant in `AGENTS.md` is cited
by some row (⬜ is an acceptable and honest answer); no row cites an invariant
that no longer exists; every spec path named here resolves to a real file; every
`gates/*.test.ts` appears somewhere here, so a gate cannot be written and left
unrecorded; every row carries a status drawn from this file's **own key** rather
than a list hardcoded in the test; row numbers are unique and gapless, so
retiring a rule means marking it rather than deleting the evidence it was ever
considered.

A renamed `## Invariants` heading throws rather than passing over an empty set.
Adding an invariant, moving a spec or writing a gate owes this file a matching
edit in the same change.

Three anchoring rules hold the checks to the cell that carries the claim:

- **A spec path is any backticked path in a row with a directory separator and
  a `.ts` ending**, not only one beginning with `gates/`, `packages/` or
  `scripts/`; the filesystem answers whether it resolves.
- **A gate counts as scored only if its filename appears in a row**, never in a
  paragraph.
- **A citation counts only from the Source cell of the Invariants table**,
  never from the words "invariant N" in another cell or row — a gate that
  matches prose matches anything.

The shared lesson is one line — *anchor an assertion to the cell that carries
the claim, not to the row and never to the document* — and the constitution's
article numbers are held to the same uniqueness-and-no-gaps rule as these row
numbers.

**G29 exists because the documentation is a graph and nothing checked its
edges.** `AGENTS.md` routes a cold session to the files it names by link, every
ADR links back here, and this file links out to the specs it scores. The count
of links lives in the gate's vacuity floor, where it can go red, and never in
prose.

**No network, by construction.** `http(s):` and `mailto:` targets are skipped
rather than fetched. Fetching would violate G21 and be flaky, and the failure
this gate is for — a moved file — is entirely local. An external link checker is
a different tool with a different failure mode and does not belong in `pnpm test`.

**Prose *quoting* a path is not a link to it.** Fenced blocks and inline code
spans are blanked before links are extracted, so documenting the gate in a code
span is not an error. Blanking inline code can in principle hide a *real*
link — a line with mismatched backticks pairs the wrong two and swallows
whatever sits between them — which would be a false green of exactly the kind
this row exists to prevent.

**A same-document link — `[x](#heading)` — is checked against its own file's
headings.** It has its own floor, just under the real count, apart from the
cross-file fragment floor — a single combined floor would let either population
fall to zero while the other held it up.

**This row states no totals**: a prose claim about a corpus is stale one commit
later, not one release later, so the count of links belongs in the gate's own
vacuity floors in `gates/doc-links.test.ts`, where it can go red, and never in
prose. Each floor is set just under the real number rather than at a round
order-of-magnitude guess — left far below, most of the corpus could stop being
checked in silence — and is raised as the corpus grows.

**The slug is `github-slugger`'s — the offline reimplementation of GitHub's
anchors that G29 follows — and not a hand-kept imitation of it.** A slug that
disagrees with GitHub has no direction: the author of the red link writes the
anchor the gate accepts, and that anchor is dead on GitHub.

## Defect gates

Rows that exist because a specific defect got through — except **G17, G18, G22
and G61**, written for defects that had not happened (G17 and G61 because the
change each shipped with made one reachable, G18 because somebody outside the
project looked, G22 because a rule was copied a third time), and G20, G23, G24
and G25, which exist because one rule had several implementations. Each was
written to fail first.

Rows are named, never counted or placed by position ("the last", "four"). A
positional reference to a table that grows is the same species as a count in
prose: it goes stale with nothing red. A name breaks loudly when a row is
renumbered, and a row's number is not knowable until it lands.

| Row | Name | Rule | Gate | Status |
| --- | --- | --- | --- | --- |
| **G10** | `cover-path` | one cover-path rule, one implementation | `gates/cover-path.test.ts` + `packages/core/src/covers/cover-path.test.ts` | ✅ |
| **G11** | `build-modes` | the two build modes differ only where documented | `gates/build-modes.test.ts` | ✅ |
| **G12** | `shelf-order` | `shelf_order` semantics | `gates/shelf-order.test.ts` | ✅ characterized |
| **G15** | `cover-budget` | what ships fits in a phone's graphics memory | `gates/cover-budget.test.ts` | ✅ |
| **G16** | `books-in-case` | every book stays inside its own case | `pnpm smoke:render` | ✅ |
| **G17** | `deploy-branch` | a deploy publishes `main`, or says why not. ⚠️ **The arm asserting the guard lets `main` through executes only on the push run after a merge**: `gates.yml` runs on `pull_request`, `actions/checkout` builds `refs/pull/N/merge`, so `branch === 'main'` is never true on a pull request — **every pull request is green on it by construction, including one that breaks it**. ⚠️ **So this row fails the merge rather than the change**: in a merge train it reddens `main` between merges and blocks whoever is queued, for a defect in nobody's diff. **Its reds have had one cause** — an assertion that could not hold on a CI checkout, or a cold spawn past the guard on a loaded runner; the next would be the same cause, not bad luck. **The path has a pull-request twin**: `--stop-after-record` ends the run by design after step 0b's line and before G39 judges anything, so a test drives the real checkout with `--any-branch` down the same path — no mirror, the same cold spawn, the same budget — on every pull request, and the `main`-only test ends at the same designed stop instead of at the absent ref. ⚠️ **What is still `main`-only is one decision**: `--any-branch` returns before git is read, so `branch === 'main'` on the real checkout is still exercised only after a merge — the scratch repositories cover the decision, not the wiring. **The discriminator** still applies to that residue: on a red `main` here, re-run the failed jobs unchanged before investigating, and after merging anything, check the push run and not only the pull request | `gates/deploy-branch.test.ts` — its last two tests read the real checkout, the pull-request twin and the `main`-only arm, each with a timeout whose reasoning lives in the comment beside the second | ✅ |
| **G18** | `bounded-cover-bytes` | a provider's bytes are bounded and are an image | `packages/core/src/covers/download.test.ts` | ✅ |
| **G20** | `public-build-artifact` | one inspection of the folder about to be published. ⚠️ **It holds two CSP shapes, off and on, by an `analytics` argument and never by the environment** ([ADR-0139](./adr/0139-optional-plausible-direct-to-plausible-io.md)): on adds `https://plausible.io` to `connect-src` and nothing else, an off build may hold no `plausible.io` and no module script on its notice pages, and `/privacy` names Plausible only in an on build (the `privacy` rule), **and the same three checks read the `notice-privacy` panel sliced out of `index.html`** when the page holds the notice modal (`notice-modals.md` C8): text elsewhere on the shelf page cannot satisfy it, and a page that holds the modal without that panel is red. `gate:public` always passes `off` | `gates/public-build-artifact.test.ts` | ✅ |
| **G21** | `no-live-network` | no test makes a live network call | `gates/no-live-network.ts` + `gates/no-live-network.setup.ts`, specced by `gates/no-live-network.test.ts` | ✅ |
| **G22** | `cover-candidates` | one cover-preference rule, one implementation, right way round | `gates/cover-candidates.test.ts` + `packages/core/src/covers/cache-cover.test.ts` | ✅ |
| **G23** | `key-if-present` | one absent-key helper, one implementation, under any name | `gates/key-if-present.test.ts` + `packages/core/src/key-if-present.test.ts` | ✅ |
| **G24** | `repo-root` | one repo root, one derivation | `gates/repo-root.test.ts` | ✅ |
| **G25** | `one-usable-width` | the packer's capacity and the placer's consumption are one number | `packages/site/src/shelf/shelf-width.test.ts` + `packages/site/src/shelf/books.test.ts` | ✅ |
| **G26** | `lookup-recall` | a lookup finds books the providers demonstrably have — and still refuses the ones they do not | `gates/lookup-recall.test.ts` + `gates/recall-corpus.ts`, replayed from `fixtures/api/lookup-recall.json` | ✅ |
| **G27** | `enrich-report` | a command's report accounts for every book it counted | `gates/enrich-report.test.ts`, over `packages/cli/src/enrich-report.ts` | ✅ |
| **G28** | `no-board-collisions` | no book's board passes through its neighbour's | `packages/site/src/shelf/placement.test.ts` | ✅ |
| **G39** | `metrics-freshness` | the trend record is fresh **per series**, because one series going quiet while the others stay healthy is the failure the record exists to expose — and an aggregate check cannot see it. A gated series with **no sample at all** refuses exactly as a stale one does, which makes the check parse samples rather than filenames | `gates/metrics-freshness.test.ts` — the refusal is `pnpm deploy:site`'s, driven onto a scratch repository via `GIT_DIR` on G17's idiom; the dated half is `scripts/lib/metrics-read.test.ts`, because the script cannot be told what day it is | ✅ |
| **G42** | `dependency-audit` | a dependency with a known high or critical advisory reaching `main` | the `audit` job in `.github/workflows/gates.yml`, running `pnpm audit --audit-level=high` — asserted by the `action-pins` spec, which reads the job, its threshold, and its place in the `gates` aggregator's `needs:`. It is a row because G19 (`constitution-scoreboard`) reads rows only: a job described in a paragraph would sit green and false the day the job was deleted | ✅ |
| **G44** | `stryker-reporters` | the mutation run's Vitest reporters ↔ the ones a laptop resolves. Vitest appends its `github-actions` reporter **only to a list that resolved empty**, and that reporter's job summary appends to `$GITHUB_STEP_SUMMARY` once per `onTestRunEnd` — once under `pnpm test`, once **per mutant** under Stryker. Over the real scope of ~5900 mutants that is 1054k, past the 1024k GitHub accepts. ⚠️ **Nothing local can catch it**: `GITHUB_ACTIONS` is unset on a developer machine, so the reporter is never added and the file is never written | `gates/stryker-reporters.test.ts` — two clauses, because the option is worth nothing in a file Stryker does not load: the `vitest.configFile` wiring, then a **non-empty** `reporters`. ⚠️ It proves the condition, never Vitest's honouring of it — G40's stated limit | ✅ |
| **G45** | `deploy-flags` | every flag `pnpm deploy:site` reads is a flag `docs/commands.md` documents, and the reverse. A flag that skips the whole four-gate contract on a path that still uploads must be documented, not left in the implementation alone. ⚠️ **G17 pins which spellings override the branch guard; this row pins the flags that clear the contract.** | `gates/deploy-flags.test.ts` — the roster in both directions, floored at 3 a side so a regex that stops matching cannot pass two empty sets off as agreement, plus a third clause pinning the extraction itself: every `process.argv` occurrence in the script must be a literal `--flag` test, or a flag read some other way is undocumented by construction. That pattern reads either quote form, planted both ways. ⚠️ It pins the roster, **never a flag's reach**: the gate commands sit past step 0 and every harness that drives this script stops there. Reach is held by the comment convention at `fail()`, and named as a comment | ✅ |
| **G46** | `lint` | a floating promise, an unhandled union case or an unsafe use of `any` reaching `main`. The complexity counter's ESLint config is a population report and never a verdict, so this row loads a config of its own; `tsc --noEmit` does not catch these. ⚠️ **This row overlaps G6 (`site-core-imports`) on purpose.** The two rules that reproduce G6 exactly, on all four of its documented cases, are `no-restricted-imports` and `no-import-type-side-effects`, **in none of the five presets**: both are enabled for the site package only; why both checks stay is recorded on G6's row | `pnpm lint` — `eslint.lint.config.mjs`, the type-checked recommended set tuned to four repository idioms plus `switch-exhaustiveness-check`, over every `.ts` file, tests included, and G6's two opt-in rules over the site package. Run by the `style` job in `.github/workflows/gates.yml`, beside `audit` rather than inside the `suite` matrix, because a lint verdict cannot move with the Node version. ⚠️ **Nothing gates the config**: four tuned options are four places a rule can be weakened later, the site pair's two entries and their `files` glob are more, and no gate here reads a lint config — [recorded, not solved](#not-gated-deliberately) | ✅ |
| **G48** | `markdown` | a pull request that breaks the documentation's shape, with the fix command in the output. It catches what the other documentation gates cannot: a row with the wrong cell count, whose `✅` does not render; a dead same-document anchor (`gates/doc-links.test.ts` checks `#` targets, and MD051 stays for a wrongly cased `[x](#Title)`, which G29 accepts and MD051 refuses); and a duplicate heading in the file G41 extracts **by heading**. ⚠️ **The rule set is narrow because a default run is dangerous and its damage is silent**: at default rules a fix pass rewrites files, corrupts issue references, code spans and a verbatim quotation, with every test green (the figures are in [ADR-0075](adr/0075-the-markdown-fix-flag-is-allowlisted.md)) | the `style` job in `.github/workflows/gates.yml`, running `pnpm lint:md` at the rule set in `.markdownlint.jsonc` — asserted by `gates/markdown.test.ts`, which reads the job, its command, and its place in the `gates` aggregator's `needs:`. ⚠️ Its second clause **measures rather than declares**: one probe document per adopted rule is linted, fixed and linted again, so the seven rules `pnpm lint:md:fix` may rewrite are checked against what the installed version actually rewrites. A bump that widens that set is red here and refused by the command before it touches a file | ✅ |
| **G49** | `format` | a source file whose shape nobody normalised. The cost is not cosmetic: an extraction regex that hardcodes one quote form finds nothing in the other, and its red (*extraction found 0 CLI subcommands*) names no quote. ⚠️ **It is blind to the four `.astro` files**: Prettier infers a parser from the extension and has none for `.astro`, so a directory sweep skips 979 lines — every stylesheet rule the site has — **in silence, exiting 0**. Named on the command line those same files error. So a green here is not a coverage figure, and `docs/commands.md` says so where the command is documented | the `style` job in `.github/workflows/gates.yml`, running `pnpm format:check`; `pnpm format` is the whole remedy, which is what admits a style rule to the aggregator under the reach test in [`docs/spec/static-analysis-and-style.md`](spec/static-analysis-and-style.md) §2. Configured in `prettier.config.mjs` and `.prettierignore`, each setting carrying its measured reason; [ADR-0074](adr/0074-prettier-formats-code-and-nothing-else.md) | ✅ |
| **G50** | `astro-types` | a type error in an `.astro` page's frontmatter reaching `dist/`. G7 reads `<script>` blocks as text and the compiler does not read `.astro` at all, so the **frontmatter** — real TypeScript that really runs at build time — is typechecked by this row alone; a wrong-typed call planted there passes `pnpm typecheck`, G7 and an unchecked build, and ships into `dist/index.html` | `astro check`, run as the first half of `packages/site`'s `build` script, inside `pnpm build`, which the `suite` matrix already runs — **not** in the `style` job, per [`docs/spec/static-analysis-and-style.md`](spec/static-analysis-and-style.md) §4. `gates/astro-types.test.ts` pins the wiring in four clauses, because a gate living only as a substring of one npm script is G45's finding exactly. ⚠️ **The order is load-bearing and asserted**: `astro build && astro check` still reports the error and has already written the output carrying it. ⚠️ It pins the wiring, **never the checker's verdict** — G40's and G44's stated limit; the verdict is the perturbation recorded on this row in [`docs/log/2026-08-20-gate-register.md`](log/2026-08-20-gate-register.md). ⚠️ **The compiler pin is load-bearing**: `@astrojs/check@0.9.10` declares `typescript: ^5.0.0 \|\| ^6.0.0`, so [ADR-0066](adr/0066-typescript-6-until-7-1.md)'s revisit at TypeScript 7.1 un-runs this gate unless the checker has widened first | ✅ |
| **G51** | `coplanar-faces` | a member of the bookcase sitting back on a plane an upright owns. Every member is a box, and **two faces that share a plane while overlapping in the other two axes** are the condition for two fragments to arrive at the same depth and let floating-point precision decide which one draws, with the camera's near and far of 0.1 and 100 leaving the depth buffer nothing to separate them with. ⚠️ **A texture does not cause this, it reveals it**: the backboard is a second material in a second colour while every other woodwork face carries the identical flat one, so only the pairs the backboard takes part in could flicker, and every other pair becomes visible at once the moment a texture lands. ⚠️ **Fixing the pair somebody points at leaves the rest**: shortening the planks in `x` still leaves every backboard pair *and* the plank front and back faces at `z = ±0.36` | `gates/coplanar-faces.test.ts` — the whole class enumerated from `SHELF`, `PLANK_INSET` and `BACKBOARD_INSET` at five row counts, the count derived as `8 × (rows + 1) + 6` rather than written down. ⚠️ **The un-inset count is asserted first, as the positive control**: an enumerator that has stopped matching reports zero ties on a geometry riddled with them, and a gate asserting only *zero* would call that a pass. A further clause holds the backboard at **twice** the plank's inset by re-creating the tie an equal one would make — 10 pairs at `±1.786`, which the uprights happen to hide. ⚠️ **It mirrors `buildShelf`'s arithmetic and never reads the scene graph**, G40's and G44's stated limit, so a last clause reads the three `BoxGeometry` calls in `buildShelf` and refuses a member sized off no inset — the vacuous green where `bookcase.ts` is correct and nothing consumes it. | ✅ |
| **G52** | `sheet-size` | a woodwork sheet too big for the shelf to afford. **G15 (`cover-budget`) counts cover bytes only and would not notice an 8192-square file**: it stages the fixture vault through the publisher and measures what lands in `covers/`, and a file committed straight into `packages/site/public/` passes through none of that — so the shelf's *furniture* is measured by this row alone. ⚠️ **The cost that matters is decode, not download**: a sheet is a few hundred kilobytes on the wire and `edge² × 4` bytes of RGBA once it reaches the GPU — 4.0 MB at 1024, **16.0 MB at 2048**, uploaded before the first frame beside every cover. It is the arithmetic G15 applies to covers, held here for the one asset class G15 does not read. ⚠️ **`smoke:render` sees none of it** — a desktop context with gigabytes of headroom | `gates/sheet-size.test.ts` — two caps over every file in the site's public wood directory, because two different things go wrong: the **long edge**, which is what reaches graphics memory, and the **byte size**, which notices a sheet re-encoded at a quality nobody asked for and dimensionally innocent. ⚠️ **Neither cap is derived from what is in the directory today**, which would be a floor equal to a population — both are set against the sheets the roster is meant to hold, so a later sheet lands without relitigating this number. ⚠️ **A directory sweep passes perfectly when the directory is empty or renamed**, so three clauses close that: the sweep is floored, a file `sharp` cannot open is a red naming it rather than a silent skip, and every URL `woodwork.ts` resolves must name a file that is really there — which is also what points the caps at the sheets that ship. ⚠️ **Every sheet a default page fetches, not the woodwork's alone**: it fetches two, the backboard's being a constant, and a clause naming one leaves the other pointed at by nothing. It caps what is committed and **never what is fetched**: G21 records any request the suite makes | ✅ |
| **G53** | `one-sheet` | a woodwork sheet nobody selected reaching every visitor. ⚠️ **This row guards the menu's roster**: an entry wired eagerly instead of lazily is a file every visitor decodes for a menu they never open — and nothing else in the tree objects, because that sheet would be committed, inside both of G52's caps, and served correctly. ⚠️ **The cost is decode and not the wire**: `edge² × 4` bytes of RGBA per sheet held, 1.0 MB at 512 and 4.0 MB at 1024 (the arithmetic is G52's) | `gates/one-sheet.test.ts` — asserted on the pure resolution function and **never on the network**, G21's rule and G52's existence clause reached the same way: the URL is compared, the bytes are not. Six clauses, in two directions. Forward, a default page resolves to exactly one woodwork sheet and no roster entry resolves to more than one, so the menu can grow to four species without costing a visitor anything. Backward, no non-default species may appear in `SHIPPED_SHEETS` — the set a default page fetches, which is deliberately **not** `ALL_SHEETS`, the set the module can name. ⚠️ **Three clauses close the vacuous green**, since every assertion here is satisfied by an empty roster: the roster is floored, the default must be a *member* of it rather than a string that reads like one, and the default must resolve to a sheet rather than to none — the last because `toEqual([])` is perfectly satisfied by a shelf that ships the flat arm by accident. ⚠️ **Off-roster names are asserted too**, `__proto__` and `toString` among them, because `requested in SHEETS` answers `true` for every inherited key and a guard that passes on a value nobody wrote still resolves to something | ✅ |
| **G54** | `woodwork-readback` | a shelf reporting a configuration it is not running. ⚠️ **A query string is an assumption until something states what came out of it.** A repeated parameter resolves to the *first* (`URLSearchParams.get`) and an absent one read through `Number(null)` is `0`, not its documented default; neither is a change anybody makes, so the shelf is wrong from its first frame. Unlike the look, which is the owner's verdict on a live build and never a number, that is machine-checkable | `gates/woodwork-readback.test.ts` over `describeWoodwork`, which is pure and lives in the module with no Three.js in it — so this gate needs no WebGL context, the same split `page-edges.ts` and its spec already make. ⚠️ **`ApplyReport` carries a fifth category, because the other four are all *transitions***: `applied`, `needsRebuild`, `needsReload` and `refused` each answer *what changed*, and a shelf wrong from its first frame never changed. `resolved` answers *what is running*, on every apply, whether or not anything moved. ⚠️ **The line count is the assertion, not a search for two strings**, since a partial report is how a knob hides: a knob dropped from the list is a knob nothing states. Clauses hold it to naming the species, the sheet or *no map*, the world size it laid at — the half no whole-frame number sees — and the fibre scale **in force** rather than the one asked for. An unrecognised species is **refused in the report and not dropped at parse**, which is where `cover_source`'s drop-on-mismatch rule stops transferring: a note nobody is watching may drop a bad value, a control somebody just moved may not, because a dropped value looks exactly like a value that was applied. ⚠️ **A correct read-back that nothing calls reports nothing**, so a text clause reads `applyLive` and refuses a body that does not call `describeWoodwork` and spread **both** of its lists, and a second gives the panel's pure row model (`panel-model.ts`) an `ApplyReport` and asserts every resolved line reaches the status text (the shipped panel is a loop over that model, and `smoke:render` reads the status monitor's text off the real pane for the `resolved` line, so the copy the model's output travels through is held too) — G51's closing move, on the model rather than a search of the panel's source. ⚠️ **It asserts against shipped code and never against the render harness** | ✅ |
| **G55** | `pr-conventions` | the pull request title and body, which are the strings a squash-merge lands on `main`. `squash_merge_commit_title: PR_TITLE` and `squash_merge_commit_message: PR_BODY`, so the title **is** the commit subject and the local one is discarded ([ADR-0057](adr/0057-the-pull-request-title-is-the-commit-subject.md)). ⚠️ **A `commit-msg` hook is the wrong instrument**: it lints the subject the squash throws away, leaving the landed one unchecked *while making the convention feel enforced* — a layer that reads as coverage and is not, which is worse than the honest gap it replaces. ⚠️ **The body half is exempted for `dependabot[bot]` alone**: deleting one array in `scripts/lib/pr-conventions.ts` is the whole of striking it. Closed and reverse-asserted: a bot body is a changelog and has never carried the two questions, because the bot does not read the template, and a weekly red only a human can clear is the tax half of Clause A. Its *title* is exempted by nothing — `.github/dependabot.yml` now sets `commit-message.prefix: 'ci'` on both ecosystems, so a bot title conforms by construction rather than by somebody renaming it every week | the `conventions` job in `.github/workflows/gates.yml`, running `scripts/check-pr.ts` over the pure matcher in `scripts/lib/pr-conventions.ts` — asserted by `gates/pr-conventions.test.ts`, which holds the type and scope lists to `AGENTS.md`'s prose in both directions, the two protected questions to `.github/pull_request_template.md`, and the job to the aggregator's `needs:`. ⚠️ **The lists are parsed, never copied**, which is G14's and G19's shape. ⚠️ **A heading counts only where the page shows one**: comments are stripped before the heading is searched for, so a body carrying both protected questions inside one `<!-- … -->` — rendering as nothing at all — fails, and a fenced one fails too. A fence is *unheaded* rather than deleted, since deleting it would redden a section whose whole answer is a code block. ⚠️ **A title is attacker-controlled text on a workflow that runs on forks by design**, so every string arrives through `env:` and a clause refuses any `run:` step in the file interpolating event data — with `zizmor` in the `audit` job carrying that rule to every workflow this spec does not read ([ADR-0082](adr/0082-zizmor-lints-the-workflows.md)). ⚠️ **That clause is proven by planting the hazard in the very step this row is about**: a `run:` anchor at an indentation neither of the file's two step shapes uses clears its own floor of eight and reports nothing. ⚠️ **No job-level `if:`**, because the aggregator fails on a skipped dependency and this workflow also runs on `push` to main; the script reads `GITHUB_EVENT_NAME` and reports instead of skipping. ⚠️ It pins the trigger list and **never GitHub's honouring of it** — G40's, G44's and G50's stated limit; that an `edited` event re-runs the check was observed rather than in a test, and the register entry names the runs | ✅ |
| **G59** | `large-library-lit` | a large library whose bookcase renders dark. A tall library can be **a black page with every gate green**: the fog range must scale with the camera's framing distance, and `smoke:render` counts books and colours on a 50-book shelf the fog never reaches, so no other check looks at a tall bookcase at all. The gate renders three pages over one build at 480×640: the 50-book **control**, the 273-book library, and **the same library with the fog planted over it** through `?debug=`. The large bookcase must stand at least **half as far above the room** as the control does, measured as mean luma over the rectangle the books project into against the median of the canvas corners. ⚠️ **The plant runs on every run and is judged first**: a plant that does not read black fails the gate on the instrument, because a check that cannot see a black bookcase would call the real one lit. ⚠️ **Half is a judgement and not a population**: the fixed page stands at 0.70, the fogged one at 0.00, and a 240-book bookcase the owner called very dark at 0.15. It lets a tall bookcase be dimmer than a short one and goes red long before black. ⚠️ **It watches the picture, not the fog**: a dead light or a camera framed past the bookcase goes red here too, which is the point — the fog was one of several constants sized for a short bookcase ([ADR-0092](adr/0092-the-fog-range-is-measured-in-framing-distances.md)) | `scripts/smoke-render.ts` — `checkLargeLibraryLit`, judged by `scripts/lib/large-library-lit.ts`, whose verdicts are planted in-process by `large-library-lit.test.ts`; the fog arithmetic is held by `packages/site/src/shelf/framing.test.ts` at every shelf count from 2 to 40 | ✅ |
| **G60** | `context-loss-fallback` | a lost WebGL context while the shelf samples the shadow map ends with the shelf drawn again **painted**, once, and remembered unless the page ran a shadow probe — never with the sampling scene resumed. A program that will not link while the shelf samples the map ends the same way, redrawn painted at once and remembered, never halted on every load ([ADR-0091](adr/0091-a-lost-context-falls-back-to-painted-shadows.md) item 9). Every clause is a line whose removal still draws a desktop shelf: a disposed shelf's render loop surviving beside the new one, a rebuild on the lost canvas, a record that never lands, one that lands from a painted page, one that lands from a shadow probe — `?receivers=all`, the reproduction, which dies on the Pixel where the shipped shelf survives, so its record would paint that phone's plain page for 30 days for re-running it — and a lost canvas left shown under the sentence that replaces it, which Chrome paints opaque white over the whole page ([the white page after a refusal](log/2026-09-25-a-lost-context-falls-back-to-painted.md#the-white-page-after-a-refusal)). ⚠️ **A staged loss is not a driver's**: `WEBGL_lose_context` never restores on its own, never exits the GPU process and never gets the page blocked, so this proves the page's side and nothing about Chrome's — on the Pixel a real loss was refused a new context in every run, recorded in the log, not here. ⚠️ **So the white itself is never seen here**: the refusal is staged by `getContext` answering `null`, and the case reads whether the canvas is rendered, never what colour Chrome would have painted it. A reload inside Chrome's block, *"This browser wouldn't give the page a 3D canvas"*, is not driven: that canvas never had a context, and the phone showed that page dark | `scripts/smoke-render.ts` — `checkContextLossFallback`, eight cases each in a browser context of its own: a restore rebuilds painted on the same canvas with **one** render loop, counted per animation frame, then a reload starts `remembered` and `?shadows=1` still wins; no restore rebuilds on a new element, drawn and clickable; storage refusing every write still falls back and says *not remembered* with no page error; a painted page's loss writes nothing, rebuilds nothing and resumes in place; and a new canvas refused a context ends `refused`, with the record written, the failure sentence up and the lost canvas not rendered; and a `?receivers=all` page's loss restores painted with no record written, the black box saying *a shadow probe, not remembered*, and the next plain page loads as shipped; and a painted redraw whose every program is broken on purpose — a compile error appended to its source before the driver sees it — keeps the shader's sentence up and its canvas hidden; and a page whose every program compiled with the shadow map on is broken from the first frame redraws painted in place with **one** render loop and the record written, and its reload starts `remembered` with nothing failing to link. Six of the cases read the canvas through `checkVisibility` — hidden while a notice is up, shown once the shelf draws again — so a hide that is never undone is red too, in four of them, and an un-hide over a halted shelf in a fifth. The one console error three logs when refused a context is required in that case and allowed in no other, and the line `scene.ts` logs for a program that would not link likewise in the two cases that break programs, matched as a prefix. The page it loses is read off `DEFAULT_SETTINGS`, so the cases keep sampling the map when the default flips. The two black-box lines (*not remembered*, *a shadow probe, not remembered*) are read through `window.__blackbox.text()`, the hook the black box publishes behind `?debug`, and not off the `.shelf-diagnostics` element: once the readout moves into the pane its text sits in a `<textarea>`, which `textContent` cannot read. The readout's own display check is outside this row, in `checkReadout`, so it runs on pull requests: with the pane's chunk aborted the plain readout shows the hook's text; once the pane loads, the readout monitor's `.value` equals the hook and the plain element has stepped aside; and a staged death at 700px leaves the pane open; the Black box folder starts open on every page. The decisions are unit-specced in `packages/site/src/shelf/context-recovery.test.ts`, `packages/site/src/shelf/shadow-fallback.test.ts` and `packages/site/src/shelf/shelf-notice.test.ts`. ⚠️ **The two `disposed` guards cover each other**, so the loop clause goes red only when both are gone — deliberate. ⚠️ **Runs after merge and at deploy, not on pull requests**: `smoke:render --pull-request` skips it so a pull request does not wait for it, and a regression is found on `main`, where the merge that turned it red is reverted first ([ADR-0108](adr/0108-g60-and-g61-run-after-merge-not-on-pull-requests.md)) | ✅ |
| **G61** | `one-shadow-reader` | exactly one program reads the real-time shadow map on the default page, **and with a book held, closed and open** (spec §5, "held reader"; a picked-up book arrives closed, and a closed book is a different configuration from the one measured to survive on the Pixel), in a constant number of draws a frame at any library size — at most `BUDGET`, 4. On the Pixel 10 Pro XL five programs reading the map lost the WebGL context at frame 8, and the bookcase's alone, in 2 draws, survives. **What kills it is not known**: a count of sampling draws was the model until a re-check with 2 programs at 53 draws a frame survived ([ADR-0088](adr/0088-one-program-samples-the-shadow-map-in-two-draws.md), [ADR-0090](adr/0090-real-time-shadows-are-the-default.md)). So a book program that starts reading the map again, or a bookcase split back into a draw per member, would ship green everywhere and move every visitor off the one configuration that phone was measured to survive — no gate read what the renderer compiles. ⚠️ **It pins the configuration that survived, not survival**: the budget is the shape one driver survived with room for one member, nobody knows where that driver's edge is, and another GPU could have a lower one with nothing here going red; see [its section](#g61--the-configuration-that-survived-not-survival) | `scripts/smoke-render.ts` — `checkShadowReaders`: the bare default page at the 50-book fixture and at a generated 300-book one, 17 shelves tall, the 50-book page with a book picked up through the shelf's hook and at rest, closed and then opened — its paper sheets and the veil are new lit and unlit materials, and every lit one must compile with no shadow fetch — and `?receivers=all` as the control that must come back red for the right reason, each in a browser context of its own with the counting hook in `scripts/lib/sampling-hook.ts` installed before any page script, over the judge in `scripts/lib/shadow-sampling.ts`. Eight clauses: the hook is live and the shadow pass drew at least one draw per book; the program set settled — nothing linked and the readers unchanged — for 30 frames; exactly one sampling program in every steady frame; at most 4 sampling draws in every frame, onset included, an instanced call counted as its instances and a multi-draw call as its sub-draws; GL and the shader source agree about every program; the hook's draw count equals three's; the large page has its books and at least 8 shelves; the control is red on programs and on draws. Every clause is planted in `scripts/lib/shadow-sampling.test.ts`, the hook's behaviour in `scripts/lib/sampling-hook.test.ts`, and the string a page runs in `scripts/lib/sampling-hook-source.test.ts`. ⚠️ **Two pages carry a notice open** (`notice-modals.md`'s C4): the attribution notice over the shelf and the privacy notice over a closed held book, each held to the draw count of the same page without it (one program, two draws). A modal that began to blur, animate its backdrop or cast a shadow would move the count; the phone run, `scripts/phone-check.ts --notice`, is the owner's and is not this gate. ⚠️ **The judge never reads the page, and the page never reads the judge**: a green needs both halves, and the control is what proves the two still meet. ⚠️ **Runs after merge and at deploy, not on pull requests**: `smoke:render --pull-request` skips it so a pull request does not wait for it, and a regression is found on `main`, where the merge that turned it red is reverted first ([ADR-0108](adr/0108-g60-and-g61-run-after-merge-not-on-pull-requests.md)) | ✅ |
| **G62** | `ignore-expiry` | an `auditConfig.ignoreGhsas` entry outliving its reason. Each entry carries a date in its trailing comment (`# YYYY-MM-DD, <why>, fix pending`) and **fails once more than 30 UTC calendar days old**, on day 31 and not day 30; an entry with no readable date, a date that is not a calendar date, a date in the future, or a shape the reader does not recognise **fails closed**, like `private:`. ⚠️ **The date is data in a comment**, so the reader works on raw lines and reads only the live uncommented `auditConfig` block — the template at the foot of `pnpm-workspace.yaml` is never an entry, and an absent or empty block passes. ⚠️ **The live assertion is vacuous while no entry exists**; the synthetic cases carry the proof. ⚠️ **Its answer changes with the calendar, on purpose**: the renewal is the re-decision ([ADR-0095](adr/0095-a-comment-carries-the-date-and-an-ignore-expires-in-30-days.md)) | `gates/ignored-advisories.test.ts`, over `scripts/lib/ignore-ghsas.ts` — the pure judgement with an injected `now`, G39's shape | ✅ |
| **G63** | `ignore-fix-published` | an ignored advisory whose fix has shipped. A step in the `audit` job, after `pnpm audit`, reads each ignored advisory from GitHub and its package's versions from npm and fails when **a stable version above the vulnerable ones and outside the vulnerable range is published** — decided from npm's own list, never from the advisory's `first_patched_version`, which is `null` for GHSA-vfj7-8cjw-p6xm. **Fails closed** on a failed lookup, an advisory with no npm entry, and an affected range matching no published version (a wrong name and a broken read both look like "no fix"). ⚠️ **Never `pnpm audit --ignore-unfixable`**: it ignores nothing and writes `auditConfig: {}` into `pnpm-workspace.yaml`. ⚠️ **The step's I/O is verified by planting, not by a test** (G21 stays untouched); the gate file drives the pure judgement and asserts the step exists, follows `pnpm audit` and takes its token through `env:`, so deleting it goes red | the `ignoreGhsas guard` step in `.github/workflows/gates.yml` running `scripts/check-ignored-advisories.ts`, judged by `scripts/lib/ignore-ghsas.ts` and asserted by `gates/ignored-advisories.test.ts` | ✅ |
| **G64** | `tuner-split` | a tuner byte reaching a visitor who did not ask for `?debug`. The pickup tuner is Tweakpane with its essentials plugin, about 63 KB gzip with its stylesheet, and both are lazy: a page without `?debug` must fetch **no script and no stylesheet carrying Tweakpane's root rule** (`.tp-rotv`, which sits in the library's JavaScript as part of its stylesheet literal and in the extracted stylesheet, so one string finds both halves). ⚠️ **The failure is silent everywhere else**: a plain CSS import in the lazy module is hoisted onto every page, 5.2 KB gzip for every visitor, with nothing red. **The control is the same page with `?debug`**, which must fetch the tuner as a script and as a stylesheet, or "none found" could be a detector that sees nothing. Read off the built site, never `pnpm dev` | `checkTuner` in `scripts/smoke-render.ts`, run by `pnpm smoke:render` | ✅ |
| **G65** | `styled-pane` | the pickup tuner drawn unstyled under the site's CSP. Tweakpane injects a runtime `<style>` per bundle, which the hash-pinned `style-src` refuses, and the pane then draws unstyled and **nothing throws**. So the page pre-seats two empty `<style data-tp-style>` placeholders, `plugin-default` and `plugin-essentials`, and the CSS arrives through a lazy `<link>`, extracted from the packages' text at build time (`tuner-css.ts`, [ADR-0104](adr/0104-tweakpane-tunes-the-pickup-behind-debug.md)). On the `?debug` page of the built site this asserts the root pane has Tweakpane's background rather than a browser default, **zero `securitypolicyviolation` events**, and the empty string's hash in `style-src`, which the placeholders depend on (spec §3.7). ⚠️ **Astro writes that hash for a reason of its own**: it was in the policy before the placeholders, and stays with both removed, so this row is what pins it. ⚠️ **The core's id is `plugin-default`, not `default`**: it registers its stylesheet as a plugin does, and a `default` placeholder still drew a styled pane while injecting 24 KB the CSP refused | `checkTuner` in `scripts/smoke-render.ts`, run by `pnpm smoke:render`; the extractor's anchors and the page's placeholders in `packages/site/src/shelf/tuner-css.test.ts` | ✅ |
| **G66** | `control-characters` | a C0 control character in a tracked text file, other than tab, LF and CR. PowerShell reads a backtick as an escape inside a double-quoted string, so a Markdown code span written through one — `` `auditConfig` `` — loses its backtick and first letter to U+0007, which draws as nothing. **Nothing else reads bytes a renderer hides**, so the loss ships with every gate green. ⚠️ **Bytes, not characters**: a UTF-8 file holds a byte below 0x20 only as that character, so the sweep needs no decoding and reads a file that is not valid UTF-8 too. ⚠️ **Text is every tracked path `BINARY` does not match**, the extension list G13 (`no-third-party-material`) reads, moved into `gates/repo.ts` for both — so a binary with an unlisted extension is read as text and reddens this row alone, since G13 never looks at a path `BINARY` does not match. The remedy is one line, and it moves the file rather than clearing it: adding the extension to `BINARY` hands the file to G13, which reddens unless the file is allowlisted or sits in a generated directory. DEL (U+007F) and the C1 range are not read | `gates/control-characters.test.ts` — the sweep over every tracked text file, with a vacuity floor of 400 files, and the judgement planted on synthetic bytes in the same file | ✅ |
| **G67** | `release-age` | pnpm's release-age window left to pnpm's default. The row fails unless `pnpm-workspace.yaml` carries `minimumReleaseAge` **once, as a top-level key, as a plain integer of at least 10080**: absent, under seven days, only in a comment, nested, quoted or written twice all **fail closed**. **The hatch is held too**: every `minimumReleaseAgeExclude` entry must name one exact `package@version`, because pnpm 11.18.0 takes `'*'` there as every package and a bare name as every version, so one wildcard would switch the window off with the key still at 10080. **So are the two switches** that do the same, each measured on 11.18.0: `minimumReleaseAgeStrict`, if present, must be `true`, and `trustLockfile`, if present, must be `false`, quoted keys included. **The other side doors are held too**: `minimumReleaseAgeIgnoreMissingTime` must be present and `false`, and `trustPolicy` present and `no-downgrade`, both required because pnpm's default for each is the unsafe value; `trustPolicyExclude` gets the hatch's exact-version rule, and `trustPolicyIgnoreAfter`, `configDependencies`, `pnpmfile` and a root `.pnpmfile.*` fail. **Every exclude, age or trust, must name a `name@version` the lockfile holds**, or an old one would let that exact version back in unreviewed. **Every `resolution` in `pnpm-lock.yaml` must be `{integrity: sha512-…}` and nothing else**, counted against the package keys; ⚠️ that rule, not the missing-time key, is what keeps git and tarball dependencies out, measured on 11.18.0. The chromium-bidi trust exclude must name the version `puppeteer-core`'s snapshot depends on, and no other snapshot may depend on it. wrangler must be an exact root devDependency, and `scripts/deploy.ts` an allowlist: `'exec', 'wrangler'` for the upload, `pnpm exec wrangler` for the printed command, no package runner anywhere. The cooldown on the github-actions entry in `dependabot.yml` is **not gated**, like the npm entry's. ⚠️ **It reads raw lines, not YAML**, because the root has no parser and one key is not worth a dependency. ⚠️ **It cannot see whether pnpm honours the key**; that was measured once: `pnpm config get` read 10080 and a frozen install of a four-day-old entry failed under it. **The Worker's deploy is held to the same form**: `scripts/deploy-ask.ts` as `deploy.ts` is, except that its printed command is `pnpm deploy:ask` and the bare `pnpm exec wrangler` upload line is refused there, `scripts/lib/ask-live.ts`, which only reads, to `pnpm exec wrangler` in its two calls, and the two scripts that read the owner's wrangler login (`scripts/evals-ask.ts`, `scripts/ask-status.ts`) to the one string `pnpm exec wrangler auth token` with no package runner; and `scripts/deploy.ts` must still call both Turnstile key checks | `gates/release-age.test.ts` | ✅ |
| **G68** | `debug-pane-imports` | the `?debug` pane growing a second door, or a second holder of the library. `boot.ts` reaches the instruments through `debug-pane.ts` by one dynamic import, and `debug-pane.ts` is the only file in the site that imports `tweakpane`, `@tweakpane/*` or a `.css?url` as a value ([ADR-0119](adr/0119-one-pane-for-every-debug-instrument.md)). **Nothing else could see it**: G64 asks only that a page without `?debug` fetches no Tweakpane byte, and a second lazy import of an instrument, or a view that imported `Pane` itself, stays lazy behind `?debug` either way and reaches no visitor. Two clauses: `boot.ts` imports `debug-pane.ts` exactly once, by `import()`, and reaches no file the shell itself imports (its other lazy imports are not this row's concern); and no file under `packages/site/src` but the shell imports the library as a value, statically or by `import()`. A statement-level `import type` is erased and passes, as in G6; `import { type X }` does not. A third clause holds the black box's direction: `diagnostics.ts` reaches none of the pane's files in any form, and `blackbox-readout.ts` reaches `diagnostics.ts` only as a statement-level `import type`, because the recording is an eager static import and one value edge into the pane would put Tweakpane in front of the page it measures. ⚠️ **It reads value imports only.** A view that imported Tweakpane as a type would pass, though ADR-0119 asks for none, and the rule is otherwise held by review. | `gates/debug-pane-imports.test.ts` — the two clauses over the real files, a vacuity guard, and the judgement planted on synthetic sources in every import form | ✅ |
| **G69** | `one-ai-call` | an unmetered model call. The Ask the library Worker's spend is capped by an AI Gateway rule that counts only calls made through the gateway, and the prototype measured that a call without the `gateway` option is **not blocked at all** (`docs/spec/ask-the-library.md` S5, C8). Four clauses: `AI.run` appears in `packages/ask/src/ai.ts` exactly once and nowhere else in the TypeScript or JavaScript under `packages/`, `scripts/` and `gates/` (test files excepted); that call passes `gateway: { id: env.ASK_GATEWAY_ID }` and `skipCache: true`; and no other Worker file names the binding at all, `env.ts`'s declaration excepted, so a destructured `{ AI }` cannot route round the first clause; and `ai.ts` itself names the binding exactly once, by the call, so a local alias (`const m = env.AI`) cannot let a second call through while the count stays 1. ⚠️ **It reads source text.** A call built from a string, or through a helper that receives the binding as an argument, is not matched; the one function is the only place the binding is in scope, and the third and fourth clauses are what hold that. ⚠️ **It cannot see the gateway's own settings**: that the rule exists, authentication is on and logging and caching are off are read back after `terraform apply` (C16) and tripped by a live call (C7), both the owner's steps | `gates/one-ai-call.test.ts` — the four clauses over the real files with a vacuity guard, and the judgement planted on synthetic sources | ✅ |
| **G70** | `mutation-dry-run` | a spec that Stryker's sandbox breaks, merged because no pull request ran the dry run, so the first place it showed was the next nightly (a spec reading an instrumented file such as `scripts/ask-status.ts` as source text). The job runs `pnpm exec stryker run --dryRunOnly` on **every** event the workflow runs on, with **no filter**: the sandbox rewrites `.ts` files that no `mutate` glob matches, and a Stryker or Vitest bump breaks it without touching a line of code, so a list of paths that can break it fails closed on the pull request it should have caught. ⚠️ **A dry run, not the mutation run**: the full run stays nightly and `pnpm mutation:run` stays a measurement. ⚠️ **A flake is not hidden**: a red that a rerun clears gets an issue and not an exclusion. The structural gate that would fail when a spec reads an instrumented file as text **is not built** and is the owner's call: it would back no acceptance claim, and it would cost regexes over spec sources | the `mutation-dry-run` job in `.github/workflows/gates.yml`, asserted by G40 (`action-pins`), which reads its place in the `gates` aggregator's `needs:` and its `success` comparison, and by a G70 clause in the same file, which holds the job's text to exactly one `run:` line reading `pnpm exec stryker run --dryRunOnly` with no `continue-on-error:` and no `if:` — so a swallowed exit code, a narrowing `--mutate`, `continue-on-error` or a condition is red, each planted on a copy and one on the real workflow. Its reproduction and the usual fixes are in `docs/commands.md`. The register entry cites the run that observed it red | ✅ |
| **G71** | `doc-word-budget` | an agent-facing doc growing past what an agent should read whole at the start of a session, because how-it-came-to-be text accretes in it and nothing goes red. Each file in the test's `BUDGETS` table has a word ceiling set just above its size when it was cut down to what holds now. ⚠️ **A ceiling raised whenever it fails is a comment**: move history to `docs/adr/` or a dated log in `docs/log/` first, and raise a ceiling only for a rule that is new. ⚠️ **It counts words and does not judge them**: a doc under its ceiling can still carry history, and the cut is a person's or a reviewer's call. The logs, ADRs, specs' bodies and research notes are outside it | `gates/doc-word-budget.test.ts` — the table's files exist, are tracked and are at least half their ceiling, every file is at or under its ceiling, and the measuring function is shown red on a document over its budget and green on one inside it | ✅ |
| **G72** | `threat-model-cap` | a threat model too long to be read. `docs/threat-model.md` is capped at 3,000 words, counted by splitting the whole file on whitespace, its two diagrams included, because a session skips a file that has grown and models given room fill it. ⚠️ **Raising the cap is a spec change**, not an edit to the constant. ⚠️ **An empty or misspelt path would satisfy a cap**, so the read is floored at 500 words. ⚠️ **It counts words and says nothing about the template** (boundaries first, then scope, classes, residual and open issues); review holds that, and the controls the file names are read by no gate: the GitHub ones were read live when it was written | `gates/threat-model-cap.test.ts` — the cap and the floor over the real file, and the same check shown red on a padded copy | ✅ |

**G21 gates a rule that two files already claimed was true.** `AGENTS.md`'s
Phase 1 gate says "use cached API fixtures, no live calls in tests", and
`packages/core/src/covers/download.test.ts` opens by stating "No test makes a
live call". Prose does not hold that; the gate records every request a test
makes.

**Nothing goes red by itself when a test calls the network, because the test
passes either way.** Assertions that never look at the cover pass offline and
online alike; the only symptom is a test several times slower than its
siblings, which reads as an outlier and then as an intermittent timeout on a
loaded runner.

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
every assertion still passes. So the guard records each attempt and asserts in
an `afterEach`, where no `try/catch` in the code under test can reach it. The
throw stays — it keeps the call off the wire and lands the error near its cause
— but it is not what makes this gate red. The record is cleared per test, so
the failure names the URL and the stub that fixes it, and only the test that
made the call fails.

**The spec cannot install the guard by asking about it.** Installation lives in
`no-live-network.setup.ts`, apart from the guard, so `globalThis.fetch ===
guardedFetch` is true only if the setup file ran. Were the two one file, the
spec would install the guard by importing it to compare, and deleting
`setupFiles` from `vitest.config.ts` would leave every check green. This is the
same lesson as G19's three holes — *anchor the assertion to the thing that
carries the claim* — and the reason a gate is not finished when it passes.

**What it covers is `fetch`, in this process** — every request this repo makes,
since nothing here uses `node:http` directly. Two things sit outside it, stated
rather than implied: a test that shells out to a script making its own requests
(`gates/deploy-branch.test.ts` really does spawn one, driven onto paths that
upload nothing, but that is the script's own guard), and any future code that
reaches the network by some other API. The escape hatch for a test that
genuinely needs a response is `vi.stubGlobal`, named in the failure message
rather than only here, since the message is where somebody will meet this rule.

**G17 gates the deploy script's refusal to publish from any branch but
`main`.** There can be several worktrees on several branches, and all of them
read the same `.env` — so all of them hold SITE_URL and can publish to the live
domain with a command that looks identical from every one.

**Both directions are asserted unconditionally.** A check that reads the branch
the suite happens to be on and returns early when it is `main` would only ever
exercise the refusal in CI, which runs on `pull_request` and is never on `main`,
while the owner, who mostly is, would run a gate that quietly asserts nothing.
So `GIT_DIR` points the child's git at a scratch repository sitting on a known
branch: the script is real, the guard is real, git really resolves the branch,
and only *which checkout is being asked about* is controlled. One test
deliberately omits that redirection, so something still proves the guard is
wired to the actual repository.

A positive check cannot detect a missing guard on its own, so the gate is held
by two mutations that must both go red: deleting the guard, and inverting the
comparison — refuse `main`, allow everything else — which includes "lets main
through", the check that proves that one is not vacuous. Among the checks is
that `--any`, `--branch`, `--anybranch` and `--any_branch` do *not* work as the
override: an escape hatch you can stumble into is not one.

**G18 gates the cover download.** Disclosing a gap is not the same as gating it,
and a threat model that lists a hole indefinitely is a comment, exactly like an
ungated rule.

`download` fetches a URL that comes out of a third-party API response and hands
the bytes to `sharp`, a native decoder, so it holds a 15s abort, a 20 MB cap
counted **as the body streams** rather than believed from `Content-Length`, and
a magic-byte allowlist of JPEG, PNG and WebP. The allowlist matters more than
the cap. `sharp` also decodes SVG, which is not an image but a document with its
own parser and its own rules about external references, and nothing here has any
reason to hand a provider's response to that. The cap is a limit only because
something counts, and `Content-Length` is a claim like any other.

A test that asserts "the body was never read" must build its `ReadableStream`
with `highWaterMark: 0`: a default stream pulls once the moment it is
constructed, so the test would measure its own scaffolding.

**Every case here stubs `fetch`, which is the failure mode a gate made of stubs
cannot see**, so before tightening these checks, run them once against the live
providers. A tightened `Content-Type` check refuses covers *silently*, because
`cacheCover` treats every failure as "no cover" by design, so a provider
answering `application/octet-stream` would mean books quietly logged bare with
nothing going red. Google Books serves PNG whatever the URL suggests.

**G22 gates which cover URL is tried first.** The preference — `coverUrlLarge`
before `coverUrl` — is one rule, and a second implementation would diverge
**silently**: reverse the pair and a cover still downloads, `cover_source` is
still correct for the bytes kept, and the shelf is quietly worse.

So the row is structural: `coverUrlLarge` may be named only inside
`packages/core/src/metadata/`, where the field is produced and where
`coverUrls()` ranks it, and every module calling `cacheCover` must get its list
from there. It is held in both directions: a module naming the pair goes red,
and so does the `routes every cover download` assertion, which stops the first
half being satisfied by a caller that simply stops downloading covers. Both
directions matter for the reason G17 records: a positive check cannot detect a
missing one.

A structural check cannot see which way round two elements of a tuple are, so
the preference itself is pinned in `covers/cache-cover.test.ts`, asserted
**through the downloader** — that the large URL is the one actually fetched
first — rather than on the tuple, because what is worth protecting is which
bytes reach the shelf. Reversing `coverUrls` fails one test, by name.

The lesson generalises: **a structural gate proves there is one implementation
and says nothing about whether it is right.** Any row here promising "one rule,
one implementation" needs the first clause asserted somewhere too. G10's is —
`covers/cover-path.test.ts` is exactly that half, which is why that row names
two files.

The rest of `cache-cover.test.ts` pins the order `cacheCover`'s steps run in.
`blank.test.ts` and `download.test.ts` each prove one step in isolation; this
file proves which candidate wins, what happens when none is cover-shaped, and
which URL the recorded `source` is taken from — a change in preference would
otherwise still leave a cover on disk and every assertion in `add-book.test.ts`
and `enrich.test.ts` green.

Three properties keep the checks honest about their own claims:

- the exemption list for the caller check has a **stale-entry assertion**, which
  ADR-0022 requires and G10 has. Asking whether each exempt file still *defines
  or re-exports* `cacheCover` is not enough, since `index.ts` does forever, so a
  file could re-export it **and** call it and still pass both checks, which is
  precisely the case the exemption exists to make impossible. The check strips
  the one `cacheCover(` that is a definition and asserts no call site remains;
  the mutation to run is "a file that still qualifies for the exemption and
  calls anyway", not only "a file that stopped needing it";
- the `coverUrlLarge` sweep **anchors the symbol itself**, not only the file
  walk: it first expects the metadata layer's files naming it, so renaming the
  field fails instead of passing over an empty set;
- both halves match **code with comments blanked**, never raw file text — a gate
  that matches prose matches anything, and a caller that hand-ordered its
  candidates would otherwise look compliant by mentioning `coverUrls()` in a
  comment. The stripper skips `//` preceded by a colon, because `//` inside
  `https://covers.openlibrary.org/…` is not a comment and treating it as one
  would hide real code from the sweep, and says in its own docstring that it is
  not a parser and does not know a `//` inside a string literal from one
  starting a comment.

**What this row does not gate**: that `cover`, `cover_source` and `spine_color`
are written together. That rule — *a note's `cover_source` describes the bytes of
that note's `cover`* — has four writers, and one of them, `stacks covers
--backfill`, never downloads anything at all: it infers provenance from the shape
of a cover already on disk and upholds the rule by a different route. So no
structural check can demand the three appear together, and `covers/cover-keys.ts`
makes the pairing unconstructible on the *creation* path only. Stated here
because that is a narrower guarantee than the section heading suggests.

**G16 measures the placed books against the case's real inner faces.** It
catches a leaning book's bottom corner driven into the face-out book beside it,
and a row's first book driven into the case's own side. The layout cannot catch
either: the cursor advances by a book's *thickness*, and a book rotated about
its centre is wider than that, so re-checking the arithmetic would only repeat
its assumption. G16 measures `Box3.setFromObject` against the case's real inner
faces instead, which is the same argument that put `gate:public` on the built
folder rather than on `library.json`: measure the artifact, not the code that
produced it.

Its tolerance is 0.005 and the residual is 0.0012, which is not slop — it is
exactly `SKIN`, the hair by which a book's printed cover and spine float above
their boards. Named in the gate, so the next person does not read it as a
coincidence.

**G10 guards against a hand-rolled `basename`.** A `/`-only split shadowing
`node:path`'s `basename` lets `..\..\x.png` traverse on Windows, the platform
this project runs on, whatever a comment beside it says. The structural half
covers every copy of the rule, `obsidian-adapter.ts`'s wikilink embed among
them.

**G15 holds the size of what ships, because a phone pays for decoded textures
and not for bytes on the wire.** Every cover is uploaded before the first frame:
31 covers at whatever size the provider supplied were 8.4 MB on the wire and
**314 MB once decoded into GPU textures**.

Neither `gate:public` (which reads the *contents* of *text* files, so opens no
JPEG) nor `smoke:render` (which screenshots a desktop GL context with gigabytes
of headroom, exactly why this fails invisibly there and fatally on a phone)
measures the size of what ships; G15 does.

**A green G15 is not "phones are fine".** The row protects *a* property of the
build, what the covers cost once decoded into GPU textures, and not *the* cause
of any phone crash, which is still unmeasured; see `docs/progress.md`. Reading a
green G15 that way is exactly the mistake this scoreboard exists to prevent. G15
also counts only cover files, so the ~22 MB of per-book spine `CanvasTexture`s is
outside every budget here.

A phone can lose the shelf's context with only a handful of books drawn, so the
cost that matters is fixed and paid before a book is drawn. No budget over what
ships can see that, because it is a property of the renderer's own setup: the
multisampled framebuffer, the shadow map, the pixel ratio. G15 remains worth
having and remains unable to catch this. **The rule protected by nothing here is
"the shelf survives on a real phone"**, and nothing in this repo can assert it —
`smoke:render` screenshots a desktop GL context with gigabytes of headroom, which
cannot fail the way a phone does. **"The shelf survives on real hardware" is
protected by nothing**, and the substitute is a person with a device: `?debug`,
`?books=N` and the renderer switches make that person's time cheap, and
`scripts/phone-check.ts` makes the run repeatable. That is honest rather than
good.

Real-time shadows are the default for every visitor, with only the bookcase
reading the map ([ADR-0090](adr/0090-real-time-shadows-are-the-default.md));
painting is the fallback a device takes after a lost context. G61
(`one-shadow-reader`) gates the *configuration* the phone survived — how many
programs read the shadow map, and in how many draws — on a desktop, because
three builds the programs in JavaScript. Every visitor holds the 2048² shadow
target, 32 MB, which is outside G15's number (its own comment names the shadow
map as outside it) and moves no budget here.

The gate asserts two different things, because two different things go wrong: no
single cover exceeds `MAX_COVER_EDGE` (a property of the staging code), and the
whole shelf fits `TEXTURE_BUDGET_BYTES` (a property of the *library*, which grows
as books are added). The second is expected to go red one day on a build that
changed nothing — on a machine, rather than on someone's phone. **When it does,
the answer is to stop uploading every cover at once, not to raise the number.** A
budget that gets raised whenever it fails is a comment.

**G11 pins exactly which keys may differ between a local and a public build.**
The dev flow runs `--public`, so nothing renders a local build, and a missing
`coverAspect` on a local build is not a rendering bug. The difference between the
two modes is written down and checked, and the gate fails on any key outside that
list.

**G12: a book you are reading wins.** Status sorts ahead of `shelf_order`.
`--renumber` numbers *every* shelved book, so a rule that applied to unnumbered
books only would describe a state the vault could no longer be in, and the next
book picked up would sort behind every pin. `--renumber` keeps its purpose: the
pins still order themselves among the finished books.

**G4 holds `updateBook`'s "scalars only" rule for a flow collection as well as a
block list.** A one-line list such as `author: [Marisol Vane, Tomas Ek]` is left
alone. `asString` returns undefined for an array, so a two-author note parses as
*authorless*, which is exactly what sends `stacks enrich` to look an author up;
replacing the list wholesale would be silent data loss in a hand-edited note,
which is the thing invariant 5 exists to prevent.

**G2's orphan-cover assertion exists because the staging folder must be pruned,
never additive.** A real-vault build followed by either gate — both stage the
*fixture* vault into the same folder — would leave every real cover in place
under a filename slugged from a real book title while `gate:public` reported the
build clean: it reads text-file contents, and these are JPEGs. Disabling the
prune fails the gate. Wishlist books do not ship in `library.json`, and a
`cover:` may not be protocol-relative or absolute `http`, so a hand-edited note
cannot have a visitor's browser fetch from a third party.

**G20: "is this folder safe to publish?" has one implementation.**
`scripts/lib/public-build.ts` answers it, and `gate:public` and `deploy:site`'s
pre-flight are both callers — two calls, not two implementations. The deliberate
separation stands: the gates still stage fixtures and still run first, the real
build still runs last, and `gate:public` still says nothing about the folder
about to go on the internet. Neither caller may keep a weaker private copy of a
rule, least of all the one that publishes.

**It is cheap enough to observe every rule go red.** The module builds nothing —
it is handed a directory — so the gate assembles a synthetic `dist/` in a temp
folder, plants one defect, and asserts that defect fires that rule *and no
other*. No build, no network, milliseconds. A final assertion holds the rule list
to the defects: a rule with nothing that produces it fails the build, so this
gate cannot quietly come to cover all but one.

**The `_headers` rule reads the file as blocks and reads the covers block by
name**, never as *find `/covers/*`, then look ahead for a `Cache-Control` with
`max-age=0`*: a lazy scan does not stop at the end of a block, and the real
`_headers` has an `/og.png` block directly after `/covers/*` carrying exactly
that directive, so deleting the covers block's own `Cache-Control` line would
leave the rule green. **A defect the gate plants must be a defect the file could
actually have** — a `_headers` containing nothing but the covers block is a shape
this repo has never had, and the one shape in which that bug is invisible.

Two more rules each have two halves that must stay one:

- **The share image.** The URL is the whole `<origin>/og.png`, not merely an
  absolute one: `<origin>/hero.png` is a file no build ever wrote. It is *two*
  rules rather than one, because `--check-only` has to excuse a SITE_URL mismatch
  without also excusing a page that lost its share tag altogether.
- **The canary.** The module owns it, as one literal: a canary that drifts
  between where it is planted and where it is looked for leaves both halves
  passing.

**One check deliberately stays in `deploy.ts`**: that no fixture book is in the
build. `gate:public` requires those titles *present* in the folder it inspects
and the deploy requires them *absent* — the same strings with opposite verdicts
— so a module that cannot know which vault produced a folder is the wrong owner.
It also asserts build *ordering* rather than publishability.

That check reads the fixture vault through `ObsidianAdapter` — the same parser
the build uses, which is invariant 4 and the only way to get it right, since a
note's filename is not always its title. An empty list refuses the deploy
outright rather than passing over nothing.

**G23 matches what the body returns and never what the function is called.**
`keyIfPresent` once existed six times under three names, and the copies were not
discoverable from each other: grepping one name finds some of them and reads like
a small local habit rather than a repo-wide rule. An identifier check would be
satisfied by every copy under its own name. The anchor is `return <ident> ===
undefined ? {}`: absent in, nothing out, which is what makes this helper itself.

**Its limit is the shape rather than the behaviour, and that is a choice with a
name on it.** Two rewrites return `{}` for an absent value and escape — an early
return, and an expression-bodied arrow. Widening to catch the early return would
flag `covers/cover-keys.ts:31`, which is that line exactly and is not a copy of
anything. So the options were a narrow anchor with a stated gap or a broad one
carrying a standing exemption for a file that has done nothing wrong, and
ADR-0022's maintenance cost falls on the second. The anchor catches the shape
copy-paste produces; the gap is stated here.

Two things follow from choosing the return statement as the anchor:

- **The inline `...(x === undefined ? {} : { k: x })` spreads need no
  exemption.** They contain the same text and are not copies of anything — each
  is one decision at one call site. A spread has no `return`, so the anchor
  separates them by construction, with no allowlist and so no allowlist entry
  that can go stale.
- **`packages/site/` is not exempt either**, though the site cannot value-import
  `@stacks/core` (G6). A copy appearing there goes red, and the fix is to promote
  the owner to a pure subpath beside `@stacks/core/shelf-order`. This is the
  first structural gate here with no exempt list at all.

**The vacuity anchor is the assertion this row needs most**: *every clause of
this gate is phrased as an absence*, and an absence is satisfied for free the
moment the pattern stops matching anything. So the gate asserts the owner still
matches before asserting nothing else does; changing the owner to return
`Object.create(null)` instead of `{}` makes the clause fail by name rather than
quietly greening the other three.

`\s` matches newlines, so **a copy that arrives reformatted is still caught**:
the anchor is robust to layout and brittle only to the behaviour changing.

The permissive half is asserted too, for G17's reason: *a positive check cannot
detect a missing one*. "No file defines its own" is satisfied perfectly by a
repo where every caller has gone back to writing the key unconditionally, so the
gate also requires the helper to have seven callers — the same clause G22 carries,
for the same reason, which suggests it belongs in any row promising "one rule,
one implementation". The count excludes `key-if-present.test.ts`, which names the
helper on every line and *uses* it for nothing: a spec is not a caller. **An
inflated floor is slack, and slack in a floor is indistinguishable from the
defect it is meant to stop** — the general form of this file's rule for
allowlists, applied to a number.

A `keyIfPresent(` left behind in a comment does not rescue a caller that reverted
to a bare `{ key: value }`, because the shared `codeOf` in `gates/repo.ts` blanks
comments before anything is counted. That is why `codeOf` lives in
`gates/repo.ts` and is not written a second time inside a change about not
writing things a second time.

**What this row does not gate.** `FrontmatterChanges` inverts the rule this
helper embodies: near `updateBook`, `undefined` *removes* a key from a note in
the owner's vault, so the ordinary absent-is-harmless reflex writes to somebody's
files. That is stated in `CONTEXT.md` under **Removal** and has no gate here,
because it has no live instance: every `updateBook` caller builds its changes
from literals or guarded assignment, and `enrich.ts` cannot express a removal at
all, since its accumulator is typed `Record<string, string | number>` and needs a
cast to widen. Gating a hazard nothing can currently reach would be a rule
nothing can fail on, which is what this file is against.

**G24 is the fourth "one rule, one implementation" row**, after G10, G22 and G23.
Scripts each worked out where the repo starts, and the `.cmd`-shim / DEP0190
comment had been written three times; `dev-watch.ts` and `smoke-render.ts` were
passing an args array alongside `shell: true`, the shape that comment exists to
avoid. Platform knowledge written in three places was absent from two scripts
that also needed it, which is the argument for one home.

**Consolidating does not shrink G1's allowlist.** G1 allowlists files that import
`fs`; `REPO_ROOT` is `node:path` and `run` is `node:child_process`, so neither can
ever appear on that list, and `walk` earned an allowlist entry when it was
extracted. Do not argue for a shared harness from a smaller G1 allowlist.

**The gate can anchor on a name where G23 could not**: a module cannot reach its
own location without `import.meta`, so `import.meta.(url|dirname|filename)`
catches every spelling including the `new URL('..', import.meta.url)` form. G23
had to match a returned *shape* because its helper had three names; this one has
no name to hide behind.

**One owner rather than a directory**, on G1's own argument against
directory-level permissions: `scripts/lib/` holds other shared files and none of
them has any business deriving a root. A permission granted to a folder collects
whatever later lands in it. The owner is `scripts/lib/repo-root.ts`, and a
derivation anywhere else goes red.

## G25 — one usable width

The packer's capacity and the placer's consumption are one number, `USABLE_WIDTH`.
`toRows` runs the cursor and wraps on the answer, not on an estimate
([ADR-0042](adr/0042-the-packer-runs-the-placer.md)), so no row's right edge can
pass the band. See [ADR-0031](adr/0031-one-usable-width.md). The row asserts an
inequality, not an equality:

```text
right edge = -W/2 + spent  ≤  -W/2 + USABLE_WIDTH,   spent ≤ modelled
```

Containment is asserted against the band directly, and the model is the
independent ceiling on what the cursor may spend to get there. The model is
bounded above as well: asserting only `charged ≥ spent` passes on a packer that
charges the whole shelf for every book, so the excess is bounded too. Naming the
slop is what stops the row from recording the disagreement instead of closing it.

**The bound has three terms**, and the third is charged where the first two say
nothing is owed:

| term | charged where | because |
| --- | --- | --- |
| one maximal swing | the angle changes | the real lean needs the row index, which the wrap has not decided |
| one maximal prop | a book props across a gap | the prop angle needs the neighbour, which the wrap has not chosen |
| one maximal parallel push | every pair of spines in a run | two parallel books of different heights do not stand where their footprints say |

*"Neighbours at the same angle stay parallel and never collide"* is true of the
boards and false of the books: a book tilted about its middle stands on a base
swung `sway` off its footprint, and `sway` scales with height, so a tall book
followed by a short one has its low corner inside its neighbour's board.

⚠️ **The bound for the parallel push must not call `parallelPushOf`**, the
function it bounds: a bound built from the same arguments and the same trailing
term cannot fail for any value of the charge. It is `WORST_PARALLEL_PUSH`,
re-derived from the geometry against `THICKEST_SPINE` and the height band,
constants the charge cannot move.

**The row names two files.** `shelf-width.test.ts` asserts the capacity rule
against the cursor, with the fold over `shelfCost` stated once as `rowCost`.
`books.test.ts` asserts only that the packer wraps: its assertion asks
`rowExtent`, the packer's own predicate, so it catches a packer that stops
wrapping and nothing finer, and says so in place. Naming both files is what keeps
an assertion this row depends on from sitting in a file the scoreboard does not
point at, where it could be weakened without anything noticing.

**An assertion's judge must not be the defendant.** "One more book would not have
fitted" has to price the candidate from the packer's own exported rules (`yearOf`,
`YEAR_GAP`, `shelfCost`) *with* the year gap and the clearance an upright book
pays, and compare against `USABLE_WIDTH`, which the packer does not get a vote on.
Pricing it without its gap is stronger than anything the packer promises: green
today, red on a correct packer the day a book gets thinner. Handing the row's
books back to `toRows` with one more appended and requiring two rows prices it
perfectly and proves nothing, because a deterministic function always agrees with
itself: it passes with the packer mutated to wrap at nine tenths of the shelf.

The lesson is the one this file keeps restating: **a gate must compare against
something the code under test cannot move.**

**The mutations this row is observed red against are recorded in the gates
history log.** One matters more than it looks: the exactness case on a row that
changes angle nowhere is the only thing that catches a constant over-charge of
every book's cost, which would otherwise hide inside the bound.

**It does not replace G16.** Everything in this row asserts what the placements
*claim*; G16 measures `Box3.setFromObject` against the case's real inner faces on
a rendered scene, which is evidence a unit test cannot produce. Its
`case overflow 0.0012` is `SKIN`, the hair by which a printed cover floats above
its board, not slop.

### The estimate is gone; the model stayed and changed sides

⚠️ **The packer no longer estimates.** `toRows` runs the cursor and wraps on the
answer ([ADR-0042](adr/0042-the-packer-runs-the-placer.md)); the model that used
to decide the wrap, conservative by construction, left shelf empty at the end of a
row. The circularity once cited for needing it was in the sentence, not in the
code: `leanFor(rowIndex, position, id)` is determined by its arguments, and both
indices are fixed at pack time (the row being filled is `rows.length`, the
candidate's place in it is `current.length`).

**`shelfCost` and `rowCost` live in `shelf-width.test.ts`**, and the direction of
the inequality is why. They decide nothing and bound everything: without them
nothing would bound what the *cursor* spends against numbers the cursor cannot
move, and restating capacity as `rowExtent` is the defendant-as-judge defect
again. Being loose costs nothing now that no row wraps on it.

**A third group asks what the first two cannot.** "Packs no row past the band"
and "packs every row tight" are both about the *decision*, and both read
`rowExtent` on the left, which is what `fitsRow` wraps, so a cursor that
over-spends moves the wrap and the measurement together and neither notices.
`leaves a row no slack a book could have used` is about the outcome: the wood left
at a row's end, against a cursor-free number.

⚠️ **That number is a ceiling, never a floor.** The assertion is `room < need`, so
a `need` stated too small turns a *correct* packer red: a book rejected *because
of* the clearance it would have paid leaves room above such a floor. It is
`separator + gap + footprint + WORST_CLEARANCE`, every term at its worst. Charging
`YEAR_GAP` in full makes it too large by up to 0.088 at a propped boundary, and
the separator is taken from the book the cursor is *leaving*, not the one it is
arriving at (reading it off `next` understates the cost for every face-out book
followed by a spine).

⚠️⚠️ **`WORST_CLEARANCE` is `MAX_PROP_LEAN`, never `MAX_LEAN`.** The angle-change
branch spends `Math.max(sway, left.sway)`, and `left.lean` is a *run* lean: a run
that begins on a book propped across a year gap hands that angle to every spine
behind it. So the swing reachable there is `swayOf(MAX_HEIGHT, MAX_PROP_LEAN)` =
0.1175 against the 0.0263 `MAX_LEAN` allows, and a ceiling built on `MAX_LEAN` is
under half the real worst case.

`squareCoverAfterProp` is the fixture that holds it: every book its own year so
every run inherits a prop angle, and one face-out book with an audiobook's square
cover landing against it at 11.9°. The packer is *correct* on it, so both decision
assertions pass and only the outcome one goes red when the constant is `MAX_LEAN`,
so the constant cannot quietly go back.

**The detection floors are measured, not assumed.** Bisected on
`cursor += entry.thickness + TOUCHING + δ`, the shelved branch:

| δ | verdict | caught by |
| --- | --- | --- |
| 0.005 | green | — |
| **0.0055** | **red** | `never spends more than the model allows` (`mixed`) |

The face-out branch catches **any** over-spend: δ = 0.00001 is red on the
exactness case, which is exact to the bit. The floor is 0.005 green / 0.0055 red
and belongs to the cost model, which does not read `WORST_CLEARANCE`. A floor
sharper than that was bought while the outcome assertion was unsound, and
sharpness bought with unsoundness is a gate that fails on a day nobody changed
anything. Note that "adding a hair to every book's cost" is a hair added to the
*charge*, not to the *spend*. **A detection floor that is written down is a gate;
one that is assumed is what this row exists to prevent.** Do not restate these in
either direction without re-running the bisection.

**The one thing this row carries alone.** Clearance is charged to the *left* of
the book that leans, where the angle changes, so the last book of a row has
nothing on its right to charge and its swing is paid for by `SHELF.endReserve`
and by nothing else. The assertion `endReserve ≥ swayOf(MAX_HEIGHT, MAX_PROP_LEAN)`
is the one to read before tuning that number, and it is why the reserve is not
merely aesthetic.

⚠️ **That assertion must name `MAX_PROP_LEAN`, not `MAX_LEAN`.** `MAX_LEAN` is the
steepest a book slumps *of its own accord* — 3.5°. A book propped across a year
gap leans four times further, and a run inherits the prop angle, so the last book
of a row can carry it: a swing of 0.117, where `MAX_LEAN` allows 0.03. **A
scoreboard row does not protect an invariant; the assertion does, and only while
it still names the right number.** The row is `endReserve = 0.12`, bounded above
as well as below so the reserve cannot quietly grow to paper over a defect
instead.

## G28 — no book's board passes through its neighbour's

**No other gate can see a book inside another book.** G16 measures
`Box3.setFromObject` against the case's real inner faces, and two books can
intersect each other well inside those. G25 works in *footprints*, the untilted
slab a book would occupy, which is the right coordinate for the cursor's budget
and the wrong one for this question: two neighbours can have disjoint footprints
and still intersect, and overlapping footprints and not. And `placement.test.ts`'s
own flushness assertion uses three books of *identical height*, where the defect
is identically zero. The collisions this row exists for are a propped book
measuring its reach to its neighbour's *footprint* rather than its corners, and a
tall book followed by a shorter one in the same run.

The row walks the actual boards: the minimum horizontal air between every
neighbouring pair over the heights they share, across a ninety-book fixture with
dense year changes and mixed face-out books. Both edges are straight lines, so
the minimum sits at an end of the shared range and there is no step size to be
wrong about.

**It is bounded above as well as below.** Asserting only `gap ≥ 0` pins the
direction that reads as one book inside another and leaves the mirror direction,
a slot of missing book, entirely free. They are one error with two signs: a tall
book followed by a short one closes too much, a short one followed by a tall one
opens too much, and the same correction fixes both. Clamped at zero, it fixes
half an error and calls the collision closed. Two spines of one run owe each other
`TOUCHING` and nothing else, so that is what the row asserts.

⚠️ **The corner heights must use the real centre.** `height / 2` is true only of a
book that is not leaning; the real centre is `(h/2)cos θ + (t/2)sin θ`. For two
parallel books the gap is the same at every height, so the wrong height still
reads a plausible gap, off by `(δ_left − δ_right)·tan θ`, which looks exactly like
a placer that is nearly right. An independent re-derivation of the same quantity
is what settles it: **a check that disagrees with the code is not automatically
the one that is right.** G25's version of the lesson is a judge who was the
defendant; this is a judge who was simply wrong.

Observed red against four mutations of the placer, recorded in the gates history
log: measuring the prop's reach to the footprint rather than the corners, adding
the neighbour's lean in the corner case as well as the board case, clamping the
parallel push at zero, and dropping it altogether.

## G38 — one row, two surfaces

`mutation-scope` runs on two surfaces under one slug: a `pnpm test` assertion
*and* a `pnpm deploy:site` refusal. No column of this file says which surface a
row runs on, so it is said here.

**The split is by available evidence, not by taste.** Everything the disk can
answer is a **declaration fault** and lands at merge, in two seconds, in front of
whoever caused it — **seven kinds**: a declared scope whose directory is gone, a
source directory in neither the declared nor the excluded list, an exclusion
carrying no mechanism, two scopes claiming one file, a glob matching nothing, an
exclusion naming a file that has moved, and a directory that is declared *and*
excluded at once. The last two apply *"exists on disk"* and *"no overlap"* to the
exclusion list as well as to the scopes.

**An eighth check answers a different question**, and it is why *"a `mutate`
change"* belongs on the merge side at all: `stryker.config.mjs` **derives**
`mutate` from `stryker.scopes.json`, so the declaration the seven clauses just
checked is not necessarily the one Stryker runs. The gate imports the real config
and compares. Without it, an edit to the derivation — dropping a scope, adding a
negation, losing the test-file negation that keeps the test suite's own mutations
out of a score — leaves every clause above green and empties a scope silently.

So every structural cause of a scope going quiet — a rename, a widening
exclusion, a `mutate` change in either file, the code genuinely going away —
needs no mutation run to detect.

One clause is left over, and only a run can see it: **the glob matched files and
Stryker still produced zero mutants.** That is `scripts/deploy.ts`'s, against
~41 minutes on a runner for the rest.

⚠️ **Asked of the tally, never of the score.** An empty denominator produces
100% arithmetically, which is indistinguishable from a scope that is genuinely
perfect. `total === 0` is the only reading that separates them — and it is also
the only reading that survives what Stryker actually does: a zero-mutant scope is
**omitted from the report entirely**, so there is no number to compare at all.

⚠️ **The remedy list contains the weakening, and that is why the rename rules
sit in `stryker.scopes.json` itself.** *Delete the scope* is a legitimate fix for
a zero-mutant refusal **and** the cheapest way to stop measuring an inconvenient
one — and unlike lowering a floor, it does not read as a lowering. It reads as
cleanup. So a scope's identity is its declared **name**, and the config edit
carries the number across explicitly: a rename is a delete and an add in one
diff with the number visible on both sides, a split gives every child the
parent's floor, and a removal takes the same visible diff plus the floors-file
notes entry every other lowering carries.

⚠️ **The residual: the deploy half reads a snapshot and nothing there knows how
old it is.** A legitimate scope change made after the last local run reads
exactly like a scope that stopped producing mutants. The refusal names
`pnpm mutation:run` for that case; staleness itself belongs to G39, which reads
the record's own timestamps.

Observed red is recorded in [`docs/log/2026-08-20-gate-register.md`](log/2026-08-20-gate-register.md), the G38 entry, which carries the
plants and what each one printed.

## G39 — the row that could not live in `pnpm test`

**The record's age is a property of the tree, not of a diff.** A freshness
assertion in the suite goes red on a quiet week, and a contributor opening a pull
request after ten idle days would meet a red gate whose remedy — *restart the
nightly* — is not a diff they can make. That fails Clause A **for the person who
hit it**: *a stranger paying for your dead pipe is not a gate; it is a tax.* So
`metrics-freshness` is the **deploy refusal**, spec'd on G17 (`deploy-branch`)'s
scratch-repository idiom, and `gates/metrics-freshness.test.ts` drives that
refusal rather than asserting live state.

⚠️ **The slug names the property checked, not the consequence**: *the record is
fresh*, not *the deploy refuses*.

**Per-series, and the cost of that is stated.** Eight series are written by
different things on different clocks; an aggregate bound cannot see one of them
going quiet while a working merge pipeline keeps the newest row minutes old.
**Absent and stale are one verdict**: *"the newest sample is older than 3 days"*
is undefined for a series with no samples, and a series that never emitted is
precisely the failure this exists to expose. That is what makes the check
**parse samples**: a filename cannot say which series a run emitted.

**3 days, one number in three places.** The ratchet's calibration window breaks
on any gap over 3 days and the dated bootstrap expires at 3, so a record too
stale to deploy on is exactly a record too stale to calibrate on. The bound is a
multiple of the nightly, never of pushes.

⚠️ **What the gate cannot plant is the calendar.** The dated bootstrap expires on
a day and the deploy has no way to be told what day it is, so *prints at 2 days,
refuses at 4* is observed against the judgement itself in
`scripts/lib/metrics-read.test.ts`. What the gate asserts is that the script
agrees with that judgement **today** — a wiring assertion that cannot expire,
where an assertion of *does not refuse* would quietly become false once the
record aged past 3 days.

Observed red is recorded in [`docs/log/2026-08-20-gate-register.md`](log/2026-08-20-gate-register.md), the
G39 entry.

⚠️ **A test whose sentinel lies past a dated check inherits that check's
calendar.** G17 (`deploy-branch`) sat one check *before* the sentinel both files
share, so a scratch repository with no record at all went red on the day the
dated bootstrap expired. Its `repoOn` plants a fresh four-series nightly at
`refs/remotes/origin/metrics`, so a run that crosses the branch guard reaches the
vault refusal and not the freshness one. Every fixture on the path has to satisfy
the checks it does not mean to test.

⚠️ **The real-checkout row cannot plant a record.** It reads the **real**
checkout, the only evidence the guard is wired to anything, and no
`actions/checkout` carries the mirrored `refs/remotes/origin/metrics` that G39's
check reads. On `main` it would refuse on the record and never reach the vault,
and no pull request can catch that, because CI on `pull_request` is never on
`main`. The sentinel therefore sits *upstream* of every environment-dependent
check, at the step-0b line printed unconditionally once the guard has allowed the
run. **A sentinel must sit upstream of every check the environment decides**, and
**a row whose two directions run in different CI events is only half-observed by
the event you are looking at.**

## G2 in full — the public build gate

Rules 2–5 below apply to any built folder, so they live in
`scripts/lib/public-build.ts` and `deploy:site` applies the same ones to the
real build. What stays in `gate:public` is the half about the *source* —
planting the canary in a fixture vault and refusing to run without it — plus
building from it. G2 asserts against `publish()`'s output, which is a different
claim: G2 proves the filter *works*, the artifact rules prove it *ran*.

A grep of the *contents* of *text* files for known-bad patterns passes a private
value in a permitted field by construction and never reads a filename. The five
rules cover that.

1. **No note bodies.** A canary planted in a note body, plus a second planted as
   a frontmatter *value*. The gate fails if either canary is missing from the
   fixture vault, so it cannot pass vacuously.

   ⚠️ **True here and false one caller along.** This rule is shared with
   `deploy:site`, which runs it over the **real** `dist/` — where the canary is
   a `fixtures/vault` literal that cannot be present, so the rule structurally
   cannot fire. It is load-bearing in `gate:public`, where the canary is
   planted, and vacuous on the folder that actually goes to the internet.
   Accepted rather than repaired
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
   leaves real covers behind, each filename a slug of a real title. This
   assertion is also what makes cover filenames safe in general: a cover named
   after a book already in the index reveals nothing; a filename leaks only as
   an orphan.
3. **Only books you own, and only books you meant to publish.** Wishlist books
   are not owned and are kept out of `library.json`. `private: true` books are
   held back too, for a different reason: the shelf is published by a pipeline
   that never asks again, so this is the per-book way to say no. The fixture
   vault carries one of each and the gate asserts that it does, because an
   assertion about a property no fixture exhibits passes however the code
   behaves.
4. **Same-origin covers.** A `cover:` value that is protocol-relative or absolute
   `http` would make a visitor's browser hit a third-party host, and a
   hand-edited or imported note can carry one; the gate refuses it.
5. **The link preview works.** `og:image` and `twitter:image` must be absolute
   against `SITE_URL`: a relative URL would show nothing for the share card —
   size-checked by this same gate, 1200×630 — to anyone the shelf was sent to,
   and that card is the brief's success metric. The gate builds with an origin
   and checks what a scraper would fetch.

### The Thoughts split, armed before the extractor exists

A note's `## Thoughts` ships as `notes/<id>.json`
([`docs/spec/picking-a-book-up.md`](spec/picking-a-book-up.md)). The gate was
written before the extractor, so the extractor is held to a gate rather than the
other way round. G2's row carries the split; it has no row of its own.

**The gate:**

- **The presence half** reads the split book's `notes/<id>.json` in a public and
  a local build, requires the ship phrase in it, and requires the file to be
  exactly `{ paragraphs }`.
- **A vacuity guard stands beside it.** The split book ships with an id in both
  builds, and each planted case is still in the fixtures. The books whose case is
  about the section — the split, the embed, the unclosed fence, no Thoughts —
  are books a public build ships, so none of them can go quiet by turning
  private.
- **The absence half**, in both builds: the canary is in no staged file at all,
  not only `library.json`; `library.json` carries no sentence of any planted
  Thoughts section; and `notes/` holds nothing but the split book's file. That
  last one is a single allowlist for five cases — private, wishlist, an embed,
  an unclosed fence, no Thoughts — because a filtered book has no id in a public
  `library.json` to look a file up by.
- **Two rules in the shared inspector, planted under G20.** `orphan-note` reads
  both directions through `thoughts: true`: every file under `notes/` is named
  `<id>.json` for a marked book, every marked book has its file — read even when
  there is no `notes/` folder at all — and a mark that is anything but `true` is
  refused unquoted, since the key trace reads names and never values. G20 plants
  all four, the bad mark on a book with no file so no other clause can answer
  for it, and its clean synthetic build carries a marked book and a `/notes/*`
  block. `notes-shape`: every file is exactly `{ "paragraphs": string[] }`,
  non-empty, every string non-empty, at most 40,000 bytes counted in bytes, and
  free of a URL scheme. Its messages count a file's keys and never name them, so
  a writer that keyed a file by its prose cannot print the prose.
  ⚠️ **The scheme check names four schemes, not any `word:`** — `://`, `file:`,
  `obsidian:`, `mailto:`, in any case — because a rule that refuses "Note: …"
  gets switched off; G20 holds that near miss clean. G20's completeness
  assertion holds both rules to a plant, among them a five-character ending
  other than `.json`, `file:` and `obsidian:` without slashes, and a key made of
  prose.

**The extractor:**

- **The rest of the `split` row.** In a copy of the fixture vault, a build after
  the section is withheld, and again after it is removed, leaves no file for the
  book and no `thoughts` mark.
- **`headers` requires a revalidating `/notes/*` block**, beside `/covers/*`,
  planted under G20 both absent and stale.
- **`notes-shape` refuses a hidden-text marker** — `%%`, `<!`, `<?`, `-->`,
  `--!>` and any tag start. The extractor withholds any section holding one, so
  this refuses nothing a correct build ships; it is the byte cap's reasoning
  applied to hidden text. G20 plants seven forms and the message never quotes
  what it found. Bare home paths and "File:" prose are left as the spec has
  them, since either would move the extractor too. It also refuses a file that
  is not byte for byte what the writer emits, which a repeated key would
  otherwise hide behind.
- **The private duplicate** — same title, same ISBN, so the same id — is a
  `publish()` unit test in both builds: only a book `isPublishable` admits is
  ever read, and an id two publishable books share gets no file at all.
- **`gate:public`** refuses to run unless a fixture note carries the ship
  phrase inside `## Thoughts` with the canary below the section, and fails
  unless the phrase reaches a file under `dist/notes/`.
- **G5** holds `packages/site/public/notes/` ignored. **G11** names `thoughts`
  as a documented difference: the plain local index stages nothing, so it marks
  nothing; `orphan-note`'s bad-mark clause is what watches the value. **G30**
  traces the key with the stage's mark set, so it cannot pass by the key never
  appearing.

**What the extractor withholds.** A section ships only plain prose, and any other
shape withholds it ([ADR-0106](adr/0106-thoughts-ship-only-plain-prose.md)),
read through a CommonMark parser
([ADR-0107](adr/0107-thoughts-are-read-by-a-commonmark-parser.md)). The extractor's
unit tests hold each shape, each with the canary where a misread would leak it.

- **A line ending other than LF or CRLF anywhere in the body withholds the
  section** — a lone CR, U+2028 or U+2029 — rather than teach every pattern a
  second line ending. The `## About` writer turns each into LF before it
  disarms, so the line it disarms is the line the extractor reads.
- **More shapes withhold the whole section:** raw HTML by its start alone
  (`<` and a letter, `/`, `!` or `?`, so a tag split across lines and the
  declaration, CDATA and processing-instruction forms count); raw HTML anywhere
  above the section; any image (`![`), reference-style and shortcut included; a
  fenced block whose info string is not plain text, since Obsidian's `query`,
  Dataview, Tasks or Mermaid may render it rather than show it; and a setext
  underline inside a fence, which a fence opened in a list item lets through.
- **The allowlist.** Any quote or callout, any indented line, any code fence or
  backtick, `]:` anywhere, a table, or two unescaped `$` withholds the section.
- **An escaped mark the strip restores** (`\<div`, `<\!--`, `--\>`) withholds
  at extraction, so a build of such a note writes no file for the inspector to
  refuse (N52); G2 builds each.
- **The `## About` writer** turns `<`, `>` and `%%` into entities, so a
  description cannot land a live comment or HTML block, and finds `## Notes` in
  the body only, at level 2, outside fences. It refuses four writes, each
  asserting its own warning words.
- **An unreadable note costs its own Thoughts, never the build** (invariant 3),
  with a warning naming it; `publish()` reports a count of notes files, which
  `stacks build --public` prints.
- **The notes stage has a switch**, `PUBLISH_THOUGHTS` in `publish.ts`: off, it
  reads nothing and still prunes (spec §4's undo). See
  [`docs/commands.md`](commands.md). **The gates follow the switch**, so the
  takedown deploy can run: G2's presence and mark tests and `gate:public`'s
  presence check read `PUBLISH_THOUGHTS`, and their switched-off twins assert that
  nothing ships and no note is read. A G2 case drives the off path through
  `publish()`'s `publishThoughts` option whatever the constant says.

**Tests that hold it.**

- **Spec §3.1.4's named cases**, N1 to N67, are extractor unit tests (with N17,
  N58 and N66 through the adapter, N60 under G20, N65 and N67 beside the
  parser); N68 to N94 are extractor and `## About` writer cases added since. N91
  holds that `publish()` does not print a caught error, N88 the Obsidian-mark
  rows, N76 the quote's heading shapes, and N92's decoded-trace check has a
  control that finds the canary in a parse's trace.
- **`notes-shape` mirrors the extractor's output check** (N60): two `$`, `![`,
  `^[`, `::`, a control character (its range includes U+009F), Unicode tag
  characters and a near-miss heading — bare hashes, and a setext underline
  carrying an invisible character, its `=` half behind a zero-width space or with
  a no-break space inside — in its own list beside `HIDDEN_MARKER`, never a
  shared import. G20 plants each, one test each, and every plant asserts its mark
  in words. A near-miss control holds a single `$`, a `#tag`, a lone colon, line
  breaks, a tab, accented letters and prose with a no-break space beside dashes
  clean, and the extractor's own control lines (prose running into dashes beside
  a no-break space, an `=` behind a zero-width space with a word after it) so the
  two are held alike.
- **Two tests hold the parser itself.** One runs the extractor and the
  `## About` writer's lookup in a fresh Node under `--conditions=development`
  and sees every section withheld and no `## Notes` found. The other resolves the
  32 packages of `micromark`'s closure from `core` and compares each version with
  a committed list.
- **Outside the extractor.** `gate:public`'s presence verdict is `notesPresence`
  in the inspector's module, so the takedown branch's refusal — stage off, a file
  left — has a test. G20 asserts every Thoughts rule's message in words, since an
  empty message passes "never quoted" trivially. The shared-id warning's test
  requires both note paths.
- **The writer's quote.** G2 plants an invented, quoted description under a
  demoted `### About` in an existing fixture note, the canary inside the quote,
  with a vacuity check on the plant. The quote is what keeps it out: the same
  text unquoted, with its heading deleted, turns `gate:public` red on
  `note-body`.

### The held tier, gated before it is staged

The held tier stages a 1200px copy of every published cover over the shelf's
512px into `held-covers/`, named by `heldCover` in `library.json`
([`docs/spec/picking-a-book-up.md`](./spec/picking-a-book-up.md)). A second,
larger published file per book is "anything published", so it is gated: the
inspector rules ride G20, the rest extends `gate:public` and G5. It has no row
of its own.

- **Three rules join the shared inspector, planted under G20.** `orphan-held`,
  `orphan-cover`'s twin: every file under `held-covers/` is named by a shipped
  book's `heldCover` — a private book's copy, a wishlist book's, or one a build
  of another vault left, is named for a title, so its filename alone leaks the
  title. `held-oversize`: no file over 1200px on its long edge. `held-metadata`:
  no file carrying EXIF, XMP, IPTC, PNG text or a Photoshop block, and none
  sharp cannot read. ⚠️ **No direction from book to file**, unlike
  `orphan-note`: a `heldCover` with no file costs a 404 and the held book falls
  back to the shelf's copy, so it leaks nothing.
- **The inspector is async**, for `held-oversize` and `held-metadata`: sharp
  reads pixels and metadata and has no synchronous API. They stay in the one
  inspector rather than a helper only the gate calls, because the owner's
  photographed covers exist only in a real build, and `deploy:site` is the only
  caller that reads one
  ([ADR-0028](./adr/0028-one-inspector-for-the-public-build.md)). ⚠️ **sharp is
  imported inside `inspectHeld`, never at the top of the module**: `deploy.ts`
  imports the inspector on every run, and a static import pushes G17's five
  spawns past vitest's five-second timeout.
- **`foreign-cover` reads `heldCover`**: one same-origin segment under
  `held-covers/`, and stricter than `cover` by one clause — a segment of only
  dots is refused, since `held-covers/..` is one segment that resolves to the
  root. **`unknown-key` knows the key**, and G30 names it beside the other
  three. **`headers` requires a revalidating `/held-covers/*` block**: images
  take Pages' four-hour default, so a cover taken down would linger that long.
- **`gate:public` refuses to run** unless the fixture vault holds a published
  cover over 1200px, a published cover over 512px carrying EXIF and XMP, and a
  cover over 512px on the private book and on the wishlist book — read through
  the adapter. After the build it requires a held copy, named by its book, for
  every published cover over 512px, and none for the two held back.
- **G5** holds `packages/site/public/held-covers/` ignored.

**The fixtures carry it.** `signal-and-sediment.png` is 800x1200 with an
invented EXIF and XMP chunk planted by `scripts/make-fixture-covers.ts`: over the
shelf cap and inside the held one, so it is the one case that tells a re-encode
from a copy. The private and wishlist fixtures each carry a 1400x2100 cover. Each
`held-metadata` plant is first shown to carry EXIF or XMP through the reader the
rule uses, so a plant sharp silently dropped cannot pass as a rule that works.

**The stage.** `publish()` stages a held copy through the shelf stage's own
`shelved` list — so `publish()`'s local mode stages one for every book it
shelves, private and wishlist included, and a public build for none of them; a
plain `stacks build` never runs the publisher — of each
cover whose vault file is over 512px. Every copy is **re-encoded, never copied**,
turned upright first: a phone stores a portrait photo landscape and tags it, and
dropping the tag without applying it would ship the cover on its side.
`heldCover` names each copy in `library.json`, and `held-covers/` is pruned to
exactly this build's copies under the covers' rule. The held book wears the held
copy, and the shelf copy when it has none or the held copy fails to load. No
held-cover path is written into the page
([ADR-0109](adr/0109-the-held-book-is-examined-in-3d.md)); `foreign-cover` still
holds `heldCover` to `held-covers/`, and the page's CSP admits images from
`'self'` only.

- **`publish()` unit tests**, in both builds: the cap with proportions kept, a
  cover between the two caps re-encoded at its own size with EXIF and XMP gone,
  the orientation applied, nothing for a cover inside 512px or one missing or
  unreadable, and a climbing path landed as its basename. Public builds stage
  nothing for the private or wishlist book; `publish()`'s local mode stages
  both. Two prunes — the book made private, the cover shrunk — and the not-ours
  and files-only guards. A 600x900 cover stays 600x900, a 400x700 cover gets a
  copy, IPTC and PNG text are dropped, and a cover that measures but cannot be
  written leaves no file and names no copy.
- **G11** names `heldCover` as a documented difference, as it does `thoughts`:
  the plain local index stages no held copy, so it names none.
- **G15** asserts it never sees the held copies: a fixture build that really
  staged some leaves no folder inside `covers/`.
- **G35** walks the 50-book shelf for a book with a held copy, fails if none has
  one, and checks the held book wears the copy `library.json` names for it.

**The held stage has a switch**, `PUBLISH_HELD_COVERS` in `publish.ts`, on the
notes stage's pattern: `false` stages no copy and names none but still prunes,
so the next build empties `held-covers/` and the next deploy takes every copy off
the site (spec §4). `gate:public`'s held checks follow it, and switched off they
require that no copy and no `heldCover` ships, so the takedown deploy passes its
own gate; with `PUBLISH_THOUGHTS` off it still runs its held checks. A
`publish()` test drives the off path through an option.

**The held checks in detail:**

- **`foreign-cover` judges the held segment decoded**, as a browser does
  before it resolves it: `held-covers/%2e%2e` is the site root and `%2F` a
  second segment, and a segment that does not decode is refused. The plants
  carry a foreign host in front of a well-formed `held-covers/a.png`,
  `javascript:alert(1)`, an empty segment, the encoded dots, slashes and
  backslashes, a broken escape, and a list holding a good path.
- **`isSameOriginHeld` refuses a space, a C0 control or DEL** anywhere in the
  segment: a URL parser drops tabs and line breaks anywhere and spaces and
  controls at the end, so `.` tab `.` resolves as `..`. Six plants, literal and
  encoded.
- **`held-metadata` reads IPTC, PNG text and a Photoshop block** as well as
  EXIF and XMP: any of them can name a place or a person. A JPEG with an IPTC
  City and a PNG with a `tEXt` chunk, spliced in by `plantedCover` in
  `packages/core/src/test-support.ts`, each fire the rule alone. A Photoshop
  block is refused by reading only, since nothing here can write one. The rule
  names the five kinds it reads in its observation and its comment rather than
  claiming all metadata: sharp reports no JPEG comment segment, no bytes after
  the image's end and no gain map, so the re-encode is what keeps those off the
  site, and an allowlist of known-safe segments is left to
  [#425](https://github.com/mephistopheles4/stacks/issues/425) with the shelf
  tier's own gap.
- **`held-oversize` reads a cap of its own**, `HELD_EDGE_CAP`, rather than the
  stage's `HELD_COVER_EDGE`: a check that imported the stage's constant would
  rise with it. A test holds the two equal.
- **Every held rule's message, and the inspector's held observation, is
  pinned in words**, as the notes rules' are.
- **The takedown steps cover one book too**: making a book private, or
  replacing its cover, leaves its held copy on every earlier deployment, and
  this project has no access policy on them.

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

**Provenance is recorded** — `cover_source` in the frontmatter contract,
derived from the URL that was actually downloaded rather than from whichever
provider answered the metadata lookup, because those routinely differ and it is
the bytes whose terms apply. `stacks covers --backfill` records it on notes that
lack it, inferred from image dimensions rather than re-fetched — Open Library's
`-L.jpg` caps at 500px, which is an unmistakable signature, and the Apple
rewrite produces 778–2400px.

**The policy is decided:** a public build ships every cover it has, knowingly,
and honours takedown requests. Re-hosting Open Library art only would have traded
away precisely the cover quality Apple was added for. That is a decision rather
than an oversight, and it is written down in [`docs/adr/`](./adr/) with the
reasoning and with the alternative that would satisfy Apple's terms if it ever
matters ([ADR-0013](adr/0013-cover-provenance-and-rehosting.md)).

What the gate still enforces regardless: no orphans, no wishlist books, and
same-origin covers only.

**The held tier re-hosts the same art larger**: up to 1200px in `held-covers/`
beside the 512px copy in `covers/` (spec §3.3), so a takedown request covers
both folders — `PUBLISH_HELD_COVERS` takes every held copy down at once
([`docs/commands.md`](./commands.md)).

## G42 — the dependency audit, and the hatch to reach for second

The audit is a scored gate with teeth in `gates/action-pins.test.ts`, which reads
the CI workflow: **the `audit` job exists, it runs `pnpm audit --audit-level=high`,
and the `gates` aggregator lists it in `needs:` and tests its `result` against
`success`.** Deleting the job fails that test; the paragraph describing it cannot
go green and false. ⚠️ **Observed red is recorded for the job going red on an
advisory, not for the row going red on the job disappearing**, and those are
different failures.

The audit is one of two gates whose result changes without the code changing —
CodeQL, below, is the other: an advisory published tomorrow turns yesterday's
green commit red. That is correct — a vulnerability is news about code already
shipped — but it also means a transitive dependency nobody can fix will block
unrelated work. The escape hatch is `auditConfig.ignoreGhsas` in
`pnpm-workspace.yaml`, which takes the GHSA id, a date and a reason, and appears
as a one-line reviewable diff. Same shape as the allowlists in `gates/`, and the
same rule applies: an entry that outlives its reason is a permission nobody
revisits.

**Reach for that hatch second, and only after checking whether a fix exists.**
A patch can exist and still not install: `pnpm update <name>` can report success
and leave a transitive copy on the vulnerable version. A silent decline is the
dangerous shape here — the command that looks like it remediated the advisory is
the one that did nothing. An explicit `overrides` entry is honoured where
auto-resolution is not, so name the version rather than ignore the GHSA; an
`ignoreGhsas` entry for a solvable problem suppresses it and outlives its reason.
G67 holds `minimumReleaseAge` at seven days, so an override naming a version
inside the window **fails**, and the route for a security fix inside the window is
a `minimumReleaseAgeExclude` entry beside the override. See
[the log](log/2026-10-16-the-window-that-was-not-set.md).

**An entry that is there at all is held by G62 and G63.** Each entry's trailing comment carries a date that a test reads (it expires after 30 days), and the `audit` job fails once npm publishes a stable version outside the advisory's affected range. Both exist because pnpm audit reads the tree, and a stale ignore is a config line it has been told to skip. See [ADR-0095](adr/0095-a-comment-carries-the-date-and-an-ignore-expires-in-30-days.md).

Separately, and not a gate: **Dependabot alerts** and **security updates** are
enabled on the repository, so a vulnerable dependency also arrives as a pull
request — which then has to pass everything above like any other change.

## G61 — the configuration that survived, not survival

G61 (`one-shadow-reader`) is the first row here about a GPU, and it cannot
run on one that matters. What it pins is the configuration that held on the
Pixel 10 Pro XL — PowerVR D-Series DXT-48-1536, driver `25.3@6908880` — when
real-time shadows became every visitor's default: one program reads the shadow
map, in 2 draws a frame at every library size. **"The shelf survives on real
hardware" stays protected by nothing**, and says so under *Not gated,
deliberately*.

**Why a desktop can see the phone's programs.** three assembles every program
in JavaScript — the prefix, the chunks, the defines, and which materials share
one — so the GPU compiles what it is handed. The shadow define is keyed on the
renderer, so a desktop and a phone with the same settings get the same source.
The one thing a driver decides is whether a declared sampler is
*active*, so every program is classified twice — an active shadow sampler, or
any sampler named like a shadow map, by GL; a declared `*ShadowMap` sampler
with `USE_SHADOWMAP` still defined at the end of the source, by the text — and
a disagreement is red. Neither alone is enough: the source reading is what
does not depend on the backend, and GL is what keeps a text match honest.

**Why the budget is 4.** The bookcase makes 2, the shape measured to survive,
and 2 are left for a member that one day needs a mesh of its own.
⚠️ **No edge is known, so 4 is a pin on what survived and not a margin under
anything**: a shipped build with 2 sampling programs and 53 sampling draws a
frame held 120 s, with the fetch run and without, while `?receivers=all` died on
the same build. `BUDGET` carries the citations. **A red is not answered by
raising it**, which is G15's rule: find the program that started sampling, then
run `scripts/phone-check.ts` on a phone.

**Why a control.** A hook that sees nothing passes every clause about
"at most", so `?receivers=all` — every book reading the map, the configuration
that died at frame 8 — is measured through the identical hook and judge on
every run, and the gate fails unless it comes back red on programs *and* on
draws.

**Why the settle.** Until both woodwork sheets have decoded, the bookcase's
no-map program and its mapped one both draw. So "exactly one" is judged over
the frames after the program set settled, from the page's ready frame on, and
needs 30 of them; the budget applies to every frame, onset included.

**Settled** means two things: nothing has linked since, and **the set of
programs reading the map has not changed since**. The woodwork and the backboard
compile to the same program, so the first sheet to decode links the mapped one
and the second switches to it with nothing linked. The two programs draw together
for the whole gap between the decodes, which is as long as the network makes it,
and a cutoff on links alone would judge all of those frames as steady. The hook
records the last change of readers beside the last link, so what the gate waits
on and what it judges by are one rule.

⚠️ **What the second half cannot excuse.** A second reader that stands — a
member with a sampling mesh of its own, or a book program reading the map again —
changes the set once, when the sheets land, and then holds two, so every steady
frame is red. One that comes and goes never settles, and clause 2 is red instead.
What it does excuse is any window of two readers that ends in a change, however
long: a slow network gives a real visitor two sampling programs for the whole
decode gap, and whether the phone survives that is not measured. The budget
still applies to those frames, at 2 draws.

**`tsx` behaviour the hook depends on.** `tsx` compiles with esbuild's
`keepNames`, so a function serialised with `toString()` calls a module-level
`__name` helper the page does not have — the bare hook throws `__name is not
defined`. The source the page gets defines it in a block of its own. A stale
shim throws before the hook reports itself, and clause 1 says so; the Vitest
spec cannot prove this half, because Vitest's transform need not inject the
helper. ⚠️ **Stryker does the same thing, harder**: it rewrites every mutant
site in the body into a call to a module-level `stryMutAct_*` helper, so a spec
that runs the serialised string fails the mutation run's dry run.
So the behaviour is specced by calling the function, which Stryker can mutate,
and the string has a spec of its own that `vitest.stryker.config.ts` leaves out.

**The residuals, stated.**

- **Only default settings are measured.** `flat`, the one other wood species
  measured, is two sampling programs at one draw each, and `?shadowtype`,
  `?shadowmap` and anything set from the panel are not run.
- **The 300-book page is coverless past its first 50 books**, to stay inside
  G15's arithmetic; the covers program is exercised at 50 books only.
- **Draw types the phone never ran count at their upper bound**: an instanced
  call as its instances, a `WEBGL_multi_draw` call as its sub-draws. Other
  drawing extensions — the base-vertex, base-instance pair — are not wrapped,
  and three 0.185 uses neither.
- **It decays silently on another GPU**, and loudly on a three upgrade that
  moves a shadow test ahead of the books' `#undef`: an active sampler in a
  program whose source says the map is undefined is red on two clauses.

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
| `mutation-score` | killed ÷ total, per declared scope | nightly | maintainer, at `pnpm deploy:site` | **G39** `metrics-freshness` |
| `gate-suite-runtime` | wall-clock of `pnpm test` | merge and nightly | ” | ” |
| `mutation-run-runtime` | wall-clock of the Stryker run | nightly | ” | ” |
| `live-exclusions` | declared exclusions that produced ≥1 **executed** mutant, of N declared | nightly | ” | ” |
| `complexity-functions` | functions counted — the denominator the other three are read against | merge and nightly | ” | ” |
| `complexity-mass` | Σ cyclomatic complexity over those functions | merge and nightly | ” | ” |
| `complexity-mass-over-10` | Σ complexity over functions with CC > 10 | merge and nightly | ” | ” |
| `complexity-max` | the largest single function's complexity | merge and nightly | ” | ” |
| `duplication-clones` | clones found, over the ten declared scopes | merge and nightly | ” | ” |
| `duplication-lines` | duplicated lines, over the ten declared scopes | merge and nightly | ” | ” |
| `duplication-ignored-lines` | lines inside a `jscpd` suppression block, over the ten declared scopes | merge and nightly | ” | ” |
| `duplication-total-lines` | lines scanned, over the ten declared scopes — the denominator | merge and nightly | ” | ” |
| `duplication-tree-clones` | clones found, whole-tree TypeScript | merge and nightly | ” | ” |
| `duplication-tree-lines` | duplicated lines, whole-tree TypeScript | merge and nightly | ” | ” |
| `duplication-tree-ignored-lines` | lines inside a `jscpd` suppression block, whole-tree TypeScript | merge and nightly | ” | ” |
| `duplication-tree-total-lines` | lines scanned, whole-tree TypeScript — no scope list can shrink it | merge and nightly | ” | ” |
| `cognitive-functions` | functions in the cognitive population — **its own denominator**, smaller than `complexity-functions` by the nodes the rule never visits | merge and nightly | ” | ” |
| `cognitive-mass` | Σ cognitive complexity over those functions, a function the rule was silent about counting zero | merge and nightly | ” | ” |
| `cognitive-mass-over-15` | Σ cognitive complexity over functions scoring above 15 | merge and nightly | ” | ” |
| `cognitive-max` | the largest single function's cognitive complexity | merge and nightly | ” | ” |

⚠️ **The cognitive four are published *beside* the cyclomatic four and never
instead of them.** The two measures agree broadly and diverge really, and
`resolveSettings` scores cyclomatic 17 and cognitive **0**, because every `?.`
link is a branch to one measure and nothing at all to the other. A replacement
makes a 17-branch function invisible.
[ADR-0073](adr/0073-cognitive-complexity-is-published-beside-cyclomatic.md).

⚠️ **`cognitive-functions` is a different denominator, not a copy of
`complexity-functions`, and the spec has to say so or two implementations
produce different numbers.** **The gap of nine is the invariant, not either
total** — the totals grow with the tree. It has two causes, both
silences, and they are not the same silence. The rule hooks the `:function`
selector, so it **never visits** a `PropertyDefinition` or a `StaticBlock` —
nine such nodes, all in `packages/site/src/shelf`, carrying cyclomatic mass and
no cognitive mass, and **not in the population at all**. And it reports only
above its threshold, so at `0` a function scoring zero is **silently absent** —
those *are* in the population, and **absent at zero counts as zero**.

⚠️ **The cut of 15 is the supplier's own default and nothing may ever refuse on
it.** McCabe published 10 in 1976 with his reasoning; `DEFAULT_THRESHOLD = 15`
is published without any. The distinguishing test — *is the number published
with reasoning, or merely published?* — passes 10 and fails 15. So
`cognitive-mass-over-15` is published and takes **no cap**, which discharges the
condition on accepting 15 at all, and `cognitive-max` is the only cognitive
series a cap may ever reach. A mirrored cap is unreachable: it needs a mass-over
count, which needs a cut, and McCabe's 10 is *worse* — a bound about a different
measure.

✅ **`cognitive-max` is in `CAPPED_SERIES`**, disarmed in all eight scopes. The
six duplication caps sit disarmed in `jscpd.floors.json` under `duplicationHash`,
and `parseCaps` still rejects every one of their names.

⚠️ **A name joins `CAPPED_SERIES` only once records carry its family, and that is
a code constraint rather than a caution.** `countedIn` filters to rows where
**every** member of that set has samples, so adding a name before records carry
it makes it return nothing at all. **What that breaks is the *reading*, not the
window.** `capCalibration` takes its window from `streakOf`, which filters on
`row.ok` and the fixture hash and **never reads `row.counts`** — the window is
roster-independent. What collapses is downstream: `scripts/deploy.ts` derives
`newestCount` from `countedIn`, so **every cap line prints `null`**, and
`countedRun` — the sole input to the counting-rule refusal — is spread in only
when `newestCount` is defined, so **that refusal silently disarms itself**. The
caps go blind and the guard switches off, with nothing red. Waiting costs
nothing, because `countedIn` reads what a record carries rather than what a type
declares.

⚠️ **`mutation-score` is spelled *killed ÷ total* on purpose.** The score is
gameable by adding trivially-killable code, which dilutes the denominator upward
— not the coverage failure mode, and closed by neither clause of the rule above.
It sits in the Measures column so a reader meets it, rather than in a closed
ticket.

⚠️ **The four complexity counts are read side by side, and no ratio is offered
because none survived the measurement.** Every candidate ratio hid one of two
games — a mechanical three-way split of the worst function, or thirty trivial
functions appended beside it. Counts hide neither: dilution is *functions and
mass up by the same amount and nothing else moving*, a split is *functions up,
mass flat, max down*. The record carries counts and the page derives shares,
which is `mutation-score` being spelled *killed ÷ total* applied one step
earlier. **The `> 10` cut is McCabe's own 1976 bound and is not a threshold** —
nothing goes red when a function crosses it, and the four rows take no gate
number for the reason every row here doesn't. See
[`docs/spec/complexity-on-the-trend-layer.md`](spec/complexity-on-the-trend-layer.md) §2.

⚠️ **The complexity series are written on both events**, so a movement is
attributable to a single pull request rather than to a night's worth of them;
`gate-suite-runtime` is too. **G36 reads only the `Trend` column**: every other
cell in this table is prose nothing holds, which is worth knowing before trusting
one. A merge record carries **seventeen** series — the suite runtime, four
`complexity-*`, eight `duplication-*` and four `cognitive-*` — and **does not
read as a scored one**: `scoresOf` stays mutation-specific, or every push would
be paired against a nightly in the deploy's delta.

⚠️ **Duplication takes eight rows because a clone is a relation between two
places, and a relation does not partition into scopes.** Ten per-scope numbers
are structurally blind to a clone whose halves sit in two of them, and `gates/`
is read by no scope at all — so one whole-tree TypeScript number sits beside
them that no scope list can shrink. **The ten scope samples therefore do not
sum to the tree number**, deliberately: a cross-scope clone is counted by both
scopes it touches. Whole-tree means whole-tree *TypeScript*: over every file
jscpd reports, more than half of the duplicated lines are JSON this repository
did not write, and a recorded response cannot be de-duplicated without falsifying
the fixture. Counts and never a ratio, for the reason the four complexity rows
give.
[ADR-0072](adr/0072-a-clone-is-a-relation-between-two-places.md), and
[`docs/spec/static-analysis-and-style.md`](spec/static-analysis-and-style.md) §5.

⚠️ **`duplication-ignored-lines` counts what the source declares, not what
jscpd removed, and the two are different numbers.** What jscpd removes depends on
what follows the closing directive: a block ending the file removes its lines, a
blank line or a comment after it removes one more, and **one line of code after
it removes none**. A suppression block in the middle of a file does nothing,
silently. The counter records the block anyway, because a block is
an **intent** to take code out of a measurement and the intent belongs in a diff
whether or not the tool acts on it. **So `total-lines + ignored-lines` is an
approximation, not an identity.**

⚠️ **Adding a series widens `GATED_SERIES`, so the first `pnpm deploy:site` after
it lands refuses until a CI run writes a record carrying it.** That is inherent
to adding any series — the pipe genuinely has not delivered the new one yet — and
it fails in the safe direction, refusing to publish rather than publishing
against an instrument that is partly dark. `--check-only` reports it instead of
refusing. The remedy is to let the workflow run, not to exempt the names.

⚠️ **No duplication name joins `CAPPED_SERIES` yet, and that is a live
constraint rather than an oversight.** Six of the eight are to be capped, but a
name added before twenty records carry its samples makes `countedIn` return
**nothing**, for the reason given above: blind caps and a dead guard, with
nothing red. That step is
[#258](https://github.com/mephistopheles4/stacks/issues/258).

⚠️ **`live-exclusions` cannot move yet.** An exclusion is negated out of
Stryker's `mutate`, so an excluded file is never mutated and never reaches a
report — which means the run that produces this record reports **0 by
construction**, not 0 as a finding. The measurement the row describes needs a
deliberately wider run that nothing builds today. What ships is a config-drift
tripwire under the right name. Carried as an open weakness on **G36
(`trend-layer`)** in [`2026-08-20-gate-register.md`](log/2026-08-20-gate-register.md),
because *a series incapable of movement is a flat line*, and a flat line arriving
on time is the shape this layer exists to refuse.

**`metrics-freshness` is G39** — the deploy-side refusal, per series, at
`pnpm deploy:site`. Row numbers are derived from landing order, so a row's number
is written when the row lands and never pre-allocated, and a Trends cell names
the mechanism until then.

**Where the numbers come from.** `.github/workflows/metrics.yml` writes one
`metrics/<timestamp>-<sha>.prom` per run to the orphan `metrics` branch, in the
OpenMetrics text `promtool` ingests. `pnpm trend:sync` pulls it into a local
Prometheus, by hand, when you want to look. No secret exists anywhere in that
design — the mechanism is stated once, in
[ADR-0055](adr/0055-ci-writes-a-durable-record.md), rather than again here. See
also [`docs/spec/trend-layer.md`](spec/trend-layer.md).

⚠️ **Surface D's row is in that store and is deliberately not a trend.** The
edge check between deploys writes to the **local** store only, under a metric
prefix of its own, so this table owes it no row — one for a series CI never
emits would make G36's reverse direction red against every CI run. The rows
above are the whole of what the record carries as a trend, and the
staleness bound the deploy-side check applies covers all of them; D is reported
and never refused. See [`docs/spec/trend-layer.md`](spec/trend-layer.md) §§3–5.

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
pull request can land, not after. Expect most alerts to be dismissals, not bugs.

⚠️ **Nothing in a clone can check that CodeQL blocks a merge**: the ruleset lives
outside the tree, and a gate that asked GitHub would need the network, which G21
(`no-live-network`) forbids for the whole suite. So the claim belongs to the
*GitHub repository settings* row of *"Not gated, deliberately"* — relied upon and
unverifiable — which is why it is stated here rather than checked.

**Read what the rule is for before reading its severity.** Most of CodeQL's
JavaScript rules assume a server handling untrusted input. This is a local CLI
and a static site, plus one small Worker (`docs/threat-model.md` names it): the severity is calibrated for someone else's threat model,
and `docs/threat-model.md` states this one.

Three questions, in order:

1. **Is the flagged code a security boundary here?** `js/insufficient-password-hash`
   fired on the SHA-256 that names a cache file after a URL. There is no
   account, no database and no authentication in the CLI or the static site (the
   Ask the library Worker has none either: a visitor is counted by a hashed
   address, never identified), so
   there is no credential for a password-hashing rule to apply to. Dismissed as
   a false positive.
2. **If it is in a gate, is the real question vacuity?** A rule complaining that
   an extractor's regex is approximate is asking "what if it matches nothing" —
   which this repo already answers with `expectFound`. `js/bad-tag-filter` fired
   on `SCRIPT_BLOCK` in `gates/astro-no-logic.test.ts`; the miss it warns about
   throws at line 135. Fixing it properly means an HTML parser dependency, in the
   gates layer, for a file format that is not HTML, to protect against a
   first-party commit. Dismissed as used-in-tests. **The tempting half-fix —
   tweaking the regex until the alert clears while it stays just as
   approximate — is the worst outcome available**, because it buys the
   appearance of a fix.
3. **Is it worth fixing anyway, for a reason that is not security?** Usually
   yes. `js/polynomial-redos` on `safeFilename` was real: bounding the input
   fixed the backtracking *and* a truncation bug, where the 120-character cap ran
   after the trailing-dot strip and could put a dot back on the end of a Windows
   filename. The `js/incomplete-url-substring-sanitization` hits were test-only
   and still worth fixing, because `url.includes('googleapis.com')` does not
   assert what the test claims to assert.

**A dismissal carries its reasoning in the dismissal comment**, not only here —
the next person meets the alert, not this file. And a fix earns a test that goes
red against the old code like any other. Size a ReDoS test so the cost clears
its own threshold: the cost is quadratic, 60k dots landed under it, and the test
needs 200k. A test written against a defect it cannot reproduce is the oldest
failure in this file.

## Not gated, deliberately

| | Why |
| --- | --- |
| Coverage percentage | Coverage measures execution, not detection. An AI asked to raise it produces exactly the gap it is asked to close. No ticket should ever exist to raise it. |
| Changed-lines coverage floor | Not a gate at any surface: it fails [`gate-or-trend.md`](spec/gate-or-trend.md)'s Clause B, which is surface-independent, and a trend has no threshold to be a floor. Worse than absent besides — Vitest 4 dropped `coverage.all`, so a pull request adding a wholly untested module scores **100%**, green in exactly the case it exists to catch. Reversal on the grounds that AI now writes the diffs is refused: an AI asked to satisfy a diff-local floor writes tests that execute the lines it just wrote, which is the row above with volume behind it. |
| **Mutation testing (Stryker)** | A trend, not a gate: see [Trends](#trends). The number never goes red. |
| Article XI-style residency rules | No infrastructure; nothing to pin. |
| **An `.editorconfig` file** | **Refused on measurement, not on preference.** The four things such a file states are indentation, charset, trailing whitespace and a final newline, and this repository holds **0 files with a leading tab, 0 with trailing whitespace and 0 missing a final newline**. A gate built on it is green on day one and cannot go red for any file that exists — which is not the same as worthless (it steers a newcomer's editor) but is exactly what disqualifies it as a gate. It does not *fail* [`gate-or-trend.md`](spec/gate-or-trend.md)'s routing; it has nothing to route. ⚠️ **And adding one later is not free, because Prettier reads it.** The two files merge key by key: the config's keys win, but an unshadowed `.editorconfig` key (`indent_size`, `max_line_length`) silently steers the formatter and becomes a second place to look when its output surprises somebody. |
| **A link is about what it claims to be about** | G29 checks that a link *resolves*, which is not the same question: a link reading `[invariant 1](CLAUDE.md)` resolves perfectly at a file with no invariants in it. Not gated because "this link is about what it says" is a judgement, and a gate that made it would be a gate that matches prose, which `docs/gates.md` has twice learned matches anything. |
| GitHub repository settings | Dependabot alerts, malware alerts, grouped security updates, branch protection. They live outside the tree, so nothing in a clone can read them — and a gate that asked GitHub would need the network, which **G21 (`no-live-network`) forbids for the whole suite**. Named in `docs/threat-model.md` under the boundary each holds, with the limit that none is read by a gate and each lapses silently when switched off; malware alerts and grouped security updates have no read and are not named. |
| **A branch name follows the convention** ([ADR-0057](adr/0057-the-pull-request-title-is-the-commit-subject.md)) | ⚠️ **The commit-subject half of this row is gated as G55 (`pr-conventions`).** The repository squash-merges with `squash_merge_commit_title: PR_TITLE`, so the only string worth checking is the pull request title on `pull_request` — never `commit-msg`, which lints a message the squash throws away. [`gate-or-trend.md`](spec/gate-or-trend.md)'s **Clause A** asks whether a red's remedy is *reachable*, not who typed the fault: anybody with write access can edit any pull request title or body, including on a pull request from a fork, in one click and with no push from its author, so nobody is stranded by that red. **What stays ungated is the branch name, and it is disqualified on coverage rather than visibility.** `gates.yml` runs on `pull_request`, so `github.head_ref` carries the name, but it exists **only on a pull request**: a branch that never opens one is never checked, and the branches a harness names are deleted by the squash that merges them. A check firing on some branches and reading as covering all of them is the shape this file's [*Why this file exists*](#why-this-file-exists) is a list of. |
| **The linter's own config** (`eslint.lint.config.mjs`) | G46 gates the tree and nothing gates the rule set. Four options are tuned so that four documented repository idioms stop being reported, each carries its reason in the file, and each is a place a rule can be widened again later, or switched off, in a diff that reads as configuration rather than as a weakening. ⚠️ **G6's two opt-in rules are exposed the same way**: deleting either, or narrowing its `files` glob, silently removes one of G6's two checks. No gate here reads a lint config, and building one would mean a second copy of the rule set for the first to be held against. What stands in its place is the comment convention: **do not remove a reason without removing the option it justifies.** ⚠️ **`zizmor` is covered by this same row**: its `--min-severity=low` and its two `# zizmor: ignore[artipacked]` comments in `metrics.yml` are three more places an analysis can be narrowed later, and G55 (`pr-conventions`) asserts only that the tool runs and is pinned exact. One rule about two linters, and a second row would be the duplication the rest of this file spends itself refusing ([ADR-0082](adr/0082-zizmor-lints-the-workflows.md)). |
| **Test-code complexity as a series or a population** | **Refused on measurement, and the measurement is the deliverable.** No test function in this repository exceeds McCabe 10 — the maximum across all **1931** of them is exactly 10, and four fifths score 1 — so `complexity-mass-over-10` is **identically zero** for every candidate test population and `complexity-max` is a flat line. Those are precisely the two counts the spec caps, dead on arrival. ⚠️ **The cognitive half is narrower than it reads**: `cognitive-mass-over-15` is identically zero for any test population, but `cognitive-max` is **not**, because at threshold `0` any test helper with a `for` or an `if` scores at least 1. So adopting cognitive complexity does not reopen this, and the reason is the over-the-cut count rather than both counts. ⚠️ **The gates are not special**: gate test code is indistinguishable from package test code — mean 1.42 against 1.41, max 9 against 10. ⚠️ **One configuration survives and nothing rules it out**, recorded because only an *argued* edge stands against it: one population of all test files, the two volume counts, uncapped, read at the deploy, behind a second declaration list and its own ADR. |
| **Markdown line length (MD013)** | **1540 findings, 76% of everything markdownlint reports here, and no auto-fix at any limit.** Refused as part of G48 (`markdown`) rather than left unmentioned, because the rule most people would expect in a Markdown rule set is the one this repo cannot have. **No limit rescues it**: the longest Markdown line in the tree is **2048 characters** and it is a table row in [`adr/0016-painted-shadows.md`](adr/0016-painted-shadows.md). A table row does not wrap. 1008 lines exceed 100 characters and 416 exceed 200, so even a limit near 200 leaves 416 hand edits *and* still cannot pass the tables. ⚠️ **The rule is off in `.markdownlint.jsonc` and this row is the reason**, so a later session that turns it back on meets the measurement before the 1540 reds. |
| **Claiming an issue before working it** (the rule in `AGENTS.md`'s *Working rules for agents*) | A claim is a property of the tracker and of wall-clock time, not of the tree: a spec asserting it would go red for a contributor who never touched an issue, which is the metrics-freshness rejection in [`docs/spec/trend-layer.md`](spec/trend-layer.md) §4 — *a stranger paying for your dead pipe is not a gate; it is a tax*. Reading it in CI needs the network anyway, and **G21 forbids that for the whole suite**. **The mechanism is the assignee plus a one-hour window, and both halves were chosen knowing the assignee is not a lock** — every session here authenticates as the same account, so no check on the tracker can tell two of your own sessions apart. It is the only signal that renders in GitHub's own UI and that the frontier query already reads; a claim *comment* or a `claimed` label buy filterability and add a second thing to remove on abandonment, which is the state nobody cleans up. The window is the reading half and needs no cleanup: an assignment older than an hour stops being presumed live on its own. So this is an advisory recorded where a person will see it, not a lock — and the real protection remains naming the issue when a session is launched. |
| **Prose posted to GitHub is safe for a GitHub body** (a posting helper, retired by ADR-0115) | **Refused on measurement, and the measurement is that there is nothing in the tree to check.** Six ways to post a body wrong exist, three returning HTTP 200; the worst is prose hard-wrapped at 80 columns, which posts perfectly, round-trips byte-identical and still renders as ragged broken lines because a body enables hard line breaks. A gate over the repository's own GitHub-facing files is rejected: `.github/pull_request_template.md` is 2722 characters of which **473 render** — the rest is HTML comment — and what renders is six headings and four checkbox items with **no prose paragraph at all**; both issue forms already write each description as one long line. **The risk lives entirely in bodies that never touch the repository**, so such a gate is green on arrival and cannot go red for anything that exists, which is the `.editorconfig` disqualification two rows up. No tool in this repository stands in its place (ADR-0115). |
| **A mutation score is never built from reused verdicts** | **Held by a fresh checkout, not by a check.** Stryker's `--incremental` is not score-neutral ([`log/2026-09-22-incremental-is-not-score-neutral.md`](log/2026-09-22-incremental-is-not-score-neutral.md)), and a command-line flag never reaches `configHash`, because `configHashOf` reads only the object `stryker.config.mjs` exports. Writing it *into* that file is gated: `incremental` and `incrementalFile` are not in `SCORE_NEUTRAL_OPTIONS`, so the stamp moves and G56 (`config-hash`) refuses. What keeps it out of the trend store otherwise is that `metrics.yml` runs plain `pnpm mutation:run` on a new runner caching only the pnpm store, so no previous results file exists to reuse. ⚠️ **A change to CI caching that carried `artifacts/` or `reports/` between nightlies would break that with every gate still green.** Not gated because the check would read a workflow file for the absence of a cache key — a prose-matching gate over YAML, and green on arrival. |
| **The git hooks, and anything they check** (`.husky/pre-commit`, `.husky/pre-push`) | **Refused because gating them would make them a second contract**, which is the one thing [ADR-0083](adr/0083-hooks-arrive-with-pnpm-install.md) exists to prevent. ⚠️ **They arrive unasked** — `husky` is a devDependency and `prepare` is a lifecycle script, so `pnpm install` wires them for every contributor — which is exactly why the *promise* has to stay one-directional: `CONTRIBUTING.md` guarantees that a contributor whose hook is broken, skipped or absent passes every gate, and a gate over the hook would retract that guarantee. **Every check inside them already refuses in CI** — `pnpm lint` and `pnpm format:check` in the `style` job, G56 (`config-hash`) at merge — so the layer buys latency and *no new coverage*, which is stated here rather than left to be inferred from a green build. ⚠️ **`--no-verify` skips both and is supported, not a loophole**: nothing here is a guarantee, so nothing here needs to be unskippable. ⚠️ **A gate over the hook's own text is refused too** — it would assert that a file says what it says, which is the vacuous green this file catalogues, and a hook nobody has installed still passes it |
| **The shelf survives on real hardware** | **It needs a device, and CI has none.** Two separate phone failures shipped past every gate here — an oversized texture budget and a driver that loses the context when too much of the scene reads the shadow map — because `smoke:render` renders on a desktop with gigabytes of headroom. G15 (`cover-budget`) gates the first cause and G61 (`one-shadow-reader`) the one configuration measured to survive the second, on one driver, and neither is survival: another GPU could fail differently with both green. `scripts/phone-check.ts` runs the page on a USB-attached Android phone and gives the same verdict every time, and it is a tool run by hand rather than a `pnpm` script — adb and a phone are not something [`CONTRIBUTING.md`](../CONTRIBUTING.md) can ask of a contributor. Run it before merging anything that touches shadows, materials, lights, the bookcase's geometry or three |
| **An agent runs the suite through athanor** (the agent guard, [ADR-0123](adr/0123-a-hook-holds-agents-to-athanor.md)) | **A local nudge that shows a skip, not a control, and nothing in CI can read it.** `scripts/agent-test-guard.ts` runs as a Claude Code `PreToolUse` hook from `.claude/settings.json` and refuses the host runs that have an `athanor run` equivalent while athanor works, and a full mutation run always; its decision, in `scripts/lib/agent-test-guard.ts`, is tested in-process by `scripts/lib/agent-test-guard.test.ts` and its probe by `scripts/agent-test-guard-hook.test.ts`, which is what holds the code. What no test can hold is that a session obeys it: the hook sees only the text of a call, so a launcher it does not know, a script that calls `pnpm test` inside itself, or another agent's harness passes untouched, and a fault in the hook is silence by design, because a guard that failed closed would stop all work in the repo. ⚠️ **It is no control against running a branch's code on the host**: a checked-out branch's own version of the script is the one that runs, and `pnpm test` would run that branch's code anyway — the owner decided against a security review of it. |
| **Where a new spec lives** (a comment on its issue, [ADR-0145](adr/0145-new-specs-live-on-their-issues.md)) | **A spec on the tracker is read over the network and no gate holds it.** The one mapping from a spec to its location is its row in [`docs/spec/README.md`](spec/README.md), and an issue link is not a file, so `doc-links` (G29) cannot resolve it and G21 (`no-live-network`) forbids a gate that asked GitHub. The rule that only the owner's account counts, and that a revision's comment is never edited, is a written convention in [`docs/agents/issue-tracker.md`](agents/issue-tracker.md#specs): nothing reads a comment's author or its edit history in a clone. Accepted: a cold session without the network learns from the README row what exists and where it stands, but not the full text. Not gated because the check would read the tracker, which is the claim row's reason above |
| **The survivor record keeps arriving** | **Nothing watches, by the owner's choice.** The nightly's `record the survivors` step is warn-only ([`docs/spec/survivor-record.md`](spec/survivor-record.md) §S4.5, [ADR-0117](adr/0117-survivors-are-matched-by-content-and-recorded-on-their-own-orphan-branch.md)): a failure to write or push the record leaves the night's verdict alone, and the one signal that it stopped is the summary line, which names the reason or the step that failed. It is not a trend, because G36 holds the `## Trends` table to emitted series in both directions and a record file is a set, not a series; it is not a gate, because a good night turned red by a secondary record is the cost the owner declined. ⚠️ **A record that stops arriving shows only as a gap on the `survivors` branch and a *not recorded* line on that night's run page.** C9 (`scripts/commit-metrics.test.ts`) and the pure record tests hold the code; no live run is forced to fail, because forcing one would also write a failed night to `metrics`. Not gated because the check would read a branch the nightly writes for the absence of a night, which a pull request's gates cannot see |

## What building these gates taught

What went wrong while writing these gates is the part most likely to go wrong
again. Each line is a standing rule; the decisions behind the gates are in
[`docs/adr/`](./adr/) and the dated entries are in [the gates history log](log/2026-11-12-gates-history.md).

- A pull request runs Stryker's dry run (G70, `mutation-dry-run`), with no path filter: a spec that reads a file the sandbox rewrites passes `pnpm test` and fails there, because the sandbox is not the checkout. Read a line number from the file the tool actually lints, never hardcode it.
- A number measured on one configuration is a fact about that configuration: run the falsifier before writing it down as the rule.
- A proxy for the event you mean holds only while every path to the event goes through the proxy: measure the event itself, and when a flake is rare, slow the race down until it is not.
- A cap that drops the oldest record drops the one the gate may be reading: keep the first frames and record the last event outright.
- A flag named after a mechanism is not the mechanism, and a capped count is not an uncapped one: count what was compiled and drawn, not what a flag or a cap says.
- Code shipped as a string is code three toolchains transform differently (`tsx`'s `keepNames` adds `__name`, Stryker rewrites bodies): spec its behaviour by calling it, and its serialisation separately.
- An approximation of someone else's algorithm has no safe direction when its output is what the author types next: G29 slugs headings with `github-slugger` itself ([ADR-0086](adr/0086-g29-slugs-with-github-slugger.md)).
- A gate that reads a path can redden a document nobody meant to touch when a file is renamed: retarget the href alone and leave a decision record's rendered text byte for byte.
- A residual search after a rename must match every form the name takes, comments included, and be run against a known-positive control; a plain `case.ts` also matches `bookcase.ts`, so the pattern is `(?<!book)case\.ts`. Comments are invisible to `typecheck`.
- A freshness bound derived from a list grows with the list: adding a trend series makes `pnpm deploy:site` demand a fresh sample of it, so every hand-built record fixture, G17's (`deploy-branch`) among them, must grow with it.
- A test whose name states a property must assert it: the tell is an assertion that mentions one quantity where the name mentions two. `expectFound` guards an extraction that matches nothing; an assertion that compares nothing is the same failure one level up.
- When a gate flags something that is not what it was written to find, fix the code it flagged; widening the gate with an exception is the wrong move (G24's `createRequire(import.meta.url)` fix was more correct than the code it rejected).
- A constant derived from today's data and then frozen, such as a column width, is invisible to every assertion that checks content: measure it from the data being printed and plant a longer case.
- The render gate builds and serves `dist/` itself rather than driving the dev server: a gate that can hang is worse than one that can fail, and it screenshots what ships. Its pixel probe waits two `requestAnimationFrame`s before `readPixels`.
- A gate that matches prose matches anything: G14 anchors a command name to the start of a line in the Commands block.
- G1 holds its allowlist in both directions, so a new importer needs an entry and a spent exception must be removed; a list that only grew would keep it.
- A gate must not return early on the branch it happens to run on: G17 points git at a scratch repository with `GIT_DIR` so the guard is real and only the checkout is controlled, and one test omits the redirection on purpose. Mutate in both directions, because a positive check cannot detect a missing guard.
- A test file that writes into the main checkout, like the `.env` probe, names it per process: two worktrees running `pnpm test` at once would otherwise delete each other's file and present as a flaky assertion.
- README is not covered by G14, so its status line and lists point at the gated lists, and no prose states a count: numbers belong in gate output, where they cannot rot. `docs/progress.md`'s current-state table must be updated in the commit that closes a gate.
- Every gate before G26 checked a contract; recall is not a contract. G26's expected answers are facts about the world, and its corpus pins the refusals as hard as the finds, so a matcher that says yes to everything goes red.
- Trace a reported root-cause list before hunting it, and probe with the query the code actually sends, not a shorter one.
- A report is an instrument: assert its claim, not its branches. G27 requires every book the header counted to appear in one line and one total, and `reportEntry` returns a book's line and its total together so one cannot be written without the other.
- A gate whose fixtures are captured by a script is only as true as that script's environment: `scripts/capture-lookup-recall.ts` must `loadEnv()`, and a quota error is not a negative result ([ADR-0005](adr/0005-three-metadata-providers.md)).
- G26 pins the ranking rule, not the providers' answers on one day, so its corpus is refreshed by splicing: `scripts/capture-lookup-recall.ts --only <url-prefix>` re-captures that prefix and replays every other entry from the committed file, and a bare run is no longer the refresh ([ADR-0112](adr/0112-g26-pins-the-ranking-rule.md)).
- A premise phrased as "already served better" is a claim about cost: measure the cost before asserting it, and do not write an unmeasured duration anywhere.
- An extraction pattern must not pin an incidental property of the text it reads, such as the quote character: accept `['"]`, and have each plant assert both forms, because a regex flipped to the other quote is as green against a one-form plant as a widened one.
- Aim a pinning mechanism at the roster, not at the one flag somebody is thinking about: G45 pins the deploy flags as a class, because a review names an instance and the repair must cover the class.
