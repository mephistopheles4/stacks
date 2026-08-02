# CI: one required check named `gates`, on `pull_request`

A single required check named `gates` aggregates a `suite` matrix across Node 22 and 24. The workflow is never path-filtered, and it runs on `pull_request`, never `pull_request_target`.

Requiring `suite (22)` and `suite (24)` by name would mean editing the branch ruleset every time the matrix changes, and a required check that never reports blocks the pull request forever — which is also why a skipped workflow is unacceptable. Fork pull requests must not see repository secrets, and nothing in the gate needs one.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **One required check, named `gates`, aggregating a `suite` matrix.** Requiring `suite (22)` and `suite (24)` by name would mean editing the branch ruleset every time the matrix changes, and a required check that never reports blocks the pull request forever. The aggregator keeps one stable name. For the same reason the workflow is **never path-filtered**: a skipped required workflow reports nothing, which is indistinguishable from a check that has not run yet.

- **2026-07-31** — **CI runs Node 22 and 24.** `engines` claims `>=22` while development happens on 24, so testing only 24 would have left that claim as one more thing nothing checks — the exact failure this phase exists to stop.

- **2026-07-31** — **`verifyDepsBeforeRun: warn`, not `false`.** pnpm 11 defaults it to `install`, which makes `pnpm test` try to reinstall first and then abort with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in any shell without a TTY — every agent shell, every CI runner. `false` would have silenced the staleness diagnostic too; `warn` keeps it. It reported a genuine out-of-sync tree the moment it was switched on.

- **2026-07-31** — **`pull_request`, never `pull_request_target`.** Fork pull requests must not see repository secrets. Nothing in the gate needs one: tests inject a fixture-backed `HttpGet` that throws on an unmapped URL, so no live API call is reachable from CI.
