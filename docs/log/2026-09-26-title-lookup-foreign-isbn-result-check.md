# Result check — title lookup foreign ISBN

`result-checker`, 2026-09-26, on commit 954096b. Verbatim below.

---

## Verdict: CONFIRMED

I checked all seven acceptance conditions myself in this session, and every one holds. No finding at P0 to P2. There are two P4 advisories.

- **Scope:** commit 954096b on origin/main 3814f61, worktree `C:\Users\mephi\WebstormProjects\stacks\.claude\worktrees\optimistic-benz-6b4e8e`. HEAD is still 954096bf6b0595b235350cb5790a192b2b2c1eea.
- **Tree state:** `git status --short` is empty at the end.

## Conditions and evidence

**1. The foreign ISBN is gone and title search reads one edition — pass.**

- **Main flow:** I ran `lookup('Thinking, Fast and Slow', get, {googleBooksKey:'dummy-test'})` through a scratch tsx script. The mock `get` served `open-library-search-language.json` and gave an empty answer to Google's by-ISBN lookup. The result was:
  - isbn 9780385676519, OLID OL36689110M, publisher Doubleday Canada, published 2011
  - cover `…/b/id/15129456-L.jpg`, source open-library
  - no `9789754345315` anywhere in the results
- **Query sent:** `q=Thinking, Fast and Slow language:eng`, and `fields` includes `key`, `language` and `editions`.
- **Edges, all with Google returning `{items:[]}`:** an edition with no `language` field, `editions.docs: []`, and `language: 'eng'` as a string rather than an array. Each returned the work with no isbn, OLID, cover, publisher or published value (work-level author, pages and subjects kept).
- **`preferIsbn13`:** zero hits under `packages/**/*.ts`.

**2. Google's title and ISBN handling — pass.**

- **Title search:** the committed metadata.test.ts cases pass for tr (ISBN dropped), en (kept), `EN-GB` (primary subtag only) and no language (kept).
- **Non-default language:** at `language:'tr'`, the Turkish volume keeps its ISBN. I reproduced this in my probe, which asked `language:tur`.
- **By-ISBN, run directly:** `lookup('9789754345315', get)` with Open Library missing and Google returning the `tr` volume gave source google-books and isbn 9789754345315, at both the default language and tr. The by-ISBN path is unfiltered.

**3. The CLI refuses a bad `STACKS_LANGUAGE` before any write — pass.**

- **Refusal:** I ran `pnpm stacks --vault <scratch> --cache <scratch>` for `add`, `enrich` and `import audible fixtures/api/audible-export.json`. I tried seven values: `english`, `en-GB`, `eng`, `xx`, `en # English`, `constructor`, `__proto__`. All 21 runs exited 1 with `STACKS_LANGUAGE must be a two-letter ISO 639-1 code, one of: … — got "<value>"`.
- **No write, no network:**
  - The vault file's SHA-256 was unchanged.
  - Its LastWriteTime is 1.5 ms after its creation, which was before any CLI run.
  - No file was added.
  - The fresh cache directory was never created.
- **Direct calls to `metadataOptionsFromEnv`:**
  - unset, `''` and `'   '` give en
  - `' TR '`, `'Tr'` and `'tr\n'` give tr
  - `'EN'` gives en
  - `'ｔｒ'` (full-width), `constructor` and `english` are refused, and the message names STACKS_LANGUAGE
- **Snapshot glitch:** my first hashed comparison printed "unchanged: False". It did not reproduce: a byte-identical rerun over all 21 runs showed no content or mtime change. I judge it a snapshot artifact.

**4. Core re-validates and only interpolates table constants — pass.**

- **Table:** `language.ts` uses `ReadonlyMap` with `TABLE.has` and `TABLE.get`.
- **Bypass attempt:** I called `lookup` and `searchByTitle` with an `as`-cast `language` of `constructor`, `__proto__`, `toString`, `hasOwnProperty`, `eng`, `EN`, `'en '`, `''` or `xx`. Every call threw `unknown reading language …` with zero requests made.
- **Query composition:** the query holds only `openLibraryLanguage(language)`, the table value.
- **OR/AND/NOT:**
  - `War or Peace` is unchanged.
  - `Pride AND Prejudice` becomes `Pride and Prejudice`.
  - `NOT`/`OR` as the whole title, or at either end, are lowercased.
  - Tab-separated `OR` is lowercased.
  - `Or And Not` is unchanged, since only upper-case operators are touched.
  - `A (OR) B` and `a "OR" b` are unchanged, which is outside "bare", so I do not flag it.

**5. Options types and required language parameters — pass.**

