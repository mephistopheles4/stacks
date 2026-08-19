# The ratchet — the floor, and what stops it being lowered

Sources: [#115](https://github.com/mephistopheles4/stacks/issues/115) (the
design), [#122](https://github.com/mephistopheles4/stacks/issues/122) (the
calibration window and arming),
[#140](https://github.com/mephistopheles4/stacks/issues/140) (what deploy refuses
and on what numbers),
[#147](https://github.com/mephistopheles4/stacks/issues/147) (the two guards, and
G42).

**The floor refuses `pnpm deploy:site`, and there is no override.** The only way
past is a committed lowering: a one-line diff in a tracked file, in a pull
request, through `gates` and CodeQL — because deploy runs from `main`.

**The spec names no floor value, for any scope.** It names the rule that produces
one, and the value comes from observed history. **There is no target, and the
ratchet never retires.**

---

## 1. The surface, and why there is no flag

Three candidates were live, and the third was taken:

- **Print-only.** A mutation-score drop is a *test-quality* fact refusing a
  *content* deploy, and the deploy is not where it was caused. A real category
  mismatch, and the reason **consult-only, indefinitely, stayed an acceptable
  outcome to the end.**
- **Refuse, with a flag** in the `--any-branch` shape.
- **Refuse, with no flag at all.** ✅

**The owner's reason is the deciding one**: `deploy:site` is about to carry two
metric refusals — a stale record and a floor breach — and *"the flag would get
reached for on the stale-record refusal."* One blanket override reached for to
clear a dead pipe silently clears the floor as well. **Adding no flag dissolves
that rather than documenting it.**

⚠️ **The cost is real and is not softened.** The day you add a book to the vault
and `deploy:site` refuses because a refactor last Tuesday dropped a scope below
its floor, there is no way to ship that book today. You open a pull request, wait
for gates, merge, and deploy. **That pressure is exactly what produces a hurried
lowering with a rubber-stamped justification.** The design's answer is that the
lowering is *visible*, not that it is avoidable.

### ⚠️ Three sentences #115 wrote here are false about this repo, and are replaced

