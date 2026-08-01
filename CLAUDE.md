# CLAUDE.md — Stacks (reading tracker + 3D library)

## What this project is
A local-first reading tracker where the notes vault IS the database. A CLI (`stacks`) writes book notes with structured frontmatter into an Obsidian vault; a static site (Astro + vanilla Three.js) renders the vault as a 3D bookshelf. Public builds expose covers + metadata only — never note bodies.

## Start here — orientation for a cold session
1. `docs/progress.md` — where the project actually is. Read this first, always.
2. `docs/plan.md` — the approved execution plan, rules of engagement, fixture spec.
3. `docs/library-brief.md` — full product spec. Read before starting any phase.
4. `docs/gates.md` — the invariant scoreboard: which rule each gate protects, and
   which rules are still protected by nothing.
5. `docs/blockers.md` — only if it exists; records gates that defeated 3 approaches.

Update `docs/progress.md` in the same commit as the gate it describes, and
`docs/gates.md` in the same commit as the gate it scores.

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
  updateBook(sourcePath: string, changes: FrontmatterChanges): Promise<void>;
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;
  coverDir(): string;                          // where covers are cached
}
```
- `writeBook` **creates**; it never overwrites. A colliding filename gains a numeric suffix.
- `updateBook` sets frontmatter keys on an existing note by rewriting individual lines — key order, quoting, comments and the note body all survive byte for byte. Scalars only; a key whose value is a list is left alone. Re-serialising the YAML would reformat files the owner edits by hand.
- v1 ships `ObsidianAdapter` only (YAML frontmatter, `[[wikilinks]]`, `Library/` folder).
- Do NOT build a second adapter. Do NOT add adapter config plumbing beyond a single constructor arg (vault path). The interface exists so a Logseq/Anytype adapter is possible later, not to be a framework.

## Frontmatter contract (do not change without updating this file)
Required: `type: book`, `title`. Optional: `author`, `isbn`, `status` (reading|read|abandoned|wishlist, default: read), `started`, `finished`, `rating` (1–5), `cover` (relative path), `spine_color` (hex), `pages`, `face_out` (bool), `tags`, `shelf_order` (number).

This list is the contract, and `gates/frontmatter-contract.test.ts` holds it to
the parser in both directions. The paragraphs below are commentary — adding a
key there and not here is exactly the drift that gate exists to catch.

`face_out` forces the book cover-forward on the shelf, or forces it not to. Unset means decide from `status` — a book you're reading stands face-out on its own.

`shelf_order` places a book by hand, lowest first. Books carrying one come before every book without one, so a few favourites can be pinned without numbering the whole shelf. Unset means the default order: newest finished first.

**A book you are reading comes ahead of all of that**, numbered or not. `stacks order --renumber` numbers every shelved book, so any rule that only applied to unnumbered books stopped applying at all after one run — and the next book you picked up sorted behind every pin. Pinned by `gates/shelf-order.test.ts`.

## Tech decisions (made — don't relitigate)
- **Vanilla Three.js, not react-three-fiber.** Plain Astro island, no React on the page. Use InstancedMesh for book boxes, per-instance cover textures via a texture atlas or lazy per-book planes — measure first, don't optimize blind.
- Book detail card = plain DOM overlay positioned from raycaster hits, not in-canvas UI.
- **The site may only `import type` from `@stacks/core`.** The package root
  re-exports the adapter, sharp and the metadata layer, so a *value* import
  drags `node:fs` and sharp into the browser bundle and the shelf silently never
  boots. Runtime values shared with the site live in a pure subpath —
  `@stacks/core/shelf-order` — that imports nothing.
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

### Phase 1 — data layer
- 2026-07-31: Dependencies: `yaml` (will not hand-roll a YAML parser) and `sharp` in `core`. Sharp earns its keep twice — dominant-colour extraction now, OG image generation in Phase 3 — which beat adding two narrower libraries. Added `sharp: true` to `allowBuilds`.
- 2026-07-31: **Open Library returns `{}` with HTTP 200 for an ISBN miss, not a 404.** Captured for real in `fixtures/api/open-library-isbn-miss.json`. Any code keying off status would read a miss as a success. This is exactly the class of thing a hand-invented cache fixture would have got wrong.
- 2026-07-31: **Answers the brief's open question on Google Books.** An unauthenticated request 429s with "Quota exceeded … Queries per day" against a *shared anonymous consumer project* — the quota is not ours and may already be spent. So: quota errors are treated as ordinary misses, never exceptions, and Google Books is a bonus rather than a dependable fallback. Making it reliable requires a personal API key. Captured in `fixtures/api/google-books-quota-exceeded.json`.
- 2026-07-31: **Own dominant-colour algorithm rather than sharp's `stats().dominant`**, which bins colours and returns the bin representative (`#286878` for a cover that is exactly `#2f6d7a`) — close enough to look right, useless to assert on. Ours bins coarsely to find the winning region, then averages the real pixels in it.
- 2026-07-31: **Near-white and near-black pixels are set aside when picking a spine colour.** Found by running `stacks add` for real: the first live cover produced `spine_color: "#fefffe"`, because real covers are printed on and photographed against white. Extremes are used only if nothing else survives, so a genuinely white cover still gets a white spine. Regression fixtures: `white-bordered.png`, `all-white.png`.
- 2026-07-31: **Dedupe by title+author is fuzzy, not exact.** Also found by running it: `stacks add "thinking in systems"` created a second note beside "Thinking in systems : a primer". Exact equality of the normal form cannot match a title carrying its subtitle against one that isn't. `isProbablySameBook` requires high token containment one way and substantial overlap the other, which still keeps two different books by the same author apart.
- 2026-07-31: Vault path comes from `--vault` or `STACKS_VAULT`; there is no config file. `--out` defaults to `library.json` in the cwd.
- 2026-07-31: Tests inject an `HttpGet` backed by captured fixtures, and that reader **throws on an unmapped URL**. A test that accidentally reaches the network fails loudly instead of quietly passing down the not-found path. `scripts/capture-api-fixtures.ts` re-captures the real responses when a shape needs re-checking.
### Phase 2 — shelf renderer
- 2026-07-31: **Books flow continuously and wrap, rather than one shelf row per year.** The brief sketched year-per-row; in 3D that leaves every shelf two-thirds empty wood, which reads as a chart and not as furniture. Directed by the owner at the aesthetics review ("I want a real bookcase feel"). Chronological order is kept — newest first — and a year change opens a bookend-sized gap, so the grouping stays legible.
- 2026-07-31: **Shelf proportions taken from a real bookcase**, not chosen to look tidy: a hardback is ~3cm thick and ~23cm tall and a shelf ~90cm wide, so shelf width is ~4× book height and a shelf holds ~30 books. Matching that ratio is what makes it read as furniture.
- 2026-07-31: **Spine colour is sampled from the cover's left edge, not the whole cover.** On a real book the printed sheet wraps continuously around the spine, so the strip nearest the binding *is* the spine — a cover that is mostly white with a colour band down one side has a coloured spine. Falls back to the whole cover when the edge is nothing but paper (padded cover images). Owner's call: "as close as possible to the real book spine".
- 2026-07-31: **Wishlist books stay off the shelf** — owner's call. You do not own them yet. Print and audiobook editions of one title still render as two spines.
- 2026-07-31: **One mesh per book, not InstancedMesh.** CLAUDE.md says measure before optimising: 49 books render fine, and InstancedMesh would force a texture atlas for per-book covers. Revisit at the 200-book performance target, with a measurement. *(Superseded below: a book is now a small group of parts. InstancedMesh is still rejected, for the same reason.)*
- 2026-07-31: **A book is a case wrapped round a page block, not one painted box.** Superseding the entry above. A single box has to answer for the cover, the spine, the boards *and* the page edges with one set of faces, which is why the top and bottom of every book came out spine-coloured — the owner spotted it. A real hardback is two boards plus a spine strip enclosing a smaller block of paper, recessed at head, tail and fore-edge by the binder's *square*. That is now the geometry: `BOARD` 0.011 and `SQUARE` 0.013 world units, ≈2.5mm and ≈3mm at the shelf's 1 unit ≈ 24cm. So the top of a book reads as paper with a thin rim of cover, and the cover stands proud of the pages.
- 2026-07-31: **Draw calls are unchanged by that; object count is not.** `BoxGeometry` emits one draw call per *face group*, so the old six-material box already cost six draws — exactly what the six single-material parts cost now. What did change is per-object work: matrix updates and frustum culling go 1 → 6 per book, so the 200-book target is ~1200 objects rather than ~200. That is the number the measurement deferred above should now look at first.
- 2026-07-31: **The cover and the spine are planes floating `SKIN` above their boards**, not faces of them. Costs nothing extra given the per-group draw call, avoids z-fighting, and lets each printed face be exactly the size of its own artwork — a face-out cover keeps its true aspect instead of inheriting the board's.
- 2026-07-31: **The picker raycasts recursively and every part of a book is registered against it**, so a click on the pages or a board opens the same card as a click on the spine. Both halves are needed: with one missing, clicks return `undefined` and nothing errors.
- 2026-07-31: Camera distance is **computed to fit** the case in the vertical FOV rather than hardcoded — a guessed distance drops the top shelf out of frame as soon as the shelf grows a row.
- 2026-07-31: `mountShelf` exposes `projectBook(index)` so the click test can aim at a real book. A hardcoded pixel coordinate stops pointing at anything the moment the layout changes, and would keep passing while testing nothing.
- 2026-07-31: **The render gate builds and serves `dist/` itself** rather than driving the dev server. Waiting on a subprocess to announce itself on stdout is a race that hangs instead of failing, and a gate that can hang is worse than one that can fail. It also means the gate screenshots what actually ships.
- 2026-07-31: The gate's pixel probe waits two `requestAnimationFrame`s before `readPixels`. Without it the drawing buffer has already been cleared, and the gate reports a blank shelf that is in fact rendering correctly — it did exactly that once.

