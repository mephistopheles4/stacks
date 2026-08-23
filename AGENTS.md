# AGENTS.md — Stacks (reading tracker + 3D library)

## What this project is
A local-first reading tracker where the notes vault IS the database. A CLI (`stacks`) writes book notes with structured frontmatter into an Obsidian vault; a static site (Astro + vanilla Three.js) renders the vault as a 3D bookshelf. Public builds expose covers + metadata only — never note bodies.

## Start here — orientation for a cold session
1. `docs/progress.md` — where the project actually is. Read this first, always.
   It is a **spine**: current state, the gate log, environment findings, and an
   index of every investigation. The narratives themselves live one per file in
   `docs/log/` — follow a link from the index when you need one, rather than
   reading 1500 lines to find the four that matter.
2. `docs/plan.md` — the approved execution plan, rules of engagement, fixture spec.
3. `docs/library-brief.md` — full product spec. Read before starting any phase.
4. `docs/gates.md` — the invariant scoreboard: which rule each gate protects, and
   which rules are still protected by nothing.
5. `docs/notes-on-the-shelf.md` — the design for public/private notes and for
   picking a book up. Nothing there is built; read it before changing invariant 2,
   the publisher, or the cover cap.
6. `docs/spec/` — locked specs waiting for an implementation session. Everything
   in there is decided: read it *instead of* re-deciding, and read
   `docs/spec/README.md` first for the build order and the gate roster.
7. `docs/blockers.md` — only if it exists; records gates that defeated 3 approaches.

Claude Code sessions also load [`CLAUDE.md`](CLAUDE.md), which imports this file
and adds harness-specific notes. **Nothing project-normative lives there** — if a
rule appears only in `CLAUDE.md`, it is in the wrong file, and G37 fails. Every
other agent reads this file and is missing nothing.

Update `docs/progress.md` in the same commit as the gate it describes, and
`docs/gates.md` in the same commit as the gate it scores. A new investigation
goes to `docs/log/<date>-<slug>.md` with one index line in the spine — **not**
appended to `docs/progress.md`, which is how that file reached 1551 lines while
its own second paragraph called it an index.

## Invariants — never violate these

**This list is the project's constitution**, and each numbered rule is an
article. [`docs/gates.md`](docs/gates.md) scores every one of them as either
gated in CI or visibly not, and `gates/constitution-scoreboard.test.ts` (G19)
holds these two documents to each other — so adding an article here without
scoring it there is a red build, in both directions.

1. **The vault is the source of truth.** No parallel database. `library.json` is a build artifact, always regenerable, never hand-edited, gitignored.
2. **Note bodies are private.** `library.json` never carries body text, in any build — that part is absolute. A public build may ship body text from *one explicitly allowlisted section* of a note, extracted in the adapter and sanitised, as its own per-book file; see `docs/notes-on-the-shelf.md`. **Nothing implements that yet**, and the gate lands before the publishing code does, so today the rule is what it has always been: nothing below the frontmatter block is parsed or shipped at all. An allowlist and never a denylist, for the same reason `private:` fails closed.

   ⚠️ **That allowlist must never name `## About`.** The merge *writes* a note body now — a provider's description, through `insertBodySection` — while still never reading one. Writing and publishing are different halves, and the body was chosen over a frontmatter property precisely so that "never published" is structural: a body section is not a `BookRecord` field, so no build can carry it. An allowlist that later picked this section up would publish third-party marketing prose under the owner's name.
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
  insertBodySection(sourcePath: string, heading: string, text: string): Promise<void>;
  bookExists(isbn: string, titleAuthor: string): Promise<boolean>;
  coverDir(): string;                          // where covers are cached
}
```
- `writeBook` **creates**; it never overwrites. A colliding filename gains a numeric suffix.
- `updateBook` sets frontmatter keys on an existing note by rewriting individual lines — key order, quoting, comments and the note body all survive byte for byte. Scalars only; a key whose value is a list is left alone. Re-serialising the YAML would reformat files the owner edits by hand.
- `insertBodySection` is **the only method that writes below the frontmatter**, and it exists for one thing: the provider description the merge stores under `## About`. It writes **only when the heading is absent** — absent-only applied to a section, which is also what makes a whole `enrich` pass idempotent — placing it above `## Notes` so a provider's prose never lands under the owner's own. Everything else in the file survives byte for byte, `updateBook`'s promise extended to the half it never touched. It takes the vault-relative path a `BookRecord` carries or the absolute one `writeBook` returns.
- v1 ships `ObsidianAdapter` only (YAML frontmatter, `[[wikilinks]]`, `Library/` folder).
- Do NOT build a second adapter. Do NOT add adapter config plumbing beyond a single constructor arg (vault path). The interface exists so a Logseq/Anytype adapter is possible later, not to be a framework.

