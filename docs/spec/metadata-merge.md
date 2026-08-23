# Spec — the metadata merge, and the pass that runs it

**Status:** locked.
**Sources:** [#95](https://github.com/mephistopheles4/stacks/issues/95) (what each
provider discards), [#97](https://github.com/mephistopheles4/stacks/issues/97)
(precedence, fields taken, containers),
[#99](https://github.com/mephistopheles4/stacks/issues/99) (the backfill pass),
[#52](https://github.com/mephistopheles4/stacks/issues/52) (binding, confirmed
struck).

---

## 1. The shape: one default order, named per-field exceptions

**The merge was never a global ranking.** `fillGaps` fills gaps from **Google
only** — Open Library never completes a Google-primary record (`index.ts:242`
short-circuits it) — and on top sit three named exceptions (`completePages`,
`preferAppleArtwork`, `borrowOReillyCover`). That structure is _kept_: one chain
for the record, plus exceptions where the chain gives a worse answer.

**Default order — Open Library → Google → O'Reilly → Apple.** Governs `title`,
`author`, `isbn`, `publisher`.

| Field         | Order                                    | Why it overrides the default                                                                                                                      |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages`       | Google by `volumeId`, then default       | a search response reports `pageCount: 0` where the detail endpoint has the real number (existing `completePages`; `metadata/types.ts:38-47`)      |
| `cover`       | Apple → O'Reilly → default               | Apple is ~800×1200 against Google's ~128px; O'Reilly rescues books whose only cover is Open Library's 43-byte placeholder (existing)              |
| `published`   | Google → O'Reilly → Apple → Open Library | Open Library gives a bare `"2008"`; the other three give full dates                                                                               |
| `subjects`    | Google → Apple → O'Reilly → Open Library | Google's `categories` and Apple's `genres` are short and curated; Open Library's 35 raw subjects are noise in a capped scalar                     |
| `description` | O'Reilly → Google → Apple                | Open Library has none; O'Reilly only _has_ a record when it is an O'Reilly book, where its own copy is authoritative; Apple's carries HTML markup |

**`pages` and `cover` are exceptions implemented as mechanisms, not as
orderings**, and they are deliberately absent from `FIELD_ORDER` in the code:
`completePages` re-asks Google for the volume it already chose, and the cover
queue is assembled by the downloader from `coverUrlLarge` before `coverUrl`.
Neither is expressible as a ranking over gathered records. **G31** asserts their
absence rather than letting it pass unremarked, so "deliberately not there" and
"forgotten" cannot look the same.

**Every exception is a fixed provider order, and never a rule about the value.**
Rules like _"prefer the most precise date"_ were rejected deliberately: they only
approximate an ordering anyway ("prefer a full date" _is_ "put Open Library last
for dates"), while a fixed table is testable with one fixture per field, states
itself in a line, and can be asserted by a gate. A quality judgement embedded in
the merge would have to be re-encoded in the gate to check it.

⚠️ **Accepted cost: when a provider's data quality changes, the table is wrong
until a human notices and edits it.** Nothing detects that.

**The _ask_-order does not change.** O'Reilly is still asked only when neither
Open Library nor Google found the book — that is a quota decision in CLAUDE.md
with a far larger blast radius than this work. Ranking only ever picks among
providers that actually returned a record.

**This table is a contract**, and gate **M1** ([§7](#7-gates)) holds it to the
code in both directions.

---

## 2. Apple becomes a full metadata contributor

`findCover` returns the **matched record** instead of a bare artwork URL, and
Apple joins the ranking for `description`, `published` and `subjects`.

The expensive part was already done and thrown away: `isProbablySameBook`
confirms the record _is_ this book at `apple-books.ts:50` before the function
discards everything but one URL. Only the return type was in the way.

**Asked for every book, not opportunistically.** Today `preferAppleArtwork` runs
only when the cover is weak (`index.ts:211-216`). Harvesting Apple's fields only
when that gate happens to open would make a book's recorded facts depend on
whether its cover was weak — invisible in the note, unreproducible, and two books
with identical inputs would differ.

⚠️ **Cost:** one extra request per `add`/`enrich` where many books skip it today,
against iTunes' **~20 calls a minute**. Keyless and free, so no quota — but a
hard constraint on a whole-vault pass. See [§6](#6-the-pass).

**`findCover`'s return type change is one change, not two** — it must also return
the matched `trackId` for [`provider-provenance.md`](provider-provenance.md).

---

## 3. Which fields are taken

**Taken:** `publisher`, `published`, `subjects`, `description`.

**Not taken, with reasons on the record:**

- `language` — Google and O'Reilly only; on a mostly-English library it writes
  `en` on some books and nothing on the rest, recording _which provider answered_
  rather than a fact about the book.
- user ratings — unreliable on Apple, unnormalised across providers.
- price — irrelevant to a reading tracker.
- series/position, translator, edition statement — absent from all four.

**`binding` stays struck.** The audit found no binding field on any provider,
confirming [#52](https://github.com/mephistopheles4/stacks/issues/52) rather than
reopening it. Inference from cover aspect or page count remains permanently
struck.

---

## 4. Containers

Two facts drove every choice. **`updateBook` leaves a list value alone** rather
than mangling it (`vault-adapter.ts:38`; G4 was red on arrival over exactly
this), so a list-valued field can be written to a _new_ note and never maintained
on an existing one. And **`toLibraryBook` enumerates its fields**, so nothing
reaches a public build by accident — publishing is structurally opt-in.

| Field         | Container                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `publisher`   | frontmatter scalar                                                                                                            |
| `published`   | frontmatter scalar, **stored verbatim** — whatever the winning provider said, timestamp included                              |
| `subjects`    | frontmatter scalar, **`; `-joined**, capped at 5 in the winning provider's own order; Apple's generic `"Books"` genre dropped |
| `description` | **note body**, its own `## About` section above `## Notes`                                                                    |

⚠️ **`published` is stored verbatim, and this supersedes [#97](https://github.com/mephistopheles4/stacks/issues/97)'s
own "`YYYY` or `YYYY-MM-DD`, never a timestamp".** [#102](https://github.com/mephistopheles4/stacks/issues/102)
§4 ruled later and explicitly **rejected** normalising at write time as _"the one
irreversible option on the table"_ — undoing it means re-asking the providers,
which is a whole network pass. The note keeps `2019-03-05T07:00:00Z` if that is
what Apple said; **tidiness is a display need** and lives in the card, which
renders the first four-digit run and falls back to the string verbatim
([`enhanced-card.md`](enhanced-card.md) §2). This also keeps the repo's standing
date precedent intact: `started` and `finished` are opaque strings (`types.ts:68`),
unvalidated, stored as given.

The widths still vary — Open Library gives a bare `"2008"` and can win the field
outright when it is the only provider holding a record — but nothing normalises
them on the way in. **Do not write a normaliser.**

### The `subjects` separator is `; `, and a comma would have been a silent bug

Provider category values **contain commas natively**. Not hypothetically — this
repo's own G26 corpus holds Apple's `"Health, Mind & Body"`, and Apple is
_second_ in the subjects order. Comma-joined and split back on `,`, one genre
silently becomes two, and nothing goes red.

- **Separator: `; `** — `subjects: systems thinking; business & economics; science`
- **Split on `;`, trim each part.** No escaping, no quoting.
- **A subject value that itself contains a `;` is dropped, not written.** Fail
  closed, the same reflex as `private:` and `cover_source`: a separator collision
  must never invent a subject no provider said. Dropping one of five capped
  subjects is invisible; a phantom subject is a wrong fact in the vault.

No `;` and no `|` appears in any category value in any current fixture — the
guard exists because a provider can add one tomorrow and nothing would notice.

⚠️ **The separator is a fact two packages hold.** The site splits on `;` too
(the card renders `subjects` — [`enhanced-card.md`](enhanced-card.md) §2), which
is the same shape as the mobile breakpoint. Gate **M1** pins it.

### `## About`: why the body, and what it costs

The recommendation was to rule descriptions out of scope entirely — 600–700 words
cannot sit in frontmatter without fighting `updateBook`'s line rewriter and
taxing invariant 5's hand-editable notes with a multi-thousand-character property
above every note, forever. The owner took descriptions anyway, note-local, and
then chose the body over a capped frontmatter scalar.

That buys something no frontmatter option could: **"never published" becomes
structural rather than a discipline.** A body section is not a `BookRecord` field
at all, so it cannot reach `library.json` by any path. "Add no `keyIfPresent`
line" was the weaker guarantee.

⚠️ **`VaultAdapter` gains a sixth method.** CLAUDE.md's contract block lists five
and none of them writes a body. This is the riskiest write this project would
own — surgical insertion into a file the owner hand-edits — and it is the reason
`updateBook` rewrites lines rather than re-serialising. Two rules constrain it,
both inherited rather than new:

1. **Written only when the `## About` heading is absent.** That is the absent-only
   rule applied to a section, and it is also what makes a re-run idempotent — no
   second `## About` appended.
2. **Apple's description is markup-stripped to plain text** before writing. The
   audit found `<b>` tags in it.

⚠️ **Invariant 2's future allowlisted-section publishing must never name
`## About`.** The whole point of the owner's answer was note-local; an allowlist
that picked this section up later would publish third-party marketing prose under
the owner's name. An allowlist and never a denylist is what makes this safe to
state once — but it has to be stated, and the CLAUDE.md edit in
[`README.md`](README.md#contract-edits) does state it.

---

## 5. Absent-only holds unconditionally

**The ticket that opened this feared a merge change silently rewriting titles,
authors and page counts on books that were fine. Under today's write paths it
cannot.** There are three surfaces, not one:

| Surface               | What it does                         | Guard                                                                          |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `lookup` / `fillGaps` | decides which provider's record wins | none — this _is_ the merge                                                     |
| `addBook`             | writes a **new** note                | `BookInput` is a closed list (`add-book.ts:131`)                               |
| `enrichBook`          | writes to an **existing** note       | `FILLABLE` (`enrich.ts:24`) **and** every write is `if (book.X === undefined)` |

A pure merge change alters what a brand-new `stacks add` records, and which value
fills an existing _gap_. A page count already present is never touched.

**The trap is the mirror image: taking a new field in the merge writes it
nowhere.** `BookInput` and `FILLABLE` are both closed lists, so a merge that
starts carrying `publisher` would put it in no note at all. **Fields and
write-permission move together, or the decision is inert.**

**Decided: the merge changes, `BookInput` and `FILLABLE` grow to match, and every
write stays conditional on the key being absent.** `enrich`'s _"fills missing
metadata … never overwriting"_ survives intact.

⚠️ **The accepted cost, stated plainly: a book already carrying a wrong value
keeps it forever, and correcting it stays a hand edit.** That was taken knowingly
over relaxing absent-only for a named set of keys. The failure this work was
opened against is **structurally prevented rather than detected** — which is why
gate **M2** asserts the claim rather than a branch.

### `FILLABLE` after this work

⚠️ **Two namespaces are live here and must not be mixed.** `FILLABLE` entries
index `book[field]` on a `BookRecord` (`enrich.ts:24,58`), so they are **camelCase
field names**; the `changes` object handed to `updateBook` is a
`FrontmatterChanges`, keyed _"by their contract names (`shelf_order`, not
`shelfOrder`)"_ (`vault-adapter.ts:7`). The list below is the first; the
frontmatter spellings are in
[`provider-provenance.md`](provider-provenance.md) §2 and
[§4](#4-containers) above.

```
author, isbn, pages, cover,                       (today)
publisher, published, subjects,                   (this spec)
googleVolumeId, appleTrackId,                     (provider-provenance.md)
openLibraryOlid, oreillyOurn
```

Eleven fields, plus the existing derived `spine_color` gap. `BookInput` grows the
same way for `stacks add`.

⚠️ **`description` is not a `FILLABLE` key** — it is a body section, so no
`FILLABLE`-shaped gate can see it. Gate **P2** ([`provider-provenance.md`](provider-provenance.md) §7)
is the only one that reaches it.

⚠️ **`publisher` is already on 17 of the 41 real notes**, hand-added and outside
CLAUDE.md's frontmatter contract until this work adds it. Absent-only leaves all
17 alone, so only the remaining 24 take a provider's value — and the field is
**mixed-provenance from day one**, 17 owner values and 24 provider values,
indistinguishable in the note and in `library.json`. Anything downstream assuming
`publisher` came from a provider is wrong on 41% of the books that have one.
(Counted by matching `^publisher:` at line start rather than through the parser,
so **17 is a ceiling**.)

---

## 6. The pass

**`stacks enrich` _is_ the backfill pass. No new command, no flag, no dry-run
inversion.** The ids and the re-merged fields come out of one set of responses by
construction rather than by discipline, and `enrich` inherits its `[title]`
filter, `--dry-run` and the whole `EnrichOutcome` report with no new machinery.

**The migration argument had already evaporated.** `published` and `subjects` are
on **0 of 41** notes, so the moment they join `FILLABLE` every book has a gap and
`enrich` is a whole-vault network pass — before a single id key is added. Scale:
41 books, ~3 requests per ISBN book and 4–6 per title-search book, **~140
requests** of which 41 are Apple. The same order as the G26 corpus, not a new
class of burst.

### The one property everything rests on

`createCachedHttpGet` writes the cache only when `getWithRetry` returned
something — `if (body === undefined) return undefined;` at `http.ts:64`, _before_
the write. So:

- **a success is cached forever** (no TTL — the reader returns the file and stops);
- **a failure is never cached at all.**

That asymmetry, which nobody designed for this, does three separate jobs below.
**If it ever changes, three decisions change with it** — which is why gate **P3**
exists.

### Cache, rate limits, convergence

- **Cache read first, no TTL, no bypass.** A provider id is a stable
  bibliographic pointer, not a fact that decays: Google's `volumeId` for a volume
  is the same answer next year. A `--refresh` flag was declined (deleting
  `.cache/` by hand is rare enough), and a TTL was declined for blast radius — it
  would land on `build`, `add` and the fixtures, not just on this pass.
- **The pass is substantially cold anyway.** Widening Open Library's search
  `fields=` changes that URL and invalidates every cached OL search; Apple only
  ran when a cover was weak and now runs on every book. What stays warm is the 35
  ISBN lookups.
- **No throttle is added** for iTunes' ~20/min. `429` is already in `TRANSIENT`
  (`http.ts:25`) with 1.2s/2.4s backoff over 3 attempts; a book that exhausts
  them gets no Apple id. Because failures are not cached and successes are, **run
  two makes network calls only for what run one missed** — the pass paces itself
  _across_ runs rather than inside one.
- ⚠️ **"Run it twice" is the operating instruction, not a workaround**, and run
  one's summary **undercounts by design**. This must reach the CLI docs, not be
  discovered in the field.
- An explicit ~3s inter-Apple delay was declined: it floors the pass at two
  minutes and pins a constant to a limit Apple does not document, failing
  silently when they change it.

### A gap a provider cannot fill stays a gap

A book Apple has never heard of leaves `apple_track_id` absent, `missingFields`
reports it, and the book is a candidate **on every run forever**. Accepted, with
**nothing recorded in the note**.

- A zero-result answer is valid JSON, so it _is_ cached — the repeat costs one
  request ever.
- A network failure is _not_ cached, so a book that missed out to an outage is
  re-asked and **self-heals**.

Rejected: a negative sentinel (`apple_track_id: none`) puts a non-id in an id key,
defeating the parse-time shape check, and freezes a claim about the world that
Apple listing the book next year would not reverse. A `provenance_checked` date
key needs a staleness policy — the TTL the cache deliberately does not have.
Filling ids only opportunistically converges neatly and then loses a book's id
permanently and silently the one time a request failed.

### Identity bar: unchanged

**ISBN lookup is proof; `isProbablySameBook` everywhere else.** No stricter bar
for ids, for two reasons: it is already the bar for the higher-stakes write (the
same guard decides whether to take a _cover_, and this codebase's own comment says
wrong art is worse than none), and a second threshold is a second thing to
calibrate, needing its own gate or drifting.

⚠️ **The residual risk is Apple, on every book.** Apple has **no ISBN
endpoint** — `findCover` is a term search — so `apple_track_id` is title-matched
on **all 41 books**, not only the 6 without an ISBN. The counter-argument is
accepted rather than answered: a wrong cover is visible and gets noticed; a wrong
id is invisible until a visitor clicks it and hits a hard-404.

Requiring ISBN-proof identity for ids was rejected because it kills
`apple_track_id` outright — no ISBN path to Apple exists.

### Failure reporting: unchanged

`enrichBook` sees one merged record, so _"Apple has no record"_ and _"Apple's top
five were all near-misses"_ both arrive as an absent `appleTrackId`. **They stay
collapsed.** The `filled` line already names which fields landed —
`google_volume_id, openlibrary_olid` with no Apple says Apple gave nothing — and
whole-book failures keep today's `not-found` and `mismatch` lines, which refuse
and write nothing. Refusing the _whole pass_ on any mismatch is refused:
invariant 3's spirit is that one bad note must not break the run, and
`enrichBook` already refuses per book.

### Two consequences that outlive the pass

1. **`enrich` never short-circuits before the network again.** It is permanently
   a whole-vault pass — fast while the cache is warm, a full pass when it is not.
2. **The header will read `41 book(s) considered, 41 with gaps` on every run
   forever**, and `complete` goes from rare to nearly never. **Left alone.** The
   header was always a progress preamble, not a finding; G27's rule is about the
   _closing_ arithmetic and that still holds exactly. Making the count meaningful
   again would require recording that a provider had been asked and declined —
   the sentinel by another name. `complete` **stays** although it is nearly
   unreachable: dropping an unreachable case is how the original G27 defect was
   written.

**This pass is what fills the real library.** All seven new frontmatter keys are
absent on every existing note until it runs — so run `enrich`, twice, before
judging the card against real data.

---

## 7. Gates

Numbers are deliberately unassigned, per `docs/gates.md`'s own note that a row's
number is not knowable until it lands. Referred to here as M1–M3; the full roster
including the provenance and card gates is in [`README.md`](README.md#gate-roster).

**M1 — precedence contract seam, both directions.** The documented precedence
table ([§1](#1-the-shape-one-default-order-named-per-field-exceptions)) against
the implementation, in the G8/G19 idiom. Red when the code decides a winner the
table never documents, **and** red when the table names an order the code does
not implement. This is the only thing standing between the fixed-order table and
silent drift. It is also the natural home for the `; ` subjects separator, which
two packages hold.

**M2 — absent-only, over the grown `FILLABLE`.** For every field in `FILLABLE`, a
note that already carries the key comes back **byte-identical** whatever the
providers say. Asserting the claim rather than the branch — the G27 lesson.

**M3 — G26's corpus re-captured through `loadEnv()`.** Not a new gate: a merge
change moves `lookup-recall`'s expectations, so the corpus must be re-captured —
and its own recorded lesson (2026-08-08) is that a corpus captured _without_ the
Google key replayed **refusals as answers** and went green for two days. This is
precisely the environment that bit before.

Already covering part of this and unchanged: **G4** pins `updateBook`'s
scalars-only rule; **G21** forbids live network in the suite.

---

## 8. Residuals

1. **The precedence table goes stale silently** when a provider's data quality
   changes. Nothing detects it.
2. **`publisher` is mixed-provenance from day one** — 17 hand values, 24 provider
   values, indistinguishable. See §5.
3. **A book already carrying a wrong value keeps it forever.** Absent-only,
   accepted.
4. **Apple's ids are title-matched on all 41 books.** See §6.
5. **Run one undercounts.** "Run it twice" is the instruction.
6. **The `## About` insert is the riskiest write this project would own.** Gate
   P2 is the only check that reaches it.
