# Optional Plausible on the shelf, switched on by an environment variable

The spec for [#562](https://github.com/mephistopheles4/stacks/issues/562). Tier:
standard, one build session, with the security pair on this spec and on the diff, by
the owner's choice on 2026-11-07. It matches nothing on the sensitive list (no auth,
crypto or data migration), but it opens a new flow from every visitor's browser to a
third party and widens the page's CSP. There is no `docs/threat-model.md`, so the
sensitive list decides what counts as a security finding. Written on 2026-11-07 from a
grilling through an eagle-eye box, whose accepted set is S2. Base: `ca372c4`.
**Nothing here is built. Not signed off.**

## S1. Objective

> I already have plausible as part of my main domain, and I'm wondering what would be
> the cost of adding it here as optional. I don't think it clashes with the Cloudflare
> beacon.

> I think it's important to keep it optional, perhaps turned on through an environment
> variable.

The owner's words, 2026-11-07. Cloudflare Web Analytics is injected by the zone and is
live today ([ADR-0065](../adr/0065-the-csp-is-generated-not-written.md)). It counts
visits, referrers, countries and Core Web Vitals. It cannot see anything inside the page:
picking a book up and opening it leave `location.href` unchanged by design (the Phase 2
gate pins this), so its SPA mode never records them. Plausible adds custom events and a
Sources report, on an account the owner already pays for.

**Done means:** a build with `PUBLIC_PLAUSIBLE_DOMAIN` unset is the same site as today,
and a build with it set reports page views and four events from `stacks.aymandiab.com`
to Plausible, and from nowhere else. The CSP and the privacy page say what each build
does. The two analytics run side by side, and their counts will not agree: ad blockers
block `plausible.io` far more often than Cloudflare's same-origin `/cdn-cgi/rum`.

## S2. The owner's decisions

Accepted on 2026-11-07, each a row of the box.

| Decision | Choice |
| --- | --- |
| The switch | One variable, `PUBLIC_PLAUSIBLE_DOMAIN`, holding the Plausible site name. Empty or unset means off |
| Who runs the counter | Hosted Plausible, on the owner's existing account |
| Which Plausible site | A new site, `stacks.aymandiab.com`, with its own goals |
| Where events go | Straight to `https://plausible.io`, from the tracker bundled from npm |
| How G20 holds the CSP | Two exact shapes: off is today's policy; on adds `https://plausible.io` to `connect-src` and nothing else |
| What the URL may carry | Only the campaign parameters Plausible reads. Every other query parameter is dropped |
| Which events | `Book Picked Up`, `Book Opened`, `Ask Opened`, `Ask Sent` |
| What a book event carries | One property, `book`: the book's public id, the id in `notes/<id>.json` |
| What `Ask Sent` carries | No property |
| Where it starts | Only when `location.hostname` is exactly `stacks.aymandiab.com` |
| Which pages | Every page: the shelf, `/attribution` and `/privacy` |
| The privacy page | Names Cloudflare Web Analytics in every build. Names Plausible only in a build with the switch on |
| What `deploy:site` does | Accepts either state, prints which one it built, and checks after upload that the live CSP matches it |

