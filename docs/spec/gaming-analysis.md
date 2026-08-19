# The adversarial gaming analysis — five categories, a register, and a gate

Sources: [#113](https://github.com/mephistopheles4/stacks/issues/113) (the shape),
[#126](https://github.com/mephistopheles4/stacks/issues/126) (triage),
[#128](https://github.com/mephistopheles4/stacks/issues/128) /
[#132](https://github.com/mephistopheles4/stacks/issues/132) /
[#133](https://github.com/mephistopheles4/stacks/issues/133) /
[#134](https://github.com/mephistopheles4/stacks/issues/134) (the four bands),
[#138](https://github.com/mephistopheles4/stacks/issues/138) (the restated decay
bound), [#139](https://github.com/mephistopheles4/stacks/issues/139) (grading the
sections this spec's other pieces wrote),
[#144](https://github.com/mephistopheles4/stacks/issues/144) and
[#150](https://github.com/mephistopheles4/stacks/issues/150) (the decay re-reads).

**Most of this piece is already built.** [`docs/gate-register.md`](../gate-register.md)
is on `main`, all 35 rows triaged and all 25 flagged rows deep-passed. **What this
spec owes is what remains: the correspondence gate, the `CONTRIBUTING.md` edit, and
a roster so the register's findings reach the person writing the next remedy.**

**Audience: both.** The five categories, the four dispositions and the observed-red
field transfer whole; the 35 rows do not.

---

## 1. Five categories, on two axes

The charting note named three, and **all three presuppose an actor. Both specimens
charting found have no actor** — same outcome, no adversary, so the split is real
and the closers differ.

**Adversarial**

1. **Weakening** — the gate is edited to stop failing: an allowlist entry, a deleted
   assertion, a raised budget.
2. **Satisfying the letter** — the gate passes while the property it names is false.
3. **Routing around** — the property is violated somewhere the gate does not look.

**Entropic**

4. **Vacuous green** — the check returns its best possible answer for its worst
   possible input.
5. **Decay** — see the bound below.

### The decay bound, as restated

> **Category 5: does the row rest on a load-bearing claim whose truth was never
> established, or never re-established, against a check that was available?**

⚠️ **It was originally *"a load-bearing claim that drifted"*, and the restatement
matters.** *Drift* splits the effort's own specimens **four to one**; *nobody ran the
available check* splits them **five to nothing**. **No sixth category, no new
symbol**, and the judgment cost — Clause A's arguability arriving inside the taxonomy
— is **accepted rather than discovered later.**

**Load-bearing means a decision or a procedure rests on it, numeric or not.** That
admits the stale *"133 tests in ~2s"*, which is the stated reason the parked-Stryker
row said a revisit would be cheap, and excludes the slug count, on which nothing
rests. **The bound is what keeps this an analysis of gates rather than a
documentation audit.**

**Gate-spec docblocks are admitted; `docs/gates.md` prose is not**, and the reason is
measured rather than asserted: `docs/gates.md` carries **three** `## G<n>` sections
for 35 rows, while a spec's docblock is keyed to its row by G19 forcing slug to equal
stem. **Prose has no key.**

⚠️ **Two rules the re-reads had to settle before verdicts could move**, both now
part of the category's definition:

- **The discharge test.** What gets re-measured is **the nomination's own claim**, not
  the fact it worries about. That is why one row failed (its claim was false) and an
  otherwise indistinguishable one survived (its claim was true).
- **No double-count with categories 2 and 3.** A docblock overstating **the gate's own
  reach** stays in 2 or 3; one asserting a fact whose **truth-maker lives outside the
  gate spec** is the decay surface.

⚠️ **And a naming obligation, stated here because it was handed to the spec rather
than settled in a band.** One row merges two verdicts into a single
`**Vacuous green / decay**` bullet, so a mechanical count keyed on `**Decay**` misses
it and returns 34 of 35 **silently**. **A verdict bullet names exactly one category.**
The existing merged bullet is marked in place, not split — the file's mark-never-delete
rule — but **no future entry merges two**, and any counting instrument asserts it read
35 sections before reporting a total.

⚠️ **Map-authored is a property, not a category and not an axis.** A set defined by
*how can a gate be green while its intent is unmet* cannot take a member answering
*who produced this*. **The consequence is written down instead: several specimens sit
outside the register's reach by construction**, four of them one shape — *true when
written, falsified by a sibling landing in parallel*, **which nothing in the
wayfinding process serialises.**

---

## 2. The register, and why it is not a column

**Output: [`docs/gate-register.md`](../gate-register.md), a standalone document held
to the row list by a gate in both directions** — no row without an entry, no entry
without a row.

**A per-row column in `docs/gates.md` was the mechanically stronger option and was
declined.** G19 already finds columns by reading the header row and throws when a
named column goes missing, so a column can go red where a paragraph cannot. **It was
declined because a correspondence gate over that column would have made the analysis a
standing obligation on every future gate as a side effect, rather than on its merits.**

The two alternatives are ruled out by this repo's own history rather than by taste:

- *A comment in each spec, beside the gate it is about* is **exactly where the
  existing analysis already lives**, and that is why the extraction finding was a
  finding. `docs/gates.md` records *"a gate that matches prose matches anything"*
  three times and *"a positive check cannot detect a missing one"* three times, each
  beside a different row, **none of it indexed** — a real analysis with no way to query
  it.
- *A standalone document on its own* is a second copy of the row list with nothing
  holding it to the first — the failure the top of `docs/gates.md` lists six instances
  of, and what
  [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) refused a third file
  over.

### The first pass was extraction, not invention

**Each of those repeated lessons was paid for once and none of them was reachable.**
You could not ask this repo which rows had been checked for the prose-matching failure,
because it had answered that three times in three paragraphs 1393 lines apart. **That
condition — a real analysis with no index — is the thing the output shape was chosen
against.**

### What an entry carries

**Five category verdicts, a disposition, a date, and an observed-red line.**

**Four dispositions, and there is no fifth.**

| | |
| --- | --- |
| `gated` | the finding is real and unclosed, **and its remedy is a named check the implementation session builds** |
| `repaired` | closes by changing the existing gate; no new row |
| `accepted` | does not close; goes to the residual register with why |
| `declined` | a gate was **possible** and deliberately not built |

⚠️ **A fifth "documented" disposition was floated and refused.** By this repo's own
constitution that is not a closure: `docs/gates.md` opens with *"a rule nothing can
fail on is a comment."* **A finding closed by writing a rule down is an `accepted`
finding wearing a closure's clothes**, and this effort exists because that distinction
stopped being made.

⚠️ **`gated`'s reading was minted twice, in parallel, by two sessions with no
contact — and they reached the same one by different routes**, each eliminating the
other three. **The rival reading — *already caught elsewhere* — is refused**, since a
finding caught by a gate is not a finding. **Two independent derivations are better
evidence for the reading than either argument for it**, so the register records the
convergence rather than a priority claim. **Confirmed here.**

⚠️ **A nomination that does not survive has its verdict corrected; it is not
dispositioned.** The four dispositions presuppose a finding, and calling a cleared
nomination `repaired` reads as work outstanding. **Rather than mint the fifth
disposition, corrections run in both directions** — and ⚠️ **the `clean` → `exposed`
direction is the one only a demonstration reaches, because a `clean` verdict is
precisely what nobody goes back to.**

### The observed-red field

`docs/gates.md` records *"Observed red by copying the screenshot to a second name"*,
*"Observed red at six of fourteen"*, *"Observed red eight ways"* — **dozens of times,
always as prose, never as a field.** So `CONTRIBUTING.md`'s oldest and most
load-bearing rule, *"a gate never observed failing is not yet a gate"*, **is enforced
today by the author remembering to write a sentence.** The register is the first
structure this repo has had that can require it.

### The shape G40 asserts, stated as cardinality rather than as membership

⚠️ **Membership is not enough, and the earlier wording — *"all five categories
named"* — is the failure it was written against.** A section carrying one merged
`**Vacuous green / decay**` bullet names all five category words and satisfies a
membership check; so does a file carrying **two** `## G26` sections, since
correspondence asks only that each row *has* an entry. **Both are a claim nothing
can fail on, inside the register of claims nothing can fail on.** So:

- **Exactly one verdict bullet per category, per entry** — five bullets, each naming
  one category. §1's rule made mechanical, rather than restated as prose beside a
  check that does not enforce it.
- **Exactly one register section per row**, and one row per section. Cardinality,
  not membership.
- **Exactly one** disposition from the closed vocabulary, one date, one
  observed-red line — **or the entry says in terms that its nomination did not
  survive**, which is the only state that carries no disposition.

⚠️ **One exemption, named with its justification, because the register already
contains the thing this forbids.** **G26**'s merged `**Vacuous green / decay**`
bullet is marked in place under mark-never-delete, so an unexempted rule would go
red on the file the moment it landed — *weakening a gate to make it pass*, at the
worst possible address. **The exemption names G26 and that bullet specifically**,
in the `gates/` allowlist idiom where every entry carries a reason and is
reverse-asserted: **remove the merged bullet and the exemption goes red too**, so
it cannot outlive the row it exists for.

⚠️ **The gate asserts shape and says nothing about quality, and the spec states that
limit.** **Whether the analysis behind an entry is any good is outside it** — the
same relationship G19 has to slugs, and G22's lesson applied to this gate rather
than exempting it.

---

## 3. G40 `gate-register` — *Contract seams*

**The register keys on gate rows only, by construction rather than by rule.** Trends
take no row number and the gate keys on row numbers, **so there is nothing to omit** —
and the `| **G\d+** |` match *is* the required statement of the key. That dissolves the
collision the trend decision flagged: **a trend's observed-red field would have been
unsatisfiable, and writing an entry that satisfied the shape check anyway is exactly
the category-4 failure the register exists to catalogue.**

**Table: *Contract seams*, with G14 (`commands`), G19 (`constitution-scoreboard`) and
G42 (`ignored-mutants`)** — the other both-directions correspondence gates. **The slug
matches the document it holds**, as `constitution-scoreboard` matches its file, rather
than naming its own mechanism.

### The floor: row side only, at 42

⚠️ **The two sides are not symmetric.** *No row without an entry* already reddens on
any deletion, so **entries cannot go vacuous**. The **row side** can: if the gate's
regex over `docs/gates.md` stops matching, both directions pass over nothing.
`gates/repo.ts` defaults `atLeast = 1`, so an unstated floor is a floor of one.

**42 equals the row population after this spec lands, and here that is safe for a
stated structural reason**: mark-never-delete plus gapless makes the row count
**non-decreasing** in normal operation.

⚠️ **The mechanism underneath it was wrong when first stated, and the corrected version
is stronger:**

| Deletion | Caught by |
| --- | --- |
| any row, interior | G19 gapless, **and** the floor |
| **the highest-numbered row** | **the floor**, and the register's *no entry without a row* — **G19's gapless check is blind to it**, because it bounds its walk at `n < numbers.at(-1)`, exclusive of the maximum |
| the gate's regex stops matching `docs/gates.md` | the floor |

**So on top-row deletion the floor is the only structural check in the file.** ⚠️ **That
is a finding about G19 in its own right, and it belongs in G19's own register entry**
alongside the `TABLES` hole.

**An entry-side floor was declined**: it would go red *alongside* the first missing
entry, landing two reds on the commit whose entire job is demonstrating one.

⚠️ **The floor was 41 and is 42.** It was set equal to the population and defended on
monotonicity; the ratchet's row moved the population. **Flagged loudly because *a floor
equal to a population* is precisely the shape that went wrong in the supply-chain
piece** — it is safe here **only** under the monotonicity argument, and a session that
copies the pattern without it copies the mistake.

### It cannot ship first, and the ordering is dissolved rather than obeyed

**Ship the gate before the register is populated and it is red on 35 rows** — not a
gate observed failing on a real defect, just a gate that has never passed. **Ship 35
stub entries so it goes green and an empty section satisfies a shape check**, which is
category 4 built into the artifact about category 4.

⚠️ **The constraint is dissolved by events**: the register is already on `main`,
genuinely populated by triage and four bands. **So the gate lands in the same commit as
the first new row it can actually go red on — G39 `action-pins`** — and **one commit
discharges three obligations**: the landing rule, the supply-chain triage obligation,
and the observed-red rule.

⚠️ **Its placement stays where the rollout put it. Moving it into the spine would land
it with no new row to go red on**, which is *green against stubs* by the back door.

**One rule the order forces, and it is in the spec rather than in a comment: every gate
landing before `gate-register` writes its observed-red line at landing.** On this order
**three** rows land in the spine ahead of it — G36, G37, G38 — so each records its
observed-red **when observed**, or reconstructs it from memory weeks later, **which is
the decay category arriving inside the artifact built to catalogue it.**

---

## 4. What the deep pass found

**25 of 35 rows flagged, 10 clean, none unreached; every flagged row deep-passed.**
Detail is in [`docs/gate-register.md`](../gate-register.md) and is **cited rather than
restated** — a second, slightly-different copy is the cost
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) names. **What belongs
here is the shape of the result and the roster of what is owed.**

**The three sharpest exposures**, each a gate whose stated scope exceeded its real
scope, found inside the audit of exactly that failure:

- **G31 `merge-precedence` is vacuous: the gate imports the precedence constants and
  never the merge.** Four defects that each break the merge left it at **5 of 5
  green**, and dropping a field from `MERGED_FIELDS` failed **exactly one test in the
  repository** — a unit spec with no scoreboard row. Its own docblock promises red
  *"when the document names an order the code does not implement."*
- **G30 `library-seam`: a new field wired end-to-end through the frontmatter contract
  never reaches `library.json`, at 636 of 636 green and `tsc` clean** — verbatim what
  its docblock says it exists to prevent. The gate computes `missing` from **the
  fixture, never the type**.
- **G6 `site-core-imports`: two routes past the gate, the suite *and* the build.** A
  **relative path** into `packages/core/` carries no `@stacks/core` literal, so the
  file is read and nothing in it is seen; an **`.astro` `<script>`** carries the
  forbidden statement *verbatim* in a file type the gate does not open. Either leaves
  `pnpm build` **succeeding** while vite externalizes `sharp` and `node:fs` into the
  browser bundle. ⚠️ **`pnpm smoke:render` goes red on both, in the same required
  check — so the invariant is defended in CI and not by the gate written for it**, and
  that red names no rule, no file and no line. **That is the whole difference between a
  structural gate and a smoke test.**

**Two findings about the method, both worth more than any single row:**

⚠️ **Neither independence nor demonstration is sufficient alone.** G20 is the recorded
case: the author *did* plant a defect, planted one **the file could never have had**,
and the false green survived it. **So a fresh-context agent runs the pass, and every
gap that can be planted is planted.** A finding that cannot be planted is marked
**reasoned, not demonstrated**, rather than dressed as evidence.

⚠️ **Every count that went wrong was caught by counting mechanically, and none by
reading a summary.** The register's own shape failed the same way four times — ten rows
collapsing five verdicts into one line, 23 lines reading *"not discussed"* under a
headline claiming *"0 not reached"*, ten more stating a reason where a verdict belongs,
and a row counted flagged while clean five times. **Each time the register asserted
something no per-row entry could contradict** — a claim nothing can fail on, arriving in
the catalogue of claims nothing can fail on. **Instruments were wrong six times, every
one in the flattering direction**, including a counting script whose em dash did not
survive being pasted. **The rule that falls out: recount over the sections, never carry
a total forward in prose.**

### The remedy roster

⚠️ **The question this spec was handed: *the register's findings do not reach the person
writing the next remedy.*** It was demonstrated — a remedy proposed after two bands had
each landed a demonstration of the same routing-around hole **shipped that hole
anyway**, saying *scan tracked `.ts`* in a repo with one tracked `.mjs` and four tracked
`.astro` files.

**The answer is a roster, and its rule is that the roster is derived, never
remembered:**

> **Before writing any gate change, the implementation session lists every register
> entry whose disposition is `gated` or whose remedy is named-and-not-built, reads all
> of them, and checks its own proposed remedy against the routing-around verdicts of
> every row that shares a mechanism.** Derived from the file by a query, not carried in
> a head or a handoff.

**Twenty-two rows carry a named, unbuilt remedy today** — G1, G2, G6, G7, G10, G12,
G13, G14, G15, G17, G18, G19, G20, G21, G22, G24, G26, G29, G30, G31, G33, G35 — plus
the excluded-file mutant-count ceiling that
[`mutation-scoring.md`](mutation-scoring.md#5-the-exclusion-list-named-files-a-mechanism-each)
leaves as an honest limit rather than a closed hole. **Each remedy's text lives in its
entry**; this spec names the population so that *"I read the ones I remembered"* is not
available.

⚠️ **None of them is scheduled here.** The roster is a reading obligation, not a
backlog: **this spec's rollout lands seven rows and no repairs**, and turning
twenty-two named remedies into work is a separate effort with its own scoping.

---

## 5. Grading the sections — the pattern, not the verdicts

Each of this spec's pieces carries its own five-category section, **written by the
author of the piece and graded by somebody else** — eight sealed fresh contexts, one per
section, with the map and every band withheld. **The per-section verdicts live in each
piece's file**; what belongs here is what the pass found across all eight.

**The failure across all eight is counting, not reasoning.** Wrong counts three times in
one section; a section contradicting its own body; a ratio quoted as `4.8×` where the
argument needs runtime and the figure is `2.76×`; a rule sourced to a file containing no
match for the word. **Every one of them a command away** — several inside sentences
congratulating the author for measuring rather than assuming, which is the restated decay
bound landing on sections written before it existed.

⚠️ **Corrections do not maintain the sections they invalidate.** One correction declares
*"nothing in the gaming section changes"* three paragraphs after falsifying two of that
section's four category-1 claims — **an absence claimed as a mechanism and kept after the
absence ended.** Another left two entries superseded and unmarked.

⚠️ **Deferral onto unbuilt artifacts is systemic.** One section secures three of five
entries on a nightly its own text concedes cannot ship first. **The rollout order is what
discharges that**, and it is why the order is part of the spec rather than a note.

⚠️ **The priming-list check returned nothing missed, and that is the weak half** — every
flagged item is something a section says about itself, so reading it is unavoidable.
**The cold pass found twenty-two items no upstream ticket flagged, and the two largest
sit on the two pieces the list did not cover at all.** *An audit primed with its own
answer list measures the list.*

**Two live findings from the cold pass are carried into their pieces rather than left
here**: the two guards the ratchet was described as resting on
([`the-ratchet.md`](the-ratchet.md#5-what-the-guard-actually-is)), and the exemption axis
and floor population in the supply-chain posture
([`supply-chain.md`](supply-chain.md#the-withdrawn-exemption-the-axis-is-mutability)).

**Membership in the five-category obligation has no mechanism**, and that is recorded
rather than fixed: six hand-delivered comments, with one uninstructed piece volunteering
a section and another, equally uninstructed, writing none. **A roster forces the
completeness check that woven reasoning does not** — the transferable rule stated in
[`supply-chain.md`](supply-chain.md#7-gaming-categories): *the argument belongs where the
decision is made; the roster belongs at the end.*

---

## 6. Specimens this effort produced about itself

**Recorded because they are evidence, and because an effort about claims that quietly
stop being true does not get to exempt its own output.** All are category 5 under the
restated bound; **all are repaired in the spec, never silently.**

| Specimen | Why it is load-bearing |
| --- | --- |
| A row number **allocated twice, five seconds apart**, by two sessions from one shared map | ⚠️ **Nothing in wayfinding could have caught it. What would have is G19's unique-and-gapless assertion turning the second spec red** — the scoreboard catching a defect in the effort designing its successor |
| *"It published first"* — an ordering claim asserted from the shape of the work; measured, **five seconds in the other direction** | Inside a correction record, on an effort whose subject is claims nobody checked |
| The roster listing **five specs where there are six** | It *is* the row inventory. **A roster that omits a row is the artifact whose stated job is completeness, incomplete** |
| The reversibility budget counting **three one-way doors where there are six** | ⚠️ **The strongest of these.** The index of irreversible acts, wrong about how many there are, **in the section that exists to count them** |
| *"Grepped all 26 closed tickets"* — it was **19** | A coverage claim stated as *"verified rather than assumed"* while covering 73% of its stated population |
| *"Four consistent `# vN.N.N` comments"* — it counted **actions**, not comments; seven on four actions | One `grep` was available and nobody ran it, **inside the paragraph arguing that a claim about the tree must be measured** |
| A **decayed *reason*, not a number**: a decision declined on a hazard a sibling ticket had dissolved, never re-checked | ⚠️ **Invisible to the method that caught every other specimen.** The rest were found by recounting; **a reason has no number to recount** |
| A pass shipping *"Total flagged: 25 of 35"* against its own Summary's **24** | Two contradicting aggregate claims **inside the register of claims that quietly stop being true** |
| The register **stating the retired decay bound at the top and the restated one 640 lines down** | ⚠️ **The list every future triage starts from** — governing future verdicts rather than describing past ones |

⚠️ **Four of these share one shape — *true when written, falsified by a sibling landing
in parallel* — and nothing in the process serialises it.** **What catches it is
recounting mechanically at the point of assembly**, which is what this spec did and what
the roster rule in §4 institutionalises.

⚠️ **And one class is genuinely uncaught: a reason that decayed.** A map that catches
decay by recounting will not catch it at all. **That belongs in the register as a limit
of the technique rather than as one more instance.**

---

## 7. What lands where

| Artifact | Change |
| --- | --- |
| `gates/gate-register.test.ts` | **G40** — correspondence both ways between `docs/gates.md`'s numbered rows and the register's row sections; **row-side floor at 42**; **exact cardinality** and entry shape, per §2 |
| [`docs/gates.md`](../gates.md) | **row G40 `gate-register`, *Contract seams → gates*** |
| [`CONTRIBUTING.md`](../../CONTRIBUTING.md) | the per-gate evidence obligation: **a new gate lands with a register entry carrying five verdicts, a disposition, a date and an observed-red line** — and *"a gate never observed failing is not yet a gate"* stops being a sentence the author remembers to write |
| [`docs/gate-register.md`](../gate-register.md) | entries for **all seven new rows**; the merged-verdict-bullet marking from §1; **the G19 findings** — the positional status cell, the `TABLES` hole, **and gapless's blindness to top-row deletion** — in G19's own entry |
| [`docs/spec/`](.) | this file, as the roster's index |

⚠️ **G19 is not edited, and that is a disposition rather than an omission.** Every one
of the seven new rows lands in an existing table, so **nothing this rollout adds
exercises the `TABLES` hole**. Hardening a green gate against a vector this rollout never
reaches is a change this effort would be **making** rather than deciding. **The cost,
stated: the hole then stays closed by convention — *we put rows in the three tables* —
which is the shape this effort keeps finding is not a gate.**

---

## 8. How it is proved able to fail

| Check | Plant this | Expect |
| --- | --- | --- |
| **G40**, forward | land a `docs/gates.md` row with no register section | red — **and this is the demonstration, on G39's own landing commit** |
| **G40**, reverse | add a register section for a row that does not exist | red |
| **G40**, entry shape | delete a row's observed-red line | red |
| **G40**, entry shape | write a disposition outside the four-word vocabulary | red |
| **G40**, cardinality | merge two verdicts into one bullet on any row **but G26** | red |
| **G40**, cardinality | add a second `## G26` section | red |
| **G40**, the exemption | split G26's merged bullet, leaving the exemption behind | red — **the exemption is reverse-asserted** |
| **G40**, floor | break the regex that reads `docs/gates.md`'s rows | red, not a vacuous pass over two empty sets |
| **G40**, top-row deletion | delete the highest-numbered row | red **on the floor** — G19's gapless check stays green, which is the point |

⚠️ **What cannot be planted, and is marked reasoned rather than demonstrated: that the
analysis inside an entry is any good.** G40 asserts shape. **The limit is stated in §2
and it is the same limit G19 has to slugs.**
