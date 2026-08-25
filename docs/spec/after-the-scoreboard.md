# After the scoreboard — mutation scoring, the trend layer, and the gaming analysis

The locked spec for [Map: what comes after the scoreboard](https://github.com/mephistopheles4/stacks/issues/108)
— 29 closed decision tickets, assembled into something an implementation session
can execute **without reopening any of them**.

**This is what comes after the invariant scoreboard.** That part is built: G19
(`constitution-scoreboard`) is green and all 35 rows in
[`docs/gates.md`](../gates.md) are ✅ with no ⬜ left. **The scoreboard turned
constitution coverage into a tracked number; this spec decides whether the tests
behind those numbers actually catch anything.**

**Everything here is decided.** Where a resolution and a later amendment disagree,
these files carry **the later one** and say so. Where a decision went against a
recommendation, the counter-argument is recorded, because that is what would have to
be true for the decision to reopen.

**This spec does not implement.** It states the edits; the implementation session
makes them.

---

## The files

⚠️ **The pieces and the files do not correspond one to one, and the spec does not
count either in prose.** The destination named five pieces; this folder holds this
index and seven more files, because **the mutation piece splits at the record** —
measurement and enforcement are separate landings, and the split was forced rather
than chosen. A count in a heading over a table that grows is the shape
[`gaming-analysis.md`](gaming-analysis.md) catalogues; **the table is the inventory.**

| File | Covers |
| --- | --- |
| [`gate-or-trend.md`](gate-or-trend.md) | **Read first.** The two-clause rule deciding where any check lands, the trends table, and what the `gates` aggregator may depend on |
| [`mutation-scoring.md`](mutation-scoring.md) | Stryker at 9.6.1, the three startup fixes, the eight declared scopes and their exclusions, and **G37 `mutation-scope`** |
| [`the-ratchet.md`](the-ratchet.md) | The floors file, the deploy refusal with no override, the three routes down, the calibration window, and **G42 `ignored-mutants`** |
| [`trend-layer.md`](trend-layer.md) | `metrics.yml`, the orphan `metrics` branch, `pnpm trend:sync`, four series, the runtime surfaces, and **G36 `trend-layer`** and **G38 `metrics-freshness`** |
| [`no-coverage-floor.md`](no-coverage-floor.md) | **Why there is none**, and why no coverage tooling enters this repo at all |
| [`supply-chain.md`](supply-chain.md) | SHA-pinned actions, the `audit` job, the `ignoreGhsas` hatch, and **G39 `action-pins`** and **G41 `dependency-audit`** |
| [`gaming-analysis.md`](gaming-analysis.md) | The five categories, the register, the remedy roster, and **G40 `gate-register`** |

**Read them in that order.** `gate-or-trend.md` is the rule the other six are
applications of; the trend layer is mutation scoring's **delivery mechanism** rather
than its consumer, so the ratchet cannot be read without it.

### Two audiences, always named

Every decision names which audience it is speaking to — **stacks as the reference
implementation**, or **the transferable design** for a production codebase that
already has the infrastructure. Where the two agree, one statement; **where they
invert, one derivation naming what flipped it.**

⚠️ **There is no separate transferable document, and that was refused on the
derivation rather than on effort.** A standalone either reproduces the derivations —
every transferable rule here was reached *from* a stacks decision, sometimes by
discovering what stacks could not do — or asserts the rules bare, which is the weaker
artifact. [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) is about
what the second, slightly-different copy costs.

**The full lesson's real home is a case study on the owner's website**, and this spec
is the source material it is written from. **Producing that case study sits past this
spec's destination.** ⚠️ **Nothing holds it to reality**: G29 (`doc-links`) checks
*local* targets and skips `http(s):` by its own text, because G21 forbids a test
touching the network. **The mechanism is unavailable, not unbuilt.** What disciplines
it instead: **the case study names the commit it was written against and links repo
files rather than restating them** — turning *"this is wrong now"* into *"this was
true at `1d0548f`"*.

---

## The four inversions

⚠️ **The count is four, not the two originally recorded** — and each was found late,
by a session that was not looking for it. **They are written as derivations rather
than as verdict pairs**, because *stacks: gate / production: trend* reads as a tuning
parameter and deletes the finding.

| Inversion | What flipped it |
| --- | --- |
| The **`audit` job** is a gate here and a trend in a large tree | **Tree size.** Clause A — *does a red have a fix somebody can actually make* — answers yes with a one-line hatch and no for a daily advisory four levels down. ⚠️ **A discovery about the taxonomy that the taxonomy could not make from inside itself.** [`supply-chain.md`](supply-chain.md) |
| The **ratchet's surface**: deploy here, a required pull-request check there | **Dependency on shipping.** A deploy floor with no override converts a test-quality regression into an **availability incident** once anyone depends on shipping. ⚠️ **It has a tail**: warn-only and first-week contributor visibility both flip as consequences. [`the-ratchet.md`](the-ratchet.md) |
| The **ratchet's guard** is weakest in the repo relying on it most | **Who is required to read.** By rule, nobody here — and requiring it is mechanically unavailable at one maintainer. Elsewhere the same diff hits CODEOWNERS. **The surface is right here and wrong there; the guard is weak here and strong there.** [`the-ratchet.md`](the-ratchet.md) |
| **Surface D's history lives on one machine** | **Where the store is.** D's row goes to the local store only, so the no-credential property holds at both ends — and the history is unshareable. On a server it is ordinary. [`trend-layer.md`](trend-layer.md) |

**Four is still four paragraphs written properly, not a convention imposed on every
decision.** ⚠️ **That judgement is made here rather than inherited**: the rule was
always about *how* an inversion is written, never about how many there are, and four
derivations is still cheaper and more honest than a per-decision audience field that
would be empty on most of them.

**The transferable half also carries three rules derived rather than separately
decided**, flagged as such so they can be pushed back on:

- **Every zero-expected counter ships with its denominator.** On a server that is
  free; on a static site it costs the thing the product refuses.
- **A check that is honest against fixtures can be vacuous against production, and
  moving it to the production artifact does not move its meaning with it.**
- **Score only what an in-process oracle reaches, and name the mechanism that puts
  everything else out of reach.**

---

## The build order

**Spine → (supply-chain gates + the register gate) → the ratchet, disarmed.**

**Decided on lead time**, and that is the only reason it holds: everything else in
this spec is *work*, and the 20-run calibration window is *waiting*. **Waiting
overlaps with work only if it starts first.**

**1 — The spine.** Stryker and its ADR, `stryker.config`, `metrics.yml`, the orphan
`metrics` branch, `pnpm trend:sync`, the `## Trends` section, **`scripts/deploy.ts`**,
and **G36 `trend-layer`, G37 `mutation-scope`, G38 `metrics-freshness`**. It does not
touch `gates.yml` or its `timeout-minutes: 20`, because the nightly lives in its own
workflow.

⚠️ **`scripts/deploy.ts` is in this step and was missing from it.** Two of the three
spine gates are **partly deploy-side**: G37 carries the zero-mutant residual refusal
and **G38 is a deploy refusal outright**, alongside the per-series staleness check,
its branch-tip disambiguating fetch, the dated bootstrap and the print block. **A row
cannot be marked landed while the behaviour it scores is unwired**, which is a gate
whose stated scope exceeds its real scope — arriving in the ordered checklist an
implementation session actually follows.

⚠️ **The spine's landing checklist pins `metrics.yml`'s actions by hand and says
why**: it is the one new workflow file in this rollout, and it is authored during the
only window in which nothing checks its pins.

**2 — The supply-chain gates and the register gate.** Cheapest in the set: no new
dependency, no CI cost, pure `gates/` specs of a shape this repo has built 35 times.
**G39 `action-pins`, G40 `gate-register`, G41 `dependency-audit`.** ⚠️ **G40 lands in
the same commit as G39** — the first new row it can actually go red on — so **one
commit discharges three obligations**: the register gate's landing rule, the
supply-chain triage obligation, and the observed-red rule below.

**3 — The ratchet, disarmed.** The floors JSON all `unarmed`, the refusal wired, the
print live, and **G42 `ignored-mutants`**. It lands **early** in the window rather
than at the end: the `12/20 runs` countdown is part of this piece, so landing it late
makes the countdown invisible for exactly the period it exists to make legible.

> **Every gate landing before `gate-register` writes its observed-red line at
> landing.** Three rows do — G36, G37, G38 — so each records it **when observed**,
> rather than reconstructing it from memory weeks later.

**Nothing ships warn-only, because nothing would be red.** Three of the pieces codify
what is already true, and the one piece that would be red on arrival is the ratchet,
which is exactly why it has `unarmed`. **Verified: zero `continue-on-error` anywhere
in `.github/`**, so there is no warn-only shape here to reach for either.

**A contributor never sees any of it, structurally.** Nothing in this rollout can
redden an ordinary pull request unless the pull request itself does the forbidden
thing; the ratchet refuses `deploy:site`, which one person runs, from `main`. *A
stranger paying for your dead pipe is not a gate; it is a tax.*

### What is reversible, and what is not

⚠️ **Landing a row is the one-way door, and this rollout spends seven.** A row is
retired **by marking, never deleting**, and G19 asserts unique-and-gapless — so backing
one out means minting a **retired** status symbol, and `allowedStatuses()` reads the
Status key at runtime, **which widens the accepted vocabulary for all rows at once.**
Back-out is expensive by construction, and identically expensive for all seven.

Three spec lines follow:

1. **Row-landing is named as this rollout's irreversible act**, with the retired-status
   cost written down, so the seven rows are decided once and knowingly rather than
   discovered on the way out.
2. **No pre-minted retired status.** A status symbol no row carries is a vacuous-green
   shape inside the file that scores this repo's rules. **Pay for it when a gate
   actually has to go.**
3. ⚠️ **Once any scope is armed, the `metrics` branch is append-only in practice** —
   never force-pushed, never pruned, never rewritten. **Its history *is* the calibration
   evidence for every armed floor. Enforced by nothing**, said in the same breath rather
   than implied.

**Genuinely reversible**: the Stryker dependency (`pnpm remove`, mark the ADR
superseded), the floors JSON with its refusal (delete both), and — ⚠️ **only while
every scope is still `unarmed`** — the orphan `metrics` branch (`git push --delete`;
nothing references it).

⚠️ **That qualification was missing and the two sentences contradicted each other
one line apart.** #122 §7 lists the branch as freely deletable *and* rules it
append-only once anything is armed; **both are its own, adjacent, and neither
noticed.** After arming there is no evidence-preserving deletion, because **the
history *is* the evidence** — so backing the ratchet out post-arming means keeping
the branch and deleting the floors file, never the reverse.

---

## The gate roster

**Seven rows, and the numbers were never anyone's to choose.**
`gates/constitution-scoreboard.test.ts` asserts gaplessness **at every merge**, not at
the end of a rollout — so **the Nth new row to land is G(35+N)**, and the allocation
falls out of the build order rather than out of whoever writes the spec. **Within a
commit, table order as the file reads them**: *Contract seams → gates* before *Defect
gates*.

| # | Slug | Table | Lands with | Asserts |
| --- | --- | --- | --- | --- |
| **G36** | `trend-layer` | Contract seams | spine | series ↔ Trends table, both directions; trend names kebab-case, unique, disjoint from every gate slug |
| **G37** | `mutation-scope` | Contract seams | spine | declared scopes exist, every source directory declared-or-excluded, every exclusion carries a mechanism, every scope's glob matches a file — **plus a deploy-side residual** |
| **G38** | `metrics-freshness` | Defect gates | spine | given a stale record, `deploy:site` refuses — per series, on G17's scratch-repo idiom |
| **G39** | `action-pins` | Contract seams | supply-chain + register | every `uses:` is a 40-hex SHA with a version-shaped comment, swept over `.github/**/*.yml` — **plus the `audit` job's own existence and its place in `needs:`** |
| **G40** | `gate-register` | Contract seams | supply-chain + register | scoreboard rows ↔ register sections, both directions; entry shape; row-side floor at **42** |
| **G41** | `dependency-audit` | Defect gates | supply-chain + register | promoted from the CI-only table; **declares its slug**, on G16's precedent |
| **G42** | `ignored-mutants` | Contract seams | the ratchet | the floors file's `ignored` counter against a real grep of `Stryker disable` in mutated source |

⚠️ **Cite slug and number together, never the number alone.** Three of these were
provisionally allocated by tickets that could not see the rollout order, **and every
one of them was wrong** — including one number allocated twice, five seconds apart, by
two sessions from the same map. `docs/gates.md`'s own line is why: *"G19 is a stable
identifier and tells you nothing."*

**G19 is not edited.** Every one of the seven lands in an existing table, so nothing
here exercises the `TABLES` hole; hardening a green gate against a vector this rollout
never reaches would be **making** rather than deciding. ⚠️ **The cost, stated: the hole
stays closed by convention.**

**Trends take no row number and no status.** ✅ / 🔴 / ⬜ stay the whole vocabulary and
the Status key is not touched.

---

## Contract edits

Each is a **document edit landing in the same commit as the code it describes**, never
before it.

| File | Edit |
| --- | --- |
| [`docs/gates.md`](../gates.md) | seven rows; a new **`## Trends`** section immediately before *Triaging a CodeQL finding*; **`## CI-only gates` removed**, its prose kept under a named `## G41 —` heading; the **Mutation testing** rejection row **marked in place, dated, with the corrected count beside the wrong one**; the **Changed-lines** rejection row **replaced**, `(diff-cover)` dropped |
| [`CLAUDE.md`](../../CLAUDE.md) | `pnpm trend:sync` in the commands list — G14 holds both lists in both directions |
| [`CONTEXT.md`](../../CONTEXT.md) | add **`Trend`**; amend **`Gate`** to turn on *scored* rather than on *present in `docs/gates.md`*. **Proposed and not made**: a **Vacuity floor** entry in the *Checking* section |
| [`CONTRIBUTING.md`](../../CONTRIBUTING.md) | a new gate lands with a register entry carrying **five verdicts, a disposition, a date and an observed-red line** |
| [`SECURITY.md`](../../SECURITY.md) | the pinning line amended — held in shape by a gate, and what the gate does not hold; the *unverifiable* clause extended by one sentence |
| [`docs/gate-register.md`](../gate-register.md) | entries for all seven rows, **triaged in the commit that lands them**; a category-1 verdict on `auditConfig.ignoreGhsas`; the G19 findings in G19's own entry |
| [`docs/progress.md`](../progress.md) | updated in the same commit as each gate, per its own rule |
| `scripts/deploy.ts` | the print block; three refusals; **every refusal states which flags clear it** |

⚠️ **`docs/gates.md` already carries two stale counts and this spec adds none.**
Measured populations go in **spec header comments and register entries**, which carry a
date by construction. A count in a scoreboard row is the next decay specimen.

---

## What belongs in `docs/adr/`

`CLAUDE.md`'s test is **hard to reverse, surprising without context, and a real
trade-off**. Four decisions meet all three. The proposal is a *list*, not four written
records — writing them is implementation work — and **the next free number is 0053**.

| Proposed record | Thesis | Source |
| --- | --- | --- |
| **Stryker is a dependency, pinned exactly at 9.6.1** | Required outright by `CLAUDE.md`'s no-dependency-without-a-record rule. `^9.6.0` is a correctness bug, not a style preference, and the peer range asserts a compatibility that does not exist. Accepted cost: a large tree, three startup workarounds, and a project-references graph would block it entirely. | [#109](https://github.com/mephistopheles4/stacks/issues/109), [#114](https://github.com/mephistopheles4/stacks/issues/114) |
| **A check is a gate or a trend, and the taxonomy is binary** | Two clauses, no third column. Reversing it unsupports the coverage refusal, the trends table and three row placements at once. Accepted cost: *trend* names things that do not trend, and Clause A is arguable where Clause B is mechanical. | [#112](https://github.com/mephistopheles4/stacks/issues/112) |
| **The mutation floor refuses `deploy:site` with no override** | Removing the override is what makes a lowering the only move; the trade is that a legitimate refactor can block shipping a book today, and the guard is weakest in the repo relying on it most. Inverts for the transferable design. | [#115](https://github.com/mephistopheles4/stacks/issues/115), [#147](https://github.com/mephistopheles4/stacks/issues/147) |
| **CI writes a durable record; the machine pulls it** | The record and the store are separable, so no hosted option's ingest window can cost history. Buys a no-secret design and unlimited replay; costs an unprotected branch holding the calibration evidence for every armed floor. ⚠️ **The word is *durable* and not *immutable*** — that branch is force-pushable, and an ADR titled with the property its own consequence column denies would be the worst place on this effort for that sentence to live. | [#121](https://github.com/mephistopheles4/stacks/issues/121) |

**Everything else is spec, not ADR** — either mechanical, or already carrying its
reasoning inline. **A lesson about a *gate* goes to [`docs/gates.md`](../gates.md); an
environment finding goes to [`docs/progress.md`](../progress.md).**

⚠️ **The changed-lines refusal gets no ADR**, and that is deliberate: its record is the
amended `docs/gates.md` row, which is where a reader looking for *"why is there no
coverage gate"* actually looks. **A second copy would be the thing ADR-0026 objects
to.**

---

## Out of scope — and the spec says so

Ruled beyond this effort's destination. Each returns only as a fresh effort, never as a
resumption of this one.

- **Building any of these pieces.** The destination is a locked spec; implementation is
  a separate session.
- **Redrawing the constitution.** The five invariants in `CLAUDE.md` and the rows in
  `docs/gates.md` are the thing being defended, not the thing being revised. A row's
  *representation* may change; no rule's *content* does.
- **Writing the website case study.** Its material lives here inline; **producing it
  sits past the destination.** Recorded so *"the transferable half lives on the
  website"* cannot later be read as a deliverable this spec still owes.
- **Turning the twenty-two named-but-unbuilt remedies into work.** The roster in
  [`gaming-analysis.md`](gaming-analysis.md) is a **reading obligation**, not a backlog;
  scheduling those repairs is a separate effort with its own scoping.
- **`--skip-gates`'s fate**, which is
  [#152](https://github.com/mephistopheles4/stacks/issues/152)'s. This spec asserts
  nothing about the flag's future and does not need to.
- **A CSP for the shelf**, which is
  [#127](https://github.com/mephistopheles4/stacks/issues/127)'s.

---

## The residual register

Every open risk this spec accepts, in one place, so none is rediscovered as a surprise.
Detail is in the file named.

| Residual | Where |
| --- | --- |
| **Mutation score is raised by adding trivially-killable code**, and neither clause closes it. Any floor inherits it | [gate-or-trend](gate-or-trend.md), [the-ratchet](the-ratchet.md) |
| **The ratchet's floor will probably never be raised.** A piece that looks armed and does nothing is worse than a slack floor, because it is silent | [the-ratchet](the-ratchet.md) |
| **Nothing enforces the `notes` line** on a lowering, and **nobody is required to read the diff** — by rule, not by preference | [the-ratchet](the-ratchet.md) |
| **`scripts/` is unmeasured on day one** and enters `unarmed`; `unarmed` is a value somebody can type to make a refusal go away | [the-ratchet](the-ratchet.md) |
| **Every number the ratchet rests on was measured once, on one machine, at one commit**, and nothing re-measures them | [the-ratchet](the-ratchet.md) |
| **Appending logic to an already-excluded file is invisible** to both halves of the scope check | [mutation-scoring](mutation-scoring.md) |
| **`gates/repo.ts` weakens twenty gates if wrong and has no spec of its own** | [mutation-scoring](mutation-scoring.md) |
| **The `metrics` branch is unprotected and force-pushable**, and its history is the calibration evidence for every armed floor. Enforced by nothing | [trend-layer](trend-layer.md) |
| **No deploys means no learning**, three times over — every surface fires at `deploy:site` or `trend:sync` | [trend-layer](trend-layer.md), [the-ratchet](the-ratchet.md) |
| **Invariant 2's real-build `note-body` rule is vacuous**, and is accepted as such in writing | [trend-layer](trend-layer.md) |
| **The site's single-outbound-request property is true by measurement, not by property** | [trend-layer](trend-layer.md) |
| **`~/.claude` transcripts hold note-body text in plaintext**, reachable by no gate | [trend-layer](trend-layer.md) |
| **Edge-injected markup on the deployed site is observed by nothing** — deliberate, and written down | [trend-layer](trend-layer.md) |
| **A valid SHA under a lying version comment passes G39 cleanly.** Structural: actions have no lockfile and G21 forbids asking | [supply-chain](supply-chain.md) |
| **Nothing in this repo reads what a workflow *does*** — G39 covers the actions it calls, never its own body | [supply-chain](supply-chain.md) |
| **G19's `TABLES` hole and its blindness to top-row deletion** stay closed by convention | [gaming-analysis](gaming-analysis.md) |
| **Twenty-two rows carry a named, unbuilt remedy**, and the register's findings do not reach the next remedy's author by themselves | [gaming-analysis](gaming-analysis.md) |
| **A decayed *reason* is invisible to the method that caught every other specimen** | [gaming-analysis](gaming-analysis.md) |
| **`docs/gates.md`'s prose is not a register subject** — the register keys on rows, and prose has no key | [gaming-analysis](gaming-analysis.md) |
| **The case study is held to reality by nothing.** The mechanism is unavailable, not unbuilt | this file |

---

## Source material

Every decision here lives in a resolution comment on a closed child of
[#108](https://github.com/mephistopheles4/stacks/issues/108). The measured findings
behind them live in **research documents that are not in this checkout** — each captured
on its own throwaway `research/*` branch:

| Finding | Branch |
| --- | --- |
| [`stryker-on-this-stack.md`](https://github.com/mephistopheles4/stacks/blob/2b79301/docs/research/stryker-on-this-stack.md) | `research/stryker-compat` |
| [`changed-lines-coverage.md`](https://github.com/mephistopheles4/stacks/blob/2040718/docs/research/changed-lines-coverage.md) | `research/changed-lines-coverage` |
| [`trend-layer-hosting.md`](https://github.com/mephistopheles4/stacks/blob/d25b059/docs/research/trend-layer-hosting.md) | `research/trend-layer-hosting` |
| [`agent-logs-as-metrics.md`](https://github.com/mephistopheles4/stacks/blob/d5e6777/docs/research/agent-logs-as-metrics.md) | `research/agent-logs` |

The eight mutation runs and their per-file counts are committed as
`stryker-runs-114.json` on `experiment/stryker-cost` at
[`b8ce094`](https://github.com/mephistopheles4/stacks/commit/b8ce094), also throwaway.
The initiative is written up publicly at
[aymandiab.com/work/ai-robustness-gates](https://aymandiab.com/work/ai-robustness-gates/).

**Repo figures in this spec were measured at `1d0548f` and `25b007b`.** Where a figure
is load-bearing it ships with the population it was measured over, per the rule
[`gaming-analysis.md`](gaming-analysis.md) records.
