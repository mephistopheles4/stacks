# No build step for `core` and `cli`

`@stacks/core` and `@stacks/cli` export TypeScript source directly (`exports: "./src/index.ts"`), consumed as-is by tsx, vitest and Vite — the internal-packages pattern. `pnpm build` is `tsc --noEmit` plus `astro build`.

This is an app monorepo, not a library release, so dual-ESM and `dist/` plumbing buys nothing. The resolution and extension choices below follow from it.

## How this was decided

*Carried verbatim from the Decision Log this repository kept from July 2026, newest last.*

- **2026-07-31** — **No build step for `core` and `cli`.** They export TS source (`exports: "./src/index.ts"`) consumed directly by tsx, vitest and Vite — the internal-packages pattern. `pnpm build` is `tsc --noEmit` + `astro build`. This is an app monorepo, not a library release, so dual-ESM/`dist` plumbing buys nothing. Verified: `@stacks/core` resolves under all three consumers.

- **2026-07-31** — **`moduleResolution: "bundler"`, not NodeNext** (docs/plan.md said NodeNext). NodeNext would force `.js` extensions on relative imports of files that are never emitted. Everything here is bundled by Vite or run through tsx, so bundler resolution is the honest description.

- **2026-07-31** — **Explicit `.ts` extensions on relative imports**, enabled by `allowImportingTsExtensions` (safe: `noEmit` is on). Most robust across tsx, Node ESM and Vite simultaneously.

- **2026-07-31** — Dependencies added, all mandated by CLAUDE.md or the brief: `typescript`, `vitest`, `tsx` (runs the CLI from source so `pnpm stacks` needs no build), `@types/node` (root dev); `commander` (cli); `astro`, `three`, `@types/three` (site). Versions resolved to TS 7.0.2, Vitest 4, Astro 7.1.6, three 0.185.1, commander 15.

- **2026-07-31** — `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` — pnpm 11 blocks postinstall by default and esbuild's binary is missing without it.

- **2026-07-31** — Dependencies: `yaml` (will not hand-roll a YAML parser) and `sharp` in `core`. Sharp earns its keep twice — dominant-colour extraction now, OG image generation in Phase 3 — which beat adding two narrower libraries. Added `sharp: true` to `allowBuilds`.
