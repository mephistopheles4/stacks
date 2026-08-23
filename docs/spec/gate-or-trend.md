# Gate or trend — where a new check lands

Source: [#112](https://github.com/mephistopheles4/stacks/issues/112), with the
scoreboard half from [#118](https://github.com/mephistopheles4/stacks/issues/118)
and the final table placement from
[#141](https://github.com/mephistopheles4/stacks/issues/141).

**This is the most reusable thing the effort produced.** Everything else in this
spec is an application of it, and it decides where any _future_ check lands —
including checks nobody has thought of. Read it first.

**Audience: both.** The two clauses are properties of a check, not of this
repository. ⚠️ **One of them turned out to be tree-size-sensitive**, which is a
discovery about the taxonomy that #112 could not make from inside itself; see
[§7](#7-clause-a-is-tree-size-sensitive-and-that-was-found-rather-than-designed).

---

## 1. The rule

**A check is a gate if both clauses hold. Otherwise it is a trend. The taxonomy
is binary — there is no third column.**

> **Clause A — a gate's red has a named, reachable remedy.**
> When it goes red, nobody has to argue about what to do next. There is a
> finite, specific diff that clears it: upgrade the dependency or write an
> `ignoreGhsas` entry; fix the flagged code or dismiss the alert with reasoning;
> fix the doc or fix the command.
>
> **Clause B — a gate's verdict does not depend on how much test code exists.**
> A check you can turn green by adding assertions rather than by changing
> behaviour is not a gate here, because the cheapest route to green is the route
> that buys nothing.

**"Unarguable" means _the response is unarguable_, not _the answer never
moves_.** Determinism is out as a criterion, and the repo already knew it:
`.github/workflows/gates.yml` says of `audit` that it is _"the one gate whose
result can change without the code changing — an advisory published tomorrow
turns yesterday's green commit red. That is the point."_ CodeQL has the same
property. **Two of the three blocking checks on `main` are non-deterministic
given the commit, deliberately.** What those two carry instead is a remedy that
survives the non-determinism.

A mutation score of 71.4% has no named remedy. _"Write better tests"_ is not a
diff. That is the real reason it cannot be a gate, and it would hold even if
Stryker were free and perfectly deterministic — which
[#109](https://github.com/mephistopheles4/stacks/issues/109) and
[#114](https://github.com/mephistopheles4/stacks/issues/114) established it is
not, then almost is.

### Clause B does the sorting

All 35 pre-existing rows pass it: you cannot make `adapter-boundary` green by
writing tests. And it splits the two metrics this effort is about rather than
lumping them together —

- **Mutation score passes.** A test that kills no mutants moves the number zero.
  This is precisely why the repo's standing ban is on _coverage percentage_ and
  not on mutation score.
- **A changed-lines coverage floor fails.** Diff-locality changes **where** the
  measure applies, not **what kind** of measure it is. You still raise it by
  adding tests that execute lines.

That second line is why [`no-coverage-floor.md`](no-coverage-floor.md) exists and
why nothing in this spec has a coverage number in it. **Clause B is
surface-independent by its own text** — it does not become true at a different
enforcement point — which is what made _floor_ an unbuildable word rather than a
contested one.

### ⚠️ The honest limit of the rule

**Clause A is judgment-laden and Clause B is not.** _"Is there a named remedy?"_
has an arguer's escape in it: somebody determined to gate a metric can always
assert a remedy exists. Clause B is mechanical and does the actual sorting;
Clause A explains _why_ the sorting is right and catches the case Clause B
misses. **A future check that passes B and is argued through A should be treated
as suspect, not as classified.**

---

## 2. Trends are obliged to reach a person, and only silence is red

**A trend must name a reader and a cadence, and the delivery of the series must
be checkable. The series is never red; its absence is.** The named reader here
is the maintainer.

That threads both of the effort's standing constraints without a fudge:

- **Nothing acts on a metric movement**, because movement is structurally
  incapable of being red — there is no threshold anywhere for it to breach. The
  only automated verdict in the trend layer is _"did a number arrive at all"_,
  which is not a judgment about the code.
- **It refuses "a trend has no teeth"**, which this repo cannot afford. _A rule
  nothing can fail on is a comment_ applies to the instrument as much as to the
  rule. An unread dashboard and a deleted one are the same artifact.

**So the pipe is gated and the number is not.** A trend layer's characteristic
failure is not a bad number — it is **silence that looks like health**, which is
this repo's oldest enemy: all six documented claims in
[`docs/gates.md`](../gates.md) §_"Why this file exists"_ were silence that looked
like health. Two mechanisms for it were measured on this effort and both are
carried in [`trend-layer.md`](trend-layer.md): Pushgateway strips timestamps by
construction and never forgets a series, so a dead nightly draws a **confident
flat line**; and **GitHub disables scheduled workflows in public repos after 60
days of inactivity**.

**A third term — _report_, for a per-PR informational number — was considered and
refused.** The two existing words are already used loosely across `docs/` and the
public write-up, and a third does not sharpen a vocabulary that is not holding
two; the properties that matter do not distinguish them (_does it block?_ no,
both; _must it reach a person?_ yes, both), and what differs is delivery, which
is plumbing rather than vocabulary; and
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) transposes
exactly — a third name is a third thing to keep true.

⚠️ **The cost, recorded rather than hidden: _trend_ becomes the name for the
whole not-a-gate column, including things that do not trend.** An ill-fitting
word doing correct work. If it grates later, **the fix is to rename the column,
not to split it** — _instrument_ and _signal_ are both available.

---

## 3. Three enforcement surfaces, not two

The owner extended the effort's standing constraint here, and the extension
**narrows** it rather than breaking it.

> **Nothing acts on a metric movement unprompted; a deploy you invoked may
> refuse to proceed and tell you why.**

`pnpm deploy:site` is invoked by a human, from `main`, and already refuses on
four gates and on any branch but `main` — so a refusal there lands in front of a
person by construction, which is the failure the constraint was written against.

| Surface                                               | Kind     | Red when                                                                        |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| the `gates` aggregator on a pull request              | gate     | a contract broke                                                                |
| CodeQL, via the ruleset's `code_scanning` rule        | gate     | a new alert at high or above                                                    |
| `pnpm deploy:site`                                    | **gate** | a floor is breached, a record is stale, or a declared scope produced no mutants |
| the nightly score reaching the maintainer's dashboard | trend    | never — only its own silence                                                    |

⚠️ **The clause that used to sit here — _"a refusal lands in front of a person
because `deploy:site` carries `--any-branch` as its written override"_ — was
wrong about why, and [#147](https://github.com/mephistopheles4/stacks/issues/147)
measured it.** Being _written down_ is not what lands a refusal in front of
somebody. `scripts/deploy.ts` carries roughly a dozen refusals outside
`--skip-gates`'s reach and four inside it, and the file says so nowhere; the
three metric refusals in this spec are placed outside every flag's reach on the
merits ([#140](https://github.com/mephistopheles4/stacks/issues/140)). **What
actually lands a refusal in front of a person is that `deploy:site` is
human-invoked.** That alone, and it is enough.

**A merge is still never blocked by a metric, and the number itself is still
never red.**

---

## 4. What the `gates` aggregator may depend on

**The aggregator's job list is not the operational definition of a gate, and the
repo already proves it.** The live `main-protection` ruleset requires exactly one
status context, `gates`, _and_ carries a `code_scanning` rule at
`security_alerts_threshold: high_or_higher`. **CodeQL blocks a merge and is not
in the aggregator.** A gate lives outside it today, before this spec adds
anything.

The aggregator still earns its own rule, and it is a property of _required
checks_ rather than of gates:

> **`gates` may depend only on jobs triggered by the change under test.**

A nightly can never be in it — not because it carries a trend, but because a
required check whose verdict came from a different commit is reporting about code
that is not there. Same family as the existing never-path-filtered rule: **a
required check that does not report for _this_ commit is worse than absent,
because it looks like a verdict.** This is why
[`trend-layer.md`](trend-layer.md) puts the nightly in its own workflow and
leaves `gates.yml` untouched.

---

## 5. `docs/gates.md` admits trends — and holds them by not scoring them

**Yes, admitted.** Four reasons, and the first is decisive: **mutation testing is
already a row in that file**, in _"Not gated, deliberately"_, carrying the
explicit revisit condition _"Revisit once the rows above are green"_ — and this
effort **is** that revisit. Answering no means the outcome of a revisit is to
delete the thing from the file that scheduled it, against the file's own **mark,
do not delete**. Beyond that: a second document is exactly what
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md) refused; _"keyed
on rules that go red"_ is already untrue of a file carrying a CI-only table, a
_Not gated_ table and a triage procedure; and silence would overstate the
protection, which is the failure the file exists to prevent.

**A trend consumes no row number and carries no status.** What gets a number is
the ordinary gate that watches the trends table. **`gates/constitution-scoreboard.test.ts`
(G19) is not edited at all.**

Two mechanical facts decided that, read out of the gate rather than assumed:

- `allowedStatuses()` reads the **Status key** table at runtime, so **adding a
  fourth symbol widens the accepted vocabulary for all 35 rows at once** — a
  one-line weakening of everything.
- `TABLES` is a hardcoded three-element list feeding `slugByRow()`, while
  `scoreboardRows()` regex-matches `| **G\d+** |` across the whole file. **A
  numbered row in a fourth table gets status, uniqueness, gapless and
  spec-exists checks and no slug checks at all** — scored-looking, half-checked.

⚠️ **The rejected shape is recorded rather than merely unchosen**: numbered trend
rows in a fourth table with a fourth status symbol was the tempting design, and
both of its costs are gaming categories occurring inside the file that scores
this repo's rules. See [`gaming-analysis.md`](gaming-analysis.md).

### The Trends section

Lands **immediately before `## Triaging a CodeQL finding`**. Its stated
neighbour, `## CI-only gates`, is removed by
[`supply-chain.md`](supply-chain.md); the grouping argument survives its anchor
because it was never about that table — it is about keeping unnumbered things
below numbered ones, so a reader scanning for ✅ never meets a row without one.

Four series, no verdicts, five facts each:

| Trend                  | Measures                                                                | Cadence | Reader                            | Silence watched by        |
| ---------------------- | ----------------------------------------------------------------------- | ------- | --------------------------------- | ------------------------- |
| `mutation-score`       | killed ÷ total, per declared scope                                      | nightly | maintainer, at `pnpm deploy:site` | `metrics-freshness` (G38) |
| `gate-suite-runtime`   | wall-clock of `pnpm test`                                               | nightly | ”                                 | ”                         |
| `mutation-run-runtime` | wall-clock of the Stryker run                                           | nightly | ”                                 | ”                         |
| `live-exclusions`      | declared exclusions that produced ≥1 **executed** mutant, of N declared | nightly | ”                                 | ”                         |

The **Measures** column earns its keep immediately: `mutation-score` spelled
_killed ÷ total_ puts §6's unclosed vector in front of the reader instead of in a
closed ticket.

⚠️ **A hazard this section creates, closed in the new gate rather than in the
green one.** A `Trend` column of names is invisible to `slugByRow()`, which reads
only the three hardcoded `TABLES` — so a trend named identically to a gate slug
collides **silently**, and _"a name that names two things names neither"_ would go
unenforced in exactly the place this spec added. **G36 (`trend-layer`) asserts
trend names are kebab-case, unique among themselves, and disjoint from every gate
slug.** G19 stays untouched.

---

## 6. What the rule does not close

**Mutation score is still gameable, by adding trivially-killable code.** The score
is killed ÷ total, so shipping easy mutants dilutes the denominator upward. This
is not the coverage failure mode and **neither clause closes it**. Any floor
resting on mutation score inherits it — see
[`the-ratchet.md`](the-ratchet.md) §_Gaming categories_, where it is carried as
an open weakness rather than as a solved one.

---

## 7. Clause A is tree-size-sensitive, and that was found rather than designed

The one place on this effort where the two audiences give **opposite** answers to
the same question, and it is a finding about the taxonomy rather than a
divergence in taste.

Put Clause A to the `audit` job — _does its red have a named, reachable remedy, a
finite diff nobody has to argue about?_

- **In stacks: yes.** Small tree, a fix usually exists, and when it does not the
  `ignoreGhsas` hatch is one line. It is a **gate**, and it is required.
- **In a large production tree: often no.** A daily advisory four levels down,
  unfixable, blocking every unrelated merge — a red with no reachable remedy,
  which by Clause A's own text makes it a **trend**: scheduled, reported to a
  person, never blocking.

**The same check, opposite classification, explained by criteria decided here for
a case they were not written for.** What flipped it is **tree size**, and naming
that is the point: rendered as a verdict pair (_stacks: gate / production:
trend_) it reads as a tuning parameter, which deletes the finding.

The three other places the audiences invert are named where they arise —
[`the-ratchet.md`](the-ratchet.md) carries two, [`trend-layer.md`](trend-layer.md)
one — and the reason they are written as derivations rather than as a convention
on every decision is in
[`after-the-scoreboard.md`](after-the-scoreboard.md#the-four-inversions).
