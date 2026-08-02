# The constitution is CLAUDE.md's invariants, gated rather than duplicated

There is no `CONSTITUTION.md` and there should not be one. `CLAUDE.md`'s
"Invariants — never violate these" **is** the constitution and each numbered
rule is an article; [`docs/gates.md`](../gates.md) is the scoreboard that says
whether each article is enforced. A third document would be the same rules
written down a third time.

What was missing was not a document but a gate. `gates/constitution-scoreboard.test.ts`
(G19) holds the two files to each other in both directions, so "every article is
either gated in CI or visibly not" is checked rather than asserted.

## Why not a third file

`docs/gates.md` opens by naming this exact failure — *"A rule written down twice
is a rule that will be true in one place and false in the other — this project
has the scars to prove it"* — and then lists six documented claims that had
quietly stopped being true. Adding a `CONSTITUTION.md` restating five invariants
that already exist in `CLAUDE.md`, and are already scored in `gates.md`, creates
a third copy and a second thing to keep in sync, in a repo whose own history is
the argument against that.

Two gates already parse `CLAUDE.md` by heading and **throw** when it changes
shape, so the invariants are also load-bearing where they are.

## What the gate asserts

Both directions, three dimensions:

- Every numbered invariant is cited by some scoreboard row. ⬜ *"no gate yet"* is
  an acceptable and honest answer; silence is not.
- No row cites an invariant the constitution no longer defines.
- Every spec path named in a row resolves to a real file.
- Every `gates/*.test.ts` is recorded somewhere, so a gate cannot be written and
  left unscored.
- Every row's status is drawn from the scoreboard's **own key**, read at runtime
  rather than hardcoded in the test.
- Row numbers are unique and gapless — retiring a rule means marking it, not
  deleting the evidence it was considered.

## The interesting part is what it cost to get right

**It caught itself on the first run**: the spec existed and no row scored it.

**Then it failed on its own commentary.** The first version scanned the whole
document, and the narrative for G19 mentions `invariant 9` and a
`gates/*.test.ts` glob as examples of what makes it go red — so the gate read
its own prose as claims. The fix is the distinction that makes this gate
coherent: **a row is a claim the file makes; prose is commentary about the
claims.** Only rows are checked, and commentary stays free to discuss a path
that does not exist. The lenient exception is the "is this gate recorded
anywhere" check, where a mention in prose is still a mention.

Every check passed the day it was written, which is the point rather than a
weakness. The cost is nearly zero now and all of it is paid the first time
somebody adds an invariant, moves a spec, or writes a gate and forgets to come
back to the scoreboard.

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

- **2026-08-02** — **Observed red eight ways**, since a gate never observed
  failing is not yet a gate: a sixth invariant added with no row; a row citing
  `invariant 9`; a renamed spec path; an unscored gate file; a status symbol
  outside the key; a duplicated row number; a deleted row leaving a gap; and the
  `## Invariants` heading renamed, which **throws** rather than passing over an
  empty set. Green again after each restore.
