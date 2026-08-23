# A check is a gate or a trend, and the taxonomy is binary

**A check is a _gate_ if both clauses hold. Otherwise it is a _trend_. There is
no third column.**

> **Clause A — a gate's red has a named, reachable remedy.** When it goes red,
> nobody has to argue about what to do next. There is a finite, specific diff
> that clears it: upgrade the dependency or write an `ignoreGhsas` entry; fix the
> flagged code or dismiss the alert with reasoning; fix the doc or fix the
> command.
>
> **Clause B — a gate's verdict does not depend on how much test code exists.** A
> check you can turn green by adding assertions rather than by changing behaviour
> is not a gate here, because the cheapest route to green is the route that buys
> nothing.

The full derivation is [`docs/spec/gate-or-trend.md`](../spec/gate-or-trend.md),
which this record does not restate. What is here is the decision, why it is
binary, and the two things it costs.

## Why this needed deciding

Mutation scoring arrives ([ADR-0053](0053-stryker-measures-eight-declared-scopes.md))
and produces a number. `docs/gates.md` is the file that says which rules are
enforced. **Without a rule, every future number argues its own case** — and the
arguing happens once per number, in whatever mood the session is in.

So the rule is written before the numbers land, and it is written to decide
checks nobody has thought of yet.

## Why binary

**A third term — _report_, for a per-PR informational number — was considered and
refused.** The two existing words are already used loosely across `docs/` and the
public write-up, and a third does not sharpen a vocabulary that is not holding
two. The properties that matter do not distinguish them: _does it block?_ no,
both; _must it reach a person?_ yes, both. What differs is delivery, which is
plumbing rather than vocabulary. And
[ADR-0026](0026-constitution-is-gated-not-duplicated.md) transposes exactly — a
third name is a third thing to keep true.

## What Clause B sorts, and what Clause A only explains

**Clause B is mechanical and does the actual sorting.** All 35 pre-existing rows
pass it: you cannot make `adapter-boundary` green by writing tests. And it splits
the two metrics this effort is about rather than lumping them together —

- **Mutation score passes it.** A test that kills no mutants moves the number
  zero. This is precisely why this repo's standing ban is on _coverage
  percentage_ and not on mutation score.
- **A changed-lines coverage floor fails it.** Diff-locality changes **where** the
  measure applies, not **what kind** of measure it is. You still raise it by
  adding tests that execute lines. That is why
  [`docs/spec/no-coverage-floor.md`](../spec/no-coverage-floor.md) exists and why
  nothing in this rollout has a coverage number in it.

⚠️ **Clause A is judgment-laden and Clause B is not.** _"Is there a named
remedy?"_ has an arguer's escape in it: somebody determined to gate a metric can
always assert a remedy exists. **A future check that passes B and is argued
through A should be treated as suspect, not as classified.**

**"Unarguable" means _the response is unarguable_, not _the answer never
moves_.** Determinism is out as a criterion, and the repo already knew it:
`gates.yml` says of `audit` that it is _"the one gate whose result can change
without the code changing"_. Two of the three blocking checks on `main` are
non-deterministic given the commit, deliberately. What they carry instead is a
remedy that survives the non-determinism.

## Trends are obliged to reach a person, and only silence is red

**A trend must name a reader and a cadence, and the delivery of the series must
be checkable. The series is never red; its absence is.**

That threads both standing constraints without a fudge. Nothing acts on a metric
movement, because movement is structurally incapable of being red — there is no
threshold anywhere for it to breach. And it refuses _"a trend has no teeth"_,
which this repo cannot afford: _a rule nothing can fail on is a comment_ applies
to the instrument as much as to the rule. **An unread dashboard and a deleted one
are the same artifact.**

**So the pipe is gated and the number is not.** A trend layer's characteristic
failure is not a bad number — it is **silence that looks like health**, which is
this repo's oldest enemy.

## Where trends live: `docs/gates.md`, unscored

**Admitted to the file, and held by not being scored.** Mutation testing was
already a row there, under _Not gated, deliberately_, carrying the revisit
condition this rollout is discharging — so answering _no_ would mean deleting the
thing that scheduled the revisit, against the file's own **mark, do not delete**.

**A trend consumes no row number and carries no status**, and
`gates/constitution-scoreboard.test.ts` (G19) is not edited at all. Two mechanical
facts decided that, read out of the gate rather than assumed:

- `allowedStatuses()` reads the **Status key** table at runtime, so **adding a
  fourth symbol widens the accepted vocabulary for all 35 rows at once** — a
  one-line weakening of everything.
- `TABLES` is a hardcoded three-element list feeding `slugByRow()`, while
  `scoreboardRows()` regex-matches `| **G\d+** |` across the whole file. **A
  numbered row in a fourth table gets status, uniqueness, gapless and spec-exists
  checks and no slug checks at all** — scored-looking, half-checked.

⚠️ **The rejected shape is recorded rather than merely unchosen**: numbered trend
rows in a fourth table with a fourth status symbol was the tempting design, and
both of its costs are gaming categories occurring inside the file that scores
this repo's rules.

## Consequences

- **`docs/gates.md` gains a `## Trends` section** carrying four series, and
  **G36 (`trend-layer`)** — an ordinary numbered gate — watches it. G19 cannot
  see that table, which is why G36 also asserts trend names are disjoint from
  every gate slug: a collision would otherwise be silent.
- **The taxonomy applies to future checks**, including ones outside this rollout.
  That is the point of writing it down rather than deciding per number.
- ⚠️ **_Trend_ becomes the name for the whole not-a-gate column, including things
  that do not trend.** An ill-fitting word doing correct work, recorded rather
  than hidden. **If it grates later, the fix is to rename the column, not to
  split it** — _instrument_ and _signal_ are both available.
- ⚠️ **Clause A is tree-size-sensitive, and that was found rather than designed.**
  Put it to the `audit` job: in stacks the tree is small, a fix usually exists,
  and `ignoreGhsas` is one line — a **gate**. In a large production tree a daily
  advisory four levels down, unfixable, blocking every unrelated merge is a red
  with no reachable remedy — by Clause A's own text a **trend**. Same check,
  opposite classification, and what flipped it is tree size.
- **What the rule does not close**: mutation score is still gameable by adding
  trivially-killable code, which dilutes the denominator upward. **Neither clause
  closes it**, which is why `docs/gates.md` spells the measure _killed ÷ total_
  in front of the reader rather than burying it.
