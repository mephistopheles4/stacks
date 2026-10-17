# `smoke:render` waits for state, not for time

The spec for [#436](https://github.com/mephistopheles4/stacks/issues/436).
Standard tier: planned on Opus at medium effort, to be built on Sonnet at medium.
Written unattended on 2026-10-16 by session `plan-436`, for the owner to sign
off. **Every decision marked *Claude's recommendation* is open until then**, and
§S9 lists what changing each one would move.

Every line number below is on `main` at `0a458e7`. Three other branches edit
this file tonight (§S8), so each wait is also named by its function and by what
it waits for. After a rebase, find the lines again with the grep in §S10.

## S1. Problem statement

`pnpm smoke:render` turns pull requests red for reasons that are not
regressions. A check waits a fixed time or a fixed number of frames, and a
GitHub runner draws WebGL in software through SwiftShader, at roughly a third
of a workstation's speed ([#397](https://github.com/mephistopheles4/stacks/issues/397)
measured a steady factor of about 3.3). When the runner misses the window, the
check reads its state too early and reports a failure that is not there. Each
one costs a debugging round, and one fix, #427's cut E, was reverted rather
than understood.

The two failures on record since then were both of this kind, and CI's logs
show them:

- `reduced motion TWEENS`, from a 250 ms frame wait in G35's examining check.
  It was fixed by reading state (`c0b76aa`).
- `page at 375x812 NOT CHECKED`, from a fixed 400 ms wait for the phone
  viewport. It is now a poll.

Both failed on both Node versions at once and passed locally every time.

## S2. Solution

Every wait in the gate becomes one of five named kinds, and each kind has a
single rule:

| Kind | Waits for | Rule |
| --- | --- | --- |
| **Presence** | a state the check needs before it can read anything | poll the state, with a 30 s floor on the deadline; on a timeout, print what was awaited and what the page read |
| **Absence** | time for something wrong to have happened, so that its absence means something | stays a fixed wait, with the reason beside it; the owner approves each one |
| **Search** | an attempt that may legitimately miss, such as a click between books | keeps a short deadline, because a miss is an answer and not a failure |
| **Window** | a sample to judge, such as render-loop callbacks per frame | a fixed number of frames, never a fixed time |
| **Frame sync** | the drawing buffer to be readable | the double `requestAnimationFrame` stays: it is a correctness device, and it does not depend on speed |

The owner signs off the list of waits that stay fixed (§S7). Nothing else is
left fixed.

## S3. User stories

1. As the owner, I want a pull request's `smoke:render` to fail only on a real
   regression, so that red means look rather than rerun.
2. As the owner, I want every wait in the gate listed with what it waits for,
   so that I can approve the few that must stay fixed and see that nothing else
   does.
3. As the owner, I want a wait that times out to say what it was waiting for
   and what the page held, so that a red run names its own cause.
4. As the owner, I want each gate row to keep observing what it claims, so
   that fixing flakes cannot quietly weaken a gate.
