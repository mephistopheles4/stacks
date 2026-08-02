# Contributing

Most of this repository is written by AI agents, and that is the assumption
everything here is built on. The bar is not "did a careful person read it" — it
is "does a machine say it still holds". If you are an agent, this file is your
contract; if you are a person, it is the same contract.

## The short version

```bash
pnpm install
pnpm test && pnpm build && pnpm gate:public && pnpm smoke:render
```

Those four are the contract. If they are green, the project is where
[`docs/progress.md`](docs/progress.md) says it is. CI runs all four on Node 22
and 24 as a single required check called `gates`; `main` takes no direct pushes.

## Read these first

| | |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | the invariants and the contracts — the rules that must not break |
| [`docs/decisions.md`](docs/decisions.md) | every choice already made, dated, with the reasoning |
| [`docs/gates.md`](docs/gates.md) | which rule each gate protects, and which rules are protected by nothing yet |
| [`docs/progress.md`](docs/progress.md) | where the project actually is |

**The rules live in those files, not in this one.** They are deliberately not
restated here. A rule written down twice is a rule that will be true in one
place and false in the other — this project has the scars to prove it, and
[`docs/gates.md`](docs/gates.md) opens with the list.

## What a change has to do

**Arrive with a gate, or a reason it needs none.** A behavioural change that
nothing can fail on is a change nobody can protect. The pull request template
asks which invariant you touched and which gate would catch its regression;
"none, because…" is an acceptable answer, and a common one for docs.

**Prove the gate can fail.** A gate never observed failing is not yet a gate.
Write it, watch it go red against the real defect, then fix. If it was green the
moment you wrote it, break something on purpose and show that it noticed. Every
row in the scoreboard was held to this and several failed the first time.

**Log decisions in the same commit.** When you decide something the brief left
open — a library, an API quirk, a workaround — it goes in
[`docs/decisions.md`](docs/decisions.md) in the commit that makes the decision,
with the *why*. Not the next commit. It is append-only: a decision that turned
out wrong earns a new entry saying so, and the correction is usually the more
useful half.

**Do not batch.** One green gate, one commit, one paragraph explaining what
changed and why. Commit messages here carry reasoning, not summaries — read the
recent history before writing one.

**If a gate defeats three distinct approaches, stop.** Write up what you tried in
`docs/blockers.md` and end the session. Thrashing against a red gate is how a
gate ends up weakened to make it pass.

## Never, under any circumstances

**No third-party copyrighted material, ever.** Not a real book cover, not a real
blurb, not a real note body. Everything in `fixtures/` is invented —
see [`fixtures/README.md`](fixtures/README.md). Real covers exist at runtime
only, downloaded into a vault that is gitignored. This is the easiest rule to
break by accident and the most expensive to undo, so it is also a gate: G13
fails on any committed binary outside the generated fixture covers.

**No note bodies anywhere near a build.** The vault is somebody's private
reading notes. Nothing below the frontmatter fence is parsed, stored or shipped,
and the parser has no field to put it in — keep it that way.

**Never weaken a gate to make it pass.** If a gate is wrong, say so in the pull
request and change it deliberately, as its own commit, with the reasoning. The
allowlists in `gates/` are the obvious temptation: they are small, they are
easy to append to, and every entry is a permission. They reverse-assert for
exactly that reason — a stale entry fails.

## Pull requests

`main` is protected: pull request required, `gates` must pass, no force-push, no
deletion, and no bypass for anyone including the owner. Branch from `main`, keep
it current, and let CI report before asking for a merge.

There is no approval requirement — a sole maintainer cannot approve their own
work, so the check is the gate. That is a deliberate trade, and it is why the
gates have to be worth trusting.

## Optional: the engineering skills

The owner works on this repo with Claude Code and a set of
[engineering skills](https://github.com/mattpocock/skills) installed. The
per-repo configuration they read lives in [`docs/agents/`](docs/agents/):
where issues are tracked, the triage label vocabulary, and how to consume the
domain docs.

**None of it is required, and none of it is a condition of contributing.** The
four commands at the top of this file are the contract. A contributor with no
skills installed — or no agent at all — must be able to pass every gate, and if
that ever stops being true it is a bug in this repo, not in your setup. Nothing
under `docs/agents/` is read by any gate, any script, or CI.

They are written down because a workflow that lives only in one person's head
is the same failure this project keeps gating against: a documented claim that
nobody else can check. If you don't use them, the files cost you one directory
you can ignore.

## Reporting something you cannot fix

Open an issue with what you saw and what you expected. If it is a security
issue, see [`SECURITY.md`](SECURITY.md) instead — don't open a public issue.
