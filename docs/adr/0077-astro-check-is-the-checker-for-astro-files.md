# `astro check` is the checker for `.astro`, and it runs inside `pnpm build`

`@astrojs/check@0.9.10` is a dev dependency of `packages/site`, pinned exact,
and that package's `build` script is `astro check && astro build`. So
`pnpm build` typechecks `.astro` frontmatter, the `suite` matrix already runs
`pnpm build` on both Node versions, and the row is **G47** (`astro-types`).

This record exists for the dependency, which `AGENTS.md` requires, and for two
consequences that are not obvious from the one-line change that carries them.

## What it buys, measured rather than argued

`.astro` **frontmatter** — the fenced block at the top of a page, which is real
TypeScript that really runs at build time — was read by no gate and typechecked
by no compiler. G7 (`astro-no-logic`) reads `<script>` blocks as text and never
looks at the frontmatter; the root `tsconfig.json` lists only `.ts` sources.

Planted and observed, at `2f672b1`: `absoluteUrl('/og.png', Astro.site)` in
`packages/site/src/pages/index.astro` became `absoluteUrl(42, Astro.site)`.
`pnpm typecheck` green. G7 green, five of five. `pnpm build` green. And
`dist/index.html` shipped `<meta property="og:image" content="42">` **and**
`<meta name="twitter:image" content="42">` — a broken share card through every
gate this repository had. With `astro check` wired, the same plant fails
`pnpm build` at `index.astro:14:29` and **no `dist/` is written at all**.

## The order is the decision, not the presence

`astro check && astro build`, never the reverse. Both orders report the error
and both fail the build; only the first prevents the output. `astro build &&
astro check` is the *invisible* weakening — a reviewer reading CI sees a red
build and a script that looks right, while a `dist/` carrying the bad value has
already been written and, on the deploy path, would already be a candidate for
upload. `gates/astro-types.test.ts` asserts position, not membership, and the
reorder was planted and observed red.

## The trade: this pins the compiler harder than ADR-0066 did

[ADR-0066](./0066-typescript-6-until-7-1.md) pinned `typescript` to `6.0.3` and
named its revisit condition as **TypeScript 7.1's stable programmatic API**. It
also said the tools under that pin "are wanted for what they compute" — true
when written, and no longer the whole story: one of them is now load-bearing in
`pnpm build`.

`@astrojs/check@0.9.10` declares `peerDependencies: { typescript: '^5.0.0 ||
^6.0.0' }`. **The revisit ADR-0066 already schedules un-runs this gate** unless
the checker has widened by then.

That is the cost, and it is accepted rather than hidden, for two reasons. The
alternative — keeping `.astro` untypechecked so the compiler pin stays free —
was the position ADR-0003 took in July, on the belief that `astro check` could
not run at all; it shipped the defect above. And the coupling is **asserted, not
written down**: `gates/astro-types.test.ts` reads the pin and goes red if it
leaves `^5 || ^6`, so whoever moves to TypeScript 7.1 meets this as a failing
test rather than as a paragraph they had to remember. That is
[#138](https://github.com/mephistopheles4/stacks/issues/138)'s rule — *date the
claim with the versions it was established against* — applied when the claim was
made rather than three bands later, which is the correction G7's own decay
verdict asked for and never got.

⚠️ **What the assertion cannot catch**: `@astrojs/check` narrowing its own peer
range under a patch bump. The pin is exact, so that arrives as a diff somebody
chose, which is the whole reason [ADR-0067](./0067-the-counters-inputs-are-pinned-exact.md)
pins tools exact.

## G7 is kept, and its warrant is replaced rather than narrowed

The two gates read different halves of the file and neither sees the other's:
G7 reads `<script>` blocks as text, `astro check` typechecks frontmatter.

G7's row opened *"`.astro` files are not typechecked, so nothing else can catch
this"*, which this change makes false. What holds instead is **coverage**:
`.astro` sits outside **one** scope list, which both counters read. All eight
globs in [`stryker.scopes.json`](../../stryker.scopes.json) end `*.ts`, and
`scripts/lib/complexity.ts`'s `populationOf` takes its population from those
same globs minus `*.test.ts`. So logic in an `.astro` file is now typechecked
and still earns no mutation score and no complexity series — counted by nothing,
and the text scan stands in for that.

⚠️ **`site-meta.ts` is the near half of the same hole.** `packages/site/src` is
an *excluded directory* in `stryker.scopes.json`, so the module whose
`absoluteUrl` the plant miscalls is unscored too. The bad value crossed from an
unscored `.astro` file into an unscored `.ts` file and out to `dist/`.

## How this was decided

- **2026-08-23** — **`astro check` is a gate, inside `pnpm build`, and not in
  the `style` job.** Decided on
  [#238](https://github.com/mephistopheles4/stacks/issues/238) and specified in
  [`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
  §4. A type verdict belongs where the build is; the three style checks share a
  separate job for a reason — Node-independence — that applies to them and not
  to a step already inside a command the `suite` matrix runs twice.

- **2026-08-23** — **No new root script.** `gates/commands.test.ts` (G14) reads
  the **root** `package.json` only, so a root-level `astro:check` would owe an
  `AGENTS.md` Commands line and a `docs/commands.md` section in both
  directions, for a command nobody runs by hand. The edit goes in
  `packages/site`'s own `build` script instead, which is inside `pnpm build`
  either way. The ticket's "any new script is documented and declared" criterion
  is discharged by there being none — recorded here because a criterion met by
  doing nothing reads as an oversight otherwise.

- **2026-08-23** — **The dependency is `@astrojs/check`, pinned exact at
  `0.9.10`, on `packages/site` rather than the root.** Exact per
  [ADR-0067](./0067-the-counters-inputs-are-pinned-exact.md) and
  [`static-analysis-and-style.md`](../spec/static-analysis-and-style.md) §9: a
  tool upgrade that adds rules reddens an unchanged tree, so it arrives as a
  diff somebody chose. On the site package because that is where `astro` lives
  and where the script that calls it runs.

- **2026-08-23** — **The wiring is gated even though the gate is a build step.**
  A check living only as a substring of one npm script is
  [#152](https://github.com/mephistopheles4/stacks/issues/152)'s finding
  exactly — `--skip-gates` cleared the whole four-gate contract and lived for 19
  of its 21 days in two lines of one file, both the implementation. Four
  clauses, each planted and observed red: the check present, the check first,
  the dependency pinned exact, and the root script still delegating to the site.
  ⚠️ **It pins the wiring and never the checker's verdict** — G40's stated limit
  and G44's, reached again.
