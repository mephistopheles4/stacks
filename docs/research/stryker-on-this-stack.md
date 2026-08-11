# Does Stryker run on TypeScript 7, Vitest 4 and pnpm workspaces?

Research for [#109](https://github.com/mephistopheles4/stacks/issues/109). Nothing
here is implemented and nothing was run — [#114](https://github.com/mephistopheles4/stacks/issues/114)
is the ticket that wires Stryker up and measures it. Every version number below
was read out of a published npm tarball, a registry `time` field, or Stryker's
own issue tracker, in this worktree on 2026-08-11. Where an answer is an
inference from source rather than an observation, it says so and names what
would confirm it.

**Short answer:** **Stryker runs.** `@stryker-mutator/core@9.6.1` +
`@stryker-mutator/vitest-runner@9.6.1` is the exact combination, and 9.6.1 is
the *first* release that works against Vitest 4 — the one before it was broken,
and the fix is named in its changelog. ESM and Node 22/24 are not obstacles and
never were.

**One plugin does not run, and it is not the interesting problem.**
`@stryker-mutator/typescript-checker` cannot work under `typescript@7.0.2` —
not "probably", not "untested": TypeScript 7's root export is a three-line file
that exports a version string, and the checker calls `ts.sys`,
`ts.createSourceFile` and `ts.createSolutionBuilderWithWatch` on it. Dropping the
checker is a supported configuration and costs this repo very little, because
Vitest never type-checks anything anyway.

**The two findings that should actually change the map are neither of those:**

1. **An open, root-caused, unfixed correctness bug produces non-deterministic
   mutant verdicts on exactly this combination** — Stryker 9.6.1 with Vitest
   4.1.9 *and* 4.1.10, this repo's version ([stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073)).
   It cannot be configured away. **A ratchet cannot be built on a number that
   changes when nothing changed**, and that is §5's subject.
2. **The pnpm workspace link defeats the sandbox** for any code reached through
   `@stacks/core`, by a mechanism visible in Stryker's own source. Narrow here,
   but it is the failure that produces a *confidently wrong* score rather than
   an error (§4).

---

## 0. What was checked, and against what

| Question | Verdict | Where the answer came from |
| --- | --- | --- |
| Vitest 4 | ✅ works, **9.6.1 only** | changelog + tarball diff 9.2.0→9.6.1 |
| ESM / `"type": "module"` | ✅ non-issue | `package.json` `"type"` fields |
| Node 22 and 24 | ✅ both in Stryker's own CI matrix | `.github/workflows/ci.yml` |
| TypeScript 7 — *running* Stryker | ✅ Stryker never imports `typescript` | dependency lists + tarball grep |
| TypeScript 7 — `typescript-checker` | ❌ **hard incompatibility** | `typescript@7.0.2` `exports` + checker source |
| pnpm workspaces | ⚠️ **resolves to the wrong files** | `sandbox.js` + `file-utils.js` source |
| Determinism | ⚠️ **open bug on this exact pair** | stryker-js#6073, root-caused 2026-07-26 |
| `.astro` files | ❌ not mutatable (harmless here) | instrumenter `create-parser.js` |

Versions in play: `@stryker-mutator/*` latest is **9.6.1**, published
**2026-04-10**, and it is still `latest` four months later — there has been no
Stryker release since.

---

## 1. Vitest 4 — works, on one exact version, and the peer range is worthless evidence

### The peer range says nothing

`@stryker-mutator/vitest-runner@9.6.1` declares:

```json
"peerDependencies": { "vitest": ">=2.0.0", "@stryker-mutator/core": "9.6.1" }
```

**This is not evidence of Vitest 4 support.** That exact range was set in
`9.0.0`, published **2025-05-13**. Vitest `4.0.0` was published **2025-10-22** —
*five months later*. An unbounded lower bound written before the major existed
cannot be a statement about it. It is the "nobody has reported it broken" half
of the distinction #109 asks for, and here it is demonstrably not even that: the
combination *was* broken and the range never moved.

Stryker's own documentation makes this worse rather than better. The
[vitest-runner page](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
does not name a supported version at all; it says to
*"See `@stryker-mutator/vitest-runner`'s package.json file to discover the
minimal required version of `vitest`"* — i.e. it points at the range that was
already wrong. **There is no "documented as supported" statement for Vitest 4
anywhere in Stryker's docs.** The support is real, but the evidence for it is
the changelog and the code, not the docs.

### What is actually true

Reading the shipped tarballs for the string `isGreaterThanVitest4Point1`:

| vitest-runner | published | Vitest 4.1 branch present |
| --- | --- | --- |
| 9.2.0 – 9.6.0 | to 2026-02-27 | no |
| **9.6.1** | **2026-04-10** | **yes** (4 occurrences) |

`vitest-test-runner.js:56` computes it:

```js
this.ctx.provide('isGreaterThanVitest4Point1', semver.satisfies(vitestWrapper.version, '>=4.1.0'));
```

and `stryker-setup.js` branches on it, carrying the comment
`// @ts-expect-error This was changed in Vitest v4.1`.

The [v9.6.1 release notes](https://github.com/stryker-mutator/stryker-js/releases/tag/v9.6.1)
name the fix:

> **vitest-runner:** fix vitest runner mutant hitcount and coverage for v4.1 (#5928)

[stryker-js#5928](https://github.com/stryker-mutator/stryker-js/issues/5928),
*"No proper coverage with Vitest 4"*, was filed 2026-03-27 against 9.6.0 +
vitest 4.1.2 and closed **completed on 2026-04-10, the day 9.6.1 shipped**. Its
symptom is worth recording because it is the silent kind:

> "With Vitest 4 there is no proper coverage during mutation testing runs.
> Completely uncovered functions are mutated and affect the resulting score as
> well as the column 'No Coverage' is all zeros."

A wrong score, not a crash. **`9.6.0` on this repo would have produced a
plausible number that was wrong** — which is the same shape as the G21 lesson
#109 cites.

**Conclusion:** `@stryker-mutator/vitest-runner@9.6.1` exactly. Not `^9.6.0`,
not `^9`. Pin it, and treat any downgrade as a correctness regression.

### Constraints the runner imposes regardless

From the docs and confirmed in `vitest-test-runner.js`:

- `pool: 'threads'` / `threads: true` is **hardcoded** (lines 36–38). The docs:
  *"Currently, only `threads: true` is supported."*
- `bail: 1` unless `disableBail` (line 52).
- *"Your `coverageAnalysis` property is ignored. The vitest runner plugin will
  always use `"perTest"`."* — this matters in §5.
- Browser mode unsupported. Irrelevant here; the suite is `environment: 'node'`.

---

## 2. TypeScript 7 — Stryker runs; its type checker cannot

### Stryker itself never touches `typescript`

Checked against the 9.6.1 tarballs:

| package | `import … from 'typescript'` | declares a `typescript` dep |
| --- | --- | --- |
| `@stryker-mutator/core` | 0 | no |
| `@stryker-mutator/instrumenter` | 0 | no — parses TS via `@babel/preset-typescript` |
| `@stryker-mutator/vitest-runner` | 0 | no |
| `@stryker-mutator/typescript-checker` | **5 modules** | `peerDependencies: { "typescript": ">=3.6" }` |

The instrumenter mutates TypeScript with **Babel**, not with the TypeScript
compiler. So the whole mutate → sandbox → run pipeline is indifferent to which
`typescript` is installed, or whether one is installed at all. **This is the
finding that makes the answer "yes".**

### Why the checker cannot work

`typescript@7.0.2` (published 2026-07-08) declares:

```json
"exports": {
  ".": "./lib/version.cjs",
  "./unstable/fs": "./dist/api/fs.js",
  "./unstable/ast": "./dist/ast/index.js",
  "./unstable/sync": "./dist/api/sync/api.js",
  "./unstable/async": "./dist/api/async/api.js",
  …
}
```

and `lib/version.cjs` is, in full:

```js
const { version } = require("../package.json");
exports.version = version;
exports.versionMajorMinor = "7.0";
```

The classic compiler API is gone from the root export. `@stryker-mutator/typescript-checker@9.6.1`
does `import ts from 'typescript'` and then calls:

- `ts.sys.readFile` / `ts.sys.fileExists` / `ts.sys.getModifiedTime` (`hybrid-file-system.js`, `tsconfig-helpers.js`)
- `ts.createSourceFile(…, ts.ScriptTarget.Latest, …)` (`script-file.js`)
- `ts.createSolutionBuilderWithWatchHost` / `ts.createSolutionBuilderWithWatch` / `ts.createEmitAndSemanticDiagnosticsBuilderProgram` (`typescript-compiler.js`)

Every one of those is `undefined` under 7.0.2. This is not a version-range
mismatch that a bump fixes; it is a removed API.

⚠️ **And `">=3.6"` admits `7.0.2`.** pnpm will install this combination without
a warning, and it will fail at runtime rather than at install. This is the
cleanest specimen of #109's distinction in the whole investigation: the peer
range is not merely silent about TypeScript 7, it *actively asserts
compatibility that does not exist*.

### Stryker knows, and has not shipped a fix

| | |
| --- | --- |
| [#6110](https://github.com/stryker-mutator/stryker-js/issues/6110) *TypeScript 7 migration strategy* | **open**, last activity 2026-08-02 |
| [#6070](https://github.com/stryker-mutator/stryker-js/issues/6070) *Experimental support for TS7* | **open** |
| [#6099](https://github.com/stryker-mutator/stryker-js/pull/6099) *feat(typescript-checker): add experimental support for TypeScript@7* | **open, unmerged**, `mergedAt: null`, last activity 2026-07-13 |

PR #6099 also confirms the diagnosis from the other side, and its fourth
limitation is the sentence that settles this section:

> "Unfortunately, typescript@6 still needs to be installed under the 'normal'
> typescript name. This is needed for some utility functions we currently have
> no replacement for in the experimental TS7 api (i.e. `ts.parseConfigFileTextToJson`)."

So even Stryker's own unmerged TS7 branch requires a **real `typescript@6`**
alongside TS7 aliased as `@typescript/native`. There is no configuration of any
*released* Stryker in which `typescript@7.0.2` alone drives the checker.

### Is running without a checker viable? Yes, and the usual objection does not apply here

`checkers: []` is the default. The concern #109 raises — a report flooded with
mutants that never compiled — is real on stacks that *build* with `tsc`. It is
weak on this one, and the reason is structural:

**Vitest does not type-check.** It transpiles per file through esbuild, which
strips types without checking them. A mutant that would fail `tsc` mostly still
*runs* under `vitest run`, so it gets a real verdict rather than a compile
error. The checker's job — reclassifying uncompilable mutants out of the
denominator — has much less to reclassify here.

Two supporting facts:

- Stryker's `disableTypeChecks` defaults to **`true`**: it inserts `// @ts-nocheck`
  into sandboxed files anyway. Stryker's own default position is that type
  errors in the sandbox are noise.
- The checker's documented purpose is narrow: *"Type check each mutant. Invalid
  mutants will be marked as `CompileError` in your Stryker report."* It improves
  report precision; it is not load-bearing for running.

⚠️ **This paragraph is an inference, not a measurement.** It follows from how
Vitest transpiles, and I did not run Stryker. The observable that confirms or
refutes it is the `CompileError`/`RuntimeError` count in the first #114 report:
if `RuntimeError` is a large fraction, the mutants *are* failing to compile and
this section is wrong. #114 should be asked to report that number explicitly.

**If the checker is later wanted:** `stryker-tsgo-checker@0.1.0` (2026-06-21,
CC0, the reference implementation behind #6070) exists, but it peers on
`@stryker-mutator/typescript-checker >=9.0.0 <10` and therefore inherits the
classic-`typescript` requirement. It is a third-party 0.1.0 against a pre-GA
`@typescript/native-preview` whose latest is still a dev build
(`7.0.0-dev.20260707.2`). **Not a candidate for a gate.**

---

## 3. ESM and Node — non-issues, and one of them was never in doubt

**ESM.** `@stryker-mutator/core`, `instrumenter` and `vitest-runner` all declare
`"type": "module"` in their own `package.json`. Stryker 9 is ESM-native. The
historical CJS shape the ticket remembers is real history and is over.

**Node.** `@stryker-mutator/core@9.6.1` declares `engines: { "node": ">=20.0.0" }`
— which, by the standard applied in §1, is an unbounded lower bound and proves
nothing about 24. The discriminating source is Stryker's own CI, in
`.github/workflows/ci.yml`:

```yaml
strategy:
  fail-fast: false
  matrix:
    node-version: [22.x, 24.x]
    os: ['ubuntu-latest', 'windows-latest']
```

**Stryker's matrix is this repo's matrix.** `22` and `24`, exercised on every
Stryker commit including its e2e suite. This is the one row in the table backed
by continuous first-party evidence rather than by an absence of complaints.

---

## 4. pnpm workspaces — the sandbox is defeated by the workspace link

This is the answer that could not be reached from documentation: Stryker's docs
contain **no monorepo or workspace guidance at all**. The mechanism is legible
in the source.

### What Stryker does

`sandbox.js` copies the project into `.stryker-tmp/`, then:

```js
async symlinkNodeModulesIfNeeded() {
  if (this.options.symlinkNodeModules && !this.options.inPlace) {
    const nodeModulesList = await fileUtils.findNodeModulesList(basePath, this.options.tempDirName);
    for (const nodeModules of nodeModulesList) {
      await fileUtils.symlinkJunction(path.resolve(nodeModules), path.join(this.workingDirectory, nodeModules))
```

`findNodeModulesList` (`file-utils.js`) breadth-first walks the tree from the
project root and collects **every** `node_modules` directory. So it is
monorepo-*aware*: `node_modules`, `packages/core/node_modules`,
`packages/cli/node_modules` and `packages/site/node_modules` each get their own
junction into the sandbox. pnpm's symlink farm is reached through one link and
resolves normally. **`@stacks/core` will not fail to resolve.**

### Why that is the problem, not the solution

Each junction points at the **real** directory. Verified in this checkout:

```
packages/cli/node_modules/@stacks/core   SymbolicLink -> ..\..\..\core
packages/site/node_modules/@stacks/core  SymbolicLink -> ..\..\..\core
```

A *relative* symlink, resolved against its own containing directory. So
resolving `@stacks/core` from inside the sandbox goes:

```
.stryker-tmp/…/packages/site/node_modules   →  REAL packages/site/node_modules   (junction)
  └─ @stacks/core                            →  REAL packages/core               (relative symlink)
```

**It lands on the real, unmutated `packages/core`.** A mutant written into
`.stryker-tmp/…/packages/core/src/subjects.ts` is never loaded by anything that
imported `@stacks/core/subjects`. It cannot be killed, because it was never run.

### Corroboration: this has been reported and never answered

[stryker-js#2166](https://github.com/stryker-mutator/stryker-js/issues/2166),
*"How to run Stryker in a monorepo"* (2020), reports precisely this symptom in a
linked-package monorepo:

> "Now when I run Stryker from `projectA`, Stryker mutates `sharedLogic` but
> *doesn't kill those mutants*."

It cross-references #1957 (*"Stryker is generating mutants in another directory
but not killing them"*), went stale, was closed without a maintainer answer, and
the only suggestion in six years — from a passer-by in 2025 — is `inPlace: true`,
which works only because it abolishes the sandbox.

A six-year-old unanswered report whose symptom is exactly what the source
predicts is about as much corroboration as a mechanism reading can get.

### How much of *this* repo it actually touches — narrow, and nameable

Counted here: **64 mutatable `.ts` files, 13,363 lines** (core 35, site 26,
cli 3), against 37 package tests and 29 gate tests.

The hazard needs a *value* import crossing a package boundary. Checked:

- **Core's own tests import relatively** — `./obsidian-adapter.ts`,
  `../test-support.ts`, `./cache-cover.ts`. These load the **sandbox copy**, so
  mutants in core's 35 files **are** seen and killed normally. This is the bulk
  of the repo and it is fine.
- **The site's cross-package imports are almost all `import type`**, erased at
  compile time — which is [G6](../gates.md)'s doing, not luck. Exactly **two**
  runtime specifiers exist: `@stacks/core/shelf-order` (`books.ts`) and
  `@stacks/core/subjects` (`card.ts`).
- **`packages/cli/src/index.ts`** value-imports `@stacks/core`.

So the exposure is: `shelf-order.ts`, `subjects.ts`, and whatever the CLI
reaches — and even those are also covered by core's own relative-import tests,
which still kill their mutants. **The likely effect is a modest, systematic
understatement of coverage attribution rather than a wrong headline score.**

⚠️ **That last sentence is the inference, and it is the one most worth
distrusting.** The mechanism is verified from Stryker's source and this repo's
symlinks; the *magnitude* is not. **#114 should be asked for one specific
observable:** whether any mutant in `packages/core/src/shelf-order.ts` or
`subjects.ts` reports `Survived` with a **zero hit count** while a core-side
test demonstrably covers it. That is the fingerprint of a mutant that was never
loaded, and it distinguishes this problem from an ordinary test gap.

**Two escape hatches exist, both with costs.** Stryker's troubleshooting page
documents `"ignorePatterns": ["!node_modules"], "symlinkNodeModules": false`,
which copies `node_modules` into the sandbox instead — on a pnpm store that is
very expensive and its behaviour through workspace symlinks is unverified.
`inPlace: true` mutates the real working tree with a backup, which removes the
divergence by removing the sandbox. **Neither is recommended here without
measurement**, and G6 has already made the problem small.

### `gates/` — in the Vitest project, in no package

Not a problem, because there is nothing there to mutate. `gates/` holds 29
`.test.ts` files plus four helpers, and `mutate` excludes test files by default.
The gates are *assertions about the repo* — they read `CLAUDE.md`, `docs/gates.md`
and the source tree. They contribute to killing mutants elsewhere; they are not
themselves a mutation target. **No configuration is needed for `gates/`, and any
proposal to give it a per-directory mutation score is a category error.**

### `.astro` — not mutatable, and it does not matter

The instrumenter's `create-parser.js` dispatches on extension: `.js`, `.jsx`,
`.mjs`, `.cjs`, `.ts`, `.tsx`, `.vue`, `.html`, `.svelte`. **No `.astro`.** The
4 `.astro` files in this repo cannot be mutated by any Stryker version.

This costs nothing, and for a reason already recorded: CLAUDE.md's *"no logic in
`.astro` files"* rule means there is no logic in them to mutate. **A constraint
adopted because `astro check` cannot run under TypeScript 7 turns out to also
neutralise the one file type Stryker cannot read.** Worth noting in the spec as
a case where an existing rule paid twice.

---

## 5. The finding that should change the map: the score is not deterministic

[stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073) —
*"vitest-runner: non-deterministic mutant verdicts under coverageAnalysis=perTest
(9.6.1, vitest 4.1.9)"* — filed 2026-06-22, **still open**, last activity
2026-07-26.

Reported environment: `@stryker-mutator/core` 9.6.1, `vitest-runner` 9.6.1,
**vitest 4.1.9**, node 22. The follow-up comment adds that it *"also reproduces
on vitest 4.1.10"* — **this repo's exact version.**

The symptom:

> "Under `coverageAnalysis: "perTest"`, the vitest-runner produces
> **non-deterministic mutant verdicts** across identical runs. The same mutant
> flips `Timeout` ↔ `Survived` and `Killed` ↔ `Survived`, and the global status
> counts swing run-to-run."

Over six identical runs on the reporter's minimal repro: `Survived` 5→8,
`Timeout` 4→5, `Killed` 45→47. And these are false survivors, hand-verified —
applying a mutant by hand and running its covering test directly *fails*, for a
mutant Stryker reported as `Survived`.

The root cause, posted 2026-07-26, is a single line, and **I confirmed it is
present in the 9.6.1 tarball**. `vitest-test-runner.js:144`:

```js
.filter((test) => test.result); // if no result: it was skipped because of bail
```

> "When a run is lost, the state contains the right files with tasks collected
> but result-less … so this filter empties the list; no failure ⇒
> `toMutantRunResult` reports **survived** with `hitCount 0` … 'All tests
> bail-skipped' and 'nothing executed' are indistinguishable here."

Note the fingerprint: **`Survived` with `hitCount 0`** — the same signature §4
asks #114 to look for. The two problems are distinguishable only by which files
are involved, which is worth knowing before anyone reads a first report.

### Why this cannot be configured away

The reporter tried. Not the pool (the runner forces `threads`), not
`vitest.related`, not the per-test coverage handoff — and **not
`coverageAnalysis`**, which is exactly what the docs predict, since *"your
`coverageAnalysis` property is ignored. The vitest runner plugin will always use
`perTest`"*. **There is no supported configuration of Stryker 9.6.1 + Vitest 4
that avoids this.** A fix is prototyped and offered in that thread; no PR is
merged, and there has been no Stryker release since 2026-04-10.

### What it means for the map

This lands on [#108](https://github.com/mephistopheles4/stacks/issues/108)'s
first destination — *"per-directory scores, a ratchet whose floor rises toward a
target"* — and it should be read against a rule this repo already holds:
**"a gate never observed failing is not yet a gate."** Its unstated twin is that
a gate which fails *when nothing changed* is not a gate either; it is a coin
flip that trains people to ignore it. `docs/gates.md`'s warning that a ratchet
floor is *"the most weakenable artifact this map can produce"* becomes much
sharper when the measurement itself moves: the first spurious red is an argument
for lowering the floor, and it will be a good-faith argument, because nothing
did change.

The map's standing constraint — *mutation score is a trend, not a hard gate*,
reported nightly for a human to read — is **much better suited to this than a
ratchet is**, and it was chosen for an unrelated reason (context for a person).
It survives non-determinism; it just needs the noise floor stated so a reader
does not chase a two-point move that is run-to-run variance.

**This does not make Stryker unusable, and it should not be read that way.**
Verdicts where at least one test actually ran are stable — *"per-run survivor
counts decompose exactly into `genuine survivors + zero-test runs`"*. The signal
is real; it has a noise term nobody has quantified on this suite. **#114 should
be asked to run the suite more than once and report the spread**, which is a
cheap addition to a ticket that is already paying the setup cost, and it is the
only way this repo gets its own noise floor rather than borrowing a stranger's.

---

## 6. If Stryker did not run, what else is there? Nothing.

#109 asks this, and the honest answer is that the JS/TS ecosystem has one
mutation testing tool.

Searching the npm registry for mutation-testing packages returns, in order:
`mutation-testing-report-schema`, `mutation-testing-metrics`,
`mutation-testing-elements` (all three are **Stryker's own** report libraries,
maintained in the Stryker org), then `@stryker-mutator/{jest,tap,mocha,karma}-runner`,
`@stryker-mutator/core`, `@stryker-mutator/api`, `@stryker-mutator/typescript-checker`.
**Every mutation-testing result is Stryker or a Stryker component.** The
remaining hits are unrelated test libraries matching on the word "testing".

The historical alternatives are dead by their own timestamps — `mutode`'s last
publish is **2018-06-03**. PIT is Java-only. Nothing else is maintained.

**So the question "if not Stryker, what?" has no second answer** — but it also
does not need one, because Stryker runs. The relevant fallback is not a
different tool; it is a narrower Stryker (drop the checker, scope `mutate` to
the packages whose tests import relatively), which is what §2 and §4 describe.

---

## 7. Does this make the mutation half transferable-only? No.

[#108](https://github.com/mephistopheles4/stacks/issues/108) asks each decision
to name whether it speaks about stacks-as-reference-implementation or about the
transferable design, and flags that a Stryker failure *"would make the mutation
half of the spec transferable-only, with stacks unable to be its own reference
implementation for it."*

**That condition is not met.** Stacks can run Stryker and can be its own
reference implementation. Concretely:

```
@stryker-mutator/core          9.6.1   (pinned exactly)
@stryker-mutator/vitest-runner 9.6.1   (pinned exactly)
checkers: []                           — no typescript-checker
```

The three qualifications the spec must carry:

1. **Pin 9.6.1 exactly**, and record that `^9.6.0` is a correctness bug, not a
   looser range (§1). Worth an ADR line of its own — this is the sort of pin
   that a well-meaning dependency bump silently widens.
2. **No type checker**, with the `RuntimeError`/`CompileError` counts from #114
   as the evidence that this was affordable (§2).
3. **Scope `mutate` deliberately**, and state the workspace-link hazard rather
   than discovering it as a mystery survivor (§4).

**Where the two audiences genuinely diverge** — the thing #108 asks to be named:

- **Stacks:** the workspace hazard is nearly free, because G6 already forbids
  the value imports that trigger it. A production monorepo with ordinary
  cross-package runtime imports would be hit **much** harder, and for it the
  honest transferable advice is *run Stryker per package, from that package's
  own directory*, not once from the root.
- **Stacks:** TypeScript 7 is already here, so `checkers: []` is forced. A
  production codebase on TypeScript 5 or 6 can run `typescript-checker` normally
  and gets a more precise report. **The transferable design should not inherit
  this repo's constraint as if it were a recommendation** — it is a consequence
  of being early on TS 7.
- **Both:** the non-determinism in §5 is not specific to stacks. Any Stryker +
  Vitest 4 user has it, and the transferable design should say so, because it is
  an argument against ratchets in general and not just here.

And one item for [#114](https://github.com/mephistopheles4/stacks/issues/114)
that is not a version question at all: **`smoke:render` drives puppeteer against
real Chrome**, and Stryker reruns the suite once per mutant. It is not in
`packages/**/src` so it is not a mutation target, but if it is reachable by the
test command it will dominate the run. #108 already flags it as
*"the obvious problem for anything that reruns the suite hundreds of times"*.
It is a `pnpm` script rather than a Vitest spec, so it likely stays out — but
that should be **confirmed, not assumed**, before the first timing number is
believed.

---

## Sources

All retrieved 2026-08-11.

**npm registry** (tarballs unpacked and read, not summarised):
`@stryker-mutator/core@9.6.1`, `@stryker-mutator/vitest-runner@{9.2.0,9.3.0,9.4.0,9.5.0,9.5.1,9.6.0,9.6.1}`,
`@stryker-mutator/typescript-checker@9.6.1`, `@stryker-mutator/instrumenter@9.6.1`,
`typescript@7.0.2`, `stryker-tsgo-checker@0.1.0`, `@typescript/native-preview`.
Publish timestamps read as raw ISO strings from the registry `time` object.

**Stryker source** (from the 9.6.1 tarballs):
`core/dist/src/sandbox/sandbox.js`, `core/dist/src/utils/file-utils.js`,
`vitest-runner/dist/src/vitest-test-runner.js`, `.../stryker-setup.js`, `.../vitest-wrapper.js`,
`typescript-checker/dist/src/typescript-compiler.js`, `.../fs/hybrid-file-system.js`, `.../fs/script-file.js`,
`instrumenter/dist/src/parsers/create-parser.js`.

**Stryker docs:** [vitest-runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/),
[typescript-checker](https://stryker-mutator.io/docs/stryker-js/typescript-checker/),
[configuration](https://stryker-mutator.io/docs/stryker-js/configuration/),
[troubleshooting](https://stryker-mutator.io/docs/stryker-js/troubleshooting/).

**Stryker repo:** [ci.yml](https://github.com/stryker-mutator/stryker-js/blob/master/.github/workflows/ci.yml),
[v9.6.1 release](https://github.com/stryker-mutator/stryker-js/releases/tag/v9.6.1),
issues [#2166](https://github.com/stryker-mutator/stryker-js/issues/2166),
[#5928](https://github.com/stryker-mutator/stryker-js/issues/5928),
[#6070](https://github.com/stryker-mutator/stryker-js/issues/6070),
[#6073](https://github.com/stryker-mutator/stryker-js/issues/6073),
[#6110](https://github.com/stryker-mutator/stryker-js/issues/6110),
PR [#6099](https://github.com/stryker-mutator/stryker-js/pull/6099).

**This repo**, at `1d0548f`: `package.json`, `pnpm-workspace.yaml`, `vitest.config.ts`,
`tsconfig.json`, `packages/{core,cli,site}/package.json`, and the workspace symlinks
under `packages/*/node_modules/@stacks/`.
