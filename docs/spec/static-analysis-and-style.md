# Static analysis and style — one routing rule, a verdict per candidate

The output of [Map: the static analysis and style layer](https://github.com/mephistopheles4/stacks/issues/228)
— eleven closed decision tickets, assembled into something an implementation
session can execute **without reopening any of them**.

**This file is deliberately thin.** Every verdict below was reached on a ticket,
with its measurements, its counter-arguments and its corrections in the
resolution comment. Restating them here would put one decision in two places,
which is what [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)
exists to prevent. So §3 is a table of verdicts that **links** rather than
retells, and the rest of the file carries the four things no single ticket holds:
the gate roster, the trend rows, the build order, and the contract edits.

The whole map was also read at once as a morphological box. That artifact is
where the cross-ticket couplings in §6 came from, and it is the only place the
eleven verdicts appear as one configuration. ⚠️ **It is not in this checkout**
— `static-analysis-map.box.json` is rendered by a tool this repository does not
carry, so it stays with the map trail on
[#228](https://github.com/mephistopheles4/stacks/issues/228) rather than in
`docs/`. Every finding it produced that this spec depends on is written out
below.

---

## 1. What this spec is, and what it is not

**It is not adoption.** The map's Notes say it plans and does not adopt, and that
holds through this file: nothing here has been installed, no config file exists,
and every number quoted was measured on a throwaway branch. An implementation
session makes the changes.

**Four tools arrive and two do not.** ESLint gains a real rule set, Prettier
arrives over code only, markdownlint arrives on a narrow rule set, and
`astro check` joins `pnpm build`. jscpd and `eslint-plugin-sonarjs`'s cognitive
rule arrive as **counters feeding the trend layer**, never as gates.

⚠️ **`eslint-plugin-sonarjs@4.2.0` is already a dependency and deliberately not
enabled** — `eslint.config.mjs` says so in its own comment block, and that
comment names the fog this map cleared. It is edited by this work, not left to
contradict the result.

---

## 2. The routing rule

Stated once, in [#229](https://github.com/mephistopheles4/stacks/issues/229),
and applied by every row of §3. It is not restated here beyond what a reader
needs to follow the table.

**Two tests, in order.**

1. **Reach.** Can the person who hit the red apply the remedy? **The surface
   names that person.** The `gates` aggregator admits any stranger, because it
   runs on every pull request and `CONTRIBUTING.md` promises a contributor with
   no agent skills installed passes every gate.
2. **Defect.** Does the red report a defect in the change under test?

**Pass both, it may gate. Fail either, it is a trend or it is refused.** A
candidate the rule does not sort is **suspect rather than classified** — refused
until somebody measures the remedy, which is
[`gate-or-trend.md`](gate-or-trend.md) §1's own honest limit applied rather than
restated.

**There is no third kind.** The taxonomy stays gate, or trend, or nothing.
§3 of that spec counts *places a check runs*, not kinds of check, and its §2
already refused a third term.

⚠️ **Consistency is a defect here, and the cost of that reading is recorded on
the ticket rather than hidden.** Test two now passes for every style rule, so
test two stops sorting and the reach test does all the work. A narrower variant
— *consistency is a defect only where a gate reads source as text* — is
[#229](https://github.com/mephistopheles4/stacks/issues/229) §3's live
alternative if the broad reading proves too wide. The box's *narrow reading*
preset walks the two rows it changes.

---

## 3. The verdicts

One row per candidate. **Read the ticket for the reasoning** — the Verdict
column is an index, not an argument.

| Candidate | Verdict | Ticket |
|---|---|---|
| ESLint as a linter | **Gate.** The type-checked recommended set tuned to four repo idioms, plus `switch-exhaustiveness-check`. Type information over the whole tree, one rule set for every file, in a second config file. | [#233](https://github.com/mephistopheles4/stacks/issues/233) |
| A formatter | **Gate.** Prettier over code only — `singleQuote: true`, `printWidth: 100`, Markdown and `fixtures/` excluded. `.editorconfig` refused on measurement. | [#236](https://github.com/mephistopheles4/stacks/issues/236) |
| markdownlint | **Gate**, on a narrow rule set. The fix flag runs for seven rules measured safe. Six rules are off with a measured reason each. | [#235](https://github.com/mephistopheles4/stacks/issues/235) |
| `astro check` | **Gate**, inside `pnpm build`. G7 is kept and its warrant gets stronger. | [#238](https://github.com/mephistopheles4/stacks/issues/238) |
| Duplication | **Trend**, four counts per population, caps disarmed at landing. | [#237](https://github.com/mephistopheles4/stacks/issues/237) |
| The duplication tool | **jscpd.** The sonarjs rule cannot see across files and found zero clones here. | [#232](https://github.com/mephistopheles4/stacks/issues/232) |
| Cognitive complexity | **Trend**, a second series beside the cyclomatic four, not a replacement. One capped number. | [#234](https://github.com/mephistopheles4/stacks/issues/234) |
| Test-code complexity | **Refused**, on measurement. Recorded in `docs/gates.md`. | [#239](https://github.com/mephistopheles4/stacks/issues/239) |

Two research tickets produced no verdict and feed the rows above:
[#230](https://github.com/mephistopheles4/stacks/issues/230) measured the two
complexity measures across 1105 function pairs, and
[#231](https://github.com/mephistopheles4/stacks/issues/231) probed a whole-tree
reformat and found which gates break.

### The one question the map left open, and how it closed

**MD049 — keep or drop.** [#235](https://github.com/mephistopheles4/stacks/issues/235)
recorded it as open after a correction moved its warrant to MD050: nine gate
regexes hardcode the *strong* emphasis marker, which is MD050's rule, not
MD049's. Stripped of that warrant MD049 protects no text a gate reads.

**Kept**, on the owner's call, following §2's broad reading — a consistency rule
is a defect rule under it. 178 findings today, none of them in a table row.

⚠️ **This is the one verdict in this spec that rests on the broad reading alone.**
Under §2's narrow variant, MD049 is dropped. Nothing else in the table changes
either way, which is why the reading is worth revisiting only if this rule turns
out to be noise.

---

## 4. Gate roster

Numbers are **unassigned**. `docs/spec/README.md`'s own note is that a row's
number is not knowable until it lands, and this rollout has already seen the
trap: the map's own ticket brief mislabelled `repo-root` as G22, corrected in
[#231](https://github.com/mephistopheles4/stacks/issues/231). The highest live
row is **G45**. **Cite slug and number together, never the number alone.**

Each new gate costs a row in [`docs/gates.md`](../gates.md), which **G19**
(`constitution-scoreboard`) enforces in both directions, and a five-cell section
in [`docs/gate-register.md`](../gate-register.md), which **G41**
(`gate-register`) enforces the same way.

| Label | Gate | Why nothing today catches it |
|---|---|---|
| **S1** | `lint` — the tuned type-checked rule set over every `.ts` file | 36 findings in 20 files that no gate reads. `tsc --noEmit` passes on all of them. |
| **S2** | `format` — Prettier's check mode over code only | Nothing normalises source shape, and G14 and G45 already punish a quote form with a red that names no quote. |
| **S3** | `markdown` — markdownlint on the narrow rule set | Three live documentation defects exist that 45 gates miss. |
| **S4** | `astro-types` — `astro check` inside `pnpm build` | `.astro` frontmatter is read by no gate and typechecked by no compiler. |

### One CI job, not three

**S1, S2 and S3 run in a single `style` job in `gates.yml`, beside `audit`.**
Not steps in the `suite` matrix: the `audit` job's own comment states the rule
this follows — *the answer does not depend on which Node version is running, and
running it twice would report the same advisory twice.* A lint verdict, a format
verdict and a Markdown verdict are all Node-independent.

**One job, three gate rows.** The two are different things here: `suite` is one
job holding most of the register. A row records what is protected; a job records
where it runs.

⚠️ **S4 is not in this job, and that is not an oversight.** Four gate rows land
and three of them run in `style`; `astro check` runs inside `pnpm build`, which
the `suite` matrix already runs, per
[#238](https://github.com/mephistopheles4/stacks/issues/238). A summary that
says *"four gate rows in one CI job"* is wrong about this spec, whichever
document it appears in.

⚠️ **Accepted cost of one job:** a red names `style` rather than the tool. The
remedy is that each of the three commands is documented and runnable alone, so
the job's output is the tool's output and the fix command is in it.

### S4 runs inside `pnpm build`

`astro check` is a step of `pnpm build`, which the `suite` matrix already runs.
It still takes a row, because `docs/gates.md` scores what is protected and this
protects something new.

⚠️ **S4 is not green today.** `astro check` reports **one error**, at
`packages/site/src/shelf/boot.ts:27` — and not in an `.astro` file at all. Two
tsconfigs disagree about `ImportMetaEnv`, because the root config excludes
`**/.astro` and the site's includes it. That fix is a prerequisite, not a
consequence; see §6 step 1.

> ⚠️ **Superseded by [#250](https://github.com/mephistopheles4/stacks/issues/250):
> the error is fixed and `astro check` reports `0 errors, 0 warnings, 0 hints`
> over 44 files.** The paragraph above reads as live state and is now a record of
> what S4 had to clear first. **Its diagnosis was right and its remedy was not
> where it pointed**: nothing in either tsconfig changed. `boot.ts` declared an
> inline `{ readonly DEV: boolean }` where vite and astro both declare
> `readonly env: ImportMetaEnv`, so the two declarations collided instead of
> merging — naming the interface was the whole fix. The configs go on disagreeing
> about the `.astro` directory, which is their purpose. **S4 itself is still not
> green**, for the reason the row states rather than this one: nothing runs
> `astro check` yet, and `@astrojs/check` is not a dependency.

> ✅ **S4 landed 2026-08-23 as G46 (`astro-types`)**, closing the footnote above
> as well as the paragraph above that. `@astrojs/check@0.9.10` is a dev
> dependency of `packages/site`, pinned exact, and its `build` script is
> `astro check && astro build` — so `astro check` runs inside `pnpm build`,
> which the `suite` matrix already runs, exactly as this section specifies.
> `gates/astro-types.test.ts` pins the wiring in four clauses, each observed
> red. ⚠️ **The order is load-bearing and was not in the spec**: `astro build &&
> astro check` still reports the error and has already written the `dist/` that
> carries it, so the clause asserts position and not merely presence.
> ⚠️ **One coupling this section does not carry**: `@astrojs/check@0.9.10`'s
> peer range is `^5.0.0 || ^6.0.0`, so [ADR-0066](../adr/0066-typescript-6-until-7-1.md)'s
> revisit at TypeScript 7.1 un-runs this gate unless the checker widens first.

⚠️ **G7 (`astro-no-logic`) is not retired and its row text changes.** The two do
not overlap: G7 reads `<script>` blocks as text, `astro check` typechecks
frontmatter. A planted `absoluteUrl(42, Astro.site)` in `index.astro` passed
`pnpm typecheck`, `pnpm build` and G7 all green, and shipped
`<meta property="og:image" content="42">` to `dist/`. G7's warrant gets
*stronger*: `.astro` sits outside every mutation scope and every complexity
scope, both of which glob `**/*.ts`, so typechecked logic there is still counted
by nothing.

> ✅ **Held at landing, with two corrections measured on the way.** G7 is kept
> and its row was rewritten — **replacing** the warrant rather than narrowing
> it, since *"`.astro` files are not typechecked"* is false from that commit
> and not merely weaker.
>
> ⚠️ **It is one scope list, not two.** All eight globs in `stryker.scopes.json`
> end `*.ts`, and `scripts/lib/complexity.ts`'s `populationOf` takes its
> population from **those same globs** minus `*.test.ts` — so the two counters
> do not independently happen to miss `.astro`; they miss it once, and no edit
> to either can change that without changing the other.
>
> ⚠️ **The plant reached two meta tags, not one.** `dist/index.html` carried
> `<meta property="og:image" content="42">` *and*
> `<meta name="twitter:image" content="42">`; both read the same `ogImage`
> binding. And `site-meta.ts`, whose `absoluteUrl` the plant miscalls, is an
> *excluded directory* in `stryker.scopes.json` — so the bad value crossed from
> an unscored `.astro` file into an unscored `.ts` file and out to `dist/`.

### One gate is offered and declined

**A gate on duplication.** jscpd's per-clone `file:line` output makes Clause A
*arguable*, and [`gate-or-trend.md`](gate-or-trend.md) §1 says an arguable
Clause A makes a candidate suspect rather than gateable. Recorded as declined
rather than overlooked, because in a gate-heavy repo the absence of one is worth
a sentence.

---

## 5. Trend rows

**Twelve new rows on `docs/gates.md`'s `## Trends` table**, which **G36**
(`trend-layer`) holds to the emitter by name. G36 reads only the `Trend` column;
every other cell there is prose nothing holds.

**Duplication — eight rows.** Four counts, over two populations, each population
its own series rather than a label:

| Series | Measures |
|---|---|
| `duplication-clones` | clones found, over the eight declared scopes |
| `duplication-lines` | duplicated lines, over the eight declared scopes |
| `duplication-ignored-lines` | lines inside `jscpd:ignore` blocks, over the eight declared scopes |
| `duplication-total-lines` | lines scanned, over the eight declared scopes |
| `duplication-tree-clones` | clones found, whole-tree TypeScript |
| `duplication-tree-lines` | duplicated lines, whole-tree TypeScript |
| `duplication-tree-ignored-lines` | lines inside `jscpd:ignore` blocks, whole-tree TypeScript |
| `duplication-tree-total-lines` | lines scanned, whole-tree TypeScript |

**Cognitive complexity — four rows:** `cognitive-functions`, `cognitive-mass`,
`cognitive-mass-over-15`, `cognitive-max`.

**Counts, never a ratio**, and the page derives the share. This is the rule
`complexity-*` already follows and the reason it follows it: every candidate
ratio hid one of the two games, and counts hide neither.

### Why the whole tree gets its own series and not a label

**A clone is a relation between two places.** A scope list cannot shrink it: a
function duplicated between `gates/` and `packages/core/src` is invisible to
every per-scope number, because `gates/` is read by no scope. The whole-tree
number exists to see exactly that.

⚠️ **Whole-tree means whole-tree *TypeScript*, and the restriction was measured
rather than argued.** Over every file, jscpd reports 74 clones and 1042
duplicated lines, **of which 570 are JSON this repo did not write** —
`fixtures/api/`'s cached provider responses, and the provisioned Grafana
dashboard. Two O'Reilly fixtures share 105 identical lines because one book
returns from two endpoints. A recorded response cannot be de-duplicated without
falsifying the fixture.

### The cognitive denominator differs, and the spec says so

**1105, not 1114.** The rule never visits `PropertyDefinition` or `StaticBlock`,
and it is silent at zero rather than reporting a zero. **Absent at zero counts as
zero**, stated here because two implementations must produce the same number.

### Caps

**Every cap ships `unarmed`**, which is the shape the complexity caps already
use, and arming one is a human judgement per series after its calibration window
fills.

**`cognitive-max` is the only cognitive series that takes a cap.** A mirrored cap
needs a mass-over count, which needs a cut, and every available cut is underived
for this measure: the supplier's 15 has no published derivation, and McCabe's 10
is *worse*, being a bound about a different measure. `cognitive-mass-over-15`
is published and never capped, which also discharges the condition on accepting
15 — nothing may ever refuse on it.

**Six of the eight duplication series take caps**, on the
`complexity-mass-over-10` argument rather than the `complexity-functions` one: a
clean feature adds zero duplicated lines, so the count does not grow with the
tree legitimately. **The names are exact and they are the whole list**, because
`scripts/lib/floors.test.ts` asserts `CAPPED_SERIES` by array equality and
`countedIn` needs a sample from every member:

| Series | Capped | Why |
|---|---|---|
| `duplication-clones` | **yes** | A clean feature adds no clone. |
| `duplication-lines` | **yes** | `complexity-mass-over-10`'s property, stated by [#237](https://github.com/mephistopheles4/stacks/issues/237). |
| `duplication-ignored-lines` | **yes** | See below. |
| `duplication-total-lines` | no | The denominator. It grows with the tree legitimately, which is `complexity-functions`' reason. |
| `duplication-tree-clones` | **yes** | As `duplication-clones`. |
| `duplication-tree-lines` | **yes** | As `duplication-lines`. |
| `duplication-tree-ignored-lines` | **yes** | As `duplication-ignored-lines`. |
| `duplication-tree-total-lines` | no | As `duplication-total-lines`. |

⚠️ **`duplication-ignored-lines` is capped, and that goes beyond what
[#237](https://github.com/mephistopheles4/stacks/issues/237) wrote.** The ticket
established that suppression blocks are *counted*; it did not say whether the
count can refuse. It is capped here because an uncapped one leaves the gaming
route open: wrap a clone in `jscpd:ignore` and the clone count falls, the capped
series passes, and the counter that noticed refuses nothing. A counter nothing
can refuse on is a number, not a guard. **Nothing goes red at adoption** — like
every cap here it ships disarmed, so a legitimate suppression is a human
judgement rather than an immediate refusal.

⚠️ **A name joins `CAPPED_SERIES` only once twenty records carry its samples.**
This is a real code constraint, not a caution. `scripts/lib/floors.ts`'s
`countedIn` filters to rows where **every** member of `CAPPED_SERIES` has
samples — keyed on the whole set on purpose, so that probing one member cannot
single it out. Add a name at adoption and every existing record on the `metrics`
branch fails that filter at once, zeroing both cyclomatic calibration windows.
**Waiting costs nothing**, because `countedIn` reads what a record carries
rather than what a type declares.

### Suppression is allowed and it is counted

`jscpd:ignore-start` blocks are permitted. **Measured:** the directive removes
its lines from the clone count **and** from the total-line denominator together
— 34 raw lines with a 12-line block report 20 — which is G38's failure shape and
G43's directive shape at once. So the ignored lines are a declared per-population
counter, swept from source by a gate at merge. **That is G43 (`ignored-mutants`)
applied to a second tool**, and it is what dissolves the only surviving objection
to capping the counts.

⚠️ **`--ignore-pattern` reads like region suppression and is not.** Do not reach
for it.

⚠️ **Permalinks are generated at emit time and never stored**, because a pinned
link stays valid while it stops describing a block that moved. **Never a metrics
label**, because Pushgateway never forgets a series.

---

## 6. Build order

Nothing here is optional and the order is not arbitrary. Four steps produce a
state the next step needs, and three of the edges were found across tickets
rather than inside one.

1. **The `ImportMetaEnv` disagreement.** Two tsconfigs disagree, and
   `astro check` reports it. Nothing else in this rollout can be judged green
   while one error is outstanding. **Blocks S4.**

   > ✅ **Done — [#250](https://github.com/mephistopheles4/stacks/issues/250).**
   > `astro check`: `0 errors, 0 warnings, 0 hints` over 44 files. The step
   > stands as written because the order still holds; see §4's footnote for why
   > the remedy was not in either tsconfig.

2. **markdownlint, at the corrected config.** `.markdownlint.jsonc` — that exact
   name, because it is on CodeRabbit's list *and* takes comments, while
   `.markdownlint-cli2.jsonc` is not on that list. `MD060` at **`compact`**, not
   its default of `any`. The fix pass runs for the seven safe rules only.

   ⚠️ **This lands before or with Prettier**, and the reason is a coupling
   neither ticket owns: [#236](https://github.com/mephistopheles4/stacks/issues/236)
   keeps G41 and G31 green by **excluding Markdown from Prettier** rather than by
   repairing their regexes, so **MD060 at `compact` becomes their sole
   protection**. At `any`, an aligned table passes markdownlint and is invisible
   to both regexes.

3. **The G14 and G45 quote repair.** Both extraction regexes accept either quote
   form. Recommended by [#236](https://github.com/mephistopheles4/stacks/issues/236)
   although nothing breaks without it, because
   `singleQuote: true` **freezes** the accidental quote gate rather than fixing
   it: a contributor who hand-writes `command("add")` still gets a red that says
   the extraction found 0 CLI subcommands.

4. **Prettier over code.** `singleQuote: true`, `printWidth: 100`, Markdown and
   `fixtures/` excluded. Measured at **100 files, +3197 / −3132**, with all 1055
   tests, `pnpm build` and `pnpm gate:public` green.

5. **ESLint as a linter.** A second config file, the tuned set, type information
   over the whole tree. **Never merged into `eslint.config.mjs`** — one config
   file drags the type service onto the complexity counter through flat config's
   per-file merge and takes its run from 1.5s to 7.1s.

6. **The `style` job**, running S1, S2 and S3, and `docs/commands.md` +
   `package.json` in the same commit.

7. **jscpd and the eight duplication series.** Counter, emitter rows, the
   ignored-lines sweep, and the `Trends` table rows. **No cap name joins
   `CAPPED_SERIES`.**

8. **The cognitive rule and the four cognitive series.** Enable
   `eslint-plugin-sonarjs`'s rule as a *second* counter — never in the counter
   config, for step 5's reason and for `eslint.config.mjs`'s own stated one.
   **No cap name joins `CAPPED_SERIES`.**

9. **Arming, twenty records later.** Seven names join `CAPPED_SERIES` once the
   records carry their families — `cognitive-max` and the six duplication series
   §5 lists, and no others. Steps 7 and 8 may land in either order; **this step
   may not be folded into either of them.**

Steps 2 through 4 are a chain. Steps 5, 7 and 8 are independent of each other
once step 1 is done.

---

## 7. Contract edits

Each is a **document edit that must land in the same commit as the code it
describes**, never before it.

**`AGENTS.md` — Commands.** Three new scripts. `gates/commands.test.ts` (G14)
holds this list and `package.json` to each other in both directions, so a script
added without its line is a red build.

**`docs/commands.md`.** A `## \`pnpm <name>\`` section per new command, matching
the heading form G45 extracts. The rule set choices, the fix flag's scope, and
what each command refuses belong here rather than in this spec.

**`docs/gates.md`.** Four new register rows (G19, both directions); twelve new
`## Trends` rows (G36, by `Trend` column); and three entries in
**Not gated, deliberately** — see §9.

**`docs/gate-register.md`.** A five-cell section per new numbered row, which G41
enforces. ⚠️ **G41's extraction regex hardcodes an exact single space at a
pipe**, which is why step 2 precedes step 4.

**`eslint.config.mjs`.** Its comment block currently says
`eslint-plugin-sonarjs` is *"installed and deliberately not enabled … kept as fog
in the spec's §8 until the split signature proves common"*. The split signature
was measured and it holds ([#230](https://github.com/mephistopheles4/stacks/issues/230)).
That paragraph is rewritten, and the file keeps its one-rule discipline: the
cognitive counter is a **separate** config.

**`docs/spec/README.md`.** A fourth row in the table at the top, and the
"three efforts" sentence above it changes.

**`docs/progress.md`.** Updated in the same commit as each gate, per its own
rule. A new investigation goes to `docs/log/<date>-<slug>.md` with one index
line in the spine.

---

## 8. What belongs in `docs/adr/` rather than here

`AGENTS.md`'s test is: **hard to reverse, surprising without context, and a real
trade-off.** Three decisions meet all three. The next free number is **0071**.

| Proposed record | Thesis | Source |
|---|---|---|
| Consistency is a defect in this repository | It is what admits every style rule to the aggregator, and its cost is that the defect test stops sorting. Reversing it un-gates three of the four new rows. The narrow variant is the recorded alternative. | [#229](https://github.com/mephistopheles4/stacks/issues/229) |
| A clone is a relation between two places, so the duplication number is per-scope **and** whole-tree | The scope list cannot express a cross-scope clone, so one number is structurally blind and the other counts fixtures nobody wrote. Costs two series where every other measure has one. | [#237](https://github.com/mephistopheles4/stacks/issues/237) |
| Cognitive complexity is published beside cyclomatic, never instead of it | The two measures disagree about extraction because they disagree about what complexity is. `resolveSettings` is cyclomatic 17 and cognitive **0**. Costs four rows and a second supplier's pin. | [#234](https://github.com/mephistopheles4/stacks/issues/234) |

⚠️ **[#229](https://github.com/mephistopheles4/stacks/issues/229) §5's debt 2 is
struck and owes nothing.** It called for an ADR on a hook framework;
`.githooks/pre-commit` already exists, tracked and opt-in, so no framework and no
dependency is added.

Everything else here is mechanical — rule lists, series names, thresholds — or
already carries its reasoning on its ticket.

---

## 9. Out of scope, and the refusals recorded

**Three entries for `docs/gates.md`'s Not gated, deliberately.**

| Entry | Why |
|---|---|
| **Test-code complexity** | No test function in this repository exceeds McCabe 10 — the maximum across all 1931 of them is exactly 10 — so `complexity-mass-over-10` is identically zero for every candidate test population and `complexity-max` is a flat line. Those are the two counts the spec caps. Gate test code is indistinguishable from package test code (mean 1.42 against 1.41). [#239](https://github.com/mephistopheles4/stacks/issues/239) |
| **`.editorconfig`** | The tree holds 0 leading tabs, 0 trailing spaces and 0 missing final newlines. A gate over it is green on day one and can never go red. ⚠️ Prettier **reads** `.editorconfig` and merges key by key, so adding one later silently steers the formatter. [#236](https://github.com/mephistopheles4/stacks/issues/236) |
| **MD013 (line length)** | 1540 findings, 76% of everything markdownlint reports, no auto-fix at any limit, and the longest Markdown line is a 2048-character table row, which does not wrap. No limit rescues it. [#235](https://github.com/mephistopheles4/stacks/issues/235) |

**Ruled beyond this effort.** Each returns as a fresh effort, never a resumption.

- **Removing or consolidating any existing gate or series.** No ticket here may
  delete a gate as a side effect of adopting a tool.
- **The G6 overlap.** Two lint rules reproduce G6 (`site-core-imports`) exactly,
  measured against all four of its documented cases. Both are load-bearing:
  `no-restricted-imports` with `allowTypeImports` allows the inline
  `import { type X }` form G6 exists for. Its own issue is
  [#245](https://github.com/mephistopheles4/stacks/issues/245), and the expected
  answer is **keep both** — G6 reads text and needs no program, the lint pair
  needs type information and a 7.5-second run, and they fail independently.
- **How the repo absorbs a rule-set change at every version bump.**
  [#227](https://github.com/mephistopheles4/stacks/issues/227) is the trend-layer
  half. The adoption half is measured — 100 files for the formatter, 36 findings
  for the linter — and the *recurring* half has no answer: a tool upgrade that
  adds rules reddens an unchanged tree. **Pin every tool exact**, which is
  ADR-0067's reasoning, and leave the rest to that issue.
- **Choosing a new TypeScript version or turning Stryker's type checker on.**
  Settled by [ADR-0070](../adr/0070-the-type-checker-stays-off-until-the-compiler-is-hashed.md),
  whose condition is a hashing change rather than a tooling one.
- **Type coverage, dead-code detection, circular dependencies, public-export
  churn.** Candidates this map never examined.
- **The site's own quality surface** — bundle size, render performance,
  accessibility for the 3D shelf. A different population from the TypeScript the
  gates watch, and possibly a separate effort entirely.

---

## 10. Residual register

Every open risk this effort accepts, in one place, so none is rediscovered as a
surprise.

| Residual | Where |
|---|---|
| **The defect test stops sorting** under the broad consistency reading. The reach test does all the work. | §2, [#229](https://github.com/mephistopheles4/stacks/issues/229) §3 |
| **MD049 rests on the broad reading alone** and is the one verdict the narrow variant would flip | §3 |
| **A red names `style`, not the tool**, because three gates share one CI job | §4 |
| **`printWidth: 100` is a measured minimum on today's tree**, not a derived number. 80 gives 330 files, 120 gives 284 — 120 is worse because Prettier rejoins hand-wrapped lines. | §6 step 4 |
| **The four `.astro` files hold 979 lines and every CSS rule the site has**, and Prettier skips them in silence. `pnpm format` would report success. | §6 step 4 |
| **`fixtures/` is excluded on fidelity, not breakage.** Nothing fails; Prettier requotes the frontmatter of 11 vault notes, which is the byte-for-byte promise the adapter contract makes. | §6 step 4 |
| **markdownlint's damage is silent** where Prettier's is loud. A default fix pass changed 55 files, turned 11 issue references into H1 headings, and stripped a space from 16 code spans — with all 1055 tests green throughout. The narrow allowlist is the whole protection. | §6 step 2 |
| **The rules reconcile with CodeRabbit and the versions cannot.** Its docs name markdownlint 0.23.1, the #226 review ran 0.23.2, and this repo can pin only its own copy. | §7 |
| **`--fix` is not what makes a remedy reachable.** 8 of the linter's 36 findings are auto-fixable, 5 carry a suggestion, 23 have no fix at all. | §4 |
| **Three live documentation defects are known and not yet repaired**: a six-cell row in a five-column table at `docs/gates.md:362` whose `✅` does not render; a dead same-document anchor G29 structurally cannot reach, because `gates/doc-links.test.ts:78` skips every target starting with `#`; and a duplicate heading in the file G41 extracts by heading. | §3, [#235](https://github.com/mephistopheles4/stacks/issues/235) |
| **jscpd's thresholds are the measurement.** 50 tokens / 5 lines gives 12 clones and 0.51%; a looser threshold gives 119 clones and 7.71%. The numbers mean nothing without the pin. | §5 |
| **The cognitive cut of 15 has no published derivation.** It is the supplier's number, accepted on the condition that nothing may ever refuse on it. | §5 |
| **`gates/` as a capped population is deferred**, not refused. [#239](https://github.com/mephistopheles4/stacks/issues/239) records one surviving configuration that nothing rules out: one population of all test files, two volume counts, uncapped, read at the deploy, behind its own declaration list and its own ADR. | §9 |
| **"Skip test code" is unrefuted by anything in [#233](https://github.com/mephistopheles4/stacks/issues/233)'s own box.** It removes 52 of the 75 untuned findings for free, and it would agree with [#239](https://github.com/mephistopheles4/stacks/issues/239)'s refusal, giving the repo one position about test code. Whole-tree is chosen anyway; this is the cheapest reversal available if the lint job proves noisy. | §3 |
| **"Adopt nothing" is refused by measurement in two rows and by argument in the rest.** Selecting refusal in all eleven rows of the box is **consistent** — zero active edges — so nothing in eleven tickets forbids it. `astro check` and markdownlint each carry a measured defect that refusal would ship; Prettier, ESLint, duplication and cognitive do not. | §1, [#228](https://github.com/mephistopheles4/stacks/issues/228) |
