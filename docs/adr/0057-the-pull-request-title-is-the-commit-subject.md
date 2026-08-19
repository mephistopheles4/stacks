# The pull request title is the commit subject, so the convention lands there — and nothing gates it

Three things, decided together because they land on one artifact:

- **Commit subject** — [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`. Scope optional, and drawn only from the things
  that exist: `core`, `cli`, `site`, `gates`, `docs`, `ci`.
- **The body is still the paragraph.** `AGENTS.md`'s *"Commit at every green gate
  with a one-paragraph summary"* is restated, not replaced: **subject is
  conventional, body is the paragraph.**
- **Branch** — `<type>/<issue>-<slug>`, e.g. `docs/167-conventional-commits`.
  Same type vocabulary, plus three that never become a commit on `main`:
  `research/`, `prototype/`, `experiment/`.

**None of it is gated.** The row is in
[`gates.md`](../gates.md#not-gated-deliberately) under *Not gated, deliberately*,
with the reason.

## The repository setting is the whole argument

`allow_squash_merge` is on, with `squash_merge_commit_title: PR_TITLE` and
`squash_merge_commit_message: PR_BODY`. **So the pull request title is the commit
subject on `main`, and the local subject is discarded.** A commit convention that
is not also a pull-request-title convention enforces nothing —
[#167](https://github.com/mephistopheles4/stacks/issues/167) said so, and the
setting confirms it rather than merely suggesting it.

⚠️ **The same setting means the one-paragraph rule already governs a string that
does not reach `main`.** `9cee3d7`'s body on `main` is the pull request body:
four markdown headings and a table, not a paragraph. That is not a violation
anyone committed — it is the rule pointing at the wrong artifact. Restating it
without saying *where* would leave it pointing there.

**So the rule binds the pull request, and the local commit inherits it.** Write
the paragraph on the local commit as before, because a commit that never gets a
pull request is still the record; put the same shape on the pull request,
because that is the copy that survives.

## The branch survey, which corrects the ticket

#167's *What is true today* says branches are `claude/<slug>-<hash>`. **Of 24
work branches on `origin`, 3 are.** The rest already carry a kind:

| prefix | branches |
| --- | --- |
| `research/` | 11 |
| `proto/` | 4 |
| `prototype/` | 3 |
| `claude/` | 3 |
| `experiment/` | 1 |
| `deep-pass/` | 1 |
| none | 1 (`166-agents-md`) |

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
rule about it, the squash discards it either way, and mandating a `git branch -m`
buys a tidier `git branch -r` at the cost of fighting the tool. The convention
binds branches a person or a script cuts — which is what `pnpm worktree <branch>`
makes, and a `/` in the name is already flattened to `-` there, so
`docs/167-conventional-commits` becomes `../stacks-docs-167-conventional-commits`.

## Why this is not gated

**A commit-lint gate is available and it is the wrong instrument.** Put
[`gate-or-trend.md`](../spec/gate-or-trend.md)'s Clause A to it — *does its red
have a named, reachable remedy?* — and the answer depends on who hit it. For the
maintainer, yes: rename the pull request. For a stranger, the build is red for
something that is not a defect in their change, which is the failure that spec
names in §2 and §4: **a stranger paying for your convention is not a gate; it is
a tax.** `CONTRIBUTING.md`'s standing promise is that a contributor with no agent
skills installed passes every gate.

**The surface would be defensible; the check is not.** If it were ever gated, the
only honest place is the pull request title on `pull_request`, because that is
the string that becomes history — not `commit-msg`, which lints a message the
squash throws away. That is written down here so the door is documented rather
than rediscovered.

⚠️ **The branch half cannot be gated at all, and that is not a preference.** The
tree cannot see a branch name from CI in any form a spec could assert, and three
of the branches in the table above were named by a harness before any rule was
readable. A check that can only ever fire on the branches a human cut is not a
gate; it is a partial one that reads as complete.

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
72-character subject is already exceeded by **47 of 135** subjects here, median
68, longest 103. A cap the repo's own history fails 35% of the time is a comment.
The paragraph carries what does not fit, as it always has.

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

- **2026-08-19** — **The ticket's premise about branches was wrong, and checking
  cost one `git for-each-ref`.** *"Branches: `claude/<slug>-<hash>`"* describes 3
  of 24. The other 21 already carry a kind, which turns the branch half from a
  proposal into a ratification with one genuine open question (`proto/` against
  `prototype/`). Worth logging beside the same session's other correction: both
  of the ticket's *"what is true today"* claims were about artifacts nobody had
  counted, and both were off.

- **2026-08-19** — **A pull-request-title gate was drafted and dropped on Clause
  A, not on cost.** It is cheap — a `pull_request` job, no network from the test
  suite, so [G21](../gates.md) never enters it — and cheapness is not the
  question. The question is whose red it is, and
  [`gate-or-trend.md`](../spec/gate-or-trend.md) §7 already records that Clause A
  gives different answers for different populations. This is the same finding
  arriving from the other side: not tree size, but **who is standing in front of
  the red**. The check is unarguable for the maintainer and a tax for everybody
  else, and the repo has one maintainer today — which is an argument for gating
  it that expires the moment it would matter.
