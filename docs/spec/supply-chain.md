# The supply-chain posture — two rows and one written limit

Sources: [#124](https://github.com/mephistopheles4/stacks/issues/124) (the two
rows), [#148](https://github.com/mephistopheles4/stacks/issues/148) (the exemption
and the floor).

**This piece arrives already built.** SHA-pinned actions, the `audit` job, the
`ignoreGhsas` hatch and CodeQL are all in the tree; the owner ruled the posture into
scope so the spec records it rather than leaving it undescribed. **Charting then
found that nothing in this repo reads `.github/`**, so one third of it is a
documented convention rather than an enforced rule — which is why it earned a
section instead of a paragraph.

**Audience: both, and the two invert on one question.** See
[§6](#6-two-audiences-and-the-audit-job-inverts).

---

## 1. The correction that reframed the piece

The charting note said the `audit` job is *"gated in CI, absent from the file that
claims to score what is gated."* **It is not absent.** `docs/gates.md` records it
under **CI-only gates**, with a table, the escape hatch and the `minimumReleaseAge`
lesson.

**The true version is worse.** `gates/constitution-scoreboard.test.ts` reads exactly
three tables:

```ts
const TABLES = ['Invariants → gates', 'Contract seams → gates', 'Defect gates'] as const;
```

So the audit gate is recorded in **a table G19 structurally cannot see**: no row
number, no slug, no status, no gapless claim, no correspondence asserted in either
direction. **Delete the `audit` job tomorrow and the aggregator's `needs:` breaks
loudly — while the paragraph describing it sits there green and false.**

⚠️ **A stale-claim specimen reached by a route no other took**: not *a claim that
went wrong*, but **a claim recorded outside the reach of the gate that exists to hold
claims to reality** — found by reading the gate's own constant rather than its prose.

⚠️ **And the symmetry is the finding, not a side note: both possible answers to the
headline question landed in a table G19 cannot read.** Yes → a numbered row. No → a
row in *"Not gated, deliberately"*. **The question could not be answered into the
scoreboard's checked surface at all until the audit row was promoted alongside it**,
which is why these are one decision and not two.

---

## 2. G39 `action-pins` — *Contract seams → gates*

**SHA-pinning gets a gate.** Not because the risk is high at one contributor — it is
not — but because **the alternative has a name this effort supplies: *a preference
with good documentation*.** `.github/workflows/gates.yml` argues the case carefully
(*"A tag is mutable: whoever controls the action repository can repoint v7 at
anything, and it would run here with the workflow's token"*) and **nothing holds the
file to its own argument.**

⚠️ **This reverses no recorded decision.** Unlike the changed-lines floor,
SHA-pinning does not appear in *"Not gated, deliberately"*. **This fills a hole; it
does not outvote a written rejection**, and the spec does not adopt the defensive
register the other two refusals legitimately need.

**The table was forced by elimination, and one elimination is a scope boundary:**

- ***Invariants → gates*** requires a Source cell citing `invariant N`, which G19
  checks in **both** directions. SHA-pinning protects none of the five, **and minting
  a sixth is redrawing the constitution — out of scope.**
- ***Defect gates*** describes rows that exist because a specific defect got through.
  **None did.** It would be another stated exception to a clause that already carries
  ⚠️ **eight** — see [§4](#4-the-exception-count-is-eight).
- ***Contract seams → gates*** — *"a correspondence between two artifacts that
  nothing verifies. Red means the two have drifted."* **The seam is `gates.yml`'s own
  pinning paragraph ↔ every `uses:` line under `.github/`.** That is the definition
  almost verbatim.

**`.github/` is perfectly readable** — `trackedFiles()` includes it and nothing
structural stops a spec reading `gates.yml`. **The absence is a choice, not a
capability limit**, which removes the only available excuse for the hole.

### The rule — stated over the pin and the comment together

The bind: it must not go red when Dependabot bumps both, and must not be satisfiable
by deleting the comment.

1. **The pin.** Every `uses:` naming a third-party action resolves to
   `owner/repo[/subpath]@<40 lowercase hex>`. A tag or a branch is red.
2. **The comment.** That line carries a trailing `# v<digits>[.digits…]` —
   **version-shaped, not merely non-empty.** This is the clause that closes the hole:
   **deleting the comment to satisfy clause 1 goes red.**
3. **The sweep is `.github/**/*.yml|yaml`, not `.github/workflows/`.** The
   routing-around answer: a second workflow, or a composite action under
   `.github/actions/`, in a directory a narrow glob never looks at. Sweeping the whole
   tree costs nothing today and needs no edit when the second file arrives — **and the
   trend layer adds one**, `metrics.yml`.
4. **One exemption: `uses: ./…`** — a local composite action **has no third party to
   pin.** Definitional, so unlike the withdrawn one it cannot turn out to be wrong. It
   has zero instances today and that objection does not transfer: dropping it would
   mean a false red on something genuinely unpinnable.

⚠️ **Clause 2 is a real bet, recorded as a cost rather than left implicit.** It pins
the *shape* of Dependabot's comment; if Dependabot ever emits `# 7.0.1` without the
`v`, the gate goes red on a bot commit. **Judged acceptable** — a one-character diff,
and a gate that goes red on an unexpected format change is behaving correctly — **but
it is a bet.** Measured rather than assumed against `93730e1` (`dependabot[bot]`,
`# v6.0.9` → `# v6.0.10`): pin and comment rewritten together, both occurrences.

### The withdrawn exemption: the axis is mutability

⚠️ **`docker://…` was exempted and is withdrawn, not restated.** **This repo uses
Docker for nothing** — no Dockerfile, no compose, no devcontainer, no container
action, checked against `git ls-files` and `git grep`; the only `docker` string in the
tree is a transitive `is-docker@4.0.0`. **So the population that clause exempted is
zero.**

**Any `docker://` line is red.** `docker://alpine:latest` is a **mutable third-party
reference**, which is precisely what `gates.yml` argues against, and the justification
given for exempting it — *"not a git ref at all"* — **is a judgement about syntax.**

⚠️ **A restatement over mutability was specified and declined.**
`docker://image:tag@sha256:<64 hex>` is a real accepted form, so the option was
buildable rather than hypothetical. It was declined because **it buys nothing refusal
does not**: the difference is only what happens when the first real docker reference
lands. **Under a pre-written rule it lands green or red silently; under refusal
somebody argues it out with an actual instance in front of them** — and *an exemption
that arrives with a legitimate first instance gets argued about; one written into the
spec before any instance exists never does.*

**The reasoning stays on the record, which is what pre-declaration was actually
for.** The spec carries the axis, what was specified, why it was withdrawn, and what
the first legitimate `docker://` reference has to win. **The rule stays unwritten until
there is something to write it against.**

⚠️ **A consequence worth having: §3's claim that *every third-party action is
referenced by something shaped like an immutable ref* was going to become false the
moment a `docker://` line landed, with nothing going red.** Under this resolution it
stays true.

### The vacuity floor

> `expectFound(usesLines, …, 4)` — **4, against the 7 `uses:` lines present at
> [`25b007b`](https://github.com/mephistopheles4/stacks/commit/25b007b).** A loose
> anti-vacuity bound in this repo's idiom, **not a deletion tripwire**.

⚠️ **The deletion case was never a floor's job.** No `expectFound` in this repo has
ever caught deletion — all 38 call sites are loose lower bounds against a glob
silently matching nothing, and `doc-links.test.ts` floors at 180 local links and would
not notice 300 being deleted either. **What goes red when the `audit` job disappears is
the clause in [§3](#3-g41-dependency-audit-in-defect-gates) asserting that job and its
place in the aggregator's `needs:`.**

**4-of-7 is this repo's own ratio**: `gates/commands.test.ts` floors at 4 against seven
CLI subcommands; floors here run at roughly a third to a half of population.
`gates/repo.ts` defaults `atLeast = 1`, so **an unstated floor is a floor of one** —
*"a floor"* was never a decision; **the number is**, and it now ships with its
provenance rather than with a wrong one. **Raising it to 7 was declined**: it would go
red on any legitimate removal and duplicate a clause that already exists.

⚠️ **The population claim goes in the spec header comment and in G39's register entry
— never in a `docs/gates.md` row.** The register entry carries a **date** by
construction, which is what stops a measured population becoming the next decay
specimen; and adding a stale-able count to the file already caught carrying two would
be the joke writing itself.

---

## 3. G41 `dependency-audit`, in *Defect gates*

**The `audit` job is promoted to a numbered row.** It follows G16 (`books-in-case`)
exactly: it names a **mechanism** rather than a `gates/*.test.ts`, so it **declares**
its slug and self-exempts from the derivation rule.

**It arrives with a real observed-red line already in the file** — **2026-08-08, two
advisories**, one of which `pnpm update nanoid` silently declined under
`minimumReleaseAge`. The field the register makes **required** on every entry is
satisfied from history rather than from a promise, which is not true of most rows.

**`## CI-only gates` is removed; nothing is deleted.** The **table** becomes the row
and the prose survives under a named `## G41 —` heading, carrying the parts that are
actually load-bearing: the `minimumReleaseAge` lesson and *"reach for that hatch
second, and only after checking whether a fix exists."* **Mark-never-delete governs
*rows*, and this table was never scored**, so there is no retirement to record. Same
resolution the file already uses for G2, G25 and G28.

### ⚠️ G41 as first written was a row nothing can fail on

**The correction that matters most in this piece.** Delete the `audit` job *and* its
entry in `needs:`, and CI is green, `pnpm test` is green, and the ✅ still stands —
because `specPathsNamed()` only existence-checks `.ts` paths, and G41 names no spec
file. **Promoting a claim into the table G19 reads is *visibility*, not
*enforcement***, and §2's own argument applied asymmetrically would have shipped this
effort's subject matter inside the effort.

**Closed inside G39's existing sweep at no new cost.** The same spec asserts:

- a job named `audit` exists in `gates.yml`, and
- it runs `pnpm audit --audit-level=high`, and
- the `gates` aggregator's `needs:` includes it and tests its `result` against
  `success`.

⚠️ **That also gives G41 the observed-red line it actually lacked. 2026-08-08 records
the job going red on an advisory, never the row going red on the job disappearing, and
those are different failures.**

### The `ignoreGhsas` handoff did not land, and saying it did would have been the failure

The triage pass reads the row list **from the file**, which is right — and **when it
ran the file held 35 rows, not 42**, because this effort decides and does not build.
**So `auditConfig.ignoreGhsas` — the hatch every other hatch in this spec is modelled
on — was triaged by nobody.**

> **Spec obligation: G39 and G41 are triaged against the five categories in the commit
> that lands them.** This is **not** discharged by the triage pass.

⚠️ **A handoff that reads as delivered and delivers nothing is category 2 arriving in
the coordination between two tickets instead of in a gate.** It was predicted from one
end, noted on the other, and it still happened — which is why it is written as an
obligation rather than as an assumption.

---

## 4. The exception count is eight

⚠️ **The exception count was wrong twice, in opposite directions, inside one
resolution**: G39 was excluded from *Defect gates* for being *"a **sixth** stated
exception"*, and G41 was placed there *"as the **fifth** stated exception."*

`docs/gates.md:299-304` names **seven** — G17, G18 and G22 in one clause, G20, G23,
G24 and G25 in the other. **So either row would have been an eighth.**

**Nothing moves.** G39 stays *Contract seams*, G41 stays *Defect gates*, both keep
their numbers and slugs. **The correction reaches only the *why*** — the elimination
argument was *"this clause already carries too many stated exceptions"*, **which is
stronger at eight than at six**, so it survives the correction rather than depending on
it.

⚠️ **The miscount is carried as a specimen, not erased.** `docs/gates.md:306-309`
pre-warns against this exact class — *"A positional reference to a table that grows is
the same species as the count in the next paragraph"* — **on a line the miscounting
argument cited by number.**

---

## 5. What G39 cannot check — written in two places on purpose

The gate proves two things: **every third-party action is referenced by something
shaped like an immutable ref**, and **every one carries a human-readable version
claim.** It cannot prove the version claim is **true**. That `3d3c42e…` is `v7.0.1` of
`actions/checkout` is a fact living at GitHub, and **G21 forbids the whole suite from
asking.**

**There is no offline route, and this was checked rather than assumed.** Unlike
dependencies, **actions have no lockfile**; a vendored SHA→tag mapping would rot
exactly like the numbers this effort is about. **The limit is structural.**

So a hand-edit swapping in a *different valid SHA* while leaving `# v7.0.1` in place
**passes G39 cleanly.** ⚠️ **That is `cover_source`'s failure verbatim** — *"swapping
the bytes under a note that still says `apple-books` is the one way this key can state
something false, and it is the only failure here nothing would notice."*

**Written beside the row in `docs/gates.md` *and* in the spec's header comment,
duplicated on purpose.** The scoreboard is what a reader consults to learn what is
protected, and **G19 does not read spec comments** — a limit recorded only in the spec
is a limit only a reader of the spec finds. **The reverse is also true, which is why
both.**

**Not a separate row in *"Not gated, deliberately"*.** That table is for properties
with **no** gate at all; this is the **boundary of a gate that exists**, and splitting
one claim across two places is the second copy
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) objects to.

### `SECURITY.md`'s unverifiable clause is extended, not tiered

`SECURITY.md`'s *"relied upon and unverifiable"* is the most honest sentence in that
file, and G21 makes it structurally forced rather than a preference. But the category
grew, and its two members fail differently:

| | Repository settings | G39's version comment |
| --- | --- | --- |
| Where the claim lives | **nowhere in the tree** | **in the tree**, in a file a gate reads |
| What a clone can do | name it, and say it cannot check it | check its **shape**, never its **truth** |
| How it goes wrong silently | the setting is off and every file still says it is on | a valid SHA under a comment naming a different version |

**Adopt the formulation and add one sentence distinguishing *outside the tree
entirely* from *in the tree, asserting a fact that lives outside it*.** ⚠️ **A second
named tier is deliberately not minted**: it would have exactly one member today, and a
taxonomy invented for one case is the shape this repo distrusts. **If more members turn
up, the tier gets minted then, on evidence** — *a name earns its keep when it names two
things.*

⚠️ **A second member has since arrived from an unrelated direction.** G7's warrant —
*"`@astrojs/check` cannot run under TypeScript 7"* — has its truth-maker **outside the
repository**: `@astrojs/check` is not a dependency at any version, so **no run here can
contradict it and none ever could.** Recorded in
[`gaming-analysis.md`](gaming-analysis.md#4-what-the-deep-pass-found) rather than acted on
here, because minting the tier is a change to the scoreboard's own vocabulary and this
effort decides rather than builds — **but the evidence condition the decline named has
now been met, and the next session to touch this may mint it.**

> ⚠️ **Corrected 2026-08-23 by G46 (`astro-types`): this member left the tier,
> and *"none ever could"* was the wrong half of the claim to make.**
> `@astrojs/check@0.9.10` is now a dev dependency of `packages/site`, so the
> package **is** in the tree at a version and one `pnpm add` disproved a
> sentence written about every future state of this repository. **The narrower
> clause survives**: the tool is pinned to TypeScript 6.0.3 by
> [ADR-0066](../adr/0066-typescript-6-until-7-1.md), so no run here tests the
> TS 7 claim, and the truth-maker for *that* is still outside the repository.
> What is new is offline in-tree evidence, which the sentence never had:
> `@astrojs/check@0.9.10` declares `peerDependencies: { typescript: '^5.0.0 ||
> ^6.0.0' }` — the package's own manifest saying it does not support TS 7.
> Weaker than a run, stronger than prose.
>
> **The generalisable half.** *Nothing here can contradict it* was true and
> **cheap to make false**, and it was made false by a change nobody framed as
> touching this spec. A claim of the form *"no configuration of this repository
> could ever"* is a claim about a space, not a measurement, and it is the shape
> to distrust — the dated measurement beside it (`git log --all -S`, 2026-08-15,
> no commit) aged correctly and is still true of the history it describes.

**One consequential edit falls out either way.** `SECURITY.md` currently reads
*"Actions are pinned to commit SHAs. That is the mitigation; it is not immunity."*
**Once G39 exists that line is true and incomplete** — it must say the pinning is held
in shape by a gate, and name what the gate does not hold. ⚠️ **A security file that
under-claims after the fact rots the same way as one that over-claims, and it fails in
the direction nobody audits for.**

---

## 6. Two audiences, and the `audit` job inverts

| Piece | stacks | Transferable |
| --- | --- | --- |
| **SHA-pinning (G39)** | worth it as demonstration; risk low at one contributor | **universal, and more load-bearing** — more actions, more secrets, more people editing CI. Divergence to name: **org-internal actions**. `./` is theoretical here; there, *"we trust our own org"* is the live temptation, and **a separate mutable ref is a separate mutable ref** |
| **The hatch shape** — GHSA id + date + reason, one reviewable line | built | **the most transferable thing in the posture**, with the `minimumReleaseAge` lesson attached: reach for it second, because *"the command that looks like it remediated the advisory is the one that did nothing"* |
| **`--audit-level=high`** | justified by local-first, no server, no untrusted input beyond four metadata APIs | **the number does not transfer; the obligation to write its justification does.** A threshold inherited without its reason is a preference with good documentation |
| **"Relied upon and unverifiable"** | a genuine limit — no IaC, nothing to read | **shrinks.** With Terraform or org rulesets in the tree, branch protection *can* be gated. **Stacks' answer is the degenerate case of having no infrastructure**, and the spec says so rather than generalising a limitation into a principle |

### ⚠️ The inversion, and what flipped it

Put **Clause A** to the `audit` job — *does its red have a named, reachable remedy?*

- **Here: yes.** Small tree, a fix usually exists, and when it does not the hatch is
  one line. **A gate**, and required.
- **In a large production tree: often no.** A daily advisory four levels down,
  unfixable, blocking every unrelated merge — a red with no reachable remedy, which by
  Clause A's own definition makes it **a trend**.

**What flipped it is tree size.** The finding is not *"two answers"*; it is that
**Clause A is tree-size-sensitive**, which is a discovery about the taxonomy that
[`gate-or-trend.md`](gate-or-trend.md) could not make from inside itself.

---

## 7. Gaming categories

**Owed and not written as a discrete section**, and the grading pass returned that as a
finding about *form* rather than about *coverage*: #124 reasons about attack surface
throughout — the comment-deletion hole, the narrow glob, the exemption timing — **so
the argument belongs where the decision is made.** What it lacked is **the roster at the
end**, and the moment a roster was forced, it found the load-bearing hole in §3.

> **The transferable rule: the argument belongs where the decision is made; the roster
> belongs at the end.** Woven reasoning reaches the coverage a discrete section would;
> it does not reach the *completeness check* a roster forces.

The roster, assembled here:

**1 — Weakening.** The floor (4) can be lowered; the version-shape regex can be
loosened to *non-empty*, which restores the deleted-comment hole in one character; the
`ignoreGhsas` list is an allowlist and **every entry is a permission**, ⚠️ **triaged by
nobody** — see §3.

**2 — Satisfying the letter.** ⚠️ **The live one:** a valid SHA under a lying version
comment passes cleanly — §5, written in two places for that reason. And **G41 as first
written was pure letter**: a ✅ row asserting nothing, closed by folding the job
assertion into G39's sweep.

**3 — Routing around.** A second workflow or a composite action outside a narrow glob —
**closed by clause 3's whole-tree sweep**. ⚠️ **Not closed: nothing in this repo reads
what a workflow *does*.** `metrics.yml` can be edited in the same pull request that
moves the number it records; G39 covers the actions it calls, never its own body.

**4 — Vacuous green.** A glob that stops matching — workflow renamed, tree moved —
**closed by the floor**. ⚠️ **Shipping a vacuous green inside the effort about vacuous
green would have written its own joke**, which is why the floor is stated rather than
defaulted.

**5 — Decay.** The **Dependabot comment-format bet** (§2) — measured once at `93730e1`,
theirs to change. The **floor's population** — 4 of 7 at `25b007b`, which is why it
ships with its population and a dated register entry. ⚠️ **And the miscounted exception
count (§4) is itself a category-5 specimen**: a load-bearing claim about the tree
asserted from a prior reading rather than measured, **one `grep` away**, inside a
paragraph whose whole argument is that a claim about the tree must be measured.

---

## 8. What lands where

| Artifact | Change |
| --- | --- |
| `gates/action-pins.test.ts` | **G39** — four clauses, one exemption, the vacuity floor with its population in the header comment, **plus the `audit`-job-and-`needs:` assertions that give G41 teeth**, and the written limit from §5 |
| [`docs/gates.md`](../gates.md) | **row G39 (Contract seams)**, with G39's limit beside it; **row G41 `dependency-audit` (Defect gates, ✅, observed red 2026-08-08)**; **`## CI-only gates` removed**, its prose kept under a named `## G41 —` heading |
| [`SECURITY.md`](../../SECURITY.md) | the pinning line amended — held in shape by a gate, and what the gate does not hold; the *unverifiable* clause extended by one sentence |
| [`docs/gate-register.md`](../gate-register.md) | entries for G39 and G41 **and a category-1 verdict on `auditConfig.ignoreGhsas`**, all in the commit that lands the rows |
| [`CONTEXT.md`](../../CONTEXT.md) | **proposed**, not made: a **Vacuity floor** entry in its *Checking* section — 38 call sites across the suite, and its neighbour *Vacuous pass* already names the failure without naming the instrument built against it |

⚠️ **The `CONTEXT.md` entry is proposed rather than written** because the destination
is a locked spec, and because that file holds only terms **no gate pins down** — which
fits *vacuity floor* and excludes G39's own vocabulary (one exemption, one pin shape,
one withdrawn).

---

## 9. How it is proved able to fail

| Check | Plant this | Expect |
| --- | --- | --- |
| **G39** clause 1 | change one `uses:` to `@v4` | red |
| **G39** clause 2 | delete a `# vN.N.N` comment, leaving the SHA | red |
| **G39** clause 2 | write `# latest` instead of `# v4.2.2` | red |
| **G39** clause 3 | add `.github/actions/foo/action.yml` with an unpinned `uses:` | red |
| **G39** exemption | add `uses: ./.github/actions/foo` | **green** |
| **G39** withdrawn | add `uses: docker://alpine:latest` | **red** |
| **G39** floor | point the sweep at a directory with no workflows | red, not a vacuous pass |
| **G41's teeth** | delete the `audit` job and its `needs:` entry | **red in `pnpm test`** — this is the assertion that did not exist |
| **G41's teeth** | change `--audit-level=high` to `moderate` | red |
| **G40** correspondence | land G39's row without its register entry | red — **this is the commit that demonstrates it** |

⚠️ **What cannot be planted**: that a pinned SHA really is the version its comment
claims. **Marked reasoned, not demonstrated**, and it is the limit §5 exists to state.
