# The constitution leaves CLAUDE.md — the three gates, observed red twice

The rules moved to `AGENTS.md`; `CLAUDE.md` became a stub that imports it.
[ADR-0056](../adr/0056-the-constitution-is-agents-md.md) carries the decision.
This file carries the evidence — the gates observed failing against the old
path, and the one check that could not be made.

## The three gates, red against the old path

[#166](https://github.com/mephistopheles4/stacks/issues/166) asked for each gate
that names `CLAUDE.md` to be observed red before the move. It was, in **two
distinct states**, which the ticket did not anticipate and which fail
differently.

**State A — the file moved, nothing in its place.** `git mv CLAUDE.md AGENTS.md`,
then the three gates:

```
Test Files  3 failed (3)
     Tests  10 failed | 14 passed (24)

Error: ENOENT: no such file or directory, open
'C:\Users\mephi\WebstormProjects\stacks-166-agents-md\CLAUDE.md'
 ❯ readRepoFile gates/repo.ts:62:10
 ❯ claudeMdCommandsSection gates/commands.test.ts:37:61
```

⚠️ **This is not the failure the ticket predicted.** It said G19 *"throws when it
cannot find the `Invariants` section, rather than reporting zero uncited
invariants"* — true, but only reachable when the file exists. Against a missing
file, `node:fs` raises `ENOENT` inside `readRepoFile`, three frames below the
gate's own check. The gate is fine and the loud failure is real; the prediction
named the wrong mechanism, which matters only because the prediction was the
argument that this needed no new gate.

**State B — the stub written, sections absent.** This is the state the repo
actually ships, and here the designed messages fire:

```
Error: no "## Commands" section in CLAUDE.md
Error: no "## Invariants" section in CLAUDE.md. A gate reads it, so a renamed
heading must fail here rather than reduce that gate to assertions over nothing.
Error: no "## Frontmatter contract" section in CLAUDE.md

Test Files  3 failed (3)
     Tests  10 failed | 14 passed (24)
```

Same count, different cause. Both were run before any gate was repointed.

**State C — G19 refused the new gate until it was scored.** After repointing,
with `gates/agents-import.test.ts` written and `docs/gates.md` not yet touched:

```
× scores every gate in gates/ in a row, not merely in prose
AssertionError: gates that no row in docs/gates.md names:
gates/agents-import.test.ts
```

Unprompted, and exactly what G19 is for.

## The check that could not be made

**Whether Claude Code expands `@AGENTS.md` is unverified.** The tool's docs say
it does — *"Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository
already uses `AGENTS.md`… create a `CLAUDE.md` that imports it"*
([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)) — and
the same page gives the Windows reason not to use a symlink. But documentation
is not observation, and two attempts to observe it here failed:

- `/context`, the check the docs prescribe, is an interactive terminal dialog
  and is unavailable to a non-interactive session.
- A headless probe — `claude -p "…quote invariant 3…" --allowed-tools ""` in the
  new worktree — returned `Failed to authenticate: OAuth session expired and
  could not be refreshed`.

**Owed, by a human, before this is trusted:** open a session in the repo, run
`/context`, and confirm **both** `CLAUDE.md` and `AGENTS.md` appear under
**Memory files**. `CLAUDE.md` alone means the stub loaded and the import did
not, which is the failure that looks like success — every rule silently absent,
and nothing in the tree able to notice. Record the CLI version beside the
result; the environment this was built in was **Claude Code 2.1.235** on Windows
11.

## What is gated now, and what is not

**G37 (`agents-import`)** holds two things: `@AGENTS.md` present and alone on
its line, and none of `## Invariants`, `## Commands` or `## Frontmatter
contract` appearing in the stub. The second is [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)'s
rule made mechanical — it refused a second copy of the invariants, and until
this change there was simply nowhere else to put one.

**G29 stays green through all of this, and should not be read as agreement.**
Eight links across five files — `CONTEXT.md` ×4, `CONTRIBUTING.md`,
`SECURITY.md`, `docs/agents/domain.md`, `docs/gates.md` — pointed at
`CLAUDE.md` for claims about the invariants. The stub still exists, so every one
of those links still resolves. The link gate checks existence, not aboutness:
it would have stayed green while `[invariant 1](CLAUDE.md)` pointed at a file
containing no invariants. They were repointed by hand, and the class is not
gated, because "this link is about what it claims to be about" is a judgement a
prose-matching gate would only pretend to make.
