# Pages or Workers: the probe

[#535](https://github.com/mephistopheles4/stacks/issues/535) asked whether the site should move from Cloudflare Pages to Workers with static assets, and what to find out first. This is what was measured, on 2026-11-08, and what was only read. The decision is [ADR-0140](../adr/0140-stay-on-pages-until-the-hostname-switch-is-tried.md).

## The probe

A throwaway Worker, `stacks-535-probe`, with two static files and a `fetch` handler that logs `INVOKED <path>` and passes the request to its assets binding. No routes, no custom domain: it was reachable only on `workers.dev`. The owner approved creating it. It was deployed four times: version 1 with the canary file, version 2 without it, version 3 with the logging handler (the Q1 tail run), version 4 with `preview_urls` false. It was then deleted with `wrangler delete`; the live address and the old version address both answered 404 afterwards. Nothing was created on `stacks.aymandiab.com`, and no Pages project was touched.

## Question 1: do static files count as Worker requests?

**Measured: static files do not run the Worker.** That they are not billed rests on Cloudflare's documentation. With `wrangler tail` attached, one request to a path that matches no file, then 100 requests for an existing file, then another unmatched path. The tail logged two invocations, the two unmatched paths. The 100 asset requests logged none.

- Cloudflare's documentation says "Requests to static assets are free and unlimited", and that only a request that runs a Worker counts. The probe measures invocation, not the bill, and the bill rests on that sentence.
- **A path that matches no file does run the Worker**, because the probe set no `not_found_handling`. On the real site every crawler probe of a wrong path would be a Worker request. Setting `not_found_handling` (or an equivalent) is part of any move.
- The account is on Workers Paid ([ADR-0133](../adr/0133-the-ask-worker-runs-on-workers-paid-and-the-spend-limit-is-its-only-cap.md)), so the free plan's 100,000 a day does not apply to it in any case.
- A counter kept in a Worker variable was tried first and dropped: each deployment starts a new isolate, which resets it, so the tail is the measurement.

## Question 2: does Workers keep old versions at public addresses?

**Measured: yes by default, and one setting turns it off.**

1. Version 1 held `secret.txt` with a canary. Both the live address and the version address (`<first 8 characters of the version id>-<worker>.<subdomain>.workers.dev`) served it.
2. Version 2 deployed without the file. The live address answered 404. **The version 1 address still served the canary, 200.**
3. Version 4 deployed with `"preview_urls": false`. The version 1 address answered 404 (Cloudflare error 1042). The live address still served.

So Workers has the same private-book exposure as Pages, with a one-line switch where Pages needs each old deployment deleted by hand. Pages has a second way, per-deployment addresses behind Cloudflare Access, which [`docs/commands.md`](../commands.md) records as unchecked for a production deployment's own address; nothing here tested it. [`packages/ask/wrangler.jsonc`](../../packages/ask/wrangler.jsonc) already sets that switch for the Ask Worker.

**Not tested:** whether `"workers_dev": false` alone turns version addresses off. The docs say version addresses follow `workers_dev` when unset; the probe had `workers_dev: true` throughout. A real move would set both, as the Ask Worker does.

## Question 3: what moves

Read from the tree and the Cloudflare docs; not run.

- `scripts/deploy.ts` uploads with `wrangler pages deploy` (the dry-run line and the real call), and its after-upload checks assume Pages' edge purge; so does `scripts/lib/edge-probe.ts`.
- `scripts/lib/public-build.ts` requires `_headers` blocks for `/covers/*`, `/notes/*` and `/held-covers/*` because Pages gives images a four-hour `max-age`. G20 (`gates/public-build-artifact.test.ts`) asserts them. Workers' cache defaults for assets were not measured, so the premise of those blocks would have to be re-measured.
- `gates/release-age.test.ts` fixtures name `wrangler pages deploy`.
- The Ask Worker's health check was built around Pages answering an unknown path with a 200 and the shelf's HTML (`infra/main.tf`, `infra/README.md`): it matches the body `stacks-ask: up`, so it should hold under any `not_found_handling`. It probably needs no change; it is listed so the move re-reads it.
- **The two-deploy order and #532's routes.** `deploy:ask` runs before `deploy:site`, and the Ask Worker's two exact routes on `stacks.aymandiab.com` (`packages/ask/wrangler.jsonc`) fall through to Pages for every other path. With the site as a Worker on the same hostname, how those routes and the site Worker's hostname binding take precedence over each other, and whether the two deploys could become one, were not read or measured. They are part of what a move settles.
- `docs/commands.md` states the takedown and rollback paths in terms of Pages deployments.
- `_headers` and `_redirects` work on Workers with static assets, per the migration guide. The guide lists no Pages shutdown date.

## Question 4: the way back (the hostname switch)

**Not answered.** The way back is the hostname switch run in reverse, so one untried step answers both. Cloudflare's documents say a custom domain cannot be created on a hostname that has a CNAME record. A Pages project's custom domain may well be such a record, in which case it would have to come off first and the hostname would be unserved for a while; nobody has checked either point. The documents describe no procedure for switching a hostname between a Pages project and a Worker, or back. Trying it needs a spare hostname on the zone. It was not tried, because the owner approved only the probe Worker.
