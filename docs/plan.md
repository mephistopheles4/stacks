# Stacks — Execution Plan (Phases 0–3)

**Status:** awaiting approval of Phase 0. Nothing built yet.
**Live state:** see [`progress.md`](./progress.md) — that file, not this one, says where we are.
**Why this project exists:** see [`library-brief.md`](./library-brief.md).
**Contracts and invariants:** see [`../CLAUDE.md`](../CLAUDE.md) — invariants there win over anything here.

This document is the *revisable whole*. Edit it directly. If you change a phase's
scope, change it here and the executing session will pick it up on next read.

---

## 1. Rules of engagement for this run

These came from the human and must survive context compaction. They are not
inferable from the code.

1. Execute **Phase 0 → Phase 3**. Phase 4 (Audiobookshelf) is **out of scope for
   this run** — do not start it.
2. Stop and check in at **exactly two points**:
   - after the Phase 0 plan, before executing it *(← we are here)*
   - after Phase 2's **first** rendered screenshot lands in `artifacts/`, for an
     aesthetics review before any polish
   Otherwise run autonomously until Phase 3's gate is green.
3. A phase is done **only** when its gate passes: `pnpm test && pnpm build` green
   **plus** the phase-specific check in CLAUDE.md. Commit at every green gate.
   Never batch two phases into one commit.
4. Any decision the brief leaves open: **make the call**, log it in the CLAUDE.md
   Decision Log, move on. Do not ask about library choices.
5. If a gate will not pass after **3 distinct approaches**: write up what was
   tried in `docs/blockers.md`, commit, and stop. Do not thrash.

### Hard constraint: no third-party copyrighted material in the repo

Stated explicitly by the owner. Fixtures are **invented**. No book cover art, no
book text, no EPUB-extracted assets are committed — ever. Real covers exist only
at runtime, downloaded by `stacks add` into the vault, which is gitignored.

The single exception, and the reason it is not a violation: one cached Open
Library **JSON metadata response** for one real ISBN, checked in under test
fixtures. That is bibliographic fact (title, author, identifiers) — no cover
binary, no book text. It exists so the parser is tested against the API's real
response shape instead of a schema we invented.

---

## 2. Working agreement for agent sessions

Read this if you are a session picking this project up cold.

