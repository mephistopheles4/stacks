# A title lookup carries a different-language edition's ISBN — plan

Status: **implemented in 954096b; result check CONFIRMED**
([result check](2026-09-26-title-lookup-foreign-isbn-result-check.md)). The
ADR is [0094](../adr/0094-a-title-search-takes-one-edition-in-the-reading-language.md),
not 0093 as written below — #392 took 0093 first. The plan below is revision 3
as approved, kept unedited. Revisions 1 and 2 were reviewed ([plan review](2026-09-26-title-lookup-foreign-isbn-plan-review.md),
[security review](2026-09-26-title-lookup-foreign-isbn-security-review.md)).
The owner chose option B plus an environment override, fix (a) for the first
review's finding, and accepted all four security findings as recommended.

## The bug, reproduced live

`lookup('Thinking, Fast and Slow', get, {googleBooksKey})` on 2026-09-26 made
three requests and returned `isbn: 9789754345315` (Varlık Yayınları, Turkish),
`publisher: CreateSpace Independent Publishing Platform`,
`published: 2015-08-01`, `volumeId: rAUFswEACAAJ` (Google's *Hizli ve Yavas
Düsünme*, `language: tr`), `openLibraryOlid: OL62456765M`.

| # | Request | What went wrong |
| --- | --------- | ----------------- |
| 1 | OL `search.json?q=Thinking, Fast and Slow&fields=…` | Doc 1 is the **work**: 36 editions, 60 ISBNs, 8 languages. `preferIsbn13` takes the first 13-digit one — Turkish. `publisher[0]`, `publish_date[0]`, `edition_key[0]` and `cover_i` are each an arbitrary, *different* edition's value. |
| 2 | Google `volumes?q=isbn:9789754345315` | Faithfully returns the Turkish volume. `fillGaps` trusts an ISBN lookup as identity (correct), so Google becomes a contributor. |
| 3 | Apple `search?term=…` | Fine — English, matched by title. |

