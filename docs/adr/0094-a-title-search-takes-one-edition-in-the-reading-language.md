# ADR-0094 — A title search takes one edition, in the reading language

**Date:** 2026-09-26
**Status:** accepted
**Plan:** [`docs/log/2026-09-26-title-lookup-foreign-isbn.md`](../log/2026-09-26-title-lookup-foreign-isbn.md),
revision 3, with its [plan review](../log/2026-09-26-title-lookup-foreign-isbn-plan-review.md)
and [security review](../log/2026-09-26-title-lookup-foreign-isbn-security-review.md)

## Decision

A title search takes its ISBN from **one edition**, and only from an edition in
the **reading language**.

- **Open Library.** The search asks for `key`, `language` and `editions` as
  well, and appends ` language:<639-2/B>` to `q`. Each work doc then carries
  `editions.docs[0]`: one edition, chosen by Open Library as the best match for
  `q`, projected onto the same field list. `isbn`, `publisher`,
  `publish_date`, `cover_i` and the OLID (the edition's own `key`) come from
  that edition, and **only when its own `language` array holds the reading
  language**. `title`, `author_name`, `number_of_pages_median` and `subject`
  come from the work, which the projection does not carry.
- **No matching edition, no ISBN.** No `editions`, or an edition in another
  language, means no `isbn`, `publisher`, `published`, OLID or cover — and no
  guessed by-ISBN cover. The old rule, the first 13-digit ISBN in the work's
  list, is gone: falling back to it would put the bug back on the fallback
  path. Within one edition the 13-digit form is still preferred, because an
  edition's list is its own ISBN-10 and ISBN-13.
- **Google.** A title-search volume whose `volumeInfo.language` primary subtag
  (`zh-CN` compares as `zh`) differs from the reading language is returned
  **without its ISBN** and otherwise unchanged. A volume that reports no
  language keeps its ISBN. The by-ISBN lookup is not filtered: an ISBN names
  its edition.
- **The reading language is `MetadataOptions.language`**, ISO 639-1, default
  `en`, set by `STACKS_LANGUAGE`. The CLI reads it once, in
  `metadataOptionsFromEnv`, before any vault write, and **refuses** anything
  that is not `^[a-z]{2}$` and in the table, quoting the value it received.
  Core re-checks at its entry points and throws on a miss. Both providers take
  the language as a required parameter, and `AddBookOptions`, `EnrichOptions`
  and `ImportOptions` extend `MetadataOptions`, so a dropped language is a type
  error rather than a silent English.

## Evidence

`lookup('Thinking, Fast and Slow')` on 2026-09-26 returned `9789754345315`
(Varlık Yayınları, Turkish), `publisher: CreateSpace Independent Publishing
Platform`, Google's Turkish volume `rAUFswEACAAJ` and a Turkish OLID. The work
doc spans 36 editions, 60 ISBNs and 8 languages, and `publisher[0]`,
`publish_date[0]`, `edition_key[0]` and `cover_i` were each a *different*
edition's value. The Turkish ISBN then reached Google's by-ISBN lookup, which
faithfully answered with the Turkish volume.

What Open Library does, measured live the same day:

| Query | Edition projected | Language |
| --- | --- | --- |
| `Thinking, Fast and Slow` | OL36689110M, 9780385676519, Doubleday Canada | eng |
| `Hızlı ve Yavaş Düşünme` | OL35605099M, 9789754345315, Varlık | tur |
| `Sapiens` (also with the author, or `&lang=en`) | OL26592198M, 9788377059968, PWN | **pol** |
| `Sapiens language:eng` | OL27700871M, 9780771038518, Signal | eng |
| `Thinking, Fast and Slow language:eng` | OL36689110M | eng |

**The projection alone is not enough.** It picks by title match, so a
translation that keeps the English title — *Sapiens* in Polish — wins, and
`&lang=en` changes nothing. A `language:` clause inside `q` does filter
editions, and a work with no edition in that language drops out. Without `key`
in `fields`, `editions` comes back empty; `editions.<sub>` syntax does too.

## Why these, and not the alternatives

- **An environment variable, not a hard-coded English.** The day the owner
  reads a book in another language, one variable changes rather than code.
- **ISO 639-1 in, ISO 639-2/B out.** 639-1 is what a person types and what
  Google reports. Open Library tags editions with 639-2/B — `fre`, `ger`,
  `chi`, `dut`, not 639-2/T's `fra`, `deu`, `zho`, `nld` — so a table of about
  thirty languages maps one to the other, with no dependency.
- **The table is a `Map`**, so the lookup is own-property only: a plain object
  answers `constructor` with a function. Only the table's constant value is
  ever interpolated into the query, never the input string.
- **Refuse, never fall back.** A bad `STACKS_LANGUAGE` silently read as English
  is the one outcome indistinguishable from the setting working.
- **The response is checked, not only the query.** The clause shares `q` with
  the title, so title syntax can reach it: an unbalanced quote or parenthesis
  turns it into literal text (`numFound: 0`), and a bare `OR` made Open Library
  answer **HTTP 500, twice** — which `http.ts` retries three times and never
  caches, so every `enrich` run would re-ask. Bare `OR`, `AND` and `NOT` are
  lowercased before composing (`NOT` untested, treated alike), and reading the
  edition's own `language` makes any other surprise fail closed.
- **Google's ISBN is dropped, not the volume.** Ranking, matching and G26 are
  untouched. `langRestrict` was rejected because it changes every Google search
  URL, so every cached response and every G26 fixture key would move with it.
- **Unknown language keeps the ISBN.** Dropping it would cost dedup on every
  volume that reports none.

## Consequences

- **Right language, not right printing.** This yields *an* edition in the
  reading language that matches the query — Doubleday Canada here — not
  necessarily the one on the owner's shelf.
- **It fixes new lookups, not notes already written.** `enrich` never
  overwrites a key a note has. An audit of foreign ISBNs already in the vault
  is separate work.
- **Every cached Open Library search goes cold**, because the URL is the cache
  key. The next `enrich` re-asks Open Library for every note still missing a
  field and carrying no ISBN.
- **A work whose editions in the reading language carry no language tag drops
  out of Open Library** and falls to Google. Unmeasured; it is the price of
  filtering on a tag.
- **Asking for `editions` may itself drop works** that match only on work-level
  fields — Open Library issue #12688, read by title only. Also unmeasured, and
  also a fall to Google.
- **A title with an unbalanced quote or parenthesis** loses Open Library's
  language clause and falls to Google. That fails closed and is not worked
  round.
- **A foreign Google volume can still be a contributor on the no-ISBN path.**
  `fillGaps`' Google title-search candidate can pass `isProbablySameBook` as a
  same-titled translation and supply pages, cover, author, `volumeId` and the
  merged fields — never the ISBN. Filtering contributors by language is a
  wider change.
- **Google language subtags are unmeasured**: every `language` in
  `fixtures/api/` is a bare `en`.
