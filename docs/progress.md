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
| **Last green gate** | Phase 1 — data layer |
| **Now working on** | Phase 2 — shelf renderer (**gate red**, see below) |
| **Blocked on** | human aesthetics review of `artifacts/shelf.png` |
| **Next stop point** | ← we are here. Do not polish until the review comes back |
| **Out of scope this run** | Phase 4 (Audiobookshelf) |

## Gate log

| Phase | Gate | Status | Commit |
| --- | --- | --- | --- |
| 0 — scaffold | `stacks --help` lists commands · empty shelf renders · fixtures committed | ✅ green | tag `phase-0` |
| 1 — data layer | `stacks build` → valid `library.json` · malformed skipped · 4 test cases | ✅ green | tag `phase-1` |
| 2 — shelf | `pnpm smoke:render` → non-blank `artifacts/shelf.png` · 50 books · click opens card | ⬜ not started | — |
| 3 — public build | `--public` output has zero canary hits · OG image generated | ⬜ not started | — |

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

### Phase 2 — in progress, gate NOT green

Books render. `artifacts/shelf.png` is a real shelf: 49 of 50 fixture books
(wishlist excluded), spines out, one row per year newest-first, "Reading now"
face-out on the top shelf, varied spine widths from page count.

**Still red, and why:**

1. `pnpm smoke:render` exits 1. Two causes, both in the *gate*, not the shelf:
   - the pixel probe reads the WebGL buffer without waiting for a frame, so it
     gets an empty buffer (1 distinct colour, 100% "non-background"). The fix is
     the double-`requestAnimationFrame` wait that worked in the earlier manual
     probe — see the Phase 0 evidence entry.
   - one resource 404s; not yet identified (books load, so not `library.json`).
2. The click-to-open-card integration test is not written yet. The picker and
   card exist and are wired; only the puppeteer test is missing.

**Known defects, deliberately unfixed pending the review** (fixing them is the
"polish" the human asked to gate):
   - rows fill only ~20% of the shelf width — the unit is far too wide for ~8
     books per row, so every shelf trails off into empty space
   - the whole scene reads too dark
   - `index.astro` still says "Empty shelf — books arrive in phase 2"
   - a face-out book on the top row clips through the shelf above it
   - the second row's single face-out book sits oddly proud of the row

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

## Notes to the next session

**Phase 2 starts here.** `library.json` is generated and stable; the shelf needs
to read it.

- `mountShelf(canvas, books)` in `packages/site/src/shelf/scene.ts` throws if
  given books — that is the seam, deliberately loud. `SHELF` in that file is the
  single source of the geometry books must sit on.
- Generate the 50-book fixture with a script from the 10-book shapes; do not
  commit it (`fixtures/README.md`).
- **Carry into the aesthetics review:** real covers often give desaturated
  spine colours (a live add produced `#d6d6d5`). Not a bug — but a shelf of grey
  spines may read badly, and that is a judgement to make against a screenshot,
  not in advance.
- Two open taste calls due in Phase 2/3: whether `wishlist` books render ghosted
  or not at all, and whether the print + audiobook editions of one title collapse
  into a single spine.
- Everything in `fixtures/` is invented. No copyrighted material, ever — see
  `plan.md` §1. The canary Phase 3 greps for is `NOTE_BODY_CANARY_do_not_ship`.
