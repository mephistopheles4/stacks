# Security review — title lookup foreign ISBN, revision 2

`security-reviewer`, 2026-09-26, on
[`2026-09-26-title-lookup-foreign-isbn.md`](2026-09-26-title-lookup-foreign-isbn.md)
revision 2. Verbatim below; dispositions are the owner's and are recorded in the
plan once made.

---

## Security review: `STACKS_LANGUAGE` plan (docs/log/2026-09-26-title-lookup-foreign-isbn.md)

**Verdict: the plan's validation design is sound. Nothing here is Medium or higher.** The language value cannot inject anything, leak anything or poison the cache. There are three Low findings and one Info item. The most useful amendment costs one line: step 2 should *read* the `language` field that step 1 already asks for. That makes the filter fail closed whatever happens to the query text.

### Findings

| # | Severity | Headline |
| --- | ---------- | ---------- |
| 1 | Low | The language clause shares `q` with the user's title, so title syntax can disable it or break the request |
| 2 | Low | Core's table lookup must be own-property only; a core-side throw is swallowed on the import path |
| 3 | Low | Three options interfaces redeclare `googleBooksKey`, so a dropped `language` silently becomes English |
| 4 | Info | `loadEnv` keeps inline comments, so the refusal message should echo the value it received |

**1. The language clause shares `q` with the title (Low, partly measured).**

- **Trust boundary.** Titles come from three places: the `add` argument, hand-edited note titles (`packages/core/src/enrich.ts:162`) and the Audible export (`packages/core/src/import/index.ts:130-134`). All three are joined to ` language:<code>` in one `q` (`packages/core/src/metadata/open-library.ts:109`). `encodeURIComponent` protects the URL. It does nothing about Solr query syntax.
- **Open Library's parser (source read, not live-verified).** On a parse error, `process_user_query` re-runs `fully_escape_query` over the whole `q`, so the language clause becomes literal text.
- **Live probes, 2026-09-26:**
  - `Sapiens language:eng` returns 692 hits, all edition language `eng` (control).
  - `"Sapiens language:eng` (unbalanced quote) returns `numFound: 0`.
  - `Sapiens ( language:eng` returns `numFound: 0`.
  - `Sapiens OR Homo language:eng` returns **HTTP 500, twice**. Controls with the same words: `Sapiens OR Homo` (no clause) gave 7109 hits and `Sapiens AND Homo language:eng` gave 355.
- **Impact.**
  - **Parse failures fail to zero hits,** not to a foreign edition. The lookup falls to Google, where step 4 guards the ISBN. No foreign-ISBN bypass was observed.
  - **The `OR` case is new behaviour.** `http.ts:30` treats 500 as transient, so each such title costs Open Library 3 requests with backoff (`http.ts:34-47`). A failed response is never cached (`http.ts:69`), so every `enrich` run repeats it. Open Library is volunteer-run. Uppercase `NOT` is untested.
- **Remediation.**
  - **Primary:** in step 2, take edition-scoped fields only when `editions.docs[0].language` contains the mapped 639-2/B code. Otherwise take step 3's "no edition → no ISBN" path. Any future query-composition surprise then fails closed.
  - **Test:** a fixture edition with `language: ['pol']` must yield no ISBN and no OLID.
  - **Optional:** for the 500, lowercase a bare `OR` token in the title before composing, or accept the cost and state it in the ADR.

**2. Core's table lookup and core-side re-validation (Low, hypothesis about code not yet written).**

- **Why injection is structurally impossible.** Core should interpolate the table's own constant 639-2/B value, never the input string.
- **The condition.** The lookup must be own-property only: a `Map`, `Object.hasOwn`, or a null-prototype object. A plain `TABLE[code]` returns inherited members (`constructor`, `toString`) to any caller that skips the CLI regex. The union type does not stop that: `as`-casts and JS callers bypass it, and `scripts/capture-lookup-recall.ts:55` calls `lookup` directly.
- **Recommendation.** Yes, core should re-check at that lookup and throw on a miss.
- **Caveat.** `packages/core/src/import/index.ts:139-141` catches every lookup error and falls back to the export cover. A core throw is therefore silent on `import`. The CLI refusal is the check that actually stops a bad value there, and finding 1's response check is the backstop.
- **No conflict with the house rule.** A bad option is a programming error, not the "API had a bad afternoon" case that `metadata/index.ts:18-20` degrades on.

