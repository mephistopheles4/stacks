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
 * pinned exact in `package.json` today; the fixture hash that is to carry them
 * onto the record, and the cap that will refuse a record stamped under a
 * different rule, land with the cap and **do not exist yet**. See ADR-0067 and
 * `docs/spec/complexity-on-the-trend-layer.md` §§3-4.
 *
 * ⚠️ **The options live here and nowhere else, and the library reads them back
 * off the resolved config rather than keeping its own copy.** A second literal
 * in TypeScript would be the one thing the hash cannot see: edit this file to
 * `max: 5` and a constant elsewhere would go on hashing the old value, so every
 * cap would be compared across two different counting rules and nothing would
 * say so. It is `RunFacts.configHash`'s rule applied one layer over — *stamp the
 * configuration you actually loaded, never the one you were handed.*
 *
 * `eslint-plugin-sonarjs` is installed and deliberately **not enabled**.
 * Cognitive complexity is one vendor's unreplicated measure, kept as fog in the
 * spec's §8 until the split signature proves common.
 */
import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser },
    rules: { complexity: ['warn', { max: 0, variant: 'classic' }] },
  },
];
