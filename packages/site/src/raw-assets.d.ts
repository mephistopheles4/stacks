/**
 * `import … from './x.svg?raw'` — Vite's raw loader, as a type.
 *
 * Astro ships this in `astro/client`, which `packages/site/tsconfig.json` picks
 * up. The **root** `tsconfig.json` also compiles every `.ts` under
 * `packages/site/src`, with `types: ["node"]` and nothing else — and that is the
 * config `pnpm typecheck` and `pnpm test` use. So without this declaration the
 * import is fine in the editor and in `astro build`, and fails in the two
 * commands that actually gate a change.
 *
 * Declared here rather than by adding `astro/client` to the root config, which
 * would pull DOM and Vite ambient types over the CLI and core packages as well.
 */
declare module '*.svg?raw' {
  const contents: string;
  export default contents;
}
