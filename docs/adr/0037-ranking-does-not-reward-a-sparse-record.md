# Ranking scores brevity over the title alone, and breaks ties on completeness

`rankAgainst` scores a candidate with `rankingScore(term, title, author)`, whose
brevity penalty is measured over the **title alone**. The author still counts
towards coverage, so naming one in the query still favours that author's book —
it simply no longer costs a record anything to _have_ one. Exact ties are then
settled by how much the record actually says, never by the provider's response
order.

`titleMatchScore` is untouched. It is load-bearing for `isProbablySameBook`,
which decides deduplication across the whole project; changing its arithmetic to
fix a ranking bug would have moved identity as a side effect.

## What was wrong

Scoring title and author as one concatenated string made a record score **higher
for lacking an author**, because against a title-only query the author's tokens
read as padding. Open Library answers `12 Rules for Life` with two records of
one book — one carrying Jordan B. Peterson and 480 pages, one carrying neither —
and the empty one won, **2.0 against 1.914**.

So the note went into the vault with no author while the answer sat in the same
response. It was not recoverable afterwards: `enrich` searches `book.isbn ?? …`,
and the ISBN it had just written belongs to the sparse edition, so every later
lookup re-asked the record that had nothing and reported `nothing to fill`.

The preference is systematic rather than a near-miss. Any authorless record beats
its own richer sibling on a bare title — precisely the record that produces the
thinnest note. `open-library.ts` already scored its own candidates on the title
alone; the second pass in `rankAgainst` was undoing the first.

## How this was decided

_Carried verbatim from the session that produced it, newest last._

- **2026-08-08** — **Three providers all knew the author; all three were
  missed, for three different reasons.** Open Library had it in `doc[0]` and
  ranking took `doc[1]`. Google was never asked by title, because the
  short-circuit in `searchByTitle` returns early when Open Library has any
  _matching_ result — and the sparse record matched; the one Google request that
  did fire was `fillGaps` asking by the sparse edition's ISBN, which Google does
  not hold (`totalItems: 0`). Apple had `artistName: "Jordan B. Peterson"` in
  the response it took the artwork from, reads it at `apple-books.ts:49` to
  verify identity, and returns only the image.

- **2026-08-08** — **Relaxing the short-circuit was tried first and does not
  fix this.** Measured: with Google's results added to the pool, the sparse Open
  Library record still wins at 2.0, ahead of every authored candidate
  (1.914 Open Library, 1.914 Google, 1.88 Google with subtitle). Relaxing is
  therefore orthogonal — it helps only where Open Library has no authored record
  at all, which is not this case. It stays unshipped rather than being bundled
  in: two changes at once means a red gate cannot say which one caused it.

- **2026-08-08** — **The completeness tiebreak is not decoration.** With brevity
  measured over the title, the two records tie at exactly `2.000000`, and a
  stable sort settles it on Open Library's own ordering. That is right today and
  silently wrong the day that ordering changes, so the intent is written down
  instead of inherited from the provider.

- **2026-08-08** — **Completeness breaks ties and never enters the score.** A
  fuller record is not a better _match_. Letting it weigh on the ranking itself
  is how a thoroughly catalogued box set beats the book someone asked for —
  which is the failure `rankAgainst` was originally written to stop, and three
  of its documented cases (_The Subtle Art_ at 262 pages against a 206-page
  censored edition and a 320-page large-print, _The New Emotional Intelligence_
  against _Emotional Intelligence 2.0_, _Staff Engineer_ against _Summary of
  Will Larson's Staff Engineer_) were run under both scorings before the change
  was written. None moved; G26 covers all three.
