# The constitution is AGENTS.md, and CLAUDE.md imports it

The invariants, the contracts and the commands live in `AGENTS.md`. `CLAUDE.md`
is a stub: one `@AGENTS.md` import, plus the notes addressed to that one
harness. Four gates — G8, G14, G19 and the new G37 — reach the file through a
single `AGENTS_DOC` constant in `gates/repo.ts`.

**Nothing about the five invariants is Claude-specific.** "The vault is the
source of truth" is a fact about this project, and the file carrying it was
named after one vendor's CLI. [AGENTS.md](https://agents.md/) is the convention
other agents read.

## Why this is not the third file ADR-0026 refused

[ADR-0026](0026-constitution-is-gated-not-duplicated.md) refused a
`CONSTITUTION.md` because it *"creates a third copy and a second thing to keep
in sync"*. **An import is not a copy.** There is one text. Claude Code expands
`@AGENTS.md` into context before the session starts, so a Claude session and a
Codex session read the same bytes, and no edit can land in one and not the
other.

That ADR's second argument was that *"two gates already parse `CLAUDE.md` by
heading and throw when it changes shape, so the invariants are load-bearing
where they are. Moving them would cost that and buy nothing."* Half of it
survives the rename intact: the gates parse the same headings, in a file with a
different name, and still throw. The other half — *buy nothing* — was true of a
third copy and is not true of a rename, which buys the name.

So this record **cites 0026 and does not supersede it**. Its rule is inherited,
and G37 now enforces the part that was previously only true because there was
nowhere else to put a rule: the three sections other gates parse must not appear
in `CLAUDE.md`.

## Why not a symlink, and why not the reverse

A symlink is the obvious answer and it dies here. Claude Code's own
documentation says so: *"On Windows, creating a symlink requires Administrator
privileges or Developer Mode, so use the `@AGENTS.md` import instead"*
([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)).
Windows is the maintainer's platform.

Pointing `AGENTS.md` at `CLAUDE.md` instead is cheaper and inverts the problem
rather than solving it: the file with the rules would still be named after one
agent, and the pointer would sit in the file every *other* agent reads.

## What is not verified, and cannot be

⚠️ **No second agent runs on this repo today.** Codex, Cursor and Jules read
`AGENTS.md` by convention; that convention is not exercised here, so "other
agents can now read the rules" is a **bet this change makes, not a fact it
establishes**. This ADR would rather say so than let a later session read the
rename as evidence.

⚠️ **The import is a claim about a tool, and it is still unobserved.** G37
asserts the line is present, alone on its line, outside a code span — that is
the whole of what the tree can hold. Whether the harness expands it is
version-dependent, and the session that made this change **could not check**:
`/context` is interactive and a headless probe failed to authenticate. The
check is one command and it is owed by a human before this is trusted; it is
written down, with what to look for, in
[`docs/log/2026-08-19-the-constitution-leaves-claude-md.md`](../log/2026-08-19-the-constitution-leaves-claude-md.md).
Recording it as owed rather than as done is the entire point of the file it is
recorded in. [#166](https://github.com/mephistopheles4/stacks/issues/166) was
right that no gate here can hold this.

## How this was decided

- **2026-08-19** — **The ticket's central objection was wrong, and checking took
  one fetch.** [#166](https://github.com/mephistopheles4/stacks/issues/166)
  called the pointer *"an untested claim that Claude follows a pointer — exactly
  the kind of thing this repo gates"*, and rated the option accordingly. It is
  not a claim about the model at all: `@AGENTS.md` is a launch-time import the
  harness expands, documented by the tool, with the Windows symlink caveat
  attached. The option the ticket ranked as needing an unbuildable gate was the
  option its own vendor recommends. Recorded because the objection was
  plausible, and because the whole cost of disproving it was reading the docs
  page for the tool in use.

- **2026-08-19** — **Moving the file and deleting it fail differently, and only
  one of those was the predicted failure.** #166 said G19 *"throws when it cannot
  find the `Invariants` section, rather than reporting zero uncited
  invariants"*. Against a *missing* file it does not get that far: `readRepoFile`
  raises `ENOENT` from `node:fs`, three frames below the gate. The designed
  message appears only once a stub exists. Both states were observed and both
  are in the log. The gate is fine; the prediction was one step too confident
  about which mechanism would catch it.

- **2026-08-19** — **One constant, because three literals is a family this repo
  already has three gates about.** G8, G14 and G19 each spelled `'CLAUDE.md'`
  themselves, and G8 and G14 hand-rolled the section regex that
  `markdownSection` already owned. G24's docblock makes the argument: *"a rule
  copied by hand is a rule that drifts, and the copies are only visible to
  someone who greps for all of the spellings at once."* Its carve-out — two
  harnesses may each name the same value, because they answer by different means
  — does not apply to four tests in one runner.

- **2026-08-19** — **G29 goes green through this change and should not be
  trusted for it.** Eight links across five files pointed at `CLAUDE.md` for
  claims about the invariants. The stub still exists, so every one of them still
  *resolves*: the link gate checks existence, not aboutness, and would have
  stayed green while `[invariant 4](CLAUDE.md)` pointed at a file with no
  invariants in it. They were repointed by hand. The gap is recorded here rather
  than gated, because "this link is about what it says it is about" is a
  judgement, and a gate that made it would be a gate that matches prose.
