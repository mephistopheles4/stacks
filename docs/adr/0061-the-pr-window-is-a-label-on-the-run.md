# The PR window is a label on the run, and CI is the only place that can compute it

`stacks_run_info` gains a `pr_window` label: `#124, #125` for a window, `[]` for
an empty one, `unknown` when nothing could be read. It is derived **in CI**, by
`scripts/emit-metrics.ts`, from `git log <the previous record's commit>..HEAD`.

## Why it had to be built here at all

**Nothing in the rollout produced it.** The record ticket
([#157](https://github.com/mephistopheles4/stacks/issues/157)) never listed it,
the sync ([#158](https://github.com/mephistopheles4/stacks/issues/158)) never
listed it, and both the dashboard
([#159](https://github.com/mephistopheles4/stacks/issues/159)) and the deploy
print ([#161](https://github.com/mephistopheles4/stacks/issues/161)) name it as
something they show. [`docs/spec/trend-layer.md`](../spec/trend-layer.md) §6 says
in as many words that *"the PR window in panel 1 is the part that is specced"*.
So it is a gap between tickets rather than a decision anybody deferred, and #159
is where it surfaced because a panel cannot show what no record carries.

## Why in CI, and why on the run

**The dashboard is Prometheus and Grafana, and neither can run git.** Deriving
the window at read time would mean the page could not show it at all; deriving it
in the sync would put a different answer on the deploy print than on the page,
which is the two-answers shape [`metrics-record.ts`](../../scripts/lib/metrics-record.ts)
already refuses about *where the record lives*.

**On `run_info` rather than as a series**, because it is context and not a
measurement — and because *a score never appears without its run* is a layout
rule the page can only keep if the two arrive together. A series of its own would
also owe a `## Trends` row under G36, which would be a row for a thing that never
moves.

**Three values, and the third is the point.** `unknown` is not `[]`. An empty
window against a non-zero delta is the tool disagreeing with itself at a fixed
commit — the noise band the ratchet's floor must sit below — so spelling *no
answer* as *nothing merged* would manufacture that reading out of a shallow
checkout. The seam that decides it is `windowFrom` in
[`scripts/lib/pr-window.ts`](../../scripts/lib/pr-window.ts), a pure function over
commit subjects, and every way of failing to read the history arrives there as
one absent answer.

## What it costs

- **`fetch-depth: 0` on both halves of `metrics.yml`.** The default depth of 1
  has no range for `git log` to walk. ⚠️ It would not have failed loudly: the
  window would render `unknown` forever, honest and useless, and nobody would
  think to blame the checkout.
- **One more anonymous fetch per run**, of the `metrics` branch, through
  `fetchRecords` — the same code path the sync and the deploy staleness check
  use, so the *where* stays in one place.
- **The subject is the only evidence.** `(#180)` at the end of a squash-merge
  subject, or git's own `Merge pull request #124 from …`. A `#52` mentioned
  mid-subject is an issue reference and is deliberately not read as a merge; a
  pull request merged by any route that writes neither shape is invisible to
  this, and would read as `[]`.
- **Records written before this carry no window at all** — the label is absent
  rather than `unknown`, so Grafana shows no column for them until one arrives.
  Backfilling is not possible: the values would have to be invented for runs
  whose windows nobody recorded.

## How this was decided

Implementing #159, which cannot satisfy its own first acceptance criterion
without it. Flagged in that ticket's commit as the second place this work goes
past the spec's *"What lands where"* table — the dashboard artifact being the
first, which the ticket itself declared.
