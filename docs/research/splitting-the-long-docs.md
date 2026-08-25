# Splitting `progress.md` and `gates.md`

Research for the question "these two are getting large — is splitting worth it?"
Nothing here is implemented. This is the evidence a decision should be made
from, and the answer it points at is **yes for the prose tail of both files, no
for either file as a whole** — for a reason that is about genre, not size.

Every number below was measured on this tree at `d67c576`. Every claim about
what a gate does was checked by running its parsing logic, not by reading it.

## The measurement that decides it

| | `progress.md` | `gates.md` |
| --- | --- | --- |
| Total lines | 1551 | 1112 |
| Lines that are table | 116 | 65 |
| Parsed by a gate | **nothing** | 28 `\| **G**n \|` rows, `## Status key`, `## Invariants → gates` |
| Other readers | `phase-gate` skill names 3 sections | — |
| Largest single section | *The mobile crash — G15*, **460 lines (30%)** | *Defect gates* commentary, ~590 lines |
| Sections at H2 | 24 | 14 |

So both files are **~94% append-only prose tail wrapped around a small spine**.
That ratio is the finding. "The files are big" is the symptom; "the spine and
the tail were never the same document" is the diagnosis.

**`progress.md` has already drifted from its own stated contract.** Line 5 says:

> This is an **index, not a narrative**. One line per event, newest phase last.
> Gists and links — never restate the plan.

It is 1551 lines and 24 narrative sections. That is a stronger argument than any
line count, and it is the failure class this repo is built around: a documented
claim that quietly stopped being true, with nothing able to go red on it.

## This repo has already made this exact decision once

[ADR-0024](../adr/0024-decision-record-is-adrs.md) extracted a 138-entry
chronological Decision Log out of `CLAUDE.md` because it had grown to **85% of
that file by weight** — measured as 187 operative lines against 152 log lines
and 12,977 words. The rules were outnumbered five to one in their own file by
the record of decisions about them.

That ADR also states the rule that governs the present question:

> Nothing parses the log, which is why it could move at all; `gates/commands.test.ts`
> and `gates/frontmatter-contract.test.ts` both **throw** on a missing `## Commands`
> or `## Frontmatter contract` heading, so those two stay where they are permanently.

Applied here, that single sentence separates the two files completely.

## What the gates actually permit

### `gates.md` — the spine is pinned, the tail is not

`gates/constitution-scoreboard.test.ts:39` hardcodes
`const SCOREBOARD = 'docs/gates.md'`, and reads three things from it:

- every line matching `^\|\s*\*\*G\d+\*\*\s*\|` — unique, gapless, ≥10
- `markdownSection(…, 'Invariants → gates')` and `markdownSection(…, 'Status key')`
- every `gates/*.test.ts` filename, which must appear **in a row**, not in prose

All 28 rows live in exactly three tables, in three H2 sections:

| Section | Rows |
| --- | --- |
| `Invariants → gates` | G1 G2 G3 G4 G5 G13 G14 |
| `Contract seams → gates` | G6 G7 G8 G9 G19 |
| `Defect gates` | G10–G12, G15–G18, G20–G28 |

Everything after the `Defect gates` table — roughly **880 lines** — is
commentary that no assertion touches.

**Verified rather than assumed.** G19's helpers were replayed verbatim against
four hypothetical versions of the file:

| Case | Result |
| --- | --- |
| A — the file as it stands | 28 rows, both sections parse |
| B — **everything after the G28 row deleted** | **28 rows, both sections parse** |
| C — B plus a trailing `## Where the commentary went` | 28 rows, both sections parse |
| D — `## Status key` renamed to `## Key` | **throws**, as designed |

So moving the whole prose tail out of `gates.md` is gate-compatible with **zero
test changes**. Case D is the boundary: the two parsed headings, the three
tables and the row numbering are immovable.

One trap worth writing down, because it is invisible until it bites.
`markdownSection` is:

```text
^## <heading>[^\n]*\n([\s\S]*?)(?=\n## )
```

