# ADR-0083 — Hooks arrive with `pnpm install`, and the gates stay the only contract

**Date:** 2026-09-08
**Status:** accepted
**Ticket:** [#288](https://github.com/mephistopheles4/stacks/issues/288)

## Decision

`husky` and `lint-staged` are added as exact-pinned devDependencies, and a
`prepare` script wires two hooks for every contributor on `pnpm install`:

- **`pre-commit`** runs `lint-staged` → `prettier --write` over the staged
  files. It is the only step in that hook that may refuse.
- **`pre-commit`** also warns on a stale `stryker.floors.json` stamp, and runs
  the CRAP print for a clone that opted in. Neither can fail the commit.
- **`pre-push`** runs `pnpm lint`, and refuses.

`.githooks/pre-commit` is **retired**, and the CRAP print moves into
`.husky/pre-commit` behind `git config --bool stacks.hooks.crap`.

⚠️ **This buys latency and no new coverage.** Every check in either hook already
refuses in CI. Saying so plainly is part of the decision, because a layer that
reads as coverage and is not is worse than the honest gap it replaces.

## The posture change, which is the real cost

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) names four commands as the contract
and puts every other tool under *Optional*. It promises that a contributor with
no agent skills installed — or no agent at all — passes every gate.

**Husky breaks the shape of that promise without breaking the promise.** Hooks
are not optional any more: `prepare` is a lifecycle script, so they arrive with
`pnpm install` for everyone, unasked. Nobody opts in. Before this, every tool
beyond the four commands was something a contributor *chose*; this is the first
that installs itself.

⚠️ **A hook must not become a second contract**, and three properties keep it
from becoming one:

1. **Every check here also runs in CI.** The `style` job runs `pnpm lint` and
   `pnpm format:check`; G56 compares the stamp at merge. Delete both hooks and
   the guarantees are exactly what they were.
2. **`--no-verify` skips both, and that is not a defect.** Nothing here is a
   guarantee, so nothing here needs to be unskippable. A hook that could not be
   skipped would be making a promise the gates already make better.
3. **No hook is or becomes a required check.** The gate suite and CodeQL remain
   the only two things that can stop a merge.

**So the promise survives in substance**: a contributor whose hook is broken,
skipped, or absent still passes every gate. What changed is that they now have
to *skip* something rather than *not adopt* it. That is a smaller change than it
looks and a larger one than "we added a formatter hook", which is why it is
recorded here rather than in a commit message.

## What this reverses, and why the earlier refusal was right

[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§8 struck exactly this work:

> It called for an ADR on a hook framework; `.githooks/pre-commit` already
> exists, tracked and opt-in, so no framework and no dependency is added.

⚠️ **That strike was correct on its own terms and rested on a premise that
stopped holding.** It argued that an existing opt-in hook makes a framework
unnecessary — true only while nobody wants a hook that *arrives on its own*. The
whole value of this change is the thing the strike ruled out: a formatting slip
caught for a contributor who never went looking for a hook. An opt-in hook helps
whoever already cared enough to opt in, which is the population least likely to
commit unformatted code.

⚠️ **#288's own body never mentions that file, the existing hook, or the
strike**, and calls the repository *"greenfield, not an extension"*. It is not:
`.githooks/pre-commit` was tracked, and it already ran `pnpm lint` **at
pre-commit** — the exact placement #288 argues against on latency grounds. The
owner confirmed the reversal is deliberate. Recorded because a reversal nobody
noticed they were making is the failure this repository's records exist against.

## The one slot, and why the old hook could not simply stay

Git has exactly one `core.hooksPath` per clone. Husky claims it. The old hook's
own header called this before it happened:

> ⚠️ Check `git config --get core.hooksPath` FIRST and keep what it says. There
> is one slot, so opting in overwrites whatever was in it — a husky or lefthook
> install among the possibilities.

So the two could not coexist, and leaving both in the tree would have documented
two things fighting over one setting: opting the old hook in would silently lose
Prettier-on-staged and the stamp warning, and the next `pnpm install` would take
it back. **The CRAP print moved rather than competed.** It stays opt-in, because
it prints a ranking whose exponents nobody calibrated and
[`complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md)
§4 turned down a refusing hook; the flag is now a plain config boolean instead of
a hooks path.

⚠️ **A clone that opted the old hook in points at a deleted file until its next
`pnpm install`.** Nothing breaks: git runs no hook it cannot find.

## Why lint is on the push and not the commit

`eslint.lint.config.mjs` sets `projectService: true`, so the parser builds the
whole TypeScript program before any rule runs: measured at about **7.3 seconds**,
of which 5.1 is that one option. **A staged subset does not make it cheaper** —
the program is loaded either way, so `lint-staged` buys nothing here.

Seven seconds on every commit is how a hook becomes the thing everyone clears
with `--no-verify`, and a layer everyone bypasses protects nobody. A push is
rarer and already slow, so the same seconds buy something there. Prettier is the
opposite shape — fast, file-scoped, self-correcting — which is exactly what
`lint-staged` is for.

## The stamp warns and never refuses

Comparing `stryker.floors.json`'s `configHash` to `configHashOf(strykerConfig)`
costs almost nothing once the framework exists. It is deliberately a **warning**:

- **Dependabot commits through the GitHub API with no working tree**, so no git
  hook ever runs on a bot pull request.
- Any author clears a hook with `--no-verify`.

**G56 (`config-hash`) stays the guarantee**, and it had to exist first — shipped
before it, this warning would have been the only thing watching for stamp drift,
which is precisely the layer-that-reads-as-coverage this record refuses.

⚠️ **It calls `--check` and never writes.** A hook that rewrote the floors file
mid-commit would change what is about to be committed, behind the author's back
and outside the staged set.

## Two hazards, both measured rather than assumed

**Prettier must not reach Markdown or `fixtures/`.** `lint-staged` hands Prettier
explicit paths, which is a different invocation from `prettier --check .`, so the
exclusion was proved rather than inferred: identical malformed JSON is **exit 0**
under `fixtures/` and **exit 1** at a path that is not ignored. Without that
control the green means nothing, because an already-formatted file also passes.
The stakes are on `.prettierignore`'s own record — formatting Markdown turns G41
and G31 red, and formatting the fixture vault requotes YAML frontmatter in 11
notes.

**The glob names extensions, never `*`.** Prettier has no parser for `.astro` and
**errors** on one named explicitly (exit 2), where a directory sweep skips it in
silence. A `*` glob would fail every commit touching the site.

## Consequences

- `prepare` is a `package.json` script, so **G14 requires it in `AGENTS.md`'s
  command list**. The posture change is therefore visible in the one file that
  enumerates the contract, which is the right place for it to be awkward.
- `pnpm install` in CI runs `prepare` too — no workflow passes
  `--ignore-scripts` and there is no `.npmrc`. It is harmless in a throwaway
  checkout, and it was checked rather than assumed.
- `pnpm mutation:stamp --check` was **removed on [#329](https://github.com/mephistopheles4/stacks/pull/329)
  as a flag with no reader and is restored here with one.** That is the rule
  working, not a reversal of it.
- Two more tools to keep pinned exact, per the static-analysis spec's rule that a
  version bump which widens a tool's behaviour must be a visible diff.
- Nothing here is gated, and `docs/gates.md`'s *Not gated, deliberately* is where
  that is recorded. A hook is not a gate and must never be made a required check.
