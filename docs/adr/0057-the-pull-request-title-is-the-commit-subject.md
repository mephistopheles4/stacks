# The pull request title is the commit subject, so the convention lands there

Three things, decided together because they land on one artifact:

- **Commit subject** — [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`. The scope is **optional**, and drawn only from
  the things that exist: `core`, `cli`, `site`, `gates`, `docs`, `ci`.
- **The body is still the paragraph.** `AGENTS.md`'s *"Commit at every green gate
  with a one-paragraph summary"* is restated, not replaced: **subject is
  conventional, body is the paragraph.**
- **Branch** — `<type>/<issue>-<slug>`, e.g. `docs/167-conventional-commits`.
  Same type vocabulary, plus three kinds that never become a commit on `main`
  and so carry no issue number: `research/`, `prototype/`, `experiment/`.

⚠️ **This record shipped saying none of it was gated, and half of that is no
longer true.** Since 2026-09-03 the **pull request title and body** are read on
every `pull_request` event by G55 (`pr-conventions`) in [`gates.md`](../gates.md),
which is what that row scores. **The argument that changed is in the *other*
row** — *[A branch name follows the
convention](../gates.md#not-gated-deliberately)*, which is where the old refusal
was written and where its rebuttal now sits beside it: Clause A asks whether a
red's remedy is *reachable*, not who typed the fault. Read that row for the why
and the G55 row for the what.

The **branch name** and the **local commit subject** are still gated by nothing,
and that same row keeps them: a local subject is the string the squash discards,
and a branch is disqualified on coverage rather than visibility. **Everything
below this line is the 2026-08-19 record and is left as written**, including its
closing entry about a title gate that was drafted and dropped — which is the
reasoning G55 overturned, and worth reading beside it.

## The repository setting is the whole argument

`allow_squash_merge` is on, with `squash_merge_commit_title: PR_TITLE` and
`squash_merge_commit_message: PR_BODY`. **So the pull request title is the commit
subject on `main`, and the local subject is discarded.** A commit convention that
is not also a pull-request-title convention enforces nothing —
[#167](https://github.com/mephistopheles4/stacks/issues/167) said so, and the
setting confirms it rather than merely suggesting it.

**`allow_merge_commit` was on when this was written, and was turned off in this
change** — which is what lets the sentence above be unconditional rather than a
claim about practice. On the merge path the local subject survives under a
`Merge pull request #N` subject that is neither conventional nor prose; two of
`main`'s five merge commits are that shape, and both predate the current
workflow. Closing that case in prose would have meant a conditional clause in
three contributor-facing files, which is the duplication this record spent a
commit removing. Closing it in the setting costs one API call and deletes the
case. **Squash is now the only merge method**, and `delete_branch_on_merge` was
already on — which is why the branches a harness names do not survive their own
pull request.

⚠️ **Nothing in a clone can verify any of that.** Repository settings live
outside the tree and are already in [`gates.md`](../gates.md#not-gated-deliberately)'s
*Not gated, deliberately* table for that reason. So this paragraph is the record,
and it is exactly as true as the settings page — which is the weakest claim in
this file and the one holding up the other three.

⚠️ **The same setting means the one-paragraph rule already governs a string that
does not reach `main`.** `9cee3d7`'s body on `main` is the pull request body:
four markdown headings and a table, not a paragraph. That is not a violation
anyone committed — it is the rule pointing at the wrong artifact. Restating it
without saying *where* would leave it pointing there.

**So the rule binds the pull request, and the local commit inherits it.** Write
the paragraph on the local commit as before, because a commit that never gets a
pull request is still the record; put the same shape on the pull request,
because that is the copy that survives.

⚠️ **The paragraph and the pull request template are not two conventions, and
saying which wins is the whole point of this paragraph.**
`.github/pull_request_template.md` asks for five sections, two of which may not
be deleted. **The paragraph leads `## What changed, and why`; the template's
other sections follow it.** Left unsaid, this change would have created exactly
what #167 warned against — the repo carrying two rules for one artifact and
gating neither — because the rule it restates and the template it did not touch
both govern the squashed message body.

## The branch survey, which corrects the ticket

#167's *What is true today* says branches are `claude/<slug>-<hash>`. **After a
`git fetch --prune`, `origin` has 20 work branches and every one of them already
carries a kind:**

| prefix | branches |
| --- | --- |
| `research/` | 11 |
| `proto/` | 4 |
| `prototype/` | 3 |
| `experiment/` | 1 |
| `deep-pass/` | 1 |

**So this is mostly ratification, and the one real decision is `proto/` against
`prototype/`** — 4 against 3, a split too even to call a majority, and the exact
shape of the repo's own rule that *a name that names two things names neither*.
**`prototype/` wins**, on the only tiebreak that is not taste: every other prefix
here is an unabbreviated word. Existing `proto/` branches are **not renamed** —
they are pushed, none of them is on `main`, and renaming a pushed branch breaks
whatever checkout somebody has of it. `deep-pass/` was a one-off and the
vocabulary does not readopt it.

**A branch the harness named is exempt**, and this record was written on one
(`claude/stacks-issue-167-5b3b2f`). The name exists before a session can read a
rule about it, and mandating a `git branch -m` buys a tidier `git branch -r` at
the cost of fighting the tool. ⚠️ **The stronger reason is that those branches
are already gone**: three of them were on `origin` when this session started and
none survives a prune, because the squash deletes the branch it merged. **The
convention is for branches that outlive their pull request**, which is what
`research/`, `prototype/` and `experiment/` are, and what `pnpm worktree <branch>`
makes. A `/` in the name is already flattened to `-` there
(`scripts/worktree.ts:205`), so `docs/167-conventional-commits` becomes
`../stacks-docs-167-conventional-commits`.

## Why this was not gated — the short form, superseded

⚠️ **Superseded 2026-09-03. Kept because the reasoning it states is the
reasoning G55 overturned, and deleting it would leave the overturning
unexplained.** As written: *the full reason is the* Not gated, deliberately *row
in [`gates.md`](../gates.md#not-gated-deliberately) and is not repeated here. In
one line: **a commit-lint red is a rename for the maintainer and a tax on a
stranger whose change has no defect in it**, which is Clause A of
[`gate-or-trend.md`](../spec/gate-or-trend.md) failing for the person who hit
it.*

**What was wrong with it:** Clause A asks whether the remedy is *reachable*, not
who typed the fault. Anybody with write access can edit any pull request title or
body — including on a pull request from a fork, in one click, with no push from
its author — so nobody is stranded by this red. The dead pipe `trend-layer.md` §4
disposed of was a red a contributor **could not clear at all**, which is a
different case; the precedent was cited accurately and applied to something it
did not fit. The surface half of the old row was right and G55 is built on it:
the title on `pull_request`, never `commit-msg`.

## What this does not buy

⚠️ **`git log --oneline` does not become filterable retroactively.** 135 commits
carry prose subjects and none of them is rewritten —
[ADR-0025](0025-history-not-rewritten.md) settled that. The prefix starts here,
so `git log --grep='^fix'` returns a partial answer for a long time. Stated
because a convention adopted for filterability that silently returns a subset is
worse than no filter.

**The narrative subject survives, which is why this was cheap.** Conventional
Commits constrains the prefix, not the sentence: *"The scoreboard said CodeQL does
not block, two days after it started blocking"* becomes
`docs(gates): the scoreboard said CodeQL does not block, two days after it
started blocking`. This repo's history is its best documentation and the change
is additive to it.

⚠️ **No length cap, and that was measured rather than waived.** The conventional
72-character subject is already exceeded by **46 of 135** subjects on `main` —
34% — with a median of 68 and a longest of 103. A cap the repo's own history
fails a third of the time is a comment. The paragraph carries what does not fit,
as it always has.

## How this was decided

- **2026-08-19** — **The ticket's central question answered itself from a
  repository setting, and the answer was stronger than the argument for it.**
  #167 reasoned that squash-merging makes the pull request title the commit
  subject. `gh api repos/mephistopheles4/stacks` says
  `squash_merge_commit_title: PR_TITLE`, `squash_merge_commit_message: PR_BODY` —
  so it is a configured fact, not an inference about how the button behaves.
  Recorded because it also produced the finding the ticket did not have: the
  *body* rule has the same problem as the subject rule, and nobody had noticed
  because the pull request bodies here are good.

- **2026-08-19** — **The branch survey was run against stale refs, and the review
  caught it.** `git branch -r` in a fresh worktree reports whatever was last
  fetched: it showed 24 work branches including three `claude/*` and
  `166-agents-md`, and a `git fetch --prune` reduced that to 20 with no
  exceptions at all. The first draft of this record therefore built its central
  table — and a *"3 of 24"* claim in `gates.md` — on branches that no longer
  existed. `AGENTS.md` warns about exactly this for `pnpm worktree`: *"any base
  you did not check is whatever was last pulled"*, and *"that is the one failure
  here that says nothing"*. It says nothing about branch listings either. The
  corrected figure makes the argument stronger, which is the part worth
  distrusting: a stale measurement that flatters the conclusion is the one nobody
  re-runs.

- **2026-08-19** — **The subject-length count was one too high, and the cause was
  the shell.** `git log --format=%s | awk 'length($0)>72'` through Git Bash
  returned 47; PowerShell returns 46. One subject is exactly 72 characters and
  the line arrived carrying `\r`. `CLAUDE.md` already bans Bash on this machine
  for silent failure, with a different example; this is the same rule earning its
  keep on an off-by-one that would have shipped as a measured fact inside a
  paragraph about measuring rather than waiving.

- **2026-08-19** — **The ticket's premise about branches was wrong even before the
  prune.** *"Branches: `claude/<slug>-<hash>`"* described 3 of 24 then and 0 of 20
  now. The other prefixes turn the branch half from a proposal into a ratification
  with one genuine open question (`proto/` against `prototype/`). Worth logging
  beside the same session's other correction: both of the ticket's *"what is true
  today"* claims were about artifacts nobody had counted, and both were off.

- **2026-08-19** — **A review asked for a conditional clause in three files, and
  the setting was the cheaper place to put it.** CodeRabbit was right that
  *"this repo squash-merges, so the title reaches `main`"* held only on one of two
  enabled paths. The fix it proposed — qualify the sentence in `AGENTS.md`,
  `CONTRIBUTING.md` and the pull request template — would have re-spent the
  duplication the commit before it had just cut, to remove an ambiguity that
  misled nobody into a wrong action. `allow_merge_commit` was turned off instead.
  Worth logging as a shape rather than as an event: **when a documented claim is
  conditional because a setting permits a path nobody uses, changing the setting
  is a smaller diff than qualifying the prose, and it removes the case instead of
  describing it.** The trade is that the claim now rests on something no clone can
  check, which is why the paragraph above says so.

- **2026-08-19** — **The same review's major finding was correct, and the row it
  hit had been inconsistent with itself.** `docs/gates.md` claimed CI cannot see a
  branch name in any form a spec could assert; `gates.yml` runs on
  `pull_request`, where `github.head_ref` carries it — on the same event as the
  pull request title the row conceded as a defensible surface one clause earlier.
  The conclusion did not move, because the disqualification was always coverage
  rather than visibility: `head_ref` exists only on a pull request, so a branch
  that never opens one is never checked. Logged because the defect was **two
  halves of one sentence disagreeing**, which is the cheapest kind to catch and
  the kind three humans and two review agents had already read past.

- **2026-08-19** — **A pull-request-title gate was drafted and dropped on Clause
  A, and the argument was already written down.** It is cheap — a `pull_request`
  job, no network from the test suite, so [G21](../gates.md) never enters it — and
  cheapness is not the question. The question is whose red it is, and
  [`trend-layer.md`](../spec/trend-layer.md) §4 had already reached it for a
  different check: *"That fails Clause A **for the person who hit it**. A stranger
  paying for your dead pipe is not a gate; it is a tax."* This is the second check
  that argument disposes of, which makes it precedent rather than a new finding —
  and the reason the row in `gates.md` cites it rather than re-deriving it. The
  check remains unarguable for the maintainer and a tax for everybody else, and
  the repo has one maintainer today, which is an argument for gating it that
  expires the moment it would matter.