### Phase 3 — public build
- 2026-07-31: **The grep gate reads the built folder, not `library.json`.** The JSON is already covered by unit tests; what matters is what actually ships, including anything Astro inlined into HTML or a bundle. `pnpm gate:public` also fails if the canary is *absent from the fixture vault*, because a gate that greps for a string nobody planted passes no matter what the build contains.
- 2026-07-31: **`stacks build --public` stages a folder; `astro build` folds it into `dist/`.** Two steps, so the CLI never needs to know how the site is built and the site never needs to know where the vault is.
- 2026-07-31: **Only the basename of a `cover:` value is ever used.** `cover:` comes from a hand-edited note, and joining it to a path unchecked would let `../../..` stage arbitrary files into a public build. Tested.
- 2026-07-31: **The OG image is an SVG rasterised by sharp, not a screenshot of the 3D scene.** A headless browser in the build path is a heavy dependency for one static image, and this way the preview regenerates from `library.json` alone. Only validated hex colours reach the SVG — `spine_color` is vault input landing in markup. The case always shows full height with books filling from the top: a part-filled bookcase is what a growing library looks like, and four shelves holding two books each reads as an empty room.
- 2026-07-31: **Each gate stages its own input.** Both wrote `packages/site/public/library.json`, so whichever ran last decided what the other tested. Verified they now pass in either order, back to back.

