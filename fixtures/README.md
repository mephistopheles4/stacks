# Fixtures

Mostly a miniature Obsidian vault, used by every phase's tests and gates. It
mirrors the real layout: notes in `Library/`, covers cached in `Library/covers/`,
so a note's `cover:` value stays relative to the note itself.

**One thing here is not a vault.** [`complexity/`](#the-complexity-inventory) is
a single TypeScript file that exists to be *counted* rather than read as notes.
Everything else on this page is about the vault.

## Everything here is invented

**No third-party copyrighted material is committed to this repo — ever.** Titles,
authors, identifiers, cover art and note bodies are all fabricated. The *shapes*
were derived from a real personal library (a nine-author edited volume, ASIN-only
identifiers, colon subtitles, a print edition alongside its audiobook), but none
of the content came with them.

The `finished` dates are plausible and entirely made up. They are not anyone's
reading history. Do not read anything into them.

Real covers only ever exist at runtime: `stacks add` downloads them into the
vault, which is gitignored.

## What each file is for

| File | Exercises |
| --- | --- |
| `The Tidal Engine.md` | the happy path — every optional key present |
| `Compilers for the Impatient.md` | hand-set `spine_color` must beat the auto-extracted one |
| `Signal and Sediment.md` | `abandoned` + `started` with **no `finished`** — year grouping must cope |
| `Nine Ways of Seeing a Warehouse.md` | 9 authors; no `isbn`, identified by an extra `asin` key |
| `The Quiet Protocol.md` | minimum viable note — only `type` + `title` + a couple of extras |
| `Lantern Work.md` | **reordered keys**; no cover; `status: reading` (fallback spine, face-out) |
| `A Book Kept Back.md` | `private: true` — must never reach a public build. No cover, so adding it moved the book count and nothing else |
| `The Salt Road Ledger.md` | print edition; started 2025, finished 2026 (crosses a year boundary) |
| `The Salt Road Ledger (Audiobook).md` | same title+author, different identifier; extra `narrator`/`duration` keys |
| `The Undelivered Manuscript.md` | **unparseable YAML** → warn naming the file, skip, keep going |
| `Untitled Import.md` | valid YAML, **no `title`** → a different skip path, also warned |
| `On Reading Slowly.md` | `type: article` → **ignored silently**, no warning. Not a book ≠ malformed |

### Expected outcome of `stacks build` on this vault

- **8 books** in `library.json` — the eight well-formed notes above.
- **2 warnings**, naming `The Undelivered Manuscript.md` and `Untitled Import.md`.
- **0 warnings** for `On Reading Slowly.md`. A parser that warns here is crying
  wolf; a vault full of non-book notes would drown the real warnings.
- The build **exits 0**. One bad note must never break it (invariant 3).

## Dedupe material

`bookExists(isbn, titleAuthor)` has two paths, and both have fixtures:

- **by ISBN** — any of the five books carrying one.
- **by normalised title+author** — `The Salt Road Ledger` exists twice, once in
  print with an ISBN and once as an audiobook with only an ASIN. No shared
  identifier, so only title+author matching catches the pair.

There is deliberately no note duplicated *verbatim* in the vault. Duplicate
detection happens at `add` time, against notes that already exist — so the vault
itself stays a realistic library rather than containing a book twice.

## Covers

Generated, not photographed:

```bash
pnpm tsx scripts/make-fixture-covers.ts
```

Two-tone by design — a base field plus an accent band over ~16% of the image. A
flat fill would make Phase 1's dominant-colour test meaningless, since "picked
the dominant colour" and "picked any pixel at all" would give the same answer.

Each cover's **expected** dominant colour, which the Phase 1 extractor must land on:

| Cover | Expected `spine_color` |
| --- | --- |
| `the-tidal-engine.png` | `#2f6d7a` |
| `compilers-for-the-impatient.png` | `#8a3b2e` (overridden to `#1f2933` in the note) |
| `signal-and-sediment.png` | `#4a6b5a` |
| `nine-ways-of-seeing-a-warehouse.png` | `#6a5a8c` |
| `the-salt-road-ledger.png` | `#b08442` |
| `the-salt-road-ledger-audio.png` | `#3a4a6b` |
| `white-bordered.png` | `#7a3f5d` — **not** white, despite a 44% white margin |
| `all-white.png` | `#ffffff` |

The last two belong to no book; they exist only for the extractor's tests.
`white-bordered.png` is a regression fixture: the first real `stacks add`
returned `spine_color: "#fefffe"`, because real covers are printed on and
photographed against white, so white was genuinely the commonest colour.
`all-white.png` guards the other direction — setting the extremes aside must not
turn a genuinely white cover into no colour at all.

There is no title text on the covers. Rendering text would mean adding a font
dependency for no test value — the covers exist to give colour extraction a known
expected answer, which the two-tone field does better than text would.

## The canary

Several note bodies contain:

```
NOTE_BODY_CANARY_do_not_ship
```

Phase 3's gate greps the `--public` build for exactly this string and fails on any
hit. It is planted in `The Undelivered Manuscript.md` too — the note that gets
*skipped* — so the gate cannot pass merely because that book was dropped.

## The 50-book fixture

Phase 2 needs 50 books to render. That set is **generated by a script** from these
shapes rather than committed, so the repo stays small and the shapes stay in one
place. It does not exist yet; it arrives with Phase 2.

## The complexity inventory

`complexity/inventory.ts` is not part of the vault and no note reads it. It is
the **total inventory** for the complexity counter: every construct ESLint's
`complexity` rule counts, and every function-shaped node the roll-up must see as
a function, each present at least once. `scripts/lib/complexity.test.ts` runs the
rule over it and holds the result to the expected per-function totals in
`INVENTORY`, so an ESLint upgrade that changes the count goes **red** instead of
moving all four complexity series at once with no code change to point at.

Invented like everything else here, and for once that is trivially true — it is
arithmetic, not prose.

⚠️ **It lives under `fixtures/` because it must not be counted.**
`scripts/**/*.ts` is both a declared Stryker scope and a complexity population,
so the same file kept beside its spec would be counted into the very series it
exists to pin — and adding a construct to it, which is the maintenance it is
designed to receive, would read on the dashboard as the `scripts` scope getting
more complex. `fixtures/` is in no scope glob and outside `tsconfig.json`, so it
is **not typechecked**; keep it valid TypeScript by hand. See
[ADR-0067](../docs/adr/0067-the-counters-inputs-are-pinned-exact.md).

**Adding a construct** means adding it here *and* to `INVENTORY` in
`scripts/lib/complexity.ts`, in the same commit. Sampling defeats the point: the
un-sampled construct is exactly the silent change the file exists to catch.
