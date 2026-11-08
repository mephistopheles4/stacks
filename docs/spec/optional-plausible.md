# Optional Plausible on the shelf, switched on by an environment variable

The spec for [#562](https://github.com/mephistopheles4/stacks/issues/562). Tier:
standard, one build session, with the security pair on this spec and on the diff, by
the owner's choice on 2026-11-07. It matches nothing on the sensitive list (no auth,
crypto or data migration), but it opens a new flow from every visitor's browser to a
third party and widens the page's CSP. There is no `docs/threat-model.md`, so the
sensitive list decides what counts as a security finding. Written on 2026-11-07 from a
grilling through an eagle-eye box, whose accepted set is S2. Base: `ca372c4`.
Revision 6: **signed off by the owner on 2026-11-07** ("Yes, sign off", decision 91, relayed by the lead), with the last S17 items settled. Revision 5 recorded the owner's other round-2 answers (decision 89). Revision 3 recorded the owner's answers to S16, relayed by the lead (decision 74). **Nothing here is built.**

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
and a build with it set reports page views and the events S6 builds from `stacks.aymandiab.com`
to Plausible, and from nowhere else. The CSP and the privacy page say what each build
does (S7 names the one change an off build makes). The two analytics run side by side, and their counts will not agree: ad blockers
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
| Which events | `Book Picked Up`, `Book Opened`, `Ask Opened`, and `Ask Sent`, which S16 Q4 leaves out of the build until the owner gives a reason |
| What a book event carries | One property, `book`: the book's public id, the id in `notes/<id>.json` |
| What `Ask Sent` carries | No property |
| Where it starts | Only when `location.hostname` is exactly `stacks.aymandiab.com` |
| Which pages | Every page: the shelf, `/attribution` and `/privacy` |
| The privacy page | Names Cloudflare Web Analytics in every build. Names Plausible only in a build with the switch on |
| What `deploy:site` does | Accepts either state, prints which one it built, and checks after upload that the live CSP matches it |

