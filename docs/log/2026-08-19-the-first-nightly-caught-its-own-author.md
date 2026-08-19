# The first nightly caught its own author

**2026-08-19.** The trend layer landed in [#169](https://github.com/mephistopheles4/stacks/pull/169)
and ran for the first time an hour later. Its first four-series row moved one
scope by 6.45 points, and the cause was a comment in that pull request that was
not true.

**A gate cannot see an untested file. A number can.** That is the whole entry.

---

## What the first two runs produced

The squash to `main` fired the merge half; a `workflow_dispatch` fired the
nightly twenty minutes later. Both wrote to the orphan `metrics` branch.

| | merge | nightly |
| --- | --- | --- |
| `gate-suite-runtime` | 11 s | 9 s |
| `mutation-run-runtime` | — | **1275 s** (21 min) |
| `live-exclusions` | — | 0 of 27 declared |
| `run_ok` | 1 | 1 |

**The 360-minute ceiling is generous, not tight.** The Stryker run used 6% of
it, on a 2-core `ubuntu-latest` runner against a wall-clock only ever measured on
the owner's workstation. That was the open question when the nightly was
dispatched, and it is now a number rather than a worry — which is what
`mutation-run-runtime` exists for.

## Five scopes reproduced exactly; two moved without a source change

Against [#165](https://github.com/mephistopheles4/stacks/pull/165)'s measurement
at the same commit:

| Scope | #165 | first nightly | |
| --- | --- | --- | --- |
| `packages/core/src` | 71.72% | 71.7196% | exact |
| `packages/core/src/adapters` | 66.94% | 66.9399% | exact |
| `packages/core/src/covers` | 62.27% | 62.2718% | exact |
| `packages/core/src/import` | 66.02% | 66.0156% | exact |
| `packages/cli/src` | 45.59% | 45.5882% | exact |
| `packages/core/src/metadata` | 62.25% | 62.1481% | **−0.10** |
| `packages/site/src/shelf` | 46.84% | 46.9062% | **+0.07** |
| `scripts` | 60.19% | **53.74%** | **−6.45** |

**The two small movers are the tool disagreeing with itself at a fixed commit**
— [stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073),
which [`trend-layer.md`](../spec/trend-layer.md) §2 says a nightly re-measures
forever. It is now **measured at ≈±0.1 points** rather than assumed, and that
band is the number [`the-ratchet.md`](../spec/the-ratchet.md)'s floor has to sit
below.

⚠️ **One nightly is one sample.** ±0.1 is the first observation of that band, not
its width. The calibration window is 20 runs for exactly this reason.

## The −6.45 was a false comment, and only a number could see it

#169 extracted the scoring arithmetic out of `scripts/mutation-scopes.ts` into
`scripts/lib/mutation-score.ts`, and justified keeping the new file inside the
mutation denominator like this:

> `gates/trend-layer.test.ts` imports this module in-process, so it is reachable
> now

**It does not.** That gate imports `scripts/lib/metrics.ts`; the `mutation-score`
strings in it are the *trend name*, not an import. The only importers were
`emit-metrics.ts` and `mutation-scopes.ts` — both excluded from the scope, both
run by `tsx` rather than as a Vitest spec.

So a module computing every number this rollout reads had **no in-process oracle
at all**. Measured directly, at the merge commit:

```text
$ npx stryker run --mutate "scripts/lib/mutation-score.ts"
INFO DryRunExecutor No tests were found
ERROR Stryker No tests were executed.
```

**Not a low score — no related test whatsoever.** In the full run that manifests
as every mutant `NoCoverage`, which is what dragged the scope down.

### Why nothing else caught it

- **Not the diff.** The claim is a sentence in a header comment, and it is the
  kind of sentence that is true of the file beside it (`walk.ts` really is
  reachable that way). It reads as correct.
- **Not a review.** Two review axes and a CodeRabbit pass ran over that PR and
  produced nine findings between them. None was this one, because none of them
  resolves an import graph against a claim about an import graph.
- **Not a gate, and this is the structural point.** G19 asserts every gate is
  scored; G1 asserts every filesystem reach is allowlisted. **No gate in this
  repo can assert that a file has a test**, and one that tried would be the
  coverage metric this project has banned since its first scoreboard.

**The instrument found what the instruments could not.** That is the argument for
the trend layer stated as an event rather than as a design intention — and it
happened on the layer's first run, against the pull request that built it.

## The repair

`scripts/lib/mutation-score.test.ts` — an **ordinary unit test, not a gate**, and
it takes no `docs/gates.md` row. That is why it could not live in `gates/`, where
G19 requires every file to be scored; `vitest.config.ts` gained
`scripts/**/*.test.ts` instead, which had been an empty directory in the test
config since the project started.

The file scores **70.93%** with an oracle (61 killed, 20 survived, 5 no-coverage
of 86 mutants, 2.66 tests per mutant), against no measurable score at all.

**And the scope arithmetic closes exactly, which is the check that matters.**

| | mutants | detected | score |
| --- | --- | --- | --- |
| `scripts`, first nightly | 562 | 302 | **53.74%** |
| `scripts`, with the spec | 562 | 363 | **64.59%** |

**363 − 302 = 61 — precisely the 61 mutants the new spec kills.** The mutant
population does not move, because a `*.test.ts` is negated out of `mutate`; only
the numerator does. A reconciliation rather than a plausible improvement, which
is the difference between a measurement and a number that went the right way.

⚠️ The scope now sits **above** the 60.19% #165 recorded, because the two files
this rollout added to it — `lib/metrics.ts` and `lib/mutation-score.ts` — both
score above the scope's old average. **That is not a repair of the old figure**;
it is a different population.

## A second observation, weaker and worth writing down anyway

`packages/core/src/adapters` produced **366 mutants** in #165 and in the first
nightly, and **365** in the local run above. No file in that scope changed.

⚠️ **#165 says the mutant *count* is the stable thing** — *"the mutant count is
1503 either way, which is the number that would have signalled a scoping error
rather than a timeout one"*. This is one observation against that, and **the
cause is not established**: the two runs differ by machine and platform as well
as by run, so *"counts drift between runs"* and *"counts differ across
platforms"* are both consistent with it and this cannot separate them.

Recorded as an open question rather than a finding, because a count that can move
by itself weakens a claim the ratchet will lean on. **The nightly is the
instrument that settles it** — same runner, same platform, twenty runs.

One mutant also came back `Errors: 1` in the local run, unattributed.

⚠️ **Excluding it instead would have been permissible and wrong.**
`stryker.scopes.json`'s governing rule — *a file is excluded because a named
mechanism puts it out of reach, or it is not excluded* — would have been
satisfied by *"no spec imports it"*, the same mechanism thirteen other entries
carry. And the `scripts` score would have gone **up**. That is the gaming
category this whole rollout is arranged against, available in one JSON entry,
with the number moving the right way. The gap was real; filling it was the
answer.

⚠️ **A spec under `scripts/` must not touch the filesystem.**
`scripts/lib/repo-root.ts` resolves from `process.cwd()`, and Stryker's sandbox is
not the repository — so a spec that reads a real file passes under `pnpm test`
and fails inside the sandbox, reading as a mutation-run fault rather than as a
spec that made an assumption. It is the same trap that keeps `gates/` out of the
mutation scope, recorded now in `vitest.stryker.config.ts` beside it. The new
spec passes its scopes and reports in as data, which `scoreRun` already accepted.