## Frontmatter contract (do not change without updating this file)
Required: `type: book`, `title`. Optional: `author`, `isbn`, `status` (reading|read|abandoned|wishlist, default: read), `started`, `finished`, `rating` (1–5), `cover` (relative path), `cover_source` (open-library|google-books|apple-books|oreilly|unknown), `spine_color` (hex), `pages`, `binding` (hardback|paperback), `face_out` (bool), `tags`, `shelf_order` (number), `private` (bool), `publisher`, `published` (verbatim), `subjects` (semicolon-separated, max 5), `google_volume_id`, `apple_track_id`, `openlibrary_olid`, `oreilly_ourn`.

This list is the contract, and `gates/frontmatter-contract.test.ts` holds it to
the parser in both directions. The paragraphs below are commentary — adding a
key there and not here is exactly the drift that gate exists to catch.

`face_out` forces the book cover-forward on the shelf, or forces it not to. Unset means decide from `status` — a book you're reading stands face-out on its own.

`shelf_order` places a book by hand, lowest first. Books carrying one come before every book without one, so a few favourites can be pinned without numbering the whole shelf. Unset means the default order: newest finished first.

`private: true` keeps a book out of every public build. It still appears in a local build and on your own machine — private means "not published", not "hidden from you". Wishlist books are excluded too, for a different reason: you don't own them.

**It fails closed, unlike every other key.** Anything present that is not clearly a "no" means private, because `private: yes` is a *string* under YAML 1.2 and a strict boolean check would drop it and publish the book. Wrongly private is a missing spine you notice in a second; wrongly public is someone's reading on a URL that may already have been shared or crawled. Only one of those is undoable.