### Phase 4 — library import
- 2026-07-31: **The first import source is Audible via Libation's JSON export, not Audiobookshelf.** The brief named Audiobookshelf; the owner had a Libation export in hand and no self-hosted ABS instance. The gate's real content — dedupe by ISBN then normalised title+author, and a re-run that adds nothing — is met and tested either way. An ABS importer would reuse `importBooks` unchanged; only the mapper is source-specific.
- 2026-07-31: **`BookInput.extra` carries keys outside the frontmatter contract.** The parser has always tolerated extra keys (invariant 5), but the *writer* silently dropped them, so an import could not keep the narrator, ASIN and runtime it found. Contract keys always win, so an import cannot smuggle in a different `title` through the side door.
- 2026-07-31: **`Account` and `Description` are never imported.** The first is the owner's email address; the second is the publisher's marketing copy — someone else's text. Tested by asserting neither appears anywhere in the mapped output.
- 2026-07-31: **Dedupe matches against an in-memory set, not by re-reading the vault per book.** `bookExists` re-parses every note on each call, so an import was a full vault scan per book; worse, in a dry run nothing is written, so a book duplicated *inside one export* would not be found and the run would claim it was adding both.
- 2026-07-31: **`DateAdded` used as `finished`, on the owner's instruction.** The export has no date-finished field at all. It turned out to vary per book (April–July 2026) rather than being one scan timestamp, so it is a reasonable proxy for reading order — but it is still the date a book entered the Audible library, not the date it was finished.
- 2026-07-31: The Audible test fixture is **invented**, mirroring Libation's shape. The real export contains the owner's email address and cannot be committed.

- 2026-07-31: **Deferred to the Phase 2 aesthetics review:** real covers often yield desaturated spine colours (a live `stacks add` gave `#d6d6d5` for a genuinely pale cover). The extractor is not wrong, but a shelf of grey spines may read badly. Do not tune this blind — decide it against a screenshot.