**`Ask Sent` is a change of scope.** #562 put Ask usage out of scope, because
[#541](https://github.com/mephistopheles4/stacks/issues/541) counts it from the Worker's
logs. The owner added it in the box and has not yet said why; that is S16's first
question. It carries nothing about the question.

**Rejected in the box, with the reason kept there:** a self-hosted Plausible (the first
server this project would run), a Stacks counter on Workers Analytics Engine (close to
the beacon [#119](https://github.com/mephistopheles4/stacks/issues/119) rejected), a
same-origin proxy (an edge route to build and own, for a CSP that would never change), a
remote `<script>` from `plausible.io` (a second script origin), and a tag manager (inline
or eval'd script, configured outside the repo).

## S3. The switch

- `PUBLIC_PLAUSIBLE_DOMAIN` is read once, at build time, as
  `import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN`, in one `.ts` module (S4). A value that is
  empty or only whitespace means off. Any other value is trimmed and used as the
  tracker's `domain`.
- A value is accepted only if it matches `^[a-z0-9.-]+$`. Any other value **fails the
  build** with a message naming the variable and never echoing the value, the same
  posture as `PUBLIC_TURNSTILE_SITE_KEY`. A typo must not ship a tracker that reports to
  a site nobody reads.
- `.env.example` gains a commented `# PUBLIC_PLAUSIBLE_DOMAIN=` with a comment block:
  what it does, that it is public by design, that the site must exist in the Plausible
  account under that name with the four goals of S6, and that unset is a complete and
  supported build. G9 (`env-contract`) then holds it, since the site reads it.
- `astro.config.mjs` reads the same variable to choose the CSP (S5). The config and the
  module must agree on "on", so the predicate is one exported function in a module both
  can import, with no import from the site's runtime code into the config beyond it.

## S4. The analytics module

One new file, `packages/site/src/analytics/plausible.ts`, and its test. It is the only
place that starts the tracker and the only place that sends an event, the shape
aymandiab.com's `src/lib/analytics.ts` already runs.

```ts
export type EventName = 'Book Picked Up' | 'Book Opened' | 'Ask Opened' | 'Ask Sent';
export const PRODUCTION_HOST = 'stacks.aymandiab.com';

/** Start the tracker once, if the switch is on and the host is production. */
export function startAnalytics(where: Location): void;
/** Send one event. A no-op when off, off-host, or not started yet. */
export function trackBook(name: 'Book Picked Up' | 'Book Opened', id: string): void;
export function trackAsk(name: 'Ask Opened' | 'Ask Sent'): void;
export function scrubUrl(href: string): string;
```

- **The tracker is loaded by a dynamic `import()` inside the switch's branch.** With the
  switch off, Vite replaces the variable with a literal and the branch, and the chunk with
  it, is removed. An off build ships no tracker code (C2).
- **Off-host means never started.** `startAnalytics` compares `where.hostname` with
  `PRODUCTION_HOST` exactly. localhost, `*.pages.dev` and every preview stay out of the
  dashboard. `PRODUCTION_HOST` must equal `WIDGET_DOMAIN` in `scripts/lib/turnstile.ts`;
  a test reads both.
- **Events before the tracker is ready are dropped, never queued.** The shelf cannot be
  picked up before boot, and a queue is state that can grow.
- **Every request passes `scrubUrl`** for the page URL and the referrer, through the
  tracker's request transform. The query string keeps only `ref`, `source`, `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_content` and `utm_term`. `?debug=<json>`, `?solo`,
  `?woodSeed` and any parameter added later are dropped. The fragment is dropped too.
- **A property is the id and nothing else.** `trackBook` sends `{ book: id }` only when
  `id` matches the shape `notes/<id>.json` already requires; any other value sends the
  event with no property. `trackAsk` sends no property, by its signature.
- **Plausible's own options:** page views on, `outboundLinks` on (the attribution page
  links out to providers), file downloads off, hash-based routing off, and
  `autoCapturePageviews` on. Nothing else is configured.
- The dependency is `@plausible-analytics/tracker`, pinned exact in
  `packages/site/package.json`, as `gsap` is, and subject to the release-age window
  (G67). The ADR in S9 records why.

## S5. The CSP and G20

- **Off:** today's policy, byte for byte in its directive set. `connect-src 'self'`.
- **On:** the same set, with `connect-src 'self' https://plausible.io`. No other
  directive changes. `script-src` keeps its three sources, because the tracker is bundled
  and served from `'self'`.
- `astro.config.mjs` builds the `connect-src` entry from S3's predicate. The comment above
  it says why the second shape exists and links the ADR.
- **G20 (`public-build-artifact`).** `CSP_DIRECTIVES` in `scripts/lib/public-build.ts`
  becomes a function of the switch: the `csp` rule expects the on shape when
  `PUBLIC_PLAUSIBLE_DOMAIN` is set in the environment the rule runs in, and the off shape
  when it is not. Every other assertion of the rule is unchanged: the set is closed, a
  directive outside it fails, and hashes are filtered. Two new planted defects, each
  firing `csp` and nothing else:
  - an off-shape page checked with the switch on (the origin is missing);
  - an on-shape page checked with the switch off (an origin nobody turned on).
  `pnpm gate:public` runs with the switch unset, so it proves the off build.
- **The off build ships no trace.** A new clause of the same rule: with the switch off,
  no file under `dist/` contains the string `plausible.io`. It is planted red by a file
  that does.
- `frame-ancestors` and `_headers` are untouched.

## S6. The events

| Event | Fires | Property | Where |
| --- | --- | --- | --- |
| `Book Picked Up` | Once per pickup that lands in the hand, from a shelf click or a chat link | `book` | Beside each `announceHeld` call in `shelf/pickup.ts`, so the two pickup paths cannot drift apart |
| `Book Opened` | Once per opening that reaches open at rest | `book` | In the `opened` effect in `shelf/pickup.ts` |
| `Ask Opened` | Each time the drawer goes from shut to open | none | In `show()` in `ask/drawer.ts`, after its early return |
| `Ask Sent` | Each question the visitor sends with non-empty text, before the token is asked for | none | At the top of `ask()` in `ask/drawer.ts`, after the empty-text return |

- The page view is the tracker's own, once per page load. Pickups do not change the URL,
  so they add no page views.
- **Nothing else is sent.** Not the question, not the answer, not the follow-ups, not a
  setting, not the hold time, not the inspectors. Invariant 2 is untouched: no event reads
  a note, a `notes/<id>.json` file or the held page's text.
- The goals the owner must create in the Plausible site, by these exact names, are the
  four events above, plus `Outbound Link: Click`. `docs/commands.md` lists them.

## S7. The pages

- **The shelf** starts the tracker from its existing `<script>` in `Shelf.astro`, as one
  more call after the imports, within G7's shape.
- **`/attribution` and `/privacy`** ship no script of their own today. With the switch
  on, `NoticePage.astro` gains one `<script>` that imports `startAnalytics` and calls it.
  With the switch off, the script imports a module whose branch is removed, so the page
  ships no tracker. ⚠️ A notice page then carries a module script in an on build; the
  `csp` rule already checks every built page, so it covers them.
- **`/privacy`** gains two paragraphs. The Plausible one is a small component,
  `components/PlausibleNotice.astro`, rendered as `{analyticsOn && <PlausibleNotice />}`
  with `analyticsOn` imported from S3's module: one template expression reading a typed
  value, the same shape as `Ask.astro`'s `data-site-key`. The wording, to be kept plain:
  - Every build: *"Cloudflare Web Analytics counts page views and how fast pages load.
    It sets no cookies and reports to this site."*
  - On builds: *"Plausible Analytics counts page views, where visitors came from, and
    four actions: picking a book up, opening it, opening Ask the library, and sending a
    question. It records which book, never what you ask. It sets no cookies and does not
    follow you across sites."*

## S8. `deploy:site`

- It reads the switch before building and prints one line, `analytics: Plausible on
  (stacks.aymandiab.com)` or `analytics: Plausible off`, beside its other pre-build lines.
  Either state proceeds. It never refuses on the switch.
- Its re-check of `dist/` runs the same `csp` rule under the same environment, so a build
  that does not match the switch is refused before upload.
- **After upload** it reads the live index's CSP `<meta>` (whose content survives edge
  transforms, `deploy.ts:443`) and compares its `connect-src` with the shape it built. A
  mismatch is reported as a failure of the post-upload check, the same way a stale stamp
  is.
- `--dry-run` and `--check-only` print the analytics line too.

## S9. Records, in the build's commit

- **A new ADR**, next free number (0138 at this base): optional Plausible, direct to
  `plausible.io`. It amends ADR-0065 and ADR-0128, which kept `connect-src 'self'`. It
  records the dependency, the second processor, why not a proxy, why not self-hosted, why
  not Workers Analytics Engine, why not a tag manager, and why this is not #119's beacon:
  #119 rejected a counter Stacks would build to watch an invariant; this is product
  analytics, off by default, with nothing derived from note bodies.
- **`AGENTS.md`:** the dependency note is the ADR. No invariant changes. The `.env`
  variable needs no line there.
- **`docs/gates.md`:** the G20 row and the G9 row gain the second shape and the variable.
  `docs/progress.md` in the same commit.
- **`docs/commands.md`:** a short "Analytics" section: the switch, the goals to create, how
  the owner excludes their own visits (`localStorage.plausible_ignore = 'true'` on the live
  site), and that `pnpm gate:public` proves the off build only.
- **`packages/site/astro.config.mjs`:** the comment block above `connect-src`.
- **`docs/spec/README.md`:** this spec's row.

## S10. Tests

Written first, each backing a claim in S11.

- `packages/site/src/analytics/plausible.test.ts`: `scrubUrl` keeps exactly the seven
  campaign parameters and drops the rest and the fragment; `startAnalytics` never loads the
  tracker on any host but `PRODUCTION_HOST`, and never with the switch off; `trackBook`
  drops a malformed id and keeps a well-formed one; events before start are dropped; the
  switch predicate treats empty and whitespace as off and refuses a value outside the
  pattern. The tracker module is replaced by a fake, so no request leaves (G21).
- `PRODUCTION_HOST === WIDGET_DOMAIN`, in a gate test that may import both.
- `gates/public-build-artifact.test.ts`: the two planted CSP defects and the planted
  `plausible.io` string of S5, each firing `csp` alone.
- `shelf/pickup.ts` and `ask/drawer.ts` are exercised through their existing tests, with a
  spy on the analytics module: one `Book Picked Up` per pickup from each path, one
  `Book Opened` per opening, one `Ask Opened` per shut-to-open, one `Ask Sent` per
  non-empty send and none for an empty one.
- **One real on build**, run by the build session and recorded in the PR: `pnpm build`
  with `PUBLIC_PLAUSIBLE_DOMAIN=stacks.aymandiab.com`, then `pnpm smoke:render` on that
  `dist/`. It is served from localhost, so the tracker never starts, and the run shows the
  on CSP enforced with no violation and no request to `plausible.io`.

## S11. Acceptance claims

| Claim | Holds when | Quality |
| --- | --- | --- |
| C1 | With the switch unset, every built page's CSP is today's directive set exactly, and G20 is green | Compatibility |
| C2 | With the switch unset, no file under `dist/` contains `plausible.io`, and the shelf's bundle holds no tracker chunk | Functional |
| C3 | With the switch set, every built page's CSP differs from C1's only by `https://plausible.io` in `connect-src`, and G20 is green under that environment | Compatibility |
| C4 | G20 fails on an off-shape page under an on environment, an on-shape page under an off environment, and an off build containing `plausible.io`, each through `csp` alone | Functional |
| C5 | A value of `PUBLIC_PLAUSIBLE_DOMAIN` outside `^[a-z0-9.-]+$` fails the build, and the message does not contain the value | Safety |
| C6 | The tracker starts only on `stacks.aymandiab.com`, and never with the switch off | Functional |
| C7 | Every request the tracker makes carries a URL and referrer with no query parameter outside the seven, and no fragment | Security |
| C8 | Each of the four events fires as S6 says, once per action, from both pickup paths, and no event carries a property other than `book` holding a well-formed public id | Functional |
| C9 | `/privacy` names Cloudflare Web Analytics in every build and Plausible only in an on build | Interaction |
| C10 | `deploy:site` prints the analytics line in every mode, proceeds in either state, and reports a live `connect-src` that differs from the built shape as a failed post-upload check | Reliability |
| C11 | The on build of S10 passes `pnpm smoke:render` with zero CSP violations and no request to `plausible.io` | Reliability |
| C12 | `athanor run`, `athanor run lint`, `athanor run build`, `athanor run smoke`, `pnpm lint:md`, `pnpm format:check` and `pnpm gate:public` are green | Maintainability |

## S12. Boundaries for the build session

- **Always:** run the suite through `athanor run`; write the tests first; keep every
  event and property behind the one module; keep `.astro` files within G7.
- **Ask first:** any change to S2; a fifth event or a second property; any CSP change
  beyond `connect-src`; a change to `/privacy` wording beyond S7.
- **Never:** send note text, Thoughts, a question or an answer to Plausible; load the
  tracker from another origin; let an off build carry the tracker; set the variable in CI
  or in a committed file; create the Plausible site or its goals (that is the owner's).

## S13. Trade-offs

The repo names no business driver, so the owner's stated reasons decide.

| Pull | Side taken | Driver |
| --- | --- | --- |
| Counting more visits against a CSP that never changes | Direct: fewer counted (ad blockers), an extra origin when on | Matches the setup the owner already runs; no edge route to own |
| One CSP shape against an off build that names nothing it does not use | Two shapes, at the cost of a G20 that reads the environment | The owner's "optional", and #562's claim that an off build adds no CSP source |
| A dashboard that shows titles against a stable key | The public id: titles are easier to read, ids survive an edit | A title edit would split one book's counts |
| Ask Sent against #541's scope line | Ask Sent, carrying nothing | The owner's choice in the box; the reason is open (S16) |

## S14. Residuals

- **The counts will not agree with Cloudflare's**, and nothing here reconciles them.
- **Plausible's own processing** (it hashes the address and user agent with a salt it
  rotates daily) is its claim, not something this repo can check.
- **A preview deploy built with the switch on** ships the on CSP and a tracker that never
  starts. That is harmless, and it is why the host check exists.
- **The live check reads the index only.** The notice pages' CSP is held by the `dist/`
  re-check before upload, not read back live.

## S15. Needs a human

- Create the Plausible site `stacks.aymandiab.com` and the five goals of S6. (Owner.)
- Set `PUBLIC_PLAUSIBLE_DOMAIN=stacks.aymandiab.com` where `deploy:site` runs, when the
  owner wants it on, and deploy. (Owner: it publishes.)
- After the first on deploy, open the live shelf with no ad blocker, pick a book up and
  open it, and see the events in the dashboard. (Owner.)

## S16. The owner's open questions

- **Why `Ask Sent`?** #562 put Ask usage out of scope because #541 already counts it from
  the Worker's logs. The owner added the event in the box on 2026-11-07 and has not yet
  given a reason. The answer decides whether the event stays, and it goes in the ADR.
