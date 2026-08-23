# Ticket #230 — does the split signature hold across all eight scopes?

Scratch research on branch `research/230-cognitive`, not intended to merge.
Run: `pnpm exec tsx scripts/research/measure-cognitive.ts` (full output in
`scripts/research/output.txt`, 1105 raw pairs at the bottom of that file).

## Method

`scripts/research/measure-cognitive.ts` runs three ESLint rules in one pass
over the same eight scopes and the same population rule
(`populationOf`/`sourceFiles`, imported unmodified from the committed
counter):

- `complexity` at `max: 0, variant: 'classic'` — the committed counter's exact
  rule and options.
- `sonarjs/cognitive-complexity` at threshold `0` — the same "floor forces
  every function to report" trick, see caveat below.
- `research/joiner`, a throwaway rule that computes *both* rules' own report
  locations for every function node (calling the exact same exported helpers
  `complexity.js` and `S3776/rule.js` call — `astUtils.getFunctionHeadLoc` out
  of ESLint's own source, and `getMainFunctionTokenLocation` out of
  `eslint-plugin-sonarjs`'s source, both required by absolute path) so the two
  rules' independently-located messages can be joined by exact position
  equality instead of a heuristic. The two rules report a function at
  different tokens (e.g. a class-field arrow function: `complexity` reports at
  the arrow's parameter paren, `cognitive-complexity` reports at the `=>`
  token), so naive line/column matching is unsound for that shape.

**Caveats found and handled:**

- `sonarjs/cognitive-complexity`'s floor is 0, not 1. `complexity` always
  reports (cyclomatic complexity is never below 1); cognitive complexity for
  straight-line code is 0, and the rule only reports when
  `complexityAmount > threshold` — so at threshold 0 a zero-cognitive function
  is silently absent from the report. Treated as cognitive `0`, not missing.
- Class field initializers and static blocks (9 of them) have no cognitive
  counterpart at all: `sonarjs/cognitive-complexity` hooks the `:function`
  selector, which never matches `PropertyDefinition` or `StaticBlock`.
  Excluded from every cognitive comparison below, counted separately.
- `sonarjs/cognitive-complexity`'s default threshold is **15** (`S3776/rule.js`,
  `DEFAULT_THRESHOLD = 15`); it had to be set to `0` to get full reporting,
  mirroring how the committed `complexity` rule is used as an inventory rather
  than a lint gate.
- This script's own directory (`scripts/research/`) is excluded from the
  `scripts` scope's population — its glob is `scripts/**/*.ts` and would
  otherwise sweep this throwaway tool's own functions into the count.

Spot-checked against #196's spike numbers before trusting the join:
`parseNote` → CC 12 / cognitive 7, `asPrivate` → CC 11 / cognitive 4. Both
reproduce exactly.

## Results

Population: 1114 functions counted by `complexity` across the eight scopes; 9
excluded (implicit functions, no cognitive counterpart); **1105 scored pairs**.

**Overall correlation: Pearson r = 0.9159.** Strong positive relationship, not
a wash — but not a rescaling either (see inversions below).

### Per-scope

| scope | n | inversions | rate | r |
|---|---|---|---|---|
| packages/core/src | 84 | 4 | 4.8% | 0.935 |
| packages/core/src/adapters | 23 | 2 | 8.7% | 0.984 |
| packages/core/src/covers | 28 | 1 | 3.6% | 0.944 |
| packages/core/src/import | 22 | 0 | 0.0% | 0.979 |
| packages/core/src/metadata | 87 | 4 | 4.6% | 0.899 |
| packages/site/src/shelf | 385 | 9 | 2.3% | 0.856 |
| packages/cli/src | 26 | 1 | 3.8% | 0.938 |
| scripts | 450 | 33 | 7.3% | 0.953 |

### (a) Worst function per scope, by each measure

7 of 8 scopes agree — the same function tops both lists. One disagrees:
`packages/core/src/import` — cyclomatic-worst is `toAudibleBook` (CC 14 /
cognitive 11), cognitive-worst is `importBooks` (CC 12 / cognitive 12).

### (b) Inversions (cognitive > cyclomatic)

**54 of 1105 (4.9%)** — occurring in 7 of the 8 scopes (all but
`packages/core/src/import`, which has none). Not a pure monotonic discount:
some inversions are large, e.g. `enrichBook` (`packages/core/src/enrich.ts`,
CC 41 / cognitive 75, +34) and `inspectPublicBuild`
(`scripts/lib/public-build.ts`, CC 57 / cognitive 80, +23) — both large async
orchestration functions where nested `if`/`try`/`await` chains compound under
the cognitive model's nesting penalty faster than cyclomatic's flat +1 per
branch.

### (c) Correlation and outliers

Biggest discounts (cyclomatic far above cognitive): an arrow function in
`packages/site/src/shelf/diagnostics.ts` (CC 27 / cognitive 7, diff −20);
`resolveSettings` in `packages/site/src/shelf/shelf-settings.ts` (CC 17 /
cognitive **0**, diff −17); `materialOf` in
`packages/site/src/shelf/scene.ts` (CC 8 / cognitive 0, diff −8);
`asPrivate` (CC 11 / cognitive 4, diff −7, matches the spike).
`resolveSettings` was inspected directly: its body is one big object-spread
merge, with `?.` optional-chaining on every nested patch field — ESLint's
`complexity` counts each optional-chain member/call as +1 (17 of them, hence
CC 17), while cognitive complexity's spec does not count optional chaining as
branching or nesting at all, hence cognitive 0. A genuine construct-level
divergence, not a rescaling artifact.

Biggest premiums (cognitive far above cyclomatic): `enrichBook` (+34, above),
`inspectPublicBuild` (+23, above), `report` in `scripts/smoke-render.ts`
(CC 36 / cognitive 51, +15), `declarationFaults` in
`scripts/lib/scope-check.ts` (CC 19 / cognitive 31, +12).

## Answer

The split signature from #196's two-function spike **holds as a population
property, not merely as those two points**: strong correlation (r = 0.92
overall, 0.86–0.98 per scope) coexists with real, scope-spanning divergence —
7 of 8 scopes contain at least one inversion, 1 of 8 scopes disagrees on the
single worst function, and the outliers in both directions are large and
mechanistically explained (nesting-heavy async control flow inflates
cognitive above cyclomatic; optional-chaining-heavy flat merges deflate it,
in one case to exactly zero against a cyclomatic complexity of 17). A pure
monotonic rescaling of one measure would not produce inversions of this size
or a construct (`resolveSettings`) cognitive complexity scores as
maximally simple and cyclomatic complexity scores as its own scope's
near-highest.

Not answered here, and out of scope per the ticket: whether to adopt
`sonarjs/cognitive-complexity` as a series. The vendor-lock objection stands
regardless of these numbers.
