# The ratchet lands disarmed, and the guard that would have taught the wrong lesson

G43 (`ignored-mutants`), `stryker.floors.json`, and the four floors refusals at
`pnpm deploy:site`. The rollout's seventh and last row. Ticket
[#163](https://github.com/mephistopheles4/stacks/issues/163); spec
[`docs/spec/the-ratchet.md`](../spec/the-ratchet.md); decision recorded in
[ADR-0061](../adr/0061-the-mutation-floor-refuses-deploy.md).

**Nothing is armed.** Every scope ships `unarmed` with a date, the print lists
them at every deploy, and arming one is a human judgement after that scope's
20-run window fills. There is no moment at which the ratchet becomes armed.

## The config-hash guard would have refused the first deploy after landing

The floors file carries one hash of the score-affecting Stryker configuration;
each CI run now stamps its own; deploy compares them. Written as *a mismatch
always refuses*, that check was correct in the abstract and wrong here on the
first run: **every one of the eleven records already on the `metrics` branch
predates the stamp**, so the newest run carries no hash, so the first
`pnpm deploy:site` after this landed refused with *"these floors were derived
under a different configuration"*.

That is precisely the failure the neighbouring ticket had already named for its
own bootstrap — *"the first thing the new machinery would teach you is how to get
past it, the precise habit the no-override decision exists to prevent."* Found by
running `--dry-run` rather than by reading, which is the only reason it was found
before merge.

> **The hash guard protects a comparison, so it is silent where there is no
> comparison to protect.** It refuses only once some scope is armed.

⚠️ **This is the second independent instance of one property, which makes it a
property rather than a caveat about one check.** The neighbouring ticket's dated
bootstrap was argued for rather than observed — its spine landed the same day, so
nothing in it could plant a first-contact refusal. This one arrived from a
different direction, in a guard nobody had connected to it, and **would have
fired the same way**: a refusal on first contact, whose only remedy the user has
to learn, in a piece whose whole design rests on there being no way past. Two
checks reached it independently; a third almost certainly would.

⚠️ **It is not a weakening, and the reason is structural rather than careful.**
With every floor unarmed no score is compared to anything, so the guard decides
nothing. The configuration route is shut in the *other* place: the calibration
window refuses to **derive** a floor from a run that carries no hash or the wrong
one, so no floor can ever be produced from runs nothing can vouch for. The
refusal guards the comparison; the window guards the derivation. Only the second
one is load-bearing before arming.

## The merge half would have made every window unfillable

`.github/workflows/metrics.yml` has two halves. The merge half runs
`if: github.event_name == 'push'` and emits `gate-suite-runtime` alone; the
nightly half runs `if: github.event_name != 'push'` and emits the whole record.
On this machine the store holds **eleven records and exactly one nightly** — the
rest are merges.

A window counting every `run_ok 1` row would have counted those merges, found no
mutation score in them, and marked every scope as having a hole in its history —
**unarmable forever, with nothing saying why.** Counting them as breaks would
have reset the window on every push to `main` instead. They are neither: a merge
record is not a mutation run.

**The membership test is the workflow's own condition**, `event !== 'push'`,
rather than a list of event names — so a `workflow_dispatch` full run counts, as
it should, and the two cannot drift.

## Zero counted and zero present are different facts

The first print read `0/20 runs` on a machine holding a full store, which reads
as *the nightly is dead*. It is not: it is *every run predates the stamp*. The
window now carries `candidates` beside `runs`, and the block says which of the
two it is looking at — **once, above the table**, because the window is one fact
about the record rather than eight about the scopes.

## Two smaller things worth keeping

- ⚠️ **A `const` does not hoist.** `WINDOW_RECORD_CAP` was declared beside the
  function that used it, near the bottom of `scripts/deploy.ts`, and the floors
  block runs at step 0c — so the first real run died in the temporal dead zone.
  Every test passed: nothing in `pnpm test` executes `deploy.ts` top to bottom.
  The gate suite cannot see this class of fault at all, which is G17's shape
  again.
- ⚠️ **The counter must match a directive only in a comment.** Every line of
  `scripts/lib/floors.ts` and every refusal message that talks about disable
  directives sits inside the `scripts` mutation scope, so a counter matching the
  bare words would find its own prose and force `scripts` to carry a number no
  mutant caused. The pattern requires a comment opener immediately before the
  word, and contains no comment opener in its own source.

## What was measured, not assumed

- **Zero disable directives across all eight scopes**, swept rather than taken
  from the spec's claim. The counter starts at 0 and any increase is a real
  event.
- **`packages/cli/src` at 68 mutants is 1.47 points per mutant** — computed live
  by the refusal, and equal to the figure the spec states independently.
- **The row is G43**, derived from `docs/gates.md` at the tip this branch stands
  on (42 rows, gapless) rather than from the spec, which says G42. Fourth
  pre-allocated number in this rollout to be one low.

## What the review caught, and none of it was in the prose

A two-axis review — standards and spec, in parallel — found four holes that
**the documents describing this piece all read as correct while the code had
them.** Worth recording as a class: every one was a case of the code agreeing
with a sentence I had written rather than with the situation.

- **The deploy read the newest *record*, not the newest *nightly*.** A merge
  record carries no per-scope score, and ten of the eleven records in this
  store are merges — so on a busy week every armed scope would have printed *no
  score in the record* and the floor would have refused nothing **at exactly the
  moment somebody is deploying.** The window already knew the difference; the
  reading did not. `nightliesIn` is now exported and both sides call it, which
  is what the window's own comment had claimed all along (*"so the two cannot
  drift"*) while `deploy.ts` held a second copy of the literal `'push'`.
- **The config-hash refusal was gated on something being armed**, which was the
  bootstrap fix above over-applied: it also disarmed the spec's own §12 plant
  (*lower `timeoutMS` without re-deriving*) for the entire disarmed period. The
  split that fixes both: **a different hash is evidence and refuses whatever is
  armed; a missing hash is not evidence and waits for a comparison to protect.**
- **The counter iterated the floors entries only**, so a disable directive in a
  declared scope the file does not name merged green — the gate silent in
  precisely the case where the file is already wrong.
- **The full-window print dropped the `unarmed for N days` guard** at exactly the
  moment somebody is deciding what to type into `floor`, while the comment three
  lines up said dropping it *"would drop the guard"*.

⚠️ **A fifth, and the cheapest of all: a citation to `ADR-0060` that resolved to
a real but unrelated record**, because this ADR was renumbered to 0061 mid-rebase
when the neighbouring ticket took 0060. **G29 (`doc-links`) cannot see it** — it
is a docstring in a `.ts` file, not markdown.

## A near-miss with no defence, from the coordination rather than the code

⚠️ **Squashing with `git reset --soft <branch-name>` silently reverted eleven
lines of a neighbouring ticket's work**, and nothing could have gone red.

Three tickets in this rollout ran as stacked branches, rebased and force-pushed
continuously. Squashing this one's WIP commits with
`git reset --soft claude/mattpocock-skills-154-162-71abbe` resolved the *branch
name*, whose tip had moved from `dd77d55` to `4f1dd19` in the meantime. A soft
reset keeps your tree and re-parents it, so the resulting commit's diff is
**your tree against their new tip** — which quietly undoes every change of
theirs you do not have. In this case a paragraph they had just added to
`docs/gate-register.md`.

**The reverted lines were prose, so no gate could have caught it.** No check in
this repo reads a paragraph, and both branches stayed green throughout. It was
found by running `git merge-base --is-ancestor` on a hunch, not by any assertion.

- **The operational rule**: squash against **the SHA you actually rebased onto**,
  never the branch name — or rebase interactively instead of resetting.
- **The check afterwards**: `git merge-base --is-ancestor <old-tip> <new-tip>`
  answers whether a shared branch was rewritten; if it was, diff the two tips and
  confirm each of their changes survived.

**It belongs in this record because it is this effort's own subject arriving one
level up.** The rollout is a set of gates against silent weakening, and the
silent weakening that actually happened was in the coordination *between* the
tickets, in a file class no gate reads, on a day when three sessions were
rewriting each other's bases. Verified afterwards from the other side: pure
addition on the register, no deletions in any of their files.

## A third near-miss of one species, in my own matcher

⚠️ **`countDisableDirectives` read one spelling of a directive the format lets
you write several ways**, and three more of the same species turned up in the
neighbouring branch on the same day — a register heading missing the backticks
round its slug, a disposition written without a colon, and a `uses:` key in
quotes routing an unpinned action past three clauses at once. **None of those
three was found by the session that owned the branch**: two came from a
fresh-context spec reviewer and one from CodeRabbit, and that session verified
and extended them. The attribution matters because of what it adds up to
[below](#nobody-finds-their-own-defects-by-re-reading).

Stryker parses **comment nodes**, so the opener is stripped before its own
matcher runs. A jsdoc-style opener and a continuation line inside a block comment
reach it as the same directive as a plain line comment; this counter saw only the
last. **A directive it missed would be a mutant withheld from the denominator
with the gate green** — which is the exact hole the row exists to close, one
spelling over. Nine forms are now enumerated as plants.

⚠️ **Widening it made this module's own prose count, and the gate caught that
too.** A draft of the explaining comment quoted the openers beside the directive
words; the sweep of the real tree went 0 → 1 for `scripts` and the gate went red.
The forms are described in the module and spelled only in the spec, which no
scope mutates.

**The species is the finding, not the instance.** None of them was reachable from
a plant table, because every row in those tables asks for the **wrong value**,
while every one of these was the **right value in an unexpected shape**.

### An overstated residual is the rarer specimen

⚠️ **The register entry for this row claimed a `GIT_DIR` harness could drive all
four floors refusals. It reaches one.** `REPO_ROOT` comes from
`import.meta.dirname` rather than from git, so `GIT_DIR` never changes which
floors file is read; and with every scope `unarmed` and the correspondence exact,
three of the four cannot fire at all. Driving them needs an environment override
on the `root` parameter — **a test seam on a refusal path that deliberately has
no override flag**, which is a decision rather than a detail.

It is the same fault as the matcher above — *stated scope exceeds real scope* —
**from the opposite direction, and that direction is the rare one.** The register
is full of checks whose reach falls short of what they claim. This was a
**weakness** claimed larger than it is, sitting in the paragraph admitting the
weakness. **Nobody re-measures a hole they have already confessed to: it reads as
honesty, so it never gets checked.** Found by the session scoped to build the
gate that would close it, reading the branch rather than the entry.

### What a plant table cannot prove

**The second method-level finding of the day, and it explains the first.** From
the session that owns the trend layer, checking its own row against this pattern
rather than agreeing with it:

> A plant table proves the check notices **a value it was told to reject**, and
> proves nothing about **a value it was never taught to recognise.** Those are
> different questions, and this repo's plant idiom only ever asks the first.

That is why **re-reading cannot find them**, and why every defect found by
*reading* in this stack was found by somebody else. A plant table inherits its
author's picture of what the file looks like, so it enumerates *wrong values* —
a tag instead of a SHA, a missing entry, a breached floor. **The right value in
an unexpected shape is invisible to it by construction**, because the author
would have had to already know the shape in order to plant it.

⚠️ **This sentence read *"every defect in this stack was found by somebody
else"*, which is false, and it is the third instance of one species in this
file.** Four defects were self-caught across two branches — a gate green against
a plant that deleted its own refusal, a probe fast-forwarding the mirror its own
check reads, a panel quoting the newest record rather than the newest scored run,
and a row un-anchoring G19's own slug — found by planting, by running a refusal
by hand, by pointing a check at real data, and by running the derivation query
the roster rule forces. **Not one by re-reading**, which is the whole point and
what the wider claim obscured.

⚠️ **It survived the correction two sections below, which had already fixed the
same claim in its other spelling.** For an hour this file asserted *every defect*
in one section and *every defect found by reading* in another. **Correcting one
instance of a claim and leaving the other is the same fault as a check that reads
one spelling of a directive** — the failure this row is named for, committed
twice in the document describing it. Caught by the session whose branch the
counterexamples come from.

⚠️ **This row has its own latent instance, and it is on the refusal path.**
`runRowsFrom` treats a `stacks_run_ok` sample as a CI run when it carries no
`surface` label. Measured: `renderMetrics` writes it bare, `renderEdgeCheck`
writes `surface="edge"`, and `metrics.ts` calls that split *structural rather
than a convention* because Prometheus decides series identity on the label set.
So a third writer **following** that convention is excluded correctly, and one
breaking it would be read as a nightly and could feed the calibration window that
derives a floor.

**Not fixed here, deliberately, and the reason is the same one the trend layer
gave for deferring its own instance**: the stack is frozen and mergeable, and
churning it for a case that requires breaking a documented structural convention
buys a re-review against a defect nothing can reach. **The difference worth
naming is reachability** — the trend layer's instance becomes live on the
on-merge move, which is already planned; this one needs somebody to invent a
second label vocabulary first.

### Nobody finds their own defects by re-reading

⚠️ **This section said *"not one session found the worst thing in its own work"*,
and that was false. The correction is recorded rather than applied silently,
because how it got here is the more useful half.**

The false version came from the session that owns the supply-chain rows, was
refuted by the session that owns the trend layer with two counterexamples from
its own branch — **a gate that stayed green against its own deleted refusal**
(`fail()` replaced with `console.warn`, ten of ten tests passing) and **a probe
fetch that moved the mirror it reads** (the refusal cleared itself on a second
run, so the next deploy would have published against a Prometheus holding
nothing) — accepted, and then reached this file anyway, through the session that
had already agreed it was wrong. **A claim carried forward past the point it was
checked, propagating across a handoff.** Both counterexamples are in this tree:
`docs/gate-register.md`'s G39 entry and
[ADR-0060](../adr/0060-the-deploy-reads-the-mirror-and-the-probe-never-moves-it.md).

⚠️ **Note where it sat: immediately below the subsection above, on residuals
claimed larger than they are.** *Nobody re-measures a hole they have already
confessed to: it reads as honesty, so it never gets checked* — an overreaching
headline, in the paragraph about overreaching headlines, one message away from
being checkable. It is left in the record as the specimen that subsection
predicts rather than quietly fixed out of it.

**The corrected claim is stronger than the one it replaces:**

> **Nobody finds their own defects by re-reading.**

Every defect a session found in its own work came from **execution**: planting a
defect and watching the suite stay green, running a refusal by hand and reading
git's own output, pointing a check at the real eleven-record branch, running the
derivation query the roster rule demands. **Not one came from reading.** Every
defect found by *reading* somebody's code was found by somebody else — an
external tool twice, a standards axis three times, a neighbouring session for the
`run_ok 0` consequence.

**So it is a limit on the method rather than on the session.** Re-reading checks
an artifact against the same model that produced it; execution, planting and real
data all yield evidence that model never had.

⚠️ **The corollary is the part worth keeping: review substitutes for the reading,
not for the running.** They are not alternatives. A change carrying only review
has been read twice — the second time by someone with a different picture, which
is why it catches things — but it has still never been *run* by anyone. Both
halves of this row's own history say so: the two-axis review and CodeRabbit found
seven defects between them by reading, and the four that mattered most here — the
first-deploy refusal, the vacuous gate, the crash on a truncated report, the
window that could never fill — surfaced the moment something was actually
executed.

**And the finding that survives the correction untouched is the one that
explains it**: the defects a session cannot see in its own work are
systematically the ones its own plants are shaped around.

### A review names an instance; the repair must cover the class

**The third method-level finding, and the only one that comes with a procedure.**
From the session that owns the supply-chain rows, generalising across all three
branches:

> A reviewer **sampled** the defect; they did not **enumerate** it. So the
> natural fix is systematically narrower than the defect, and the query for the
> rest of the class is almost always one command.

**Four instances in one day, and every time the fix was scoped to the instance,
the twin was found later by somebody else:**

| the instance named | the class | who found the twin |
| --- | --- | --- |
| a false claim in one section of this log | the same claim in another section | the third session, an hour later |
| a bare `JSON.parse` at one call site | the twin two steps later, and mine a third | its own author, then me |
| a `uses` key routed past a gate by quoting | the same key with a space before the colon | a reviewer, after the first fix |
| a directive matcher reading a line comment | every other opener a comment can take | a neighbouring session's finding, applied here |

⚠️ **The reason it keeps happening is that the narrow fix is genuinely
sufficient for the report.** The reviewer's example passes, the plant goes green,
the finding is discharged — and nothing anywhere asks whether the example was the
population. **The one command is the whole remedy**: after fixing what a review
named, grep for the shape rather than the string, and read what comes back.

⚠️ **And the three findings above are one finding, applied at three
altitudes.** *Nobody finds their own defects by re-reading* is the limit on a
session reading its own code. *A plant table cannot prove what it was never
taught to recognise* is the same limit on the artifact that session writes to
check itself. And this one is the limit one level up again: **a session cannot
see the shape of its own findings either.** Each of the three of us fixed our own
instance of this species and moved on, and none of us could see the species from
inside our own — it became visible only in the corrections passing between us,
which is why it took three sessions and an argument rather than one careful
reader.

⚠️ **A verification is an artifact with a scope too, which is the same lesson on
the other side of the desk.** Twice today a session verified a **SHA** and
reported a **branch** — true when checked, false by the time it was read. *"Those
are different objects"* is the correction, and it is worth as much as the
class-versus-instance one: a published verification goes stale exactly like a
published instruction, and both are the copy somebody else is acting on.

## What this leaves open

- **The breach refusal names the per-mutant resolution only when a local
  mutation report exists**, because the record carries scores and not mutant
  counts. Degraded rather than silent.
- **Nothing asserts that `deploy.ts` still calls `reportFloors`.** Deleting one
  line leaves the whole suite green — G17's residual, inherited knowingly from
  G38 and named in the register rather than left to be found.
- **Deleting a scope and its floors entry together** passes every check here and
  at deploy, and reads as cleanup rather than as a lowering. G38's accepted
  verdict, applying unchanged to the counter.
