# The survivor record — every night's survivors, kept past 30 days

The spec for [#344](https://github.com/mephistopheles4/stacks/issues/344).
Standard tier: planned on Opus at medium effort, to be built on Sonnet at
medium. Written on 2026-10-17 by session `spec-344`. **Signed off by the owner
on 2026-10-17: proceed** (q6, relayed by the head chef). It is waiting for a
build session.

The owner decided the shape on #344: a stripped survivor list each night, keyed
by content and matched as a multiset, on its own orphan branch. The grilling
settled the rest. §S9 lists each decision, who took it, and what changing it
would move.

The measurements behind it are on `main`:
[the survivor set diffs cleanly](../log/2026-09-21-the-survivor-set-diffs-cleanly.md)
and [the content key holds across a real edit](../log/2026-09-22-the-content-key-holds-across-a-real-edit.md).
This spec cites them rather than restating them.

## S1. Problem statement

Each nightly keeps its full Stryker report for 30 days as a workflow artifact,
and the job summary lists survivors per scope for that one night. After 30 days
a night's survivors exist only as eight scores on the `metrics` branch.

That is too short for the job ahead. The floors' calibration windows fill in
early November, and before a scope is armed the owner wants to find its
**equivalent mutants**: survivors no test can kill, because the mutated code
behaves the same. They show up as survivors that stay on the same code night
after night. Seeing that needs survivor sets from many nights, compared with
each other. Two reports cannot be compared by mutant `id` either: Stryker
assigns an `id` by position in one run's count, so one new mutant early in the
file order renumbers everything after it.

## S2. Solution

After a clean mutation run on `main`, the nightly writes one **survivor record** (see
[`CONTEXT.md`](../../CONTEXT.md)) to a new orphan branch, `survivors`, as
`survivors/<timestamp>-<sha>.jsonl`. It then appends one line to the job
summary, under the score table, saying what moved since the previous record:

```text
Survivors: 3,699 tonight — 17 new, 31 gone since c52cc9f (2026-09-21). On unchanged code, up to two either way is noise.
```

The record is plain JSON Lines, one survivor per line, sorted, so consecutive
nights differ only where survivors moved. Survivors are matched across nights
by **content key**, counted as a multiset, never by `id` or position. The
record is written every clean night and kept indefinitely. The full report
stays in the 30-day artifact, as now.

Writing the record never turns a night red. When it is not written, the summary
line says why.

## S3. User stories

1. As the owner, I want every clean night's survivors kept beyond 30 days, so
   that I can tell survivors that persist from survivors that come and go.
2. As the owner, I want the job summary to say how many survivors are new and
   how many are gone since the previous record, so that a night's movement
   reads at a glance without downloading anything.
3. As the owner, I want survivors matched by what they mutate and not by
   position, so that an edit that moves lines does not read as hundreds of
   survivors gone and hundreds new.
4. As the owner, I want each survivor's original text and replacement in the
   record verbatim, so that I can judge by eye whether it is equivalent without
   checking out that night's commit.
5. As the owner, I want a crashed or partial mutation run to write no record,
   so that a truncated report never reads as survivors killed.
6. As the owner, I want a skipped or failed record to be named in the job
   summary, so that a missing night is visible on its run page and not only as
   a gap on a branch.
7. As the owner, I want a failure to write the record to leave the night's
   verdict alone, so that a secondary record cannot turn a good night red.
8. As the owner, I want a `workflow_dispatch` run on `main` recorded like a
   scheduled one, with its event in the header, so that a dispatch fills a night that
   failed, as it did for #344's cross-tree pair.
9. As the owner, I want the record and the job summary to agree on what a
   survivor is, so that their counts never disagree for a reason of
   definition.
10. As the owner, I want colliding survivors all kept, so that a diff's counts
    stay exact even when two survivors share a key.
11. As the owner, I want the record's bytes to depend only on the report's
    content, so that two reports of one tree in a different `mutants[]` order
    write the same survivor lines.
12. As the owner, I want a change to the key's definition to be detectable in
    the record itself, so that a diff never compares two nights keyed
    differently and reports the difference as movement.
13. As the owner, I want the `metrics` branch, its records and G39's reads left
    unchanged, so that this record costs the trend layer nothing.
14. As a future session, I want each record to be a self-describing file, with
    commit, run, event and per-scope counts in its header, so that I can read
    one without the workflow log.
15. As a future session, I want the nightly's write to stay cheap after years
    of records, so that the record's growth never becomes the nightly's cost.

## S4. Implementation decisions

### S4.1 Survivor and key

- **A survivor is `Survived` or `NoCoverage`**: the `surviving` rule
  `mutation-score.ts` already applies for the job summary, reused and not
  re-derived. Files are assigned to scopes by the existing `assignFiles`, so a
  file belongs to the same scope in the record as in the score table.
- **The content key is file + mutator + original + replacement**, with the
  original sliced from the report's own `files[<path>].source` at the mutant's
  location: 1-based line, 1-based column, end exclusive. The log's
  `survivor-key.mts` is the reference slicer. The original is kept verbatim,
  newlines included (the log measured no `\r` in any mutated source).
- **Matching is a multiset**: per key, the count tonight against the count in
  the previous record. `new` is the sum of positive differences and `gone` the
  sum of negative ones. Colliding keys are never de-duplicated.
- **The key carries a schema version**, `keySchema: 1`. A diff between two
  records whose versions differ is not computed; the summary line says the key
  changed instead.
- **The tool and its configuration are part of what makes two nights
  comparable.** `mutator` and `replacement` are Stryker's own output, and which
  mutants exist depends on the Stryker config and the scopes. The cross-tree
  measurement held because none of those moved. So the header also carries the
  installed Stryker version and the `configHash` that `stryker.floors.json`
  carries, and a diff against a record that differs in either is *not
  compared*, as for a key change.
- **A survivor with no location** (the report schema leaves `location`
  optional) is kept, with `original: null`, and keys on that null. **Survivors
  in files no declared scope claims, or in excluded files, are left out**, so
  the record counts what the score table counts.

### S4.2 The record

One file per clean run: `survivors/<timestamp>-<sha>.jsonl`, using the same
`<timestamp>-<sha>` form as `metrics/`, so the two records for one night share
a name stem. `survivors/` joins `metrics/` in `.gitignore` on `main`.

**Line 1 is the header**, one JSON object:

| Field | Value |
| --- | --- |
| `record` | `"survivors"` |
| `keySchema` | `1` |
| `stryker` | the installed `@stryker-mutator/core` version |
| `configHash` | the hash `pnpm mutation:stamp --check` compares, computed for this run |
| `commit` | the run's head SHA |
| `event` | `schedule` or `workflow_dispatch` |
| `runUrl` | the run's page |
| `recordedAt` | ISO 8601 UTC |
| `counts` | per declared scope, `{ "survived": n, "noCoverage": n }` |

**Every later line is one survivor**, its keys always in this order: `file`,
`scope`, `mutator`, `status`, `original`, `replacement`, `start`, `end`.
`start` and `end` are `{ line, column }` and are for reading only, never for
matching.

**Sorted by the full key, then by `start` and `end`**, compared by code unit
and never by `localeCompare`, whose order depends on the runner's locale. The
order of the report's `mutants[]` is never used: the first log measured it out
of `id` order in 70 of 74 files, and different from run to run.

Size: about 818 KiB raw and 72.7 KiB gzipped a night, measured on the field set
above (the log's "key form"). A year is at most 25.9 MiB before git finds any
similarity between files.

### S4.3 When it is written

- **Only after a clean mutation run**: the mutation step exited 0 and the report
  parses. Stryker's config sets no break threshold, so a non-zero exit means a
  crash, and the report on disk may be partial.
- **`schedule` and `workflow_dispatch` alike, on `main` only.** `push` runs no
  Stryker and never reaches this step. A dispatch can target any ref, and its
  record would become the next night's baseline, so a run whose ref is not the
  default branch writes no record.
- **Otherwise there is no record**, and the summary line names the reason: the
  mutation run's exit status, the mutation step not having run (its status is
  empty when an earlier step failed), the report not parsing, or the ref not
  being `main`.

### S4.4 The summary line

**The order, in one run of the step:**

1. tonight's record is built and written to `survivors/` on disk;
2. the branch tip is fetched (§S4.6);
3. the newest record on the tip, by `<timestamp>`, is found with `git ls-tree`
   and read with `git show` — its blob fetched explicitly if the fetch left it
   out — and the diff is computed;
4. the record is committed and pushed;
5. **exactly one summary line is written, last**, so a failure at any step
   above replaces the diff with the *not written* form.

Five forms:

- **A diff:** tonight's total, `new`, `gone`, the previous record's short SHA and
  date, and the noise note. The note quotes the measured band, up to two on
  unchanged code, from the head-cap `Survived`↔`Timeout` flip, and links the
  first log.
- **The first record**: no previous record exists.
- **Not compared**: the key schema, the Stryker version or the `configHash`
  differs from the previous record's.
- **Previous record unreadable**: the newest record on the tip does not parse,
  its header lacks a field the diff needs, or its `commit` is not 40 hex
  characters or its `recordedAt` is not an ISO 8601 UTC timestamp. Tonight's
  total only. **The previous record's SHA and date are printed only after those
  two checks** (owner, q4): they come from an unprotected branch, and the job
  summary renders Markdown.
- **Not written**: the reason, from §S4.3, or the step that failed.

Per-scope movement is left out of the line. The record holds it, and a reader
that wants it is a later ticket (§S7).

### S4.5 Where the code lives, and the workflow step

**No new entry script** (owner, q3). Every script run only by `tsx` here is
excluded from mutation in `stryker.scopes.json`, and adding an exclusion moves
the hashed Stryker config, which restarts the calibration windows before the
November arming. So the build adds code only where it costs nothing:

- **`scripts/lib/survivor-record.ts`**, new, **pure and mutated**: building a
  record from a report, diffing two records, and rendering the one summary line.
  It reads no file and runs no process.
- **`scripts/mutation-scopes.ts`**, already excluded and already the job
  summary's renderer, gains two modes: one writes tonight's record to
  `survivors/` (or a reason it did not), and one renders the summary line from
  tonight's record, the previous record and the commit's exit status.
- **`scripts/commit-metrics.ts`**, already excluded, takes the branch, the
  directory and the file extension as arguments, with the `metrics` values as
  defaults, so `pnpm metrics:commit` keeps its name and its behaviour. It also
  takes an optional path to which it copies the newest record on the fetched
  tip before committing. No mutated file runs `git`, so no Stryker mutant can
  push.

**The step.** One new step in `metrics.yml`'s `nightly` job, **after** `write
the mutation report to the job summary`, so the line lands under the score
table, and before the final `fail if the run did not compute what it declared`.
It runs §S4.4's order as three invocations: `mutation-scopes.ts` writes the
record, `commit-metrics.ts` fetches, hands back the previous record and commits,
and `mutation-scopes.ts` writes the line. It:

- runs on `always()` and receives the mutation step's status and the ref
  through `env:`, as the summary step does, so it can name a skipped night;
- calls both scripts with `pnpm exec tsx`, not a new `pnpm` script, so the
  Commands list in `AGENTS.md`, and `gates/commands.test.ts` with it, do not
  move;
- passes commit, event and run URL as arguments, as `emit` does, so no new
  variable reaches the env contract;
- **never fails the job**: `|| echo` into the summary, the shape the summary
  step already has. The final step does not read its status.

`push` gets nothing, and `gates.yml` is untouched. **The target is the
`nightly` job on `ubuntu-latest`; development is on Windows**, so every path the
tests build, the `file://` remote URL included, is built from a path with
`node:url` and never concatenated.

### S4.6 Committing without a checkout

**`commit-metrics.ts` changes in one respect: it never checks out the branch's
tree.** Today it checks out the whole tip, which costs nothing for `.prom` files
of a few hundred bytes. The survivor tip grows by about 818 KiB raw every night
and is never pruned, so the same checkout would write about 300 MB a year to the
runner, and more each year after.

The property is fixed: **it writes exactly one file to disk, the one it adds.**
Four rules make that hold, and each replaces something the current script does
that would break it:

1. **The worktree is `--no-checkout`, and its index is filled from the fetched
   tip by `git read-tree`.** This replaces `worktree add --detach <tip>`.
2. **The new file is added by its full path**, never by its directory. In a
   worktree with no files on disk, `git add metrics` would stage the deletion of
   every earlier record, and each night would delete the one before.
3. **A rejected push re-fetches, `read-tree`s the new tip, re-adds the one
   file, re-commits and pushes again**, up to three times. This replaces `pull
   --rebase`, which would refuse in that worktree or check the tree out.
4. **An absent branch is created from a `--no-checkout` worktree too.** Today
   the orphan path checks out `HEAD`'s whole tree, then runs `git rm -rf`.

`metrics` goes through the same path. That is a change to a step that is not
warn-only, so C9 runs it for both branches.

⚠️ **The fetch is unmeasured.** A `--depth=1` fetch still downloads every blob
at the tip, about 26 MB a year before deltas. A `--filter=blob:none` fetch would
avoid that, but whether it works in a full clone that is not a partial clone was
not measured while this spec was written. **The build measures it locally**,
from a full clone of the public repository against GitHub, on a scratch branch
pushed for the purpose and deleted after. It counts as working when the fetch
succeeds, and `git ls-tree` plus `git show` of one file then succeed with the
other blobs absent (`git cat-file -e` fails on them). If it fails, the depth-1
fetch stays, and the ADR records the command, its output and the residual: about
73 KiB more download a night.

**Budget.** The step's wall time stays under 60 s, and the bytes its fetch
downloads stay under 50 MB. The step prints both every night. Acceptance 3
records the first night's, and the ADR carries them as the baseline growth is
read against. A night past either limit is a stop condition (§S11).

### S4.7 Token scope

**No new scope, and not sensitive.** The `nightly` job already holds job-level
`contents: write` on the built-in `GITHUB_TOKEN` and keeps the credential on
checkout, because `metrics:commit` pushes. The repository's only ruleset,
`main-protection`, covers the default branch alone, so that token can already
push `survivors` or any other branch. The net change in authorization is zero.

What does change is **more code running beside that credential**: the new
modes of `mutation-scopes.ts` and the reworked `commit-metrics.ts` join `pnpm
test`, Stryker and `emit`, which already run in that job. No mutated file runs
`git` (§S4.5), so no Stryker mutant can reach the push. The record holds source text from a public repository and nothing
else: no secret, no vault data, no personal data. A security finding by the
pact's definition would need the change to expose one of those or touch an item
on the sensitive list, and the record does neither. §S8 still offers the
security pair once, because the spec moves the write path.

### S4.8 Docs that move in the build

- **ADR**, next free number: *Survivors are matched by content and recorded on
  their own orphan branch*. It is hard to reverse once records exist, surprising
  without context (why not the `id`), and a real trade-off (attribution lost on
  a collision, against stability across edits).
- **`docs/gates.md`, "Not gated, deliberately"**: one row for the record's
  silence. It is not a trend, because G36 holds the `## Trends` table to emitted
  series in both directions, and it is not a gate, because the owner chose
  warn-only. Nothing watches whether records keep arriving except the summary
  line.
- **`gates/adapter-boundary.test.ts`**: `commit-metrics.ts` and
  `mutation-scopes.ts`'s entries have their reason lines updated for what each
  now reads and writes. `lib/survivor-record.ts` reads nothing and needs no
  entry.
- **`vitest.stryker.config.ts`**: C9's spec joins `exclude`, with its reason.
  It spawns `git` and writes a scratch remote, and that file's own rule is that
  a spec under `scripts/` must not touch the filesystem inside Stryker's dry
  run. The file is not part of the hashed config, so G56 does not move.
- **`stryker.scopes.json`, `stryker.config.mjs` and `stryker.floors.json` are
  untouched**, and `pnpm mutation:stamp --check` passes unchanged.
- **`metrics.yml`'s header comment**: the second branch, and the warn-only step
  beside the summary step's.
- **`docs/progress.md`**: one line, in the build's commit.
- **ADR-0055** is not edited. Its "durable, never immutable" applies to
  `survivors` as written, and `CONTEXT.md` links it.

## S5. Testing decisions

**One seam: a pure function from report to record, and another from two
records to a diff.** Tested with small synthetic `MutationReport` fixtures,
like `mutation-score.test.ts` and `metrics-record.test.ts`, with no Stryker run
and no network. Each claim below fails when its rule is broken:

- **C1. Survivor definition.** `Survived` and `NoCoverage` are in; `Killed`,
  `Timeout`, `CompileError`, `RuntimeError` and `Ignored` are out. Counts match
  `survivorsOf` on the same fixture. A survivor with no location is kept with
  `original: null`, and a survivor in a file no scope claims is left out.
- **C2. Order independence.** Shuffling every file's `mutants[]` and the order
  of `files` gives a byte-identical record.
- **C3. Collisions kept.** Two survivors with one key give two lines, and a diff
  against a record holding one of them gives `new` 1.
- **C4. Content, not position.** Prepending a line to a file and shifting every
  location by one gives `new` 0 and `gone` 0, the log's synthetic line-move
  canary.
- **C5. Control.** A record diffed against itself gives `new` 0 and `gone` 0.
  The diff counts a dropped survivor as `gone` 1 and an added one as `new` 1.
- **C6. Multi-line originals** are kept verbatim, newlines included, and
  round-trip through JSON.
- **C7. Comparability.** Two records that differ in `keySchema`, `stryker` or
  `configHash` give *not compared*, never counts.
- **C8. Skip and failure paths, as summary lines.** Each of these writes no
  record where §S4.3 says so and renders exactly one line, of the matching form:
  a non-zero mutation status, an empty one, a report that does not parse, a ref
  that is not `main`, a commit that failed after the diff was computed, a
  previous record that does not parse, and one whose `commit` is not hex or
  whose `recordedAt` is not ISO, which prints neither value.
- **C9. `commit-metrics.ts`, against a scratch bare remote**, run **twice in one
  clone**, for `metrics` and for `survivors`: the double run is what found its
  branch-already-exists bug. It creates the branch when absent. After the second
  run, `git ls-tree` of the remote tip lists **both** records. A run whose first
  push is rejected, because a second clone pushed in between, still lands with
  both records on the tip. It writes no file to disk other than the one it adds,
  checked by listing the throwaway worktree before it is removed. It hands back
  the previous record when asked, and leaves no worktree or staging branch
  behind. A local `file://` remote, so G21 (`no-live-network`) is not touched.
  It passes on Windows and on the CI runner.

**Not tested in the suite:** the workflow step itself. The first nightly after
the build is the end-to-end check, and the build's acceptance (§S6) reads it.

**Tests added:** the rejected-push case in C9 is one test beyond one per claim,
1 of the 2 the pact allows a change without asking.

## S6. Acceptance

1. C1–C9 pass in `pnpm test`, and `pnpm build`, `pnpm lint`, `pnpm lint:md` and
   `pnpm mutation:stamp --check` are green.
2. `pnpm metrics:commit` still writes `metrics/<timestamp>-<sha>.prom` to
   `metrics` and nothing else, checked against a scratch remote.
3. **The first nightly after merge** (a dispatch on `main` is fine) writes one
   file to `survivors`, whose survivor count equals the job summary's `survived +
   noCoverage` for that run, and whose summary line reads *the first record*. Its
   log shows the step's wall time and fetched bytes within §S4.6's budget.
4. **The second** reads as a diff against the first. When the two runs' commits
   share every mutated file's source, `new` and `gone` are each at most two.
5. The skip and failure paths are carried by C8. No live run is forced to fail,
   because forcing one would also write a failed night to `metrics`.

## S11. Needs a human, rollback and stop conditions

**Needs a human:**

| What | Who | When |
| --- | --- | --- |
| Sign the spec off: proceed, fix or kill | owner | before any build |
| Merge the build, which makes the next nightly create the public branch `survivors` | owner | at merge; the merge is the publish |
| Dispatch the nightly on `main` if the scheduled one would be more than a day away, for acceptance 3 | owner or the head chef, on the owner's word | the day of merge |
| Read acceptance 3 and 4 off the first two nightlies' summaries | the build session, or the head chef if it has ended | the two mornings after merge |

**Rollback.** Revert the build's commit: the step, the two scripts' new modes
and `commit-metrics.ts`'s rework go together, and `metrics:commit` returns to
checking out its tip. `survivors` stays where it is unless the owner says to
delete it. Nothing reads it, so leaving it costs nothing.

**Stop and ask the owner when:**

- `commit-metrics.ts` cannot write only the one file without checking out the
  tip, for either branch;
- the first nightly's survivor count differs from the summary's `survived +
  noCoverage`;
- a nightly passes §S4.6's budget;
- a change to `stryker.scopes.json`, `stryker.config.mjs` or
  `stryker.floors.json` turns out to be needed after all, which reopens q3.

## S7. Out of scope

- **A reader beyond the summary line**: a command to diff any two records, or
  to list survivors present on every one of the last N nights. That is the
  query that finds equivalent mutants. Filed as
  [#472](https://github.com/mephistopheles4/stacks/issues/472) on the owner's
  word (q5), to be built once records exist to query.
- **Changing what the eight scopes measure, arming anything, or the floors.**
  `stryker.config.mjs`, `stryker.scopes.json` and `stryker.floors.json` are
  untouched.
- **The 30-day artifact and the existing summary table**, done in #346.
- **Backfilling** nights before the build. Their artifacts expire, and the
  record starts with the first night after merge.
- **Protecting `survivors`** with a ruleset. Like `metrics`, it is durable and
  never immutable; `trend:sync`'s rewrite refusal (ADR-0059) does not read it.
- **The refinement key** (+ enclosing lines). It changed no count across the
  real edit; its only use would be naming the right line for a collision.

## S8. Lenses offered at Design

- **The spec pair**, `executability-lens` and `unstated-lens`: **run** on the
  owner's word (q2). Their crossed report and the fate of every finding are on
  [#469](https://github.com/mephistopheles4/stacks/pull/469).
- **The security pair**, `adversarial-lens` and `data-lens`, offered once for
  §S4.6–§S4.7 and **declined** by the owner (q2). The change moves a write path
  that holds a credential, without widening the credential.

## S9. Decisions, and what changing each would move

| Decision | Taken by | Changing it would move |
| --- | --- | --- |
| Build it: a stripped list, content key, multiset, own orphan branch | owner, on #344 | the whole spec |
| Tier standard, no sensitive route | owner, in this session's chat | §S8 |
| Reader is the summary line only | owner (Q1) | §S4.4, §S7, and a `pnpm` script with `AGENTS.md`'s Commands list |
| One file per run, every clean night, kept indefinitely | owner (Q2) | §S4.2, §S4.6 |
| Original kept verbatim, not hashed | owner (Q3) | §S4.2 size, C6 |
| Clean runs only, dispatch included | owner (Q4) | §S4.3, C8, acceptance 5 |
| Warn-only: a failed record never reds the night | owner (Q5) | §S4.5, the `docs/gates.md` row in §S4.8. ⚠️ The summary step is already warn-only in this shape, so this adds a second warn-only step rather than the first. Zero `continue-on-error` stays true |
| Branch named `survivors` | owner (q1, relayed by the head chef) | every path above |
| No new entry script: the git half in `commit-metrics.ts`, the record and the line in `mutation-scopes.ts`, pure logic in a mutated lib module | owner (q3, relayed by the head chef) | §S4.5, §S4.8, §S7. Option B would restamp and restart the calibration windows |
| Sign-off: proceed | owner (q6, relayed by the head chef) | the build |
| File the equivalent-mutant reader as a follow-up issue, #472 | owner (q5, relayed by the head chef) | §S7 |
| Guards for the two `security?` findings: C9 kept out of Stryker's dry run, and the previous record's SHA and date checked before printing | owner (q4, relayed by the head chef) | §S4.4, §S4.8, C8 |
| One commit path for both branches; never check out the tip | `spec-344`'s recommendation | §S4.6, C9, acceptance 2 |
| Header with key schema, Stryker version, `configHash` and per-scope counts | `spec-344`'s recommendation, after unstated-lens | §S4.1, §S4.2, C7 |
| Records only from `main` | `spec-344`'s recommendation, after unstated-lens | §S4.3, C8 |
| Code-unit sort, full key then location | `spec-344`'s recommendation | C2 |
| Scripts run by `pnpm exec tsx`, no new `pnpm` script | `spec-344`'s recommendation | §S4.5 |
| A "Not gated, deliberately" row, not a Trends row | `spec-344`'s recommendation | §S4.8 |

## S10. Trade-off points

- **Attribution against stability.** The base key stays matched when other text
  on a survivor's line changes, and pays for that by not saying which of two
  identical lines a colliding survivor is on. Side taken: stability, because the
  record's use is counting persistence and not pointing at lines. The driver is
  the floors arming in November, which needs counts that hold.
- **Reliability against availability of the verdict.** Warn-only keeps a good
  night green when the record fails, and lets the record stop arriving with
  nothing red. Side taken: the night's verdict, by the owner's choice. The
  summary line is the only signal, and the "Not gated, deliberately" row says
  so where the next reader looks.
- **Readability against size.** A verbatim original costs bytes a hash would
  not, about 72.7 KiB a night gzipped in all. Side taken: readability, because
  judging equivalence by eye is the point. Size is small against what the
  record replaces.
