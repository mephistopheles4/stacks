# The trend store is a pinned container the sync owns

`pnpm trend:sync` creates and drives a `stacks-prometheus` container from a
**pinned `prom/prometheus` image**, keeps its data under `.trend/` in the repo,
and takes `promtool` from that same image. **Docker is therefore a requirement
of the reading half**, and a `promtool` already on the PATH is deliberately not
used.

The record itself is unaffected: it is git, and
[ADR-0055](./0055-ci-writes-a-durable-record.md) owns that half. This record is
only about the store the record is replayed into.

## Why one image rather than whatever is installed

**`promtool` writes TSDB blocks and Prometheus reads them.** The two are one
program's halves, and a version disagreement between them does not announce
itself: the backfill exits 0, the blocks land, and the dashboard is empty. That
failure reads as *the sync did not work* when the sync worked perfectly — the
shape this whole layer exists to refuse, arriving in the layer's own plumbing.
Taking both from one pinned tag makes it unrepresentable rather than unlikely.

**Pinned, for the reason every other tool here is pinned.** A tag is mutable. A
store that changes under you is not a record of anything, and the calibration
window the ratchet's floors depend on is twenty runs long — long enough for an
image to move twice.

## What it costs, stated rather than discovered

- **Docker is required**, and a maintainer with a native Prometheus cannot point
  this at it. That is a real cost and it is one maintainer's, on a command that
  is run by hand; the alternative is two code paths, of which only one would ever
  be exercised here.
- **The container is the sync's to stop and start.** Prometheus holds a lock on
  its data directory, so the backfill happens with the store down — which is what
  *"restarts Prometheus"* means in the spec, and what makes new blocks visible
  without waiting for a reload.
- **Retention is set to ten years, explicitly.** Prometheus defaults to fifteen
  days, which would delete the replay this command exists to perform — quietly,
  some hours later, so the sync that imported two weeks would look like it
  worked. A default that eats the artifact is worth one flag.

## What was considered

**A `promtool` on the PATH, with the container only for the server.** Rejected on
the version-skew argument above: it reintroduces exactly the disagreement the
single image removes, and buys only the ability to skip one `docker run`.

**A native Prometheus install, managed by hand.** Rejected because *"restart
Prometheus"* then means managing somebody's service manager from a pnpm script,
on three platforms, and a sync that cannot restart the store cannot guarantee the
blocks it just wrote are visible.

## How this was decided

Implementing [#158](https://github.com/mephistopheles4/stacks/issues/158). The
spec ([`docs/spec/trend-layer.md`](../spec/trend-layer.md) §1) names `promtool`
and a local Prometheus and does not say where either comes from; the environment
finding it rests on was itself measured against `prom/prometheus` in Docker
([`docs/progress.md`](../progress.md)), which is what made the single-image
answer the obvious one to check first.
