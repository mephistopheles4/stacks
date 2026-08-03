# CLAUDE.md — Stacks (reading tracker + 3D library)

## What this project is
A local-first reading tracker where the notes vault IS the database. A CLI (`stacks`) writes book notes with structured frontmatter into an Obsidian vault; a static site (Astro + vanilla Three.js) renders the vault as a 3D bookshelf. Public builds expose covers + metadata only — never note bodies.

## Start here — orientation for a cold session
1. `docs/progress.md` — where the project actually is. Read this first, always.
2. `docs/plan.md` — the approved execution plan, rules of engagement, fixture spec.
3. `docs/library-brief.md` — full product spec. Read before starting any phase.
4. `docs/gates.md` — the invariant scoreboard: which rule each gate protects, and
   which rules are still protected by nothing.
5. `docs/notes-on-the-shelf.md` — the design for public/private notes and for
   picking a book up. Nothing there is built; read it before changing invariant 2,
   the publisher, or the cover cap.
6. `docs/blockers.md` — only if it exists; records gates that defeated 3 approaches.

Update `docs/progress.md` in the same commit as the gate it describes, and
`docs/gates.md` in the same commit as the gate it scores.

**When compacting this conversation, always preserve:** the current phase and
which gates are green, the exact gate commands and their last output, the two
human stop points (Phase 0 plan approval; Phase 2 first screenshot), the
no-copyrighted-material constraint on fixtures, and any unlogged decisions still
owed to `docs/adr/`.

## Invariants — never violate these

**This list is the project's constitution**, and each numbered rule is an
article. [`docs/gates.md`](docs/gates.md) scores every one of them as either
gated in CI or visibly not, and `gates/constitution-scoreboard.test.ts` (G19)
holds these two documents to each other — so adding an article here without
scoring it there is a red build, in both directions.

1. **The vault is the source of truth.** No parallel database. `library.json` is a build artifact, always regenerable, never hand-edited, gitignored.
2. **Note bodies are private.** `library.json` never carries body text, in any build — that part is absolute. A public build may ship body text from *one explicitly allowlisted section* of a note, extracted in the adapter and sanitised, as its own per-book file; see `docs/notes-on-the-shelf.md`. **Nothing implements that yet**, and the gate lands before the publishing code does, so today the rule is what it has always been: nothing below the frontmatter block is parsed or shipped at all. An allowlist and never a denylist, for the same reason `private:` fails closed.
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
Required: `type: book`, `title`. Optional: `author`, `isbn`, `status` (reading|read|abandoned|wishlist, default: read), `started`, `finished`, `rating` (1–5), `cover` (relative path), `cover_source` (open-library|google-books|apple-books|unknown), `spine_color` (hex), `pages`, `face_out` (bool), `tags`, `shelf_order` (number), `private` (bool).

This list is the contract, and `gates/frontmatter-contract.test.ts` holds it to
the parser in both directions. The paragraphs below are commentary — adding a
key there and not here is exactly the drift that gate exists to catch.

`face_out` forces the book cover-forward on the shelf, or forces it not to. Unset means decide from `status` — a book you're reading stands face-out on its own.

`shelf_order` places a book by hand, lowest first. Books carrying one come before every book without one, so a few favourites can be pinned without numbering the whole shelf. Unset means the default order: newest finished first.

`private: true` keeps a book out of every public build. It still appears in a local build and on your own machine — private means "not published", not "hidden from you". Wishlist books are excluded too, for a different reason: you don't own them.

**It fails closed, unlike every other key.** Anything present that is not clearly a "no" means private, because `private: yes` is a *string* under YAML 1.2 and a strict boolean check would drop it and publish the book. Wrongly private is a missing spine you notice in a second; wrongly public is someone's reading on a URL that may already have been shared or crawled. Only one of those is undoable.

`cover_source` records which provider a cover's bytes came from, taken from the URL that was actually downloaded. The three providers permit different things, so a public build cannot treat them alike — see `packages/core/src/covers/cover-source.ts`. **Absent and `unknown` are different**: absent means nobody looked (every cover cached before this key existed), `unknown` means somebody looked and did not recognise the host. An unrecognised value is dropped at parse time rather than kept, because a typo must not read as a permission.

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
- Metadata: **three providers, in this order** — Open Library first, Google Books as the fallback (needs `GOOGLE_BOOKS_API_KEY`; unauthenticated requests share one exhausted quota and 429 every time), and Apple Books consulted *only* for cover art, because its artwork is ~800x1200 against Google's ~128px. Cache all API responses in `.cache/` so tests and rebuilds don't re-hit APIs.
- **Which provider answered and which provider's bytes you kept are different questions.** The metadata layer completes one provider's record from another's, so a book's `source` need not be where its cover came from. `cover_source` is derived from the URL actually downloaded — it decides what a public build may re-host, and the three providers' terms differ.
- TypeScript strict everywhere. Vitest. pnpm workspaces.

