# CLAUDE.md — Stacks, for Claude Code

@AGENTS.md

<!--
The rules live in AGENTS.md. This file exists because Claude Code reads
CLAUDE.md and not AGENTS.md, and the `@AGENTS.md` line above is a launch-time
import the harness expands before the session starts — not an instruction the
model is asked to follow.

Everything below the import is addressed to this one harness. Nothing
project-normative may live here: G37 (gates/agents-import.test.ts) fails if a
second copy of the invariants, the commands or the frontmatter contract appears
in this file. See docs/adr/0056-the-constitution-is-agents-md.md.
-->

## Claude Code

**When compacting this conversation, always preserve:** the current phase and
which gates are green, the exact gate commands and their last output, the two
human stop points (Phase 0 plan approval; Phase 2 first screenshot), the
no-copyrighted-material constraint on fixtures, and any unlogged decisions still
owed to `docs/adr/`.

## Project skills and commands

Checked into `.claude/`, so they arrive with the checkout rather than with a
machine. **Optional, like everything else in this file** — the gates are the
contract, and none of these is one.

- [`.claude/skills/phase-gate/SKILL.md`](.claude/skills/phase-gate/SKILL.md) —
  closing out a phase: run the gate, show the output, record before committing.
- [`.claude/settings.json`](.claude/settings.json) — the `PreToolUse` hook that
  runs [`scripts/agent-test-guard.ts`](scripts/agent-test-guard.ts) before every
  Bash and PowerShell call. ⚠️ **The one entry here that is not optional**: it
  arrives with the checkout and runs in every session, as husky's hooks arrive
  with `pnpm install` ([ADR-0083](docs/adr/0083-hooks-arrive-with-pnpm-install.md)),
  and like them it gates nothing. The rule it enforces is in `AGENTS.md`, beside
  athanor; what it refuses and why is in
  [`docs/commands.md`](docs/commands.md#the-agent-guard--scriptsagent-test-guardts).