5. As a builder, I want one rule per kind of wait, so that the next check I add
   (#426 adds several) follows the rule without a new decision.
6. As a builder, I want one settle helper for "the shelf has finished loading",
   so that the main shot, G59 and G60 stop each guessing at 1.5 s.
7. As a builder rebasing over #390, #397 and #426, I want each wait anchored by
   its function and by what it waits for, so that line drift cannot hide one.
8. As the owner, I want the fix proved on CI, where the flakes happen, against
   a planted slowness that makes the old code fail, so that a green run is
   evidence and not luck.
9. As the owner, I want G60 and G61, which pull requests skip, proved on the
   pull request before merge and watched again on `main` after it.
10. As the owner, I want a broken page to fail quickly, so that a red run
    finishes within the job's 20-minute limit with its report printed, rather
    than being killed while thirty polls each wait out their floor.
11. As the reviewer of `artifacts/shelf.png`, I want the main screenshot taken
    after the covers have landed, as it is today, so that the picture I review
    by eye does not change.
12. As the owner, I want the absence waits kept honest: a slower runner may
    only make one of them weaker, never flaky, and the code says so.
13. As a later reader, I want the five kinds named in the code once, so that
    the reason for each wait sits beside it rather than in this document.

## S4. Implementation decisions

1. **The settle helper reads seams that already exist** (*Claude's
   recommendation*, q1). "The shelf has finished loading" means two things:
   no image request for a cover or a woodwork sheet is in flight, which
   puppeteer's request events count from the node side, and the renderer's
   texture and program counts (`window.__shelf.stats()`) have held still for 10
   consecutive frames, which the page counts. A local probe under SwiftShader,
   at 1× and 4× CPU throttling, found that the camera does not move after
   `ready` (book projections were identical across 30 samples) and that the
   texture count (67) and program count (8) were final by network idle. So the
   1.5 s settles wait for textures and programs only, and both are readable
   today. No site code changes, and nothing new reaches visitors.
2. **The presence floor is 30 s, one constant for the whole gate.** It
   generalises the floor the G60 cases already use, `STATE_WAIT_FLOOR_MS`, for
   the reason recorded beside it: a longer deadline on a required state can
   only turn a slow pass green, never a wrong page. A green run takes no
   longer, because a poll returns as soon as its state holds.
3. **The pickup polls stay boolean** (*Claude's recommendation*, q2). A
   presence poll that times out still returns `false` into the existing
   judges in the pickup gate's library, each planted red in its own test. It
   also prints one line naming what it awaited and the shelf's held reading.
   Throwing instead would bypass those judges and change the report.
4. **A timeout ends its check** (*Claude's recommendation*, q6). Inside a loop
   over books (the viewer's search, the spread's six books), the first presence
   timeout stops that loop and records the check as failed. Without this, a
   broken pickup costs 41 × 30 s in the viewer's loop alone and the job is
   killed before it prints a report.
5. **The absence waits stay fixed, split from any presence wait in front of
   them** (*Claude's recommendation*, q3). Today the examining exits sleep
   200 ms and then require both "view closed" (a presence) and "book still
   held" (an absence) in one read, so a slow close fails the presence half.
   The build polls "view closed" first, then keeps the fixed 200 ms, then
   reads "still held".
6. **G60's loop count samples 30 frames, not one second** (*Claude's
   recommendation*, q4). It clears the per-frame record, polls until 30
   frames are recorded (presence, with the floor), then judges that at most one
   callback ran in any frame. The sample size no longer shrinks with the
   runner, so the check gets stronger on CI.
7. **The main page boots like every other page** (*Claude's recommendation*,
   q5): `domcontentloaded`, then `ready` with the 60 s deadline the other pages
   use (it is 20 s today, the shortest in the file), then the settle helper.
   `networkidle0` inside `goto`, fatal at 30 s, goes. The comment in G60's
   `visit` records that exact pattern failing on the runner.
8. **The tuner page keeps its network-quiet wait.** What G64 and G65 judge is
   what the network carried, so "the network went quiet" is the state it needs.
   A timeout there falls through without failing, so the worst a slow runner
   can do is weaken the check. It cannot flake.
9. **G61's 30-frame settle is untouched.** It is the row's own clause 2, polled
   with a 30 s deadline whose timeout the judge reports with numbers. Its
   network-quiet wait before the settle becomes the settle helper.
10. **The five kinds are named once in the gate**, at the floor constant, and
    every absence, search and frame-sync wait carries a one-line comment naming
    its kind and its reason.
11. **No gate row's assertion changes, and none weakens.** Rows run by
    `smoke:render`: the Phase 2 gate, G16 `books-in-case`, G35
    `enhanced-card`, G59 `large-library-lit`, G60 `context-loss-fallback`, G61
    `one-shadow-reader`, G64 `tuner-split` and G65 `styled-pane`. One printed
    line changes: G60's loop count reads `30 frames, 1 loop` where it read
    `<n> frames, 1 loop` for one second. Its row's wording, "**one** render
    loop, counted per animation frame", stays true word for word, so
    `docs/gates.md` needs no edit. If the build finds a row that does need
    one, that is a weakening and has to be said there (#436, ask 3).

## S5. Testing decisions

1. **The gate is the test.** The highest seam is a CI run of
   `pnpm smoke:render`. The helpers are thin wrappers over puppeteer and are
   not worth a unit seam of their own, except for one piece of pure logic: the
   settle helper's "unchanged for N frames" counter. If it is written as a
   function over a list of samples, it gets a test beside the existing tests
   in `scripts/lib/`, which is the prior art.
2. **Every new poll is seen failing once, loudly.** Before the pull request is
   marked ready, the builder plants one break locally for each kind of change:
   a no-op `pickUp` (presence), a cover that never answers (settle) and a
   second render loop (window). Each must end red, with a line naming what was
   awaited, well inside 20 minutes. Record the planted runs' output on the
   pull request.
3. **The controls the gate already carries stay red**: G61's
   `?receivers=all`, G59's planted fog, and G64's `?debug` control.
4. **Proof on CI** is §S6.

## S6. How the build is proved on CI

The flakes happen only on the runner, and since 2026-10-11 every
`smoke:render` run there has been green. The red runs on record came from
feature branches in development (#418, #427). So a handful of green reruns
proves little, and the proof needs a planted slowness:

1. **A throwaway proof branch, never merged, slows every page.** It applies
   CDP CPU throttling (`Emulation.setCPUThrottlingRate`) in every
   `newPage`, cut once from `main` and once from the build. ⚠️ **Check that the
   throttle bites on the runner before trusting it.** Locally, 4× throttling
   cut the first frames from about 4 fps to 0.6 fps, then recovered to about
   16 fps, because SwiftShader rasterises outside the throttled main thread. So
   it slows boot and loading more than steady drawing. Read `stats().fps` in
   the throttled run's log first.
   - Expected on `main` plus the throttle: red at one or more of the named
     waits.
   - Expected on the build plus the throttle: green.
   - If `main` stays green under the throttle, the control proves nothing:
     say so on the pull request and fall back to step 3's sample alone.
2. **G60 and G61 run on the pull request.** Pull requests pass
   `--pull-request`, which skips both. The build carries one temporary commit
   that empties `SMOKE_ARGS` in `gates.yml`, so the pull request's own runs
   take the full path. It is reverted before merge, and the squash lands
   without it.
3. **Repeat samples.** With that commit in, the `suite` job is re-run with
   `gh run rerun --job` until it has four green runs. Each run gives two
   samples (Node 22 and Node 24), so eight samples in all, every one green.
4. **Timings, before and after.** The gate already prints its step times. The
   pull request quotes the `smoke:render` step's table from a `main` run and
   from the build's run, so a regression in wall time is visible.
5. **After merge, watch `main`'s push run.** It is the first run of G60 and
   G61 on the merged code. A red there is reverted first, by ADR-0108's rule.

## S7. The waits that stay fixed — for the owner's approval

These need the owner's sign-off (#436, "Needs a human"). Every other wait
becomes a poll, a frame window or a settle.

| # | Where (at `0a458e7`) | Wait | Kind | Why it stays |
| --- | --- | --- | --- | --- |
| K1 | `leavesBy`, 845 | 200 ms after an exit | absence | proves a put-back the exit might start (through history, a moment later) did not happen; a poll returns before it would and lets the defect through, as the comment above it says |
| K2 | `examineOne`, after Escape, 932 | 200 ms | absence | the same: Escape must leave the view and *only* the view |
| K3 | `paintedLoss` (G60), 1548 | `RESTORE_WAIT_MS` + 500 ms (3,000 ms) | absence | G60's own test: a painted shelf's loss must rebuild nothing, so it waits past the page's own restore window; this is #397's cause 2, which "cannot simply go" |
| K4 | `visitForTuner` (G64/G65), 2192 | network quiet 500 ms, 20 s, non-fatal | absence of further fetches | what the row judges is what the network carried |
| K5 | `readFrame` (G59), 397 | double `requestAnimationFrame` | frame sync | the drawing buffer clears after each composite; not a wait for state |
| K6 | `readCanvasStats`, 429 | double `requestAnimationFrame` | frame sync | the same |
| K7 | `measureSampling` (G61), 2037 | 30 steady frames, 30 s, judged | window, and the row's clause | it is G61's clause 2 itself |
| K8 | `clickToPickUp`, 512 | 4,000 ms per click | search | a click between books legitimately picks nothing up; 30 s per miss would cost minutes. The search polls `held() !== undefined`, which holds from the click, not from the end of the 1.3 s pickup |
| K9 | `examinesWithoutHeldCopy`, 1074 | 1,000 ms, result ignored | search, used as cleanup | only lets the view close before the put-back that follows |
| K10 | `visitForTuner` plain page, 2198 | 1 ms | absence, by design | the pane must not exist without `?debug` |

⚠️ **A slower runner can only make K1–K4 weaker, never flaky.** If a
put-back or a rebuild arrives late, it can land after the wait and be missed,
and the check passes. That residual is accepted, and the code says so beside
each one.

## S8. Branches to rebase over

Three sessions edit `scripts/smoke-render.ts` tonight on their own branches.
The build rebases over whichever of them has landed, re-runs the grep in §S10,
and re-anchors each wait by its function.

- **build-390, [#390](https://github.com/mephistopheles4/stacks/issues/390)**,
  removes the programs-range expression in `checkShadowReaders` (about line
  1974). It is line drift only, and touches no wait.
- **build-397, [#397](https://github.com/mephistopheles4/stacks/issues/397)**,
  adds per-phase timing. It probably touches `visit`, `measureSampling` and
  `grabFrame`, the same functions as W10–W12 and W2. #397 also lists "replace
  fixed sleeps with state waits" among its candidates: **this spec takes that
  item**, and #397 keeps G60's cold boots, the `clickABook` search and the
  instrumentation.
- **build-426, [#426](https://github.com/mephistopheles4/stacks/issues/426)**,
  may add checks: scrolling Thoughts, GSAP's ticker staying asleep, and the
  repaint on leave and land. Any wait those checks add follows §S2's rule for
  its kind. A check whose subject is something *not* happening, such as the
  ticker staying asleep, is an absence and joins §S7 for the owner's approval.

## S9. Override list

Every decision taken on Claude's recommendation, its alternative, and what
changing it would ripple into.

| # | Decision | Alternative | Changing it ripples into |
| --- | --- | --- | --- |
| q1 | Settle reads existing seams: image requests in flight, texture and program counts still for 10 frames | A new `window.__shelf.settled()` read-back, fed by the cover cache and the woodwork sheet loader | Site code in `boot.ts`, `scene.ts` and `woodwork.ts`, a unit test for it, and a field on the handle every visitor's page carries. More exact; costs a site change in a gate fix |
| q2 | Presence polls stay boolean, plus a printed line | Throw on timeout, as `waitForState` does | Bypasses the pickup gate's judges and their planted-red tests; the report's shape changes for G35 |
| q3 | Absence waits K1–K4 stay fixed | A page-side "it had its chance" marker: history traversal settled, restore window expired | Site code in `pickup.ts` and `shadow-fallback.ts`, plus new handle fields. Turns three residuals into exact reads |
| q4 | G60's loop count samples 30 frames | Keep the one-second window | G60's printed line, and a sample that shrinks on a slow runner |
| q5 | Main page boots by `domcontentloaded`, `ready` within 60 s, then settle; the 1.5 s sleep goes | Keep a fixed 1.5 s *after* the settle, for the screenshot | Costs about 5 s on CI per run; buys insurance against motion the probe did not see |
| q6 | The first presence timeout ends its loop | Let loops continue past a timeout | A broken pickup runs about 20 min and is killed with no report |
| q7 | Proof by a throttled control plus eight full-path samples on the pull request | Prove only on `main` after merge | No pre-merge evidence for G60 and G61; a red `main` gets reverted |
| q8 | Wall time stays #397's | Fold #397's G60 grouping into this build | A larger diff that changes test isolation, which #397 flags as needing case-by-case checking |
| q9 | The spec is a file in `docs/spec/`, proposed by a draft pull request that merges on sign-off | A comment on #436 | Nothing indexed survives if the issue is edited; the README's table loses the row |

## S10. Appendix — the inventory at `0a458e7`

**46 waits hang on time or frames.** That is 9 fixed sleeps, 4 network-quiet
waits, 3 frame-based waits and 30 polls with a short or silent deadline. A
further 19 polls already meet the rule and change nothing: 5 `ready` waits at
60 s and the 14 calls to G60's `waitForState`. The helpers in `scripts/lib/`
hold no waits; `sampling-hook.ts` wraps `requestAnimationFrame` to count
frames, which is instrumentation.

To find them again after a rebase:

```sh
git grep -n -E "setTimeout|requestAnimationFrame|waitForNetworkIdle|networkidle|waitForFunction|\buntil\(|waitForState\(" -- scripts/smoke-render.ts scripts/lib/
```

That grep finds 84 lines, comments and definitions included. The tables below
are the classification.

### Fixed sleeps (9)

| # | Function, line | Duration | Really waiting for | Becomes |
| --- | --- | --- | --- | --- |
| W1 | `main`, 214 | 1,500 ms | covers and woodwork uploaded; the camera does not move (probe) | settle helper |
| W2 | `grabFrame` (G59), 372 | 1,500 ms | the same, on each of the three pages | settle helper |
| W3 | `checkPickup` (G35), 582 | 300 ms | the Thoughts fetch, for a book that has Thoughts | if `library.json` flags the held book's (unique) title with Thoughts, poll `held().thoughts === true`; otherwise no wait, since nothing is fetched |
| W4 | `leavesBy`, 845 | 200 ms | view closed (presence) **and** time for a wrong put-back (absence) | poll the view closed, then K1 |
| W5 | `examineOne`, 932 | 200 ms | the same, after Escape | poll the view closed, then K2 |
| W6 | `examinesWithoutHeldCopy`, 1066 | 600 ms | the refused held-copy fetch to have failed, and any swap after it | wait for puppeteer's `requestfailed` on the `/held-covers/` URL, then two frames, then read |
| W7 | `LOOPS_PER_FRAME`, in `oneLoop` (G60), 1304 | 1,000 ms in-page | a sample of render-loop callbacks per frame | 30-frame window (§S4.6) |
| W8 | `noRestore` (G60), 1482 | 1,500 ms | textures on the new canvas, and its ResizeObserver sizing | settle helper, plus `stats().bufferWidth` matching the element's size |
| W9 | `paintedLoss` (G60), 1548 | 3,000 ms | the restore window to pass | K3, stays |

### Network-quiet waits (4)

| # | Function, line | Wait | Really waiting for | Becomes |
| --- | --- | --- | --- | --- |
| W10 | `main`, 196 | `goto` `networkidle0`, 30 s, **fatal** | covers and sheets fetched | `domcontentloaded`, then `ready` at 60 s, then settle |
| W11 | `visit` (G60), 1751 | 500 ms idle, 20 s, non-fatal | the same | settle helper |
| W12 | `measureSampling` (G61), 2031 | 500 ms idle, 20 s, non-fatal | woodwork sheets landed before the settle counts (#385) | settle helper; a timeout is recorded among the page's errors |
| W13 | `visitForTuner`, 2192 | 500 ms idle, 20 s, non-fatal | no further fetch | K4, stays |

### Frame-based waits (3)

| # | Function, line | Wait | Becomes |
| --- | --- | --- | --- |
| W14 | `readFrame`, 397 | double rAF | K5, stays |
| W15 | `readCanvasStats`, 429 | double rAF | K6, stays |
| W16 | `measureSampling`, 2037 | 30 steady frames, 30 s | K7, stays |

### Polls with a short or silent deadline (30)

Each is a **presence** poll unless marked, and each moves to the 30 s floor
under §S4.2–4: it stays boolean and prints what it awaited.

| Function | Lines (deadline) |
| --- | --- |
| `main` | 199 (`ready`, 20 s; becomes 60 s) |
| `clickToPickUp` | 512 (4 s, **search**, K8) |
| `checkPickup` | 579, 633†, 647† (8 s); 603 (8 s, swallowed) |
| `checkThoughtsShown` | 690 (8 s); 697 (3 s) |
| `putDown` | 718† (8 s) |
| `checkViewer` | 772, 793† (8 s) |
| `opensView` | 832 (3 s) |
| `leavesBy` | 850 (3 s) |
| `examineOne` | 867, 882, 893, 939, 975, 978 (3 s); 940 (1.5 s) |
| `noTweenWhenExamining` | 1010–1020 (3 s, in-page) |
| `examinesCoverless` | 1030 (3 s) |
| `examinesWithoutHeldCopy` | 1063 (8 s); 1074 (1 s, **search**, K9) |
| `putBackAndSettle` | 1085† (8 s) |
| `checkPhone` | 1097, 1102 (8 s) |
| `checkSpread` | 1142 (8 s) |
| `measureSampling` | 2034 (8 s) |
| `visitForTuner` | 2195 (15 s on `?debug`; 1 ms on the plain page, **absence**, K10) |

† The result is ignored today, so a timeout lets the next step start on a book
still moving. That is a cascade the floor and §S4.4 close.

Already meeting the rule, unchanged: `ready` at 60 s in `grabFrame` (370),
`checkSpread` (1139), `visit` (1750), `measureSampling` (2022) and
`visitForTuner` (2191), and `waitForState`'s 14 calls in the G60 cases, with
its 30 s floor.

## S11. Out of scope

- Wall time. That is #397: G60's cold boots, `clickABook`'s search, and running
  pages in parallel.
- `scripts/phone-check.ts`, which runs on a phone and not on CI.
- Any change to what a gate row asserts.
- Any new handle on `window.__shelf`, unless q1 or q3 is overridden.

## S12. Further notes

- The local probe was a throwaway script, run with `CI=true`'s SwiftShader
  flags against the built fixture site and then deleted; the tree was checked
  clean afterwards. Its numbers are in §S4.1 and §S6.1.
- A local `CI=true pnpm smoke:render --pull-request` on `0a458e7` was green,
  with step times: boot, settle and screenshot 4.8 s; G35 pickup 12.1 s;
  examining 27.1 s; the 375×812 page 2.7 s; open spread 17.8 s; G59 14.0 s;
  G64 9.9 s.
