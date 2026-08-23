# Project Brief: Stacks — Reading Tracker + 3D Library

**Type:** Personal prototype / fun project
**Orchestration target:** Claude Code (phased, agent-friendly, verifiable milestones)
**Owner:** Ayman

---

## Problem Statement

Reading activity is scattered: books finished, books in progress, and the notes they generate live in different places with no connective tissue and no way to _see_ the accumulated library. There's no low-friction way to log a book, have it automatically become a first-class note in an Obsidian vault, and see it appear on a visual shelf that can be shared with friends.

## Product Concept

A local-first reading tracker where **the Obsidian vault is the database**. Logging a book creates a markdown note with structured frontmatter; the tool reads the vault to generate a 3D bookshelf (covers as textures) rendered in the browser and exportable as a shareable static site.

**Core architectural bet:** no separate database. Frontmatter in book notes _is_ the data model. This makes the tool Obsidian-native, git-friendly, and trivially portable. If this bet fails (frontmatter too limiting), fall back to a `library.json` index generated from the vault.

## Goals

1. **Log a book in under 30 seconds** — one CLI command with a title/ISBN fetches metadata + cover automatically.
2. **Every book is a real Obsidian note** — backlinks, tags, and graph view work with zero extra effort.
3. **The 3D shelf is generated, never curated** — adding a book to the vault is the only action; the shelf updates on next build.
4. **Shareable output** — a static build deployable anywhere (GitHub Pages, Cloudflare Pages) that friends can open on a phone.
5. **Fun to look at** — the shelf should feel like a place, not a chart.

## Non-Goals (v1)

- **No social features** (comments, follows, reading feeds) — sharing is a static URL, nothing more.
- **No reading-progress sync from e-readers** (Kindle, Kobo) — manual logging + optional Audiobookshelf import only; sync APIs are a rabbit hole.
- **No note content in the shared build** — public shelf shows covers + metadata only; notes stay private by default.
- **No mobile app** — responsive web is enough.
- **No Obsidian plugin (yet)** — the tool operates on vault files from outside; a plugin is a P2 packaging decision, not an architecture change.

## Target User

Me, then friends who ask "what is that." Design for one opinionated user; genericize later only if it stays fun.

---

