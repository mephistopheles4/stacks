import type { ViteUserConfig } from 'vitest/config';

/** Vite's plugin type, reached through Vitest, which re-exports Vite's config but not `vite` itself. */
type Plugin = Extract<NonNullable<ViteUserConfig['plugins']>[number], { name: string }>;

/**
 * The resolve conditions the CLI runs with, for every Vitest config here: Node's
 * own, and no `development`.
 *
 * ⚠️ **Vite adds `development` by default, and Vitest passes it to every
 * worker as `--conditions`**, so without this a test loads `micromark`'s `dev/`
 * build while `stacks build` loads its default one. The two differ in what they
 * can print — the development build traces its whole parse, private remainder
 * included, when `DEBUG` names it — so the tests would vouch for a build that
 * never publishes. Measured on #411: without it, `import.meta.resolve('micromark')`
 * inside a test answered `dev/index.js`
 * ([ADR-0107](docs/adr/0107-thoughts-are-read-by-a-commonmark-parser.md), spec §3.1.1).
 *
 * ⚠️ **Removed after resolution, because it cannot be configured away.**
 * Vitest merges its own default conditions into `ssr.resolve.conditions`, and a
 * merge concatenates arrays, so a list set in a config still carried
 * `development|production` into the workers' `execArgv`. Filtering the resolved
 * list is the one place the value Vitest reads can be changed.
 *
 * ⚠️ **One module, imported by both `vitest.config.ts` and
 * `vitest.stryker.config.ts`.** It lived in the first alone at first, and the
 * mutation run's dry run then loaded the development build, whose load check
 * withheld every section and failed G2 before a mutant was tested.
 */
export function cliResolveConditions(): Plugin {
  return {
    name: 'stacks:cli-resolve-conditions',
    configResolved(config) {
      for (const resolve of [config.ssr.resolve, config.environments.ssr?.resolve]) {
        if (resolve?.conditions === undefined) continue;
        resolve.conditions = resolve.conditions.filter(
          (condition) => !/^development(?:\|production)?$/.test(condition),
        );
      }
    },
  };
}
