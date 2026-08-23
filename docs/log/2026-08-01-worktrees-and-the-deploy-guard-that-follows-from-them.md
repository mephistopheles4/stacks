# Worktrees, and the deploy guard that follows from them

`pnpm worktree <branch>` makes a second checkout beside this one that actually
runs: sibling directory, `pnpm install`, and it names the `.env` it will read.

Two things are gitignored and therefore missing from a bare `git worktree add`.
`node_modules` fails loudly. `.env` fails as `no vault: pass --vault <path>`, on
a branch where nothing is wrong, which is a confusing thing to be told.

**There is one `.env` and every checkout reads it — it is not copied.** A copy
drifts with nothing going red, and `STACKS_DEV_HOST=1` left behind in a stale
one keeps the shelf on the network long after anyone remembers enabling it. The
mechanism is `git rev-parse --git-common-dir`, the single `.git` all linked
worktrees share; it answers _relative_ in the main checkout and absolute in a
worktree, which is the one thing about it that has to be got right, and
`packages/cli/src/env.test.ts` pins all three positions against a real detached
worktree. Editing that file changes every worktree at once. That is the point,
and a surprise if you assumed otherwise.

Two things had to change to survive a second checkout:

- **`smoke:render` asks the OS for a port** instead of insisting on 4331. The
  bad failure was never `EADDRINUSE` — it was another checkout's server still
  up and serving _its_ `dist/`, so the gate screenshots someone else's branch
  and reports the score as this one's. Two gates were then run concurrently, in
  two checkouts, and both came back 49 books / 1285 colours / 25.3%.
- **`deploy:site` refuses any branch but `main`** — G17. Four checkouts sharing
  one `.env` all hold `SITE_URL`, so the publish command looks identical from
  every one of them. `--any-branch` overrides deliberately; `--dry-run` and
  `--check-only` are exempt because neither uploads.

Not shared between worktrees, deliberately: `.cache/` (API responses — each
checkout refetches, and no test path touches it, since tests inject a
fixture-backed `HttpGet` that throws on an unmapped URL) and `artifacts/`
(regenerable, and you want each branch's screenshot separate).
