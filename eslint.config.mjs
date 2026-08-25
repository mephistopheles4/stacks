/**
 * The counter's config. **This is not a linter.**
 *
 * One rule is enabled, and it is enabled at a threshold nothing can satisfy:
 * `complexity` at `max: 0` reports *every* function, because the rule's own
 * floor is 1. That turns a lint rule into an inventory — the report is the
 * population, and the number is in the message.
 *
 * Nothing else is on, and nothing else should be — but not for the reason this
 * paragraph used to give. It said a second rule would put findings in a report
 * `scripts/lib/complexity.ts` would have to filter, and that a filter is a place
 * for a count to go quietly wrong. That filter exists, it is on `ruleId`, and it
 * is exact, so it forbade nothing. The real reason is narrower: this file states
 * what the complexity number means and its options are hashed onto the record.
 * The linter's rules live in `eslint.lint.config.mjs`, so the file people edit
 * when a rule annoys them is not the file that defines the count.
 *
 * ⚠️ **That paragraph used to claim the filter did not exist. It does** — at
 * `scripts/lib/complexity.ts`, which skips every message whose `ruleId` is not
 * `complexity`. So the argument above is about not *needing* one, which is a
 * weaker and truer thing: the filter is there, it works, and the discipline is
 * that no count should have to depend on it.
 *
 * ⚠️ **The parser is load-bearing, not a preference.** Without it ESLint fails
 * on TypeScript syntax before it counts anything — and the failure arrives as a
 * parse error per file, so a missing parser reads as *this repo has no
 * functions* rather than as a crash. `@typescript-eslint/parser` is named here
 * for that reason and no other. No `project` is set: `complexity` is a
 * syntactic rule, so type information would cost seconds per population and
 * change no count.
 *
 * ⚠️ **This file is an input to the number.** The rule options below, together
 * with the exact `eslint` and `@typescript-eslint/parser` versions, are what the
 * count means — the way `timeoutMS` is an input to the mutation score. They are
 * pinned exact in `package.json`, and the fixture hash that carries them onto
 * the record **exists** — `fixtureHashOf` in `scripts/lib/floors.ts`, stamped
 * on every run as `fixture_hash`. ⚠️ It now covers `eslint.cognitive.mjs` too:
 * one hash over both counting rules, so a `sonarjs` upgrade refuses a
 * *cyclomatic* cap comparison as well. What still does not exist is an **armed**
 * cap for it to refuse; every entry in `stryker.floors.json` ships `unarmed`.
 * See ADR-0067, ADR-0073 and `docs/spec/complexity-on-the-trend-layer.md` §§3-4.
 *
 * ⚠️ **The options live here and nowhere else, and the library reads them back
 * off the resolved config rather than keeping its own copy.** A second literal
 * in TypeScript would be the one thing the hash cannot see: edit this file to
 * `max: 5` and a constant elsewhere would go on hashing the old value, so every
 * cap would be compared across two different counting rules and nothing would
 * say so. It is `RunFacts.configHash`'s rule applied one layer over — *stamp the
 * configuration you actually loaded, never the one you were handed.*
 *
 * ⚠️ **`eslint-plugin-sonarjs` is enabled now, and not here.** This paragraph
 * used to say it was *"installed and deliberately not enabled … kept as fog in
 * the spec's §8 until the split signature proves common"*. **The split
 * signature was measured and it holds** — 1105 scored pairs, Pearson r 0.9159,
 * and 54 places where cognitive complexity exceeds cyclomatic across 7 of 8
 * scopes — so the condition that fog set is discharged, and the question is
 * answered rather than open.
 *
 * The answer: cognitive complexity is published as **four series beside the
 * cyclomatic four**, never as a replacement, and its rule lives in
 * **`eslint.cognitive.mjs`** — a config of its own. Not here, because this file
 * holds one rule on purpose and the paragraph above is why. See
 * [ADR-0073](docs/adr/0073-cognitive-complexity-is-published-beside-cyclomatic.md),
 * [#234](https://github.com/mephistopheles4/stacks/issues/234) and
 * `docs/spec/static-analysis-and-style.md` §5.
 */
import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser },
    rules: { complexity: ['warn', { max: 0, variant: 'classic' }] },
  },
];