| Question | Answer |
| --- | --- |
| Where am I? | `docs/progress.md` — always current, always short |
| What am I building? | this file, the phase below the last green gate |
| Why? | `docs/library-brief.md` |
| What must I never break? | Invariants in `CLAUDE.md` |
| What has already been decided? | Decision Log at the bottom of `CLAUDE.md` |
| What went wrong before? | `docs/blockers.md` (may not exist — that's fine) |

**Session protocol**

- **One phase per session** where practical. Phases are sized to fit one context.
- At every green gate, in the same commit: update `progress.md`, append any new
  Decision Log entries to `CLAUDE.md`, commit with a one-paragraph summary.
- `progress.md` is an **index, not a narrative**. Gists and links; never restate
  the plan. A status file that duplicates the plan will drift and then lie.
- Prefer the gate command as the source of truth over your own belief that
  something works. Show the command output, don't assert success.

---

## 3. Phase 0 — Scaffold

**Goal:** an empty but real monorepo where every later phase has somewhere to go.

### Ground work

- `git init` — not a repo yet, and rule 3 requires commits per gate.
- `.gitignore`: `node_modules/`, `dist/`, `.cache/`, `artifacts/`, `library.json`,
  `.env`. `library.json` is gitignored per CLAUDE.md invariant 1 — doing it now
  avoids a Phase 1 cleanup commit.

### Files

```
package.json                 workspaces + scripts: test, build, dev, stacks, typecheck
pnpm-workspace.yaml
tsconfig.base.json           strict, noUncheckedIndexedAccess, NodeNext
vitest.config.ts
.gitignore  .nvmrc  README.md

packages/core/               src/index.ts, src/types.ts (BookRecord, BookInput),
                             src/adapters/vault-adapter.ts  — interface only, stubs.
                             Real parsing is Phase 1.

packages/cli/                package.json (bin: stacks), src/index.ts
                             commander program registering add | build | import | status,
                             each stubbed to exit 1 "not implemented in phase 0".
                             Commands must be REGISTERED — the gate is that
                             `--help` prints a command list, not a bare program.

packages/site/               astro.config.mjs, src/pages/index.astro,
                             src/components/Shelf.astro (island),
                             src/shelf/scene.ts — vanilla Three.js: shelf furniture,
                             lighting, damped orbit, zero books.

fixtures/vault/              10 notes + covers/ + README.md   (see §7)
```

### Dependencies

Each also gets a Decision Log entry.

| Dep | Scope | Why |
| --- | --- | --- |
| `typescript` | root dev | strict TS mandated by CLAUDE.md |
| `vitest` | root dev | mandated |
| `tsx` | root dev | runs the CLI from TS source so `pnpm stacks` needs no build step |
| `commander` | cli | mandated by the brief |
| `astro` | site | mandated |
| `three`, `@types/three` | site | mandated; vanilla, not R3F (already decided) |

Deferred, with the phase that introduces them: `yaml` (P1 — will not hand-roll a
YAML parser), `puppeteer` (P2), cover-color/OG image library (P1/P3, choose and
log then).

### Decisions taken here

- **No build step for `core` and `cli`.** They export TS source consumed directly
  by tsx, vitest and Vite — the "internal packages" pattern. `pnpm build` is
  `tsc --noEmit` across packages + `astro build`. Avoids dual-ESM/`dist` plumbing
  in what is an app monorepo, not a library release.

### Two probes before building on the scaffold

Cheap now, expensive to discover late.

1. **Module resolution.** Prove `@stacks/core` resolves identically under all
   three consumers — tsx, vitest, astro — with one stub export. This is the one
   piece of the scaffold that can silently not work and cost a rewrite of every
   `package.json`.
2. **Headless Chrome launches on this Windows box.** Phase 2's gate depends on
   puppeteer. If it can't run here, that must surface now, not after the shelf is
   built — rule 5 burns a lot of session on an environment problem found late.

### Gate

`pnpm test && pnpm build` green · `pnpm stacks --help` prints all four commands ·
`pnpm dev` serves a page rendering an empty shelf · fixtures committed. → commit.

---

## 4. Phase 1 — Data layer

**Goal:** the vault becomes readable and writable; `library.json` is generated.

- Metadata fetchers: Open Library first, Google Books fallback. All responses
  cached to `.cache/` so tests and rebuilds never hit the network.
- `ObsidianAdapter` implementing the full `VaultAdapter` contract. **All** vault
  I/O lives here (invariant 4).
- Frontmatter parser: tolerates extra keys, reordered keys, missing optionals.
  Only `type: book` + `title` required (invariant 5). Malformed → warn naming the
  file, skip, keep going (invariant 3).
- `library.json` builder. Frontmatter only — **never** note bodies (invariant 2).
- `spine_color` dominant-colour extraction from the cover.

**Gate:** `pnpm stacks build` on fixtures emits valid `library.json` containing
exactly the well-formed books; the malformed fixture is logged and skipped; tests
cover ISBN hit / fuzzy title / API miss / malformed frontmatter, all against
cached fixtures with **no live calls in tests**.

---

## 5. Phase 2 — Shelf renderer

**Goal:** the shelf is a place, not a chart.

- Procedural shelf from `library.json`; books as boxes; cover texture on the face,
  `spine_color` on the spine; width from page count with a fixed fallback.
- Shelf rows grouped by year finished.
- InstancedMesh for the boxes; **measure before optimizing** textures (atlas vs
  lazy per-book planes) — CLAUDE.md says don't optimize blind.
- Damped orbit/pan. Click → detail card as a **DOM overlay** positioned from
  raycaster hits, not in-canvas UI.
- Generated fallback spine with title text when a book has no cover.
- 50-book fixture: **generated by a script** from the 10-book shapes, not committed.

**Gate:** `pnpm smoke:render` writes a non-blank PNG to `artifacts/shelf.png` ·
the 50-book fixture renders · a puppeteer integration test proves clicking a book
opens its card.

> **Stop point.** The first screenshot that lands in `artifacts/` ends the
> autonomous run. Present it and wait for the aesthetics review before any
> polish. Save a screenshot on every meaningful visual change thereafter.

---

## 6. Phase 3 — Public build

**Goal:** a static folder that can be sent to a friend, leaking nothing.

- `stacks build --public` → deployable static output, no note bodies, no vault paths.
- OG image: flat 2D render of the shelf for link previews.
- Year grouping + shelf labels.
- Decide and log: do `wishlist` books render ghosted or not at all? (Brief leaves
  this open as a taste call "decide when the shelf exists" — so decide in P2/P3.)

**Gate:** `pnpm test && pnpm build` green · the `--public` output contains **zero**
occurrences of the canary phrase planted in fixture note bodies (grep gate, must
exit non-zero on any hit) · OG image generated.

---

## 7. Fixture design

Fixtures were derived from the *structure* of a real personal library, with all
copyrighted content discarded. Titles, authors, identifiers and covers are
invented. See §1 for the constraint this satisfies.

**Structural traits mirrored** (each exists because it was observed in a real
library and will otherwise break something later):

| Trait | Fixture |
| --- | --- |
| 9-author edited volume | one book with a long `author` list |
| `Title (Series Name and Suffix)` | one title with a parenthetical series suffix |
| colon subtitles | several |
| same book, two files, one identifier | duplicate note pair — exercises `bookExists` |
| ASIN identifiers, no ISBN | 3 books ASIN-only; the rest carry ISBNs |
| print + separate audio narration | audiobook fixture sharing a print title |
| publication dates spanning years | `finished` dates spread across 2024–2026 |

**Deliberate breakage** — 10 notes total:

- 2 books with `cover` omitted → exercises the fallback spine.
- 1 note with **genuinely unparseable YAML** → the "never crash" case (invariant 3).
- 1 note with valid YAML but **no `title`** → a different skip path. A note
  missing `type: book` is *not* malformed, it is simply not a book, and must not
  warn.

**Covers:** generated PNGs — solid field, title text, a distinct hue each. Better
than real art here, because `spine_color` extraction then has a *known expected
value* per fixture, so the test asserts a real number rather than "some hex came back."

**Note bodies:** several notes, including the malformed one, contain the canary
phrase `NOTE_BODY_CANARY_do_not_ship`. Phase 3's grep gate greps for exactly this.
Putting it in the malformed note too means the gate cannot pass by accident of
that file being skipped.

**Fabricated dates:** `finished` dates are plausible but invented, not anyone's
real reading history. `fixtures/README.md` states this so no later session
mistakes fixtures for data.

---

## 8. Out of scope for this run

- **Phase 4, Audiobookshelf import.** Explicitly excluded.
- Deployment to a live URL. Phase 3 produces a static folder; publishing it is the
  owner's call, not an agent's.
- A second `VaultAdapter`. CLAUDE.md forbids it — the interface exists so a
  Logseq/Anytype adapter is *possible*, not to build a framework.
- Obsidian plugin packaging, multi-room shelves, highlights import (all P2 in the
  brief: design for, don't build).

## 9. Agent tooling — decided, do not re-litigate

The `mattpocock/skills` set is installed in `~/.claude/skills` (20 skills).
This repo **deliberately does not opt into its issue-tracker pipeline.**

- **Use freely:** the model-invoked skills — `tdd`, `diagnosing-bugs`,
  `codebase-design`, `domain-modeling`, `resolving-merge-conflicts`, `pr-review`.
  They trigger on their own and conflict with nothing here.
- **Use when a session runs hot:** `/handoff`, to bail out of a session mid-phase
  with context intact. Complements `progress.md`, which covers only the scheduled
  handoff at phase boundaries.
- **Do not run:** `setup-matt-pocock-skills`, `to-prd`, `to-issues`, `triage`,
  `implement`. They publish to an issue tracker this project does not have, and
  their PRD→issues→implement pipeline is a *substitute* for the phase-gate model,
  not an addition to it. The phases in §3–§6 already are the tickets, and their
  gates are executable commands rather than issue states. Running both means every
  session must first work out which system it is obeying.
- **Not installed, not needed:** `wayfinder`. It is an on-ramp for pre-spec work
  that is too foggy to plan. This project has a brief, four phases and executable
  gates — the fog it clears is already cleared.

Reversing this is a legitimate call if the project grows past one person, but it
is a deliberate decision, not an oversight.

## 10. Open items

Nothing blocking. Recorded so they aren't rediscovered:

- Google Books quota acceptability as a fallback — resolve during Phase 1.
- `wishlist` rendering — ghosted vs excluded; decide once the shelf exists (P2/P3).
- Texture strategy (atlas vs lazy planes) — decide by measurement in Phase 2.
