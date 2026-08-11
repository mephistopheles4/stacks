# Where a private trend dashboard can live

Research for [#111](https://github.com/mephistopheles4/stacks/issues/111), under the
map [#108](https://github.com/mephistopheles4/stacks/issues/108). Nothing here is
implemented and **nothing here is a recommendation** — the ticket says so twice, and
three tickets downstream do the choosing:
[#121](https://github.com/mephistopheles4/stacks/issues/121) (which event carries the
metric, push or pull, where the credential lives),
[#118](https://github.com/mephistopheles4/stacks/issues/118) (which series, how long
history has to survive) and
[#119](https://github.com/mephistopheles4/stacks/issues/119) (whether runtime counters
exist at all).

**Every price, limit and retention figure below was read from the vendor's own page on
2026-08-11**, and each one carries its URL. Where a page would not serve — Hetzner
answered `429` twice — it says *could not retrieve* rather than a number from memory. A
stated gap is worth more here than a plausible figure, because two decision tickets are
going to quote these.

What this establishes: what each candidate **can physically receive**, what it costs,
what it takes to stand up, what happens to it after six months of nobody touching it,
and whether it can hold **CI-run metrics**, **runtime counters**, or only one of the two.

---

## 0. The five repo facts every option is constrained by

Checked in this worktree at `1d0548f`, and against the GitHub API.

1. **`mephistopheles4/stacks` is public** (`gh repo view --json visibility` →
   `PUBLIC`, MIT). This is load-bearing three times below: it makes Actions free, it
   makes `gh-pages` publicly readable, and it puts the repo under the *public*
   scheduled-workflow and artifact-retention rules, which are the stricter ones.
2. **`.github/workflows/gates.yml` triggers on `pull_request` and `push: main` only** —
   never `pull_request_target`, and the file says why in a comment: *"fork pull requests
   must not see repository secrets."* There is no `schedule:` trigger today, and no
   `workflow_run`.
3. **`permissions: contents: read`.** Nothing in CI currently holds a write token to
   anything.
4. **G21 replaces `fetch` for the whole Vitest suite** (`gates/no-live-network.ts`) and
   fails the test that made a request. Any metric emission that happens *inside* the
   suite process inherits that. Emission from a *workflow step* after the suite does
   not.
5. **Agent session logs are already on the owner's machine and are large.** Five
   `.jsonl` transcripts totalling **63.6 MB** under
   `~/.claude/projects/C--Users-mephi-WebstormProjects-stacks/` at time of writing. This
   is the one input that is *only* available locally, and it is the reason the ticket
   asks for localhost to be priced as a first-class candidate rather than a fallback.

---

## 1. The comparison table

Columns chosen to be what the blocked tickets actually need. "CI metrics" means metrics
produced by a finished batch job; "runtime counters" means something emitted by the
deployed static site or its edge.

| Option | £/$ per month | Standup | 6 months untouched | CI metrics? | Runtime counters? | Retention | Who can see it | Credential in CI? |
|---|---|---|---|---|---|---|---|---|
| **A. localhost `docker compose`** (Prometheus + Grafana) | **$0** (Docker Desktop free at this size) | one compose file, two images, one volume | **Nothing rots.** Pinned images still boot; it simply was not collecting while off | Yes — by pull, or by replaying a committed file | **No.** A visitor's browser cannot reach the owner's localhost | Whatever the disk holds; Prometheus default `15d`, freely raised | Owner only | **None**, if it pulls |
| **B. Grafana Cloud Free** | **$0** ("free forever", no card) | sign up, one `remote_write` block | Series age out at **14 days**; a dormant stack keeps nothing older | Yes — `remote_write`, subject to the 2 h window (§3) | Only by putting a write credential in a public page — disqualifying | **14 days** | 3 active users/month | **Yes** — instance ID + access-policy token |
| **B′. Grafana Cloud Pro** | **$19/mo** platform fee incl. 10k series, then **$6.50 / 1k series** | same as B | Bills monthly whether or not anything is written | Yes | Same objection as B | Longer than free (not quoted on the pricing page fetched) | Per seat | Yes |
| **C. Self-hosted VPS** (same compose, someone else's box) | **$4–$6** (DigitalOcean) / **$2.02–$5.92** (Fly.io machine) + **$0.15/GB-mo** volume | compose + a box + TLS + a way in | **This is the one that rots**: unpatched kernel, expired TLS, full disk, a card that expires | Yes — push or pull | Yes, if exposed publicly — which is also its risk | Disk-bound, your choice | Whoever you let in | Yes, if pushed |
| **D. Cloudflare Workers Analytics Engine** | **$0** on Workers Free (100k data points/day); **$5/mo** Workers Paid. *Cloudflare states AE billing is not currently activated* | a Worker, a binding, a Grafana ClickHouse datasource | Free-plan Workers do not expire; nothing to patch | Yes — but only via a Worker you write and CI calls | **Yes, natively.** This is the shape AE is for | **3 months**, fixed | Owner (SQL API needs an account token) | Yes — a shared secret to the Worker |
| **E1. Metrics committed to the repo** | **$0** | a file and a workflow step | Nothing rots; it is text in git | Yes | No | Forever (git) | **Everyone** — public repo | **None** (`GITHUB_TOKEN`) |
| **E2. Actions artifacts** | **$0** (public repo) | `upload-artifact`, already in use | Artifacts expire on schedule; nothing warns | Yes | No | Default **90 days**; public repos configurable **1–90 only** | Everyone | None |
| **E3. `gh-pages` branch** | **$0** | a branch and a deploy step | Nothing rots | Yes | No | Forever | **Everyone.** A private Pages site *requires GitHub Enterprise Cloud*, and this repo is public regardless | None |

Sources for every cell are in the sections below and listed in §9.

---

## 2. The three transport shapes, and whether Pushgateway is needed

The design's phrase is *"the Pushgateway batch-job pattern"*. There are three shapes, and
Prometheus's own docs are unusually blunt about the first.

### Pushgateway

Prometheus's *When To Use The Pushgateway* page recommends it for exactly one thing —
*"capturing the outcome of a service-level batch job"* — and then lists three drawbacks
verbatim:

- *"When monitoring multiple instances through a single Pushgateway, the Pushgateway
  becomes both a single point of failure and a potential bottleneck."*
- *"You lose Prometheus's automatic instance health monitoring via the `up` metric
  (generated on every scrape)."*
- *"The Pushgateway never forgets series pushed to it and will expose them to Prometheus
  forever unless those series are manually deleted via the Pushgateway's API."*

The README adds that it is *"not capable of turning Prometheus into a push-based
monitoring system"*, that it is a **metrics cache** and not an aggregator, and that a
TTL/expiry feature was **deliberately not implemented** because the proposed use cases
were judged anti-patterns. Persistence across restarts is opt-in via
`--persistence.file`.

⚠️ **Two of these land directly on [#121](https://github.com/mephistopheles4/stacks/issues/121)'s
worst fear.** That ticket asks what happens when *the scheduled run itself fails*, and
observes that a trend layer which stops collecting is indistinguishable from one where
nothing changed. With a Pushgateway it is worse than indistinguishable: the gateway keeps
serving the last pushed value at every subsequent scrape, so a mutation run that has been
dead for three weeks draws a **confident flat line**, not a gap. Losing `up` means the
usual "did it run" signal is gone too. The gateway does expose `push_time_seconds` and
`push_failure_time_seconds` per group, which is the documented way back to that signal —
worth naming, because it is the only mechanism here that can distinguish stale from
stable.

### Direct `remote_write` from the CI run

Grafana Cloud takes Prometheus `remote_write` over HTTPS with basic auth — **username =
the Metrics instance ID, password = a Cloud Access Policy token**, endpoint taken from
the Prometheus card in the Cloud Portal (`…/api/prom/push`). So a CI step can write
straight into a hosted Prometheus-compatible store with **no gateway at all**, which
removes the single point of staleness above and replaces it with a credential problem
(§4) and a timestamp problem (§3).

A **local** Prometheus can also receive `remote_write`, but not by default:
`--web.enable-remote-write-receiver` is documented with default `false`, as is
`--web.enable-otlp-receiver`. Either way a CI runner cannot reach a localhost Prometheus
without a tunnel — which is a whole extra moving part, and the reason the third shape
exists.

### A puller

Nothing obliges the metric to travel outward. A process on the owner's machine can read
the GitHub API on its own schedule — workflow runs, job conclusions, artifact contents —
and write into a local Prometheus itself. **This is the only shape that needs no
credential in CI at all**, and the only one where the machine being off costs nothing
except lateness, since the API still has the runs when it comes back. Rate limits bound
it generously: **60 requests/hour unauthenticated, 5,000/hour with a personal access
token**, against a repo that produces a handful of runs a day.

Its cost is the mirror image of Pushgateway's: a puller *"only sees what it is running to
see"*, so anything the run does not persist into an artifact or an API-visible field is
simply not available later.

---

## 3. The timestamp constraint — the fact that cuts across every option

This is the single most discriminating thing found, and it is easy to miss until it has
already shaped the design.

**Pushgateway strips timestamps by construction.** The README: pushed metrics are
exposed *without* a timestamp, so Prometheus assigns the **scrape** time. The reasoning
is quoted in the README — *"Attaching the time of pushing as a timestamp would defeat
that purpose because 5min after the last push, your metric will look as stale to
Prometheus as if it could not be scraped at all anymore."* Consequence: a metric's
position on the x-axis is *when the dashboard happened to scrape*, not when the CI run
happened. For a nightly mutation score that is tolerable; for anything keyed on a commit
it is a lie of a few minutes to a few hours.

**Grafana Cloud rejects backdated samples past two hours.** Its own ingestion-errors page
states that *"Grafana Cloud accepts out-of-order samples up to two hours behind the newest
ingested sample"*, and older ones are rejected with an **out of bounds** error. Mimir's
knob is `out_of_order_time_window` under `limits`, and *"Setting `out_of_order_time_window`
to `0s` disables the out-of-order ingestion."* So a hosted store cannot absorb a
six-month backfill in arbitrary order, and a run whose metric is written late — a rerun,
a retry, a manual replay of a failed night — may be refused outright.

**A local Prometheus can be backfilled from a file, with one caveat.** `promtool tsdb
create-blocks-from openmetrics` is documented, and the documented restriction is narrow:
*"it is not safe to backfill data from the last 3 hours (the current head block) as this
time range may overlap with the current head block Prometheus is still mutating."*
Blocks default to two hours; `--max-block-duration` widens them, with the doc's own
warning that this is *"not recommended for any production instances"*. Native histograms
and staleness markers cannot be backfilled at all, *"as they cannot be represented in the
OpenMetrics format."*

⚠️ **That last fact changes the shape of the whole comparison.** The stated weakness of
localhost — *"it holds no history when the machine is off"* — is a weakness of the
**store**, not of the **record**. If the record is an OpenMetrics file that CI commits
(option E1) or uploads (E2), then localhost is a *renderer* over a durable record rather
than the record itself, and the machine being off costs nothing. **E1 and A compose;
they do not compete.** No equivalent composition exists for Grafana Cloud, because the
2-hour window forbids replaying an old file into it. This is a fact for
[#121](https://github.com/mephistopheles4/stacks/issues/121) and
[#118](https://github.com/mephistopheles4/stacks/issues/118) to use; it is not an
argument for localhost, and neither ticket is obliged to take it.

---

## 4. How CI would authenticate — per option

The governing GitHub rule, quoted: *"With the exception of `GITHUB_TOKEN`, secrets are
not passed to the runner when a workflow is triggered from a forked repository"*, and
`GITHUB_TOKEN` itself *"has read-only permissions in pull requests from forked
repositories."* That is exactly the property `gates.yml` chose `pull_request` for.

So any option needing a secret has three possible homes, and they are not equivalent:

| Where the push runs | Sees secrets? | What the trend record then contains |
|---|---|---|
| `pull_request` (today's trigger) | **No**, for forks | Nothing from any fork PR — a hole |
| `push: main` | Yes | Post-merge only; no per-PR series |
| `schedule:` | Yes | Nightly, decoupled from any PR |
| `workflow_run` | **Yes** — GitHub documents that *"the workflow started by the `workflow_run` event is able to access secrets and write tokens, even if the previous workflow was not"*, and it runs in the **default branch** context | Fork PRs can contribute, at the cost of a second workflow that must treat the first one's artifacts as untrusted input |

`workflow_run` is the documented escape from the fork/secrets bind and is worth
[#121](https://github.com/mephistopheles4/stacks/issues/121) considering explicitly —
it is not `pull_request_target`, and it does not run fork code with a token. Its cost is
that it is a second workflow reading a first one's artifacts, which is a data-trust
boundary this repo does not currently have anywhere.

**Options needing no credential at all:** the localhost puller (§2), and every
zero-infrastructure option in §7 — E1/E2/E3 all run under the default `GITHUB_TOKEN` with
`contents: write` at most.

**One more scheduling fact, and it is the answer to "what breaks after six months" for
every `schedule:`-driven option:** GitHub documents that *"in a public repository,
scheduled workflows are automatically disabled when no repository activity has occurred
in 60 days"*, and must be re-enabled by hand. `stacks` is public. So a nightly trend job
on a quiet repo stops **by design at 60 days**, silently, and produces precisely the flat
line §2 warns about.

---

## 5. Localhost, priced honestly

**Cost: $0.** Docker Desktop is free under Docker's Subscription Service Agreement for
organisations with *"fewer than 250 employees AND less than $10 million in annual
revenue"*, and separately for *"personal use"*, education, and non-commercial open
source. A single-maintainer MIT project clears this three different ways. Grafana OSS is
**AGPL-3.0** (repo `LICENSE`, first line: *"GNU AFFERO GENERAL PUBLIC LICENSE"*) with no
seat limit; Prometheus is Apache-2.0.

**Standup:** one `docker-compose.yml`, two pinned images, one named volume for
`/prometheus`, one for `/var/lib/grafana`, and a scrape config. Prometheus's default
retention is **15 days** (`--storage.tsdb.retention.time`, documented as the fallback
when neither time nor size retention is set) — which is a trap worth writing down,
because it is *the same 14–15 day horizon as Grafana Cloud's free tier* unless somebody
changes it. The difference is that raising it is a flag; on the hosted free tier it is a
bill.

**What it uniquely can do:** join the 63.6 MB of agent session logs (§0.5) to the quality
series without uploading them anywhere. Every hosted option in this document turns that
into an exfiltration decision about transcripts of the owner's own work on their own
vault. This is the map's *"agent logs are a candidate dashboard input"* constraint
meeting invariant 2's instinct, and it is the one axis where the options are not merely
differently priced but differently *possible*.
[#123](https://github.com/mephistopheles4/stacks/issues/123) decides whether those logs
can become a series at all; this note only records that localhost is where they already
are.

**What it cannot do, stated plainly:**

- **Nobody else can see it.** For a single-maintainer project that is close to free; the
  transferable design for a team it is disqualifying, and the spec's two-audience rule
  means that difference has to be said out loud rather than averaged.
- **It cannot receive a runtime counter from the deployed site.** A visitor's browser
  cannot reach the owner's localhost, and no tunnel changes that for arbitrary visitors.
  Whatever [#119](https://github.com/mephistopheles4/stacks/issues/119) decides about
  runtime counters, localhost is not where they land — unless "runtime" turns out to mean
  the build-time and edge checks `deploy:site` already performs, which run **on this
  machine** and could write to a local store trivially.
- **It collects nothing while the machine is off** — unless the record lives in the repo
  and the store is a renderer over it (§3).
- **Windows specifics were not measured.** Docker Desktop on Windows runs the containers
  under WSL2; memory and disk overhead on this machine is unmeasured here and would be
  worth one afternoon before the spec quotes a number.

**Six months untouched:** nothing breaks. Pinned images boot to the same version. This is
the only option in the table with no rot mechanism — no bill, no expiring token, no
unpatched kernel, no 60-day disable, no 14-day expiry. It simply has a gap in it for
however long it was off.

---

## 6. Cloudflare-native, since the site already deploys there

**Workers Analytics Engine** is the only Cloudflare-native store that can hold arbitrary
custom series. The facts that decide whether it fits:

- **Writes are a Worker binding only.** `writeDataPoint()` is exposed on a binding inside
  a Worker; the docs describe no HTTP ingest from outside. So CI cannot write to AE
  directly — it must `POST` to **a Worker this repo would have to write and deploy**,
  holding a shared secret. That Worker is new deployed surface for a project whose whole
  premise is that it deploys a static site.
- **Retention is 3 months, fixed.** *"Data written to Workers Analytics Engine is stored
  for three months."* No dial. Longer than Grafana Cloud free by 6×; shorter than a
  committed file by infinity.
- **Shape limits:** up to twenty blobs, twenty doubles and **one** index per
  `writeDataPoint` call; blobs ≤16 KB per data point; index ≤96 bytes; ≤250 data points
  per Worker invocation. A per-directory mutation score fits inside one data point
  comfortably.
- **Cost:** Workers Free includes **100,000 data points written and 10,000 read queries
  per day**; Workers Paid ($5/month, 10M requests + 30M CPU-ms included) raises this to
  10M writes and 1M reads per month. Cloudflare's own pricing page adds that *"you will
  not be billed for your use of Workers Analytics Engine"* at present — a stated
  not-yet-activated billing, which is a fact with a shelf life and should be re-checked
  before the spec quotes it.
- **Grafana can read it**, via the **Altinity ClickHouse** datasource pointed at
  `https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql` with
  an `Authorization: Bearer <token>` custom header and an account token carrying
  `Account Analytics Read`.

⚠️ **The trade the phrase "Prometheus/Grafana dashboard" hides here:** AE is not
Prometheus. There is no PromQL, no `rate()`, no recording rules, no Alertmanager — it is
SQL over a ClickHouse-flavoured store. Everything
[#118](https://github.com/mephistopheles4/stacks/issues/118) wants to ask of a series has
to be expressible that way. Against that, AE is the **only** option in this document
that natively serves both halves of the ticket's last question: it is designed for
runtime counters from the edge, and it can hold CI-run metrics through the same Worker.
Every other option serves one half well and the other badly.

**Not evaluated, deliberately:** Cloudflare's built-in Web Analytics and Pages/Workers
observability dashboards hold *Cloudflare's* metrics about traffic, not arbitrary custom
series, so they cannot hold a mutation score at all.

---

## 7. The zero-infrastructure fallbacks, and what each actually gives up

**E1 — metrics committed to the repo as a file.** Costs nothing, rots not at all, keeps
history forever, needs no credential beyond the default token, and is diffable and
reviewable, which no other option here is. Two real losses: (a) **no querying and no
alerting** — you get a file, and any question harder than "what was it last Tuesday"
means writing code; (b) **it is public**, since the repo is. The map's constraint that
nothing may *act* on a metric movement makes the alerting loss cheap — alerting is
arguably a *non*-goal here. As §3 established, E1 also **feeds A**: `promtool tsdb
create-blocks-from openmetrics` turns the file into a local Prometheus's history, subject
to the 3-hour caveat. And a repo commit is itself repo activity, which quietly defuses
the 60-day scheduled-workflow disable from §4.

**E2 — Actions artifacts.** Already in use (`gates.yml` uploads `artifacts/shelf.png`).
The retention numbers are the whole story: **default 90 days**, and a *public* repository
may configure only **1–90 days**; the 400-day ceiling is private/internal only. So the
maximum history this option can hold for `stacks` is 90 days, and it expires silently.
Free for public repos — *"GitHub Actions usage is free … for public repositories that use
standard GitHub-hosted runners."*

**E3 — `gh-pages`.** Same cost and rot profile as E1, and it can render an actual page.
It cannot be private: *"To publish a GitHub Pages site privately, your organization must
use GitHub Enterprise Cloud"* — and it is moot here anyway, because `stacks` is a public
repo, so its Pages site and its `gh-pages` branch are readable by anyone. **If the
dashboard must be private, E3 is out**, and that is a fact rather than a preference.

---

## 8. What is *not* answered here

- **Hetzner Cloud pricing.** `hetzner.com/cloud` and `hetzner.com/pressroom/new-cx-plans`
  both returned `429` on 2026-08-11. DigitalOcean ($4 / $6 / $12 per month for 512 MiB /
  1 GiB / 2 GiB) and Fly.io ($2.02 / $3.32 / $5.92 per month for `shared-cpu-1x` at
  256 MB / 512 MB / 1 GB, plus $0.15/GB-month for volumes, and **no free allowance for
  new pay-as-you-go accounts**) stand in as the priced VPS/container-host data points.
- **Grafana Cloud Pro's retention window.** The pricing page fetched gives the free
  tier's 14 days and Pro's $19 platform fee + $6.50/1k series, but did not state Pro's
  retention. Re-check before the spec quotes one.
- **Whether Private Data Source Connect is available on the Free tier.** PDC exists and
  does what its name says — *"a private, secured connection between a Grafana Cloud
  instance, or stack, and data sources secured within a private network"* — which would
  let a hosted Grafana render a *local* Prometheus, an interesting hybrid. The docs page
  fetched does not state tier availability. Unverified, and the hybrid should not be
  designed on until it is.
- **Whether a strictly chronological replay into Grafana Cloud can exceed the 2-hour
  window.** The documented statement is the 2-hour bound relative to the newest ingested
  sample *for that series*; whether a fresh series can be filled oldest-first from
  arbitrarily far back was not confirmable from a primary page.
- **Docker Desktop's actual resource cost on this Windows machine.** Unmeasured.
- **Which option to choose.** Not this ticket's job, in the ticket's own words.

---

## 9. Sources, all retrieved 2026-08-11

**Grafana**
- Pricing and free-tier limits — https://grafana.com/pricing/ (10k active series/month,
  14-day retention, 3 active users/month, 50 GB logs/traces/profiles; Pro $19/month
  platform fee incl. 10k series, then $6.50/1k series)
- What's included in Free — https://grafana.com/products/cloud/free-tier/ ("Free
  forever", no credit card, 14 days retention)
- `remote_write` endpoint and auth — https://grafana.com/docs/grafana-cloud/send-data/metrics/metrics-prometheus/
  and the Cloud Portal Prometheus card
- Ingestion errors / out-of-order window — https://grafana.com/docs/grafana-cloud/send-data/metrics/metrics-prometheus/ingestion-errors/
- Mimir `out_of_order_time_window` — https://grafana.com/docs/mimir/latest/configure/configure-out-of-order-samples-ingestion/
- Private Data Source Connect — https://grafana.com/docs/grafana-cloud/connect-externally-hosted/private-data-source-connect/
- Grafana OSS licence — https://raw.githubusercontent.com/grafana/grafana/main/LICENSE (AGPL-3.0)

**Prometheus**
- When to use the Pushgateway — https://prometheus.io/docs/practices/pushing/
- Pushgateway README (non-goals, no TTL, timestamps, `--persistence.file`,
  `push_time_seconds`) — https://github.com/prometheus/pushgateway/blob/master/README.md
- Storage / OpenMetrics backfill and the 3-hour caveat — https://prometheus.io/docs/prometheus/latest/storage/
- Flags (`--web.enable-remote-write-receiver` default `false`,
  `--web.enable-otlp-receiver` default `false`, `--storage.tsdb.retention.time` default
  15d) — https://prometheus.io/docs/prometheus/latest/command-line/prometheus/

**GitHub**
- Fork PRs and secrets; `workflow_run` secrets and default-branch context; scheduled
  workflows disabled after 60 days of inactivity in a public repository —
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Artifact/log retention: default 90 days, public 1–90, private/internal 1–400 —
  https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- Actions free for public repositories — https://docs.github.com/en/billing/concepts/product-billing/github-actions
- REST rate limits (60/hr unauth, 5,000/hr PAT, 1,000/hr/repo `GITHUB_TOKEN`) —
  https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- Private Pages requires GitHub Enterprise Cloud — https://docs.github.com/en/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site

**Cloudflare**
- Analytics Engine overview — https://developers.cloudflare.com/analytics/analytics-engine/
- Get started (`writeDataPoint` is a Worker binding; SQL API auth needs
  `Account Analytics Read`) — https://developers.cloudflare.com/analytics/analytics-engine/get-started/
- Limits (3-month retention, 20 blobs / 20 doubles / 1 index, 16 KB blobs, 96-byte index,
  250 data points per invocation) — https://developers.cloudflare.com/analytics/analytics-engine/limits/
- Pricing (Free 100k writes + 10k reads per day; Paid 10M writes + 1M reads per month;
  billing not currently activated) — https://developers.cloudflare.com/analytics/analytics-engine/pricing/
- Grafana via the Altinity ClickHouse plugin — https://developers.cloudflare.com/analytics/analytics-engine/grafana/
- Workers limits and pricing (Free 100k req/day, 10 ms CPU; Paid $5/month) —
  https://developers.cloudflare.com/workers/platform/limits/ and
  https://developers.cloudflare.com/workers/platform/pricing/

**Hosting and tooling**
- Docker Desktop licence threshold (<250 employees AND <$10M revenue; personal use,
  education, non-commercial OSS) — https://docs.docker.com/subscription/desktop-license/
- DigitalOcean Basic Droplets ($4 / $6 / $12 per month) — https://www.digitalocean.com/pricing/droplets
- Fly.io Machines and volumes — https://fly.io/docs/about/pricing/
- Hetzner Cloud — **could not retrieve**, HTTP 429 on both
  https://www.hetzner.com/cloud/ and https://www.hetzner.com/pressroom/new-cx-plans/

**This repo, at `1d0548f`**
- `.github/workflows/gates.yml` — triggers, `permissions: contents: read`, the
  `pull_request`-not-`pull_request_target` comment, the existing `upload-artifact` step
- `gh repo view mephistopheles4/stacks --json visibility` → `PUBLIC`
- `~/.claude/projects/C--Users-mephi-WebstormProjects-stacks/*.jsonl` — 5 files,
  63,568,114 bytes