The lookahead means **a parsed section must be followed by another `## ` heading**.
It survives case B only because `Status key` and `Invariants → gates` both sit
near the top with sections after them. Move the tail such that either becomes
the *last* H2 in the file and the gate throws. Case C is the cheap insurance:
leave a terminating heading behind.

### `progress.md` — nothing *parses* it, but one thing reads it

No gate, no script, no CI workflow and no `package.json` entry mentions
`progress.md`. Nothing throws. In the mechanical sense it is in the condition
ADR-0024 called *"which is why it could move at all"*.

**One soft reader exists and the first sweep missed it.**
`.claude/skills/phase-gate/SKILL.md:41` instructs an agent closing a phase to:

> `docs/progress.md` — flip the gate row to ✅ with its commit ref, update the
> "Current state" table, add any new environment findings.

That names three structures: the `Gate log` rows, the `Current state` table, and
`Environment findings`. It is not a parser — a renamed heading degrades an agent
instruction rather than reddening a build — but it is a reader, and all three
must stay in the spine and keep their names, or the skill is updated in the same
commit. **Four, after this work**: the skill now also routes a new investigation
to `docs/log/` and asks for an index line under `## The log`, so that heading is
load-bearing in the same soft way. Note that `Environment findings` (48 lines) is therefore spine, not
tail, which is not obvious from its genre.

The sweep that missed it filtered paths containing `worktrees`, and this
checkout *is* `.claude/worktrees/…`, so it excluded the whole tree. Recorded
because the failure mode is silent and the corrected sweep is one flag
different.

## Are the episodes actually separable? Measured, not asserted

ADR-0024 asserted that its entries were "only legible in sequence", then
**reversed on the same day** after measuring: *"15 of 138 with an explicit
back-reference — 11%"*. The reversal is recorded because the assertion had been
presented as characterising the file when it did not. Making the same shape of
claim here without the same measurement would repeat exactly that.

So, measured. Searching all 1551 lines for explicit reference markers — *see
above*, *superseded*, *as noted*, *described above*, *the same bug* — returns
**two hits**:

| Line | Text | Where |
| --- | --- | --- |
| 208 | "**The blank reload.** Not the same bug." | inside *The mobile crash* |
| 628 | "### Superseded: which *part* of the shadow pass costs" | inside *The mobile crash* |

**Both are internal to a single episode, so cross-episode references measure
zero.** That is a stronger result than ADR-0024's 11% and it points the same
way: extraction is safe, and the unit is the *episode*. It also independently
confirms the unit choice — both markers live inside *The mobile crash*, so
keeping that 460-line investigation as one file keeps both references internal.
Splitting it into its ten H3 subsections is what would break them.

A looser pattern (adding bare *below*, *earlier*, *previously*) hits 7 of 21
sections, but inspection shows those are ordinary prose rather than pointers.
The strict count is the honest one; the loose count is reported so the next
person does not think it was hidden.

## The thing a split breaks with nothing going red

There is **no link-checking gate in this repo**. Nothing verifies that a
relative `.md` link resolves.

The good news, measured: **there are zero `#anchor` deep-links to either of
these two files**. Every cross-reference into them is file-level, so links to
`progress.md` and `gates.md` survive any split that keeps those two files
present.

**Corrected once this was actually swept.** An earlier draft of this paragraph
said there were zero anchor links *anywhere in the tree*. There is one —
`docs/plan.md:291` → `agents/issue-tracker.md#wayfinding-operations` — and the
first measurement missed it because the regex only looked for fragments whose
target was `progress.md` or `gates.md`, which is the question that had been
asked. Reported because the number was stated more broadly than it had been
measured, which is the failure this whole document is about.

