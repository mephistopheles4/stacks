/**
 * The **second** counter's config. **This is not a linter either.**
 *
 * `eslint.config.mjs`'s twin, holding one rule for the same reason that one
 * does — and living in a file of its own rather than as a second rule beside
 * it, which is the point worth reading before editing either.
 *
 * ⚠️ **A second rule in the counter's config would be a second rule in the
 * counter's report.** `scripts/lib/complexity.ts` would then have to filter it
 * out, and a filter is a place for a count to go quietly wrong. Two configs,
 * two reports, two counters, no filter — which is also what keeps each
 * counter's run time a fact about its own rule.
 *
 * ⚠️ **`sonarjs/cognitive-complexity` is enabled at `0`, and the threshold is
 * an input to the number rather than a preference.** The rule reports only when
 * a function scores **above** it, so `0` is the lowest setting that reports
 * anything at all — and it still does not report everything: a function scoring
 * zero is **silently absent**, because `0 > 0` is false. That is the whole
 * reason this counter cannot derive its own denominator and takes one from the
 * cyclomatic population instead. See `scripts/lib/cognitive.ts`.
 *
 * ⚠️ **The parser is load-bearing, not a preference**, for exactly the reason
 * `eslint.config.mjs` gives: without it ESLint fails on TypeScript syntax
 * before it counts anything, and the failure arrives as a parse error per file
 * — which reads as *this repo has no functions* rather than as a crash. No
 * `project` is set: cognitive complexity is a syntactic measure, so type
 * information would cost seconds per population and change no count.
 *
 * ⚠️ **This file is an input to the number**, as its twin is. The rule options
 * below, together with the exact `eslint`, `@typescript-eslint/parser` and
 * `eslint-plugin-sonarjs` versions, are what the cognitive counts mean — and
 * all of it is folded into the one `fixtureHash`, per
 * [#234](https://github.com/mephistopheles4/stacks/issues/234) §2. The options
 * are read back off the resolved config rather than copied into TypeScript, so
 * editing the threshold here cannot leave a constant elsewhere hashing the old
 * one. `RunFacts.configHash`'s rule, one layer over.
 *
 * ⚠️ **Not auto-discovered, and the filename is why.** ESLint claims
 * `eslint.config.{js,mjs,cjs,ts,mts,cts}` and nothing else, so this name can
 * never be picked up by a bare `eslint` invocation and silently become the
 * repository's rule set. It is loaded explicitly, through
 * `overrideConfigFile`, by the one caller that wants it.
 */
import parser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser },
    plugins: { sonarjs },
    rules: { 'sonarjs/cognitive-complexity': ['warn', 0] },
  },
];
