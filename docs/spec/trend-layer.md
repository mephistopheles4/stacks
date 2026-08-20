# The trend layer — the record, the store, and the runtime surfaces

Sources: [#111](https://github.com/mephistopheles4/stacks/issues/111) (hosting),
[#118](https://github.com/mephistopheles4/stacks/issues/118) (what it shows and
how the scoreboard holds it),
[#119](https://github.com/mephistopheles4/stacks/issues/119) (runtime counters),
[#121](https://github.com/mephistopheles4/stacks/issues/121) (transport),
[#123](https://github.com/mephistopheles4/stacks/issues/123) (agent logs),
[#140](https://github.com/mephistopheles4/stacks/issues/140) (staleness, and what
deploy reads).

**Release confidence is not a number this page computes. It is a state a person is
in after a reading** — so the page's job is to make that reading cheap and honest,
and every choice below falls out of that rather than out of a metric list.

⚠️ **The artifact is renamed. *"Release-confidence dashboard"* stops existing; it
is the trend layer** — one name where the effort carried two, on
[ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)'s reasoning. **A
page that computes no confidence figure must not be named after one.**

---

## 1. The transport: CI writes a durable record; the machine pulls it

**Neither push nor pull — both, split at a durable record.**

⚠️ **The word is *durable*, and #121's own heading said *immutable*.** Nothing
makes this record immutable: the `metrics` branch is unprotected and
force-pushable by construction ([§8](#8-residuals)), and append-only is a
convention enforced by nothing. **Durable is what git buys — the record survives
the laptop, the store, and any rebuild of Prometheus.** Corrected here rather than
carried, because *immutable* is the strongest available word for the property this
design most conspicuously lacks, sitting in a heading.

⚠️ **It said so in three places, and the first pass fixed one.** This heading,
[§9](#9-the-transferable-half)'s statement of the transferable claim, and — the worst
address — **the proposed ADR's own thesis** in
[`after-the-scoreboard.md`](after-the-scoreboard.md#what-belongs-in-docsadr), where a
word denied by its own consequence column would have become a permanent record.
**Fixing the instance rather than the population is the failure this spec catalogues**,
and it survived one round of review to be caught in the next. *Immutable* stays only in
[`supply-chain.md`](supply-chain.md), where it describes a **40-hex git SHA** and is
simply true.

The hosting research found that `promtool tsdb create-blocks-from openmetrics`
backfills a local Prometheus, so *"no history when the machine is off"* is a
weakness of the **store**, not the **record**: a committed metrics record and a
local dashboard **compose rather than compete**, and no hosted option can absorb
that replay. This spec makes that the spine rather than an option.

- **A new `metrics.yml`**: `push: main` + `schedule:` + `workflow_dispatch`, two
  jobs guarded on `github.event_name`. `gates.yml` is **untouched** and keeps
  `contents: read`.
- **It commits `metrics/<timestamp>-<sha>.prom`** — OpenMetrics text with an
  explicit timestamp per sample, the format `promtool` ingests — **to an orphan
  `metrics` branch**.
- **`pnpm trend:sync`** fetches the branch, concatenates the files newer than what
  is stored, backfills with `promtool`, restarts Prometheus. **Run by hand, when
  you want to look.**

**Three properties come free, and they are exactly the three every alternative had
to buy:**

- **No secret exists anywhere in the design.** Job-level `contents: write` on the
  built-in `GITHUB_TOKEN` at one end; an anonymous `git fetch` at the other,
  because the repo is public.
- **No Pushgateway.** It strips timestamps by construction and never forgets a
  series, so a dead nightly draws a **confident flat line**. There is no gateway
  here to hold a stale series.
- **Replay is possible.** Grafana Cloud rejects samples more than **two hours**
  behind the newest for that series — no late write, no replay, ever. A git record
  has no such window: a sync after two weeks away replays all fourteen days.

**It cannot live on `main`.** Verified against the live ruleset: `main-protection`
covers `~DEFAULT_BRANCH` with `bypass_actors: []` and a `pull_request` rule, so no
CI job can push there. **Every other ref is protected by nothing** — which is also
what leaves the record on an unprotected, force-pushable branch. See
[§8](#8-residuals).

**One file per run**, because both events write: a merge and a nightly can land
minutes apart, and appending to one shared file makes them contend on the same
bytes — a lost row, or a conflict CI has to resolve unattended. Separate paths
reduce the race to a ref update, which `git pull --rebase` retries cleanly. ⚠️ **It
also makes the deploy staleness check read a *filename* rather than parse anything,
which is a cost as well as a saving** — see [§7](#7-gaming-categories-graded).

**A row is written unconditionally**, including when `main` is red. A crashed run
writes **`run_ok 0` plus whatever computed** and still exits red, so *never ran* (a
gap) and *ran and broke* (an explicit zero) stay distinguishable.

**No laptop cron, no daemon.** A second scheduled thing that can silently stop is
the exact failure class this design spends its budget containing, **and this one
would have no Actions history to inspect afterwards.** `trend:sync` and the deploy
staleness check share the fetch, so **exactly one piece of code knows where the
record lives.**

**Fork pull requests contribute nothing before merge and everything after.** A
committing job needs `contents: write`, which a fork PR structurally cannot have;
the workflow is `pull_request` and never `pull_request_target`. `workflow_run` was
**considered and declined** — it closes the hole at the cost of a second workflow
and event plumbing, to record scores for pull requests that never merged. **An
unmerged PR's score was never part of the project's history, so the hole is honest
rather than regrettable.**

⚠️ **`metrics.yml` is not in the aggregator's `needs:`.** The aggregator fails
explicitly on `skipped` rather than passing by omission, and a job that only runs on
`push` is skipped on every pull request. Adding `schedule:` to `gates.yml` would
also have fired the **required** check nightly, producing check runs attached to no
pull request — which
[`gate-or-trend.md`](gate-or-trend.md#4-what-the-gates-aggregator-may-depend-on)
forbids.

### Where the store lives

**Localhost, and it is genuinely competitive rather than a concession.** Costs,
retrieved 2026-08-11: localhost **$0**; Grafana Cloud Free **$0** but 10k series /
**14-day retention** / 3 users, Pro **$19/mo + $6.50 per 1k series**; a VPS
**$2–6/mo**; Workers Analytics Engine **$0** on Workers Free with **3-month fixed
retention** — and **not Prometheus** (SQL over ClickHouse, no PromQL, no
Alertmanager). **Series count is never the binding constraint**; the comparison
turns on retention, seats and who can see it.

**Two clean eliminations, both from the repo being public**: `gh-pages` is
world-readable and private Pages needs Enterprise Cloud; and **GitHub disables
scheduled workflows in public repos after 60 days of inactivity**, which is the
six-month-rot answer for every schedule-driven design.

**Localhost's two honest costs**: nobody else can see it — free for one maintainer,
**disqualifying for the transferable design** — and it cannot receive a runtime
counter from the deployed site, which is what defeats the client beacon in
[§5](#5-runtime-counters-four-surfaces-not-one).

---

## 2. The unit is a run, and "is this real" is answered before "is this bad"

The constraint that outranks the metric list — *what must this page show for a
person to tell in thirty seconds whether it matters* — resolves into a **fixed
panel order**, because this repo has conflated those two questions before
([ADR-0027](../adr/0027-deploy-check-reports-refusal.md)).

- **Panel 1, "is this real."** Per-scope delta since the previous run, the **PR
  window** (`[]`, or `#124, #125`), and the run's own identity — commit, workflow
  run URL. **An empty window with a non-zero delta reads *tool noise* on sight.** A
  one-PR window reads *that PR*. A five-PR window reads *you need to look*, which is
  honest rather than attributive.
- **Panel 2, "is this bad."** Per-scope score against its own history. Read only
  after panel 1 says real. **Never against a target line.**

**A score never appears without its run.** That rules out a single-figure gauge and
any panel showing a number stripped of the context needed to judge it — **the design
constraint stated as a layout rule rather than as an intention.**

### The cadence stays nightly

Kept nightly on the owner's CI-minute call, with **on-merge named as a later move**
if the cost allows — recorded so it is a decision deferred rather than one never
noticed. `mutation-run-runtime` exists to tell you when that becomes affordable.

**The cost**: the `commit → PR → session` join closes at **pull-request granularity
only**, so a nightly point covers *every PR merged since the last one* and its
context is a **window** of sessions rather than one.

⚠️ **What nightly buys back is better than what it costs.** A nightly runs whether
or not `main` moved, so **a movement whose PR window is empty is a direct
measurement of [stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073)**
— the tool disagreeing with itself at a fixed commit. That re-measures forever the
tool-noise band that was measured once, and it is the load-bearing number
[`the-ratchet.md`](the-ratchet.md)'s floor must sit below.

---

## 3. Four series, no composite

The table lands in `docs/gates.md`'s new `## Trends` section — shape and placement
in [`gate-or-trend.md`](gate-or-trend.md#the-trends-section).

| Series | The judgment it supports |
| --- | --- |
| `mutation-score`, per declared scope | the reason the page exists |
| `gate-suite-runtime` | mutation cost scales with suite runtime. **This is the number whose staleness made the parked row's cost estimate wrong.** |
| `mutation-run-runtime` | when on-merge becomes affordable — a series existing to serve a decision already deferred |
| `live-exclusions` | *declared exclusions that produced ≥1 executed mutant, of N declared.* Healthy value 0, **displayed and never thresholded** |

The noise band is **derived** from panel 1, not a fifth series. `live-exclusions` is
**a count, deliberately**: *"exclusion entry N is now false"* would be a verdict, and
trends carry no verdicts.

**Cut, with reasons — and ⚠️ *cut* means nowhere**, because the taxonomy is binary
and a metric that is neither a gate nor on this page is not parked somewhere
unnamed:

| Candidate | Why |
| --- | --- |
| `pnpm audit` count, CodeQL alert count | both are gates; they already block and already reach a person, so a count adds no judgment |
| count of ⬜ rows in `docs/gates.md` | flat at zero, moves only when the owner adds an invariant — a step function, not a trend |
| flake rate | no cheap source; measuring it means re-running |
| time-to-green on `main` | one contributor, which is the same *"it would be noise"* the standing rejection row says about diff-cover |
| changed-lines coverage per PR | wrong key for a run-unit page — and **[`no-coverage-floor.md`](no-coverage-floor.md) removed its producer entirely** |

### No composite, and the refusal is written on the page

A single confidence figure is refused. Four arguments, the last being the real one:

1. It is the **global-coverage failure mode transposed** one level up from the
   initiative's named anti-target — one number, gameable, hiding which part moved.
2. §2 made *which scope* the readable signal; a composite deletes precisely what
   panel 1 exists to supply.
3. The series are a score and two wall-clocks. **Any composite is a weight vector
   over incommensurable units — arithmetic dressed as a fact.**
4. ⚠️ **It is the most invisible weakening available.** A floor lowered is a diff; a
   weight re-tuned raises the figure **with nothing looking edited.**

Nothing downstream loses: the deploy floor reads a per-scope score, never a
composite.

---

## 4. The reading ritual, and what deploy refuses

**The moment is `pnpm deploy:site`.** A cadence is obligatory under
[`gate-or-trend.md`](gate-or-trend.md#2-trends-are-obliged-to-reach-a-person-and-only-silence-is-red),
so *"read it when something looks wrong"* was ruled out before this started — it is
the unread-dashboard failure wearing a schedule. **A weekly calendar cadence has
nothing holding it and stops happening in month three**, the same rot GitHub applies
to scheduled workflows after 60 days.

**It prints, and separately it refuses.** The **score** is printed and never
refuses: latest per-scope scores, delta from the previous run, that run's PR window,
each scope's per-mutant resolution, and the floors file's headroom and arming state.
**The refusals are three, and they are about the instrument rather than the
number** — the floor (in [`the-ratchet.md`](the-ratchet.md)), a stale record, and a
declared scope that produced no mutants.

### Staleness is per-series, not over the record

**The record is not one number.** Four series written by different things on
different clocks, and **an aggregate freshness check cannot see the failure the
record was built to expose**: one series going quiet while the others stay healthy. A
working nightly keeps the newest row minutes old forever.

That failure is documented twice by the tickets that then assumed aggregate freshness
would cover it — the **confident flat line**, and *"a series that stops being emitted
draws no line at all, which reads as not configured yet rather than broken in
March."*

**So: per-series.** The cost is stated rather than discovered later — each series
needs its own bound, because they do not share a clock.

| Series | Bound |
| --- | --- |
| the three nightly-written ones | **3 days** |
| surface D's row | **none — reported, never refused** |

⚠️ ***"the three nightly-written ones"* is **four**, and the row it counts is not
D's.** Read against [§3](#3-four-series-no-composite) while building
[#158](https://github.com/mephistopheles4/stacks/issues/158): the nightly writes
all four named series, so the bound covers `mutation-score`,
`gate-suite-runtime`, `mutation-run-runtime` and `live-exclusions` — with
`gate-suite-runtime` bounded on the nightly's clock rather than on pushes, per
the paragraph below. **D takes no `## Trends` row**: it is written by the machine
and never by CI, so a row for it would make `trend-layer`'s reverse
correspondence red against every CI run, and its samples live under a metric
prefix that gate structurally cannot see. Both readings of *"three"* reach the
same operational endpoint, which is the one stated here.

**Absent and stale are the same verdict, and this is entailed rather than newly
decided.** A per-series bound has to say what it does about a series with **no
sample at all** — never emitted, renamed, or silently dropped from the run — and
*"the newest sample is older than 3 days"* is undefined for a series with no
samples. **So a gated series with no sample inside its bound refuses, exactly as a
stale one does.** Anything else fails closed in the wrong direction: **a series
that never emitted is the failure per-series staleness exists to expose**, and it
would be the one case the check could not see.

⚠️ **This makes the check parse samples, not filenames — and one sentence in the
gaming section below was written before that.** #121 designed the freshness check
to read a **filename**, which was cheap and correct for an aggregate bound; #140
then made staleness **per-series**, which a filename cannot answer. **The filename
line survives in [§7](#7-gaming-categories-graded) as the vacuous-green entry it
was, marked as superseded rather than deleted** — the design moved and the
sentence did not, which is this spec's own subject arriving in the spec.

**3 days, and it is not a fresh number.** The calibration window breaks on any gap
over 3 days and the dated bootstrap expires at 3, so **a record too stale to deploy
on is exactly a record too stale to calibrate on** — one number in three places
rather than three numbers. It absorbs a weekend of Actions flakiness, and it learns
the 60-day scheduled-workflow disablement in 3 days rather than in 60. **The bound is
a multiple of the nightly, never of pushes**: `metrics.yml` fires on `push: main`
too, but that is bursty and a week without a merge is not a fault.

**Deploy reads the local store**, which is what makes `pnpm trend:sync` the route
past the refusal.

⚠️ **Which surfaces the one pair that genuinely fires as one fault, and it is not the
predicted one.** A stale *local* store has two unrelated causes wearing one face:
**you have not synced**, and **CI stopped writing**. Same message, opposite fixes.
**Closed by one anonymous fetch of the branch tip when the refusal fires** — newer
rows on the branch means *run `trend:sync`*; a stale branch means *the nightly has
not run since X*, with the Actions link. One request, two messages, and
[ADR-0027](../adr/0027-deploy-check-reports-refusal.md)'s discipline extended to the
**fault** rather than only to the origin's answer.

### The dated bootstrap

⚠️ **As specified without it, your first `deploy:site` after the spine would
refuse.** The staleness refusal was designed for a record that *exists and goes
stale*; the rollout creates a window where **no record has ever existed**, and an
empty record is maximally stale. **That is the worst possible first contact, because
the first thing the new machinery would teach you is how to get past it** — the
precise habit the no-override decision exists to prevent.

| State | Behaviour |
| --- | --- |
| no record has ever arrived | prints `no record yet (spine landed <date>)`, **does not refuse** |
| still no record after **3 days** | refuses |
| a record exists and is stale | refuses, per the bound above |

**The expiry is the point.** Three missed nightlies is a dead pipe rather than a
bootstrap, and expiring on a **date** rather than on *"until the first record
arrives"* is what stops the *never ran* / *ran and broke* distinction collapsing into
a permanent free pass. ⚠️ **The bootstrap exemption is the single most likely thing
in this design to become permanent furniture** — a special case whose entire job is
suppressing a refusal — **which is why it is dated and expiring rather than
conditional.**

**A `gates/` staleness spec was rejected**, and the reason is a rule rather than a
preference: the metrics record's age is a property of the tree, so a freshness
assertion in `pnpm test` **goes red on a quiet week**, and a contributor opening a
pull request after ten idle days meets a red gate whose remedy — *restart the
nightly* — is not a diff they can make. That fails Clause A **for the person who hit
it**. *A stranger paying for your dead pipe is not a gate; it is a tax.*

**G38 `metrics-freshness`, *Defect gates*.** The refusal is spec-able on G17
(`deploy-branch`)'s precedent — it drives `scripts/deploy.ts`'s refusal logic onto a
scratch repository via `GIT_DIR` rather than asserting live state. ⚠️ **The slug
names the property checked, not the consequence**: *the record is fresh*, not *the
deploy refuses*.

⚠️ **The honest cost, stated rather than papered over: if you go a long time without
deploying, you go that long without learning.** The refusal surface is only as
frequent as the deploys. **Nothing in this design fixes that**, and it is the
**second** of three places this shape appears.

---

## 5. Runtime counters: four surfaces, not one

*"Runtime production counters for select invariants"* has to resolve before it can be
specced, and on a static site it resolves to four surfaces:

| | What it is | Status |
| --- | --- | --- |
| **A** — build-time assertion | assert the invariant over the real `dist/` before upload | **exists**, `scripts/deploy.ts` runs `inspectPublicBuild(DIST)` |
| **B** — edge check | ask the live origin what it is serving | **exists**, `verifyBuildLive` plus the cover-byte comparison |
| **C** — client beacon | code on the page reporting home | **rejected for stacks**, transferable-only |
| **D** — scheduled edge check | B, between deploys | **adopted**, folded into `pnpm trend:sync` |

**So the runtime layer for stacks is A + B + D**, and two of the three already exist
with scar tissue on them.

### C was argued on its merits, not refused on privacy

It has four real merits, and three arguments defeat it in ascending order.

**Merits.** It is **the only continuous observer** — between deploys the site can
change without the repo moving, and that class has bitten here: a fix uploaded
cleanly while the custom domain served the previous build's covers for four hours. It
is **the only thing that can see a visitor's cache**, which `verifyBuildLive`'s own
comment concedes it *"cannot"*. `docs/notes-on-the-shelf.md` will put note text on
the client **by design**, at which point correctness stops being a property of
`dist/`'s bytes. And **a zero-expected counter is an assertion, not analytics.**

**What defeats it.** It **vetoes localhost** — the only candidate natively serving
both CI metrics and runtime counters is Workers Analytics Engine, which is not
Prometheus, **so C's price is not the beacon, it is the query language.** The
**observer ships inside the observed artifact**, so in merit 2's own failure mode a
stale bundle's own reporter certifies it, and independence is the entire premise of
defence in depth. And fatally: **a zero-expected counter cannot distinguish *held*
from *never ran*.** 0 forever reads identically as endpoint-down, ad-blocked, bundle
failed, nobody visited — **and for a personal site zero visitors is a legitimate
state**, so silence cannot be made red. Making the zero mean something needs a
denominator: page loads. Which is visitor analytics over the owner's reading, which
the product refuses. **The counter you most want is the one that structurally cannot
go red.**

**D is what merit 1 actually wanted**, at none of that cost — and unlike C, **its
silence is detectable.**

### D is folded into `trend:sync`, and there is no token

⚠️ **D cannot live in `metrics.yml`.** It reads local state — `statSync` over
`dist/`, and `--check-only` takes the build stamp from the **local** `dist/` — so it
can only run somewhere holding the last deploy's build. That is the owner's machine,
and a laptop schedule was already rejected in as many words.

**So D is not scheduled at all: `pnpm trend:sync` probes the origin and writes D's
row beside the ones it fetched.** One command, one moment, one place that knows where
the record lives. `run_ok 0` covers a **refusal** by bot protection with nothing
invented, distinct from *the origin is serving a stale build*, which is a real answer
and a red one — the distinction
[ADR-0027](../adr/0027-deploy-check-reports-refusal.md) already paid for.

⚠️ **Moving D back into CI was checked against the tree and dies on a fact.** The
build stamp is `sha256(index.html + library.json)`, and `library.json` is built from
the **real vault**, which is not in the repo — **so CI can never compute the expected
stamp.** It could only be *told*, which costs a personal access token and breaks the
design's strongest property, and it buys only half of D because the cover comparison
needs the local `dist/` regardless. **Refused: fold stands, no token.**

**D's row goes to the local store only, never the branch.** That keeps the
no-credential property at both ends. ⚠️ **The cost is that D's history lives on one
machine**, which is the third inversion this spec carries — see
[after-the-scoreboard.md](after-the-scoreboard.md#the-four-inversions).

⚠️ **The cost D was adopted for is reduced, deliberately: it is no longer
continuous.** An edge transform enabled on a Tuesday waits for the next sync. **What
rescues the fold is per-series staleness** — under an aggregate check D's series could
have gone quiet for months behind a healthy nightly with nothing saying so; per-series
makes its silence loud rather than invisible. **This spec is the first reader able to
see the runtime and plumbing halves together, and it looked and declined to overturn
the fold.**

### Which invariants — only invariant 2

The other four cannot fail at runtime: **1** is a build-time property (nothing at
runtime can tell whether `library.json` was hand-edited); **3** is a property of the
parser, and the deployed site has no notes; **4** and **5** are structural, enforced
by source-shape gates. **A counter for any of them measures nothing.**

⚠️ **And invariant 2's real-build check is vacuous.** `inspectPublicBuild` runs over
the real `dist/` in the deploy pre-flight, and its `note-body` rule greps for
`NOTE_BODY_CANARY_do_not_ship` — **a fixture-only literal that cannot be present on a
real-vault deploy.** It is honest and load-bearing inside `pnpm gate:public`, where
the canary is planted and G20 watches it go red; **carried onto the real build it
cannot fire.** The invariant this section is about, checked by a rule that
structurally cannot fail on the folder going to the internet, inside the mechanism
built to close that gap. The other two content rules — `/Library\/[^"'\s]*\.md/` and
`/"sourcePath"/` — are **not** vacuous and fire on real bytes.

**Two responses adopted, one rejected:**

- **(i) Accept the vacuity and write it down. ✅** The `note-body` rule is a
  fixture-only rule and the spec says so. **The real protection is structural**: no
  `BookRecord` field carries a body, so no build can, and G30 (`library-seam`) holds
  that seam in both directions.
- **(ii) A real-vault corpus check. ✗ Rejected.** `VaultAdapter` has no body-reading
  method — `insertBodySection` writes and never reads. **Building a body-reading
  capability into the adapter, so a script can hold every note body in memory, in
  order to prove note bodies are not published, creates exactly the capability
  invariant 2's structural argument depends on not existing.** The check would be the
  largest new attack surface on the invariant it defends.
- **(iii) Apply G30's key-trace to the real artifact. ✅** The pre-flight already
  parses the shipped `library.json`; assert that **every key on every shipped book is
  a named `BookRecord` field or a named derived one.** That is G30's assertion over
  real bytes instead of its synthetic record. No vault bodies read, no new capability,
  and it is the one check that would catch *somebody added a field, wired it through
  the seam, and shipped it* on the actual folder going to Cloudflare. **It cannot be
  vacuous**: `empty-library` already fires on a bookless build, so the trace always
  has input.

  ⚠️ **(iii) is a schema-shape guard and nothing more, stated here rather than only
  in [§7](#7-gaming-categories-graded) two hundred lines down.** It checks key
  **names**, never values, so **body text stuffed into `subjects` — a named
  `BookRecord` field, correctly wired — passes every assertion in it.** The
  structural argument (*no `BookRecord` field carries a body*) is a claim about the
  **schema**, and (iii) checks the schema; **neither checks contents.** A reader who
  meets (iii) here and not §7 would leave with a guarantee this check does not give,
  which is the fault this spec exists to catalogue.

**The `smoke:render` beacon trap is moot** — G21 guards `fetch` in the Vitest process
and not the Chrome that `scripts/smoke-render.ts` drives, so a client beacon would
have reported fixture traffic as production truth. **Nothing lands on the page, so it
does not arise**, and it is recorded as the first thing C would owe if ever
reconsidered.

### One principle, covering both leaks this effort found

> **This project adds no new outbound flow carrying anything derived from the owner's
> reading** — not from the page, not from the transcripts. Where a design needs one,
> it is transferable-only.

That covers the beacon, the transcript upload, and the next one, **and it is why the
localhost dashboard survives.**

⚠️ **The decision is enforced by nothing.** There is no `Content-Security-Policy` in
`packages/site/public/_headers`, no `http-equiv` anywhere in `packages/site/`, and no
gate has an opinion on what the shelf may connect to — so *"the site's only outbound
request is same-origin"* is **true by measurement and not by property**, which is this
effort's own diagnosis turning up in its own output. Tracked off-map as
[#127](https://github.com/mephistopheles4/stacks/issues/127), whose shape needs no new
row: a `csp` entry in `PUBLIC_BUILD_RULES` inherits G20's observed-red obligation for
free.

---

## 6. Agent session logs — recorded, not specced

**The join key exists, at pull-request granularity.** Claude Code writes a
first-class `pr-link` record carrying `{sessionId, prNumber, prRepository, prUrl,
timestamp}`; **49 of this repo's 50 pull requests have one, and every one resolves to
exactly one session**, so with `mergeCommit.oid` the chain `commit → PR → session`
closes with every hop measured rather than inferred. **Commit-level joining does not
exist at all**; `gitBranch` is a poor key (`main` alone maps to five sessions); and
SHA-scraping from stdout reaches ~19% and is rejected.

**Two things the dashboard design did not know to ask.** Claude Code ships a
**first-party OpenTelemetry Prometheus exporter**, which holds the cost figures
transcripts lack and *structurally cannot* do the join — no SHA, branch, repo or PR
attribute anywhere — **so counters and context are different sources, not one.** And
**Prometheus is right for the numbers and wrong for the context**: UUIDs and PR
numbers as labels is the cardinality mistake, which makes **annotations (~40 KB/month)
the shape rather than series.**

**The on-disk entry format is documented as internal and may break on any release**,
so this spec **records but does not build** a `SessionEnd` hook emitting ~250 bytes of
ids and counts. The PR window in panel 1 is the part that is specced; joining sessions
to it is not.

⚠️ **`toolUseResult` holds whole file contents and command output in plaintext**,
which for this repo includes **note-body text** — a second unguarded path around
invariant 2 that no gate watches, because every gate watches `library.json` and
`dist/`, not `~/.claude`. **Nothing is leaking today**: invariant 2 governs what gets
*published*, and an agent reading a note into a local transcript is not a publish. It
earns **no ticket**, on the precedent that no gate can reach outside the repo — a
ticket would open and find nothing to do. **It is the strongest argument on this
effort for the dashboard being localhost.**

---

## 7. Gaming categories, graded

Written by #118, #119 and #121; **graded cold** by
[#139](https://github.com/mephistopheles4/stacks/issues/139).

**1 — Weakening.** The **staleness bound** is a single number; widening 3 days to 90
makes the refusal never fire without deleting anything — **the most weakeable artifact
this piece produces.** ⚠️ **The override entry is superseded**: #121 wrote that
overriding a stale-record refusal is *"one flag and no diff at all"*; #140 placed the
three metric refusals outside every flag's reach, so **there is no override to
weaken** — what is left is not running `trend:sync`, which is not an edit and leaves no
diff. **G36's correspondence set** is weakened by narrowing which series it checks —
the reverse direction resists that, which is why both directions are required rather
than tidy. **(iii)'s key-trace rests on a named list**, and adding the offending key to
the named-derived set turns red green **in a one-line diff that reads like
documentation** — the most dangerous shape a weakening can take.

**2 — Satisfying the letter.** **Every check here proves a file arrived on time, and
none proves anything was measured.** `run_ok 1` emitted by a job whose measurement step
was skipped by an `if:` passes the deploy check, passes the freshness panel, and is
false; a mutation step quietly narrowed to one small directory keeps writing
well-formed, punctual, meaningless rows. **G36 checks correspondence, not liveness, not
correctness, and not readership** — every row could correspond perfectly to a series
that has emitted nothing since March. **The cadence cell says "nightly" and G36 checks
the cell exists**, not that a workflow schedule matches it. **And the ritual prints;
printing is not reading** — accepted rather than closed, because no mechanism should
distinguish read from displayed. **(iii) checks key *names*, never values**: body text
stuffed into `subjects` passes every assertion in it.

**3 — Routing around.** The record sits on an **unprotected branch by construction**,
so its history can be force-pushed with no review and no ruleset to stop it. And
**`metrics.yml` can be edited in the same pull request that moves the number it
records, because nothing in this repo reads `.github/`** — which is what
[`supply-chain.md`](supply-chain.md) exists for, and which that piece only partly
closes: G39 covers the actions a workflow calls, **not what the workflow itself does.**
A series and its row can be deleted in one commit and G36 stays green, because both
sides moved together — **symmetric correspondence is exactly as strong and exactly as
blind as that.** Note text reaching anywhere else is outside every runtime check:
`~/.claude`, a cover's EXIF, a sourcemap, a CI artifact upload — and inside `dist/` the
reach is narrower than it looks, `TEXTUAL` being a nine-extension allowlist.

**4 — Vacuous green.** ⚠️ ~~**The live one: the deploy staleness check reads a
*filename*, so a metrics file containing zero samples is indistinguishable from a full
one** — fresh, well-named, and empty. Freshness was chosen for cheapness and this is
what it cost.~~ **Superseded, and the supersession is the finding.** #140's per-series
bound cannot be answered by a filename, so [§4](#4-the-reading-ritual-and-what-deploy-refuses)
makes the check parse samples and treat **absent as stale**. **The entry is struck in
place rather than deleted**: it was written against #121's aggregate design, it was
true then, and *a claim that stopped being true when a sibling decision landed* is the
category this register catalogues. **Worse on the dashboard: a series that stops being emitted draws no line
at all, and no line reads as *I haven't configured that panel yet* rather than *this
broke in March*.** **G36 on an empty trends table and an emitter producing no series:
both sides empty, correspondence holds, green** — mitigated by an `expectFound`
minimum row count. **The confident flat line** is this category in the store.

**5 — Decay.** **GitHub's 60-day inactivity disablement** is their policy, retrieved
2026-08-11, theirs to change — **the load-bearing one, since the whole refusal design
is a response to it.** The **staleness bound** is measured once against an assumed
cadence, and the on-merge move already named would make it stale with nothing
re-reading it. **"Per-run files stay cheap"** is true at hundreds of files and untested
at tens of thousands. And **the claim the entire no-beacon answer rests on** — *the
site's only outbound request is same-origin `/library.json`* — **was measured once, by
grep, and nothing re-measures it**; that is precisely what #127 converts from a
measurement into a property.

⚠️ **Two grading findings this section owes and did not have.** #121's addendum
**silently repeals its own *"there is no credential"*** — closed here by D's row going
to the local store only. And `scripts/deploy.ts` **prints nothing on a coverless build**
and **compares `content-length`, not bytes**, in the cover check D inherits — recorded
as a limit of surface B rather than repaired, since this spec does not build.

---

## 8. Residuals

| Residual | Detail |
| --- | --- |
| ⚠️ **Once any scope is armed, the `metrics` branch is append-only in practice** — never force-pushed, never pruned, never rewritten. **Its history *is* the calibration evidence for every armed floor**; rewrite it and every floor becomes a number nobody can re-derive, **which is worse than an unarmed floor because it is indistinguishable from a good one.** **Enforced by nothing**, and [#122](https://github.com/mephistopheles4/stacks/issues/122) decided **no ticket** on the precedent that the branch does not exist yet, so one would open and find nothing to do. ⚠️ **A candidate mechanism is recorded and not adopted**, so the next reader does not re-derive it: `trend:sync` could persist the last imported branch commit and **refuse a non-fast-forward tip**, rebuilding local state rather than importing across a rewrite. That is tamper-*evident*, not tamper-proof — it detects a rewrite at the next sync and cannot prevent one — and **adopting it is the implementation session's call, not this spec's.** | §1 |
| **No deploys means no learning**, and no syncs means no D. Every surface here fires at `deploy:site` or at `trend:sync`. **Third instance of this shape in the spec.** | §4, §5 |
| **Edge-injected markup on the deployed site is observed by nothing**, before or after D. `deploy.ts` chose a meta tag over whole-HTML comparison precisely so edge rewriting would not break the check, **so that blindness is deliberate** — and written down rather than assumed. | §5 |
| **Invariant 2's real-build `note-body` rule is vacuous and is accepted as such.** | §5 |
| **The site's outbound-request property is true by measurement, not by property** — [#127](https://github.com/mephistopheles4/stacks/issues/127). | §5 |
| **`~/.claude` transcripts hold note-body text in plaintext**, watched by nothing and reachable by no gate. | §6 |
| **The localhost store is invisible to anyone but the maintainer** — free here, disqualifying transferable. | §1 |

---

## 9. The transferable half

**Same spine; swap the store.** The transferable claim is **the split itself**: CI
writes a durable, timestamped record it owns, and the store is a downstream consumer
rebuildable from it. A production codebase swaps the git branch and localhost
Prometheus for object storage and a hosted Prometheus and keeps every other decision —
a row written on failure, `run_ok` as a first-class metric, the pipe gated and the
number never, and a human-invoked refusal rather than an alarm.

⚠️ **And this is the one property that gets *stronger* on transfer, which is worth
naming rather than assuming.** In stacks the record is durable and **not** immutable —
the branch is force-pushable and append-only is a convention. Object storage has
object-lock and a protected ref has rulesets, so **a production codebase can buy the
immutability this design only approximates.** Every other inversion on this effort
costs the transferable audience something; **this one is free**, and stating it stops
*immutable* being read back into the stacks half.

⚠️ **Remote-write straight to a hosted Prometheus is the obvious transferable answer and
is the weaker one**, for a reason measured here: the two-hour ingest window makes replay
impossible, so a design with no durable record loses history it can never get back.
**The record is not a workaround for having no server. It is the part worth
transferring.**

⚠️ **And this gets *cheaper* off this repo, not harder.** On a private repo the metrics
branch is not world-readable, and the public-repo constraint is what forced two of the
eliminations in §1.

**C is ordinary for a production codebase, and all three arguments that defeat it here
dissolve with a server** — the hosting veto (infrastructure by assumption), the
observer-in-the-artifact objection (the server is not the thing it serves), and **the
denominator objection, which dissolves for free** because request count is a natural
denominator a server already has. One rule generalises out of it:

> **Every zero-expected counter ships with its denominator.**

*Derived rather than separately decided*, and flagged as such so it can be pushed back
on: **all three arguments that defeat C are properties of static hosting, not of runtime
counters.**

**The vacuous-canary lesson transfers unchanged and is the more useful half**: *a check
that is honest against fixtures can be vacuous against production, and moving it to the
production artifact does not move its meaning with it.* **Any codebase running the same
assertion in CI and in a pre-deploy step owes an answer to whether the second one can
fail.**

---

## 10. What lands where

| Artifact | Change |
| --- | --- |
| `.github/workflows/metrics.yml` | **new** — `push: main` + `schedule:` + `workflow_dispatch`, job-level `contents: write`, writes one `.prom` per run to the orphan `metrics` branch |
| `metrics` branch | **new**, orphan, unprotected by construction |
| `package.json` | `trend:sync` — fetch, backfill via `promtool`, probe the origin for D, restart Prometheus |
| `scripts/deploy.ts` | the print block; the per-series staleness refusal with its branch-tip disambiguating fetch; the dated bootstrap; **(iii)'s key-trace over the real `library.json`** |
| `gates/trend-layer.test.ts` | **G36** — correspondence both ways, plus trend names kebab-case, unique, and disjoint from every gate slug; `expectFound` row floor |
| `gates/metrics-freshness.test.ts` | **G38** — the refusal driven onto a scratch repo, G17's idiom |
| [`docs/gates.md`](../gates.md) | **rows G36 (Contract seams) and G38 (Defect gates)**; a new `## Trends` section immediately before *Triaging a CodeQL finding* |
| [`AGENTS.md`](../../AGENTS.md) | `trend:sync` in the commands list — `gates/commands.test.ts` (G14) holds both lists in both directions |
| [`CONTEXT.md`](../../CONTEXT.md) | add **`Trend`**; amend **`Gate`** to turn on *scored* rather than on *present in `docs/gates.md`* |
| [`docs/gate-register.md`](../gate-register.md) | entries for G36 and G38, triaged in the commit that lands them |

⚠️ **`metrics.yml` is authored during the only window in which nothing checks its
pins** — G39 (`action-pins`) lands in the second commit and sweeps `.github/**/*.yml`
from then on. **The spine's landing checklist pins `metrics.yml` by hand and says
why.**

---

## 11. How it is proved able to fail

| Check | Plant this | Expect |
| --- | --- | --- |
| **G36**, forward | emit a series with no row in the Trends table | red |
| **G36**, reverse | add a Trends row naming a series nothing emits | red |
| **G36**, name space | name a trend `mutation-scope` | red — collides with a gate slug |
| **G36**, vacuity | empty the Trends table | red, not a vacuous pass |
| **G38** | set the store's newest nightly row 4 days back | `deploy:site` refuses, naming which **series** is stale |
| **G38**, disambiguation | make the local store stale while the branch has newer rows | refusal says *run `trend:sync`*, not *the nightly is dead* |
| **G38**, bootstrap | run with no record 4 days after the spine landed | refuses; **at 2 days it prints and does not refuse** |
| **(iii) key-trace** | add a key to a shipped book that is neither a `BookRecord` field nor a named derived one | pre-flight refuses on the real `dist/` |
| **`run_ok`** | make the mutation step exit non-zero | a row with `run_ok 0` **is still written**, and the job exits red |

⚠️ **What cannot be planted, and is marked as reasoned rather than demonstrated**: the
confident flat line, GitHub's 60-day disablement, and *"printing is not reading"*. Each
is a real limit; none has a red to observe.
