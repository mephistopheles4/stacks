# What produces a changed-lines coverage floor under Vitest 4

Research for [#110](https://github.com/mephistopheles4/stacks/issues/110), under
the map at [#108](https://github.com/mephistopheles4/stacks/issues/108). **Nothing
here is implemented, and nothing here picks a winner** — the ticket gathers
options and their real costs; the choice is a later ticket.

Every claim below is sourced to the document or the source file that owns it.
Where a question could not be answered from a primary source, it says
**unestablished** rather than guessing. Nothing here carries a wall-clock number,
because nothing here was measured: this repo already carries two stale unmeasured
estimates that [#108](https://github.com/mephistopheles4/stacks/issues/108) treats
as a pattern, and a third would be the same defect written by the ticket that
noticed it. §8 lists what a measurement ticket would have to establish.

**Short answer, in four parts:**

1. **Both providers work, and the TypeScript 7 premise in the ticket does not
   apply.** Vitest never invokes the `typescript` package; it transforms through
   Vite, which this repo has at `vite@8.2.0`. `typescript@^7.0.2` here is
   `tsc --noEmit` and nothing else. The v8-vs-istanbul accuracy question also
   closed upstream: since Vitest 3.2 the v8 provider remaps through an AST and
   Vitest's own docs claim it "produces identical coverage reports to Istanbul",
   and Vitest 4 **removed** the flag that made that opt-in.
2. **Vitest cannot produce a changed-lines floor by itself.** Its thresholds are
   global or per-file; the only diff-awareness it has is `--coverage.changed`,
   which restricts the report to changed *files*, not changed *lines*. Something
   outside Vitest computes the intersection.
3. **On a docs-only diff the tools split three ways** — and this is the axis the
   ticket is right to treat as decisive, because a docs-only PR is the common
   case here. `diff-cover` returns **100** by an explicit branch in its own
   source. Codecov's `codecov/patch` behaviour on a zero-denominator patch is
   **unestablished from primary docs** and is a blocker for that option. The
   comment-only actions do not gate at all, so they cannot fail on anything.
4. **The costliest finding is not about the diff at all.** Vitest 4 removed
   `coverage.all`, and the default report now **"include only covered files"**.
   A pull request that adds a wholly untested module contributes *no lines* to
   the report — so a changed-lines floor computed naïvely scores it 100%, not 0%.
   That is the exact shape of gaming
   [#108](https://github.com/mephistopheles4/stacks/issues/108)'s adversarial
   ticket is looking for, and it is a property of the default configuration, not
   of any tool. `coverage.include` closes it and is not optional here.

---

## 0. What this repo has already decided, in writing

[`docs/gates.md`](../gates.md)'s **"Not gated, deliberately"** table contains a
standing rejection of this ticket's entire subject:

| The row | Verbatim |
| --- | --- |
| Coverage percentage | *"Coverage measures execution, not detection. An AI asked to raise it produces exactly the gap it is asked to close. No ticket should ever exist to raise it."* |
| Changed-lines floor (diff-cover) | *"One contributor; it would be noise."* |

This document does not overturn either, and it is not the place to. Two things
it can supply to the ticket that will:

- **The second row names a tool, not a mechanism.** `diff-cover` is one of at
  least six ways to compute this, and its own properties (a Python dependency, a
  three-dot merge-base diff, exit code 1 on a threshold breach and nothing else)
  are not shared by the others. A decision that engages the row on its merits has
  to say whether *"it would be noise"* was about the instrument or about the
  measurement, because the answer differs per tool: an in-suite exit-code check
  adds no notification surface at all, and a Codecov PR comment adds one on every
  pull request.
- **The first row is stronger and lands on §1 of this document, not §2.**
  Installing a coverage provider makes a global percentage exist. Nothing forces
  it to be reported, and `coverage.reporter` decides — but "the number exists in
  CI and nobody is allowed to look at it" is a posture a spec has to state
  deliberately, and §5's tools mostly report the global number *whether or not*
  they gate on the diff. The one property of a diff-local floor that the first
  row's reasoning does not obviously reach: it cannot be raised by writing a test
  that executes untouched code, because untouched code is not in the denominator.
  Whether that is enough is the later ticket's call.

---

## 1. Producing coverage at all — `v8` vs `istanbul`

### 1.1 The TypeScript 7 premise does not apply

The ticket asks about the providers "under Vitest 4 and TypeScript 7". Checked
against the dependency graph rather than assumed:

- `vitest@4.1.10`'s dependencies contain no `typescript` entry at all; it depends
  on `vite` at `"^6.0.0 || ^7.0.0 || ^8.0.0"`
  ([registry.npmjs.org/vitest](https://registry.npmjs.org/vitest), version
  `4.1.10`).
- This repo's lockfile resolves `vite@8.2.0`, with `rolldown@1.2.1` and
  `esbuild@0.28.1` in the tree (`pnpm-lock.yaml`).
- `typescript@^7.0.2` is reached by `pnpm typecheck` — `tsc --noEmit` — and by
  nothing in the test path.

So neither provider is exposed to the TypeScript compiler this repo pins, and
"does provider X work with TS 7" is not a question either provider gets to
answer. What both are exposed to is **Vite 8 / Rolldown's** transform output,
which is a different risk and is where any real breakage would appear.

### 1.2 What Vitest 4 changed, and what it closed

From Vitest's own migration guide,
[Migrating to Vitest 4.0](https://vitest.dev/guide/migration):

- The v8 provider now uses *"more accurate coverage result remapping logic"*
  based on AST analysis rather than `v8-to-istanbul`.
- **`coverage.experimentalAstAwareRemapping` removed** — *"This capability is now
  the default and only supported remapping approach."*
- **`coverage.ignoreEmptyLines` removed** — *"Lines without runtime code are no
  longer included in reports."*
- `coverage.ignoreClassMethods` is now supported by the v8 provider too.

The corresponding upstream work is
[vitest#7736](https://github.com/vitest-dev/vitest/pull/7736) (the experimental
feature), [vitest#7928](https://github.com/vitest-dev/vitest/issues/7928)
(*"Enable V8 coverage's `experimentalAstAwareRemapping` by default and remove old
remapping mode"*) and
[vitest#8064](https://github.com/vitest-dev/vitest/pull/8064)
(*"feat!(coverage): v8 to support only AST based remapping"*), all closed.

The [coverage guide](https://vitest.dev/guide/coverage) states the consequence
directly: *"Since `v3.2.0` Vitest has used AST based coverage remapping for V8
coverage, which produces identical coverage reports to Istanbul"*, and
*"Coverage report accuracy is as good as with Istanbul (since Vitest `v3.2.0`)."*

**So the ticket's stated reason for preferring istanbul — v8's accuracy on
transpiled TypeScript — is a Vitest ≤3.1 concern that upstream closed and then
made mandatory.** `ignoreEmptyLines` being removed rather than defaulted is the
same closure seen from the other side: the AST pass knows which lines carry
runtime code, so the option had nothing left to do.

⚠️ **One residual, and it is the honest counterweight.**
[vitest#8497](https://github.com/vitest-dev/vitest/issues/8497) —
*"istanbul ignore else doesn't seem to be working with
experimentalAstAwareRemapping"* — and
[vitest#8238](https://github.com/vitest-dev/vitest/issues/8238) —
*"`experimentalAstAwareRemapping` fails for uncovered files with non-standard
symbols in their names"* — are both real defects found in the mode that is now
the only mode. Both are closed. The claim this document is willing to make is
that v8's remapping is *upstream-supported and no longer experimental*, not that
it is defect-free; "identical to Istanbul" is Vitest's claim about its own
output, and this repo has a rule about repeating a documented claim nothing
checks.

### 1.3 What each provider costs to install

| | `@vitest/coverage-v8` | `@vitest/coverage-istanbul` |
| --- | --- | --- |
| Latest | `4.1.10` | `4.1.10` |
| Peer on `vitest` | `4.1.10` — **exact**, not a range | `4.1.10` — **exact** |
| Instrumentation seam | reads V8's own counters, then remaps: `ast-v8-to-istanbul`, `@bcoe/v8-coverage` | rewrites every transformed file: `istanbul-lib-instrument`, `@babel/core` |
| Notable dependency | — | **`@babel/core@^7.29.0`** |

Both read from [registry.npmjs.org](https://registry.npmjs.org/) at
`@vitest/coverage-v8` and `@vitest/coverage-istanbul`.

Two consequences worth carrying into a spec:

- **The peer is an exact version, not a caret.** This repo declares
  `vitest: "^4.1.10"`. The day that range resolves to `4.2.0`, a provider pinned
  to `4.1.10` is a peer mismatch — so a coverage dependency couples the two
  version numbers, and Dependabot has to move them together the way it already
  moves an action's SHA and its trailing version comment.
- **istanbul brings `@babel/core`; v8 does not.** CLAUDE.md's rule is *"do not
  add dependencies without noting why"*, and ADR-0001 already reasons about
  *"version churn"* as the cost. A Babel tree is the larger of the two by a wide
  margin, and it is the tree with the ongoing churn.

Mechanism, read from the providers' own source:

- **v8** — `packages/coverage-v8/src/provider.ts` imports
  `type { Profiler } from 'node:inspector'` and `astV8ToIstanbul from
  'ast-v8-to-istanbul'`. It reads coverage the runtime already collected and
  remaps it; there is no pre-instrumentation step. Vitest's guide states the same:
  *"User's source files can be executed as-is without any pre-instrumentation
  steps."*
- **istanbul** — `packages/coverage-istanbul/src/provider.ts` imports
  `createInstrumenter` from `istanbul-lib-instrument` and instruments inside
  Vitest's `onFileTransform` hook:
  `this.instrumenter.instrumentSync(sourceCode, id, sourceMap)`. Every
  transformed file is rewritten, whole, synchronously.

That difference is the *shape* of the cost — v8's is paid per module loaded,
istanbul's per file transformed — and it is why Vitest lists both
*"✅ Faster execute times than Istanbul"* and *"⚠️ In some cases can be slower
than Istanbul, e.g. when loading lots of different modules"* for v8. **Which one
is faster on this suite is unestablished; see §8.**

### 1.4 ⚠️ The default that breaks a naïve floor

Vitest 4 removed `coverage.all` and `coverage.extensions`. From the migration
guide: reports now *"include only covered files"* unless `coverage.include` is
defined. The config reference agrees —
[`coverage.include`](https://vitest.dev/config/coverage)'s default is
*"Files that were imported during test run"*, and *"By default only files covered
by tests are included."*

**A file no test imports does not appear in the report at all.** It is not 0%; it
is absent. Every changed-lines tool in §2 works by intersecting the diff's line
numbers with the lines the report knows about — so an absent file contributes
zero lines to both numerator and denominator, and the diff coverage of a pull
request that adds an entirely untested module is **100%**.

That is not hypothetical arithmetic: it is exactly `diff-cover`'s documented
zero-denominator branch (§4.1), and it is the reason `coverage.include` is a
required part of any answer here rather than a tuning detail. The stated upstream
reason for the new default is unrelated to gating — it *"prevents Vitest's
coverage providers processing unexpected files, like minified Javascript, leading
to slow/stuck coverage report generations"*.

### 1.5 What Vitest's own thresholds can and cannot do

`coverage.thresholds` supports `lines`, `functions`, `branches`, `statements`,
plus `perFile` (default `false`), `autoUpdate` (default `false`) and `100`
(default `false`) — all from [the config reference](https://vitest.dev/config/coverage).
**None of them is diff-aware.** The nearest thing is the CLI flag
`--coverage.changed <commit/branch>`, documented as *"Collect coverage only for
files changed since a specified commit or branch"* — changed **files**, not
changed lines, and it narrows the *report*, not a threshold. `--changed` is the
test-selection flag; its coverage note is *"When used with code coverage the
report will contain only the files that were related to the changes"*
([CLI reference](https://vitest.dev/guide/cli)).

So: **Vitest alone cannot produce this gate.** Whatever lands, lands as a
consumer of a report Vitest writes. The relevant reporters — `lcov`,
`json-summary`, `clover`, `cobertura`, `json` — come from `istanbul-reports`,
which both providers depend on; `coverage.reporter` defaults to
`['text', 'html', 'clover', 'json']` and Vitest points at
[istanbul's reporter list](https://istanbul.js.org/docs/advanced/alternative-reporters/)
as the authority.

---

## 2. What computes the diff-restricted report

Six shapes, and they are not variations on one thing — three of them do not
produce a floor at all.

| Tool | Version | What it actually measures | Gates? | Needs |
| --- | --- | --- | --- | --- |
| `diff-cover` | `10.5.0` (2026-08-08, PyPI) | changed **lines**, LCOV × `git diff -U0` | yes, exit 1 | Python ≥3.10; merge-base history |
| roll-your-own | — | changed **lines**, whatever you write | yes, exit code | nothing |
| Codecov `codecov/patch` | `codecov-action` (CLI-based) | changed **lines**, computed server-side | yes, **as its own status** | hosted service; upload |
| Coveralls | `coverallsapp/github-action` | project coverage; no diff threshold | no | hosted service |
| `barecheck/code-coverage-action` | — | changed files' uncovered lines; threshold is a **base-vs-head ratio** | via comment/annotations | Barecheck GitHub App; a **second** coverage run on the base |
| `davelosert/vitest-coverage-report-action` | — | changed **files**, reported not enforced | no | `pull-requests: write` |
| `k1LoW/octocov` | — | **not this at all** — report-vs-report trend | yes, exit 1 on `coverage.acceptable` | optional datastore |

### 2.1 `diff-cover` — the only off-the-shelf changed-*lines* gate that runs locally

[Bachmann1234/diff_cover](https://github.com/Bachmann1234/diff_cover),
`10.5.0`, `requires_python >=3.10`, summary *"Run coverage and linting reports on
diffs"* ([PyPI JSON API](https://pypi.org/pypi/diff-cover/json)).

- **Input formats:** *"Cobertura, Clover or JaCoCo XML format, or LCov format"*.
  Selection is by extension — `diff_cover_tool.py` parses as LCOV *"if not
  coverage_file.endswith('.xml')"*. Vitest's `lcov` reporter feeds it directly.
- **Invocation:** `diff-cover coverage.xml --compare-branch=origin/release`,
  `diff-cover coverage.xml --fail-under=80`.
- **Exit code:** from `diff_cover_tool.py` — `if percent_covered >= fail_under:
  return 0`, else it logs *"Failure. Coverage is below %i%%."* and returns `1`.
  **One exit code and no status check of its own.**
- **The diff it takes** (`git_diff.py`):
  `git -c diff.mnemonicprefix=no -c diff.noprefix=no diff --no-color --no-ext-diff
  -U0 {compare_branch}{range_notation}HEAD`, with `...` (three-dot, merge-base)
  as the default `range_notation` and `origin/main` as the default compare branch.
- **Python:** `ubuntu-24.04` ships Python `3.12.3` and Pip `24.0` preinstalled
  ([actions/runner-images](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)),
  so this is a `pip install` step, not a `setup-python` step — but it is still a
  second package ecosystem in a workflow that currently has one.

### 2.2 Roll-your-own — what it would actually take

Not speculative; both halves are small and both formats are specified.

- **The diff side.** `git diff --no-ext-diff -U0 <base>...HEAD` emits hunk
  headers of the form `@@ -105,0 +106,18 @@`, which is `+<start>,<count>` on the
  new side — verified by running it in this worktree against `HEAD~1`. Added and
  modified lines are exactly those ranges; a header with no comma is a
  single-line hunk.
- **The coverage side.** LCOV's tracefile format, from
  [lcov's own `geninfo` manual](https://github.com/linux-test-project/lcov/blob/master/docs/man/geninfo.rst):
  `SF:<path to the source file>`, then `DA:<line number>,<execution count>
  [,<checksum>]` per instrumented line, `LF:<number of instrumented lines>`,
  `LH:<number of lines with a non-zero execution count>`, terminated by
  `end_of_record`. A zero execution count means the line was never executed.

The intersection is: for each `SF` in the changed-file set, count `DA` lines
whose line number falls in a `+` hunk range; the floor is
`count(execution count > 0) / count(all)`. Roughly a hundred lines of
dependency-free TypeScript, testable against fixture LCOV without git or the
network, and it exits non-zero inside the **existing** `suite` job — no new
status check, no token, no permission change, no second ecosystem. It is also
the only option in this table that can be *made* to fail on a zero denominator
rather than passing, which §4 shows is the decision that matters.

Against it: this repo would then own the LCOV parser, the hunk parser and the
zero-denominator policy, and `docs/gates.md`'s own rule — *"A gate never observed
failing is not yet a gate"* — applies to each of the three separately.

### 2.3 The ones that do not do this

- **`k1LoW/octocov`** ingests LCOV (*"supporting `SF` and `DA` only"*) and exits
  `1` when `coverage.acceptable:` is unmet, but its `diff:` is a comparison
  *"from previous reports"* retrieved via `diff.path:` or `diff.datastores:` —
  report-versus-report over time, not the pull request's changed lines. **It is
  a trend instrument**, which makes it interesting for
  [#108](https://github.com/mephistopheles4/stacks/issues/108)'s third piece and
  wrong for this one.
- **`davelosert/vitest-coverage-report-action`** posts *"a GitHub step-summary
  and … a comment on a pull request"*; `file-coverage-mode` defaults to
  `changes`, *"Show coverage only for files that were changed in the pull
  request"*. Changed **files**, and it reports rather than enforces — thresholds
  are read from the Vite config and *displayed*. It needs
  `pull-requests: write`.
- **`coverallsapp/github-action`** takes LCOV and posts to coveralls.io *"for
  analysis, change tracking, and notifications"*. Its only failure control is
  `fail-on-error` (*"Set to false to avoid CI failure when upload fails"*) —
  there is no changed-lines threshold.
- **`barecheck/code-coverage-action`** is closer but is a *delta* gate. Its
  `action.yml` describes `minimum-ratio` as *"Minimum code coverage ratio that
  would to be considered as a difference between based and head commits"* while
  the README calls it *"Percentage of uncovered lines that are allowed for new
  changes"* — the two readings differ, and the tie-breaker is `base-lcov-file`,
  *"Base code coverage report to generate percentage diff"*, whose existence
  means **the suite has to have been run on the base commit too**. It also wants
  the Barecheck GitHub App (`barecheck-github-app-token`), i.e. a third-party app
  installed on the repository.

---

## 3. The diff base, and how CI gets it

**The setting is `actions/checkout`'s `fetch-depth`, and the value is `0`.**

From [actions/checkout's README](https://github.com/actions/checkout/blob/main/README.md):
`fetch-depth` default `"1"`, described as *"Number of commits to fetch. 0
indicates all history for all branches and tags."* The README carries a scenario
titled *"Fetch all history for all tags and branches"* whose entire body is
`fetch-depth: 0`.

Two facts that make this necessary rather than decorative:

- **On `pull_request`, checkout resolves the merge ref, not the head.** The
  README's scenario *"Checkout pull request HEAD commit instead of merge commit"*
  exists precisely because the default is the merge commit, and its recipe is
  `ref: ${{ github.event.pull_request.head.sha }}`. Discussion on
  [actions/checkout#552](https://github.com/actions/checkout/issues/552) states
  the same from the other side: *"the default ref of this action is one extra
  'merge-commit' (the PR into the base branch), which will not only offset your
  fetch-depth by 1 additional commit needed, but possibly cause other issues (eg:
  with `git fetch` on the base branch, and trying to get commit history that can
  successfully derive a merge-base)."*
- **A depth-1 clone has no merge-base to compute.** `diff-cover`'s default range
  is three-dot (`origin/main...HEAD`), which git resolves through `merge-base`.
  With one commit fetched there is no common ancestor in the object store, and
  diff-cover's own README carries the workaround as a troubleshooting note:
  *"Fetch the remote main branch before running `diff-cover`: git fetch origin
  master:refs/remotes/origin/main"*.

**Three ways to satisfy it, and they are not equivalent:**

| | Cost | Correctness |
| --- | --- | --- |
| `fetch-depth: 0` | full history, every job that sets it | always has the merge-base |
| `git fetch --deepen=N` / depth heuristic | bounded | fails silently when the branch is older than `N`; [actions/checkout#552](https://github.com/actions/checkout/issues/552)'s top comment is literally *"assume that forks are never more than 300 commits"* |
| `git fetch origin ${{ github.event.pull_request.base.ref }}` after a shallow checkout | one extra fetch | the recipe in [#552](https://github.com/actions/checkout/issues/552): *"a `git fetch` to the other branch … will identify a common commit between the two branches and retrieve roughly only the commits needed"*, with the caveat that it *"may fail when you have commits belonging to the base branch in local history which have not been merged into the PR branch"* — which is the case with the default merge-commit ref |

⚠️ **Whichever is chosen, it lands on a job that today checks out at the default
depth.** [`.github/workflows/gates.yml`](../../.github/workflows/gates.yml) pins
`actions/checkout@3d3c42e…` with no `with:` block in any of the three jobs, so
all of them are depth 1 today. `fetch-depth: 0` on the `suite` matrix pays for
full history **twice** (Node 22 and Node 24); a separate `coverage` job pays once
but needs its own `pnpm install` and its own place in the `gates` aggregator's
`needs:` list — which is a change to the required check's composition, not a new
required check.

---

## 4. The docs-only diff — the disqualifier axis

This repo ships a great deal of prose, so a pull request touching only `docs/`,
`.astro` files, or the workflow is the common case. What each tool does when the
diff intersects **zero** coverable lines:

### 4.1 `diff-cover` — **passes, by an explicit branch in its own source**

`diff_cover/report_generator.py`:

```python
def total_percent_covered(self):
    total_lines = self.total_num_lines()
    if total_lines > 0:
        num_covered = total_lines - self.total_num_violations()
        total_percent = float(num_covered) / total_lines * 100
        ...
    return 100.0 if self._total_percent_float else 100
```

Zero lines returns `100`. `diff_cover_tool.py` then does
`if percent_covered >= fail_under: return 0`. **So a docs-only PR exits 0 for any
`--fail-under` up to 100.** The report itself says *"No lines with coverage
information in this diff."* (README).

This is the correct behaviour for the ticket's disqualification test — and it is
also the behaviour that makes §1.4's untested-new-file hole invisible. The same
branch produces both. Any spec that adopts diff-cover has to decide whether it
also needs a *separate* check that a changed source file appears in the report at
all, because diff-cover cannot tell "nothing coverable changed" from "something
coverable changed and no test ever imported it".

### 4.2 Codecov `codecov/patch` — **unestablished, and that is a blocker**

Codecov's own docs define the status — *"The codecov/patch status only measures
lines adjusted in the pull request or single commit"* and *"Patch coverage is
code coverage of the changed lines in your pull request. Codecov looks at your
git diff and then tracks the coverage of the lines within that diff."*
([commit-status](https://docs.codecov.com/docs/commit-status),
[patch-coverage](https://docs.codecov.com/docs/patch-coverage)) — but **none of
`commit-status`, `patch-coverage` or the FAQ states what happens when the
denominator is zero.** Searched: the docs, the FAQ, and
[codecov/feedback](https://github.com/codecov/feedback) issues.

The adjacent settings that exist are `if_not_found` (default `success`),
`if_ci_failed` (default `error`), `only_pulls`, `informational` and
`removed_code_behavior` — `if_not_found` covers *no report*, which is a different
condition from *a report with no adjusted lines*.

**The ticket's own rule is that a tool which reports 0% or divides by zero on a
docs-only diff is disqualified. Codecov cannot be cleared or disqualified on
this without an empirical test**, and an empirical test means a real pull request
against a real Codecov installation. That is a cost the decision ticket should
price, not a gap this document can close by reasoning.

### 4.3 The comment-only actions — **nothing to fail**

`davelosert/vitest-coverage-report-action`, `coverallsapp/github-action` and
`barecheck`'s comment path do not gate, so a docs-only diff produces a comment or
a summary and no failure. `davelosert`'s behaviour with an empty changed-file set
is not documented; it does not matter for a floor, because there is no floor.

`octocov`'s `coverage.acceptable:` is evaluated against the **project** number,
which a docs-only PR does not move — so it neither fails nor is diff-restricted.

### 4.4 Roll-your-own — **it is a decision, which is the point**

The zero-denominator case is a branch somebody writes deliberately, with a
comment saying why, in a file `pnpm test` already runs. Given
[`docs/gates.md`](../gates.md)'s standing preference for gates that fail visibly
and escape hatches that read as a one-line diff, this is the option where "what
happens on a docs-only PR" is answerable by reading the repo rather than by
reading a vendor's docs and hoping.

---

## 5. Status checks, comments, tokens and secrets

`main` has **two** required checks — the `gates` aggregator and CodeQL — and
[#110](https://github.com/mephistopheles4/stacks/issues/110) is explicit that
adding a third is a decision, not something a tool does by installing itself.

| Tool | Creates | New required-able check? | Token / secret | Third party |
| --- | --- | --- | --- | --- |
| `diff-cover` | exit code only | **no** | none | no |
| roll-your-own | exit code only | **no** | none | no |
| Codecov | `codecov/project`, `codecov/patch`, `codecov/changes` commit statuses | **yes — up to three** | see below | **yes** |
| Coveralls | posts to coveralls.io | (service-side status) | `github-token` | **yes** |
| `barecheck` | PR comment + review annotations | no | `github-token` **and/or** `barecheck-github-app-token` | **yes** (GitHub App) |
| `davelosert/…` | PR comment + step summary | no | `github.token`, needs `pull-requests: write` | no |
| `octocov` | PR comment / job summary; exit 1 | no | `pull-requests: write` for the comment | optional datastore |

Three things this table decides on its own:

- **Codecov mints its own statuses.** Codecov's docs describe project, patch and
  changes as *"separate, individually required-able status checks (e.g.,
  `codecov/project/default`, `codecov/patch`)"*. They appear on the pull request
  whether or not anyone marks them required — so the *"only `gates` may be
  touched"* constraint is not satisfied by declining to require them; it is a
  question about what shows up in the checks list.
- **`permissions: contents: read` is the current ceiling.**
  [`.github/workflows/gates.yml`](../../.github/workflows/gates.yml) sets exactly
  that at the workflow level. Every comment-posting option needs
  `pull-requests: write` added. The exit-code options need nothing.
- **The token question is subtler than "does it need a secret".** Codecov's
  token rules: *"all uploads require a token"* for private repos; for public
  repos a token is required *"if the upload is for a commit on a protected
  branch"* unless the org disables that; fork PRs are handled because *"Starting
  on >v4.0 of the codecov-action, the branch name on pull requests from forks is
  automatically modified to include a `:`"*, so *"fork PRs don't require token
  exposure by default"*
  ([codecov-tokens](https://docs.codecov.com/docs/codecov-tokens)). **`main` here
  is protected**, so the push-to-`main` half of this workflow is in the "token
  required" case even though the pull-request half is not. And the workflow is
  `pull_request`, never `pull_request_target`, so a secret would not reach a fork
  PR anyway — which is the point of that choice, not a problem with it.

  ⚠️ The residual on tokenless: Codecov's own warning is about *legacy*
  uploaders, which *"share a global Codecov-wide rate limit imposed by CI
  services. When this rate limit is exceeded, uploads fail."* A gate that fails
  on somebody else's rate limit is a flaky required check.

---

## 6. G21 — can instrumentation coexist with the network guard

**Yes, and the interesting half is what G21 does *not* cover.**

[`gates/no-live-network.ts`](../../gates/no-live-network.ts) replaces
`globalThis.fetch` inside the Vitest process, records every attempt, and asserts
the record is empty in an `afterEach`. Its own docstring scopes it: *"What it
covers is `fetch`, in this process"*.

Neither provider goes near it:

- **v8** reads counters the runtime already has (`node:inspector`'s `Profiler`
  types) and remaps them with `ast-v8-to-istanbul`; its provider does local file
  I/O only.
- **istanbul** rewrites source in Vitest's `onFileTransform` hook via
  `istanbul-lib-instrument`; also local only.

Neither replaces, wraps or reads `globalThis.fetch`, so `globalThis.fetch ===
guardedFetch` stays true and the setup file's assertion is untouched.

Two real interactions, and the second is the finding:

1. **`coverage.include` will see `gates/no-live-network.ts` itself.** If the
   include globs are written to cover the whole tree, the guard, the setup file
   and `gates/repo.ts` enter the coverage denominator alongside product code. Not
   a failure — but a changed-lines floor that counts a gate's own helper is
   measuring the wrong thing, and `coverage.exclude` is where that gets said.
2. ⚠️ **An uploader step is outside G21 entirely.** Codecov, Coveralls and
   Barecheck all make network calls — but from a *workflow step*, in a different
   process from the Vitest run. G21 replaces `fetch` in the test process; it
   cannot see, record or refuse a request made by a separate binary in a later
   step. So *"nothing here can reach the network at all"*, which
   [`.github/workflows/gates.yml`](../../.github/workflows/gates.yml)'s header
   comment says of the suite, would stop being true of the **workflow** while
   remaining true of the suite. That is a documented claim quietly ceasing to be
   true — the failure class [`docs/gates.md`](../gates.md) opens by listing six
   instances of — and it is caused by the *hosted* options, not by
   instrumentation.

---

## 7. What this leaves for the decision ticket

Stated as the questions, not as an answer:

- **Does the mechanism survive [`docs/gates.md`](../gates.md)'s two rejections**
  (§0), given that one names a tool rather than a mechanism and the other is
  about a global percentage that a diff-local floor does not raise?
- **Is `coverage.include` written, and does something check it?** §1.4 is the
  hole; without an explicit include, a changed-lines floor scores an untested new
  module at 100%. Anything that closes it is itself a claim that could go stale.
- **Exit code inside `suite`, or a status of its own?** §5. The exit-code options
  cost nothing in required-check surface; the hosted options cost up to three
  statuses and a third-party dependency, and take the workflow's network claim
  with them (§6).
- **Which `fetch-depth` remedy, and on which job?** §3. `fetch-depth: 0` on the
  matrix pays twice; a separate job changes what `gates` aggregates.
- **What does the floor do on a docs-only PR — pass, or say nothing?** Passing is
  what diff-cover does and is defensible. So is refusing to report at all. They
  differ when somebody wants a *trend*.

---

## 8. Unestablished — what a measurement ticket would have to answer

Nothing in this document was benchmarked. The baseline is
[#108](https://github.com/mephistopheles4/stacks/issues/108)'s measurement at
`1d0548f`: **636 tests across 66 files in 5.52s (7.1s wall)**. Against that:

1. **Wall-clock with `@vitest/coverage-v8` at `4.1.10`**, on this suite, on
   `ubuntu-latest`, both matrix legs.
2. **Wall-clock with `@vitest/coverage-istanbul`**, same conditions. Vitest's own
   guide gives contradictory directions for v8 (*"faster"* and *"in some cases
   can be slower … when loading lots of different modules"*), and 66 test files
   across three packages is exactly the ambiguous case.
3. **Whether the two providers agree on this repo's line numbers.** Vitest claims
   *"identical"* since 3.2. That is a checkable claim and this repo's culture is
   to check it rather than cite it.
4. **`codecov/patch`'s behaviour on a zero-coverable-line pull request** (§4.2) —
   the one blocking unknown, and only answerable empirically.
5. **The added checkout cost of `fetch-depth: 0`** on this repository's history,
   which is small today and is the number that decides §3.
6. **Whether Vite 8 / Rolldown changes anything for either provider.** Both
   providers' published matrices are stated against `vitest@4.1.10`; this repo
   resolves `vite@8.2.0` with `rolldown@1.2.1`, which is the newest part of the
   stack and the least likely to be covered by anyone else's testing.

---

## Sources

Vitest — [coverage guide](https://vitest.dev/guide/coverage),
[coverage config reference](https://vitest.dev/config/coverage),
[CLI reference](https://vitest.dev/guide/cli),
[migration guide](https://vitest.dev/guide/migration);
issues/PRs [#7736](https://github.com/vitest-dev/vitest/pull/7736),
[#7928](https://github.com/vitest-dev/vitest/issues/7928),
[#8064](https://github.com/vitest-dev/vitest/pull/8064),
[#8238](https://github.com/vitest-dev/vitest/issues/8238),
[#8497](https://github.com/vitest-dev/vitest/issues/8497);
provider source `packages/coverage-v8/src/provider.ts` and
`packages/coverage-istanbul/src/provider.ts`;
npm registry metadata for `vitest`, `@vitest/coverage-v8`,
`@vitest/coverage-istanbul`.

GitHub — [actions/checkout README](https://github.com/actions/checkout/blob/main/README.md),
[actions/checkout#552](https://github.com/actions/checkout/issues/552),
[actions/runner-images Ubuntu 24.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).

Tools — [diff_cover](https://github.com/Bachmann1234/diff_cover) README plus
`diff_cover/report_generator.py`, `diff_cover/diff_cover_tool.py`,
`diff_cover/git_diff.py`, and [PyPI](https://pypi.org/pypi/diff-cover/json);
[codecov commit-status](https://docs.codecov.com/docs/commit-status),
[patch-coverage](https://docs.codecov.com/docs/patch-coverage),
[codecov-tokens](https://docs.codecov.com/docs/codecov-tokens),
[codecov-uploader](https://docs.codecov.com/docs/codecov-uploader);
[coverallsapp/github-action](https://github.com/coverallsapp/github-action);
[barecheck/code-coverage-action](https://github.com/barecheck/code-coverage-action)
README and `action.yml`;
[davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action);
[k1LoW/octocov](https://github.com/k1LoW/octocov);
[lcov `geninfo` manual](https://github.com/linux-test-project/lcov/blob/master/docs/man/geninfo.rst).

This repo — [`docs/gates.md`](../gates.md),
[`gates/no-live-network.ts`](../../gates/no-live-network.ts),
[`.github/workflows/gates.yml`](../../.github/workflows/gates.yml),
[`vitest.config.ts`](../../vitest.config.ts), `pnpm-lock.yaml`.
