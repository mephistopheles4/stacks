---
name: phase-gate
description: Close out a Stacks phase. Use when a phase's work looks finished and you are about to claim it is done, or when asked to run/verify a phase gate. Runs the gate, records evidence, updates progress and the Decision Log, and commits.
---

# Closing a phase gate

A phase is done **only** when its gate passes. "Looks done" is not a gate.
Never claim a phase is complete without pasting the command output that proves it.

## 1. Run the gate

Every phase:

```bash
pnpm test && pnpm build
```

Then the phase-specific check from `CLAUDE.md` → "Phase gates":

| Phase | Check |
| --- | --- |
| 0 | `pnpm stacks --help` lists all four commands; `pnpm dev` renders an empty shelf |
| 1 | `pnpm stacks build` on fixtures → valid `library.json`; malformed fixture logged + skipped |
| 2 | `pnpm smoke:render` → non-blank `artifacts/shelf.png`; click-opens-card test passes |
| 3 | `--public` output greps clean for `NOTE_BODY_CANARY_do_not_ship`; OG image exists |

**Show the output.** Reviewing evidence is faster than re-running the check.
If a gate fails, fix the root cause — never weaken the gate to make it pass.

## 2. If the gate will not pass

Count distinct approaches, not attempts. After **three genuinely different**
approaches have failed: write what was tried and why each failed to
`docs/blockers.md`, commit that, and stop the session. Do not thrash.

## 3. Record before committing

In the **same commit** as the work:

- `docs/progress.md` — flip the gate row to ✅ with its commit ref, update the
  "Current state" table, add any new environment findings. Keep it an index;
  do not restate the plan there.
- `CLAUDE.md` Decision Log — append one line per decision made this phase that
  the brief left open: library choices, API quirks, workarounds, and **every new
  dependency with its reason**. Append-only, dated.

## 4. Commit

One phase, one commit. Never batch two phases together. One-paragraph summary
covering what now works and what the gate proved.

## 5. Check the stop points

Two points in this run require handing control back to the human
(`docs/plan.md` §1):

- after the Phase 0 **plan** is written, before executing it
- after Phase 2's **first** screenshot lands in `artifacts/`, for aesthetics
  review before any polish

Phase 4 (Audiobookshelf) is out of scope for this run — do not start it.
Otherwise, continue to the next phase without waiting.
