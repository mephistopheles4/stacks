# TypeScript 6.0.3, until 7.1 ships a stable programmatic API

`typescript` is pinned to **`6.0.3` exactly** — the newest 6.x, and the last
JS-based release before 7's Go-ported native compiler. The repo was on
`^7.0.2` from its first commit ([ADR-0002](./0002-no-build-step.md)).

**The revisit condition is a version, not a feeling: TypeScript 7.1's stable
programmatic API.** When it ships, the pin moves and nothing else does — the
tools below are wanted for what they compute, not for the compiler underneath
them.

## What was traded

Raw compiler speed, and only that. Measured by the spike
([#196](https://github.com/mephistopheles4/stacks/issues/196), branch
`experiment/typescript-6-revert`) with no source and no tsconfig change on
either side:

| Check | TS 7.0.2 | TS 6.0.3 |
| --- | --- | --- |
| `pnpm typecheck` | 0.76s | 2.50s |
| `pnpm build` | 3.32s | 4.73s |
| `pnpm test` | 890/890, 13.08s | 890/890, 12.99s |

That is the native compiler's entire reason for existing, given up. It is
affordable **at this size and nowhere stated to be affordable at another**: the
1.7s is invisible beside `pnpm test`'s ~13s today, and a repo where `tsc`
dominates the loop would weigh the same trade differently and could land the
other way.

**Nothing else moved.** No peer warning, no deprecated option hit —
`tsconfig.base.json` uses `moduleResolution: "bundler"` and `target: "ES2022"`,
none of what TS 6 deprecates, so `ignoreDeprecations` was never needed. Only the
root manifest declares `typescript`, so no package pin needed updating, and the
lockfile shrank by ~200 lines because 7's per-platform native binaries went with
it.

## What it bought

Three tools that TypeScript 7 blocks outright, each verified running by the
spike:

- **ESLint, and with it the complexity counter.** On `7.0.2`,
  `@typescript-eslint/parser` and `eslint-plugin-sonarjs` each pin `typescript`
  below `6.1.0`, so every ESLint-based tool is refused at `pnpm install` and the
  only AST surface is `typescript/unstable/{sync,ast}`. On `6.0.3` both install
  clean. **This is the one that decided it**: it makes
  [`docs/spec/complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md)
  buildable on somebody else's maintained rule instead of a hand-rolled walk.
- **Stryker's TypeScript checker.** Starts and works — 2 of `measure.ts`'s 11
  mutants come back `CompileError`. ⚠️ **It stays off**; see below.
- **`astro check`.** Runs, 6.2s over 44 files, and finds one real pre-existing
  type error. [ADR-0003](./0003-site-import-type-only.md) recorded it as unable
  to run under TS 7 and concluded *"pinning the whole repo back to TS 6 to
  satisfy one tool costs more than it returns"*. **That reasoning still holds and
  its premise stopped being true**: the pin is not being paid for one tool.
  0003's mitigation — no logic in `.astro` files — is untouched here, and whether
  `astro check` becomes a gate row is a separate scoreboard conversation.

## What ships with it, and what deliberately does not

**One line moves alongside the pin, in the same commit, or the build is wrong
rather than merely different.** `stryker.config.mjs`'s
`tsconfigFile: 'tsconfig.stryker-absent.json'` names a file deliberately absent
from the project — the workaround for a TS 7 crash, where
`@stryker-mutator/core`'s `ts-config-preprocessor.js` dynamically imports
`typescript` and calls `ts.parseConfigFileTextToJson`, which 7 does not export.
On 6.0.3 that function exists again, and the absent file stops being harmless: it
becomes a checker that cannot start. The spike hit exactly that — a
`--dryRunOnly` run failed with the workaround in place and succeeded the moment
the line named the real `tsconfig.json`. It is back to `tsconfig.json` here, and
`pnpm mutation:run` over one of the two smallest declared scopes
(`packages/core/src/import` — two non-test files, 256 mutants) completes with
**0 errors**, so the flip is exercised rather than assumed.

⚠️ **`checkers` stays `[]`, and that is now a decision rather than a
limitation.** The old comment in `stryker.config.mjs` called the checker *"dead
here and cannot be revived"*; it is revivable as of this commit and stays off,
because turning it on is a **scoring** change. A `CompileError` is neither killed
nor survived, so every declared scope's number moves and every calibration window
behind `stryker.floors.json` restarts. It earns its own record, after this one,
and is kept as fog on
[the map](https://github.com/mephistopheles4/stacks/issues/186).

## What it costs

- ⚠️ **This is a downgrade, and downgrades age in one direction.** Every day on
  6.0.3 is a day of 7.x fixes not taken, and the pin is *exact*, so nothing
  arrives by accident either. What limits the exposure is that 6.0.3 is a
  released, supported compiler the whole suite is green on — not that the risk is
  small.
- **The revisit condition depends on somebody else's roadmap.** "7.1's stable
  programmatic API" is a milestone this project does not control and cannot
  date. If it slips a year, the pin sits for a year.
- **Two documents still describe a compiler the repo is no longer on**, and they
  are left alone on purpose so this diff stays the compiler and nothing else:
  [`AGENTS.md`](../../AGENTS.md)'s note that `astro check` cannot run, and
  [`docs/spec/mutation-scoring.md`](../spec/mutation-scoring.md) §5 on the dead
  checker. Both are true statements *about TypeScript 7* and false about today.
  They move when the thing they describe moves — `astro check` if it becomes a
  gate row, `mutation-scoring.md` if the checker is turned on — and until then
  this record is what a reader finds first, from `docs/adr/`.
  [`docs/progress.md`](../progress.md) was a third and is **not** left: its
  resolved-versions row and its Stryker environment finding are statements about
  the environment this commit changed, so correcting them is this commit's debt
  rather than a later one's.

## What was rejected

- **Staying on 7 and hand-rolling the complexity walk.**
  [#187](https://github.com/mephistopheles4/stacks/issues/187) recommended it,
  and the prototype in
  [#194](https://github.com/mephistopheles4/stacks/issues/194) built one. It
  disagreed with ESLint by one on `parseNote` (11 against 12 — ESLint counts
  `?.` as a branch), which is precisely the drift a trend series cannot carry.
  The prototype is **kept on its branch and never merged.**
- **Staying on 7 and counting through `typescript/unstable/{sync,ast}`.** The
  word in the module path is the objection: a series whose definition rests on
  an explicitly unstable API cannot promise that last year's number and this
  year's mean the same thing.
- **Pinning `typescript` per package.** Nothing but the root declares it, so
  this is plumbing for a problem that does not exist.
- **A caret range on 6.x.** The compiler is an input to a number the trend layer
  compares across months. An input that can change under a `pnpm install` is one
  the record cannot account for, which is the same argument that pins Stryker
  exactly ([ADR-0053](./0053-stryker-measures-eight-declared-scopes.md)).

## How this was decided

Researched in [#187](https://github.com/mephistopheles4/stacks/issues/187),
which found the blockage and recommended working around it. **The owner's call in
[#196](https://github.com/mephistopheles4/stacks/issues/196) went the other way —
ESLint matters more than being on the newest TypeScript** — and sent a spike to
test whether the repo could take the revert at all. It could, with zero code
changes; the spike's write-up is
`docs/research/typescript-6-revert-spike.md` on
`experiment/typescript-6-revert`, which does not merge.

Locked as §3 of
[`docs/spec/complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md),
whose build order makes this step 1 and makes it land **alone**, so that the diff
changing the compiler changes nothing else. Implemented in
[#200](https://github.com/mephistopheles4/stacks/issues/200), and re-measured on
that branch: `pnpm typecheck`, `pnpm test` (893/893) and `pnpm build` green on
6.0.3, with no source or tsconfig file touched.
