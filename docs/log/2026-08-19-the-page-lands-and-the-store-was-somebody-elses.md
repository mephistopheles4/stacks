# The page lands, and the store was somebody else's

**2026-08-19** — [#159](https://github.com/mephistopheles4/stacks/issues/159), the
trend layer dashboard.

## What was built

`pnpm trend:sync` now brings up a second pinned container, `stacks-grafana`,
provisioned read-only from [`grafana/`](../../grafana) in this repository: one
datasource, one dashboard, `allowUiUpdates: false`, nothing mounted for it to
write to. The panel order is the artifact — *is this real* above *is this bad* —
and the refusal of a composite figure is the first panel on the page rather than
a line in a spec. [ADR-0060](../adr/0060-the-dashboard-is-provisioned-from-the-repo.md).

## Three things this found, in the order they hurt

### 1. The PR window had no producer anywhere in the rollout

Panel 1 is built around it. #157 built the record and never listed it; #158 built
the sync and never listed it; #159 and [#161](https://github.com/mephistopheles4/stacks/issues/161)
both **show** it. The spec says in as many words that *"the PR window in panel 1
is the part that is specced"* — so this was a gap between tickets, not a deferral,
and it is invisible until you try to render the panel and find the column is not
in the data.

It is now a `pr_window` label on `stacks_run_info`, derived in CI from
`git log <the previous record's commit>..HEAD` — the only place with the answer,
because the page is Prometheus and Grafana and neither can run git. Three values,
and `unknown` is deliberately not `[]`:
[ADR-0061](../adr/0061-the-pr-window-is-a-label-on-the-run.md). Both halves of
`metrics.yml` now check out at `fetch-depth: 0`, which is the sort of dependency
that fails **quietly** — a depth-1 checkout renders `unknown` forever and nobody
would blame the checkout.

### 2. ⚠️ The store the sync was writing belonged to another checkout

**`imported 11 record(s)`, and the store answered for nine.** The two newest runs
were simply not there.

`stacks-prometheus` is reused when its image matches, and a container name is
global to the Docker daemon — but a container keeps the bind mount it was
*created* with. This machine had one made by a session in a different worktree, so
`promtool` wrote blocks into this checkout's `.trend/` while Prometheus served
`worktrees/totick-8c691d/.trend`. Every number on the page was real and belonged
to another tree.

`pnpm worktree` is a documented command here, so two checkouts on one machine is
the ordinary case rather than an exotic one. The reuse check now compares the
mount as well as the image, and says which path the stale container was serving.

**This is the store-that-lies failure the trend layer exists to refuse, arriving
inside the trend layer's own plumbing** — and the same shape ADR-0058 already
argued about image pinning, one field along: *"a container keeps the flags it was
created with"*.

### 3. The wrong explanation was written, tested, and committed to for twenty minutes

Before finding the mount, the two missing records were diagnosed as Prometheus
refusing to answer for backfilled blocks that overlap its head — a real documented
limitation, consistent with everything observed, and wrong here. A
`splitOnHeadWindow` was written with five tests, wired into the sync, and its
comment cited *"measured: 11 imported, 9 queryable"* as evidence.

It was removed after the actual measurement: a synthetic record **written this
second** backfills into this store and queries back immediately. Nothing scrapes,
so the head never holds data and never blocks anything.

⚠️ **The evidence fit both explanations and only one was checked.** A test whose
name asserts a measurement is exactly as wrong as a comment when the measurement
was never made — and it would have delayed every fresh record by three hours,
including surface D's own row, for a limitation this store does not have.

## What is still owed

- **The `pr_window` column is empty on every record in the store**, because all
  eleven predate the label. The first record written after this lands carries the
  window — and it will be this pull request. Backfilling is not possible: the
  values would have to be invented.
- **The screenshot lives at `artifacts/trend-layer.png`**, which is gitignored;
  `gates/repo-hygiene.test.ts` pins `docs/images/` to exactly the README's
  screenshot, and widening a gate to hold a ticket attachment is not a trade this
  session was willing to make.
