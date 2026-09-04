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

**Those four are the behavioural contract, and they are not the whole of
`gates`.** It also requires a `style` job, so a tree that passes all four can
still take a red. Run these two before pushing:

```bash
pnpm lint && pnpm format:check
```

`pnpm format` rewrites the tree and is the whole remedy for the second;
`pnpm lint --fix` repairs about a quarter of what the first reports and the
rest is read. Both are documented in [`docs/commands.md`](docs/commands.md).

**One-time setup, so `git blame` skips the reformat commit** — GitHub already
does this from the default branch, and a local clone needs telling once:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Read these first

| | |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | the invariants and the contracts — the rules that must not break |
| [`docs/adr/`](docs/adr/) | every choice already made, and why — read before contradicting one |
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

**A new row lands with its register entry, in the same commit.** Add a row to
[`docs/gates.md`](docs/gates.md) and it owes a matching section in
[`docs/gate-register.md`](docs/gate-register.md) carrying **five verdicts — one
bullet each for weakening, satisfying the letter, routing around, vacuous green
and decay — a date, and an observed-red line**, plus a disposition
(`gated` / `repaired` / `accepted` / `declined`) wherever a finding survives.
Row G41 (`gate-register`) holds the two documents to each other in both
directions, so a row without an entry is a red build rather than a thing
somebody notices later. **That is what stops the rule above being a sentence the
author remembers to write** — write the observed-red line when you observe it,
because reconstructing it weeks later is the decay this repo keeps cataloguing.

**Log decisions in the same commit.** When you decide something the brief left
open — a library, an API quirk, a workaround — it goes in
[`docs/adr/`](docs/adr/) in the commit that makes the decision, with the *why*.
Not the next commit. Records are append-only: a decision that turned out wrong
earns a new record saying so, and the correction is usually the more useful
half. A lesson about a gate goes to [`docs/gates.md`](docs/gates.md) instead.

**Do not batch.** One green gate, one commit, one paragraph explaining what
changed and why. Commit messages here carry reasoning, not summaries — read the
recent history before writing one.

**Write the subject and the paragraph on the pull request, not only on the
commit.** This repo squash-merges, so the title you put there becomes the subject
on `main` and the body becomes its message. The shape and the scope vocabulary
are in [ADR-0057](docs/adr/0057-the-pull-request-title-is-the-commit-subject.md).

**Both are checked, and the remedy is an edit rather than a push.** G55
(`pr-conventions`) reads the title and the body on every pull request event,
`edited` included, and refuses a title that is not `<type>(<scope>): <subject>`
or a body that has dropped either of the two questions the template says may not
be deleted. The failure names which fault it is. **You do not need to force-push
to clear it** — edit the pull request, and the check re-runs. Anybody with write
access can make that edit, including on a pull request from a fork, which is why
this one is a gate and the branch-name half is not.

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

`main` is protected: pull request required, `gates` must pass, CodeQL must find
no new high-or-above security alert, no force-push, no deletion, and no bypass
for anyone including the owner. Branch from `main`, keep
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

Open an issue with what you saw and what you expected. There are two forms —
a defect and an idea — and every field on both is optional except the first.
A blank issue is still available and still a perfectly good issue.

If it is a security issue, see [`SECURITY.md`](SECURITY.md) instead — don't open
a public issue.

## Conduct

[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1,
unmodified apart from the contact address and a note about what a single
maintainer can and cannot escalate. Reports go to the address in that file, not
to the issue tracker.
