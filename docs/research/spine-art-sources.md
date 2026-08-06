# Is there real spine art anywhere, and on what terms

Research for [#51](https://github.com/mephistopheles4/stacks/issues/51), under
the map in [#50](https://github.com/mephistopheles4/stacks/issues/50). Nothing
here is implemented. Every count in §1 was measured against this library's own
`library.json` and against the providers' live endpoints; every term in §3 is
quoted from the document that owns it, and where a document would not serve
itself to a non-browser client that is said rather than papered over. Where
something can only be answered by the owner, it says so.

**Short answer: real spine artwork is not obtainable from any reachable
provider — not for one book of the thirty-three.** The book trade's own metadata
standard defines a *Spine image* code and a *Full cover* code that explicitly
"Includes cover, back cover, spine"; no public API surfaces either, and the
trade ingest spec that feeds those APIs asks publishers for a 2:3 rectangle
named `[ISBN].jpg`. Every endpoint measured here — Open Library,
Google Books, Penguin Random House's own image host — returns a front cover
between 0.656 and 0.767 aspect, exactly the range already cached. The only route
to real spine pixels is **the owner photographing books they physically hold**,
and that route is also the only one with no re-hosting question attached, which
makes it the strongest option on this page rather than the consolation prize.
Its coverage is a number this repo cannot compute: **N print copies on hand,
upper bound 27 of 33**, and it has a design consequence in §5 that matters more
than its cost.

---

## 1. The ceiling is set by this vault, before any provider's terms

The licensing analysis in §3 is the interesting part and it is not the binding
one. Four facts measured out of `packages/site/public/library.json` and out of
Open Library's edition API cap what *any* ISBN-keyed source could return, before
a single term of use is read.

| | count | consequence |
| --- | --- | --- |
| books in the library | 33 | |
| **carry no ISBN at all** | **6** | unreachable by every ISBN-keyed source, full stop |
| carry a `979-8` ISBN | 5 | the KDP/Amazon-assigned block; thin or absent in Bowker- and Nielsen-derived records |
| covers that came from **Apple Books** | 25 | the provider whose terms do not enumerate book covers at all is carrying three quarters of this shelf |
| covers that came from **Open Library** | 8 | |
| square (1.000) audiobook covers | 6 | no physical object exists to photograph, ever |

The six with no ISBN are *From Zero to Profit with AI*, *The Subtle Art of Not
Giving a F\*ck*, *The New Emotional Intelligence*, *Beyond Vibe Coding*, *The
Creative Brain in the Age of Artificial Intelligence* and *The Infinity
Machine*. Five of those six are the audiobook squares; the sixth is a book
currently being read.

### What Open Library actually holds for these 27 ISBNs

Measured, one `https://openlibrary.org/isbn/{isbn}.json` request per ISBN:

| | count |
| --- | --- |
| ISBNs probed | 27 |
| edition record exists | 20 |
| **404, no record at all** | **7** |
| record carries **at least one** cover ID | **10** |
| record carries **more than one** cover ID | **0** |

The seven that do not exist in Open Library at all are *The Algorithm*
(9798217177530), *Money Unlocked* (9781837826094), *Agentic Artificial
Intelligence* (9798992833607), *Effective* (9781394377497), *Practical AI
Governance* (9781398626218), *Vibe Coding* (9781966280033) and *We Are as Gods*
(9781668099544) — which is to say, the recent trade and self-published end of
the shelf, precisely the segment #51 said a source has to serve to count.

**The zero in the last row is the finding.** An Open Library edition's `covers`
is an array, so the data model can hold a second image; across this entire
library it never does. There is no second asset sitting behind the front cover
waiting to be asked for.

### And a successful lookup is not a correct lookup

`Staff Engineer's Path` carries ISBN `9788441548206` in the vault. The `844`
prefix is the Spanish registration group, and the Open Library record it
resolves to — `/books/OL59615936M` — is titled *"El ingeniero de staff. Una guía
para profesionales que apuestan por el crecimiento y el cambio"*. The lookup
succeeds. It returns the wrong edition's artwork. Any per-book imagery keyed on
the ISBNs this vault happens to hold inherits that, and a *spine* is a place
where a wrong edition is obvious — a different publisher's imprint, a different
typeface, a different colour to the one `spine_color` already derived.

---

## 2. The asset class exists in the standard. Nothing serves it.

This is worth stating precisely, because "the industry has no such thing" would
be false and "the industry has it, go and fetch it" would be worse.

EDItEUR's ONIX for Books **List 158, Resource content type** — the vocabulary a
publisher uses to label a supporting resource it ships with a title — contains,
quoted from [`ns.editeur.org/onix/en/158`](https://ns.editeur.org/onix/en/158):

| code | label | note |
| --- | --- | --- |
| 01 | Front cover | 2D |
| 02 | Back cover | 2D |
| 03 | Cover / pack | Not limited to front or back, including 3D perspective |
| 29 | **Full cover** | **"Includes cover, back cover, spine and – where appropriate – any flaps"** |
| 51 | Cover flap image | 2D, front or back flap image |
| 56 | **Spine image** | **2D, portrait orientation** |
| 57 | Spine panorama image | 2D, image spans multiple upright spines |

So the trade has a standard slot for exactly the asset this project wants, down
to a code for the panorama that a matched set paints across its spines. Three
things follow, and only the first is encouraging:

1. **A publisher's production files contain the thing.** A printed jacket is
   laid out as one flat — front, spine, back, flaps — because that is how it is
   printed. The asset is not hypothetical; it exists at the origin.
2. **Nothing downstream is asked for it.** Edelweiss (Above the Treeline) is
   where a large share of North American publishers deposit title assets for the
   trade, and its own ingest spec
   ([help.edelweiss.plus](https://help.edelweiss.plus/?st_kb=catalog-admins-what-are-edelweiss-image-specs))
   asks for "jacket covers and catalog covers … rectangular with a 2:3 ratio",
   "max. 1000 px wide", named "`[ISBN].[fileformat]`, e.g. `978123456789.png`".
   One image per ISBN, front, 0.667 aspect, capped at 1000px. There is no spine
   slot in the pipe. Whatever List 158 permits, this is what publishers are
   actually asked to upload.
3. **Nothing public reads it.** Neither Open Library, Google Books, nor Penguin
   Random House's own image host exposes a resource-content-type at all; they
   expose *a* cover URL.

That pairing — a standard that has the code, an ingest spec that does not ask
for it — is the whole answer to "why can't I just find one".

### Measured, not assumed

Five images fetched from four candidate endpoints and measured:

| endpoint | pixels | aspect |
| --- | --- | --- |
| `covers.openlibrary.org/b/id/15223486-L.jpg` (*The Power of Now*) | 328 × 500 | 0.656 |
| `covers.openlibrary.org/b/id/9260083-L.jpg` (*An Elegant Puzzle*) | 338 × 500 | 0.676 |
| `books.google.com/books/content?…&printsec=frontcover&zoom=6` (*Co-Intelligence*) | 575 × 750 | 0.767 |
| `images.randomhouse.com/cover/9780593716724` (*Co-Intelligence*) | 298 × 450 | 0.662 |
| `images.randomhouse.com/cover/9780399562761` (*The Singularity Is Nearer*) | 298 × 450 | 0.662 |

Every one is a front cover, in the same 0.63–0.77 band the vault already holds.
A wrap-around jacket carrying a spine would be ≈1.4. Note also that the
publisher's own endpoint serves **450 px tall** — smaller than `MAX_COVER_EDGE`
— so "go to the publisher for the real asset" does not even buy resolution.

---

## 3. Source by source

| source | spine or wrap? | coverage *of this library* | key | terms on re-hosting | verdict |
| --- | --- | --- | --- | --- | --- |
| Open Library | **No.** Front only; 0 of 20 editions carry a second cover ID | 10/33 have any cover at all | ISBN/OLID/LCCN/OCLC | contemplates public display, asks for a link back | already in use; no new art |
| Google Books | **No.** `imageLinks` are front thumbnails | untested for spines because there are none | ISBN via `q=isbn:` | bars permanent copies | already in use; no new art |
| Apple Books | **No.** Square audiobook and front print artwork | 25/33 covers here | store lookup | does not enumerate book covers at all | already in use, already the awkward one |
| Penguin Random House API | **No.** 298 × 450 front cover | only PRH imprints (~3 titles) | ISBN | registration required; asset terms not published at the developer root | no |
| LibraryThing covers | **No.** Member-uploaded front covers | untested; front-only regardless | ISBN + developer key | non-commercial, 1 req/sec, ~1000/day | no |
| Goodreads API | — | — | — | **no new developer keys issued** | dead |
| WorldCat / OCLC | **No cover art at all** | — | — | "OCLC does not provide cover art via its API interfaces" | dead |
| Amazon (PA-API / Creators API) | unknown, and it does not matter | — | ASIN/ISBN | **"You will not store or cache Product Advertising Content consisting of an image"** | prohibited outright |
| Bookshop.org | no developer API found | — | — | affiliate materials may not be edited or altered | no |
| ISBNdb | **No.** "Cover image" is one field | paid, front only | ISBN | $14.99–$299.99/month | pays money for the same front cover |
| Edelweiss (trade) | **No.** ingest spec is 2:3 front | trade account required | ISBN | B2B, not a public source | no |
| Internet Archive scans | front and back *leaves*; **no spine file** | 1 of 33 titles has a scan | ISBN | in-copyright, lending-only | no |
| Second-hand marketplace listings | sometimes, as seller photographs | thin for 2024–2026 titles | — | seller-owned images, no licence to you | no |
| **Owner photographs** | **Yes — it is the only yes** | N print copies on hand, ≤27 | none | **owner's own bytes; no re-hosting question exists** | §4 |

### Open Library

Front covers, three sizes. The docs are explicit about the shapes and silent
about anything but a cover:

> "The covers are available in 3 sizes: S: Small … M: Medium … and, L: Large"

and, on public display — the sentence `cover-source.ts` is already relying on:

> "If you want to display covers on public-facing pages, please use a src URL
> that points to covers.openlibrary.org."

with "a courtesy link back to Open Library" requested. Rate limit, for keys other
than CoverID and OLID:

> "Currently only 100 requests/IP are allowed for every 5 minutes."

The licensing page does not carve cover art out from data; it says only that
"The Internet Archive does not assert any new copyright or other proprietary
rights over any of the material in the Open Library database", and warns that
"There may be existing rights issues on some contributions and in some
jurisdictions". Which is honest and is also the reason a spine, if one ever
appeared there, would not arrive with a licence — it would arrive with the same
"somebody uploaded this" provenance the front covers have.

**Sources:** [Covers API](https://openlibrary.org/dev/docs/api/covers) ·
[Licensing](https://openlibrary.org/developers/licensing)

### Google Books

The volumes documentation shows `imageLinks` in an example response with
`smallThumbnail`, `thumbnail`, `small`, `medium`, `large` and `extraLarge`, and
carries no descriptive text about them at all — no field is documented as
anything other than the volume's image, and nothing anywhere mentions a back
cover or a spine. The image endpoint itself takes `printsec=frontcover`, which
names what it serves.

The binding term is not in the Books terms but one level up, in the Google APIs
Terms of Service, **§5(e)**:

> "Scrape, build databases, or otherwise create permanent copies of such
> content, or keep cached copies longer than permitted by the cache header"

with **§5(c)**: "You agree to display any attribution(s) required by Google as
described in the documentation for the API." That is the clause
`cover-source.ts` already encodes, and it applies identically to any derived
spine: a spine painted from Google bytes is a permanent copy of Google content
wearing a different shape.

**Sources:** [Using the API](https://developers.google.com/books/docs/v1/using) ·
[Books API terms](https://developers.google.com/books/terms) ·
[Google APIs ToS](https://developers.google.com/terms)

### Apple Books

Nothing new to add to `packages/core/src/covers/cover-source.ts`, and one thing
to reinforce. Apple's marketing and identity guidelines cover App Store badges,
Apple product images and screen content; they set conditions on Apple-supplied
artwork (badge unmodified, subordinate placement, trademark credit, a link
"directly to your App Store product page") and **book cover artwork is not among
the content types they enumerate**. The awkward fact from §1 is that this is the
provider behind **25 of 33** covers on the shelf today. Any proposal to *derive*
new per-book imagery from cached cover bytes is therefore mostly a proposal to
derive it from Apple's, and inherits that unanswered question rather than
escaping it.

**Source:** [Apple marketing guidelines](https://developer.apple.com/app-store/marketing/guidelines/)

### Penguin Random House

A real publisher API with real front covers, measured above at 298 × 450. The
developer site describes "the Penguin Random House public API for title and
author metadata" and requires registration for access keys. The image-resource
documentation page returns 404 at the path linked from search, and the
developer root publishes no asset terms, so **there is no quotable licence
here** — which is itself the finding: an unpublished term is not a permissive
one. Coverage against this shelf is a handful of titles (*Co-Intelligence*, *The
Singularity Is Nearer*) and the artwork is front-only and smaller than what is
already cached.

**Source:** [developer.penguinrandomhouse.com](https://developer.penguinrandomhouse.com/)

### LibraryThing

Member-uploaded **front** covers in three sizes, ISBN-keyed, behind a developer
key. LibraryThing's own announcement of the service states the terms:

> "To get covers, you'll need a LibraryThing Developer Key—any member can get
> one."
>
> "You do not make LibraryThing cover images available to others in bulk. But
> you may cache bulk quantities of covers."
>
> "Use does not involve or promote a LibraryThing competitor."

with one request per second for automated fetching and a nominal 1,000/day. The
current terms page at `librarything.com/developer/terms` **refused a non-browser
client with HTTP 403** and could not be read here; secondary reporting says the
APIs are non-commercial-only except by permission. Either way it is moot: the
service serves front covers, and this library's problem is not a shortage of
front covers.

**Sources:** [LibraryThing blog, "A million free covers"](https://blog.librarything.com/2008/08/a-million-free-covers-from-librarything/) ·
[Web services](https://www.librarything.com/services/webservices.php)

### Goodreads

Closed. Goodreads no longer issues new developer keys and has said it is
retiring the current API; existing keys were pruned for inactivity from December
2020. There is no key to obtain and therefore no terms to analyse.

**Source:** [Goodreads Developers — API deprecation](https://www.goodreads.com/topic/show/21788520-api-deprecation)

### WorldCat / OCLC

Answered by OCLC in one sentence, on their own support site:

> "OCLC does not provide cover art via its API interfaces. We get our cover art
> contractually through multiple sources and artwork displayed on OCLC web pages
> is only for OCLC use."

Access to the WorldCat Search API also requires an institutional cataloguing and
discovery subscription, and v1 support ended 31 December 2024. Dead twice over.

**Source:** [OCLC support](https://help.oclc.org/Discovery_and_Reference/WorldCat_Discovery/Troubleshooting/Can_I_get_cover_art_images_via_the_WorldCat_Search_API)

### Amazon

The cleanest refusal on the page, and it does not depend on what Amazon serves.
From the Associates Program IP License, §2(h):

> "You will not store or cache Product Advertising Content consisting of an
> image, but you may store a link to Product Advertising Content consisting of
> an image for up to 24 hours."

> "You may store other Product Advertising Content that does not consist of
> images for caching purposes for up to 24 hours, but if you do so you must
> immediately thereafter refresh and re-display the Product Advertising Content
> by making a call to Creators API, PA API or retrieving a new Data Feed."

A static site build that writes an image into `dist/` is a stored copy of an
image. That is prohibited in terms, in the one sentence, regardless of whether
Amazon has a spine photograph behind it. Separately, PA-API 5 is deprecated —
"applications that continue to call PA-API 5" get HTTP 403 — in favour of a
Creators API for "publishers, influencers, and affiliate partners", i.e. an
Associates account this project has no reason to hold.

No claim is made here about what image variants Amazon's product pages contain.
It does not matter: the licence forbids the copy before the question arises.

**Sources:** [Associates program policies / IP License](https://affiliate-program.amazon.com/help/operating/policies) ·
[PA-API 5 deprecation](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)

### Bookshop.org

No developer API was found, and `bookshop.org/info/terms-of-use` **refused a
non-browser client with HTTP 403**, so its terms are not quoted here. What is on
the affiliate-facing pages is a restriction rather than a grant — affiliates may
not "edit, modify, or alter Affiliate Materials … without the written approval
of Bookshop" — which would bar deriving a spine from a supplied image even if
one existed. Bookshop's product imagery is the same trade front cover as
everyone else's.

### ISBNdb

A paid metadata API, $14.99–$299.99 per month depending on plan, in which "cover
image" is one of the data points per title. Front covers. Paying for the
identical asset that Open Library gives away is not a route to spine art; it is
a route to slightly better *front-cover* hit rates on the seven ISBNs Open
Library 404s, which is a different ticket if anyone wants it.

**Source:** [ISBNdb pricing](https://isbndb.com/isbn-database)

### Internet Archive scans

Worth checking rather than assuming, because IA photographs *physical* copies.
Probed by ISBN across five titles: only *The Power of Now* (2004) has scans at
all; *AI Snake Oil*, *Co-Intelligence*, *An Elegant Puzzle* and *Thinking in
Systems* return `numFound=0`. The recent trade non-fiction that makes up this
shelf is in copyright and is not there.

And the one scan that exists does not contain what is wanted. Its 31-file
listing (`archive.org/metadata/powerofnowguidet00toll`) holds page-image
archives, OCR derivatives, PDF/EPUB and metadata; **no file in it matches
`cover`, `spine`, `edge` or `jacket`.** IA's scanning captures leaves — front
board, pages, back board — flat on a platen. A spine is never a leaf.

### Second-hand marketplace listings

The honest near-miss. Sellers on AbeBooks and similar photograph the actual copy
in hand, and AbeBooks permits up to 20 images per listing and blocks images
hoisted from Amazon, so listing photographs really are seller-made pictures of a
real object — occasionally including a spine.

It fails on all three of the axes #51 asks about. **Coverage:** the used market
for 2024–2026 trade non-fiction and self-published titles is thin, and no
listing is addressable by a stable key — a listing is a copy for sale, and it
disappears when it sells. **Key:** there is no image API; getting bytes means
scraping. **Terms:** sellers "retain ownership of the Product File and all
copyright and other intellectual property rights", granting rights to the
*marketplace*, not to you. So the pixels belong to a stranger and the licence
runs the wrong way.

**Source:** [AbeBooks Seller Agreement](https://www.abebooks.com/docs/booksellercentral/agreement/na-agreement_rv.shtml)

---

## 4. The non-provider route, costed honestly

The owner photographs the spines of books they physically hold, and those images
go into the vault the way covers already do.

**What it costs technically is almost nothing, and that is not obvious until you
look at what the shelf already does.** `spine-texture.ts` already builds a
**128 × 1024** canvas per book and hands it to the spine material as a `map`
(`scene.ts:1088–1101`). A photographed spine is a substitution into that same
slot at the same dimensions. So:

| | today | with photographed spines |
| --- | --- | --- |
| per-book spine texture | 128 × 1024 canvas | 128 × 1024 image |
| decoded bytes per book | 699,051 (0.67 MiB) | **699,051 (0.67 MiB) — unchanged** |
| meshes per book | ~6 | **~6 — unchanged** |
| draw calls added | — | **0** |
| bytes on the wire per book | 0 (generated) | ~20 KB (a 128 × 1024 JPEG) |

The one real number to watch is the **staged** budget, if spine files are staged
the way covers are. `gates/cover-budget.test.ts` sums only staged cover files
today: 33 covers, **1.19 MiB on disk, 31.85 MiB decoded** against the 96 MiB
`TEXTURE_BUDGET_BYTES`. Adding 27 spine files at 128 × 1024 adds **18.0 MiB
decoded**, taking the shelf to roughly **50 MiB of 96**. That does not break the
gate and it does move the day the gate goes red substantially closer — which
`cover-budget.ts` says is the expected failure and says what to do about it
("stop uploading every cover at once — not to raise the number").

**What it costs in effort** is a photograph, a crop and a deskew per book. The
target is 128 × 1024; any phone produces twenty times the pixels needed, so this
is a lighting-and-squareness problem, not a camera problem. At one to three
minutes a book, the whole backlog is **under two hours, once**, and the marginal
cost afterwards is one photograph at `stacks add` time. Nothing about it needs a
provider, an API key, or a rate limit.

**What it costs in licensing is the interesting part: nothing.** These are the
owner's own photographs of objects the owner owns. There is no re-hosting
question, no attribution clause, no 24-hour cache window, no "does this
provider's terms enumerate book covers". Against a page of sources every one of
which either has no spine or forbids the copy, **that is the only clean title to
the pixels on this page.** (Photographing a copyrighted jacket is not the same
as owning the jacket design, and this document is not legal advice; it is worth
noting that the same reservation applies with more force to every provider row
above, none of which offers a licence either.)

**What this repo cannot tell you is how many books that is.** `library.json`
carries no `format` or `binding` key and the frontmatter contract in `CLAUDE.md`
has none, so **whether a given title is a hardback on a shelf, a Kindle file or
an Audible download is not derivable from anything committed here.** Only the
owner can answer it. What is derivable is the bound:

- **6 are audiobooks** (aspect exactly 1.000). No physical object exists. These
  are excluded permanently, not pending.
- **27 remain**, of which **N are print copies on hand** — the owner's number.
- Coverage is therefore **N / 33**, upper bound 82%, and realistically lower:
  several of these are O'Reilly and Kindle-first titles that a reader of recent
  AI trade non-fiction is likely to hold as files.

---

## 5. The consequence that matters more than the coverage number

A mixed shelf may look worse than a consistent one.

Today all 33 spines are generated by the same function: Georgia, bottom-to-top,
two hairline rules, on `spine_color`. They are not real, and they are *uniform*,
and uniformity reads as a deliberate binding style — the shelf looks like a set.
Photograph nine of them and the shelf becomes nine real spines standing beside
twenty-four obviously synthetic ones, and the synthetic ones stop reading as a
style and start reading as missing data. The same thing that makes a real spine
better makes its neighbour worse.

That is a judgement about a picture, and by this project's own rule it is
settled by a screenshot and not by an argument (#50: "A ticket closes on an image
the owner accepts"). But it should be settled *before* anyone spends two hours
photographing, because the cheap version of the experiment exists: photograph
**three** spines, drop them in beside thirty generated ones, and take the
screenshot. If the shelf reads worse, the whole route closes for the price of
three photographs.

It also argues for the thing #50 already lists as unspecified — "should a
generated spine follow the *cover's own* type … rather than today's universal
Georgia?" A generated spine that borrows the front cover's palette and type will
sit next to a photograph far better than Georgia does, so the generator's
quality is a prerequisite for the photographs being worth taking, not an
alternative to them.

---

## 6. Recommendation

**Close the "find real spine art" question. It has an answer and the answer is
no.** Not for one book of the thirty-three, from any of the thirteen sources
above. Nothing here is a matter of rate limits or an API key or a better search:
the trade does not ship the asset, its ingest specs do not ask for it, and the
three providers already in use serve one front cover per title, which is the
bytes this project already has.

Two follow-ons, in this order, and neither is "keep looking":

1. **Test the mixed shelf for three photographs.** It is the only route to real
   pixels, it costs nothing technically (0 draw calls, 0 additional decoded
   bytes per book, ~20 KB on the wire), it is the only source with clean title
   to the bytes — and §5 says it can still be the wrong idea. Three photographs
   and one screenshot settles that, before any bulk work. If it reads well, the
   deliverable is a `spine:` counterpart to `cover:` in the frontmatter contract
   and a staging path beside `cacheCover`; coverage is whatever N turns out to
   be, and the generated spine remains the fallback for the rest forever,
   because six audiobooks can never have one.
2. **Treat the generated spine as the primary deliverable, not the fallback.**
   Even at the optimistic bound, more than a sixth of this shelf can never carry
   a real spine, and realistically it will be closer to half. #50's open question
   about lifting the cover's own type and palette onto the spine is therefore
   not a consolation branch — it is the branch that determines what most of this
   shelf looks like, and §5 says it also determines whether the photographs are
   worth taking at all.

One thing **not** to do, in passing: nothing above licenses deriving new per-book
imagery from the cached cover bytes. 25 of 33 came from Apple, whose terms do
not enumerate book covers; the Google-sourced path is barred from permanent
copies outright. A generated spine that takes a *colour* from a cover is what
`dominant-colour.ts` already does and is a different act from a generated spine
that reprojects a cover's *pixels*. If the type-lifting work in (2) goes ahead,
that line is where it should be drawn, and it should be drawn deliberately.