**Scope it honestly in the other direction too** — GitHub issue bodies were not
checked, and this repo cites issues constantly (#39, #50, #56, #62). An issue
deep-linking a section would break silently and no gate here could ever see it.

The bad news is the references that are *prose*, naming a section in words:

- `CLAUDE.md:322` — "See **"The mobile crash"** in `docs/progress.md`"
- `gates.md:478` — "still unmeasured; see `docs/progress.md`"
- `progress.md:790`, `progress.md:105` — both point into `gates.md`

A link checker cannot see these; they are sentences. They are also exactly what
a split invalidates. Plus `CLAUDE.md`'s "Start here" list and its compaction
instruction, both of which name these files by path.

**Recommendation: the link gate lands in the same commit as the split, or the
split does not land.** Otherwise the change that reorganises the documentation
about mechanically-enforced claims is itself an unenforced claim — the precise
shape of [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)'s
argument and of `gates.md`'s own opening table.

A ~50-line vitest gate over `gates/repo.ts`'s existing `filesUnder` and
`readRepoFile` covers it: extract every `](./x.md)` and `](../x.md#y)` from
every tracked `.md`, assert the target exists and, where a fragment is present,
that a heading slugifies to it. Zero dependencies, consistent with the repo's
stated preference. [lychee](https://github.com/lycheeverse/lychee) is the
off-the-shelf alternative and does check fragments (`--include-fragments`,
GitHub-style kebab-case slugs), but it is a Rust binary in CI for a job ~50
lines of TypeScript already does, and every other gate here is a vitest file.

**The link gate forces an edit to `gates.md` whichever file is split first.**
G19's `unscored` check requires every `gates/*.test.ts` to appear in a *row*, so
a new `gates/doc-links.test.ts` needs a scoreboard row or G19 goes red on its
first run. Its number is not knowable in advance — `gates.md:196` records that
same renumber race happening to one row three times across three branches, each
time because the next free number was free until somebody else merged.

## What the field says

Five external ideas are load-bearing; the rest of what turns up on this topic is
SEO filler.

**Diátaxis** — split by the *purpose* a reader arrives with, never by size. Its
four modes are tutorial / how-to / reference / explanation, and its operating
instruction is to take the page that causes the most pain, ask which mode it
belongs to, and split where it mixes. Both files here mix **reference** (the
scoreboard table; Current state) with **explanation** (why a gate exists; what
the shadow-map investigation found). That is the canonical mixed page. Diátaxis
does not have a mode for "dated record of what happened", which is the honest
gap — that genre is a changelog, not documentation.

**Keep a Changelog / Common Changelog** — the applicable convention for the
dated tail. Its relevant idea is the *Unreleased* section: new entries land in
one known place at the top and get relocated on a cadence, so the file is never
archaeology. It explicitly does **not** standardise per-release files; projects
that split do so as a local variation. That is a caution against inventing
ceremony here.

**ADR / MADR** — already this repo's pattern, already validated by ADR-0024:
one file per unit, an index, reasoning carried verbatim. The unit is *one
decision*, not one entry, which is why the shadow investigation is a single
record holding twenty-five entries. Any split of `progress.md` should use the
same unit rule — *The mobile crash* is **one** document, not eight.

**DITA topic-based authoring** — the old, industrial version of the same claim:
one self-contained topic per file, assembled by a map. Worth knowing only
because it is where "the index is a separate artifact from the topics" comes
from, and that is precisely the shape being proposed.

**Progressive disclosure / context engineering** — the current-practice answer,
and the one that matters most given how this repo is worked on. Anthropic's
[guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
is direct: models have an **"attention budget"**, and *"as token count increases,
the model's ability to accurately recall information from that context
decreases"*. The prescription is a hybrid — a small always-loaded spine plus
*"lightweight identifiers … used to dynamically load data into context at
runtime"* — and it explicitly counts *"folder hierarchies, naming conventions,
and timestamps"* as signal that helps agents navigate without reading
everything. This is the same architecture Claude Code skills use (`SKILL.md` +
`references/` loaded on demand), and it is the closest published analogue to
this repo's situation: a cold agent told to read `progress.md` **first**.

**`llms.txt`** deserves a mention and a rejection. It is a Markdown index file
pointing at deeper documents — structurally what is proposed below — but it
remains a community proposal rather than a W3C or IETF standard, and traffic
analyses find the file essentially untouched by the crawlers it targets. Adopt
the *shape*; do not adopt the filename or claim conformance to a standard.

## The recommendation

**Split the tails, keep the spines, in two independent commits.**

### `progress.md` → a spine plus `docs/log/`

Keep, in place and under their current names: `Current state`, `Gate log`,
`Environment findings`, `Notes to the next session`, and the file's own rules.
The first three are named by the `phase-gate` skill; the whole set is roughly
140 lines and restores the file to the "index, not a narrative" contract it
already claims.

Move each investigation to one file per *episode*, named and dated so the
directory listing is itself the index — the metadata-as-signal point above:

```text
docs/log/2026-08-01-the-mobile-crash.md        (460 lines, closed)
docs/log/2026-08-08-the-gaps-and-collisions.md
docs/log/2026-07-2x-worktrees-and-the-deploy-guard.md
…
```

The spine keeps a one-line pointer per episode, newest last, which is what line
5 asked for in the first place.

**Do this one first.** Nothing parses it, it is the larger file, it is the file
every cold session is told to read first, and it is the one whose stated
contract is currently false. It is also entirely reversible.

### `gates.md` → the scoreboard stays, the commentary moves

Keep, in place and unmoved: the three tables, `Status key`, `Retiring a row`,
`Why this file exists`. That is the ~110-line scoreboard, and G19 keeps passing
untouched — case B, verified.

Move per-gate commentary to `docs/gate-notes/G15-cover-budget.md` and siblings,
with the row's Gate cell linking to it. Leave a terminating `## ` heading at the
bottom of the spine (case C).

**Not `docs/gates/`.** The repo already has `gates/` (the specs, walked by
`filesUnder('gates', …)`) and `docs/gates.md`. A `docs/gates/` directory would
be a third thing called *gates*, shadowing the basename of its own sibling file.
Mechanically fine, and in this repo it would be the first objection raised.

**Do this one second, or not at all.** The gain is real but smaller, the risk is
concentrated, and the row-to-commentary linking is where a mistake would hide.
Splitting `progress.md` alone captures most of the benefit.

### Not recommended

- **Splitting `CLAUDE.md`.** Two gates parse it by heading and throw. ADR-0026
  already refused a second constitution file, and the reasoning holds.
- **A `CONTEXT.md`-style third index.** ADR-0026's objection is exact: a rule
  written down twice will be true in one place and false in the other.
- **Per-entry files.** ADR-0024 measured this and rejected it — migrating all
  138 entries would have put ~120 non-decisions in `docs/adr/` and buried the
  ones that matter. The unit is the episode.

**[ADR-0025](../adr/0025-history-not-rewritten.md) was checked and does not
apply.** Its title reads as though it governs this, but *"history is not
rewritten"* is about **git** history — the decision not to run `git filter-repo`
before going public, because the tags `phase-0`…`phase-4` and the remote point
into it. Relocating documentation is a tracked, reviewable move that preserves
every commit; nothing in that record constrains it.

## What is not known

- Whether the owner wants `docs/log/` or a different name. `docs/history/` and
  `docs/records/` are equally defensible; this only picks one to be concrete.
- Whether the prose-reference problem (`CLAUDE.md:322`) is worth gating beyond
  link resolution. Asserting that a *named section* still exists somewhere is
  possible but probably over-engineering; rewording the four sentences is
  cheaper and there are only four.
- ~~Whether `pnpm test` runtime is affected by a link gate over ~60 files.~~
  Measured once built: 174 local links across 73 files in ~130 ms.

## What happened

The `progress.md` half was built, with the link gate first. See
[ADR-0040](../adr/0040-the-log-is-one-file-per-episode.md) for the decision and
`docs/gates.md` row **G29** for what the gate cost and caught — including a
false positive it raised against *this file*, which is why inline code is now
blanked before links are extracted.
