# ADR-0123 — A hook holds agents to athanor, silent on failure, with a comment as the fallback

**Date:** 2026-10-24
**Status:** accepted. Issue [#513](https://github.com/mephistopheles4/stacks/issues/513);
the fallback's shape and the mutation rules are the owner's choices, relayed
on 2026-10-24.

## Decision

`.claude/settings.json` runs `scripts/agent-test-guard.ts`, whose decision is in
`scripts/lib/agent-test-guard.ts`, as a `PreToolUse`
hook on Bash and PowerShell. While `athanor --version` works it refuses the host
runs that have an `athanor run` equivalent — `pnpm test`, `typecheck`, `lint`,
`build`, and `vitest`, `tsc --noEmit` and a scoped Stryker run invoked directly
— and names the athanor form. A full mutation run from an agent is refused
whatever athanor's state, with no fallback. Everything else is silence, a fault
in the hook included. The fallback is the shell comment
`# --host-fallback=<reason>` on the command's own line. The hook is TypeScript
run by Node's type stripping, with `node:` built-ins only.

A scoped mutation run goes through `athanor run --`, printing its report on
standard output into `artifacts/stryker/scoped/`, never `current/`; there is no
named `mutation` command.

## Why

[ADR-0122](0122-athanor-runs-the-suite-in-a-sealed-container.md) made athanor
the default and wrote the rule down, and two sessions skipped it in one day.
grimoire had closed the same gap with a hook (its issue 377), and this ports
that one's tokeniser and probe; the command table is this repo's.

**Silence rather than an allow**, because a hook that answers *allow* skips the
owner's permission prompt for the call. **Silence on a fault**, because a guard
that failed closed would stop all work in the repo, and the hook is a nudge
that shows a skip, not a control.

**A comment rather than grimoire's `--host-fallback=<reason>` flag**, measured
against the tools: `tsc` rejects an unknown option (TS5023), and `eslint` and
`vitest` parse their own, so a flag would fail the very run it permits. Both
shells ignore a comment and the hook reads it from the text. The cost, accepted:
the run itself prints no note, and the reason is visible only as part of the
command.

**Type stripping rather than `tsx` or an `.mjs` file**: it works in a fresh
worktree before `pnpm install`, which is where a `tsx` hook would print an
error on every call, and `typecheck` and `lint` still cover it. Measured on
Node 24.22: nothing on stderr.

**A full mutation run is refused with no fallback** because its cost — 13–18
minutes of every core — is the thing the rule exists to stop, and a broken
athanor does not make it cheaper. A full report comes from the nightly's
artifact or the owner.

**The scoped report comes back on standard output** because athanor 0.1.0 has
no way to copy a file out of the container, and a named command cannot take the
files to mutate, so only the `--` form can name them. **It goes to `scoped/`**
because `deploy:site`'s zero-mutant check reads `current/mutation.json`, and a
partial report there would refuse the deploy.

## Consequences

- Only Claude Code runs the hook. Every other agent follows the rule in
  `AGENTS.md` unheld, and nothing in CI reads `.claude/`.
- A checked-out branch's own version of the script runs on every shell call in
  a session on that branch. That opens no path a branch's `pnpm test` did not
  already open; the owner decided against a security review of it.
- Every shell call costs a Node start: 219 ms median against 151 ms for a bare
  `node`, measured on the owner's machine.
- `--incremental` counts as scoped, so it is refused on the host while athanor
  works, and in athanor it has no results file to reuse and runs everything.
- Rollback is deleting the `PreToolUse` entry; the written rule stands without
  it.

## Alternatives rejected

- **A fixed note from the hook** on a named fallback, as well as the comment.
  The owner chose the comment alone.
- **A `STACKS_HOST_FALLBACK` environment variable** printed by
  `vitest.config.ts`: only `test` would print it, and in PowerShell it persists
  in the session's shell.
- **A named `mutation` athanor command**: it could run only a fixed scope.
- **A CPU cap for mutation alone**: athanor 0.1.0 sets `cpus` for the whole
  repo, so the recipe passes `--concurrency 4` to match the existing cap.
