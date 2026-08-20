# The deploy reads the record, and the exit code proved nothing

2026-08-19 — [#161](https://github.com/mephistopheles4/stacks/issues/161), the
third row of the [after-the-scoreboard rollout](https://github.com/mephistopheles4/stacks/issues/154).

`pnpm deploy:site` now prints the trend record and refuses on a stale one, per
series. **G39 (`metrics-freshness`)**, *Defect gates*. Four things came out of
building it that the spec could not have known, and one of them is a hole this
session put in its own gate and then found by planting.

## The exit code asserted nothing, and five tests were green on a deleted refusal

The gate drives the real `scripts/deploy.ts` against a scratch repository via
`GIT_DIR`, which is G17 (`deploy-branch`)'s idiom. That harness works by pointing
`STACKS_VAULT` at nothing: whatever the check under test decides, the script stops
one line later, so nothing runs a gate suite or reaches the network.

**The sentinel is itself a refusal, and both exit 1.** So `expect(status).toBe(1)`
is equally true of a deploy that refused on the record and of one that ignored the
record entirely and fell over on the vault. Planted by replacing `fail(message)`
with `console.warn` — the whole refusal gone, the message still printed — and
**all ten tests passed.**

The discriminating fact is that the vault refusal was **never reached**, which is
what G17 asserts and what this file had not copied across:

```ts
function expectRefused(status: number, output: string): void {
  expect(status).toBe(1);
  expect(output).not.toContain(PAST_THE_CHECK);
}
```

Five tests go red on the same plant now. ⚠️ **Worth stating plainly: the gate was
written, run, and green, and it was a gate against nothing for that half hour.**
It is the same shape as every row in `docs/gate-register.md`'s vacuous-green
category, produced in the act of writing a gate whose file header cites that
category.

## The panel's subject is the newest scored run, not the newest record

Written against the real `metrics` branch, which by then held eleven records. Ten
of them are `push: main` rows carrying **one** series — `metrics.yml` legitimately
writes a merge row with a suite wall-clock and nothing else — and the only row
with per-scope scores is a `workflow_dispatch` twelve hours back.

So the first version printed *"no mutation-score samples in the newest record"*
over a store holding eight perfectly good scores. **A score never appears without
its run**, which the spec states as a layout rule; the correction is that the run
panel 1 names has to be *the run that scored*, and the PR window has to be
measured between **that** pair. Measuring it between the two newest records would
attribute a movement to pull requests that had nothing to do with it.

## The disambiguating fetch must not move the mirror

The refusal spends one anonymous fetch to tell *you have not synced* from *CI
stopped writing*. The obvious implementation reuses `fetchRecords`, which writes
`refs/remotes/origin/metrics` — **the very ref the staleness check reads.**

That would make the refusal clear itself by being hit twice: the second
`deploy:site` sees rows the local Prometheus never ingested, and publishes. It is
the *"the first thing the machinery teaches you is how to get past it"* failure
the dated bootstrap exists to prevent, arriving through a different door. The
probe fetches into `refs/remotes/origin/metrics-probe` and `pnpm trend:sync` is
the only thing that moves the mirror. [ADR-0060](../adr/0060-the-deploy-reads-the-mirror-and-the-probe-never-moves-it.md).

⚠️ **And the separate ref did not close it, which is the part worth carrying.**
Naming an explicit refspec does not stop git *opportunistically* updating the
remote-tracking branch a fetched ref would normally land on. The probe was
fast-forwarding the mirror anyway, and said so in its own output:

```
 * [new branch]      metrics    -> origin/metrics-probe
   d902779..a44b2ca  metrics    -> origin/metrics
```

`--refmap=` disables it. **Every test passed either way** — the refusal is
correct on the run you are looking at, and wrong on the next one, which is not a
state a single-invocation test can see. Found by running the three refusals by
hand to paste their text into this file, and reading the two lines above them.
The assertion that holds it now compares the mirror across the refusal.

## The number is G39, and the spec said G38 in four places

Row numbers are derived from landing order. `agents-import` (G37) landed between
the two tickets that pre-allocated numbers for this rollout, so `mutation-scope`
took G38 and this row moved by one. **That is the fourth pre-allocated number on
this effort to be wrong**, after the three the rollout issue already counts —
including one allocated twice, five seconds apart, by two sessions from the same
map.

## What could not be planted, and where it went instead

The dated bootstrap expires on a calendar day and **the deploy cannot be told what
day it is.** *Prints at 2 days, refuses at 4* is therefore observed against
`judgeRecord` in `scripts/lib/metrics-read.test.ts`, not through the script.

What the gate asserts instead is that the script's behaviour **agrees with that
judgement today**. An assertion of *does not refuse* would have been a green that
quietly became false on 2026-08-22 — a gate decaying inside the rollout built to
catalogue decay.

## Observed red

Five plants, all reverted, recorded in [`docs/gate-register.md`](../gate-register.md)'s
G39 entry with what each one printed. In summary: an aggregate freshness bound in
place of the per-series one; a series with no sample treated as fine; the bound
widened from 3 days to 90; the two disambiguation messages swapped; and the
refusal downgraded to a warning.

The first three are the weakenings the spec's gaming section grades, and the
fourth is the one that would do the most damage in practice — it sends somebody
to look at CI while their own store is what is behind.
