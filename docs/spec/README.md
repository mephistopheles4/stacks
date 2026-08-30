# `docs/spec/` — the locked specs

**Five efforts have produced a locked spec in this folder.** Each is decided end to
end, and **each carries its own build order and its own gate roster** — they do not
share one. **The third and fifth are waiting for an implementation session**; the
first two have been built and are kept as written, and the fourth is built except
its last step.

⚠️ **The fifth is the first whose finish line is not a document.** Its map carried
execution as a deliberate override of wayfinder's plan-don't-do default, so it is
done when a rendered bookcase is on `main` — not when this folder is complete.

| Spec | Index | State |
| --- | --- | --- |
| The enhanced book card, provider provenance, and the merge | **this file, below** | **built** on a branch; kept as written |
| What comes after the scoreboard — mutation scoring, the trend layer, the gaming analysis | [`after-the-scoreboard.md`](after-the-scoreboard.md) | **built**; kept as written. All seven rows landed. ⚠️ **Built is not armed** — the ratchet ships with every scope `unarmed`, and arming one is a human judgement per scope after its calibration window fills. [#154](https://github.com/mephistopheles4/stacks/issues/154) is the live answer |
| Complexity on the trend layer — four counts, a cap that only falls, and CRAP kept local | [`complexity-on-the-trend-layer.md`](complexity-on-the-trend-layer.md) | **waiting for an implementation session**. Four series, a deploy-side cap mirroring the ratchet, TypeScript pinned to 6.0.3 until 7.1, coverage admitted as an ingredient for a pre-commit CRAP print — and **no gate row**. Twelve tickets; [the map](https://github.com/mephistopheles4/stacks/issues/186) carries the trail and the override list |
| Static analysis and style — one routing rule, a verdict per candidate | [`static-analysis-and-style.md`](static-analysis-and-style.md) | **built, except its last step.** All four gate rows landed — **G46** (`lint`), **G48** (`markdown`), **G49** (`format`), and **G50** (`astro-types`) inside `pnpm build` — three of them in one `style` job beside `audit`, and all twelve trend rows **this rollout adds** emit: eight duplication and four cognitive. ⚠️ **Twelve is this spec's count, not the nightly's** — `metrics.yml`'s `--expect` list carries sixteen trend series, the other four being the `complexity-*` rows [`complexity-on-the-trend-layer.md`](complexity-on-the-trend-layer.md) landed. Three refusals recorded. What is left is §6 step 9, **arming**: `cognitive-max` joins `CAPPED_SERIES` and the six duplication caps land in `jscpd.floors.json`, which waits on twenty qualifying nightlies rather than on effort — [#269](https://github.com/mephistopheles4/stacks/issues/269), and ⚠️ **a nightly that fails breaks the streak rather than pausing it**. ⚠️ **Deliberately thin** — eleven tickets hold the reasoning and the file links rather than retells, per [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md). [The map](https://github.com/mephistopheles4/stacks/issues/228) is **closed as of 2026-08-26** and carries the trail, and the eleven verdicts were also read as one configuration in a morphological box that is deliberately not in this checkout |

| The woodwork reads as wood — rosewood, a drawn fibre, and per-member variation | [`the-woodwork-reads-as-wood.md`](the-woodwork-reads-as-wood.md) | **waiting for an implementation session**. Nine closed decision tickets, six implementation tickets in **a linear chain that must not be run in parallel** — every slice edits the same module — and four gate rows. ⚠️ **The prose spec is on the tracker**, [#300](https://github.com/mephistopheles4/stacks/issues/300); this file is the index that survives when a branch does not. ⚠️ **Ticket one fixes something broken on `main` today** and shares no file with the rest. [The map](https://github.com/mephistopheles4/stacks/issues/280) carries the trail |

⚠️ **Gate numbers are per-rollout and never reusable.** The first spec landed
**G30–G35**; the second landed **G36 and G38–G43**, derived from its own landing
order rather than chosen. ⚠️ **That is not a typo and it is this warning's own
best example**: this line read *"allocates G36–G42"* until the rollout finished,
and it was wrong, because `agents-import` took **G37** out-of-band from
[#172](https://github.com/mephistopheles4/stacks/pull/172) while the rollout was
open — so every pre-allocated number in it landed one low, and four separate
register entries record the correction. A row number is a fact about when
something landed, not a name — **cite slug and number together, never the number
alone.**

---

## The enhanced card, provider provenance, and the merge

This folder is the output of [Map: the enhanced book card, and the provider
provenance behind it](https://github.com/mephistopheles4/stacks/issues/88) — 15
closed decision tickets, assembled into something an implementation session can
execute **without reopening any of them**.

**Everything here is decided.** Where a resolution and a later amendment
disagree, these files carry the later one and footnote the supersession. Where a
decision went against a recommendation, the counter-argument is recorded, because
that is what would have to be true for the decision to reopen.

> **Built.** This spec has been implemented on
> [`claude/mattpocock-skills-wayfinder-ce3871`](https://github.com/mephistopheles4/stacks/tree/claude/mattpocock-skills-wayfinder-ce3871).
> It is kept as written — the decisions, their counter-arguments and the
> residuals are the artifact — with the build order below now reading as what
> happened rather than what to do. **Step 4 has run**: `pnpm stacks enrich`,
> twice, against the real vault — 40 books filled on the first pass and 1 more on
> the second, which is the convergence property G34 asserts, doing it for real.
>
> ⚠️ **The real data found a bug the fixtures could not.** `mergeFields` skipped
> any field the primary already carried — and Open Library is the primary for
> almost every book *and* always has `publish_date` and `subjects`, so the named
> per-field exceptions never ran once. The vault filled with bare years where the
> table says Google wins and with raw headings like
> `nyt:paperback_advice=2012-01-14` where it says Apple's genres win. Fixed, the
> vault restored from a pre-pass backup and re-enriched: full dates went from a
> handful to **30 of 41**, and the Open Library noise is gone from all of them.
> Absent-only is a rule about *the note*, not about which provider wins, and
> enforcing it one layer too low made the whole table decorative.
>
> The ADR list below proposed five;
> [0044](../adr/0044-precedence-is-a-table-not-a-judgement.md)–[0049](../adr/0049-the-card-is-a-non-modal-bottom-sheet.md)
> are **six**. Absent-only earned one of its own
> ([0046](../adr/0046-absent-only-holds-unconditionally.md)): the list had it
> folded into the precedence record, and it is a separate decision with a
> separate cost — a book already wrong stays wrong.
>
> **The marks have landed, and not the way §5 assumed.** The card's three are
> **redrawn monotone glyphs** on the owner's instruction, which trades this
> spec's redistribution residual for a modification one — see
> [ADR-0050](../adr/0050-provider-marks-are-redrawn-monotone.md). Google's
> powered-by graphic *is* vendored unaltered, and turned out to be 62×30 rather
> than the 144×26 this document guessed, and dark on transparent, so it sits on a
> plate. Apple's own icon was 404 at every URL tried.

**This spec does not implement.** It states the edits; the implementation session
makes them. In particular, **do not edit AGENTS.md's contract blocks ahead of the
code** — `gates/frontmatter-contract.test.ts` (G8) holds the contract to the
parser in both directions, so adding seven keys to the document before the parser
knows them is a red build.

---

## The four files

| File | Covers |
| --- | --- |
| [`metadata-merge.md`](metadata-merge.md) | Per-field provider precedence, Apple as a full contributor, which fields are taken and in what container, absent-only, the `## About` body section, and **the `enrich` pass** that runs all of it |
| [`provider-provenance.md`](provider-provenance.md) | What a contributor is, the four id keys, ids-never-URLs, parse-time shape checks, and how all seven new fields reach `library.json` |
| [`enhanced-card.md`](enhanced-card.md) | The card's content and hierarchy, the bottom sheet, dismissal and motion, accessibility, the provider links row, DOM structure, and acceptance |
| [`attribution-surface.md`](attribution-surface.md) | Google's "powered by Google" obligation, the bottom-left surface, and the `/attribution` route |

**Read them in that order.** Each one depends on the ones above it: the card
renders fields the merge invents and ids provenance records, and the attribution
surface exists because the merge takes more Google data.

Background that is *not* restated here: each spec file names its source tickets
at the top, and the measured findings behind them live in **research documents
that are not in this checkout** — each was captured on its own throwaway
`research/*` branch and linked from its ticket:

| Finding | Branch |
| --- | --- |
| [`outbound-links-from-isbn.md`](https://github.com/mephistopheles4/stacks/blob/55f9303/docs/research/outbound-links-from-isbn.md) | `research/outbound-links` |
| [`provider-id-urls.md`](https://github.com/mephistopheles4/stacks/blob/04eb320/docs/research/provider-id-urls.md) | `research/provider-id-urls` |
| [`discarded-provider-fields.md`](https://github.com/mephistopheles4/stacks/blob/491efdf/docs/research/discarded-provider-fields.md) | `research/discarded-fields` |
| [`apple-book-url-form.md`](https://github.com/mephistopheles4/stacks/blob/4fef0df/docs/research/apple-book-url-form.md) | `research/apple-url-form` |
| [`provider-mark-usage.md`](https://github.com/mephistopheles4/stacks/blob/64f861c/docs/research/provider-mark-usage.md) | `research/provider-marks` |
| [`google-books-search-url.md`](https://github.com/mephistopheles4/stacks/blob/8924fd4/docs/research/google-books-search-url.md) | `research/google-search` |

The card prototype and its shots are on [`prototype/enhanced-card`](https://github.com/mephistopheles4/stacks/tree/prototype/enhanced-card),
also throwaway.

---

## Build order

Nothing here is optional and the order is not arbitrary — three steps produce
data the next step needs, and one of them is a network pass over the real vault.

1. **Core: the merge.** `findCover` returns the matched record (one change
   serving both Apple-as-contributor and `apple_track_id`); the precedence table;
   `publisher` / `published` / `subjects` / `description` taken; the `; `
   separator; `BookInput` and `FILLABLE` grown; every write still
   `if (book.X === undefined)`.
2. **Core: provenance and the adapter.** The four id keys through the parser with
   their shape checks; `VaultAdapter`'s **sixth method** (body-section insert,
   written only when `## About` is absent); the Open Library `fields=` widening
   and the **re-captured OL fixtures** it invalidates.
3. **Gates and contracts.** M1, M2, P1, P2, P3 (below), G26's corpus re-captured
   through `loadEnv()`, and the AGENTS.md edits that move with them.
4. **`pnpm stacks enrich`, twice, over the real vault.** All seven new keys are
   absent on **every** note that exists, so nothing downstream can be judged
   against real data until this runs — and run one undercounts by design.
5. **`library.json`.** Seven `keyIfPresent` lines in `toLibraryBook`, seven
   fields on `LibraryBook`.
6. **The card.** Content, sheet, dismissal, accessibility, links row, and the
   puppeteer assertions.
7. **The attribution surface and the `/attribution` route**, with the
   `gate:public` `robots` rule widened past `index.html`.

Steps 6 and 7 are independent of each other; everything else is a chain.

---

## Gate roster

Numbers are deliberately **unassigned** — `docs/gates.md`'s own note is that a
row's number is not knowable until it lands, and the highest live row is G29.
Each new gate costs a row in [`docs/gates.md`](../gates.md), which **G19**
(`constitution-scoreboard`) enforces in both directions, so landing a gate
without scoring it is a red build.

Landed as **G30**–**G34**; the labels below are how the spec referred to them
before they had numbers.

| Label | Gate | Why nothing today catches it |
| --- | --- | --- |
| **M1** | Precedence contract seam — the documented table ↔ the implementation, **both directions** | Precedence is gated by nothing. Also the natural home for the `; ` subjects separator, which two packages hold. |
| **M2** | Absent-only over the grown `FILLABLE` — a note already carrying a key comes back **byte-identical** whatever the providers say | True by construction today, and about to grow from four fillable fields to eleven |
| **M3** | *(not a new gate)* G26 `lookup-recall`'s corpus **re-captured through `loadEnv()`** | A merge change moves its expectations, and a corpus captured without the Google key once replayed refusals as answers for two days |
| **P1** | `BookRecord` → `library.json`, **both directions**, with a **named** exclusion set | G8 stops at the parser; `build-modes` pins only the two known per-build differences. **Seven new fields cross this seam.** |
| **P2** | Whole-pass idempotence — `enrich` twice over a fixture vault against a stubbed `HttpGet`, every note byte-identical after run two | The **only** gate that reaches the `## About` body insert, since a body section is not a `FILLABLE` key |
| **P3** | Convergence after a provider failure — stub a provider to fail on run one and answer on run two; assert the id lands | Otherwise the whole rate-limit answer rests on an undocumented property of `http.ts:64` that nothing checks |
| **C1** | The card, in the Phase-2 puppeteer idiom — eight assertions, listed in [`enhanced-card.md`](enhanced-card.md#11-acceptance) | The existing click test asserts only that a card opens |

Landed as **G35** (`enhanced-card`), inside `scripts/smoke-render.ts` rather than
as a new script: six of the eight assertions need a real browser, and the other
two — `published` rendering and the collapse rules — are pure functions asserted
in `card.test.ts`, where they cost nothing.

**Existing gates that move or must be honoured:** G8 (frontmatter contract) gains
seven keys; G19 needs a row per new gate; G4 already pins `updateBook`'s
scalars-only rule; G21 forbids live network, which is why re-capturing the Open
Library fixtures is a real cost; G20 watches each `gate:public` rule go red, so
widening the `robots` rule means watching it red on a second page.

**One gate was offered and declined**, recorded as declined rather than
overlooked: a deploy-time check that the `powered by Google` graphic is still
served. In a gate-heavy repo the absence of one is worth a sentence.

---

## Contract edits

Each of these is a **document edit that must land in the same commit as the code
it describes**, never before it.

**`AGENTS.md` — frontmatter contract.** Seven new optional keys:

```text
publisher, published, subjects,
google_volume_id, apple_track_id, openlibrary_olid, oreilly_ourn
```

with `published` **stored verbatim** (whatever the provider said, timestamp
included — the card does the tidying), `subjects`' `; ` separator and cap of 5,
and each id key's shape check and drop-on-mismatch behaviour. G8 moves with it.

**`AGENTS.md` — vault adapter contract.** The block lists five methods and gains
a **sixth**: a body-section insert, scalar-free, written only when the heading is
absent. The paragraph explaining why `updateBook` rewrites lines rather than
re-serialising applies to it verbatim and should say so.

**`AGENTS.md` — invariant 2.** One clause: the future allowlisted-section
publishing **must never name `## About`**. An allowlist and never a denylist is
what makes this safe to state once — but it has to be stated.

**`AGENTS.md` — commands.** `stacks enrich`'s line changes meaning: it is
permanently a whole-vault network pass, and **"run it twice" is the operating
instruction**, not a workaround. `gates/commands.test.ts` holds both lists in
both directions.

**`docs/gates.md`.** A row per new gate. G19 enforces this in both directions.

**`docs/progress.md`.** Updated in the same commit as each gate, per its own
rule; a new investigation goes to `docs/log/<date>-<slug>.md` with one index
line.

---

## What belongs in `docs/adr/` rather than here

AGENTS.md's test for an ADR is: **hard to reverse, surprising without context,
and a real trade-off.** Five decisions in this effort meet all three. The
proposal is a *list*, not five written records — writing them is implementation
work, and the next free number is **0044**.

| Proposed record | Thesis | Source |
| --- | --- | --- |
| Precedence is a table of fixed provider orders, never a rule about the value | A quality judgement embedded in the merge would have to be re-encoded in the gate to check it; a fixed table is one line and one fixture per field. Accepted cost: the table goes stale silently. | [#97](https://github.com/mephistopheles4/stacks/issues/97) |
| A provider description lives in the note **body**, not in frontmatter | "Never published" becomes structural rather than a discipline — a body section is not a `BookRecord` field. Costs the adapter a sixth method: the riskiest write this project would own. | [#97](https://github.com/mephistopheles4/stacks/issues/97) |
| The contributor set *is* the set of id keys present — ids, never URLs, and no winner key | An `href` is outside the `textContent` rule's protection; a note records an answer, never who gave it, so there is no inference escape hatch and backfill is a real pass. | [#96](https://github.com/mephistopheles4/stacks/issues/96), [#99](https://github.com/mephistopheles4/stacks/issues/99) |
| Google's attribution binds this site, and is discharged by a vendored page-level graphic | Reversing it means either dropping Google fields or publishing without attribution. Vendored against a recommendation, to keep the page's zero third-party requests. | [#104](https://github.com/mephistopheles4/stacks/issues/104), [#106](https://github.com/mephistopheles4/stacks/issues/106) |
| The card is a non-modal bottom sheet below `(max-width: 700px), (max-height: 500px)` | Non-modality buys tap-to-swap and costs occlusion; the breakpoint becomes a fact two languages hold, which is why nothing else may key off it. | [#91](https://github.com/mephistopheles4/stacks/issues/91), [#92](https://github.com/mephistopheles4/stacks/issues/92) |

Everything else in these four files is spec, not ADR: it is either mechanical
(field lists, type scales, URL forms) or already carries its reasoning inline. A
lesson about a *gate* goes to [`docs/gates.md`](../gates.md); an environment
finding goes to [`docs/progress.md`](../progress.md).

---

## Out of scope — and the spec says so

Ruled out during this effort. Each returns only as a fresh effort, never as a
resumption of this one.

- **Picking a book up** and the **public/private notes pipeline** — both halves
  of [`docs/notes-on-the-shelf.md`](../notes-on-the-shelf.md). This work enhances
  the overlay as an overlay.
- **Reading-timeline content** (started→finished duration on the card).
- **Desktop placement and motion** — positioning the card next to the clicked
  book, open/close animation tied to the hit. The card stays a corner overlay on
  desktop.
- **Moving the scene to clear the card.** `ShelfHandle.projectBook` already
  reports where a book sits on screen, so this is declined rather than
  unavailable. Accepted consequence: a book on the bottom row is occluded by its
  own card.
- **Reading `coverSource` as a proxy for which provider described a book.**
  `cover_source` is cover-byte provenance; recording the real contributor set
  removes the need for any proxy.
- **Adding a fifth provider.** The merge works the four that exist.
- **A keyboard path to the shelf itself.** ⚠️ **This one carries a revisit
  condition**: the card's "focus does not move on open" leans on there being no
  focus origin to return to, so the moment the shelf gains a keyboard path, that
  decision is the one to reopen. The dependence is one-way.
- **`binding` inference** from cover aspect or page count — permanently struck
  ([#52](https://github.com/mephistopheles4/stacks/issues/52)), and the field
  audit confirmed no provider supplies binding.

---

## The residual register

Every open risk this effort accepted, in one place, so none of them is
rediscovered as a surprise. Detail is in the file named.

| Residual | Where |
| --- | --- |
| Vendoring three provider SVGs plus the Google graphic is an open **redistribution** question, accepted as ordinary risk | [card §12](enhanced-card.md#12-residuals-carried-not-smoothed), [attribution §5](attribution-surface.md#5-the-asset-vendored-not-hotlinked) |
| `apple_track_id` is **title-matched on all 41 books** — Apple has no ISBN endpoint. A wrong id is invisible until a visitor clicks it and hits a hard-404 | [provenance §9](provider-provenance.md#9-residuals) |
| Parse-time shape checks are a **typo guard, not a correctness guarantee** | [provenance §4](provider-provenance.md#4-unrecognised-values-are-dropped-at-parse-per-provider) |
| `trackId` stability across an edition change is **inference, not measurement** | [card §12](enhanced-card.md#12-residuals-carried-not-smoothed) |
| The precedence table **goes stale silently** when a provider's data quality changes | [merge §8](metadata-merge.md#8-residuals) |
| `publisher` is **mixed-provenance from day one** — 17 hand values, 24 provider values, indistinguishable | [merge §5](metadata-merge.md#5-absent-only-holds-unconditionally) |
| A book already carrying a **wrong value keeps it forever**; correcting it stays a hand edit | [merge §5](metadata-merge.md#5-absent-only-holds-unconditionally) |
| `enrich`'s run one **undercounts by design**; "run it twice" is the instruction | [merge §6](metadata-merge.md#6-the-pass) |
| A provider that cannot supply an id leaves a **permanent gap**, re-asked forever | [merge §6](metadata-merge.md#6-the-pass) |
| `'★'.repeat(rating)` has **never been rendered by anything** — 0 of 41 books carry a rating | [card §12](enhanced-card.md#12-residuals-carried-not-smoothed) |
| Apple's icon is **unlabelled for a sighted touch user**; `title` never fires on touch | [card §8](enhanced-card.md#naming-title-and-no-aria-label) |
| `title`-as-accessible-name is the **weakest mechanism** in the accname computation | [card §8](enhanced-card.md#naming-title-and-no-aria-label) |
| The landscape phone sheet **overflows the cap by 103px** | [card §4](enhanced-card.md#4-layout) |
| The **slide-down on dismiss exists in no code** — the defaulted number is also the unimplemented one | [card §6](enhanced-card.md#6-dismissal-drag-and-motion) |
| While a phone card is open, **no Google graphic is on screen** | [attribution §4](attribution-surface.md#4-placement-measured-and-the-phone-occlusion-accepted) |
| 35 of 41 books carry `pages` with **no recoverable provenance** — unclosable in principle | [attribution §7](attribution-surface.md#7-residuals) |
| The Google graphic's footprint is **assumed 144×26**, unmeasured | [attribution §5](attribution-surface.md#5-the-asset-vendored-not-hotlinked) |
| **No gate protects the graphic being served** — declined deliberately | [attribution §5](attribution-surface.md#5-the-asset-vendored-not-hotlinked) |
| Google's "no competing search services" clause is **read narrowly** — a judgement | [attribution §5](attribution-surface.md#5-the-asset-vendored-not-hotlinked) |
| The **`## About` insert is the riskiest write this project would own**; gate P2 is the only check that reaches it | [merge §4](metadata-merge.md#about-why-the-body-and-what-it-costs) |

---

## One thing the map noticed and left as fog

Whether Google's `intitle:` / `inauthor:` operators help or hurt on a two-term
query. Left unticketed because nothing turns on it now that the search fallback
targets Open Library, and because it is **currently unmeasurable** — Google's
refusal is sticky and its result content is unverifiable from a script. Revisit
only if the search target moves back.
