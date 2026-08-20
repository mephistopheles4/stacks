# The register gate found a row nobody triaged

**2026-08-20.** Three rows in one commit — **G40 `action-pins`**, **G41
`gate-register`**, **G42 `dependency-audit`** — out of
[#162](https://github.com/mephistopheles4/stacks/issues/162), against
[`docs/spec/supply-chain.md`](../spec/supply-chain.md) and
[`docs/spec/gaming-analysis.md`](../spec/gaming-analysis.md) §§2–3.

The bundling was forced rather than chosen. `gate-register` shipped alone is red
on every row that has no entry — *a gate that has never passed*, not one observed
failing on a real defect — and shipped against stub entries it is green over
empty sections, which is the category-4 failure built into the artifact about
category 4. So it lands with the first new row it can go red on, and one commit
discharges three obligations: the landing rule, the supply-chain triage
obligation, and the observed-red rule.

## The first red was not planted

`gates/gate-register.test.ts` was run against the tree the moment it compiled,
before a single row had been added. It reported:

```
G37 has 0 entries
```

**`agents-import` had landed from [#172](https://github.com/mephistopheles4/stacks/pull/172),
outside this rollout, with no register entry** — 37 entries standing against 38
rows. Nothing had noticed, because until that run nothing could: the register was
a second copy of the row list with nothing holding it to the first, which is the
exact failure `docs/gates.md` opens by listing six instances of.

That is the field `CONTRIBUTING.md`'s oldest rule asks for, arriving without a
plant. The backfilled entry is in the register, and it says in terms that it is
a backfill: **the rollout's rule is that every gate landing before
`gate-register` writes its observed-red line at landing, and G37 did not.**
`docs/gates.md` carries no `## G37` narrative at all, so its three plants were
run on 2026-08-20 by the session landing G41 — *the decay category arriving
inside the artifact built to catalogue it*, written down rather than smoothed
over.

## Three things the specs got wrong about the tree, all measured

Each was one query away, and the standing rule that produced them is
`gaming-analysis.md` §4's: **the roster is derived, never remembered.**

**The row numbers are all one low.** Every ticket in this rollout pre-allocated
numbers from a 35-row base; `agents-import` took G37 out-of-band, so the roster
shifted by one. `docs/gates.md` was 38 rows, G1–G38, gapless. The ticket's
literal acceptance criterion says the audit prose lands under a named
`## G41 —` heading; it landed under **`## G42 —`**, because the number is derived
from landing order and never chosen.

**The merged-verdict exemption is ten rows, not one.** `gaming-analysis.md` §2
specifies a single exemption for G26's `**Vacuous green / decay**` bullet. §4 of
that same file records *"ten rows collapsing five verdicts into one line."*
Measured: G12, G17, G20, G21, G22, G23, G24, G25, G26 and G34. Exempting only
G26 would have landed the gate red on nine band-authored entries, and the two
ways out of that are both refusals — weaken the rule, or rewrite nine verdicts §1
says are *"marked in place, not split."* The list is widened to the measured
population, closed there, and **reverse-asserted in both directions**: a merged
bullet on an unlisted row is red, and a listed bullet the file no longer carries
is red as a stale permission.

**"Exactly one disposition per entry" is false 19 times.** Ten triage-only rows
carry none, two say their nomination did not survive, two rollout rows
disposition inline, and four carry two because a band and a later decay re-read
each reached one. The gate asserts the **closed vocabulary** instead, which is
the plant §8 actually names. Asserting the false stronger claim would have been
the failure, not the fix.

⚠️ **None of these is corrected in the locked spec files.** They are recorded in
the register entries, on G38's precedent — a reader checking the spec's roster
against the file finds an account of which is current, rather than two documents
disagreeing in silence.

## The floor is right for a different reason than the spec gives

`gaming-analysis.md` §3 sets the row-side floor at **42** and calls it *"the row
population after this spec lands"*, flagging loudly that *a floor equal to a
population* is the shape that went wrong in the supply-chain piece.

Under the spec's own numbering that floor would have been **red at landing**:
`gate-register` lands three rows into a 35-row file, at 41, and the ratchet's row
brings it to 42 afterwards. The out-of-band G37 shifted everything by one, and 42
is now the population at **this row's own landing commit** — right number, wrong
justification. It is safe only under the monotonicity argument, mark-never-delete
plus gapless making the count non-decreasing, **and a session copying the pattern
without that argument copies the mistake.**

## What the roster read changed

The reading obligation was discharged by query before any gate code was written —
every entry disposed `gated` (G6, G7, G29, G30, G35) and every entry carrying a
named-unbuilt remedy, then the routing-around verdicts of each row sharing a
mechanism. **Three of them changed what got built**, which is the answer to
whether the obligation is paperwork:

- **G19's** *"a real path sat outside the allowlisted roots and was invisible to
  the checker"* and **G14's** demonstrated *single regex against one named file*
  are why `action-pins` walks `.github/**/*.yml|yaml` rather than naming its two
  workflows. **G6's** named-unbuilt remedy is the one that nearly repeated here —
  a proposal saying *scan tracked `.ts`* in a tree holding `.mjs` and `.astro`.
- **G29's** honest limit — *"a form nobody writes here is a form this does not
  see"* — is **closed rather than inherited**: a register entry written as
  `## G40` instead of `### G40` would read to a human as real and be invisible to
  the sweep, so every near-miss heading level is refused outright.
- **G1's** *"the reverse-assert catching both a stale entry and a dropped one"*
  and **G22's** *"had no stale-entry assertion, which ADR-0022 requires"* are why
  the ten-row exemption list is asserted in both directions rather than one.

## The audit row asserted nothing, and now asserts four things

`dependency-audit` was promoted out of `## CI-only gates`, a table
`gates/constitution-scoreboard.test.ts` **structurally cannot read** — its
`TABLES` constant names three tables and that was not one of them. But promotion
alone is *visibility, not enforcement*: `specPathsNamed()` only existence-checks
`.ts` paths, and the row names none, so **deleting the `audit` job and its
`needs:` entry would have left the ✅ standing.**

The teeth went into `gates/action-pins.test.ts`, which was already reading that
workflow: the job exists, it runs `pnpm audit --audit-level=high`, the `gates`
aggregator lists it in `needs:`, and the aggregator tests its `result` against
`success`. That last one is not decoration — comparing against `'failure'`
instead lets a **skipped or cancelled** audit through.

⚠️ **The row now has two observed-red lines and they are different failures.**
2026-08-08 is the job going red on a real advisory, unplanted. 2026-08-20 is the
row going red on the job disappearing, which is the assertion that did not exist.

## The hatch nobody triaged

`auditConfig.ignoreGhsas` is the escape hatch every other hatch in the
supply-chain spec is modelled on, and the triage pass never reached it: it read
its row list from the file, and when it ran the file held 35 rows. The verdict is
owed on the commit landing these rows, and it is written into the register.

Measured: **the hatch has zero live entries** — the whole `auditConfig:` block in
`pnpm-workspace.yaml` is commented out. ⚠️ **The exposure is not the entries; it
is that the rule governing them is a comment.** Uncomment the block, add an id
with no date and no reason, and nothing goes red — no gate reads that file's
audit config at all. `docs/gates.md`'s own opening line is the judgement: *a rule
nothing can fail on is a comment.* `accepted`, with the remedy named: gate the
**shape** of the first real entry when one lands, two-sided, because the id alone
is satisfiable by deleting the justification.

## What is not held

`action-pins` proves every third-party action is referenced by something **shaped
like** an immutable ref and that every one carries a version claim. **It cannot
prove the claim is true.** A hand-edit swapping in a different valid SHA under
`# v7.0.1` passes cleanly — `cover_source`'s failure verbatim. The fact lives at
GitHub, G21 forbids the suite from asking, and **actions have no lockfile**, so
there is no offline route. The limit is written beside the row in
`docs/gates.md` *and* in the spec's header comment, because G19 does not read
spec comments and the reverse is also true.

`SECURITY.md` gains the distinction that falls out of it: a claim living
**outside the tree entirely** goes wrong by being switched off while every file
still says it is on; a claim living **in the tree, asserting a fact that lives
outside it** goes wrong while every check stays green. No second named tier was
minted — one member when it was written, and a taxonomy invented for one case is
the shape this repo distrusts.

## Evidence

**26 plants, all behaving as expected**, run against the specs alone:

| Gate | Plants |
| --- | --- |
| G40 / G42 | 15 — the spec's seven §9 ways, both G42 teeth ways, and six more (`# latest` against a non-empty check, both floors, the `jobs:` block renamed, `../` refused, and `./` still green as its control) |
| G41 | 12 — every way `gaming-analysis.md` §8 names, plus two near-miss forms it does not |
| G37 | 3 — backfilled, planted at register landing rather than at row landing |

## Two holes a plant table could not have found

**The spec-axis review found both, and they are one species: a gate reading
*one* spelling of a field the file writes *several* ways.**

- **The disposition check required a colon.** The register writes that field
  three ways, and one address writes `Disposition \`gated\`.` with none — so the
  check read 29 instances and was blind to the thirtieth. **A fifth disposition,
  written in a spelling the file itself already uses, passed green.** It landed
  on the one assertion that survived the retreat from *exactly one disposition
  per entry*, which is the whole of that clause.
- **The near-miss heading check read the heading *level* only.** `### G99 —
  action-pins`, without backticks round the slug, is invisible to the
  correspondence sweep **and** passed the check whose own comment said *"the
  near-miss forms are refused outright."* A docblock whose stated reach exceeded
  its assertion's — inside the gate built to catalogue that failure.

⚠️ **Neither was reachable from the plant tables, and the reason generalises.**
`gaming-analysis.md` §8 asks for the wrong *value* in each case and duly gets a
red; **no row asks for the right value in an unexpected *shape*.** A plant table
inherits its author's picture of what the file looks like, and both holes lived
exactly where that picture was wrong. **That is the argument for a fresh-context
reviewer over a longer table** — the same finding the register already records
about G20, where the author planted a defect the file could never have had and
the false green survived it.

Both closed, both planted red, and the second closed structurally: one
`ENTRY_HEADING` pattern now feeds the sweep and the refusal, so the two cannot
drift apart again. The `./` exemption was narrowed in the same pass — it had
accepted `../` where the spec says `./` and nothing else, at zero instances
either way, because **an exemption widened past its written scope is the
category-1 move whatever its population.**

**The G41 plants were run twice, and the second run is the one that counts.**
This commit sits on top of `metrics-freshness`
([#161](https://github.com/mephistopheles4/stacks/issues/161)), whose G39 row had
not landed when the gate was written — so the branch stood deliberately red on
two assertions (G19's gapless check, and G41's own floor of 42 against 41 rows),
and a placeholder row and entry stood in to run the plants at all. **Rebased onto
the real row once it landed: 795 of 795 green, and every plant re-run and
behaving.** ⚠️ **A plant run against a stand-in is evidence about the stand-in
until somebody re-runs it**, which is why the first pass is recorded rather than
quietly replaced.

The top-row claim in particular is now measured without a stand-in: with the
highest-numbered row's id mangled, `gates/constitution-scoreboard.test.ts` runs
**14 passed, 0 failed** — gapless does not fire — while mangling an interior row
fires it by name. **The floor is the only structural check in the file that sees
it**, which is exactly why it sits on the row side.

⚠️ **One plant faked a pass and was caught by checking the run count.** A vitest
`-t` filter passed as part of an argv string matched nothing, and *14 skipped*
reported as green — on the plant whose whole job was proving G19 stays green.
Re-run without the filter, the claim held: **top-row deletion leaves all 14 of
G19's tests passing**, while deleting an interior row fires gapless by name. The
guard is now in the harness: a run reporting only skips is an error, not a
result.
