# The dashboard is provisioned from the repo, and the panel order is the artifact

`pnpm trend:sync` brings up a second pinned container — `grafana/grafana:11.6.6`
as `stacks-grafana` — beside the store, and provisions it **read-only from
[`grafana/`](../../grafana) in this repository**: one datasource, one dashboard,
`allowUiUpdates: false`. Nothing is mounted for Grafana to write to.

**The panel order is why.** _"Is this real"_ is answered before _"is this
bad"_ — [`docs/spec/trend-layer.md`](../spec/trend-layer.md) §2 makes that a
design rule rather than a preference, on
[ADR-0027](./0027-deploy-check-reports-refusal.md)'s history of conflating the
two questions. **A rule that can be dragged into a different order in a browser
is a rule nothing holds.** Provisioned from a file, the layout is a diff somebody
can review; clicked together once, it is a state on one machine that no reviewer
ever sees and no second machine reproduces.

## What this decides, beyond "use Grafana"

- **Grafana's outbound reporting is switched off, and that is an acceptance
  criterion rather than hygiene.** A stock Grafana phones home: usage analytics,
  a version check, a plugin-update check, a news feed. The whole trend layer
  rests on nothing derived from the owner's reading leaving the machine —
  `docs/spec/trend-layer.md` §5's _"the strongest argument on this effort for the
  dashboard being localhost"_ — and **a localhost store whose dashboard reports
  on itself is not a localhost store.** The four switches are in
  `scripts/trend-sync.ts`.
- **Anonymous, with no login form — and bound to `127.0.0.1`.** There is no user
  database worth protecting on a container holding nothing but provisioned files,
  and a password on a single-maintainer localhost page is a thing to lose rather
  than a control. **The two decisions are one decision**: an anonymous page
  published on every interface is a laptop handing its owner's reading to
  whatever network it last joined, and _"nobody else can see it"_ is a cost the
  spec accepts rather than a phrase. The store is bound the same way, which
  corrects the port mapping it landed with.
- **A user-defined network, `stacks-trend`.** Grafana reaches the store by
  container name: `localhost` inside the Grafana container is the Grafana
  container, and `host.docker.internal` exists on Docker Desktop and not on plain
  Linux. Existing containers are attached idempotently, because the store
  predates the dashboard on the one machine that has been running this longest.
- **No volume for Grafana.** Everything it serves comes from the repository, so a
  container anybody can delete and recreate loses nothing — which is what keeps
  the repository the artifact rather than the machine.

## What is deliberately not here

**No gate asserts the panel order**, and that is the ticket's own call rather
than an omission: [#159](https://github.com/mephistopheles4/stacks/issues/159)
lands no `docs/gates.md` row. A test that read `grafana/dashboards/trend-layer.json`
could not live under `scripts/` either — a spec there runs inside Stryker's
sandbox, where the checkout is a copy — so asserting it means a `gates/` file,
which G19 requires to be scored. What holds the order instead is
`allowUiUpdates: false` plus the fact that changing it is a diff.

**No composite figure, no target line, no threshold**, per §3's four arguments —
and the refusal is **written on the page**, as the first panel, rather than
recorded only here. Grafana's stock threshold step at 80 is stripped from every
panel's field config; `live-exclusions` is a bare count with `colorMode: none`,
because _"exclusion entry N is now false"_ would be a verdict and trends carry no
verdicts.

**Surface D's series are not on this page.** They are in the store and nothing
reads them yet; #159 specified panels 1 and 2 and the four series, and adding a
fifth region unasked is the kind of drift a fixed panel order exists to prevent.

## What it costs

- **A second container, and a second pinned image.** ~600 MB, and it moves the
  Docker requirement from _the store needs it_ to _the reading needs it_.
- **A Grafana dashboard JSON is a poor diff.** It is reviewable in the sense that
  matters — panel order, queries, thresholds, and the text of the refusal are all
  plainly there — and unreviewable in the sense that most of its bytes are field
  config nobody reads. The alternative was a hand-written page querying the
  Prometheus HTTP API, which trades that for owning a chart library.
- **A wide time range bins several runs into one point, and the reducer decides
  which run you see.** Grafana asks for about one point per pixel column, so a
  90-day range over a 1600px panel is an 81-minute step — wider than the gap
  between two pushes on a busy afternoon. **Measured: 11 samples, 6 plotted
  points.** No query fixes this; the store keeps every sample and a chart has one
  pixel column. So the reducer is chosen to fail in the honest direction: panel 2
  takes the **lowest** score in a bin, because a drop hidden behind a good
  neighbour is the flattering-number failure the page exists to refuse, and panel
  5 takes the **slowest** runtime, which is the same instinct pointed the other
  way. **A raw selector is not the alternative it looks like**: Prometheus's
  5-minute lookback means a step wider than that drops samples entirely rather
  than merging them — the same 11 samples plot as **one** point. Panel 1's table
  is the per-run truth and reads every record.
- **The queries are exotic in one place.** Panel 1's run table reads
  `1000 * max_over_time(timestamp(stacks_run_info)[$__range:5m])`, because a
  record's sample time is the only _when_ the store holds — `run_info`'s value is
  1 — and an instant query alone would sort the runs by nothing. The `5m`
  subquery step is Prometheus's lookback delta, so no sample can fall between two
  steps.

## How this was decided

Implementing [#159](https://github.com/mephistopheles4/stacks/issues/159). The
spec's _"What lands where"_ table names no dashboard artifact; the ticket says so
in as many words and goes past it deliberately, which is what makes this a
decision worth a record rather than an application of one.
