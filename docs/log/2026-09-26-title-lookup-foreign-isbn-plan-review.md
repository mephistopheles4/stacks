# Plan review — title lookup foreign ISBN

`plan-reviewer`, 2026-09-26, on
[`2026-09-26-title-lookup-foreign-isbn.md`](2026-09-26-title-lookup-foreign-isbn.md).
Verbatim below.

---

REVISE

Headline: Google-primary title results still carry foreign-language ISBNs (P2)
Blocker: The requirement is "a title lookup never carries an ISBN from a different-language edition". The plan fixes this only on the Open Library path. When Open Library has no matching result, `searchByTitle` (index.ts:63-91) falls back to Google's title search. That search has no language restriction (google-books.ts:53 builds `volumes?q=…&maxResults=5` with no `langRestrict`). `rankAgainst` can then make a Google volume the primary (index.ts:166-174), and its own ISBN goes through unchanged. `enrich` then writes that ISBN into the note (enrich.ts:181-183). A same-titled translation passes `isProbablySameBook`, and that is exactly the plan's own *Sapiens* case. The plan's residual (line 122-125) says this path is "never the ISBN". That is false for a Google primary: it is only true for `fillGaps`' candidate. Option A also makes this path busier. Any work with no Open Library edition matching `language:eng` now drops out and goes to Google (plan line 51-55). That includes works whose English editions carry no language tag, which the plan never measured.
Evidence: packages/core/src/metadata/index.ts:63-91 and 166-174; packages/core/src/metadata/google-books.ts:48-53; packages/core/src/enrich.ts:181-183; plan docs/log/2026-09-26-title-lookup-foreign-isbn.md:51-55 and 122-125.
Minimum revision: Choose one and write it into the plan. (a) Extend the fix to Google's title-search path: `langRestrict=en`, or drop the `isbn` from a Google title-search result whose `volumeInfo.language` is not `en`. Add a test for it. (b) Re-scope the requirement to Open Library-sourced ISBNs. Correct the residual so it says a Google-primary title result can still carry a foreign ISBN, and have the owner accept that explicitly. Either way, fix the false "never the ISBN" sentence.
Acceptance check: The plan either (a) names the change to the Google title-search path plus a red-first test in which a Google title-search volume with `language` not `en` yields no ISBN from `lookup(title)`, or (b) states the narrowed requirement, and its residual section no longer claims the Google path never supplies the ISBN.

Checked and not blocking:

- **G26 (`lookup-recall`) is unaffected.** All five Open Library searches in fixtures/api/lookup-recall.json return `numFound: 0` (lines 3, 345, 874, 1334, 1642). "No edition, no ISBN" and `language:eng` cannot change any G26 outcome. Only the URL keys move.
- **The hand-built `/search.json` mocks are covered by the plan's "update with stated reason" step.** These are in enrich.test.ts, enrich-report.test.ts, add-book.test.ts and metadata.test.ts. The affected assertions include metadata.test.ts:62-65 and enrich.test.ts:122. enrich-report fills pages from the work, which is unaffected.
- **Sourcing the cover from the edition keeps `coverIsSpeculative` semantics consistent.** Taking `cover_i` from the edition, with a speculative by-ISBN fallback built from the English ISBN, keeps the meaning at open-library.ts:142-164 intact.
- **Fixture copyright is consistent with existing practice.** The new fixture is bibliographic search JSON with no cover binaries and no text. Note that docs/plan.md:40-44 literally allows only one such response. The repo already exceeds that, so this adds nothing new.

---

## Revision 2 — `plan-reviewer`, 2026-09-26, verbatim

REVISE

Headline: No security-reviewer findings or dispositions recorded in the plan (P1)
Blocker: The plan says it is security-sensitive: `STACKS_LANGUAGE` is external input interpolated into a Solr query. Yet it sends itself to `security-reviewer` "alongside" plan review rather than before it. No security-reviewer findings or dispositions appear anywhere in the plan. A readiness judgment on an input-validation unit requires those findings to be recorded first.
Evidence: docs/log/2026-09-26-title-lookup-foreign-isbn.md:179-183 (routing section); the plan has no security-reviewer section.
Minimum revision: Run `security-reviewer` on revision 2. Record its findings, and the owner's disposition of each, in the plan (or in a linked kept file). Then resubmit.
Acceptance check: The plan links or contains the security-reviewer's verbatim findings, with a disposition per finding. Any changes they force are reflected in "The language setting" and "The change".

