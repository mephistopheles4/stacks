# ADR-0150 — The agent docs hold what holds now, and the history lives in `docs/log/`

**Date:** 2026-11-12
**Status:** accepted, built in [#585](https://github.com/mephistopheles4/stacks/issues/585)
**Issue:** [#585](https://github.com/mephistopheles4/stacks/issues/585)
**Supersedes:** parts of [ADR-0040](0040-the-log-is-one-file-per-episode.md) and [ADR-0024](0024-decision-record-is-adrs.md), named below. Neither record is edited.

## Decision

The docs an agent reads at the start of a session state what holds now, and tell
how a rule came to be only where the story is itself the rule. The history moved
to `docs/log/`, verbatim, one file per cut. Three statements in older records no
longer hold:

- ADR-0040: *"`docs/progress.md` keeps current state, **the gate log**, environment
  findings…"*. `progress.md` has no gate log. Its old text, gate log included, is
  [`docs/log/2026-11-12-progress-before-the-cleanup.md`](../log/2026-11-12-progress-before-the-cleanup.md),
  and the live file holds the current state, the environment findings, the notes
  to the next session and the log index.
- ADR-0040: *"`gates.md` was not split… deferred deliberately"*. It is split now:
  the origin stories, issue trails and dated measurements behind its rows moved to
  [`docs/log/2026-11-12-gates-history.md`](../log/2026-11-12-gates-history.md), and
  every row keeps its slug, status and rule.
- ADR-0024: *"`docs/agents/domain.md` says which is which"*. That file is gone;
  its guidance is the Domain docs section of `AGENTS.md`, and
  `docs/agents/triage-labels.md` went into `docs/agents/issue-tracker.md` the same
  way.

Everything else in both records stands, including ADR-0040's one-file-per-episode
log and the rule that a record is never edited.

## Why

An agent reads these files whole at the start of every session, and each word of
how-it-came-to-be text is paid for every time. `docs/gates.md` was 44,170 words
and `docs/progress.md` 15,796, and the audit that opened #585 found history
mixed into rules in both. Gate G71 (`doc-word-budget`) holds ten of these docs
to a word ceiling set just over their cleaned size, so the history cannot drift
back unseen.

## What it costs

A reader who wants the reason behind a row follows a link to a log, one step
further than before. The two gains are a shorter file to read first and a
ceiling that goes red when it grows. G71 counts words and does not judge them,
so history under a ceiling is caught by review only.
