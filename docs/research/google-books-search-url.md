# Google Books search URLs: what does a title-and-author search build, and how does it fail?

**Research date:** 2026-08-09/10
**Question owner:** [#105](https://github.com/mephistopheles4/stacks/issues/105), blocking [#93](https://github.com/mephistopheles4/stacks/issues/93), under map [#88](https://github.com/mephistopheles4/stacks/issues/88).
**Nothing here is implemented.** This is evidence for [#98](https://github.com/mephistopheles4/stacks/issues/98)'s one reopenable sub-decision — the search target for a book with no identifier at all.

Every claim below is labelled **measured** or **inferred**. Two independent
sessions measured this, on the same machine and IP but through different
clients, and they are attributed separately throughout:

- **[script]** — PowerShell 7 `Invoke-WebRequest`, `-MaximumRedirection 0
  -SkipHttpErrorCheck`, redirects followed one hop at a time, cold (no cookie
  jar, no `-WebSession`), default PowerShell user agent. No user agent was
  spoofed at any point.
- **[browser]** — the orchestrating session, in a real Chromium browser on a
  residential Montreal IP.

Statuses were read before bodies throughout, per
[ADR-0027](../adr/0027-deploy-check-reports-refusal.md). **That turned out not to
be sufficient**, and §5 is the reason.

---

## Summary

**The link does not degrade acceptably, and the reason is not the one the ticket
expected.**

1. `books.google.com/books?q=…` **does not stay on Google Books.** It 302s to
   `www.google.com/search?tbo=p&tbm=bks&q=…` — general Google Search with the
   Books tab selected. A link labelled "Search Google Books" lands the visitor on
   `google.com/search`. Measured by both clients, unanimous across 9 queries.
2. A **deliberately impossible** query degrades gracefully and clears the bar
   [#90](https://github.com/mephistopheles4/stacks/issues/90) set.
3. **A real book Google does not hold does not.** It returns a page of ten
   confident, wrong books with no indication anything is missing. The visitor
   cannot distinguish this from success. This is the failure mode that matters,
   because it is the one the six real books actually produce, and it is
   *invisible* rather than graceful.
4. On the very same query, **Open Library says "No books directly matched your
   search."** That is the sharpest contrast in this document.

The recommendation [#98](https://github.com/mephistopheles4/stacks/issues/98)
overrode was Open Library. On the evidence here, the override's premise —
catalogue size — is real but buys a worse failure: Google's larger catalogue is
what lets it always find *something* to show, which is precisely what makes its
misses silent. See §7 before reverting, though: Open Library has a refusal
problem of its own.

---

## 1. The URL form, and how title and author combine

**Title and author are combined as one space-joined string in a single `q`
parameter.** No provider-specific separator is involved. [measured, both]

### Candidate forms

| # | Form | Behaviour | Source of candidate |
|---|---|---|---|
| **A** | `https://books.google.com/books?q=<query>` | **302** → form B's URL | The classic Google Books path |
| **B** | `https://www.google.com/search?tbm=bks&q=<query>` | **200** directly, no redirect — but the body is the JS shell, per §2 | Where A lands |
| **C** | `https://www.google.com/search?q=<query>&udm=36` | not independently traced | **Observed**, not guessed — see below |

Form **C** is recorded because Google itself emitted it: the served page carries
a hidden fallback link reading `/search?q=The+Infinity+Machine+Sebastian+Mallaby&sca_esv=…&udm=36&emsg=SG_REL&sei=…`.
`udm=36` is Google's Books mode. It is listed for completeness and **was not
separately tested**; no candidate here was invented. [measured that Google
emitted it; its behaviour is unmeasured]

### The redirect, verbatim

Requesting form A with the first of the six real books:

```
GET https://books.google.com/books?q=Beyond%20Vibe%20Coding%3A%20From%20Coder%20to%20AI-Era%20Developer%20Addy%20Osmani
→ 302
  Location: https://www.google.com/search?tbo=p&tbm=bks&q=Beyond+Vibe+Coding:+From+Coder+to+AI-Era+Developer+Addy+Osmani
→ 200
```

Google adds `tbo=p` itself, and sometimes an `&sei=` token. [measured, script;
independently [browser], which also recorded `document.title` as
`«query» - Google Search` — never "Google Books"]

### Field-qualified terms

`intitle:` and `inauthor:` **survive the redirect intact**, both bare and
quoted — the operator is preserved in the `Location` header rather than being
stripped or escaped away: [measured, script]

```
q=intitle:The+Infinity+Machine+inauthor:Sebastian+Mallaby
q=intitle:%22The+Infinity+Machine%22+inauthor:%22Sebastian+Mallaby%22
```

They **work on the public search path**, not only in the API: the unquoted pair
returned a tighter, cleaner result set than the bare query with the correct book
in row 1. [measured, browser]

**Whether they help or hurt on a two-term query is unresolved, and the honest
answer is "unmeasured".** Unquoted, an operator binds only its next token, so
`intitle:The Infinity Machine` constrains on `The` and leaks the rest into the
free-text query — [inferred] from standard Google operator syntax, not measured
in isolation. The **quoted** variant is the one that would bind the whole
subtitle, and neither session measured its *results*: it is what tripped the
browser's 429 (§5), and the script cannot read results at all (§2). Both
sessions could confirm only that the syntax reaches the destination unmangled.

⚠️ **A design question this ticket surfaces but does not settle.** Five of the
six real titles carry long colonised subtitles. Over-constraining an obscure book
with `intitle:"<full title with subtitle>"` is the plausible way to turn a
findable book into zero results, and the implementation must choose between the
full title and the title before the colon. [inferred] — this needs its own
measurement before anything is built on operators.

---

## 2. ⚠️ What a miss looks like — and why the script could not tell you

**[script] verdict: UNMEASURABLE. Reported as a refusal, not as a finding.**

The scripted client receives **HTTP 200** on the URL it asked for, ~91 KB, and
the body is **not a results page**. It is Google's JavaScript-required shell:

```
<title>Google Search</title>
<noscript><style>table,div,span,p{display:none}</style>
<meta content="0;url=/httpservice/retry/enablejs?sei=…" http-equiv="refresh">
```

The impossible control, a book Google holds, and a book it does not **all
returned the same shell**, within 59 bytes of each other:

| Query | Bytes | `<noscript>` | `enablejs` | Result rows | "no matches" notice |
|---|---|---|---|---|---|
| impossible control | 91,247 | yes | yes | none | none |
| Maria Ian (absent) | 91,240 | yes | yes | none | none |
| Infinity Machine (present) | 91,188 | yes | yes | none | none |

The only occurrence of `Mallaby` in the "found" page is inside a hidden
`display:none` fallback link, not a result row. **Three near-identical pages for
three semantically different queries is the signature of reading a shell rather
than results** — so no claim about miss behaviour is made from the script side.

**[browser] verdict: two different answers, depending on the miss.**

**The clean miss is graceful and clears #90's bar.** Control query
`Zqxjvbnmqwerty Plorkumbulous Treatise by Grimwald Fzzzxqp` → a 366-character
page:

> It looks like there aren't any 'Books' matches on this topic
> Need help? Check out other tips for searching on Google.

plus a **See all results** escape into unfiltered search. Same URL, no redirect
elsewhere, usable page. [measured, browser]

---

## 3. ⚠️ The failure that actually matters: the silent partial miss

**A real book Google does not hold produces no notice at all.** [measured,
browser]

`The Creative Brain in the Age of Artificial Intelligence: How to Use AI Without
Losing Yourself` / Maria Ian returned **ten confident result rows, none of them
the book**:

1. Creativity in the Age of AI: Toolkits for the Modern Mind
2. Books In Print 2004-2005 — Page 5573
3. AI for Creativity
4. The Creative's Guide to Working with AI
5. AI as a Second Mind
6. The Creative Mind: Myths And Mechanisms
7. Don't Let AI Replace Your Mind
8. Thinking Like a Human: The Power of Your Mind in the Age of AI
9. What Machines Can't Replace: Why AI Makes Us More Human
10. The Creativity Code: Art and Innovation in the Age of AI

Programmatic assertions on the rendered page: `innerText.includes("Maria Ian")`
→ **false**; `innerText.includes("Creative Brain")` → **false**. No "no matches"
text anywhere on the page.

**§2's graceful page appears only when the query has no plausible neighbours.**
The moment a query has adjacent subject matter — which any real book title does —
the graceful page is replaced by a page of other books, and **the visitor has no
way to tell that their book is absent**. A miss that announces itself is a
degradation; a miss that looks exactly like a hit is a defect.

This is the opposite of the property [#90](https://github.com/mephistopheles4/stacks/issues/90)
credited to Open Library's ISBN URL, and it is the finding that should decide
[#98](https://github.com/mephistopheles4/stacks/issues/98)'s sub-decision.

Two of the six *were* found, correct book in row 1: `The Infinity Machine` /
Sebastian Mallaby, and `From Zero to Profit with AI…` / Helen B. Keating
("Helen B Keating · 2026"). [measured, browser]

---

## 4. Title alone, no author

Hypothetical today — all 41 books have an author — but the frontmatter contract
requires only `type: book` and `title`, so a hand-written note can produce it.

```
GET https://books.google.com/books?q=The%20Infinity%20Machine
→ 302  Location: https://www.google.com/search?tbo=p&tbm=bks&q=The+Infinity+Machine
```

**No error, no special handling, same destination as the two-term form.**
[measured, script] The URL construction degrades cleanly; a single-term query is
simply a broader search. Its *result quality* is unmeasured — a bare title is
more likely to land on §3's silent partial miss than a title-plus-author query
is, since it constrains less. [inferred]

---

## 5. ⚠️ Three refusal modes, and each defeats a different check

This is the part that sharpens [ADR-0027](../adr/0027-deploy-check-reports-refusal.md),
and the reason "read the status before the body" is **necessary but not
sufficient**.

| # | Refusal | Status | Final URL | Caught by status? | Caught by final URL? |
|---|---|---|---|---|---|
| 1 | Google `/sorry/` challenge | **429** | `google.com/sorry/index?…` | ✅ yes | ✅ yes |
| 2 | Open Library human check | **303 → 200** | `openlibrary.org/verify_human?next=…` | ❌ **no** | ✅ yes |
| 3 | Google JS shell | **200** | *the URL you asked for* | ❌ **no** | ❌ **no** |

**Mode 1 — Google's 429.** Seventh navigation, ~2 minutes into an ordinary
browsing session, one residential IP, ordinary Chromium:
`GET https://www.google.com/sorry/index?continue=…` → **429**, plus
`recaptcha/enterprise.js` → 200. Body is 395 characters of *"Our systems have
detected unusual traffic from your computer network."* [measured, browser]

⚠️ **This is not a non-browser artifact.** It fired in a real browser on a
residential IP. A visitor on a shared, corporate or VPN'd IP can meet it too. Read
as content, its short bodyless-of-results shape is indistinguishable from an empty
search; the **429 is the only tell**.

**Mode 2 — Open Library's, which a status check misses entirely.**
[measured, script]

```
GET https://openlibrary.org/search?q=<long title>
→ 303  Location: https://openlibrary.org/verify_human?next=/search%3Fq%3D…
→ 200  <title>Human Verification | Open Library</title>  "Please verify you are human to continue"
```

The *final* status is **200** and the page is well-formed, so a check that reads
the status and stops calls this a success. Only the final URL after redirects
catches it. It preserves `next`, so a human who clicks through still lands on
their search. (The browser session recorded this as a 302; the script measured
**303**. Both are redirects to the same place; the precise code differs and 303
is what was observed here.)

**Mode 3 — Google's JS shell, which defeats both checks.** §2's shell arrives as
**HTTP 200 on exactly the URL requested**, after the one expected redirect.
Neither the status nor the final URL is anomalous. **Only an assertion about
body content** — "does this page contain result rows, or a no-match notice?" —
detects it. This mode is not in ADR-0027 and is the strongest reason a future
check should assert on content, not merely on status and destination.

**Methodology note, same trap one level down.** An exact-string search for
`No books directly matched` against **raw HTML** returned *false* on a page that
plainly contains that sentence — intervening tags and whitespace split it. Tags
must be stripped before asserting on prose. A content assertion written the naive
way produces exactly the false negative it was added to prevent.

---

## 6. Escaping: `encodeURIComponent` is sufficient

**No escaping beyond `encodeURIComponent` is required.** [measured, script and
browser independently]

Google canonicalises the query in its own `Location` header:

| Input | In Google's canonical URL |
|---|---|
| `%20` (space) | `+` |
| `%3A` (colon) | `:` literal |
| `%2A` (asterisk) | `*` literal |
| `*` sent literally | `*` literal |
| `%22` (quote) | `%22` preserved |

**The asterisk test, by name.** `The Subtle Art of Not Giving a F*ck: A
Counterintuitive Approach to Living a Good Life` / Mark Manson was sent twice —
once with the asterisk percent-encoded as `%2A`, once with it literal, which is
what JS `encodeURIComponent` produces (it does not escape `*`; .NET's
`EscapeDataString` does, which is why both were tested). **Both land on a
byte-identical destination URL.** [measured, script] The browser session
confirmed the query returns relevant Manson results with **no safe-search
suppression** of either the asterisk or the profanity. [measured, browser]

Colons in titles need no special handling: Google echoes them literally and
treats them as ordinary text, not as operator syntax, in the absence of a
recognised operator keyword before them.

---

## 7. The comparison the revert needs: Open Library on the same queries

[#98](https://github.com/mephistopheles4/stacks/issues/98) pre-authorised
reverting the search target to Open Library "if the search degrades badly", so
the verdict is comparative whether or not this ticket framed it that way. This
section exists so a reverting session does not have to discover the alternative
blind. **It does not displace the five numbered items above.**

Form: `https://openlibrary.org/search?q=<query>`, same space-joined title-plus-author string.

| Query | Open Library | Google |
|---|---|---|
| `The Creative Brain… Maria Ian` | **200, "No books directly matched your search. Add a new book?"** | 10 wrong books, no notice |
| `The New Emotional Intelligence Travis Bradberry` | **200, "No books directly matched your search."** | ⚠️ unmeasured — see below |
| `The Infinity Machine Sebastian Mallaby` | 200, found (`Mallaby` in results) | found, row 1 |
| `The Subtle Art…` (long title) | **refused** — 303 → `verify_human` | found, relevant |

[measured, script; the Maria Ian result independently [measured, browser]]

⚠️ **The highest-value single follow-up this ticket leaves open.**
`The New Emotional Intelligence` / Travis Bradberry is the **second** of the six
that Open Library honestly reports as absent — which makes it the natural
replication of §3. **Google's behaviour on it is unmeasured**: the browser
session did not test it, and the script cannot read Google result content at all
(§2). It is a named gap, not an oversight. §3's silent-miss finding currently
rests on **one title** (Maria Ian); running this one query in a browser would put
it on two independent titles, and it is the cheapest thing anyone can do to
strengthen — or upset — the verdict below.

**Open Library names its misses.** On the exact query where Google returned ten
wrong books and said nothing, Open Library says so in prose, stays on
`openlibrary.org`, keeps `document.title` as `search | Open Library`, and offers
*Add a new book?*. It also honestly missed `The New Emotional Intelligence`
rather than padding it with neighbours.

**Open Library is also server-rendered**, which is why the script could read its
results at all while Google's were unreadable. That is a verifiability advantage
for any future gate: Open Library's search behaviour can be asserted in CI
without a browser; Google's cannot.

**But Open Library refuses more readily, and on a query shape this vault
produces.** The long Manson title was challenged (§5, mode 2).

### An inference this session tested and **refuted**

The browser session flagged, explicitly as unverified, that Open Library's
Solr-backed search might be choking on `*` as a **wildcard** — which would mean
`*` needs provider-specific escaping that `encodeURIComponent` does not provide.

**That is not what is happening.** [measured, script] Three controls:

1. The same long title **with the asterisk removed entirely** (`Fck`) was
   refused identically — 303 → `verify_human`.
2. A **short** query (`The Infinity Machine Sebastian Mallaby`) succeeded
   immediately *after* a refusal.
3. Another **short** query (`The New Emotional Intelligence Travis Bradberry`)
   succeeded immediately *after* the second refusal.

So the trigger is neither the asterisk nor request-count rate limiting — short
queries pass on either side of a refusal. **Query length or complexity is
implicated instead** [inferred from three measurements; the exact threshold was
not mapped]. The practical consequence: **`encodeURIComponent` remains sufficient
for both providers**, and the per-provider escaping worry is withdrawn.

---

## 8. Region

The destination is geo-personalised: result rows mixed `books.google.ca` with
`books.google.com`, and the page footer read `Canada, H3C, Montreal, QC - From
your IP address`. [measured, browser] A visitor's search lands in their own
region, which — unlike Apple's hardcoded `/us/` storefront in
[#100](https://github.com/mephistopheles4/stacks/issues/100) — is the desirable
direction, since nothing is baked into the URL.

---

## 9. What was not done, and why

- **No API key, and no Books API call.** The ticket forbids rescuing a public
  path with an authenticated one, and `GOOGLE_BOOKS_API_KEY` was never read. **The
  disagreement is itself a finding**: the repo's cached provider responses and the
  Books API can establish whether a book exists in Google's catalogue, while the
  *public search path* renders nothing a script can read (§2) and, for a visitor,
  does not disclose absence at all (§3). **A book present in the API can be
  invisible in public search, and public search never says so.** That gap is the
  substance of this ticket and must not be closed by authenticating.
- **No CAPTCHA was solved or routed around**, on either provider.
- **No user-agent spoofing.** It was not attempted; the project already measured
  it as ineffective on the deploy check
  ([ADR-0027](../adr/0027-deploy-check-reports-refusal.md)), and Google's block
  here is a JS requirement (§2 mode 3) that a UA string cannot satisfy anyway.
- **Google result *content* is unverified from the script**, in every case. All
  content claims in §2 and §3 are the browser session's.
- **Quoted `intitle:`/`inauthor:` result quality is unmeasured by both
  sessions** (§1).
- **Google's behaviour on `The New Emotional Intelligence` / Travis Bradberry is
  unmeasured** (§7) — the one query that would replicate §3 on a second title.
- **The vault was not touched**, and no code outside `docs/research/` changed.

---

## Test evidence log

| # | Assertion | Request | Status | Final URL / outcome | Client |
|---|---|---|---|---|---|
| 1 | Form A bounces | `books.google.com/books?q=Beyond+Vibe+Coding…Addy+Osmani` | 302 → 200 | `www.google.com/search?tbo=p&tbm=bks&q=…` | script |
| 2 | Form B is the destination | `www.google.com/search?tbm=bks&q=…` | 200 | same URL, no redirect | script |
| 3 | Escaping, `%2A` | `…q=…F%2Ack%3A…` | 302 | `…q=…F*ck:…` | script |
| 4 | Escaping, literal `*` | `…q=…F*ck%3A…` | 302 | `…q=…F*ck:…` (identical) | script |
| 5 | Title alone | `books.google.com/books?q=The%20Infinity%20Machine` | 302 | `…?tbo=p&tbm=bks&q=The+Infinity+Machine` | script |
| 6 | Operators survive, unquoted | `…q=intitle:The+Infinity+Machine+inauthor:…` | 302 | operator preserved in `Location` | script |
| 7 | Operators survive, quoted | `…q=intitle:%22The+Infinity+Machine%22…` | 302 | operator preserved in `Location` | script |
| 8 | `From Zero to Profit…` builds | `books.google.com/books?q=…Helen+B.+Keating` | 302 | `…?tbo=p&tbm=bks&q=…` | script |
| 9 | `The New Emotional Intelligence…` builds | `books.google.com/books?q=…Travis+Bradberry` | 302 | `…?tbo=p&tbm=bks&q=…` | script |
| 10 | Google body is a JS shell | impossible / absent / present | 200 ×3 | 91,247 / 91,240 / 91,188 bytes, all `<noscript>`+`enablejs` | script |
| 11 | Impossible query degrades gracefully | control query | 200 | "there aren't any 'Books' matches" + *See all results* | browser |
| 12 | **Absent real book does not** | `The Creative Brain…Maria Ian` | 200 | 10 wrong rows; `includes("Maria Ian")` false | browser |
| 13 | Google challenge is reachable in a browser | 7th navigation | **429** | `google.com/sorry/index?…` + reCAPTCHA | browser |
| 14 | Open Library names the miss | `openlibrary.org/search?q=…Maria+Ian` | 200 | "No books directly matched your search." | script + browser |
| 15 | Open Library refuses long queries | `openlibrary.org/search?q=The+Subtle+Art…` | **303 → 200** | `openlibrary.org/verify_human?next=…` | script |
| 16 | …with the asterisk removed too | `…q=The+Subtle+Art…Fck…` | **303 → 200** | `verify_human` — refutes the wildcard theory | script |
| 17 | Short query passes after a refusal | `…q=The+Infinity+Machine+Sebastian+Mallaby` | 200 | found | script |
| 18 | Short query passes after a 2nd refusal | `…q=The+New+Emotional+Intelligence…` | 200 | "No books directly matched" | script |

---

## Verdict

**The "Search Google Books" link does not degrade acceptably**, on two
independent grounds, either of which is sufficient to reopen
[#98](https://github.com/mephistopheles4/stacks/issues/98)'s search-target
sub-decision:

1. **It does not go where its label says.** Every form lands on
   `www.google.com/search`, titled "… - Google Search". [measured, both clients]
2. **Its miss is silent for exactly the books this link serves.** The graceful
   page exists only for queries with no plausible neighbours; a real book Google
   does not hold returns ten wrong books and no notice. [measured, browser]

Ground 1 is unanimous across both clients and needs no interpretation. **Ground 2
rests on browser-only content observation of a single title**, which is why the
Bradberry follow-up named in §7 is worth running before this verdict is treated
as settled.

Ground 2 is the serious one. The link exists for books with *no identifier* —
the least-known books in the vault, the ones most likely to be absent — and it is
precisely on those that Google's failure becomes invisible.

**Open Library names its misses on the same queries, and is server-renderable so
a gate could assert on it without a browser.** Its cost is a readier human-check
on long queries (§7), which is a refusal a visitor can click through and is
*visible* when it happens.

**Nothing else in [#98](https://github.com/mephistopheles4/stacks/issues/98)
moves** — not the three marks, not the URL forms, not the card-level fallback
rule, not the row order.

---

## Sources

Every finding above is from live measurement; the two documentation-only points
are marked. No secondary write-ups were relied on, and no page that could not be
read is paraphrased.

- [Google Books API Terms of Service](https://developers.google.com/books/terms) — for the API/public-search distinction only; **not** used to establish any public-path behaviour.
- [ADR-0027 — the deploy check reports refusal](../adr/0027-deploy-check-reports-refusal.md) — the status-before-body rule this document extends with a third refusal mode.
- [#90](https://github.com/mephistopheles4/stacks/issues/90) — the ISBN-URL baseline this is measured against.
- [#98](https://github.com/mephistopheles4/stacks/issues/98) — the decision whose search-target sub-decision this reopens.
- Prior research in this map, on branches rather than `main`: [`provider-id-urls.md`](https://github.com/mephistopheles4/stacks/blob/research/provider-id-urls/docs/research/provider-id-urls.md), [`provider-mark-usage.md`](https://github.com/mephistopheles4/stacks/blob/research/provider-marks/docs/research/provider-mark-usage.md).
