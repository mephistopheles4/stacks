# ADR-0076 — The linter is type-aware, and every input to its verdict is pinned exact

**Date:** 2026-08-23
**Status:** accepted
**Decided on:** [#233](https://github.com/mephistopheles4/stacks/issues/233),
across a resolution and two amendments. Executed by
[#253](https://github.com/mephistopheles4/stacks/issues/253), which is
[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§6 step 5.

## Decision

Two dependencies join the tree, **pinned exact** beside `eslint` and
`@typescript-eslint/parser`:

| Package | Version | Why it is here |
| --- | --- | --- |
| `typescript-eslint` | `8.67.0` | The plugin and the preset. `recommendedTypeChecked` is the rule set; the version is the same as the parser already pinned, so no second copy of `@typescript-eslint/parser` resolves. |
| `@eslint/js` | `10.0.1` | `eslint:recommended`. ESLint 10 does not depend on it — the core rules ship as their own package now — so a linter that wants them has to name it. |

They are consumed by `eslint.lint.config.mjs`, which sets
`parserOptions.projectService: true`. **Every verdict `pnpm lint` reaches
therefore depends on the TypeScript version**, and this record exists to say that
out loud rather than let it be discovered.

## Context — the two dependencies are the small half

Adding two dev dependencies would not normally earn a record. What earns it is
`projectService`, which is not a performance setting: it is the difference
between a linter that reads syntax and one that asks the compiler what a value
*is*. Every rule this repository actually wanted is on the far side of that
line. Measured over 188 files on `c8ba4ee`:

| Rule set | Findings | Wall clock |
| --- | --- | --- |
| `eslint:recommended` alone | 702, of which **632 are false** | 2.3s |
| `+ typescript-eslint` recommended, syntactic | 6 | 2.1s |
| `recommendedTypeChecked` | 75 | 7.8s |
| `recommendedTypeChecked`, tuned, plus opt-ins | **36** | **7.5s** |
| `strictTypeChecked` | 267 | 9.9s |

`tsc --noEmit` over the same tree is 2.2s, so type-aware lint costs about 5.5
seconds more than syntactic lint, per run.

⚠️ **The syntactic option is not a cheaper version of the same thing.** It finds
**2** defects across 188 files. `no-floating-promises` exists only in the two
type-aware presets, and `switch-exhaustiveness-check` — the rule
[#233](https://github.com/mephistopheles4/stacks/issues/233) opened by naming —
is **in none of the five presets** and had to be turned on by hand. Choosing
syntactic would have been choosing not to adopt.

## The tension with ADR-0070, stated rather than left implicit

[ADR-0070](./0070-the-type-checker-stays-off-until-the-compiler-is-hashed.md)
refuses Stryker's type checker, and its reason is exactly the property this
record accepts:

> A one-line Dependabot bump of the compiler would then move every scope's score
> with **no hash change and nothing saying so**.

A type-aware lint verdict moves with the compiler in the same way. ADR-0070's
condition — the `typescript` version becoming a hashed ingredient — is **not
met**, and nothing here meets it. So the two documents would disagree if this
one did not explain why they do not.

**They govern different kinds of output, and that is the whole difference.**

- **A mutation score is a number compared against a stored floor.** Nobody reads
  it; a gate does. When it moves for a reason nothing recorded, the comparison is
  silently wrong and the refusal — or the failure to refuse — is invisible. The
  hash exists so that a moved input refuses the comparison instead of corrupting
  it.
- **A lint verdict is a list of file-and-line findings a person reads at merge.**
  When it moves for a reason nothing recorded, the pull request goes red with a
  message naming a file, a line and a rule. The cost is a session's work; it is
  never a wrong answer that looks right.

The failure ADR-0067 and ADR-0070 are both built against is *a number that
changed and nothing said so*. A linter cannot produce that failure, because its
output is not a number.

⚠️ **What this does not buy: the two upgrade hazards are not the same size, and
the smaller one is still real.** A `typescript-eslint` minor that adds a rule to
`recommendedTypeChecked` reddens an unchanged tree, on a pull request that has
nothing to do with it. That is why both packages are pinned exact — the same
reasoning as [ADR-0067](./0067-the-counters-inputs-are-pinned-exact.md), which
pinned `eslint` and the parser for the counter. The recurring half of this
problem is [#227](https://github.com/mephistopheles4/stacks/issues/227)'s and is
not solved here.

⚠️ **And the reach of the pin is narrower than it looks.** `configHash` and
`fixtureHash` make the *counter's* inputs part of the record. **Nothing hashes
the linter's**, because a lint verdict never reaches the trend layer — there is
no row for it and there should not be. The pin is a lockfile promise, and a
lockfile promise is all it is.

## Why the rule set is tuned, and why that is not a weakening

Four rule options are set away from their defaults. Each was chosen against a
finding that named **deliberate, documented repository idiom and no defect**, and
the four together took the report from 75 findings to 36 without removing one
real finding:

- **`require-await` off** — 37 of its 38 findings were async test helpers that
  await nothing. A helper is `async` because its callers await it.
- **`no-unused-vars` honouring `_`** — the repository already marks an
  intentionally unused binding that way; the rule honours the prefix only when
  told to.
- **`no-irregular-whitespace` with `skipRegExps`** — `FRONTMATTER_BLOCK` matches
  an optional U+FEFF byte-order mark on purpose, in the parser that enforces
  invariant 2 by construction.
- **`switch-exhaustiveness-check` accepting `default:`** — all three findings sat
  on a deliberate `default:` clause, one of them with a comment explaining why.

**A linter that flags the house style trains people to ignore it**, which is the
cost this avoids. The cost it accepts is the one G46's register entry records
under *weakening*: four options are four places a rule can be silently widened
later, and no gate reads a lint config.

## Consequences

- `pnpm lint` is documented in `AGENTS.md` and
  [`docs/commands.md`](../commands.md), and runs in the `style` job in
  `.github/workflows/gates.yml` — a job of its own beside `audit`, because a lint
  verdict cannot move with the Node version. It is in the `gates` aggregator's
  `needs:` list **and** in one of its `= "success"` assertions; a job missing
  from either is a red that merges anyway.
- The counter's config is untouched, and the split is what keeps it that way.
  Flat config merges every config object whose `files` glob matches, so one file
  would put `projectService` on the counter's run — measured at 1.5s → 7.3s, of
  which **0.7s is the 88 extra rules and 5.1s is the one option**. The counter
  cannot opt out: `scripts/lib/complexity.ts` builds `new ESLint({ cwd })` with no
  `overrideConfigFile`.
- **The counter's run time is unchanged, measured either side of this change**:
  over `packages/core/src`, 1.29s before and 1.23s after; over the whole tree,
  2.04s before and 2.06s after, medians of three and five runs. Its resolved
  config is byte-identical — the only diff to `eslint.config.mjs` is comment
  lines, which is checkable rather than asserted.
- ⚠️ **`eslint-plugin-sonarjs` is still installed and still not enabled.** This
  record does not touch it; the cognitive counter is
  [#255](https://github.com/mephistopheles4/stacks/issues/255)'s, and it needs a
  **third** config file for the same reason this needed a second.
- ⚠️ **The two rules that reproduce G6 (`site-core-imports`) are not enabled**,
  and it is worth being exact about this because #253's brief is loose on it.
  `no-restricted-imports` and `no-import-type-side-effects` reproduce G6 on all
  four of its documented cases — measured on
  [#233](https://github.com/mephistopheles4/stacks/issues/233), and **only
  together**, because `no-restricted-imports` alone allows the inline
  `import { type X }` form G6 exists for. **Neither is in any of the five
  presets**, so neither arrives by adopting `recommendedTypeChecked`; they
  appear only if somebody names them, and this config does not. Enabling them is
  [#245](https://github.com/mephistopheles4/stacks/issues/245)'s question and its
  expected answer is *keep both* — but until it answers, the import rule is held
  by G6 alone, and no gate is touched here either way.
- **If this ever proves too noisy, the cheapest reversal is named and it is not
  loosening a rule.** *Skip test code* removes 52 of the 75 untuned findings at
  no cost to product code, and nothing in #233's box refuses it. It was declined
  on a judgement rather than on evidence: `gates/` is 38 test files and it is the
  code that holds every other rule.
