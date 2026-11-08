# ADR-0139 — Plausible is optional, bundled from npm, and reports straight to plausible.io

**Date:** 2026-11-07
**Status:** accepted. The owner signed off the spec on 2026-11-07
(`docs/spec/optional-plausible.md`, revision 6, [#562](https://github.com/mephistopheles4/stacks/issues/562)).
Amends [ADR-0065](./0065-the-csp-is-generated-not-written.md) and
[ADR-0128](./0128-the-csp-admits-turnstile-and-nothing-else.md), which kept
`connect-src 'self'`, and [ADR-0053](./0053-stryker-measures-eight-declared-scopes.md)'s eight
mutation scopes. It also makes [ADR-0072](./0072-a-clone-is-a-relation-between-two-places.md)'s
count of duplication populations out of date: nine scopes now, so ten populations with the tree.

## Decision

One environment variable, `PUBLIC_PLAUSIBLE_DOMAIN`, read once by `astro.config.mjs` from
`process.env`, turns Plausible on for a build. Unset, empty or blank is off, and an off build
is today's site: no tracker in the bundle, no new CSP source, no request. The tracker is
`@plausible-analytics/tracker`, pinned exact, bundled by Vite and served from `'self'`, so
`script-src` gains no origin. An on build adds `https://plausible.io` to `connect-src` and
changes nothing else. G20 takes the state as an argument and holds exactly two policy shapes.

One module, `packages/site/src/analytics/events.ts`, is the only place that starts the tracker
or sends an event. It starts only when `location.hostname` is exactly `stacks.aymandiab.com`,
passes every request's page URL and referrer through `scrubUrl` (the seven campaign
parameters, no fragment), and sends three events: `Book Picked Up` and `Book Opened`, each
carrying one property, `book`, the public id in `notes/<id>.json`, and `Ask Opened`, with none.
`Ask Sent` is not built: the owner gave no reason before the build (spec S16 Q4).

## What the on shape admits

`https://plausible.io` takes events for every Plausible account, and the request names its
site in its own body. A CSP source cannot name an account, so in an on build, code running in
the page could send data to a Plausible site someone else owns. The controls that remain are the
exact pin, the release-age window and review. **The owner accepted this** (spec S16 Q2). Plausible's
hostname allowlist in the owner's account would only partly block forged events and is not
set (accepted, S13).

## The pinned version's checked behaviour (0.4.7)

Read from `plausible.js` and held by `analytics/tracker.test.ts`, which drives the real
package under happy-dom with only `fetch` stubbed:

- `bindToWindow: false` leaves no `window.plausible` for other script to call.
- `outboundLinks: false`, `fileDownloads: false`, `formSubmissions: false` and
  `hashBasedRouting: false` send nothing for a click on an outbound link. The test clicks one.
- The tagged-events listener the package compiles in reads `plausible-event-*` class names. No
  class on the site carries that prefix, and none is built from data.
- `transformRequest` reaches page views and custom events. **Engagement events do not pass
  through it**: the package sends them directly, with the `u` it kept from the already
  transformed page view and no `r`. They carry only scrubbed data, and the test asserts `u` on
  every captured request, engagement included, so an update that changes this turns it red.
- A `pushState` to the same path sends no page view: the package compares `location.pathname`.
  A pickup calls `history.pushState` with the same path.
- The package has no `sendBeacon` path: every request is a `fetch`.

## Why not the alternatives

- **A same-origin proxy:** an edge route to build and own, for a CSP that would never change.
- **A self-hosted Plausible:** the first server this project would run.
- **Workers Analytics Engine:** a counter Stacks would build, close to the beacon
  [#119](https://github.com/mephistopheles4/stacks/issues/119) rejected.
- **A remote `<script>` from `plausible.io`:** a second script origin.
- **A tag manager:** inline or eval'd script, configured outside the repo, the opposite of a
  generated, enumerable CSP.

**This is not #119's beacon.** #119 rejected a counter Stacks would build to watch an
invariant. This is product analytics: off by default, run by a vendor the owner already uses
on another domain, with nothing derived from note bodies. Invariant 2 is untouched: no event
reads a note, a `notes/` file or the held page's text.

## The test environment, and the ninth scope

`happy-dom` is a dev dependency used by `analytics/tracker.test.ts` alone, selected by that
file's `// @vitest-environment` comment. Every other test keeps `node` (spec X3).

`packages/site/src/analytics` is a ninth mutation scope, floor `unarmed` like the others,
which amends ADR-0053's eight (spec X4).

## Two things the build added to the spec

**The privacy paragraph names engagement.** The pinned tracker sends an engagement request
carrying time on page and scroll depth, and 0.4.7 has no option to turn it off. S7's sentence
did not say so, so the on-build paragraph on `/privacy` now reads "how long they stay and how
far they scroll" after "where visitors came from". The page's meta description and the
sentence on `/attribution` that points to it also say the page covers how the site counts
visits, where they had said only that it covers Ask questions.

**Two template conditionals are an exception to the no-logic rule.** `NoticePage.astro`
renders `AnalyticsStart` and `privacy.astro` renders `PlausibleNotice` behind
`{analyticsOn && ...}`, a single boolean exported from `analytics/on.ts`. AGENTS.md says a
branch belongs in a `.ts` file, and G7 reads only `<script>` blocks, so it cannot see these.
They are the only conditional renders in any `.astro` file here. The rule is left as written:
this is a recorded exception, limited to one boolean show-or-hide on a value exported from a
module, and a second use is a reason to amend the rule.

## Consequences

- Page views and events count against the owner's Plausible plan. Counts will not agree with
  Cloudflare's, because ad blockers block `plausible.io` far more often.
- A book marked private after it was published keeps its past events, under its title-derived
  id, in Plausible until the owner resets the site's stats there.
- Rollback: unset the variable and run `deploy:site`. Earlier Pages deployments keep the
  tracker at their own addresses until they are deleted.
- An off build's `script-src` carries one hash that the build before this change did not: the
  SHA-256 of an empty string, on every page. It is most likely the notice-page start script
  collapsing to nothing when the switch is off (no off page holds an inline script, and the
  on build has no such hash). It allows no code to run, and G20 compares directives without
  their hashes, so the gate cannot see it. Recorded rather than removed; the cause has not
  been isolated.
- The tracker's `customProperties` is left unset on purpose. Setting it to an empty object
  makes every request carry an empty `p`, which `tracker.test.ts` would then have to
  allow; the default sends no `p` at all.
- Hardening candidates the owner has not asked for, listed rather than built: an allowlist in
  the request transform for event names and properties (the tracker's tagged-class listener is
  always on); a warning in `deploy:site` when the site name is not the production host; a
  narrower off-build scan that skips the data files; a catch around the tracker's `init`. None
  is a security finding: none names an attacker in this project's threat model, and none
  touches authentication, cryptography or a data migration.
