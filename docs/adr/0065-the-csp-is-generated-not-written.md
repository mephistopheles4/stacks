# The CSP is generated per page by Astro, and it names the beacon it cannot remove

[#127](https://github.com/mephistopheles4/stacks/issues/127) asked for three
things: a `Content-Security-Policy` in `_headers`, a `csp` entry in
`PUBLIC_BUILD_RULES`, and — free — G20's standing requirement that every rule in
that list be watched going red. The second and third landed exactly as written.
**The first did not, in two ways, and both are worth the record.**

## The policy is a `<meta http-equiv>`, generated from the build

`packages/site/astro.config.mjs` sets `security.csp`. Astro emits the policy into
every page and computes `script-src` and `style-src` hashes from what that page
actually contains.

**A hand-written policy in `_headers` was the obvious alternative and the wrong
one.** Astro inlines a stylesheet under 4kB — so `/attribution` ships an inline
`<style>` and the index does not, and the two pages need different `style-src`
hashes _from the same build_. Any hand-written copy is therefore either wrong for
one page or loosened with `'unsafe-inline'` until it is wrong for both.

Worse, the threshold moves. A CSS edit either side of 4kB flips a page between
inline and external, so a policy that was correct at the commit it was written
stops being correct at a commit that never mentioned it. **The failure is
silent**: an unstyled page, or a shelf that never boots, with a green build. That
is the same shape as the `_headers` comment this change deletes — a claim true
when written and true of nothing since — which is a poor thing to reproduce in
the fix for it.

Hashes computed from the build are true by construction. **Nothing has to
remember.**

Two consequences, one of them a genuine gain:

- **`frame-ancestors` cannot ride in a meta tag** — browsers ignore it there — so
  it lives in `_headers` as **a policy of exactly one directive**, beside
  `X-Frame-Options: DENY`. That is not a second copy of the page policy, and the
  distinction is the whole of it: the two are **disjoint**, so neither can drift
  from the other. Policies compose — each is enforced independently — and one
  declaring no fetch directives restricts nothing but framing. See _What was
  rejected_ below, where a fuller header policy is weighed and refused.
- **`pnpm smoke:render` enforces this policy for free.** It builds `dist/`, serves
  it over HTTP and loads it in real Chrome, which honours a meta CSP. A
  `_headers` policy would have been invisible to it, because Cloudflare Pages is
  the only thing that reads that file. The gate that already existed became a
  second observer of this one without being asked to.

The same reasoning was reached independently in `aymandiab.com`, a sibling Astro
site on the same Cloudflare zone, and its notes supplied the two traps below.

## `script-src` names `static.cloudflareinsights.com`

The zone injects Cloudflare Web Analytics at the edge. The beacon is in **no file
in this repo** — `dist/index.html` ships one `<script>` and the live origin serves
two — and `/attribution` gets it as well, despite shipping none of its own.

⚠️ **Refusing it is a real choice, and an earlier draft of this record called it a
no-op.** That was wrong and is corrected here rather than quietly reworded: a
`script-src` omitting the origin makes the browser refuse the script, so the
analytics genuinely stop working. What survives is the injected tag and a
violation logged on every page load.

So the argument is not _"blocking achieves nothing"_. It is that **blocking is a
policy file overriding a zone setting the owner deliberately enabled, for no
privacy gain.** The beacon reports same-origin and carries nothing derived from
the owner's reading, so refusing it buys none of what invariant 2 or #119's
no-outbound-flow principle protects. If Web Analytics should not run on this site,
the place to say so is the Cloudflare dashboard, where turning it off also removes
the injection; a CSP that fought it would leave the tag, lose the data, and log
the disagreement forever.

**It does not contradict [#119](https://github.com/mephistopheles4/stacks/issues/119).**
That ticket rejected _option C_, a client beacon **stacks would build** to count
an invariant, and all three arguments that defeat it are specific to that counter:
it vetoes the localhost dashboard, the observer would ship inside the artifact it
observes, and a zero-expected counter cannot distinguish _held_ from _never ran_.
None touches a zone feature. #119's own correction comment already settled the
case directly:

> edge-injected markup on the deployed site is **observed by nothing**, before or
> after this ticket, and stacks accepts that

and framed this issue as narrowing it _"from the other end — a CSP constrains what
injected script could **do** — without ever detecting that it happened."_ That is
what this policy does. The no-outbound-flow principle is scoped to flows
_"carrying anything derived from the owner's reading"_, and a page-load count on a
two-page site carries none of it.

⚠️ **The injected beacon reports same-origin, to `/cdn-cgi/rum`.** Only a
hand-embedded beacon posts to `cloudflareinsights.com`, and a manual snippet on a
zone configured for automatic install 404s — so never add one. This is why
`connect-src 'self'`, the directive the whole issue is about, needed no widening
at all: the beacon question turned out to be orthogonal to it.

⚠️ **The origin, never the exact file.** The beacon loads from a versioned path
(`/beacon.min.js/v4513226c…`) whose version changes with every Cloudflare release,
so the exact-file URL in Cloudflare's own CSP documentation stops matching. The
failure is silent in the other direction: the page renders and analytics records
nothing.

⚠️ **`'self'` must be listed explicitly** in `scriptDirective.resources`. That
field _replaces_ Astro's defaults rather than appending to them, and dropping it
blocks the shelf's own `/_astro/*.js` — a black canvas with the page otherwise
intact.

## What the rule asserts, and why not more

`csp` in `scripts/lib/public-build.ts` reads every built HTML page — per page, for
the reason `robots` is, since a meta CSP governs only the document carrying it —
and holds the **whole** directive set in `CSP_DIRECTIVES` to its exact sources:
`default-src 'none'`, `img-src 'self'`, `connect-src 'self'`, `base-uri 'none'`,
`form-action 'none'`, `script-src 'self' https://static.cloudflareinsights.com`,
`style-src 'self'`.

⚠️ **It pinned `connect-src` and the script origins alone at first, and review
caught it.** The other four could each be deleted from `astro.config.mjs` with
every gate green and the page pixel-identical, while this record and `_headers`
went on describing a policy that no longer said what they claimed. **That is the
issue's own failure shape reproduced inside the fix for it** — a document
asserting a mitigation nothing enforces — and four directives in that state is
not a smaller version of the problem than one.

⚠️ **Review then found the same mistake one level out.** The rule walked its own
list and never looked at what else the policy declared, so a directive nobody
named — `object-src *`, `worker-src *`, and above all `script-src-elem`, which
takes precedence over `script-src` for `<script>` elements — widened the policy
with every pinned directive still exactly right. The set is closed now. **Twice
in one change, checking the named thing missed the unnamed one**, which is worth
more than either fix.

**Directives are parsed, never string-matched.** Astro recomputes the hashes on
every build, so a rule matching whole directive values would be red on the next
commit for a reason unconnected to what it guards. Hashes are filtered out of
every comparison; `style-src` is held to its `'self'` and to being present at all,
which is the stable part of it.

**The script origins are pinned as a set so the exception stays enumerable.** The
property is _same-origin except one named origin_, and the answer to "which third
parties does the shelf permit" has to be a list somebody can read. This is
`cover_source`'s reasoning applied to a different question: the value of naming
the exception is that the _second_ one cannot arrive unnoticed.

**Both framing controls are asserted too**, out of the `/*` block by name, for the
same reason. They were described here and in `_headers` as the enforced half of
the division of labour, and enforced by nothing — which is the sentence this whole
issue was written about. Asserting both means neither can be deleted on the theory
that the other covers it.

## What was rejected

⚠️ **A supplementary header policy carrying the hash-free directives.** The
strongest alternative, and the first draft of this record never argued against it
— it argued only against a _whole_ hand-written policy, which is a weaker claim
that the 4kB hash problem disposes of on its own. Stated properly: `_headers`
could carry `connect-src 'self'`, `base-uri 'none'`, `form-action 'none'` and
`frame-ancestors 'none'` as a second policy. Policies compose by intersection, so
it could only tighten; it needs no hashes, so it never goes stale; and it would
reach non-HTML responses a meta tag cannot.

**Refused, because it duplicates the directives that are already generated.**
Three of those four are in `CSP_DIRECTIVES` and in the meta tag, and a rule
written down twice is the defect this repo has already paid for and named — _"a
canary that drifts between the place it is planted and the place it is searched
for is worse than no canary: both halves keep passing."_ The gate would then be
holding two policies to one intent, and the interesting failure is not either one
being absent but the two disagreeing.

**What that alternative was actually right about is `frame-ancestors`**, which the
generated policy _structurally cannot contain_. So that one directive is adopted
in the header — alone. The split is by what the meta tag can carry rather than by
what is convenient, which is what makes the two sets disjoint and the drift
question moot. The non-HTML-response coverage is given up knowingly: `library.json`
and the covers are served with `nosniff`, and there is no directive a policy on a
JSON response would enforce that matters here.

**`inlineStylesheets: 'never'`** — makes the inline `<style>` external and lets
`style-src 'self'` stand alone. It works, and it buys the determinism the 4kB
threshold takes away, but it is a build-config change made to satisfy a policy
file, costing `/attribution` a request, when generating the policy solves the same
problem without touching what the build emits.

**`style-src 'unsafe-inline'`** — the cheap version. It permits every inline style
on every page forever to accommodate one stylesheet Astro chose to inline, which
is a permanent loosening bought with a temporary convenience.

**`report-uri` / `report-to`** — rejected on #119's own argument, restated: it is
an outbound flow from the visitor's browser, and enforcement without reporting is
the version that adds none.

## What this still does not do

**Nothing detects that injection happened.** #119 recorded that gap and accepted
it; this narrows what injected script may do and leaves the gap exactly where it
was. `deploy.ts`'s stamp check is deliberately blind to edge modification, for its
own good reasons (`deploy.ts:443`), and remains so.

**The rule reads the artifact, not the zone.** A CSP correct in `dist/` says
nothing about Cloudflare features enabled in the dashboard afterwards. In
particular, **do not enable JS Detections** under Super Bot Fight Mode: it injects
an inline script no hash can cover, so this policy would block it — cost without
benefit, on every page load.
