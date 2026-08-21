# Complexity tooling for TypeScript 7

Research for: adding a per-function cyclomatic (and possibly cognitive)
complexity number, rolled up per scope, emitted nightly alongside
`pnpm metrics:emit`. Nothing here is implemented.

**Headline finding: the repo's pinned `typescript@7.0.2` blocks every
ESLint-based candidate outright, and reshapes the hand-rolled option into
something that no longer resembles "zero-dependency and a few dozen lines."**
TypeScript 7 shipped a native Go compiler with no stable classic compiler API;
`@typescript-eslint/parser@8.67.0`'s own npm manifest declares
`peerDependencies.typescript: ">=4.8.4 <6.1.0"` — 7.0.2 is outside that range,
so `pnpm add` would need `--force` or an override just to install
([npm registry](https://registry.npmjs.org/@typescript-eslint%2Fparser/8.67.0)).
`eslint-plugin-sonarjs@4.2.0` independently pins its own `typescript` dependency
to `>=5 <6.1.0` ([npm registry](https://registry.npmjs.org/eslint-plugin-sonarjs/4.2.0)).
Both facts come straight from the published manifests, not from secondary
commentary.

## The candidates

| Candidate | Maintained (2025–2026)? | Dependency cost | TS 7.0.2 compatible? | Granularity |
| --- | --- | --- | --- | --- |
| Hand-rolled walk, `typescript` npm package | N/A — already a devDependency | Zero *new* deps, but the walk itself must target a different, larger API surface (see below) | **Yes, but only via the new `unstable/sync` IPC client**, not the classic `ts.createSourceFile`/`ts.forEachChild` free functions | Per function, arbitrary rollup |
| ESLint core `complexity` rule + `@typescript-eslint/parser` | Yes — ESLint 10.8.1 latest ([registry](https://registry.npmjs.org/eslint)); typescript-eslint 8.67.0 latest | 3 new deps minimum (eslint, @typescript-eslint/parser, a config) | **No** — parser's peerDependency excludes 7.x | Per function (rule fires per function; needs `max:0` trick for a full report) |
| `eslint-plugin-sonarjs` (`cognitive-complexity`) | Yes — 4.2.0 latest | Adds to the ESLint stack above, plus its own `typescript` pin | **No** — same TS-version wall, independently pinned | Per function |
| `fta-cli` | Yes, very actively — 3.0.1 published **2026-08-10** ([registry](https://registry.npmjs.org/fta-cli)), i.e. 11 days before this research | One new dep (Rust binary via npm, like the repo's existing `esbuild`/`sharp` pattern) | **Yes** — parses with `swc`, never imports the `typescript` package | **File only, not per function** |
| `typhonjs-escomplex` | No — latest npm publish 7 years ago, GitHub tracker inactive, TS support was planned via Babylon 7 and never shipped ([libraries.io](https://libraries.io/npm/typhonjs-escomplex), [Snyk](https://security.snyk.io/package/npm/typhonjs-escomplex)) | — | Unknown/irrelevant | — |
| `ts-complex` | No — 1.0.0, published 2018-05-28, never updated ([npm registry](https://registry.npmjs.org/ts-complex)) | — | Unlikely (predates modern TS entirely) | Per function (claimed) |
| `cyclomatic-complexity` (npm) | Marginal — last publish 2024-10-05 ([npm registry](https://registry.npmjs.org/cyclomatic-complexity)) | One dep | Untested here; low adoption, not evaluated further | Per function (claimed) |

## What each tool counts as a branch

Two tools give two numbers for the same function, so the counting rule is the
part worth pinning down before choosing one.

**ESLint core `complexity` rule** (source:
[`lib/rules/complexity.js`](https://raw.githubusercontent.com/eslint/eslint/main/lib/rules/complexity.js)).
Starts at 1, increments on: `IfStatement`, `ConditionalExpression` (`?:`),
`LogicalExpression` (`&&`, `||`, and — because `??` parses as a
`LogicalExpression` with a nullish-coalescing operator in the ESTree TS AST —
`??` too), `CatchClause`, `ForStatement`/`ForInStatement`/`ForOfStatement`,
`WhileStatement`/`DoWhileStatement`, logical assignment (`&&=`, `||=`, `??=`),
and — TypeScript-specific — optional chaining: any `MemberExpression` or
`CallExpression` with `optional: true` (i.e. every `?.` in the chain, not just
the first). It has a `variant` option: `"classic"` counts every `SwitchCase`
with a test; `"modified"` counts the `SwitchStatement` once regardless of case
count. Default parameters are **not** counted (a default value is not a branch
in this rule's model).

**SonarJS `cognitive-complexity`** (source:
[`src/rules/cognitive-complexity.ts`](https://github.com/SonarSource/eslint-plugin-sonarjs/blob/master/src/rules/cognitive-complexity.ts)).
A different metric by design, not a cyclomatic-complexity variant: structural
constructs (`if`/`else`, loops, `switch`, `catch`, ternary, labelled
`break`/`continue`) add `nestingLevel + 1`, so identical branches score higher
the deeper they're nested — the property cyclomatic complexity deliberately
lacks. `&&`/`||` add flat +1 (not nesting-weighted), except inside a
default-value pattern like `a || literal`, which is explicitly exempted; `??`
in the same default-value shape is exempted the same way. No special
optional-chaining handling. `else if` chains don't double-count. This is the
tool to reach for if "cognitive" in the ask means Sonar's actual metric rather
than a synonym for cyclomatic.

**Hand-rolled walk (this repo's own code, empirically verified below).**
Whatever you write it to count — that is both the appeal and the risk of the
zero-dependency option. The natural McCabe rule — start at 1, +1 per
`IfStatement`, `ForStatement`/`ForInStatement`/`ForOfStatement`,
`WhileStatement`, `DoStatement`, `CaseClause`, `CatchClause`,
`ConditionalExpression`, and each `&&`/`||`/`??` `BinaryExpression` — is what
the experiment below implements, in ~90 lines. Optional chaining (`?.`) and
default parameters were deliberately left uncounted to match ESLint's
"defaults aren't branches" stance; that is a choice this project would need to
write down, not a fact any tool hands you for free.

**`fta-cli`.** Its cyclomatic-complexity figure is one line item inside the
composite "FTA Score," computed by `swc`-based static analysis alongside
Halstead volume and line count — but it is reported **only per file**, not
per function ([fta docs](https://ftaproject.dev/docs/getting-started),
confirmed independently against the project README on GitHub). For a
per-function, per-scope rollup this is disqualifying on its own, TS7
compatibility notwithstanding.

## TypeScript 7 compatibility — the crucial fact, verified two ways

**1. Documentary evidence.** TypeScript 7.0 ships `tsc`/`tsgo` as a Go-native
binary with **no importable classic compiler API** — the stable programmatic
surface (`ts.createProgram`, `ts.forEachChild`, etc.) that
`@typescript-eslint/parser` reads type information through does not exist in
7.0.x; it's targeted for 7.1, expected autumn 2026
([typescript-eslint issue #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940),
still open, maintainer Josh Goldberg: *"tsgo is not stable and is many months
away... It won't likely be the primary stable version of TypeScript within the
next ~1-2 major versions of typescript-eslint"*). The npm manifests confirm
this isn't merely an untested combination but an actively enforced
incompatibility: both `@typescript-eslint/parser` and `eslint-plugin-sonarjs`
pin `typescript` ranges that stop below 6.1.0.

**2. Direct inspection of the installed package.** I fetched
`typescript@7.0.2` into the scratchpad (the exact version pinned in this
repo's `pnpm-lock.yaml`, confirmed by
`grep -n "typescript@7.0.2" pnpm-lock.yaml`) and read its `package.json`
`exports` map. The root import (`"."`) resolves only to `./lib/version.cjs` —
a two-line file exporting a version string. There is **no default export with
`createSourceFile`, `forEachChild`, or `SyntaxKind`.** What does exist:

- `typescript/unstable/ast` (`dist/ast/index.js`) — the classic AST *shapes*
  and type guards (`isIfStatement`, `isBinaryExpression`, `isCatchClause`, …)
  and, critically, `forEachChild` — but now as a **method on `Node`**
  (`node.forEachChild(visitor)`), not the old free function
  `ts.forEachChild(node, visitor)`.
- `typescript/unstable/sync` (`dist/api/sync/api.js`) — an `API` class that,
  on construction, **spawns the bundled native `tsc.exe` as a subprocess**
  (`args: ["--api", "--cwd", cwd]`, confirmed by reading
  `dist/api/sync/client.js`) and talks to it over a msgpack-encoded RPC
  channel. This is the only path to a populated `SourceFile` — there is no
  local, in-process `createSourceFile(text)` shipped anywhere in the package.
  Getting a `SourceFile` means: open a `tsconfig.json`-rooted project via
  `api.updateSnapshot({ openFiles: [...] })`, then
  `project.program.getSourceFile(fileName)`.

So "hand-rolled using the TypeScript compiler API, already a dependency" is
**true but not the API most people mean by that phrase**. It's no longer a
pure, synchronous, in-process string→AST call; it's a client to a spawned
native process, with a project (tsconfig) as the unit of work rather than a
bare string. That changes both the "genuinely zero-dep" and the "roughly how
many lines" parts of the brief's framing — the walk itself is small, but
project setup and process lifecycle are new surface area that didn't exist
under TS 5/6.

## The experiment: does it actually work, and what number does it give?

I installed `typescript@7.0.2` in the scratchpad (not the repo — no
`node_modules` exists in this worktree, so nothing in the repo was touched),
copied `packages/core/src/frontmatter.ts` (311 lines, real parsing logic with
plenty of branches) into a scratch project with a minimal `tsconfig.json`, and
wrote a ~90-line walker using `typescript/unstable/sync` and
`typescript/unstable/ast`. It:

1. Spawns the API against the scratch project's `tsconfig.json`.
2. Opens the file, gets its `SourceFile` via `project.program.getSourceFile`.
3. Walks with `node.forEachChild`, using the `is*` type guards to detect
   `IfStatement`, `ForStatement`/`ForInStatement`/`ForOfStatement`,
   `WhileStatement`, `DoStatement`, `CaseClause`, `CatchClause`,
   `ConditionalExpression`, and `&&`/`||`/`??` `BinaryExpression`s.
4. Recurses into nested function-likes (`FunctionDeclaration`,
   `FunctionExpression`, `ArrowFunction`, `MethodDeclaration`) as separate
   scopes, McCabe-style (start at 1 per function).

**It worked on the first successful run**, against the real file, on the
pinned TS 7.0.2. Output (15 functions found):

| Function | Complexity |
| --- | --- |
| `parseNote` | 11 |
| `asPrivate` | 11 |
| `asBoolean` | 6 |
| `asString`, `asDate`, `asRating` | 5 each |
| `readContributorIds`, `asPositiveInt`, `asHexColour` | 4 each |
| `readTags`, `asOrder` | 3 each |
| `asCoverSource`, `asBinding`, `readStatus` | 2 each |
| one anonymous callback | 1 |

`parseNote` and `asPrivate` (the fail-closed `private:` parser AGENTS.md calls
out) topping the list is a plausible result — both are documented as handling
many cases.

## Cost of a run

Single-file run (cold spawn of the native binary + one file):
**~210ms** wall clock (`Measure-Command` around `node experiment.mjs`).
Batched — 20 real files from `packages/core/src` opened in **one** API
session (one spawn, `updateSnapshot({ openFiles: [...20 files] })`, then 20
`getSourceFile` calls): **69ms total** — 63.5ms is the one-time spawn +
project load, and the 20 `getSourceFile` calls cost 5.4ms combined
(~0.27ms/file). Extrapolating linearly to ~150 files: roughly
**60ms spawn + ~40ms parsing ≈ 100ms**, plus whatever the JS-side complexity
walk adds (negligible — it's plain tree traversal). **This is a
sub-second job**, not the "minutes" the brief worried about, provided the
walker opens every file in a single API session rather than spawning a fresh
process per file (spawning per file would cost ~60ms × 150 ≈ 9s — still fine,
but ten times slower for no reason).

`fta-cli` advertises up to 1,600 files/second via its own Rust/swc pipeline,
consistent with this order of magnitude, though it wasn't run here since its
file-only granularity already disqualifies it for this brief.

No network access is required for either approach: the hand-rolled walk only
touches the already-installed `typescript` package and local files; `fta-cli`
fetches its platform binary at `pnpm install` time the same way `esbuild` and
`sharp` already do in this repo (`allowBuilds` in `pnpm-workspace.yaml`), not
at analysis time.

## Recommendation

**Hand-roll it against `typescript/unstable/{sync,ast}`, not any
ESLint-based tool.** The ESLint path (core `complexity`, or
`eslint-plugin-sonarjs` for cognitive complexity) is not a "maybe" — it is
blocked at `pnpm install` by two independently-pinned `typescript` peer
ranges, and unblocking it means pinning a second, older TypeScript just for
linting (the "install `@typescript/typescript6` alongside" workaround the
ecosystem is using elsewhere), which contradicts this repo's one-pinned-
compiler posture and would need its own ADR to justify. `fta-cli` is TS7-safe
and fast, but reports complexity per file only, not per function — it does
not answer the actual ask.

The hand-rolled walk is real work, more than "a few dozen lines against a
free function," because TS 7 replaced the free function with a spawned
process and a project-shaped unit of work. Budget for: a shared, long-lived
`API` instance across the whole `metrics:emit` run (not one per file), a
`tsconfig.json` reference — the repo's own package tsconfigs are the natural
root — and an explicit written-down counting rule (which node kinds, whether
`?.` counts, whether default parameters count) so the number means the same
thing release to release. That rule belongs in an ADR the moment it's chosen,
per this repo's own "record a decision the brief left open" convention.
Cognitive complexity, if wanted later, is a second, separately-defined walk
(SonarJS's nesting-weighted model above is a reasonable one to imitate) rather
than a flag on the same number — the two metrics measure different things by
design.

## Sources

- [`typescript@7.0.2` on npm registry](https://registry.npmjs.org/typescript) — version confirmed against this repo's `pnpm-lock.yaml`
- Installed `typescript@7.0.2` package contents, inspected directly in the scratchpad: `package.json` `exports` map, `dist/ast/*.d.ts`, `dist/api/sync/*.d.ts`, `dist/api/sync/client.js`
- [`@typescript-eslint/parser@8.67.0` manifest, npm registry](https://registry.npmjs.org/@typescript-eslint%2Fparser/8.67.0) — `peerDependencies.typescript: ">=4.8.4 <6.1.0"`
- [`eslint-plugin-sonarjs@4.2.0` manifest, npm registry](https://registry.npmjs.org/eslint-plugin-sonarjs/4.2.0) — `dependencies.typescript: ">=5 <6.1.0"`
- [typescript-eslint issue #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) — "Use TS 7 (tsgo) for type information," open, maintainer comment on timeline
- [ESLint `complexity` rule source](https://raw.githubusercontent.com/eslint/eslint/main/lib/rules/complexity.js)
- [SonarJS `cognitive-complexity` rule source](https://github.com/SonarSource/eslint-plugin-sonarjs/blob/master/src/rules/cognitive-complexity.ts)
- [`fta-cli` on npm registry](https://registry.npmjs.org/fta-cli) — 3.0.1, published 2026-08-10
- [FTA docs](https://ftaproject.dev/docs/getting-started) and [FTA GitHub repo](https://github.com/sgb-io/fta)
- [`typhonjs-escomplex` on libraries.io](https://libraries.io/npm/typhonjs-escomplex) / [Snyk](https://security.snyk.io/package/npm/typhonjs-escomplex) — inactive
- [`ts-complex` on npm registry](https://registry.npmjs.org/ts-complex) — 1.0.0, 2018-05-28, unmaintained
- [`cyclomatic-complexity` on npm registry](https://registry.npmjs.org/cyclomatic-complexity) — 1.2.5, 2024-10-05
- [`eslint` on npm registry](https://registry.npmjs.org/eslint) — 10.8.1 latest, for context on the ESLint-path dependency chain
- Local experiment: `experiment.mjs` and `experiment-batch.mjs` run against `packages/core/src/frontmatter.ts` and 20 files from `packages/core/src`, in the scratchpad, using the repo-pinned `typescript@7.0.2` — not committed (scratchpad-only per task constraints)
