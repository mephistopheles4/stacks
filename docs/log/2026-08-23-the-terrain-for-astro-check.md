# The terrain for `astro check`, measured while the gate is still blocked

[#257](https://github.com/mephistopheles4/stacks/issues/257) is hard-blocked by
[#250](https://github.com/mephistopheles4/stacks/issues/250): `astro check`
reports one error today, so a gate that runs it lands red. **Nothing about the
gate is built here.** What this session did instead is the half that does not
need the block cleared — take the measurements, prove the gate red-capable, and
survey the addresses that go stale when it lands — so the landing session is a
wiring change and a set of document edits rather than a fresh investigation.

Written up rather than left in a transcript because two of the four findings
below contradict a document in this tree, and one of them contradicts
[`docs/spec/supply-chain.md`](../spec/supply-chain.md).

> ✅ **The block cleared the same evening, and the gate landed in this branch.**
> [#259](https://github.com/mephistopheles4/stacks/pull/259) merged at
> `bc59bf9`, and **G46** (`astro-types`) followed —
> [ADR-0075](../adr/0075-astro-check-is-the-checker-for-astro-files.md).
> **Everything below is left as written**, because a terrain survey read after
> the fact is worth more as a record of what was and was not known in advance
> than as a tidy retrospective. Read the present tense as *"at `2f672b1`,
> before the landing"* — that includes "still blocked", "#259 is already
> rewriting", and the whole of "The landing kit", which is a plan that was then
> executed. Three things in it turned out wrong or short, and each is corrected
> in place below rather than quietly:
>
> - **The sweep undercounts.** Eighteen was not the population either; the
>   landing swept `docs/adr/0066` (four addresses), `docs/spec/README.md`,
>   `docs/spec/static-analysis-and-style.md` and
>   `docs/spec/complexity-on-the-trend-layer.md:203` as well. **Two successive
>   counts, both confident, both short** — the lesson is not "count again", it
>   is that a table of hits is a snapshot and the grep is the artifact.
> - **The gate grew a spec file the kit did not plan.** `gates/astro-types.test.ts`
>   pins the wiring in four clauses. The kit assumed the register's recorded
>   perturbation was the whole of criterion 2; a check living only as a
>   substring of one npm script is [#152](https://github.com/mephistopheles4/stacks/issues/152)'s
>   finding exactly, and the ordering clause below is the one that would not
>   have existed without it.
> - **The ordering was not in the kit and is the sharpest part of the row.**
>   `astro build && astro check` still reports the error *and has already
>   written the `dist/` carrying it*. Planted and observed red.

## What was measured, at `2f672b1`

`@astrojs/check@0.9.10` installed into `packages/site` as a dev dependency,
every measurement taken, then **reverted** — the tree this log commits against
carries no manifest or lockfile change. The reason is
[the spec's §7](../spec/static-analysis-and-style.md#7-contract-edits): a
document edit lands in the same commit as the code it describes, never before
it, and a dependency nothing runs is the same shape. The secondary reason is
mechanical — four sibling tickets ([#251](https://github.com/mephistopheles4/stacks/issues/251),
[#253](https://github.com/mephistopheles4/stacks/issues/253),
[#254](https://github.com/mephistopheles4/stacks/issues/254),
[#256](https://github.com/mephistopheles4/stacks/issues/256)) are each adding a
tool right now, and `pnpm-lock.yaml` is the highest-conflict file in the
repository this week.

The one command that restores this state:

```sh
pnpm --filter @stacks/site add -D --save-exact "@astrojs/check@0.9.10"
```

### 1. The baseline is exactly what the spec predicted

```text
src/shelf/boot.ts:27:14 - error ts(2717): Subsequent property declarations must
have the same type.  Property 'env' must be of type 'ImportMetaEnv', but here
has type '{ readonly DEV: boolean; }'.

Result (44 files):
- 1 error
- 0 warnings
- 0 hints
```

One error, at the address
[§4](../spec/static-analysis-and-style.md#s4-runs-inside-pnpm-build) names, over
the 44 files [ADR-0066](../adr/0066-typescript-6-until-7-1.md) counted. **The
spec's claim about the block holds at this tip** — worth stating, because it was
measured on a throwaway branch a week ago and nothing has held it since.

### 2. The gate is red-capable, and the demonstration is banked

[#238](https://github.com/mephistopheles4/stacks/issues/238)'s plant, re-run
here so the register entry has an Observed-red line gathered under this ticket
rather than quoted from another. `absoluteUrl('/og.png', Astro.site)` in
`packages/site/src/pages/index.astro` became `absoluteUrl(42, Astro.site)`.

| Check | Verdict with the plant present |
| --- | --- |
| `pnpm typecheck` | **green**, exit 0 |
| G7 (`astro-no-logic`) | **green**, 5 of 5 |
| `pnpm build` | **green**, exit 0, 2 pages built |
| `astro check` | **red** — `src/pages/index.astro:14:29 - error ts(2345): Argument of type 'number' is not assignable to parameter of type 'string'.` |

Plant, run and revert were three separate commands, and the revert is
byte-clean: `git hash-object` returns `595ac11714af0e8614309c80808238f6ec3e234e`
on both sides.

⚠️ **The defect ships to two meta tags, not one.** #238 recorded
`<meta property="og:image" content="42">`; `dist/index.html` also carries
`<meta name="twitter:image" content="42">`, because both read the same `ogImage`
binding. The blast radius of the one gap is one line larger than the ticket that
found it says.

### 3. `.astro` is outside the mutation and complexity scopes **by one list, not two**

The ticket's wording — *"both of which glob TypeScript only"* — is true and
understates the coupling. There is **one** scope list.
[`stryker.scopes.json`](../../stryker.scopes.json) declares eight scopes, every
glob ending `*.ts`, and `scripts/lib/complexity.ts`'s `populationOf` takes
`scope.glob` from that same file and subtracts `*.test.ts`. So the two measures
do not independently happen to miss `.astro`; they miss it **once**, and no edit
to either counter can change that without changing the other.

⚠️ **And the module the plant actually corrupted is outside both as well.**
`packages/site/src` is an *excluded directory* in `stryker.scopes.json`, on the
recorded mechanism that its files "are imported only by `.astro` pages, which
are not in the Vitest project". `site-meta.ts` — whose `absoluteUrl` the plant
miscalls — therefore sits in no mutation scope and no complexity population
either. The value crossed from an unscored `.astro` file into an unscored `.ts`
file and out to `dist/`.

⚠️ **Corrected: this is a companion to G7's replacement warrant, not the
sharper form of it.** `site-meta.ts` is a `.ts` file G7 never looks at, so
nothing here widens G7's reach. What the paragraph shows is that the *unscored*
region is wider than the `.astro` files themselves — a fact about the scope
list. G7's warrant is the paragraph above this one, and that is what the row
now carries.

### 4. The supply-chain specimen moves; it does not close

[`docs/spec/supply-chain.md`](../spec/supply-chain.md) §5, under *"`SECURITY.md`'s
unverifiable clause is extended, not tiered"*, holds G7's warrant —
*"`@astrojs/check` cannot run under TypeScript 7"* — up as the second claim whose
truth-maker is outside the repository, on the ground that the package **"is not a
dependency at any version, so no run here can contradict it and none ever
could."**

⚠️ **Installing it does not settle that.** The repository is pinned to
`typescript@6.0.3` by [ADR-0066](../adr/0066-typescript-6-until-7-1.md), so a run
here tests the tool against TS 6 and says nothing about TS 7. The specimen
survives, with a narrower reason: *unfalsifiable without unpinning the compiler*
rather than *unfalsifiable because the tool is absent*. **But "not a dependency
at any version" and "none ever could" both go flatly false the moment the
landing commit installs it**, and they must be edited in that commit — the
second of them is the load-bearing half, because it is a claim about every
possible future state of this repository and one `pnpm add` disproves it.

What *is* new evidence, and is obtainable offline: `@astrojs/check@0.9.10`
declares `peerDependencies: { typescript: '^5.0.0 || ^6.0.0' }`. The package
itself says it does not support TS 7. That is a manifest in this tree's own
lockfile once installed — weaker than a run, stronger than prose, and the first
in-repository evidence the sentence has ever had.

⚠️ **It is also a standing coupling, not a one-off.** ADR-0066's revisit
condition is TypeScript 7.1. That peer range excludes 7.x, so **moving the pin
un-runs this gate** unless `@astrojs/check` has widened by then. ADR-0066 says
the tools under the pin "are wanted for what they compute"; after this gate
lands, one of them is load-bearing in `pnpm build`, and the revisit gets a
dependency it does not have today.

## The landing kit

Apply after #250 is on `main`, all in **one commit**.

### Wiring

Put `astro check` in **`packages/site/package.json`**'s `build` script:

```json
"build": "astro check && astro build"
```

⚠️ **Not a new root script**, and that is a measured choice rather than taste.
G14 (`commands`) reads `JSON.parse(readRepoFile('package.json'))` — the **root**
manifest only, `gates/commands.test.ts:46`. A root-level `astro:check` script
would owe an `AGENTS.md` Commands line and a `docs/commands.md` section in both
directions; the site-level edit owes neither, keeps `astro check` inside
`pnpm build` exactly as [§4](../spec/static-analysis-and-style.md#s4-runs-inside-pnpm-build)
requires, and satisfies acceptance criterion 5 by having no new script to
declare. **Say so in the commit** — a criterion discharged by "there is nothing
to do" reads as an oversight otherwise.

### The row, and why its number is not written here

Slug **`astro-types`**. The highest live row is **G45**, and #251, #253, #254
and #256 are each landing rows concurrently — so the number is **not knowable
until the rebase**, which is `docs/spec/README.md`'s own rule and the trap
[#231](https://github.com/mephistopheles4/stacks/issues/231) already fell into.
Pick it against a re-fetched `main`. The same holds for the ADR number if one is
written: §8 calls 0071 free and three sibling tickets may disagree by then.

⚠️ **They did, within the hour, and the numbering turned out to be the sharpest
thing this session learned.** Both are recorded in "What the numbers cost",
below.

**The row goes in the `## Defect gates` table** (`docs/gates.md:342`,
`Row | Name | Rule | Gate | Status`), not the contract-seams table G7 sits in.
**G42 (`dependency-audit`) is the precedent** and the answer to "what does the
Gate column point at when the gate is not a vitest file": G42's cell names the
CI job and the command it runs. This row's cell names `astro check`, the
`packages/site` build script that runs it, and `pnpm build` above that.

### G7's row rewrite (criterion 3)

Today's cell opens *"`.astro` files are not typechecked, so nothing else can
catch this"*, which stops being true in the same commit. The replacement warrant
is finding 3 above: `.astro` sits outside the one scope list that both the
mutation counter and the complexity counter read, so logic there is typechecked
but **counted by nothing** — and G7's `<script>`-block text scan is what stands
in for the coverage. Keep the ADR-0066 aside; it is still the history of how the
warrant narrowed.

### The register section

Five verdict bullets in the exact G41 shape, plus `**Gate:**`, `**Date:**`, an
`**Observed-red**` line and a `**Rank:**`. The Observed-red line is finding 2 —
one executed plant, red on `astro check`, green on typecheck, G7 and the build.
Do **not** write a merged verdict bullet: G41's exemption list is closed and a
new merged bullet is a red.

### The stale-claim sweep — the class, not the instance

`git grep -n -iE "astro check|@astrojs/check|not typechecked|cannot run under"`
finds the population — **run it over the whole tree**, including
`docs/gate-register.md`, which the first sweep here excluded as noise and which
turned out to hold six of the addresses. Twelve are listed below and six more
are in the register, called out beneath the table. Every one must move in the
landing commit:

⚠️ **The line numbers are as of `2f672b1` and are a reading aid, not a
contract** — [#259](https://github.com/mephistopheles4/stacks/pull/259) is
already rewriting `packages/site/src/shelf/boot.ts` above one of them. Re-run
the grep at the rebase and work from its output.

| Address | What it says |
| --- | --- |
| `AGENTS.md:153` | "`.astro` files are NOT typechecked (`astro check` cannot run under TypeScript 7 yet)" |
| `tsconfig.json:7` | "nothing does, because `astro check` cannot run under…" |
| `gates/astro-no-logic.test.ts:4` | the docblock's opening claim — the whole warrant for the row |
| `gates/astro-no-logic.test.ts:165` | the same, in the **failure message a human reads** |
| `packages/site/src/shelf/boot.ts:14` | "not typechecked (see CLAUDE.md)" |
| `packages/site/src/shelf/start.ts:7` | "`astro check` cannot run under TypeScript…" |
| `packages/site/src/site-meta.ts:18` | the same, in the module the plant corrupts |
| `docs/gates.md:101` | G7's row — criterion 3 |
| `docs/progress.md:194` | the environment-findings row, "whether it becomes a gate row is open" |
| `docs/spec/complexity-on-the-trend-layer.md:185, 203, 473, 503` | ⚠️ **four, and only `:473` says "recorded as fog"** — this row read *"recorded as fog, three times"* and was wrong twice over: `:185` is a dated before/after measurement cell, `:503` reads "(`astro check` as a gate)", and `:203` — *"`astro check` in the gates is the same: fog, not this spec"* — was missed entirely. Corrected here rather than in the table alone, because the wrong version is the one `docs/progress.md` quoted |
| `docs/spec/enhanced-card.md:430` | "`.astro` is not typechecked, so anything with a type lives in a `.ts` file" |
| `docs/spec/supply-chain.md:292` | finding 4 — the clause that goes false |

⚠️ **`docs/adr/0003-site-import-type-only.md:11` is on the list and is handled
differently.** It is a dated decision record, and this repo's rule is that an ADR
carries its original reasoning verbatim. Mark it superseded; do not rewrite it.

⚠️ **`docs/gate-register.md` carries six more addresses and takes the same
treatment**, for the same reason: it records dated findings, and its own idiom
for a claim that has moved is a *"⚠️ corrected …"* annotation in place. Line 900
is the decay verdict table; 1869 and 1954 quote the warrant; 1969 is the
measurement *"`@astrojs/check` is not a dependency of this repo at any version"*,
which the landing commit falsifies outright. Line 1973's
`git log --all -S '@astrojs/check'` finding stays true — it is a claim about the
history as of 2026-08-15 — but it stops being an argument, and the entry should
say which of the two it is. **The decay disposition on that entry is `gated`
against a remedy that was never built; landing this gate closes it the other
way, and the entry should say so rather than leaving a `gated` line pointing at
nothing.**

⚠️ **Line 1957 is stale already and not because of this ticket.** It attributes
*"`.astro` files are NOT typechecked (`astro check` cannot run under TypeScript 7
**yet**)"* to `CLAUDE.md`; the constitution moved to `AGENTS.md` on 2026-08-19
and that is where the sentence lives now. Fix the attribution in the same pass —
it is one word, and a register that misnames where a quoted claim lives is the
failure it exists to catalogue.

⚠️ **`fixtures/README.md:136` and [`docs/adr/0067-the-counters-inputs-are-pinned-exact.md:102`](../adr/0067-the-counters-inputs-are-pinned-exact.md) match the grep and are
not in this class** — both are about the complexity fixture being untypechecked,
which this change does not touch. Named here so the next reader does not have to
re-establish it.

The register already dispositioned G7's decay finding `gated`, on a named remedy
that was never built: *date the claim with the versions it was established
against*. Landing this gate is the other way to close it — the claim stops being
load-bearing because the compiler runs.

### Checklist

1. Rebase onto `main` after #250 lands; re-read `docs/gates.md` for the highest
   row **then**, not now.
2. Install the dependency, note it in `docs/adr/` per `AGENTS.md`.
3. Wire the site `build` script.
4. All document edits — row, register section, G7 rewrite, the twelve addresses,
   `docs/progress.md` — in the **same commit**.
5. `pnpm test && pnpm build && pnpm gate:public && pnpm smoke:render`.

## Coordination

#250 is live in a parallel session (worktree `mattpocock-skills-250-d1a891`),
messaged from here with the baseline above and a request to ping on merge. **The
assignee could not have told anyone that** — every session here authenticates as
one account, so the tracker cannot distinguish *mine, a minute ago* from *free
to take*, which is why the check was a session lookup matched on worktree name
and not a `gh` query.

## What the numbers cost

Six sessions worked this map in parallel. **Four of them ended up holding G46**
— `markdown` (#251), `lint` (#253), `ignored-clones` (#254) and `astro-types`
(#257) — and four wrote an ADR numbered `0071`.

⚠️ **The finding is not that numbers collided. It is that the fix for the
collision was invented twice, independently, and was worse than the problem.**
The #253 session proposed a reservation list — G46 to itself, G47 to #251, G48
to #256, G49 to #257 — and propagated it to four sessions before anyone read
`gates/constitution-scoreboard.test.ts`. Two of the four had to check it and
send it back. Then **#254 arrived at the same scheme from scratch**, with no
contact with #253, and told it *"next free for you is G47"*. An idea that two
isolated sessions reach independently is not one session's lapse; it is an
attractive wrong answer, and that is the thing worth recognising in yourself.
Recorded with the sessions named at #253's own request — *"a write-up that says
three sessions took the same number describes a coincidence"*.

**Reserving a gate row number is worse than not reserving one, and G19 is the
reason.** `gates/constitution-scoreboard.test.ts` asserts two things about the
numbering: *"numbers every row uniquely"* at `:432`, and *"leaves no gap in the
row numbering"* at `:439`, which walks `for (let n = 1; n < (numbers.at(-1) ??
0); n += 1)` and reddens on any hole below the maximum. So a branch that takes
G47 while G46 sits on somebody else's unmerged branch produces rows 1..45 and
47 — a hole at 46 — and goes red. **A reservation list therefore reddens
everyone except whoever merges first**, and the order it assumes is exactly the
thing nobody controls.

**What works is the rule the specs already state and this effort kept not
following**: a row's number is not knowable until it lands. Several branches all
holding G46 is the *correct* state and costs nothing. Everyone renumbers at the
rebase immediately before their own merge, against the real tip.
`docs/progress.md`'s "Rollout numbering" row has said so since band four —
*"No number is reserved here"* — and this is the fifth pre-allocated number in
this project to go stale.

⚠️ **A correction to the mechanism, from #251, checked here rather than taken
on trust — and it is the credit worth recording, ahead of anyone's concession.**
This session first told two peers the red would be **main-only**,
invisible on the pull request because CI sees only the branch. That is wrong for
this workflow. `.github/workflows/gates.yml` triggers `on: pull_request` and its
`actions/checkout` steps pass no `ref:`, so each takes the default
`refs/pull/N/merge` — **`main` merged with the head**. The gapless walk therefore
fails the reserving branch **in its own PR run**, and keeps failing it until a
branch it does not control merges. **Hostage, not landmine**, and the loud
failure is the better one: the second pull request to arrive pays, which is the
one that should.

⚠️ **Two narrower shapes do stay main-only** and are worth naming rather than
losing to the correction: a pull request whose merge ref went stale after its
base moved and was never re-run, and a branch numbered *below* an unmerged one
that is **abandoned rather than merged** — which leaves the hole permanent, with
only `main` to say so.

⚠️ **And the ADR half is the opposite failure: silent.** Nothing in the suite
reads `docs/adr/` for duplicates or holes. Contiguity is ungated, so a gap is
free — but two sessions writing different records to the same number collide
with nothing to catch it. This record moved from 0071 to **0075** on finding
#251 had committed `0071-the-markdown-fix-flag-is-allowlisted.md`: not because
0075 was reserved, but because biasing upward is free where a duplicate is
invisible.

⚠️ **Then it collided again, and that is the sharpest evidence there is.**
#253 moved off 0071 to avoid #251 at the same moment this record did, and **both
landed on 0075** — a second duplicate created by the act of resolving the first,
between two sessions that were each being careful and each talking to the other.
It was caught by a message crossing in flight, not by anything in the
repository. **The failure survives the participants noticing it, because there
is nothing to check against.** (#253 moved again, to 0076.)

**The two halves take opposite advice**, and treating them alike produced every
collision here:

| | Gate rows in `docs/gates.md` | ADR numbers in `docs/adr/` |
| --- | --- | --- |
| A gap is | **fatal** — G19's gapless walk | **free** — ungated, and tonight made several deliberately |
| A duplicate is | **loud** — G19's uniqueness clause, and G41 reporting *"G46 has 2 entries"* | **silent** — nothing reads the directory at all |
| So | hold the **lowest** free number, renumber late | bias **high**, re-check late |

That asymmetry is why a gate over `docs/adr/` should assert **uniqueness only
and never contiguity**, and tonight's deliberate gaps are the proof that
asserting contiguity would be wrong.

⚠️ **One operational trap for whoever renumbers a row, from #253.** A row number
lives in **two** files, and G41 holds them to each other in both directions:
`gates/gate-register.test.ts:217` gives every row exactly one register entry,
`:234` gives every entry a row, and `:248` holds the slug. So renumbering
`docs/gates.md` without renaming the `### G<n> — \`slug\`` heading in
`docs/gate-register.md` is as red as leaving the gap — and it reddens with a
message about entry counts, which does not obviously read as *"you renamed half
of a rename"*.