`mergeFields` then lets Google win `published` (`2015-08-01`, the Turkish
volume's date) and `volumeId`. **The ISBN enters at request 1, in
`open-library.ts` `toMetadata`**; everything after it is correct behaviour given
a wrong ISBN. Commit 6554e29 (`sameIsbn`, branch
`claude/thinking-fast-slow-dedup-8f3867`, no PR) would not catch this: Google's
volume does carry the ISBN asked for. The two changes compose; this one does not
stack on it.

## What Open Library can do instead — measured, not assumed

Adding `key` and `editions` to `fields=` makes each work doc carry
`editions.docs[0]`: **one edition**, projected onto the same field list, chosen
by Solr as the best match for `q`. (Without `key` in the list, `editions` comes
back empty; `editions.<sub>` syntax also comes back empty.)

| Query | Edition returned | Language |
| ------- | ------------------ | ---------- |
| `Thinking, Fast and Slow` | OL36689110M, 9780385676519, Doubleday Canada | eng |
| `Thinking, Fast and Slow Daniel Kahneman` | same | eng |
| `Hızlı ve Yavaş Düşünme` | OL35605099M, 9789754345315, Varlık | tur |
| `Factfulness` / `+ Hans Rosling` | OL31991320M, 9781529387155, Sceptre | eng |
| `Sapiens` / `+ Yuval Noah Harari` / `&lang=en` | OL26592198M, 9788377059968, PWN | **pol** |
| `Sapiens language:eng` | OL27700871M, 9780771038518, Signal | eng |
| `Thinking, Fast and Slow language:eng` | OL36689110M (as above) | eng |

**The edition projection alone does not meet the requirement.** It picks by
*title* match, so a translation that keeps the English title (*Sapiens* in
Polish) wins. `&lang=en` changes nothing. A `language:<code>` clause inside `q`
does filter editions — and works: a work with no edition in that language drops
out.

## Decisions (owner, 2026-09-26)

- **The reading language is an option, `MetadataOptions.language`, default
  English, overridable by `STACKS_LANGUAGE`.** Not hard-coded: the day the owner
  adds a book read in another language, one variable changes rather than code.
- **Google's title-search path is fixed too** (review finding, fix (a)): a
  Google title-search volume whose `language` differs from the configured one
  keeps everything except its ISBN. `langRestrict` was rejected because it
  changes every Google search URL, so every cached response and every G26
  fixture key would move with it.

## The language setting

- **One code, ISO 639-1** — `en`, `tr`, `pl` — because that is what a person
  types and what Google's `volumeInfo.language` reports. Open Library tags
  editions with **ISO 639-2/B** (`eng`, `tur`, `fre`, `ger`, `chi`, `dut` —
  measured in today's response; the /B forms, not /T's `fra`, `deu`, `zho`,
  `nld`). A small table in `metadata/language.ts` maps one to the other: the ~25
  languages with meaningful book catalogues, zero dependencies.
- **Validated once, where it is read, and a bad value refuses.** The value is
  interpolated into a Solr query, so it is never passed through raw: it must be
  `^[a-z]{2}$` *and* a key of the table. `STACKS_LANGUAGE=english`,
  `en-GB`, or `eng` stops the command with a message naming the variable and
  listing the accepted codes. Silently falling back to English would be the one
  outcome indistinguishable from the setting working. Case is normalised
  (`EN` → `en`), whitespace trimmed; empty means unset. **The refusal quotes
  the value received** (`JSON.stringify`): `loadEnv` keeps inline comments, so
  `STACKS_LANGUAGE=en # English` arrives as `en # English` and the owner must be
  able to see why it was refused (security finding 4).
- **Where**: `packages/cli/src/` gains one `metadataOptionsFromEnv()` that
  builds `{ googleBooksKey, language }` — the three call sites in
  `cli/src/index.ts` (add, enrich, import: lines 61, 185, 367) read the key
  separately today and would otherwise each grow a second read. All three sit
  before any vault write, so a refusal writes nothing. It keeps a literal
  `process.env['STACKS_LANGUAGE']` read, which G9 (`env-contract`) needs.
- **Core re-checks, own-property only** (security finding 2). The table is a
  `Map<string, string>` in `metadata/language.ts`; core resolves the code
  through `openLibraryLanguage(code)`, which throws on a miss. Core only ever
  interpolates the table's **constant** 639-2/B value, never the input string,
  so injection is structurally impossible. `MetadataOptions.language` is typed
  as the table's key union, but the type is not relied on: `as`-casts and
  scripts bypass it. ⚠️ `import` catches every lookup error
  (`import/index.ts:139-141`), so a core throw is silent there — the CLI refusal
  is the check that stops a bad value on that path, and the response check in
  step 2 is the backstop.
- **The option cannot be dropped silently** (plan review P2, security
  finding 3). `AddBookOptions`, `EnrichOptions` and `ImportOptions`
  (`add-book.ts:21`, `enrich.ts:99`, `import/index.ts:41`) stop redeclaring
  `googleBooksKey` and **extend `MetadataOptions`**. Google's `searchByTitle`
  takes the language as a **required** parameter, so both call sites in
  `metadata/index.ts` (the fallback at 71, `fillGaps` at 299) must pass it and a
  missed one is a type error. The default `en` is applied once, in `lookup`, and
  nowhere below it.
- `.env.example` documents `STACKS_LANGUAGE`, commented out, default stated.

## The change

1. **Open Library search** (`open-library.ts`). `SEARCH_FIELDS` gains
   `key,language,editions`. `searchByTitle` takes the language and appends
   ` language:<639-2/B>` to `q`. The URL is built by one exported function that
   `capture-api-fixtures.ts` also calls, so a re-capture cannot ask a different
   question. **A bare `OR` token in the title is lowercased** before composing
   (security finding 1): measured live, `Sapiens OR Homo language:eng` answers
   **HTTP 500 twice**, and `http.ts` retries a 500 three times and never caches
   it, so every `enrich` run would re-hit a volunteer-run service for that title.
   Same for bare `AND` and `NOT`, which have the same Solr meaning (`NOT`
   untested; treated alike rather than measured one by one). A lowercase `or` is
   an ordinary search word to Open Library.
2. **Every edition-scoped field comes from that one edition — and only when
   that edition's own `language` array contains the configured 639-2/B code**
   (security finding 1). The query clause is the filter; this is the check. Any
   query-composition surprise — an unbalanced quote or parenthesis, measured to
   drop Open Library's language clause into literal text — then fails closed
   into step 3 instead of trusting whatever edition came back. The edition's
   `language` is read for this check and **never mapped into `BookMetadata`**,
   so it cannot reach a note. The edition-scoped fields are `isbn`,
   `publisher`, `published`, `cover_i` (so the cover), and `openLibraryOlid` from
   the edition's `key` — not the work's `edition_key[0]`, which is equally
   arbitrary. **From the work**: `title` (ranking and `isProbablySameBook`
   compare against it, and the work title is the canonical one), `author_name`,
   `number_of_pages_median`, `subject` — the edition projection has none of them.
3. **No matching edition → no ISBN.** When `editions.docs` is empty or absent,
   or its edition fails step 2's language check, the result
   carries no `isbn`, `publisher`, `published` or OLID, and no speculative
   by-ISBN cover URL. **`preferIsbn13` is deleted**: falling back to it would
   reinstate the bug on the fallback path.
4. **Google title search** (`google-books.ts` `searchByTitle`). A volume whose
   `volumeInfo.language` is present and whose **primary subtag** (the part
   before any `-`, lowercased — so `zh-CN` compares as `zh`) differs from the
   configured language is returned without `isbn`. Subtags are unmeasured: all
   31 `language` values in `fixtures/api/` are a bare `en`. Everything else about it is unchanged, so ranking and
   G26's matching are untouched. **A volume with no `language` keeps its ISBN** —
   unknown is not a mismatch, and dropping it would cost dedup on every such
   volume; stated in the ADR. Google's **by-ISBN** lookup is not filtered: an
   ISBN names its edition, and the fix in step 1 means a foreign ISBN no longer
   reaches it from a title search.
5. **Scope, stated honestly**: this yields *an* edition in the configured
   language matching the query (Doubleday Canada here), not necessarily the
   printing on the owner's shelf. Right language, not right printing.

## Tests — red first

- **Open Library regression**: add `open-library-search-language.json` to
  `capture-api-fixtures.ts` — the real response for *Thinking, Fast and Slow* at
  the new URL (bibliographic JSON only). Assert `searchByTitle` returns
  `9780385676519` and OLID `OL36689110M`; a second assertion with `editions`
  removed from a copy in the test proves step 3 (no ISBN, no OLID). Red against
  today's code.
- **Google regression**: the Turkish volume `rAUFswEACAAJ` reached through
  `lookup(title)` on the Google-primary path (Open Library answering
  `numFound: 0`) yields no ISBN; the same volume with `language: en` keeps it.
  Built from the captured volume with its `description` removed — bibliographic
  fields only.
- **Response language check** (security finding 1): the regression fixture's
  edition with its `language` changed to `['pol']` in a test-local copy yields
  no ISBN and no OLID.
- **`OR` neutralised**: `searchByTitle('Sapiens OR Homo', …)` asks a URL whose
  `q` carries `or`, not `OR`, and still ends ` language:eng`.
- **Language setting**: `metadataOptionsFromEnv` — unset or empty → `en`;
  ` TR ` → `tr`; `english`, `en-GB`, `eng`, `xx`, `en # English` → throws naming
  `STACKS_LANGUAGE` and quoting the received value.
- **Core mapping**: `openLibraryLanguage` rejects `constructor`, `__proto__`,
  `toString` and `eng`; accepts `en` → `eng`, `fr` → `fre`, `de` → `ger`,
  `zh` → `chi`, `nl` → `dut` (the /B forms Open Library was measured to use).
- **The non-default language reaches every path — red first** (plan review
  P2): with `language: 'tr'`,
  - `lookup(title)` on the Google-primary path keeps a `tr` volume's ISBN and
    drops an `en` volume's — fails if the fallback call site or
    `google-books.ts` uses `en` regardless;
  - the same through `fillGaps`' title-search call site (Open Library primary,
    no matching edition) — fails if that call site uses `en`;
  - `addBook`, `enrich` and `importBooks` each, given `language: 'tr'`, make
    an Open Library request whose `q` ends `language:tur` (security finding 3).