## System Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  CLI: stacks │────▶│  Obsidian vault   │────▶│  Static builder  │
│  add/import  │     │  Library/*.md     │     │  (Astro + R3F)   │
└─────────────┘     │  covers/*.jpg     │     └────────┬────────┘
       │            └──────────────────┘              ▼
       ▼                                       3D shelf site
  Open Library /                               (local dev +
  Google Books API                              deployable)
```

### Components

**1. `stacks` CLI (Node/TypeScript)**

- `stacks add <isbn|title>` — fetch metadata (Open Library first, Google Books fallback), download cover, write `Library/<Title>.md` with frontmatter, cache cover to `Library/covers/`.
- `stacks import audiobookshelf` — pull finished/in-progress items from a self-hosted Audiobookshelf instance via its API (config: URL + token in `.env`).
- `stacks build` — parse vault → emit `library.json` → trigger static site build.
- `stacks status` — quick stats (books this year, in progress, unshelved covers).

**2. Vault schema (frontmatter contract)**

```yaml
---
type: book
title: 'Thinking in Systems'
author: 'Donella Meadows'
isbn: '9781603580557'
status: read # reading | read | abandoned | wishlist
started: 2026-06-01
finished: 2026-07-12
rating: 5 # optional, 1–5
cover: covers/thinking-in-systems.jpg
spine_color: '#4a6b5a' # auto-extracted from cover, overridable
tags: [systems, nonfiction]
---
## Notes
Free-form notes, [[backlinks]], highlights…
```

- Notes body is never parsed for the public build — only frontmatter + cover.
- `spine_color` auto-extracted via dominant-color analysis of the cover at add time.

**3. 3D shelf (Astro site + Three.js / react-three-fiber island)**

- Procedurally generated shelf: books as boxes, cover texture on front face, `spine_color` on spine, width proportional to page count (fallback: fixed).
- Shelves fill left-to-right, grouped by year finished (one shelf row = one year) — instantly readable as "my reading over time."
- Interactions: orbit/pan (damped), click a book → card with cover, title, author, dates, rating; "reading now" books lean or sit face-out.
- Performance target: 60fps with 200 books on a mid-range phone (instanced meshes, compressed textures, lazy texture load).

**4. Share build**

- `stacks build --public` outputs a fully static site (no notes content, no vault paths).
- OG image auto-generated: flat 2D render of the shelf for link previews.

---

## User Stories (priority order)

1. As a reader, I want to run one command with an ISBN so that the book, its cover, and a note skeleton appear in my vault without manual data entry.
2. As an Obsidian user, I want book notes to be ordinary markdown with frontmatter so that backlinks, tags, and dataview-style queries just work.
3. As a visualizer, I want the 3D shelf to regenerate from my vault on build so that I never manually maintain the visualization.
4. As a sharer, I want a public static build with covers and metadata only so that I can send friends a link without exposing my notes.
5. As an Audiobookshelf user, I want to import my listening history so that audiobooks appear on the shelf alongside print books.
6. As a tinkerer, I want spine colors and book widths derived from real data so that the shelf looks organic rather than uniform.

## Requirements

### P0 — prototype isn't real without these

- [ ] `stacks add` with ISBN lookup, cover download, frontmatter note creation (Given a valid ISBN, When I run `stacks add`, Then a note + cover exist and `stacks build` renders it)
- [ ] Vault parser that tolerates hand-edited frontmatter and skips malformed notes with a warning (never crash the build on one bad file)
- [ ] 3D shelf rendering all `status: read|reading` books with cover textures, orbit controls, click-to-inspect
- [ ] `stacks build --public` producing a deployable static folder
- [ ] Graceful cover fallback: generated spine with title text when no cover found

### P1 — fast follows

- [ ] Audiobookshelf import
- [ ] Year-per-shelf grouping + shelf labels
- [ ] Dominant-color spine extraction
- [ ] OG image generation for link previews
- [ ] `stacks add` by fuzzy title search (interactive picker) when no ISBN

### P2 — architectural insurance (design for, don't build)

- Obsidian plugin packaging of the CLI commands
- Multiple rooms/shelves by tag or genre
- Highlights import (Readwise-style) into note bodies
- Friends' shelves side by side

## Open Questions

- **Blocking (decide in Phase 0):** Astro island with react-three-fiber vs. vanilla Three.js in a plain Vite page? R3F is nicer for interaction; vanilla is lighter. Recommend R3F, but decide before scaffolding. _(Owner: you)_
- **Non-blocking:** Open Library cover quality varies — is Google Books' API quota acceptable as the fallback for a personal tool? Resolve during Phase 1.
- **Non-blocking:** Should `wishlist` books render as ghosted/translucent on the shelf or be excluded? Taste call, decide when the shelf exists.

---

## Claude Code Orchestration Plan

### Phasing (each phase independently verifiable)

**Phase 0 — Scaffold (½ session)**
Monorepo: `packages/cli`, `packages/site`. TypeScript strict, Vitest, a `CLAUDE.md` capturing the frontmatter contract and the "vault is the database" invariant. Done when: `stacks --help` runs and the site dev server shows an empty shelf.

**Phase 1 — Data layer (1 session)**
Metadata fetchers with fallback chain, cover cache, note writer, vault parser → `library.json`. Done when: tests cover ISBN hit, title fuzzy match, API miss, malformed frontmatter; adding 3 real books produces valid notes.

**Phase 2 — Shelf renderer (1–2 sessions)**
Procedural shelf from `library.json`, instanced books, texture loading, orbit + click interactions, cover-fallback spines. Done when: 50 seeded books render at 60fps and clicking any book shows its card.

**Phase 3 — Public build + polish (1 session)**
`--public` build, deploy config, OG image, year grouping. Done when: a deployed URL works on a phone.

**Phase 4 — Audiobookshelf import (1 session, optional)**
Done when: import against your real instance dedupes correctly against existing notes (match on ISBN, then normalized title+author).

### Long-running agent guidance

- Give the agent the **done-criteria above as executable gates**: each phase ends with `pnpm test && pnpm build` green plus a phase-specific smoke script (e.g., Phase 2: headless render → screenshot → non-empty pixel check). Agents push much further when "done" is a command, not a vibe.
- Seed a `fixtures/vault/` with ~10 books (2 missing covers, 1 malformed frontmatter, 1 audiobook) at Phase 0 so every later phase has real test material.
- Instruct the agent to commit per phase with a summary, and to write decisions it makes (library choices, API quirks) into `CLAUDE.md` — that file is your paper trail across sessions.
- Phase 2 is the one to babysit visually: have the agent produce a screenshot artifact per iteration so you can course-correct the aesthetic early (shelf proportions and lighting are taste, not tests).

## Success Metrics (for a fun project)

- **Leading:** you log your next real book with `stacks add` instead of thinking "I'll do it later" (30-second target holds).
- **Leading:** shelf renders your actual library, not just fixtures, within the first week.
- **Lagging:** you send the link to at least one friend unprompted — the true test of "fun to share."
- **Lagging:** the vault notes get backlinked from other notes, proving the Obsidian integration earns its keep.
