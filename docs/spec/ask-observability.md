# Ask the library: observability before launch

Issue [#541](https://github.com/mephistopheles4/stacks/issues/541). Standard tier.
Extends S11 of [`ask-the-library.md`](ask-the-library.md); C15 and S14 Q10 (counts
only) bind every line below. **Signed off by the owner on 2026-11-06** ("Yes, build it") on revision 2, after
the spec round (the executability, unstated and data lenses), with the picks in S8
and the answers recorded there.

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

Every new field is a number or a fixed word. No new field can carry text.

- **`question`: 1 to `DAILY_LIMIT`**, the count `VisitorCounter` returns when it
  admits the request. It goes on every line after the limits pass: `ai`,
  `search-off`, `search-ai-failed`, `refused-data`. `count(question == k)` is the
  number of visitor-days that reached `k` questions, so the per-visitor
  distribution needs no key at all.
- **`neurons`** and **`tokensCached`**, summed over the question's model calls from
  each response's `usage.neurons` and `usage.prompt_tokens_details.cached_tokens`,
  read in `runModel` (`packages/ask/src/ai.ts`). **They count calls that
  returned**: usage is read before the blank check, so a blank answer counts; a
  timed-out call never returns and its spend is unknown; a 2045 refusal spends
  nothing. So `neurons` is a lower bound whenever `reason` is `timeout`. Each is
  logged only when every returned call gave a finite number, and goes on every
  line that spent: `ai`, and `search-ai-failed` after a partial loop.
- **`daily-pass` and `daily-fail`** carry the same fields, `tokensIn` and
  `tokensOut` too: the daily test spends about 56 Neurons a day.
- **`refused-limit` gains `limit: 'minute' | 'day' | 'error'`.** Today
  `withinLimits` turns a broken Durable Object or binding into the same `false` as
  a visitor at the cap, so a fault reads as busy. The rework keeps it
  fail-closed: every one of the three is a 429 with no model call (C3).
- **The Worker never estimates Neurons from token rates.** The rates belong to the
  model, which #540 changes; an absent value stays absent and is counted (S3).
- `wrangler.jsonc` pins `observability.head_sampling_rate` to `1`, and
  `pnpm deploy:ask` refuses a config that does not, beside its `invocation_logs`
  refusal. A sampled log makes every count in this spec wrong, and silently.

**What the question number reveals (S8, Q1).** It holds no address and no key, and
because the counter's key includes the day, nothing links across days. Within a
day it does link: with the time, `ms` and the existing `tokensIn`, which grows with
the question's length and the conversation's memory, a reader of the account's
Workers Logs can chain one visitor's run of questions, on a busy day as well as a
quiet one. That chain is what goal 2 asks to see. Its blind spots are stated rather
than fixed: an IPv6 /48 spread over many /64 keys reads as many light visitors, and
a carrier's shared address reads as one heavy one.

**The public notice changes with it.** `/privacy` says a hashed address "is counted
for a day to limit use". The build adds one sentence: each question is logged with
a number, how many have been asked from that address that day, with no address, for
a few days, and daily totals are kept. `ask-the-library.md` S4's "Not stored" line
gets the same, after #540 merges (S10 step 6).

## S3. `pnpm ask:status`

**It prints, for each completed UTC day still in Workers Logs:**

- questions (lines carrying `question`), and outcomes by code, `reason` and
  `limit`, `timeout` among them;
- time: the average and the largest `ms` on `ai` lines;
- Neurons: the sum, the number of spending lines with no `neurons`, and the cached
  share of input tokens, counted over lines that carry both `tokensIn` and
  `tokensCached`;
- the distribution: visitor-days reaching 1, 5, 10, 20 and 30 questions, and the
  share of the day's Neurons spent on questions 11 and up. **That share is a lower
  bound** on what heavy visitors take: a visitor who reached 20 also spent on
  questions 1 to 10;
- the daily test's pass or fail, `refused-secret`, and health-down count.

**The queries.** Workers Observability's telemetry query, `calculations` view: one
grouped by `outcome`, `reason`, `limit` and `question`, counting and summing
`neurons`, `tokensIn`, `tokensCached` and `ms`; one counting spending lines that
carry `neurons`. Each sets an explicit group limit, and **a reply with as many
groups as the limit is refused** as possibly cut off (owner, 2026-11-06). Turning the replies into totals
is one pure function, tested on a fixture labelled *documented shape, not captured*,
and it **refuses any reply whose shape differs from the fixture's**: a missing key,
an unknown key, or a value that is not a finite number. A refused reply writes no
record.

**Printing.** On a refused or failed query it names the day and the HTTP status
only, never the reply body, the request or its headers. It no longer prints the raw
reply.

**The wrangler child.** The script takes its login token from
`wrangler auth token`, today with wrangler's usage telemetry on by default, which
nothing approved ([ADR-0116](../adr/0116-wrangler-is-a-pinned-dev-dependency.md)).
The child runs with `uploadEnv(process.env, loadEnv())` from `scripts/lib/upload.ts`,
so `WRANGLER_SEND_METRICS` is `false` and `.env`'s other keys stay out. The script
reads `CLOUDFLARE_ACCOUNT_ID` through `loadEnv()`, which it does not today.

**Measured at build, 2026-11-06:** every query answered 403 with the `wrangler login`
token, whose OAuth scopes include no Workers Observability scope. So the script takes
`ASK_STATUS_TOKEN` from `.env` first, an API token with Workers Observability read and
nothing else, never passed to wrangler, and falls back to the login.

**Records, only when asked.** With `--record` it also writes one OpenMetrics record
per day to `.trend/local/<day>-ask.prom`, where `<day>` is the UTC midnight that
starts it, in unix seconds. `pnpm trend:sync` already imports every `.trend/local/`
record once, by name. These records never reach the `metrics` branch, so the trend
layer stays credential-free
([ADR-0055](../adr/0055-ci-writes-a-durable-record.md)), and `deploy:site`'s
freshness check (G39) never reads them: it reads the branch only. **The owner passes
`--record` only after C9 has passed once**: until then a run only prints, so a wrong
parse cannot become a wrong day.

**One store.** Each checkout has its own `.trend/`, so `--record` **refuses from a
linked worktree** (its git dir differs from the common dir), naming the main
checkout. A day written in a worktree would vanish with it.

**Retention, handled by backfill and by refusing to guess.** Log retention is one
constant with its change date: 3 days before 2026-12-01, 7 from then. A day
`[start, start + 24 h)` is written only when:

- it ended at least **an hour** ago, for late-arriving lines;
- its start is **later than** now minus the retention, so the oldest, partly aged-out
  day is skipped;
- it has **no file** already: a day is never rewritten;
- both its queries were accepted, and each reply passed the shape check and the
  group-limit check.

So the owner runs it at least every 2 days now, and every 6 from December 1. A
missed day stays a visible gap (S4), never a low number.

**Undoing a wrong record:** delete its file, then `pnpm trend:sync --rebuild`. The
day can be written again only while its logs are inside retention.

**Series**, under a new prefix `stacks_ask_` in `METRIC_PREFIXES`, which no ratchet
or deploy reader matches: `day_recorded`, `outcomes{outcome,reason,limit}`,
`neurons`, `neurons_missing`, `tokens_in`, `tokens_cached`, `ms_avg`, `ms_max`,
`visitors_reaching{question}` for 1 to `DAILY_LIMIT`,
`neurons_by_band{band="1-10"|"11-20"|"21-30"}`, `daily_test{result}`. Each sample is
stamped at the day's midnight. No label carries an account id or an endpoint. The
names are permanent once imported. The records hold daily totals only; they stay on
the owner's disk and in the local store, which keeps 10 years, until deleted as
above. On a day with one visitor, `visitors_reaching` is that visitor's count.

## S4. The page

A second dashboard, `grafana/dashboards/ask.json`, provisioned read-only by the
existing provider ([ADR-0062](../adr/0062-the-dashboard-is-provisioned-from-the-repo.md)).
Panel 1 answers *is this real* before anything answers *is this bad*:

1. Days with a record, so a missed run is a gap and not a quiet day.
2. Neurons a day, with a line at 8,182 (the $0.09 limit at $0.011 per 1,000).
   Its note says the limit is a **sliding window**, so a budget refusal can come
   while the UTC day's total is under the line.
3. Questions a day, stacked by outcome, with timeouts and `ms` beside it.
4. Visitor-days reaching 1, 5, 10, 20 and 30 questions, and the share of Neurons on
   questions 11 and up, noted as a lower bound.
5. Refusals: by `limit` (with `error` drawn apart, as a fault), budget, and
   `refused-secret`.
6. Daily test and health-down.

## S5. Alerts

**No new alert in code.** The Health Check stays the one alert (S11 of the parent
spec). It runs the daily test straight through the answer code, so it cannot see
the visitor's path. These leave it green:

| Fault | Seen in | Owner learns |
| --- | --- | --- |
| Spent budget (sliding window) | `reason: budget`, panel 5 | at the next hand run |
| Missing or wrongly rotated Turnstile secret | `refused-secret`, `refused-turnstile`, panel 5 | at the next hand run |
| Broken counter or rate binding | `limit: error`, panel 5 | at the next hand run |

The next hand run is at most 2 days away, 6 from December 1. A spent budget costs
availability and never money, since the gateway caps the bill. Recommended for the
owner, outside the repo: a budget alert in Cloudflare's billing settings, if Unified
Billing offers one (**unverified; its name and its options are not read**). Revisit
after a week of real days.

## S6. Where it runs

| Part | Runs on | Needs |
| --- | --- | --- |
| The Worker | Cloudflare's workerd; tests use fakes | nothing new |
| `ask:status` | the owner's Windows host, from the main checkout | network, `wrangler login`, `CLOUDFLARE_ACCOUNT_ID` in `.env` |
| `trend:sync`, promtool, Grafana | Docker on the host | Docker |
| The suite | athanor's offline Linux container | nothing new |

**End to end:** deploy, wait for a full UTC day plus an hour, `pnpm ask:status`
prints it, C9 is checked by hand, then `pnpm ask:status --record` writes it,
`pnpm trend:sync` imports it, and panel 1 shows that day.

## S7. Acceptance claims

| Claim | Holds when | Checked by |
| --- | --- | --- |
| C1 | Every line after the limits carries `question` equal to the counter's count, and no line before them does | suite |
| C2 | `neurons` and `tokensCached` appear only as finite numbers summed over returned calls, a blank one included, on `ai`, `search-ai-failed`, `daily-pass` and `daily-fail`; a returned call without the value leaves the field out | suite |
| C3 | Each of `minute`, `day` and `error` (a thrown binding, a thrown counter, a malformed counter reply) answers 429, makes no model call and logs `refused-limit` with that `limit` and no other text | suite |
| C4 | Canary values for the question, the address, the response text, a long `VISITOR_KEY` and the computed visitor key appear in no log line, on every path including the three limit paths (C15, extended) | suite |
| C5 | `deploy:ask` refuses a config without `head_sampling_rate: 1`, on `--dry-run` too | suite |
| C6 | The totals function turns the fixture into the printed totals and the record, and refuses each reshaped reply (a missing key, an unknown key, a non-number) and a reply at the group limit, with no file written; the wrangler child's environment has `WRANGLER_SEND_METRICS=false` | suite |
| C7 | A run writes no file without `--record`, from a linked worktree, for today, for a day under an hour old, for the oldest day in retention (at the December 1 boundary too), for a day already on disk, or for a refused query | suite |
| C8 | `ask.json`'s panels are S4's, in order, and the provider loads it read-only | suite (parses the file); the import is a host check |
| C9 | The record imports through the pinned `promtool tsdb create-blocks-from` into a scratch store, never the real one | host, by the builder |
| C10 | **First run, by the owner, after deploy:** the query is accepted; `neurons` appears on spending lines; the day's `neurons` sum, daily test included, priced at $0.011 per 1,000, is within 5% of the `stacks-ask` gateway's own cost for that day and not above it; one stored event read in full carries no field from the client beyond S2's | owner, by hand |

**Stop conditions.** If C10 fails, or `neurons` is on no line, no `--record` run
happens: it comes back to the owner with what was seen. The first-run unknowns are
the endpoint accepting both queries, the reply's real shape and group limit, and
whether `usage.neurons` and `usage.prompt_tokens_details.cached_tokens` exist on the
binding's response at all. **No saved response holds either field**: every Neuron
figure this project has recorded was worked out from token counts.

## S8. Decisions for the owner

**Answered on 2026-11-06: the owner took every pick below** ("Yes, build it"). Also
answered: the security pair (`adversarial-lens`, `data-lens`) runs at Test with the
QA pair, in place of the standards pair; the group-limit refusal is built (S3); the
run-time check that `question` is a whole number from 1 to 30 is not (Hardening,
declined). #540 is now pull request #544.

- **Q1. Exact question number, or bands?** Exact, my pick. The alternative keeps
  every printed figure: a band per line (1–10, 11–20, 21–30) plus a marker only on
  the lines where the count reaches 1, 5, 10, 20 or 30. It loses the 1-to-30 series
  and weakens the chain S2 describes, without breaking it, since `tokensIn` and the
  time remain.
- **Q2. Retention by backfill (S3), or a store that keeps more?** Backfill, my pick.
  Workers Analytics Engine would keep 3 months for a new binding and a second store
  of visitor counts; a nightly Action would need a Cloudflare token in CI and end the
  trend layer's no-secret rule. Either can follow if hand runs prove too rare.
- **Q3. C10's reference figure.** The `stacks-ask` gateway's cost for the day, read
  by hand, my pick. The account's Workers AI total also counts evals and local runs.
- **Q4. Alerts.** As S5, my pick.
- **Q5. Pin the sampling rate (S2)?** Yes, my pick.
- **Q6. The `/privacy` sentence (S2).** Add it, my pick; it ships with the Worker.
- **Q7. Does this wait for #540?** No, my pick: it touches none of #540's files. The
  S11 and S4 pointers in `ask-the-library.md` land in a commit after #540 merges,
  in this pull request if it is still open, else a small follow-up.
- **Q8. Must C10 pass before the site goes public?** No, my pick: it gates
  `--record`, not launch. The Worker's counts are in the logs from the first request.

## S9. Trade-offs

- **Visibility against identity.** The question number is what makes goal 2
  answerable without a key; it takes the side of seeing, within S2's limits, on the
  owner's request. No business driver is named in the repo, so the cheaper to
  reverse decides: a field can be dropped in one deploy, and a record deleted.
- **Hand runs against a scheduled job.** Gaps are possible; a scheduled job would
  need a secret. The gap is visible on panel 1.

## S10. Build order

1. Worker fields and the fail-closed limits (C1 to C4), test first.
2. Sampling pin and `deploy:ask` refusal (C5).
3. `ask:status`: queries, shape check, print, `--record` (C6, C7); `AGENTS.md`'s
   command line and `docs/commands.md` updated with it.
4. Dashboard (C8, C9).
5. The `/privacy` sentence (Q6).
6. After #540 merges: rebase, and fold pointers to this spec into
   `ask-the-library.md` S4 and S11.

Each step ends with `athanor run`, `athanor run lint` and `athanor run build` green.
At Test the QA pair (`behaviour-lens`, `integrity-lens`) and the security pair
(`adversarial-lens`, `data-lens`) run, on the owner's choice.

Not touched: `limits.ts` (read for `DAILY_LIMIT` only), `followups.ts`,
`scripts/lib/ask-evals.ts`, `scripts/evals-ask.ts` (#540's files). No new
dependency.