**3. A dropped setting silently becomes English (Low).**

- **Where.** `AddBookOptions`, `EnrichOptions` and `ImportOptions` each redeclare `googleBooksKey` rather than extending `MetadataOptions`: `packages/core/src/add-book.ts:21`, `packages/core/src/enrich.ts:99`, `packages/core/src/import/index.ts:41`.
- **Why it works today.** Each forwards its whole options object to `lookup` (`add-book.ts:78`, `enrich.ts:163`, `import/index.ts:130-134`).
- **How it breaks.** A builder who picks fields individually, or narrows a type, drops `language`. Core's default then makes it English. The plan itself names that as the worst outcome ("indistinguishable from the setting working").
- **Remediation.** Make the three interfaces extend `MetadataOptions`. Add one test per command that `language: 'tr'` reaches the Open Library URL as `language:tur`. The plan lists only one `lookup`-level test.

**4. The refusal message should echo the value (Info).** `loadEnv` does not strip inline comments (`packages/cli/src/env.ts:100-107`). So `STACKS_LANGUAGE=en # English` arrives as `en # English` and is refused, which is correct and fails loud. Print the received value in quotes (for example with `JSON.stringify`) so the owner can see why.

### Checked, and nothing found

- **Validation design.** `^[a-z]{2}$` plus table membership, after trimming and lowercasing, is a strict allowlist. It refuses rather than falling back. Empty means unset. This is correct.
- **Refusal placement.** All three reads happen before any vault write: `packages/cli/src/index.ts:61` before `addBook`, `:185` before the enrich loop, `:367` before `importBooks`. Replacing them with `metadataOptionsFromEnv()` at the same points keeps that.
- **Cache key.** The language becomes part of the URL, so each language gets its own cache entries and nothing collides. The filename is a 128-bit sha256 hex prefix, so the value cannot shape a path (`packages/core/src/metadata/http.ts:59-60`).
- **Reach into logs, notes and the site.** Neither `toMetadata` carries a language field (`open-library.ts:149-165`, `google-books.ts:129-155`). The plan adds no frontmatter key, and the public build reads only the vault. **One condition:** the new `language` array in the Open Library response must not be mapped into `BookMetadata`, or it could reach a note.
- **Google comparison.** It is a read-only comparison. The value is never sent to Google, because `langRestrict` was rejected. A mismatch only drops the ISBN, which fails safe.
- **The title in `q`.** Unvalidated user text in the same parameter is pre-existing. It is the owner's own input to a public read-only API and encoded at `open-library.ts:109`, so it is not a security issue beyond finding 1.

### Unverified notes for plan-reviewer (not security)

- **Language subtags.** Google may report region subtags such as `zh-CN`, so a strict equality check would drop ISBNs for `zh`. Unmeasured.
- **Open Library issue #12688** (title only, not read): requesting the `editions` field may filter out works that match only on work-level fields. If true, it adds to the plan's "drops out of Open Library" cost.

### Verification approach

- **Finding 1:** a unit fixture with a non-matching edition language, asserting no ISBN and no OLID. Optionally, one captured response for an `OR` title to pin the 500 behaviour.
- **Finding 2:** a unit test that the core mapping rejects `'constructor'` and `'__proto__'`.
- **Finding 3:** a per-command test (add, enrich, import) that `language` reaches the URL.
- **Finding 4:** a CLI test that the refusal message contains the quoted received value.

### Sources

- [Open Library worksearch `process_user_query` (raw source)](https://raw.githubusercontent.com/internetarchive/openlibrary/master/openlibrary/plugins/worksearch/schemes/__init__.py)
- [Open Library issue #12688](https://github.com/internetarchive/openlibrary/issues/12688)
- [Open Library Search API docs](https://openlibrary.org/dev/docs/api/search)
- Live probes: `https://openlibrary.org/search.json?q=…&fields=key,title,language,editions`, with the six variants listed in finding 1.
