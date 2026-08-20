# The commands, in detail

The command lists themselves live in [`AGENTS.md`](../AGENTS.md), where
`gates/commands.test.ts` (G14) holds them to `package.json` and the CLI in both
directions. This file carries the *why* behind three of them — the parts a
session needs only when it is deploying, cutting a worktree, or reading a
mutation score.

⚠️ **`deploy:site`'s gate-ordering rule stayed in `AGENTS.md` on purpose** — it
is compaction-fragile safety, not reference, and no code catches it. It is not
restated here, because a rule with two homes is a rule that drifts
([ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md)).

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
in the record. See [ADR-0060](adr/0060-the-dashboard-is-provisioned-from-the-repo.md).

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
`stacks-trend` network so Grafana can reach the store by name. **The backfill tool and the server come from the same
pinned image deliberately**: `promtool` writes TSDB blocks and Prometheus reads
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
in this design.

**D's row goes to the local store only, never the branch**, which keeps both ends
credential-free — at the cost that D's history lives on one machine. A **refusal**
by bot protection writes `run_ok 0` and no build number at all, and is reported as
refused rather than as a stale build: one is no answer, the other is a real answer
and a red one ([ADR-0027](adr/0027-deploy-check-reports-refusal.md)). D skips, and
says so, when `SITE_URL` is unset or the local `dist/` carries no build stamp — a
gap in D's series is honest where an invented row is not.
