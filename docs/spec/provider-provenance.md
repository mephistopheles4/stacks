# Spec — what provenance a book's note records

**Status:** locked.
**Sources:** [#96](https://github.com/mephistopheles4/stacks/issues/96) (the
recording decision), [#94](https://github.com/mephistopheles4/stacks/issues/94)
and [#100](https://github.com/mephistopheles4/stacks/issues/100) (which ids build
a working URL), [#99](https://github.com/mephistopheles4/stacks/issues/99) (how
existing notes acquire them),
[#102](https://github.com/mephistopheles4/stacks/issues/102) (how far the merge's
fields travel).

---

## 1. What a contributor is

**A contributor is a provider whose record was confirmed to be this book** — by
ISBN lookup, or by `isProbablySameBook`.

This is an **identity** claim, not a data-flow claim, and that is the point. The
alternative — *"a provider whose data reached the note"* — means "supplied the
cover" today and "supplied fields" after the merge revision, so the same key
would mean two different things either side of it and every note written before
would need re-reading.

Under this definition **Apple was already a contributor and always has been**:
`findCover` runs `isProbablySameBook` at `apple-books.ts:50`, establishes the
matched record *is* this book, and discards everything but the artwork URL. The
fact was never missing; it was thrown away.

**Metadata provenance is a sibling of `cover_source`, never folded into it.**
Core splits them deliberately (`metadata/types.ts:2` — *"Not the same question as
`CoverSource`"*). `cover_source` records where a cover's **bytes** came from and
is not evidence of which provider *described* the book.

---

## 2. What is recorded

**The contributor set *is* the set of id keys present.** There is no separate
`contributors:` list and none is needed — a list would be derivable from the id
keys, and a derived value stored beside its source is exactly the drift this
repo's gates exist to catch.

| Frontmatter key | `BookRecord` / `LibraryBook` field | Value | Shape check | Builds a link |
| --- | --- | --- | --- | --- |
| `google_volume_id` | `googleVolumeId` | Google's `volumeId` | alphanumeric volume key | yes |
| `apple_track_id` | `appleTrackId` | Apple's numeric `trackId` | digits | yes |
| `openlibrary_olid` | `openLibraryOlid` | OLID, e.g. `OL26445570M` | `OL\d+M` | yes |
| `oreilly_ourn` | `oreillyOurn` | `urn:orm:book:…` | `urn:orm:book:…` | **no** |

**No winner key.** `MetadataSource` (`metadata/types.ts:10`) stays internal and
continues not to reach a note. A single note-level winner is only meaningful
while the merge is record-level, and the merge is now field-level — the key would
be born describing something that no longer exists. Anything finer than the
contributor set is per-field provenance, which nobody asked for.

**And the precedence table cannot reconstruct attribution anyway.** Fixed
provider orders make the *rule* static, but which provider actually supplied a
given field still varies per book, because a provider only wins a field it
happens to have. So declining per-field provenance is correct rather than
coincidental.

---

## 3. Four scalar keys, and that is forced rather than preferred

`updateBook` **leaves a key whose value is a list exactly as it is** — flow
collections included, per `obsidian-adapter.ts:268-283` — so a list-valued
provenance key could never be written by `stacks enrich` or `stacks covers
--backfill`. A nested mapping fails the same way.

Choosing per-provider scalars is what let the backfill question be decided on its
own merits instead of by an adapter limitation.

**Key names name the provider's own field, and for O'Reilly that is the guard.**
CLAUDE.md documents `archive_id` as a trap: for one book it is `0642572352530`,
which passes an ISBN-13 check digit while starting `064`; for another it is a
well-formed 979 ISBN *seven off* the book's real one. The value recorded here is
`ourn`, a different field. A key named `oreilly_id` would invite pasting the
wrong one, and the shape check below would pass it because both are well formed.
**The name does work no validator can.**

### O'Reilly is recorded although it cannot be linked

Its library URLs 307 to a **403** whether the book exists or not. It is recorded
anyway, because contribution was defined by *matching* and O'Reilly's match is as
real as Google's.

**The case that decides it is an O'Reilly early release**: Open Library has never
heard of it, Apple has never heard of it, Google has nothing. Recording only
linkable providers would leave the book with the least provenance available
anywhere carrying none here either. The card renders no link for it — the same
way it renders nothing for a provider that did not match. `ourn` is also not dead
weight: it already builds the cover URL at `oreilly.ts:128`.

### Ids, never URLs

Apple hands back a finished `trackViewUrl`. **The note stores `trackId` and the
site builds the URL.**

Every other provider already works this way, so this is uniformity — but the
reason it matters is specific. A provider URL lands in an `href`, and the card's
`textContent`/`replaceChildren` rule protects **text**; it does nothing for an
`href`. Hand-edited notes are first-class (invariant 5), so a stored URL is not
guaranteed to have come from Apple at all. With an opaque id, the worst a
corrupted value can do is 404 — it cannot navigate somewhere a third-party
response or a mistyped line chose.

Verified rather than assumed: `books.apple.com/us/book/id{trackId}` resolves
**without** the title slug (Apple's 301 reconstructs it from the id), and
off-by-one and invented ids **hard-404** rather than landing on a neighbouring
product. So the fallback — store `trackViewUrl`, validate the host at parse — is
not needed.

---

## 4. Unrecognised values are dropped at parse, per provider

Shape-checked at the parse edge and **dropped on mismatch**, mirroring
`cover_source`'s rule at the same edge: the failure is a *missing* link rather
than a dead one. `cover_source`'s reasoning does not transfer literally — that is
a closed enum and an id is opaque — but **shape is checkable where value is not**
(see the table in §2).

⚠️ **This is a typo guard and explicitly not a correctness guarantee.** A
well-formed wrong id passes and always will — the `archive_id` example above is
precisely that. It earns its place because, unlike the ISBN URL's graceful page
for an unknown ISBN, **all three working id URLs hard-404 on a stale id**. A
wrong id is a dead link on a public page, so dropping the obviously malformed
ones is worth the little it buys. Reading it as more than that is the mistake
CLAUDE.md's `cover_source` note already warns about.

This is invariant 3's rule applied per key: a malformed id drops, the note still
parses, the book still shelves.

---

## 5. There is no inference route, and that is why the pass exists

`cover_source` had the same problem and solved it without touching the
providers — `covers/infer-source.ts` guesses a cover's origin from the shape of
the file on disk. **That escape hatch does not exist here.** A note records an
*answer*, never who gave it, so a Google `volumeId` cannot be recovered from a
note at any price. **Re-fetching is the only route**, which is why the backfill
is a real pass rather than a footnote.

**The pass is `stacks enrich`** — the four id keys join `FILLABLE`, and ids and
re-merged fields come out of one set of responses by construction. Everything
about how it runs (cache, rate limits, "run it twice", what happens when a
provider cannot supply an id, the identity bar, the report) is specified in
[`metadata-merge.md`](metadata-merge.md) §6, because it is one pass and splitting
its description across two files is how two documents end up describing it
differently.

⚠️ **The consequence that reaches everything else in this effort: all four id
keys and all three merge fields are absent on every note that exists today.** The
card cannot be judged against the real library until `enrich` has run.

---

## 6. All seven fields reach `library.json`, in both builds

Four id keys (this file) plus `publisher`, `published` and `subjects`
([`metadata-merge.md`](metadata-merge.md)) become `LibraryBook` fields, in the
**public and the local build alike**.

**Marginal exposure is near zero**: these are public bibliographic pointers to
books the build already lists by title, author and ISBN. O'Reilly's id ships too,
so that the contributor set means the same thing publicly as locally — otherwise
the decision holds only on the owner's own machine, and a public card on an early
release shows no contributor at all.

**Rejected:** any of them staying vault-only. The variant with a real case was
`subjects` — the one field with no shelf-side consumer, and the vault would give
it Obsidian search for free. It lost to consistency: a reader of `library.json`
should not have to know which of the merge's fields happened to be judged
interesting.

**Be exact about the mechanism, because it is easy to state wrongly.**
`toLibraryBook` **enumerates** its fields (`library.ts:79`), so a new
`BookRecord` field ships only when someone adds a `keyIfPresent` line — nothing
reaches a public build by accident.

⚠️ **But "local only" *is* expressible, contrary to what was claimed twice on
this map.** `toLibraryBook` already ends:

```ts
return isPublic ? book : { ...book, sourcePath: record.sourcePath };
```

That ternary **is** a per-build tier, shipping today, carrying exactly one field.
A local-only field is one more key in that spread. It did not change the answer
here — all seven ship publicly — but the next work that wants a local-only field
should find the tier rather than the claim.

`description` stays out: it is a note-body section, not a `BookRecord` field, so
no build can carry it.

---

## 7. Gates

Numbers deliberately unassigned; roster in [`README.md`](README.md#gate-roster).

**P1 — `BookRecord` → `library.json`, both directions.** No gate holds this seam
today. G8 runs frontmatter ↔ parser ↔ CLAUDE.md and **stops at the parser**;
`gates/build-modes.test.ts` pins the two known per-build differences
(`sourcePath` stripped, `coverAspect` stamped) but cannot notice a *new*
`BookRecord` field nobody gave a `keyIfPresent` line. **Seven new fields cross
that seam in this effort.**

In G8's own idiom — a runtime fixture, no source parsing:

- a **fully-populated `BookRecord`** through `buildLibrary`; every record field
  must appear in the output, **except a named exclusion set**;
- **the reverse**: every `LibraryBook` key must trace back to a record field or
  to a **named** derived one (`id`, `coverAspect`).

*The named exclusion set is the whole point* — a field deliberately kept out of
the artifact has to be **named** there, which is what stops "we meant to" and "we
forgot" from looking identical.

Rejected: extending `build-modes.test.ts` with assertions naming these three (it
catches nothing about the eighth field — the same gap one iteration later);
extending G8 one link further (G8's identity is the frontmatter contract, and a
red G8 would stop telling you which seam broke); no gate.

**P2 — whole-pass idempotence.** Run `enrich` twice over a fixture vault against
a stubbed `HttpGet`; **every note byte-identical after run two.** This is the
**only** gate that reaches the `## About` body insert — the sixth adapter method,
and "the riskiest write this project would own" — because a body section is not a
`FILLABLE` key and the absent-only gate cannot see it. It asserts the claim
rather than the branch (the G27 lesson) and follows Phase 4's precedent that
re-running an import is idempotent. G21-safe: no live calls.

**P3 — convergence after a provider failure.** Stub a provider to fail on run one
and answer on run two; assert the id lands. This asserts that the rate-limit
answer is *true* — that a 429'd book self-heals. Without it, the whole pacing
decision rests on an undocumented property of `http.ts` that nothing checks, and
a well-meant change adding negative caching would break it silently.

Each new gate costs a row in [`docs/gates.md`](../gates.md), which **G19**
(`constitution-scoreboard`) enforces in both directions.

---

## 8. Implementation costs recorded so nobody rediscovers them

1. **`findCover` must return the matched `trackId`, not only an artwork URL.**
   The match is already computed; only the return type is in the way. This is
   **one change** with [`metadata-merge.md`](metadata-merge.md) §2's return-type
   change, not two.
2. **Open Library's OLID is cheap but not free.** The ISBN path already receives
   it — `"key": "/books/OL26445570M"` is in
   `fixtures/api/open-library-isbn-hit.json:4`, in a response `open-library.ts:28`
   already fetches and simply does not read. The **search** path needs
   `edition_key` added to the `fields=` list at `open-library.ts:63`. Neither
   costs an extra request. ⚠️ **But the HTTP cache is keyed by URL, so widening
   `fields=` invalidates every cached Open Library search fixture**, and G21
   forbids live calls in tests. Re-capturing them is part of the cost.
3. **Apple's slug-less URL form** — discharged, see §3.

---

## 9. Residuals

1. **The shape check is a typo guard, not a correctness guarantee**, and every id
   URL hard-404s on a stale value.
2. **`apple_track_id` is title-matched on all 41 books** — no ISBN endpoint
   exists. A wrong id is invisible until a visitor clicks it.
3. **A provider that cannot supply an id leaves a permanent gap**, re-asked on
   every run forever, with nothing recorded in the note.
4. **35 of 41 real books carry `pages` with no recoverable provenance.** A book
   whose Google data predates ids and which Google can no longer match is
   unattributable *in principle* — the "no inference escape hatch" in §5 makes
   that unclosable. See [`attribution-surface.md`](attribution-surface.md) §5.
