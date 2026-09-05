# zizmor lints the workflows, run by pipx and pinned exact

`pnpm audit` reads the dependency tree. A workflow has no dependency tree, so
until now **nothing in this repository read a workflow for a defect** — the one
class of file here that runs with a token, on code a stranger controls.

- **The tool is [zizmor](https://docs.zizmor.sh/)**, a static analyser for
  GitHub Actions workflows. It has been named in two comments in
  `.github/workflows/gates.yml` since the `style` job landed
  (`artipacked`, twice) and has run in no job.
- **It runs in the existing `audit` job**, beside `pnpm audit`, as
  `pipx run zizmor==1.30.0 --no-online-audits --min-severity=low .github/workflows/`.
- **Pinned exact**, for [ADR-0067](0067-the-counters-inputs-are-pinned-exact.md)'s
  reason: a release that adds an audit turns an unchanged tree red on whichever
  unrelated pull request happens to run after the bump.

## Why now: G55 needs it, and one gate cannot carry the rule

G55 (`pr-conventions`) reads the pull request title, which is **attacker-controlled
text**, in a workflow that runs on fork pull requests by design. A `${{ }}`
expression inside a `run:` block is substituted as text *before the shell
starts*, so a hostile title would run as code:

```yaml
# Wrong. The title becomes part of the script.
- run: pnpm exec tsx scripts/check-pr.ts "${{ github.event.pull_request.title }}"

# Right. The title arrives as data.
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: pnpm exec tsx scripts/check-pr.ts
```

`gates/pr-conventions.test.ts` refuses the wrong form in `gates.yml`. **That
clause is one file wide and this is the class**: the next workflow somebody adds
is where the hazard would actually arrive, and a gate that names one file cannot
see it. So the linter lands with the gate rather than after it.

⚠️ **The clause and the linter are not redundant, and the difference is when
each fails.** The clause runs in `pnpm test`, on a laptop, with no Python
toolchain — it is the half that fails while you are writing the workflow. The
linter runs in CI and covers every file. Neither is the other's spare.

## Why `pipx run` rather than an action or an npm package

- **It is not on npm.** zizmor is a Rust binary published to PyPI and to
  crates.io; there is no route into this tree's lockfile.
- **`pipx` ships on the `ubuntu-latest` runner image**, so this adds no action
  pin, no `uses:` line for G40 (`action-pins`) to hold, and no setup step.
  `zizmorcore/zizmor-action` exists and would work; it costs a SHA pin plus a
  version comment to buy a step this repository already has.
- **`--no-online-audits`** because the online audits ask GitHub about the actions
  a workflow references, and the `audit` job holds no token for that. It is also
  the mode the local invocation uses, so what a laptop reports is what CI
  reports.

## `--min-severity=low`, which drops sixteen findings and is the one judgement here

At the default floor the current tree reports **18 findings**: 2 `artipacked`
(medium) and 16 `template-injection` (informational). Every one of the sixteen is
a `steps.*.outputs.*` expression in `metrics.yml` — values that workflow computes
itself, in jobs triggered by a push to `main` or by a schedule. Raising the floor
to `low` is a judgement about those sixteen and nothing else: **every finding of
`low` and above is still a red**, and the hazard this whole change is about
reports as **error, high confidence**, measured on a probe and again on the real
file with the bad form planted in it.

The two `artipacked` findings are **suppressed in place with a written reason**,
in the `gates/` allowlist idiom — `# zizmor: ignore[artipacked]` beside the
`fetch-depth: 0` line of each `metrics.yml` checkout. They are correct findings
about a credential that is genuinely **used**: that job runs `pnpm metrics:commit`,
which pushes the run's record to the orphan `metrics` branch under
`contents: write`. `persist-credentials: false` is right on all four checkouts in
`gates.yml`, none of which pushes, and would break the trend layer here.

⚠️ **The suppression comment must sit on the line the finding points at, not
above the step.** Placed above `- uses:` it does nothing, silently — the run
still reported both findings and the summary line still said `2 medium`. Found by
reading the count rather than the exit code.

## What this does not buy

⚠️ **It reads workflows and not the actions they call.** A pinned SHA is proof of
*what* runs, never of what that code does; G40's row already states this limit
and zizmor inherits it in offline mode.

⚠️ **Nothing holds the rule set.** The `--min-severity` flag and the two
suppression comments are three places the analysis can be narrowed later, and
`gates/pr-conventions.test.ts` asserts only that zizmor runs and is pinned. That
is the same open edge G46's row already records for `eslint.lint.config.mjs`, and
it is [recorded, not solved](../gates.md#not-gated-deliberately) — in that row
rather than in a new one, because it is one rule about two linters and a second
row would be the duplication this repository spends its gates refusing.

## How this was decided

- **2026-09-03** — **The scope increase was named on the ticket rather than
  smuggled in.** [#289](https://github.com/mephistopheles4/stacks/issues/289)'s
  brief adds zizmor to the `audit` job and says outright: *"do not land the title
  check while the linter that guards its worst failure mode is still absent"*,
  with permission to split it out if it widened the change too far. It did not —
  one step, one pin, two suppression comments — so it lands together.

- **2026-09-03** — **The positive control was run before the tool was trusted,
  and it changed the flag.** The hazard was planted in `gates.yml`'s own
  `conventions` step and the byte-identical invocation was run against it:
  `error[template-injection] … audit confidence → High`. Without that, the
  `--min-severity` choice would have been a guess about whether the floor let the
  one finding that matters through — the shape this repository has logged enough
  times to have a name for, and the shape the gate spec beside this one fell into
  on its first draft.