## Phase gates — a phase is DONE only when its gate passes
Every phase: `pnpm test && pnpm build` green, plus:
- **Phase 0 (scaffold):** `pnpm stacks --help` prints commands; site dev server renders empty shelf; fixtures vault committed.
- **Phase 1 (data layer):** `pnpm stacks build` on fixtures produces valid library.json with exactly the well-formed books; malformed fixture logged + skipped; tests cover ISBN hit / fuzzy title / API miss / malformed frontmatter (use cached API fixtures, no live calls in tests — gated by G21, which records
  any request the suite makes and fails the test that made it; `vi.stubGlobal`
  is the escape hatch).
- **Phase 2 (shelf):** `pnpm smoke:render` (headless puppeteer screenshot of the shelf) produces a non-blank PNG at `artifacts/shelf.png`; 50-book fixture renders; clicking a book (integration test via puppeteer) opens the card.
- **Phase 3 (public build):** `pnpm stacks build --public` output contains zero note-body text (grep gate against a known phrase planted in a fixture note body); OG image generated.
- **Phase 4 (Audiobookshelf import):** import against mock ABS API dedupes by ISBN then normalized title+author; re-running import is idempotent.

## Working rules for agents
- Commit at every green gate with a one-paragraph summary. Never batch multiple phases into one commit.
- When you make a decision the brief left open (library choice, API quirk, workaround), record it in [`docs/adr/`](docs/adr/) in the same commit — if it is hard to reverse, surprising without context, and a real trade-off. A gate lesson goes to [`docs/gates.md`](docs/gates.md) instead.
- In Phase 2, save a screenshot to `artifacts/` on every meaningful visual change — the human reviews aesthetics from these.
- If a gate can't pass after 3 distinct approaches, stop, write up what you tried in `docs/blockers.md`, and end the session rather than thrashing.
- Do not add dependencies without noting why in the relevant record under [`docs/adr/`](docs/adr/). Prefer zero-dep solutions for small utilities.

## Agent skills

