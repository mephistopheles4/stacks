# What measures duplication for TypeScript here, counting what, and how much

Research for [#232](https://github.com/mephistopheles4/stacks/issues/232).
Nothing here is implemented, and nothing here decides whether duplication
becomes a series — that is [#237](https://github.com/mephistopheles4/stacks/issues/237),
the decision ticket this one blocks. Every number below was measured in this
worktree on 2026-08-22, against `typescript@6.0.3`, `eslint@10.9.0`,
`@typescript-eslint/parser@8.67.0`, `eslint-plugin-sonarjs@4.2.0` as pinned in
`package.json`, and `jscpd@5.0.16` installed experimentally via `pnpm dlx`
(never added to `package.json` or the lockfile).

**Short answer:** two tools were tried; they measure almost disjoint things.
`jscpd` is a **token-window substring matcher** — it finds any repeated run of
tokens at least as long as a threshold, anywhere, including across files and
across function boundaries, with no understanding of what a "function" is.
`eslint-plugin-sonarjs`'s `no-identical-functions` (S4144) is **not** the
AST-level alternative it sounds like: it compares whole function bodies for
exact token-for-token equality, only for four function shapes, and —
this is the finding that matters most for choosing between them — **it
cannot see across files at all**, because ESLint gives each rule a fresh
closure per file. On this repo it found **zero** matches anywhere, at its
default and at a stricter setting, including in the same file as a hit
`jscpd` found. `jscpd` found **12 clones, 133 duplicated lines (0.51% of
25,999), across the eight declared scopes** at its own default settings —
and of those 12, roughly three quarters are real extractable logic
duplication, two are two TypeScript interfaces sharing a field vocabulary by
design, and one is a duplication the repo's own spec calls "mirrored" on
purpose. Neither tool's false-positive rate on `gates/`'s deliberate
near-repetition is as bad as feared, but for an entirely unexpected reason:
`jscpd`'s exact-token matching means two structurally-similar assertions
with *different literal values* — which is what most of `gates/` actually
is — don't match at all. What **does** match, even at defaults, is import
boilerplate.

---

## 1. The tooling question

### `jscpd` — a Rust binary, not a Node/TypeScript-toolchain tool at all

`pnpm dlx jscpd --version` resolves and runs cleanly: `cpd 5.0.16`. Its
`package.json` (`node_modules/jscpd/package.json` after `pnpm dlx` caches it)
declares zero dependency on `typescript` or `eslint`. It ships as a thin
`run-jscpd.js` wrapper plus a platform-specific `optionalDependencies` binary
— `jscpd-windows-x64-msvc` was pulled down here — and the actual detection
engine is Rust (`cpd-core`, `cpd-tokenizer`, `cpd-finder`; see
[jscpd's `docs/rust.md`](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md)).
**This means ADR-0066's constraint (TypeScript 7 breaks every ESLint-based
tool because `@typescript-eslint/parser` and `eslint-plugin-sonarjs` each pin
`typescript` below 6.1.0) does not apply to `jscpd` at all.** It would install
and run identically on TypeScript 7. Its own tokenizer parses 223 language
grammars including TypeScript syntax directly — it never calls into the
TypeScript compiler or an ESLint parser, so it is unaffected by, and
irrelevant to, the pin in `package.json`.

What it counts, precisely: `cpd-core`'s algorithm is a **Rabin-Karp rolling
hash over the token stream** (stated in the package's own docs). It finds
every pair of positions in the tokenized corpus where a window of at least
`--min-tokens` tokens and `--min-lines` lines is byte-for-byte identical in
token *values* — this is token-level, sliding-window, exact-substring
matching. It has no concept of "function", "file", or "AST node" — a clone
can start and end mid-statement, span two unrelated functions, or cross a
file boundary, and the tool does not care.

**`--mode` (`mild` / `weak` / `strict`, default `mild`) does not normalize
identifiers.** The docs describe the three values only by name; empirically,
`--skip-comments` is stated to be an alias for `--mode weak`, and testing a
pair of functions differing only in variable names (`sumScores(list)` /
`total`/`item` vs. `sumValues(values)` / `sum`/`value`, otherwise structurally
identical) found **zero** matches under all three modes, even at a permissive
`--min-tokens 10 --min-lines 3`. So the mode axis governs whitespace/comment
tolerance, not identifier tolerance — `jscpd` never does Type-2 (renamed) or
Type-3 (gapped/near-miss) clone detection in any of its built-in modes. It
finds Type-1 clones (and Type-1-modulo-formatting, depending on mode) only.

### `eslint-plugin-sonarjs`'s `no-identical-functions` (S4144) — narrower than its name

`eslint-plugin-sonarjs@4.2.0` is already a pinned dependency and installs
cleanly on this toolchain (it is one of the three packages ADR-0066 exists
to keep installable). The rule lives at
`node_modules/eslint-plugin-sonarjs/cjs/S4144/`; `meta.js` confirms
`eslintId = 'no-identical-functions'`, and its schema takes one integer
option, a minimum line count (`minimum: 3`, default `3` — read from
`rule.js`'s `DEFAULT_MIN_LINES`).

What it actually does, read from `rule.js` and `helpers/equivalence.js`:

- **It only looks at four shapes**: `FunctionDeclaration`, a
  `FunctionExpression` or `ArrowFunctionExpression` assigned to a
  `VariableDeclarator`, and a `FunctionExpression` or
  `ArrowFunctionExpression` as a `MethodDefinition`. An anonymous callback
  passed directly as an argument, or an object-literal shorthand method, is
  invisible to it.
- **Equivalence is `areEquivalent(bodyA, bodyB)`**, which recursively walks
  paired AST nodes checking `node.type` equality and then compares the two
  nodes' **token values** exhaustively — same token count, same token text at
  every position. This is not a fuzzy or renamed-identifier match: a variable
  renamed anywhere in the body breaks equivalence. It is closer to "token-level
  match scoped to one AST subtree" than to true structural (Type-2) AST
  comparison.
- **It only compares whole function bodies to other whole function bodies of
  the same four shapes** — never a fragment, never a partial overlap.
- **Critically, it has no cross-file memory.** The `functions` array that
  `processFunctions()` walks is declared inside `create(context)`'s closure,
  and ESLint invokes `create()` once per file with a fresh `context`. There is
  no module-level state. This was verified two ways: (1) reading the source —
  `functions` is a local, not exported or cached; (2) running it directly
  against the two files holding the repo's clearest cross-file duplicate
  (`packages/core/src/covers/cover-budget.ts` and
  `packages/core/src/covers/measure.ts`, both define a byte-identical
  `measureCover`) — **zero messages**, on either the default or an explicit
  `minLines: 5`. A synthetic same-file pair of 7-line identical functions
  *was* caught correctly (confirming the rule works; see §3), which rules out
  a configuration mistake.

So "AST-level" is the wrong mental model for what this rule buys over
`jscpd`: it is a **narrower, single-file, whole-function-only, exact-token**
matcher, not a structural or cross-file one. It cannot replace `jscpd` for a
repo-wide duplication series; at best it is a stricter, lower-recall
secondary signal for one specific pattern ("I copy-pasted a whole function
next to itself in the same file").

### Other candidates considered and not tested further

- **PMD CPD** — the JVM tool `jscpd`'s algorithm is modeled on. Requires a
  JVM in the toolchain for no benefit over `jscpd`, which already implements
  the same Rabin-Karp approach natively in the pnpm/Node pipeline. Not
  pursued.
- **`jsinspect`** — unmaintained, Babel/Esprima-based, no native TypeScript
  grammar. Not installed or tested; `jscpd`'s TypeScript tokenizer and active
  maintenance make it strictly preferable.
- **`ts-morph`/hand-rolled AST diffing** — the same objection this repo's own
  complexity spec raised against a hand-rolled complexity walker applies
  doubly here: clone detection is a much larger surface than cyclomatic
  counting, and a second bespoke implementation is where the drift `docs/spec/complexity-on-the-trend-layer.md`
  §3 refused to risk would reappear immediately.

---

## 2. The definition question — what parameters decide the number

For `jscpd`, read from `pnpm dlx jscpd --debug` (prints the merged default
config) and confirmed against
[the tool's own `docs/rust.md`](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md):

| Parameter | Default | What it controls |
| --- | --- | --- |
| `--min-tokens` | 50 | Minimum token-window length counted as a clone |
| `--min-lines` | 5 | Minimum line span (both conditions must hold) |
| `--mode` | `mild` | `strict` = nothing normalized; `mild` = default; `weak` (= `--skip-comments`) = comments stripped from the token stream before matching. **None of the three touches identifiers.** |
| `--max-lines` | none | Optional cap, unset here |
| `--max-size` | 1mb | Files above this are skipped entirely |
| `--skip-local` | off | Whether same-directory pairs count |
| format/pattern | all 223 | Which file types are tokenized |

For `sonarjs/no-identical-functions`: one parameter, minimum body line count
(default 3, minimum allowed value 3). No token-count option. No mode. No
near-miss handling of any kind — see §1.

**Confirmed empirically, not just from docs, that the number moves
enormously with these parameters on this repo**: over the same population
(the eight scopes, tests excluded), `jscpd`'s own defaults (50 tokens / 5
lines) find **12 clones, 0.51% duplication**; loosening to 20 tokens / 3
lines (still inside the tool's own quick-start example) finds **82 clones,
2.51% duplication** — nearly 5× more, over the identical source tree. This is
the same lesson `fixtureHash` encodes for the complexity counter: a
duplication number is meaningless without the four numbers above stamped
beside it, because a different min-tokens/min-lines/mode is a different
measurement, not a stricter reading of the same one.

---

## 3. The baseline — the eight declared scopes, `jscpd` defaults

Population rule copied verbatim from `docs/spec/complexity-on-the-trend-layer.md`
§2 for comparability with the complexity series: one `scopes[].glob` from
`stryker.scopes.json`, `*.test.ts` dropped, `exclusions` and
`excludedDirectories` **not** applied (the same reasoning holds — exclusion
mechanisms are about oracle reach, which says nothing about a static
duplication measure). File counts were built by hand (`Get-ChildItem`,
non-recursive for `packages/core/src` as the glob requires) rather than by
trusting `jscpd`'s own glob expansion — `jscpd`'s `*` crosses `/`
boundaries the same way `git ls-files` does, so `--pattern
"packages/core/src/*.ts"` silently pulled in all 35 files under the whole
`core/src` subtree instead of the 15 directly in it. Explicit file lists,
passed as positional arguments, were used for every run below.

| Scope | Files | Clones | Duplicated lines | % |
| --- | --- | --- | --- | --- |
| `packages/core/src` | 15 | 3 | 46 | 1.93% |
| `packages/core/src/adapters` | 2 | 0 | 0 | 0.00% |
| `packages/core/src/covers` | 8 | 1 | 8 | 0.97% |
| `packages/core/src/import` | 2 | 0 | 0 | 0.00% |
| `packages/core/src/metadata` | 8 | 0 | 0 | 0.00% |
| `packages/site/src/shelf` | 24 | 3 | 26 | 0.31% |
| `packages/cli/src` | 3 | 0 | 0 | 0.00% |
| `scripts` | 33 | 5 | 53 | 0.47% |
| **Combined** (single run, union) | 94 | **12** | **133 / 25,999 lines** | **0.51%** |

`sonarjs/no-identical-functions` over the identical eight populations, at
both its default (3 lines) and a 5-line setting: **zero hits in every
scope.** Not a misconfiguration — see §1's synthetic-fixture check.

**Where duplication concentrates**, from reading every one of the 12
clones' actual source (not just the tool's line ranges):

- **`packages/core/src`, 1.93%, is the highest-percentage scope**, but two of
  its three clones are `LibraryBook` (`library.ts`) and `BookRecord`
  (`types.ts`) — the site-facing and domain type declarations — sharing a
  run of `readonly foo?: Type;` field lines because the two types are
  *intentionally* parallel (the adapter boundary this repo's own AGENTS.md
  describes). This is real token overlap and arguably not "duplication" in
  the sense worth a refactor — it is two independent types that happen to
  describe the same book.
- **Six of the twelve are genuine, refactor-worthy logic duplication**:
  `identity.ts`'s `titleMatchScore` and `rankingScore` share their
  guard/coverage-scoring arithmetic almost verbatim; `cover-budget.ts` and
  `measure.ts` define **the same `measureCover` function, byte-for-byte,
  twice**, under the same name, in the same package; `scene.ts` has
  `stopSamplingShadows` and `dirtyEveryMaterial` both containing an
  identical `scene.traverse(...)` material-dirtying loop; `spine-texture.ts`
  has `contrastingInk` and `fade` both re-implementing hex-to-RGB channel
  parsing; `contact-shadow.ts` repeats the "finish a canvas into a
  transparent, non-depth-writing mesh" boilerplate twice; `deploy.ts` has
  `trendRecords` and `windowRecords` both doing the identical
  parse/filter/sort of record names.
- **`scripts/lib/floors.ts`'s one clone (22 lines) is duplication the repo's
  own spec names on purpose**: `unarmedState` (the mutation-score ratchet's
  print helper) and `capUnarmedState` (the complexity-cap ratchet's) share
  most of their formatting logic because
  `docs/spec/complexity-on-the-trend-layer.md` §4 states the cap is
  "the ratchet, mirrored" — a deliberate parallel implementation, not an
  accident.
- **`scripts`'s remaining three clones are one repeated pattern, not
  three**: `smoke-render.ts`'s `checkCoverViewer` reuses the same
  "walk the shelf, click, wait, evaluate a DOM selector" block four times;
  `jscpd` reports every pairwise overlap between the four call sites, which
  inflates the clone *count* relative to the number of distinct patterns —
  worth knowing before reading a raw clone count as "twelve separate
  problems."

---

## 4. False positives — checked against this repo's deliberate near-repetition

`gates/` (38 test files + 4 non-test `.ts` files = 42) is explicitly **not**
one of the eight declared scopes, but the ticket asks this to be checked
before recommending anything, so it was run the same way.

**At `jscpd`'s own defaults, `gates/` produces almost nothing — 4 clones,
37 duplicated lines, 0.47%** — not the flood of hits a directory "full of
structurally similar assertions" might suggest. Reading all four:

1. `absent-only.test.ts` vs. `enrich-idempotence.test.ts`, lines 1–7 —
   **shared import statements** (`node:fs/promises`, `node:os`, `node:path`,
   the same five Vitest named imports).
2–3. `deploy-branch.test.ts` vs. `metrics-freshness.test.ts` — import
   boilerplate, plus a fixture-builder function (`freshNightly`-shaped)
   whose body is dominated by populating a `RunFacts` object literal with the
   same field names, because `RunFacts` is a single shared type both test
   files build a value of.
4. `metrics-freshness.test.ts` against itself — two calls building the same
   fixture shape twice in one file.

**All four are the exact category the ticket named** — structural
repetition forced by a shared import surface or a shared type shape, not
copy-pasted logic — and **all four are import- or fixture-shape driven**,
never an assertion. So at defaults, `jscpd`'s false-positive rate on `gates/`
is high as a *fraction of a very small number of hits* (4/4) but the hits
are too few to matter.

**That changes sharply once the threshold drops.** Re-running `gates/` at
20 tokens / 3 lines — the same loosening applied in §2 — found **119 clones,
605 duplicated lines, 7.71%**, a 30× jump in clone count from the same
threshold change that produced a 5× jump over the source scopes. Sampling
the first fifteen: every one is either an import block or a shared
test-vault-setup call (`enrich-idempotence.test.ts`, `enrich-convergence.test.ts`,
`hand-edited-notes.test.ts` and `enrich-report.test.ts` all build the same
fixture vault the same way). **None sampled was an assertion.** So the
concern the ticket raised is real, but its shape is more specific than
"assertions" — it is **imports and shared fixture-construction
boilerplate**, and it only dominates the picture once the threshold is
lowered past `jscpd`'s own defaults. `stryker.scopes.json`'s own exclusion
entries were not separately tested — that file is JSON, not `.ts`, and sits
outside every declared scope's glob, so no run here ever tokenized it.

`sonarjs/no-identical-functions` found **zero** hits in `gates/` at either
threshold, for the same structural reason as §1: it only matches whole
function bodies, and import statements are not functions, so this specific
false-positive category cannot reach it at all. Its cost for that immunity
is the same one paid in §3 — it also does not catch anything real in
`gates/`, because there is no pair of whole, same-file, token-identical
functions there either.

---

## 5. What this means for choosing a tool (left to #237)

Not a recommendation — that decision belongs to the blocked ticket — but
the facts #237 will need:

- `jscpd` is the only one of the two that can see the repo's actual
  duplication (cross-file, cross-function, fragment-level). `sonarjs`'s rule
  is structurally incapable of finding most of what §3 found, by
  construction, not by threshold tuning.
- `jscpd`'s TypeScript-6 pin is a non-issue — it never touches `typescript`
  or `eslint` — which decouples any future duplication series from
  ADR-0066's TypeScript-7 revisit condition entirely, unlike the complexity
  series.
- `jscpd` needs its own explicit min-tokens/min-lines/mode recorded and
  hashed the way `eslint.config.mjs`'s `complexity` options are, if this
  becomes a series — §2 shows the number is not stable across even one
  step of threshold change, and §4 shows the false-positive shape changes
  qualitatively (from "negligible" to "mostly imports") at the same
  threshold step.
- A `jscpd`-based counter would need either an explicit population rule for
  what to do about import statements (its own flags do not filter them),
  or an accepted, named false-positive rate — the same kind of measured,
  written-down number `docs/spec/complexity-on-the-trend-layer.md` §7
  carries for complexity's own gaming categories.
- The non-recursive-scope glob pitfall in §3 (`jscpd`'s own pattern
  matching, not just `git`'s) means any implementation must build the file
  list the way `scripts/lib/complexity.ts`'s `populationOf` already does,
  rather than handing `jscpd` a glob string directly.
