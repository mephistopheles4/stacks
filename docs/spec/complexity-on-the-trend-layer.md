# Complexity on the trend layer — four counts, a cap that only falls, and CRAP kept local

The locked spec for [Map: complexity on the trend layer, and CRAP decided on its
merits](https://github.com/mephistopheles4/stacks/issues/186) — twelve closed
tickets: three research ([#187](https://github.com/mephistopheles4/stacks/issues/187)–[#189](https://github.com/mephistopheles4/stacks/issues/189)),
one prototype run over the whole repo ([#194](https://github.com/mephistopheles4/stacks/issues/194)),
four decisions ([#190](https://github.com/mephistopheles4/stacks/issues/190)–[#193](https://github.com/mephistopheles4/stacks/issues/193)),
two feasibility spikes ([#196](https://github.com/mephistopheles4/stacks/issues/196),
[#197](https://github.com/mephistopheles4/stacks/issues/197)) and two amendments
made from their results ([#198](https://github.com/mephistopheles4/stacks/issues/198),
[#199](https://github.com/mephistopheles4/stacks/issues/199)). Assembled into
something an implementation session can execute **without reopening any of
them**.

**Successor to [`after-the-scoreboard.md`](after-the-scoreboard.md)**, and an
application of [`gate-or-trend.md`](gate-or-trend.md). It allocates no gate
number. **This spec does not implement.** It states the edits; the
implementation session makes them.

⚠️ **Where a decision and a later amendment disagree, this file carries the
amendment and says so.** The earlier reasoning is kept where it still holds and
struck where a spike falsified it, with the spike named — that is what would
have to be true again for the amendment to reopen. The map's override list
records the rest.

---

## 1. What the series is for

A source the owner brought — a vendor post on CRAP and cyclomatic complexity —
split along a line this repo had already drawn: *track trends over absolute
values* is the trend layer's own doctrine, and its 0–30 / 30–60 / 60+ thresholds
are what the trend layer refuses. Behind the post, the research
([#188](https://github.com/mephistopheles4/stacks/issues/188)) found the
question the series actually answers:

> **Is the code this project ships — most of it written by an AI — getting
> harder to reason about over time, per scope? And when a number falls, was
> something simplified, or merely moved?**

The only trajectory study of agentic code (SlopCodeBench, March 2026, one
source) found complexity *concentration* rose in 80% of agent runs and
duplication in 89.8%, while matched human repositories stayed flat. A nightly
series watching this repo's own history is the one way to learn which regime it
is in.

**And the owner named the purpose the map had been circling** (#198): this
repository demonstrates a very high quality floor held under AI-generated code,
and the floor is meant to *rise*, slowly, while experimenting freely. That is why the
teeth in [§4](#4-teeth-a-cap-that-only-falls) are a ratchet and not a ceiling —
a ceiling is a number somebody picked; a ratchet is a number the repo earned.

**Audience: both.** The series transfers whole. The one inversion is in
[§5](#5-crap-kept-local-advisory-at-pre-commit).

---

## 2. Four counts, never a ratio

Source: [#190](https://github.com/mephistopheles4/stacks/issues/190), decided
from [#194](https://github.com/mephistopheles4/stacks/issues/194)'s measurement.
**Unchanged by the amendments.**

The prototype walked all eight declared scopes — 92 files, 1,009 functions,
224ms — then put every candidate statistic through two games on the repo's own
worst function (`enrichBook`, CC 40): a mechanical three-way split, and thirty
trivial one-line functions appended beside it.

| Statistic | Split | Thirty trivial functions |
| --- | --- | --- |
| functions | +3 | +30 |
| sum | **+5** — branches moved, none removed | **+30** — exactly the noise |
| mean | −0.07 | **−0.67** |
| max | **−10** | 0 |
| p90 | 0 | −1 |
| share of functions > 10 | −0.3pp | −1.6pp |
| share of mass in functions > 10 | **−3.8pp** | **−2.9pp** |

**No ratio survives both.** The raw counts, read side by side, hide neither
game: dilution is *functions and sum up by the same amount and nothing else
moving*; a split is *functions up, sum flat, max down*. **So the record carries
counts and the page derives shares** — the reason `mutation-score` is spelled
*killed ÷ total*, applied one step earlier. Per population:

| Series | Measures |
| --- | --- |
| `complexity-functions` | functions counted — the denominator the other three are read against |
| `complexity-mass` | Σ cyclomatic complexity over those functions |
| `complexity-mass-over-10` | Σ complexity over functions with CC > 10 |
| `complexity-max` | the largest single function's complexity |

**The cut is McCabe's own** — his 1976 paper proposes 10 as the upper bound for
a module. It is a sourced constant inside the measure's definition and **not a
threshold**: nothing goes red when a function crosses it.

### The population

**A population is one `scopes[].glob` from `stryker.scopes.json`, minus
`*.test.ts`. Nothing else is read.** Same eight names, so the complexity panels
sit under the mutation panels per scope. No second list: G38 (`mutation-scope`)
already holds that file to the tree.

Stated as a rule rather than a description, because the file carries two other
lists and the counter reads neither:

- **`exclusions` are not applied to the series.** Every exclusion mechanism is
  about *oracle reach*, which says nothing about a static measure. Applying
  them would drop `packages/site/src/shelf` from 385 functions to 113 and
  `packages/cli/src` to **three**. ⚠️ **The hook in
  [§5](#5-crap-kept-local-advisory-at-pre-commit) is the opposite case**, and
  applies them — for the reason each entry's mechanism names.
- **`excludedDirectories` is not read at all**, so there is no precedence to
  define between it and a glob. `packages/site/src` is listed there *and*
  `packages/site/src/shelf/**/*.ts` is a declared scope; the counter sees the
  glob and walks `shelf/`. The top level of `packages/site/src` matches no glob
  and is not walked; neither is `gates/`, which matches none either. Both remain
  on the override list as candidate populations, which is the only way either
  enters — as a new `scopes[]` entry, never through the exclusion list.
- **`*.test.ts` is dropped from every population**, as Stryker's default does.

So `complexity-functions`' denominator is a function of the glob list and the
tree, and two implementations reading this section produce the same number.

### What a function is, and what counts

**The counting rule is ESLint's `complexity` rule, `variant: "classic"`, at
the exact ESLint version pinned in `package.json`** — amended in #196 from the
prototype's hand-rolled rule, so that the rule is one a maintained tool also
enforces. Stated here as ESLint 9+ defines it, because two of its clauses differ
from the prototype and one of them was wrongly described in an earlier draft of
this section:

- **Start at 1; +1 per** `if`, `?:`, each loop, each `case` (classic), each
  `catch`, each `&&` / `||` / `??` and their assignment forms, **every `?.`
  link**, and **every default value** in a parameter or destructuring pattern
  (ESLint PR #18152, in v9.0.0 — a default is an implicit branch).
- **What is a function**: every function-like node is its own scope and a
  nested function's branches never count toward its parent. ESLint also treats
  **class field initialisers and static blocks as implicit functions**, scored
  separately; **the roll-up counts them as functions** — they are in
  `complexity-functions`' denominator and their complexity is in `mass`. The
  prototype met none in this repo; the rule is written down so the first one
  does not move the number silently.
- On the prototype's numbers this moves `parseNote` from 11 to 12 and leaves
  `asPrivate` at 11 — #196 measured both, with `@typescript-eslint/parser`
  8.67.0 and whatever ESLint `pnpm add` resolved that day, which is the reason
  the pin below is exact: the spike did not record it, and the build must.

**The ESLint and `@typescript-eslint/parser` versions are pinned exact, not
caret.** They are inputs to the number, the way `timeoutMS` is an input to the
mutation score, and [§4](#4-teeth-a-cap-that-only-falls) hashes them for that
reason.

### Labels

One `scope` label per series. Four series names rather than one series with a
`stat` label, because G36 (`trend-layer`) holds *names* to Trends rows.

---

## 3. The tooling — TypeScript 6.0.3 until 7.1, and ESLint's rule as the counter

Sources: [#187](https://github.com/mephistopheles4/stacks/issues/187) (the
research finding), and the spike in
[#196](https://github.com/mephistopheles4/stacks/issues/196) on
[`experiment/typescript-6-revert`](https://github.com/mephistopheles4/stacks/blob/experiment/typescript-6-revert/docs/research/typescript-6-revert-spike.md).

**#187's finding stands as a fact and no longer decides.** On
`typescript@7.0.2` every ESLint-based tool is blocked at `pnpm install` —
`@typescript-eslint/parser` and `eslint-plugin-sonarjs` each pin `typescript`
below 6.1.0 — and the only AST surface is `typescript/unstable/{sync,ast}`,
which spawns the native compiler. That made a hand-rolled walk the
recommendation at the time.

**The owner's call (#196): ESLint matters more than being on the newest
TypeScript.** The spike tested it. **The repo is green on TypeScript 6.0.3** — the last
JS-based release, the bridge version — with *no code or tsconfig change*, no
peer warning, no deprecated option hit. Cost: `pnpm typecheck` 0.76s → 2.5s,
`pnpm build` 3.3s → 4.7s. Three things blocked by TS 7 come back:

| Tool | On 7.0.2 | On 6.0.3, measured |
| --- | --- | --- |
| `@typescript-eslint/parser` + `eslint-plugin-sonarjs` | refused at install | installs clean; `parseNote` CC 12 / cognitive 7, `asPrivate` 11 / 4 |
| `@stryker-mutator/typescript-checker` | `checkers: []`, "dead and cannot be revived" ([`mutation-scoring.md`](mutation-scoring.md)) | starts **and works**: 2 of 11 mutants on `measure.ts` caught as `CompileError` |
| `astro check` | cannot run ([ADR-0003](../adr/0003-site-import-type-only.md)) | runs, 6.2s over 44 files, finds one real pre-existing type error |

**Decided**: pin `typescript` to `6.0.3` exactly; add `eslint`,
`@typescript-eslint/parser` and `eslint-plugin-sonarjs` as dev dependencies;
compute the series by running ESLint's `complexity` rule (`['warn', 0]`, JSON
formatter) over each population and rolling the per-function results up. One
ADR records the trade — TS 7's compiler speed given up; ESLint, the Stryker
checker and `astro check` bought — and its **revisit condition: TypeScript 7.1's
stable programmatic API**, at which point the pin moves and nothing else does,
because the counting rule is ESLint's either way.

⚠️ **Two things the revert must carry in the same commit, or the build is wrong
rather than merely different.** `stryker.config.mjs`'s
`tsconfigFile: 'tsconfig.stryker-absent.json'` exists only to dodge a TS 7
crash; on TS 6 it points the checker at a file that is deliberately absent and
has to return to the real `tsconfig.json`. And `checkers` **stays `[]` in this
rollout** — turning the checker on changes the mutation score every floor was
calibrated against, so it is its own decision with its own ADR, recorded as fog
in [§8](#8-what-was-ruled-out-and-the-fog-that-remains). `astro check` in the
gates is the same: fog, not this spec.

**The hand-rolled walk is kept as the prototype only.** The classic
`ts.createSourceFile` / `ts.forEachChild` API is back on TS 6, so a zero-dep
walker would be simpler than the one the prototype wrote — but two counters
that disagree by one on `parseNote` is the drift this spec refuses, and ESLint
is the one somebody else maintains.

### The inventory fixture, now pinning somebody else's rule

`scripts/lib/complexity.test.ts` runs the rule over a fixture file containing
**every counted construct at least once** — `if`, `?:`, each loop kind, `case`,
`catch`, `&&`, `||`, `??`, the three assignment forms, `?.`, a default
parameter, a default in a destructuring pattern — and **every function-shaped
node the roll-up must see as a function**: a declaration, an expression, an
arrow, a method, a constructor, an accessor, **a class field initialiser and a
static block**, with the expected per-function totals and the expected function
count written beside them. It is what makes an ESLint upgrade that changes the
count **red** rather than a quiet movement of every series at once. A sampled fixture would leave the
un-sampled construct as the silent change; *total* is in the sentence on
purpose.

---

## 4. Teeth: a cap that only falls

Source: [#198](https://github.com/mephistopheles4/stacks/issues/198), the
owner's amendment, on
[#193](https://github.com/mephistopheles4/stacks/issues/193)'s gaming evidence
and [`the-ratchet.md`](the-ratchet.md)'s machinery. **Supersedes the map's
"no gate, no threshold" as the whole story** — the number is still never red on
a pull request, and the series is still a trend; what is added is the surface
the first spec already built for exactly this.

**Refused, still**: a per-function ceiling red on a pull request, and a
pre-commit hook that refuses. Both fail Clause A (*"refactor this function"* is
not a finite diff), the prototype showed a mechanical split clears a ceiling
without removing a branch, and `--no-verify` makes a blocking hook a gate anyone
can skip — a check claiming coverage it does not have.

**Adopted: the ratchet, mirrored.** `complexity-max` and
`complexity-mass-over-10` get per-scope entries in the floors file — as **caps**,
since for these the bad direction is up:

> **Cap for a scope = the highest value observed for that scope across the
> calibration window, applied once, at arming.** After arming it moves **down
> only, by hand**. Raising is the lowering of this file, and costs a `notes`
> entry like any other.

Everything else is inherited verbatim from [`the-ratchet.md`](the-ratchet.md):
every entry ships `unarmed`; arming is a human judgement per scope after that
scope's twenty-run window fills; `pnpm deploy:site` prints how far each window
has filled and refuses, with no override flag, when an armed scope exceeds its
cap; the three routes around a refusal all land in the one file with a visible
diff.

**The fixture hash plays `configHash`'s role, through the same three places.**
A record stamped under a different counting rule is refused rather than
compared, because an ESLint upgrade that counts one more construct would
otherwise breach every cap at once and read as a regression. Its contract,
stated so two implementations agree:

- **Canonical inputs**: the exact `eslint` and `@typescript-eslint/parser`
  versions as installed, the `complexity` rule's options object, and the
  fixture's expected totals — hashed in that order, the way
  `configHashOf()` in `scripts/lib/floors.ts` hashes the score-affecting
  Stryker options and nothing else. Changing any of them is changing what the
  number means.
- **Stamped**: `RunFacts.fixtureHash`, rendered as a `fixture_hash` label on
  the run-info family beside `config_hash`. A score never appears without its
  run, and now neither does a count.
- **Compared at deploy**: `stryker.floors.json` carries `fixtureHash` at the top
  level beside `configHash`; `deploy.ts` compares it to the record's label for
  every complexity cap the way it compares `configHash` for every floor, and
  **a mismatch refuses, naming both hashes** — never a silent comparison of two
  numbers that do not mean the same thing.
- **Proved able to fail**: a unit spec plants a record whose `fixture_hash`
  differs from the floors file's and expects the refusal; it sits beside the
  `configHash` mismatch spec.

**Why this and not a ceiling, in the owner's words**: experimenting a lot, and
raising the floor slowly. A cap derived from the repo's own history asks nothing
until the repo has shown what it can hold; a ceiling picked from a blog post
asks on day one and is gamed by lunchtime. Clause A is met the way the mutation
floor meets it — the remedy is *bring the function back under the cap, or write
the notes entry* — and the refusal lands in front of a person because
`deploy:site` is human-invoked.

`complexity-functions` and `complexity-mass` are **not** capped. They grow with
the codebase legitimately, and a cap on either would refuse a feature.

---

## 5. CRAP: kept local, advisory, at pre-commit

Sources: [#191](https://github.com/mephistopheles4/stacks/issues/191) and
[#189](https://github.com/mephistopheles4/stacks/issues/189), then the spike in
[#197](https://github.com/mephistopheles4/stacks/issues/197) on
[`experiment/coverage-include-orphan`](https://github.com/mephistopheles4/stacks/blob/experiment/coverage-include-orphan/docs/research/coverage-include-orphan-spike.md)
and the decision in [#199](https://github.com/mephistopheles4/stacks/issues/199).

`CRAP(m) = CC² × (1 − coverage)³ + CC`, per method, as published — where
`coverage` is **a fraction in `[0, 1]`**, never a `0–100` percentage. Istanbul's
JSON carries counts, not percentages, so the hook computes the fraction itself
(statements hit ÷ statements in the function) and never sees a value that
would make the cube negative.

### What the spike changed, and what it did not

**#191's disqualifier is closed by configuration.** #189 held that in
Vitest 4 a never-imported function is *missing* from the report, so CRAP would
be undefined exactly where it should be maximal. The spike planted an orphan
file and measured: **with `coverage.include` set to the eight scope globs, the
orphan appears with a full `fnMap` and every count at 0%**; without `include`
it vanishes (93 files → 72). `coverage.all` is gone and a `tsc` error besides.
No gate went red under instrumentation; G21 stayed silent — coverage collection
is local, and the network risk #110 found was only ever the uploader.

**Still true, and still decisive for the page**: the exponents were never
calibrated, by the authors' own account; no implementation has ever used a
mutation score; and a composite on the dashboard is what `trend-layer.md` §3
refused. **So CRAP is never a series and never a panel.** The four counts stay
the record.

**The owner's resolution (#199): shift it left.** CRAP lives **only in a pre-commit
hook**, computed over the functions the commit touches, printed to the one
person who can still change the code, with the *never calibrated* caveat on the
same line. The spike measured the cost: `vitest related <file> --coverage` for
one changed file is **3.3 seconds** — pre-commit, not pre-push — against a full
suite of ~14.5s (+20% over baseline). No series, no row, no freshness bound:
it previews; the record is CI's.

### How the hook works

- **Zero-dep**: `git config core.hooksPath .githooks`, a checked-in script,
  **opt-in per clone** — a contributor with no agent skills installed never
  meets it, and nothing in `pnpm install` wires it.
- **Per changed file**: `vitest related <file> --coverage --run` with the JSON
  reporter into a gitignored directory; ESLint's `complexity` rule over the same
  file; **per-function coverage derived** by intersecting `statementMap` against
  each `fnMap` entry's range — the spike's 40-line script, which `js-crap-score`
  also does. Then the formula, per function, printed as a table sorted by CRAP.
- **Population: the mutation scopes with exclusions applied** — the one place
  this spec applies them. The spike found **28 files at 0% because their oracle
  is a browser or a child process**, and that list is the exclusions list, by
  mechanism. For those the hook prints *no in-process oracle* and no number;
  a CRAP of 420 for `scene.ts` would be a fact about Vitest's reach, not about
  the code.
- **Anonymous arrows** are reported by `file:line`, never tracked across
  commits — the report names them `anonymous_N` positionally and the ids move
  when an unrelated arrow is added. A time series keyed on them would lie; the
  hook keeps none.
- **Never blocks.** `--no-verify` skips it and that is fine for a print. If it
  ever grew a refusal it would be [§4](#4-teeth-a-cap-that-only-falls)'s
  rejected hook, and the cap is where teeth live.
- **What a `related` run misses**: tests that reach the file through a child
  process or a browser are not in Vite's import graph — which is the same 28
  files, already excluded. Transitive in-process imports *are* followed (the
  spike confirmed 23 of 82 test files selected for one core file).

### Coverage enters the repo — as an ingredient, with its ADR

`@vitest/coverage-v8`, **pinned exact-peer to the installed Vitest** the way
`@stryker-mutator/vitest-runner` is, with `coverage.include` set to the eight
scope globs read from `stryker.scopes.json`. The ADR says plainly what changed
since [`no-coverage-floor.md`](no-coverage-floor.md) and what did not:

- **Changed**: the function-grain blind spot is closed by `include`, measured;
  the network risk was the uploader, and there is no uploader.
- **Unchanged**: **no floor, no threshold, no series, no badge.** Coverage
  percentage stays in *Not gated, deliberately* with its row untouched; nothing
  reads the number except the hook's formula, and the hook prints.
- The map's Note — *coverage is banned as a goal, not as an input* — is what
  made this reachable without reopening #117.

### The inversion, and what flips it

#191's derivation was: in a production tree with JaCoCo or `llvm-cov`
the disqualifier disappears, because those instrument everything. The spike
showed Vitest can too, with `include` — so **what flips CRAP from "refuse" to
"local triage" is not the coverage tool any more; it is function count.** Here,
a pre-commit print over the changed functions is the whole of what a ranking is
worth. At ten thousand methods, the same formula on the same ingredients is a
nightly ranking somebody reads from a dashboard — still never a verdict, still
with exponents nobody calibrated, which the page says.

---

## 6. The emitter, the cadence, and how it is proved able to fail

Source: [#192](https://github.com/mephistopheles4/stacks/issues/192), amended
for the tooling.

⚠️ **Gate numbers are cited from today's `docs/gates.md`**: freshness is G39
(`metrics-freshness`); the `G38` in [`trend-layer.md`](trend-layer.md)'s prose
is the pre-rollout number. **This spec allocates no gate number.**

| File | Change |
| --- | --- |
| `package.json`, lockfile | `typescript@6.0.3` exact; `eslint`, `@typescript-eslint/parser`, `eslint-plugin-sonarjs` **exact**, because they are inputs to the number; `@vitest/coverage-v8` exact-peer to Vitest |
| `stryker.config.mjs` | `tsconfigFile` back to the real `tsconfig.json`; `checkers` stays `[]` |
| `eslint.config.mjs` (new) | flat config: `files: ['**/*.ts']`, `languageOptions.parser` = `@typescript-eslint/parser` (without it ESLint fails on TypeScript syntax before any count), `complexity: ['warn', { max: 0, variant: 'classic' }]`, nothing else enabled — this is a counter, not a linter |
| `scripts/lib/complexity.ts` (new) | run ESLint's JSON output over a population; roll up to the four counts. **Pure, in the `scripts` mutation scope unexcluded** |
| `scripts/lib/complexity.test.ts` (new) + fixture | the inventory spec |
| `scripts/emit-metrics.ts` | the four facts into `RunFacts`; populations from `stryker.scopes.json` |
| `scripts/lib/metrics.ts` | four `TREND_SERIES` entries, `help` carrying the Measures column |
| `.github/workflows/metrics.yml` | the four names on **both** `--expect` lists |
| `docs/gates.md`, `## Trends` | four rows |
| `stryker.floors.json` | per-scope `cap` entries for `complexity-max` and `complexity-mass-over-10`, all `unarmed`; top-level `fixtureHash` beside `configHash` |
| `scripts/lib/floors.ts`, `scripts/lib/metrics.ts` | `RunFacts.fixtureHash` → `fixture_hash` label on the run-info family; the floors reader requires `fixtureHash` as it requires `configHash` |
| `scripts/deploy.ts`, `scripts/lib/trend-report.ts` | the cap refusal and window countdown beside the floor's; four lines per scope in the print block |
| `vitest.config.ts` | `coverage.provider: 'v8'`, `include` = scope globs, JSON reporter, gitignored directory — **off by default**, on only under `--coverage` |
| `.githooks/pre-commit` (new), `docs/commands.md` | the CRAP print, and how to opt in |
| `grafana/dashboards/trend-layer.json` | four panels under the mutation panel per scope, and the reading sentence on panel 1 |
| `docs/adr/` | ⚠️ **four** records, not the three this cell said until #201: TypeScript 6 until 7.1 — landed as [ADR-0066](../adr/0066-typescript-6-until-7-1.md); the counter's inputs pinned exact — landed as [ADR-0067](../adr/0067-the-counters-inputs-are-pinned-exact.md), because 0066 records the compiler trade and not the pinning of somebody else's rule implementation; the complexity cap; coverage as an ingredient |

### Cadence: both events, same bound

`gate-suite-runtime` is already emitted on both events. The counts join both
`--expect` lists — per-merge resolution, so the PR window says *which pull
request* moved `mass`. Bound **3 days, unchanged**. ⚠️ `scoredRecords()` decides
which records carry a *mutation* score; complexity on a merge record must not
make it read as scored — `scoresOf` stays mutation-specific.

### Proved able to fail

| Demonstration | Held by | Expected |
| --- | --- | --- |
| emit `complexity-mass` with no Trends row | G36 (`trend-layer`), forward | red |
| add a `complexity-p90` row nothing emits | G36 (`trend-layer`), reverse | red |
| age the newest `complexity-max` sample four days | G39 (`metrics-freshness`) | `deploy:site` refuses, naming the series |
| a population whose glob matches **no function** | `RunFacts.failed` | all four complexity families omitted; `run_ok 0`, file still written |
| arm one scope's cap one below its current `max` | the cap refusal, under `--dry-run` | `deploy:site` refuses, naming the scope |
| plant a record whose `fixture_hash` differs from the floors file's | the hash comparison, under `--dry-run` | `deploy:site` refuses, naming both hashes |
| comment `?.` out of the fixture's expected total | `complexity.test.ts` | red |

**The zero-function case is serialised one way, and it is not a zero.** When
any population yields no function, the counter returns no facts at all, and
`emit-metrics` adds **all four** complexity names to `RunFacts.failed` — the
mechanism `metrics.ts` already has for *a producing step that broke* — so the
families are omitted from the record and `run_ok` is `0`. Three things this
rules out, each for a reason: emitting the other seven scopes and omitting one
sample, because the renderer treats a zero-sample family as emitted and the
record would read `run_ok 1` with a population silently gone; a `0` sample for
`complexity-max`, because that is a legal value for a scope of trivial
functions and would be indistinguishable from the failure; and leaning on
`scoresFrom` as precedent, because an undefined tally there **throws** rather
than marks — the shape borrowed is `failed`, not `scoresFrom`. The cap
demonstration is the observed-red the ratchet's own rule requires before a
refusal is believed.

### Runtime

ESLint over ~150 files is seconds, not the prototype's 224ms — acceptable on a
nightly carrying Stryker minutes, and on the merge half. `mutation-run-runtime`
is unaffected. **No new runtime series.**

---

## 7. Gaming categories, graded

Source: [#193](https://github.com/mephistopheles4/stacks/issues/193), amended
for the cap and the hook.

| Category | Vector | Disposition |
| --- | --- | --- |
| Weakening | change what ESLint counts, or edit the fixture | **Closed** by the inventory fixture and its hash on the floors file — a count change is a red spec, and a record under a different hash is refused, not compared |
| Weakening | raise a cap | **Visible**: the floors file's append-only `notes`, same as lowering a floor |
| Satisfying the letter | function splitting: `max` −10, erosion share −3.8pp, no branch removed | **Carried open, made visible** — no ratio emitted; the signature is on the page. ⚠️ **The cap inherits it**: a split is the cheapest way under a `max` cap. `mass-over-10` is capped beside it for that reason — a split that leaves a 30 still counts — and `mass` is on the page uncapped, flat when nothing was removed |
| Routing around | code outside the populations; `.astro` files | **Open** for the two excluded directories; `.astro` closed by *no logic in `.astro` files* — and `astro check` now *can* run, recorded as fog |
| Vacuous green | a glob matching nothing; a hook printing 0% for a browser-only file | **Closed** for the series — one empty population fails all four families via `RunFacts.failed`, never a partial record; **closed by the exclusions** for the hook, which prints *no in-process oracle* instead of a number |
| Decay | the number moves with no code change | *Counting-rule drift*: ESLint upgrades — **closed** by the fixture. *`anonymous_N` identity*: **closed by not tracking them**. *The hook stops running*: **open by nature** — nothing watches a local surface, which is why it is a preview and not the record |

**Mutation-score dilution** (`gate-or-trend.md` §6) is **not** inherited: CRAP
is not a series and has no denominator anyone can pad on the page.

**One transferable rule gained**, derived from measurement: **emit the
denominator and the total, never the ratio, and let the page derive.** And a
second, from #197: **a blind spot that is configuration is not a
disqualifier — measure it before refusing on it.** #189 reasoned from Vitest's
migration guide and open issues; a one-hour spike answered what the reading
could not.

---

## 8. What was ruled out, and the fog that remains

**Out of scope** — a per-function ceiling red on a pull request; a hook that
refuses; coverage as a standalone series, floor, goal or badge; CRAP as a series
or a panel; a per-PR complexity delta as a check; building any of it in this
effort.

**Not yet specified**, on the map:

- **Stryker's type checker back on.** The spike proved it works on TS 6 (2 of
  11 mutants on `measure.ts` become `CompileError`). Turning it on changes every
  scope's score — a `CompileError` is neither killed nor survived — so every
  calibration window restarts. Its own ADR, after the TS 6 pin lands.
- **`astro check` in the gates.** It runs on TS 6 and found one real type
  error. Whether it becomes a row, and what G7 (`astro-no-logic`) then still
  protects, is a scoreboard conversation.
- **A duplication/verbosity series** — the signal that moved *more*
  consistently than complexity in the only trajectory study.
- **Cognitive complexity as a second series.** `eslint-plugin-sonarjs` is now
  installable and the spike measured it (`parseNote` 7, `asPrivate` 4); one
  vendor, unreplicated, kept as fog until the split signature proves common.
- **Test-code complexity**, and whether the gates deserve a population.

**Research and spikes, kept on their branches**, each linked from its ticket:
`research/complexity-tooling-for-typescript`,
`research/complexity-metrics-and-crap`, `research/crap-untestedness-term`,
`prototype/complexity-walk`, `experiment/typescript-6-revert`,
`experiment/coverage-include-orphan`. None merges.

---

## 9. The build order

**Pin → counter → series → cap, disarmed → hook.** Decided on what each step
needs from the one before it.

1. **TypeScript 6.0.3**, the `tsconfigFile` flip, and the ADR — alone, so the
   diff that changes the compiler changes nothing else. `pnpm typecheck && pnpm
   test && pnpm build` green is the gate; the spike says it will be.
2. **ESLint and the counter**: `eslint.config.mjs`, `lib/complexity.ts`, the
   inventory fixture and spec — **red once on purpose** (drop `?.` from the
   expected total) before it is believed.
3. **The four series and four Trends rows in the same commit**, both `--expect`
   lists, the print block, the panels. G36 green in both directions at every
   commit; the first merge record is the G39 observed-red under `--dry-run`.
4. **The cap, disarmed**: floors-file entries, the refusal, the countdown, the
   fixture hash, and the ADR. Lands early so the twenty-run countdown is visible
   for the whole window, as the ratchet's did.
5. **Coverage and the hook**: `@vitest/coverage-v8` exact-peer, `include`, the
   `.githooks/pre-commit` script, `docs/commands.md`, and the ADR. Last, because
   it is the only piece nothing else depends on, and the only one a contributor
   can decline.
