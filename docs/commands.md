# The commands, in detail

The command lists themselves live in [`AGENTS.md`](../AGENTS.md), where
`gates/commands.test.ts` (G14) holds them to `package.json` and the CLI in both
directions. This file carries the *why* behind three of them — the parts a
session needs only when it is deploying, cutting a worktree, or reading a
mutation score.

⚠️ **`deploy:site`'s gate-ordering rule stayed in `AGENTS.md` on purpose** — it
is compaction-fragile safety, not reference, and no code catches it. It is not
restated here, because a rule with two homes is a rule that drifts
([ADR-0026](adr/0026-constitution-is-gated-not-duplicated.md)).

## `pnpm deploy:site` — the branch guard

**It publishes `main` and refuses anything else**, before the gates rather than
after two minutes of them. With one checkout that question answered itself by
standing somewhere; with worktrees there can be four, on four branches, all
reading the one `.env` — so all of them hold `SITE_URL` and the command looks
identical from every one. `--any-branch` is the deliberate override, and a
detached HEAD is refused outright because nobody could say afterwards what went
out. `--dry-run` and `--check-only` are exempt: neither uploads, and a dry run
from a feature branch is how you would check this path before merging it.
Pinned by `gates/deploy-branch.test.ts`.

## `pnpm deploy:site` — what it checks after the upload

**After the upload it asks the live site which build it is serving**, and then
compares every cover the build produced against what the origin actually serves.
A successful upload is not the same as a changed site, and the two checks fail
differently. Every build stamps `index.html` with a hash of itself, because cover
bytes cannot answer "which build is this": covers are named after book titles and
keep those names, so a deploy that changes only code leaves every one of them
identical and the cover check passes against either build — which it did, minutes
after an upload, while the origin still served the previous `index.html` and
therefore the previous bundle. The cover check remains for the opposite case, a
cached copy carrying the right name and the wrong bytes, which is how the fix for
the mobile crash appeared to deploy while phones kept crashing. The build check
waits out edge propagation before complaining, since a deploy is not live the
instant wrangler returns.

**Both checks read the HTTP status before the body, and say "refused" rather
than guessing.** Bot protection answers a non-browser client with a *challenge
page*, which is HTML carrying no build stamp and a content-length of its own —
so read as content, a refusal is indistinguishable from the stale build these
checks exist to catch, and recommends purging a cache that was never involved.
That is not hypothetical — it happened here, and went unnoticed for a while
because the message read like an edge-propagation delay
([`docs/progress.md`](progress.md)). A refusal retries like anything else
and is reported only after every attempt, since one refusal is not evidence of a
standing one. **Do not make it pass by sending a browser user agent** — that was
measured and does not work. See
[ADR-0027](adr/0027-deploy-check-reports-refusal.md).

## `pnpm worktree <branch>`

`pnpm worktree <branch>` adds a second checkout beside this one — `../stacks-<branch>` —
runs `pnpm install` in it, and tells you which `.env` it will read. Both of
those are needed because `node_modules` and `.env` are gitignored, so a bare
`git worktree add` produces a checkout where every command fails for a reason
that has nothing to do with the branch.

**Origin is fetched first, before anything is decided, and what you were given
is always printed.** Nothing here moves until somebody fetches, and making a
worktree is not that — so any base you did not check is whatever was last
pulled. That is the one failure here that says nothing: the checkout installs,
the tests pass, and the work sits on an old commit. The fetch does not fail the
command when it cannot reach the network, because being offline does not stop
the rest from working; it says so and carries on.

Three cases, and for a while only the first was handled:

- **A new branch** is cut from `origin/main`, not from the local `main`.
- **A branch `origin` already has** is checked out from `origin/<branch>`,
  tracking it. It used to be created *empty off `origin/main`*, because the only
  question asked was whether a **local** branch existed — so a branch a
  colleague or another machine had already pushed came back as a new one of the
  same name, and the first push either bounced or, forced, took the work with
  it.
- **A branch already here** is fast-forwarded when it is strictly behind, and
  otherwise reported and left alone. Never merged or rebased: a branch that is
  ahead or has diverged is yours to resolve, and this command exists to make you
  a checkout.

**There is one `.env`, in the main checkout, and every worktree reads it.** It
is not copied: a copy drifts, and `STACKS_DEV_HOST=1` left behind in a stale one
keeps the shelf on the network long after anyone remembers enabling it. So
editing it changes every worktree at once, which is the point — and a surprise
if you assumed otherwise. Remove a worktree with `git worktree remove <path>`.

## `pnpm mutation:run` and `pnpm mutation:score`

**`pnpm mutation:run` is a measurement, not a gate**, and nothing in `pnpm test`
or `pnpm build` calls it. It runs Stryker over the **eight declared scopes** in
[`stryker.scopes.json`](../stryker.scopes.json) — minutes on a workstation — and
`pnpm mutation:score` turns the one report into one number per scope, which is
the granularity the whole thing exists for. Stryker's own headline is a single
figure over whatever `mutate` matched, and that figure cannot say which scope
moved.

⚠️ **The scope list is the score's definition, so read
[`docs/spec/mutation-scoring.md`](spec/mutation-scoring.md) before editing
it.** `packages/core/src` is the **non-recursive** scope, `timeoutMS` is part of
what a score means rather than a tuning knob, and every exclusion owes a *named
mechanism* — a file is out of reach because something specific puts it there, or
it is not excluded. `covers/measure.ts` has no spec and stays in the denominator
anyway, because "nothing tests it" is a gap and not a mechanism. See
[ADR-0053](adr/0053-stryker-measures-eight-declared-scopes.md).

## `pnpm metrics:emit` and the trend layer

**A score is a trend, not a gate, and `docs/gates.md` now has a place for both.**
A check is a gate when its red has a named, reachable remedy *and* its verdict
does not depend on how much test code exists; otherwise it is a trend. The
taxonomy is **binary** — [`docs/spec/gate-or-trend.md`](spec/gate-or-trend.md)
and [ADR-0054](adr/0054-a-check-is-a-gate-or-a-trend.md) — and it decides
where any *future* check lands, including ones nobody has thought of. A trend
takes no row number and no status: it lives in `docs/gates.md`'s `## Trends`
table, and what is numbered is the gate that watches that table.

**`pnpm metrics:emit` is the writing half of that layer.**
[`.github/workflows/metrics.yml`](../.github/workflows/metrics.yml) calls it and
commits one `metrics/<timestamp>-<sha>.prom` per run to the orphan **`metrics`**
branch; `pnpm trend:sync` will be the reading half. **No secret exists anywhere
in that design** — job-level `contents: write` on the built-in token at one end,
an anonymous fetch at the other — and `gates.yml` is untouched, because a
required check whose verdict came from a different commit is reporting about
code that is not there. ⚠️ **The record is *durable*, never *immutable*:** the
branch is unprotected and force-pushable, and append-only is enforced by
nothing. See [ADR-0055](adr/0055-ci-writes-a-durable-record.md).
