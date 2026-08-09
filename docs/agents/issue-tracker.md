# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on
[`mephistopheles4/stacks`](https://github.com/mephistopheles4/stacks). Use the
`gh` CLI for all operations; it infers the repo from `git remote -v` when run
inside a clone.

**These conventions are for agents working with the engineering skills
installed. They are not a requirement for contributing** — see
[`CONTRIBUTING.md`](../../CONTRIBUTING.md). Nothing here gates a pull request.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## Wayfinding operations

How the `/wayfinder` map shape maps onto GitHub. Both relationships below are
**native** — they render in GitHub's own UI, so the frontier is visible without
opening the map.

- **The map** is an issue labelled `wayfinder:map`. Tickets are its **sub-issues**,
  each additionally labelled `wayfinder:research` / `prototype` / `grilling` / `task`.
- **Create a ticket under a map**: `gh issue create --parent <map> --label "wayfinder:<type>" --title "..." --body-file <file>`.
  Use `--body-file`, not `--body` — prose bodies contain apostrophes and
  backticks that break shell quoting.
- **Claim a ticket**: `gh issue edit <n> --add-assignee <login>` **before** any
  work. An open, unassigned ticket is unclaimed; that assignment is the lock
  against a concurrent session picking it up.
- **Blocking** uses GitHub's issue-dependencies API, which `gh` has no flag for:

  ```
  gh api --method POST repos/{owner}/{repo}/issues/<blocked>/dependencies/blocked_by -F issue_id=<id>
  ```

  `issue_id` is the blocker's **REST id**, not its number — get it with
  `gh api repos/{owner}/{repo}/issues/<n> --jq .id`.
- **Read what blocks a ticket**: `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '[.[].number]'`.
- **The frontier** — open, unblocked, unclaimed children of a map: list the
  map's sub-issues, drop any with a non-empty `blocked_by`, drop any with an
  assignee.
- **Resolve** a ticket: post the answer as a comment, `gh issue close`, then add
  a one-line pointer to the map's *Decisions so far*.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external
PRs as feature requests; `/triage` reads this flag.)_

GitHub shares one number space across issues and PRs, so a bare `#42` may be
either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## What this repo expects of a change, whatever opened it

`main` is protected by a ruleset with no bypass actors: a pull request is
required, the `gates` check must pass, and CodeQL must find no new security
alert at high or above. Those two are the contract, not any convention above
them. Before proposing a change, run:

```bash
pnpm test && pnpm build && pnpm gate:public && pnpm smoke:render
```

A defect worth fixing is usually worth a named gate that goes red — see
[`docs/gates.md`](../gates.md). An issue describing a defect is more useful when
it says which gate *would* have caught it, or that none would.
