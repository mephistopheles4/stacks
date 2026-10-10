# Fixtures

Mostly a miniature Obsidian vault, used by every phase's tests and gates. It
mirrors the real layout: notes in `Library/`, covers cached in `Library/covers/`,
so a note's `cover:` value stays relative to the note itself.

**One thing here is not a vault.** [`complexity/`](#the-complexity-inventory) is
two TypeScript files that exist to be *counted* rather than read as notes.
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
| `The Tidal Engine.md` | the happy path — every optional key present; the Thoughts split's [ship phrase](#the-thoughts-split) |
| `Compilers for the Impatient.md` | hand-set `spine_color` must beat the auto-extracted one |
| `Signal and Sediment.md` | `abandoned` + `started` with **no `finished`** — year grouping must cope |
| `Nine Ways of Seeing a Warehouse.md` | 9 authors; no `isbn`, identified by an extra `asin` key; an [unclosed fence](#the-thoughts-split) in its Thoughts |
| `The Quiet Protocol.md` | minimum viable note — only `type` + `title` + a couple of extras; [wishlist Thoughts](#the-thoughts-split); a [held-size cover](#the-held-tier) it must never ship |
| `Lantern Work.md` | **reordered keys**; no cover; `status: reading` (fallback spine, face-out); an [embed](#the-thoughts-split) in its Thoughts |
| `A Book Kept Back.md` | `private: true` — must never reach a public build; [private Thoughts](#the-thoughts-split); a [held-size cover](#the-held-tier) it must never ship |
| `The Salt Road Ledger.md` | print edition; started 2025, finished 2026 (crosses a year boundary); plants a quoted description under a demoted `### About` in its Thoughts (below) |
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
| `signal-and-sediment.png` | `#4a6b5a` — 800x1200, with planted EXIF and XMP ([the held tier](#the-held-tier)) |
| `nine-ways-of-seeing-a-warehouse.png` | `#6a5a8c` |
| `the-salt-road-ledger.png` | `#b08442` |
| `the-salt-road-ledger-audio.png` | `#3a4a6b` |
| `white-bordered.png` | `#7a3f5d` — **not** white, despite a 44% white margin |
| `all-white.png` | `#ffffff` |
| `a-book-kept-back.png` | `#5c4b3a` — 1400x2100, on the private book |
| `the-quiet-protocol.png` | `#34495e` — 1400x2100, on the wishlist book |

`white-bordered.png` and `all-white.png` belong to no book; they exist only for the extractor's tests.
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

## The Thoughts split

A note's `## Thoughts` section is the one part of a body a build may ship, as
`notes/<id>.json` (invariant 2; [`docs/spec/picking-a-book-up.md`](../docs/spec/picking-a-book-up.md)).
Seven existing notes plant the cases G2 (`public-build`) holds the split to, chosen
on [#367](https://github.com/mephistopheles4/stacks/issues/367) and, for the last, [#424](https://github.com/mephistopheles4/stacks/issues/424). Existing notes
rather than new ones, so the book count above does not move.

| Note | Planted case | What a build must do |
| --- | --- | --- |
| `The Tidal Engine.md` | the **ship phrase** in `## Thoughts`, the canary below it under `## Notes` | ship the phrase in its notes file, and the canary nowhere |
| `A Book Kept Back.md` | `private: true`, the canary inside its Thoughts | no notes file, in a public build or a local one |
| `The Quiet Protocol.md` | `status: wishlist`, the canary inside its Thoughts | no notes file, in either build |
| `Lantern Work.md` | an embed in its Thoughts, the canary beside it | withhold the whole section: no notes file |
| `Nine Ways of Seeing a Warehouse.md` | a fence opened in its Thoughts and never closed, the canary under `## Notes` below it | withhold the whole section: no notes file |
| `Compilers for the Impatient.md` | no Thoughts, the canary under `## Notes` | no notes file |
| `The Salt Road Ledger.md` | an empty `## Thoughts`, then an invented description quoted the way the `## About` writer writes one, under a demoted `### About`, the canary inside the quote | withhold the whole section: no notes file |

The ship phrase is `THOUGHTS_SHIP_PHRASE` in `scripts/lib/public-build.ts`,
beside `NOTE_BODY_CANARY`. It is plain words on purpose: the section ships with
its Markdown stripped, and an underscore could be stripped with it. G2 refuses to
run its split assertions unless every case above is still planted, because a
presence check reading a deleted fixture passes by construction.

⚠️ **The Thoughts text is invented, every word**, like the rest of this vault.
Never paste a real note's Thoughts in to make a case.

## The held tier

A public build stages a 1200px **held copy** of every published cover over the
shelf's 512px, in `held-covers/` beside `covers/`
([`docs/spec/picking-a-book-up.md`](../docs/spec/picking-a-book-up.md) §3.3).
`pnpm gate:public` refuses to run unless all four cases below are planted,
because a check over a property no fixture exhibits passes by construction.

| Cover | Case | What a build must do |
| --- | --- | --- |
| `the-tidal-engine.png`, 1400x2100 | published, over the held cap | stage a copy resized to 1200px |
| `signal-and-sediment.png`, 800x1200, EXIF + XMP | published, between the two caps | stage a copy at native size, **re-encoded**, carrying neither |
| `a-book-kept-back.png`, 1400x2100 | the private book | no held copy in a public build |
| `the-quiet-protocol.png`, 1400x2100 | the wishlist book | no held copy in a public build |

The EXIF and XMP are invented — an `ImageDescription` and a `dc:creator` that
name no real camera or person — and planted by the cover script, so
regenerating the covers keeps them.

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

`complexity/suppressed.ts` is the other file, and it exists to be **refused**
rather than counted. One `eslint-disable-next-line` directive hides its only
function from both counting rules, and both counters must throw on it — a
suppressed function leaves the series without a trace, which is how one comment
could clear a cap breach
([#244](https://github.com/mephistopheles4/stacks/issues/244)). It is not in
`INVENTORY` and must never be, since no declared number describes it.
