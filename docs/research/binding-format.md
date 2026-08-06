# Do the providers know a book's binding format?

Research for [#52](https://github.com/mephistopheles4/stacks/issues/52), a
sub-issue of [#50](https://github.com/mephistopheles4/stacks/issues/50) (books
that read as books). Nothing here is implemented; this is the evidence a
binding-variety ticket should be written from.

Every count below is measured against **the 33 books in
`packages/site/public/library.json` as currently built** — the real vault, not
the fixtures — and against **the 118 real provider responses in the main
checkout's `.cache/`**. Live lookups were made on **2026-08-05**, one-off from
the command line, rate-limited to roughly one request per 1.1 s. Nothing was
written into `.cache/`; G21 forbids a live call from the suite and no test was
added.

**The live numbers are perishable.** Open Library is crowd-edited, and its
`physical_format` is `/type/string` with no enumeration — confirmed at
[`/type/edition.json`](https://openlibrary.org/type/edition.json), which defines
it as `{"expected_type": {"key": "/type/string"}, "name": "physical_format",
"unique": true}` and nothing more. A reviewer re-running this in three months
will get different counts. The *shape* of the answer is what should survive.

## The verdict

**Binding is not knowable. It must be declared or inferred.**

Open Library answers for **3 of the 15 physical books**. Google Books and Apple
Books have **no binding field at all** — not sparsely populated, absent from the
schema. A fourth of the library is knowable only in the negative sense that it
is not a codex.

And the sharpest number in this whole document:

> **No provider has ever once said "hardcover" about a book that actually stands
> on this shelf as a physical object.** All three Open Library answers for the
> 15 print books are `paperback`. Every one of the four `hardcover` claims lands
> on a book the vault says is an audiobook.

`buildBook` renders all 33 as hardbacks. Issue #50 asserts that is unrealistic;
this is the measurement behind the assertion, and it points the other way from
the default.

## Per provider

| Provider | Field | Where it sits | Present / total | Distinct values seen |
| --- | --- | --- | --- | --- |
| **Open Library** — `/isbn/<isbn>.json`, or `/api/books?…&jscmd=details` | `physical_format` | **Edition**, top level. Not on the work — confirmed below | **9 of 27 with an ISBN**; 7 of those name a physical binding | `hardcover` ×4, `paperback` ×2, `Paperback` ×1, `ebook` ×1, `[electronic resource] :` ×1 |
| **Open Library** — `/search.json` | `format` | Solr doc, **work-level**, a `list[str]` aggregated across every edition | **11 of 33 docs**; 7 single-valued, 4 multi-valued | 18 distinct across 33 queries, listed below |
| **Open Library** — `/api/books?…&jscmd=data` | — | — | **0 of 33.** The curated dictionary omits it | — |
| **Google Books** | — | — | **0.** No such field exists | — |
| **Google Books** | `printType` | `volumeInfo` | 89 of 89 cached volumes | `BOOK` only. Documented values are `BOOK` or `MAGAZINE` — a different question, as the ticket says |
| **Google Books** | `dimensions` | `volumeInfo` | **0 of 89 cached volumes** | Documented (`height`/`width`/`thickness`, cm) and never populated here |
| **Apple Books** | — | — | **0.** No such field exists | `kind` is `ebook` for all 152 cached results |

Google's field list is not inferred from the cache — it is the published
[Volume resource
reference](https://developers.google.com/books/docs/v1/reference/volumes), whose
`volumeInfo` carries `title, subtitle, authors[], publisher, publishedDate,
description, industryIdentifiers[], pageCount, dimensions, printType,
mainCategory, categories[], averageRating, ratingsCount, contentVersion,
imageLinks, language, previewLink, infoLink, canonicalVolumeLink` and no binding
field. The 89 cached volumes agree with it exactly, plus `readingModes`,
`maturityRating`, `panelizationSummary` and `allowAnonLogging` — none of them
binding.

Apple is a storefront selling ebooks and audiobooks; `entity=ebook` returns 20
keys, `entity=audiobook` returns 19, and the intersection with "physical object"
is empty. The single occurrence of the string `Paperback` anywhere in the cache
is inside a Google `description` — free marketing prose, for a Harari box set
that is not even one of the 33 books.

## Do the fetchers already receive it and throw it away?

**No. Nothing binding-shaped arrives today** — `physical_format` appears **zero
times across all 118 cached responses**. There are exactly three metadata
endpoints in production code (`open-library.ts:17–18`, `google-books.ts:20`,
`apple-books.ts:21`; everything else that fetches is a cover download), so there
is no fourth call that might already have it.

Two different reasons, and they want different fixes:

- **`open-library.ts:28` asks for `jscmd=data`.** That mode assembles a curated
  dictionary — works, authors with URLs, formatted subjects, excerpts, table of
  contents, covers, ebook availability. `jscmd=details` returns the *raw edition
  document*, which is where `physical_format` lives. Verified two ways: at
  source in
  [`openlibrary/plugins/books/dynlinks.py`](https://github.com/internetarchive/openlibrary/blob/master/openlibrary/plugins/books/dynlinks.py),
  and empirically — `jscmd=details` and `/isbn/<isbn>.json` returned **identical
  values for all 27 ISBNs**, and the two `jscmd=data` responses sitting in
  `.cache/` carry field sets with no `physical_format` in them. Open Library's
  own docs say `details` is retained for backward compatibility and `data` is
  the more stable format, so switching the primary call is not free of cost.
- **`open-library.ts:63` sends an explicit `fields=` allowlist to
  `search.json`** — `title,author_name,isbn,number_of_pages_median,cover_i`. The
  solr doc *does* carry `format`; a doc requested with `fields=*` has 74 keys and
  exactly one of them is binding-related. **This is the one place a value is
  narrowed away rather than absent**, and adding one word to a list already being
  sent costs zero extra requests.

**And it still does not answer the question.** That is the finding, not the
cheap win. Measured over all 33 books, replicating `searchByTitle`'s query
exactly with `format` added to the list:

| | count |
| --- | --- |
| docs carrying `format` | 11 of 33 |
| single-valued | 7 |
| multi-valued | 4 |
| single-valued **and** a physical binding | 5 |
| …of which the book is not an audiobook | **2** |

Two, against three from the ISBN path. The free field is worse than the
expensive one.

## Why the values are a mess

Open Library's solr `format` is the edition's `physical_format` **verbatim**.
From [`openlibrary/solr/updater/edition.py`](https://github.com/internetarchive/openlibrary/blob/master/openlibrary/solr/updater/edition.py):

```python
@property
def format(self) -> str | None:
    return self._edition.get("physical_format")
```

No lowercasing, no mapping, no controlled vocabulary. Thirty-three queries
produced eighteen distinct values:

```
hardcover  Hardcover  paperback  Paperback  Brochura  ebook  eBook
audio cd  Audio CD  Audio Cassette  Audio cassette  audible audiobook
kindle edition  Audiobook  preloaded digital audio player
Calendar  Cards  [electronic resource] :
```

Read that list as a specification and three things fall out. **Case is not
normalised** — `hardcover`/`Hardcover` and `Audio Cassette`/`Audio cassette` are
distinct strings in the same result set. **The language is not fixed**:
`Brochura` is Portuguese for paperback, from a Brazilian edition of *Thinking in
Systems*. And **`[electronic resource] :` is not a format at all** — it is a MARC
245 `$h` general material designation with its subfield punctuation still
attached, describing an Internet Archive scan rather than any object. Any
consumer needs a normalisation table, a fallback for the unrecognised, and — by
`cover_source.ts`'s own precedent — must treat "unrecognised" and "absent" as
different things.

There is also no rule about *when* the field is populated. It is not provenance:
of the six editions checked for `source_records`, one with a `marc` record has no
`physical_format` (*The Charisma Myth*) while one with only an `amazon` record
has one (*Staff Engineer*). It is whatever a volunteer or an importer happened to
write.

## The 15 physical books, one by one

The other 18 are audiobooks; see the next section for why that is certain.

| Book | pages | `physical_format` | search `format` |
| --- | --- | --- | --- |
| The Power of Now | 235 | **Paperback** | `hardcover, Audio CD, eBook, Hardcover, preloaded digital audio player, paperback, Paperback, Calendar, Audio Cassette, Audio cassette, Cards` |
| NieR : Automata | 256 | **paperback** | `paperback` |
| Staff Engineer | 371 | **paperback** | `paperback` |
| Learning Systems Thinking | — | `ebook` | `ebook` |
| Nexus | 528 | — | `paperback, Hardcover` |
| Staff Engineer's Path | 521 | — | `audible audiobook, kindle edition, audio cd` |
| The Charisma Myth | 272 | — | `audio cd` |
| AI and the Future of Leadership | 112 | — | — |
| AI Snake Oil | 384 | — | — |
| Effective | 263 | — | — |
| Getting Out Of Control | 268 | — | — |
| Practical AI Governance | 355 | — | — |
| The Human-Agent Orchestrator | 412 | — | — |
| Vibe Coding | 336 | — | — |
| We Are as Gods | 320 | — | — |

Three answers. Seven ISBN lookups 404'd outright — all recent, mostly `979-8`
prefixes, which is what a 2025–26 title or a self-published one looks like to a
catalogue.

Two rows are worth staring at. *The Power of Now* returns eleven formats for one
work, including `Calendar` and `Cards`, because the aggregation is over every
edition Open Library has ever seen. And *The Charisma Myth* returns exactly one
value, `audio cd`, unambiguous and confident — for a book the vault records as
272 pages. **Single-valued is not the same as correct**, which rules out the
obvious "take it when there is only one" heuristic.

### The ISBN is not necessarily the edition on the shelf

`preferIsbn13` (`open-library.ts:116–120`) picks the first 13-digit ISBN out of
a search doc's jumbled list of *every* edition's ISBNs:

```ts
const all = value.filter((item): item is string => typeof item === 'string');
return all.find((isbn) => normaliseIsbn(isbn).length === 13) ?? all[0];
```

So an ISBN in a note is not guaranteed to identify the copy its owner holds, and
`physical_format` is an *edition* field — precise about the wrong object is still
wrong. One demonstrated mismatch: *AI Engineering* carries `9798341671317`, while
the O'Reilly trade paperback is `9781098166304`. That book is audiobook-tagged
and `audible.ts` writes no ISBN at all, so this is a mechanism plus one
observation, not a proven cause. It is enough to stop anyone treating an
ISBN-derived binding as authoritative without checking.

## The thing the vault already knows

**18 of 33 books are audiobooks**, and this is certain rather than inferred.
`import/audible.ts:96–107` writes the tag unconditionally:

```ts
/** Always tagged `audiobook`, so the shelf can tell them apart later. */
function tagsFrom(value: unknown): string[] {
  …
  return ['audiobook', ...categories];
}
```

An audiobook has no binding, so this does not answer the ticket's question — but
it does mean **more than half the shelf is rendering hardback boards for
something that was never a physical object**, which is a larger fidelity problem
than hardback-versus-paperback and belongs in whatever ticket #50 spawns.

It also means every provider answer for those books describes an edition the
owner does not own. Open Library confidently reports `hardcover` for four of
them — *The Business of Expertise*, *The Win Without Pitching Manifesto*, *An
Elegant Puzzle*, *The Singularity Is Nearer*. All four are correct about a print
edition and wrong about this library.

**A correction for #50.** The map records as established fact, "so nobody
re-derives it", that the aspect clusters are *0.63–0.68 (24 print), 0.762 (3) and
1.000 (6 audiobook squares)*. The clusters are right; the reading of the third
one is not. There are **18** audiobooks, not 6. Twelve of them carry a
print-shaped cover, because the importer prefers a print edition's artwork over
the export's own square art (`metadata/index.ts`'s `fillGaps` and the note on
`coverUrls`). **Cover aspect under-detects audiobooks by a factor of three.** Six
of six square covers are audiobooks, so the signal has no false positives — it
simply misses two thirds of them. The `audiobook` tag catches all 18.

One gap for the handoff: `audible.ts` also writes `source: audible`, `narrator`,
`asin` and `duration` into frontmatter as extra keys, and they are stronger
signals than a tag anyone could type by hand — but `library.ts`'s
`toLibraryBook` maps a fixed field list and drops them. **`tags` is the only
channel that reaches the shelf today.**

## Is there a signal without a provider?

Asked because the ticket asks it. The answer is no for binding, and yes for
something else.

**Cover aspect does not predict binding.** The three confirmed hardcovers sit at
0.662, 0.666 and 0.676; the three confirmed paperbacks at 0.656, 0.666 and 0.666.
The distributions do not merely overlap, they interleave — 0.666 appears in both.
This is unsurprising once stated: a hardback and its paperback reissue share a
trim size and the same cover artwork, and `coverAspect` is measured off the
downloaded JPEG (`covers/measure.ts`), so it describes the *image*, which
describes the *trim*, which says nothing about what is glued to it.

**Page count does not predict binding.** Confirmed hardcovers: 144, 233, 288,
419. Confirmed paperbacks: 235, 256, 371. Fully overlapping, and the thinnest
book in the library is a hardcover.

**But the 0.762 cluster is a real trade format, and that is worth keeping.** All
three are professional-technical trim, 7 × 9⅛–9³⁄₁₆ in ≈ 0.762, and the
publishers confirm it rather than the arithmetic guessing at it:

| Book | aspect | pages | publisher (Open Library edition record) |
| --- | --- | --- | --- |
| AI Engineering | 0.762 | 442 | O'Reilly Media, Incorporated |
| Learning Systems Thinking | 0.7617 | — | O'Reilly Media, Incorporated |
| We, Programmers | 0.7617 | 453 | Pearson Education, Limited |

Two O'Reilly animal books and one Addison-Wesley professional title, which is
exactly the population that trim serves. None of the three carries a
`physical_format`, so this is a strong prior and not a provider fact — but a
prior with a publisher behind it, and O'Reilly's print run for *AI Engineering*
is a trade paperback. If the shelf ever infers binding, "0.762 and a technical
publisher means a large trade paperback" is the one inference here with evidence
under it.

The `1.000` cluster is Audible artwork, six for six, and is covered above.

## What this leaves for the map

Stated as constraints on whatever ticket #50 spawns, not as a design:

- **A provider round-trip cannot fill this in.** Three of fifteen, with two
  known-wrong single values in the same dataset, is not a data source; it is a
  coin flip with extra steps. Any design that assumes the shelf can *look up* a
  binding should be abandoned rather than scoped.
- **Declaring it is cheap and matches the constitution.** Invariant 5 makes
  hand-edited notes first-class and the parser tolerant of extra keys, so a
  `binding:` key costs one optional entry in the frontmatter contract, one line
  in `library.ts`, and nothing at runtime. The vault is the source of truth
  (invariant 1); this is a fact about the owner's copy that only the owner
  reliably knows.
- **The default matters more than the lookup**, because the default is what 30
  of 33 books will use. Today it is "hardback", and the only measured evidence
  in this document points at paperback for physical books and at "not a codex at
  all" for 18 of them.
- **If any provider field is wired up, `physical_format` needs the
  `cover_source.ts` treatment** — a normalisation table, a strict allowlist, and
  absent kept distinct from unrecognised. `Brochura` and `[electronic resource] :`
  are in the live data for this library right now, and a typo must not read as a
  binding any more than it may read as a permission.
- **Nothing here costs texture memory or a draw call**, which is the one nice
  thing about the answer: binding is an input to `buildBook`'s geometry, not a
  new per-book texture. #50's two hard budgets are untouched by the decision this
  ticket unblocks.
