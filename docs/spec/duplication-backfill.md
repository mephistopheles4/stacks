# The duplication series, backfilled from history, and a trend page you can read

The spec for [#454](https://github.com/mephistopheles4/stacks/issues/454).
Standard tier, on the security route by the lead's pick: planned on Opus, to be
built test-first. Written on 2026-10-25 by session `stacks-454` from a grilling
against the code and three measured runs (§S10). Decisions q1 to q5 are the
lead's picks under the owner's standing instruction for the day. The panel,
the lines and the titles are the owner's own words, relayed by the lead.
**Signed off on 2026-10-25, the title table included, relayed by the lead.
Built in the pull request for #454**, and the owner's visual check passed on
C6 to C8 ("visual check is good for 454", relayed). That check saw the page
before the as-built changes in §S5.5: the bridged backfill, the named join and
the fixed colours. §S3 lists every decision and its source, the accepted risks
among them.

Every line number is on `main` at `e6cce7c`. Each place is also named by its
function, so a rebase can find it again.

## S1. Problem statement

The eight duplication series and the whole-tree four start with
[#262](https://github.com/mephistopheles4/stacks/pull/262) (`4596155`,
2026-08-25). Nothing says where duplication stood for the 137 commits on
`main` before that. jscpd 5.4.1, the version this repo pins, can scan a git
range with `--history`.

The trend page has a second problem the owner raised. Its charts read as
scattered dots, and their titles name a series rather than say what it
measures or which way is better. It also has no duplication chart at all, so a
backfill would land in the store with nothing that draws it.

## S2. Solution

1. **Backfill the whole-tree series only**, the four `duplication-tree-*`
   counts, for every first-parent commit from `d700bc5` (2026-07-31) to
   `aecb7cf`, the parent of #262. `jscpd --history` measures the counts in one
   run. The repo's own ignore sweep fills `ignoredLines`.
2. **Keep the result in a committed file, `jscpd.history.json`**, beside
   `jscpd.floors.json`. `pnpm trend:sync` renders it into the local store, as
   it already does for `renovations.json`. Nothing goes onto the `metrics`
   branch.
3. **Give it series names of its own**, `stacks_backfill_duplication_tree_*`.
   No reader of today's series can see them, and the store keeps them apart
   from the nightly ones.
4. **Add one duplication chart**, and draw every time-series chart as a line
   that bridges gaps of up to three days.
5. **Retitle every panel** in plain words, with an axis label on each chart.

## S3. Decisions, and where each came from

| # | Decision | Source |
| --- | --- | --- |
| q1 | Distinct series names, no `stacks_run_ok` and no `stacks_run_info` | Lead's pick. `event="backfill"` was ruled out by `floors.ts:869`, which counts every event but `push` as a nightly |
| q2 | The tree's four series only, no scopes | Lead's pick. Scopes were first declared on 2026-08-19 and changed 15 times since |
| q3 | A duplication chart on the trend page | The owner's words, relayed |
| q4, q5 | A committed file that `trend:sync` renders, not a record on `metrics` | Lead's pick on q5. It revises q4, which had put one record on `metrics` after merge, on its own go |
| q6 | Take the security pair's two spec fixes: bounds checks in `parseHistory`, and a fixed record name with a refusal for any other | Lead's pick |
| q7 | Accept that nothing proves the committed file came from the generator | **The owner's own word**, "454 a", given in the lead's chat and relayed by the lead. Recorded here and in the pull request; there is no threat model to record it in |
| q8 | Add claim C9, ASVS 5.0.0 V13.4 and V14.2 | Lead's pick |
| q9 | Sign off §S5.5's title table, and "my graphs" as every time-series chart | The owner saw the table in the lead's chat and changed nothing, relayed |
| T2 | Accept that `parseHistory` caps neither the point count nor the earliest time | **The owner's own word**, given in the lead's chat and relayed by the lead. Nothing built |
| q11 | Accept that `parseHistory` drops extra keys and allows a repeated commit, rather than refusing them | **The owner's own word**, given in the lead's chat on 2026-10-25 and relayed by the lead. Nothing built |
| q12 | Keep `duplication-report.ts` under G1: move its one write into `scripts/lib/history-file.ts`, and exempt only that file | Lead's pick. It narrows an exemption this change made, and accepts no risk |
| q13 | Accept two generator risks: an interrupted run may leave jscpd's temporary report behind, and a malformed jscpd report could quote a fragment in its parse error. Both are patterns `runJscpd` already has | **The owner's own word**, given in the lead's chat on 2026-10-25 and relayed by the lead. Nothing built |
| — | Lines instead of dots | The owner's words, relayed |
| — | Plain titles saying what is measured and which way is better, with axis labels | The owner's words, relayed. The table in §S5.5 goes to the owner before the build |
| — | The security pair on the spec and the diff | Lead's pick. Writing historical data into the shared trend store is close to the data-migrations item |

## S4. User stories

1. As the owner, I open the trend page and see duplicated lines as a share of
   all TypeScript, from the first commit to today, in one chart.
2. As the owner, I can tell the backfilled stretch from the nightly one, and
   I can see why the line steps where they meet.
3. As the owner, every chart reads as a line, and a run that went missing for
   more than three days still shows as a break.
4. As the owner, I can read each chart's title and know what it measures and
   which way is better, without opening its description.
5. As the next session, I can rerun the backfill and get the identical file,
   or a diff that says what changed.
6. As the ratchet, I never read a backfilled point: no window, cap, freshness
   check or deploy refusal sees one.

## S5. Implementation decisions

### S5.1 The measurement

`scripts/lib/duplication-history.ts`, a new module in the `scripts` scope. A
new file under `scripts/lib/` adds no entry to Stryker's `mutate` array, so
G56's `configHash` does not move.

- **It runs on the host, in the build worktree**, a linked worktree on
  Windows where `.git` is a file. History mode was rerun there on 2026-10-25
  and matched the throwaway clone point for point (§S10.3). The unit tests
  never need git history, so athanor's sealed snapshot can run them.
- **One jscpd run**, spawned like `runJscpd` (`duplication.ts:539`):
  `. --format typescript --ignore "**/*.d.ts" --history <tip>
  --history-limit 100000`, at `THRESHOLDS`, with the `json` and `silent`
  reporters. It reads git objects, and the working tree stayed clean across
  every run (§S10).
  - **The report goes to a temporary directory that a `finally` removes**,
    `runJscpd`'s rule. The report holds code fragments and paths from every
    commit it scanned.
  - **Each point is rebuilt from six fields and nothing else**: `commit`, the
    committer time, `clones`, `duplicatedLines`, `lines` (stored as
    `totalLines`) and the swept `ignoredLines`. jscpd's point also carries
    `subject`, `date`, `short`, `sources`, `tokens` and `percentage`. None of
    them reach the file, so no commit message is copied into it.
  - ⚠️ **`--history-limit` defaults to 30 and samples evenly**, so the limit
    is set above any range this repo can have, and the module refuses a
    report whose points do not cover every first-parent commit it expected.
  - ⚠️ **jscpd walks every commit in the range, merged side branches
    included**: 170 for this range, against 137 on the first parent. The
    module keeps first-parent commits only, read with their committer times
    from `git log --first-parent --reverse --format='%H %ct' <tip>`, and
    drops jscpd's `working` point.
  - `.d.ts` is ignored to match `treePopulationOf` (`duplication.ts:376`).
    Without that, total lines come out 40 high at `e6cce7c`.
- **`ignoredLines` comes from the repo's own sweep.** For each commit,
  `git grep -l -E 'ignore-(start|end)' <commit> -- '*.ts' '*.tsx' '*.mts'
  '*.cts'` lists candidate files. Each is read with `git cat-file blob` and
  passed to `ignoreBlocksIn` (`duplication.ts:211`). A commit with no
  candidate has zero ignored lines. This range has none (§S10.3), but the
  module computes the value rather than assuming it.
- **Each sample's time is the commit's committer time** (`%ct`). On `main`
  that is when the commit landed.
  - ⚠️ **Two first-parent commits share a second**: `dafa958` (#181) and
    `69a479e` (#183), both at 1787232790. A store holds one sample per series
    per timestamp, so the module keeps the descendant, the tree that stood at
    the end of that second. That gives 136 points, and the rule is written in
    the file's `$comment`.
  - The module refuses times that do not strictly increase after that rule.
- **The tip is a constant**: `BACKFILL_TIP`, the full SHA of `aecb7cf`, with a
  comment naming #262 as the commit after it. The tip is not an argument,
  because a backfill that ran past #262 would overlap the nightly series.

### S5.2 The file

`jscpd.history.json` at the repository root, written by the generator and
never by hand:

```json
{
  "$comment": ["..."],
  "tip": "aecb7cf8ca3af6cefd99e16205fa00d99fd89ded",
  "jscpdVersion": "5.4.1",
  "duplicationHash": "sha256:…",
  "points": [
    { "commit": "d700bc5…", "at": 1785506529, "clones": 0, "duplicatedLines": 0, "ignoredLines": 0, "totalLines": 467 }
  ]
}
```

- `duplicationHash` is `duplicationHashOf(duplicationInputs())`
  (`floors.ts:651`), the stamp the nightly records carry. A reader can tell
  which counting rule the backfill used, and comparing it with a record's
  `duplication_hash` says whether the two are comparable.
- **A parser that throws on any malformed field**, `parseDeclarations`' rule
  (`duplication.ts:754`): a partly read history file would draw a chart with
  holes nobody can see. ⚠️ **It checks bounds as well as types**, because the
  sync joins every record into one document, and one timestamp the block
  builder rejects writes no block for any of them (`renovations.ts`,
  `isRealDay`). So `parseHistory` checks all of these:
  - `points` is not empty;
  - each `at` is a positive safe integer, strictly increasing, and the last
    is below #262's committer time, 1787678208;
  - `tip` equals `BACKFILL_TIP`;
  - `jscpdVersion` is a dotted version, `duplicationHash` is `sha256:` plus 64
    hex characters, and each `commit` is 40 hex characters;
  - every count is a non-negative integer, and `duplicatedLines` is no more
    than `totalLines`.
- **Prettier-stable as written.** `.prettierignore` does not exclude a root
  JSON file, so the writer emits `JSON.stringify(document, null, 2)` plus a
  final newline, and C2 checks that `pnpm format:check` passes on the result.
- The file is JSON and not TypeScript, so neither duplication population
  scans it.

### S5.3 The generator command

`pnpm duplication:report --history` runs §S5.1, writes `jscpd.history.json`,
and prints one line per point plus a summary. Without the flag the command
prints the table, as today.

- A flag on the existing entry rather than a new script, because a new
  `scripts/*.ts` needs a scope exclusion and moves `configHash`. That entry is
  already excluded (`stryker.scopes.json:210`).
- It writes the file itself rather than printing JSON for a redirect, because
  a PowerShell redirect writes UTF-16.
- It is run by hand, once, and committed. Rerunning it against the same tip
  and the same jscpd gives byte-identical output (claim C2).
- `AGENTS.md`'s Commands block and `docs/commands.md` §`pnpm duplication:report`
  say what the flag does. `docs/commands.md` §`pnpm trend:sync` gains the
  history file, its two refusals (§S5.4), and the rollback in §S8.

### S5.4 Into the store

`scripts/trend-sync.ts` gains `writeHistory()`, beside `writeAsks`
(`trend-sync.ts:733`). The data is a repository fact, like `renovations.json`,
so CI never emits it and no `.prom` on the branch carries it.

- `renderHistory(history)` in `scripts/lib/metrics.ts`, beside
  `renderRenovations`, renders four gauge families with no labels:
  `stacks_backfill_duplication_tree_{clones,lines,ignored_lines,total_lines}`,
  one sample per point at its `at`, ascending. A fifth gauge,
  `stacks_backfill_info{tip,jscpd_version,duplication_hash}`, is set to 1 at
  the last point's time. It is the provenance a chart's tooltip can show.
  `METRIC_PREFIXES` gains `backfill: 'stacks_backfill_'`.
- `writeHistory` writes `LOCAL/1787677348-history.prom`. **The name is a
  constant**, `BACKFILL_TIP`'s committer time, so no edit to the data can
  rename the file. The name passes `parseRecordName`
  (`metrics-record.ts:65`), so the existing `selectNewRecords` path imports
  it once, and `--rebuild` replays it with surface D's rows.
  - When the file is missing, it is written.
  - When it exists with identical bytes, nothing happens.
  - When it differs and has not been imported yet, it is rewritten.
  - When it differs and has been imported, the sync refuses and names
    `--rebuild`, `renovations.json`'s rule for an edited entry: a changed
    value at the same timestamp cannot be undone by adding blocks.
  - When `LOCAL` holds a `*-history.prom` under any other name, the sync
    refuses and names it, so that a stale copy can never sit beside the
    current one.
- **A missing or malformed `jscpd.history.json` costs only the backfill.**
  `writeHistory` warns, naming the file, and the sync carries on with the
  branch's records and the asks, as `writeAsks` does when it cannot judge. A
  file that breaks must not stop the nightly data reaching the page. The
  warning never quotes the file's contents.
- **Nothing that reads the `metrics` branch changes**, and none of them can
  list a file that lives only in `.trend/local/`. The window code, the deploy
  refusal and G39 read the branch through `recordsAt`
  (`metrics-record.ts:165`) or `storedRecords`. `writeAsks` reads
  `storedRecords()` too, so the local file does not reach the ratchet's asks.
  Claim C4 checks this.

### S5.5 The trend page

All edits are in `grafana/dashboards/trend-layer.json`. Each panel has its own
JSON there, so no chart code is shared and nothing else in the repo reads that
file's panels (`trend-report.ts:343` only names it). ADR-0062 holds: the
order is a reviewed diff, there is still no threshold, and there is no target
line.

**The duplication chart**, new, placed after the four complexity charts and
before "The instrument". Two queries, both whole-tree:

- `100 * max_over_time(stacks_trend_duplication_tree_lines[$__interval]) / max_over_time(stacks_trend_duplication_tree_total_lines[$__interval])`,
  legend `nightly`.
- The same over `stacks_backfill_duplication_tree_*`, legend
  `backfill (jscpd 5.4.1, measured 2026-10-25)`.

The unit is `percent`, the reducer is the highest in a bin (the complexity
panels' rule: high is the unflattering direction), and the description says
what happens where the two lines meet. The backfill ends at 35 clones under
jscpd 5.4.1, and the nightly line starts at 33 under 5.0.16. *As approved,
this paragraph said the step is the counter and that the page's renovation
markers annotate it. Both were wrong, and the as-built note below replaces
them.*

⚠️ **The share is derived on the page and never recorded**, the rule
`duplication-report.ts` states: a ratio falls when the tree grows and nothing
else happens, so the record carries counts.

**Lines, not dots.** Every chart already has `"drawStyle": "line"`. They read
as dots because each query buckets by `$__interval`, about 2 h on the default
90-day range, while runs land a day or more apart, and `"spanNulls": false`
draws no segment across an empty bucket. All six time-series charts
(panel ids 4, 8, 9, 10, 11 and 5, the instrument), plus the new one, change:

- `"spanNulls": 259200000`, which is three days in milliseconds. A gap over
  three days stays broken on purpose, because the ratchet's window also
  breaks at three days, and a missing run should still show.
- `"showPoints": "auto"` instead of `"always"`, so Grafana draws a point only
  where there is room. `pointSize` stays 7.
- **As built, the backfill series bridges every gap.** A field override on the
  duplication chart's query B sets `spanNulls` to `true`. A gap in the backfill
  means no commit landed, as for 78 hours in mid-August, not that a run went
  missing. The nightly series keeps the three-day break. Added after the Test
  round's behaviour-lens, and after the owner's visual pass.
- **As built, the join is named.** No renovation marker stands at
  2026-08-25, because the first nightlies predate any declared jscpd bump.
  The two lines meet at about the same height, 0.86%. The first two nightly
  runs read 0.73% and 0.72%, and the line is back within the hour. The dip
  shows whenever a plotted point covers less than about half an hour, which
  is a month's range or less. The default 90 days hides it, because there
  each point is the highest run in its bin. The page's text and the chart's
  tooltip say so. Measured,
  the dip is about 0.10 points of counter and 0.03 of code: jscpd 5.4.1 reads
  0.83% at #262 itself.
- **As built, each series keeps one colour**: nightly green and backfill
  yellow, by fixed-colour overrides. Without them the backfill drew green
  wherever it was the only series in view.

**The titles.** The old titles and their caveats move into each panel's
`description`, the tooltip, so nothing is lost. Panel 1 and Panel 2 keep those
words at the start, because `AGENTS.md` and the page's first text panel say
"read panel 1 before panel 2". Each chart gains `"axisLabel"`.

| Position | Panel id | Old title | New title | Axis label |
| --- | --- | --- | --- | --- |
| 1 | 2 | Panel 1 — is this real: the run, and what merged into it | Panel 1 · Each CI run: when, which commit, and what merged into it | — (table) |
| 2 | 3 | Panel 1 — is this real: delta since the previous run, per scope | Panel 1 · Change in mutation score since the previous run, per scope (up is better) | — (table) |
| 3 | 4 | Panel 2 — is this bad: each scope against its own history | Panel 2 · Mutation score: % of mutants the tests kill, per scope (higher is better) | % killed |
| 4 | 8 | complexity-functions — the denominator the other three are read against | Functions counted, per scope (grows with the code, no better direction) | functions |
| 5 | 9 | complexity-mass — Σ cyclomatic complexity over those functions | Total complexity, per scope (lower is better, read against functions counted) | complexity |
| 6 | 10 | complexity-mass-over-10 — Σ complexity in functions above McCabe's cut | Complexity in functions scoring over 10, per scope (lower is better) | complexity |
| 7 | 11 | complexity-max — the largest single function | Most complex single function, per scope (lower is better) | complexity |
| 8 | 13 (new) | — | Duplicated lines, % of all TypeScript in the repo (lower is better) | % duplicated |
| 9 | 5 | The instrument: what the suite and a mutation run cost | Time to run the test suite and a mutation run (lower is better) | seconds |
| 10 | 6 | live-exclusions — displayed, never thresholded | Mutation exclusions still in force | — (stat) |
| 11 | 7 | of this many declared | Mutation exclusions declared | — (stat) |
| 12 | 12 | The ratchet asks — bounds the window says could be tighter | Bounds the ratchet says could be tightened (a prompt, never applied) | — (table) |

Positions 4, 10 and 11 name no better direction, because ADR-0062 keeps
verdicts off this page, and "fewer is better" there would read as one. A
direction on a title is not a verdict: it says which way a number moves when
the code improves, and it names no threshold and no target. ADR-0126 records
that rule beside the storage decision. "How to read this
page" keeps its title. Its text gains one sentence naming the duplication
chart and the backfill.

**Which charts "my graphs" means.** The owner's words could mean only some
charts. The default taken is every time-series chart, the seven listed above.
The tables and the two stats have no lines to draw.

### S5.6 The record

- ADR-0126, *The duplication backfill is a committed file under its own
  series names*: q1's names, q5's file, the reasons `event="backfill"` and a
  record on `metrics` were declined, and the rule that a title may name a
  direction but never a verdict (§S5.5).
- A log entry, `docs/log/2026-10-25-duplication-backfill.md`, holds §S10's
  measurements, with one index line in `docs/progress.md`.
- This file is added to `docs/spec/README.md`'s table.
- `docs/gates.md` needs no row: nothing here is a gate.

## S6. How the build is proved

### S6.1 Acceptance claims

- **C1. The backfill measures what the nightly measures.** At every commit
  where both exist and the record's `duplication_hash` equals today's, the
  module's tree counts equal the record's four values. A test drives the
  module's report parser and first-parent filter against a planted jscpd
  report.
  - **The live comparison is rerun with a throwaway script outside the
    repo**, never with a repo tool. The script runs §S10.2's raw jscpd
    command over `4596155~1..origin/main`, then compares each point with
    every record on `origin/metrics` that carries tree series. The build
    session quotes the command and the "N of N" result per era in the pull
    request.
  - ⚠️ **Any mismatch under today's `duplication_hash` stops the build**, and
    it goes to the owner through the lead.
- **C2. The file is complete and regenerable.** `jscpd.history.json` holds
  136 points, one per first-parent commit from `d700bc5` to `aecb7cf` after
  the shared-second rule, with times strictly increasing. Running
  `pnpm duplication:report --history` twice gives byte-identical files,
  `pnpm format:check` passes on the file, and every point has exactly the
  keys `commit`, `at`, `clones`, `duplicatedLines`, `ignoredLines` and
  `totalLines`. The temporary report folder is gone after each run.
  - Unit tests cover the history-limit refusal (a report missing a
    first-parent commit throws), the `working` point dropped, side-branch
    commits dropped, the shared-second rule, and a non-increasing time
    refused.
  - The rerun is shown in the pull request.
- **C3. The parser fails closed.** `parseHistory` throws on each shape
  §S5.2 lists: a missing field, a non-integer or negative count,
  `duplicatedLines` above `totalLines`, a non-increasing or unsafe `at`, a
  last `at` at or past #262, a `tip` other than `BACKFILL_TIP`, a malformed
  version, hash or commit, and an empty `points`. A unit test for each.
- **C4. No ratchet reader sees a backfilled point.** `renderHistory`'s
  output, put through `runRowsFrom` and `trendNamesIn`, yields no run row and
  no trend name. A unit test plants it beside a real record. The pull
  request lists the readers of `metrics/` and `storedRecords()` (§S5.4) and
  shows that none of them can list `.trend/local/`.
- **C5. The store takes it, and a second sync is a no-op.** The scratch
  store is the build worktree's own `.trend/`, never the main checkout's.
  There, `pnpm trend:sync` imports `1787677348-history.prom`. A second sync
  reports nothing new. Editing one point after the import makes the next
  sync refuse and name `--rebuild`. The build session runs this with Docker
  and pastes the three outputs.
  - ⚠️ **The containers are shared across checkouts.** `stacks-prometheus`
    and `stacks-grafana` have fixed names, so a sync from the worktree
    recreates them against the worktree's store. The owner's next sync from
    the main checkout points them back, and the main store's data is never
    touched.
  - Unit tests cover `writeHistory`'s six cases (§S5.4): missing, identical,
    changed and not yet imported, changed after import, another name
    present, and a malformed or missing committed file. As built, the cases
    live in two pure functions that `writeHistory` calls, `historyAction` and
    `committedFrom`, and their test blocks are what hold them.
- **C6. The duplication chart shows both stretches.** After a sync, the new
  chart draws the backfill from 2026-07-31 to 2026-08-25 and the nightly from
  2026-08-25 on, with the two legends in §S5.5. This is **the owner's visual
  check**.
- **C7. Charts are lines.** Every time-series chart has
  `"spanNulls": 259200000` and `"showPoints": "auto"`, and on the page each
  draws a connected line over nightly runs, broken only where runs are more
  than three days apart. The JSON is checked in review. The look is **the
  owner's visual check**.
- **C8. Titles and axis labels.** Every title in the trend page's JSON equals
  §S5.5's table, as the owner signs it off, and each chart has its axis
  label. The JSON is checked in review. How the titles read is **the owner's
  visual check**.

- **C9. Security: ASVS 5.0.0 V13.4 and V14.2.** No unintended leakage and
  data minimisation, for the backfill file and the store series. The
  committed file holds only the six fields per point and the four header
  fields, the temporary report is removed, and no warning quotes the file. The
  security pair checks this at Test against the generated file and
  `writeHistory`. Added on the lead's pick (q8).

C6 to C8 are a reviewed diff plus a look, with no gate test, because ADR-0062
puts no test on the dashboard file and a `gates/` file would need a G19 row.

### S6.2 The owner's visual check

When the build is pushed, the build session sends the lead "awaiting visual
check" with these steps:

1. Use the build worktree, never the main checkout. A pre-merge history file
   in the main store would need a `--rebuild` if review changes it.
2. Run `pnpm trend:sync` there. Docker must be running. This recreates the
   shared containers against the worktree, as C5 says.
3. Open <http://localhost:3000/d/stacks-trend-layer>, and set the range to
   cover 2026-07-31 to today.
4. Check C6, C7 and C8 against §S5.5.

### S6.3 Gates

`pnpm test`, `pnpm build`, `pnpm lint` through athanor, and
`pnpm format:check` and `pnpm lint:md` on the host. The scoped mutation run
for `scripts/lib/duplication-history.ts`, through athanor, by
`docs/commands.md`'s recipe, is quoted in the pull request as a trend and not
a gate.

## S7. Trade-off points

- **Fidelity against reach.** The scopes could be backfilled too, by running
  the repo's counter on each old tree under today's globs. That gives more
  lines, but they measure scopes nobody had declared, under a definition that
  changed 15 times. The tree population has been one rule throughout, and it
  matches the nightly exactly. Driver: §S8.
- **Comparability against continuity.** Re-measuring the nightly stretch
  under 5.4.1 would remove the dip at 2026-08-25, but it would draw a second
  line over data the store already holds and invite reading one for the
  other. The backfill covers only what nothing measured, and the page's text
  names the join, since no marker stands there. Driver: §S8.
- **Reviewability against branch purity.** A committed file adds 27 KB to
  the tree. In exchange, the data is reviewed in a diff, reverted by a
  revert, and never pushed to an append-only branch that every ratchet reader
  lists.

## S8. Business drivers

None is written in this project's agent instructions. Flagged once, as the
pact asks: each point above leans to the side that is cheaper to reverse. A
committed file and a dashboard diff are undone by a revert. A record on
`metrics`, once a scope is armed, is history the ratchet reads.

⚠️ **A revert does not reach a store that already imported the file.** The
rendered copy stays in `.trend/local/`, and `--rebuild` would replay it. The
full rollback is: revert, delete `.trend/local/1787677348-history.prom`, then
run `pnpm trend:sync --rebuild`. `docs/commands.md` carries it.

## S9. Out of scope

- Backfilling the scoped series, the mutation series or the complexity
  series. The issue rules out the last two.
- Any automatic ratchet, and any duplication calibration window (#269).
- Re-measuring the nightly stretch under today's jscpd.
- **A follow-up, not built here:** `readState` (`trend-sync.ts:257`) returns
  only `tip` and `imported`, so `renovations` and `asksDigest` are dropped on
  every read. Every sync then re-imports every renovation marker, and
  `writeAsks` compares with `undefined`. This spec's import goes through
  `imported` and does not depend on it. Filed as
  [#522](https://github.com/mephistopheles4/stacks/issues/522).

## S10. The measurement

Run on 2026-10-25 in a throwaway clone of this checkout, at jscpd 5.4.1,
50/5/mild. The working tree stayed clean throughout.

1. **Reproduction at one commit.** At `e6cce7c`,
   `. --format typescript --ignore "**/*.d.ts"` gives 315 files, 96,116
   lines, 74 clones and 783 duplicated lines. That equals the nightly record
   `1792879555-e6cce7ce1465.prom`. Without the `.d.ts` ignore, lines are
   96,156.
2. **The overlap.** `--history 4596155~1..origin/main` returned 142 points
   in 39 s. Compared commit by commit with all 202 records that carry tree
   series:

   | `duplication_hash` era | jscpd | Records | Match |
   | --- | --- | --- | --- |
   | `fcddde52…` (today) | 5.4.1 | 42 | 42 |
   | `c624c341…` | 5.3.2 | 55 | 55 |
   | `fffde866…`, `186437b1…`, `7c03d5dc…` | 5.0.16 – 5.2.0 | 105 | 0 on clones and duplicated lines; all on total lines |

   The older eras differ by about 2 clones and 50 lines, which is the counter
   changing, as each bump's renovation entry records.
3. **The backfill.** `--history aecb7cf` returned 170 points in about 26 s,
   in a 160 KB report: 169 commits plus `working`, covering all 137
   first-parent commits. Rerun in the linked build worktree, it took 67 s
   and gave identical points.
   - **The report's shape**, for the planted fixtures: the file is
     `jscpd-report.json`, and the history sits at `history.points`, beside
     `history.range` and `history.threshold`. Each point carries `clones`,
     `commit` (the full SHA), `date` (a day, no time), `duplicatedLines`,
     `lines`, `percentage`, `short`, `sources`, `subject` and `tokens`. The
     working-tree point has `commit: "working tree"` and `short: "working"`.
     The single-run `duplicates` and `statistics` keys describe the working
     tree, and the module reads neither.
   - `git log -S"ignore-start"` over `*.ts` on `main` finds nothing. The
     canary `-S"jscpd:ignore"` finds one commit, so the search works. Its one
     `ignore-end` hit is prose in #262 itself.
   - No tracked TypeScript sits under a directory `walkSource` skips
     (`node_modules`, `dist`, `artifacts`, any dot-directory) in any of the
     279 first-parent commits.
4. **Speed.** A 20-commit slice took 5.1 s. The generator's whole run is
   under a minute.

## S11. Needs a human

- **Before the build:** the owner signs off §S5.5's title table, through the
  lead, and with it the default that "my graphs" means every time-series
  chart.
- **At Test:** the security pair runs again on the diff, beside the QA and
  standards pairs. The merge is the owner's, through the lead.
- **After the build:** the owner's visual check, §S6.2.
- **After merge:** the owner runs `pnpm trend:sync` on their machine. No
  `--rebuild` is needed if C5 holds.
