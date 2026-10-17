# The survivor record — every night's survivors, kept past 30 days

The spec for [#344](https://github.com/mephistopheles4/stacks/issues/344).
Standard tier: planned on Opus at medium effort, to be built on Sonnet at
medium. Written on 2026-10-17 by session `spec-344` for the owner to sign off.
**Nothing here is built until the owner says proceed.**

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

After a clean mutation run, the nightly writes one **survivor record** (see
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
8. As the owner, I want a `workflow_dispatch` run recorded like a scheduled
   one, with its event in the header, so that a dispatch fills a night that
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

### S4.2 The record

One file per clean run: `survivors/<timestamp>-<sha>.jsonl`, using the same
`<timestamp>-<sha>` form as `metrics/`, so the two records for one night share
a name stem. `survivors/` joins `metrics/` in `.gitignore` on `main`.

**Line 1 is the header**, one JSON object:

| Field | Value |
| --- | --- |
| `record` | `"survivors"` |
| `keySchema` | `1` |
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
- **`schedule` and `workflow_dispatch` alike.** `push` runs no Stryker and never
  reaches this step.
- **Otherwise there is no record**, and the summary line names the reason: the
  mutation run's exit status, or that the report did not parse.

### S4.4 The summary line

Computed before the commit, from tonight's record and the newest record already
on `survivors` (by `<timestamp>`). Four forms:

- **A diff:** tonight's total, `new`, `gone`, the previous record's short SHA and
  date, and the noise note. The note quotes the measured band, up to two on
  unchanged code, from the head-cap `Survived`↔`Timeout` flip, and links the
  first log.
- **The first record**: no previous record exists.
- **Not compared**: the key schema changed.
- **Not written**: the reason, from §S4.3 or from a failure in §S4.6.

Per-scope movement is left out of the line. The record holds it, and a reader
that wants it is a later ticket (§S7).

### S4.5 The workflow step

One new step in `metrics.yml`'s `nightly` job, **after** `write the mutation
report to the job summary`, so the line lands under the score table, and before
the final `fail if the run did not compute what it declared`. It:

- runs on `always()` and receives the mutation step's status through `env:`, as
  the summary step does, so it can name a skipped night;
- calls the writer with `pnpm exec tsx`, not a new `pnpm` script, so the
  Commands list in `AGENTS.md`, and `gates/commands.test.ts` with it, do not
  move;
- passes commit, event and run URL as arguments, as `emit` does, so no new
  variable reaches the env contract;
- **never fails the job**: `|| echo` into the summary, the shape the summary
  step already has. The final step does not read its status.

`push` gets nothing, and `gates.yml` is untouched.

### S4.6 Committing without a checkout

`commit-metrics.ts`'s flow — fetch the branch, put the file in a throwaway
worktree, commit, push with rebase and retry, create the branch when absent —
becomes **one helper with two callers**, taking the branch name, the source
directory and the file extension. `pnpm metrics:commit` keeps its name and its
behaviour. A copy would land in the `scripts` duplication series.

**The helper changes in one respect: it never checks out the branch's tree.**
`metrics:commit` checks out the whole tip, which costs nothing for `.prom` files
of a few hundred bytes. The survivor tip grows by about 818 KiB raw every night
and is never pruned, so the same checkout would write about 300 MB a year to the
runner, and more each year after.

The property is fixed: **the helper writes exactly one file to disk, the one it
adds.** The known way to get it is a `--no-checkout` worktree whose index is
filled from the fetched tip by `git read-tree`, so that a `git add` of the new
file and a commit change only that path. ⚠️ **The fetch is unmeasured.** A
`--depth=1` fetch still downloads every blob at the tip, about 26 MB a year
before deltas. A `--filter=blob:none` fetch would avoid that, but whether it
works in the runner's full clone, which is not a partial clone, was not measured
while this spec was written. The build measures it. If it does not work, the
depth-1 fetch stays: download cost grows by about 73 KiB a night, and that is
recorded in the ADR as the residual. `metrics` gets the same path, which changes
nothing it can observe.

The diff in §S4.4 reads the previous record from that fetched tip before the
commit.

### S4.7 Token scope

**No new scope, and not sensitive.** The `nightly` job already holds job-level
`contents: write` on the built-in `GITHUB_TOKEN` and keeps the credential on
checkout, because `metrics:commit` pushes. The repository's only ruleset,
`main-protection`, covers the default branch alone, so that token can already
push `survivors` or any other branch. The net change in authorization is zero.

What does change is **more code running beside that credential**: the writer
and the reworked helper join `pnpm test`, Stryker and `emit`, which already run
in that job. The record holds source text from a public repository and nothing
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
- **`gates/adapter-boundary.test.ts`**: the writer and the helper join the
  allowlist, each with its reason line, as `commit-metrics.ts` has.
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
  `survivorsOf` on the same fixture.
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
- **C7. Key schema.** Two records with different `keySchema` give *not
  compared*, never counts.
- **C8. Skip and failure paths.** A non-zero mutation status, or a report that
  does not parse, writes no file and produces the matching summary line.
- **C9. The helper, against a scratch bare remote**, run **twice in one
  clone**: the run that found `metrics:commit`'s branch-already-exists bug. It
  creates the branch when absent, appends on the second run, writes no file to
  disk other than the one it adds (checked by listing the throwaway worktree
  before it is removed), and leaves no worktree or staging branch behind.
  A local `file://` remote, so G21 (`no-live-network`) is not touched.

**Not tested in the suite:** the workflow step itself. The first nightly after
the build is the end-to-end check, and the build's acceptance (§S6) reads it.

## S6. Acceptance

1. C1–C9 pass in `pnpm test`, and `pnpm build`, `pnpm lint`, `pnpm lint:md` and
   `pnpm mutation:stamp --check` are green.
2. `pnpm metrics:commit` still writes `metrics/<timestamp>-<sha>.prom` to
   `metrics` and nothing else, checked against a scratch remote.
3. **The first nightly after merge** (a dispatch is fine) writes one file to
   `survivors`, whose survivor count equals the job summary's `survived +
   noCoverage` for that run, and whose summary line reads *the first record*.
4. **The second** reads as a diff against the first. On an unchanged tree,
   `new` and `gone` are each at most two.
5. A dispatch whose mutation step is forced to fail writes no file, its summary
   says why, and the night's verdict comes from the existing checks alone.

## S7. Out of scope

- **A reader beyond the summary line**: a command to diff any two records, or
  to list survivors present on every one of the last N nights. That is the
  query that finds equivalent mutants. A later ticket, once records exist to
  query.
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

- **The spec pair**, `executability-lens` and `unstated-lens`, which the pact
  calls for at Design on the standard tier. Offered as one question with the
  security pair.
- **The security pair**, `adversarial-lens` and `data-lens`, offered once and
  only for §S4.6–§S4.7. The change moves a write path that holds a credential,
  without widening the credential.

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
| One helper, two callers; never check out the tip | `spec-344`'s recommendation | §S4.6, C9, acceptance 2 |
| Header line with key schema and per-scope counts | `spec-344`'s recommendation | §S4.2, C7 |
| Code-unit sort, full key then location | `spec-344`'s recommendation | C2 |
| Writer run by `pnpm exec tsx`, no new `pnpm` script | `spec-344`'s recommendation | §S4.5 |
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