Configuration for the optional [engineering skills](https://github.com/mattpocock/skills).
**Nothing here is required to work on this repo** — the gates are the contract,
and a contributor with none of these installed must be able to pass every one of
them. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

### Issue tracker

GitHub issues on `mephistopheles4/stacks`, via the `gh` CLI. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name. Not yet created on the repo. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context — three packages, one vocabulary. That vocabulary is [`CONTEXT.md`](CONTEXT.md), and it holds only the terms **no gate pins down** — anything a gate already enforces is linked from there, never restated, for [ADR-0026](docs/adr/0026-constitution-is-gated-not-duplicated.md)'s reason. Decisions live in [`docs/adr/`](docs/adr/), one file each, carrying the original reasoning verbatim. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Commands

Held to reality by `gates/commands.test.ts` — both lists below, in both
directions. Adding a script or a CLI command without documenting it here is a
red build.

```
pnpm install
pnpm typecheck           # tsc --noEmit across every .ts in the repo
pnpm test                # vitest: packages/**/src and gates/
pnpm build               # typecheck, then astro build
pnpm dev                 # site dev server
pnpm dev:watch           # site + rebuild on every vault change
pnpm stacks <cmd>        # run the CLI from source
pnpm worktree <branch>   # a second checkout, cut from origin/main and installed
pnpm fixtures:50         # regenerate the 50-book fixture vault
pnpm smoke:render        # phase 2 gate: headless shelf screenshot
pnpm gate:public         # phase 3 gate: the public build leaks nothing
pnpm deploy:site         # gates, then build from the real vault, then publish
```

`pnpm deploy:site` runs the four gates **first** and builds from the real vault
**last**, because `gate:public` and `smoke:render` both stage a *fixture* vault
into `packages/site/public/` — run either after the real build and you publish
eight invented books. It then re-checks the actual `dist/` before uploading: the
gates prove the code path is safe using fixtures, and say nothing about the
folder about to go on the internet. `--dry-run` stops before the upload;
`--check-only` skips straight to asking the live site which build it is serving,
building and uploading nothing.

**It publishes `main` and refuses anything else**, before the gates rather than
after two minutes of them. With one checkout that question answered itself by
standing somewhere; with worktrees there can be four, on four branches, all
reading the one `.env` — so all of them hold `SITE_URL` and the command looks
identical from every one. `--any-branch` is the deliberate override, and a
detached HEAD is refused outright because nobody could say afterwards what went
out. `--dry-run` and `--check-only` are exempt: neither uploads, and a dry run
from a feature branch is how you would check this path before merging it.
Pinned by `gates/deploy-branch.test.ts`.

**After the upload it asks the live site which build it is serving**, and then
compares every cover the build produced against what the origin actually serves.
A successful upload is not the same as a changed site, and the two checks fail
differently. Every build stamps `index.html` with a hash of itself, because cover
bytes cannot answer "which build is this": covers are named after book titles and
keep those names, so a deploy that changes only code leaves every one of them
identical and the cover check passes against either build — which it did, minutes
after an upload, while the origin still served the previous `index.html` and
therefore the previous bundle. The cover check remains for the opposite case, a
cached copy carrying the right name and the wrong bytes, which is how the fix for
the mobile crash appeared to deploy while phones kept crashing. The build check
waits out edge propagation before complaining, since a deploy is not live the
instant wrangler returns.

**Both checks read the HTTP status before the body, and say "refused" rather
than guessing.** Bot protection answers a non-browser client with a *challenge
page*, which is HTML carrying no build stamp and a content-length of its own —
so read as content, a refusal is indistinguishable from the stale build these
checks exist to catch, and recommends purging a cache that was never involved.
That is not hypothetical — it happened here, and went unnoticed for a while
because the message read like an edge-propagation delay
([`docs/progress.md`](docs/progress.md)). A refusal retries like anything else
and is reported only after every attempt, since one refusal is not evidence of a
standing one. **Do not make it pass by sending a browser user agent** — that was
measured and does not work. See
[ADR-0027](docs/adr/0027-deploy-check-reports-refusal.md).

`pnpm worktree <branch>` adds a second checkout beside this one — `../stacks-<branch>` —
runs `pnpm install` in it, and tells you which `.env` it will read. Both of
those are needed because `node_modules` and `.env` are gitignored, so a bare
`git worktree add` produces a checkout where every command fails for a reason
that has nothing to do with the branch.

**Origin is fetched first, before anything is decided, and what you were given
is always printed.** Nothing here moves until somebody fetches, and making a
worktree is not that — so any base you did not check is whatever was last
pulled. That is the one failure here that says nothing: the checkout installs,
the tests pass, and the work sits on an old commit. The fetch does not fail the
command when it cannot reach the network, because being offline does not stop
the rest from working; it says so and carries on.

Three cases, and for a while only the first was handled:

- **A new branch** is cut from `origin/main`, not from the local `main`.
- **A branch `origin` already has** is checked out from `origin/<branch>`,
  tracking it. It used to be created *empty off `origin/main`*, because the only
  question asked was whether a **local** branch existed — so a branch a
  colleague or another machine had already pushed came back as a new one of the
  same name, and the first push either bounced or, forced, took the work with
  it.
- **A branch already here** is fast-forwarded when it is strictly behind, and
  otherwise reported and left alone. Never merged or rebased: a branch that is
  ahead or has diverged is yours to resolve, and this command exists to make you
  a checkout.

**There is one `.env`, in the main checkout, and every worktree reads it.** It
is not copied: a copy drifts, and `STACKS_DEV_HOST=1` left behind in a stale one
keeps the shelf on the network long after anyone remembers enabling it. So
editing it changes every worktree at once, which is the point — and a surprise
if you assumed otherwise. Remove a worktree with `git worktree remove <path>`.

CLI commands — `pnpm stacks <cmd>`:

```
add       fetch metadata and a cover, then write a note into the vault
build     parse the vault into library.json   (--public, --watch)
status    quick stats: books this year, in progress, covers still missing
covers    report where each cover came from, or record it   (--backfill)
enrich    fill missing metadata on notes that already exist, never overwriting
order     show the shelf order, or renumber it with gaps   (--renumber)
import    import a library export into the vault   (audible)
```

## Decisions

Every choice this project has already made, one file each, lives in
**[`docs/adr/`](docs/adr/)** — with the original reasoning carried verbatim.
Read it before proposing anything that contradicts one.

They were a dated log at the bottom of this file until that log was 85% of it
by weight and buried the rules above. A lesson about a *gate* rather than a
decision goes to [`docs/gates.md`](docs/gates.md); an environment finding goes
to [`docs/progress.md`](docs/progress.md).