- **Hand-built `/search.json` mocks** (`metadata.test.ts:62-65`,
  `enrich.test.ts:122`, `add-book.test.ts`, `enrich-report.test.ts`) keep
  matching by substring, but their bodies lack `editions`, so search-path ISBN
  assertions change. Captured bodies are re-captured; hand-built ones gain an
  `editions` block with a stated reason — never a loosened assertion.
- **G26 `lookup-recall.json`**: all five Open Library searches there answer
  `numFound: 0` (reviewer-checked), so no outcome can move; only their URL keys
  change. Re-capture those five through `capture-lookup-recall.ts` against the
  owner's `.cache/`; Google and Apple entries replay from cache unchanged. If any
  G26 outcome moves anyway, the PR says so, one line each.

## Costs

- **Every cached Open Library search in the owner's `.cache/` goes cold** — the
  next `enrich` re-asks Open Library for every note still missing a field and
  carrying no ISBN. `enrich` never overwrites a key a note has, so **this fixes
  new lookups, not notes already written.** An audit of foreign ISBNs already in
  the vault is a separate ticket.
- **A work whose editions in the configured language carry no language tag now
  drops out of Open Library** and falls to Google. Not measured; the frequency is
  unknown. It is the price of filtering on a tag, and the ADR says so.
- **Asking for `editions` may itself drop works** that match only on
  work-level fields — Open Library issue #12688, title read, body not. Also
  unmeasured; recorded beside the cost above, since both push a lookup to
  Google.
