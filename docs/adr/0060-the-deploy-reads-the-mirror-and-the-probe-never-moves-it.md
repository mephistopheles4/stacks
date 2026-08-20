# The deploy reads the mirror, and the probe never moves it

`pnpm deploy:site`'s staleness check reads the `metrics` branch **as this machine
last fetched it** — `refs/remotes/origin/metrics`, the ref `pnpm trend:sync`
writes — and parses the record blobs out of the local object store. It reaches no
network on the happy path.

**When the refusal fires it spends exactly one anonymous fetch, into a different
ref.** `refs/remotes/origin/metrics-probe` exists so that asking *"does the branch
have rows I have not imported?"* cannot change the answer to *"is my store
stale?"*.

## Why the mirror is what "the local store" means

[`docs/spec/trend-layer.md`](../spec/trend-layer.md) §4 says the deploy reads the
local store, and §1 says `trend:sync` and this check **share the fetch, so exactly
one piece of code knows where the record lives**. The store proper is a Prometheus
TSDB inside a container and cannot be read without starting it; the mirror is what
the machine already has, is written only by a sync, and is exactly as stale as the
store is.

That is also what produces the pair the spec cares about: a stale mirror means
either *you have not synced* or *CI stopped writing* — one symptom, opposite
fixes — which is the fault the disambiguating fetch exists to split.

## Why the probe cannot use the same ref

Reusing `fetchRecords` would write `refs/remotes/origin/metrics`, the ref the
check just read. The next `deploy:site` would then see records the local
Prometheus never ingested and pass.

**The refusal would clear itself by being hit twice.** That is the *"the first
thing the new machinery teaches you is how to get past it"* failure the dated
bootstrap was designed to prevent, arriving through a different door — and worse
than an override, because there is no flag in shell history to show it happened.

So `trend:sync` moves the mirror and nothing else does.

⚠️ **A separate ref is not enough on its own, and the first implementation
shipped with the hole open.** Naming an explicit refspec does not stop git
*opportunistically* updating the remote-tracking branch a fetched ref would
normally land on: a probe into `origin/metrics-probe` was also fast-forwarding
`origin/metrics`, printing both lines of its own accord.

```
 * [new branch]      metrics    -> origin/metrics-probe
   d902779..a44b2ca  metrics    -> origin/metrics
```

`--refmap=` — an empty refmap — is what disables it. **Every test passed either
way**; it was found by running the refusal by hand and reading git's own output,
and the assertion that now holds it is a ref comparison across the refusal in
`gates/metrics-freshness.test.ts`.

## What it costs

- **A second remote-tracking ref that nothing prunes.** One ref, updated only on
  the refusal path, holding objects a sync would fetch anyway.
- **The mirror can be newer than the store, in one window.** A sync fetches
  before it backfills, so a run that died between the two leaves a mirror the
  TSDB does not match, and the deploy would call that fresh. The sync fails
  loudly when that happens and `--rebuild` is the recorded recovery; the
  alternative — reading `.trend/state.json` for the imported set — buys precision
  in that window at the cost of a second answer to *where the record lives*, which
  is the thing §1 spends this design's simplicity on avoiding.
- **It says nothing about a record edited in place on the branch.** Same
  limitation as [ADR-0059](./0059-the-sync-refuses-a-rewritten-record.md): tips
  and filenames are compared, content is not.

## How this was decided

The spec left *where the deploy reads from* to the implementation session, naming
only the property it had to preserve — one piece of code knowing where the record
lives. Chosen while building [#161](https://github.com/mephistopheles4/stacks/issues/161)
on the second point above: the self-clearing refusal was found by asking what the
second run of a failing deploy would do, and it is not a defect a test would have
reported, because every test would have passed.
