# The constitution is CLAUDE.md's invariants, gated rather than duplicated

There is no `CONSTITUTION.md` and there should not be one. `CLAUDE.md`'s
"Invariants — never violate these" **is** the constitution and each numbered
rule is an article; [`docs/gates.md`](../gates.md) is the scoreboard that says
whether each article is enforced.

What was missing was not a document but a gate. G19
(`gates/constitution-scoreboard.test.ts`) holds the two files to each other, so
"every article is either gated in CI or visibly not" is checked rather than
asserted. **What it asserts, and what it cost to get right, are recorded in
[`docs/gates.md`](../gates.md)** — that is where a lesson about a gate belongs.

## Why not a third file

`docs/gates.md` opens by naming this exact failure — _"A rule written down twice
is a rule that will be true in one place and false in the other — this project
has the scars to prove it"_ — and then lists documented claims that had quietly
stopped being true. A `CONSTITUTION.md` restating five invariants that already
exist in `CLAUDE.md`, and are already scored in `gates.md`, creates a third copy
and a second thing to keep in sync, in a repo whose own history is the argument
against that.

Two gates already parse `CLAUDE.md` by heading and **throw** when it changes
shape, so the invariants are load-bearing where they are. Moving them would cost
that and buy nothing.

The naming gap the case study exposed was real but small: it says _constitution_
and _articles_ where the repo says _invariants_. That is answered by a sentence
in `CLAUDE.md` and one in `README.md`, not by a file.

## How this was decided

- **2026-08-02** — **The audit question, turned on this repo.** The framing came
  from an external write-up of this project as a reference implementation for
  making architectural invariants mechanically enforceable — taking a
  constitution article by article and asking, for each, whether anything
  mechanical would catch a violation or whether the article was resting on a
  reviewer happening to notice. Asked of `stacks` itself, the answer was that
  every invariant had a gate and the **scoreboard recording that fact had
  none**. Nothing read `docs/gates.md`; every gate that mentioned it did so in a
  comment. The document whose whole job is to record which rules are enforced
  was the last unenforced thing in the repo.

- **2026-08-02** — **A third document was the obvious answer and the wrong one.**
  The request was for a constitution. The repo already had one under a different
  name, plus a scoreboard, plus five invariants that two gates parse by heading.
  Writing the document would have satisfied the request and made the repo worse,
  because the thing actually missing was enforcement and a new file adds none.
  Recorded because "you already have this, under another name" is a conclusion
  that has to survive being unsatisfying.
