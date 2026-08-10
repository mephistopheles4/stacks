# May the four providers' marks be used as link affordances?

Research for [#103](https://github.com/mephistopheles4/stacks/issues/103). Nothing
here is implemented. This is the evidence
[#98](https://github.com/mephistopheles4/stacks/issues/98) should decide the
links slot from, and it does **not** return one answer: the four providers
answer differently, and two of them answer differently again depending on
*which* image you reach for.

**This is a reading of published guidelines, not legal advice.** Nobody involved
is a lawyer, no lawyer reviewed it, and a trademark owner's guideline is that
owner's stated position rather than a determination of what the law permits. Read
it as "what these four companies say they allow", which is the question
[#89](https://github.com/mephistopheles4/stacks/issues/89) left open, and not as
"what is legal".

Every quotation below was taken from the provider's own page or PDF, retrieved on
**2026-08-09**. Where a page could not be read, this document says so instead of
paraphrasing from a secondary source.

## The answer in one table

| Provider | Bare logo as the affordance | The asset that *is* granted | Written permission needed? |
| --- | --- | --- | --- |
| **Apple Books** | **requires-written-permission** (the *Apple corporate logo* alone: **forbidden**) | **permitted-with-conditions** — Apple Books *badge*, *lockup*, or *icon* | No, for the granted assets |
| **Google Books** | **requires-written-permission** | **permitted-with-conditions** — the clickable *"Google Preview" button* | No, for the granted assets; yes for anything else |
| **O'Reilly** | **requires-written-permission** | none — no third-party grant exists | **Yes. "There are no exceptions."** |
| **Open Library / Internet Archive** | **no published guideline located** → treat as requires-written-permission | none located | Unknown; nobody has published either a grant or a refusal |

**Nothing here forbids the row outright**, so #89's presentation does not reopen
on a flat "no". What it reopens on is subtler and worse for a *uniform* row: the
four grants have nothing in common. Apple's asset is a badge with a minimum
height and a mandatory legal credit line, Google's is a preview button that
carries a page-wide attribution obligation with it, O'Reilly's does not exist,
and Open Library's is unwritten. A row of four identical-looking logos is the one
presentation none of the four supports.

## Read this before reading any quotation below

Three different permissions live on adjacent pages at every one of these
providers, and only the third is #103's question:

1. **Content and cover licensing** — may you re-host their bytes. Settled here
   already; see `cover_source` and
   [ADR-0038](../adr/0038-oreilly-is-a-fourth-provider.md). **Not this document.**
2. **API terms-of-service attribution** — what a page displaying their API data
   must show. Adjacent, and it turns out to bind this project harder than #103
   asked about, so it is recorded — but it is a different obligation from a mark
   grant.
3. **Trademark / brand guidelines** — may you put their mark on your page as the
   thing a visitor clicks. **This is the question.**

Every quotation below is labelled **(1)**, **(2)** or **(3)**. A ToS attribution
clause quoted as if it answered the trademark question reads authoritative and
answers something else; that is the single easiest way to get this wrong.

---

## Apple Books — permitted with conditions, and the asset is a badge

**Primary source:** [Apple Books Identity Guidelines](https://marketing.services.apple/apple-books-identity-guidelines)
(© 2023 Apple Inc.; also served at
`https://www.apple.com/itunes/marketing-with-apple-books/identity-guidelines.html`).
**Secondary primary source:** [Guidelines for Using Apple Trademarks and Copyrights](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html).

### The bare mark: two different answers, and they must not be merged — **(3)**

**The Apple corporate logo alone is expressly forbidden.** Under *1.6 Avoid
Mistakes*, and again under the lockup's mistakes list:

> Do not use the Apple logo alone.

> Do not use icons, logos, or graphics from the Apple website or from Apple apps.

**An "Apple Books logo" separate from the badge, lockup and icon is a different
matter: it is nowhere granted, rather than forbidden.** No sentence in the
Identity Guidelines addresses such an asset at all, and Apple does not publish
one. What closes it is the general policy, under *Unauthorized Use of Apple
Trademarks*:

> You may not use the Apple Logo or any other Apple-owned graphic symbol, logo,
> or icon on or in connection with web sites, products, packaging, manuals,
> promotional/advertising materials ... except pursuant to an express written
> trademark license from Apple.

So the verdict for a bare Apple Books mark is **requires-written-permission**, on
the same evidentiary footing as Google's — not "forbidden", which is a stronger
word than any Apple sentence about it supports. The distinction costs nothing
practically (both roads lead to using a provided asset instead) and it keeps this
document from doing to Apple what it explicitly refuses to do to O'Reilly and
Open Library: read silence as a prohibition.

What *is* available is three **provided** assets, and the Identity Guidelines are
themselves the express grant for them.

### What is granted — **(3)**

Three distinct assets, in descending size:

**The badge** ("Get it on Apple Books"), under *The Apple Books Badge*:

> Use the Apple Books badge in your email, digital ads, apps, websites, and
> whenever else you promote the books that you offer on Apple Books.

> If you use the badge online, you must include a link to Apple Books wherever
> the badge is used.

**The lockup** (icon + call-to-action type), under *2. The Apple Books Lockup*:

> A lockup can be used in all marketing communications promoting content on Apple
> Books.

> Whenever a lockup is used online, you must include a link to Apple Books.

**The icon** — and this one is the closest thing any of the four providers
publishes to what #89 actually specified:

> The Apple Books icon can be used alongside other social media icons that are
> similar in shape or size. The icon can also be used to link to content within
> apps, where the Apple Books badge or lockup does not fit. Do not create your own
> icon. Only the versions shown here are approved.

**A compact row of same-sized provider icons is the exact shape that sentence
describes.** It is the strongest single sentence found in this entire
investigation, and it belongs to the provider one would have guessed was
strictest.

### The scope caveat, stated plainly

The badge sentence is scoped to "the books **that you offer** on Apple Books" —
publisher-and-author framing, which this site is not. The lockup sentence is
broader ("promoting content on Apple Books", no possessive) and the icon sentence
is broader still (no scope clause at all). The whole document is addressed to
people marketing their own titles, and a personal reading shelf is not a
marketing communication in the sense Apple means.

**This is a real gap and it should not be papered over.** The honest reading is
that Apple has granted these assets for a purpose adjacent to ours, has nowhere
forbidden the adjacent use, and has published no non-commercial or personal-use
clause either way. It is permitted-with-conditions with that asterisk, not a
clean yes.

### Conditions that bind the card's design — **(3)**

| Condition | Verbatim |
| --- | --- |
| Artwork | "Use only the Apple-approved badge artwork. Never create your own Apple Books badge or change the artwork in any way." |
| Format | "If you create marketing material for web or onscreen communications, use the high-resolution scalable artwork in SVG format." |
| Minimum size | "Minimum badge size is 8 mm for use in printed materials and 30 pixels for digital use." / "The small badge should be 12 pixels high or larger." / lockup: "Minimum lockup size is 6 mm for printed materials and 25 pixels for digital use." |
| Clear space | "Minimum clear space around the badge should be at least one-tenth the height of the badge." / lockup: "at least one-quarter the height of the lockup" |
| Prominence | "Do not make the lockup the dominant artwork." / "Keep the badge smaller than your other images and copy." |
| No effects | "Don't modify, angle, animate, rotate, or tilt the badge." / "Do not apply special effects such as shadows or glows to the badge." |

Two of these are **directly about a multi-provider row**, which is what #89
specified, and they point in opposite directions:

> If you include the Apple Books badge along with badges for other bookstores,
> place the Apple Books badge first in the lineup of badges.

> Do not use the Apple Books lockup along with badges for other book services.
> Instead, use the Apple Books badge and place the badge first in the lineup of
> badges.

So in a four-provider row, the lockup is out and Apple's badge must come **first**
— a constraint on ordering that #98 does not currently have, and which fights any
ordering rule the shelf might otherwise want (alphabetical, or
provider-that-answered-first).

### The cost nobody has priced: a credit line — **(3)**

Under *7.1 Credit Lines*:

> When you use only the Apple Books badge: The Apple logo is a trademark of Apple
> Inc., registered in the U.S. and other countries. Apple Books is a service mark
> of Apple Inc.

> Place the credit lines wherever you provide legal notification. ... Include the
> credit lines only once in your communication or website.

Once per website, not once per card — but the site has no legal-notice surface
today, so this is a new page element, not a free one.

### Written permission — **not required here** — **(3)**

> Marketing materials don't usually require approval by Apple, but there are a few
> exceptions. Written approval from Apple is required for materials used in: TV or
> print media; Any marketing format with high visibility; Custom photography or
> video in which Apple products appear.

A non-commercial personal website is none of the three.

### Where the asset lives

The [Apple Books Toolbox](https://toolbox.marketingtools.apple.com/en-us/apple-books/us),
which the guidelines name in their opening paragraph:

> Additionally, the [Apple Books Toolbox] makes it easy to create affiliate links,
> create embeddable widgets, and download badges and other art assets to lead your
> audience to books and audiobooks available on Apple Books.

### The text fallback — permitted, with naming rules — **(3)**

> "Apple Books" is the preferred term for the entire Apple Books ecosystem ...
> Don't use any other words for "Apple Books." For example, don't say "iBooks,"
> "iTunes Bookstore," "Apple Books Store," or "Apple's Books Store." "Apple Books"
> is always in English, even when the rest of the copy isn't.

> In communications distributed only in the United States, the appropriate symbol
> (TM, SM, or ®) must follow each Apple trademark the first time it is mentioned in
> body copy. For example: iPhone®, iPad®, and Apple Books℠

---

## Google Books — the granted asset is a button, not a logo

**Primary source:** [Branding Guidelines | Google Books APIs](https://developers.google.com/books/branding).
Its own footer reads **"Last updated 2015-05-06 UTC"** — eleven years stale, and
still binding by its own terms.

### The general position: logos need permission — **(3)**

Google's brand portal, under
[Terms and Conditions](https://partnermarketinghub.withgoogle.com/brands/google/trademarks-and-terms/terms-and-conditions/):

> If Google approves your request to use any Google trademarks, logos, web pages,
> screenshots, or other distinctive features ("Google Brand Features"), you agree
> to be bound by the following Terms and Conditions

> Google grants you a non-transferable, non-exclusive, royalty-free limited license
> to use Google's Brand Features set forth in your corresponding Permission Request
> Form ... for the sole purpose and only for the materials set forth therein.

A licence that exists only inside an approved Permission Request Form is, for our
purposes, **requires-written-permission**. Note that `www.google.com/permissions/`
— the URL the Books branding page still cites — now 301s to
`about.google/brand-resource-center/`, which 301s again to
`partnermarketinghub.withgoogle.com`. The Books page has not been updated to
follow.

### The specific grant, and what it is for — **(3)**

The Books branding guidelines authorise **two named images**, and neither is a
Google Books logo:

> Whenever you wish to direct users to a page or element whose most prominent
> element is the Google-provided book preview ("Google Preview"), you must link to
> that page using the authorized, clickable "Google Preview" button below. You must
> also use the Google Preview button when opening the preview page in a new browser
> window, or when linking to a preview page hosted by Google.

> If you want to indicate to users that Google Preview capabilities are available
> for a book title or for book search results on your own web page, use the
> non-clickable "Google Preview" sticker.

That first sentence is the only place in all four providers' documents where an
image is described as **"authorized, clickable"** and tied to a link. It is a
grant — but it is a grant of the *Google Preview button*, for linking to a
*preview*, and it is phrased as an obligation ("you must") rather than a
permission. A Google Books volume page for a book with no preview is arguably not
"a page whose most prominent element is the Google-provided book preview", and
the guidelines say nothing about linking to such a page. **That ambiguity is
unresolved and should not be resolved by assumption.**

### Where the assets live

Directly, from Google's own hosts — no download page, no registration:

- `https://www.google.com/intl/en/googlebooks/images/gbs_preview_button1.png` (also `.gif`) — the clickable button
- `https://books.google.com/googlebooks/images/poweredby.png` — the "powered by Google" image
- `https://developers.google.com/books/examples/translated-branding-elements` — localised versions

All three returned HTTP 200 on 2026-08-09.

### The part that binds more than the card — **(2)**

This is an API-terms attribution obligation, not a trademark grant, and it is
recorded because it is worse for this project than the thing #103 asked about:

> Google attribution is required.

> The "powered by Google" graphic must always be displayed alongside any search
> modules or results.

> When rendering one or more book results from the Google Books API Family, the
> "powered by Google" logo must appear adjacent to these results.

> Every book result displayed in your application must have a prominent link to
> either (1) a page on your site featuring Google Preview capabilities, or (2) the
> Google Books page for that book.

> You may not reorder or otherwise alter the results returned by the Google Books
> API Family.

> Adherence to these guidelines is required prior to use of the Google Books API
> Family from your website or application.

This project fetches from the Google Books API and caches the responses in
`.cache/`, and the shelf displays metadata derived from them. Whether a 3D shelf
of books whose titles came partly from that API counts as "rendering book results
from the Google Books API Family" is a question this document raises and does not
answer. **It is out of #103's scope, and it is a bigger question than #103.** It
deserves its own ticket.

### Additional restrictions worth knowing — **(3)**

> The Google logo may never appear next to or on the same page with the logos of
> competing web or other search services. There are no exceptions to this rule.

> Don't display the Google Preview button, the Google Preview sticker, or the
> Powered by Google image as the most prominent element on your web page.

> Do not change any of the Google marks in any way. Do not remove, obstruct,
> distort, or alter any element of a Google Book Search trademark.

The first is about *search services*, not bookshops — Apple Books, O'Reilly and
Open Library are not "competing web or other search services" on any natural
reading — but it is the sort of sentence that a row of four marks should be read
against deliberately rather than in passing.

### The text fallback — permitted, with naming rules — **(3)**

> Use only the term "Google Books" to refer the service made available through
> these APIs and at URLs such as ... Do not modify this word mark, for example,
> through hyphenation, combination abbreviation, or acronym such as: Google-Books,
> GB, Google Book Search, etc.

> You may not state or otherwise imply any affiliation with Google or Google Books.

---

## O'Reilly — requires written permission, and it says so twice

**Primary sources:** [O'Reilly Terms of Service](https://www.oreilly.com/terms/),
[O'Reilly Logo and Naming Guidelines](https://www.oreilly.com/about/logos/), and
[O'Reilly Media, Inc. Trademark Usage Guidelines, effective May 2014](https://www.oreilly.com/retail/2014_Trademark_guidelines.pdf)
(PDF, read directly — the text is compressed and a plain HTTP fetch of it yields
nothing legible).

### The terms of service point at the guidelines — **(3)**

Under *Trademark Information*:

> The O'Reilly Logo, and other designations, marks and logos associated with
> O'Reilly products and services ("O'Reilly Marks") appearing on the site are
> trademarks, trade names and service marks owned by O'Reilly.

> You agree not to use any O'Reilly Marks without the prior written consent of
> O'Reilly, except as expressly permitted by the guidelines on our site.

That exception is the whole question: **do the guidelines on their site expressly
permit this?** They do not.

### The guidelines close the exception — **(3)**

The 2014 Trademark Usage Guidelines, §6 *Other*:

> Any use of any O'Reilly trademark other than those included in these guidelines,
> or any use of any O'Reilly trademark in a way not specified in these guidelines,
> as well as any use of third party's trademark in a promotional, advertising, or
> marketing piece promoting O'Reilly's products must be approved by O'Reilly Media,
> Inc. in advance. **There are no exceptions to this requirement.** Please send
> requests to projects@oreilly.com.

(The bold is O'Reilly's own, in the PDF.) Nothing in the document specifies use
of the logo as a hyperlink from a third-party site, so §6 catches it.

Two further sentences make the position unambiguous rather than merely
unaddressed. §2(d):

> Attribution language must appear on any promotional, advertising, or marketing
> piece in type no smaller than 6 points: "The O'Reilly logo is a registered
> trademark of O'Reilly Media, Inc. Used with permission."

**You cannot truthfully print "Used with permission" without having permission.**
The mandated attribution presupposes the licence, which is as clear a statement as
a document can make that the licence is expected to exist first.

And §2(f), which is where the asset would have to come from:

> No attempt should be made to reproduce the O'Reilly logo with fonts. Only the
> official O'Reilly logo graphic may be used. (To obtain official logo files,
> please send email to projects@oreilly.com with an explanation of how and where
> the logo will be used.)

A downloadable zip does exist at
`https://cdn.oreillystatic.com/images/oreilly/OReillyLogos.zip`, linked from the
[Logo and Naming Guidelines](https://www.oreilly.com/about/logos/) page. **Its
existence is not a licence** — §2(f) still routes acquisition through an email
that must explain how and where the logo will be used, and §6 still requires
advance approval.

### One sentence that looks like a grant and is not

§2(b) reads:

> Mandatory Use: Must be used on all promotional, advertising, and marketing pieces
> featuring O'Reilly products worldwide.

Read alone this sounds like an instruction to third parties to use the logo. It
is not a permission — the document lives under `/retail/` and is addressed to
partners who already have a licence, and §6 governs everyone else. This is exactly
the kind of sentence that a paraphrase would turn into a "yes".

Also relevant to any row design, §2(e):

> The O'Reilly logo must stand on its own, and may not be used in a phrase or
> sentence.

### The text fallback — specified, and workable — **(3)**

> On the first use on any promotional, advertising, or marketing piece, the trade
> name must be used in its entirety: O'Reilly Media, Inc.

> In subsequent uses on the same piece, the name may be shortened to "O'Reilly
> Media" or "O'Reilly."

> If the word "O'Reilly" is to appear in a sentence, it should be in a text font of
> the size and style of the rest of the sentence.

Plain-text naming *is* a use "specified in these guidelines", so §6 does not
catch it. **O'Reilly is the provider for which #98's text fallback is not merely
a fallback but the only supported option.**

---

## Open Library / Internet Archive — no published guideline located

**This is a finding, not a gap in the research.** It was looked for in five
places and is not in any of them.

**Primary sources checked:**

| Source | URL | Result |
| --- | --- | --- |
| Internet Archive Terms of Use, Privacy Policy, and Copyright Policy | `https://archive.org/about/terms.php` | Read in full (20,881 characters). **Contains no clause about Internet Archive's own trademarks, logos, name or trade dress.** |
| Open Library Developer Center | `https://openlibrary.org/developers` | No brand, logo or trademark language |
| Open Library licensing | `https://openlibrary.org/developers/licensing` | Data only; see below |
| Open Library About | `https://openlibrary.org/about` | No brand, logo or trademark language |
| Internet Archive Help Center — Rights | `https://help.archive.org/help/rights/` | Copyright and Creative Commons only; nothing on IA's own marks |

The terms page is a JavaScript single-page application: a plain HTTP fetch
returns a 1,872-byte shell whose `<noscript>` says "Javascript is required for
this site." The full text was read by rendering the page in a browser and walking
its shadow DOM. **Any tool that reports these terms as empty is reporting its own
limitation**, which is worth recording because the first four attempts here did
exactly that.

The only occurrence of the word "trademark" in the whole document is an
obligation running the *other* way — what the reader must not infringe:

> In using the Archive's site, Collections, and/or services, you further agree ...
> (e) not to infringe any copyright, trademark, patent, or other proprietary rights
> of any person

The words **logo**, **brand** and **trade dress** do not appear in the document at
all.

### Do not let "non-profit" do the reasoning — **(1) vs (3)**

The Open Library licensing page says:

> The Internet Archive does not assert any new copyright or other proprietary
> rights over any of the material in the Open Library database.

That is a statement about **the database's material** — category (1), content
licensing. A permissive data position is not a trademark licence, and non-profits
routinely release data openly while reserving their marks. #103 anticipated this
trap ("its terms may be materially more permissive") and the anticipation turns
out to be half right: the *data* terms are far more permissive than the other
three providers'. The *mark* terms do not exist.

### The logo file that is not a grant

`https://archive.org/details/InternetArchiveLogo` is an item on Internet Archive's
own domain containing the Internet Archive logo. Its metadata records
`uploader: erarodos@yahoo.gr`, and both `licenseurl` and `rights` are **empty**.
It is a member upload, not a publication by the organisation, and it licenses
nothing. Third-party logo aggregators (Brandfetch, and similar) likewise host the
mark and are not the owner speaking.

### Verdict

**Evidence state: no published guideline located.** Paired label:
**requires-written-permission** — not because anyone refused, but because a
trademark licence has to come from somewhere and there is nowhere here it could
have come from. Those two statements are deliberately separate: the first is what
was found, the second is the consequence of finding nothing.

`info@archive.org` is the contact of record for the organisation; the Open Library
project also takes issues on GitHub. Asking is cheap and would convert this row
from a default into an answer.

### The text fallback

Nothing addresses it, in either direction — no naming rules, no restrictions.
Plain-text "Open Library" is the least encumbered affordance of any of the eight
options in this document.

---

## What this means for #98 and #89

Stated as consequences, not as a recommendation — the decision is #98's.

1. **A uniform row of four bare logos is not available.** Not because any provider
   forbids it, but because two of the four have no asset to put in it and the
   other two grant *specific different artwork* with incompatible rules (Apple's
   badge must be first; Google's button is scoped to previews).
2. **A mixed row is available and is what the evidence supports** — Apple's icon,
   Google's Preview button where a preview exists, and text names for O'Reilly and
   Open Library. #89 wanted one visual language; the guidelines do not permit one.
   That tension is the finding, and it is the thing #98 has to choose against.
3. **Text names carry conditions too.** Three of the four specify how their name
   may be written — full trade name on first use for O'Reilly, no abbreviation of
   "Google Books", `Apple Books℠` on first mention in US-only copy. #98's fallback
   is cheaper than marks but it is not free.
4. **Apple's icon sentence is the single most useful line found**, and it happens
   to describe #89's compact row almost exactly. If any part of #89's presentation
   survives, that is where it survives.
5. **The Google API attribution obligation is a separate and larger problem** than
   the one #103 raised, and it exists whether or not a single logo is ever added
   to the card. It should get its own ticket rather than riding along on this one.

## Assets, if any of this is built

No provider logo asset exists in this repo today — the only marks tracked under
`packages/site/` are this project's own (`stacks-mark*.svg`) and its favicons. All
four would be new files, and three of the four would be new files subject to
someone else's rules about how they may be drawn.

| Provider | How the asset would be acquired | Conditions attached to *displaying* it |
| --- | --- | --- |
| Apple Books | [Apple Books Toolbox](https://toolbox.marketingtools.apple.com/en-us/apple-books/us), SVG for web | Unaltered, ≥30 px (badge) or ≥25 px (lockup), clear space, not dominant, badge first in a row, credit line once per site |
| Google Books | `google.com/intl/en/googlebooks/images/gbs_preview_button1.png`, `books.google.com/googlebooks/images/poweredby.png` — served directly by Google, no download page or registration | Unaltered, not the most prominent element on the page, not beside a competing search service's logo |
| O'Reilly | `cdn.oreillystatic.com/images/oreilly/OReillyLogos.zip`, but §2(f) routes acquisition through projects@oreilly.com | **Prior written approval required before any of it** |
| Open Library | No first-party asset page located | **Unknown** — no licence found either way |

**Whether any of these bytes may be committed into this repository is a question
no source read here answers.** Every grant above is phrased as permission to
*use* artwork in a communication; none of them says anything about vendoring a
copy into a public git repository, and the absence of a sentence is not a
permission — the same standard this document applied to O'Reilly's public zip.
Serving Google's two images from Google's own hosts sidesteps the question
entirely for that one provider; Apple's does not, since the Toolbox is a download.