Headline: The language setting is not proven to reach anything beyond Open Library (P2)
Blocker: The plan claims core "cannot be handed an unvalidated string by a typed caller". That is false for the three real entry points. `AddBookOptions`, `EnrichOptions` and `ImportOptions` declare only `googleBooksKey`. The CLI builds their options with spreads inside object literals, and TypeScript does not excess-check spread properties. So `language` would reach `lookup` only because each function happens to forward its whole `options` object, not because any type carries it. On the Google side, step 4 does not say where the language comes from. `index.ts:71` (the fallback) and `index.ts:299` (`fillGaps`) call `googleBooks.searchByTitle(query, get, apiKey)`. With an optional or defaulted parameter, either call site can silently use `en`. Every Google test in the plan runs at the default `en`. A hard-coded `'en'` in `google-books.ts`, or a missed call site, passes the whole planned suite. The plan itself names this failure as the one to avoid: "silently falling back to English would be the one outcome indistinguishable from the setting working" (line 76).
Evidence: packages/core/src/add-book.ts:16-22, 78; packages/core/src/enrich.ts:97-100, 163; packages/core/src/import/index.ts:41, 130-134; packages/core/src/metadata/index.ts:71, 299-303; packages/core/src/metadata/google-books.ts:48-53; packages/cli/src/index.ts:62-66, 209-212, 368-372; plan lines 79-84, 104-111, 129-132.
Minimum revision: Make the three core option interfaces carry `language` (for example, by extending `MetadataOptions`). Make the language a required parameter of Google's `searchByTitle`, so both `index.ts` call sites must supply it. Add one red-first test in which, with `language: 'tr'`, a `tr` Google title-search volume keeps its ISBN through `lookup(title)`.
Acceptance check: The plan names the three interfaces and the required Google parameter. Its test list includes a non-default-language Google assertion that would fail if either `index.ts` call site, or `google-books.ts`, used `en` regardless of the option.

Checked and not blocking:

- **The revision 1 P2 (Google-primary foreign ISBN) is resolved.** Step 4 filters inside `google-books.ts` `searchByTitle`, which both callers use (`index.ts:71` and `:299`). The planned Turkish-volume test through `lookup(title)` meets the old acceptance check. The rewritten residual is now true: `fillGaps` takes only cover, pages and author from its candidate (`index.ts:322-340`), and `mergeFields` never touches `isbn`.
- **Google language tags in the captured corpus are all bare codes.** All 31 `"language"` values under `fixtures/api/` are exactly `"en"`. None is `en-GB`, `zh-CN`, `iw` or similar. So the exact-inequality comparison drops no English ISBN on the default path. Region-tagged codes for other languages are a P3 refinement.
- **G26 tiebreaks are safe.** `completeness()` (`index.ts:139-146`) counts `isbn`, so "ranking untouched" does not hold in principle. But `lookup-recall.json` has no non-`en` Google volume, so no G26 tie can move. The plan's "PR says so" line covers the rest.
- **G9 (`env-contract`) is satisfied.** It needs a literal `process.env['STACKS_LANGUAGE']` read plus a `# STACKS_LANGUAGE=` line in `.env.example`, and the plan provides the documentation. An injected env map would fail G9 loudly at build time, not silently.
- **Scripts and gates that call `lookup` without a language get the default `en`.** `scripts/capture-lookup-recall.ts:55` and `gates/lookup-recall.test.ts:57,74` both do, so capture and replay ask the same question. `scripts/capture-api-fixtures.ts:19,47` already builds its URL from `SEARCH_FIELDS`, and the plan extends that to one shared URL builder.
- **No gate pins `edition_key`, `SEARCH_FIELDS` or `preferIsbn13` text**, apart from the capture script.

---

## Revision 3 — `plan-reviewer`, 2026-09-26, verbatim

READY