### Phase A — CI and the invariant scoreboard
- 2026-07-31: **The invariants get gates, and the gates get a scoreboard** — [`docs/gates.md`](docs/gates.md). A pre-publication review found six documented rules had quietly stopped being true with nothing going red, including a Decision Log entry below that is false in one of its two call paths. The rule this project already had — *"a gate never observed failing is not yet a gate"* — now applies to the invariants themselves, not just to phase gates.
- 2026-07-31: **One required check, named `gates`, aggregating a `suite` matrix.** Requiring `suite (22)` and `suite (24)` by name would mean editing the branch ruleset every time the matrix changes, and a required check that never reports blocks the pull request forever. The aggregator keeps one stable name. For the same reason the workflow is **never path-filtered**: a skipped required workflow reports nothing, which is indistinguishable from a check that has not run yet.
- 2026-07-31: **CI runs Node 22 and 24.** `engines` claims `>=22` while development happens on 24, so testing only 24 would have left that claim as one more thing nothing checks — the exact failure this phase exists to stop.
- 2026-07-31: **`verifyDepsBeforeRun: warn`, not `false`.** pnpm 11 defaults it to `install`, which makes `pnpm test` try to reinstall first and then abort with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in any shell without a TTY — every agent shell, every CI runner. `false` would have silenced the staleness diagnostic too; `warn` keeps it. It reported a genuine out-of-sync tree the moment it was switched on.
- 2026-07-31: **`pull_request`, never `pull_request_target`.** Fork pull requests must not see repository secrets. Nothing in the gate needs one: tests inject a fixture-backed `HttpGet` that throws on an unmapped URL, so no live API call is reachable from CI.
- 2026-07-31: **A book you are reading outranks `shelf_order`.** Owner's call, resolving a collision between two documented rules. `shelf_order` used to win over everything, on the reasoning that someone who numbered a shelf meant it — but `order --renumber` numbers *every* shelved book, so after one run no unnumbered book existed, "unset means reading first" described an unreachable state, and the next book picked up sorted behind all thirty-one. Pinning a favourite should not cost you sight of what you are reading. The shelf is generated, not curated (brief, goal 3): `shelf_order` arranges the generated part rather than overriding the one rule that tracks what you are doing now.
- 2026-07-31: **`updateBook` leaves a flow collection alone, not just a block list.** The "scalars only" rule checked for `tags:` followed by an indented `- ` list, so `author: [Marisol Vane, Tomas Ek]` on one line was replaced wholesale. Reachable rather than theoretical: `asString` returns undefined for an array, so a two-author note parses as *authorless*, which is exactly what sends `stacks enrich` to look an author up and write it over the list. Found by `gates/hand-edited-notes.test.ts`, which was red on arrival. A list is a list whichever way YAML writes it.
- 2026-07-31: **`gates/` holds rules about the shape of the tree**, separate from each package's own tests, because they belong to no package — they read CLAUDE.md, `.env.example` and the source tree itself. In the typecheck include, so gate code is checked like everything else.
- 2026-07-31: **Every gate asserts its own extraction found something.** A gate built on a regex reports an empty set when the format it parses changes, and every "each of these is documented" check passes trivially over an empty set. `expectFound` in `gates/repo.ts` is the guard, and it is why a reworded CLAUDE.md section fails loudly instead of going quietly green.
- 2026-07-31: **Structural allowlists must fail when they go stale.** `gates/adapter-boundary.test.ts` and `gates/cover-path.test.ts` both reverse-assert: every allowlisted file must still exist *and* still need its exemption. Without that a list only ever grows, and the easiest way to fix a red sweep becomes adding a line to it.
- 2026-07-31: **`.astro` `<script>` blocks may only find elements, guard their types, and hand off.** Imports, `getElementById` lookups, an `if` guard, a call — capped at 6 non-import statements, with `function`, `class`, `=>`, `for`, `while`, `switch` and `try` banned. `instanceof` is allowed, because narrowing `HTMLElement | null` is the one thing an untypechecked file has to do for itself.
- 2026-07-31: **The site's `import type` bar is statement-level.** Inline `import { type X }` fails the gate on purpose: under bundler resolution the import statement survives type erasure, so it still drags the module into the browser bundle — which is the whole failure being prevented.
- 2026-07-31: **Cover art: never in the repo, Open Library only in a public build.** The binding constraint is the providers' terms, not copyright in the abstract. Open Library's docs contemplate download and public display, ask that you not crawl, and appreciate a link back. Google's API terms bar permanent copies and public display of API content and require "powered by Google" plus a prominent per-result link. Apple conditions promotional content on placement beside a store badge linking to a purchase page — and book covers are not among the content types its terms enumerate at all. So Google and Apple stay metadata and lookup fallbacks; their art is hotlinked or omitted from `--public`. This needs cover **provenance** recorded at fetch time, which `cache-cover.ts` does not do today.