- **Types:** `AddBookOptions`, `EnrichOptions` and `ImportOptions` extend `MetadataOptions`. Google `searchByTitle(query, get, language, apiKey?)` is called with `language` at both sites in `metadata/index.ts`.
- **Mutation test:** I ran it on a scratch copy outside the repo, linked to the repo's `node_modules` by junctions that I removed afterwards. Each hard-coded `'en'` failed tests:

| Mutant | Tests failed |
| --- | --- |
| Open Library call site | 4 |
| Google fallback | 3 |
| `fillGaps` Google call | 1 |
| `readingLanguage` returns the default | 8 |

- **CLI forwarding:** I checked by reading the code, not by an end-to-end run, because a run with a valid language would hit the live network. `add`, `enrich` and `import` each spread `metadataOptions()` into their options.

**6. All gates green — pass.** Every command exited 0.

| Gate | Result |
| --- | --- |
| `pnpm test` | 126 files, 1975 tests passed |
| `pnpm build` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm lint:md` | 185 files, 0 issues |
| `pnpm format:check` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `vitest run gates/lookup-recall` (G26) | 6/6; `gates/lookup-recall.test.ts` and `gates/recall-corpus.ts` unchanged against 3814f61 |

**7. Fixtures hold bibliographic JSON only — pass.**

- **New and re-captured fixtures:** `google-books-volume-foreign.json`, `open-library-search-language.json`, `-hit.json` and `-miss.json` contain no `"description"`, no `AIza`, no `key=`, and no `textSnippet` or `searchInfo`.
- **`lookup-recall.json`:** it holds 47 `"description"` entries, but 3814f61 also had 47, so they predate this change. The five changed entries are Open Library searches with `docs: []`.

**Owner-accepted deviations — all as described.**

- **`lookup-recall.json`:** only the 5 Open Library entries changed.
- **`open-library-search-sparse-sibling.json`:** unchanged; it is still used at `metadata.test.ts:228`.
- **English default:** applied in both `lookup` and the exported `searchByTitle`, including when `language` is explicitly undefined.
- **G23:** `EXPECTED_CALLERS` now names `packages/cli/src/metadata-options.ts`.
- **ADR:** the file is `docs/adr/0094-a-title-search-takes-one-edition-in-the-reading-language.md`, and 0093 is #392's.

**Security review mapping.** Every finding in `docs/log/2026-09-26-title-lookup-foreign-isbn-security-review.md` has matching behaviour:

- **F1:** the edition language is read and fails closed, the `pol` test exists, and OR is lowercased.
- **F2:** `Map` lookup, and `constructor`/`__proto__` are rejected.
- **F3:** the interfaces extend `MetadataOptions`, with per-command tr tests.
- **F4:** the received value is quoted in the refusal.
- **Condition "language not mapped into BookMetadata":** held. No result had a `language` key, checked with `'language' in b` across the results.

## Advisories (non-blocking)

**A1. A same-titled foreign Google volume can still fill a book's other gaps.**

- **Priority:** P4. **Confidence:** medium.
- **Evidence:** I used a synthetic copy of `google-books-volume-foreign.json` with its title changed to "Thinking, Fast and Slow" and `language: tr`. Open Library had no qualifying edition. `lookup` then returned publisher "Varlik Yayinlari" (a publisher I added to the copy), published 2015-08-01, the Google cover and volumeId rAUFswEACAAJ, all through `fillGaps`. The real captured volume, with its Turkish title, is rejected by title matching and contributes nothing.
- **Expected:** condition 2 says a foreign volume "keeps everything except its ISBN", so this is the specified design, not a regression.
- **Actual:** foreign publisher, date and cover can reach a note when a translation shares the original title.
- **Recheck:** only if the owner wants condition 1's "no publisher/published" to hold at the `lookup` level rather than only in the Open Library search.

**A2. The plan log's status line is stale.**

- **Priority:** P4. **Confidence:** high.
- **Evidence:** `docs/log/2026-09-26-title-lookup-foreign-isbn.md` still says "plan, revision 3, awaiting owner decision. Nothing implemented." It shipped in the commit that implements it.
- **Expected:** the status reflects that it is implemented.
- **Actual:** the stale text above.
- **Recheck:** read the line.

## Disclosures

- **Shared scratchpad:** the scratchpad directory is shared with the orchestrator. My first CLI loop pointed `--cache` at its existing `cache\` directory. No entries were added: it still has 3 files, timestamped 19:02, from before my session. I left the orchestrator's files (cache, capture, build.txt, repro.mts and others) untouched. I removed all my own scratch files and the junctions, and the repo's `node_modules` is intact.
- **No live network:** I made no live network call. Every probe used a fixture-backed or recording `get`, or a refusal path.
