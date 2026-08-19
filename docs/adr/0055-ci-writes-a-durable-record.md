# CI writes a durable record; the machine pulls it

**Neither push nor pull — both, split at a durable record.**
[`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml) commits one
`metrics/<timestamp>-<sha>.prom` per run to an **orphan `metrics` branch**, in the
OpenMetrics text `promtool` ingests. `pnpm trend:sync` will fetch that branch,
backfill a local Prometheus, and restart it — **run by hand, when you want to
look.** ⚠️ **The reading half is not built**; it is a separate ticket in this
rollout, and this record describes the transport it will use rather than a
command that exists.

The full derivation is [`docs/spec/trend-layer.md`](../spec/trend-layer.md) §1,
which this record does not restate.

## ⚠️ The word is *durable*, and it is not *immutable*

Nothing makes this record immutable. **The `metrics` branch is unprotected and
force-pushable by construction**, and append-only is a convention enforced by
nothing. **Durable is what git buys: the record survives the laptop, the store,
and any rebuild of Prometheus.**

This is stated at the top rather than in a consequence line because the design's
own source said *immutable* in three places, including the heading of the ticket
that proposed it and the thesis of this record. **The strongest available word
for the property this design most conspicuously lacks, sitting in a title, is the
worst possible place for it** — a reader who takes the title at face value plans
around a guarantee that does not exist.

## Why a git record rather than a hosted store

The hosting research found that `promtool tsdb create-blocks-from openmetrics`
backfills a local Prometheus — so *"no history when the machine is off"* is a
weakness of the **store**, not the **record**. A committed record and a local
dashboard **compose rather than compete**, and no hosted option can absorb that
replay.

**Three properties come free, and they are exactly the three every alternative
had to buy:**

- **No secret exists anywhere in the design.** Job-level `contents: write` on the
  built-in `GITHUB_TOKEN` at one end; an anonymous `git fetch` at the other,
  because the repo is public.
- **No Pushgateway.** It strips timestamps by construction and never forgets a
  series, so a dead nightly draws a **confident flat line**. There is no gateway
  here to hold a stale series.
- **Replay is possible.** Grafana Cloud rejects samples more than **two hours**
  behind the newest for that series — no late write, no replay, ever. A git
  record has no such window: a sync after two weeks away replays all fourteen
  days.

**Localhost for the store, and it is competitive rather than a concession.**
Costs, retrieved 2026-08-11: localhost **$0**; Grafana Cloud Free **$0** but 10k
series / **14-day retention** / 3 users; a VPS **$2–6/mo**; Workers Analytics
Engine **$0** but **not Prometheus** — SQL over ClickHouse, no PromQL. Series
count is never the binding constraint; the comparison turns on retention, seats
and who can see it.

**Two clean eliminations, both from the repo being public**: `gh-pages` is
world-readable and private Pages needs Enterprise Cloud; and **GitHub disables
scheduled workflows in public repos after 60 days of inactivity**, which is the
six-month-rot answer for every schedule-driven design.

## Why it cannot live on `main`, and why `gates.yml` is untouched

**`main-protection` covers `~DEFAULT_BRANCH` with `bypass_actors: []` and a
`pull_request` rule**, so no CI job can push there. **Every other ref is
protected by nothing** — which is also what leaves the record on an unprotected,
force-pushable branch. The two facts are the same fact.

⚠️ **`metrics.yml` is not in the `gates` aggregator's `needs:`.** The aggregator
fails explicitly on `skipped` rather than passing by omission, and a job that only
runs on `push` is skipped on every pull request. Adding `schedule:` to `gates.yml`
would also have fired the **required** check nightly, producing check runs
attached to no pull request — and **a required check whose verdict came from a
different commit is reporting about code that is not there.**

## Consequences

- **One file per run**, because both events write: a merge and a nightly can land
  minutes apart, and appending to one shared file makes them contend on the same
  bytes — a lost row, or a conflict CI has to resolve unattended. Separate paths
  reduce the race to a ref update, which `git pull --rebase` retries cleanly.
- **A row is written unconditionally, red `main` included.** A crashed run writes
  **`run_ok 0` plus whatever computed** and still exits red, so *never ran* — a
  gap in the branch — stays distinguishable from *ran and broke*, an explicit
  zero. In `scripts/emit-metrics.ts` the record is written **before** the exit
  code is decided, and `run_ok` is **derived** from what the run declared it would
  compute rather than passed in, so nothing can report health after computing
  nothing.
- **No laptop cron, no daemon.** A second scheduled thing that can silently stop
  is the exact failure class this design spends its budget containing — **and this
  one would have no Actions history to inspect afterwards.**
- **Fork pull requests contribute nothing before merge and everything after.** A
  committing job needs `contents: write`, which a fork PR structurally cannot
  have; the workflow is never `pull_request_target`. `workflow_run` was
  **considered and declined**: it closes the hole at the cost of a second workflow
  and event plumbing, to record scores for pull requests that never merged. **An
  unmerged PR's score was never part of the project's history.**
- ⚠️ **Once any mutation floor is armed, this branch is append-only in practice** —
  never force-pushed, never pruned, never rewritten, because **its history *is*
  the calibration evidence for every armed floor. Enforced by nothing**, said here
  rather than implied.
- **Reversibility**: while every scope is still `unarmed`, deleting the `metrics`
  branch costs only the history. **After arming there is no evidence-preserving
  deletion of it.**
