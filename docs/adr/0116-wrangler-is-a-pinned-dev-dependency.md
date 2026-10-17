# ADR-0116 — wrangler is a pinned devDependency

**Date:** 2026-10-17
**Status:** accepted
**Issue:** [#459](https://github.com/mephistopheles4/stacks/issues/459)
**Spec:** [`docs/spec/release-age-side-doors.md`](../spec/release-age-side-doors.md)

## Decision

wrangler is an exact-pinned root devDependency, and the deploy runs it through
`pnpm exec`. `scripts/deploy.ts` no longer fetches it at deploy time. G67
(`release-age`) holds the pin and holds the script to that one form. Before the
upload the deploy refuses unless the wrangler in the repository's own
`node_modules` is the pinned version. The upload's environment leaves out every
key `loadEnv` set, except names starting `CLOUDFLARE_` or `WRANGLER_`, and sets
`WRANGLER_SEND_METRICS=false`. `allowBuilds` answers `workerd: false`.

⚠️ **The narrowed environment covers what the upload inherits, and no more.**
wrangler's own start-up loads the repository root's `.env` and `.env.local` and
puts them back in its environment, so where a `.env` sits at the root the Google
Books key and the vault path still reach wrangler and its packages. The owner
accepted that and no code changes for it. The repository has no threat model, so
the acceptance is recorded here and nowhere else.

## Why

The deploy's wrangler fetch carries the Cloudflare credential, and it was the one
install the supply-chain checks did not fully reach. Measured on pnpm 11.18.0:
`pnpm dlx` applies the workspace's release-age window, and it does not apply
`trustPolicy`, whose canary (`semver@6.3.1`, which a frozen install refuses as a
trust downgrade) ran through it with exit 0 even with the policy passed on the
call. Only the lockfile puts a package under both checks and under G67's
integrity-only rule. The earlier answer, passing the window on the call, left the
trust check out, and Dependabot cannot see a version inside a script string. A
`package.json` pin is exactly what Dependabot bumps, under the npm entry's
seven-day cooldown.

## What it costs

- wrangler adds 27 lockfile packages to every install, CI's included (the spec's
  scratch measurement said 48), and to the `audit` job's scan, which fails on a
  high advisory anywhere in the lockfile.
- Dependabot opens wrangler bumps for review, one pull request each, outside the
  `dev-tooling` group. After one merges, the deploy refuses until `pnpm install`
  brings `node_modules` up to the new pin.
- **The Thoughts parser's resolved closure moved.** The wrangler pin put a second
  `supports-color` in the tree, so `debug`'s optional peer under micromark now
  links `supports-color@10.2.2` (published 2025-09) instead of 7.2.0, and
  `has-flag` drops out. [ADR-0107](0107-thoughts-are-read-by-a-commonmark-parser.md)
  wants a closure move as its own change on the security route; this one is a
  side effect of the pin, changes no parser code, and the default build never
  loads `debug`. The owner approved updating the closure list in this change.
- `workerd: false` runs workerd's install script for nobody. If `wrangler pages
  deploy` turns out to need workerd's binary, the upload fails and nothing is
  published; changing the answer to `true` is the owner's call. This could not be
  checked without a real deploy, which this work did not run.

## What is in reach of the deploy's tools

The Cloudflare credential is wrangler's own OAuth login (`wrangler login`), stored
in the user profile. It is not a token in `.env`, and it never enters the
repository, `.env` or CI. Any package the deploy runs could read that login store,
so the trust policy is on for all of them: `chromium-bidi` runs
inside the deploy's own `smoke:render` gate, is published by token where its
earlier releases carried provenance, and is let through by an exact
`trustPolicyExclude` entry on the owner's word (G67 ties that entry to the version
`puppeteer-core` depends on).

## Telemetry

wrangler sends usage data to Cloudflare by default, and nothing approved that flow.
It is off for the upload (`WRANGLER_SEND_METRICS=false`, set after every other key
so neither the shell nor `.env` can turn it back on). Running `wrangler` by hand
outside the deploy is unaffected, and the switch covers usage reporting only:
wrangler's own update check against the npm registry is a separate call it does
not touch.

## wrangler's successor

Cloudflare released `cf`, the CLI that replaces wrangler, in open beta on
2026-09-28. When the beta ends, a final wrangler major points users to `cf`, and
wrangler gets 18 months of maintenance after that. The pin covers wrangler's
remaining life. The switch waits for three things: `cf` is stable; it supports
Pages deploys, which is unconfirmed since Cloudflare's wrangler-to-cf reference
has no Pages row; and the owner signs in with `cf`'s own login, `cf auth login`.
[#473](https://github.com/mephistopheles4/stacks/issues/473) tracks the switch.
