# CLAUDE.md — Stacks (reading tracker + 3D library)

## What this project is
A local-first reading tracker where the notes vault IS the database. A CLI (`stacks`) writes book notes with structured frontmatter into an Obsidian vault; a static site (Astro + vanilla Three.js) renders the vault as a 3D bookshelf. Public builds expose covers + metadata only — never note bodies.

## Start here — orientation for a cold session
1. `docs/progress.md` — where the project actually is. Read this first, always.
2. `docs/plan.md` — the approved execution plan, rules of engagement, fixture spec.
3. `docs/library-brief.md` — full product spec. Read before starting any phase.
4. `docs/blockers.md` — only if it exists; records gates that defeated 3 approaches.

Update `docs/progress.md` in the same commit as the gate it describes.

**When compacting this conversation, always preserve:** the current phase and
which gates are green, the exact gate commands and their last output, the two
human stop points (Phase 0 plan approval; Phase 2 first screenshot), the
no-copyrighted-material constraint on fixtures, and any unlogged decisions still
owed to the Decision Log.

## Invariants — never violate these
1. **The vault is the source of truth.** No parallel database. `library.json` is a build artifact, always regenerable, never hand-edited, gitignored.
2. **Note bodies are private.** Nothing below the frontmatter block is ever parsed into `library.json` or shipped in any build.
3. **Never crash on a bad note.** Malformed frontmatter → skip with a console warning listing the file. One bad file must not break `stacks build`.
4. **All vault access goes through the adapter.** No code outside `packages/core/src/adapters/` may read or write vault files directly. See "Vault adapter" below.
5. **Hand-edited notes are first-class.** The parser must tolerate extra frontmatter keys, reordered keys, and missing optional keys. Only `type: book` + `title` are required.

## Architecture
```
packages/
  core/     # vault adapter interface + obsidian adapter, metadata fetchers, library.json builder
  cli/      # stacks CLI (commander), depends on core
  site/     # Astro site, vanilla Three.js island, reads library.json
fixtures/
  vault/    # ~10 seed books: 2 missing covers, 1 malformed, 1 audiobook
docs/
  library-brief.md
```

## Vault adapter contract
```ts
interface VaultAdapter {
  listBooks(): Promise<BookRecord[]>;          // parse all type:book notes
  writeBook(book: BookInput): Promise<string>; // create note, return path
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;
  coverDir(): string;                          // where covers are cached
}
```
- v1 ships `ObsidianAdapter` only (YAML frontmatter, `[[wikilinks]]`, `Library/` folder).
- Do NOT build a second adapter. Do NOT add adapter config plumbing beyond a single constructor arg (vault path). The interface exists so a Logseq/Anytype adapter is possible later, not to be a framework.

## Frontmatter contract (do not change without updating this file)
Required: `type: book`, `title`. Optional: `author`, `isbn`, `status` (reading|read|abandoned|wishlist, default: read), `started`, `finished`, `rating` (1–5), `cover` (relative path), `spine_color` (hex), `pages`, `tags`.

## Tech decisions (made — don't relitigate)
- **Vanilla Three.js, not react-three-fiber.** Plain Astro island, no React on the page. Use InstancedMesh for book boxes, per-instance cover textures via a texture atlas or lazy per-book planes — measure first, don't optimize blind.
- Book detail card = plain DOM overlay positioned from raycaster hits, not in-canvas UI.
- **Site code layout: no logic in `.astro` files.** They hold markup, styles, and
  a `<script>` that imports and calls a `.ts` module — nothing more. `.astro`
  files are NOT typechecked (`astro check` cannot run under TypeScript 7 yet),
  so anything with a type lives in a `.ts` file, where `pnpm build` checks it.
- Metadata: Open Library first, Google Books fallback. Cache all API responses in `.cache/` so tests and rebuilds don't re-hit APIs.
- TypeScript strict everywhere. Vitest. pnpm workspaces.

## Phase gates — a phase is DONE only when its gate passes
Every phase: `pnpm test && pnpm build` green, plus:
- **Phase 0 (scaffold):** `pnpm stacks --help` prints commands; site dev server renders empty shelf; fixtures vault committed.
- **Phase 1 (data layer):** `pnpm stacks build` on fixtures produces valid library.json with exactly the well-formed books; malformed fixture logged + skipped; tests cover ISBN hit / fuzzy title / API miss / malformed frontmatter (use cached API fixtures, no live calls in tests).
- **Phase 2 (shelf):** `pnpm smoke:render` (headless puppeteer screenshot of the shelf) produces a non-blank PNG at `artifacts/shelf.png`; 50-book fixture renders; clicking a book (integration test via puppeteer) opens the card.
- **Phase 3 (public build):** `pnpm stacks build --public` output contains zero note-body text (grep gate against a known phrase planted in a fixture note body); OG image generated.
- **Phase 4 (Audiobookshelf import):** import against mock ABS API dedupes by ISBN then normalized title+author; re-running import is idempotent.

