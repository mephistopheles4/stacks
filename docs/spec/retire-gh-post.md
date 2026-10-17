# Retire `scripts/gh-post.ts`

**Issue:** [#461](https://github.com/mephistopheles4/stacks/issues/461) ·
**Tier:** standard · **Record:** [ADR-0115](../adr/0115-the-repo-ships-no-posting-tool.md),
superseding [ADR-0078](../adr/0078-a-tool-rewrites-prose-before-it-reaches-github.md) ·
**State:** signed off by the owner on 2026-10-17 (relayed by the head chef);
**built**

## S1. Problem statement

Two posting tools give opposite instructions. `AGENTS.md` sends every agent to
`scripts/gh-post.ts`. The owner's sessions run under the pact, which sends them
to the pact's own poster, and the pact wins. The owner wants one tool, and wants
it to live in the pact rather than in this repository.

## S2. Solution

The repository stops shipping a posting tool. `gh-post.ts` and everything only
it uses is deleted. `AGENTS.md` names no posting tool.
`docs/agents/issue-tracker.md` gives plain `gh` invocations that read the body
from a file, plus a one-line convention: GitHub prose is written unwrapped, with
full URLs. The rewrite `gh-post.ts` did is not replaced here. The pact closes
that gap on its own side, and a follow-up asks its poster to refuse a body that
breaks the convention (S8).

## S3. Decisions, and where each came from

| # | Decision | Source |
| --- | --- | --- |
| D1 | Standard tier | the owner, in the spec session's chat |
| D2 | Nobody rewrites prose. The convention is written down, and the pact poster is asked to refuse a hard-wrapped paragraph or a relative link | the owner, q1, relayed by the head chef |
| D3 | Retire `gh-post.ts`; `AGENTS.md` refers to no posting tool; the gap closes on the pact side; a new record supersedes ADR-0078 with the owner's reason | the owner's direction, relayed by the head chef |
| D4 | The convention lives in `docs/agents/issue-tracker.md`, not in `AGENTS.md` | the owner, q3, relayed by the head chef |
| D5 | The two library modules, their tests, and `runExeOutput` in `scripts/lib/run.ts` are deleted, since `gh-post.ts` is their only caller | the spec session, as mechanical |
| D6 | Prose that cites `gh-post.ts` as a precedent is rewritten in the past tense; ADRs and `docs/log/` stay as written | the spec session, as mechanical |

## S4. User stories

1. As an agent under the pact working in this repository, I want no
   instruction here that contradicts the pact, so that I post one way.
2. As a contributor or agent without the pact, I want
   `docs/agents/issue-tracker.md` to show me a `gh` command for each kind of
   post, reading the body from a file, so that I can post without installing
   anything.
3. As that contributor, I want the unwrapped-and-full-URLs convention stated
   beside those commands, so that my post does not render as ragged lines with
   dead links.
4. As anyone running `/crfix`, I want its reply step to name a working `gh`
   form, so that it does not point at a script that no longer exists.
5. As the next reader of `docs/gates.md` and `docs/commands.md`, I want no
   sentence claiming a tool exists that does not, so that I do not go looking
   for it.
6. As the owner, I want the reason for retiring the tool recorded in my words,
   so that a later session does not rebuild it.

## S5. Implementation decisions

Every file below is named because it names `gh-post.ts` today; the list came
from a full-tree search at `4e97f22`.

- **Delete** `scripts/gh-post.ts`, `scripts/lib/github-body.ts`,
  `scripts/lib/github-body.test.ts`, `scripts/lib/github-post.ts` and
  `scripts/lib/github-post.test.ts`.
- **`scripts/lib/run.ts`**: delete `runExeOutput` and its comment block. Its
  only caller is `gh-post.ts`. Check again at build time that nothing else
  imports it.
- **`AGENTS.md`**: delete the working-rule bullet that begins *"Post prose to
  GitHub through `scripts/gh-post.ts`"*, whole. Nothing replaces it (D3, D4).
- **`docs/agents/issue-tracker.md`**: replace the section *Posting prose: use
  the helper* with *Posting prose*. It holds the convention in one line (D4),
  `gh issue create --body-file`, `gh issue comment --body-file`,
  `gh pr create --body-file`, `gh pr review --comment --body-file`, and the
  review-thread reply as
  `gh api "repos/{owner}/{repo}/pulls/<pr>/comments/<id>/replies" -F body=@reply.md`.
  **The forms are POSIX-shell forms**, as the page's other blocks are, and the
  page says so in one line, with a note that PowerShell needs the
  `{owner}/{repo}` path quoted. It keeps the pointer to the six traps on #220,
  and it replaces the helper's automatic read-back with **one read-back form**:
  `gh api <the posted object's API path> --jq .body`, compared byte for byte
  with the file after normalising line endings to LF and dropping one trailing
  newline. The *Close* bullet's *"post it with the helper first"* becomes
  *"post it with `gh issue comment --body-file` first"*. Every
  *Conventions* and *Wayfinding operations* bullet that says *"the helper's X
  surface"* names the `gh` form instead, including `--parent` and `--label` on
  `gh issue create`. The pull-request bullet says to run `scripts/check-pr.ts`
  by hand before `gh pr create`, because the helper's pre-check of the title
  and template goes with it. The page names no posting tool beyond `gh`.
- **`.claude/commands/crfix.md`**: the reply step uses the `gh api … -F
  body=@reply.md` form. The ⚠️ warning about `-f` posting the literal filename
  stays, since it is still true. The sentence describing what the helper does
  is replaced by the read-back step: read the reply back with the page's
  read-back form before resolving the thread.
- **`gates/adapter-boundary.test.ts`**: remove the `scripts/gh-post.ts` entry
  and its comment from the allowlist. That list goes red on a missing file.
- **`stryker.scopes.json`**: remove the `scripts/gh-post.ts` exclusion. G38's
  scope check goes red on an exclusion of a missing file.
- **`stryker.floors.json`**: re-stamp `configHash` with
  `pnpm mutation:stamp` in the same commit, because removing the exclusion
  changes the hashed configuration (G56). **Add no dated paragraph to that
  file.** Its own comment forbids one for a stamp change.
- **`renovations.json`**: append one entry, `stamp: "configHash"`, whose
  `value` is the new hash. G57 (`renovation-markers`) goes red until the newest
  `configHash` entry matches the stamp on disk. Its `reason` says a stale
  exclusion went with its file, and two mutated, tested modules left the
  `scripts` scope. `pr` is the build's pull request number, so **open the
  draft pull request before committing this entry**. `preserves` is `false`,
  because the scope's mutated population changes and its calibration window
  restarts. **Check at build time that every floor is still `unarmed`.** If a
  scope is armed by then, stop and bring it to the owner before the merge.
- **`docs/gates.md`**: in the *Not gated, deliberately* row *Prose posted to
  GitHub is safe for a GitHub body*, replace the last sentence, which says
  `gh-post.ts` stands in its place, with one saying no tool in this repository
  does (ADR-0115). Its first cell's parenthetical, *"(the helper in
  `AGENTS.md`'s Working rules for agents)"*, names the bullet this change
  deletes, so it becomes *"(a posting helper, retired by ADR-0115)"*. No gate
  reads that row's text. The row stays refused. In the *shelf survives on real
  hardware* row, rewrite *"the precedent `scripts/gh-post.ts` set"* as history:
  *"a precedent the retired `gh-post.ts` set"*.
- **`docs/commands.md`** (around its line 975) and the comment in
  **`scripts/phone-check.ts`** (around line 28): the same rewrite as history.
- **`docs/adr/0078-…`**: add one line under its status, *Superseded by
  ADR-0115*, and change nothing else. ADR-0115's status moves from `proposed`
  to `accepted, built in #461`, and its row in `docs/adr/README.md` drops
  *"; proposed"*. This spec's **State** line and its row in
  `docs/spec/README.md` move to **built**.
- **Untouched**: `docs/log/` and every other ADR. They are history.

**Prerequisites, stop conditions and rollback.**

- **Prerequisites**: a fresh worktree with `pnpm install` run, and `gh` signed
  in with write access to the repository.
- **Stop and ask the owner** if any mutation scope is armed, if anything other
  than `gh-post.ts` imports `runExeOutput`, or if a gate goes red other than
  the five S7 names.
- **Rollback**: revert the squash commit, which brings the deleted files back
  from history. The posts from claim 7 are deleted by hand.

## S6. Acceptance claims

1. `git grep -n "gh-post\|github-body\|github-post\|runExeOutput"` matches only
   in these places: under `docs/adr/` and `docs/log/`; this spec and its row in
   `docs/spec/README.md`; the dated `REFRESHED … BY #220` note in
   `stryker.floors.json` and the new `renovations.json` entry's `reason`; and
   the past-tense precedent sentences S5 names in `docs/commands.md`,
   `docs/gates.md` and `scripts/phone-check.ts`.
2. `AGENTS.md` names no posting tool. `git grep -n "poster\|gh-post" AGENTS.md`
   returns nothing, and its *Working rules for agents* has no bullet about
   posting.
3. `docs/agents/issue-tracker.md` gives a `gh` form reading the body from a
   file for each of the five surfaces, one read-back form, and the convention
   once. `git grep -n "the helper" docs/agents/issue-tracker.md
   .claude/commands/crfix.md` returns nothing.
4. `pnpm test` is green, including G56 (`config-hash`), G57
   (`renovation-markers`), the adapter-boundary gate and G38
   (`mutation-scope`). Each of those fails if its S5 edit is left out.
   `git diff` adds no paragraph to `stryker.floors.json`.
5. `pnpm typecheck`, `pnpm lint`, `pnpm lint:md`, `pnpm format:check` and
   `pnpm build` are green.
6. ADR-0078 carries *Superseded by ADR-0115*, and `docs/adr/README.md` has
   ADR-0115's row without *"proposed"* (G58).
7. Two of the commands in `docs/agents/issue-tracker.md`, each run once in a
   POSIX shell with a two-paragraph body file, post a body that matches the
   file under the page's read-back form. The two are the issue comment,
   against #461, and the review-thread reply, against one review comment the
   build session opens on its own pull request with
   `gh api "repos/{owner}/{repo}/pulls/<pr>/comments" -F body=@note.md -f commit_id=<head sha> -f path=<a changed file> -F line=<n> -f side=RIGHT`.
   The reply form is the risky one: it is what `/crfix` uses, and `-f` instead
   of `-F` posts the literal filename. **The thread is resolved after the
   read-back**, because `main` will not merge with an open thread.

## S7. Testing decisions

No test is added, because the change removes code. The checks that could fail
are existing gates that go red if an edit is missed: adapter-boundary on a
missing allowlisted file, G38 on a stale exclusion, G56 on a stale stamp, G57
on a stamp with no matching `renovations.json` entry, and G58 on an unindexed
record. Claim 1's and claim 3's greps catch a stray mention that no gate reads.
Claim 7 runs two documented commands by hand, because no gate reads a wrong
`gh` form in a doc. ⚠️ Those posts land on #461 and on the build's pull
request, signed by the build session, and each is the owner's to strike (S12).

## S8. Follow-up, not built here

- **On the pact's repository**: the poster refuses a body holding a
  hard-wrapped prose paragraph or a repository-relative link, and never
  rewrites it. This is D2's other half. **Filed on the pact's repository** as
  [the-pact#317](https://github.com/mephistopheles4/the-pact/issues/317); nothing
  here files it.
- Noted for that ticket: the poster's `issue` surface has no `--parent`, which
  `gh-post.ts` had. That only matters for the pact's own users.
- **For the owner, outside the repository**: at least one of the owner's own
  agent memory entries, on round-tripping a body in PowerShell, still says to
  use `scripts/gh-post.ts`. After the merge it is a third instruction pointing
  at a missing tool, so it is edited or retired then. Nothing for the build.

## S9. Trade-off points

- **Maintainability against functional suitability.** One posting tool, kept
  outside the repository, against the rewrite that protected bodies from the
  hard-wrap failure. **Side taken: one tool.** Driver: the owner's direction
  (D3). Until the follow-up in S8 lands, the convention is the only guard, and
  ADR-0078 records that a convention alone failed fourteen times.
- **Reliability against the same.** `gh-post.ts` also read every post back and
  exited non-zero on a mismatch. Without the pact that check is now a manual
  step: the read-back form in `docs/agents/issue-tracker.md` and the matching
  step in `/crfix`. **Side taken: one tool**, for the same driver. A session
  under the pact keeps the automatic check, because the poster reads back.
- **Compatibility.** `pnpm exec tsx scripts/gh-post.ts` stops working. It was
  never a `pnpm` script, so G14 lists nothing to remove. Any session holding the
  old instruction gets a missing-file error rather than a wrong post.

## S10. Override list

The decisions the owner did not make directly, for striking: D5, D6, the
`renovations.json` entry's reason and its `preserves: false`, and claim 7's two
live posts, on #461 and on the build's pull request.

## S11. Out of scope

- Changing the pact or its poster.
- Rewriting `docs/` or this repository's hard-wrap house style.
- Editing bodies already posted.

## S12. Needs a human

1. **Sign-off on this spec**: proceed, fix or kill.
2. **The ticket cut in S8**: answered, the pact's head chef files it.
3. **Claim 7's two live posts**: the comment on #461 and the review comment
   with its reply on the build's pull request. Each can be struck at sign-off.
4. **An armed scope**, if S5's build-time check finds one: the build stops
   until the owner decides.
5. **The merge**, after every review thread is resolved.
