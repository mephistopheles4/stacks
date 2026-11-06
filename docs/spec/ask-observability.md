# Ask the library: observability before launch

Issue [#541](https://github.com/mephistopheles4/stacks/issues/541). Standard tier.
Extends S11 of [`ask-the-library.md`](ask-the-library.md); C15 and S14 Q10 (counts
only) bind every line below. **Draft, waiting for the owner's proceed.**

## S1. Problem

Before the Worker goes public, the owner wants three answers the logs cannot give
today:

1. **What did AI cost today?** Lines carry `tokensIn` and `tokensOut`, which
   overstate spend once the model caches the prompt prefix (#540), and nothing sums
   them.
2. **Are a few visitors taking most of the day's budget?** Nothing in a line says
   how many questions its visitor had already asked.
3. **Is the service well?** `pnpm ask:status` prints yesterday's raw query reply,
   unverified live. Workers Logs keep 3 days (7 from December 1), so anything not
   read in time is gone.

## S2. What the Worker logs (one line per request, as now)

Every new field is a number. No new field can carry text.

- **`question`: 1 to 30**, the count `VisitorCounter` returns when it admits the
  request. It goes on every line after the limits pass: `ai`, `search-off`,
  `search-ai-failed`, `refused-data`. `count(question == k)` is the number of
  visitor-days that reached `k` questions, so the per-visitor distribution needs no
  key at all.
- **`neurons`** and **`tokensCached`**, summed over the question's model calls from
  each response's `usage.neurons` and `usage.prompt_tokens_details.cached_tokens`,
  read in `runModel` (`packages/ask/src/ai.ts`). Each is logged only when every call
  that ran gave a finite number. They go on **every line that spent**: `ai`, and
  `search-ai-failed` after a partial loop (it already carries the loop's stats).
- **`daily-pass` and `daily-fail`** carry the same `neurons`, `tokensCached`,
  `tokensIn` and `tokensOut`: the daily test spends about 56 Neurons a day.
- **`refused-limit` gains `limit: 'minute' | 'day' | 'error'`.** Today
  `withinLimits` turns a broken Durable Object or binding into the same `false` as
  a visitor at the cap, so a fault reads as busy.
- **The Worker never estimates Neurons from token rates.** The rates belong to the
  model, which #540 changes; an absent value stays absent and is counted (S3).
- `wrangler.jsonc` pins `observability.head_sampling_rate` to `1`, and
  `pnpm deploy:ask` refuses a config that does not, beside its `invocation_logs`
  refusal. A sampled log makes every count in this spec wrong, and silently.

**What the question number reveals (S7, Q1).** It holds no address and no key. It
does let a reader line up one visitor's run of questions within a day by number and
time, which on a quiet day is the same as reading one visitor's count. That is the
count the owner asked to see. Its blind spots are stated rather than fixed: an IPv6
/48 spread over many /64 keys reads as many light visitors, and a carrier's shared
address reads as one heavy one.

## S3. `pnpm ask:status`

**It prints, for each completed UTC day still in Workers Logs:**

- questions (lines carrying `question`), and outcomes by code and reason;
- Neurons: the sum, the number of spending lines with no `neurons`, and the
  cached share of input tokens;
- limit refusals by `limit`, and budget refusals (`reason: budget`) with the hour
  of the first;
- the distribution: visitor-days reaching 1, 5, 10, 20 and 30 questions, and the
  share of the day's Neurons spent on questions 11 to 30;
- the daily test's pass or fail, and health-down count.

**And writes one OpenMetrics record per day** to `.trend/local/<day>-ask.prom`, where
`<day>` is the UTC midnight that starts it, in unix seconds. `pnpm trend:sync`
already imports every `.trend/local/` record once, by name, into the local store.
These records never reach the `metrics` branch, so the trend layer stays
credential-free ([ADR-0055](../adr/0055-ci-writes-a-durable-record.md)), and
`deploy:site`'s freshness check (G39) never reads them: it reads the branch only.

**Retention, handled by backfill and by refusing to guess.** A record is imported
once and never corrected, so a wrong day is wrong for good. Each run therefore:

- writes **completed days only**, and only once **an hour** has passed since the
  day ended, for late-arriving lines;
- **never rewrites** a day that already has a file;
- **skips the oldest day** inside retention, which has partly aged out and would
  record too low;
- writes nothing for a day whose query failed, and says so.

So the owner runs it at least every 2 days now, and every 6 from December 1. A
missed day stays a visible gap (S4), never a low number.

**Series**, under a new prefix `stacks_ask_` in `METRIC_PREFIXES`, which no ratchet
or deploy reader matches: `day_recorded`, `outcomes{outcome,reason,limit}`,
`neurons`, `neurons_missing`, `tokens_in`, `tokens_cached`,
`visitors_reaching{question}` for 1 to 30, `neurons_by_band{band="1-10"|"11-20"|"21-30"}`,
`daily_test{result}`. Each sample is stamped at the day's midnight.

**The query and the reply.** The request is Workers Observability's telemetry query,
grouped by `outcome`, `reason`, `limit` and `question`, summing `neurons`,
`tokensIn` and `tokensCached`. Turning the reply into totals is one pure function,
tested on a fixture labelled *documented shape, not captured*. Whether the endpoint
accepts the query, and the reply's real shape, are **first-run unknowns** (S6).
The script reads `CLOUDFLARE_ACCOUNT_ID` through `loadEnv()`, which it does not
today.

## S4. The page

A second dashboard, `grafana/dashboards/ask.json`, provisioned read-only by the
existing provider ([ADR-0062](../adr/0062-the-dashboard-is-provisioned-from-the-repo.md)).
Panel 1 answers *is this real* before anything answers *is this bad*:

1. Days with a record, so a missed run is a gap and not a quiet day.
2. Neurons a day, with a line at about 8,000 (the $0.09 limit). Its note says the
   limit is a **sliding window**, so a budget refusal can come while the UTC day's
   total is under the line.
3. Questions a day, stacked by outcome.
4. Visitor-days reaching 1, 5, 10, 20 and 30 questions, and the share of Neurons on
   questions 11 to 30.
5. Limit refusals by `limit`, and budget refusals.
6. Daily test and health-down.

## S5. Alerts

**No new alert in code.** The Health Check stays the one alert (S11); a spent budget
is 200 there by design. Spend is capped by the gateway, so a trip costs availability
and never money, and `ask:status` shows the hour it tripped. Recommended for the
owner, outside the repo: a budget alert in Cloudflare's billing settings, if Unified
Billing offers one (**unverified; its name and its options are not read**). Revisit
after a week of real days.

## S6. Acceptance claims

| Claim | Holds when |
| --- | --- |
| C1 | Every line after the limits carries `question` equal to the counter's count, and no line before them does |
| C2 | `neurons` and `tokensCached` appear only as finite numbers, summed over the calls, on `ai`, `search-ai-failed`, `daily-pass` and `daily-fail`; one call without the value leaves the field out |
| C3 | `refused-limit` carries `minute`, `day` or `error` for each of the three paths, an error included |
| C4 | A canary question, address and response text appear in no log line (C15, extended to the new fields) |
| C5 | `deploy:ask` refuses a config without `head_sampling_rate: 1`, on `--dry-run` too |
| C6 | `ask:status`'s totals function turns the fixture into the printed totals and the record, and the record imports through the pinned `promtool tsdb create-blocks-from` |
| C7 | A run writes no file for today, for a day under an hour old, for the oldest day in retention, for a day already on disk, or for a failed query |
| C8 | `grafana/dashboards/ask.json` loads through the provider, read-only, with S4's panels in order |
| C9 | **First run, by the owner after deploy:** the query is accepted, and one day's `neurons` sum is within 5% of the `stacks-ask` gateway's own count, never above it (a call that loses the deadline race still costs) |

C9 is the one claim no test can hold, and it stays open until it has run.

## S7. Decisions for the owner

- **Q1. Exact question number, or bands?** Exact, my pick: bands lose
  `visitors_reaching` and protect nothing on a quiet day.
- **Q2. Retention by backfill (S3), or a store that keeps more?** Backfill, my pick.
  Workers Analytics Engine would keep 3 months for a new binding and a second store
  of visitor counts; a nightly Action would need a Cloudflare token in CI and end
  the trend layer's no-secret rule. Either can follow if hand runs prove too rare.
- **Q3. Reference figure for C9.** The `stacks-ask` gateway's count, read by hand at
  the first run, my pick. The account's Workers AI total also counts evals and local
  runs through other gateways.
- **Q4. Alerts.** As S5, my pick.
- **Q5. Pin the sampling rate (S2)?** Yes, my pick.

## S8. Trade-offs

- **Visibility against identity.** A question number per line is what makes goal 2
  answerable without a key; it takes the side of seeing, within S2's limits, on the
  owner's request. No business driver is named in the repo, so the cheaper to reverse
  decides: a field can be dropped in one deploy.
- **Hand runs against a scheduled job.** Gaps are possible; a scheduled job would
  need a secret. The gap is visible on panel 1.

## S9. Build order

1. Worker fields (C1 to C4), test first.
2. Sampling pin and `deploy:ask` refusal (C5).
3. `ask:status` totals, print and record (C6, C7).
4. Dashboard (C8). `docs/commands.md` updated in the same commit as each step.
5. After #540 merges: rebase, and fold a pointer to this spec into
   `ask-the-library.md` S11.

Not touched: `limits.ts`, `followups.ts`, `scripts/lib/ask-evals.ts`,
`scripts/evals-ask.ts` (#540's files). No new dependency.
