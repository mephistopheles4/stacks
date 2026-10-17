# `smoke:render` closes its main page before the checks that boot their own

The spec for [#397](https://github.com/mephistopheles4/stacks/issues/397).
Standard tier: planned on Opus at medium effort, to be built on Sonnet at
medium. Written on 2026-10-17 by session `spec-397` from a grilling the owner
answered, an eagle-eye box and a local measurement. **Nothing here is built.**
The owner signs it off: proceed, fix or kill.

Every line number is on `main` at `4e97f22`. Each place is also named by its
function, so a rebase can find it again.

## S1. Problem statement

`pnpm smoke:render` takes about 11.5 minutes on `main`'s push run, and about 8.5
of them are two checks: G60 (`context-loss-fallback`, 380.6 s) and G61
(`one-shadow-reader`, 124.7 s), on run 39051984873. Pull requests skip both
([ADR-0108](../adr/0108-g60-and-g61-run-after-merge-not-on-pull-requests.md)),
so the cost lands on every push to `main` and on every `pnpm deploy:site`.

#397 blamed G60's twelve cold boots, and #436 made each one slower by waiting
for a 10-frame settle. The gate's own timer agrees on where the time goes: the
12 boots spend **161.8 s getting to ready** and 69.1 s settling. About
13.5 s to ready per boot is far more than a boot costs, and nobody knew why.

## S2. Solution

**The cause is a page the gate leaves open.** `main()` opens one page first, for
the screenshot, G35, examining and the phone check (`smoke-render.ts:174`). It
is never closed until the browser closes (`:263`), and it keeps drawing the
shelf. Every browser context shares one software GPU process under SwiftShader,
so every later boot and every later frame waits behind that page.

A local probe measured it (§S10). Four cold boots, one at a time, in new
contexts, `CI=true`, Chrome pinned to 4 cores to stand in for the runner:

| Main page | Ready, per boot | Settle, per boot | 4 boots, wall |
| --- | --- | --- | --- |
| left open, as the gate does | 13.1–13.9 s | ~4.0 s | **129.6 s** |
| closed | 0.7 s | ~2.2 s | **32.0 s** |

The open row matches CI's 13.5 s to ready and 5.8 s to settle per G60 boot.

**The fix is to close the main page after its last use**, the phone check, and
to change nothing else that a check asserts. Every gate row, every case's own
browser context, the settle on every boot and the order of the cases stay as
they are.

## S3. User stories

1. As the owner, I want `main`'s push run to finish sooner, so that a red
   `main` is found and reverted sooner.
2. As the owner, I want `pnpm deploy:site` to stop waiting about 8.5 minutes
   for two checks, so that a deploy is cheap enough to run when it is needed.
3. As the owner, I want every check `smoke:render` prints to keep its
   assertions, so that a faster gate is not a weaker gate.
4. As the owner, I want each G60 case to keep a browser context of its own, so
   that the record one case writes still cannot reach the next.
5. As the owner, I want the settle #436 added to stay on every boot, so that
   the early reads it removed do not come back.
6. As the owner, I want the CI log to show what each boot costs in G61 as it
   already does in G60, so that the next slowdown is visible without a local
   experiment.
7. As the owner, I want the saving measured on CI, not predicted, so that the
   spec's claim is checked against the runner it is about.
8. As the owner, I want a change that makes `main` slower to be reverted, so
   that a wrong cause costs one run and no more.
9. As a pull request author, I want the checks after the phone check (open
   spread, G59, G64) to get faster too, because they also boot beside the
   main page.
10. As the build session, I want the place to change named by function as
    well as line, so that a rebase over #426 does not lose it.
11. As the next reader of `smoke-render.ts`, I want a comment beside the close
    that says why it is there, so that nobody moves a check after it that
    needs the main page, or removes it as tidying.

## S4. Implementation decisions

### S4.1 Close the main page after the phone check

In `main()`, close the main page after `checkPhone` returns, and before
`checkSpread` starts. Nothing after the phone check reads that page: open
spread, G59, G60, G61 and G64 each open their own page or context, and
`report()` reads values the main page produced earlier (`bookCount`,
`bookcaseOverflow`, `stats`, `cost`).

The page's listeners feed the shared `errors` list. Once it is closed it can
log nothing more, and that is the point: the checks after it read their own
pages' errors.

A comment beside the close says what it saves and why a check that needs the
main page must come before it.

### S4.2 Nothing else changes in what a check does

- Each G60 case keeps its own browser context. The G60 row in
  [`docs/gates.md`](../gates.md) says so, and no gate row changes.
- Every `visit()` keeps its settle (`watchSettle`, 10 frames).
- The cases keep running one at a time, in today's order.
- No absence wait changes. §S7 of
  [`smoke-render-waits.md`](smoke-render-waits.md) still holds.

### S4.3 The `visit()` timer counts G61's boots too

`measureSampling`'s boots (G61, four pages) do not go through `visit()`, so the
`of which visit() boots` line under `step times` counts G60 only. The build
adds G61's boots to the same count, or prints a second line for them. The
build picks whichever reads more plainly in the log. Either way, the log shows
time to ready and time to settled for both checks.

### S4.4 What was measured and dropped

These were candidates in #397 or the lead's brief. The owner dropped each one
on the measurement in §S10.

- **Cases in parallel contexts.** On 4 cores, 4 boots took 30.7 s one at a
  time, 32.5 s two at a time and 43.1 s four at a time. Each extra page halved
  every page's frame rate, because all pages share one GPU process.
- **A warm-up boot.** The first boot in a fresh browser took 0.89 s to ready,
  and later boots took 0.50 to 0.93 s. No gain was measured. The main page is
  already a warm-up for G60.
- **Cutting the settle on boots that read only state.** With the main page
  closed, a settle costs about 2.2 s, so the cut is worth about 15 s on G60,
  and it reopens the early-read risk #436 closed.
- **Grouping cases into shared contexts.** That needs a G60 row change, and the
  measured cause leaves no need for it.

## S5. Testing decisions

**The seam is `smoke:render`'s own run**, the highest one there is: the report
it prints and its exit code. The change sits in `main()`'s order of calls,
which no unit test reaches, and no new seam is added.

- A good test here is the gate's own output. Every check line it printed
  before the change, it prints after, with the same verdicts. Only timings
  move.
- The controls the gate already carries must still fail where they fail
  today. G61's `?receivers=all` page stays `red, as it must be`, and every G60
  case keeps its own required errors and refusals.
- No test is added. The cost limit "Tests added" stays at 0 of 2.
- Prior art: [`smoke-render-waits.md`](smoke-render-waits.md) §S6 proved #436
  the same way, by the gate's output on CI.

## S6. How the build is proved

### S6.1 Acceptance claims

- **C1.** `main()` closes the main page after `checkPhone` and before
  `checkSpread`, with a comment saying why.
- **C2.** Locally, with `CI=true`, `pnpm smoke:render` ends `OK`, and every
  check line matches a run of `main` at the base commit apart from times and
  counts that vary from run to run (frames, colours, timings).
- **C3.** `pnpm smoke:render --pull-request` ends `OK` on the pull request's CI
  run.
- **C4.** The `step times` block shows time to ready and time to settled for
  G61's boots as well as G60's.
- **C5.** On the first push run to `main` after the merge, G60 plus G61 take
  **under 250 s**, read from that run's `step times` block.
- **C6.** Before the merge, a local `CI=true` run shows G60's time to ready
  per boot at half or less of a run of the base commit on the same machine,
  both printed in the pull request. On this workstation's 32 cores the probe
  measured about 3.5 s open against 0.9 s closed.

### S6.2 If C5 fails

C5 is measured after the merge, because pull requests skip G60 and G61 and
`gates.yml` has no manual trigger. If the first push run shows G60 plus G61 at
or over 250 s, the merge is reverted first and the cause found after, as
ADR-0108 already asks for a red `main`. A run that is faster but not under
250 s is still reverted. The owner can override that by comment on #397.

### S6.3 Gates

`pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check` and
`pnpm lint:md` green, as every phase asks. The full `smoke:render` locally,
with free RAM checked first.

## S7. Trade-off points

- **Performance efficiency against reliability.** The faster gate could be
  bought by cutting waits (the settle, the absence waits) or by sharing
  contexts. This spec takes neither: it removes a cost no check asserts
  anything about. Driver: §S8's lean to the side that is cheaper to reverse,
  and #436's own record that cut waits failed on CI and passed locally.
- **Measurement before merge against a lasting workflow change.** A manual
  trigger in `gates.yml`, or a temporary commit that drops `--pull-request`,
  would measure C5 before the merge. This spec measures after it and reverts
  on a miss. One revert costs less than a trigger that stays.

## S8. Business drivers

None is written in this project's agent instructions. Flagged once, as the
pact asks: this spec leans to the side that is cheaper to reverse. A
one-line close is undone by one revert; a changed gate row or a shared context
would need the owner to re-approve the G60 row.

## S9. Out of scope

- **Running G60 and G61 on pull requests again.** ADR-0108 skips them because
  of their cost. *Owner's answer to q2 is pending; see §S13.*
- **`clickToPickUp`'s search** (G35, 17.1 s on CI) and the other candidates in
  #397's body. They were not measured here and stay on #397 if the owner wants
  them.
- **Splitting the 13.5 s ready time into its parts.** The measured cause
  accounts for it, and C6 checks that it went.
- **Any change to what a check asserts**, any gate row, any absence wait.

## S10. The measurement

A throwaway script, not committed, run on 2026-10-17 at `4e97f22` with
`CI=true` (SwiftShader, as `glArgs()` selects on CI), against the 50-book
fixture build, on a 32-core workstation. The Chrome processes were pinned to 4
cores to stand in for the runner's 4 vCPUs. Each boot was `goto`, then ready,
then the gate's own settle recorder (`RECORD_SETTLE_READINGS`, `hasSettled`),
then 30 frames timed. Each scenario used a fresh browser.

| Scenario, 4 cores | Ready per boot | Settle per boot | Frame rate | Wall |
| --- | --- | --- | --- | --- |
| 4 serial, main page closed | 0.71–0.76 s | 2.17–2.41 s | ~7 fps | 32.0 s |
| 4 serial, main page left open | 13.08–13.93 s | 3.88–4.17 s | ~3.4 fps | 129.6 s |
| 4 serial, after a warm-up boot | 0.68–0.71 s | 2.09–2.24 s | ~7 fps | 30.7 s |
| 4 at two a time | 0.96–4.01 s | 2.57–3.99 s | ~3.5 fps | 32.5 s |
| 4 at four a time | 3.47–19.39 s | 2.97–5.66 s | ~2 fps | 43.1 s |

On all 32 cores the same shape holds with smaller numbers: four serial boots
took 11.6 s with the main page closed and 33.4 s with it open.

⚠️ **The 4-core pin is a stand-in, not the runner.** Its numbers for the open
page land on CI's (13.5 s to ready, 5.8 s to settle per G60 boot), which is
why it is trusted for direction. C5 is the measurement that counts.

The eagle-eye box behind the decisions stays in the session's scratch folder
and is not part of this checkout.

## S11. Branches to rebase over

- **#426** (pickup follow-ups from #413's move-4 review) will add checks to
  `smoke:render`, a G35 clause among them. A check that needs the main page
  must come before the close in §S4.1. One that opens its own page can come
  anywhere. Whichever lands second rebases over the other.
- **#462** (the ratchet's tightening prompt) also edits
  [`README.md`](README.md) in this folder. The row this spec adds there is a
  one-line conflict at most.

## S12. Override list

Each line is a decision, who took it, and what changes if it is reversed.

- **Close the main page; keep every row, the settle and one case at a time.**
  Owner, q1 = A, relayed by the lead. Reversed: the box's other routes are in
  §S4.4, each with its measurement.
- **Target under 250 s.** Owner, the box's restore code. Reversed to "back to
  about 390 s", the target is met by a wider margin, and C5 changes.
- **No new test; the gate's output is the proof.** `spec-397`'s
  recommendation. Reversed: a test would need a seam in `main()`'s order of
  calls, which does not exist.
- **G61's boots join the timer.** Owner, q1 = A.
- **#397's other candidates out of scope.** `spec-397`'s recommendation.

## S13. Needs a human

- **Sign-off**: proceed, fix or kill.
- **q2**, whether pull requests run G60 and G61 again: pending.
- **Closing #397.** The build's PR can close it, or leave it open for
  `clickToPickUp` and the rest. That is the owner's call at merge.
