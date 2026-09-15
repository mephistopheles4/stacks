/**
 * The linter's config. **This is not the counter.**
 *
 * `eslint.config.mjs` holds one rule at a threshold nothing can satisfy, so
 * that its report is a population rather than a verdict. This file holds the
 * verdict: a pull request carrying a floating promise, an unhandled union case
 * or an unsafe member access on `any` turns the build red. `pnpm lint` loads
 * this file with `--config`, which *replaces* the config lookup rather than
 * adding to it, so neither file ever sees the other's rules.
 *
 * ⚠️ **Two files, and the reason is measured rather than tidy.** Flat config
 * merges every config object whose `files` glob matches, so `projectService`
 * set here would apply to every rule running on that file — the counter's
 * included. `scripts/lib/complexity.ts` constructs `new ESLint({ cwd })` with no
 * `overrideConfigFile`, so it takes whatever the one file resolves to and could
 * not opt out. Measured on #233: the counter alone is 1.5s, the counter plus
 * these rules with no project is 2.2s, and the counter plus these rules with
 * `projectService` is 7.3s. **88 extra rules cost 0.7 seconds; the one option
 * costs 5.1.** The cost is the TypeScript program, which is built before any
 * rule runs and which `complexity` reads none of — it counts branches in the
 * syntax tree. See ADR-0076 and `docs/spec/static-analysis-and-style.md` §6
 * step 5.
 *
 * ⚠️ **The type information is the point, and it is also the debt.** Every
 * verdict this file reaches moves with the TypeScript version, which is the
 * property [ADR-0070](docs/adr/0070-the-type-checker-stays-off-until-the-compiler-is-hashed.md)
 * refuses for Stryker's type checker. That refusal is not overridden here — its
 * condition is a hashing change and nothing here meets it. The difference is
 * that a lint verdict is read by a human at merge and a mutation score is
 * compared against a stored floor, so a verdict that moves costs a re-read and
 * a score that moves costs a false refusal. ADR-0076 records the tension rather
 * than leaving the two documents silently disagreeing.
 *
 * ⚠️ **One rule set, every file, tests included.** No split, no exception, no
 * allowlist. Measured on #233: tuned, test code held 13 findings against
 * product code's 23, and 8 of the 13 were one annotation copied into four
 * files, fixed once by `spyOnWarn()` in `packages/core/src/test-support.ts`.
 * The rule that would genuinely have made tests hard was `require-await`, and
 * it is off below. **`gates/` is 38 test files and it is the code that holds
 * every other rule** — exempting it would exempt the enforcement layer from the
 * enforcement.
 *
 * ⚠️ **Every count in this comment block is a measurement of a tree, and the
 * tree moves.** They are here because a rule option without its evidence is a
 * preference, and nothing gates this file. Each one names where it was taken;
 * if you re-measure and get a different number, correct the figure and keep the
 * provenance — do not delete the sentence.
 *
 * ⚠️ **`--fix` is not what makes the remedy reachable, and that reasoning was
 * inherited from a different candidate.** Of the **33** findings this set
 * reported on arrival, **8 auto-fixed, 2 carried a suggestion and 23 had no fix
 * at all**. The flag ships for the 8; what makes the rest reachable is the
 * rule's own message naming the file, the line and the problem. (#233 measured
 * 36 / 8 / 5 / 23 at `c8ba4ee`; the tree moved before this landed. The two
 * numbers its argument rests on — 8 fixable and 23 unfixable — did not.)
 *
 * ⚠️ **Nothing gates this file.** Each tuned option below is a place a rule can
 * be weakened later, and no gate in this repo reads a lint config. Recorded on
 * #233 as debt 5, and not solved — a comment is what stands in for the gate, so
 * do not remove a reason without removing the option it justifies.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Build output, caches and captured fixtures. `fixtures/` is excluded on
    // fidelity rather than breakage — a recorded provider response and a vault
    // note the owner hand-edited are both artifacts this repo did not author,
    // and neither holds TypeScript in any case.
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      'coverage/**',
      'artifacts/**',
      'reports/**',
      '.cache/**',
      'fixtures/**',
      'metrics/**',
      'node_modules/**',
    ],
  },
  {
    // `.ts` and nothing else. `.astro` files are unreachable here for the same
    // reason they are unreachable to `pnpm typecheck` — see "Site code layout"
    // in AGENTS.md — and the `.mjs` config files carry no logic worth a type.
    files: ['**/*.ts'],

    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],

    languageOptions: {
      // `projectService` rather than a `project` list: it asks TypeScript for
      // the program that already covers the file, so a new directory does not
      // need a line here to be linted. The root `tsconfig.json` is what decides
      // coverage, which is the same file `pnpm typecheck` reads.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      /*
       * The four tuned options. **Each one is here because the rule at its
       * default flagged deliberate, documented repository idiom and named no
       * defect** — measured seven times over the tree on #233, which took the
       * report from 75 findings to 36 and removed none of the eleven real ones.
       * A linter that flags the house style trains people to ignore it.
       */

      // 37 of its 38 findings were async test helpers that await nothing —
      // a test helper is declared async because its callers await it, not
      // because it has something to wait for.
      '@typescript-eslint/require-await': 'off',

      // The repo already marks an intentionally unused binding with `_`, and
      // the rule honours that convention only when told to. Three `_dropped`
      // bindings were the whole finding.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // `FRONTMATTER_BLOCK` in `packages/core/src/frontmatter.ts` matches an
      // optional U+FEFF byte-order mark, so a note saved with one still parses.
      // The character is in the regex on purpose, in the parser that enforces
      // invariant 2 by construction.
      'no-irregular-whitespace': ['error', { skipRegExps: true }],

      // All three findings sat on a deliberate `default:` clause — twice in
      // `precedence.ts`, once in `publish.ts`, one of them with a comment
      // explaining why it is written that way. The rule found no gap in the
      // merge precedence contract.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    /*
     * The two rules turned *on*, and the only ones. **Every entry above loosens
     * a rule; these are opt-ins no preset carries**, so they sit in an object of
     * their own rather than under a comment that counts four tunings.
     *
     * They protect the rule G6 (`site-core-imports`) holds: the site may only
     * `import type` from `@stacks/core`. A *value* import drags `node:fs` and
     * sharp into the browser bundle and **the shelf silently never boots** — no
     * build error, a blank page that compiled cleanly.
     *
     * ⚠️ **Both or neither.** `no-restricted-imports` with `allowTypeImports`
     * *admits* `import { type Library } from '@stacks/core'`, which is the very
     * case G6 exists for: the inline modifier erases the bindings and leaves the
     * statement standing, so the module is still pulled in for its side effects.
     * `no-import-type-side-effects` is what catches it, with a `--fix`. Measured
     * on #245 against the current tree, one probe file per documented case.
     *
     * ⚠️ **Scoped to the site, both of them.** The restriction must be: the CLI
     * value-imports `@stacks/core` at runtime, correctly, and a tree-wide rule
     * reddens it. The side-effects rule found nothing anywhere on #245 and could
     * run tree-wide green, but the hazard it guards only exists where a bundler
     * builds for a browser — elsewhere it is a style opinion, and adopting one is
     * a different decision.
     *
     * ⚠️ **G6 is kept, and this is not a replacement for it.** The owner decided
     * *keep both* on #245: the two fail independently. G6 survives an edit to
     * this file, which nothing gates; this pair survives a regex a Prettier run
     * breaks. G6 also reaches what these do not — a dynamic `import()`, and
     * whether a subpath is actually pure, which `paths` matches by name only.
     */
    files: ['packages/site/**/*.ts'],

    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@stacks/core',
              allowTypeImports: true,
              message:
                'The package root drags node:fs and sharp into the browser bundle and the shelf ' +
                'silently never boots. Use a statement-level `import type`, or import the value ' +
                'from a subpath that imports nothing, such as @stacks/core/shelf-order. See G6.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
);
