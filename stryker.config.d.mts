/**
 * `import config from '../stryker.config.mjs'` — the one field a gate reads.
 *
 * G38 (`mutation-scope`) compares the config's derived `mutate` against the
 * declaration in `stryker.scopes.json`, because Stryker is driven by that array
 * and not by the file the rest of the gate checks. The config is `.mjs` — its
 * own header says why: Stryker's loader cannot read a `.ts` one — so `pnpm
 * typecheck`, which compiles only `.ts`, has nothing to go on and reports the
 * import as an implicit `any`. This is that gap closed, and it is the same
 * situation as `packages/site/src/raw-assets.d.ts`: a real import the root
 * tsconfig cannot type by itself.
 *
 * ⚠️ **Deliberately not a description of the whole config.** The file exports a
 * dozen more options, every one of them commented where it is set, and
 * mirroring them here would be a second copy to keep true — the thing
 * [ADR-0026](docs/adr/0026-constitution-is-gated-not-duplicated.md) refuses.
 * `mutate` is here because something reads it; the rest is read by Stryker,
 * which does not need a type from this repo.
 */
declare const config: { readonly mutate: readonly string[] };
export default config;
