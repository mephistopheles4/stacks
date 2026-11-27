# ADR-0196 — Issues and specs live on Linear; pull requests stay on GitHub

**Date:** 2026-11-27
**Status:** accepted. Amends [ADR-0145](0145-new-specs-live-on-their-issues.md) on where a spec's issue lives and whose comment counts.

## Decision

Issues for this repo live on Linear, team `STACKS`, project `stacks`; pull requests stay on GitHub. A new spec is a Linear comment on its issue, titled `## Spec: <name> (revision <n>)`, revised by a new revision or a `## Spec amendments` comment and never edited, as ADR-0145 set for GitHub. It counts when its author is the owner's Linear account or the connector's app, Mephisto's Homunculus, because sessions post as that app on Linear where they posted as the owner's account on GitHub, and only once a merged README row names it. GitHub issues and the specs already written on them stay where they are and are read there; nothing new is posted to them. The rules are in [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md).

## Why

The owner keeps every repository's issues on Linear, and two agents filed on GitHub because this repo's rules still said to.

**What is given up:** the `gh` read-back by byte comparison for issue posts, and an assignment timestamp: the connector shows no assignment time, so a claim is dated by the claim comment that goes with it.

## How this was decided

The owner, in chat: "Yeah, everything should be on linear, so we need to fix the issue tracker of Grimoire and Stacks."
