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
- **Claim an issue**: `gh issue edit <number> --add-assignee <login>` — or
  `--add-assignee "@me"` for the account `gh` is authenticated as. **When an
  assignment happened is half of what it means, and no `gh issue` flag carries
  it** — `updatedAt` is the issue's, not the assignment's. Ask who holds it now,
  then when they were given it:

  ```
  gh issue view <number> --json assignees --jq '[.assignees[].login]'
  gh api --paginate "repos/{owner}/{repo}/issues/<number>/timeline?per_page=100" --jq '.[] | select(.event == "assigned" and .assignee.login == "<login>") | .created_at'
  ```

  **Both halves are load-bearing.** An `assigned` event survives being undone, so
  a timeline hit is not a current claim — the first query is what says that login
  still holds it. The second prints one line per assignment *of that login*,
  oldest first, so **the last line is the one to age**: filtering by login keeps
  a co-assignee's timestamp out of the answer, and `--paginate` is there because
  events arrive oldest-first and a busy issue puts the newest on the last page.
  Do not fold the two into one call — `--slurp` is what would make a cross-page
  `max` possible in `--jq`, and `gh` refuses the two flags together.

  Those are the invocations only. **When a claim is due, what an assignee does
  and does not prove, and what to do when you find one is one rule, for any
  issue an agent picks up** — stated once, under *Working rules for agents* in
  [`CLAUDE.md`](../../CLAUDE.md#working-rules-for-agents), and not restated
  here, per [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md).

## Wayfinding operations

How the `/wayfinder` map shape maps onto GitHub. Both relationships below are
**native** — they render in GitHub's own UI, so most of the frontier is visible
without opening the map. The exception is **how old a claim is**, which no list
view shows: that half comes from the timeline, a ticket at a time.

- **The map** is an issue labelled `wayfinder:map`. Tickets are its **sub-issues**,
  each additionally labelled `wayfinder:research` / `prototype` / `grilling` / `task`.
- **Create a ticket under a map**: `gh issue create --parent <map> --label "wayfinder:<type>" --title "..." --body-file <file>`.
  Use `--body-file`, not `--body` — prose bodies contain apostrophes and
  backticks that break shell quoting.
- **Blocking** uses GitHub's issue-dependencies API, which `gh` has no flag for:

  ```
  gh api --method POST repos/{owner}/{repo}/issues/<blocked>/dependencies/blocked_by -F issue_id=<id>
  ```

  `issue_id` is the blocker's **REST id**, not its number — get it with
  `gh api repos/{owner}/{repo}/issues/<n> --jq .id`.
- **Read what blocks a ticket**: `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '[.[].number]'`.
- **The frontier** — open, unblocked, unclaimed children of a map: list the
  map's sub-issues, drop any with a non-empty `blocked_by`, then age the claim
  on each one that carries an assignee — the two queries under *Claim an issue*
  above, the second's last line being the timestamp — and drop the ticket only
  while that claim is still presumed live. **What "still live" means is
  [`CLAUDE.md`](../../CLAUDE.md#working-rules-for-agents)'s to say**, and it is
  not restated here, per
  [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md).

  ⚠️ **Dropping every assignee is the cheaper filter and the wrong one**, and it
  is what this bullet said until the window above existed. The rule expires the
  presumption instead of asking anyone to clean up after themselves, so nothing
  is ever unassigned here — and a filter with no window then outlives what it
  reads: the claim lapses, the ticket stays dropped, and an abandoned ticket
  silently stops being offered to anyone. That is the whole cost of the cheap
  version, and it falls on the tickets nobody is working. The price of the real
  one is two calls per **assigned** child, which on a live map is a handful; an
  unassigned child costs nothing extra, as it always did.

  ⚠️ **`--paginate` on that second query is load-bearing here, and this is the
  bullet that says why.** Truncated, it answers `[]` — and `[]` does not read as
  a failure, it reads as *never claimed*, which this bullet turns into **free to
  take**. So the flag's absence fails open, on the busiest tickets, which are the
  contested ones: this repo's own #120 answers the unpaginated query with `[]`
  while carrying two assignments. Anyone shortening the round trips will reach
  for it first, because it looks like the expensive part and dropping it looks
  like it worked.
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
