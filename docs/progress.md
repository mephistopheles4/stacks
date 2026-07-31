# Progress

**Read this first.** It is the only file that says where the project actually is.

This is an **index, not a narrative**. One line per event, newest phase last.
Gists and links — never restate the plan. If you find yourself explaining *what*
a phase does here, it belongs in [`plan.md`](./plan.md) instead.

Update it in the **same commit** as the gate it describes.

---

## Current state

| | |
| --- | --- |
| **Last green gate** | Phase 4, plus 10 commits of post-phase work |
| **Now working on** | nothing |
| **Blocked on** | nothing |
| **Never done** | deployed. The brief's success metric is sending a friend a link |
| **Running against** | the owner's real vault, 31 books, all with covers |

## Gate log

| Phase | Gate | Status | Commit |
| --- | --- | --- | --- |
| 0 — scaffold | `stacks --help` lists commands · empty shelf renders · fixtures committed | ✅ green | tag `phase-0` |
| 1 — data layer | `stacks build` → valid `library.json` · malformed skipped · 4 test cases | ✅ green | tag `phase-1` |
| 2 — shelf | `pnpm smoke:render` → non-blank `artifacts/shelf.png` · 50 books · click opens card | ✅ green | tag `phase-2` |
| 3 — public build | `--public` output has zero canary hits · OG image generated | ✅ green | tag `phase-3` |
| 4 — import | dedupe by ISBN then title+author · re-running is idempotent | ✅ green | tag `phase-4` |

Every phase additionally requires `pnpm test && pnpm build` green.

### Phase 1 evidence

- `pnpm test` → 7 files, **62 tests** passed · `pnpm build` clean
- `pnpm stacks build --vault fixtures/vault` → **8 books**, 2 warnings naming
  `The Undelivered Manuscript.md` and `Untitled Import.md`, silent on
  `On Reading Slowly.md`, exit 0 — matching `fixtures/README.md` exactly
- Gate's four cases covered against **real captured** responses: ISBN hit,
  fuzzy title, API miss, malformed frontmatter. No test touches the network.
- End-to-end `stacks add 9781603580557` into a scratch vault: note written,
  real cover downloaded, spine colour extracted, re-running deduped correctly.

### Phase 2 evidence

`pnpm smoke:render` green: 49 of 50 fixture books shelved (wishlist excluded),
715 distinct colours, 40.1% non-background, and a click on a real book opened
its card ("Ember Protocol: Notes on Craft"). Screenshot at `artifacts/shelf.png`.

Aesthetics review came back with three directions, all applied: real bookcase
feel (continuous fill at real proportions, not one sparse row per year),
wishlist books stay off, and spine colour sampled from the cover's binding edge
so it matches the real spine. See the Decision Log for each.

### Phase 3 evidence

`pnpm gate:public` green: builds for real, then greps every text file that
shipped for the canary, for vault note paths, and for `sourcePath` — 0 hits. It
also fails if the canary is missing from the fixture vault, so it cannot pass
vacuously. OG image 24.8 KB at 1200x630. 71 tests pass.

Both gates were made to stage their own input: they previously fought over
`packages/site/public/library.json`, so whichever ran last decided what the
other tested. Verified passing back to back in either order.

### Phase 4 evidence

`stacks import audible <export>` against a real Libation export: 22 records, 17
added, 5 correctly matched against books already shelved — two of them separated
only by a *long* subtitle, which needed a dedupe fix first. Re-running added 0
and skipped 22, so the import is idempotent. The vault now holds 25 books, every
one with cover art.

The source is Audible/Libation rather than the brief's Audiobookshelf; see the
Decision Log for why. `importBooks` is source-agnostic — an ABS importer would
need only a new mapper.

## Environment findings

| Finding | Status |
| --- | --- |
| Node / pnpm / git | ✅ Node 24.14.1, pnpm 11.18.0, git 2.55.0 (Windows) |
| `@stacks/core` resolves under tsx + vitest + astro/tsc | ✅ verified |
| Headless Chrome for Phase 2 | ✅ system Chrome present; use `channel: 'chrome'`, no download |
| `.astro` files are NOT typechecked | ⚠️ `astro check` can't run under TS 7 — keep logic in `.ts` |
| **`node -e` with ESM top-level await exits silently** | ⚠️ prints nothing, exit 0. Put scripts in a file and run with `pnpm tsx` |
| **Bash tool sandbox blocks network** | ⚠️ outbound `fetch` needs `dangerouslyDisableSandbox` |
| Google Books unauthenticated | ⚠️ 429s on a shared quota — a bonus, never a dependable fallback |
| Resolved versions | TS 7.0.2 · Vitest 4 · Astro 7.1.6 · three 0.185.1 · sharp 0.35 |

## Since the phase gates

Ten commits of work driven by running against a real vault rather than fixtures.
Most of it was defects that only real data exposes:

- covers now carry their true aspect (audiobook art is square, print is ~0.65)
  and books lean in groups; spine titles are printed on the spines
- `face_out` joined the frontmatter contract
- `stacks build --watch` plus `pnpm dev:watch` for live editing from Obsidian
- Google Books works now a key is configured; Apple Books added purely for
  cover art, which is ~800x1200 against Google's ~128px
- matching learned to refuse summaries and study guides, which had put the
  wrong book's cover — and once the wrong book's *note* — into the vault
- covers that are Google's "image not available" card are refused
- tags are normalised to what Obsidian accepts

## Notes to the next session

All five phases are green and tagged. The tool runs against the owner's real
vault, not only fixtures.

If you pick this up:

- Run `pnpm test && pnpm build && pnpm smoke:render && pnpm gate:public` first.
  Those four are the contract; if they are green the project is where this file
  says it is.
- **Both gates stage their own fixture vault into `packages/site/public/`.**
  Running them while `pnpm dev:watch` is up swaps the live site to fixture data
  until the next vault edit. Rebuild with
  `pnpm stacks build --public --assets packages/site/public`.
- **Verify covers by eye, not by counting.** Sixteen were swapped for print
  editions once; eleven were right and five were wrong — three were a
  placeholder graphic and two were a different book — and nothing in the counts
  distinguished them. A contact sheet did.
- Configuration lives in `.env` (gitignored): `STACKS_VAULT`, and
  `GOOGLE_BOOKS_API_KEY` without which Google Books 429s on a shared quota.
- Still open: whether the print and audiobook editions of one title should
  collapse into a single spine. They currently render as two.
- Everything in `fixtures/` is invented. No copyrighted material, ever — see
  `plan.md` §1.
