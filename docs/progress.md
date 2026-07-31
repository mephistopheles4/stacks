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
| **Last green gate** | Phase 0 — scaffold |
| **Now working on** | Phase 1 — data layer |
| **Blocked on** | nothing |
| **Next stop point** | Phase 2's first screenshot in `artifacts/` — aesthetics review |
| **Out of scope this run** | Phase 4 (Audiobookshelf) |

## Gate log

| Phase | Gate | Status | Commit |
| --- | --- | --- | --- |
| 0 — scaffold | `stacks --help` lists commands · empty shelf renders · fixtures committed | ✅ green | `phase-0` |
| 1 — data layer | `stacks build` on fixtures → valid `library.json` · malformed skipped · 4 test cases | ⬜ not started | — |
| 2 — shelf | `pnpm smoke:render` → non-blank `artifacts/shelf.png` · 50 books · click opens card | ⬜ not started | — |
| 3 — public build | `--public` output has zero canary hits · OG image generated | ⬜ not started | — |

Every phase additionally requires `pnpm test && pnpm build` green.

### Phase 0 evidence

- `pnpm test` → 1 file, 3 tests passed (Vitest 4.1.10)
- `pnpm build` → `tsc --noEmit` clean, Astro built 1 page
- `pnpm stacks --help` → prints `add`, `build`, `status`, `import`
- empty shelf verified **live** on the dev server, not just built: 1280×720 WebGL
  canvas, 15.8% non-background pixels, wood tones present, zero console errors

## Environment findings

Recorded so no session re-discovers them the hard way.

| Finding | Status |
| --- | --- |
| Node / pnpm / git | ✅ Node 24.14.1, pnpm 11.18.0, git 2.55.0 (Windows) |
| `@stacks/core` resolves under tsx + vitest + astro/tsc | ✅ verified — all three |
| Headless Chrome for Phase 2 | ✅ system Chrome present; use `channel: 'chrome'`, no download needed |
| `pnpm stacks --help` passes `--help` through | ✅ pnpm does not intercept it |
| pnpm 11 blocks esbuild's postinstall | ⚠️ fixed via `allowBuilds` in `pnpm-workspace.yaml` |
| Resolved versions | TS 7.0.2 · Vitest 4 · Astro 7.1.6 · three 0.185.1 · commander 15 |

## Notes to the next session

- Fixtures must contain **no copyrighted material**. See `plan.md` §1 — hard owner
  constraint, not a preference. Everything in `fixtures/` is invented.
- The canary phrase Phase 3 greps for is `NOTE_BODY_CANARY_do_not_ship`.
- `fixtures/README.md` documents what every fixture file is for, the **expected**
  outcome of `stacks build` on it (8 books, 2 warnings, 1 silent skip, exit 0),
  and the expected dominant colour of each generated cover. Phase 1's tests
  should assert against that table rather than inventing new expectations.
- `packages/core/src/adapters/vault-adapter.ts` is the interface only. Phase 1
  writes `ObsidianAdapter` beside it. No code outside that directory may touch
  vault files (invariant 4).
- `mountShelf(canvas, books)` in `packages/site/src/shelf/scene.ts` currently
  throws if given books — that is the Phase 2 seam, deliberately loud.
