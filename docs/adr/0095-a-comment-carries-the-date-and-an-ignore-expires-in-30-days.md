# ADR-0095 — A comment carries the date, and an ignore expires in 30 days

**Date:** 2026-10-06
**Status:** accepted
**Issue:** [#405](https://github.com/mephistopheles4/stacks/issues/405)

## Decision

Every `auditConfig.ignoreGhsas` entry in `pnpm-workspace.yaml` is held to two
guards, and the first **reads data out of a comment**.

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-xxxx-xxxx-xxxx  # 2026-10-06, <why it cannot reach us>, fix pending
```

- **The date is the first token after `#`**, as `YYYY-MM-DD`, followed by a
  comma. An entry with no such date, a date that is not a real calendar date,
  or a date in the future **fails** (G62, `ignore-expiry`). So does a shape the
  reader does not recognise: a flow-style list, a quoted id, a second
  `auditConfig` key.
- **An entry expires after 30 days.** Age is whole UTC calendar days: day 30
  passes, day 31 fails. Renewing is a one-line commit with a new date, so each
  renewal is a decision in history.
- **A published fix ends the entry** (G63, `ignore-fix-published`). A step in
  the `audit` job reads the advisory from GitHub and the package's versions
  from npm, and fails when a stable version above the vulnerable ones and
  outside the vulnerable range is published. The decision comes from npm's own
  version list, never from the advisory's `first_patched_version`, which is
  `null` for GHSA-vfj7-8cjw-p6xm. Any lookup that fails or reads empty fails
  too.

## Why a comment, and why raw lines

pnpm's `ignoreGhsas` is a plain list of ids, so a date cannot sit inside an
entry. A side file would need a both-directions check that every id has a date
and every date has an id, and it would still sit apart from the line it
governs. The comment is where the template already put the date.

The price is that the data is in a place a YAML parser throws away. The reader
therefore works on raw lines, and nothing outside `packages/core` depends on a
YAML library, so no dependency is added. It is strict on purpose: a shape it
cannot read is a red, not an empty list.

## Why 30 days

It is long enough that a legitimate exception is not renewed weekly and short
enough that a decision nobody revisits cannot sit for a quarter. It is also the
backstop for what G63 cannot see: an advisory amended so its range changes, a
registry the step cannot read, or a fix reachable only through a parent
package's release.

## Consequences

- G62 is a test whose answer changes with the calendar, on purpose. A contributor
  who opens a pull request on day 31 meets a red `pnpm test` whose remedy is a
  one-line renewal or the upgrade. That is the cost of the re-decision, and
  the opposite of G39, whose staleness is nobody's diff to make.
- **The comment is no longer free text.** Its first token is read by a gate, and
  the template at the foot of `pnpm-workspace.yaml` says so.
- G63 touches the network, so it is a CI step and not a test: G21
  (`no-live-network`) is untouched. Its decision logic is the same pure module
  the gate test drives, and the step's I/O is verified by planting.
- A fix inside pnpm's 7-day quarantine still turns the step red. That is
  correct: an explicit `overrides` entry is honoured inside the window.
- `pnpm audit --ignore-unfixable` is never the answer here. It ignored nothing
  on 2026-10-06 and wrote `auditConfig: {}` into the workspace file.
