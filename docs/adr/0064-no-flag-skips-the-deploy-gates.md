# No flag skips the deploy gates

`--skip-gates` is **deleted**. `pnpm deploy:site` reads three flags — `--dry-run`,
`--check-only`, `--any-branch` — and none of them clears the four-gate contract
on any path that publishes.

The roster is no longer a fact about the source. `gates/deploy-flags.test.ts`
(**G45**, `deploy-flags`) holds every flag
[`scripts/deploy.ts`](../../scripts/deploy.ts) reads to the `pnpm deploy:site`
sections of [`commands.md`](../commands.md), in both directions.

## What the flag was

Two lines in one file, both the implementation:

```
const skipGates = process.argv.includes('--skip-gates');
...
} else if (skipGates) {
  console.warn('\n! --skip-gates: publishing without running the contract');
```

It sat between `--check-only`, which uploads nothing, and the `else` that runs
`pnpm test`, `typecheck`, `gate:public` and `smoke:render`. **It was not a dry
run.** It warned, and then built and uploaded to the live address.

**It shipped in this file's first commit** — `7724545`, *"Add a deploy that
cannot publish the fixtures"* (#6), on **2026-08-01** — and no record, doc or
usage line ever explained it. `git grep` found it in two lines of one file for
the **19 days** after. `docs/commands.md` gained a sentence about it on
**2026-08-20**, in `4c77f84`, two days before this record; that fixed the title
of [#152](https://github.com/mephistopheles4/stacks/issues/152) and not its
subject.

⚠️ **Those dates are measured, and the first draft of this record said "eight
months" instead — a number nobody had checked, in a file whose whole promise is
reasoning carried verbatim.** The flag lived **21 days**. It is a smaller number
than the draft claimed and it does not soften anything: the deploy script is
three weeks old, so the flag was undocumented for **90% of the time it existed**,
and three separate verification passes read it without anyone timing what it
saved.

## Why deleted rather than kept

**It bought about 35 seconds.** Measured on one machine, warm, at `origin/main`
immediately before this change — so the numbers are what the flag was skipping,
not what it would skip now that this commit has added a gate:

| Gate | |
|---|---|
| `pnpm test` — 83 files, 893 tests | 11.9s |
| `pnpm typecheck` | 0.7s |
| `pnpm gate:public` | 3.3s |
| `pnpm smoke:render` | 19.1s |
| **the whole contract** | **~35s** |

That number is the decision. A blanket override on the most irreversible command
in the repo is not worth half a minute, and **nothing else was ever claimed for
it** — there is no record to weigh against the measurement, because there is no
record at all.

## The alternative, and the evidence that nearly carried it

**Narrowing it to `--dry-run`'s no-upload path was seriously considered**, and it
was not the ticket's own reasoning that argued for it. #152 proposed deletion on
the grounds that the flag's *"only plausible use — skipping a slow suite while
iterating — is already served better by `--dry-run`, which runs all four gates."*

⚠️ **That premise is false, and this repo's own log is the counter-example.**
[`progress.md`](../progress.md) records `pnpm deploy:site --dry-run --skip-gates`
as how a planted red was observed against the real 41-book `dist/` — and
`--dry-run` alone cannot serve that loop, because it *runs* the suite the loop
exists to skip. The two flags composed, and the composition was useful.

**The measurement settled it anyway.** The loop that evidence documents costs 35
seconds more per iteration now, which is a cost worth paying rather than a niche
worth a flag. Narrowing would have kept a flag, its documentation, its gate and
its explanation permanently, to save that. Recorded because the reasoning that
survives is not the reasoning the ticket gave: the flag's niche was **real** and
is **cheap**, not occupied by a safer flag.

## Why a gate as well, when deletion was the decision

#152 offered *"pin its shape under G17"* only as an alternative **if deletion is
wrong**, so the gate is more than the ticket asked for. It is here because the
ticket's own diagnosis was about a class and its proposal was about an instance:
*"The mechanism for pinning an override's shape exists, is proven, and was never
aimed at the one override that clears the whole contract."* Deleting the flag
leaves that mechanism still aimed one flag to the left, and leaves *"deploy:site
has no blanket override"* — a claim [#115](https://github.com/mephistopheles4/stacks/issues/115)'s
ratchet was designed around — true and held by nothing. `docs/gates.md` scores
every rule as gated or visibly not, and this one now has a row rather than a
line in that file's *Not gated, deliberately* table.

## What this closes, and what it does not

[ADR-0061](0061-the-mutation-floor-refuses-deploy.md) placed the mutation-floor
refusals outside every flag's reach on the merits, and named this flag as the
reason a *"removing the flag makes the adversary's move the only move"* argument
was false about this repo. **That sentence is now out of date in the direction it
hoped for.** ADR-0061 is left as written — it is a record — and this is the
record that changes the fact underneath it.

⚠️ **`pnpm deploy:site --skip-gates` is now inert rather than an error.** The
script does not reject unknown arguments, so the flag typed from shell history
runs a normal deploy: gates first, upload last. That is the safe direction, and
rejecting unknown flags outright is a separate change nobody has asked for.

⚠️ **G45 pins the roster, never a flag's reach.** That `--dry-run` runs all four
gates while `--check-only` never reaches them is not gated and cannot easily be:
the gate commands sit past step 0, and every harness that drives this script
stops the run at step 0 rather than spend two minutes and a network. What holds
reach is the convention `scripts/deploy.ts` adopted at `fail()` — *a refusal says
which flags clear it, written at the refusal.* A comment, named as one, and the
thing that makes it hold is that the comment sits beside the code it describes.

## How this was decided

From [#152](https://github.com/mephistopheles4/stacks/issues/152), which was
itself the record its own last section asked for:

> That ticket needed to know what the flag does, because #115's mutation-score
> ratchet was designed around the claim that `deploy:site` has *no* blanket
> override. It resolved the half it owned — the ratchet's refusals sit outside
> this flag's reach, per #140 — and deliberately did **not** decide this flag's
> fate, on the grounds that a pre-existing override on the publish path is a repo
> decision with its own record rather than a line in a spec. This is that record.

Found by the cold grading pass in #139 and verified three times before it was
filed: by the grading agent, by the session that posted that resolution, and
again while resolving #147.