- **A title with an unbalanced quote or parenthesis** loses Open Library's
  language clause (measured: `numFound: 0`), so it falls to Google. Fails
  closed; recorded, not worked around.
- `docs/spec/provider-provenance.md` §8.2 names `edition_key` as the OLID route;
  updated to the edition's `key`.
- **ADR-0093** (highest on `main` and every remote branch is 0092; re-checked
  before commit): *a title search takes one edition, in the reading language.*
  Records option B and the env override, the `Sapiens` measurement, "no edition →
  no ISBN", the Google ISBN drop and why not `langRestrict`, and the 639-1/639-2/B
  mapping.
- **Commands and docs**: `.env.example`; `docs/commands.md` if it lists
  environment variables.

## Residuals, not in scope

- **A foreign Google volume can still be a contributor on the no-ISBN path.**
  `fillGaps`' Google title-search candidate passes `isProbablySameBook` on a
  same-titled translation and can supply pages, cover, author, `volumeId` and
  the merged fields — **never the ISBN** (`fillGaps` does not read the
  candidate's ISBN, and step 4 removes it anyway). Filtering contributors by
  language is a wider change.
- The ISBN path (`stacks add <isbn>`) is untouched: an ISBN names its edition.

## Gates

`pnpm test && pnpm build`, `pnpm lint`, `pnpm lint:md`, `pnpm format:check`.
One commit, `fix(core): a title search takes one edition's ISBN, in the reading language`.

## Security review — dispositions (owner, 2026-09-26)

Findings verbatim in the [security review](2026-09-26-title-lookup-foreign-isbn-security-review.md).
Verdict there: design sound, nothing Medium or higher.

| # | Severity | Finding | Disposition | Where it landed |
| --- | ---------- | --------- | ------------- | ----------------- |
| 1 | Low | The language clause shares `q` with the user's title, so title syntax can disable it or break the request | Accepted: response-side language check, bare `OR`/`AND`/`NOT` lowercased | The change, steps 1–3; tests; costs |
| 2 | Low | Core's table lookup must be own-property only; a core-side throw is swallowed on the import path | Accepted: `Map`, core re-checks and throws; CLI refusal is the stop on `import` | The language setting |
| 3 | Low | Three options interfaces redeclare `googleBooksKey`, so a dropped `language` silently becomes English | Accepted: interfaces extend `MetadataOptions`; per-command tests | The language setting; tests |
| 4 | Info | `loadEnv` keeps inline comments, so the refusal message should echo the value it received | Accepted: refusal quotes the value | The language setting; tests |

Plan review P2 of revision 2 (the setting not proven to reach Google) is
answered by the required Google parameter and the non-default-language tests.

## Routing

`STACKS_LANGUAGE` is external input interpolated into a query, so under the
owner's rules the security review above came first and the build goes to
`security-builder`.
