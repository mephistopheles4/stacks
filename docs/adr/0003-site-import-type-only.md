# The site may only `import type` from `@stacks/core`

A *value* import from `@stacks/core` drags `node:fs` and sharp into the browser bundle and the shelf silently never boots. The bar is statement-level: inline `import { type X }` is rejected too, because under bundler resolution the statement survives type erasure.

Runtime values the site genuinely shares live in a pure subpath, `@stacks/core/shelf-order`, which imports nothing. The companion rule — no logic in `.astro` files — survives, on a warrant that is no longer this one.

> ⚠️ **Superseded on 2026-08-23 by G47 (`astro-types`).** This paragraph read *"those files cannot be typechecked at all"*, and the dated entry below rejected `astro check` on the same ground. [ADR-0066](./0066-typescript-6-until-7-1.md) pinned the repo to TypeScript 6.0.3 for other reasons, and `@astrojs/check@0.9.10` runs there; `astro check` now runs inside `pnpm build`. **The rule this record defends is unchanged and its reason is replaced**: logic stays out of `.astro` because every mutation scope and every complexity population globs `*.ts`, so logic there is counted by nothing. The entry below is left verbatim, per this file's own rule.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **`astro check` rejected — `@astrojs/check` cannot run under TypeScript 7.** TS 7's native compiler does not expose the programmatic API the Astro language server needs (withastro/roadmap#1321). Pinning the whole repo back to TS 6 to satisfy one tool costs more than it returns, so `.astro` files stay untypechecked and the mitigation is the "no logic in `.astro`" rule above. Revisit when Astro supports TS 7.

- **2026-07-31** — `packages/site/tsconfig.json` mirrors the strictness of `tsconfig.base.json` rather than relying on `astro/tsconfigs/strict` alone. The site's `.ts` files are covered by both that config (editor) and the root config (build gate); if the two disagreed, the editor would show errors the gate misses, or worse, the reverse.

- **2026-07-31** — **`.astro` `<script>` blocks may only find elements, guard their types, and hand off.** Imports, `getElementById` lookups, an `if` guard, a call — capped at 6 non-import statements, with `function`, `class`, `=>`, `for`, `while`, `switch` and `try` banned. `instanceof` is allowed, because narrowing `HTMLElement | null` is the one thing an untypechecked file has to do for itself.

- **2026-07-31** — **The site's `import type` bar is statement-level.** Inline `import { type X }` fails the gate on purpose: under bundler resolution the import statement survives type erasure, so it still drags the module into the browser bundle — which is the whole failure being prevented.
