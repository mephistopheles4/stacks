# The summary that grew a byte per mutant, and the gate that was reading a clock

**2026-08-22.** The nightly went red. The report was _"the summary became too
large"_, plus the observation that the run page had been slow to open in a
browser for a while. **Both halves were real and neither was why the run
failed.** There were two independent faults, one of them a calendar.

---

## What the run actually said

Run [32550244145](https://github.com/mephistopheles4/stacks/actions/runs/32550244145),
`schedule`, commit `5438035`. Two lines matter, and they are in different steps:

```
##[error]$GITHUB_STEP_SUMMARY upload aborted, supports content up to a size of 1024k, got 1054k.
...
suite: 1   mutation: 0   emit: 1
```

The first is an **annotation on a step that exited 0**. The upload is dropped
and the step succeeds; nothing in the job's exit status comes from it. The job
failed on the last line: `pnpm test` exited 1, so `--expect
gate-suite-runtime` did not compute, so `emit` wrote `run_ok 0` and exited 1,
so the final `test "1" = "0"` failed. The record still landed on the `metrics`
branch, which is what step 0b's ordering exists for.

⚠️ **The two faults arrived on the same night by coincidence.** The summary had
been growing for weeks; the suite broke on a date. Reading either as the cause
of the other is the mistake this file exists to prevent.

**Only the second fault is fixed by the commit carrying this file.** The first
was fixed by [#209](https://github.com/mephistopheles4/stacks/pull/209), from
another session, while this one was investigating; this branch is stacked on it
and the account below is kept because the two faults were diagnosed together
and the second is unreadable without the first.

---

## Fault 1 — the suite, and the exemption four assertions were standing on

`pnpm test` failed in 12 seconds, at a commit whose only two changes since the
last green nightly were documentation ([#195](https://github.com/mephistopheles4/stacks/pull/195),
[#206](https://github.com/mephistopheles4/stacks/pull/206)). The same commit had
been green on `push` at 17:35 the evening before. **A green and a red at one
commit is a clock, not a diff.**

Four assertions in `gates/deploy-branch.test.ts` (G17), all of them the ones
expecting to reach the _past the guard_ sentinel:

```
AssertionError: expected '--any-branch: publishing a branch oth…' to contain 'STACKS_VAULT points at nothing'
+ FAILED: no metrics record has arrived, 3 days after the trend spine landed.
```

G17 drives the real `scripts/deploy.ts` at a scratch repository through
`GIT_DIR` and reads the vault refusal as proof the branch guard let the run
past. **Step 0b — G39's deploy half — sits between those two**, and it reads
the record store through git, which `GIT_DIR` has already pointed at the
scratch repository. A scratch repository holds no records. An empty store is
the **dated bootstrap**, `SPINE_LANDED` + `STALE_AFTER_DAYS` = 2026-08-19 + 3.
It prints and returns — until 2026-08-22, when it refuses.

**Neither half was a defect where it looked like one.** The bootstrap expiring
is `scripts/lib/metrics-read.ts` working exactly as designed: a special case
that dies on a date rather than becoming permanent furniture, and its docblock
says so in terms. What was wrong is that a gate about the **branch** decision
was reading a wall clock at all — so the fix belongs in the fixture, and
`repoOn()` now plants a fresh four-series record at
`refs/remotes/origin/metrics` with the `update-ref` idiom G39 already uses.

⚠️ **G39's own docblock closed this trap on G39's row and it was already open
one row over.** Its last paragraph: an assertion of _does not refuse_ would
have been _"a green that quietly became false three days after the spine
landed"_. That is a precise description of what G17 did, written down three
days earlier, in the file that introduced the step G17 was walking through.

⚠️ **This half was fixed twice, by two sessions, within the hour.**
[#209](https://github.com/mephistopheles4/stacks/pull/209) is the one that
landed; this session reached the same diagnosis and very nearly the same patch
independently, and dropped its own. **Two facts are worth keeping from the
collision.** The first is that #209's version is better in a way that reads as
a detail and is not: it `reset --hard`s the record commit back off the branch
under test, so the fixture stays _a repository sitting on `branch`_ rather than
becoming _a repository sitting on `branch` with a `metrics/` directory in it_ —
a fixture that quietly acquires state is how the next interposed check gets its
answer chosen for it. The second is that nothing in the tracker could have
prevented the duplication: every session here authenticates as the same
account, so _mine, claimed a minute ago_ and _free to take_ are one record,
which `AGENTS.md`'s working rules already name as the case the tracker cannot
answer. The red was on `main`, so both sessions met it on arrival rather than
by picking up a ticket.

**The lesson is #209's and is recorded under G39 in `docs/gates.md`:** a test
whose sentinel lies past a dated check inherits that check's calendar, and
every fixture on the path has to satisfy the checks it does not mean to test.
⚠️ Worth adding, because the idiom is on three rows now — G17 owns the scratch
repository, G39 borrows it, and G43's register entry names it as available to
anything else that wants it. **A scratch repository is not a neutral one.** It
answers every git question the script asks, including the ones a later step
added, and each of those answers is a default nobody chose.

---

## Fault 2 — a job summary that grew with the mutant count

Nothing in this repository writes to `$GITHUB_STEP_SUMMARY`; `grep` over the
tree returns zero hits. **Vitest does.** Its `github-actions` reporter is
appended to the resolved reporter list whenever `GITHUB_ACTIONS` is `true`, and
its job-summary half is:

```js
writeFileSync(this.options.jobSummary.outputPath, summary, { flag: 'a' });
```

`flag: 'a'`, on every `onTestRunEnd`. Under `pnpm test` that fires **once** —
179 bytes, six lines, genuinely useful, and the merge job has been publishing
it all along. **Under Stryker it fires once per mutant**, because a mutation
run is thousands of test runs through one Vitest instance.

Measured rather than reasoned about, twice:

|                                                            |                                                    |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `pnpm test`, run twice at one file                         | 179 → **358 bytes**. It appends                    |
| `stryker run --mutate packages/core/src/key-if-present.ts` | 4 mutants + the dry run = **5 appends, 923 bytes** |
| the real nightly, ~5900 mutants                            | **1054k**, against GitHub's 1024k                  |

So the browser complaint and the CI error are one fault at two points on a
ramp: for weeks the run page was loading most of a megabyte of the same six
lines, and then it crossed the cap.

**The fix is one line** — `reporters: ['default']` in
`vitest.stryker.config.ts` — and it works because Vitest adds the reporter
**only to a list that resolved empty**. Declaring one makes CI's resolved
reporters equal to a laptop's, which removes the divergence rather than
papering over one symptom of it. Verified on the same four-mutant scope: **923
bytes → 0**, same score, same four mutants killed.

⚠️ **Nothing local could have caught it, in either direction.**
`GITHUB_ACTIONS` is unset on a developer machine, so the reporter is never
added, so the append never happens and the file is never written. The same
shape as `metrics.yml`'s empty-string ternary, whose docblock says it verbatim:
_"Nothing local can catch it — the emitter is green, the suite is green, and
the bug lives in expression evaluation."_

⚠️ **And it decayed silently.** The summary grew with the mutant count and cost
nothing until it crossed a threshold, so there was no commit to blame and no
red to notice on the way up. That is what earned it a row — **G44
(`stryker-reporters`)** — rather than a comment on the option: two clauses, the
`vitest.configFile` wiring and a non-empty `reporters`, observed red three ways
and restored green.

---

## What this cost, and what it did not

**Nothing measured is wrong.** The mutation scores, the runtimes and the
records on the `metrics` branch are unaffected by either fault: the summary is
a report about the run and never an input to it, and the 2026-08-22 record
landed with `run_ok 0` plus everything that did compute — which is the whole
argument for writing the record before failing.

Two things to know next time:

- **An `##[error]` annotation is not an exit status.** The summary upload
  aborting is loud, appears mid-log next to the step that produced it, and
  changes nothing about whether the job passes. The exit status was three steps
  further down and said `suite: 1`.
- **A red that arrives without a diff is a clock or a network.** The green push
  and the red nightly were the same SHA, which named the class of fault before
  a single file was opened.