| Sentence | Replacement |
| --- | --- |
| *"Removing the flag makes the adversary's move the only move."* | **False.** `scripts/deploy.ts:66` defines an undocumented `--skip-gates` that skips the whole four-gate block and publishes. **The three metric refusals are placed outside every flag's reach on the merits** ([#140](https://github.com/mephistopheles4/stacks/issues/140)), and the flag's own fate is [#152](https://github.com/mephistopheles4/stacks/issues/152), a repo issue outside this effort. The conclusion survives; the reason does not. |
| *"`--dry-run` and `--check-only` skip the check as they skip every other refusal."* | **False for `--dry-run`**, which is neither `checkOnly` nor `skipGates` and therefore **runs all four gates**, skipping only the branch guard. So §1's own recommended escape — *"a dry run is how you would find out before merging"* — **works better than claimed**: a floor in the deploy path is exercised by `--dry-run`, not bypassed by it. |
| *"a repo whose reviewer is usually its author"* | **False in the understating direction. By rule, nobody** — see [§5](#5-what-the-guard-actually-is). |

**And `scripts/deploy.ts` gains a convention: every refusal states which flags
clear it.** Adopted as a comment convention, not a gate — a check born because a
document was unclear is the shape this effort keeps declining, and G17 already
proves an override's *shape* is spec-able if teeth are ever wanted. It generalises
past `--skip-gates` to all four flags, so it survives whatever #152 decides.

---

## 2. The number is a rule, not a value

[#114](https://github.com/mephistopheles4/stacks/issues/114) made *"start low,
below the measured noise floor by a stated margin"* obsolete **in the inconvenient
direction**. The noise band at `timeoutMS: 120000` is **0.01 points**, and two
runs were byte-identical to a third across 3,301 mutants. The score is effectively
deterministic given the tree — so a floor *"below the noise band by a margin"*
sits at ~66.5% against a current 66.6% and **refuses on any real decrease at
all**: deleting one test that killed two mutants moves `packages/core/src` by
~0.16. **The measurement is far too precise to be the thing that sizes the
margin.**

What has to fit inside the margin is **legitimate churn, and nobody has measured
it.** #114 measured six runs on an unchanged tree. Naming a margin now would be
inventing a figure — the exact thing #114 existed to prevent.

> **Floor for a scope = the lowest score observed for that scope across the
> calibration window, applied _once, at arming_.**

⚠️ **"Once, at arming" is load-bearing and was nearly lost.** If the rule is a
standing function, then after a genuine regression **the rule itself produces a
lower floor** and lowering becomes spec-sanctioned — the adversary's move,
blessed. **The rule initialises; it does not maintain.** After arming the floor
moves up only, by hand. **Re-deriving is lowering**, and costs a justification like
any other lowering.

**Accepted cost: the ratchet ships disarmed and stays disarmed for a while**,
which will read as the piece being unfinished. And **a rule fixed in advance is
still gameable once** — by choosing the window's *length* after watching the
numbers.

---

## 3. What the score is: static mutants in, at a 120-second timeout

#114 recommended *"exclude or separately account for `static` mutants."*
**Refused**, on two arguments.

**Excluding builds a gaming surface into the design.** A mutant becomes static by
living at module scope — `covers/cover-source.ts`'s `HOSTS` table is exactly that.
So *"exclude static"* means **a survivor nobody wants to kill can be removed from
the denominator by hoisting it to module level**, which is an ordinary-looking
refactor and precisely what a hurried agent does incidentally. The exclusion would
be invisible in the headline number.

**The instability was configuration, not the mutants.** The band is 0.36 at
Stryker's default timeout and **0.01 at `timeoutMS: 120000`**, with core showing
zero ghosts across six runs. **So `timeoutMS: 120000` is part of the floor's
definition, not a tuning knob.**

⚠️ **Note which way that cuts.** Timeout counts as *detected*, which is why the
default-timeout runs scored **higher** (66.95, 66.79) than the 120s runs (66.58,
66.59). **The honest configuration is also the less flattering one**, and lowering
`timeoutMS` raises the score with no test touched. [§4](#4-three-routes-down-and-they-all-land-in-one-file)
closes that.

**The residual is five mutants in one file.** `head-cap.ts` is **102 of its 103
mutants static**, and its five ghosts are worth up to **0.33 points** on the
1503-mutant shelf scope. §2's rule absorbs that with no special case — a scope that
wobbles gets a calibration low reflecting its wobble. **That
`packages/site/src/shelf` ends up with a visibly slack floor because of five
mutants in one file belongs written beside the floor**, not left to be
rediscovered.

---

## 4. Three routes down, and they all land in one file

The no-override design only works if the floor is the only way down. **It is not.**

- **Config.** `timeoutMS` moves the score 0.36 points with no test touched;
  `mutator.excludedMutations` removes whole mutator classes; and the `mutate`
  negation trap ([`mutation-scoring.md`](mutation-scoring.md#1-the-dependency))
  produced a number nine points wrong that looked entirely plausible.
- **Source-level disable comments.** `// Stryker disable next-line` deletes a
  mutant from the denominator, in a source file, nowhere near the config or the
  floor. **There are zero in this repo today**, so the counter starts at 0 and any
  increase is a real event.
- **The floor itself.**

**Every route down has to pass through the floors file, and each has a named
guard.** The file records, per scope, the **floor** and the **`ignored`** count;
and once, at the top, a **hash of the score-affecting configuration** the floors
were derived under. Each run stamps its own config hash into the metrics record;
deploy compares, and a mismatch refuses with *"these floors were derived under a
different configuration; re-derive them"* rather than silently comparing two
numbers that do not mean the same thing.

| Route down | The diff it actually takes | Guard |
| --- | --- | --- |
| lower the floor | one line in the floors file | the floor check at deploy |
| change scoring config | `stryker.config.*` **and** the floors file's hash | the config-hash comparison |
| add a disable comment | the source file **and** the floors file's `ignored` | **G42**, at merge |

⚠️ **#115's *"every way to make the bar easier is the same one-line diff in the
same tracked file"* is replaced rather than softened.** It is false in the same
direction twice: two of the three routes are **two diffs in two files**, and only
the first is one line. **The true invariant is weaker and still enough**: *no route
down reaches the deploy without a diff in the floors file, and each route has a
named guard that goes red if that diff is missing.* A sentence whose stated scope
exceeds its real scope is this spec's own subject, and this one was carrying an
overclaim into the piece with the least enforcement behind it.

### G42 `ignored-mutants` — Contract seams

⚠️ **#115 declined a `gates/` row here; #147 reversed it, and the reason changed.**
The decline rested partly on a row-number collision hazard that
[#141](https://github.com/mephistopheles4/stacks/issues/141) dissolved by deriving
numbers from landing order — **and nothing re-checked the decline.** The second
reason (*"zero instances, a natural home elsewhere"*) survives and is **overridden**,
because with `required_approving_review_count: 0` **`gates` and CodeQL are the only
two things in this repo that can stop a merge.** A `gates/` row is no longer the
belt to review's braces; it is the only pre-merge surface that exists.

> **G42 asserts the floors file's `ignored` counter equals an actual grep for
> `Stryker disable` across mutated source.**

It closes §4's own stated cost — *"a disable comment lands in a pull request and
nothing says a word until someone deploys"* — at merge instead of at deploy.

**A note-presence check was declined**, on Clause B: any string satisfies it. It
would catch the honest omission and not the adversary, and **a gate asserting
*note-presence* while reading as *note-quality* states a scope exceeding its real
one** — which is the exact fault the row was minted to repair.

**The slug names what is counted, not the document.** `mutation-floors` was the
alternative, on `gate-register`'s document-naming precedent, and was rejected
because the gate asserts **one field** of that file and says nothing about the
floors beside it.

**G42 needs no observed-red rule of its own**: [#122](https://github.com/mephistopheles4/stacks/issues/122)
requires that of every gate landing *before* the register gate, and G42 lands
after — so `gate-register` (G40) is live and goes red the moment a row appears
without an entry. **The obligation is enforced rather than remembered.**

---

## 5. What the guard actually is

⚠️ **Both guards the design was described as resting on turn out not to exist.**
Measured at `25b007b`:

- **`--skip-gates` is real and undocumented** — two lines in one file, both the
  implementation, absent from every `.md`, from `gates/`, from `.github/`, and
  from the command's own usage text.
- **`main-protection` carries `required_approving_review_count: 0`**,
  `bypass_actors: []`, `require_code_owner_review: false`. A pull request *is*
  required and `gates` and CodeQL must pass. **No human read is required at any
  point.**
- **`.github/CODEOWNERS` contributes nothing here.** Its own header says it is
  *"for review routing rather than permission"*, and GitHub does not request review
  from a pull request's author.

**Requiring review was struck as unavailable, not declined as costly.** This repo
has one collaborator, sole admin; GitHub does not permit a pull request's author to
approve it; and with `bypass_actors: []` a ruleset binds admins too. So
`required_approving_review_count: 1` **plausibly means no pull request ever merges
again.** ⚠️ **Inferred from the configuration and labelled unmeasured** — testing it
means mutating the live ruleset that protects everything. The optionality is
measured; the deadlock is inferred, and the spec states the first flatly and labels
the second.

> **So "a reviewable diff" narrows to the argument it always rested on: _the
> justification sits next to the permission, in the same file, permanently._**

That is a claim about a **permanent, self-describing record read whenever somebody
next opens the file** — not about anyone reading it before merge. It is still why
`notes` beats a commit message, and still why the design borrows
`auditConfig.ignoreGhsas`'s shape. **State it so it visibly does not depend on a
reviewer**, and the collapse of both guards costs it nothing.

⚠️ **What is genuinely lost, said plainly rather than absorbed.** For **stacks**,
the ratchet's anti-weakening property is now: *a lowering is permanently recorded
and self-describing, and nothing prevents it or reviews it.* For the
**transferable design**, a repo with real reviewers gets the property #115
described. See [§9](#9-the-two-inversions-this-piece-carries).

---

## 6. The file

**JSON, beside the Stryker config.** Adjacency matters because of §4: the config
hash ties the two files together, and a diff that changes the timeout and
re-derives the floors should show both changes in the same directory.

**Canonical schema — four per-scope fields plus one top-level hash.** ⚠️ #115
stated it two ways and this supersedes both:

| | Field | Why |
| --- | --- | --- |
| per scope | `floor` — a number, or `unarmed` | §2 |
| per scope | `armed` — the date the entry was added or armed | makes `unarmed for 94 days` printable |
| per scope | `ignored` — the disable-comment counter, starting at 0 | §4, asserted by G42 |
| per scope | `notes` — **append-only**, one line per lowering, never cleared | §5 |
| once, at the top | the hash of the score-affecting Stryker configuration | §4 |

`notes` earns its place from `auditConfig.ignoreGhsas`: **that hatch's force is not
that it is a diff, it is that the justification sits next to the permission,
permanently.** A bare number going from `44.1` to `41.0` is a diff that says
nothing about why. **Rejected: justification in the commit message** — read once,
by the person who wrote it, and this repo's escape-hatch doctrine deliberately does
not work that way.

⚠️ **Nothing enforces the note.** G42 asserts `ignored`; it says nothing about
`notes`. **The file makes the omission visible; it does not make it impossible.**

---

## 7. The vector's edges — exact correspondence, both directions

This is where vacuous green walks in the front door. **A newly-scored scope with
no floor refuses nothing**, which is `coverage.all`'s specimen transposed exactly:
it passes in precisely the case it exists to catch.

**Every declared scope has an entry; every entry names a declared scope. Either
mismatch refuses at deploy**, and the fix is a one-line diff in the same file.
That is G19's own trick — the scoreboard's answer to *a row nothing can fail on* is
a completeness assertion in both directions — applied to floors.

- **Added scope** → unaccounted → refuses until an entry exists. Its value may be
  `unarmed` with the date. **Explicitly unarmed is not silently unfloored**: it is
  in a tracked file, it has a date, and the deploy print lists it every time —
  *"`scripts/`: unarmed for 94 days"*.
- **Removed scope** → orphan entry → refuses until removed. Symmetric, and it stops
  the file rotting into a list of places that no longer exist.
- **Renamed scope** → G37's structural gate goes red, and the edit carries the floor
  across with **the number visible on both sides of one diff**. Floors key on the
  **declared scope name**.

⚠️ **`scripts/` is `unarmed`'s first real occupant, not a hypothetical** — no #114
run ever included it, so one of the eight declared scopes is unmeasured on day one,
and the state invented for a case that might arrive is occupied before the spec is
written.

⚠️ **The weakest link here: `unarmed` is a value somebody can type to make a
refusal go away.** Guarded by the date and the print line — an entry reading
*unarmed for 94 days* is legible in a way a mechanism would only duplicate. **A
judgement call, and named as one.**

**Every scope gets a real floor; no size exemption.** #116 offered *"no floor on
that scope"* for `packages/cli/src` at 68 mutants. **Refused**, because *"this scope
doesn't get a floor because its number is jumpy"* is **deriving policy from the
measurement** — the move already rejected one layer down — and a size threshold is a
number nobody can derive. The practical cost is absorbed by §2 without a special
case, and **the deploy print states each scope's per-mutant resolution, computed
live**: *"`packages/cli/src`: 45.6%, floor 44.1% — one mutant is 1.47 points here."*

⚠️ **`packages/cli/src` is named in the spec as where the first lowering will
land.** A legitimate refactor of `enrich-report.ts` costing two mutants refuses the
deploy, and the only path is a pull request lowering the floor. **That is the
reflexive-lowering pressure arriving at a specific address, and it belongs named
rather than discovered.**

**Rejected: floor it but mark it advisory.** *Advisory* is a second, quieter tier
that any scope can be argued into once the precedent exists, and nothing is ever
argued out of it.

---

## 8. No target, and the Destination amendment

The effort's original destination said *"a ratchet whose floor rises toward a
target."* **There is no target.** Three reasons:

- **A target is strictly more arbitrary than a floor.** The floor has observed
  history under it once armed; 80% is an industry number, not a derived one.
- **"The ratchet retires" is indistinguishable from "the ratchet stopped being
  maintained."**
- ⚠️ **A target reintroduces what the initiative bans.** *"Rising toward a target"*
  is a global-percentage goal in per-directory clothes. The moment one exists the
  live question becomes *how do we get core from 66.6 to 80* — and
  [`gate-or-trend.md`](gate-or-trend.md#6-what-the-rule-does-not-close) leaves on
  the record that **mutation score is still gameable by adding trivially-killable
  code**. `docs/gates.md`'s coverage row says it in one line: *an AI asked to raise
  it produces exactly the gap it is asked to close.* Mutation score is harder to
  game than coverage; **a target is what makes gaming it worth someone's
  afternoon.**

**So the ratchet is defensive only.** It detects that protection weakened. It never
asks for improvement, has no destination, and never retires. What replaces the
target is the print's headroom line — the score compared to its own floor and its
own history, never to an aspiration.

**Cost, stated: nothing in this design ever asks for the score to go up.**
`packages/site/src/shelf` at 47.1% and `cli/src/index.ts`'s 435 invisible mutants
get floors that ratify them. **The floor's message is *don't get worse*, and that is
all it says.**

**Rejected: a per-scope target set by hand, non-binding, purely as intent.** A
non-binding number in a tracked file is read as binding by whoever arrives next,
and by every agent that greps the file.

### Raising is manual, and it will probably never happen

**Auto-raising is out on the standing constraint's text** — a nightly committing a
new high-water mark is a job acting on a metric movement — **and out mechanically,
which is the better guard**: `main-protection` covers `~DEFAULT_BRANCH` with zero
bypass actors, and the floors file lives on `main`, so **a job physically cannot
commit a raise.**

⚠️ **Written down as an accepted risk rather than a caveat: it will probably never
be raised.** A ratchet whose only prompt is a print line, actioned by the one person
who is deploying because they wanted to ship something else, will sit at its
calibration value indefinitely. **That is a worse failure than a slack floor,
because it is silent** — the piece looks armed and does nothing.

**Rejected: a raise proposed automatically and merged by a human.** An auto-opened
pull request *is* a job acting on a metric movement, and *"but a human merges it"*
is the reasoning that erodes the constraint everywhere else.

---

## 9. The two inversions this piece carries

**Most of the design transfers unchanged**: no target, static-in, one file, exact
correspondence, manual raising, the append-only `notes`.

**The surface inverts.** `deploy:site` works here because it is human-invoked, from
`main`, by the one person who can act on the refusal. **In a production codebase
with continuous deployment every one of those is false, and a deploy floor with no
override converts a *test-quality regression* into an *availability incident*** —
you cannot ship a hotfix because a mutation score dropped last Tuesday. That is not
a weaker version; it is a serious defect, and shipping it under a *transferable*
label would be this spec putting its name to something harmful.

> **Transferable: the floor is a required pull-request check, no override, and the
> remedy is the same visible lowering in the same pull request** — which satisfies
> Clause A without touching the deploy path. **Explicitly not at deploy.**

What flipped it: **dependency on shipping.** And the effort's *a merge is never
blocked by a metric* is a **stacks** rule; its reason is served in production by a
blocked merge just as well as by a refused deploy, because a blocked merge stops
nothing that is already live. **The transferable half does not inherit it, and that
is stated rather than silently dropped.**

⚠️ **That inversion has a tail**: moving enforcement to a pull-request check also
flips first-week contributor invisibility and the warn-only question, both of which
are consequences rather than separate decisions.

**The guard inverts the other way.** All of the no-override design rests on the
lowering being a permanent, self-describing record. **In stacks nobody is required
to read it, by rule** (§5). In a production repo the same diff hits CODEOWNERS and a
reviewer with no stake in the deploy being unblocked. **The surface is right here
and wrong there; the guard is weak here and strong there.** Neither half is
uniformly better in one place, and the spec says so rather than presenting stacks as
a scale model.

---

## 10. Rollout: the ratchet lands third, disarmed

Full order in
[`after-the-scoreboard.md`](after-the-scoreboard.md#the-build-order). This piece's
own constraints:

**The calibration window: CI nightlies only, 20 consecutive `run_ok 1` runs, no gap
over 3 days.** Counted in **runs**, not days.

- **CI only; no local seeding.** Backfilling from a laptop would be faster, which is
  exactly why it is refused: **a floor derived on one machine and compared against
  another is a two-machine comparison wearing one config hash**, and §4's hash cannot
  catch it because the configuration is identical. **It is the one door that guard
  does not watch.**
- ⚠️ **Only `run_ok 1` rows count, and this interaction was live in nobody's ticket.**
  A crashed run writes `run_ok 0` **plus whatever computed** — a partial score — and
  *lowest observed* is the rule one bad row destroys forever. A single crash that
  measured three files before dying would slacken every floor derived from that
  window.
- **Why 20.** Long enough that ordinary churn lands inside it, which is the quantity
  §2 says nobody has measured; enough runs that a CI variance band is computed rather
  than assumed; short enough that arming is a prospect rather than a horizon. **The
  3-day gap clause is what makes "consecutive" mean something on a nightly cadence.**
- ⚠️ **The window is also the missing measurement** — the 0.01 band and the
  sufficiency of `timeoutMS: 120000` are 16-core facts, and nobody has run Stryker on
  a runner.

**Nothing ends the disarmed period, and the print is the whole mechanism.**

```
packages/core/src   armed 71.55   current 71.70  (+0.15)   1 mutant = 0.08
packages/cli/src    unarmed       window full (20 runs), lowest 44.12 - armable
scripts/            unarmed       12/20 runs, 41 days
```

⚠️ **Every number in that block is illustrative and none is measured.** #122's
version of it armed `packages/core/src` at **66.58** — which is the **directory
rollup's** score, not the declared scope's 71.7% — and gave `packages/cli/src` a
window low of **71.32** against a measured 45.6%. **One real number borrowed from
the wrong population, sitting beside one invented outright**, in the example an
implementer copies. The figures above are at least consistent with
[`mutation-scoring.md`](mutation-scoring.md)'s scope table; **an implementer takes
the shape from here and the numbers from the record.**

The middle line appears at every deploy, **escalates never, files nothing** — so it
stays inside the standing constraint — and it converts *indefinite* from a silence
into **a dated question asked repeatedly of the one person who can answer it.**
`12/20 runs` beside the day count is deliberate: **41 days and 12 runs says the
nightly has been skipping**, which is the 60-day scheduled-workflow rule showing
itself before it bites.

**Not a date** — a date in a spec is a load-bearing claim that decays by
construction. **Not a pull-request count** — uncorrelated with what the window
measures.

**Arming is per scope, and the windows start together.** Once the spine ships every
scope gets a row per nightly, `scripts/` included, so all reach run 20 on the same
day. **There is no single "the ratchet is armed now" moment and the spec must not
imply one**; a scope added later starts its own window under §7's rule, unchanged.

**Nothing ships warn-only, because nothing would be red.** `unarmed` is strictly
better than warn-only at warn-only's own job: a `continue-on-error: true` is a CI
setting nobody reads, with no date and no natural end, while `unarmed` is a value in
a tracked file carrying a date and printed at every deploy. **Verified: zero
`continue-on-error` anywhere in `.github/`**, so there is no warn-only shape here to
reach for either.

⚠️ **You only see the prompt if you deploy.** This is the **third** independent place
that appears in this spec — after the trend layer's *no deploys means no learning*
and surface D's fold — which makes it a pattern rather than a third caveat. **Three
mechanisms reach the human through `pnpm deploy:site`, and all three are silent for
anyone who is not deploying.**

---

## 11. Gaming categories — graded

Written by #115, **graded cold** by
[#139](https://github.com/mephistopheles4/stacks/issues/139), which read it in a
sealed context. The findings that survived:

**1 — Weakening.** The floor is a number in a tracked file; `notes` records that a
lowering happened and **nothing checks that the note is true, or that one was
written at all.** ⚠️ **The section's stated mitigation — a reviewable diff — was
false about this repo**, and §5 replaces it with the permanent-record argument. **The
strongest live weakness in this spec.**

**2 — Satisfying the letter.** The score rises without a test improving, by two
routes: **trivially-killable code added to a scope — nothing in this design catches
it**, and Clause B does not close it either; and `timeoutMS` lowered so more mutants
time out and count as detected, worth 0.36 points — **caught by the config hash**,
which is the only one of the two that is closed.

**3 — Routing around.** `// Stryker disable` — **now caught at merge by G42**, which
is the change #147 made to this section. Hoisting a survivor to module scope —
closed by §3 counting static mutants. `git mv` retiring a floor — closed by G37 plus
floor-carrying. **Scope *removal* — closed by
[`mutation-scoring.md`](mutation-scoring.md#7-a-scopes-identity-is-its-declared-name),
added after this section was written.**

**4 — Vacuous green.** A scope declared and never armed prints `unarmed` forever and
refuses nothing; **a scope whose run produced zero mutants** — closed by the deploy
residual and the merge-time glob clause; and **the whole ratchet ships disarmed**,
which is the longest window in which this piece looks built and enforces nothing.

**5 — Decay.** Every number this design rests on was measured **once, on one
machine, at one commit**: the 0.01 band, `timeoutMS: 120000` being sufficient, 1.47
points per mutant, the 0.00 scope stability. **Nothing re-measures any of them** —
the calibration window re-derives floors, not the noise band. And the load-bearing
one is subtler than a number: **`timeoutMS: 120000` was sufficient for the suite as
it was in August 2026**, so a slower test added later moves mutants across that
boundary and the score drifts for a reason unrelated to tests getting worse.

⚠️ **A sixth finding, from the cold pass rather than from the section: deferral onto
unbuilt artifacts.** Several of this piece's mitigations secure themselves on the
nightly, which cannot ship before the spine. **The rollout order in §10 is what
discharges that**, and it is why the order is part of the spec rather than a note.

---

## 12. How it is proved able to fail

| Check | Plant this | Expect |
| --- | --- | --- |
| **the floor** | set one scope's `floor` above its current score | `pnpm deploy:site` refuses, naming the scope, the score, the floor and the per-mutant resolution |
| **correspondence, forward** | add a scope to `stryker.config` and not to the floors file | refuses: unaccounted scope |
| **correspondence, reverse** | delete a scope from `stryker.config` and leave its entry | refuses: orphan entry |
| **the config hash** | lower `timeoutMS` without re-deriving | refuses: *these floors were derived under a different configuration* |
| **G42** | add one `// Stryker disable next-line` and leave `ignored` at 0 | red in `pnpm test`, at merge |
| **G42, reverse** | raise `ignored` with no comment in the source | red |
| **the bootstrap** | run `deploy:site` with no record at all, more than 3 days after the spine landed | refuses; **within 3 days it prints and does not refuse** |
| **calibration** | write a `run_ok 0` row carrying a partial low score into an otherwise full window | the derivation **ignores it**, and the window is not satisfied by 20 rows of which one failed |

⚠️ **`--dry-run` exercises all of these and uploads nothing**, which is the honest
way to plant them. `--check-only` skips straight to the origin check and does not.
