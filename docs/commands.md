# The commands, in detail

The command lists themselves live in [`AGENTS.md`](../AGENTS.md), where
`gates/commands.test.ts` (G14) holds them to `package.json` and the CLI in both
directions. This file carries the *why* behind four of them — the parts a
session needs only when it is deploying, cutting a worktree, formatting the
tree, or reading a mutation score.

⚠️ **`deploy:site`'s gate-ordering rule stayed in `AGENTS.md` on purpose** — it
is compaction-fragile safety, not reference, and no code catches it. It is not
restated here, because a rule with two homes is a rule that drifts
([ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md)).

## `pnpm format` and `pnpm format:check` — and the quarter of the site they never open

**`pnpm format` rewrites the tree; `pnpm format:check` exits non-zero and names
every file that would change.** The check is the gate form and the write is its
whole remedy, which is the property that let a style rule onto the aggregator at
all: whoever hits the red runs one command they did not have to know this
repository to find ([#229](https://github.com/mephistopheles4/stacks/issues/229)).

⚠️ **`pnpm format` reports success having never opened four files, and they are
every stylesheet rule the site has.** Prettier infers a parser from the
extension and has none for `.astro`, so under a directory sweep it skips
`Shelf.astro`, `index.astro`, `Attribution.astro` and `attribution.astro` in
silence — **979 lines, and this repository has no `.css` file at all**. Named on
the command line those same four files are an *error* (`No parser could be
inferred`, exit 2); swept as part of `.` they are simply absent from the count.
So a green `format:check` says nothing whatever about a quarter of the site's
source, and the number it prints is not a coverage figure.

**The gap is left open on purpose.** `prettier-plugin-astro` closes it and is a
new dependency, which `AGENTS.md` says owes a record under `docs/adr/` — and
[#238](https://github.com/mephistopheles4/stacks/issues/238) measured what it
would cost: formatting `.astro` splits a three-element bootstrap guard across
five lines, and **G7 (`astro-no-logic`) counts lines rather than statements**, so
a block one *under* its cap of 6 is reported as nine. That is a false red whose
message tells the contributor to move code that nobody moved. Taking the plugin
means repairing G7 in the same change.

**The configuration is two overrides and three exclusions, and not one of them
is restated here.** `singleQuote: true` and `printWidth: 100` live in
[`prettier.config.mjs`](../prettier.config.mjs); `*.md`, `fixtures/` and
`pnpm-lock.yaml` live in [`.prettierignore`](../.prettierignore). **Each carries
its measured reason as a comment beside the setting it explains**, and
[ADR-0071](adr/0071-prettier-formats-code-and-nothing-else.md) carries the
decision behind the whole set — including which two settings are load-bearing
for a gate rather than cosmetic, what each one was measured against, and the
rule in another ticket that the Markdown exclusion leans on. Summarising any of
that a second time here is what
[ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md) exists to prevent.

**Prettier is pinned exact**, not caret-ranged, for
[ADR-0067](adr/0067-the-counters-inputs-are-pinned-exact.md)'s reason: the tool version
is an input to what the check *means*, and a minor bump that changes a default
turns an unchanged tree red.

## `pnpm deploy:site` — the branch guard

**It publishes `main` and refuses anything else**, before the gates rather than
after two minutes of them. With one checkout that question answered itself by
standing somewhere; with worktrees there can be four, on four branches, all
reading the one `.env` — so all of them hold `SITE_URL` and the command looks
identical from every one. `--any-branch` is the deliberate override, and a
detached HEAD is refused outright because nobody could say afterwards what went
out. `--dry-run` and `--check-only` are exempt: neither uploads, and a dry run
from a feature branch is how you would check this path before merging it.
Pinned by `gates/deploy-branch.test.ts`.

## `pnpm deploy:site` — what it checks after the upload

**After the upload it asks the live site which build it is serving**, and then
compares every cover the build produced against what the origin actually serves.
A successful upload is not the same as a changed site, and the two checks fail
differently. Every build stamps `index.html` with a hash of itself, because cover
bytes cannot answer "which build is this": covers are named after book titles and
keep those names, so a deploy that changes only code leaves every one of them
identical and the cover check passes against either build — which it did, minutes
after an upload, while the origin still served the previous `index.html` and
therefore the previous bundle. The cover check remains for the opposite case, a
cached copy carrying the right name and the wrong bytes, which is how the fix for
the mobile crash appeared to deploy while phones kept crashing. The build check
waits out edge propagation before complaining, since a deploy is not live the
instant wrangler returns.

**Both checks read the HTTP status before the body, and say "refused" rather
than guessing.** Bot protection answers a non-browser client with a *challenge
page*, which is HTML carrying no build stamp and a content-length of its own —
so read as content, a refusal is indistinguishable from the stale build these
checks exist to catch, and recommends purging a cache that was never involved.
That is not hypothetical — it happened here, and went unnoticed for a while
because the message read like an edge-propagation delay
([`docs/progress.md`](progress.md)). A refusal retries like anything else
and is reported only after every attempt, since one refusal is not evidence of a
standing one. **Do not make it pass by sending a browser user agent** — that was
measured and does not work. See
[ADR-0027](adr/0027-deploy-check-reports-refusal.md).

## `pnpm deploy:site` — the trend panel, and what a stale record refuses

**Before anything else it prints the trend record**, because a trend is obliged
to reach a person on a cadence and the deploy is the cadence this project has.
The panel is fixed in order: *is this real* — the run that produced the score,
its pull-request window, and each scope's delta — then *is this bad*, each scope
against its own history and never against a target line. Per-mutant resolution
comes from this machine's last `pnpm mutation:run`, so it may be a different run
from the score; the panel says so. **The score never refuses.**

**What refuses is the instrument.** Every CI-written series has a **3-day**
bound, checked **per series**: one going quiet while the others stay healthy is
the failure the record exists to expose, and an aggregate check cannot see it. A
gated series with **no sample at all** refuses exactly as a stale one does.

**Deploy reads the local store** — the `metrics` branch as `pnpm trend:sync` last
fetched it, never a fresh fetch — which is what makes the sync the route past the
refusal. A stale store has two causes wearing one face, so the refusal spends
**one anonymous fetch of the branch tip** and says which it is: *newer rows on the
branch* means run `trend:sync`, *a branch no fresher* means the nightly has
stopped, with the Actions link. That fetch writes its own ref and never moves the
mirror, or a second `deploy:site` would clear the refusal by being run twice —
[ADR-0060](adr/0060-the-deploy-reads-the-mirror-and-the-probe-never-moves-it.md).

**No flag clears it**, and `--check-only` reports instead of refusing: it uploads
nothing, and a mode whose job is asking a live origin what it is serving must not
be blocked by the age of a local record. Gated by **G39**
(`metrics-freshness`) in [`docs/gates.md`](gates.md).

⚠️ **Honest cost: if you go a long time without deploying, you go that long
without learning.** Nothing in the design fixes that.

## `pnpm deploy:site` — the mutation floor, and the four things it refuses

**Every scope ships `unarmed`, so today this refuses nothing on a score.** The
floors live in `stryker.floors.json`, beside the Stryker config the hash below
ties them to, and the block prints at every deploy: each scope's state, how far
its calibration window has filled, and how long it has sat unarmed.

**Arming is a human judgement, per scope, after that scope's window fills** — 20
consecutive healthy nightlies, no gap over three days, all scored under the same
configuration. The floor is then the lowest score observed across that window,
applied **once, at arming**. It is not a standing function: after arming a floor
moves up only, by hand, and **re-deriving is lowering**. There is no single
moment at which the ratchet becomes armed, and nothing in the tooling arms
anything.

Four refusals, and **no flag clears any of them**:

| Refusal | What it means |
|---|---|
| **breached floor** | an armed scope scored under its floor. Names the scope, the score, the floor, and — when a local mutation report exists — what one mutant is worth in that scope |
| **unaccounted scope** | `stryker.scopes.json` declares a scope `stryker.floors.json` does not name. It would be scored by every run and floored by nothing |
| **orphan entry** | the floors file names a scope nothing declares. Left alone the file rots into a list of places that are not there |
| **configuration mismatch** | the run was scored under a different Stryker configuration from the one these floors were derived under. ⚠️ **A run stamped with a *different* hash refuses whatever is armed** — somebody changed the scoring configuration without re-deriving. A run carrying **no** hash is a record from before the stamp existed, which is evidence of nothing, and refuses only once a scope is armed and there is a comparison to protect |

⚠️ **The absence of an override is the design, not an omission.** `deploy:site`
now carries two metric refusals — a stale record and a floor breach — and a
blanket flag would get reached for on the stale-record one, a blameless dead
pipe, silently clearing the floor at the same time. The only way past a breach is
a committed lowering: a one-line diff in `stryker.floors.json` plus a `notes`
line saying why, in a pull request, through gates, because deploy runs from
`main`. See [ADR-0061](adr/0061-the-mutation-floor-refuses-deploy.md).

⚠️ **The cost is real and is not softened.** The day you add a book and the
deploy refuses because a refactor last Tuesday dropped a scope below its floor,
there is no way to ship that book today. **The design's answer is that the
lowering is visible, not that it is avoidable.**

**`--dry-run` runs all four and uploads nothing**, which is the honest way to
watch one fail on purpose. **`--check-only` does not reach them at all** — it
builds nothing and exists to ask a live origin what it is serving.

⚠️ **A fourth flag, --skip-gates, used to sit here and does not any more.** It
skipped the whole four-gate contract on a path that still uploaded, was written
down nowhere for 19 of the 21 days it existed, and bought about 35 seconds.
Deleted in [#152](https://github.com/mephistopheles4/stacks/issues/152); see
[ADR-0064](adr/0064-no-flag-skips-the-deploy-gates.md). Typing it today is inert
— the gates run — which is the safe direction for a flag still sitting in
somebody's shell history.

**The flags on this page are the roster.** `gates/deploy-flags.test.ts` (**G45**)
holds these four sections to `scripts/deploy.ts` in both directions, so a flag
documented here and unread, or read there and undocumented, is a red build.
⚠️ **That is why the retired flag above is not in backticks**: the gate reads a
flag as a code span, so writing a dead one that way would demand the script grow
it back. **The same applies to the six flags this command merely forwards** —
--public, --vault and --assets go to `stacks build`, --filter to pnpm,
--project-name and --branch to wrangler, and not one of them is a flag you can
type at `deploy:site`. Name those in prose, as this paragraph does, and never in
a code span. ⚠️ **The first draft of this very paragraph broke the gate it was
explaining**, which is the most direct evidence available that the trap is real
and that the red is loud.

`ignored` — the disable-directive counter beside each floor — is the one field
gated at merge, by **G43** (`ignored-mutants`) in [`docs/gates.md`](gates.md).
There are zero such directives in this repo, so any increase is a real event.

## `pnpm worktree <branch>`

`pnpm worktree <branch>` adds a second checkout beside this one — `../stacks-<branch>` —
runs `pnpm install` in it, and tells you which `.env` it will read. Both of
those are needed because `node_modules` and `.env` are gitignored, so a bare
`git worktree add` produces a checkout where every command fails for a reason
that has nothing to do with the branch.

**Origin is fetched first, before anything is decided, and what you were given
is always printed.** Nothing here moves until somebody fetches, and making a
worktree is not that — so any base you did not check is whatever was last
pulled. That is the one failure here that says nothing: the checkout installs,
the tests pass, and the work sits on an old commit. The fetch does not fail the
command when it cannot reach the network, because being offline does not stop
the rest from working; it says so and carries on.

Three cases, and for a while only the first was handled:

- **A new branch** is cut from `origin/main`, not from the local `main`.
- **A branch `origin` already has** is checked out from `origin/<branch>`,
  tracking it. It used to be created *empty off `origin/main`*, because the only
  question asked was whether a **local** branch existed — so a branch a
  colleague or another machine had already pushed came back as a new one of the
  same name, and the first push either bounced or, forced, took the work with
  it.
- **A branch already here** is fast-forwarded when it is strictly behind, and
  otherwise reported and left alone. Never merged or rebased: a branch that is
  ahead or has diverged is yours to resolve, and this command exists to make you
  a checkout.

**There is one `.env`, in the main checkout, and every worktree reads it.** It
is not copied: a copy drifts, and `STACKS_DEV_HOST=1` left behind in a stale one
keeps the shelf on the network long after anyone remembers enabling it. So
editing it changes every worktree at once, which is the point — and a surprise
if you assumed otherwise. Remove a worktree with `git worktree remove <path>`.

## `pnpm mutation:run` and `pnpm mutation:score`

**`pnpm mutation:run` is a measurement, not a gate**, and nothing in `pnpm test`
or `pnpm build` calls it. It runs Stryker over the **eight declared scopes** in
[`stryker.scopes.json`](../stryker.scopes.json) — minutes on a workstation — and
`pnpm mutation:score` turns the one report into one number per scope, which is
the granularity the whole thing exists for. Stryker's own headline is a single
figure over whatever `mutate` matched, and that figure cannot say which scope
moved.

⚠️ **The scope list is the score's definition, so read
[`docs/spec/mutation-scoring.md`](spec/mutation-scoring.md) before editing
it.** `packages/core/src` is the **non-recursive** scope, `timeoutMS` is part of
what a score means rather than a tuning knob, and every exclusion owes a *named
mechanism* — a file is out of reach because something specific puts it there, or
it is not excluded. `covers/measure.ts` has no spec and stays in the denominator
anyway, because "nothing tests it" is a gap and not a mechanism. See
[ADR-0053](adr/0053-stryker-measures-eight-declared-scopes.md).

## `pnpm metrics:emit` and the trend layer

**A score is a trend, not a gate, and `docs/gates.md` now has a place for both.**
A check is a gate when its red has a named, reachable remedy *and* its verdict
does not depend on how much test code exists; otherwise it is a trend. The
taxonomy is **binary** — [`docs/spec/gate-or-trend.md`](spec/gate-or-trend.md)
and [ADR-0054](adr/0054-a-check-is-a-gate-or-a-trend.md) — and it decides
where any *future* check lands, including ones nobody has thought of. A trend
takes no row number and no status: it lives in `docs/gates.md`'s `## Trends`
table, and what is numbered is the gate that watches that table.

**`pnpm metrics:emit` is the writing half of that layer.**
[`.github/workflows/metrics.yml`](../.github/workflows/metrics.yml) calls it and
commits one `metrics/<timestamp>-<sha>.prom` per run to the orphan **`metrics`**
branch; `pnpm trend:sync` below is the reading half. No secret exists anywhere in
that design, and `gates.yml` is untouched, because a required check whose verdict
came from a different commit is reporting about code that is not there.
⚠️ **The record is *durable*, never *immutable*:** the branch is unprotected and
force-pushable, and append-only is enforced by nothing. Both claims are stated
once, in [ADR-0055](adr/0055-ci-writes-a-durable-record.md), rather than a sixth
time here.

## `pnpm trend:sync` — the reading half, and surface D

**One command, run by hand, when you want to look.** It fetches the `metrics`
branch, imports every record this machine has not seen into a local Prometheus,
asks the live origin what it is serving, and restarts the store. Run it twice and
the second run imports nothing **from the branch** — the store records what it
holds by filename, so a merge and a nightly landing in the same second both
survive. The probe is deliberately not idempotent: each run asks the origin
again, so the only record a second run adds is surface D's own.

**No laptop cron and no daemon.** A second scheduled thing that can silently stop
is the failure class this design spends its budget containing, and this one would
leave no Actions history to inspect afterwards. The cost is stated rather than
hidden: nothing arrives until you ask.

**Replay is the point.** A hosted Prometheus rejects samples more than two hours
behind the newest for that series; a git record has no such window, so a sync
after two weeks away replays all fourteen days. *No history when the machine is
off* is a weakness of the **store**, never of the **record**.

### The page you actually read

**<http://localhost:3000/d/stacks-trend-layer>**, and the sync brings it up. It is
a second pinned container, `stacks-grafana`, provisioned **read-only from
[`grafana/`](../grafana) in this repository** — one datasource, one dashboard,
`allowUiUpdates: false`, nothing mounted for it to write to.

**Read panel 1 before panel 2, and the page says so at the top.** Panel 1 asks
*is this real*: the per-scope delta since the previous run, the **PR window**, and
the run's own commit and Actions link. An empty window (`[]`) against a movement
is the tool disagreeing with itself at a fixed commit; `unknown` is **not** an
empty window, it is no answer at all. Panel 2 asks *is this bad*: each scope
against its own history, never against a target line. There is **no confidence
figure** anywhere on it, and the refusal is written on the page rather than only
in the record. See [ADR-0062](adr/0062-the-dashboard-is-provisioned-from-the-repo.md).

**Editing the page means editing `grafana/dashboards/trend-layer.json`.** A layout
dragged around in the browser reverts on the next provisioning reload, by design:
the panel order is a design rule, and a rule that can be dragged is a rule nothing
holds.

**Grafana's own analytics, update checks and news feed are switched off**, because
the whole layer rests on nothing derived from your reading leaving the machine.

### Setup: Docker, and nothing else

The store is a container this command creates on first run — `stacks-prometheus`,
serving <http://localhost:9090>, with its data and the sync's state under
`.trend/` (gitignored). The dashboard is the second, and both sit on a
`stacks-trend` network so Grafana can reach the store by name. **Both bind to
`127.0.0.1`**, because *nobody else can see it* is one of the two honest costs
this design accepts for a localhost store — a property to keep rather than a
phrase. **The backfill tool and the server come from the same pinned image
deliberately**: `promtool` writes TSDB blocks and Prometheus reads
them, and a version disagreement between the two surfaces as *the sync worked and
the dashboard is empty*. A `promtool` on your PATH is deliberately not used. See
[ADR-0058](adr/0058-the-trend-store-is-a-container.md).

⚠️ **A container is reused only when its image *and* its mount match.** A
`stacks-prometheus` left by another checkout of this repo keeps that checkout's
`.trend/`, so the sync would write blocks here and Prometheus would serve there —
`imported 11 record(s)` on a store answering for nine. Measured, not imagined:
`pnpm worktree` makes two checkouts on one machine the ordinary case, and the
container name is global to the Docker daemon. A mismatch recreates the container
and says which path it was serving.

If Docker is not answering, the command says so and imports nothing. The next run
imports those records instead: the store's state advances only after a backfill
succeeds.

### What it refuses, and the one flag

**A rewritten `metrics` branch.** The sync remembers the tip it last imported and
refuses when that tip is no longer an ancestor of the branch. It is
tamper-**evident** and not tamper-proof — nothing can stop a force-push to an
unprotected branch — and what it buys is that the store never silently mirrors a
history that changed underneath it. `pnpm trend:sync --rebuild` is the deliberate
answer once you know what happened: it drops the local blocks and replays the
branch as it now stands, plus every surface-D row, which only this machine has.
See [ADR-0059](adr/0059-the-sync-refuses-a-rewritten-record.md).

### Surface D — the edge check between deploys

`deploy:site` asks the origin what it is serving **at** a deploy; D asks the same
question **between** deploys, and it is folded in here rather than scheduled in
CI. That is a fact rather than a preference: the expected build stamp is
`sha256(index.html + library.json)` and `library.json` is built from the real
vault, which is not in the repo, **so CI can never compute it.** It could only be
told, which costs a token and breaks the property that no secret exists anywhere
in this design ([ADR-0055](adr/0055-ci-writes-a-durable-record.md)).

**D's row goes to the local store only, never the branch**, which keeps both ends
credential-free — at the cost that D's history lives on one machine. A **refusal**
by bot protection writes `run_ok 0` and no build number at all, and is reported as
refused rather than as a stale build: one is no answer, the other is a real answer
and a red one ([ADR-0027](adr/0027-deploy-check-reports-refusal.md)). D skips, and
says so, when `SITE_URL` is unset or the local `dist/` carries no build stamp — a
gap in D's series is honest where an invented row is not.

## The pre-commit CRAP print — opting in, and reading the table

**Not a command, and not a gate.** It is a checked-in git hook that nobody has
until they ask for it:

```sh
git config --get core.hooksPath   # keep whatever this prints
git config core.hooksPath .githooks
```

That is the whole install. Nothing in `pnpm install` wires it, no gate runs it,
and CI never sees it. A contributor who never opts in never meets it — the same
promise `CONTRIBUTING.md` makes about every optional thing in this repository.

⚠️ **Read the first line before running the second.** Git has exactly one
`core.hooksPath`, so opting in **overwrites** whatever was in it, and a husky or
lefthook install is exactly what would be in it. `git config --unset
core.hooksPath` empties the slot rather than restoring the old value, so opting
out of this is only reversible if you kept what the first line printed —
`git config core.hooksPath <what it printed>` puts it back. Nothing here is
worth taking somebody's hook manager off them.

**It prints and it never refuses.** Every failure — no dependencies installed,
a Vitest run that died, a file ESLint could not parse — costs you the print and
nothing else; the hook exits 0 unconditionally. `--no-verify` skips it, and for
a print that is fine. If it ever grew a refusal it would be the pre-commit hook
[`docs/spec/complexity-on-the-trend-layer.md`](spec/complexity-on-the-trend-layer.md)
§4 turned down; the only teeth in this rollout are the per-scope cap at
`deploy:site`.

### What it does, on every commit

For the staged files that fall in a declared mutation scope, it runs
`vitest related <those files> --coverage` — one run, not one per file — counts
the functions with the same ESLint rule the four complexity series use, and
joins the two:

```text
CRAP over 20 functions this commit touches — CC² × (1 − coverage)³ + CC, exponents never calibrated

       56.0  CC   7  0% (0/7)      untestedBranchy               packages/core/src/parse.ts:2
        8.0  CC   8  100% (11/11)  renderReport                  scripts/lib/crap.ts:370
        6.0  CC   2  0% (0/1)      (arrow)                       packages/core/src/parse.ts:9

  no in-process oracle: packages/site/src/shelf/scene.ts

  1.2s — this blocks nothing; `--no-verify` skips it.
```

### Reading it

**Highest first, and the ranking is the whole product.** `CRAP(m) = CC² ×
(1 − coverage)³ + CC` puts a complex function nobody executes at the top and
collapses to plain complexity once a function is fully covered — which is why an
8-complexity function at 100% sits *below* a 7-complexity one at 0%.

⚠️ **The exponents were never calibrated, by the authors' own account.** That is
why the caveat is on the same line as the word CRAP rather than in a footnote,
why the number is never a series, never a panel and never a threshold, and why
nothing anywhere asks anyone to lower it. It ranks the functions in front of you
right now. It is not a score for the codebase, and comparing today's table to
last week's is not a thing it can do: it keeps no history.

Three things print no number at all, and each says which:

- **`no in-process oracle`** — the file is on a mutation scope's exclusion list,
  because its only oracle is a headless browser or a child process. Twenty-eight
  files are in this state. They read 0% for a reason that is about Vitest's
  reach rather than about the code, and a CRAP of 420 for `scene.ts` would be a
  measurement of the harness.
- **`implicit function — no counterpart in the coverage report`** — a class field
  initialiser or a static block. ESLint scores both as functions; Istanbul has
  no entry for either, so there is a complexity and there is no coverage grain.
- **`not in the coverage report`** — the plumbing did not reach it. **This is
  never printed as 0%**, which is the distinction the whole table rests on: a
  file that is *in* the report untouched is a real 0% and a real, maximal CRAP,
  and a file that is *missing* is a broken pipe.

A function with no name — an arrow passed to `.filter()` — is identified by its
`file:line` and shown as `(arrow)`. Istanbul's own `anonymous_7` ids are
positional and shift when an unrelated arrow is added above them, so they are
safe to print and unsafe to store. Nothing here stores them.

Coverage exists in this repository for this print and for nothing else — no
floor, no threshold, no series, no badge. See
[ADR-0069](adr/0069-coverage-is-an-ingredient-not-a-goal.md).
