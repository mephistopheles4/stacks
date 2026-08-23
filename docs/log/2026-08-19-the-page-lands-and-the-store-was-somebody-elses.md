# The page lands, and the store was somebody else's

**2026-08-19** — [#159](https://github.com/mephistopheles4/stacks/issues/159), the
trend layer dashboard.

## What was built

`pnpm trend:sync` now brings up a second pinned container, `stacks-grafana`,
provisioned read-only from [`grafana/`](../../grafana) in this repository: one
datasource, one dashboard, `allowUiUpdates: false`, nothing mounted for it to
write to. The panel order is the artifact — _is this real_ above _is this bad_ —
and the refusal of a composite figure is the first panel on the page rather than
a line in a spec. [ADR-0062](../adr/0062-the-dashboard-is-provisioned-from-the-repo.md).

## Three things this found, in the order they hurt

### 1. The PR window had no producer anywhere in the rollout

Panel 1 is built around it. #157 built the record and never listed it; #158 built
the sync and never listed it; #159 and [#161](https://github.com/mephistopheles4/stacks/issues/161)
both **show** it. The spec says in as many words that _"the PR window in panel 1
is the part that is specced"_ — so this was a gap between tickets, not a deferral,
and it is invisible until you try to render the panel and find the column is not
in the data.

It is now a `pr_window` label on `stacks_run_info`, derived in CI from
`git log <the previous record's commit>..HEAD` — the only place with the answer,
because the page is Prometheus and Grafana and neither can run git. Three values,
and `unknown` is deliberately not `[]`:
[ADR-0063](../adr/0063-the-pr-window-is-a-label-on-the-run.md). Both halves of
`metrics.yml` now check out at `fetch-depth: 0`, which is the sort of dependency
that fails **quietly** — a depth-1 checkout renders `unknown` forever and nobody
would blame the checkout.

### 2. ⚠️ The store the sync was writing belonged to another checkout

**`imported 11 record(s)`, and the store answered for nine.** The two newest runs
were simply not there.

`stacks-prometheus` is reused when its image matches, and a container name is
global to the Docker daemon — but a container keeps the bind mount it was
_created_ with. This machine had one made by a session in a different worktree, so
`promtool` wrote blocks into this checkout's `.trend/` while Prometheus served
`worktrees/totick-8c691d/.trend`. Every number on the page was real and belonged
to another tree.

`pnpm worktree` is a documented command here, so two checkouts on one machine is
the ordinary case rather than an exotic one. The reuse check now compares the
mount as well as the image, and says which path the stale container was serving.

**This is the store-that-lies failure the trend layer exists to refuse, arriving
inside the trend layer's own plumbing** — and the same shape ADR-0058 already
argued about image pinning, one field along: _"a container keeps the flags it was
created with"_.

### 3. The wrong explanation was written, tested, and committed to for twenty minutes

Before finding the mount, the two missing records were diagnosed as Prometheus
refusing to answer for backfilled blocks that overlap its head — a real documented
limitation, consistent with everything observed, and wrong here. A
`splitOnHeadWindow` was written with five tests, wired into the sync, and its
comment cited _"measured: 11 imported, 9 queryable"_ as evidence.

It was removed after the actual measurement: a synthetic record **written this
second** backfills into this store and queries back immediately. Nothing scrapes,
so the head never holds data and never blocks anything.

⚠️ **The evidence fit both explanations and only one was checked.** A test whose
name asserts a measurement is exactly as wrong as a comment when the measurement
was never made — and it would have delayed every fresh record by three hours,
including surface D's own row, for a limitation this store does not have.

### 4. Merging #181 found the window measuring the wrong pair

Added on 2026-08-20, when three rollout tickets landed on `main` under this
branch. [#181](https://github.com/mephistopheles4/stacks/pull/181) built the
deploy print — **the other consumer of the PR window** — and, having no producer
to read, derived its own at read time from the record sequence. Two derivations of
one fact, which is the shape this repo gates elsewhere; but comparing them showed
something worse than duplication.

**#181 measured between the two runs the delta compares. This branch measured
since the previous record of any kind.** They are not the same interval: a merge
record lands on every push, so a nightly's previous record is usually the push it
ran at, and the label would have read `[]` — the page's signal for **tool noise** —
beside a delta covering everything since the previous nightly. A field whose whole
job is telling _real_ from _noise_, systematically saying noise.

Fixed by taking #181's rule and keeping this branch's location: the label is
measured from the last run that **scored**, and the two now share `numbersFrom`,
which is the one place deciding what counts as a merged pull request. ⚠️ **Neither
half was findable from its own side.** #181's is right and self-consistent; this
branch's was wrong and self-consistent; only the merge put them next to each other.

⚠️ **Both ADRs on this branch also collided by number** — `main` had landed
different records at 0060 and 0061 — and were renumbered to 0062 and 0063 on the
merge. `docs/log/2026-08-19-the-ratchet-lands-disarmed.md` records the same
collision biting that session, which makes it the second occurrence and not an
accident.

## What is still owed

- **The `pr_window` column is empty on every record in the store**, because all
  eleven predate the label. The first record written after this lands carries the
  window — and it will be this pull request. Backfilling is not possible: the
  values would have to be invented.
- **The screenshot lives at `artifacts/trend-layer.png`**, which is gitignored;
  `gates/repo-hygiene.test.ts` pins `docs/images/` to exactly the README's
  screenshot, and widening a gate to hold a ticket attachment is not a trade this
  session was willing to make.
