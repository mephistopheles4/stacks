# The reading half lands, and a count that said three

**2026-08-19.** `pnpm trend:sync` — [#158](https://github.com/mephistopheles4/stacks/issues/158),
the pull half of the trend layer, with surface D folded into it. The record has
been on the `metrics` branch since the spine landed that morning; this is the
first time anything has read it back.

**Nine committed records replayed into a local Prometheus, and the numbers came
back the same.** That is the entry: a record is only durable if something can
prove it replays.

---

## What it does

Fetches the orphan `metrics` branch, imports every record this machine has not
seen, asks the live origin what it is serving, and restarts the store. By hand,
never on a schedule — a second scheduled thing that can silently stop is the
failure class this design spends its budget containing, and a laptop cron would
leave no Actions history to inspect afterwards.

| Piece | Where |
| --- | --- |
| where the record lives, and which of it is new | `scripts/lib/metrics-record.ts` |
| the join, and surface D's row | `scripts/lib/metrics.ts` |
| the origin probe, shared with `deploy:site` | `scripts/lib/edge-probe.ts` |
| the store, the state, the container | `scripts/trend-sync.ts` |

Three of those four have an in-process oracle, which is the lesson from the last
entry applied rather than repeated: the parts with logic were extracted so a
spec could reach them, and the part that drives git, Docker and the network is
the one that is excluded from the mutation scope with a named mechanism.

## The replay, demonstrated

`promtool` wrote **4 blocks from 9 records**, and the store answers:

```text
stacks_trend_mutation_score @ 1787146512
  packages/core/src            0.7171964140179299
  packages/cli/src             0.45588235294117646
  scripts                      0.5373665480427047
```

Those are the first nightly's figures to the digit — 71.7196%, 45.5882%, 53.74%
— [read back out of a store built from git](./2026-08-19-the-first-nightly-caught-its-own-author.md)
rather than out of the run that produced them. Running the sync again imports
nothing **from the branch** — the only record a second run adds is the one D
just wrote, because the import is idempotent and the probe is deliberately not.

⚠️ **The join is the part that had to be got right, and it was measured before
it was written.** `# EOF` terminates an OpenMetrics document, so a naive
concatenation is *"unexpected data after # EOF"* and **no block is written at
all** — not a partial ingest. Same for a stray `\r`, which is *"invalid metric
type \"gauge\r\""* over the whole file. The join owns both: every terminator is
dropped and exactly one appended, and everything is written LF.

## Surface D, live

Against the real origin, with the local `dist/` stamped as the last deploy left
it:

| Asked | Answered |
| --- | --- |
| serving the build I published? | `stacks_edge_build_current 1`, `run_ok{surface="edge"} 1` |
| the same, with a stamp nothing serves | `build_current 0`, **outcome `stale`** — a real answer and a red one |
| refused by bot protection | `run_ok 0`, **no build sample at all** — covered by spec, not reproducible on a zone that now allows the check |

**D's rows are written to `.trend/local/` and never to the branch**, which is
what keeps both ends credential-free. The cost is that D's history lives on one
machine, and `--rebuild` replays those rows from disk for exactly that reason:
the branch can rebuild every CI series, and nothing can rebuild D's.

`run_ok` carries `surface="edge"` where CI's carries no label. Same metric name,
so *did the pipe work* answers over both; different label set, so Prometheus
holds them as different series and a local probe can never dilute a CI run's
health.

## The count that said three

The ticket flagged a live ambiguity rather than letting it be guessed: §3 of the
spec names **four** series, and §4's staleness table bounds *"the three
nightly-written ones"* plus surface D. Both cannot be right.

**Resolved: the bound covers all four CI-written series, and D takes no `##
Trends` row.** The two readings of *"three"* — a miscount, or *the three written
**only** by the nightly*, with `gate-suite-runtime` bounded by the paragraph
that says the bound is a multiple of the nightly and never of pushes — reach the
same operational endpoint, so the endpoint is what was written down, in
[`docs/spec/trend-layer.md`](../spec/trend-layer.md) §4 and in `docs/gates.md`.

The half that is load-bearing is D: a Trends row for it would make **G36's
reverse direction red against every CI run**, because CI emits no such series.
So D's samples live under a third metric prefix, `stacks_edge_`, which G36
structurally cannot see — the same move that keeps `run_ok` out of that table,
rather than an exception list a gate would have to maintain.

## Two decisions the spec left open

- **The store is a pinned container the sync owns** —
  [ADR-0058](../adr/0058-the-trend-store-is-a-container.md). `promtool` and the
  server come from one image because a version disagreement between them
  surfaces as *the sync worked and the dashboard is empty*. Retention is set to
  ten years explicitly: the default fifteen days would delete the replay this
  command exists to perform, quietly, hours later.
- **A rewritten record is refused** —
  [ADR-0059](../adr/0059-the-sync-refuses-a-rewritten-record.md). §8 recorded
  this as a candidate and left adopting it to the implementation session.
  Adopted: the sync already persists per-record state, so the tip is one more
  field and the check is one `merge-base --is-ancestor`. Demonstrated by pointing
  the stored tip at a commit on `main` — it refuses and imports nothing.

## What this found and did not fix

⚠️ **The cover check reads a missing `content-length` as zero bytes served.**
Cloudflare answers a `HEAD` for a path this build does not have with **200 and
no `content-length`**, so `served === 0` and the cover is reported as served at
another build's size. Measured while demonstrating D against a fixture `dist/`:
six of six covers reported stale, and none of them exists on the origin at all.

The behaviour is **pre-existing and unchanged** — the comparison moved out of
`scripts/deploy.ts` into `lib/edge-probe.ts` byte for byte — so this is a
finding rather than a regression. It is left alone deliberately: *unmeasurable*
and *stale* are a distinction worth drawing, and drawing it wrong in the other
direction would let a genuinely stale cover pass. It wants its own change, with
its own red to observe.