**`Ask Sent` is a change of scope.** #562 put Ask usage out of scope, because
[#541](https://github.com/mephistopheles4/stacks/issues/541) counts it from the Worker's
logs. The owner added it in the box and has not yet said why, so by S16 Q4 it is
**left out of the build** unless the owner gives a reason before the build starts. It
would carry nothing about the question.

**Rejected in the box, with the reason kept there:** a self-hosted Plausible (the first
server this project would run), a Stacks counter on Workers Analytics Engine (close to
the beacon [#119](https://github.com/mephistopheles4/stacks/issues/119) rejected), a
same-origin proxy (an edge route to build and own, for a CSP that would never change), a
remote `<script>` from `plausible.io` (a second script origin), and a tag manager (inline
or eval'd script, configured outside the repo).

## S3. The switch

- **One pure predicate,** `readSwitch(raw: string | undefined)`, in
  `packages/site/src/analytics/switch.ts`, which imports nothing. It returns off for
  `undefined`, empty or whitespace-only; it trims anything else, and returns on with the
  domain when the result matches `^[a-z0-9.-]+$`; any other value throws with a message
  naming the variable and never echoing the value, the same posture as
  `PUBLIC_TURNSTILE_SITE_KEY`. A typo must not ship a tracker that reports to a site
  nobody reads.
- **The config decides, once, and hands the site a literal.** `astro.config.mjs` reads
  the raw value from `process.env` only. A value put in `packages/site/.env*` is ignored,
  and since the site never reads `import.meta.env` for this, the config and the page cannot
  disagree. It calls `readSwitch`, builds the CSP from the result
  (S5), and injects the domain through `vite.define` as `__PLAUSIBLE_DOMAIN__`, a string
  literal that is `""` when off. **The site never reads `import.meta.env` for this.** It
  branches on that literal, which Rollup folds, so an off build drops the branch and the
  chunk behind it (C2).
- **Only site code reads the literal.** `switch.ts` holds `readSwitch` alone and never
  names `__PLAUSIBLE_DOMAIN__`, because the config, `deploy.ts` (under `tsx`) and vitest
  import it and none of them has the `define`. The literal is read in exactly two places,
  both bundled by Vite: `events.ts`, and `analytics/on.ts`, which exports
  `analyticsOn = __PLAUSIBLE_DOMAIN__ !== ''` for the `.astro` files. `vitest.config.ts`
  gains `define: { __PLAUSIBLE_DOMAIN__: '""' }`, so a test that imports `events.ts` or
  `on.ts` loads; tests that need "on" pass the domain as an argument (S4).
- `.env.example` gains a commented `# PUBLIC_PLAUSIBLE_DOMAIN=` with a comment block:
  what it does, that it is public by design, that the site must exist in the Plausible
  account under that name with S6's goals, and that unset is a complete and supported
  build.
- **G9 (`env-contract`) holds the variable through `scripts/deploy.ts`,** which reads
  `process.env['PUBLIC_PLAUSIBLE_DOMAIN']` literally (S8). G9 reads `process.env` in `.ts`
  files only; it does not see `astro.config.mjs` or `vite.define`.

## S4. The analytics module

One new file, `packages/site/src/analytics/events.ts`, and its test. **The name is
vendor-neutral on purpose:** a shared chunk named after the vendor can be matched by an
ad blocker's filter list, which would stop the shelf booting in an off build too. It is
the only code in this repo that starts the tracker or sends an event, the shape
aymandiab.com's `src/lib/analytics.ts` already runs.

```ts
declare const __PLAUSIBLE_DOMAIN__: string;
export const PRODUCTION_HOST = 'stacks.aymandiab.com';

/** Start the tracker once, if the switch is on and the host is production.
 *  `domain` defaults to the build literal; a test passes its own. */
export function startAnalytics(where: Location, domain?: string): void;
/** Send one event. A no-op when off, off-host, or not started yet. */
export function trackBook(name: 'Book Picked Up' | 'Book Opened', id: string): void;
export function trackAsk(name: 'Ask Opened'): void; // 'Ask Sent' only if S16 Q4 brings it back
/** Every event asked for since load, sent or not, for `window.__shelf` (S10). */
export function attempted(): readonly { name: string; book?: string }[];
export function scrubUrl(href: string): string;
```

- **The tracker is loaded by a dynamic `import()` inside `if (domain)`,** where `domain`
  is the argument or the build literal.
- **`attempted()` records each call** to `trackBook` or `trackAsk`, by name and `book`, in
  memory, whether or not the tracker started. It never leaves the page. It is exposed on
  `window.__shelf` beside `held()`, so a browser check can count call sites with the
  tracker never started. It is capped at 200 entries.
- **Off-host means never started.** `startAnalytics` compares `where.hostname` with
  `PRODUCTION_HOST` exactly, before the import. localhost, `*.pages.dev`, previews and
  copies stay out of the dashboard. `PRODUCTION_HOST` must equal `WIDGET_DOMAIN` in
  `scripts/lib/turnstile.ts`; a gate test reads both.
- **Events before the tracker is ready are dropped, never queued.** The shelf cannot be
  picked up before boot, and a queue is state that can grow.
- **Every request passes `scrubUrl`** through the tracker's request transform: the page
  URL `u` and the referrer `r` of every request, page views, engagement and custom events
  alike. The query string keeps only `ref`, `source`, `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content` and `utm_term`. `?debug=<json>`, `?solo`, `?woodSeed` and
  any parameter added later are dropped. The fragment is dropped too. The site-wide
  `Referrer-Policy: no-referrer` in `_headers` stays, so the browser's own `Referer`
  header cannot carry what `scrubUrl` removed.
- **A property is the id and nothing else.** `trackBook` sends `{ book: id }` only when
  `id` matches `BOOK_ID`, exported from `shelf/notes.ts` for this (one pattern, not two);
  any other value sends the event with no property. `trackAsk` sends no property, by its
  signature.
- **Plausible's own options:** `autoCapturePageviews` on, `bindToWindow` **off** (no
  `window.plausible` for other script on the page to call), file downloads off, hash-based
  routing off, and `outboundLinks` **off** (S16 Q1). Every
  other option is named in the module with its value, so a default is never relied on.
  The tagged-events listener that the npm build compiles in reads `plausible-event-*`
  class names; no class on the site carries that prefix, and none is built from data.
- **A failed import** (blocked, offline) is caught (S16 Q5). The module stays never
  started, every event stays a no-op, and nothing reaches the console as an unhandled
  rejection.
- The dependency is `@plausible-analytics/tracker`, pinned exact in
  `packages/site/package.json`, as `gsap` is, and subject to the release-age window
  (G67). The install is the owner's to confirm (S15). The build session confirms, against
  the pinned version, `bindToWindow`, the tagged listener, that `outboundLinks` off sends
  no outbound event, and that the transform reaches every request type; the ADR in S9 records it.

## S5. The CSP and G20

- **Off:** today's policy, its directive set unchanged. `connect-src 'self'`.
- **On:** the same set, with `connect-src 'self' https://plausible.io`. No other
  directive changes. `script-src` keeps its three sources, because the tracker is bundled
  and served from `'self'`.
- **What the on shape admits:** `https://plausible.io` takes events for every Plausible
  account, and the request names its site in its own body. A CSP source cannot name an
  account. So in an on build, code running in the page could send data to a Plausible site
  someone else owns. The remaining controls are the exact pin, the release-age window and
  review. This widens a control ADR-0065 and ADR-0128 wrote down. The owner accepted it
  (S16 Q2), and the ADR records it.
- `astro.config.mjs` builds the `connect-src` entry from S3's result. The comment above it
  says why the second shape exists and links the ADR.
- **G20 (`public-build-artifact`) takes the switch as an argument and never reads the
  environment.** `InspectOptions` gains `analytics: 'on' | 'off'`, and the `csp` rule's
  expected `connect-src` follows it. `scripts/check-public-build.ts` (`pnpm gate:public`)
  passes `'off'`, always, because it builds the fixture vault with the variable removed
  from its child's environment. `deploy.ts`'s re-check of the real `dist/` passes the state
  it built (S8). Each test passes its own. **No test and no rule reads
  `PUBLIC_PLAUSIBLE_DOMAIN`,** so `deploy:site`, which loads `.env` and then runs the suite,
  gets the same green whether the switch is on or off (C13). Every other assertion of the
  rule is unchanged: the set is closed, a directive outside it fails, and hashes are
  filtered. Two new planted defects, each firing `csp` and nothing else:
  - an off-shape page inspected with `analytics: 'on'` (the origin is missing);
  - an on-shape page inspected with `analytics: 'off'` (an origin nobody turned on).
- **An off build ships no trace.** A new clause of the same rule, under `'off'`: no file
  under `dist/` contains `plausible.io`, and neither notice page holds a module script. It
  is planted red by a file that does.
- **The gate builds strip the variable themselves (S17 X6).** `runShell` inherits
  `process.env`, so `scripts/check-public-build.ts` and `scripts/smoke-render.ts` each delete
  `PUBLIC_PLAUSIBLE_DOMAIN` from the environment they hand their build child. A value set
  where `deploy:site` runs therefore never reaches a gate's build. `pnpm smoke:render
  --analytics-on` is the one way in: it sets the variable to `PRODUCTION_HOST` for its own
  child and nothing else. A test plants the variable in the parent and asserts the child
  environment lacks it, for each script.
- `frame-ancestors` and `_headers` are untouched.

## S6. The events

| Event | Fires | Property | Where |
| --- | --- | --- | --- |
| `Book Picked Up` | Once each time a book lands in the hand, from a shelf click or a chat link. A book caught on its way back and landing again counts again. A chat link to the book already in the hand lands nothing and counts nothing | `book` | The `landed` effect in `shelf/pickup.ts`, which both paths share through the state machine |
| `Book Opened` | Once per opening that reaches open at rest | `book` | The `opened` effect in `shelf/pickup.ts` |
| `Ask Opened` | Each time the drawer goes from shut to open | none | `show()` in `ask/drawer.ts`, after its early return |
| `Ask Sent` | **Not built** unless the owner gives a reason before the build (S16 Q4). Then: each question sent with non-empty text, before the token is asked for | none | The top of `ask()` in `ask/drawer.ts`, after the empty-text return |

- The page view is the tracker's own, once per page load. A pickup calls
  `history.pushState` with the same path; the build session confirms the pinned tracker
  sends no page view for it, and C8's test pins the count.
- **Nothing else is sent.** Not the question, not the answer, not the follow-ups, not a
  setting, not the hold time, not the inspectors. Invariant 2 is untouched: no event reads
  a note, a `notes/<id>.json` file or the held page's text.
- **The goals** the owner creates in the Plausible site, by these exact names, are the
  events built. There is no `Outbound Link: Click` goal, since outbound links are off.
  `docs/commands.md` lists them.

## S7. The pages

- **The shelf** starts the tracker from its existing `<script>` in `Shelf.astro`, as one
  more call after the imports, within G7's shape.
- **`/attribution` and `/privacy`** ship no script today, and an off build keeps it so. A
  new component, `components/AnalyticsStart.astro`, holds one `<script>` that imports
  `startAnalytics` and calls it. `NoticePage.astro` renders it as
  `{analyticsOn && <AnalyticsStart />}`, with `analyticsOn` read from S3's literal through
  `analytics/on.ts`, never `switch.ts` (S3). The build session confirms that Astro emits
  no script for a component that is not rendered; S5's clause checks it.
- **`/privacy`** gains two paragraphs, the Plausible one as `components/PlausibleNotice.astro`
  under the same condition. One template expression reading a typed value is the shape
  `Ask.astro`'s `data-site-key` already uses. The wording, to be kept plain:
  - Every build: *"Cloudflare Web Analytics counts page views, where visitors came from,
    their country and how fast pages load. It sets no cookies, and it reports to Cloudflare
    through this site's own address."*
  - On builds: *"Plausible Analytics counts page views, where visitors came from, their
    country and device, and these actions: picking a book up, opening it, opening Ask the
    library. It records which book, never what you ask. It sets no cookies; it sees your
    address and browser, and keeps only a hash of them that changes every day."* If `Ask
    Sent` is built (S16 Q4), "and sending a question" joins the list.
- **S1's "same site as today" has one exception:** the Cloudflare paragraph is added to
  `/privacy` in every build, because the beacon is live today and the page omits it.

## S8. `deploy:site`

- It reads `process.env['PUBLIC_PLAUSIBLE_DOMAIN']` through `readSwitch` before building
  and prints one line, `analytics: Plausible on (stacks.aymandiab.com)` or
  `analytics: Plausible off`, beside its other pre-build lines, in every mode. Either state
  proceeds. It never refuses on the switch.
- The gates it runs first are unaffected by the switch (S5). Its re-check of the real
  `dist/` passes the state it read, so a build that does not match it is refused before
  upload.
- **After upload,** once `probeBuild` answers `current`, it fetches the live index and reads
  its CSP `<meta>`, whose content survives edge transforms (`verifyBuildLive`'s comment in
  `deploy.ts`). If its `connect-src` differs from the built shape, the run exits non-zero
  with a line naming both shapes. A `stale`, `refused` or `unreachable` answer reports as
  it does today and skips this comparison. Unlike a stale stamp, a mismatch on a `current`
  build means the live site is not the build, so it fails.
- **`--check-only`** builds nothing, so it takes the expected shape from
  `dist/index.html`'s CSP meta, both for its `dist/` pre-flight and for the live comparison. `--dry-run` prints the analytics line and stops as today.

## S9. Records, in the build's commit

- **A new ADR**, next free number (0138 at this base): optional Plausible, direct to
  `plausible.io`. It amends ADR-0065 and ADR-0128, which kept `connect-src 'self'`. It
  records:
  - the dependency, and the pinned version's checked behaviour (S4);
  - the second processor, and what the on shape admits, accepted by the owner (S5, S16 Q2);
  - why not a proxy, a self-hosted Plausible, Workers Analytics Engine or a tag manager;
  - why this is not #119's beacon: #119 rejected a counter Stacks would build to watch an
    invariant; this is product analytics, off by default, with nothing derived from note
    bodies;
  - the owner's reason for `Ask Sent`, if it is built (S16 Q4);
  - the DOM test environment, `happy-dom`, a dev dependency used by C7's file alone (S17 X3);
  - the ninth mutation scope, which amends ADR-0053's eight (S17 X4).
- **`stryker.scopes.json`:** a ninth scope, `packages/site/src/analytics`, glob
  `packages/site/src/analytics/**/*.ts`, no exclusions, so G38 stays green and the module
  is mutation-tested. `stryker.floors.json` gains its entry `unarmed`, like every other, and
  `pnpm mutation:stamp` re-derives `configHash` for G56. Each document that counts "eight"
  scopes (`AGENTS.md`, `docs/commands.md`, `docs/gates.md`) says nine in the same commit.
- **`AGENTS.md`:** no invariant changes; the dependency note is the ADR.
- **`docs/gates.md`:** the G20 row (the option, the two shapes, the off clause) and the G9
  row. `docs/progress.md` in the same commit.
- **`docs/commands.md`:** a short "Analytics" section: the switch; the goals to create;
  how the owner excludes their own visits (`localStorage.plausible_ignore = 'true'` on the
  live site); that `gate:public` proves the off build only; that marking a book private
  does not remove its past events from Plausible; that a shared or public Plausible
  dashboard would expose the `book` values; and the rollback (S14).
- **`packages/site/astro.config.mjs`:** the comment block above `connect-src`.
- **`docs/spec/README.md`:** this spec's row.

## S10. Tests

Written first, each backing a claim in S11.

- `analytics/switch.test.ts`: `readSwitch` treats `undefined`, empty and whitespace as off,
  trims, and throws on a value outside the pattern with a message that does not contain it.
- `analytics/events.test.ts`, with the tracker replaced by a fake: `scrubUrl` keeps exactly
  the seven campaign parameters and drops the rest and the fragment; `startAnalytics` never
  imports the tracker off `PRODUCTION_HOST` or with the literal empty; `trackBook` drops a
  malformed id and keeps a well-formed one; events before start are dropped; a rejected
  import leaves the module unstarted, with every event a no-op and no unhandled rejection.
- **The real tracker, network stubbed** (C7): one test, `analytics/tracker.test.ts`, runs
  under `// @vitest-environment happy-dom` (S17 X3; the file comment selects it, so every
  other test keeps `node`). It imports the pinned package, stubs
  `fetch` and `navigator.sendBeacon` with `vi.stubGlobal` (G21's escape hatch), sets a
  production `location` carrying `?debug={…}&utm_source=x#frag` and a referrer with a query,
  then drives a page view, an engagement flush and a custom event, and asserts `u`, `r` and
  the props of every captured payload. It also clicks an outbound link and asserts that no
  request follows. A tracker update that changes what it sends turns this red.
- `PRODUCTION_HOST === WIDGET_DOMAIN`, in a gate test that may import both.
- `gates/public-build-artifact.test.ts`: the two planted CSP defects and the planted
  `plausible.io` string and notice-page script of S5, each firing `csp` alone.
- **C8 in a browser.** `pickup.ts` and `drawer.ts` have no unit tests and run only in a
  browser, so C8 is proven in `scripts/smoke-render.ts`, inside the G35 row, by a new
  `checkAnalyticsCalls` that reads `window.__shelf.attempted()` after each step: a shelf
  click that lands (one `Book Picked Up` with that id), a chat link dispatched as
  `stacks:pick-up` (one more), a chat link to the book in hand (none), an open (one
  `Book Opened`), the drawer opened twice from shut (two `Ask Opened`), and no page view
  from a pickup. `pickup-state.test.ts` already holds that `landed` and `opened` fire once
  per landing and opening; the browser check holds that each calls the module once.
  Planting a second `trackBook` call in `landed` turns it red.
- **One real on run on the host:** `pnpm smoke:render --analytics-on`, the same in bash and
  PowerShell (S17 X7). It serves from localhost, so the tracker never starts. `smoke-render.ts`
  gains a request-host listener that counts requests to any host other than the page's own,
  and prints the count. The PR records the command, that count (zero), zero CSP console
  errors, and the gzip bytes the on build adds over the off build.

## S11. Acceptance claims

| Claim | Holds when | Quality |
| --- | --- | --- |
| C1 | With the switch off, every built page's CSP is today's directive set exactly, and G20 is green | Compatibility |
| C2 | With the switch off, no file under `dist/` contains `plausible.io`, no chunk imports the tracker, and `/attribution` and `/privacy` hold no module script | Functional |
| C3 | With the switch on, every built page's CSP differs from C1's only by `https://plausible.io` in `connect-src`, and G20 under `analytics: 'on'` is green | Compatibility |
| C4 | G20 fails on an off-shape page under `'on'`, an on-shape page under `'off'`, and an off build holding `plausible.io` or a notice-page script, each through `csp` alone | Functional |
| C5 | A value of `PUBLIC_PLAUSIBLE_DOMAIN` outside `^[a-z0-9.-]+$` fails the build and `deploy:site`, and neither message contains the value | Safety |
| C6 | The tracker is imported only on `stacks.aymandiab.com`, and never with the switch off | Functional |
| C7 | Every request the real tracker makes carries a `u` and `r` with no query parameter outside the seven and no fragment, and no property outside C8's | Security |
| C8 | Each built event fires as S6 says, once per action, from both pickup paths, as `window.__shelf.attempted()` records it in `smoke:render`; the only property is `book` holding an id that matches `BOOK_ID`; a click on an outbound link sends nothing; no page view comes from a pickup | Functional |
| C9 | `/privacy` names Cloudflare Web Analytics in every build and Plausible only in an on build, in S7's words | Interaction |
| C10 | `deploy:site` prints the analytics line in every mode, proceeds in either state, and exits non-zero naming both shapes when a `current` live index's `connect-src` differs from the built shape | Reliability |
| C11 | `pnpm smoke:render --analytics-on` (S10) passes with zero CSP violations and zero requests to another host | Reliability |
| C12 | `athanor run`, `athanor run lint`, `athanor run build`, `athanor run smoke`, `pnpm lint:md`, `pnpm format:check` and `pnpm gate:public` are green | Maintainability |
| C13 | `athanor run -- sh -c 'PUBLIC_PLAUSIBLE_DOMAIN=stacks.aymandiab.com pnpm test'` is green, from bash or PowerShell alike, and no file under `scripts/lib/` or `gates/` reads that variable | Reliability |

## S12. Boundaries for the build session

- **Always:** run the suite through `athanor run`; write the tests first; keep every event
  and property behind the one module; keep `.astro` files within G7.
- **Ask first:** any change to S2 or to an S16 answer; a further event or property; any
  CSP change beyond `connect-src`; `/privacy` wording beyond S7; the install (S15).
- **Never:** send note text, Thoughts, a question or an answer to Plausible; load the
  tracker from another origin; let an off build carry the tracker; set the variable in CI
  or in a committed file; create the Plausible site or its goals (that is the owner's).
- **Stop and ask** if Rollup keeps the tracker chunk in an off build despite S3's literal,
  if Astro emits `AnalyticsStart`'s script when it is not rendered, if G67's window blocks
  every usable version, or if the pinned tracker sends a request the transform does not
  reach.

## S13. Trade-offs

The repo names no business driver, so the owner's stated reasons decide.

| Pull | Side taken | Driver |
| --- | --- | --- |
| Counting more visits against a CSP that never changes | Direct: fewer counted (ad blockers), an extra origin when on, open to any Plausible account (accepted, S16 Q2) | Matches the setup the owner already runs; no edge route to own |
| One CSP shape against an off build that names nothing it does not use | Two shapes, with G20 taking the state as an argument | The owner's "optional", and #562's claim that an off build adds no CSP source |
| What a book event carries | The public id, kept by the owner (S16 Q3). It is the title's slug plus a short hash (`idFor` in `packages/core/src/library.ts`), so the dashboard shows titles either way, and a title edit splits a book's counts either way | Same value the site already publishes in `notes/<id>.json` |
| `Ask Sent` against #541's scope line | Left out unless the owner gives a reason before the build (S16 Q4) | The owner's answer |
| **Hardening, limit 0, Reliability:** a catch on the tracker's `import()` | Built (S16 Q5) | The owner asked for it |
| **Hardening, limit 0, Security:** mapping any path outside the three pages to one value in `scrubUrl` | Not built; an accepted risk (S16 Q5), re-accepted on the corrected premise (S17 X5) | Pages serves the shelf at every unknown path (`infra/main.tf:165`), so the tracker starts there and sends that path |
| **Hardening, limit 0, Security:** Plausible's hostname allowlist, set in the owner's account | Not set; an accepted risk (S16 Q5) | It would only partly block forged events |
| **Hardening, limit 0, Reliability:** a guard around each track call, in case the loaded tracker throws | Not built; an accepted risk (S17 T1) | The import catch covers the likely failure |
| **Gate builds against `deploy:site`'s environment** | The two gate scripts strip the variable, and `--analytics-on` is the one way in (S17 X6) | The gates must check the shape they were asked to |

## S14. Residuals and rollback

- **The counts will not agree with Cloudflare's**, and nothing here reconciles them.
- **The plan allowance.** An on build's page views and events count against the owner's
  existing Plausible plan's monthly allowance. Accepted by the owner (S17); the owner
  watches the plan's headroom in Plausible.
- **Anyone can forge events** for `stacks.aymandiab.com`, with any referrer, campaign tag or
  `book` value: Plausible's endpoint takes unauthenticated requests, and the host check runs
  in the visitor's browser. The dashboard is not trusted data.
- **What the on shape admits** (S5): any Plausible account. Accepted by the owner (S16 Q2).
- **A book marked private after it was published** keeps its past events, under its
  title-derived id, in Plausible until the owner resets the site's stats there.
- **Plausible's own processing** (a hashed address and user agent with a salt rotated
  daily) is its claim, not something this repo can check.
- **A preview deploy built with the switch on** ships the on CSP and a tracker that never
  starts. That is harmless, and it is why the host check exists.
- **The live check reads the index only.** The notice pages are held by the `dist/`
  re-check before upload.
- **Rollback:** unset `PUBLIC_PLAUSIBLE_DOMAIN` and run `deploy:site`. The next deployment
  is the off build. Earlier Pages deployments keep the tracker at their own addresses until
  they are deleted, as AGENTS.md already says of private books. Events already sent stay in
  Plausible until the owner deletes them there.

## S15. Needs a human

- **Before the build session starts:** give the reason for `Ask Sent` if it should be built
  (S16 Q4); otherwise it is left out.
- **When the build session reaches the installs:** confirm the `@plausible-analytics/tracker`
  install and the `happy-dom` dev dependency, each with its pinned version, in chat. (Owner: installs are the owner's.)
- **Before the first on deploy:** create the Plausible site `stacks.aymandiab.com` and the
  goals S6 names. (Owner.)
- **To turn it on:** set `PUBLIC_PLAUSIBLE_DOMAIN=stacks.aymandiab.com` where `deploy:site`
  runs, and deploy. (Owner: it publishes.)
- **After the first on deploy:** open the live shelf with no ad blocker, pick a book up and
  open it, and see the events in the dashboard. (Owner.)

## S16. The owner's answers

Raised by the first lens round on 2026-11-07, and answered by the owner the same day
("Yes, all four", to the lead's "Take my picks on all four waiting decisions?",
decision 74), relayed to this session by the lead. The owner confirmed all five answers
as recorded here on the same day (decision 89, S17).

- **Q1. Outbound links: off.** Plausible's outbound-link option would send a fifth event
  with the clicked link's full URL, which for the held book's provider links carries the
  title and author or an ISBN. There is no `Outbound Link: Click` goal.
- **Q2. What `connect-src https://plausible.io` admits: accepted.** Every Plausible
  account, not only the owner's (S5). The ADR and S14 record it.
- **Q3. The `book` property: the public id, kept.** It is the title's slug plus a short
  hash, so it shows the title and splits on a title edit.
- **Q4. `Ask Sent`: left out of the build** unless the owner gives a reason before the
  build starts. #562 put Ask usage out of scope because #541 already counts it from the
  Worker's logs. If the reason comes, the event returns as S6 describes and the reason goes
  in the ADR.
- **Q5. Hardening: the catch on the import only.** The path allowlist in `scrubUrl` and
  Plausible's hostname allowlist are accepted risks (S13).

## S17. Round 2's questions, and the owner's answers

Raised by the final spec round on revision 3, 2026-11-07. The owner chose to keep going
without a prototype (decision 88), then answered "Yes, your picks" to the lead's "Take my
picks on #562's open items?" (decision 89), relayed to this session by the lead.

- **X3. A DOM test environment: add one.** `happy-dom` as a dev dependency, selected by
  C7's file alone (S10). Its install is the owner's confirm at build time (S15).
- **X4. `packages/site/src/analytics/`: mutation-tested.** A ninth scope in
  `stryker.scopes.json` (S9), so G38 stays green.
- **X5. The unknown-path risk: re-accepted.** Pages serves the shelf at every unknown
  path (`infra/main.tf:165`), so the tracker starts there and sends that path. The path
  allowlist in `scrubUrl` stays unbuilt, accepted on that premise (S13).
- **The five answers in S16: confirmed as recorded.**

Settled at sign-off ("Yes, sign off", decision 91, relayed by the lead):

- **X6. Built.** The two gate scripts strip `PUBLIC_PLAUSIBLE_DOMAIN` from their build
  child, and `smoke:render --analytics-on` is the one way in (S5).
- **X7. Built.** The on run is a flag and C13 runs through athanor, so both commands are
  the same in bash and PowerShell (S10, S11).
- **T1. Not built; risk accepted** (S13).
- **The plan allowance: accepted** and recorded in S14.