## Working rules for agents
- Commit at every green gate with a one-paragraph summary. Never batch multiple phases into one commit.
- When you make a decision the brief left open (library choice, API quirk, workaround), append it to the Decision Log below in the same commit.
- In Phase 2, save a screenshot to `artifacts/` on every meaningful visual change — the human reviews aesthetics from these.
- If a gate can't pass after 3 distinct approaches, stop, write up what you tried in `docs/blockers.md`, and end the session rather than thrashing.
- Do not add dependencies without noting why in the Decision Log. Prefer zero-dep solutions for small utilities.

## Commands
```
pnpm install
pnpm test                # all workspaces
pnpm stacks <cmd>        # run CLI from repo
pnpm dev                 # site dev server
pnpm smoke:render        # headless shelf screenshot gate
```

## Decision Log
<!-- append-only; agents add entries here -->
- 2026-07-31: Chose vanilla Three.js over R3F — agent-written code doesn't need React ergonomics; avoids R3F/drei version churn; keeps the Astro island React-free.

### Phase 0 — scaffold
- 2026-07-31: **No build step for `core` and `cli`.** They export TS source (`exports: "./src/index.ts"`) consumed directly by tsx, vitest and Vite — the internal-packages pattern. `pnpm build` is `tsc --noEmit` + `astro build`. This is an app monorepo, not a library release, so dual-ESM/`dist` plumbing buys nothing. Verified: `@stacks/core` resolves under all three consumers.
- 2026-07-31: **`moduleResolution: "bundler"`, not NodeNext** (docs/plan.md said NodeNext). NodeNext would force `.js` extensions on relative imports of files that are never emitted. Everything here is bundled by Vite or run through tsx, so bundler resolution is the honest description.
- 2026-07-31: **Explicit `.ts` extensions on relative imports**, enabled by `allowImportingTsExtensions` (safe: `noEmit` is on). Most robust across tsx, Node ESM and Vite simultaneously.
- 2026-07-31: Dependencies added, all mandated by CLAUDE.md or the brief: `typescript`, `vitest`, `tsx` (runs the CLI from source so `pnpm stacks` needs no build), `@types/node` (root dev); `commander` (cli); `astro`, `three`, `@types/three` (site). Versions resolved to TS 7.0.2, Vitest 4, Astro 7.1.6, three 0.185.1, commander 15.
- 2026-07-31: `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` — pnpm 11 blocks postinstall by default and esbuild's binary is missing without it.
- 2026-07-31: **Fixture covers generated by a ~40-line zero-dep PNG encoder** (`scripts/make-fixture-covers.ts`) over `node:zlib`, rather than adding an image library at Phase 0. Covers are **two-tone** (base field + accent band over ~16%): a flat fill would make Phase 1's dominant-colour test vacuous, since "picked the dominant colour" and "picked any pixel" would agree. No title text on covers — that needs a font dependency and adds no test value.
- 2026-07-31: **Fixtures are entirely invented.** Owner constraint: no third-party copyrighted material in the repo. Structural traits (9-author volume, ASIN-only identifiers, print+audiobook pair, colon subtitles) were derived from a real library; none of its content was. See `fixtures/README.md`.
- 2026-07-31: **ASIN lives as an extra frontmatter key**, not as `isbn`. It is outside the contract on purpose — it is the fixture for invariant 5 (tolerate extra keys). Same for `narrator`/`duration` on the audiobook note.
- 2026-07-31: **A non-`type: book` note is ignored silently, not warned about.** Only a `type: book` note that fails to parse earns a warning. Otherwise a vault full of ordinary notes would drown the real ones. Fixture: `On Reading Slowly.md`.
- 2026-07-31: `artifacts/` is gitignored — screenshots are regenerable via `pnpm smoke:render`, so the repo stays free of binaries. The human reviews them locally.
- 2026-07-31: Phase 2 puppeteer will use `channel: 'chrome'` against the system Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe` (probed and present), skipping the Chromium download entirely.

### Phase 0 — gate hardening (post-gate follow-up)
- 2026-07-31: **Verified the gate can actually fail** before trusting it: a deliberately broken assertion turns `pnpm test` red (exit 1) and the `&&` chain in `pnpm build` stops on failure. A gate never observed failing is not yet a gate.
- 2026-07-31: **`astro check` rejected — `@astrojs/check` cannot run under TypeScript 7.** TS 7's native compiler does not expose the programmatic API the Astro language server needs (withastro/roadmap#1321). Pinning the whole repo back to TS 6 to satisfy one tool costs more than it returns, so `.astro` files stay untypechecked and the mitigation is the "no logic in `.astro`" rule above. Revisit when Astro supports TS 7.
- 2026-07-31: `packages/site/tsconfig.json` mirrors the strictness of `tsconfig.base.json` rather than relying on `astro/tsconfigs/strict` alone. The site's `.ts` files are covered by both that config (editor) and the root config (build gate); if the two disagreed, the editor would show errors the gate misses, or worse, the reverse.