`binding` is the one thing about a book's shape **no provider knows** — the word
`physical_format` appears zero times across every cached response this project
holds, and Google and Apple have no field for it at all. So it is declared or it
is invented, never looked up, and inference from cover aspect or page count is
struck permanently rather than deferred ([#52](https://github.com/mephistopheles4/stacks/issues/52)).

**Absent does not mean hardback.** It routes to a stable per-book hash, so no
missing key can flatten the shelf into one format — the fail-closed property met
by structure rather than by care, since there is no default value to fall into.
Binding moves the board and the binder's square *together* (a paperback is not a
hardback with the overhang removed) and biases the height band, which is the tell
that actually reads at shelf distance. `books.paperbackRatio` dials the mixture.

`cover_source` records which provider a cover's bytes came from, taken from the URL that was actually downloaded. **It is provenance, not permission** — the four providers permit different things, but nothing reads this key: `publish.ts` has never looked at it and every cover ships whatever its source. What it buys is precision if a provider ever asks for its art down — *those two*, not *all of them*. This line used to say a public build "cannot treat them alike", which read as policy and described nothing; see `packages/core/src/covers/cover-source.ts` and [ADR-0038](docs/adr/0038-oreilly-is-a-fourth-provider.md). **Absent and `unknown` are different**: absent means nobody looked (every cover cached before this key existed), `unknown` means somebody looked and did not recognise the host. An unrecognised value is dropped at parse time rather than kept, because a typo must not read as a permission. **A cover dropped in by hand is `unknown` too** — there is no `local`, because the honest reading of that value is *"somebody looked and did not recognise the host"*, which is exactly what a file from outside the four providers is. What must never survive is the *old* value: swapping the bytes under a note that still says `apple-books` is the one way this key can state something false, and it is the only failure here nothing would notice.

`publisher`, `published` and `subjects` come from the merge revision, and each
carries a rule worth knowing. **`published` is stored verbatim** — `2008` from
Open Library and `2027-02-25T00:00:00Z` from O'Reilly are both valid values,
because normalising at write time was the one irreversible option and undoing it
means re-asking every provider; the card renders the first four-digit run.
**`subjects` is semicolon-separated, never comma-separated**, capped at five:
provider categories contain commas natively — Apple's `Health, Mind & Body` is in
this repo's own G26 corpus — so a comma split would invent a genre nobody said,
and a value containing the separator is dropped rather than escaped.
⚠️ **`publisher` was already hand-written on 17 of the 41 real notes** before it
was ever a contract key, and absent-only leaves every one of them alone, so the
field is **mixed-provenance from day one**: nothing downstream may assume a
provider supplied it.

`google_volume_id`, `apple_track_id`, `openlibrary_olid` and `oreilly_ourn` are
the **contributor ids**, and the set of them present *is* the record of which
providers matched this book — there is no `contributors:` list and no winner key,
because a list would be derivable from these. **Ids, never URLs**: a provider URL
lands in an `href`, where the card's `textContent` rule protects nothing, and
with an opaque id the worst a corrupted value can do is 404. Each is
shape-checked at parse and **dropped on mismatch**, `cover_source`'s rule for an
opaque value — ⚠️ **a typo guard and explicitly not a correctness guarantee**,
since a well-formed wrong id passes and always will. Each key names its
provider's own field, and for O'Reilly that is the guard rather than a
convention: `ourn` is not `archive_id`, and a key called `oreilly_id` would
invite pasting the identifier this file already documents as a trap.
**`oreilly_ourn` is recorded although it can never be linked** — its URL 403s
whether the book exists or not — because an O'Reilly early release is the one
book no other provider matches, and recording only linkable providers would leave
it with no provenance at all.

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
  frontmatter **is** typechecked, by `astro check` inside `pnpm build` (G46,
  `astro-types`); the rule stands on a different footing. **Logic in an `.astro`
  file is counted by nothing**: all eight globs in `stryker.scopes.json` end
  `*.ts` and the complexity populations are those same globs, so a function
  there earns no mutation score and no complexity series. Anything with a type
  or a branch lives in a `.ts` file, where the counters can see it.
- Metadata: **four providers, in this order** — Open Library first, Google Books as the fallback (needs `GOOGLE_BOOKS_API_KEY`; unauthenticated requests share one exhausted quota and 429 every time), O'Reilly last and only when neither of those actually found the book, and Apple Books consulted *only* for cover art, because its artwork is ~800x1200 against Google's ~128px. Cache all API responses in `.cache/` so tests and rebuilds don't re-hit APIs.
- **O'Reilly** — unauthenticated, one search endpoint serving both title and ISBN lookups (`query=<isbn>&field=isbn`), and the sole source for its own early releases, covers included: Open Library answers their ISBNs with a 43-byte placeholder and Apple has never heard of them. Cover URLs are built from the response's `ourn`, at 1200w to match Apple — the endpoint serves up to 2000, but `MAX_COVER_EDGE` resizes every published cover to 512, so anything larger costs vault bytes and reaches no shelf. **Its library URLs end in an internal `archive_id`, never the ISBN** — for one book that id is `0642572352530`, which passes an ISBN-13 check digit while starting `064`; for another it is a well-formed 979 ISBN that is still *seven off* the book's real one, so a check-digit test does not catch it. Take the ISBN from the response body. See [ADR-0038](docs/adr/0038-oreilly-is-a-fourth-provider.md).
- **Which provider answered and which provider's bytes you kept are different questions.** The metadata layer completes one provider's record from another's, so a book's `source` need not be where its cover came from. `cover_source` is derived from the URL actually downloaded.

  **It records provenance and gates nothing.** This line used to say it decided
  what a public build may re-host; `publish.ts` has never read it, and every
  cover is published whatever its source — 26 of Apple's among them, whose terms
  the code's own comment says do not enumerate book covers at all. The claim
  read as a policy and was a plan, and it talked one session out of a decision
  the shelf had already made 35 times. What the key actually buys: if a provider
  ever asks for its art to come down, the answer can be *those nine* rather than
  *all of them*.
- TypeScript strict everywhere. Vitest. pnpm workspaces.

## Phase gates — a phase is DONE only when its gate passes
Every phase: `pnpm test && pnpm build` green, plus:
- **Phase 0 (scaffold):** `pnpm stacks --help` prints commands; site dev server renders empty shelf; fixtures vault committed.
- **Phase 1 (data layer):** `pnpm stacks build` on fixtures produces valid library.json with exactly the well-formed books; malformed fixture logged + skipped; tests cover ISBN hit / fuzzy title / API miss / malformed frontmatter (use cached API fixtures, no live calls in tests — gated by G21 (`no-live-network`), which records
  any request the suite makes and fails the test that made it; `vi.stubGlobal`
  is the escape hatch).
- **Phase 2 (shelf):** `pnpm smoke:render` (headless puppeteer screenshot of the shelf) produces a non-blank PNG at `artifacts/shelf.png`; 50-book fixture renders; clicking a book (integration test via puppeteer) opens the card.
- **Phase 3 (public build):** `pnpm stacks build --public` output contains zero note-body text (grep gate against a known phrase planted in a fixture note body); the committed share card reaches `dist/` intact.
- **Phase 4 (Audiobookshelf import):** import against mock ABS API dedupes by ISBN then normalized title+author; re-running import is idempotent.

## Working rules for agents
- **Assign an issue to yourself before you cut a branch or a worktree for it** — any issue an agent picks up, not only a wayfinder ticket. Reading, searching and triaging need no claim; the claim is due before the first durable artifact exists. **The assignee is an advisory, not a lock**: it records that somebody intends to work the issue, so the next session can decide knowingly, and it prevents nothing. Read it back through a window — **an assignment less than one hour old is presumed live** — and on finding a live one, take a different issue, or establish that whoever holds it has finished before carrying on. Nothing needs unassigning when work is abandoned, because the window expires the presumption on its own. ⚠️ **The case the tracker cannot answer is an assignee that is already your own account.** Every session here authenticates as the same user, so *mine, claimed a minute ago* and *free to take* are the same record. Establish outside the tracker whether another of your own sessions holds it; your own name on it is not permission. The invocation lives in [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md), and this rule is [not gated, deliberately](docs/gates.md#not-gated-deliberately).
- Commit at every green gate with a one-paragraph summary. Never batch multiple phases into one commit. **The subject is conventional and the body is that paragraph** — `<type>(<scope>): <subject>`, scope optional and from `core cli site gates docs ci`. A branch you cut yourself is `<type>/<issue>-<slug>`, or `research/`, `prototype/` or `experiment/` for one that never becomes a commit. ⚠️ **Put both on the pull request too, and treat that copy as the real one**: this repo squash-merges with `PR_TITLE`/`PR_BODY`, so the pull request title *is* the subject that reaches `main` and the local one is discarded. A branch the harness named is exempt, because the name exists before a session can read this. [ADR-0057](docs/adr/0057-the-pull-request-title-is-the-commit-subject.md), and [not gated, deliberately](docs/gates.md#not-gated-deliberately).
- When you make a decision the brief left open (library choice, API quirk, workaround), record it in [`docs/adr/`](docs/adr/) in the same commit — if it is hard to reverse, surprising without context, and a real trade-off. A gate lesson goes to [`docs/gates.md`](docs/gates.md) instead.
- In Phase 2, save a screenshot to `artifacts/` on every meaningful visual change — the human reviews aesthetics from these.
- If a gate can't pass after 3 distinct approaches, stop, write up what you tried in `docs/blockers.md`, and end the session rather than thrashing.
- Do not add dependencies without noting why in the relevant record under [`docs/adr/`](docs/adr/). Prefer zero-dep solutions for small utilities.

## Commands

Held to reality by `gates/commands.test.ts` — both lists below, in both
directions. Adding a script or a CLI command without documenting it here is a
red build.

```
pnpm install
pnpm typecheck           # tsc --noEmit across every .ts in the repo
pnpm lint                # G46: the tuned type-checked rule set over every .ts
                         #   file, tests included   (--fix repairs about a quarter)
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
pnpm mutation:run        # Stryker over the eight declared scopes — minutes, not seconds
pnpm mutation:score      # that run's report, scored per declared scope
pnpm metrics:emit        # one run's trend series, as the OpenMetrics text CI commits
pnpm metrics:commit      # put that record on the orphan `metrics` branch
pnpm trend:sync          # pull that record into the local store, put the page up, and ask the live site what it serves
```

`pnpm deploy:site` runs the four gates **first** and builds from the real vault
**last**, because `gate:public` and `smoke:render` both stage a *fixture* vault
into `packages/site/public/` — run either after the real build and you publish
eight invented books. It then re-checks the actual `dist/` before uploading: the
gates prove the code path is safe using fixtures, and say nothing about the
folder about to go on the internet. `--dry-run` stops before the upload;
`--check-only` builds and uploads nothing, and goes to asking the live site which
build it is serving.

**Every run prints the trend record first, and refuses a stale one** — per
series, at 3 days, gated by G39 (`metrics-freshness`). No flag clears that;
`--check-only` reports it instead of refusing, because it publishes nothing. The
same is true of the zero-mutant residual G38 (`mutation-scope`) checks, so
neither flag reaches a refusal on any path that publishes.

`pnpm trend:sync` needs **Docker** and nothing else, and is run by hand, never
on a schedule. It brings up **two** containers: the store, and the page you read
at <http://localhost:3000/d/stacks-trend-layer> — provisioned read-only from
[`grafana/`](grafana), so the panel order is a diff somebody can review rather
than a state on one machine. **Read panel 1 before panel 2**, which is what the
page says at the top; there is no confidence figure on it and there will not be
one ([ADR-0062](docs/adr/0062-the-dashboard-is-provisioned-from-the-repo.md)).

**The rest is in [`docs/commands.md`](docs/commands.md)** — read it before you
deploy, cut a worktree, read a mutation score, sync the trend store, or widen a
lint rule. It carries `deploy:site`'s `main`-only branch guard and what it
verifies after upload, `worktree`'s three cases and the one shared `.env`, why a
mutation score is a trend and not a gate, what `trend:sync` refuses, and why
`lint` loads a config file of its own rather than the counter's.

CLI commands — `pnpm stacks <cmd>`:

```
add       fetch metadata and a cover, then write a note into the vault
build     parse the vault into library.json   (--public, --watch)
status    quick stats: books this year, in progress, covers still missing
covers    report where each cover came from, or record it   (--backfill)
enrich    fill missing metadata on notes that already exist, never overwriting
          (a whole-vault network pass — run it twice; see below)
order     show the shelf order, or renumber it with gaps   (--renumber)
import    import a library export into the vault   (audible)
```

## The shelf's inspectors — `?solo` and `?debug`

Two query-string instruments, neither of which exists for a visitor who does not
ask: `?solo` mounts one book on an unclamped turntable, and `?debug` loads the
black box and the tuning panel. **Read
[`docs/shelf-inspectors.md`](docs/shelf-inspectors.md) before changing the
renderer, the debug panel, or `shelf-settings.ts`** — it carries why each exists,
what only they can see, and the rule that a control must not lie.

## Decisions

Every choice this project has already made, one file each, lives in
**[`docs/adr/`](docs/adr/)** — with the original reasoning carried verbatim.
Read it before proposing anything that contradicts one.

They were a dated log at the bottom of this file until that log was 85% of it
by weight and buried the rules above. A lesson about a *gate* rather than a
decision goes to [`docs/gates.md`](docs/gates.md); an environment finding goes
to [`docs/progress.md`](docs/progress.md).
